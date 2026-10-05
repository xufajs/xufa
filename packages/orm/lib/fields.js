// The fields of the models. A field knows its JavaScript value: it coerces what it is given (toValue), validates it
// (check) and gives defaults. How a value is stored is the business of each backend, which reads the field's `dbType`.
const { randomUUID } = require('node:crypto');
const { checkGeometry } = require('./geo');
const { getKeyring, isEncrypted } = require('./encryption');
const { EncryptionError } = require('./errors');
const { fieldValidators } = require('./rules');

const EMPTY = [];

class Field {
  constructor(options = {}) {
    this.options = options;
    this.null = Boolean(options.null);
    this.default = options.default;
    this.unique = Boolean(options.unique);
    this.index = Boolean(options.index);
    this.primaryKey = Boolean(options.primaryKey);
    this.choices = options.choices;
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
      if (!this.null && !this.auto) messages.push('This field is required.');
      return messages;
    }
    if (this.choices && !this.choices.includes(value)) {
      messages.push(`The value ${JSON.stringify(value)} is not a valid choice.`);
    }
    this.checkValue(value, messages);
    for (let i = 0; i < this.validators.length; i += 1) {
      const result = this.validators[i](value);
      if (typeof result === 'string') messages.push(result);
      else if (result === false) messages.push('The value is not valid.');
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
    throw new TypeError('The value must be a key (a number or a string).');
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
    throw new TypeError('The value must be a string.');
  }

  checkValue(value, messages) {
    if (this.maxLength !== undefined && value.length > this.maxLength) {
      messages.push(`Ensure this value has at most ${this.maxLength} characters (it has ${value.length}).`);
    }
    if (this.minLength !== undefined && value.length < this.minLength) {
      messages.push(`Ensure this value has at least ${this.minLength} characters (it has ${value.length}).`);
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
    if (this.min !== undefined && value < this.min) messages.push(`Ensure this value is at least ${this.min}.`);
    if (this.max !== undefined && value > this.max) messages.push(`Ensure this value is at most ${this.max}.`);
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
    if (!Number.isInteger(number)) throw new TypeError('The value must be an integer.');
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
    if (typeof number !== 'number' || Number.isNaN(number)) throw new TypeError('The value must be a number.');
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
    else throw new TypeError('The value must be an integer.');
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

  toValue(value) {
    const text = typeof value === 'number' || typeof value === 'bigint' ? String(value) : value;
    if (typeof text !== 'string' || !/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(text.trim())) {
      throw new TypeError('The value must be a decimal number.');
    }
    return text.trim();
  }

  jsonSchema() {
    return { type: 'string', pattern: '^-?\\d*\\.?\\d+$' };
  }
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
      if (Number.isNaN(value.getTime())) throw new TypeError('The value must be a date.');
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    if (typeof value !== 'string' || !DATE.test(value.slice(0, 10))) throw new TypeError('The value must be a date.');
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
    throw new TypeError('The value must be a Buffer.');
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
    throw new TypeError('The value must be true or false.');
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
    if (typeof value === 'boolean' || Number.isNaN(date.getTime())) throw new TypeError('The value must be a date.');
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
      throw new TypeError('The value must be an object of strings.');
    }
    const result = {};
    Object.keys(object).forEach((key) => {
      const item = object[key];
      if (item !== null && item !== undefined && typeof item === 'object') {
        throw new TypeError('The values of an hstore must be strings.');
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
    if (!Array.isArray(value)) throw new TypeError('The value must be an array.');
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
    if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError('The value must be a UUID.');
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
    return field;
  }

  get dbType() {
    return this.targetField.dbType;
  }

  // The values of the key are made as those of the field it holds (the mode of its bigints or keys).
  get fromDb() {
    const target = this.targetField;
    return target.fromDb ? (value) => target.fromDb(value) : undefined;
  }

  // The field of the target the key holds: its primary key, or the unique field named by `toField`.
  get targetField() {
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
};

module.exports = fields;
