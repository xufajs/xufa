// The SQL dialects: how SQLite and PostgreSQL write what the compiler needs, store every type of field and give the
// values back. The string lookups are written with instr/strpos and substr instead of LIKE, so they are case
// sensitive in both (LIKE is not in SQLite) and need no escaping.

function quote(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// A table, in its schema when it has one: "schema"."table" in PostgreSQL. SQLite has no schemas: the table is named
// 'schema.table' (as Sequelize does). A name is never split (a table can have dots in its name).
function quoteSchemaTable(name, schema) {
  return schema ? `${quote(schema)}.${quote(name)}` : quote(name);
}

function quoteSqliteTable(name, schema) {
  return quote(schema ? `${schema}.${name}` : name);
}

function toNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

import { likeParts } from '../../query.js';

// The starts of units in SQLite: the date, and the time of datetimes (to the hour, minute or second).
const SQLITE_TRUNCS = {
  year: '%Y-01-01',
  month: '%Y-%m-01',
  day: '%Y-%m-%d',
  hour: '%Y-%m-%d',
  minute: '%Y-%m-%d',
  second: '%Y-%m-%d',
};
const SQLITE_TIMES = { hour: 'T%H:00:00.000Z', minute: 'T%H:%M:00.000Z', second: 'T%H:%M:%S.000Z' };

// The parts of dates in SQLite (strftime) and PostgreSQL (EXTRACT).
const SQLITE_PARTS = {
  year: '%Y',
  month: '%m',
  day: '%d',
  hour: '%H',
  minute: '%M',
  second: '%S',
  week: '%V',
  iso_week_day: '%u',
};
const POSTGRES_PARTS = {
  year: 'YEAR',
  month: 'MONTH',
  day: 'DAY',
  hour: 'HOUR',
  minute: 'MINUTE',
  week: 'WEEK',
  iso_week_day: 'ISODOW',
  quarter: 'QUARTER',
};

// A LIKE pattern as a GLOB pattern of SQLite (whose LIKE ignores case): the characters of GLOB in the text are
// written as sets ([*]).
function likeToGlob(pattern) {
  return likeParts(pattern)
    .map((part) => {
      if (part.any) return '*';
      if (part.one) return '?';
      return part.text.replace(/[*?[]/g, '[$&]');
    })
    .join('');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

// The text of a PostgreSQL array ('{a,"b c",NULL}') as an array of strings (and nulls), for arrays of types the
// driver does not know (arrays of enums).
function parsePgArray(text) {
  let i = 0;
  const parse = () => {
    const result = [];
    i += 1;
    while (i < text.length) {
      const char = text[i];
      if (char === '}') {
        i += 1;
        return result;
      }
      if (char === ',') i += 1;
      else if (char === '{') result.push(parse());
      else if (char === '"') {
        let value = '';
        i += 1;
        while (text[i] !== '"') {
          if (text[i] === '\\') i += 1;
          value += text[i];
          i += 1;
        }
        i += 1;
        result.push(value);
      } else {
        let end = i;
        while (text[end] !== ',' && text[end] !== '}') end += 1;
        const value = text.slice(i, end);
        result.push(value === 'NULL' ? null : value);
        i = end;
      }
    }
    return result;
  };
  return text[0] === '{' ? parse() : [];
}

// An array as the text of a PostgreSQL array literal (defaults of columns).
function pgArrayLiteral(array) {
  const element = (item) => {
    if (item === null || item === undefined) return 'NULL';
    if (Array.isArray(item)) return pgArrayLiteral(item);
    const text = item instanceof Date ? item.toISOString() : String(item);
    return `"${text.replace(/[\\"]/g, '\\$&')}"`;
  };
  return `{${array.map(element).join(',')}}`;
}

// Infinite dates as the databases keep them ('infinity' and '-infinity'), and back (Infinity and -Infinity). @xufa/pg
// gives them as numbers already.
const infiniteText = (value) => (value > 0 ? 'infinity' : '-infinity');

function fromInfinite(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? null : value;
  if (value === 'infinity') return Infinity;
  return value === '-infinity' ? -Infinity : null;
}

// Dates without time ('YYYY-MM-DD'): the driver gives strings, or Dates at local midnight.
function toDay(value) {
  if (value === null || value === undefined) return null;
  const infinite = fromInfinite(value);
  if (infinite !== null) return infinite;
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return String(value).slice(0, 10);
}

// Bytes read as a boolean (a column of bytes read by a boolean field): true when the first byte is not 0.
function bytesBoolean(value) {
  if (!(value instanceof Uint8Array)) return undefined;
  return value.length > 0 && value[0] !== 0;
}

function toBigint(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const big = BigInt(value);
  return Number.isSafeInteger(Number(big)) ? Number(big) : big;
}

const toDecimal = (value) => (value === null || value === undefined ? null : String(value));
const toBuffer = (value) =>
  value === null || value === undefined || Buffer.isBuffer(value) ? value : Buffer.from(value);

function toDate(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const infinite = fromInfinite(value);
  return infinite !== null ? infinite : new Date(value);
}

// The functions that make the values of the types of fields from those of the driver (as decode()), for the
// decoders compiled for the rows of queries; the types not listed are the values themselves.
import { toEwkt, fromEwkb } from '../../geo.js';
import { toHstore, parseHstore } from '../../hstore.js';

const sqliteDecoders = {
  geometry: (value) => (value === null ? null : JSON.parse(value)),
  hstore: (value) => (value === null ? null : JSON.parse(value)),
  boolean: (value) => (value === null ? null : (bytesBoolean(value) ?? Boolean(Number(value)))),
  array: (value) => (value === null ? null : JSON.parse(value)),
  datetime: toDate,
  json: (value) => (value === null ? null : JSON.parse(value)),
  id: toNumber,
  integer: toNumber,
  float: toNumber,
  bigint: toBigint,
  decimal: toDecimal,
  date: toDay,
  bytes: toBuffer,
  jsonValue: (value) => (value === null ? null : JSON.parse(value)),
};

const postgresDecoders = {
  hstore: (value) =>
    value === null || value === undefined ? null : typeof value === 'string' ? parseHstore(value) : value,
  // PostGIS gives geometries as hex EWKB.
  geometry: (value) => (value === null || value === undefined ? null : fromEwkb(value)),
  boolean: (value) =>
    value === null ? null : (bytesBoolean(value) ?? (value === true || value === 't' || value === 'true')),
  // The driver gives the arrays of the types it knows; the others (of enums) come as their text.
  array: (value) => (value === null || value === undefined ? null : Array.isArray(value) ? value : parsePgArray(value)),
  datetime: toDate,
  // @xufa/pg gives json and jsonb values parsed (a string is a json string, not its text).
  json: (value) => (value === undefined ? null : value),
  id: toNumber,
  integer: toNumber,
  float: toNumber,
  bigint: toBigint,
  decimal: toDecimal,
  date: toDay,
  bytes: toBuffer,
};

const common = {
  quote,
  // The decoder of the values of a field (by its dbType); arrays decode their items as their base field.
  decoderOf(field) {
    const decode = this.decoders[field.dbType];
    // Encrypted fields: their text decrypted (as the value of their base field).
    if (field.encrypted) return (value) => field.open(decode ? decode(value) : value);
    // Fields that make the value decoded their own (the mode of bigints).
    if (field.fromDb) return (value) => field.fromDb(decode ? decode(value) : value);
    if (field.dbType !== 'array' || !field.base) return decode;
    const itemDecode = this.decoders[field.base.dbType];
    if (!itemDecode) return decode;
    const { base } = field;
    const item = base.fromDb ? (element) => base.fromDb(itemDecode(element)) : itemDecode;
    return (value) => {
      const array = decode(value);
      // Items already made (objects of json text, documents the driver parsed) are as they are.
      return (
        array &&
        array.map((element) =>
          element === null || (typeof element === 'object' && !(element instanceof Date)) ? element : item(element)
        )
      );
    };
  },
  arrayLiteral: (array) => JSON.stringify(array),
  lower: (sql) => `lower(${sql})`,
  true: 'TRUE',
  false: 'FALSE',
};

const sqlite = {
  ...common,
  name: 'sqlite',
  // STRICT tables: their columns hold values of their types only.
  tableOptions: (spec) => (spec.strict ? ' STRICT' : ''),
  decoders: sqliteDecoders,
  placeholder: () => '?',
  textParam: (sql) => sql,
  contains: (column, param) => `instr(${column}, ${param()}) > 0`,
  startsWith: (column, param) => `substr(${column}, 1, length(${param()})) = ${param()}`,
  endsWith: (column, param) => `substr(${column}, -length(${param()})) = ${param()}`,
  // A value inside json values (json_extract gives numbers, strings and 1/0 for booleans).
  jsonPath: (column, path) => {
    // Numeric keys are indexes of arrays.
    const steps = path
      .map((key) => (/^\d+$/.test(String(key)) ? `[${key}]` : `."${String(key).replace(/"/g, '\\"')}"`))
      .join('');
    return `json_extract(${column}, '$${steps.replace(/'/g, "''")}')`;
  },
  // A value inside json values, as json (decoded by the jsonValue decoder).
  jsonValue(column, path) {
    return `json_quote(${this.jsonPath(column, path)})`;
  },
  jsonParam: (value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value instanceof Date ? value.toISOString() : value;
  },
  // LIKE patterns: GLOB (case sensitive), on lower() of both for ilike.
  like: (column, param, insensitive) =>
    insensitive ? `lower(${column}) GLOB lower(${param()})` : `${column} GLOB ${param()}`,
  likePattern: likeToGlob,
  // Regular expressions (of JavaScript) with the function the backend registers.
  regex: (column, param, insensitive) => `xufa_regexp(${param()}, ${column}, '${insensitive ? 'i' : ''}') = 1`,
  limit(limit, offset, param) {
    if (limit === null && !offset) return '';
    let sql = ` LIMIT ${limit === null ? '-1' : param(limit)}`;
    if (offset) sql += ` OFFSET ${param(offset)}`;
    return sql;
  },
  // Rows are not locked: a transaction of SQLite locks the database.
  lock: () => '',
  autoPrimaryKey: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  types: {
    id: 'INTEGER',
    string: 'TEXT',
    text: 'TEXT',
    integer: 'INTEGER',
    float: 'REAL',
    bigint: 'INTEGER',
    decimal: 'NUMERIC',
    date: 'TEXT',
    bytes: 'BLOB',
    boolean: 'INTEGER',
    datetime: 'TEXT',
    json: 'TEXT',
    array: 'TEXT',
    geometry: 'TEXT',
    hstore: 'TEXT',
    uuid: 'TEXT',
  },
  // The parts of dates of ISO texts (strftime reads them, Z included): integers, NULL for what is not a date.
  datePart(column, part) {
    const take = (format) => `CAST(strftime('${format}', ${column}) AS INTEGER)`;
    switch (part) {
      case 'week_day':
        return `(${take('%w')} + 1)`;
      case 'quarter':
        return `((${take('%m')} + 2) / 3)`;
      default:
        return take(SQLITE_PARTS[part]);
    }
  },
  // The start of a unit of ISO texts, as ISO texts of the type: datetimes YYYY-MM-DDTHH:MM:SS.000Z, dates YYYY-MM-DD.
  dateTrunc(column, unit, type) {
    const time = type === 'datetime';
    const day = time ? 'T00:00:00.000Z' : '';
    switch (unit) {
      case 'quarter':
        // printf makes NULL an empty text: NULL for what is not a date.
        return `CASE WHEN strftime('%Y', ${column}) IS NULL THEN NULL ELSE printf('%s-%02d-01${day}', strftime('%Y', ${column}), ((CAST(strftime('%m', ${column}) AS INTEGER) - 1) / 3) * 3 + 1) END`;
      case 'week':
        // The Monday of the week: the next Sunday (or the day itself), six days before.
        return `strftime('%Y-%m-%d${day}', ${column}, 'weekday 0', '-6 days')`;
      default:
        return `strftime('${SQLITE_TRUNCS[unit]}${time && SQLITE_TIMES[unit] ? SQLITE_TIMES[unit] : day}', ${column})`;
    }
  },
  quoteTable: quoteSqliteTable,
  dropTable: (table, schema) => `DROP TABLE IF EXISTS ${quoteSqliteTable(table, schema)}`,
  encode(type, value) {
    if (value === null || value === undefined) return null;
    switch (type) {
      case 'boolean':
        return value ? 1 : 0;
      case 'datetime':
        // Infinite dates as text: 'infinity' sorts after the ISO dates, '-infinity' before them.
        return typeof value === 'number' ? infiniteText(value) : value.toISOString();
      case 'date':
        return typeof value === 'number' ? infiniteText(value) : value;
      // SQLite makes a NaN bound NULL: it is kept as the text 'NaN' (read back as NaN).
      case 'float':
        return Number.isNaN(value) ? 'NaN' : value;
      case 'json':
      case 'array':
      case 'geometry':
      case 'hstore':
        return JSON.stringify(value);
      case 'id':
        return typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
      default:
        return value;
    }
  },
  decode(type, value) {
    if (value === null || value === undefined) return null;
    const decoder = this.decoders[type];
    return decoder ? decoder(value) : value;
  },
};

const postgres = {
  ...common,
  name: 'postgres',
  decoders: postgresDecoders,
  placeholder: (index) => `$${index}`,
  // Parameters in functions (length, strpos) have no type to be inferred from.
  textParam: (sql) => `${sql}::text`,
  contains: (column, param) => `strpos(${column}, ${param()}) > 0`,
  startsWith: (column, param) => `left(${column}, length(${param()})) = ${param()}`,
  endsWith: (column, param) => `right(${column}, length(${param()})) = ${param()}`,
  like: (column, param, insensitive) => `${column} ${insensitive ? 'ILIKE' : 'LIKE'} ${param()}`,
  // A value inside json values: its text (#>>), cast to the type of the value it is compared with.
  jsonPath: (column, path, type) => {
    const steps = path.map((key) => `"${String(key).replace(/["\\]/g, '\\$&')}"`).join(',');
    const text = `(${column} #>> '{${steps.replace(/'/g, "''")}}')`;
    if (type === 'number' || type === 'bigint') return `CAST(${text} AS DOUBLE PRECISION)`;
    if (type === 'boolean') return `CAST(${text} AS BOOLEAN)`;
    return text;
  },
  jsonParam: (value) => (value instanceof Date ? value.toISOString() : value),
  jsonValue: (column, path) => {
    const steps = path.map((key) => `"${String(key).replace(/["\\]/g, '\\$&')}"`).join(',');
    return `(${column} #> '{${steps.replace(/'/g, "''")}}')`;
  },
  likePattern: (pattern) => pattern,
  regex: (column, param, insensitive) => `${column} ${insensitive ? '~*' : '~'} ${param()}`,
  limit(limit, offset, param) {
    let sql = '';
    if (limit !== null) sql += ` LIMIT ${param(limit)}`;
    if (offset) sql += ` OFFSET ${param(offset)}`;
    return sql;
  },
  // FOR UPDATE (or SHARE...), of the rows of the model only with of: 'self' (not those of the tables joined), SKIP
  // LOCKED or NOWAIT.
  lock({ mode = 'update', skipLocked, noWait, of }) {
    const modes = { update: 'UPDATE', share: 'SHARE', noKeyUpdate: 'NO KEY UPDATE', keyShare: 'KEY SHARE' };
    const wait = skipLocked ? ' SKIP LOCKED' : noWait ? ' NOWAIT' : '';
    return ` FOR ${modes[mode] || 'UPDATE'}${of === 'self' ? ' OF t0' : ''}${wait}`;
  },
  autoPrimaryKey: 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
  types: {
    id: 'BIGINT',
    string: 'TEXT',
    text: 'TEXT',
    integer: 'INTEGER',
    float: 'DOUBLE PRECISION',
    bigint: 'BIGINT',
    decimal: 'NUMERIC',
    date: 'DATE',
    bytes: 'BYTEA',
    boolean: 'BOOLEAN',
    datetime: 'TIMESTAMPTZ',
    json: 'JSONB',
    hstore: 'HSTORE',
    uuid: 'UUID',
  },
  // The items of arrays are encoded as their field (hstore and json texts, ranges...).
  encodesArrayItems: true,
  arrayType: (itemType) => `${itemType}[]`,
  // GEOMETRY, GEOMETRY(POINT), GEOMETRY(POINT,4326), GEOGRAPHY(GEOMETRY,4326)...
  geometryType: ({ geography, shape, srid }) => {
    const name = geography ? 'GEOGRAPHY' : 'GEOMETRY';
    if (!shape && (srid === undefined || srid === null)) return name;
    return `${name}(${shape || 'GEOMETRY'}${srid !== undefined && srid !== null ? `,${srid}` : ''})`;
  },
  arrayLiteral: pgArrayLiteral,
  stringType: (maxLength) => (maxLength ? `VARCHAR(${maxLength})` : 'TEXT'),
  tableOptions: (spec) => (spec.fillfactor ? ` WITH (fillfactor = ${spec.fillfactor})` : ''),
  // The parts of dates with EXTRACT, of datetimes in UTC: integers.
  datePart(column, part, type) {
    const source = type === 'datetime' ? `(${column} AT TIME ZONE 'UTC')` : column;
    const take = (field) => `CAST(EXTRACT(${field} FROM ${source}) AS INTEGER)`;
    switch (part) {
      case 'week_day':
        return `(${take('DOW')} + 1)`;
      case 'second':
        return `CAST(FLOOR(EXTRACT(SECOND FROM ${source})) AS INTEGER)`;
      default:
        return take(POSTGRES_PARTS[part]);
    }
  },
  // The start of a unit with date_trunc: of datetimes in UTC (a TIMESTAMPTZ), of dates a DATE.
  dateTrunc(column, unit, type) {
    if (type === 'datetime') return `(date_trunc('${unit}', ${column} AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;
    return `CAST(date_trunc('${unit}', ${column}) AS DATE)`;
  },
  quoteTable: quoteSchemaTable,
  dropTable: (table, schema) => `DROP TABLE IF EXISTS ${quoteSchemaTable(table, schema)} CASCADE`,
  // Dates go as they are: @xufa/pg sends them in binary (pg as text); infinite ones as 'infinity' and '-infinity'.
  encode(type, value) {
    if (value === null || value === undefined) return null;
    if (type === 'json') return JSON.stringify(value);
    if ((type === 'datetime' || type === 'date') && typeof value === 'number') return infiniteText(value);
    // Geometries as EWKT (SRID=4326;POINT(1 2)), which geometry and geography columns read.
    if (type === 'geometry') return toEwkt(value);
    if (type === 'hstore') return toHstore(value);
    return value;
  },
  decode(type, value) {
    if (value === null || value === undefined) return null;
    const decoder = this.decoders[type];
    return decoder ? decoder(value) : value;
  },
};

export { sqlite, postgres, quote };
