// The value of a Content-Type header: type/subtype and parameters (RFC 9110 §8.3, §5.6.6), parsed once per distinct
// header value thanks to a small LRU cache.

// One `name=value` parameter at a parameter boundary; the value is a token or a quoted-string with quoted-pairs.
const PARAMETER =
  /(?:^|;)\s*([\w!#$%&'*+.^`|~-]+)=("(?:[\t\x20\x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t\x20-\xff])*"|[\w!#$%&'*+.^`|~-]+)/gu;
const QUOTED_PAIR = /\\([\t\x20-\xff])/gu;
const TYPE_NAME = /^[\w!#$%&'*+.^`|~-]+$/;
const SUBTYPE_NAME = /^[\w!#$%&'*+.^`|~-]+\s*$/;

class LruMap {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, value);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

const cache = new LruMap(100);

class ContentType {
  #valid = false;

  #empty = true;

  #type = '';

  #subtype = '';

  #parameters = new Map();

  #string = undefined;

  static get cache() {
    return cache;
  }

  // A parsed header value, cached by value.
  static from(headerValue) {
    let contentType = cache.get(headerValue);
    if (contentType !== undefined) return contentType;
    contentType = new ContentType(headerValue);
    cache.set(headerValue, contentType);
    return contentType;
  }

  constructor(headerValue) {
    if (headerValue == null || headerValue === '' || headerValue === 'undefined') return;
    let separator = headerValue.indexOf(';');
    if (separator === -1) {
      separator = headerValue.indexOf('/');
      if (separator === -1) return;
      const type = headerValue.slice(0, separator).trimStart().toLowerCase();
      const subtype = headerValue
        .slice(separator + 1)
        .trimEnd()
        .toLowerCase();
      if (TYPE_NAME.test(type) && SUBTYPE_NAME.test(subtype)) {
        this.#valid = true;
        this.#empty = false;
        this.#type = type;
        this.#subtype = subtype;
      }
      return;
    }
    const mediaType = headerValue.slice(0, separator).toLowerCase();
    const parameters = headerValue.slice(separator + 1).trim();
    separator = mediaType.indexOf('/');
    if (separator === -1) return;
    const type = mediaType.slice(0, separator).trimStart();
    const subtype = mediaType.slice(separator + 1).trimEnd();
    if (!TYPE_NAME.test(type) || !SUBTYPE_NAME.test(subtype)) return;
    this.#type = type;
    this.#subtype = subtype;
    this.#valid = true;
    this.#empty = false;
    PARAMETER.lastIndex = 0;
    let match = PARAMETER.exec(parameters);
    while (match) {
      // Parameter names are case-insensitive, values may not be.
      const key = match[1].toLowerCase();
      let value = match[2];
      if (value.charCodeAt(0) === 0x22) {
        value = value.slice(1, -1);
        if (value.indexOf('\\') !== -1) value = value.replace(QUOTED_PAIR, '$1');
      }
      this.#parameters.set(key, value);
      match = PARAMETER.exec(parameters);
    }
  }

  get [Symbol.toStringTag]() {
    return 'ContentType';
  }

  get isEmpty() {
    return this.#empty;
  }

  get isValid() {
    return this.#valid;
  }

  get mediaType() {
    return this.#valid ? `${this.#type}/${this.#subtype}` : undefined;
  }

  get type() {
    return this.#type;
  }

  get subtype() {
    return this.#subtype;
  }

  get parameters() {
    return this.#parameters;
  }

  toString() {
    if (this.#string !== undefined) return this.#string;
    let out = `${this.#type}/${this.#subtype}`;
    const parameters = [];
    for (const [key, value] of this.#parameters) {
      // Inside a quoted-string, backslashes and quotes are written as quoted-pairs.
      parameters.push(`${key}="${value.replace(/[\\"]/g, '\\$&')}"`);
    }
    if (parameters.length > 0) out += `; ${parameters.join('; ')}`;
    this.#string = out;
    return out;
  }
}

export default ContentType;
ContentType.LruMap = LruMap;

export { LruMap };

// What require() gives (the tests of fastify are CommonJS).
export { ContentType as 'module.exports' };
