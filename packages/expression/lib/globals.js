// The globals expressions have by default: functions and values that compute, and nothing that reaches the process,
// modules, timers, prototypes or constructors. Number, String and Boolean convert (Number('5')) and have their static
// helpers; Object, Array, JSON and Date have only what reads. Programs have more (PROGRAM_GLOBALS): BigInt,
// String.raw, Array.from and Array.of, structuredClone (and, by their engine, Object.assign and Object.freeze). Arrays
// made of a length have at most MAX_ITEMS items (an array of a billion empty items is cheap; filling it takes the
// memory of the process).

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
const programString = withStatics((value) => String(value), String, ['fromCharCode', 'fromCodePoint', 'raw']);
const safeBigInt = withStatics((value) => BigInt(value), BigInt, ['asIntN', 'asUintN']);

const MAX_ITEMS = 10_000_000;

const tooMany = (count, what) => {
  if (count > MAX_ITEMS) throw new RangeError(`${what} of more than ${MAX_ITEMS} items`);
};

// Array.from of iterables and of objects with a length (a callback on each item: its calls count as steps).
function arrayFrom(source, map) {
  if (source !== null && source !== undefined) tooMany(Number(source.length) || 0, 'Array.from');
  return map === undefined ? Array.from(source) : Array.from(source, (value, i) => map(value, i));
}

// new Array(...) of programs: an array of a length (at most MAX_ITEMS) or of its items.
function SafeArray(...items) {
  if (items.length === 1 && typeof items[0] === 'number') tooMany(items[0], 'new Array');
  return new Array(...items); // eslint-disable-line no-array-constructor
}
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

const PROGRAM_GLOBALS = Object.freeze({
  ...GLOBALS,
  String: programString,
  BigInt: safeBigInt,
  Array: Object.freeze({ isArray: Array.isArray, from: arrayFrom, of: Array.of }),
  structuredClone,
  // (Promises of async programs: those that combine them; new Promise(...) as a constructor of the engine.)
  Promise: Object.freeze({
    all: (items) => Promise.all(items),
    allSettled: (items) => Promise.allSettled(items),
    any: (items) => Promise.any(items),
    race: (items) => Promise.race(items),
    resolve: (value) => Promise.resolve(value),
    reject: (reason) => Promise.reject(reason),
  }),
});

export { GLOBALS, PROGRAM_GLOBALS, SafeArray, MAX_ITEMS };
