// The binary format of the types whose values the server writes and reads faster in it than in text (numbers,
// booleans, dates, bytea, uuid): results of prepared statements come in it, and parameters go in it when their
// type is known (from the description of the statement) and the value is of that type. They give the same values as
// the text format (types.js).

const TWO_32 = 4294967296;
// Microseconds and days of PostgreSQL count from 2000-01-01.
const EPOCH_2000 = 946684800000;
const DAY = 86400000;

function int64(buffer, start) {
  const high = buffer.readInt32BE(start);
  const low = buffer.readUInt32BE(start + 4);
  if (high >= -0x200000 && high <= 0x200000) {
    const value = high * TWO_32 + low;
    if (Number.isSafeInteger(value)) return value;
  }
  return buffer.readBigInt64BE(start);
}

function isInfinity(buffer, start) {
  // 0x7fffffffffffffff and 0x8000000000000000.
  const high = buffer.readInt32BE(start);
  const low = buffer.readUInt32BE(start + 4);
  if (high === 0x7fffffff && low === 0xffffffff) return 1;
  if (high === -0x80000000 && low === 0) return -1;
  return 0;
}

// Milliseconds since 1970 of microseconds since 2000 (exact for every date of a Date).
function millis(buffer, start) {
  const micros = buffer.readInt32BE(start) * TWO_32 + buffer.readUInt32BE(start + 4);
  return Math.floor(micros / 1000) + EPOCH_2000;
}

function timestamptz(buffer, start) {
  const infinity = isInfinity(buffer, start);
  if (infinity !== 0) return infinity * Infinity;
  return new Date(millis(buffer, start));
}

// A timestamp without time zone is the local Date of its wall time (as in the text format).
function localTimestamp(buffer, start) {
  const infinity = isInfinity(buffer, start);
  if (infinity !== 0) return infinity * Infinity;
  const wall = new Date(millis(buffer, start));
  const date = new Date(
    2000,
    wall.getUTCMonth(),
    wall.getUTCDate(),
    wall.getUTCHours(),
    wall.getUTCMinutes(),
    wall.getUTCSeconds(),
    wall.getUTCMilliseconds()
  );
  date.setFullYear(wall.getUTCFullYear());
  return date;
}

function date(buffer, start) {
  const days = buffer.readInt32BE(start);
  if (days === 0x7fffffff) return Infinity;
  if (days === -0x80000000) return -Infinity;
  const wall = new Date(EPOCH_2000 + days * DAY);
  const local = new Date(2000, wall.getUTCMonth(), wall.getUTCDate());
  local.setFullYear(wall.getUTCFullYear());
  return local;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function uuid(buffer, start) {
  let result = '';
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) result += '-';
    result += HEX[buffer[start + i]];
  }
  return result;
}

const resultParsers = new Map([
  [16, (buffer, start) => buffer[start] === 1],
  [17, (buffer, start, end) => Buffer.from(buffer.subarray(start, end))],
  [20, int64],
  [21, (buffer, start) => buffer.readInt16BE(start)],
  [23, (buffer, start) => buffer.readInt32BE(start)],
  [26, (buffer, start) => buffer.readUInt32BE(start)],
  [700, (buffer, start) => buffer.readFloatBE(start)],
  [701, (buffer, start) => buffer.readDoubleBE(start)],
  [1082, date],
  [1114, localTimestamp],
  [1184, timestamptz],
  [2950, uuid],
]);

// Writers of parameters: they write the value (after its length) in the binary format and give true, or give false
// when the value is not of the type (it is then sent as text, and the server converts it or fails as with text).
function writeInt64(writer, value) {
  if (typeof value === 'bigint') {
    if (value < -(2n ** 63n) || value >= 2n ** 63n) return false;
    writer.int32(8);
    writer.ensure(8);
    writer.buffer.writeBigInt64BE(value, writer.offset);
    writer.offset += 8;
    return true;
  }
  if (!Number.isSafeInteger(value)) return false;
  const high = Math.floor(value / TWO_32);
  writer.int32(8).int32(high);
  writer.ensure(4);
  writer.buffer.writeUInt32BE(value - high * TWO_32, writer.offset);
  writer.offset += 4;
  return true;
}

function writeMicros(writer, value) {
  if (!(value instanceof Date)) return false;
  const time = value.getTime();
  if (Number.isNaN(time)) return false;
  return writeInt64(writer, (time - EPOCH_2000) * 1000);
}

const paramWriters = new Map([
  [
    16,
    (writer, value) => {
      if (typeof value !== 'boolean') return false;
      writer.int32(1).byte(value ? 1 : 0);
      return true;
    },
  ],
  [20, (writer, value) => (typeof value === 'number' || typeof value === 'bigint') && writeInt64(writer, value)],
  [
    21,
    (writer, value) => {
      if (!Number.isInteger(value) || value < -32768 || value > 32767) return false;
      writer.int32(2).int16(value);
      return true;
    },
  ],
  [
    23,
    (writer, value) => {
      if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) return false;
      writer.int32(4).int32(value);
      return true;
    },
  ],
  [
    701,
    (writer, value) => {
      if (typeof value !== 'number') return false;
      writer.int32(8);
      writer.ensure(8);
      writer.buffer.writeDoubleBE(value, writer.offset);
      writer.offset += 8;
      return true;
    },
  ],
  [1114, writeMicros],
  [1184, writeMicros],
]);

module.exports = { resultParsers, paramWriters };
