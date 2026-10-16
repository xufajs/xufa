// The checks and object helpers that axios's API is defined by: what is a plain object, a form, a stream, a Blob; how
// configs and headers merge (case-insensitive keys, no prototype keys); and what toJSON() of an error keeps.

const { toString } = Object.prototype;
const TypedArray = Object.getPrototypeOf(Uint8Array);

// The tag of a value in small letters ('object', 'formdata', 'blob', 'asyncfunction'...), cached by its raw text.
const tags = Object.create(null);
function kindOf(value) {
  const raw = toString.call(value);
  return tags[raw] || (tags[raw] = raw.slice(8, -1).toLowerCase());
}

const isObject = (value) => value !== null && typeof value === 'object';
const isFunction = (value) => typeof value === 'function';
const isString = (value) => typeof value === 'string';
const isUndefined = (value) => value === undefined;
const isDate = (value) => kindOf(value) === 'date';
const isRegExp = (value) => kindOf(value) === 'regexp';
const isBlob = (value) => kindOf(value) === 'blob';
const isFile = (value) => kindOf(value) === 'file';
const isFileList = (value) => kindOf(value) === 'filelist';
const isHTMLForm = (value) => kindOf(value) === 'htmlformelement';
const isArrayBuffer = (value) => kindOf(value) === 'arraybuffer';
const isURLSearchParams = (value) => kindOf(value) === 'urlsearchparams';
const isReadableStream = (value) => kindOf(value) === 'readablestream';
const isResponse = (value) => kindOf(value) === 'response';
const isAsyncFunction = (value) => kindOf(value) === 'asyncfunction';
const isTypedArray = (value) => value instanceof TypedArray;
const isArrayBufferView = (value) => ArrayBuffer.isView(value);
const isStream = (value) => isObject(value) && isFunction(value.pipe);
const isIterable = (value) => value != null && isFunction(value[Symbol.iterator]);

function isBuffer(value) {
  return (
    value != null &&
    value.constructor != null &&
    isFunction(value.constructor.isBuffer) &&
    value.constructor.isBuffer(value)
  );
}

// An object literal (or of no prototype), not a class instance, a Map or anything iterable or tagged.
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || kindOf(value) !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) &&
    !(Symbol.toStringTag in value) &&
    !(Symbol.iterator in value)
  );
}

// A FormData: Node's (and any spec one), or one of the form-data package's API (append + toString tag).
function isFormData(value) {
  if (!value) return false;
  if (typeof FormData !== 'undefined' && value instanceof FormData) return true;
  if (!isFunction(value.append)) return false;
  const kind = kindOf(value);
  return (
    kind === 'formdata' || (kind === 'object' && isFunction(value.toString) && value.toString() === '[object FormData]')
  );
}

// A FormData of the standard (entries and Blobs), which Node's fetch and the http adapter's encoder take.
function isSpecCompliantForm(value) {
  return !!(value && isFunction(value.append) && value[Symbol.toStringTag] === 'FormData' && value[Symbol.iterator]);
}

// Each item of an array (value, index) or own enumerable key of an object (value, key); a lone value as [value].
// Buffers are not walked.
function forEach(target, fn, { allOwnKeys = false } = {}) {
  if (target === null || target === undefined) return;
  if (typeof target !== 'object') target = [target];
  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) fn(target[i], i, target);
    return;
  }
  if (isBuffer(target)) return;
  const keys = allOwnKeys ? Object.getOwnPropertyNames(target) : Object.keys(target);
  for (const key of keys) fn(target[key], key, target);
}

// The own key of an object that is `key` in any case, or null.
function findKey(target, key) {
  if (isBuffer(target)) return null;
  key = key.toLowerCase();
  const keys = Object.keys(target);
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i].toLowerCase() === key) return keys[i];
  }
  return null;
}

// A deep merge of plain objects into a new one (arrays copied, later wins); `caseless` merges keys of any case into
// the first one seen, `skipUndefined` keeps the value before an undefined. Prototype keys are dropped.
function mergeObjects(caseless, skipUndefined, sources) {
  const result = {};
  const assign = (value, key) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
    const target = (caseless && findKey(result, key)) || key;
    if (isPlainObject(result[target]) && isPlainObject(value))
      result[target] = mergeObjects(false, false, [result[target], value]);
    else if (isPlainObject(value)) result[target] = mergeObjects(false, false, [value]);
    else if (Array.isArray(value)) result[target] = value.slice();
    else if (!skipUndefined || value !== undefined) result[target] = value;
  };
  for (let i = 0; i < sources.length; i++) {
    if (sources[i]) forEach(sources[i], assign);
  }
  return result;
}

const mergeWith = ({ caseless = false, skipUndefined = false }, ...sources) =>
  mergeObjects(caseless, skipUndefined, sources);

// merge.call({ caseless, skipUndefined }, ...) as axios's utils.merge takes them.
function merge(...sources) {
  const context = this && this !== globalThis ? this : null;
  return mergeObjects(!!(context && context.caseless), !!(context && context.skipUndefined), sources);
}

// The properties of an object and of its prototypes (to Object.prototype) on one object: the first one seen wins.
// `filter` (false: own only; a function: stop when it says no) and `propFilter` choose.
function toFlatObject(source, target = {}, filter, propFilter) {
  if (source == null) return target;
  const seen = Object.create(null);
  do {
    const names = Object.getOwnPropertyNames(source);
    for (let i = names.length - 1; i >= 0; i--) {
      const name = names[i];
      if ((!propFilter || propFilter(name, source, target)) && !seen[name]) {
        target[name] = source[name];
        seen[name] = true;
      }
    }
    source = filter !== false && Object.getPrototypeOf(source);
  } while (source && (!filter || filter(source, target)) && source !== Object.prototype);
  return target;
}

// A copy that JSON can take: cycles dropped, objects with their own toJSON and Buffers kept as they are.
function toJSONObject(value) {
  const stack = [];
  const visit = (source) => {
    if (!isObject(source)) return source;
    if (stack.includes(source)) return undefined;
    if (isBuffer(source) || 'toJSON' in source) return source;
    stack.push(source);
    const target = Array.isArray(source) ? [] : {};
    forEach(source, (item, key) => {
      const reduced = visit(item);
      if (reduced !== undefined) target[key] = reduced;
    });
    stack.pop();
    return target;
  };
  return visit(value);
}

const toFiniteNumber = (value, fallback) => (value != null && Number.isFinite((value = +value)) ? value : fallback);

const stripBOM = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const toCamelCase = (text) =>
  text.toLowerCase().replace(/[-_\s]([a-z\d])(\w*)/g, (m, first, rest) => first.toUpperCase() + rest);

const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);

const noop = () => {};

const asap = queueMicrotask;

export {
  kindOf,
  isObject,
  isFunction,
  isString,
  isUndefined,
  isDate,
  isRegExp,
  isBlob,
  isFile,
  isFileList,
  isHTMLForm,
  isArrayBuffer,
  isArrayBufferView,
  isURLSearchParams,
  isReadableStream,
  isResponse,
  isAsyncFunction,
  isTypedArray,
  isStream,
  isIterable,
  isBuffer,
  isPlainObject,
  isFormData,
  isSpecCompliantForm,
  forEach,
  findKey,
  merge,
  mergeWith,
  mergeObjects,
  toFlatObject,
  toJSONObject,
  toFiniteNumber,
  stripBOM,
  toCamelCase,
  hasOwn,
  noop,
  asap,
};
