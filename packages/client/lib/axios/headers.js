// AxiosHeaders: headers as own properties of the object (Object.keys, { ...headers } and JSON see them), found in any
// case, with get/set/has accessors (getContentType()...), matchers, normalize() and concat(). And parseHeaders(): a
// raw block of headers to an object, as Node.js joins duplicates.
import {
  forEach,
  findKey,
  isFunction,
  isIterable,
  isObject,
  isPlainObject,
  isRegExp,
  isString,
  toCamelCase,
} from './util.js';

const { isArray } = Array;
const ACCESSORS = Symbol('accessors');

// Duplicates of these are dropped, as Node.js does (https://nodejs.org/api/http.html#messageheaders).
const SINGLE = new Set([
  'age',
  'authorization',
  'content-length',
  'content-type',
  'etag',
  'expires',
  'from',
  'host',
  'if-modified-since',
  'if-unmodified-since',
  'last-modified',
  'location',
  'max-forwards',
  'proxy-authorization',
  'referer',
  'retry-after',
  'user-agent',
]);

/** A raw block of headers ('Name: value' lines) as an object of small-letter names; set-cookie as an array. */
function parseHeaders(raw) {
  const parsed = {};
  if (!raw) return parsed;
  for (const line of raw.split('\n')) {
    const colon = line.indexOf(':');
    const key = line.substring(0, colon).trim().toLowerCase();
    const value = line.substring(colon + 1).trim();
    if (!key || (parsed[key] && SINGLE.has(key))) continue;
    if (key === 'set-cookie') {
      if (parsed[key]) parsed[key].push(value);
      else parsed[key] = [value];
    } else {
      parsed[key] = parsed[key] ? `${parsed[key]}, ${value}` : value;
    }
  }
  return parsed;
}

const normalizeHeader = (header) => header && String(header).trim().toLowerCase();

// Values as strings (arrays item by item), without trailing line breaks; false, null and undefined as they are.
function normalizeValue(value) {
  if (value === false || value == null) return value;
  return isArray(value) ? value.map(normalizeValue) : String(value).replace(/[\r\n]+$/, '');
}

function parseTokens(text) {
  const tokens = Object.create(null);
  const pattern = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let match;
  while ((match = pattern.exec(text))) tokens[match[1]] = match[2];
  return tokens;
}

const isValidHeaderName = (text) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(text.trim());

// A matcher of a value (or of the name): a function, a string it contains, or a RegExp.
function matchHeaderValue(context, value, header, filter, byName) {
  if (isFunction(filter)) return filter.call(context, value, header);
  if (byName) value = header;
  if (!isString(value)) return undefined;
  if (isString(filter)) return value.includes(filter);
  if (isRegExp(filter)) return filter.test(value);
  return undefined;
}

const formatHeader = (header) =>
  header
    .trim()
    .toLowerCase()
    .replace(/([a-z\d])(\w*)/g, (word, first, rest) => first.toUpperCase() + rest);

class AxiosHeaders {
  constructor(headers) {
    if (headers) this.set(headers);
  }

  /**
   * set(name, value, rewrite?) or set(object | raw text | iterable | AxiosHeaders, rewrite?). A header set to false
   * is kept unless rewrite is true; rewrite false sets only headers not set.
   */
  set(header, valueOrRewrite, rewrite) {
    const setHeader = (value, name, rewriteIt) => {
      const lower = normalizeHeader(name);
      if (!lower) throw new Error('header name must be a non-empty string');
      const key = findKey(this, lower);
      if (!key || this[key] === undefined || rewriteIt === true || (rewriteIt === undefined && this[key] !== false)) {
        this[key || name] = normalizeValue(value);
      }
    };
    const setHeaders = (headers, rewriteIt) => forEach(headers, (value, name) => setHeader(value, name, rewriteIt));

    if (isPlainObject(header) || header instanceof this.constructor) {
      setHeaders(header, valueOrRewrite);
    } else if (isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
      setHeaders(parseHeaders(header), valueOrRewrite);
    } else if (isObject(header) && isIterable(header)) {
      const object = {};
      for (const entry of header) {
        if (!isArray(entry)) throw TypeError('Object iterator must return a key-value pair');
        const [key, value] = entry;
        const before = object[key];
        object[key] = before ? (isArray(before) ? [...before, value] : [before, value]) : value;
      }
      setHeaders(object, valueOrRewrite);
    } else if (header != null) {
      setHeader(valueOrRewrite, header, rewrite);
    }
    return this;
  }

  /** The value; parsed with a parser: true (tokens: { a: '1' }), a function (value, name) or a RegExp (its match). */
  get(header, parser) {
    header = normalizeHeader(header);
    if (!header) return undefined;
    const key = findKey(this, header);
    if (!key) return undefined;
    const value = this[key];
    if (!parser) return value;
    if (parser === true) return parseTokens(value);
    if (isFunction(parser)) return parser.call(this, value, key);
    if (isRegExp(parser)) return parser.exec(value);
    throw new TypeError('parser must be boolean|regexp|function');
  }

  has(header, matcher) {
    header = normalizeHeader(header);
    if (!header) return false;
    const key = findKey(this, header);
    return !!(key && this[key] !== undefined && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
  }

  /** Deletes a header (or an array of them), when its value matches; true when one went. */
  delete(header, matcher) {
    let deleted = false;
    const deleteHeader = (name) => {
      name = normalizeHeader(name);
      if (!name) return;
      const key = findKey(this, name);
      if (key && (!matcher || matchHeaderValue(this, this[key], key, matcher))) {
        delete this[key];
        deleted = true;
      }
    };
    if (isArray(header)) header.forEach(deleteHeader);
    else deleteHeader(header);
    return deleted;
  }

  /** Deletes every header, or those whose name matches. */
  clear(matcher) {
    const keys = Object.keys(this);
    let deleted = false;
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
        delete this[key];
        deleted = true;
      }
    }
    return deleted;
  }

  /** One key per header (the first case seen wins), names trimmed, or Formatted-Like-This with `format`. */
  normalize(format) {
    const seen = {};
    forEach(this, (value, header) => {
      const key = findKey(seen, header);
      if (key) {
        this[key] = normalizeValue(value);
        delete this[header];
        return;
      }
      const normalized = format ? formatHeader(header) : String(header).trim();
      if (normalized !== header) delete this[header];
      this[normalized] = normalizeValue(value);
      seen[normalized] = true;
    });
    return this;
  }

  concat(...targets) {
    return this.constructor.concat(this, ...targets);
  }

  /** The headers set (not false, null or undefined); arrays joined with ', ' when asStrings. */
  toJSON(asStrings) {
    const object = Object.create(null);
    forEach(this, (value, header) => {
      if (value != null && value !== false) object[header] = asStrings && isArray(value) ? value.join(', ') : value;
    });
    return object;
  }

  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }

  toString() {
    return Object.entries(this.toJSON())
      .map(([header, value]) => `${header}: ${value}`)
      .join('\n');
  }

  getSetCookie() {
    return this.get('set-cookie') || [];
  }

  get [Symbol.toStringTag]() {
    return 'AxiosHeaders';
  }

  static from(thing) {
    return thing instanceof this ? thing : new this(thing);
  }

  static concat(first, ...targets) {
    const computed = new this(first);
    for (const target of targets) computed.set(target);
    return computed;
  }

  /** Adds getX/setX/hasX methods for headers (X in camel case: 'Content-Type' gives getContentType()). */
  static accessor(header) {
    const accessors = (this[ACCESSORS] ??= {});
    const define = (name) => {
      const lower = normalizeHeader(name);
      if (accessors[lower]) return;
      const suffix = toCamelCase(` ${name}`);
      for (const method of ['get', 'set', 'has']) {
        Object.defineProperty(this.prototype, method + suffix, {
          value(arg1, arg2, arg3) {
            return this[method](name, arg1, arg2, arg3);
          },
          configurable: true,
        });
      }
      accessors[lower] = true;
    };
    if (isArray(header)) header.forEach(define);
    else define(header);
    return this;
  }
}

AxiosHeaders.accessor(['Content-Type', 'Content-Length', 'Accept', 'Accept-Encoding', 'User-Agent', 'Authorization']);

// The methods are getters of the prototype whose setters write the header with a capital ('set' -> 'Set'): headers
// named like the methods ({ set: 'x' }) do not hide them.
for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(AxiosHeaders.prototype))) {
  if (!('value' in descriptor)) continue;
  const { value } = descriptor;
  const mapped = key[0].toUpperCase() + key.slice(1);
  Object.defineProperty(AxiosHeaders.prototype, key, {
    get: () => value,
    set(headerValue) {
      this[mapped] = headerValue;
    },
    enumerable: descriptor.enumerable,
    configurable: true,
  });
}

// Its static methods read-only and not enumerable.
for (const key of ['from', 'concat', 'accessor']) {
  Object.defineProperty(AxiosHeaders, key, { enumerable: false, writable: false });
}

export { AxiosHeaders, parseHeaders };
