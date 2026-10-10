// Packages of xufa as one script for browsers, made by the build of the docs (so `pnpm docs:check` fails when a
// package changed and its bundle was not made again):
//
// - docs/schema.js: @xufa/schema, as the global `xufaSchema` (its playground and "Schema from JSON");
// - docs/xufa.js: the packages that run in a browser, as the global `xufa` ({ schema, expression,
//   template, yaml, marshal, router, serializer }), for the playground of the docs. (The serializer writes bytes with
//   Buffer, which browsers do not have: the bundle has a small one of its own, over Uint8Array.)
//
// The modules are CommonJS: each one is wrapped in a function and required on first use; `@xufa/<name>` is the main
// module of that package. Those of packages of ES modules are made CommonJS first (esbuild, the bundler of the page
// of @xufa/admin), their import.meta.url their id: createRequire() of node:module resolves in the bundle, and a
// require() of an ES module gives its 'module.exports' export when it has one, as in Node.js. The few modules of Node.js they require are small stand-ins (SHIMS): what they use of them
// in a browser (util.types, http.METHODS), and functions that throw for the rest (reading files, in the plugin of
// templates).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const PACKAGES = path.join(import.meta.dirname, '../../../packages');

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
  // Channels nobody listens to (@xufa/template publishes its renders for test clients).
  'node:diagnostics_channel': `
var channel = function () { return { hasSubscribers: false, publish: function () {}, subscribe: function () {}, unsubscribe: function () {} }; };
module.exports = { channel: channel, subscribe: function () {}, unsubscribe: function () {}, hasSubscribers: function () { return false; } };`,
};
// createRequire() of an ES module made CommonJS (its import.meta.url is its id): a require() in the bundle.
SHIMS['node:module'] = `
module.exports = {
  createRequire: function (from) {
    return function (request) { return required(resolve(from, request)); };
  },
};`;
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

// An ES module as CommonJS, for the bundle.
let esbuild = null;
function commonjsOf(id, text) {
  esbuild ??= createRequire(path.join(PACKAGES, 'admin', 'package.json'))('esbuild');
  const source = text.replace(/\bimport\.meta\.url\b/g, JSON.stringify(id));
  return esbuild.transformSync(source, { format: 'cjs', loader: 'js', target: 'es2020', sourcefile: id }).code;
}

// The modules of a package: { id: source }, ids as '@xufa/<name>/<path>'.
function modulesOf(name, modules) {
  const dir = path.join(PACKAGES, name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const esm = pkg.type === 'module';
  const prefix = `@xufa/${name}`;
  const roots = ['index.js', 'lib', 'src'].filter((entry) => fs.existsSync(path.join(dir, entry)));
  for (const root of roots) {
    const files = root.endsWith('.js') ? [path.join(dir, root)] : filesOf(path.join(dir, root));
    for (const file of files) {
      const id = `${prefix}/${path.relative(dir, file).split(path.sep).join('/')}`;
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (file.endsWith('.json')) modules[id] = `module.exports = ${text.trim()};`;
      else modules[id] = esm ? commonjsOf(id, text) : text;
    }
  }
  modules[`${prefix}/package.json`] = `module.exports = ${JSON.stringify({ name: pkg.name, version: pkg.version })};`;
  return `${prefix}/${(pkg.main || 'index.js').replace(/^\.\//, '')}`;
}

// shims: modules of Node.js of this bundle ({ id: source }, over SHIMS); prelude: code before the modules, in their scope.
function bundle(names, exportsCode, header, { shims = {}, prelude = '' } = {}) {
  const modules = {};
  const mains = {};
  for (const name of names) mains[`@xufa/${name}`] = modulesOf(name, modules);
  for (const [id, source] of Object.entries({ ...SHIMS, ...shims })) modules[id] = source;
  const body = Object.keys(modules)
    .sort()
    .map((id) => `${JSON.stringify(id)}: function (module, exports, require) {\n${modules[id]}\n}`)
    .join(',\n');
  return `${header}
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  // Buffer, for the modules that write bytes (the writer of @xufa/serializer): what they use of it, over Uint8Array
  // and TextEncoder, when the browser has none. In this scope only: nothing is added to the page.
  var Buffer = root.Buffer || (function () {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder();
    class BrowserBuffer extends Uint8Array {
      static allocUnsafe(size) { return new BrowserBuffer(size); }
      static allocUnsafeSlow(size) { return new BrowserBuffer(size); }
      static alloc(size) { return new BrowserBuffer(size); }
      static isBuffer(value) { return value instanceof BrowserBuffer; }
      static byteLength(text) { return typeof text === 'string' ? encoder.encode(text).length : text.byteLength; }
      static concat(list) {
        var out = new BrowserBuffer(list.reduce(function (sum, part) { return sum + part.length; }, 0));
        list.reduce(function (offset, part) { out.set(part, offset); return offset + part.length; }, 0);
        return out;
      }
      static from(value) {
        var bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
        var out = new BrowserBuffer(bytes.length);
        out.set(bytes);
        return out;
      }
      utf8Write(text, offset, length) {
        return encoder.encodeInto(text, this.subarray(offset, offset + length)).written;
      }
      utf8Slice(start, end) {
        return decoder.decode(this.subarray(start, end));
      }
      copy(target, targetStart, sourceStart, sourceEnd) {
        var part = this.subarray(sourceStart || 0, sourceEnd === undefined ? this.length : sourceEnd);
        target.set(part, targetStart || 0);
        return part.length;
      }
      toString(encoding, start, end) {
        return decoder.decode(this.subarray(start || 0, end === undefined ? this.length : end));
      }
    }
    return BrowserBuffer;
  })();
${prelude}  var modules = {
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
  // What require() gives: of an ES module, its 'module.exports' export when it has one.
  function required(id) {
    var value = load(id);
    return value && value.__esModule && Object.prototype.hasOwnProperty.call(value, 'module.exports')
      ? value['module.exports']
      : value;
  }
  function main(name) {
    return required(mains[name]);
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
const PLAYGROUND = ['schema', 'expression', 'template', 'yaml', 'marshal', 'router', 'serializer'];

function xufaBundle() {
  const exportsCode = `  root.xufa = {\n${PLAYGROUND.map((name) => `    ${name}: main('@xufa/${name}'),`).join('\n')}\n  };`;
  return bundle(
    PLAYGROUND,
    exportsCode,
    `/*! xufa: ${PLAYGROUND.map((n) => `@xufa/${n}`).join(', ')} | MIT license */`
  );
}

// The packages of @xufa/http, for the HTTP tool of the playground (docs/xufa-http.js, loaded when it is opened), as
// the global `xufaHttp` (@xufa/http, with schema). The modules of Node.js it uses are stand-ins (lib/browser/): events,
// streams, the request and response of @xufa/inject, and no server (app.inject() calls the routes without one).
const HTTP_PACKAGES = ['http', 'boot', 'errors', 'inject', 'logger', 'router', 'schema', 'serializer'];
const BROWSER = path.join(import.meta.dirname, 'browser');
// (CommonJS, .cjs: they are modules of the bundle, as they are written.)
const browserModule = (name) => fs.readFileSync(path.join(BROWSER, `${name}.cjs`), 'utf8').replace(/\r\n/g, '\n');

const HTTP_SHIMS = {
  'node:events': browserModule('events'),
  'node:stream': browserModule('stream'),
  'node:http': browserModule('http'),
  'node:https': "module.exports = require('node:http');",
  'node:util': browserModule('util'),
  'node:async_hooks': browserModule('async_hooks'),
  'node:diagnostics_channel': "module.exports = require('node:async_hooks');",
  'node:os':
    "module.exports = { EOL: '\\n', hostname: function () { return 'localhost'; }, networkInterfaces: function () { return {}; }, platform: function () { return 'browser'; } };",
  'node:crypto': `
var refuse = function () { throw new Error('node:crypto is not in the browser'); };
module.exports = {
  randomUUID: function () { return root.crypto.randomUUID(); },
  randomBytes: function (size) { return Buffer.from(root.crypto.getRandomValues(new Uint8Array(size))); },
  createHash: refuse, createHmac: refuse, timingSafeEqual: refuse,
};`,
};
// The logger writes its lines to the descriptors 1 and 2: the console here.
HTTP_SHIMS['node:fs'] = `
var refuse = function () { throw new Error('node:fs is not in the browser'); };
function write(fd, data) {
  var text = typeof data === 'string' ? data : Buffer.from(data).toString();
  (fd === 2 ? console.error : console.log)(text.replace(/\\n$/, ''));
  return typeof data === 'string' ? Buffer.byteLength(data) : data.length;
}
module.exports = new Proxy({
  writeSync: write,
  write: function (fd, data, callback) { var written = write(fd, data); if (typeof callback === 'function') queueMicrotask(function () { callback(null, written); }); },
  fsyncSync: function () {},
}, { get: function (target, key) { return key in target ? target[key] : key === '__esModule' ? false : refuse; } });`;
for (const name of ['node:dns', 'node:net', 'node:tls', 'node:http2', 'node:zlib', 'node:string_decoder']) {
  HTTP_SHIMS[name] = `
var refuse = function () { throw new Error('${name} is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });`;
}

// process, setImmediate and timers that can be unref()'d, in the scope of the modules (a browser has none of them).
const HTTP_PRELUDE = `  var process = root.process || {
    nextTick: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function () { fn.apply(null, args); });
    },
    env: {}, argv: [], platform: 'browser', pid: 1, version: '', versions: {},
    hrtime: Object.assign(function (previous) {
      var now = performance.now();
      var time = [Math.floor(now / 1000), Math.round((now % 1000) * 1e6)];
      return previous ? [time[0] - previous[0], time[1] - previous[1]] : time;
    }, { bigint: function () { return BigInt(Math.round(performance.now() * 1e6)); } }),
    emitWarning: function (warning) { console.warn(String(warning && warning.message || warning)); },
    on: function () { return process; }, once: function () { return process; },
    off: function () { return process; }, removeListener: function () { return process; },
    emit: function () { return false; }, listenerCount: function () { return 0; },
    cwd: function () { return '/'; },
    uptime: function () { return performance.now() / 1000; },
    memoryUsage: function () { return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }; },
    stdout: { write: function (text) { console.log(String(text).replace(/\\n$/, '')); return true; } },
    stderr: { write: function (text) { console.error(String(text).replace(/\\n$/, '')); return true; } },
  };
  function timer(id) {
    return { id: id, unref: function () { return this; }, ref: function () { return this; },
      hasRef: function () { return true; }, refresh: function () { return this; },
      [Symbol.toPrimitive]: function () { return id; } };
  }
  function clear(id) { return id && typeof id === 'object' ? id.id : id; }
  var setTimeout = function () { return timer(root.setTimeout.apply(root, arguments)); };
  var clearTimeout = function (id) { root.clearTimeout(clear(id)); };
  var setInterval = function () { return timer(root.setInterval.apply(root, arguments)); };
  var clearInterval = function (id) { root.clearInterval(clear(id)); };
  var setImmediate = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return setTimeout(function () { fn.apply(null, args); }, 0);
  };
  var clearImmediate = clearTimeout;
`;

function httpBundle() {
  return bundle(
    HTTP_PACKAGES,
    "  root.xufaHttp = { http: main('@xufa/http'), schema: main('@xufa/schema') };",
    `/*! xufa: @xufa/http ${versionOf('http')} in the browser | MIT license */`,
    { shims: HTTP_SHIMS, prelude: HTTP_PRELUDE }
  );
}

export { schemaBundle, xufaBundle, httpBundle, PLAYGROUND };
