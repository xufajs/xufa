// What the compiled code of OpenL calls: the semantics of Java and OpenL over the values of JavaScript. Numbers are
// numbers (ints wrapped to 32 bits and longs to 64 where their types are known), texts are texts, arrays are arrays,
// objects of datatypes are plain objects, dates are Dates. Members of values are read only as their own data, and
// methods only those of the lists below (those of Java's String, List, Map and numbers): nothing else of JavaScript.
import { RulesError } from '../values.js';
import { compareText } from '../conditions.js';
import { Decimal } from './decimal.js';
import { inRangeOf } from '../typed.js';

const rangeContains = (range, value) => inRangeOf(range, value);

const FORBIDDEN = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

const INT_TYPES = new Set(['int', 'Integer', 'short', 'Short', 'byte', 'Byte', 'char', 'Character']);
const LONG_TYPES = new Set(['long', 'Long']);
const FLOAT_TYPES = new Set(['double', 'Double', 'float', 'Float', 'Number']);
const NUMBER_TYPES = new Set([...INT_TYPES, ...LONG_TYPES, ...FLOAT_TYPES, 'BigInteger', 'BigDecimal']);
const isIntType = (type) => INT_TYPES.has(type);
const isWholeType = (type) => INT_TYPES.has(type) || LONG_TYPES.has(type) || type === 'BigInteger';

const isEmptyValue = (value) => value === null || value === undefined;
const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

class OpenLError extends RulesError {
  constructor(message) {
    super(message, 'XUFA_RULES_ERR_RULE');
  }
}

// A number as text, as Java writes it: doubles with .0 (1.0) and exponents (1.0E10), ints as they are.
function javaText(value, type) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') {
    const floating = FLOAT_TYPES.has(type) || (!type && !Number.isInteger(value));
    if (!floating || !Number.isFinite(value)) {
      if (Number.isNaN(value)) return 'NaN';
      if (value === Infinity) return 'Infinity';
      if (value === -Infinity) return '-Infinity';
      return String(value);
    }
    if (Object.is(value, -0)) return '-0.0';
    const magnitude = Math.abs(value);
    if (magnitude !== 0 && (magnitude >= 1e7 || magnitude < 1e-3)) {
      const [mantissa, exponent] = value.toExponential().split('e');
      return `${mantissa.includes('.') ? mantissa : `${mantissa}.0`}E${Number(exponent)}`;
    }
    return Number.isInteger(value) ? `${value}.0` : String(value);
  }
  if (value instanceof Date) return value.toString();
  if (Array.isArray(value)) return `[${value.map((item) => javaText(item)).join(', ')}]`;
  if (typeof value === 'object') {
    if (typeof value.toJava === 'function') return value.toJava();
    return `{${Object.entries(value)
      .map(([key, item]) => `${key}=${javaText(item)}`)
      .join(', ')}}`;
  }
  return String(value);
}

// The values of ints and longs, wrapped as Java wraps them.
const wrapInt = (value) => (Number.isFinite(value) ? Number(BigInt.asIntN(32, BigInt(Math.trunc(value)))) : 0);
const wrapLong = (value) => (Number.isFinite(value) ? Number(BigInt.asIntN(64, BigInt(Math.trunc(value)))) : 0);
const wrapShort = (value) => (Number.isFinite(value) ? Number(BigInt.asIntN(16, BigInt(Math.trunc(value)))) : 0);
const wrapByte = (value) => (Number.isFinite(value) ? Number(BigInt.asIntN(8, BigInt(Math.trunc(value)))) : 0);

// A whole number wrapped to its type (bytes and shorts too, as OpenL keeps them).
function narrow(value, type) {
  if (type === 'byte' || type === 'Byte') return wrapByte(value);
  if (type === 'short' || type === 'Short') return wrapShort(value);
  return wrapInt(value);
}

// The number a float is written as (1.1f is 1.1 as a double, as OpenL converts it).
function floatDecimal(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  for (let digits = 1; digits <= 9; digits += 1) {
    const text = value.toPrecision(digits);
    if (Math.fround(Number(text)) === Math.fround(value)) return Number(text);
  }
  return value;
}

// A double to a whole type, as Java narrows it: NaN is 0, beyond the type its limit (ints first for shorts and bytes).
function saturate(value, type) {
  if (Number.isNaN(value)) return 0;
  if (type === 'long' || type === 'Long') {
    if (value >= 2 ** 63) return 2n ** 63n - 1n;
    if (value <= -(2 ** 63)) return -(2n ** 63n);
    return longOf(BigInt(Math.trunc(value)));
  }
  const int = Math.max(-2147483648, Math.min(2147483647, Math.trunc(value)));
  return narrow(int, type);
}

// A long: a number while a double holds it exactly, else a BigInt (Long.MAX_VALUE).
const longOf = (value) =>
  value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;

// An exact long operation (a + b, a * b...) when the numbers are past what a double holds.
function longOp(a, b, op) {
  const x = BigInt(Math.trunc(a));
  const y = BigInt(Math.trunc(b));
  const result = op === '+' ? x + y : op === '-' ? x - y : x * y;
  return longOf(BigInt.asIntN(64, result));
}

const toNumber = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.length === 1) return value.charCodeAt(0);
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
};

// Equal as OpenL compares: numbers within the inaccuracy of doubles, texts by their characters, arrays by their
// elements, objects of datatypes by their fields, dates by their time.
// float: a side is a float (compared as floats: 4.3f == 4.3).
function equal(a, b, strict = false, float = false) {
  if (a === b) return true;
  if (isEmptyValue(a) || isEmptyValue(b)) return isEmptyValue(a) && isEmptyValue(b);
  if ((typeof a === 'number' || typeof a === 'bigint') && (typeof b === 'number' || typeof b === 'bigint')) {
    const x = Number(a);
    const y = Number(b);
    if (x === y) return true;
    if (float) return Math.fround(x) === Math.fround(y);
    if (strict || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    return Math.abs(x - y) <= Math.max(Math.abs(x), Math.abs(y)) * 4 * Number.EPSILON;
  }
  if (a && typeof a.equals === 'function' && typeof a.toNumber === 'function') return a.equals(b);
  // (A number and a BigDecimal: by value, 5L == 5.0.)
  if (b && typeof b.equals === 'function' && typeof b.toNumber === 'function') return b.equals(a);
  if (a instanceof Date || b instanceof Date) return toNumber(a) === toNumber(b);
  if (typeof a === 'string' && typeof b === 'string') return a === b;
  if (typeof a === 'string' && typeof b === 'number' && a.length === 1) return a.charCodeAt(0) === b;
  if (typeof b === 'string' && typeof a === 'number' && b.length === 1) return b.charCodeAt(0) === a;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, i) => equal(item, b[i], strict));
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) if (!equal(a[key] ?? null, b[key] ?? null, strict)) return false;
    return true;
  }
  return false;
}

// Compared: numbers (and chars, dates), texts; null before everything. -1, 0, 1.
function compare(a, b, strict = false) {
  if (isEmptyValue(a) || isEmptyValue(b)) {
    if (isEmptyValue(a) && isEmptyValue(b)) return 0;
    return isEmptyValue(a) ? -1 : 1;
  }
  if (typeof a === 'string' && typeof b === 'string' && !(a.length === 1 && b.length === 1 && false)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a && typeof a.compareTo === 'function') return a.compareTo(b);
  const x = toNumber(a);
  const y = toNumber(b);
  if (!strict && equal(x, y)) return 0;
  return x < y ? -1 : x > y ? 1 : 0;
}

// Relations as OpenL gives them: false when a side is empty (but <= and >= of two empty sides).
// Strict ones compare numbers exactly: <== is <, >== is >, <=== is <=, >=== is >=.
function relation(operator, a, b) {
  const strict = operator.length > 2 && operator.endsWith('==') && !operator.startsWith('string');
  const op = strict ? operator.slice(0, -2) : operator;
  if (op.startsWith('string')) {
    const text = op.slice(6);
    // (Empty values first.)
    const order =
      isEmptyValue(a) || isEmptyValue(b)
        ? isEmptyValue(a) && isEmptyValue(b)
          ? 0
          : isEmptyValue(a)
            ? -1
            : 1
        : compareText(String(a), String(b));
    return text === '<' ? order < 0 : text === '>' ? order > 0 : text === '<=' ? order <= 0 : order >= 0;
  }
  // (Two empty values are equal: <= and >= hold; one is no order.)
  if (isEmptyValue(a) || isEmptyValue(b)) return isEmptyValue(a) && isEmptyValue(b) && op.includes('=');
  const order = compare(a, b, strict);
  switch (op) {
    case '<':
      return order < 0;
    case '>':
      return order > 0;
    case '<=':
      return order <= 0;
    default:
      return order >= 0;
  }
}

// a + b: texts joined (as Java writes the other side), numbers added; null is 0 in sums of numbers.
function add(a, b, typeA, typeB, resultType) {
  if (typeof a === 'string' || typeof b === 'string' || typeA === 'String' || typeB === 'String') {
    // (Two chars: their codes added, 'a' + 'b' is 195.)
    if (typeA === 'char' && typeB === 'char') return toNumber(a) + toNumber(b);
    if (typeA === 'char' && typeB !== 'String' && typeof b !== 'string') return toNumber(a) + toNumber(b);
    if (typeB === 'char' && typeA !== 'String' && typeof a !== 'string') return toNumber(a) + toNumber(b);
    return javaText(a, typeA) + javaText(b, typeB);
  }
  // (A boolean and an empty value: a text, "nulltrue".)
  const empty = (x) => x === null || x === undefined;
  if ((typeof a === 'boolean' && empty(b)) || (typeof b === 'boolean' && empty(a))) {
    return javaText(a, typeA) + javaText(b, typeB);
  }
  if (a && typeof a.add === 'function') return a.add(b);
  if (b && typeof b.add === 'function' && typeof b.toNumber === 'function') return b.constructor.from(a).add(b);
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    if ((typeof a === 'number' && !Number.isInteger(a)) || (typeof b === 'number' && !Number.isInteger(b)))
      return Decimal.from(a ?? 0).add(b ?? 0);
    const sum = BigInt(a ?? 0) + BigInt(b ?? 0);
    return LONG_TYPES.has(resultType) ? longOf(BigInt.asIntN(64, sum)) : sum;
  }
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  if ((a === null || a === undefined) && (b === null || b === undefined)) return null;
  if (a instanceof Date && typeof b === 'number') return new Date(a.getTime() + b * 86400000);
  const x = a === null || a === undefined ? 0 : toNumber(a);
  const y = b === null || b === undefined ? 0 : toNumber(b);
  return wrap(x + y, resultType, () => longOp(x, y, '+'));
}

function wrap(value, type, exact) {
  if (isIntType(type)) return narrow(value, type);
  if (LONG_TYPES.has(type)) return Math.abs(value) > Number.MAX_SAFE_INTEGER ? exact() : value;
  if (type === 'float' || type === 'Float') return Math.fround(value);
  return value;
}

function arithmetic(operator, a, b, resultType) {
  // (A date minus a date: the days between them.)
  if (operator === '-' && a instanceof Date && b instanceof Date) return Math.trunc((a - b) / 86400000);
  // (Of empty values, as OpenL computes them: a difference counts nothing as 0, the others are empty.)
  if (a === null || a === undefined || b === null || b === undefined) {
    if (operator !== '-' || ((a === null || a === undefined) && (b === null || b === undefined))) return null;
  }
  if (a && typeof a.toNumber === 'function' && typeof a[OPS[operator]] === 'function') return a[OPS[operator]](b);
  if (b && typeof b.toNumber === 'function' && typeof b.constructor.from === 'function') {
    return b.constructor.from(a)[OPS[operator]](b);
  }
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    // (With a fraction, or divided: decimals.)
    const fraction = (value) => typeof value === 'number' && !Number.isInteger(value);
    if (operator === '/' || fraction(a) || fraction(b)) {
      const x = Decimal.from(a ?? 0);
      return operator === '/' ? x.divide(b ?? 0) : x[OPS[operator]](b ?? 0);
    }
    const x = BigInt(a ?? 0);
    const y = BigInt(b ?? 0);
    const result = operator === '-' ? x - y : operator === '*' ? x * y : x % y;
    return LONG_TYPES.has(resultType) ? longOf(BigInt.asIntN(64, result)) : result;
  }
  const x = a === null || a === undefined ? 0 : toNumber(a);
  const y = b === null || b === undefined ? 0 : toNumber(b);
  switch (operator) {
    case '-':
      return wrap(x - y, resultType, () => longOp(x, y, '-'));
    case '*':
      return wrap(x * y, resultType, () => longOp(x, y, '*'));
    case '/':
      return resultType === 'float' || resultType === 'Float' ? Math.fround(x / y) : x / y;
    case '%':
      if (isWholeType(resultType) && y === 0) throw new OpenLError('/ by zero');
      return x % y;
    default:
      throw new OpenLError(`No operator ${operator}`);
  }
}
const OPS = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide', '%': 'remainder' };

// A member of a value: the length of arrays, a field of every element of an array (the field of each), a field of an
// object (its own data), null of null.
function member(object, name) {
  if (object === null || object === undefined) return null;
  if (FORBIDDEN.has(name)) throw new OpenLError(`${name} cannot be read`);
  if (Array.isArray(object)) {
    if (name === 'length') return object.length;
    return object.map((item) => member(item, name));
  }
  if ((typeof object === 'number' || typeof object === 'bigint') && Object.hasOwn(NUMBER_METHODS, name))
    return NUMBER_METHODS[name](object);
  if (typeof object === 'string' && Object.hasOwn(STRING_METHODS, name) && STRING_METHODS[name].length === 1)
    return STRING_METHODS[name](object);
  if (typeof object === 'object' && Object.hasOwn(object, name)) return object[name];
  if (typeof object === 'object' && typeof object.field === 'function') return object.field(name);
  if (name.startsWith('$') && isRecord(object)) return cellOf(object, name);
  return null;
}

// A cell of a result of a spreadsheet: $Column$Row (the row's column, or the row of a spreadsheet of steps), $Row.
function cellOf(result, name) {
  const match = /^\$([^$]+)(?:\$(.+))?$/.exec(name);
  if (!match) return null;
  const [, first, second] = match;
  if (second === undefined) {
    if (Object.hasOwn(result, first)) return result[first];
    // (A column of a result of one row.)
    const rows = Object.values(result).filter(isRecord);
    return rows.length === 1 && Object.hasOwn(rows[0], first) ? rows[0][first] : null;
  }
  if (!Object.hasOwn(result, second)) return null;
  const row = result[second];
  return isRecord(row) && Object.hasOwn(row, first) ? row[first] : row;
}

function setMember(object, name, value) {
  if (object === null || object === undefined) throw new OpenLError(`Cannot set ${name} of null`);
  if (FORBIDDEN.has(name) || typeof object !== 'object' || Array.isArray(object) || Object.isFrozen(object)) {
    throw new OpenLError(`Cannot set ${name}`);
  }
  object[name] = value;
  return value;
}

// array[i]: null out of its bounds; array["key"]: the element whose first field is the key; map.get.
function index(object, key) {
  if (object === null || object === undefined || key === null || key === undefined) return null;
  if (Array.isArray(object) || typeof object === 'string') {
    if (typeof key === 'number' || typeof key === 'bigint') {
      const i = Number(key);
      return i >= 0 && i < object.length ? object[i] : null;
    }
    if (Array.isArray(object)) {
      // (By the first field: as it is, or as its text, shelves["7"].)
      const first = (item) => Object.values(item)[0];
      return (
        object.find((item) => isRecord(item) && equal(first(item), key)) ??
        object.find((item) => isRecord(item) && first(item) !== null && String(first(item)) === String(key)) ??
        null
      );
    }
  }
  if (object instanceof Map) return object.get(key) ?? null;
  if (isRecord(object) && typeof key === 'string' && !FORBIDDEN.has(key) && Object.hasOwn(object, key))
    return object[key];
  return null;
}

// The methods of values, as Java's (on texts, numbers, lists, maps, dates, objects of datatypes: getX/setX).
const STRING_METHODS = {
  length: (s) => s.length,
  charAt: (s, i) => s.charAt(i),
  substring: (s, b, e) => s.substring(b, e ?? s.length),
  indexOf: (s, t, from) => s.indexOf(t, from),
  lastIndexOf: (s, t) => s.lastIndexOf(t),
  toUpperCase: (s) => s.toUpperCase(),
  toLowerCase: (s) => s.toLowerCase(),
  trim: (s) => s.trim(),
  strip: (s) => s.trim(),
  isEmpty: (s) => s.length === 0,
  isBlank: (s) => s.trim().length === 0,
  startsWith: (s, t) => s.startsWith(t),
  endsWith: (s, t) => s.endsWith(t),
  contains: (s, t) => s.includes(t),
  equals: (s, t) => s === t,
  equalsIgnoreCase: (s, t) => typeof t === 'string' && s.toLowerCase() === t.toLowerCase(),
  compareTo: (s, t) => (s < t ? -1 : s > t ? 1 : 0),
  concat: (s, t) => s + t,
  replace: (s, a, b) => s.split(a).join(b),
  replaceAll: (s, a, b) => s.replace(new RegExp(a, 'g'), b.replace(/\$(\d)/g, '$$$1')),
  split: (s, sep) => s.split(new RegExp(sep)),
  matches: (s, re) => new RegExp(`^(?:${re})$`).test(s),
  toString: (s) => s,
  name: (s) => s,
  hashCode: (s) => [...s].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0),
  repeat: (s, n) => s.repeat(n),
  chars: (s) => [...s].map((c) => c.charCodeAt(0)),
  toCharArray: (s) => [...s],
};
const LIST_METHODS = {
  size: (l) => l.length,
  get: (l, i) => l[i] ?? null,
  isEmpty: (l) => l.length === 0,
  contains: (l, v) => l.some((item) => equal(item, v)),
  indexOf: (l, v) => l.findIndex((item) => equal(item, v)),
  add: (l, a, b) => {
    if (b === undefined) l.push(a);
    else l.splice(a, 0, b);
    return true;
  },
  addAll: (l, items) => {
    l.push(...items);
    return true;
  },
  set: (l, i, v) => {
    const old = l[i];
    l[i] = v;
    return old;
  },
  remove: (l, i) =>
    typeof i === 'number'
      ? l.splice(i, 1)[0]
      : (l.splice(
          l.findIndex((x) => equal(x, i)),
          1
        ),
        true),
  clear: (l) => {
    l.length = 0;
  },
  toArray: (l) => [...l],
  subList: (l, a, b) => l.slice(a, b),
  equals: (l, o) => equal(l, o),
  clone: (l) => [...l],
};
const MAP_METHODS = {
  get: (m, k) => m.get(k) ?? null,
  put: (m, k, v) => {
    const old = m.get(k) ?? null;
    m.set(k, v);
    return old;
  },
  containsKey: (m, k) => m.has(k),
  containsValue: (m, v) => [...m.values()].some((item) => equal(item, v)),
  keySet: (m) => [...m.keys()],
  values: (m) => [...m.values()],
  size: (m) => m.size,
  isEmpty: (m) => m.size === 0,
  remove: (m, k) => {
    const old = m.get(k) ?? null;
    m.delete(k);
    return old;
  },
  getOrDefault: (m, k, d) => (m.has(k) ? m.get(k) : d),
  entrySet: (m) => [...m.entries()].map(([key, value]) => ({ key, value, getKey: () => key, getValue: () => value })),
};
const NUMBER_METHODS = {
  intValue: (n) => wrapInt(toNumber(n)),
  longValue: (n) => wrapLong(toNumber(n)),
  shortValue: (n) => wrapShort(toNumber(n)),
  byteValue: (n) => wrapByte(toNumber(n)),
  doubleValue: (n) => toNumber(n),
  floatValue: (n) => Math.fround(toNumber(n)),
  compareTo: (n, o) => compare(n, o),
  equals: (n, o) => equal(n, o, true),
  isNaN: (n) => Number.isNaN(toNumber(n)),
  isInfinite: (n) => !Number.isFinite(toNumber(n)) && !Number.isNaN(toNumber(n)),
};

// The class of a value (for getClass().getSimpleName()): by its type, when known.
function classOf(value, type) {
  const names = {
    int: 'Integer',
    long: 'Long',
    double: 'Double',
    float: 'Float',
    short: 'Short',
    byte: 'Byte',
    boolean: 'Boolean',
    char: 'Character',
  };
  let name = type && type !== 'Object' && type !== 'null' ? (names[type] ?? type) : null;
  if (!name) {
    if (typeof value === 'number') name = Number.isInteger(value) ? 'Integer' : 'Double';
    else if (typeof value === 'bigint') name = 'BigInteger';
    else if (typeof value === 'string') name = 'String';
    else if (typeof value === 'boolean') name = 'Boolean';
    else if (value instanceof Date) name = 'Date';
    else if (Array.isArray(value)) name = 'Object[]';
    else name = value?.constructor?.javaName ?? 'Object';
  }
  const simple = name.split('.').pop();
  return { getSimpleName: () => simple, getName: () => name, toJava: () => `class ${name}` };
}

function callMethod(object, name, args, type) {
  if (object === null || object === undefined) throw new OpenLError(`Cannot call ${name}() of null`);
  if (FORBIDDEN.has(name)) throw new OpenLError(`${name} cannot be called`);
  if (name === 'getClass') return classOf(object, type);
  if (name === 'toString' && typeof object !== 'string') return javaText(object, type);
  if (name === 'equals' && typeof object !== 'string') return equal(object, args[0]);
  if (name === 'hashCode' && typeof object === 'number') return wrapInt(object);
  if (typeof object === 'string' && Object.hasOwn(STRING_METHODS, name)) return STRING_METHODS[name](object, ...args);
  if ((typeof object === 'number' || typeof object === 'bigint') && Object.hasOwn(NUMBER_METHODS, name)) {
    return NUMBER_METHODS[name](object, ...args);
  }
  if (Array.isArray(object) && Object.hasOwn(LIST_METHODS, name)) return LIST_METHODS[name](object, ...args);
  if (object instanceof Map && Object.hasOwn(MAP_METHODS, name)) return MAP_METHODS[name](object, ...args);
  if (object instanceof Date) {
    const dates = {
      getTime: (d) => d.getTime(),
      before: (d, o) => d < o,
      after: (d, o) => d > o,
      compareTo: (d, o) => compare(d, o),
    };
    if (Object.hasOwn(dates, name)) return dates[name](object, ...args);
  }
  if (typeof object === 'object' && typeof object.method === 'function') return object.method(name, args);
  // (Objects made here with functions of their own: classes of getClass(), getSimpleName().)
  if (isRecord(object) && Object.hasOwn(object, name) && typeof object[name] === 'function')
    return object[name](...args);
  // Ranges: getMin(), getMax(), contains(value or range).
  if (isRecord(object) && 'minIncluded' in object) {
    if (name === 'getMin') return object.min;
    if (name === 'getMax') return object.max;
    if (name === 'contains') {
      const [value] = args;
      if (isRecord(value) && 'minIncluded' in value)
        return rangeContains(object, value.min) && rangeContains(object, value.max);
      return rangeContains(object, value);
    }
  }
  // Objects of datatypes: getName(), isActive(), setName(value); functions of their own data.
  if (isRecord(object)) {
    if (name === 'getFieldValue') return member(object, String(args[0]));
    if (name === 'get' && args.length === 1) return member(object, String(args[0]));
    if (name === 'containsKey') return Object.hasOwn(object, String(args[0]));
    const field = (prefix) => name.charAt(prefix.length).toLowerCase() + name.slice(prefix.length + 1);
    if (/^get[A-Z]/.test(name)) return member(object, field('get'));
    if (/^is[A-Z]/.test(name)) return member(object, field('is'));
    if (/^set[A-Z]/.test(name)) return setMember(object, field('set'), args[0]);
    if (Object.hasOwn(object, name) && typeof object[name] === 'function') return object[name](...args);
  }
  throw new OpenLError(`No method ${name}() of ${classOf(object, type).getSimpleName()}`);
}

// The value of a cast: numbers truncated and wrapped as Java does, others as they are.
// from: the static type of the value (doubles narrow saturating; floats widen as they are written).
function cast(value, type, dims, from) {
  if (dims) return value;
  if (typeof value === 'number') {
    const fromFloat = from === 'float' || from === 'Float';
    const fromDouble = fromFloat || from === 'double' || from === 'Double' || !Number.isInteger(value);
    if (fromFloat && ['double', 'Double', 'Number'].includes(type)) return floatDecimal(value);
    if (fromDouble && ['int', 'Integer', 'long', 'Long', 'short', 'Short', 'byte', 'Byte'].includes(type)) {
      return saturate(value, type);
    }
  }
  if (value === null || value === undefined) {
    // (A primitive of nothing: its default, 0 or false.)
    if (['int', 'long', 'short', 'byte', 'double', 'float'].includes(type)) return 0;
    if (type === 'boolean') return false;
    return null;
  }
  switch (type) {
    case 'int':
    case 'Integer':
      return wrapInt(toNumber(value));
    case 'long':
    case 'Long':
      return wrapLong(toNumber(value));
    case 'short':
    case 'Short':
      return wrapShort(toNumber(value));
    case 'byte':
    case 'Byte':
      return wrapByte(toNumber(value));
    case 'double':
    case 'Double':
    case 'Number':
      return toNumber(value);
    case 'float':
    case 'Float':
      return Math.fround(toNumber(value));
    case 'char':
    case 'Character':
      return typeof value === 'number' ? String.fromCharCode(value) : value;
    case 'String':
      return typeof value === 'string' ? value : javaText(value);
    default:
      return value;
  }
}

// The array operators: select first/all, order by, split by, transform to (empty elements skipped).
function arrayOperator(operator, list, each) {
  if (list === null || list === undefined) return null;
  const items = (Array.isArray(list) ? list : list instanceof Map ? [...list.values()] : [list]).filter(
    (item) => item !== null && item !== undefined
  );
  switch (operator) {
    case 'first':
      return items.find((item) => each(item) === true) ?? null;
    case 'all':
      return items.filter((item) => each(item) === true);
    case 'order':
    case 'orderDesc': {
      const keyed = items.map((item, i) => ({ item, key: each(item), i }));
      keyed.sort((a, b) => {
        // (Empty keys last, both ways.)
        if (isEmptyValue(a.key) || isEmptyValue(b.key)) return isEmptyValue(a.key) - isEmptyValue(b.key) || a.i - b.i;
        const order = compare(a.key, b.key, true);
        return (operator === 'order' ? order : -order) || a.i - b.i;
      });
      return keyed.map((entry) => entry.item);
    }
    case 'split': {
      const groups = [];
      for (const item of items) {
        const key = each(item);
        const group = groups.find((entry) => equal(entry.key, key));
        if (group) group.items.push(item);
        else groups.push({ key, items: [item] });
      }
      return groups.map((group) => group.items);
    }
    // (Empty results are kept: as many as the elements.)
    case 'transform':
      return items.map(each);
    case 'transformUnique': {
      const result = [];
      for (const value of items.map(each)) {
        if (value !== null && value !== undefined && !result.some((other) => equal(other, value))) result.push(value);
      }
      return result;
    }
    default:
      throw new OpenLError(`No array operator ${operator}`);
  }
}

// The default value of a type (fields and arrays made with new): 0, false or null.
function defaultOf(type, dims = 0) {
  if (dims) return null;
  if (['int', 'long', 'short', 'byte', 'double', 'float'].includes(type)) return 0;
  if (type === 'boolean') return false;
  if (type === 'char') return '\0';
  return null;
}

export {
  narrow,
  floatDecimal,
  OpenLError,
  FORBIDDEN,
  NUMBER_TYPES,
  INT_TYPES,
  LONG_TYPES,
  FLOAT_TYPES,
  isIntType,
  isWholeType,
  javaText,
  wrapInt,
  wrapLong,
  longOf,
  toNumber,
  equal,
  compare,
  relation,
  add,
  arithmetic,
  member,
  setMember,
  index,
  callMethod,
  cast,
  arrayOperator,
  defaultOf,
  classOf,
  isRecord,
};
