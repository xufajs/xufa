// Packages of xufa as one script for browsers, made by the build of the docs (so `pnpm docs:check` fails when a
// package changed and its bundle was not made again):
//
// - docs/schema.js: @xufa/schema, as the global `xufaSchema` (its playground and "Schema from JSON");
// - docs/xufa.js: the packages that run in a browser, as the global `xufa` ({ schema, expression,
//   template, yaml, marshal, router }), for the playground of the docs. (The serializer writes with Buffer, which
//   browsers do not have.)
//
// The modules are CommonJS: each one is wrapped in a function and required on first use; `@xufa/<name>` is the main
// module of that package. The few modules of Node.js they require are small stand-ins (SHIMS): what they use of them
// in a browser (util.types, http.METHODS), and functions that throw for the rest (reading files, in the plugin of
// templates).
const fs = require('node:fs');
const path = require('node:path');

const PACKAGES = path.join(__dirname, '../../../packages');

const SHIMS = {
  'node:util': `
var tag = function (value) { return Object.prototype.toString.call(value).slice(8, -1); };
var is = function (name) { return function (value) { return tag(value) === name; }; };
module.exports = {
  types: {
    isDate: is('Date'), isRegExp: is('RegExp'), isMap: is('Map'), isSet: is('Set'), isWeakMap: is('WeakMap'),
    isWeakSet: is('WeakSet'), isPromise: is('Promise'), isDataView: is('DataView'), isArrayBuffer: is('ArrayBuffer'),
    isNativeError: function (value) { return value instanceof Error; },
    isBoxedPrimitive: function (value) {
      return value !== null && typeof value === 'object' && ['Number', 'String', 'Boolean', 'BigInt', 'Symbol'].indexOf(tag(value)) >= 0;
    },
  },
  inspect: Object.assign(function (value) { try { return JSON.stringify(value); } catch (e) { return String(value); } }, { custom: Symbol.for('nodejs.util.inspect.custom') }),
  format: function () { return Array.prototype.join.call(arguments, ' '); },
};`,
  'node:http': `
module.exports = {
  METHODS: ['ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK', 'M-SEARCH', 'MERGE',
    'MKACTIVITY', 'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS', 'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE',
    'PUT', 'QUERY', 'REBIND', 'REPORT', 'SEARCH', 'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK',
    'UNSUBSCRIBE'],
  STATUS_CODES: {},
};`,
};
// Modules of Node.js that are only used on a server: any use throws.
for (const name of ['node:fs', 'node:fs/promises', 'node:path', 'node:crypto', 'node:stream']) {
  SHIMS[name] = `
var refuse = function () { throw new Error('${name} is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });`;
}

function filesOf(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return ['node_modules', 'test', 'bench', 'scripts', 'types'].includes(entry.name) &&
          dir.endsWith(path.basename(dir))
          ? entry.name === 'types' && fs.existsSync(path.join(file, 'index.js'))
            ? filesOf(file)
            : []
          : filesOf(file);
      }
      return entry.name.endsWith('.js') || entry.name.endsWith('.json') ? [file] : [];
    });
}

// The modules of a package: { id: source }, ids as '@xufa/<name>/<path>'.
function modulesOf(name, modules) {
  const dir = path.join(PACKAGES, name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const prefix = `@xufa/${name}`;
  const roots = ['index.js', 'lib', 'src'].filter((entry) => fs.existsSync(path.join(dir, entry)));
  for (const root of roots) {
    const files = root.endsWith('.js') ? [path.join(dir, root)] : filesOf(path.join(dir, root));
    for (const file of files) {
      const id = `${prefix}/${path.relative(dir, file).split(path.sep).join('/')}`;
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      modules[id] = file.endsWith('.json') ? `module.exports = ${text.trim()};` : text;
    }
  }
  modules[`${prefix}/package.json`] = `module.exports = ${JSON.stringify({ name: pkg.name, version: pkg.version })};`;
  return `${prefix}/${pkg.main.replace(/^\.\//, '')}`;
}

function bundle(names, exportsCode, header) {
  const modules = {};
  const mains = {};
  for (const name of names) mains[`@xufa/${name}`] = modulesOf(name, modules);
  for (const [id, source] of Object.entries(SHIMS)) modules[id] = source;
  const body = Object.keys(modules)
    .sort()
    .map((id) => `${JSON.stringify(id)}: function (module, exports, require) {\n${modules[id]}\n}`)
    .join(',\n');
  return `${header}
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  var modules = {
${body}
  };
  var mains = ${JSON.stringify(mains)};
  var cache = {};
  function resolve(from, request) {
    if (modules[request] && request.indexOf('node:') === 0) return request;
    if (mains[request]) return mains[request];
    if (request.charAt(0) !== '.') throw new Error('Not in the browser bundle: ' + request + ' (from ' + from + ')');
    var parts = from.split('/').slice(0, -1).concat(request.split('/'));
    var stack = [];
    parts.forEach(function (part) {
      if (part === '..') stack.pop();
      else if (part !== '.' && part !== '') stack.push(part);
    });
    var id = stack.join('/');
    var found = [id, id + '.js', id + '.json', id + '/index.js'].filter(function (c) { return modules[c]; })[0];
    if (!found) throw new Error('Cannot find module ' + request + ' from ' + from);
    return found;
  }
  function load(id) {
    if (!cache[id]) {
      var module = { exports: {} };
      cache[id] = module;
      modules[id].call(module.exports, module, module.exports, function (request) {
        return load(resolve(id, request));
      });
    }
    return cache[id].exports;
  }
  function main(name) {
    return load(mains[name]);
  }
${exportsCode}
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
}

const versionOf = (name) => JSON.parse(fs.readFileSync(path.join(PACKAGES, name, 'package.json'), 'utf8')).version;

function schemaBundle() {
  return bundle(
    ['schema'],
    "  root.xufaSchema = main('@xufa/schema');",
    `/*! @xufa/schema ${versionOf('schema')} | MIT license | https://github.com/xufajs/xufa */`
  );
}

// The packages of the playground, by the name it uses for each.
const PLAYGROUND = ['schema', 'expression', 'template', 'yaml', 'marshal', 'router'];

function xufaBundle() {
  const exportsCode = `  root.xufa = {\n${PLAYGROUND.map((name) => `    ${name}: main('@xufa/${name}'),`).join('\n')}\n  };`;
  return bundle(
    PLAYGROUND,
    exportsCode,
    `/*! xufa: ${PLAYGROUND.map((n) => `@xufa/${n}`).join(', ')} | MIT license */`
  );
}

module.exports = { schemaBundle, xufaBundle, PLAYGROUND };
