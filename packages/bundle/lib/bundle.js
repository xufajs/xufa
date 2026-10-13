// Modules and what they import, as one script for browsers: each module (made CommonJS by transform()) is a function
// in a list, required by number on first use; the stylesheets they import are one CSS file, in the order the modules
// run. A module is in it once, however it is imported.
import fs from 'node:fs';
import path from 'node:path';
import { resolve, isBuiltin } from './resolve.js';
import { transform, ts } from './transform.js';
import { shake, moduleInfo } from './shake.js';
import { minifyJs, minifyCss } from './minify.js';
import { hoist } from './hoist.js';

// What TypeScript's CommonJS needs of its helpers (they are left out of each module: these are the bundle's).
const HELPERS = `var __createBinding = function (o, m, k, k2) {
  Object.defineProperty(o, k2 === undefined ? k : k2, { enumerable: true, get: function () { return m[k]; } });
};
var __setModuleDefault = function (o, v) { Object.defineProperty(o, 'default', { enumerable: true, value: v }); };
var __importStar = function (mod) {
  if (mod && mod.__esModule) return mod;
  var result = {};
  if (mod != null) {
    for (var k of Object.getOwnPropertyNames(mod)) if (k !== 'default') __createBinding(result, mod, k);
  }
  __setModuleDefault(result, mod);
  return result;
};
var __importDefault = function (mod) { return mod && mod.__esModule ? mod : { default: mod }; };
var __exportStar = function (m, exports) {
  for (var p in m) if (p !== 'default' && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
`;

// With liveBindings: false, what modules export from others is their value (a getter only until the value is there,
// in cycles), which engines read as fast as a constant: values exported by let and changed later are not seen.
const VALUE_BINDINGS = `var __createBinding = function (o, m, k, k2) { __reexport(o, k2 === undefined ? k : k2, m, k); };
var __reexport = function (exports, name, m, key) {
  var value = m[key];
  if (value !== undefined) {
    Object.defineProperty(exports, name, { enumerable: true, writable: true, configurable: true, value: value });
    return;
  }
  Object.defineProperty(exports, name, {
    enumerable: true,
    configurable: true,
    get: function () {
      var current = m[key];
      if (current !== undefined) {
        Object.defineProperty(exports, name, { enumerable: true, writable: true, configurable: true, value: current });
      }
      return current;
    },
  });
};
`;
// TypeScript's re-exports (export { a } from './x'): a getter each.
const REEXPORT =
  /Object\.defineProperty\(exports, "([^"]+)", \{ enumerable: true, get: function \(\) \{ return ([\w$]+)\.([\w$]+); \} \}\);/g;

const RUNTIME = `var cache = [];
function __require(id) {
  var module = cache[id];
  if (module) return module.exports;
  module = cache[id] = { exports: {} };
  var map = imports[id];
  modules[id].call(module.exports, module, module.exports, function (request) {
    if (!Object.prototype.hasOwnProperty.call(map, request)) throw new Error('Cannot find module ' + request);
    return __require(map[request]);
  });
  return module.exports;
}
`;

const STYLE = /\.(?:css)$/;
const IMPORT_CSS = /@import\s+(?:url\(\s*)?(["'])([^"']+)\1\s*\)?\s*([^;]*);/g;

// A stylesheet with the ones it @imports (by path or package), each once.
function cssOf(file, options, seen) {
  if (seen.has(file)) return '';
  seen.add(file);
  const text = fs.readFileSync(file, 'utf8');
  return text.replace(IMPORT_CSS, (all, quote, request, media) => {
    if (/^(?:[a-z]+:)?\/\//i.test(request)) return all;
    const found =
      resolve(request.startsWith('.') || request.startsWith('/') ? request : request, file, {
        kind: 'import',
        browser: options.browser,
        conditions: ['style'],
      }) ?? resolve(`./${request}`, file, { kind: 'import', browser: options.browser });
    if (!found) throw new Error(`${file}: cannot find the stylesheet ${request}`);
    const inner = cssOf(found, options, seen);
    return media.trim() ? `@media ${media.trim()} {\n${inner}\n}` : inner;
  });
}

/**
 * Bundles `entry` and what it imports: { js, css, inputs, legal }.
 *
 * Options: `browser` (true: the "browser" condition and field), `jsx`, `jsxImportSource`, `define` (as in
 * transform()), `treeShaking` (true: what ES modules do not use of each other is left out), `minify` (comments and
 * white space), `mangle` (true with minify: local names made short), `globalName` (the exports of the entry as a
 * global variable), `shims` ({ 'node:util': source }: modules given as CommonJS source), `external` (names left to a
 * require() of the page), `banner`, `legalComments` ('eof', the default: at the end; 'none'), `platform` ('browser',
 * the default, or 'node': a module of CommonJS whose exports are the entry's, the modules of Node.js and the external
 * ones loaded by Node's require()), `liveBindings` (true; false: what modules export from others is a value, as fast
 * as a constant to read, but an exported let changed later is not seen through them), `format` ('iife', the
 * default: modules as functions; 'esm': one ES module of them, by scope hoisting (lib/hoist.js), which exports what the
 * entry exports: modules read what they import as their own variables).
 */
function bundle(entry, options = {}) {
  const node = options.platform === 'node';
  const {
    browser = !node,
    minify = false,
    mangle = true,
    treeShaking = true,
    globalName,
    shims = {},
    external = [],
    banner = '',
    legalComments = 'eof',
    liveBindings = true,
  } = options;
  const t = ts();

  // 1. The graph: every module, as written and as CommonJS, and where each of its requests goes.
  const graph = new Map(); // key -> { file, kind, source, result, info, dependencies: Map(request -> key) }
  const keyOf = (request, from, kind) => {
    if (Object.hasOwn(shims, request)) return discover(`shim:${request}`, { kind: 'shim', code: shims[request] });
    if (external.includes(request) || (node && isBuiltin(request))) {
      // (For Node, by its require: the module's own is the bundle's.)
      const loader = node ? '__hostRequire' : 'require';
      return discover(`external:${request}`, {
        kind: 'shim',
        code: `module.exports = ${loader}(${JSON.stringify(request)});`,
      });
    }
    const found = resolve(request, from, { kind, browser });
    if (found === false) return discover('empty:', { kind: 'shim', code: '' });
    if (!found) {
      throw new Error(
        `${from}: cannot find ${request}${isBuiltin(request) ? ' (a module of Node.js: give it in shims)' : ''}`
      );
    }
    return discover(found);
  };
  const discover = (key, given) => {
    if (graph.has(key)) return key;
    const module = given ? { file: null, ...given, dependencies: new Map() } : { file: key, dependencies: new Map() };
    graph.set(key, module);
    if (given) return key;
    if (STYLE.test(key)) {
      module.kind = 'css';
      module.css = true;
      return key;
    }
    module.source = fs.readFileSync(key, 'utf8');
    if (key.endsWith('.json')) {
      module.kind = 'json';
      return key;
    }
    module.kind = 'js';
    module.result = transform(module.source, { ...options, file: key, helpers: 'external' });
    module.info = treeShaking ? moduleInfo(t, key, module.source) : null;
    const requests = new Map(
      module.result.requires.map((request) => [request, module.result.imports.includes(request)])
    );
    // Imports TypeScript left out (nothing used them) may still be needed for their side effects.
    for (const statement of module.info?.statements ?? []) {
      if (statement.specifier !== undefined && !requests.has(statement.specifier))
        requests.set(statement.specifier, true);
    }
    for (const [request, isImport] of requests) {
      module.dependencies.set(request, keyOf(request, key, isImport ? 'import' : 'require'));
    }
    return key;
  };
  const first = discover(path.resolve(entry));
  const kept = treeShaking ? shake(t, graph, first) : null;

  if (options.format === 'esm') {
    for (const [key, module] of graph) {
      const pruned = kept?.get(key);
      if (typeof pruned === 'string') module.pruned = pruned;
    }
    let js = hoist(t, graph, first, { kept });
    if (minify)
      js = `${minifyJs(js, { mangle })}
`;
    if (banner)
      js = `${banner}
${js}`;
    const files = [...graph.keys()].filter((key) => (!kept || kept.has(key)) && graph.get(key).file);
    return { js, css: '', inputs: files, legal: new Map() };
  }

  // 2. The modules as they are bundled, in the order they are first required.
  const modules = [];
  const ids = new Map();
  const legal = new Map();
  const styles = [];
  const seenStyles = new Set();
  const load = (key) => {
    if (ids.has(key)) return ids.get(key);
    const id = modules.length;
    ids.set(key, id);
    modules.push(null);
    const module = graph.get(key);
    let code = '';
    let requires = [];
    if (module.kind === 'shim') code = module.code;
    else if (module.kind === 'css') styles.push(cssOf(key, { browser }, seenStyles));
    else if (module.kind === 'json') code = `module.exports = ${module.source.trim()};`;
    else {
      const pruned = kept?.get(key);
      const result =
        typeof pruned === 'string' && pruned !== module.source
          ? transform(pruned, { ...options, file: key, helpers: 'external' })
          : module.result;
      if (result.legal.length) legal.set(key, result.legal);
      code = liveBindings ? result.code : result.code.replace(REEXPORT, '__reexport(exports, "$1", $2, "$3");');
      requires = result.requires;
    }
    const imports = {};
    for (const request of requires) imports[request] = load(module.dependencies.get(request));
    modules[id] = { file: module.file, code, imports };
    return id;
  };
  const main = load(first);

  const body = modules.map((module) => `function (module, exports, require) {\n${module.code}\n}`).join(',\n');
  const maps = JSON.stringify(modules.map((module) => module.imports));
  let js = `(function (${node ? '__hostRequire' : ''}) {
${HELPERS}${liveBindings ? '' : VALUE_BINDINGS}var modules = [
${body}
];
var imports = ${maps};
${RUNTIME}return __require(${main});
})(${node ? 'require' : ''})`;
  if (node) js = `module.exports = ${js};\n`;
  else js = globalName ? `var ${globalName} = ${js};\n` : `${js};\n`;
  if (minify) js = `${minifyJs(js, { mangle })}\n`;
  if (banner) js = `${banner}\n${js}`;
  if (legalComments !== 'none' && legal.size) js += legalText(legal);
  const css = styles.join('\n');
  return {
    js,
    css: minify ? (css ? `${minifyCss(css)}\n` : '') : css,
    inputs: modules.map((module) => module.file).filter(Boolean),
    legal,
  };
}

// The legal comments of the modules, as esbuild writes them at the end.
function legalText(legal) {
  const root = commonRoot([...legal.keys()]);
  let text = '/*! Bundled license information:\n';
  const shown = new Set();
  for (const [file, comments] of legal) {
    const kept = comments.filter((comment) => !shown.has(comment));
    if (!kept.length) continue;
    kept.forEach((comment) => shown.add(comment));
    const name = nameOf(file, root);
    text += `\n${name}:\n${kept.map((comment) => `  (${comment.slice(1, -1).replace(/\n\s*/g, '\n   ')})`).join('\n')}\n`;
  }
  return `${text}*/\n`;
}

// A module's name: from its package (react/cjs/react.production.js), else from the folder of them all.
function nameOf(file, root) {
  const parts = file.split(path.sep).join('/');
  const match = /.*node_modules\/((?:@[^/]+\/)?[^/]+\/.*)$/.exec(parts);
  return match ? match[1] : path.relative(root, file).split(path.sep).join('/');
}

function commonRoot(files) {
  if (!files.length) return process.cwd();
  return files.reduce((root, file) => {
    while (!file.startsWith(root + path.sep)) root = path.dirname(root);
    return root;
  }, path.dirname(files[0]));
}

export { bundle };
