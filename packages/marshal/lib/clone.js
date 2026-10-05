// A deep copy that keeps what structuredClone loses: the class of every instance (its prototype, registered or not:
// in the process, the class is at hand), getters left out as structuredClone does, symbols that are global or not,
// and functions (by reference). Shared objects and cycles are kept. Registered classes with encode/decode are copied
// through them (for state in private fields).
const { registry: defaultRegistry } = require('./registry');
const { MarshalError, guard } = require('./errors');
const { types } = require('node:util');

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;

function clone(value, options = {}) {
  const { registry = defaultRegistry, maxDepth = 1000 } = options;
  const copies = new Map();

  const define = (target, key, item) =>
    Object.defineProperty(target, key, { value: item, enumerable: true, writable: true, configurable: true });

  function copyFields(source, target, depth, own = Object.keys(source)) {
    for (const key of own) define(target, key, copy(source[key], depth));
    return target;
  }

  function copy(input, depth) {
    if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return input;
    if (typeof input === 'function') return input;
    const known = copies.get(input);
    if (known !== undefined) return known;
    if (depth > maxDepth) throw new MarshalError(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    const next = depth + 1;
    const keep = (target) => {
      copies.set(input, target);
      return target;
    };

    if (Array.isArray(input)) {
      const array = keep(new Array(input.length));
      for (let i = 0; i < input.length; i += 1) if (i in input) array[i] = copy(input[i], next);
      return array;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype || proto === null) {
      return copyFields(input, keep(proto === null ? Object.create(null) : {}), next);
    }
    const entry = registry.byClass.get(proto.constructor);
    if (entry && entry.encode && !isError(input)) {
      return keep(entry.decode(copy(entry.encode(input), next)));
    }
    if (types.isDate(input)) return keep(new Date(input.getTime()));
    if (types.isRegExp(input)) {
      const regexp = keep(new RegExp(input.source, input.flags));
      regexp.lastIndex = input.lastIndex;
      return regexp;
    }
    if (types.isMap(input)) {
      const map = keep(new Map());
      for (const [key, item] of input) map.set(copy(key, next), copy(item, next));
      return map;
    }
    if (types.isSet(input)) {
      const set = keep(new Set());
      for (const item of input) set.add(copy(item, next));
      return set;
    }
    if (Buffer.isBuffer(input)) return keep(Buffer.from(input));
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
            value: copy(input[key], next),
            enumerable: false,
            writable: true,
            configurable: true,
          });
        }
      }
    }
    // An instance of any class: its prototype, and a copy of its own enumerable fields.
    return copyFields(input, target, next);
  }

  return copy(value, 0);
}

module.exports = { clone: guard(clone) };
