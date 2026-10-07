// DataTypes: the types of attributes of Sequelize, as values that say which field of @xufa/orm stores them. Each one
// can be used as it is (DataTypes.STRING) or called with its options (DataTypes.STRING(100), DataTypes.DECIMAL(10, 2),
// DataTypes.ENUM('a', 'b')); the modifiers of a database (UNSIGNED, ZEROFILL, BINARY) are accepted and ignored.
const crypto = require('node:crypto');

const { randomUUID } = crypto;

class DataType {
  constructor(key, kind, options = {}) {
    this.key = key;
    this.kind = kind;
    this.options = options;
  }

  // The modifiers of MySQL and binary strings change nothing here.
  get UNSIGNED() {
    return this;
  }

  get ZEROFILL() {
    return this;
  }

  get BINARY() {
    if (this.kind !== 'string') return this;
    const copy = Object.create(Object.getPrototypeOf(this));
    return Object.assign(copy, this, { options: { ...this.options, binary: true } });
  }

  toString() {
    return this.key;
  }

  // As the DataTypes of Sequelize: whether a value is of the type (or a ValidationError), the value made of its type,
  // and its text.
  validate(value) {
    const { ValidationError } = require('./errors'); // eslint-disable-line global-require
    const fail = () => {
      throw new ValidationError(`${JSON.stringify(value)} is not a valid ${this.key.toLowerCase()}`);
    };
    switch (this.kind) {
      case 'integer':
      case 'bigint':
        if (!/^[-+]?\d+$/.test(String(value))) fail();
        break;
      case 'float':
      case 'decimal':
        if (Number.isNaN(Number(value)) || value === '' || value === null) fail();
        break;
      case 'datetime':
      case 'date':
        if (value !== Infinity && value !== -Infinity && Number.isNaN(new Date(value).getTime())) fail();
        break;
      case 'boolean':
        if (![true, false, 0, 1, '0', '1', 'true', 'false', 't', 'f'].includes(value)) fail();
        break;
      case 'uuid':
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value))) fail();
        break;
      case 'string':
      case 'text':
        if (
          typeof value !== 'string' &&
          typeof value !== 'number' &&
          typeof value !== 'bigint' &&
          !Buffer.isBuffer(value)
        )
          fail();
        break;
      default:
    }
    if (this.options.values && !this.options.values.includes(value)) fail();
    return true;
  }

  _sanitize(value) {
    if (value === null || value === undefined) return value;
    switch (this.kind) {
      case 'datetime':
        if (value === Infinity || value === -Infinity) return value;
        if (typeof value === 'string' && /^-?infinity$/i.test(value)) return value[0] === '-' ? -Infinity : Infinity;
        return value instanceof Date ? value : new Date(value);
      case 'date': {
        if (value === Infinity || value === -Infinity) return value;
        if (typeof value === 'string' && /^-?infinity$/i.test(value)) return value[0] === '-' ? -Infinity : Infinity;
        const date = value instanceof Date ? value : new Date(value);
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const pad = (number) => String(number).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      }
      case 'boolean':
        if (typeof value === 'string') return ['true', 't', '1'].includes(value.toLowerCase());
        if (typeof value === 'number') return value !== 0;
        return Boolean(value);
      default:
        return value;
    }
  }

  stringify(value, options) {
    if (this.kind === 'range') return require('./range').rangeLiteral(value, this.options.subtype, options); // eslint-disable-line global-require
    if (value === Infinity || value === -Infinity) return String(value);
    if (this.kind === 'hstore') return require('@xufa/orm').toHstore(value); // eslint-disable-line global-require
    if (this.kind === 'geometry') return JSON.stringify(value);
    if (this.kind === 'datetime') {
      const date = value instanceof Date ? value : new Date(value);
      return date.toISOString().replace('T', ' ').replace('Z', ' +00:00');
    }
    if (this.kind === 'date') return this._sanitize(value);
    if (this.kind === 'json') return JSON.stringify(value);
    if (Buffer.isBuffer(value)) return value;
    return String(value);
  }

  // As Sequelize: the value as a bound parameter (options.bindParam takes its text; ranges unquoted).
  bindParam(value, options) {
    if (this.kind === 'range') return options.bindParam(require('./range').stringifyRange(value)); // eslint-disable-line global-require
    return options.bindParam(this.stringify(value, options));
  }

  // As Sequelize: a date in the timezone of the options, as a moment when the app has moment (or moment-timezone),
  // the date otherwise (@xufa/sequelize depends on neither).
  _applyTimezone(date, options = {}) {
    let moment = null;
    for (const name of ['moment-timezone', 'moment']) {
      try {
        moment = require(require.resolve(name, { paths: [process.cwd()] })); // eslint-disable-line global-require
        break;
      } catch {
        // not there
      }
    }
    if (!moment) return date;
    if (options.timezone && moment.tz && moment.tz.zone(options.timezone)) return moment(date).tz(options.timezone);
    return options.timezone ? moment(date).utcOffset(options.timezone) : moment(date);
  }
}

// As Sequelize: ABSTRACT is the type every type is, and warn() logs a warning about a type once.
DataType.key = 'ABSTRACT';
const warnings = new Set();
DataType.warn = function warn(link, text) {
  if (warnings.has(text)) return;
  warnings.add(text);
  console.warn(`(sequelize) Warning: ${text} \n>> Check: ${link}`); // eslint-disable-line no-console
};

// A type: a function that makes the type with options (with or without new), which is itself the type with none.
function defineType(key, kind, parse = () => ({}), parent = DataType) {
  // Its types are instances of it (instanceof DataTypes.INTEGER), of its parent (DataTypes.NUMBER) and of DataType.
  const type = function makeType(...args) {
    const instance = Object.create(type.prototype);
    Object.assign(instance, { key, kind, options: parse(...args) });
    return instance;
  };
  type.prototype = Object.create(parent.prototype, {
    constructor: { value: type, writable: true, configurable: true },
  });
  type.key = key;
  type.kind = kind;
  type.options = parse();
  type.warn = DataType.warn;
  type.toString = () => key;
  Object.defineProperty(type, 'name', { value: key });
  for (const modifier of ['UNSIGNED', 'ZEROFILL']) {
    Object.defineProperty(type, modifier, { get: () => type });
  }
  Object.defineProperty(type, 'BINARY', { get: () => (kind === 'string' ? type({ binary: true }) : type) });
  return type;
}

// Lengths of strings, and whether they are binary (STRING(16, true), STRING({ length, binary }), STRING.BINARY).
const length = (value, binary) => {
  if (value && typeof value === 'object') return { length: value.length, ...(value.binary && { binary: true }) };
  return { ...(value !== undefined && { length: value }), ...(binary && { binary: true }) };
};

const decimal = (precision, scale) => {
  if (precision && typeof precision === 'object') return { precision: precision.precision, scale: precision.scale };
  return { precision, scale };
};

// The type of numbers, which the numeric types are (DataTypes.INTEGER() instanceof DataTypes.NUMBER), as in Sequelize.
const NUMBER = defineType('NUMBER', 'float');
const numeric = (key, kind, parse) => defineType(key, kind, parse, NUMBER);

// The types of a dialect (DataTypes.postgres.DATE...) are those of every dialect.
const DataTypes = {
  // The type all types are (type instanceof DataTypes.ABSTRACT).
  ABSTRACT: DataType,
  STRING: defineType('STRING', 'string', length),
  CHAR: defineType('CHAR', 'string', length),
  TEXT: defineType('TEXT', 'text'),
  CITEXT: defineType('CITEXT', 'text'),
  // Text search vectors of PostgreSQL (text elsewhere): written as text, which PostgreSQL makes a vector.
  TSVECTOR: defineType('TSVECTOR', 'text'),
  NUMBER,
  TINYINT: numeric('TINYINT', 'integer'),
  SMALLINT: numeric('SMALLINT', 'integer'),
  MEDIUMINT: numeric('MEDIUMINT', 'integer'),
  INTEGER: numeric('INTEGER', 'integer'),
  BIGINT: numeric('BIGINT', 'bigint'),
  FLOAT: numeric('FLOAT', 'float'),
  REAL: numeric('REAL', 'float'),
  DOUBLE: numeric('DOUBLE', 'float'),
  DECIMAL: numeric('DECIMAL', 'decimal', decimal),
  NUMERIC: numeric('NUMERIC', 'decimal', decimal),
  BOOLEAN: defineType('BOOLEAN', 'boolean'),
  DATE: defineType('DATE', 'datetime'),
  DATEONLY: defineType('DATEONLY', 'date'),
  TIME: defineType('TIME', 'string'),
  UUID: defineType('UUID', 'uuid'),
  JSON: defineType('JSON', 'json'),
  JSONB: defineType('JSONB', 'json'),
  BLOB: defineType('BLOB', 'bytes'),
  // Arrays: native arrays of PostgreSQL (TEXT[], "enum_<table>_<column>"[]...), JSON in SQLite. Their kind is json in
  // the conditions of the layer (values as wholes); the type of the items is normalized.
  ARRAY: defineType('ARRAY', 'json', (type) => ({ type: type ? normalizeType(type) : type })),
  // Ranges of PostgreSQL (of INTEGER, BIGINT, DECIMAL, DATE or DATEONLY).
  RANGE: defineType('RANGE', 'range', (subtype) => ({ subtype: subtype ? normalizeType(subtype).key : 'INTEGER' })),
  ENUM: defineType('ENUM', 'string', (...values) => {
    if (values.length === 1 && values[0] && !Array.isArray(values[0]) && typeof values[0] === 'object') {
      // As Sequelize 7: ENUM({ values, name, schema }) names the type of PostgreSQL (one type for every column of it).
      const { name, schema } = values[0];
      if (name !== undefined && (typeof name !== 'string' || name === ''))
        throw new TypeError('The name of an ENUM is a text');
      if (schema !== undefined && (typeof schema !== 'string' || schema === '')) {
        throw new TypeError('The schema of an ENUM is a text');
      }
      return { values: values[0].values, name, schema };
    }
    return { values: values.flat() };
  }),
  // Maps of strings of PostgreSQL (the extension hstore): { key: 'value' }.
  HSTORE: defineType('HSTORE', 'hstore'),
  // Geometries of PostGIS as GeoJSON: GEOMETRY('POINT', 4326), GEOGRAPHY('POLYGON').
  GEOMETRY: defineType('GEOMETRY', 'geometry', (type, srid) => ({ type, srid })),
  GEOGRAPHY: defineType('GEOGRAPHY', 'geometry', (type, srid) => ({ type, srid })),
  INET: defineType('INET', 'string'),
  CIDR: defineType('CIDR', 'string'),
  MACADDR: defineType('MACADDR', 'string'),
  // Attributes that are not stored: their getters and setters work with other attributes.
  VIRTUAL: defineType('VIRTUAL', 'virtual', (returnType, fields) => ({ returnType, fields })),
  // Defaults: the time of the creation, and generated UUIDs.
  NOW: defineType('NOW', 'now'),
  UUIDV1: defineType('UUIDV1', 'uuidv4'),
  UUIDV4: defineType('UUIDV4', 'uuidv4'),
  // As Sequelize 7: UUIDs of version 7 (their first 48 bits the time in milliseconds: they sort as they are made).
  UUIDV7: defineType('UUIDV7', 'uuidv7'),
};

// The parsers of values of the database of some types (DataTypes.INTEGER.parse...), and of ranges.
DataTypes.INTEGER.parse = (value) => Number.parseInt(value, 10);
DataTypes.BIGINT.parse = (value) => Number.parseInt(value, 10);
DataTypes.DECIMAL.parse = (value) => value;
DataTypes.DATE.parse = (value) => new Date(value);
DataTypes.DATEONLY.parse = (value) => value;
DataTypes.RANGE.parse = (value, options = {}) =>
  require('./range').parseRange(value, typeof options === 'function' ? options : options.parser || 'INTEGER'); // eslint-disable-line global-require
// Whether a type is an ARRAY of a type: DataTypes.ARRAY.is(type, DataTypes.ENUM).
DataTypes.ARRAY.is = (type, itemType) => type instanceof DataTypes.ARRAY && type.options.type instanceof itemType;
// The parse functions there are by default: the others are given (DataTypes.DATE.parse = ...), as Sequelize takes
// them after refreshTypes().
const DEFAULT_PARSERS = new Map();
Object.values(DataTypes).forEach((type) => {
  if (typeof type === 'function' && Object.hasOwn(type, 'parse')) DEFAULT_PARSERS.set(type, type.parse);
});

// Whether a type has a parse of its own that is not its default one (one set to undefined too, as Sequelize sees it).
const ownParser = (type) =>
  Object.hasOwn(type, 'parse') && !(DEFAULT_PARSERS.has(type) && DEFAULT_PARSERS.get(type) === type.parse);

// The parse function given for the type of an attribute (its class), or null.
function customParserOf(type) {
  const ctor = type && type.constructor;
  if (!ctor || typeof ctor.parse !== 'function' || !ownParser(ctor)) return null;
  return ctor.parse;
}

// How the values of a type are written when a stringify or a bindParam of its own was given
// (DataTypes.DATE.prototype.stringify = ...): 'bindParam', 'stringify', or null.
function customStringifyOf(type) {
  if (!type || typeof type.stringify !== 'function') return null;
  if (type.bindParam !== DataType.prototype.bindParam) return 'bindParam';
  return type.stringify !== DataType.prototype.stringify ? 'stringify' : null;
}

// As Sequelize: the types whose values each dialect cannot parse with a function of its own.
const PARSE_UNSUPPORTED = {
  sqlite: [
    'NUMBER',
    'NOW',
    'UUIDV1',
    'UUIDV4',
    'HSTORE',
    'JSONB',
    'VIRTUAL',
    'ARRAY',
    'ENUM',
    'RANGE',
    'GEOMETRY',
    'GEOGRAPHY',
    'CIDR',
    'INET',
    'MACADDR',
    'CITEXT',
    'TSVECTOR',
  ],
  postgres: ['NUMBER', 'MEDIUMINT', 'FLOAT', 'NOW', 'UUIDV1', 'UUIDV4', 'VIRTUAL', 'ARRAY'],
};

// The parse functions given for types a dialect cannot parse: an error, as Sequelize's refreshTypes() throws.
function checkParsers(dialect) {
  (PARSE_UNSUPPORTED[dialect] || []).forEach((key) => {
    const type = DataTypes[key];
    // A parse of its own (even undefined, as Sequelize sees it).
    if (type && ownParser(type)) {
      throw new Error(`Parse function not supported for type ${key} in dialect ${dialect}`);
    }
  });
}

DataTypes.postgres = DataTypes;
DataTypes.sqlite = DataTypes;

// The type of an attribute as a DataType (a type used without options is called).
function normalizeType(type) {
  if (type instanceof DataType) return type;
  if (typeof type === 'function' && type.kind) return type();
  // The types of the sequelize package itself (by their key, with their options).
  if (type && typeof type.key === 'string' && DataTypes[type.key] && DataTypes[type.key] !== DataType) {
    if (typeof type === 'function') return DataTypes[type.key]();
    const options = type.options || {};
    switch (type.key) {
      case 'STRING':
      case 'CHAR':
        return DataTypes[type.key](type._length !== undefined ? type._length : options.length);
      case 'DECIMAL':
      case 'NUMERIC':
        return DataTypes[type.key](type._precision, type._scale);
      case 'ENUM':
        return DataTypes.ENUM(type.values || options.values || []);
      case 'ARRAY':
        return DataTypes.ARRAY(type.type);
      default:
        return DataTypes[type.key]();
    }
  }
  if (typeof type === 'string') {
    const name = type.toUpperCase().replace(/\(.*$/, '');
    if (DataTypes[name]) return DataTypes[name]();
  }
  throw new TypeError(`Unrecognized data type ${String(type)}`);
}

// A UUID of version 7 (RFC 9562): the time in milliseconds, then a counter of 12 bits for the ones of the same
// millisecond (so they keep their order), and random bits. Not node:crypto's randomUUIDv7 (Node 24): its bits after
// the millisecond are random, so the ones of the same millisecond lose their order.
let lastMs = -1;
let counter = 0;
function uuidv7() {
  const bytes = crypto.randomBytes(16);
  let ms = Date.now();
  if (ms <= lastMs) {
    counter += 1;
    // The counter is full: the next millisecond (the time of the UUID runs ahead a little).
    if (counter > 0xfff) {
      lastMs += 1;
      counter = bytes[7] & 0x7f;
    }
    ms = lastMs;
  } else {
    lastMs = ms;
    counter = bytes[7] & 0x7f;
  }
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes[6] = 0x70 | ((counter >> 8) & 0x0f);
  bytes[7] = counter & 0xff;
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The value of a default: NOW is the time, UUIDV4 (UUIDV7) a new UUID, functions are called, objects copied.
function defaultValueOf(value) {
  if (value === undefined) return undefined;
  if (value === DataTypes.NOW || (value instanceof DataType && value.kind === 'now')) return new Date();
  if (
    value === DataTypes.UUIDV4 ||
    value === DataTypes.UUIDV1 ||
    (value instanceof DataType && value.kind === 'uuidv4')
  ) {
    return randomUUID();
  }
  if (value === DataTypes.UUIDV7 || (value instanceof DataType && value.kind === 'uuidv7')) return uuidv7();
  if (typeof value === 'function') return value();
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) return structuredClone(value);
  return value;
}

module.exports = {
  DataTypes,
  DataType,
  normalizeType,
  defaultValueOf,
  uuidv7,
  customParserOf,
  customStringifyOf,
  checkParsers,
};
