import { EMPTY_BUFFER } from './constants.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const FastBuffer = Buffer[Symbol.species];

/**
 * Merges an array of buffers into a new buffer.
 *
 * @param {Buffer[]} list The array of buffers to concat
 * @param {Number} totalLength The total length of buffers in the list
 * @return {Buffer} The resulting buffer
 * @public
 */
function concat(list, totalLength) {
  if (list.length === 0) return EMPTY_BUFFER;
  if (list.length === 1) return list[0];

  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (let i = 0; i < list.length; i++) {
    const buf = list[i];
    target.set(buf, offset);
    offset += buf.length;
  }

  if (offset < totalLength) {
    return new FastBuffer(target.buffer, target.byteOffset, offset);
  }

  return target;
}

/**
 * Masks a buffer using the given mask.
 *
 * @param {Buffer} source The buffer to mask
 * @param {Buffer} mask The mask to use
 * @param {Buffer} output The buffer where to store the result
 * @param {Number} offset The offset at which to start writing
 * @param {Number} length The number of bytes to mask.
 * @public
 */
function _mask(source, mask, output, offset, length) {
  if (length >= WORDS_FROM) {
    // Copied (native), then masked in place 8 bytes at a time.
    output.set(source.length === length ? source : source.subarray(0, length), offset);
    unmaskWords(output.subarray(offset, offset + length), mask);
    return;
  }
  for (let i = 0; i < length; i++) {
    output[offset + i] = source[i] ^ mask[i & 3];
  }
}

// Masking 8 bytes at a time (BigUint64Array), not one: about 10 times faster than the loop of ws from a few hundred
// bytes; below, the loop is faster. The native bufferutil, when the application has installed it, is about 4 times
// faster still (used then, as ws does, below). bench/micro/websocket.js measures it.
const WORDS_FROM = 384;

function unmaskWords(buffer, mask) {
  const length = buffer.length;
  const offset = buffer.byteOffset;
  let i = 0;
  // The bytes before the first word aligned to 8 bytes.
  while (i < length && (offset + i) % 8 !== 0) {
    buffer[i] ^= mask[i & 3];
    i++;
  }
  const count = (length - i) >>> 3;
  if (count > 0) {
    // The mask, turned to start at byte i, twice: a word of 8 bytes.
    const bytes = new Uint8Array(8);
    for (let j = 0; j < 8; j++) bytes[j] = mask[(i + j) & 3];
    const word = new BigUint64Array(bytes.buffer)[0];
    const words = new BigUint64Array(buffer.buffer, offset + i, count);
    for (let k = 0; k < count; k++) words[k] ^= word;
    i += count * 8;
  }
  for (; i < length; i++) buffer[i] ^= mask[i & 3];
}

/**
 * Unmasks a buffer using the given mask.
 *
 * @param {Buffer} buffer The buffer to unmask
 * @param {Buffer} mask The mask to use
 * @public
 */
function _unmask(buffer, mask) {
  if (buffer.length >= WORDS_FROM) {
    unmaskWords(buffer, mask);
    return;
  }
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] ^= mask[i & 3];
  }
}

/**
 * Converts a buffer to an `ArrayBuffer`.
 *
 * @param {Buffer} buf The buffer to convert
 * @return {ArrayBuffer} Converted buffer
 * @public
 */
function toArrayBuffer(buf) {
  if (buf.length === buf.buffer.byteLength) {
    return buf.buffer;
  }

  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
}

/**
 * Converts `data` to a `Buffer`.
 *
 * @param {*} data The data to convert
 * @return {Buffer} The buffer
 * @throws {TypeError}
 * @public
 */
function toBuffer(data) {
  toBuffer.readOnly = true;

  if (Buffer.isBuffer(data)) return data;

  let buf;

  if (data instanceof ArrayBuffer) {
    buf = new FastBuffer(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data);
    toBuffer.readOnly = false;
  }

  return buf;
}

export const js = { mask: _mask, unmask: _unmask };
let mask = _mask;
let unmask = _unmask;
let native = false;

// bufferutil is not a dependency: it is used when the application has installed it, as ws does, unless
// WS_NO_BUFFER_UTIL is set. Below the sizes of ws, the call to the add-on costs more than the loop.
if (!process.env.WS_NO_BUFFER_UTIL) {
  try {
    const bufferUtil = require('bufferutil');

    mask = function (source, key, output, offset, length) {
      if (length < 48) _mask(source, key, output, offset, length);
      else bufferUtil.mask(source, key, output, offset, length);
    };

    unmask = function (buffer, key) {
      if (buffer.length < 32) _unmask(buffer, key);
      else bufferUtil.unmask(buffer, key);
    };

    native = true;
  } catch {
    // Not installed: the masking of JavaScript.
  }
}

export { concat, mask, toArrayBuffer, toBuffer, unmask, native };
