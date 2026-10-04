// Parsing of query strings: a=1&b=2&a=3 -> { a: ['1', '3'], b: '2' }. '+' is a space, %XX sequences are decoded
// (and kept as written when malformed). Keys and values are only decoded when they have a '%' or a '+'.

function NullObject() {}
NullObject.prototype = Object.create(null);

// The value of the hexadecimal digits by character code, -1 for other characters.
const HEX = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i += 1) HEX[48 + i] = i;
for (let i = 0; i < 6; i += 1) {
  HEX[65 + i] = 10 + i;
  HEX[97 + i] = 10 + i;
}

// The byte written as %XX at index i (of the '%'), or -1.
function byteAt(text, i) {
  const high = text.charCodeAt(i + 1);
  const low = text.charCodeAt(i + 2);
  if (high > 127 || low > 127) return -1;
  const h = HEX[high];
  const l = HEX[low];
  return h === -1 || l === -1 ? -1 : (h << 4) | l;
}

// What decodeURIComponent gives, or null where it throws (malformed sequences, invalid UTF-8): faster for the short
// strings of query strings, and without the cost of an exception for malformed ones.
function decodeComponent(text) {
  let i = text.indexOf('%');
  if (i === -1) return text;
  const length = text.length;
  let out = '';
  let last = 0;
  while (i !== -1) {
    if (i + 2 >= length) return null;
    const first = byteAt(text, i);
    let codePoint;
    let continuation;
    if (first < 0) return null;
    if (first < 0x80) {
      codePoint = first;
      continuation = 0;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      continuation = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      continuation = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      continuation = 3;
    } else {
      return null;
    }
    out += text.slice(last, i);
    i += 3;
    for (let k = 0; k < continuation; k += 1) {
      if (i + 2 >= length || text.charCodeAt(i) !== 37) return null;
      const byte = byteAt(text, i);
      if (byte < 0 || (byte & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (byte & 0x3f);
      i += 3;
    }
    // Overlong forms, surrogates and code points beyond Unicode are invalid UTF-8.
    if (continuation === 2 && (codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff))) return null;
    if (continuation === 3 && (codePoint < 0x10000 || codePoint > 0x10ffff)) return null;
    out += codePoint < 0x10000 ? String.fromCharCode(codePoint) : String.fromCodePoint(codePoint);
    last = i;
    i = text.indexOf('%', i);
  }
  return last === length ? out : out + text.slice(last);
}

function decode(value, hasPlus, hasPercent) {
  const out = hasPlus ? value.replace(/\+/g, ' ') : value;
  if (!hasPercent) return out;
  // Kept as written when malformed.
  const decoded = decodeComponent(out);
  return decoded === null ? out : decoded;
}

function parse(input) {
  const result = new NullObject();
  const length = input.length;
  if (length === 0) return result;
  let start = 0;
  let equal = -1;
  let keyPlus = false;
  let keyPercent = false;
  let valuePlus = false;
  let valuePercent = false;
  for (let i = 0; i <= length; i += 1) {
    const code = i === length ? 38 : input.charCodeAt(i);
    if (code === 38) {
      // &
      if (i > start) {
        let key;
        let value;
        if (equal === -1) {
          key = input.slice(start, i);
          value = '';
        } else {
          key = input.slice(start, equal);
          value = input.slice(equal + 1, i);
        }
        if (keyPlus || keyPercent) key = decode(key, keyPlus, keyPercent);
        if (valuePlus || valuePercent) value = decode(value, valuePlus, valuePercent);
        if (key.length > 0 || equal !== -1) {
          const existing = result[key];
          if (existing === undefined) result[key] = value;
          else if (typeof existing === 'string') result[key] = [existing, value];
          else existing.push(value);
        }
      }
      start = i + 1;
      equal = -1;
      keyPlus = false;
      keyPercent = false;
      valuePlus = false;
      valuePercent = false;
    } else if (code === 61) {
      // =
      if (equal === -1) equal = i;
    } else if (code === 43) {
      // +
      if (equal === -1) keyPlus = true;
      else valuePlus = true;
    } else if (code === 37) {
      // %
      if (equal === -1) keyPercent = true;
      else valuePercent = true;
    }
  }
  return result;
}

function encodeValue(value) {
  if (typeof value === 'string') return encodeURIComponent(value);
  if (typeof value === 'number' || typeof value === 'bigint') return Number.isFinite(Number(value)) ? `${value}` : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function stringify(object) {
  const parts = [];
  for (const key of Object.keys(object)) {
    const value = object[key];
    const name = encodeURIComponent(key);
    if (Array.isArray(value)) for (const item of value) parts.push(`${name}=${encodeValue(item)}`);
    else parts.push(`${name}=${encodeValue(value)}`);
  }
  return parts.join('&');
}

module.exports = { parse, stringify, decodeComponent, NullObject };
