// BSON (https://bsonspec.org): the documents of MongoDB. JavaScript values are encoded as their BSON types: numbers
// as int32 when they are integers that fit, otherwise as doubles; bigints as int64; Dates, RegExps, Buffers
// (binary), ObjectId, and the classes below for the types JavaScript has no value for. int64 values are decoded as
// numbers when they are safe integers, and as bigints otherwise.
import { randomBytes } from 'node:crypto';

const inspect = Symbol.for('nodejs.util.inspect.custom');

let processUnique;
let counter = randomBytes(3).readUIntBE(0, 3);
const RAW = Symbol('raw');

function readUInt32BE(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function hex8(value) {
  return value.toString(16).padStart(8, '0');
}

// An ObjectId keeps its 12 bytes as three unsigned integers (big endian), so making one (decoding, generating)
// allocates no buffer; `buffer` makes one when it is asked for.
class ObjectId {
  constructor(value) {
    if (value === RAW) {
      // Filled by fromBytes. Every branch sets the same properties in the same order, for one hidden class.
      this.high = 0;
      this.mid = 0;
      this.low = 0;
    } else if (value === undefined || value === null) {
      if (!processUnique) processUnique = randomBytes(5);
      counter = (counter + 1) % 0x1000000;
      this.high = Math.floor(Date.now() / 1000) >>> 0;
      this.mid = readUInt32BE(processUnique, 0);
      this.low = ((processUnique[4] << 24) | counter) >>> 0;
    } else if (value instanceof ObjectId) {
      this.high = value.high;
      this.mid = value.mid;
      this.low = value.low;
    } else if (typeof value === 'string' && ObjectId.isValid(value)) {
      this.high = parseInt(value.slice(0, 8), 16);
      this.mid = parseInt(value.slice(8, 16), 16);
      this.low = parseInt(value.slice(16, 24), 16);
    } else if (value instanceof Uint8Array && value.length === 12) {
      this.high = readUInt32BE(value, 0);
      this.mid = readUInt32BE(value, 4);
      this.low = readUInt32BE(value, 8);
    } else throw new TypeError(`Invalid ObjectId: ${value}`);
    this.hex = undefined;
  }

  // An ObjectId of the 12 bytes at an offset of a buffer, without the checks of the constructor.
  static fromBytes(buffer, offset) {
    const id = new ObjectId(RAW);
    id.high = readUInt32BE(buffer, offset);
    id.mid = readUInt32BE(buffer, offset + 4);
    id.low = readUInt32BE(buffer, offset + 8);
    return id;
  }

  // The 12 bytes of a new ObjectId: 4 bytes of seconds, 5 random bytes of the process and a counter of 3 bytes.
  static generate() {
    return new ObjectId().buffer;
  }

  static isValid(value) {
    return typeof value === 'string' && value.length === 24 && /^[0-9a-fA-F]{24}$/.test(value);
  }

  get buffer() {
    const bytes = Buffer.allocUnsafe(12);
    bytes.writeUInt32BE(this.high, 0);
    bytes.writeUInt32BE(this.mid, 4);
    bytes.writeUInt32BE(this.low, 8);
    return bytes;
  }

  get id() {
    return this.buffer;
  }

  toHexString() {
    if (this.hex === undefined) this.hex = hex8(this.high) + hex8(this.mid) + hex8(this.low);
    return this.hex;
  }

  toString() {
    return this.toHexString();
  }

  toJSON() {
    return this.toHexString();
  }

  equals(other) {
    if (typeof other === 'string') return this.toHexString() === other.toLowerCase();
    return other instanceof ObjectId && this.high === other.high && this.mid === other.mid && this.low === other.low;
  }

  getTimestamp() {
    return new Date(this.high * 1000);
  }

  [inspect]() {
    return `ObjectId('${this.toHexString()}')`;
  }
}

class Binary {
  constructor(buffer, subType = 0) {
    this.buffer = Buffer.from(buffer);
    this.subType = subType;
  }
}

class Timestamp {
  constructor(low, high) {
    this.low = low;
    this.high = high;
  }
}

// IEEE 754-2008 decimal128, as BSON keeps it (binary integer decimal): a sign, an exponent of 14 bits biased by 6176
// and a coefficient of up to 34 digits, in two 64-bit words, the low one first, both little-endian.
const DECIMAL_BIAS = 6176;
const DECIMAL_MAX_EXPONENT = 6111;
const DECIMAL_MIN_EXPONENT = -6176;
const DECIMAL_MAX_DIGITS = 34;
const DECIMAL_MAX_COEFFICIENT = 10n ** 34n - 1n;
const WORD = (1n << 64n) - 1n;
const DECIMAL_TEXT = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

class Decimal128 {
  constructor(bytes) {
    this.bytes = Buffer.from(bytes);
  }

  // The decimal of a text ('12.50', '-1E+3', 'Infinity', 'NaN'), exactly: a value that needs more than 34 digits or an
  // exponent out of the range of decimal128 throws a RangeError (rounding would change it).
  static fromString(text) {
    const value = String(text).trim();
    const special = /^([+-])?(inf|infinity|nan)$/i.exec(value);
    if (special) {
      const negative = special[1] === '-';
      const high = special[2].toLowerCase() === 'nan' ? 0x7c00000000000000n : 0x7800000000000000n;
      return Decimal128.fromParts(negative && high !== 0x7c00000000000000n, 0n, 0, high);
    }
    const match = DECIMAL_TEXT.exec(value);
    if (!match) throw new TypeError(`${JSON.stringify(text)} is not a decimal number`);
    const negative = match[1] === '-';
    const integer = match[2] !== undefined ? match[2] : '';
    const fraction = match[3] !== undefined ? match[3] : match[4] || '';
    let exponent = (match[5] === undefined ? 0 : Number(match[5])) - fraction.length;
    let digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '');
    if (digits === '') digits = '0';
    // Zeros at the end that do not fit are dropped by raising the exponent (the same value).
    while (digits.length > DECIMAL_MAX_DIGITS && digits.endsWith('0')) {
      digits = digits.slice(0, -1);
      exponent += 1;
    }
    if (digits.length > DECIMAL_MAX_DIGITS) {
      throw new RangeError(`${value} has more than ${DECIMAL_MAX_DIGITS} digits: a decimal128 cannot keep it exactly`);
    }
    // A large exponent is brought down by adding zeros to the coefficient, while it has room for them.
    while (exponent > DECIMAL_MAX_EXPONENT && digits !== '0' && digits.length < DECIMAL_MAX_DIGITS) {
      digits += '0';
      exponent -= 1;
    }
    if (digits === '0') exponent = Math.min(Math.max(exponent, DECIMAL_MIN_EXPONENT), DECIMAL_MAX_EXPONENT);
    if (exponent > DECIMAL_MAX_EXPONENT || exponent < DECIMAL_MIN_EXPONENT) {
      throw new RangeError(`${value} is out of the range of a decimal128`);
    }
    // Up to 15 digits (most decimals): the coefficient is a number, written without BigInt.
    if (digits.length <= 15) {
      const coefficient = Number(digits);
      const bytes = Buffer.alloc(16);
      bytes.writeUInt32LE(coefficient % 0x100000000, 0);
      bytes.writeUInt32LE(Math.floor(coefficient / 0x100000000), 4);
      // The high word: sign (bit 63), exponent (bits 62 to 49), nothing of the coefficient (bits 48 to 0).
      bytes.writeUInt32LE(((negative ? 0x80000000 : 0) | ((exponent + DECIMAL_BIAS) << 17)) >>> 0, 12);
      return new Decimal128(bytes);
    }
    return Decimal128.fromParts(negative, BigInt(digits), exponent);
  }

  // The decimal of a sign, a coefficient (a BigInt of up to 34 digits) and an exponent: (-1)^sign * coefficient * 10^exponent.
  static fromParts(negative, coefficient, exponent, special = null) {
    let high;
    let low;
    if (special !== null) {
      high = special;
      low = 0n;
    } else {
      if (coefficient < 0n || coefficient > DECIMAL_MAX_COEFFICIENT)
        throw new RangeError('The coefficient has 34 digits at most');
      high = (BigInt(exponent + DECIMAL_BIAS) << 49n) | (coefficient >> 64n);
      low = coefficient & WORD;
    }
    if (negative) high |= 1n << 63n;
    const bytes = Buffer.alloc(16);
    bytes.writeBigUInt64LE(low, 0);
    bytes.writeBigUInt64LE(high, 8);
    return new Decimal128(bytes);
  }

  // { negative, coefficient (BigInt), exponent, special: null, 'Infinity' or 'NaN' }. Coefficients that are not
  // canonical (larger than 34 digits) are zero, as the standard says.
  toParts() {
    // A coefficient in the low word only, under 2^53 (most decimals): read without BigInt.
    const { bytes } = this;
    const top = bytes.readUInt32LE(12);
    const lowHigh = bytes.readUInt32LE(4);
    if (
      (top & 0x60000000) !== 0x60000000 &&
      (top & 0x1ffff) === 0 &&
      bytes.readUInt32LE(8) === 0 &&
      lowHigh < 0x200000
    ) {
      return {
        negative: top >>> 31 === 1,
        coefficient: lowHigh * 0x100000000 + bytes.readUInt32LE(0),
        exponent: ((top >>> 17) & 0x3fff) - DECIMAL_BIAS,
        special: null,
      };
    }
    const low = this.bytes.readBigUInt64LE(0);
    const high = this.bytes.readBigUInt64LE(8);
    const negative = high >> 63n === 1n;
    const combination = (high >> 58n) & 0x1fn;
    if (combination === 0x1fn) return { negative: false, coefficient: 0n, exponent: 0, special: 'NaN' };
    if (combination === 0x1en) return { negative, coefficient: 0n, exponent: 0, special: 'Infinity' };
    let exponent;
    let coefficient;
    if (((high >> 61n) & 3n) === 3n) {
      // The form of coefficients of more than 113 bits: none is canonical.
      exponent = Number((high >> 47n) & 0x3fffn) - DECIMAL_BIAS;
      coefficient = 0n;
    } else {
      exponent = Number((high >> 49n) & 0x3fffn) - DECIMAL_BIAS;
      coefficient = ((high & ((1n << 49n) - 1n)) << 64n) | low;
      if (coefficient > DECIMAL_MAX_COEFFICIENT) coefficient = 0n;
    }
    return { negative, coefficient, exponent, special: null };
  }

  // The text of the standard (to-scientific-string), as the other drivers write it: '12.50', '1E+3', '-0.0001'.
  toString() {
    const { negative, coefficient, exponent, special } = this.toParts();
    const sign = negative ? '-' : '';
    if (special) return `${sign}${special}`;
    const digits = coefficient.toString();
    const adjusted = exponent + digits.length - 1;
    if (exponent <= 0 && adjusted >= -6) {
      if (exponent === 0) return `${sign}${digits}`;
      const point = digits.length + exponent;
      if (point > 0) return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
      return `${sign}0.${'0'.repeat(-point)}${digits}`;
    }
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    return `${sign}${mantissa}E${adjusted >= 0 ? '+' : ''}${adjusted}`;
  }

  toJSON() {
    return { $numberDecimal: this.toString() };
  }
}

class MinKey {}
class MaxKey {}

// An int32 or a double, when the type has to be the one given.
class Int32 {
  constructor(value) {
    this.value = value | 0;
  }
}

class Double {
  constructor(value) {
    this.value = Number(value);
  }
}

const TWO_32 = 4294967296;
const SHORT_STRING = 48;
const float64 = new Float64Array(1);
const float64Bytes = new Uint8Array(float64.buffer);
// Encoding. Documents are written into a buffer reused from a call to the next (`out`, at `pos`) and copied out at
// the end. Each element checks once that the buffer has room for its type, its key and a value of fixed size;
// numbers are written with arithmetic on the bytes, and short ASCII strings (keys, most values) char by char instead
// of calling into C++.
const NULL_IN_KEY = 'BSON keys and patterns cannot contain null characters';
const MAX_KEPT = 1024 * 1024;
// The room of an element besides its key: its type, the null after the key and a value of up to 16 bytes.
const ELEMENT_ROOM = 18;

let out = Buffer.allocUnsafeSlow(64 * 1024);
let pos = -1;
// Whether plain objects can be read with for-in (see writeDocument).
let plainForIn = true;

function grow(size) {
  let length = out.length * 2;
  while (length < pos + size) length *= 2;
  const buffer = Buffer.allocUnsafeSlow(length);
  out.copy(buffer, 0, 0, pos);
  out = buffer;
}

function writeInt32(value) {
  out[pos] = value;
  out[pos + 1] = value >>> 8;
  out[pos + 2] = value >>> 16;
  out[pos + 3] = value >>> 24;
  pos += 4;
}

// An int64 of a bigint, or of a number (a safe integer) without making a bigint.
function writeInt64(value) {
  if (typeof value === 'bigint') {
    out.writeBigInt64LE(value, pos);
    pos += 8;
    return;
  }
  const high = Math.floor(value / TWO_32);
  writeInt32(value - high * TWO_32);
  writeInt32(high);
}

function writeDouble(value) {
  float64[0] = value;
  for (let i = 0; i < 8; i += 1) out[pos + i] = float64Bytes[i];
  pos += 8;
}

function writeBytes(source) {
  if (pos + source.length > out.length) grow(source.length);
  out.set(source, pos);
  pos += source.length;
}

// Writes the UTF-8 bytes of a string at pos (the room for them is there) and gives their number.
function writeUtf8(value, isKey) {
  const { length } = value;
  if (length <= SHORT_STRING) {
    let i = 0;
    for (; i < length; i += 1) {
      const code = value.charCodeAt(i);
      if (code >= 0x80) break;
      if (code === 0 && isKey) throw new TypeError(NULL_IN_KEY);
      out[pos + i] = code;
    }
    if (i === length) return length;
  }
  if (isKey && value.includes('\u0000')) throw new TypeError(NULL_IN_KEY);
  return out.utf8Write(value, pos);
}

// The type and the key of an element, with room after them for a value of up to 16 bytes.
function writeHead(type, key) {
  const room = key.length * 3 + ELEMENT_ROOM;
  if (pos + room > out.length) grow(room);
  out[pos] = type;
  pos += 1;
  pos += writeUtf8(key, true);
  out[pos] = 0;
  pos += 1;
}

function writeCString(value) {
  const room = value.length * 3 + 1;
  if (pos + room > out.length) grow(room);
  pos += writeUtf8(value, true);
  out[pos] = 0;
  pos += 1;
}

function writeString(value) {
  const room = value.length * 3 + 5;
  if (pos + room > out.length) grow(room);
  const start = pos;
  pos += 4;
  const length = writeUtf8(value, false);
  pos = start;
  writeInt32(length + 1);
  pos += length;
  out[pos] = 0;
  pos += 1;
}

function writeDocument(doc, isArray) {
  if (pos + 5 > out.length) grow(5);
  const start = pos;
  pos += 4;
  if (isArray) {
    for (let i = 0; i < doc.length; i += 1) {
      const value = doc[i];
      const key = i < DIGITS.length ? DIGITS[i] : String(i);
      writeElement(key, value === undefined || typeof value === 'function' ? null : value);
    }
  } else if (doc instanceof Map) {
    doc.forEach((value, key) => {
      if (value !== undefined) writeElement(key, value);
    });
  } else if (plainForIn && Object.getPrototypeOf(doc) === Object.prototype) {
    // The properties of plain objects are read fast with for-in (its enum cache), when Object.prototype has no
    // enumerable properties (for-in would give them: a polluted prototype must not reach the database).
    for (const key in doc) {
      const value = doc[key];
      if (value !== undefined && typeof value !== 'function') writeElement(key, value);
    }
  } else {
    const keys = Object.keys(doc);
    for (let i = 0; i < keys.length; i += 1) {
      const value = doc[keys[i]];
      if (value !== undefined && typeof value !== 'function') writeElement(keys[i], value);
    }
  }
  if (pos + 1 > out.length) grow(1);
  out[pos] = 0;
  pos += 1;
  const end = pos;
  pos = start;
  writeInt32(end - start);
  pos = end;
}

function writeElement(key, value) {
  if (value === null) {
    writeHead(0x0a, key);
    return;
  }
  switch (typeof value) {
    case 'string':
      writeHead(0x02, key);
      writeString(value);
      return;
    case 'number':
      if ((value | 0) === value && !Object.is(value, -0)) {
        writeHead(0x10, key);
        writeInt32(value);
      } else {
        writeHead(0x01, key);
        writeDouble(value);
      }
      return;
    case 'boolean':
      writeHead(0x08, key);
      out[pos] = value ? 1 : 0;
      pos += 1;
      return;
    case 'bigint':
      writeHead(0x12, key);
      writeInt64(value);
      return;
    case 'object':
      break;
    default:
      throw new TypeError(`Cannot encode ${typeof value} in BSON (${key})`);
  }
  if (value instanceof ObjectId) {
    writeHead(0x07, key);
    writeUInt32BE(value.high);
    writeUInt32BE(value.mid);
    writeUInt32BE(value.low);
  } else if (value instanceof Date) {
    writeHead(0x09, key);
    writeInt64(value.getTime());
  } else if (Array.isArray(value)) {
    writeHead(0x04, key);
    writeDocument(value, true);
  } else if (value instanceof Binary || value instanceof Uint8Array) {
    const buffer = value instanceof Binary ? value.buffer : value;
    writeHead(0x05, key);
    writeInt32(buffer.length);
    out[pos] = value instanceof Binary ? value.subType : 0;
    pos += 1;
    writeBytes(buffer);
  } else if (value instanceof RegExp) {
    writeHead(0x0b, key);
    writeCString(value.source);
    writeCString(
      value.flags
        .replace(/[^imsux]/g, '')
        .split('')
        .sort()
        .join('')
    );
  } else if (value instanceof Int32) {
    writeHead(0x10, key);
    writeInt32(value.value);
  } else if (value instanceof Double) {
    writeHead(0x01, key);
    writeDouble(value.value);
  } else if (value instanceof Timestamp) {
    writeHead(0x11, key);
    writeInt32(value.low);
    writeInt32(value.high);
  } else if (value instanceof Decimal128) {
    writeHead(0x13, key);
    writeBytes(value.bytes);
  } else if (value instanceof MinKey) {
    writeHead(0xff, key);
  } else if (value instanceof MaxKey) {
    writeHead(0x7f, key);
  } else {
    writeHead(0x03, key);
    writeDocument(value, false);
  }
}

function writeUInt32BE(value) {
  out[pos] = value >>> 24;
  out[pos + 1] = value >>> 16;
  out[pos + 2] = value >>> 8;
  out[pos + 3] = value;
  pos += 4;
}

const DIGITS = Array.from({ length: 100 }, (_, i) => String(i));

// Runs an encoding with the shared buffer, or with a buffer of its own when it is called while another runs (from a
// getter of a document being encoded): the state of the outer one is saved and given back.
function encoding(fn) {
  const outerOut = out;
  const outerPos = pos;
  const nested = outerPos !== -1;
  if (nested) out = Buffer.allocUnsafeSlow(1024);
  plainForIn = Object.keys(Object.prototype).length === 0;
  try {
    return fn();
  } finally {
    if (nested) {
      out = outerOut;
      pos = outerPos;
    } else {
      // Buffers grown for huge documents are not kept.
      if (out.length > MAX_KEPT) out = Buffer.allocUnsafeSlow(64 * 1024);
      pos = -1;
    }
  }
}

function copyOut() {
  const result = Buffer.allocUnsafe(pos);
  out.copy(result, 0, 0, pos);
  return result;
}

// Encodes a document after `reserve` bytes left to the caller (the header of a message), in a buffer of its own.
function serialize(doc, reserve = 0) {
  return encoding(() => {
    pos = reserve;
    if (pos + 4 > out.length) grow(4);
    writeDocument(doc, false);
    return copyOut();
  });
}

// Encodes the sections of an OP_MSG after `reserve` bytes: the body (kind 0), and the documents of `docs` from
// `start` as a document sequence (kind 1) named `identifier`, as many as fit in `maxBytes` (the whole message) and
// `maxCount` (one at least). Gives the message and the index of the first document left out.
function serializeSections(body, identifier, docs, start, reserve, maxBytes, maxCount) {
  return encoding(() => {
    pos = reserve;
    if (pos + 1 > out.length) grow(1);
    out[pos] = 0;
    pos += 1;
    writeDocument(body, false);
    if (pos + 5 > out.length) grow(5);
    out[pos] = 1;
    const sectionStart = pos + 1;
    pos = sectionStart + 4;
    writeCString(identifier);
    let end = start;
    const last = Math.min(docs.length, start + maxCount);
    while (end < last) {
      const before = pos;
      writeDocument(docs[end], false);
      if (pos > maxBytes && end > start) {
        pos = before;
        break;
      }
      end += 1;
    }
    const sectionEnd = pos;
    pos = sectionStart;
    writeInt32(sectionEnd - sectionStart);
    pos = sectionEnd;
    return { message: copyOut(), end };
  });
}

// Decoding. It reads numbers with arithmetic on the bytes instead of the methods of Buffer, decodes short ASCII
// strings (keys, most values) byte by byte instead of calling into C++, and makes no object it does not return.

function int32(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}

function double(buffer, offset) {
  for (let i = 0; i < 8; i += 1) float64Bytes[i] = buffer[offset + i];
  return float64[0];
}

// An int64 as a number when it is a safe integer, and as a bigint otherwise.
function int64(buffer, offset) {
  const low = int32(buffer, offset) >>> 0;
  const high = int32(buffer, offset + 4);
  // high * 2^32 + low is exact up to 2^53: within it, the safe integers are numbers.
  if (high >= -0x200000 && high <= 0x200000) {
    const value = high * TWO_32 + low;
    if (Number.isSafeInteger(value)) return value;
  }
  return buffer.readBigInt64LE(offset);
}

function utf8(buffer, start, end) {
  if (end - start <= SHORT_STRING) {
    let result = '';
    for (let i = start; i < end; i += 1) {
      const byte = buffer[i];
      if (byte > 0x7f) return buffer.utf8Slice(start, end);
      result += String.fromCharCode(byte);
    }
    return result;
  }
  return buffer.utf8Slice(start, end);
}

const KEY_CACHE_SIZE = 1024;
const keyCache = new Array(KEY_CACHE_SIZE).fill(null);
const keyBytesCache = new Array(KEY_CACHE_SIZE).fill(null);

function cachedKey(buffer, start, end, hash) {
  const length = end - start;
  if (length > SHORT_STRING) return buffer.utf8Slice(start, end);
  const slot = (hash ^ length) & (KEY_CACHE_SIZE - 1);
  const bytes = keyBytesCache[slot];
  if (bytes !== null && bytes.length === length) {
    let same = true;
    for (let i = 0; i < length; i += 1) {
      if (bytes[i] !== buffer[start + i]) {
        same = false;
        break;
      }
    }
    if (same) return keyCache[slot];
  }
  const key = utf8(buffer, start, end);
  keyCache[slot] = key;
  // A copy: a view would keep the whole reply in memory.
  keyBytesCache[slot] = Uint8Array.prototype.slice.call(buffer, start, end);
  return key;
}

function invalid(message) {
  return new Error(`Invalid BSON: ${message}`);
}

// The offset after the last value read by readValue.
let valueEnd = 0;

// The value of an element of a type at an offset; `end` is the end of the document it is in.
// `root` is the root of the shapes of a document or an array value.
function readValue(buffer, type, offset, end, root) {
  switch (type) {
    case 0x01:
      valueEnd = offset + 8;
      return double(buffer, offset);
    case 0x02:
    case 0x0d:
    case 0x0e: {
      const length = int32(buffer, offset);
      if (length < 1 || offset + 4 + length > end) throw invalid('string size');
      valueEnd = offset + 4 + length;
      return utf8(buffer, offset + 4, offset + 3 + length);
    }
    case 0x03:
    case 0x04: {
      const value = readDocument(buffer, offset, type === 0x04, root);
      valueEnd = offset + int32(buffer, offset);
      return value;
    }
    case 0x05: {
      const length = int32(buffer, offset);
      if (length < 0 || offset + 5 + length > end) throw invalid('binary size');
      const subType = buffer[offset + 4];
      const bytes = Buffer.from(buffer.subarray(offset + 5, offset + 5 + length));
      valueEnd = offset + 5 + length;
      return subType === 0 ? bytes : new Binary(bytes, subType);
    }
    case 0x06:
    case 0x0a:
      valueEnd = offset;
      return null;
    case 0x07:
      valueEnd = offset + 12;
      return ObjectId.fromBytes(buffer, offset);
    case 0x08:
      valueEnd = offset + 1;
      return buffer[offset] === 1;
    case 0x09:
      valueEnd = offset + 8;
      return new Date(int32(buffer, offset + 4) * TWO_32 + (int32(buffer, offset) >>> 0));
    case 0x0b: {
      const patternEnd = buffer.indexOf(0, offset);
      const flagsEnd = buffer.indexOf(0, patternEnd + 1);
      if (patternEnd === -1 || flagsEnd === -1 || flagsEnd > end) throw invalid('unterminated regex');
      const pattern = buffer.utf8Slice(offset, patternEnd);
      const flags = buffer.utf8Slice(patternEnd + 1, flagsEnd);
      valueEnd = flagsEnd + 1;
      try {
        return new RegExp(pattern, flags.replace(/[^imsu]/g, ''));
      } catch {
        return { $regex: pattern, $options: flags };
      }
    }
    case 0x10:
      valueEnd = offset + 4;
      return int32(buffer, offset);
    case 0x11:
      valueEnd = offset + 8;
      return new Timestamp(int32(buffer, offset) >>> 0, int32(buffer, offset + 4) >>> 0);
    case 0x12:
      valueEnd = offset + 8;
      return int64(buffer, offset);
    case 0x13:
      valueEnd = offset + 16;
      return new Decimal128(buffer.subarray(offset, offset + 16));
    case 0x7f:
      valueEnd = offset;
      return new MaxKey();
    case 0xff:
      valueEnd = offset;
      return new MinKey();
    default:
      throw new Error(`Unsupported BSON type 0x${type.toString(16)}`);
  }
}

// Documents of a reply share their keys, in the same order. The decoder keeps the sequences of keys it has seen as
// trees of shapes: following one, the key expected next is checked against the bytes (no hashing, no lookup), and a
// document whose shape has been seen before is made by a function compiled for it, which creates the object with
// all its properties at once (one hidden class, no transitions as properties are added). The documents in a field
// (address, the documents of a batch) have a tree of their own, so documents of different kinds do not mix.
class Shape {
  constructor(keys, key, keyBytes) {
    this.keys = keys;
    this.key = key;
    this.keyBytes = keyBytes;
    // The shape that came after this one last time.
    this.next = null;
    this.children = null;
    // The root of the shapes of the documents in this field (and of those in the arrays in it).
    this.nested = null;
    this.seen = 0;
    this.make = null;
  }
}

const MAX_SHAPES = 20000;
const MAX_SHAPE_KEYS = 64;
let shapeCount = 0;
const rootShape = new Shape([], '', null);

// The shape after `shape` with one more key, or null when there are too many shapes.
function childShape(shape, key, buffer, start, end) {
  let child = shape.children === null ? undefined : shape.children.get(key);
  if (child === undefined) {
    if (shapeCount >= MAX_SHAPES || shape.keys.length >= MAX_SHAPE_KEYS) return null;
    shapeCount += 1;
    // A copy of the bytes: a view would keep the whole reply in memory.
    child = new Shape([...shape.keys, key], key, Uint8Array.prototype.slice.call(buffer, start, end));
    if (shape.children === null) shape.children = new Map();
    shape.children.set(key, child);
  }
  shape.next = child;
  return child;
}

function nestedRoot(shape) {
  if (shape === null) return null;
  if (shape.nested === null) {
    if (shapeCount >= MAX_SHAPES) return null;
    shapeCount += 1;
    shape.nested = new Shape([], '', null);
  }
  return shape.nested;
}

// The function that makes the objects of a shape from their values, compiled the second time the shape is seen.
function compileShape(shape) {
  const { keys } = shape;
  // __proto__ in an object literal would set the prototype; such shapes are made property by property.
  if (keys.includes('__proto__')) return null;
  const properties = keys.map((key, i) => `${JSON.stringify(key)}: v[${i}]`).join(', ');
  // eslint-disable-next-line no-new-func
  return new Function('v', `return { ${properties} };`);
}

// The values and keys of the documents being decoded, by depth (reused).
const valueStack = [];
const keyStack = [];
let depth = 0;

function readArray(buffer, start, end, root) {
  const array = [];
  let offset = start + 4;
  while (offset < end) {
    const type = buffer[offset];
    let keyEnd = offset + 1;
    while (buffer[keyEnd] !== 0) {
      if (keyEnd >= end) throw invalid('unterminated key');
      keyEnd += 1;
    }
    array.push(readValue(buffer, type, keyEnd + 1, end, type === 0x04 ? nestedRoot(root) : root));
    offset = valueEnd;
  }
  if (offset !== end) throw invalid('element sizes');
  return array;
}

function readObject(buffer, start, end, root) {
  if (depth === valueStack.length) {
    valueStack.push([]);
    keyStack.push([]);
  }
  const values = valueStack[depth];
  const keys = keyStack[depth];
  depth += 1;
  let shape = root;
  let count = 0;
  let offset = start + 4;
  while (offset < end) {
    const type = buffer[offset];
    offset += 1;
    let key;
    let keyEnd = offset;
    // The key expected after the shape so far: its bytes, then a null.
    const next = shape === null ? null : shape.next;
    if (next !== null) {
      const expected = next.keyBytes;
      const { length } = expected;
      if (offset + length < end && buffer[offset + length] === 0) {
        let i = 0;
        while (i < length && expected[i] === buffer[offset + i]) i += 1;
        if (i === length) {
          key = next.key;
          keyEnd = offset + length;
          shape = next;
        }
      }
    }
    if (key === undefined) {
      let hash = 0;
      while (buffer[keyEnd] !== 0) {
        if (keyEnd >= end) throw invalid('unterminated key');
        hash = (Math.imul(hash, 31) + buffer[keyEnd]) | 0;
        keyEnd += 1;
      }
      key = cachedKey(buffer, offset, keyEnd, hash);
      if (shape !== null) shape = childShape(shape, key, buffer, offset, keyEnd);
    }
    const nested = type === 0x03 || type === 0x04 ? nestedRoot(shape) : null;
    values[count] = readValue(buffer, type, keyEnd + 1, end, nested);
    keys[count] = key;
    count += 1;
    offset = valueEnd;
  }
  if (offset !== end) throw invalid('element sizes');
  if (shape !== null && shape.make === null) {
    shape.seen += 1;
    if (shape.seen >= 2) shape.make = compileShape(shape) || undefined;
  }
  let doc;
  if (shape !== null && shape.make) doc = shape.make(values);
  else {
    doc = {};
    for (let i = 0; i < count; i += 1) {
      if (keys[i] === '__proto__') {
        Object.defineProperty(doc, '__proto__', {
          value: values[i],
          enumerable: true,
          writable: true,
          configurable: true,
        });
      } else doc[keys[i]] = values[i];
    }
  }
  // The values are not kept alive by the stack.
  for (let i = 0; i < count; i += 1) values[i] = undefined;
  depth -= 1;
  return doc;
}

function readDocument(buffer, start, isArray, root = rootShape) {
  const size = int32(buffer, start);
  const end = start + size - 1;
  if (size < 5 || end >= buffer.length || buffer[end] !== 0) throw invalid('document size');
  return isArray ? readArray(buffer, start, end, root) : readObject(buffer, start, end, root);
}

// The offset after a value, without decoding it.
function skipValue(buffer, type, offset) {
  switch (type) {
    case 0x01:
    case 0x09:
    case 0x11:
    case 0x12:
      return offset + 8;
    case 0x02:
    case 0x0d:
    case 0x0e:
      return offset + 4 + int32(buffer, offset);
    case 0x03:
    case 0x04:
      return offset + int32(buffer, offset);
    case 0x05:
      return offset + 5 + int32(buffer, offset);
    case 0x06:
    case 0x0a:
    case 0x7f:
    case 0xff:
      return offset;
    case 0x07:
      return offset + 12;
    case 0x08:
      return offset + 1;
    case 0x0b:
      return buffer.indexOf(0, buffer.indexOf(0, offset) + 1) + 1;
    case 0x10:
      return offset + 4;
    case 0x13:
      return offset + 16;
    default:
      return -1;
  }
}

// The value of cursor.id (a bigint) in the reply of a find, aggregate or getMore at an offset of a message, read
// without decoding the reply; null when there is none.
function cursorIdOf(buffer, start) {
  let end = start + int32(buffer, start) - 1;
  let offset = start + 4;
  let inCursor = false;
  while (offset > 0 && offset < end) {
    const type = buffer[offset];
    const keyEnd = buffer.indexOf(0, offset + 1);
    if (keyEnd === -1 || keyEnd >= end) return null;
    const keyLength = keyEnd - offset - 1;
    const valueStart = keyEnd + 1;
    if (!inCursor && type === 0x03 && keyLength === 6 && buffer.latin1Slice(offset + 1, keyEnd) === 'cursor') {
      end = valueStart + int32(buffer, valueStart) - 1;
      offset = valueStart + 4;
      inCursor = true;
      continue;
    }
    if (inCursor && keyLength === 2 && buffer[offset + 1] === 0x69 && buffer[offset + 2] === 0x64) {
      if (type === 0x12) return buffer.readBigInt64LE(valueStart);
      if (type === 0x10) return BigInt(int32(buffer, valueStart));
      return null;
    }
    offset = skipValue(buffer, type, valueStart);
  }
  return null;
}

function deserialize(buffer, offset = 0) {
  try {
    return readDocument(buffer, offset, false);
  } catch (err) {
    // The documents being decoded when it failed are left.
    depth = 0;
    throw err;
  }
}

export {
  serialize,
  serializeSections,
  deserialize,
  cursorIdOf,
  ObjectId,
  Binary,
  Timestamp,
  Decimal128,
  MinKey,
  MaxKey,
  Int32,
  Double,
};
