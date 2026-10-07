// node:util in the browser bundle of @xufa/http (docs/xufa-http.js): inherits, promisify, deprecate, format, inspect
// and the checks of types the modules use.
'use strict';

function tag(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
}
function is(name) {
  return function (value) {
    return tag(value) === name;
  };
}

function inspect(value) {
  if (typeof value === 'string') return "'" + value + "'";
  if (value instanceof Error) return value.stack || String(value);
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}
inspect.custom = Symbol.for('nodejs.util.inspect.custom');

function format(text) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof text !== 'string') return [text].concat(args).map(inspect).join(' ');
  var out = text.replace(/%[sdifjoO%]/g, function (spec) {
    if (spec === '%%') return '%';
    if (args.length === 0) return spec;
    var value = args.shift();
    if (spec === '%s') return String(value);
    if (spec === '%d' || spec === '%i') return String(spec === '%i' ? parseInt(value, 10) : Number(value));
    if (spec === '%f') return String(parseFloat(value));
    return inspect(value);
  });
  return args.length > 0 ? out + ' ' + args.map(inspect).join(' ') : out;
}

module.exports = {
  inherits: function (constructor, parent) {
    Object.setPrototypeOf(constructor.prototype, parent.prototype);
    Object.setPrototypeOf(constructor, parent);
  },
  promisify: function (fn) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var self = this;
      return new Promise(function (resolve, reject) {
        fn.apply(
          self,
          args.concat(function (err, value) {
            if (err) reject(err);
            else resolve(value);
          })
        );
      });
    };
  },
  deprecate: function (fn) {
    return fn;
  },
  inspect: inspect,
  format: format,
  isDeepStrictEqual: function (a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  },
  types: {
    isDate: is('Date'),
    isRegExp: is('RegExp'),
    isMap: is('Map'),
    isSet: is('Set'),
    isWeakMap: is('WeakMap'),
    isWeakSet: is('WeakSet'),
    isPromise: is('Promise'),
    isDataView: is('DataView'),
    isArrayBuffer: is('ArrayBuffer'),
    isAsyncFunction: is('AsyncFunction'),
    isNativeError: function (value) {
      return value instanceof Error;
    },
    isBoxedPrimitive: function (value) {
      return (
        value !== null &&
        typeof value === 'object' &&
        ['Number', 'String', 'Boolean', 'BigInt', 'Symbol'].indexOf(tag(value)) >= 0
      );
    },
  },
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
};
