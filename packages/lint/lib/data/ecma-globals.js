// The globals ECMAScript gives each edition, as ESLint 9.39.5 has them (conf/globals.js, MIT): those each edition adds
// (read only, or writable), from ES3 on; and those of CommonJS.

const ADDED = {
  es3: {
    readonly: [
      'Array',
      'Boolean',
      'constructor',
      'Date',
      'decodeURI',
      'decodeURIComponent',
      'encodeURI',
      'encodeURIComponent',
      'Error',
      'escape',
      'eval',
      'EvalError',
      'Function',
      'hasOwnProperty',
      'Infinity',
      'isFinite',
      'isNaN',
      'isPrototypeOf',
      'Math',
      'NaN',
      'Number',
      'Object',
      'parseFloat',
      'parseInt',
      'propertyIsEnumerable',
      'RangeError',
      'ReferenceError',
      'RegExp',
      'String',
      'SyntaxError',
      'toLocaleString',
      'toString',
      'TypeError',
      'undefined',
      'unescape',
      'URIError',
      'valueOf',
    ],
    writable: [],
  },
  es5: { readonly: ['JSON'], writable: [] },
  es2015: {
    readonly: [
      'ArrayBuffer',
      'DataView',
      'Float32Array',
      'Float64Array',
      'Int16Array',
      'Int32Array',
      'Int8Array',
      'Intl',
      'Map',
      'Promise',
      'Proxy',
      'Reflect',
      'Set',
      'Symbol',
      'Uint16Array',
      'Uint32Array',
      'Uint8Array',
      'Uint8ClampedArray',
      'WeakMap',
      'WeakSet',
    ],
    writable: [],
  },
  es2016: { readonly: [], writable: [] },
  es2017: { readonly: ['Atomics', 'SharedArrayBuffer'], writable: [] },
  es2018: { readonly: [], writable: [] },
  es2019: { readonly: [], writable: [] },
  es2020: { readonly: ['BigInt', 'BigInt64Array', 'BigUint64Array', 'globalThis'], writable: [] },
  es2021: { readonly: ['AggregateError', 'FinalizationRegistry', 'WeakRef'], writable: [] },
  es2022: { readonly: [], writable: [] },
  es2023: { readonly: [], writable: [] },
  es2024: { readonly: [], writable: [] },
  es2025: { readonly: ['Float16Array', 'Iterator'], writable: [] },
  es2026: { readonly: ['AsyncDisposableStack', 'DisposableStack', 'SuppressedError'], writable: [] },
};

const COMMONJS = { exports: true, global: false, module: false, require: false };

// The globals of an edition: { name: writable } (ES3 and ES5; 6 to 17 are 2015 to 2026; years from 2015).
const byEdition = new Map();
function editionGlobals(ecmaVersion) {
  const year = ecmaVersion === 3 || ecmaVersion === 5 || ecmaVersion >= 2015 ? ecmaVersion : ecmaVersion + 2009;
  if (!Object.hasOwn(ADDED, `es${year}`)) return undefined;
  if (!byEdition.has(year)) {
    const globals = {};
    for (const [edition, { readonly, writable }] of Object.entries(ADDED)) {
      for (const name of readonly) globals[name] = false;
      for (const name of writable) globals[name] = true;
      if (edition === `es${year}`) break;
    }
    byEdition.set(year, globals);
  }
  return byEdition.get(year);
}

// The latest edition ("latest" in configs).
const LATEST_ECMA_VERSION = 2026;

export { editionGlobals, COMMONJS, LATEST_ECMA_VERSION };
