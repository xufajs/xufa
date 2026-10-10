// The messages a client sends (protocol 3.0), written into a growing buffer: the messages of a query go to the
// socket in one write.

// Strings longer than this are measured before they are written.
const LARGE = 64 * 1024;

class Writer {
  constructor(size = 16 * 1024) {
    this.buffer = Buffer.allocUnsafeSlow(size);
    this.offset = 0;
    this.messageStart = -1;
  }

  ensure(size) {
    if (this.offset + size <= this.buffer.length) return;
    let length = this.buffer.length * 2;
    while (length < this.offset + size) length *= 2;
    const buffer = Buffer.allocUnsafeSlow(length);
    this.buffer.copy(buffer, 0, 0, this.offset);
    this.buffer = buffer;
  }

  // Starts a message of a type (a char code; 0 for the startup messages, which have none).
  start(type) {
    this.ensure(5);
    if (type) {
      this.buffer[this.offset] = type;
      this.offset += 1;
    }
    this.messageStart = this.offset;
    this.offset += 4;
    return this;
  }

  // Ends the message: its length (after the type, with itself).
  end() {
    this.buffer.writeInt32BE(this.offset - this.messageStart, this.messageStart);
    return this;
  }

  int16(value) {
    this.ensure(2);
    this.buffer[this.offset] = value >>> 8;
    this.buffer[this.offset + 1] = value;
    this.offset += 2;
    return this;
  }

  int32(value) {
    this.ensure(4);
    this.buffer.writeInt32BE(value, this.offset);
    this.offset += 4;
    return this;
  }

  byte(value) {
    this.ensure(1);
    this.buffer[this.offset] = value;
    this.offset += 1;
    return this;
  }

  cstring(value) {
    // A null would end the string early, and the server would read the rest of the message wrongly.
    if (value.includes('\u0000')) throw new TypeError('Queries and names cannot contain a null character');
    const length = Buffer.byteLength(value);
    this.ensure(length + 1);
    this.buffer.utf8Write(value, this.offset);
    this.offset += length;
    this.buffer[this.offset] = 0;
    this.offset += 1;
    return this;
  }

  // A string as the bytes of a value: its UTF-8 bytes after their number (int32).
  lengthString(value) {
    // Room for the longest UTF-8 of short strings; large ones are measured (not three times their size in memory).
    const room = value.length > LARGE ? Buffer.byteLength(value) + 4 : value.length * 3 + 4;
    this.ensure(room);
    const start = this.offset;
    let length;
    if (value.length <= 48) {
      // Short ASCII strings char by char (no call into C++).
      let i = 0;
      for (; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        if (code >= 0x80) break;
        this.buffer[start + 4 + i] = code;
      }
      length = i === value.length ? i : this.buffer.utf8Write(value, start + 4);
    } else length = this.buffer.utf8Write(value, start + 4);
    this.buffer.writeInt32BE(length, start);
    this.offset = start + 4 + length;
    return this;
  }

  lengthBytes(bytes) {
    this.ensure(bytes.length + 4);
    this.buffer.writeInt32BE(bytes.length, this.offset);
    this.buffer.set(bytes, this.offset + 4);
    this.offset += 4 + bytes.length;
    return this;
  }

  bytes(bytes) {
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
    return this;
  }

  // The messages written, copied out (the buffer is reused); a buffer grown past 1 MB (large values) is given as it is,
  // without a copy, and a new one is used.
  flush() {
    if (this.buffer.length > 1024 * 1024) {
      const result = this.buffer.subarray(0, this.offset);
      this.buffer = Buffer.allocUnsafeSlow(16 * 1024);
      this.offset = 0;
      return result;
    }
    const result = Buffer.allocUnsafe(this.offset);
    this.buffer.copy(result, 0, 0, this.offset);
    this.offset = 0;
    return result;
  }
}

export { Writer };
