// marshal(value) writes a value as a JSON-safe array of nodes, unmarshal(nodes) makes it again; stringify() and
// parse() are the same through JSON text. What JSON cannot say is kept: undefined, NaN, Infinity, -0, holes, BigInt,
// Date, RegExp, Map, Set, Buffer and typed arrays, Error (with its cause, stack and fields), URL, boxed primitives,
// global symbols, objects without prototype, the instances of registered classes (as themselves), and the shape of
// the graph: an object referenced twice is one object again, and cycles come back as cycles.
//
// The format (after devalue): nodes[0] is the value. A node is a JSON primitive (the value), an array of indexes (an
// array: its items), an object of indexes (a plain object: its fields), or a tagged array, whose first item is a
// string: ["Date", ms], ["Map", k1, v1, ...], ["Class", name, {fields}]... Arrays of values hold only numbers, so a
// string first is always a tag. Negative indexes are constants (undefined, a hole, NaN, the infinities, -0).
//
// Decoding is safe for input from outside: no constructor or global is looked up by a name of the input (only the
// registered classes and a fixed list of built-ins), constructors are not called (instances are made from their
// prototype), "__proto__" is a field like any other, and depth and size have limits.
import { MarshalError, guard } from './errors.js';
import { types } from 'node:util';

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;
import { registry as defaultRegistry } from './registry.js';

const UNDEFINED = -1;
const HOLE = -2;
const NAN = -3;
const POSITIVE_INFINITY = -4;
const NEGATIVE_INFINITY = -5;
const NEGATIVE_ZERO = -6;

const TYPED_ARRAYS = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};
if (typeof Float16Array === 'function') TYPED_ARRAYS.Float16Array = Float16Array; // eslint-disable-line no-undef
const ERRORS = { Error, TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError, AggregateError };

const fail = (message, code = 'XUFA_MARSHAL_ERR_INPUT') => {
  throw new MarshalError(message, code);
};

const DEFAULTS = { maxDepth: 1000, maxNodes: 10000000, unknown: 'object', functions: 'throw', stack: true };

// The kind of a typed array, from the array itself (not its prototype chain, which can be anything).
const tagOf = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), Symbol.toStringTag).get;
const typedArrayName = (view) => {
  const name = tagOf.call(view);
  return Object.hasOwn(TYPED_ARRAYS, name) ? name : undefined;
};

// Whether the fields of an instance can be assigned (fast) rather than defined: no setter, getter or read-only
// property in the prototypes of the class (below Object.prototype), so an assignment only makes an own field. Known
// once by class.
const assignables = new WeakMap();
function assignable(Class) {
  let known = assignables.get(Class);
  if (known === undefined) {
    known = true;
    for (let proto = Class.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
      for (const key of Reflect.ownKeys(proto)) {
        if (key === 'constructor') continue;
        const descriptor = Object.getOwnPropertyDescriptor(proto, key);
        if (descriptor.get || descriptor.set || descriptor.writable === false) known = false;
      }
    }
    assignables.set(Class, known);
  }
  return known;
}

// Buffer where there is one (Node.js); base64 by btoa and atob where there is not (browsers).
const HAS_BUFFER = typeof Buffer === 'function';
const isBuffer = (value) => HAS_BUFFER && Buffer.isBuffer(value);
function bytesOf(view) {
  if (HAS_BUFFER) return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  let text = '';
  for (let i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
  return globalThis.btoa(text);
}
function bytesFrom(text) {
  if (HAS_BUFFER) return Buffer.from(text, 'base64');
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- Encoding.

function marshal(value, options = {}) {
  const { registry = defaultRegistry, maxDepth, unknown, functions, stack } = { ...DEFAULTS, ...options };
  const nodes = [];
  const indexes = new Map(); // objects (and strings, bigints) => their node

  // A value as an index (or constant); with functions: 'skip', a function is SKIP (a field left out, or undefined).
  function add(input, depth) {
    switch (typeof input) {
      case 'undefined':
        return UNDEFINED;
      case 'number':
        if (Number.isNaN(input)) return NAN;
        if (input === Infinity) return POSITIVE_INFINITY;
        if (input === -Infinity) return NEGATIVE_INFINITY;
        if (input === 0 && 1 / input < 0) return NEGATIVE_ZERO;
        return push(input);
      case 'boolean':
        return push(input);
      case 'string':
        return shared(input, input);
      case 'bigint':
        return shared(input, ['BigInt', input.toString()]);
      case 'symbol': {
        const key = Symbol.keyFor(input);
        if (key === undefined)
          fail('A symbol that is not global (Symbol.for) cannot be written', 'XUFA_MARSHAL_ERR_TYPE');
        return shared(input, ['Symbol', key]);
      }
      case 'function':
        if (functions === 'skip') return SKIP;
        return fail(`A function cannot be written${input.name ? `: ${input.name}` : ''}`, 'XUFA_MARSHAL_ERR_TYPE');
      default:
        break;
    }
    if (input === null) return push(null);
    const known = indexes.get(input);
    if (known !== undefined) return known;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    // The index first: the children can point back to it (cycles).
    const index = nodes.length;
    nodes.push(null);
    indexes.set(input, index);
    nodes[index] = nodeOf(input, depth + 1);
    return index;
  }

  // add(), where a function left out is undefined.
  function val(input, depth) {
    const index = add(input, depth);
    return index === SKIP ? UNDEFINED : index;
  }

  function push(node) {
    nodes.push(node);
    return nodes.length - 1;
  }

  // Strings and bigints are written once.
  function shared(key, node) {
    const known = indexes.get(key);
    if (known !== undefined) return known;
    const index = push(node);
    indexes.set(key, index);
    return index;
  }

  function fieldsOf(object, depth) {
    const fields = {};
    for (const key of Object.keys(object)) {
      const index = add(object[key], depth);
      if (index === SKIP) continue;
      if (key === '__proto__') Object.defineProperty(fields, key, { value: index, enumerable: true, writable: true });
      else fields[key] = index;
    }
    return fields;
  }

  function nodeOf(input, depth) {
    if (Array.isArray(input)) {
      const items = new Array(input.length);
      for (let i = 0; i < input.length; i += 1) {
        items[i] = i in input ? val(input[i], depth) : HOLE;
      }
      return items;
    }
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype) return fieldsOf(input, depth);
    if (proto === null) return ['Null', fieldsOf(input, depth)];
    const entry = registry.byClass.get(proto.constructor);
    if (entry && !isError(input)) {
      if (entry.encode) return ['Class', entry.name, val(entry.encode(input), depth), 1];
      return ['Class', entry.name, fieldsOf(input, depth)];
    }
    if (types.isDate(input)) {
      const time = input.getTime();
      return ['Date', Number.isNaN(time) ? null : time];
    }
    if (types.isRegExp(input)) return ['RegExp', input.source, input.flags];
    if (types.isMap(input)) {
      const node = ['Map'];
      for (const [key, item] of input) node.push(val(key, depth), val(item, depth));
      return node;
    }
    if (types.isSet(input)) {
      const node = ['Set'];
      for (const item of input) node.push(val(item, depth));
      return node;
    }
    if (isBuffer(input)) return ['Buffer', bytesOf(input)];
    if (ArrayBuffer.isView(input)) {
      if (types.isDataView(input)) return ['DataView', bytesOf(input)];
      const name = typedArrayName(input);
      if (name) return ['TypedArray', name, bytesOf(input)];
    }
    if (types.isArrayBuffer(input)) return ['ArrayBuffer', bytesOf(new Uint8Array(input))];
    if (isError(input)) return errorNode(input, entry, depth);
    if (input instanceof URL) return ['URL', input.href];
    if (input instanceof URLSearchParams) return ['URLSearchParams', input.toString()];
    if (types.isBoxedPrimitive(input)) {
      return ['Boxed', val(input.valueOf(), depth)];
    }
    // An instance of a class not registered.
    const name = (proto && proto.constructor && proto.constructor.name) || 'an object';
    if (unknown === 'error' || isOpaque(input)) {
      return fail(`${name} is not a registered class (registry.register(${name}))`, 'XUFA_MARSHAL_ERR_CLASS');
    }
    return fieldsOf(input, depth);
  }

  // ["Error", class or built-in name, message, stack, {fields}, cause, errors]
  function errorNode(error, entry, depth) {
    let kind = 'Error';
    if (entry) kind = `Class:${entry.name}`;
    else {
      const builtin = Object.keys(ERRORS).find((key) => Object.getPrototypeOf(error) === ERRORS[key].prototype);
      if (builtin) kind = builtin;
    }
    const fields = fieldsOf(error, depth);
    // The name of a custom error of no registered class is kept as a field.
    if (kind === 'Error' && error.name !== 'Error' && !('name' in fields)) fields.name = val(error.name, depth);
    return [
      'Error',
      kind,
      val(error.message, depth),
      stack && typeof error.stack === 'string' ? val(error.stack, depth) : UNDEFINED,
      fields,
      'cause' in error ? val(error.cause, depth) : HOLE,
      error instanceof AggregateError ? val(error.errors, depth) : HOLE,
    ];
  }

  // A value that is a constant (undefined, NaN, -0...) has no node: the root is a node that says which.
  const root = val(value, 0);
  return root < 0 ? [['Value', root]] : nodes;
}

const SKIP = Symbol('skip');

// Objects whose state is not in their fields (promises, weak collections, streams...): writing their fields would
// lose them quietly.
function isOpaque(input) {
  return (
    types.isPromise(input) ||
    types.isWeakMap(input) ||
    types.isWeakSet(input) ||
    (typeof WeakRef === 'function' && input instanceof WeakRef) ||
    typeof input.then === 'function'
  );
}

// --- Decoding.

function unmarshal(nodes, options = {}) {
  const { registry = defaultRegistry, maxDepth, maxNodes, unknown } = { ...DEFAULTS, ...options };
  if (!Array.isArray(nodes) || nodes.length === 0) fail('Not marshalled data: an array of nodes is expected');
  if (nodes.length > maxNodes) fail(`More nodes than maxNodes (${maxNodes})`, 'XUFA_MARSHAL_ERR_SIZE');
  const values = new Array(nodes.length);
  const state = new Uint8Array(nodes.length); // 0: not made, 1: being made (a class with decode), 2: made

  const set = (object, key, item) => {
    if (key === '__proto__')
      Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });
    else object[key] = item;
  };
  // Fields of an instance: defined, so that no setter of its prototype runs.
  const define = (object, key, item) =>
    Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });

  function fill(target, fields, depth, put) {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) fail('Fields must be an object');
    for (const key of Object.keys(fields)) put(target, key, get(fields[key], depth));
    return target;
  }

  function get(index, depth) {
    if (typeof index !== 'number' || !Number.isInteger(index)) fail(`Not an index: ${JSON.stringify(index)}`);
    if (index < 0) {
      switch (index) {
        case UNDEFINED:
          return undefined;
        case NAN:
          return NaN;
        case POSITIVE_INFINITY:
          return Infinity;
        case NEGATIVE_INFINITY:
          return -Infinity;
        case NEGATIVE_ZERO:
          return -0;
        default:
          return fail(`Not a constant: ${index}`);
      }
    }
    if (index >= nodes.length) fail(`An index out of the nodes: ${index}`);
    if (state[index] === 2) return values[index];
    if (state[index] === 1) fail('A cycle through an instance made by decode()', 'XUFA_MARSHAL_ERR_CYCLE');
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    const node = nodes[index];
    if (node === null || typeof node !== 'object') {
      if (typeof node === 'number' && !Number.isFinite(node)) fail('A number that is not finite');
      return made(index, node);
    }
    if (!Array.isArray(node)) return fill(made(index, {}), node, depth + 1, set);
    if (typeof node[0] !== 'string') {
      const array = made(index, new Array(node.length));
      for (let i = 0; i < node.length; i += 1) if (node[i] !== HOLE) array[i] = get(node[i], depth + 1);
      return array;
    }
    return tagged(index, node, depth + 1);
  }

  function made(index, value) {
    values[index] = value;
    state[index] = 2;
    return value;
  }

  const bytes = (text) => {
    if (typeof text !== 'string') fail('Bytes must be base64 text');
    return bytesFrom(text);
  };

  function tagged(index, node, depth) {
    const [tag] = node;
    switch (tag) {
      case 'Date':
        return made(index, new Date(node[1] === null ? NaN : Number(node[1])));
      case 'RegExp':
        if (typeof node[1] !== 'string' || typeof node[2] !== 'string') fail('A RegExp needs its source and flags');
        try {
          return made(index, new RegExp(node[1], node[2]));
        } catch (err) {
          return fail(`Not a RegExp: ${err.message}`);
        }
      case 'BigInt':
        if (typeof node[1] !== 'string' || !/^-?\d+$/.test(node[1])) fail('Not a BigInt');
        return made(index, BigInt(node[1]));
      case 'Symbol':
        if (typeof node[1] !== 'string') fail('Not a symbol');
        return made(index, Symbol.for(node[1]));
      case 'Map': {
        if (node.length % 2 === 0) fail('A Map needs a value for each key');
        const map = made(index, new Map());
        for (let i = 1; i + 1 < node.length; i += 2) map.set(get(node[i], depth), get(node[i + 1], depth));
        return map;
      }
      case 'Set': {
        const set_ = made(index, new Set());
        for (let i = 1; i < node.length; i += 1) set_.add(get(node[i], depth));
        return set_;
      }
      case 'Null':
        return fill(made(index, Object.create(null)), node[1], depth, define);
      case 'Buffer':
        return made(index, bytes(node[1]));
      case 'ArrayBuffer': {
        const buffer = bytes(node[1]);
        return made(index, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      }
      case 'DataView': {
        const buffer = bytes(node[1]);
        return made(index, new DataView(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
      }
      case 'TypedArray': {
        const Type = Object.hasOwn(TYPED_ARRAYS, node[1]) ? TYPED_ARRAYS[node[1]] : null;
        if (!Type) fail(`Not a typed array: ${node[1]}`);
        const buffer = bytes(node[2]);
        if (buffer.byteLength % Type.BYTES_PER_ELEMENT !== 0) fail(`Bytes that are no ${node[1]}`);
        const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return made(index, new Type(copy));
      }
      case 'URL':
        try {
          return made(index, new URL(node[1]));
        } catch {
          return fail('Not a URL');
        }
      case 'URLSearchParams':
        if (typeof node[1] !== 'string') fail('Not URLSearchParams');
        return made(index, new URLSearchParams(node[1]));
      case 'Boxed': {
        const primitive = get(node[1], depth);
        if (primitive === null || primitive === undefined || typeof primitive === 'object') fail('Not a primitive');
        return made(index, Object(primitive));
      }
      case 'Value':
        if (index !== 0 || !(node[1] < 0)) fail('A constant node that is not the root');
        return get(node[1], depth);
      case 'Class':
        return instance(index, node, depth);
      case 'Error':
        return error(index, node, depth);
      default:
        return fail(`Not a tag: ${JSON.stringify(tag)}`);
    }
  }

  function classOf(name) {
    if (typeof name !== 'string') fail('A class needs a name');
    const entry = registry.byName.get(name);
    if (!entry && unknown === 'error') fail(`${name} is not a registered class`, 'XUFA_MARSHAL_ERR_CLASS');
    return entry;
  }

  function instance(index, [, name, data, hooked], depth) {
    const entry = classOf(name);
    if (hooked) {
      // The data first, then the instance (a cycle through it cannot be made).
      state[index] = 1;
      const decoded = get(data, depth);
      state[index] = 0;
      if (!entry) return made(index, decoded);
      if (!entry.decode) fail(`${name} was written by its encode(), and has no decode()`, 'XUFA_MARSHAL_ERR_CLASS');
      return made(index, entry.decode(decoded));
    }
    if (entry && entry.decode) fail(`${name} has a decode(), but was written without it`, 'XUFA_MARSHAL_ERR_CLASS');
    const target = made(index, entry ? Object.create(entry.Class.prototype) : {});
    return fill(target, data, depth, entry ? (assignable(entry.Class) ? set : define) : set);
  }

  // ["Error", kind, message, stack, {fields}, cause, errors]
  function error(index, [, kind, message, stack, fields, cause, errors], depth) {
    let proto = Error.prototype;
    if (typeof kind === 'string' && kind.startsWith('Class:')) {
      const entry = classOf(kind.slice(6));
      if (entry) proto = entry.Class.prototype;
    } else if (typeof kind === 'string' && Object.hasOwn(ERRORS, kind)) {
      proto = ERRORS[kind].prototype;
    }
    const target = made(index, Object.create(proto));
    const hidden = (key, value) =>
      Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
    hidden('message', String(get(message, depth)));
    const trace = get(stack, depth);
    if (trace !== undefined) hidden('stack', String(trace));
    if (cause !== HOLE) hidden('cause', get(cause, depth));
    if (errors !== HOLE) hidden('errors', get(errors, depth));
    return fill(target, fields, depth, define);
  }

  return get(0, 0);
}

function stringify(value, options) {
  return JSON.stringify(marshal(value, options));
}

function parse(text, options) {
  let nodes;
  try {
    nodes = JSON.parse(text);
  } catch (err) {
    return fail(`Not JSON: ${err.message}`);
  }
  return unmarshal(nodes, options);
}

const __marshal = guard(marshal);
const __unmarshal = guard(unmarshal);
const __stringify = guard(stringify);
const __parse = guard(parse);

export { __marshal as marshal, __unmarshal as unmarshal, __stringify as stringify, __parse as parse };
