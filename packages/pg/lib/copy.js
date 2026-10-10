// COPY of rows: copyRows(connection, table, columns, rows) loads rows (arrays, or objects by column) with
// COPY ... FROM STDIN. The types of the columns are read from the table, and the rows are written in the binary
// format of COPY when every column has a binary encoder here (the server then parses nothing), and in the text format
// otherwise.
import { paramToText } from './types.js';
import { Writer } from './writer.js';

const TWO_32 = 4294967296;
const EPOCH_2000 = 946684800000;
const DAY = 86400000;
// The data is sent in CopyData messages of about this size.
const CHUNK = 256 * 1024;
const SIGNATURE = Buffer.from('PGCOPY\n\xff\r\n\0', 'latin1');

function quoteIdentifier(name) {
  return String(name)
    .split('.')
    .map((part) => `"${part.replace(/"/g, '""')}"`)
    .join('.');
}

function fail(column, value, type) {
  return new TypeError(`Cannot copy ${JSON.stringify(String(value))} to the ${type} column ${column}`);
}

// Binary encoders: (writer, value, column) write the value with its length. They take the values of their type and
// the strings of them.
function toNumber(value, column, type) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || Number.isNaN(number)) {
    if (type === 'float' && typeof number === 'number') return number;
    throw fail(column, value, type);
  }
  return number;
}

function toInteger(value, column, min, max) {
  const number = toNumber(value, column, 'integer');
  if (!Number.isInteger(number) || number < min || number > max) throw fail(column, value, 'integer');
  return number;
}

function writeInt64(writer, value, column) {
  let big = value;
  if (typeof big !== 'bigint') {
    const number =
      typeof big === 'string' && /^-?\d+$/.test(big) ? BigInt(big) : toInteger(big, column, -(2 ** 53), 2 ** 53);
    big = typeof number === 'bigint' ? number : null;
    if (big === null) {
      const high = Math.floor(number / TWO_32);
      writer.int32(8).int32(high);
      writer.ensure(4);
      writer.buffer.writeUInt32BE(number - high * TWO_32, writer.offset);
      writer.offset += 4;
      return;
    }
  }
  writer.int32(8);
  writer.ensure(8);
  writer.buffer.writeBigInt64BE(big, writer.offset);
  writer.offset += 8;
}

function toDate(value, column) {
  const date = value instanceof Date ? value : new Date(value);
  if (typeof value === 'boolean' || Number.isNaN(date.getTime())) throw fail(column, value, 'date');
  return date;
}

function writeMicros(writer, value, column) {
  if (value === Infinity || value === 'infinity') {
    writer.int32(8).int32(0x7fffffff).int32(-1);
    return;
  }
  if (value === -Infinity || value === '-infinity') {
    writer.int32(8).int32(-0x80000000).int32(0);
    return;
  }
  writeInt64(writer, (toDate(value, column).getTime() - EPOCH_2000) * 1000, column);
}

function writeBytes(writer, bytes) {
  writer.lengthBytes(bytes);
}

function writeText(writer, value) {
  writer.lengthString(typeof value === 'string' ? value : String(value));
}

function jsonText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const encoders = new Map([
  [
    16,
    (writer, value, column) => {
      let bool = value;
      if (typeof value === 'string') bool = { t: true, true: true, f: false, false: false }[value.toLowerCase()];
      if (typeof bool !== 'boolean') throw fail(column, value, 'boolean');
      writer.int32(1).byte(bool ? 1 : 0);
    },
  ],
  [
    17,
    (writer, value, column) => {
      if (!(value instanceof Uint8Array)) throw fail(column, value, 'bytea');
      writeBytes(writer, value);
    },
  ],
  [20, writeInt64],
  [21, (writer, value, column) => writer.int32(2).int16(toInteger(value, column, -32768, 32767))],
  [23, (writer, value, column) => writer.int32(4).int32(toInteger(value, column, -2147483648, 2147483647))],
  [
    700,
    (writer, value, column) => {
      writer.int32(4);
      writer.ensure(4);
      writer.buffer.writeFloatBE(toNumber(value, column, 'float'), writer.offset);
      writer.offset += 4;
    },
  ],
  [
    701,
    (writer, value, column) => {
      writer.int32(8);
      writer.ensure(8);
      writer.buffer.writeDoubleBE(toNumber(value, column, 'float'), writer.offset);
      writer.offset += 8;
    },
  ],
  [25, writeText],
  [1043, writeText],
  [1042, writeText],
  [19, writeText],
  [114, (writer, value) => writer.lengthString(jsonText(value))],
  [
    3802,
    (writer, value) => {
      // jsonb: a version (1) then the text of the JSON.
      writer.lengthString(`\u0001${jsonText(value)}`);
    },
  ],
  [
    1082,
    (writer, value, column) => {
      // The local day of a Date (as a date parameter), or the day of a string YYYY-MM-DD.
      let days;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        days =
          (Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10))) -
            EPOCH_2000) /
          DAY;
      } else {
        const date = toDate(value, column);
        days = (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_2000) / DAY;
      }
      writer.int32(4).int32(days);
    },
  ],
  [1114, writeMicros],
  [1184, writeMicros],
  [
    2950,
    (writer, value, column) => {
      const hex = typeof value === 'string' ? value.replace(/-/g, '') : '';
      if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw fail(column, value, 'uuid');
      writeBytes(writer, Buffer.from(hex, 'hex'));
    },
  ],
]);

// Arrays (of any number of dimensions, rectangular) of the element types above.
const ARRAY_ELEMENTS = new Map([
  [1000, 16],
  [1001, 17],
  [1016, 20],
  [1005, 21],
  [1007, 23],
  [1021, 700],
  [1022, 701],
  [1009, 25],
  [1015, 1043],
  [1014, 1042],
  [199, 114],
  [3807, 3802],
  [1182, 1082],
  [1115, 1114],
  [1185, 1184],
  [2951, 2950],
]);

function arrayEncoder(elementType) {
  const encode = encoders.get(elementType);
  return (writer, value, column) => {
    if (!Array.isArray(value)) throw fail(column, value, 'array');
    const dimensions = [];
    for (let level = value; Array.isArray(level); level = level[0]) dimensions.push(level.length);
    const elements = dimensions.length > 1 ? value.flat(dimensions.length - 1) : value;
    const lengthAt = writer.offset;
    writer.int32(0);
    const start = writer.offset;
    writer.int32(elements.length === 0 ? 0 : dimensions.length);
    writer.int32(elements.some((element) => element === null || element === undefined) ? 1 : 0);
    writer.int32(elementType);
    if (elements.length > 0) dimensions.forEach((size) => writer.int32(size).int32(1));
    elements.forEach((element) => {
      if (element === null || element === undefined) writer.int32(-1);
      else encode(writer, element, column);
    });
    writer.buffer.writeInt32BE(writer.offset - start, lengthAt);
  };
}
ARRAY_ELEMENTS.forEach((element, array) => encoders.set(array, arrayEncoder(element)));

// The text format: values tab separated, rows ended by a newline, nulls as \N, and backslashes, tabs and newlines
// escaped.
function textValue(value) {
  if (value === null || value === undefined) return '\\N';
  let text = paramToText(value);
  if (Buffer.isBuffer(text)) text = `\\x${text.toString('hex')}`;
  if (!/[\\\t\n\r]/.test(text)) return text;
  return text.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

// The values of a row in the order of the columns.
function valuesOf(row, columns) {
  if (Array.isArray(row)) return row;
  return columns.map((column) => row[column]);
}

// The data of the rows, in chunks of about CHUNK bytes, binary when `types` all have an encoder.
function* encodeRows(rows, columns, types) {
  const binary = types.every((type) => encoders.has(type));
  const writer = new Writer(CHUNK * 2);
  if (binary) writer.bytes(SIGNATURE).int32(0).int32(0);
  const encodersOf = binary ? types.map((type) => encoders.get(type)) : null;
  for (const row of rows) {
    const values = valuesOf(row, columns);
    if (values.length !== columns.length) {
      throw new TypeError(`A row has ${values.length} values for ${columns.length} columns`);
    }
    if (binary) {
      writer.int16(columns.length);
      for (let i = 0; i < columns.length; i += 1) {
        const value = values[i];
        if (value === null || value === undefined) writer.int32(-1);
        else encodersOf[i](writer, value, columns[i]);
      }
    } else {
      const line = `${values.map(textValue).join('\t')}\n`;
      writer.ensure(line.length * 3);
      writer.offset += writer.buffer.utf8Write(line, writer.offset);
    }
    if (writer.offset >= CHUNK) yield writer.flush();
  }
  if (binary) writer.int16(-1);
  if (writer.offset > 0) yield writer.flush();
}

// Loads rows into a table with COPY: gives the number of rows copied. `connection` runs queries and copyFrom. The table
// is 'schema.table', or [schema, table] for names that have dots.
async function copyRows(connection, table, columns, rows) {
  if (!Array.isArray(columns) || columns.length === 0) throw new TypeError('copyRows needs the names of the columns');
  const names = columns.map(quoteIdentifier).join(', ');
  const target = Array.isArray(table)
    ? table.map((part) => `"${String(part).replace(/"/g, '""')}"`).join('.')
    : quoteIdentifier(table);
  // The types of the columns, from a query that gives no row (prepared once per connection).
  const { fields } = await connection.query(`SELECT ${names} FROM ${target} LIMIT 0`, []);
  const types = fields.map((field) => field.dataTypeID);
  const binary = types.every((type) => encoders.has(type));
  const sql = `COPY ${target} (${names}) FROM STDIN${binary ? ' (FORMAT binary)' : ''}`;
  const result = await connection.copyFrom(sql, encodeRows(rows, columns, types));
  return result.rowCount;
}

export { copyRows, encodeRows, encoders, quoteIdentifier, textValue };
