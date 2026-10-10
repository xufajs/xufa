// The fields of the models. A field knows its JavaScript value: it coerces what it is given (toValue), validates it
// (check) and gives defaults. How a value is stored is the business of each backend, which reads the field's `dbType`.
import { message, ValueError } from './messages.js';
import { randomUUID } from 'node:crypto';
import { checkGeometry } from './geo.js';
import { getKeyring, isEncrypted } from './encryption.js';
import { EncryptionError } from './errors.js';
import { fieldValidators } from './rules.js';
import * as blobModule from './blob.js';

const EMPTY = [];

// The choices of a field: a list of values, a list of [value, label] (Django's choices), or an object of labels by
// value. { values, labels }: the values (what is kept) and their labels (a Map; null when there are none).
function choicesOf(given) {
  if (given === undefined || given === null) return { values: undefined, labels: null };
  if (Array.isArray(given)) {
    if (given.length && given.every((item) => Array.isArray(item) && item.length === 2)) {
      return { values: given.map(([value]) => value), labels: new Map(given) };
    }
    return { values: given, labels: null };
  }
  if (typeof given === 'object') {
    const entries = Object.entries(given);
    return { values: entries.map(([value]) => value), labels: new Map(entries) };
  }
  throw new TypeError('choices are a list of values, a list of [value, label], or an object of labels by value');
}

class Field {
  constructor(options = {}) {
    this.options = options;
    this.null = Boolean(options.null);
    this.default = options.default;
    // unique: 'ci' is unique whatever the case of the text (a unique index of its lower case, as Django's
    // UniqueConstraint(Lower('name'))).
    this.uniqueCi = options.unique === 'ci';
    this.unique = options.unique === 'ci' ? false : Boolean(options.unique);
    // Its own messages (Django's error_messages): { unique }.
    this.messages = options.messages && typeof options.messages === 'object' ? options.messages : {};
    this.index = Boolean(options.index);
    this.primaryKey = Boolean(options.primaryKey);
    const choices = choicesOf(options.choices);
    this.choices = choices.values;
    // The labels of the choices (Django's get_FOO_display()): model.display(name).
    this.choiceLabels = choices.labels;
    // What forms and the admin show of the field (Django's verbose_name and help_text), and whether a form may leave
    // it empty (blank: by default, a field with null may; blank: false refuses '' too).
    this.label = typeof options.label === 'string' ? options.label : null;
    this.help = typeof options.help === 'string' ? options.help : null;
    this.blank = options.blank === undefined ? this.null : Boolean(options.blank);
    this.blankGiven = options.blank !== undefined;
    // Functions of the value, or rules (expressions, { rule, message }) compiled to functions when the field is bound.
    this.validatorSpecs = options.validate ? [].concat(options.validate) : EMPTY;
    this.validators = this.validatorSpecs.every((spec) => typeof spec === 'function') ? this.validatorSpecs : EMPTY;
    this.columnName = options.column;
    // A computed field (lib/computed.js): an expression or a function of the object; virtual unless stored.
    this.computed = options.computed === undefined ? null : options.computed;
    this.stored = this.computed !== null && Boolean(options.stored);
    if (this.computed !== null) {
      if (this.primaryKey) throw new TypeError('A computed field cannot be a primary key');
      if (!this.stored && (this.unique || this.index || this.default !== undefined || this.columnName)) {
        throw new TypeError('A computed field that is not stored has no column: no unique, index, default nor column');
      }
    } else if (options.stored !== undefined) {
      throw new TypeError('stored is an option of computed fields');
    }
    this.model = undefined;
    this.name = undefined;
    this.attname = undefined;
    this.column = undefined;
  }

  get type() {
    return 'field';
  }

  // The type the backends store: the same as the type, except for relations, stored as the key they point to.
  get dbType() {
    return this.type;
  }

  // Values the database gives to every new row, so they are not required.
  get auto() {
    return false;
  }

  bind(model, name) {
    this.model = model;
    this.name = name;
    this.attname = name;
    this.column = this.columnName || name;
    if (this.validators !== this.validatorSpecs) this.validators = fieldValidators(this.validatorSpecs, model, name);
  }

  clone() {
    const field = Object.create(Object.getPrototypeOf(this));
    Object.assign(field, this);
    field.model = undefined;
    return field;
  }

  hasDefault() {
    return this.default !== undefined;
  }

  getDefault() {
    if (typeof this.default === 'function') return this.default();
    if (this.default !== null && typeof this.default === 'object') return structuredClone(this.default);
    return this.default;
  }

  // Coerces a value given by the user to the value of the field. Throws a TypeError with the message to show when it
  // cannot. null and undefined are not given to it.
  toValue(value) {
    return value;
  }

  // Coerces a value, keeping null and undefined as null.
  clean(value) {
    return value === undefined || value === null ? null : this.toValue(value);
  }

  // The messages of what is wrong with a value already coerced (empty when it is valid).
  check(value) {
    const messages = [];
    if (value === null) {
      if (!this.null && !this.auto) messages.push(message('required'));
      return messages;
    }
    // blank: false refuses an empty text, as Django's full_clean() (blank=False).
    if (this.blankGiven && !this.blank && value === '') {
      messages.push(message('required'));
      return messages;
    }
    if (this.choices && !this.choices.includes(value)) {
      messages.push(message('choice', { value: JSON.stringify(value) }));
    }
    this.checkValue(value, messages);
    for (let i = 0; i < this.validators.length; i += 1) {
      const result = this.validators[i](value);
      if (typeof result === 'string') messages.push(result);
      else if (result === false) messages.push(message('invalid'));
    }
    return messages;
  }

  checkValue() {}

  // The JSON Schema of the values of the field.
  jsonSchema() {
    return {};
  }
}

// `mode` (SQL databases): how the keys that are integers are given, as those of bigint fields ('number', 'bigint' or
// 'string').
class IdField extends Field {
  constructor(options = {}) {
    super({ ...options, primaryKey: true });
    this.mode = options.mode || 'number';
    if (!BIGINT_MODES.includes(this.mode))
      throw new TypeError(`The mode of a key is one of ${BIGINT_MODES.join(', ')}`);
  }

  // A key of the database in the mode of the field (keys that are not integers, as ObjectIds, are as they are).
  fromDb(value) {
    if (this.mode === 'number' || value === null || value === undefined) return value;
    if (
      typeof value === 'number' ||
      typeof value === 'bigint' ||
      (typeof value === 'string' && /^-?\d+$/.test(value))
    ) {
      return this.mode === 'bigint' ? BigInt(value) : String(value);
    }
    return value;
  }

  get type() {
    return 'id';
  }

  get auto() {
    return true;
  }

  // Keys are numbers in SQL databases and strings (ObjectId) in MongoDB: the backend makes them what it stores.
  toValue(value) {
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'bigint') return this.fromDb(value);
    if (typeof value === 'object' && typeof value.toHexString === 'function') return value.toHexString();
    throw new ValueError('key');
  }

  jsonSchema() {
    return { type: ['integer', 'string'] };
  }
}

class StringField extends Field {
  constructor(options = {}) {
    super(options);
    this.maxLength = options.maxLength;
    this.minLength = options.minLength;
  }

  get type() {
    return 'string';
  }

  toValue(value) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    throw new ValueError('string');
  }

  checkValue(value, messages) {
    if (this.maxLength !== undefined && value.length > this.maxLength) {
      messages.push(message('maxLength', { max: this.maxLength, length: value.length }));
    }
    if (this.minLength !== undefined && value.length < this.minLength) {
      messages.push(message('minLength', { min: this.minLength, length: value.length }));
    }
  }

  jsonSchema() {
    const schema = { type: 'string' };
    if (this.maxLength !== undefined) schema.maxLength = this.maxLength;
    if (this.minLength !== undefined) schema.minLength = this.minLength;
    return schema;
  }
}

class TextField extends StringField {
  get type() {
    return 'text';
  }
}

class NumberField extends Field {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
  }

  checkValue(value, messages) {
    if (this.min !== undefined && value < this.min) messages.push(message('min', { min: this.min }));
    if (this.max !== undefined && value > this.max) messages.push(message('max', { max: this.max }));
  }

  jsonSchema() {
    const schema = { type: this.type === 'integer' ? 'integer' : 'number' };
    if (this.min !== undefined) schema.minimum = this.min;
    if (this.max !== undefined) schema.maximum = this.max;
    return schema;
  }
}

class IntegerField extends NumberField {
  get type() {
    return 'integer';
  }

  toValue(value) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number === 'bigint') return Number(number);
    if (!Number.isInteger(number)) throw new ValueError('integer');
    return number;
  }
}

class FloatField extends NumberField {
  get type() {
    return 'float';
  }

  // The IEEE values (NaN, Infinity, -Infinity) are numbers too, as PostgreSQL keeps them; NaN only when it is given
  // (NaN or 'NaN'), not when a text is no number.
  toValue(value) {
    if (typeof value === 'number' || (typeof value === 'string' && value.trim() === 'NaN')) return Number(value);
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    if (typeof number === 'bigint') return Number(number);
    if (typeof number !== 'number' || Number.isNaN(number)) throw new ValueError('number');
    return number;
  }
}

// Integers of 64 bits. `mode`: 'number' (the default: numbers when they are safe integers, bigints otherwise),
// 'bigint' (always bigints) or 'string' (their decimal text, as node-postgres gives them).
const BIGINT_MODES = ['number', 'bigint', 'string'];
class BigIntegerField extends NumberField {
  constructor(options = {}) {
    super(options);
    this.mode = options.mode || 'number';
    if (!BIGINT_MODES.includes(this.mode))
      throw new TypeError(`The mode of a bigint is one of ${BIGINT_MODES.join(', ')}`);
  }

  get type() {
    return 'bigint';
  }

  toValue(value) {
    let big;
    if (typeof value === 'bigint') big = value;
    else if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) big = BigInt(value.trim());
    else if (Number.isInteger(value)) big = Number.isSafeInteger(value) ? null : BigInt(value);
    else throw new ValueError('integer');
    return this.inMode(big === null ? value : big);
  }

  // A value of the database (a number or a bigint) in the mode of the field.
  fromDb(value) {
    if (value === null || value === undefined || this.mode === 'number') return value;
    return this.inMode(typeof value === 'string' ? BigInt(value) : value);
  }

  inMode(value) {
    if (this.mode === 'bigint') return BigInt(value);
    if (this.mode === 'string') return String(value);
    return typeof value === 'bigint' && Number.isSafeInteger(Number(value)) ? Number(value) : value;
  }

  jsonSchema() {
    return this.mode === 'string' ? { type: 'string', pattern: '^-?\\d+$' } : { type: 'integer' };
  }
}

// Exact numbers (NUMERIC): strings, so no precision is lost. `precision` and `scale` are those of the column.
class DecimalField extends Field {
  constructor(options = {}) {
    super(options);
    this.precision = options.precision;
    this.scale = options.scale;
  }

  get type() {
    return 'decimal';
  }

  // The text of the value with the digits of the scale (as Django gives decimal_places, and the databases a
  // numeric(p, s)): '3' and '3.0' are '3.00' for a scale of 2. More decimal places than the scale are kept, for
  // checkValue() to refuse them.
  toValue(value) {
    const text = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof text !== 'string' || !/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text.trim())) {
      throw new ValueError('decimal');
    }
    return padDecimal(text.trim(), this.scale);
  }

  // As the database gives it (SQLite: a number, or its text without the zeros at the end): with the digits of the scale.
  fromDb(value) {
    if (value === null || value === undefined || !Number.isInteger(this.scale)) return value;
    if (typeof value === 'number') return value.toFixed(this.scale);
    return padDecimal(String(value), this.scale, true);
  }

  // As Django's DecimalField: no more digits than the precision, nor decimal places than the scale.
  checkValue(value, messages) {
    const plain = /e/i.test(value) ? Number(value).toFixed(Number.isInteger(this.scale) ? this.scale : 20) : value;
    const [whole, fraction = ''] = plain.replace(/^-/, '').split('.');
    const places = fraction.length;
    const digits = whole.replace(/^0+/, '').length + places;
    if (Number.isInteger(this.scale) && places > this.scale) {
      messages.push(message('decimalPlaces', { scale: this.scale }));
    }
    if (Number.isInteger(this.precision) && digits > this.precision) {
      messages.push(message('digits', { precision: this.precision }));
    }
  }

  jsonSchema() {
    return { type: 'string', pattern: '^-?\\d*\\.?\\d+$' };
  }
}

// A decimal's text with at least `scale` digits after the point ('3' -> '3.00'); with `exact`, with exactly that many
// (rounded half away from zero, for values of the database). Texts with exponents are written without them.
function padDecimal(text, scale, exact = false) {
  if (!Number.isInteger(scale)) return text;
  let value = text;
  if (/e/i.test(value)) value = Number(value).toFixed(scale);
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  if (fraction.length <= scale) {
    const padded = scale ? `${whole || '0'}.${fraction.padEnd(scale, '0')}` : whole || '0';
    return negative ? `-${padded}` : padded;
  }
  if (!exact) return value;
  const rounded = Math.round(Number(`${whole || '0'}.${fraction}e${scale}`));
  const result = Number(`${rounded}e-${scale}`).toFixed(scale);
  return negative && Number(result) !== 0 ? `-${result}` : result;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

// Dates without time: strings 'YYYY-MM-DD' (a Date given is taken in local time).
// Infinite dates (PostgreSQL's 'infinity' and '-infinity', later and earlier than every other): Infinity and -Infinity,
// given as numbers or as text in any case. Null for other values.
function infiniteDate(value) {
  if (value === Infinity || value === -Infinity) return value;
  if (typeof value === 'string' && /^[+-]?infinity$/i.test(value)) return value[0] === '-' ? -Infinity : Infinity;
  return null;
}

class DateField extends Field {
  get type() {
    return 'date';
  }

  toValue(value) {
    const infinite = infiniteDate(value);
    if (infinite !== null) return infinite;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new ValueError('date');
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    if (typeof value !== 'string' || !DATE.test(value.slice(0, 10))) throw new ValueError('date');
    return value.slice(0, 10);
  }

  jsonSchema() {
    return { type: 'string', format: 'date' };
  }
}

// Binary data: Buffers.
class BytesField extends Field {
  get type() {
    return 'bytes';
  }

  toValue(value) {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === 'string') return Buffer.from(value);
    throw new ValueError('buffer');
  }

  jsonSchema() {
    return { type: 'string', contentEncoding: 'base64' };
  }
}

class BooleanField extends Field {
  get type() {
    return 'boolean';
  }

  toValue(value) {
    if (value === true || value === false) return value;
    if (value === 1 || value === 'true' || value === '1') return true;
    if (value === 0 || value === 'false' || value === '0') return false;
    throw new ValueError('boolean');
  }

  jsonSchema() {
    return { type: 'boolean' };
  }
}

class DateTimeField extends Field {
  constructor(options = {}) {
    super(options);
    // autoNow: set to the current time on every save. autoNowAdd: set when the object is created.
    this.autoNow = Boolean(options.autoNow);
    this.autoNowAdd = Boolean(options.autoNowAdd);
  }

  get type() {
    return 'datetime';
  }

  get auto() {
    return this.autoNow || this.autoNowAdd;
  }

  toValue(value) {
    const infinite = infiniteDate(value);
    if (infinite !== null) return infinite;
    const date = value instanceof Date ? value : new Date(value);
    if (typeof value === 'boolean' || Number.isNaN(date.getTime())) throw new ValueError('date');
    return date;
  }

  jsonSchema() {
    return { type: 'string', format: 'date-time' };
  }
}

class JsonField extends Field {
  get type() {
    return 'json';
  }
}

// Maps of strings (as Django's HStoreField): HSTORE columns of PostgreSQL (the extension hstore), json text in SQLite,
// documents in MongoDB. Values are strings or nulls (numbers and booleans are taken as their text).
class HStoreField extends Field {
  get type() {
    return 'hstore';
  }

  toValue(value) {
    const object = typeof value === 'string' ? JSON.parse(value) : value;
    if (!object || typeof object !== 'object' || Array.isArray(object)) {
      throw new ValueError('stringObject');
    }
    const result = {};
    Object.keys(object).forEach((key) => {
      const item = object[key];
      if (item !== null && item !== undefined && typeof item === 'object') {
        throw new ValueError('hstoreValues');
      }
      result[key] = item === null || item === undefined ? null : String(item);
    });
    return result;
  }

  jsonSchema() {
    return { type: 'object', additionalProperties: { type: ['string', 'null'] } };
  }
}

// Geometries of PostGIS as GeoJSON values (as Sequelize gives them): GEOMETRY or GEOGRAPHY columns in PostgreSQL
// (of a shape, 'POINT', and a SRID, when given), GeoJSON as json text in SQLite and as documents in MongoDB. The crs
// of a value is its SRID ({ type: 'name', properties: { name: 'EPSG:4326' } }).
class GeometryField extends Field {
  constructor(options = {}) {
    super(options);
    this.geography = Boolean(options.geography);
    this.shape = options.shape ? String(options.shape).toUpperCase() : null;
    this.srid = options.srid === undefined || options.srid === null ? null : Number(options.srid);
  }

  get type() {
    return 'geometry';
  }

  toValue(value) {
    return checkGeometry(typeof value === 'string' ? JSON.parse(value) : value);
  }

  jsonSchema() {
    return { type: 'object', required: ['type'] };
  }
}

// Arrays of the values of a field (as Django's ArrayField): fields.array(fields.string({ maxLength: 20 })). Native
// arrays in PostgreSQL (TEXT[], VARCHAR(20)[]...), json text in SQLite, arrays in MongoDB. Elements are checked by
// the base field (null elements are kept).
class ArrayField extends Field {
  constructor(base, options = {}) {
    super(options);
    if (!(base instanceof Field) || base instanceof ArrayField || base instanceof ForeignKey) {
      throw new TypeError('fields.array() takes a field of values (not a relation nor an array)');
    }
    this.base = base;
  }

  get type() {
    return 'array';
  }

  toValue(value) {
    if (!Array.isArray(value)) throw new ValueError('array');
    return value.map((item) => (item === null || item === undefined ? null : this.base.toValue(item)));
  }

  jsonSchema() {
    return { type: 'array', items: this.base.jsonSchema() };
  }
}

// Values of a field kept encrypted in the database (fields.encrypted(fields.string()), fields.encrypted(fields.json())):
// AES-256-GCM with the keys of the keyring (see encryption.js), as text in a TEXT column (strings in MongoDB). The
// objects have the values of the base field; the database never sees them. The memory backend keeps them as they are
// (nothing leaves the process).
//
// Encrypted values cannot be compared, sorted nor aggregated by the database: their fields take isnull in conditions,
// and nothing else. With `deterministic: true` the same value is the same text (for the same key), so they also take
// exact and in, and can be unique: the database can tell which rows have the same value (not what it is). Values
// written before the field was encrypted are read as they are with `acceptPlaintext: true` (until reencrypt() writes
// them encrypted). `context` binds the values to something else than the table and column (when one of them is
// renamed: the old names).
const NOT_DETERMINISTIC = new Set(['json', 'array', 'hstore', 'geometry']);

class EncryptedField extends Field {
  constructor(base, options = {}) {
    super(options);
    if (
      !(base instanceof Field) ||
      base instanceof EncryptedField ||
      base instanceof ForeignKey ||
      base instanceof IdField
    ) {
      throw new TypeError('fields.encrypted() takes a field of values (not a relation, a key nor an encrypted field)');
    }
    this.base = base;
    this.deterministic = Boolean(options.deterministic);
    this.acceptPlaintext = Boolean(options.acceptPlaintext);
    this.context = options.context;
    if (this.primaryKey) throw new TypeError('An encrypted field cannot be a primary key');
    if ((this.unique || this.index) && !this.deterministic) {
      throw new TypeError('An encrypted field is unique or indexed only when it is deterministic');
    }
    if (this.deterministic && NOT_DETERMINISTIC.has(base.type)) {
      throw new TypeError(`An encrypted ${base.type} field cannot be deterministic (its text is not canonical)`);
    }
  }

  get type() {
    return 'encrypted';
  }

  get dbType() {
    return 'text';
  }

  get encrypted() {
    return true;
  }

  bind(model, name) {
    super.bind(model, name);
    this.base.bind(model, name);
  }

  clone() {
    const field = super.clone();
    field.base = this.base.clone();
    return field;
  }

  toValue(value) {
    return this.base.toValue(value);
  }

  check(value) {
    const messages = super.check(value);
    if (value === null) return messages;
    return [...this.base.check(value), ...messages];
  }

  jsonSchema() {
    return this.base.jsonSchema();
  }

  // What the value is bound to: the table and column of the field.
  get aad() {
    if (this.context !== undefined) return String(this.context);
    const { meta } = this.model;
    return `${meta.schema ? `${meta.schema}.` : ''}${meta.table}.${this.column}`;
  }

  // The bytes of a value: Buffers as they are, the rest as JSON (dates as ISO text, bigints and the IEEE numbers as
  // text).
  serialize(value) {
    if (this.base.type === 'bytes') return value;
    let json = value;
    if (value instanceof Date) json = value.toISOString();
    else if (typeof value === 'bigint' || (typeof value === 'number' && !Number.isFinite(value))) json = String(value);
    return Buffer.from(JSON.stringify(json));
  }

  deserialize(bytes) {
    if (this.base.type === 'bytes') return bytes;
    return this.base.toValue(JSON.parse(bytes.toString()));
  }

  // The text stored for a value (null for null).
  seal(value) {
    if (value === null || value === undefined) return null;
    return getKeyring().seal(this.serialize(this.toValue(value)), this.aad, this.deterministic);
  }

  // The value of a stored text.
  open(text) {
    if (text === null || text === undefined) return null;
    if (!isEncrypted(text)) {
      // A value written before the field was encrypted (json as its text).
      if (this.acceptPlaintext) {
        return this.toValue(
          typeof text === 'string' && NOT_DETERMINISTIC.has(this.base.type) ? JSON.parse(text) : text
        );
      }
      throw new EncryptionError(`The value of ${this.model.name}.${this.name} in the database is not encrypted`);
    }
    return this.deserialize(getKeyring().open(text, this.aad));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class UuidField extends Field {
  constructor(options = {}) {
    // A primary key of uuids is generated when it is not given.
    super(options.primaryKey && options.default === undefined ? { ...options, default: randomUUID } : options);
  }

  get type() {
    return 'uuid';
  }

  toValue(value) {
    if (typeof value !== 'string' || !UUID.test(value)) throw new ValueError('uuid');
    return value.toLowerCase();
  }

  jsonSchema() {
    return { type: 'string', format: 'uuid' };
  }
}

const ON_DELETE = ['cascade', 'setNull', 'protect', 'doNothing'];
// What the database does with the rows that point to a row deleted (dbOnDelete): by default, nothing (the ORM does
// what onDelete says).
const DB_ON_DELETE = ['cascade', 'setNull', 'restrict', 'noAction'];

// The model a relation points to. `to` is the class, a function giving it (to point to models defined later), the name
// of a model registered in the same database, or 'self'.
function resolveModel(field, to) {
  let target;
  if (to === 'self') target = field.model;
  else if (typeof to === 'string') target = field.model.meta.db && field.model.meta.db.models.get(to);
  else if (typeof to === 'function' && to.prototype && typeof to.prototype.save === 'function') target = to;
  else if (typeof to === 'function') target = to();
  if (!target) throw new TypeError(`Cannot resolve the model of ${field.model.name}.${field.name}`);
  return target;
}

// A relation to one object of another model (or of the same). The object holds the key in `<name>Id` (its attname
// and, by default, its column) and the related object, once loaded, in `<name>`.
class ForeignKey extends Field {
  constructor(to, options = {}) {
    super(options);
    this.to = to;
    this.onDelete = options.onDelete || 'cascade';
    if (!ON_DELETE.includes(this.onDelete)) {
      throw new TypeError(`onDelete must be one of ${ON_DELETE.join(', ')} (it is ${this.onDelete})`);
    }
    if (this.onDelete === 'setNull' && !this.null) throw new TypeError('onDelete setNull needs a field with null');
    this.dbOnDelete = options.dbOnDelete;
    if (this.dbOnDelete !== undefined && !DB_ON_DELETE.includes(this.dbOnDelete)) {
      throw new TypeError(`dbOnDelete must be one of ${DB_ON_DELETE.join(', ')} (it is ${this.dbOnDelete})`);
    }
    // What the database does with the rows that point to a row whose key changes (ON UPDATE), with the same values.
    this.dbOnUpdate = options.dbOnUpdate;
    if (this.dbOnUpdate !== undefined && !DB_ON_DELETE.includes(this.dbOnUpdate)) {
      throw new TypeError(`dbOnUpdate must be one of ${DB_ON_DELETE.join(', ')} (it is ${this.dbOnUpdate})`);
    }
    this.relatedName = options.relatedName;
    this.resolvedTarget = undefined;
  }

  get type() {
    return 'foreignKey';
  }

  clone() {
    const field = super.clone();
    field.resolvedTarget = undefined;
    field.heldField = undefined;
    field.decoder = undefined;
    return field;
  }

  get dbType() {
    return this.targetField.dbType;
  }

  // The values of the key are made as those of the field it holds (the mode of its bigints or keys). Read for each
  // column of each row: the function is kept while the field it holds is the same.
  get fromDb() {
    const target = this.targetField;
    if (!this.decoder || this.decoder.target !== target) {
      this.decoder = { target, fn: target.fromDb ? (value) => target.fromDb(value) : undefined };
    }
    return this.decoder.fn;
  }

  // The field of the target the key holds: its primary key, or the unique field named by `toField`. Kept while the
  // target's meta is the same (it was looked for at each value read and written).
  get targetField() {
    const { meta } = this.target;
    if (this.heldField && this.heldField.meta === meta) return this.heldField.field;
    const field = this.findTargetField();
    this.heldField = { meta, field };
    return field;
  }

  findTargetField() {
    const { toField } = this.options;
    if (!toField && !this.target.meta.pk) {
      throw new TypeError(
        `${this.model.name}.${this.name} points to ${this.target.name}, which has no primary key (point it to a unique field with toField)`
      );
    }
    if (!toField && this.target.meta.pk.composite) {
      throw new TypeError(
        `${this.model.name}.${this.name} points to ${this.target.name}, whose primary key is composite (point it to a unique field with toField)`
      );
    }
    if (!toField) return this.target.meta.pk;
    const field = this.target.meta.field(toField);
    if (!field) throw new TypeError(`${this.target.name} has no field ${toField} (toField of ${this.name})`);
    return field;
  }

  // The key is in `<name>Id`, or in the attname given.
  bind(model, name) {
    super.bind(model, name);
    this.attname = this.options.attname || `${name}Id`;
    this.column = this.columnName || this.attname;
  }

  get target() {
    if (!this.resolvedTarget) this.resolvedTarget = resolveModel(this, this.to);
    return this.resolvedTarget;
  }

  toValue(value) {
    if (value && typeof value === 'object' && value.constructor && value.constructor.meta) {
      const key = value[this.targetField.attname];
      if (key === undefined || key === null) throw new TypeError('The related object is not saved.');
      return key;
    }
    return this.targetField.toValue(value);
  }

  jsonSchema() {
    return this.targetField.jsonSchema();
  }
}

// A relation of many objects to many of another model (or of the same), through a model with a foreign key to each
// (made when the models are registered, or given as `through`). It is no column: book.tags is the QuerySet of the
// tags of a book (with add, remove, set and clear), and the other model has the reverse one (relatedName).
class ManyToManyField {
  constructor(to, options = {}) {
    this.to = to;
    this.options = options;
    this.relatedName = options.relatedName;
    this.throughOption = options.through;
    // As other fields: what forms and the admin show of it, and whether a form may leave it empty (blank: true; by
    // default it may not, as Django's).
    this.label = typeof options.label === 'string' ? options.label : null;
    this.help = typeof options.help === 'string' ? options.help : null;
    this.blank = Boolean(options.blank);
    this.blankGiven = options.blank !== undefined;
    this.model = undefined;
    this.name = undefined;
    this.resolvedTarget = undefined;
    // Set when the models are registered: the through model and its foreign keys to this model and to the target.
    this.through = undefined;
    this.sourceKey = undefined;
    this.targetKey = undefined;
  }

  get type() {
    return 'manyToMany';
  }

  get target() {
    if (!this.resolvedTarget) this.resolvedTarget = resolveModel(this, this.to);
    return this.resolvedTarget;
  }

  bind(model, name) {
    this.model = model;
    this.name = name;
  }

  clone() {
    const field = new ManyToManyField(this.to, this.options);
    return field;
  }
}

// The body of an object of a blob backend (disk, memory-blob...): what is written is a Buffer, a string, a stream, a
// Blob of the web or a BlobValue (lib/blob.js); what is read is a BlobValue, whose body is read when asked. A model of
// a blob backend has one, and a primary key that is a string (the key of the object).
class BlobField extends Field {
  get type() {
    return 'blob';
  }

  toValue(value) {
    const { isBody } = blobModule;
    if (!isBody(value)) throw new ValueError('body');
    return value;
  }

  jsonSchema() {
    return {
      type: 'object',
      readOnly: true,
      properties: { size: { type: 'integer' }, contentType: { type: 'string' } },
    };
  }
}

// What a blob backend knows of each object, as a field: 'size' (bytes), 'etag', 'updatedAt' (a date) or
// 'contentType'. They are given by the backend (not required, and not written), except contentType, which is written
// with the body when it is given.
const BLOB_INFO = { size: 'integer', etag: 'string', updatedAt: 'datetime', contentType: 'string' };

class BlobInfoField extends Field {
  constructor(kind, options = {}) {
    if (!Object.hasOwn(BLOB_INFO, kind)) {
      throw new TypeError(`fields.blobInfo(kind): kind is ${Object.keys(BLOB_INFO).join(', ')} (it is ${kind})`);
    }
    super({ ...options, null: true });
    this.blobInfo = kind;
  }

  get type() {
    return BLOB_INFO[this.blobInfo];
  }

  get auto() {
    return true;
  }

  // Given by the backend: written only contentType.
  get readOnly() {
    return this.blobInfo !== 'contentType';
  }

  // Set on an object when it is created (Model.save() takes them from the row the backend wrote into).
  get givenByBackend() {
    return true;
  }

  toValue(value) {
    if (this.blobInfo === 'updatedAt') {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new ValueError('date');
      return date;
    }
    if (this.blobInfo === 'size') {
      if (!Number.isInteger(value)) throw new ValueError('integer');
      return value;
    }
    return String(value);
  }

  jsonSchema() {
    const schema =
      this.blobInfo === 'size'
        ? { type: 'integer' }
        : this.blobInfo === 'updatedAt'
          ? { type: 'string', format: 'date-time' }
          : { type: 'string' };
    return this.readOnly ? { ...schema, readOnly: true } : schema;
  }
}

// What a mail backend gives of a message it sent, as a field: 'messageId' (its Message-ID, without <>), 'accepted'
// (the recipients the server accepted), 'rejected' ([{ address, code, response }]), 'response' (the answer of the
// server to the message), 'sentAt' (a date) or 'raw' (the message as it was sent, MIME). Given by the backend: not
// required, and not written.
const MAIL_INFO = {
  messageId: 'string',
  accepted: 'json',
  rejected: 'json',
  response: 'string',
  sentAt: 'datetime',
  raw: 'text',
};

class MailInfoField extends Field {
  constructor(kind, options = {}) {
    if (!Object.hasOwn(MAIL_INFO, kind)) {
      throw new TypeError(`fields.mailInfo(kind): kind is ${Object.keys(MAIL_INFO).join(', ')} (it is ${kind})`);
    }
    super({ ...options, null: true });
    this.mailInfo = kind;
  }

  get type() {
    return MAIL_INFO[this.mailInfo];
  }

  get auto() {
    return true;
  }

  get readOnly() {
    return true;
  }

  get givenByBackend() {
    return true;
  }

  toValue(value) {
    if (this.mailInfo === 'sentAt') {
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) throw new ValueError('date');
      return date;
    }
    if (this.mailInfo === 'response' || this.mailInfo === 'raw' || this.mailInfo === 'messageId') return String(value);
    return value;
  }

  jsonSchema() {
    const schemas = {
      messageId: { type: 'string' },
      accepted: { type: 'array', items: { type: 'string' } },
      rejected: {
        type: 'array',
        items: {
          type: 'object',
          properties: { address: { type: 'string' }, code: { type: 'integer' }, response: { type: 'string' } },
        },
      },
      response: { type: 'string' },
      sentAt: { type: 'string', format: 'date-time' },
      raw: { type: 'string' },
    };
    return { ...schemas[this.mailInfo], readOnly: true };
  }
}

const fields = {
  Field,
  IdField,
  StringField,
  TextField,
  IntegerField,
  BigIntegerField,
  FloatField,
  DecimalField,
  DateField,
  BytesField,
  BooleanField,
  DateTimeField,
  JsonField,
  ArrayField,
  EncryptedField,
  GeometryField,
  HStoreField,
  UuidField,
  ForeignKey,
  ManyToManyField,
  BlobField,
  BlobInfoField,
  MailInfoField,
  id: (options) => new IdField(options),
  string: (options) => new StringField(options),
  text: (options) => new TextField(options),
  integer: (options) => new IntegerField(options),
  bigint: (options) => new BigIntegerField(options),
  float: (options) => new FloatField(options),
  decimal: (options) => new DecimalField(options),
  date: (options) => new DateField(options),
  bytes: (options) => new BytesField(options),
  boolean: (options) => new BooleanField(options),
  datetime: (options) => new DateTimeField(options),
  json: (options) => new JsonField(options),
  array: (base, options) => new ArrayField(base, options),
  encrypted: (base, options) => new EncryptedField(base, options),
  geometry: (options) => new GeometryField(options),
  hstore: (options) => new HStoreField(options),
  geography: (options) => new GeometryField({ ...options, geography: true }),
  uuid: (options) => new UuidField(options),
  foreignKey: (to, options) => new ForeignKey(to, options),
  manyToMany: (to, options) => new ManyToManyField(to, options),
  blob: (options) => new BlobField(options),
  blobInfo: (kind, options) => new BlobInfoField(kind, options),
  mailInfo: (kind, options) => new MailInfoField(kind, options),
  // The fields of a parent model with those of a child (theirs replace those of the same name; null removes one): what
  // the ORM merges anyway, written so TypeScript knows it (static fields = fields.extend(Timestamped, { ... })).
  extend(parent, own = {}) {
    if (typeof parent !== 'function') throw new TypeError('fields.extend(parent, fields): parent is a model');
    if (own === null || typeof own !== 'object')
      throw new TypeError('fields.extend(parent, fields): fields is an object');
    return { ...(parent.fields || {}), ...own };
  },
};

export default fields;

// The classes of the fields, by name too.
export {
  Field,
  IdField,
  StringField,
  TextField,
  IntegerField,
  BigIntegerField,
  FloatField,
  DecimalField,
  DateField,
  BytesField,
  BooleanField,
  DateTimeField,
  JsonField,
  ArrayField,
  EncryptedField,
  GeometryField,
  HStoreField,
  UuidField,
  ForeignKey,
  ManyToManyField,
  BlobField,
  BlobInfoField,
  MailInfoField,
};
