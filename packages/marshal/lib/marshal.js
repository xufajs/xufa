// marshal(value) writes a value as JSON-safe data, unmarshal(data) makes it again; stringify() and parse() are the
// same through JSON text. What JSON cannot say is kept: undefined, NaN, Infinity, -0, holes, BigInt, Date, RegExp,
// Map, Set, Buffer and typed arrays, Error (with its cause, stack and fields), URL, boxed primitives, global symbols,
// objects without prototype, the instances of registered classes (as themselves), and the shape of the graph: an
// object referenced twice is one object again, and cycles come back as cycles.
//
// The format: the value as JSON writes it, but for what JSON cannot say, which is written so that JSON.parse makes as
// few objects as it can (wrapping every Date or instance in an array made reading 20% to 40% slower):
// - as a string that starts with "¤" (marked) and a letter: "¤D" + ms (a Date), "¤R" + n (a reference), "¤B" +
//   digits (a BigInt), "¤u" (undefined), "¤h" (a hole), "¤N" (NaN), "¤I" (Infinity), "¤i" (-Infinity), "¤z" (-0);
//   a string of the data that starts with "¤" is "¤S" + the string. (¤: printable, so JSON escapes nothing, and
//   rare at the start of a string; a control character made writing and reading slower.)
// - an instance of a registered class, as an object with its name first: {"@": "Point", "x": 1, "y": 2}; an object
//   of the data with a field "@" is ["¤Object", {fields}];
// - an array of plain objects, or of instances of one registered class, all with the same fields, as a table:
//   ["¤Table", "Point", ["x", "y"], 1, 2, 3, 4] (null for plain objects; no copy of each one, the keys once);
// - the rest, as an array whose first item is a marked string: ["¤Map", k1, v1, ...], ["¤Set", ...], ["¤RegExp",
//   source, flags], ["¤Error", ...], ["¤@Money", data, 1] (an instance written by its class's encode())...; an
//   array of the data whose first item is written marked is ["¤Array", ...items], so a marked first item is always
//   a tag (and arrays of strings are written as they are).
// Every object is numbered in the order it is written (and long strings, which are written once), and a second
// reference to one is "¤R" + its number: shared objects and cycles.
//
// Decoding is safe for input from outside: no constructor or global is looked up by a name of the input (only the
// registered classes and a fixed list of built-ins), constructors are not called (instances are made from their
// prototype), "__proto__" is a field like any other, and depth and size have limits.
import { MarshalError, guard } from './errors.js';
import { types } from 'node:util';
import { registry as defaultRegistry } from './registry.js';

// An error: native (Error.isError, or util.types before Node 24), or of a class that extends Error.
const isNative = typeof Error.isError === 'function' ? Error.isError : types.isNativeError;
const isError = (value) => isNative(value) || value instanceof Error;

// The strings that say what JSON cannot.
// (Literals, not made at run time: the same strings as those of the source, which compare at once.)
const MARK = '¤';
const MARK_CODE = 0xa4;
const UNDEFINED = '¤u';
const HOLE = '¤h';
const NAN = '¤N';
const POSITIVE_INFINITY = '¤I';
const NEGATIVE_INFINITY = '¤i';
const NEGATIVE_ZERO = '¤z';
const DATE = '¤D';
const REF = '¤R';
const BIGINT = '¤B';
const STRING = '¤S';
// The tags of arrays.
const T = {
  Array: '¤Array',
  Object: '¤Object',
  Map: '¤Map',
  Set: '¤Set',
  Null: '¤Null',
  RegExp: '¤RegExp',
  Symbol: '¤Symbol',
  Buffer: '¤Buffer',
  ArrayBuffer: '¤ArrayBuffer',
  DataView: '¤DataView',
  TypedArray: '¤TypedArray',
  URL: '¤URL',
  URLSearchParams: '¤URLSearchParams',
  Boxed: '¤Boxed',
  Error: '¤Error',
  Table: '¤Table',
};
const marked = (item) => typeof item === 'string' && item.charCodeAt(0) === MARK_CODE;

// Strings this long or longer are written once (a second one is a reference).
const LONG = 64;

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
const optionsOf = (options) => (options === undefined ? DEFAULTS : { ...DEFAULTS, ...options });

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

// Date.prototype.getTime, which only takes Dates (a TypeError for anything else); the same for Maps and Sets.
const getTime = Date.prototype.getTime;
const setValues = Set.prototype.values;
const mapEntries = Map.prototype.entries;
// The iterator of a Map or Set by its method; null when the object is none (of its prototype only).
function iterated(object, method) {
  try {
    return method.call(object);
  } catch {
    return null;
  }
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

// Defines a field as an own field (for "__proto__", which an assignment would take for the prototype, and for the
// fields of instances whose prototypes have setters).
const defineOwn = (object, key, item) =>
  Object.defineProperty(object, key, { value: item, enumerable: true, writable: true, configurable: true });
const put = (object, key, item) => {
  if (key === '__proto__') defineOwn(object, key, item);
  else object[key] = item;
};

const SKIP = Symbol('skip');

// --- Encoding.

// share: the plain objects and arrays that need no change are the written data themselves (not copies), for
// stringify(), which writes them at once.
function encode(value, options, share) {
  const { registry = defaultRegistry, maxDepth, unknown, functions, stack } = optionsOf(options);
  const numbers = new Map(); // objects (and long strings) => their number
  let count = 0;

  // A value as it is written; with functions: 'skip', a function is SKIP (a field left out, or undefined).
  function add(input, depth) {
    switch (typeof input) {
      case 'string':
        if (input.length >= LONG) {
          const known = numbers.get(input);
          if (known !== undefined) return REF + known;
          numbers.set(input, count);
          count += 1;
        }
        return input.charCodeAt(0) === MARK_CODE ? STRING + input : input;
      case 'number':
        // (Not NaN, not ±Infinity, not -0.)
        if (input - input === 0 && (input !== 0 || 1 / input > 0)) return input;
        if (Number.isNaN(input)) return NAN;
        if (input === Infinity) return POSITIVE_INFINITY;
        if (input === -Infinity) return NEGATIVE_INFINITY;
        return NEGATIVE_ZERO;
      case 'boolean':
        return input;
      case 'undefined':
        return UNDEFINED;
      case 'bigint':
        return BIGINT + input.toString();
      case 'symbol': {
        const key = Symbol.keyFor(input);
        if (key === undefined)
          fail('A symbol that is not global (Symbol.for) cannot be written', 'XUFA_MARSHAL_ERR_TYPE');
        return [T.Symbol, key];
      }
      case 'function':
        if (functions === 'skip') return SKIP;
        return fail(`A function cannot be written${input.name ? `: ${input.name}` : ''}`, 'XUFA_MARSHAL_ERR_TYPE');
      default:
        break;
    }
    if (input === null) return null;
    const known = numbers.get(input);
    if (known !== undefined) return REF + known;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    // Numbered first: the children can point back to it (cycles).
    numbers.set(input, count);
    count += 1;
    if (Array.isArray(input)) return arrayOf(input, depth + 1);
    const proto = Object.getPrototypeOf(input);
    if (proto === Object.prototype) return objectOf(input, depth + 1, share);
    return nodeOf(input, proto, depth + 1);
  }

  // add(), where a function left out is undefined.
  function val(input, depth) {
    const written = add(input, depth);
    return written === SKIP ? UNDEFINED : written;
  }

  // The fields of an object (same: the object itself when none changes).
  function fieldsOf(object, depth, same, fields = same ? null : {}) {
    const keys = Object.keys(object);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const item = object[key];
      const written = add(item, depth);
      if (fields === null) {
        if (written === item) continue;
        // The first field that changes: a copy of the fields before it.
        fields = {};
        for (let j = 0; j < i; j += 1) put(fields, keys[j], object[keys[j]]);
      }
      if (written !== SKIP) put(fields, key, written);
    }
    return fields === null ? object : fields;
  }

  // An object of the data (a field "@" would be taken for the name of a class).
  function objectOf(object, depth, same) {
    const fields = fieldsOf(object, depth, same);
    return Object.hasOwn(object, '@') ? [T.Object, fields] : fields;
  }

  // An array (of 2 or more) of plain objects, or of instances of one registered class, all with the same fields:
  // ["¤Table", name (null: plain objects), [keys], the values of the first, of the second...]. No copy of each one is
  // made, and the keys are written once. The rows are numbered first, in their order, then their values: a value can
  // refer to any row. null when the array is not one (a row written before, or twice).
  function tableOf(input, depth) {
    const { length } = input;
    if (length < 2 || functions === 'skip') return null;
    const first = input[0];
    if (first === null || typeof first !== 'object' || Array.isArray(first)) return null;
    const proto = Object.getPrototypeOf(first);
    let name = null; // plain objects
    if (proto !== Object.prototype) {
      const entry = proto === null ? undefined : registry.byProto.get(proto);
      if (entry === undefined || entry.error || entry.encode) return null;
      name = entry.name;
    }
    const keys = Object.keys(first);
    const width = keys.length;
    if (width === 0) return null;
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      // (numbers: written before, or twice in the array.)
      if (!rowOf(item, proto, keys) || numbers.has(item)) {
        for (let j = 0; j < i; j += 1) numbers.delete(input[j]);
        return null;
      }
      numbers.set(item, count + i);
    }
    count += length;
    const table = new Array(3 + length * width);
    table[0] = T.Table;
    table[1] = name;
    table[2] = keys;
    let k = 3;
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      for (let j = 0; j < width; j += 1) {
        table[k] = val(item[keys[j]], depth + 1);
        k += 1;
      }
    }
    return table;
  }

  // Whether an item can be a row of a table: of the prototype, with the keys.
  function rowOf(item, proto, keys) {
    if (item === null || typeof item !== 'object' || Object.getPrototypeOf(item) !== proto) return false;
    const own = Object.keys(item);
    if (own.length !== keys.length) return false;
    for (let j = 0; j < keys.length; j += 1) if (own[j] !== keys[j]) return false;
    return true;
  }

  function arrayOf(input, depth) {
    const table = tableOf(input, depth);
    if (table !== null) return table;
    const { length } = input;
    let items = share ? null : new Array(length);
    for (let i = 0; i < length; i += 1) {
      const item = input[i];
      const written = item === undefined && !(i in input) ? HOLE : val(item, depth);
      if (items === null) {
        if (written === item) continue;
        items = input.slice(0, i);
        items.length = length;
      }
      items[i] = written;
    }
    const array = items === null ? input : items;
    // A tag first would be taken for the tag of the array.
    return length > 0 && marked(array[0]) ? [T.Array, ...array] : array;
  }

  function nodeOf(input, proto, depth) {
    if (proto === Date.prototype) {
      try {
        return dateOf(input);
      } catch {
        // (Not a Date, but of its prototype.)
      }
    }
    // (Maps and Sets by their prototype first, iterated by their own methods, which throw for anything else: no call
    // of util.types, which goes into C++.)
    if (proto === Set.prototype) {
      const values = iterated(input, setValues);
      if (values !== null) return setOf(values, depth);
    } else if (proto === Map.prototype) {
      const entries = iterated(input, mapEntries);
      if (entries !== null) return mapOf(entries, depth);
    }
    if (proto === null) return [T.Null, fieldsOf(input, depth, false)];
    const entry = registry.byProto.get(proto);
    if (entry !== undefined && !entry.error) {
      if (entry.encode) return [`${MARK}@${entry.name}`, val(entry.encode(input), depth), 1];
      if (Object.hasOwn(input, '@')) return [`${MARK}@${entry.name}`, fieldsOf(input, depth, false)];
      return fieldsOf(input, depth, false, { '@': entry.name });
    }
    if (types.isDate(input)) return dateOf(input);
    if (types.isRegExp(input)) return [T.RegExp, input.source, input.flags];
    if (types.isMap(input)) return mapOf(mapEntries.call(input), depth);
    if (types.isSet(input)) return setOf(setValues.call(input), depth);
    if (isBuffer(input)) return [T.Buffer, bytesOf(input)];
    if (ArrayBuffer.isView(input)) {
      if (types.isDataView(input)) return [T.DataView, bytesOf(input)];
      const name = typedArrayName(input);
      if (name) return [T.TypedArray, name, bytesOf(input)];
    }
    if (types.isArrayBuffer(input)) return [T.ArrayBuffer, bytesOf(new Uint8Array(input))];
    if (isError(input)) return errorNode(input, entry, depth);
    if (input instanceof URL) return [T.URL, input.href];
    if (input instanceof URLSearchParams) return [T.URLSearchParams, input.toString()];
    if (types.isBoxedPrimitive(input)) return [T.Boxed, val(input.valueOf(), depth)];
    // An instance of a class not registered.
    const name = (proto && proto.constructor && proto.constructor.name) || 'an object';
    if (unknown === 'error' || isOpaque(input)) {
      return fail(`${name} is not a registered class (registry.register(${name}))`, 'XUFA_MARSHAL_ERR_CLASS');
    }
    // (Its own fields, as JSON writes them, unless the class says otherwise: toJSON.)
    return objectOf(input, depth, share && typeof input.toJSON !== 'function');
  }

  // (entries: Map.prototype.entries of the map, not its own iterator, which can be anything.)
  function mapOf(entries, depth) {
    const node = [T.Map];
    for (const [key, item] of entries) node.push(val(key, depth), val(item, depth));
    return node;
  }

  function setOf(values, depth) {
    const node = [T.Set];
    for (const item of values) node.push(val(item, depth));
    return node;
  }

  function dateOf(date) {
    const time = getTime.call(date);
    return time === time ? DATE + time : DATE; // eslint-disable-line no-self-compare
  }

  // ["Error", class or built-in name, message, stack, {fields}, cause, errors]
  function errorNode(error, entry, depth) {
    let kind = 'Error';
    if (entry) kind = `Class:${entry.name}`;
    else {
      const builtin = Object.keys(ERRORS).find((key) => Object.getPrototypeOf(error) === ERRORS[key].prototype);
      if (builtin) kind = builtin;
    }
    // (In the order they are read: message, stack, fields, cause, errors.)
    const message = val(error.message, depth);
    const trace = stack && typeof error.stack === 'string' ? val(error.stack, depth) : UNDEFINED;
    const fields = fieldsOf(error, depth, false);
    // The name of a custom error of no registered class is kept as a field.
    if (kind === 'Error' && error.name !== 'Error' && !('name' in fields)) fields.name = val(error.name, depth);
    return [
      T.Error,
      kind,
      message,
      trace,
      fields,
      'cause' in error ? val(error.cause, depth) : HOLE,
      error instanceof AggregateError ? val(error.errors, depth) : HOLE,
    ];
  }

  return val(value, 0);
}

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

// Being made: an instance whose data is read before it (through decode()); a reference to it is a cycle.
const PENDING = Symbol('pending');
// The integer written in a marked string after its letter (the time of a Date, a reference), read without making a
// string; NaN when it is not one of 15 digits or fewer.
function integerAt(text) {
  let i = 2;
  let sign = 1;
  if (text.charCodeAt(2) === 45) {
    sign = -1;
    i = 3;
  }
  if (i >= text.length || text.length - i > 15) return NaN;
  let value = 0;
  for (; i < text.length; i += 1) {
    const digit = text.charCodeAt(i) - 48;
    if (digit < 0 || digit > 9) return NaN;
    value = value * 10 + digit;
  }
  return sign * value;
}

// The rows of a table of plain objects.
const PLAIN = { entry: null, set: put };

// own: the data is this call's own (parsed from text): its plain objects and arrays are changed into the value
// rather than copied.
function decode(data, options, own) {
  const { registry = defaultRegistry, maxDepth, maxNodes, unknown } = optionsOf(options);
  const made = []; // by number: the objects (and long strings) made
  const entries = new Map(); // name of a class => its entry (null: not registered)
  let size = 0;

  function fill(target, fields, depth, set) {
    if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) fail('Fields must be an object');
    const keys = Object.keys(fields);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      set(target, key, get(fields[key], depth));
    }
    return target;
  }

  function get(node, depth) {
    size += 1;
    if (size > maxNodes) fail(`More values than maxNodes (${maxNodes})`, 'XUFA_MARSHAL_ERR_SIZE');
    if (typeof node !== 'object') {
      if (typeof node === 'string') {
        if (node.charCodeAt(0) === MARK_CODE) return special(node);
        if (node.length >= LONG) made.push(node);
        return node;
      }
      if (typeof node === 'number') {
        if (node - node !== 0) fail('A number that is not finite');
        return node;
      }
      if (typeof node === 'boolean') return node;
      return fail(`Not data: ${typeof node}`);
    }
    if (node === null) return null;
    if (depth > maxDepth) fail(`Deeper than maxDepth (${maxDepth})`, 'XUFA_MARSHAL_ERR_DEPTH');
    if (Array.isArray(node)) {
      if (node.length > 0 && marked(node[0])) return tagged(node, depth + 1);
      return items(node, 0, depth + 1);
    }
    const name = node['@'];
    if (name !== undefined && Object.hasOwn(node, '@')) return instance(node, name, depth + 1);
    return plain(node, depth + 1);
  }

  // A string that says what JSON cannot.
  function special(node) {
    if (node.length === 2) {
      switch (node) {
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
        case DATE:
          return keep(new Date(NaN));
        case HOLE:
          return fail('A hole out of an array');
        default:
          return fail(`Not a tag: ${JSON.stringify(node)}`);
      }
    }
    switch (node.charCodeAt(1)) {
      case 68: {
        // D
        let time = integerAt(node);
        if (time !== time) time = Number(node.slice(2)); // eslint-disable-line no-self-compare
        if (!Number.isFinite(time)) fail(`Not a date: ${JSON.stringify(node.slice(2))}`);
        return keep(new Date(time));
      }
      case 82: {
        // R
        const number = integerAt(node);
        if (!Number.isInteger(number) || number < 0 || number >= made.length) {
          fail(`Not a reference: ${JSON.stringify(node.slice(2))}`);
        }
        const value = made[number];
        if (value === PENDING) fail('A cycle through an instance made by decode()', 'XUFA_MARSHAL_ERR_CYCLE');
        return value;
      }
      case 66: {
        // B
        const digits = node.slice(2);
        if (!/^-?\d+$/.test(digits)) fail('Not a BigInt');
        return BigInt(digits);
      }
      case 83: {
        // S
        const text = node.slice(2);
        if (text.length >= LONG) made.push(text);
        return text;
      }
      default:
        return fail(`Not a tag: ${JSON.stringify(node)}`);
    }
  }

  function plain(node, depth) {
    if (own) {
      made.push(node);
      const keys = Object.keys(node);
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const item = node[key];
        const value = get(item, depth);
        if (value !== item) put(node, key, value);
      }
      return node;
    }
    return fill(keep({}), node, depth, put);
  }

  // The items of an array, from the first one (an array of the data starting with a string: after "Array").
  function items(node, first, depth) {
    const length = node.length - first;
    const array = own && first === 0 ? node : new Array(length);
    made.push(array);
    for (let i = 0; i < length; i += 1) {
      const item = node[i + first];
      if (item === HOLE) {
        if (array === node) delete array[i];
        continue;
      }
      const value = get(item, depth);
      if (value !== item || array !== node) array[i] = value;
    }
    return array;
  }

  const bytes = (text) => {
    if (typeof text !== 'string') fail('Bytes must be base64 text');
    return bytesFrom(text);
  };

  function tagged(node, depth) {
    const [tag] = node;
    if (tag.charCodeAt(1) === 64) return encoded(node, depth); // "@"
    switch (tag) {
      case T.Array:
        return items(node, 1, depth);
      case T.Table: {
        const [, name, keys] = node;
        if (!Array.isArray(keys) || keys.length === 0 || !keys.every((key) => typeof key === 'string')) {
          fail('A table needs its keys');
        }
        if ((node.length - 3) % keys.length !== 0) fail('A table needs a value for each key');
        // (name null: plain objects.)
        const { entry, set } = name === null ? PLAIN : classNamed(name);
        const count = (node.length - 3) / keys.length;
        const array = keep(new Array(count));
        // The instances first, then their fields (as they are numbered).
        for (let i = 0; i < count; i += 1) array[i] = entry === null ? keep({}) : made_(entry, name);
        for (let i = 0, k = 3; i < count; i += 1) {
          const target = array[i];
          for (let j = 0; j < keys.length; j += 1, k += 1) set(target, keys[j], get(node[k], depth));
        }
        return array;
      }
      case T.Object:
        if (node[1] === null || typeof node[1] !== 'object' || Array.isArray(node[1])) fail('Fields must be an object');
        if (own) return plain(node[1], depth);
        return fill(keep({}), node[1], depth, put);
      case T.RegExp:
        if (typeof node[1] !== 'string' || typeof node[2] !== 'string') fail('A RegExp needs its source and flags');
        try {
          return keep(new RegExp(node[1], node[2]));
        } catch (err) {
          return fail(`Not a RegExp: ${err.message}`);
        }
      case T.Symbol:
        if (typeof node[1] !== 'string') fail('Not a symbol');
        return Symbol.for(node[1]);
      case T.Map: {
        if (node.length % 2 === 0) fail('A Map needs a value for each key');
        const map = keep(new Map());
        for (let i = 1; i + 1 < node.length; i += 2) map.set(get(node[i], depth), get(node[i + 1], depth));
        return map;
      }
      case T.Set: {
        const set_ = keep(new Set());
        for (let i = 1; i < node.length; i += 1) set_.add(get(node[i], depth));
        return set_;
      }
      case T.Null:
        return fill(keep(Object.create(null)), node[1], depth, defineOwn);
      case T.Buffer:
        return keep(bytes(node[1]));
      case T.ArrayBuffer: {
        const buffer = bytes(node[1]);
        return keep(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      }
      case T.DataView: {
        const buffer = bytes(node[1]);
        return keep(new DataView(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)));
      }
      case T.TypedArray: {
        const Type = Object.hasOwn(TYPED_ARRAYS, node[1]) ? TYPED_ARRAYS[node[1]] : null;
        if (!Type) fail(`Not a typed array: ${node[1]}`);
        const buffer = bytes(node[2]);
        if (buffer.byteLength % Type.BYTES_PER_ELEMENT !== 0) fail(`Bytes that are no ${node[1]}`);
        const copy = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return keep(new Type(copy));
      }
      case T.URL:
        try {
          return keep(new URL(node[1]));
        } catch {
          return fail('Not a URL');
        }
      case T.URLSearchParams:
        if (typeof node[1] !== 'string') fail('Not URLSearchParams');
        return keep(new URLSearchParams(node[1]));
      case T.Boxed: {
        const number = reserve();
        const primitive = get(node[1], depth);
        if (primitive === null || primitive === undefined || typeof primitive === 'object') fail('Not a primitive');
        made[number] = Object(primitive);
        return made[number];
      }
      case T.Error:
        return error(node, depth);
      default:
        return fail(`Not a tag: ${JSON.stringify(tag)}`);
    }
  }

  function keep(value) {
    made.push(value);
    return value;
  }

  // A number for a value made after its data.
  function reserve() {
    made.push(PENDING);
    return made.length - 1;
  }

  // A class by its name: { entry (null: not registered), set (how its fields are set) }.
  function classNamed(name) {
    if (typeof name !== 'string') fail('A class needs a name');
    let known = entries.get(name);
    if (known === undefined) {
      const entry = registry.byName.get(name) || null;
      if (!entry && unknown === 'error') fail(`${name} is not a registered class`, 'XUFA_MARSHAL_ERR_CLASS');
      known = { entry, set: entry && !assignable(entry.Class) ? defineOwn : put };
      entries.set(name, known);
    }
    return known;
  }
  const entryOf = (name) => classNamed(name).entry;

  // An instance made from its prototype (its fields set after).
  function made_(entry, name) {
    if (entry && entry.decode) fail(`${name} has a decode(), but was written without it`, 'XUFA_MARSHAL_ERR_CLASS');
    return keep(entry ? Object.create(entry.Class.prototype) : {});
  }

  // {"@": name, ...fields}
  function instance(node, name, depth) {
    const { entry, set } = classNamed(name);
    const target = made_(entry, name);
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key !== '@') set(target, key, get(node[key], depth));
    }
    return target;
  }

  // ["@" + name, {fields}], or ["@" + name, data, 1]: written by the encode() of its class.
  function encoded([tag, data, hooked], depth) {
    const name = tag.slice(2);
    const { entry, set } = classNamed(name);
    if (hooked) {
      // The data first, then the instance (a cycle through it cannot be made).
      const number = reserve();
      const decoded = get(data, depth);
      if (!entry) return (made[number] = decoded);
      if (!entry.decode) fail(`${name} was written by its encode(), and has no decode()`, 'XUFA_MARSHAL_ERR_CLASS');
      return (made[number] = entry.decode(decoded));
    }
    return fill(made_(entry, name), data, depth, set);
  }

  // ["Error", kind, message, stack, {fields}, cause, errors]
  function error([, kind, message, stack, fields, cause, errors], depth) {
    let proto = Error.prototype;
    if (typeof kind === 'string' && kind.startsWith('Class:')) {
      const entry = entryOf(kind.slice(6));
      if (entry) proto = entry.Class.prototype;
    } else if (typeof kind === 'string' && Object.hasOwn(ERRORS, kind)) {
      proto = ERRORS[kind].prototype;
    }
    const target = keep(Object.create(proto));
    const hidden = (key, value) =>
      Object.defineProperty(target, key, { value, enumerable: false, writable: true, configurable: true });
    hidden('message', String(get(message, depth)));
    const trace = get(stack, depth);
    if (trace !== undefined) hidden('stack', String(trace));
    fill(target, fields, depth, defineOwn);
    if (cause !== HOLE) hidden('cause', get(cause, depth));
    if (errors !== HOLE) hidden('errors', get(errors, depth));
    return target;
  }

  return get(data, 0);
}

function marshal(value, options) {
  return encode(value, options, false);
}

function unmarshal(data, options) {
  return decode(data, options, false);
}

function stringify(value, options) {
  return JSON.stringify(encode(value, options, true));
}

function parse(text, options) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return fail(`Not JSON: ${err.message}`);
  }
  return decode(data, options, true);
}

const __marshal = guard(marshal);
const __unmarshal = guard(unmarshal);
const __stringify = guard(stringify);
const __parse = guard(parse);

export { __marshal as marshal, __unmarshal as unmarshal, __stringify as stringify, __parse as parse };
