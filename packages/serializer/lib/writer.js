// The output of the generated serializers: UTF-8 bytes written to one buffer, read back as a string at the end.
//
// Joining strings with + makes a tree of them that V8 copies into a flat string when the result is used (written to a
// socket, measured): for a response of a few KB that copy costs as much as building it. Bytes in a buffer need one
// read at the end, which is a copy at memory speed.
//
// The buffer is shared by every serializer. A serialization starts where the buffer is filled up to (begin()) and
// gives that place back when it ends (end() or abort()), so that a serializer called while another one writes (by a
// toJSON() method) writes after it and leaves it as it was.

const INITIAL_SIZE = 64 * 1024;
// A buffer grown beyond this for a large response is replaced by a small one when nothing is being written.
const KEEP_SIZE = 1024 * 1024;
// Strings longer than this are checked by a regular expression and encoded by Buffer#utf8Write (native code), which
// is faster for long strings and slower for short ones than the loop of writeString.
const LONG_STRING = 64;

// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;
const HEX = '0123456789abcdef';

let buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
let pos = 0;

function grow(needed) {
  const next = Buffer.allocUnsafeSlow(Math.max(buf.length * 2, pos + needed));
  buf.copy(next, 0, 0, pos);
  buf = next;
}

function begin() {
  return pos;
}

// The string written since `start`; the buffer is given back.
function end(start) {
  const text = buf.utf8Slice(start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return text;
}

// The bytes written since `start`, in a buffer of their own (the shared one is written again by the next
// serialization, before a socket may have sent them); the buffer is given back.
function endBuffer(start) {
  const out = Buffer.allocUnsafe(pos - start);
  buf.copy(out, 0, start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return out;
}

function abort(start) {
  pos = start;
}

// Bytes known when the serializer was compiled (keys, punctuation), as a Uint8Array.
function writeBytes(bytes) {
  const n = bytes.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = bytes[i];
  pos += n;
}

function writeByte(byte) {
  if (pos === buf.length) grow(1);
  buf[pos] = byte;
  pos += 1;
}

// Text that is JSON already (from JSON.stringify, a date formatter, a number): written as UTF-8.
function writeRaw(text) {
  const n = text.length;
  if (n < LONG_STRING) {
    if (pos + n * 3 > buf.length) grow(n * 3);
    let p = pos;
    for (let i = 0; i < n; i += 1) {
      const c = text.charCodeAt(i);
      if (c >= 128) {
        pos += buf.utf8Write(text, pos, buf.length - pos);
        return;
      }
      buf[p] = c;
      p += 1;
    }
    pos = p;
    return;
  }
  if (pos + n * 3 > buf.length) grow(n * 3);
  pos += buf.utf8Write(text, pos, buf.length - pos);
}

// A number written as JSON writes it (finite ones only: the callers check).
function writeNumberText(text) {
  const n = text.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = text.charCodeAt(i);
  pos += n;
}

function writeEscapedUnit(p, c) {
  buf[p] = 92;
  switch (c) {
    case 34:
      buf[p + 1] = 34;
      return p + 2;
    case 92:
      buf[p + 1] = 92;
      return p + 2;
    case 8:
      buf[p + 1] = 98;
      return p + 2;
    case 12:
      buf[p + 1] = 102;
      return p + 2;
    case 10:
      buf[p + 1] = 110;
      return p + 2;
    case 13:
      buf[p + 1] = 114;
      return p + 2;
    case 9:
      buf[p + 1] = 116;
      return p + 2;
    default:
      // \u00XX for the other control characters, \udXXX for lone surrogates: what JSON.stringify writes.
      buf[p + 1] = 117;
      buf[p + 2] = HEX.charCodeAt(c >> 12);
      buf[p + 3] = HEX.charCodeAt((c >> 8) & 15);
      buf[p + 4] = HEX.charCodeAt((c >> 4) & 15);
      buf[p + 5] = HEX.charCodeAt(c & 15);
      return p + 6;
  }
}

// A string, quoted and escaped as JSON.stringify does it, as UTF-8.
function writeString(text) {
  const n = text.length;
  if (n > LONG_STRING) {
    writeLongString(text);
    return;
  }
  // At most 6 bytes a UTF-16 unit (an escape), and the quotes.
  if (pos + n * 6 + 2 > buf.length) grow(n * 6 + 2);
  let p = pos;
  buf[p] = 34;
  p += 1;
  for (let i = 0; i < n; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      if (c >= 32 && c !== 34 && c !== 92) {
        buf[p] = c;
        p += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    } else if (c < 0x800) {
      buf[p] = 0xc0 | (c >> 6);
      buf[p + 1] = 0x80 | (c & 63);
      p += 2;
    } else if (c < 0xd800 || c > 0xdfff) {
      buf[p] = 0xe0 | (c >> 12);
      buf[p + 1] = 0x80 | ((c >> 6) & 63);
      buf[p + 2] = 0x80 | (c & 63);
      p += 3;
    } else {
      const next = i + 1 < n ? text.charCodeAt(i + 1) : 0;
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        // A surrogate pair: one code point of 4 bytes.
        const point = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        buf[p] = 0xf0 | (point >> 18);
        buf[p + 1] = 0x80 | ((point >> 12) & 63);
        buf[p + 2] = 0x80 | ((point >> 6) & 63);
        buf[p + 3] = 0x80 | (point & 63);
        p += 4;
        i += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    }
  }
  buf[p] = 34;
  pos = p + 1;
}

function writeLongString(text) {
  if (NEEDS_ESCAPE.test(text)) {
    writeRaw(JSON.stringify(text));
    return;
  }
  const n = text.length;
  if (pos + n * 3 + 2 > buf.length) grow(n * 3 + 2);
  buf[pos] = 34;
  pos += 1;
  pos += buf.utf8Write(text, pos, buf.length - pos);
  buf[pos] = 34;
  pos += 1;
}

// The bytes of a literal of the generated code.
function bytesOf(text) {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

module.exports = {
  begin,
  end,
  endBuffer,
  abort,
  writeBytes,
  writeByte,
  writeRaw,
  writeNumberText,
  writeString,
  bytesOf,
};
