// What values are (lists, strings, objects, iterables), how many items they have, how they are walked, and copies.
//
// A list is an array or an array-like object (length, and its first and last items its own); an object is a plain
// one (or of a class: its toString tag is Object); anything else is one item.
import { curry2 } from './curry.js';

const tagOf = (value) => Object.prototype.toString.call(value);

const { isArray } = Array;
const { isInteger } = Number;
const has = curry2((object, key) => Object.prototype.hasOwnProperty.call(object, key));
const identity = (x) => x;
const isObject = (x) => tagOf(x) === '[object Object]';
const isString = (x) => tagOf(x) === '[object String]';
const isNull = (x) => x === null;
const isIterable = (x) => x && !!x[Symbol.iterator];

const FUNCTION_TAGS = new Set([
  '[object Function]',
  '[object AsyncFunction]',
  '[object GeneratorFunction]',
  '[object AsyncGeneratorFunction]',
]);
const isFunction = (x) => FUNCTION_TAGS.has(tagOf(x));
const isPromise = (x) => x && isFunction(x.then);

function isArrayLike(x) {
  if (isArray(x)) return true;
  if (!x || typeof x !== 'object') return false;
  if (x.length === 0) return true;
  return x.length > 0 && has(x, 0) && has(x, x.length - 1);
}

// fn(value, index or key, x) for each item of x: lists and strings by index, iterables in order, objects by key,
// anything else as its only item; null and undefined have none.
const forEach = curry2((x, fn) => {
  if (x === undefined || x === null) return;
  if (isArrayLike(x) || isString(x)) {
    for (let i = 0; i < x.length; i += 1) fn(x[i], i, x);
  } else if (isIterable(x)) {
    let index = 0;
    for (const value of x) {
      fn(value, index, x);
      index += 1;
    }
  } else if (isObject(x)) {
    for (const key of Object.keys(x)) fn(x[key], key, x);
  } else fn(x, 0, x);
});

// forEach() from the last item.
const forEachRight = curry2((x, fn) => {
  if (x === undefined || x === null) return;
  if (isArrayLike(x) || isString(x)) {
    for (let i = x.length - 1; i >= 0; i -= 1) fn(x[i], i, x);
  } else if (isIterable(x)) {
    const items = [...x];
    for (let i = items.length - 1; i >= 0; i -= 1) fn(items[i], i, x);
  } else if (isObject(x)) {
    const keys = Object.keys(x);
    for (let i = keys.length - 1; i >= 0; i -= 1) fn(x[keys[i]], keys[i], x);
  } else fn(x, 0, x);
});

// forEach() until fn gives false.
const forWhile = curry2((x, fn) => {
  if (x === undefined || x === null) return;
  if (isArrayLike(x) || isString(x)) {
    for (let i = 0; i < x.length; i += 1) if (fn(x[i], i, x) === false) break;
  } else if (isIterable(x)) {
    let index = 0;
    for (const value of x) {
      if (fn(value, index, x) === false) break;
      index += 1;
    }
  } else if (isObject(x)) {
    for (const key of Object.keys(x)) if (fn(x[key], key, x) === false) break;
  } else fn(x, 0, x);
});

// The items of anything (forEach's), in an array.
function itemsOf(x) {
  const items = [];
  forEach(x, (value) => items.push(value));
  return items;
}

// How many: items of lists, keys of objects, size or count, items of iterables, else the length of its text (false,
// 0, '' and null: 0; true: 1).
function len(x) {
  if (!x) return 0;
  if (x === true) return 1;
  if (isArrayLike(x)) return x.length;
  if (isObject(x) && !isIterable(x)) return Object.keys(x).length;
  if (x.length) return x.length;
  if (x.size) return x.size;
  if (x.count) return x.count;
  if (isIterable(x)) {
    let count = 0;
    const iterator = x[Symbol.iterator]();
    while (!iterator.next().done) count += 1;
    return count;
  }
  return x.toString().length;
}

// The position of an index in a list of a length (negative ones from its end; out of it: -1).
const atIndex = curry2((length, index) => {
  if (index >= length || index < -length) return -1;
  return (length + index) % length;
});

// The parts of a path: 'a.b[0].c' -> ['a', 'b', '[0]', 'c'].
function atPath(path) {
  const parts = [];
  path.split('.').forEach((token) => {
    token.split('[').forEach((part) => {
      if (part) parts.push(part.endsWith(']') ? `[${part}` : part);
    });
  });
  return parts;
}

// Lists and strings as they are, anything else as its items.
const asArrayLike = (x) => (isArrayLike(x) || isString(x) ? x : itemsOf(x));

// A list of the kind of x (a typed array, an array-like class) with the items given; an array for anything else.
function newArrayLike(x, items) {
  if (!isArray(x) && isArrayLike(x) && x.constructor) return new x.constructor(items);
  return items;
}

// { item: true } of a list (of its items) or a string; { key: true } of an object.
function boolDict(x) {
  const dict = {};
  if (isString(x)) dict[x] = true;
  else if (isObject(x)) forEach(x, (value, key) => (dict[key] = true));
  else forEach(x, (value) => (dict[value] = true));
  return dict;
}

const copyBuffer = (view) =>
  view instanceof Buffer ? Buffer.from(view) : new view.constructor(view.buffer.slice(), view.byteOffset, view.length);

const flagsOf = (regexp) =>
  (regexp.global ? 'g' : '') +
  (regexp.ignoreCase ? 'i' : '') +
  (regexp.multiline ? 'm' : '') +
  (regexp.sticky ? 'y' : '') +
  (regexp.unicode ? 'u' : '');

// A deep copy: dates, arrays, maps, sets, regular expressions and buffers as themselves; an object of a class with a
// static clone(value) by it; other objects as plain objects of their own keys (with inherited ones too: withProto),
// cycles kept.
function clone(value, withProto = false) {
  const seen = [];
  const copies = [];
  const copy = (x) => {
    if (typeof x !== 'object' || x === null) return x;
    if (x instanceof Date) return new Date(x);
    if (isArray(x)) return x.map(copy);
    if (x instanceof Map) return new Map(copy(Array.from(x)));
    if (x instanceof Set) return new Set(copy(Array.from(x)));
    if (x instanceof RegExp) return new RegExp(x.source, flagsOf(x));
    if (ArrayBuffer.isView(x)) return copyBuffer(x);
    const at = seen.indexOf(x);
    if (at > -1) return copies[at];
    if (x.constructor && isFunction(x.constructor.clone)) return x.constructor.clone(x);
    const result = {};
    seen.push(x);
    copies.push(result);
    // eslint-disable-next-line guard-for-in
    for (const key in x) if (withProto || Object.hasOwn(x, key)) result[key] = copy(x[key]);
    seen.pop();
    copies.pop();
    return result;
  };
  return copy(value);
}

// The numbers from `from` (0) up to `to` (not included), by `step` (1): range(3) is 0, 1, 2. Iterable, its items made
// as they are read; each step of its iterator has its `index` too (the number itself: what mapSrc gives as index).
class Range {
  constructor(from, to, step = 1) {
    this.from = to === undefined ? 0 : from;
    this.to = to === undefined ? from : to;
    this.step = step;
  }

  [Symbol.iterator]() {
    const { to, step } = this;
    let current = this.from;
    return {
      next() {
        if (current >= to) return { done: true };
        const result = { done: false, value: current, index: current };
        current += step;
        return result;
      },
    };
  }
}

const range = (from, to, step) => new Range(from, to, step);

export {
  isArray,
  isArrayLike,
  isInteger,
  isIterable,
  isNull,
  isObject,
  isString,
  isFunction,
  isPromise,
  has,
  identity,
  forEach,
  forEachRight,
  forWhile,
  itemsOf,
  len,
  atIndex,
  atPath,
  asArrayLike,
  newArrayLike,
  boolDict,
  clone,
  range,
};
