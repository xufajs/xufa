// Lists made from anything forEach walks: map, filter and reduce (and from the end), their *Src forms that give a value
// of the same kind as the source (a string, an object, an array-like of its class), tests of the items, items by
// index, pairs and zips.
import { curry2, curry3 } from './curry.js';
import {
  isArrayLike,
  isString,
  isIterable,
  isObject,
  forEach,
  forEachRight,
  forWhile,
  asArrayLike,
  newArrayLike,
  boolDict,
} from './values.js';

const map = curry2((x, fn) => {
  const result = [];
  forEach(x, (value, index, source) => result.push(fn(value, index, source)));
  return result;
});

const mapRight = curry2((x, fn) => {
  const result = [];
  forEachRight(x, (value, index, source) => result.push(fn(value, index, source)));
  return result;
});

const filter = curry2((x, fn) => {
  const result = [];
  forEach(x, (value, index, source) => {
    if (fn(value, index, source)) result.push(value);
  });
  return result;
});

// fn(accumulated, value, index, x) for each item, from initial (curried by three: give the initial value).
const reduce = curry3((x, fn, initial) => {
  let result = initial;
  forEach(x, (value, index, source) => {
    result = fn(result, value, index, source);
  });
  return result;
});

const reduceRight = curry3((x, fn, initial) => {
  let result = initial;
  forEachRight(x, (value, index, source) => {
    result = fn(result, value, index, source);
  });
  return result;
});

// map() giving what x is: a string of a string, an object of an object (same keys), an array-like of its class.
const mapSrc = curry2((x, fn) => {
  if (x === undefined || x === null) return x;
  if (isArrayLike(x)) {
    const result = [];
    for (let i = 0; i < x.length; i += 1) result.push(fn(x[i], i, x));
    return newArrayLike(x, result);
  }
  if (isString(x)) {
    const result = [];
    for (let i = 0; i < x.length; i += 1) result.push(fn(x[i], i, x));
    return result.join('');
  }
  if (isIterable(x)) {
    const result = [];
    const iterator = x[Symbol.iterator]();
    let index = 0;
    for (let current = iterator.next(); !current.done; current = iterator.next()) {
      // (An iterator may tell each item's index: range()'s does.)
      result.push(fn(current.value, current.index || index, x));
      index += 1;
    }
    return newArrayLike(x, result);
  }
  if (isObject(x)) {
    const result = {};
    for (const key of Object.keys(x)) result[key] = fn(x[key], key, x);
    return result;
  }
  return fn(x, 0, x);
});

const mapRightSrc = curry2((x, fn) => {
  if (x === undefined || x === null) return x;
  if (isArrayLike(x)) {
    const result = [];
    for (let i = x.length - 1; i >= 0; i -= 1) result.push(fn(x[i], i, x));
    return newArrayLike(x, result);
  }
  if (isString(x)) {
    const result = [];
    for (let i = x.length - 1; i >= 0; i -= 1) result.push(fn(x[i], i, x));
    return result.join('');
  }
  if (isIterable(x)) {
    const items = [...x];
    const result = [];
    for (let i = items.length - 1; i >= 0; i -= 1) result.push(fn(items[i], i, x));
    return newArrayLike(x, result);
  }
  if (isObject(x)) {
    const result = {};
    const keys = Object.keys(x);
    for (let i = keys.length - 1; i >= 0; i -= 1) result[keys[i]] = fn(x[keys[i]], keys[i], x);
    return result;
  }
  return fn(x, 0, x);
});

// filter() giving what x is (a value that is one item: itself or undefined).
const filterSrc = curry2((x, fn) => {
  if (x === undefined || x === null) return x;
  if (isArrayLike(x)) {
    const result = [];
    for (let i = 0; i < x.length; i += 1) if (fn(x[i], i, x)) result.push(x[i]);
    return newArrayLike(x, result);
  }
  if (isString(x)) {
    const result = [];
    for (let i = 0; i < x.length; i += 1) if (fn(x[i], i, x)) result.push(x[i]);
    return result.join('');
  }
  if (isIterable(x)) {
    const result = [];
    let index = 0;
    for (const value of x) {
      if (fn(value, index, x)) result.push(value);
      index += 1;
    }
    return newArrayLike(x, result);
  }
  if (isObject(x)) {
    const result = {};
    for (const key of Object.keys(x)) if (fn(x[key], key, x)) result[key] = x[key];
    return result;
  }
  return fn(x, 0, x) ? x : undefined;
});

// Every item passes (fn gives no false); nothing has none.
const every = curry2((x, fn) => {
  if (x === undefined || x === null) return false;
  let result = true;
  forWhile(x, (value, index, source) => {
    if (fn(value, index, source) === false) {
      result = false;
      return false;
    }
    return true;
  });
  return result;
});

// Some item passes (fn gives true).
const some = curry2((x, fn) => {
  if (x === undefined || x === null) return false;
  let result = false;
  forWhile(x, (value, index, source) => {
    if (fn(value, index, source) === true) {
      result = true;
      return false;
    }
    return true;
  });
  return result;
});

// No item passes (fn gives true for none).
const none = curry2((x, fn) => {
  if (x === undefined || x === null) return true;
  let result = true;
  forWhile(x, (value, index, source) => {
    if (fn(value, index, source) === true) {
      result = false;
      return false;
    }
    return true;
  });
  return result;
});

// The items at the indexes (or keys) of a list, or the others.
const allowIndexes = curry2((x, indexes) => {
  const dict = boolDict(indexes);
  return filter(x, (value, index) => dict[index]);
});
const allowIndexesSrc = curry2((x, indexes) => {
  const dict = boolDict(indexes);
  return filterSrc(x, (value, index) => dict[index]);
});
const denyIndexes = curry2((x, indexes) => {
  const dict = boolDict(indexes);
  return filter(x, (value, index) => !dict[index]);
});
const denyIndexesSrc = curry2((x, indexes) => {
  const dict = boolDict(indexes);
  return filterSrc(x, (value, index) => !dict[index]);
});

// The items of all, in one array.
const concat = curry2((a, b, ...rest) => {
  const result = [];
  forEach(a, (value) => result.push(value));
  forEach(b, (value) => result.push(value));
  forEach(rest, (list) => forEach(list, (value) => result.push(value)));
  return result;
});

// An object of [key, value] pairs.
const fromPairs = (pairs) =>
  reduce(
    pairs,
    (result, pair) => {
      [, result[pair[0]]] = pair;
      return result;
    },
    {}
  );

// Pairs of the items at the same place (as many as the shorter has).
const zip = curry2((x, y) => {
  const a = asArrayLike(x);
  const b = asArrayLike(y);
  const result = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) result.push([a[i], b[i]]);
  return result;
});

const zipObj = curry2((keys, values) => {
  const a = asArrayLike(keys);
  const b = asArrayLike(values);
  const result = {};
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) result[a[i]] = b[i];
  return result;
});

const zipWith = curry3((x, y, fn) => {
  const a = asArrayLike(x);
  const b = asArrayLike(y);
  const result = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) result.push(fn(a[i], b[i]));
  return result;
});

export {
  map,
  mapRight,
  mapSrc,
  mapRightSrc,
  filter,
  filterSrc,
  reduce,
  reduceRight,
  every,
  some,
  none,
  allowIndexes,
  allowIndexesSrc,
  denyIndexes,
  denyIndexesSrc,
  concat,
  fromPairs,
  zip,
  zipObj,
  zipWith,
};
