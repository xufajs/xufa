// The globals expressions have by default: functions and values that compute, and nothing that reaches the process,
// modules, timers, prototypes or constructors. Number, String and Boolean convert (Number('5')) and have their static
// helpers; Object, Array, JSON and Date have only what reads.

function withStatics(fn, source, names) {
  names.forEach((name) => {
    fn[name] = source[name];
  });
  return Object.freeze(fn);
}

const safeNumber = withStatics((value) => Number(value), Number, [
  'isInteger',
  'isFinite',
  'isNaN',
  'isSafeInteger',
  'parseFloat',
  'parseInt',
  'MAX_SAFE_INTEGER',
  'MIN_SAFE_INTEGER',
  'MAX_VALUE',
  'MIN_VALUE',
  'EPSILON',
  'POSITIVE_INFINITY',
  'NEGATIVE_INFINITY',
  'NaN',
]);
const safeString = withStatics((value) => String(value), String, ['fromCharCode', 'fromCodePoint']);
const safeBoolean = Object.freeze((value) => Boolean(value));

const GLOBALS = Object.freeze({
  Math,
  JSON: Object.freeze({ parse: JSON.parse, stringify: JSON.stringify }),
  Number: safeNumber,
  String: safeString,
  Boolean: safeBoolean,
  Array: Object.freeze({ isArray: Array.isArray }),
  Object: Object.freeze({
    keys: Object.keys,
    values: Object.values,
    entries: Object.entries,
    fromEntries: Object.fromEntries,
  }),
  Date: Object.freeze({ now: Date.now, parse: Date.parse }),
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  Infinity,
  NaN,
});

export { GLOBALS };
