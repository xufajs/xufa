// Curried functions: called with fewer arguments than they take, they give a function of the rest; `_` holds the place
// of an argument given later (subtract(_, 1)(5) is 4). The tags name what a class defines to take part in the
// operators (a static method of its constructor: [ADD_TAG](a, b), [NEGATE_TAG](a)...).

const PLACEHOLDER_TAG = '@@fun/_';
const ADD_TAG = '@@fun/add';
const AND_TAG = '@@fun/and';
const OR_TAG = '@@fun/or';
const APPROVE_TAG = '@@fun/approve';
const NEGATE_TAG = '@@fun/negate';
const NOT_TAG = '@@fun/not';
const SUBTRACT_TAG = '@@fun/subtract';
const MULT_TAG = '@@fun/mult';
const DIV_TAG = '@@fun/div';
const MOD_TAG = '@@fun/mod';
const POW_TAG = '@@fun/pow';

const _ = { [PLACEHOLDER_TAG]: true };

const isPlaceholder = (value) => !!(value && value[PLACEHOLDER_TAG]);

// A function of two arguments, curried (more arguments go to it as they are).
function curry2(fn) {
  return function f2(...args) {
    if (args.length === 0) return f2;
    if (args.length === 1) return isPlaceholder(args[0]) ? f2 : (b, ...rest) => fn(args[0], b, ...rest);
    if (isPlaceholder(args[0])) {
      return isPlaceholder(args[1]) ? f2 : (a, ...rest) => fn(a, args[1], ...rest);
    }
    return isPlaceholder(args[1]) ? (b, ...rest) => fn(args[0], b, ...rest) : fn(...args);
  };
}

// A function of three arguments, curried.
function curry3(fn) {
  return function f3(...args) {
    if (args.length === 0) return f3;
    const [a, b, c] = args;
    if (args.length === 1) return isPlaceholder(a) ? f3 : curry2((y, z, ...rest) => fn(a, y, z, ...rest));
    if (args.length === 2) {
      if (isPlaceholder(a)) return isPlaceholder(b) ? f3 : curry2((x, z, ...rest) => fn(x, b, z, ...rest));
      return isPlaceholder(b) ? curry2((y, z, ...rest) => fn(a, y, z, ...rest)) : (z, ...rest) => fn(a, b, z, ...rest);
    }
    if (isPlaceholder(a)) {
      if (isPlaceholder(b)) return isPlaceholder(c) ? f3 : curry2((x, y, ...rest) => fn(x, y, c, ...rest));
      return isPlaceholder(c) ? curry2((x, z, ...rest) => fn(x, b, z, ...rest)) : (x, ...rest) => fn(x, b, c, ...rest);
    }
    if (isPlaceholder(b)) {
      return isPlaceholder(c) ? curry2((y, z, ...rest) => fn(a, y, z, ...rest)) : (y, ...rest) => fn(a, y, c, ...rest);
    }
    return isPlaceholder(c) ? (z, ...rest) => fn(a, b, z, ...rest) : fn(...args);
  };
}

// A function of `length` arguments, curried: the arguments given fill the places held first, then the next ones.
function curryNOf(length, fn, received = []) {
  if (length === 1) return fn;
  if (length === 2) return curry2(fn);
  if (length === 3) return curry3(fn);
  return function curried(...args) {
    const combined = [];
    let next = 0;
    let left = length;
    let at = 0;
    while (at < received.length || next < args.length) {
      if (at < received.length && (!isPlaceholder(received[at]) || next >= args.length)) combined[at] = received[at];
      else {
        combined[at] = args[next];
        next += 1;
      }
      if (!isPlaceholder(combined[at])) left -= 1;
      at += 1;
    }
    if (left <= 0) return fn.apply(this, combined);
    const more = curryNOf(length, fn, combined);
    return function rest(...given) {
      return more.apply(this, given);
    };
  };
}

const curryN = curry2(curryNOf);

// A function curried by the arguments it declares.
const curry = (fn) => curryN(fn.length, fn);

export {
  _,
  isPlaceholder,
  curry,
  curryN,
  curry2,
  curry3,
  PLACEHOLDER_TAG,
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
};
