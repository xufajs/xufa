// The values of PostgreSQL in JavaScript. Results come in the text format; each type is parsed from the bytes of
// its value (buffer, start, end), numbers and dates without making a string first. As in pg: numeric is a string,
// date and timestamp (without time zone) are local Dates, and the types not known are strings. Unlike pg, int8 is
// a number when it is a safe integer (a bigint otherwise).

const MINUS = 0x2d;

function text(buffer, start, end) {
  const length = end - start;
  if (length <= 48) {
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

function int(buffer, start, end) {
  let i = start;
  const negative = buffer[i] === MINUS;
  if (negative) i += 1;
  let value = 0;
  for (; i < end; i += 1) value = value * 10 + (buffer[i] - 48);
  return negative ? -value : value;
}

function int8(buffer, start, end) {
  // 15 digits are always a safe integer.
  if (end - start <= 15) return int(buffer, start, end);
  const value = BigInt(buffer.latin1Slice(start, end));
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value;
}

function float(buffer, start, end) {
  return Number(buffer.latin1Slice(start, end));
}

function bool(buffer, start) {
  return buffer[start] === 0x74;
}

function json(buffer, start, end) {
  return JSON.parse(buffer.utf8Slice(start, end));
}

function bytea(buffer, start, end) {
  // The hex format: \x then two hex digits by byte.
  if (buffer[start] === 0x5c && buffer[start + 1] === 0x78)
    return Buffer.from(buffer.latin1Slice(start + 2, end), 'hex');
  return Buffer.from(buffer.latin1Slice(start, end), 'latin1');
}

function digits(buffer, start, count) {
  let value = 0;
  for (let i = start; i < start + count; i += 1) value = value * 10 + (buffer[i] - 48);
  return value;
}

// A date or a timestamp in the ISO format: YYYY-MM-DD[ HH:MM:SS[.ffffff]][+HH[:MM[:SS]]][ BC]. Times without a
// zone are local, as in pg; infinity is Infinity.
function timestamp(buffer, start, end, withZone) {
  if (buffer[start] === 0x69) return Infinity;
  if (buffer[start] === MINUS && buffer[start + 1] === 0x69) return -Infinity;
  let i = start;
  while (i < end && buffer[i] !== MINUS) i += 1;
  let year = digits(buffer, start, i - start);
  const month = digits(buffer, i + 1, 2) - 1;
  const day = digits(buffer, i + 4, 2);
  i += 6;
  let hour = 0;
  let minute = 0;
  let second = 0;
  let ms = 0;
  if (i < end && buffer[i] === 0x20 && buffer[i + 1] !== 0x42) {
    hour = digits(buffer, i + 1, 2);
    minute = digits(buffer, i + 4, 2);
    second = digits(buffer, i + 7, 2);
    i += 9;
    if (buffer[i] === 0x2e) {
      // Fractions of a second: milliseconds from the first three digits.
      let fraction = 0;
      let scale = 100;
      i += 1;
      while (i < end && buffer[i] >= 48 && buffer[i] <= 57) {
        fraction += (buffer[i] - 48) * scale;
        scale /= 10;
        i += 1;
      }
      ms = Math.floor(fraction);
    }
  }
  let offset = null;
  if (i < end && (buffer[i] === 0x2b || buffer[i] === MINUS)) {
    const sign = buffer[i] === MINUS ? -1 : 1;
    offset = digits(buffer, i + 1, 2) * 3600;
    i += 3;
    if (buffer[i] === 0x3a) {
      offset += digits(buffer, i + 1, 2) * 60;
      i += 3;
      if (buffer[i] === 0x3a) {
        offset += digits(buffer, i + 1, 2);
        i += 3;
      }
    }
    offset *= sign;
  }
  // Years BC: 1 BC is the year 0.
  if (end - start > 3 && buffer[end - 2] === 0x42 && buffer[end - 1] === 0x43) year = 1 - year;
  let date;
  if (withZone || offset !== null) {
    date = new Date(Date.UTC(2000, month, day, hour, minute, second, ms) - (offset || 0) * 1000);
    date.setUTCFullYear(year + (date.getUTCFullYear() - 2000));
  } else {
    date = new Date(2000, month, day, hour, minute, second, ms);
    date.setFullYear(year + (date.getFullYear() - 2000));
  }
  return date;
}

const timestamptz = (buffer, start, end) => timestamp(buffer, start, end, true);
const localTimestamp = (buffer, start, end) => timestamp(buffer, start, end, false);

// Arrays: {1,2,NULL,"a \"b\""}, of any number of dimensions, read from the bytes: each element is given to the parser
// of its type where it is (only elements with escapes are copied, without them).
function arrayOf(element) {
  return (buffer, start, end) => {
    let i = start;
    // A bound decoration ([1:3]={...}) is skipped.
    if (buffer[i] === 0x5b) i = buffer.indexOf(0x3d, i) + 1;
    const parse = () => {
      const result = [];
      i += 1;
      while (i < end) {
        const byte = buffer[i];
        if (byte === 0x7d) {
          i += 1;
          return result;
        }
        if (byte === 0x2c) {
          i += 1;
        } else if (byte === 0x7b) {
          result.push(parse());
        } else if (byte === 0x22) {
          i += 1;
          const from = i;
          let escapes = 0;
          while (buffer[i] !== 0x22) {
            if (buffer[i] === 0x5c) {
              escapes += 1;
              i += 1;
            }
            i += 1;
          }
          if (escapes === 0) result.push(element(buffer, from, i));
          else {
            const bytes = Buffer.allocUnsafe(i - from - escapes);
            let length = 0;
            for (let j = from; j < i; j += 1) {
              if (buffer[j] === 0x5c) j += 1;
              bytes[length] = buffer[j];
              length += 1;
            }
            result.push(element(bytes, 0, length));
          }
          i += 1;
        } else {
          const from = i;
          while (i < end && buffer[i] !== 0x2c && buffer[i] !== 0x7d) i += 1;
          // NULL unquoted is null ("NULL" quoted is the string).
          const isNull =
            i - from === 4 &&
            buffer[from] === 0x4e &&
            buffer[from + 1] === 0x55 &&
            buffer[from + 2] === 0x4c &&
            buffer[from + 3] === 0x4c;
          result.push(isNull ? null : element(buffer, from, i));
        }
      }
      return result;
    };
    return parse();
  };
}

const parsers = new Map([
  [16, bool],
  [17, bytea],
  [20, int8],
  [21, int],
  [23, int],
  [26, int],
  [700, float],
  [701, float],
  [114, json],
  [3802, json],
  [1082, localTimestamp],
  [1114, localTimestamp],
  [1184, timestamptz],
]);
const ARRAYS = [
  [1000, 16],
  [1001, 17],
  [1016, 20],
  [1005, 21],
  [1007, 23],
  [1028, 26],
  [1021, 700],
  [1022, 701],
  [199, 114],
  [3807, 3802],
  [1182, 1082],
  [1115, 1114],
  [1185, 1184],
  [1009, 25],
  [1015, 1043],
  [1014, 1042],
  [2951, 2950],
  [1231, 1700],
];
ARRAYS.forEach(([array, element]) => parsers.set(array, arrayOf(parsers.get(element) || text)));

// The parser of a type: one of `custom` (by oid, functions of the text of a value, as pg's setTypeParser), or of
// the types known, or text.
function parserOf(oid, custom) {
  if (custom && custom.has(oid)) {
    const fn = custom.get(oid);
    return (buffer, start, end) => fn(buffer.utf8Slice(start, end));
  }
  return parsers.get(oid) || text;
}

// Parameters: values in the text format (strings), or Buffers for bytea, or null.
function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function dateToText(date) {
  if (Number.isNaN(date.getTime())) throw new TypeError('Invalid Date given as a parameter');
  // UTC with its offset: the same instant for timestamptz (timestamp without time zone takes the UTC time).
  let year = date.getUTCFullYear();
  const bc = year < 1;
  if (bc) year = 1 - year;
  return (
    `${pad(year, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:` +
    `${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}+00:00${bc ? ' BC' : ''}`
  );
}

function arrayElement(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return arrayToText(value);
  const textValue = paramToText(value);
  const string = Buffer.isBuffer(textValue) ? `\\x${textValue.toString('hex')}` : textValue;
  return `"${string.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function arrayToText(array) {
  return `{${array.map(arrayElement).join(',')}}`;
}

function paramToText(value) {
  if (value === null || value === undefined) return null;
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
      return String(value);
    case 'boolean':
      return value ? 'true' : 'false';
    default:
      break;
  }
  if (value instanceof Date) return dateToText(value);
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  // toPostgres() first: classes of values that extend Array (ranges, multiranges...) say their own text.
  if (typeof value.toPostgres === 'function') return paramToText(value.toPostgres());
  if (Array.isArray(value)) return arrayToText(value);
  return JSON.stringify(value);
}

// SQL identifiers and literals written in a text, as pg (and libpq) escape them. PostgreSQL has no null character in
// them: a text with one is refused.
function refuseNull(value) {
  const text = String(value);
  if (text.includes('\u0000')) {
    throw new TypeError('Identifiers and literals of PostgreSQL cannot contain null characters');
  }
  return text;
}

function escapeIdentifier(value) {
  return `"${refuseNull(value).replace(/"/g, '""')}"`;
}

// A string literal: quotes doubled; with backslashes, an E'' string whose backslashes are doubled too.
function escapeLiteral(value) {
  const text = refuseNull(value);
  const escaped = text.replace(/'/g, "''");
  if (!text.includes('\\')) return `'${escaped}'`;
  return ` E'${escaped.replace(/\\/g, '\\\\')}'`;
}

module.exports = { parsers, parserOf, paramToText, text, timestamp, arrayOf, escapeIdentifier, escapeLiteral };
