// A deep copy that keeps what structuredClone loses: the class of every instance (its prototype, registered or not:
// in the process, the class is at hand), getters left out as structuredClone does, symbols that are global or not,
// and functions (by reference). Shared objects and cycles are kept. Registered classes with encode/decode are copied
// through them (for state in private fields).
//
// { shared: false }: faster (~1.5x), for data without shared objects (documents of a database, values of caches): an
// object met twice is copied twice; cycles (through arrays and plain objects) are kept.
import { registry as defaultRegistry } from './registry.js';
import { MarshalError, guard } from './errors.js';
import { types } from 'node:util';

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;

const keepIn = (copies, input, target) => {
  copies.set(input, target);
  return target;
};

const define = (target, key, item) =>
  Object.defineProperty(target, key, { value: item, enumerable: true, writable: true, configurable: true });

// The state of one clone(): the copies made (shared objects and cycles), the registry and the depth allowed. With
// shared: false, only the path from the value to what is being copied is kept (its objects and their copies): a cycle
// gets its copy, an object met elsewhere again is copied again (no map of every object: faster).
class Cloner {
  constructor(registry, maxDepth, shared) {
    this.registry = registry;
    this.maxDepth = maxDepth;
    this.copies = shared ? new Map() : null;
    // (Pairs: an object being copied, then its copy.)
    this.path = shared ? null : [];
    this.forIn = Object.keys(Object.prototype).length === 0;
  }

  // The fields of a plain object (a fresh {} or a null-prototype one): assigned, but __proto__ (a field, not the
  // prototype).
  // (for-in when Object.prototype has no enumerable properties: V8's cache of keys, no array of them; a polluted
  // prototype would give its own, so then Object.keys.)
  plainFields(source, target, depth) {
    if (this.forIn) {
      for (const key in source) {
        const item = source[key];
        const value = item === null || typeof item !== 'object' ? item : this.copy(item, depth);
        if (key === '__proto__') define(target, key, value);
        else target[key] = value;
      }
      return target;
    }
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const item = source[key];
      const value = item === null || typeof item !== 'object' ? item : this.copy(item, depth);
      if (key === '__proto__') define(target, key, value);
      else target[key] = value;
    }
    return target;
  }

  // The fields of an instance: defined (its prototype may have setters of them).
  instanceFields(source, target, depth) {
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i += 1) define(target, keys[i], this.copy(source[keys[i]], depth));
    return target;
  }

  copy(input, depth) {
    if (input === null || typeof input !== 'object') return input;
    const { copies, path } = this;
    if (copies !== null) {
      const known = copies.get(input);
      if (known !== undefined) return known;
    } else if (path.length) {
      const at = path.lastIndexOf(input);
      if (at !== -1) return path[at + 1];
    }
    if (depth > this.maxDepth) {
      throw new MarshalError(`Deeper than maxDepth (${this.maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    }
    const next = depth + 1;

    if (Array.isArray(input)) {
      const array = new Array(input.length);
      if (copies !== null) copies.set(input, array);
      else path.push(input, array);
      for (let i = 0; i < input.length; i += 1) {
        if (i in input) {
          const item = input[i];
          array[i] = item === null || typeof item !== 'object' ? item : this.copy(item, next);
        }
      }
      if (copies === null) {
        path.pop();
        path.pop();
      }
      return array;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype || proto === null) {
      const target = proto === null ? Object.create(null) : {};
      if (copies !== null) return this.plainFields(input, keepIn(copies, input, target), next);
      path.push(input, target);
      this.plainFields(input, target, next);
      path.pop();
      path.pop();
      return target;
    }
    return this.special(input, proto, next);
  }

  // Instances of classes: those of the registry with encode/decode, the built-in ones, errors and any other.
  special(input, proto, next) {
    const { copies } = this;
    const keep = (target) => {
      if (copies !== null) copies.set(input, target);
      return target;
    };
    const entry = this.registry.byClass.get(proto.constructor);
    if (entry && entry.encode && !isError(input)) {
      return keep(entry.decode(this.copy(entry.encode(input), next)));
    }
    if (types.isDate(input)) return keep(new Date(input.getTime()));
    if (types.isRegExp(input)) {
      const regexp = keep(new RegExp(input.source, input.flags));
      regexp.lastIndex = input.lastIndex;
      return regexp;
    }
    if (types.isMap(input)) {
      const map = keep(new Map());
      for (const [key, item] of input) map.set(this.copy(key, next), this.copy(item, next));
      return map;
    }
    if (types.isSet(input)) {
      const set = keep(new Set());
      for (const item of input) set.add(this.copy(item, next));
      return set;
    }
    if (typeof Buffer === 'function' && Buffer.isBuffer(input)) return keep(Buffer.from(input));
    if (ArrayBuffer.isView(input)) {
      const bytes = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
      if (types.isDataView(input)) return keep(new DataView(bytes));
      return keep(new input.constructor(bytes));
    }
    if (types.isArrayBuffer(input)) return keep(input.slice(0));
    if (input instanceof URL) return keep(new URL(input.href));
    if (input instanceof URLSearchParams) return keep(new URLSearchParams(input));
    if (types.isBoxedPrimitive(input)) {
      return keep(Object(input.valueOf()));
    }
    if (types.isPromise(input) || types.isWeakMap(input) || types.isWeakSet(input)) {
      throw new MarshalError(`A ${proto.constructor.name} cannot be copied`, 'XUFA_MARSHAL_ERR_TYPE');
    }
    const target = keep(Object.create(proto));
    if (isError(input)) {
      for (const key of ['message', 'stack', 'cause', 'errors']) {
        if (Object.hasOwn(input, key)) {
          Object.defineProperty(target, key, {
            value: this.copy(input[key], next),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
    // An instance of any class: its prototype, and a copy of its own enumerable fields.
    return this.instanceFields(input, target, next);
  }
}

// (Functions are kept by reference: copy() gives back what is not an object.)
function clone(value, options = {}) {
  const { registry = defaultRegistry, maxDepth = 1000, shared = true } = options;
  if (value === null || typeof value !== 'object') return value;
  return new Cloner(registry, maxDepth, shared !== false).copy(value, 0);
}

const __clone = guard(clone);

export { __clone as clone };
