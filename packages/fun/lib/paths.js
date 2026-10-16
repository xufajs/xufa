// Values at an index or a path, read and set: getAt and setAt (lists and strings by index, negative ones from the
// end; objects by key; iterables as lists), getAtPath ('a.b[0].c', or its parts), setAtPath (on a copy) and
// setAtPathMut (on the object itself).
import { curry2, curry3 } from './curry.js';
import { isArrayLike, isString, isIterable, isObject, len, atIndex, atPath, newArrayLike, clone } from './values.js';

const unbracket = (part) => (part.startsWith('[') ? part.slice(1, -1) : part);

// Sets a key as code that is not strict does (the library this one follows was not): on a number, a string or a
// boolean nothing happens, on a property that cannot be written neither; null and undefined throw.
function assign(target, key, value) {
  if (target === null || target === undefined) {
    target[key] = value;
    return;
  }
  if (typeof target === 'object' || typeof target === 'function') Reflect.set(target, key, value);
}

// (A list's index is the path's text: a position as a number, '-1' and 'length' none.)
const getAt = curry2((x, index) => {
  if (x === undefined) throw new Error('Cannot perform getAt on undefined');
  if (x === null) throw new Error('Cannot perform getAt on null');
  if (isString(x) || isArrayLike(x)) return x[atIndex(len(x), index)];
  if (isIterable(x)) return getAt([...x], index);
  if (isObject(x)) return x[index];
  throw new Error('Cannot perform getAt on input');
});

// The value at a path; undefined when a step has none (or cannot be read).
const getAtPath = curry2((x, path) => {
  if (x === undefined || x === null) return undefined;
  let current = x;
  const parts = Array.isArray(path) ? path : atPath(path);
  for (const part of parts) {
    try {
      current = getAt(current, unbracket(part));
    } catch {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
});

// A copy of x with a value at an index or key (a string without its character when the value is null or undefined;
// an object without the key when undefined).
const setAt = curry2((x, index, value) => {
  if (x === undefined) throw new Error('Cannot perform setAt on undefined');
  if (x === null) throw new Error('Cannot perform setAt on null');
  if (isString(x)) {
    const position = atIndex(x.length, index);
    const chars = x.split('');
    if (value === undefined || value === null) chars.splice(position, 1);
    else chars[position] = value;
    return chars.join('');
  }
  if (isArrayLike(x)) {
    const position = atIndex(len(x), index);
    const result = clone(x);
    if (position !== -1) result[position] = value;
    return newArrayLike(x, result);
  }
  if (isIterable(x)) {
    const result = [...x];
    result[atIndex(len(result), index)] = value;
    return newArrayLike(x, result);
  }
  if (isObject(x)) {
    const result = clone(x);
    if (value === undefined) delete result[index];
    else result[index] = value;
    return result;
  }
  throw new Error('Cannot perform setAt on input');
});

// The object with a value at a path, the objects and arrays on the way made.
const setAtPathMut = curry3((x, path, value) => {
  if (x === undefined || x === null) return undefined;
  const parts = Array.isArray(path) ? path : atPath(path);
  let current = x;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = unbracket(parts[i]);
    if (current[part] === undefined) assign(current, part, parts[i + 1].startsWith('[') ? [] : {});
    current = current[part];
  }
  assign(current, unbracket(parts[parts.length - 1]), value);
  return x;
});

// setAtPathMut() on a copy.
const setAtPath = curry3((x, path, value) => setAtPathMut(clone(x), path, value));

export { getAt, getAtPath, setAt, setAtPath, setAtPathMut };
