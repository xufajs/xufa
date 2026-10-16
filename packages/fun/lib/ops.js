// Operators as functions, of any number of values (add(1, 2, 3)): a class takes part with a static method named by a
// tag ([ADD_TAG](a, b) of its constructor...). add merges objects and adds lists item by item; the others take numbers.
// Comparisons, logic (and, or, not; andFn and orFn of functions), negation, statistics (sum, mean, median, max, min),
// clamp, pipe, always and merge.
import {
  _,
  curry2,
  curry3,
  ADD_TAG,
  AND_TAG,
  OR_TAG,
  APPROVE_TAG,
  NEGATE_TAG,
  NOT_TAG,
  SUBTRACT_TAG,
  MULT_TAG,
  DIV_TAG,
  MOD_TAG,
  POW_TAG,
} from './curry.js';
import { isObject, isFunction, identity, forEach, itemsOf, clone } from './values.js';

// The method of a tag of a's class, else of b's.
function tagged(tag, a, b) {
  if (isObject(a) && isFunction(a.constructor[tag])) return a.constructor[tag];
  if (isObject(b) && isFunction(b.constructor[tag])) return b.constructor[tag];
  return null;
}

function mergeInto(a, b) {
  if (!isObject(a) || !isObject(b)) return;
  // eslint-disable-next-line guard-for-in
  for (const key in b) {
    if (Object.hasOwn(b, key)) {
      if (isObject(b[key])) {
        if (!a[key]) a[key] = {};
        mergeInto(a[key], b[key]);
      } else a[key] = b[key];
    }
  }
}

// A copy of the first object with the others merged into it, deeply (objects merged, anything else replaced).
function merge(...objects) {
  const target = clone(objects[0]);
  for (let i = 1; i < objects.length; i += 1) mergeInto(target, objects[i]);
  return target;
}

function addOp(a, b) {
  if (isObject(a)) return isFunction(a.constructor[ADD_TAG]) ? a.constructor[ADD_TAG](a, b) : merge(a, b);
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.map((value, i) => addOp(value, b[i]));
  if (typeof a === typeof b && !(a instanceof Date)) return a + b;
  return Number(a) + Number(b);
}

function negate(x) {
  if (x && x.constructor && x.constructor[NEGATE_TAG]) return x.constructor[NEGATE_TAG](x);
  return -x;
}

// (Of all the operators, the left one with the right one; each by the left value's class first.)
const folding =
  (op) =>
  (...args) => {
    let current = args[0];
    for (let i = 1; i < args.length; i += 1) current = op(current, args[i]);
    return current;
  };

const add = curry2(folding(addOp));

function subtractOp(a, b) {
  if (isObject(a) && isFunction(a.constructor[SUBTRACT_TAG])) return a.constructor[SUBTRACT_TAG](a, b);
  if (isObject(b)) {
    if (isFunction(b.constructor[SUBTRACT_TAG])) return b.constructor[SUBTRACT_TAG](a, b);
    if (isFunction(b.constructor[NEGATE_TAG])) return add(a, negate(b));
  }
  if (typeof a === typeof b && !(a instanceof Date)) return a - b;
  return Number(a) - Number(b);
}

const numeric = (tag, fn) => (a, b) => {
  const method = tagged(tag, a, b);
  return method ? method(a, b) : fn(Number(a), Number(b));
};

const multOp = numeric(MULT_TAG, (a, b) => a * b);
const divOp = numeric(DIV_TAG, (a, b) => a / b);
const modOp = numeric(MOD_TAG, (a, b) => a % b);
const powOp = numeric(POW_TAG, (a, b) => a ** b);

const subtract = curry2(folding(subtractOp));
const mult = curry2(folding(multOp));
const div = curry2(folding(divOp));
const mod = curry2(folding(modOp));
const pow = curry2((a, b) => powOp(a, b));
const inc = add(_, 1);
const dec = add(_, -1);

function andOp(a, b) {
  const method = tagged(AND_TAG, a, b);
  return method ? method(a, b) : a && b;
}

function orOp(a, b) {
  const method = tagged(OR_TAG, a, b);
  return method ? method(a, b) : a || b;
}

// All are true (andOp of each with the ones before), as a boolean.
const and = curry2((...args) => {
  let result = true;
  for (const value of args) {
    result = andOp(result, value);
    if (!result) return false;
  }
  return true;
});

const or = curry2((...args) => {
  let result = false;
  for (const value of args) {
    result = orOp(result, value);
    if (result) return true;
  }
  return false;
});

// A function true when every one of the functions (or values) is, for the same arguments.
const andFn = curry2((...fns) => (...args) => {
  let result = true;
  for (const fn of fns) {
    const value = isFunction(fn) ? fn(...args) : fn;
    result = andOp(result, value);
    if (!value) return false;
  }
  return true;
});

const orFn = curry2((...fns) => (...args) => {
  let result = false;
  for (const fn of fns) {
    const value = isFunction(fn) ? fn(...args) : fn;
    result = orOp(result, value);
    if (value) return true;
  }
  return false;
});

function not(x) {
  if (x && x.constructor && x.constructor[NOT_TAG]) return x.constructor[NOT_TAG](x);
  return !x;
}

// A copy of x, or what its class approves of it ([APPROVE_TAG]).
function approve(x) {
  if (x && x.constructor && x.constructor[APPROVE_TAG]) return x.constructor[APPROVE_TAG](x);
  return clone(x);
}

const gt = curry2((a, b) => a > b);
const gte = curry2((a, b) => a >= b);
const lt = curry2((a, b) => a < b);
const lte = curry2((a, b) => a <= b);

// The sum of the numbers given, or of the items of the one value given.
function sum(...values) {
  const items = values.length === 1 ? values[0] : values;
  let result = 0;
  forEach(items, (value) => {
    result += Number(value);
  });
  return result;
}

// The mean of the values given, or of the items of the one given (NaN of none).
function mean(...args) {
  if (args.length === 0) return NaN;
  if (args.length > 1) return mean(args);
  let total = 0;
  let count = 0;
  forEach(args[0], (value) => {
    total += value;
    count += 1;
  });
  return count === 0 ? NaN : total / count;
}

function median(...args) {
  if (args.length === 0) return NaN;
  if (args.length > 1) return median(args);
  const sorted = itemsOf(args[0]).sort((a, b) => a - b);
  const odd = sorted.length % 2;
  const at = (sorted.length - 2 + odd) / 2;
  return odd === 1 ? sorted[at] : (sorted[at] + sorted[at + 1]) / 2;
}

// The highest (lowest) of the values given, as numbers. (Of one list given: the list as a number.)
const extreme =
  (better) =>
  (...args) => {
    let result;
    let first = true;
    forEach(args, (value) => {
      const n = Number(value);
      if (first) {
        result = n;
        first = false;
      } else if (better(n, result)) result = n;
    });
    return result;
  };

const max = curry2(extreme((a, b) => a > b));
const min = curry2(extreme((a, b) => a < b));

const clamp = curry3((low, high, value) => {
  if (low > high) throw new Error('Max should be greater than max in clamp(min, max, value)');
  if (value < low) return low;
  return value > high ? high : value;
});

// The functions one after the other: the first takes the arguments, each next one the result.
function pipe(...fns) {
  if (fns.length === 0) return identity;
  return (...args) => fns.slice(1).reduce((value, fn) => fn(value), fns[0](...args));
}

const always = (value) => () => value;

export {
  addOp,
  add,
  subtractOp,
  subtract,
  multOp,
  mult,
  divOp,
  div,
  modOp,
  mod,
  powOp,
  pow,
  inc,
  dec,
  negate,
  andOp,
  and,
  orOp,
  or,
  andFn,
  orFn,
  not,
  approve,
  gt,
  gte,
  lt,
  lte,
  sum,
  mean,
  median,
  max,
  min,
  clamp,
  pipe,
  always,
  merge,
};
