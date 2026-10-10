// Model: the models of Sequelize (init or sequelize.define, find*, create, update, destroy, associations, hooks,
// scopes, paranoid models) over @xufa/orm. Each model has a model of @xufa/orm made from its attributes (its schema
// and queries), built before the first query; its instances keep their values in dataValues, as in Sequelize.
import {
  QuerySet,
  Model as XufaModel,
  fields as xufaFields,
  and,
  F,
  Count,
  Sum,
  Avg,
  Min,
  Max,
  parseHstore,
} from '@xufa/orm';
import { normalizeType, defaultValueOf, DataTypes, customParserOf, customStringifyOf } from './data-types.js';
import {
  generatedSql,
  sqlTypeOf,
  autoIncrementOf,
  enumTypeName,
  enumTypeSchema,
  enumTypeRef,
  createEnumSql,
  enumValuesOf,
  enumOptionsOf,
} from './sql-types.js';
import { deferrableSql } from './deferrable.js';
import { stringifyRange, parseRange } from './range.js';
import { Raw, fragmentOf, isFragment, columnSql, literalSql } from './fragments.js';
import { translateWhere, parseJsonPath, JsonRef } from './where.js';
import { validateInstance, checkEnums } from './validate.js';
import { whereSql, literal } from './query-interface.js';
import { BelongsTo, HasMany, HasOne, BelongsToMany } from './associations.js';
import { Op } from './operators.js';
import * as errors from './errors.js';
import { pluralize, singularize, underscore, isPlainObject } from './utils.js';

const { NotSupportedError, EmptyResultError, InstanceError, ValidationError, ValidationErrorItem } = errors;

// What runHooks gives when there are no hooks.
const NO_HOOKS_RUN = Promise.resolve();

const HOOKS = [
  'beforeValidate',
  'afterValidate',
  'validationFailed',
  'beforeCreate',
  'afterCreate',
  'beforeDestroy',
  'afterDestroy',
  'beforeRestore',
  'afterRestore',
  'beforeUpdate',
  'afterUpdate',
  'beforeSave',
  'afterSave',
  'beforeUpsert',
  'afterUpsert',
  'beforeBulkCreate',
  'afterBulkCreate',
  'beforeBulkDestroy',
  'afterBulkDestroy',
  'beforeBulkRestore',
  'afterBulkRestore',
  'beforeBulkUpdate',
  'afterBulkUpdate',
  'beforeFind',
  'beforeFindAfterExpandIncludeAll',
  'beforeFindAfterOptions',
  'afterFind',
  'beforeCount',
  'beforeSync',
  'afterSync',
];

// Hooks a model takes, as in Sequelize, without running them: sequelize.sync() runs those of the Sequelize instance.
const KEPT_HOOKS = ['beforeBulkSync', 'afterBulkSync'];

const DIRECTIONS = /^(ASC|DESC)( NULLS (FIRST|LAST))?$/i;
const AGGREGATES = { COUNT: Count, SUM: Sum, AVG: Avg, MIN: Min, MAX: Max };

function isInstance(value) {
  return value instanceof Model;
}

// Whether a value set changes the one before (dates by their time, objects always).
function sameValue(before, after) {
  if (before === after) return true;
  if (before instanceof Date && after instanceof Date) return before.getTime() === after.getTime();
  return false;
}

// The field of @xufa/orm of an attribute.
// Defaults of the database: the values (not functions, NOW nor UUIDs, which are given by the layer).
function dbDefaultOf(value) {
  // Infinity, -Infinity and NaN are text for the database ('Infinity' dates and numbers of PostgreSQL).
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  return undefined;
}

// `bigint`: how BIGINT values are given (the bigint option of Sequelize: number, bigint or string).
function xufaField(name, attribute, dialect, table, bigint) {
  const { type } = attribute;
  const options = {
    null: attribute.allowNull !== false && !attribute.primaryKey,
    column: attribute.field,
    unique: attribute.unique === true,
    primaryKey: Boolean(attribute.primaryKey),
    sqlType: attribute.xufaSqlSuffix
      ? `${sqlTypeOf(type, dialect, { table, column: attribute.field })}${attribute.xufaSqlSuffix}`
      : sqlTypeOf(type, dialect, { table, column: attribute.field }),
    dbDefault: attribute.primaryKey ? undefined : dbDefaultOf(attribute.defaultValue),
  };
  // A generated column (as Sequelize 7): GENERATED ALWAYS AS (its SQL) STORED or VIRTUAL, after its type.
  if (attribute.generatedAs !== undefined) {
    options.sqlType = `${options.sqlType || sqlTypeOf(type, dialect) || 'TEXT'}${generatedSql(name, attribute)}`;
    options.dbDefault = undefined;
  }
  if (attribute.primaryKey && attribute.autoIncrement) {
    // BIGINT keys are given as the bigint option says (as BIGINT values are).
    return xufaFields.id({
      column: attribute.field,
      sqlType: autoIncrementOf(type, dialect),
      mode: type.key === 'BIGINT' ? bigint : undefined,
    });
  }
  switch (type.kind) {
    case 'string':
      // Binary strings (STRING(n, true)) hold bytes.
      if (type.options.binary) return xufaFields.bytes(options);
      return xufaFields.string({ ...options, maxLength: type.options.length });
    case 'text':
      return xufaFields.text(options);
    case 'integer':
      return xufaFields.integer(options);
    case 'bigint':
      return xufaFields.bigint({ ...options, mode: bigint });
    case 'float':
      return xufaFields.float(options);
    case 'decimal':
      return xufaFields.decimal({ ...options, precision: type.options.precision, scale: type.options.scale });
    case 'boolean':
      return xufaFields.boolean(options);
    case 'datetime':
      return xufaFields.datetime(options);
    case 'date':
      return xufaFields.date(options);
    case 'json':
      // Arrays of PostgreSQL: native arrays of the field of their items.
      if (type.key === 'ARRAY' && dialect === 'postgres' && type.options.type) {
        const item = xufaField(
          name,
          { type: type.options.type, field: attribute.field, allowNull: true },
          dialect,
          table,
          bigint
        );
        return xufaFields.array(item, options);
      }
      return xufaFields.json(options);
    case 'uuid':
      return xufaFields.uuid(options);
    case 'bytes':
      return xufaFields.bytes(options);
    case 'range':
      // Ranges are their text (as PostgreSQL writes them), read back as bounds.
      return xufaFields.text(options);
    case 'hstore':
      return xufaFields.hstore(options);
    case 'geometry':
      return xufaFields.geometry({
        ...options,
        geography: type.key === 'GEOGRAPHY',
        shape: type.options.type,
        srid: type.options.srid,
      });
    default:
      throw new NotSupportedError(`The type ${type.key} (${name})`);
  }
}

// An include of an instance as its own property too (user.hasOwnProperty('tasks'), as Sequelize sets them), kept in
// its dataValues.
function exposeInclude(instance, as) {
  if (Object.prototype.hasOwnProperty.call(instance, as)) return;
  Object.defineProperty(instance, as, {
    get() {
      return this.dataValues[as];
    },
    set(value) {
      this.dataValues[as] = value;
    },
    enumerable: true,
    configurable: true,
  });
}

// The name of an aggregate function given (fn('COUNT', col('id'))): { fn, attribute, distinct }.
function aggregateOf(value) {
  if (!value || !value.xufaFn) return null;
  const name = value.xufaFn.toUpperCase();
  if (!AGGREGATES[name]) return null;
  let [arg] = value.args;
  let distinct = false;
  if (arg && arg.xufaFn && arg.xufaFn.toUpperCase() === 'DISTINCT') {
    distinct = true;
    [arg] = arg.args;
  }
  let attribute;
  if (arg && arg.xufaCol) attribute = arg.xufaCol;
  else if (typeof arg === 'string') attribute = arg;
  // Of other expressions (cast(), fn(), literal()...): not an aggregate of @xufa/orm, but SQL of its own.
  else if (arg !== undefined && arg !== null) return null;
  if (attribute === '*') attribute = undefined;
  return { fn: name, attribute, distinct };
}

class Model {
  // Definition

  static init(attributes, options = {}) {
    const { sequelize } = options;
    if (!sequelize) throw new Error('No Sequelize instance passed');
    const defaults = sequelize.options.define || {};
    // The options of define (sequelize.options.define) under those of the model; their objects merged.
    const merged = {
      ...defaults,
      ...options,
      hooks: { ...defaults.hooks, ...options.hooks },
      getterMethods: { ...defaults.getterMethods, ...options.getterMethods },
      setterMethods: { ...defaults.setterMethods, ...options.setterMethods },
    };
    delete merged.sequelize;
    merged.modelName = merged.modelName || this.name;
    merged.name = merged.name || { plural: pluralize(merged.modelName), singular: singularize(merged.modelName) };
    // beforeDefine can change the attributes and the options (the name of the model too).
    sequelize.xufaRunSync('beforeDefine', attributes, merged);
    const { modelName } = merged;
    if (modelName !== this.name) Object.defineProperty(this, 'name', { value: modelName });
    this.sequelize = sequelize;
    this.options = {
      timestamps: true,
      paranoid: false,
      underscored: false,
      freezeTableName: false,
      validate: {},
      ...merged,
    };
    const { fillfactor } = this.options;
    // Generated columns are checked when the model is defined (their SQL, their mode, no default).
    Object.entries(attributes || {}).forEach(([name, attribute]) => {
      if (attribute && typeof attribute === 'object' && attribute.generatedAs !== undefined)
        generatedSql(name, attribute);
    });
    if (this.options.strict && sequelize.dialectName !== 'sqlite') {
      throw new NotSupportedError(`The STRICT tables of SQLite in ${sequelize.dialectName} (${modelName})`);
    }
    if (fillfactor !== undefined && !(Number.isInteger(fillfactor) && fillfactor >= 10 && fillfactor <= 100)) {
      throw new Error(`${modelName}: fillfactor must be an integer from 10 to 100`);
    }
    this.underscored = this.options.underscored;
    this.tableName =
      this.options.tableName ||
      (this.options.freezeTableName
        ? modelName
        : this.underscored
          ? underscore(pluralize(modelName))
          : pluralize(modelName));
    // quoteIdentifiers: false (PostgreSQL): names as PostgreSQL makes the ones not quoted (in lower case), so SQL
    // that names them without quotes finds them.
    if (this.xufaUnquoted()) this.tableName = this.tableName.toLowerCase();
    this.associations = {};
    // The schema of the model, or the one of the Sequelize instance (options.schema).
    this.xufaSchema = this.options.schema || sequelize.options.schema || null;
    this.xufaDelimiter = this.options.schemaDelimiter || '.';
    this.xufaForeignKeys = new Map();
    this.xufaUniqueKeys = [];
    this.xufaBuilt = false;
    this.xufa = null;
    this.xufaHooks = {};
    this.xufaScope = null;
    this.xufaScopes = { ...this.options.scopes };
    if (this.options.defaultScope) this.xufaScope = this.options.defaultScope;
    this.rawAttributes = {};
    Object.entries(attributes).forEach(([name, definition]) => {
      this.rawAttributes[name] = this.normalizeAttribute(name, definition);
    });
    const primaryKeys = Object.keys(this.rawAttributes).filter((name) => this.rawAttributes[name].primaryKey);
    if (primaryKeys.length === 0) {
      this.rawAttributes = {
        id: {
          type: DataTypes.INTEGER(),
          allowNull: false,
          primaryKey: true,
          autoIncrement: true,
          field: 'id',
          fieldName: 'id',
          _autoGenerated: true,
        },
        ...this.rawAttributes,
      };
    } else if (primaryKeys.length > 1) {
      // A primary key of several columns (a composite key of @xufa/orm).
      primaryKeys.forEach((name) => {
        this.rawAttributes[name].allowNull = false;
      });
    }
    // The checks of Sequelize on definitions.
    const autoIncrements = Object.keys(this.rawAttributes).filter((name) => this.rawAttributes[name].autoIncrement);
    if (autoIncrements.length > 1)
      throw new Error('Invalid Instance definition. Only one autoincrement field allowed.');
    Object.entries(this.options.validate || {}).forEach(([name, validator]) => {
      if (Object.hasOwn(this.rawAttributes, name)) {
        throw new Error(
          `A model validator function must not have the same name as a field. Model: ${modelName}, field/validation name: ${name}`
        );
      }
      if (typeof validator !== 'function') {
        throw new Error(
          `Members of the validate option must be functions. Model: ${modelName}, error with validate member ${name}`
        );
      }
    });
    ['createdAt', 'updatedAt', 'deletedAt'].forEach((name) => {
      const value = this.options[name];
      if (value !== undefined && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new TypeError(`Value for "${name}" option must be a string or a boolean, got ${typeof value}`);
      }
    });
    // Timestamps (createdAt, updatedAt) and the deletedAt of paranoid models.
    const timestamp = (option, name) => {
      if (!this.options.timestamps || option === false) return null;
      return typeof option === 'string' ? option : name;
    };
    this.xufaTimestamps = {
      createdAt: timestamp(this.options.createdAt, 'createdAt'),
      updatedAt: timestamp(this.options.updatedAt, 'updatedAt'),
      deletedAt: this.options.paranoid ? timestamp(this.options.deletedAt, 'deletedAt') : null,
    };
    ['createdAt', 'updatedAt', 'deletedAt'].forEach((kind) => {
      const name = this.xufaTimestamps[kind];
      if (!name || this.rawAttributes[name]) return;
      this.rawAttributes[name] = {
        type: DataTypes.DATE(),
        allowNull: kind === 'deletedAt',
        field: this.underscored ? underscore(name) : name,
        fieldName: name,
        _autoGenerated: true,
        xufaGenerated: kind !== 'deletedAt',
      };
    });
    this._timestampAttributes = { ...this.xufaTimestamps };
    // Optimistic locking ({ version: true | name }): a version, increased by each update, that updates check.
    const { version } = this.options;
    this.xufaVersion = version ? (typeof version === 'string' ? version : 'version') : null;
    this._versionAttribute = this.xufaVersion || undefined;
    if (this.xufaVersion && !this.rawAttributes[this.xufaVersion]) {
      this.rawAttributes[this.xufaVersion] = {
        type: DataTypes.INTEGER(),
        allowNull: false,
        defaultValue: 0,
        field: this.xufaVersion,
        fieldName: this.xufaVersion,
        _autoGenerated: true,
      };
    }
    Object.entries(this.options.hooks || {}).forEach(([type, hooks]) => {
      [].concat(hooks).forEach((hook) => this.addHook(type, hook));
    });
    this.refreshAttributes();
    sequelize.modelManager.addModel(this);
    sequelize.xufaRunSync('afterDefine', this);
    return this;
  }

  // The default value of a timestamp attribute (as Sequelize: the default of its definition, when it has one).
  static xufaDefaultTimestamp(name) {
    const attribute = this.rawAttributes[name];
    return attribute && attribute.defaultValue ? defaultValueOf(attribute.defaultValue) : undefined;
  }

  // The attribute of a name of indexes: an attribute, or the column of one.
  static xufaAttributeOf(name) {
    if (this.rawAttributes[name]) return name;
    const attribute = Object.keys(this.rawAttributes).find((key) => this.rawAttributes[key].field === name);
    return attribute || name;
  }

  // COMMENT ON COLUMN of the attributes with a comment (PostgreSQL).
  static async xufaComments(options = {}) {
    const qi = this.sequelize.getQueryInterface();
    for (const name of this.xufaDbAttributes) {
      const { comment, field } = this.rawAttributes[name];
      if (!comment) continue;
      const text = String(comment).replace(/'/g, "''");
      await qi.raw(`COMMENT ON COLUMN ${qi.qt(this)}."${field.replace(/"/g, '""')}" IS '${text}'`, [], options);
    }
  }

  // The value deletedAt has while not deleted: its default (as Sequelize takes it), or null.
  static xufaUndeleted() {
    const attribute = this.rawAttributes[this.xufaTimestamps.deletedAt];
    return attribute && attribute.defaultValue !== undefined && attribute.defaultValue !== null
      ? defaultValueOf(attribute.defaultValue)
      : null;
  }

  // The condition on rows not deleted (of the path given, as conditions of @xufa/orm).
  static xufaNotDeleted(path = '') {
    const { deletedAt } = this.xufaTimestamps;
    const value = this.xufaUndeleted();
    return value === null ? { [`${path}${deletedAt}__isnull`]: true } : { [`${path}${deletedAt}`]: value };
  }

  static normalizeAttribute(name, definition) {
    const attribute =
      definition && typeof definition === 'object' && !definition.kind && 'type' in definition
        ? { ...definition }
        : { type: definition };
    try {
      if (attribute.type === undefined) throw new TypeError('Unrecognized data type');
      attribute.type = normalizeType(attribute.type);
    } catch (err) {
      if (!(err instanceof TypeError)) throw err;
      throw new Error(`Unrecognized datatype for attribute "${this.name}.${name}"`);
    }
    if (attribute.type.key === 'ENUM' && !(attribute.values || attribute.type.options.values || []).length) {
      throw new Error('Values for ENUM have not been defined.');
    }
    if (attribute.type.key === 'ARRAY' && !attribute.type.options.type) {
      throw new Error('ARRAY is missing type definition for its values.');
    }
    attribute.fieldName = name;
    attribute.field = attribute.field || (this.underscored ? underscore(name) : name);
    if (this.xufaUnquoted()) attribute.field = attribute.field.toLowerCase();
    // The values of an ENUM: of its type, or of the attribute.
    const values = attribute.type.options.values;
    if (!attribute.values && values && values.length) attribute.values = values;
    return attribute;
  }

  // The primary key and the accessors of the attributes on the prototype.
  static refreshAttributes() {
    this.xufaRefreshOwn();
    // A model and its copies in schemas have the same attributes: what is made of them is made again for each one.
    const base = this.xufaBase || this;
    [
      base,
      ...(base.xufaCopies ? base.xufaCopies.values() : []),
      ...(base.xufaSyncCopies ? base.xufaSyncCopies.values() : []),
    ]
      .filter((member) => member !== this && member.rawAttributes === this.rawAttributes)
      .forEach((member) => member.xufaRefreshOwn());
  }

  static xufaRefreshOwn() {
    const names = Object.keys(this.rawAttributes);
    this.primaryKeyAttributes = names.filter((name) => this.rawAttributes[name].primaryKey);
    [this.primaryKeyAttribute] = this.primaryKeyAttributes;
    this.primaryKeyField = this.primaryKeyAttribute ? this.rawAttributes[this.primaryKeyAttribute].field : undefined;
    this.tableAttributes = this.rawAttributes;
    this.xufaDbAttributes = names.filter((name) => this.rawAttributes[name].type.kind !== 'virtual');
    // Generated columns (as Sequelize 7: generatedAs): the database makes their values; they are read, not written.
    this.xufaGenerated = new Set(names.filter((name) => this.rawAttributes[name].generatedAs !== undefined));
    this.xufaGetters = new Map();
    this.xufaSetters = new Map();
    names.forEach((name) => {
      const attribute = this.rawAttributes[name];
      if (attribute.get) this.xufaGetters.set(name, attribute.get);
      if (attribute.set) this.xufaSetters.set(name, attribute.set);
      if (name in Model.prototype) return;
      Object.defineProperty(this.prototype, name, {
        configurable: true,
        get() {
          return this.get(name);
        },
        set(value) {
          this.set(name, value);
        },
      });
    });
    Object.entries(this.options.getterMethods || {}).forEach(([name, fn]) => {
      // The getters of attributes go first.
      if (this.xufaGetters.has(name)) return;
      this.xufaGetters.set(name, fn);
      if (!(name in Model.prototype)) {
        Object.defineProperty(this.prototype, name, {
          configurable: true,
          get: fn,
          set: this.options.setterMethods && this.options.setterMethods[name],
        });
      }
    });
    Object.entries(this.options.setterMethods || {}).forEach(([name, fn]) => {
      if (!this.xufaSetters.has(name)) this.xufaSetters.set(name, fn);
    });
  }

  static getAttributes() {
    return this.rawAttributes;
  }

  // The table, or (in a schema) { tableName, schema, delimiter, toString } as Sequelize gives it.
  static getTableName() {
    if (!this.xufaSchema) return this.tableName;
    return this.sequelize
      .getQueryInterface()
      .addSchema({ tableName: this.tableName, schema: this.xufaSchema, schemaDelimiter: this.xufaDelimiter });
  }

  // The name of the table in the database: 'schema.table' in a schema.
  static xufaTable() {
    return this.xufaSchema ? `${this.xufaSchema}${this.xufaDelimiter}${this.tableName}` : this.tableName;
  }

  // The model in a schema (before it is used).
  // The model a foreign key points to: its target, or (in a copy made by sync({ schema })) the target's copy in that
  // schema, as Sequelize makes the references of the tables it syncs in a schema.
  static xufaTargetOf(key) {
    return this.xufaRefSchema ? key.target.schema(this.xufaRefSchema, this.xufaDelimiter) : key.target;
  }

  // The copy that sync({ schema }) makes the table of: in the schema, with its references to the tables there.
  static xufaSyncCopy(schema, delimiter) {
    const base = this.xufaBase || this;
    if (!Object.hasOwn(base, 'xufaSyncCopies')) base.xufaSyncCopies = new Map();
    const cacheKey = `${schema}|${delimiter || base.xufaDelimiter}`;
    if (base.xufaSyncCopies.has(cacheKey)) return base.xufaSyncCopies.get(cacheKey);
    const copy = { [base.name]: class extends base {} }[base.name];
    base.xufaSyncCopies.set(cacheKey, copy);
    copy.xufaBase = base;
    copy.xufaSchema = schema;
    copy.xufaRefSchema = schema;
    copy.xufaDelimiter = delimiter || base.xufaDelimiter;
    copy.xufaBuilt = false;
    copy.xufa = null;
    copy.xufaCopy = 'sync';
    copy.options = { ...base.options, schema };
    return copy;
  }

  static schema(schema, options) {
    const delimiter = typeof options === 'string' ? options : options && options.schemaDelimiter;
    // A copy in the schema (as Sequelize does: the model itself is left as it is, built or not), with a model of
    // @xufa/orm of its own.
    if (schema !== this.xufaSchema || (delimiter && delimiter !== this.xufaDelimiter)) {
      const base = this.xufaBase || this;
      // One copy for each schema (and delimiter): its model of @xufa/orm is made once.
      if (!Object.hasOwn(base, 'xufaCopies')) base.xufaCopies = new Map();
      const cacheKey = `${schema || ''}\u0000${delimiter || base.xufaDelimiter}`;
      // The schema of the model itself: the model.
      if ((schema || null) === (base.xufaSchema || null) && (!delimiter || delimiter === base.xufaDelimiter))
        return base;
      if (base.xufaCopies.has(cacheKey)) return base.xufaCopies.get(cacheKey);
      const copy = { [base.name]: class extends base {} }[base.name];
      base.xufaCopies.set(cacheKey, copy);
      copy.xufaBase = base;
      copy.xufaSchema = schema || null;
      copy.xufaDelimiter = delimiter || base.xufaDelimiter;
      copy.xufaBuilt = false;
      copy.xufa = null;
      copy.xufaCopy = true;
      copy.options = { ...base.options, schema: copy.xufaSchema };
      return copy;
    }
    this.xufaSchema = schema || null;
    this.options.schema = this.xufaSchema;
    if (delimiter) this.xufaDelimiter = delimiter;
    return this;
  }

  static removeAttribute(name) {
    delete this.rawAttributes[name];
    this.refreshAttributes();
  }

  // The unique keys of the attributes, as Sequelize gives them: { name: { name, fields (columns), msg } }.
  static get uniqueKeys() {
    const keys = {};
    Object.values(this.rawAttributes).forEach((attribute) => {
      const { unique, field } = attribute;
      if (!unique) return;
      const name = typeof unique === 'string' ? unique : (unique && unique.name) || `${this.tableName}_${field}_unique`;
      if (!keys[name]) keys[name] = { name, fields: [], msg: (unique && unique.msg) || null, column: field };
      keys[name].fields.push(field);
    });
    return keys;
  }

  // The schema of the model, as Sequelize keeps it.
  static get _schema() {
    return this.xufaSchema || null;
  }

  static get primaryKeys() {
    return Object.fromEntries(this.primaryKeyAttributes.map((name) => [name, this.rawAttributes[name]]));
  }

  // The model of @xufa/orm of the model: its attributes as fields, its associations as foreign keys.
  static xufaBuild() {
    const fields = {};
    this.xufaPaths = new Map();
    const taken = new Set(Object.keys(this.rawAttributes));
    this.xufaDbAttributes.forEach((name) => {
      const attribute = this.rawAttributes[name];
      let key = this.xufaForeignKeys.get(name);
      // A polymorphic key (of associations to several models) is a column (no constraint of the database).
      if (key && key.loose) {
        fields[name] = xufaField(
          name,
          { ...attribute, references: undefined },
          this.sequelize.dialectName,
          this.xufaEnumTable(),
          this.sequelize.options.bigint
        );
        return;
      }
      // A primary key that references another table is a key of its own (@xufa/orm has no keys that are relations).
      if (!key && attribute.references && attribute.references.model && !attribute.primaryKey) {
        const target = this.sequelize.xufaModelOf(attribute.references.model);
        if (target) {
          const onDelete = { CASCADE: 'cascade', 'SET NULL': 'setNull', RESTRICT: 'restrict', 'NO ACTION': 'noAction' };
          key = {
            target,
            deferrable: attribute.references.deferrable,
            allowNull: attribute.allowNull !== false,
            dbOnDelete: attribute.onDelete ? onDelete[String(attribute.onDelete).toUpperCase()] : undefined,
            dbOnUpdate: attribute.onUpdate ? onDelete[String(attribute.onUpdate).toUpperCase()] : undefined,
          };
        }
      }
      if (!key) {
        // A reference to a table that is no model here: in the SQL of the column (the database checks it).
        const unresolved =
          attribute.references && typeof attribute.references.model === 'string' && !attribute.primaryKey
            ? ` REFERENCES "${attribute.references.model}" ("${attribute.references.key || 'id'}")`
            : '';
        const definition = unresolved ? { ...attribute, xufaSqlSuffix: unresolved } : attribute;
        fields[name] = xufaField(
          name,
          definition,
          this.sequelize.dialectName,
          this.xufaEnumTable(),
          this.sequelize.options.bigint
        );
        return;
      }
      // The field of the key is named by its association (author), or by the key without its suffix.
      let fieldName = key.fieldName || name.replace(/(_id|Id|_ID)$/, '');
      if (!fieldName || fieldName === name) fieldName = `${name}_ref`;
      while (taken.has(fieldName)) fieldName = `${fieldName}_`;
      taken.add(fieldName);
      const target = this.xufaTargetOf(key);
      fields[fieldName] = xufaFields.foreignKey(() => target.xufa, {
        // A key can be (part of) the primary key: the keys of through models are theirs.
        primaryKey: Boolean(attribute.primaryKey),
        dbConstraint: key.constraint === false ? false : undefined,
        attname: name,
        column: attribute.field,
        null: key.allowNull,
        onDelete: 'doNothing',
        dbOnDelete: key.dbOnDelete,
        dbOnUpdate: key.dbOnUpdate,
        relatedName: this.xufaCopy
          ? `xufa_${this.name}_${fieldName}@${this.xufaTable()}`
          : key.relatedName || `xufa_${this.name}_${fieldName}`,
        index: false,
        toField: key.toField,
        dbDeferrable: this.sequelize.dialectName === 'postgres' ? deferrableSql(key.deferrable) : undefined,
        sqlType: sqlTypeOf(attribute.type, this.sequelize.dialectName),
        dbDefault: dbDefaultOf(attribute.defaultValue),
      });
      this.xufaPaths.set(name, fieldName);
    });
    const indexes = [];
    // The indexes of the foreign keys of associations (as Sequelize 7): with the indexForeignKeys option of Sequelize,
    // or the index option of a key (true, false, or { unique, name }). Keys that lead the primary key have its index.
    this.xufaForeignKeys.forEach((key, name) => {
      const attribute = this.rawAttributes[name];
      const wanted = key.index !== undefined ? key.index : this.sequelize.options.indexForeignKeys === true;
      if (!wanted || !attribute || key.loose || this.primaryKeyAttributes[0] === name) return;
      const given = typeof wanted === 'object' ? wanted : {};
      indexes.push({
        fields: [name],
        unique: Boolean(given.unique),
        name: given.name || underscore(`${this.tableName}_${attribute.field}`),
      });
    });
    const groups = new Map();
    Object.entries(this.rawAttributes).forEach(([name, attribute]) => {
      const { unique } = attribute;
      if (!unique || unique === true) return;
      const group = typeof unique === 'string' ? unique : unique.name;
      // { unique: { msg } } without a name is a key of its own.
      if (!group) {
        indexes.push({ fields: [name], unique: true });
        return;
      }
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(name);
    });
    groups.forEach((names, name) => indexes.push({ fields: names, unique: true, name }));
    this.xufaUniqueKeys.forEach((names) => indexes.push({ fields: names, unique: true }));
    (this.options.indexes || []).forEach((index) => {
      // Indexes name attributes or their columns.
      const names = index.fields.map((field) => {
        const name = typeof field === 'string' ? field : field.name || field.attribute;
        if (this.rawAttributes[name]) return name;
        return Object.keys(this.rawAttributes).find((key) => this.rawAttributes[key].field === name) || name;
      });
      const spec = { fields: names, unique: Boolean(index.unique) };
      // Partial indexes: the SQL of their where.
      if (index.where) spec.condition = this.xufaConditionSql(index.where);
      // Named as Sequelize names them: the table and the columns, underscored.
      spec.name =
        index.name ||
        underscore(
          `${this.tableName}_${names.map((name) => (this.rawAttributes[name] ? this.rawAttributes[name].field : name)).join('_')}`
        );
      indexes.push(spec);
    });
    // Copies of a model in other schemas are models of @xufa/orm of their own names.
    // Models in other schemas (and copies of models in them) are models of @xufa/orm of their own names.
    // The copies made by sync({ schema }) are other models than those of Model.schema() (their references differ).
    let name = this.xufaCopy || this.xufaSchema ? `${this.name}@${this.xufaTable()}` : this.name;
    if (this.xufaCopy === 'sync') name = `${name}#sync`;
    const xufa = { [name]: class extends XufaModel {} }[name];
    xufa.fields = fields;
    // PostgreSQL keeps the schema apart from the name (a name can have dots); SQLite names the table 'schema.table'.
    xufa.options =
      this.xufaSchema && this.sequelize.dialectName === 'postgres'
        ? { table: this.tableName, schema: this.xufaSchema, indexes }
        : { table: this.xufaTable(), indexes };
    // fillfactor (PostgreSQL, 10 to 100): room left in the pages of the table for updated rows (as @xufa/orm takes it).
    if (this.options.fillfactor !== undefined) xufa.options.fillfactor = this.options.fillfactor;
    // strict (SQLite, as Sequelize 7): a STRICT table.
    if (this.options.strict) xufa.options.strict = true;
    // A model without primary key attributes (removeAttribute('id')) is a model of @xufa/orm without one: its table
    // has no key column (as a table of logs, or one made by others).
    if (this.primaryKeyAttributes.length === 0) xufa.options.primaryKey = false;
    this.xufa = xufa;
    this.xufaBuilt = true;
  }

  // After the model of @xufa/orm is registered: what the queries and the instances need.
  static xufaPrepare() {
    const { meta } = this.xufa;
    this.xufaMeta = meta;
    this.xufaFieldOf = new Map();
    this.xufaDbAttributes.forEach((name) => this.xufaFieldOf.set(name, meta.field(name)));
    this.xufaColumns = new Map(this.xufaDbAttributes.map((name) => [this.rawAttributes[name].field, name]));
    const model = this;
    const options = { isNewRecord: false, raw: true };
    // The instances of rows: their values are the row (and their values before changes, until one changes).
    function Instance(row) {
      this.dataValues = row;
      this._previousDataValues = row;
      this._changed = null;
      this.isNewRecord = false;
      this._options = options;
    }
    Instance.prototype = model.prototype;
    this.xufaInstance = Instance;
    // The attributes of ranges, and of arrays of ranges: { subtype, array }.
    this.xufaRanges = new Map();
    this.xufaDbAttributes.forEach((name) => {
      const { type } = this.rawAttributes[name];
      if (type.kind === 'range') this.xufaRanges.set(name, { subtype: type.options.subtype, array: false });
      const item = type.key === 'ARRAY' && type.options.type;
      if (item && item.kind === 'range') this.xufaRanges.set(name, { subtype: item.options.subtype, array: true });
    });
  }

  // A value of an attribute as @xufa/orm stores it: ranges (and arrays of them) as their text; others as they are.
  static xufaRangeText(name, value) {
    const range = this.xufaRanges.get(name);
    if (!range || value === null || value === undefined) return value;
    return range.array && Array.isArray(value) ? value.map(stringifyRange) : stringifyRange(value);
  }

  static get xufaDb() {
    return this.sequelize.xufaDb;
  }

  static get xufaBackend() {
    return this.sequelize.xufaDb.backend;
  }

  // Before the first query: the models built and the database connected.
  static xufaReady() {
    const { sequelize } = this;
    if (sequelize.xufaIsReady && !sequelize.xufaPending && this.xufaBuilt) return undefined;
    return sequelize.xufaReady(this);
  }

  // Associations

  static belongsTo(target, options = {}) {
    const association = new BelongsTo(this, target, { ...options });
    this.xufaAddAssociation(association);
    return association;
  }

  static hasMany(target, options = {}) {
    const association = new HasMany(this, target, { ...options });
    this.xufaAddAssociation(association);
    return association;
  }

  static hasOne(target, options = {}) {
    const association = new HasOne(this, target, { ...options });
    this.xufaAddAssociation(association);
    return association;
  }

  static belongsToMany(target, options = {}) {
    const association = new BelongsToMany(this, target, { ...options });
    this.xufaAddAssociation(association);
    return association;
  }

  // The instances included are properties of their alias too (book.author).
  static xufaAddAssociation(association) {
    const { as } = association;
    if (association.isAliased && this.associations[as] && this.associations[as].target !== association.target) {
      throw new errors.AssociationError(
        `You have used the alias ${as} in two separate associations. Aliased associations must have unique aliases.`
      );
    }
    this.associations[as] = association;
    this.xufaDefineValue(as);
    // The targets of belongsToMany have their through instance under its name (tag.BookTags).
    if (association.throughModel) {
      association.target.xufaDefineValue(association.throughModel.name);
      if (!Object.hasOwn(association.target, 'xufaThroughNames')) association.target.xufaThroughNames = new Set();
      association.target.xufaThroughNames.add(association.throughModel.name);
    }
  }

  static xufaDefineValue(name) {
    if (name in Model.prototype || this.rawAttributes[name] || Object.hasOwn(this.prototype, name)) return;
    Object.defineProperty(this.prototype, name, {
      configurable: true,
      get() {
        return this.dataValues[name];
      },
      set(value) {
        // The values of through rows (item.Through = { ... }) are kept as they are.
        if (this.constructor.associations[name]) this.set(name, value);
        else this.dataValues[name] = value;
      },
    });
  }

  static getAssociations(target) {
    return Object.values(this.associations).filter((association) => association.target.name === target.name);
  }

  static getAssociationForAlias(target, alias) {
    return this.getAssociations(target).find((association) => association.verifyAssociationAlias(alias)) || null;
  }

  static hasAlias(alias) {
    return Object.hasOwn(this.associations, alias);
  }

  // Hooks

  static addHook(type, name, fn) {
    const hook = typeof name === 'function' ? name : fn;
    if (!HOOKS.includes(type) && !KEPT_HOOKS.includes(type)) throw new Error(`${type} is not a hook`);
    if (!Object.hasOwn(this, 'xufaHooks')) this.xufaHooks = { ...this.xufaHooks };
    this.xufaHooks[type] = [
      ...(this.xufaHooks[type] || []),
      { name: typeof name === 'string' ? name : undefined, fn: hook },
    ];
    return this;
  }

  static removeHook(type, nameOrFn) {
    const hooks = this.xufaHooks[type] || [];
    this.xufaHooks[type] = hooks.filter((hook) => hook.name !== nameOrFn && hook.fn !== nameOrFn);
    return this;
  }

  static hasHook(type) {
    return Boolean((this.xufaHooks[type] || []).length || this.sequelize.xufaHasHook(type));
  }

  static hasHooks(type) {
    return this.hasHook(type);
  }

  // A promise of the hooks run in turn; a resolved one at once when there are none (most calls).
  static runHooks(type, ...args) {
    return this.xufaHook(type, ...args) || NO_HOOKS_RUN;
  }

  // The promise of the hooks of a type, or nothing when there are none: what writes run without waiting.
  static xufaHook(type, ...args) {
    const global = this.sequelize.xufaHookList(type);
    const own = this.xufaHooks[type];
    if (global.length === 0 && !(own && own.length)) return undefined;
    return this.xufaRunHooks(own ? [...global, ...own] : global, args);
  }

  static async xufaRunHooks(hooks, args) {
    for (let i = 0; i < hooks.length; i += 1) await hooks[i].fn.apply(this, args);
  }

  // Scopes

  static addScope(name, scope, options = {}) {
    if (name === 'defaultScope') this.xufaScope = scope;
    else if (this.xufaScopes[name] && !options.override) throw new Error(`The scope ${name} already exists`);
    else this.xufaScopes[name] = scope;
  }

  // A model with the scopes named (or given as objects, or { method: [name, ...args] } for scopes of functions).
  static scope(...items) {
    // A scoped model is of the model it scopes: its base (for a scoped model), or itself (a copy in a schema too).
    const base = Object.hasOwn(this, 'xufaIsScoped') ? this.xufaBase : this;
    let scope = {};
    items.flat().forEach((item) => {
      if (item === null || item === undefined) return;
      let options;
      if (typeof item === 'string') {
        if (item === 'defaultScope') options = base.xufaScope || {};
        else {
          const defined = base.xufaScopes[item];
          if (!defined) throw new errors.SequelizeScopeError(`Invalid scope ${item} called.`);
          options = typeof defined === 'function' ? defined() : defined;
        }
      } else if (item.method) {
        const [name, ...args] = [].concat(item.method);
        options = base.xufaScopes[name](...args);
      } else options = item;
      scope = mergeOptions(scope, options);
    });
    const scoped = { [base.name]: class extends base {} }[base.name];
    scoped.xufaBase = base;
    scoped.xufaIsScoped = true;
    scoped.xufaScope = scope;
    return scoped;
  }

  static unscoped() {
    return this.scope();
  }

  // The options with the scope of the model (unless they had it already: xufaNoScope).
  static xufaScoped(options) {
    options = this.sequelize.constructor.xufaWithCLS(options);
    if (options && options.xufaNoScope) return options;
    return this.xufaScope ? mergeOptions(this.xufaScope, options) : options;
  }

  // Building instances

  static build(values, options = {}) {
    if (Array.isArray(values)) return values.map((item) => this.build(item, options));
    return new this(values, options);
  }

  static bulkBuild(values, options = {}) {
    return values.map((item) => this.build(item, options));
  }

  // Whether the names are those PostgreSQL makes of names not quoted (quoteIdentifiers: false of Sequelize, or of the
  // model).
  static xufaUnquoted() {
    const quoting =
      this.options && this.options.quoteIdentifiers !== undefined ? this.options.quoteIdentifiers : undefined;
    const value = quoting !== undefined ? quoting : this.sequelize && this.sequelize.options.quoteIdentifiers;
    return value === false && this.sequelize.dialectName === 'postgres';
  }

  // The parse and stringify functions given to the types of the attributes (after sequelize.refreshTypes()):
  // { parsers: attribute -> parse, stringifiers: attribute -> type }.
  static xufaCustomTypes() {
    const version = this.sequelize.xufaTypesVersion || 0;
    if (this.xufaCustom && this.xufaCustom.version === version) return this.xufaCustom;
    // The types with functions given (which are looked up when used: they can be taken back).
    const parsers = new Map();
    const stringifiers = new Map();
    if (version) {
      this.xufaDbAttributes.forEach((name) => {
        const { type } = this.rawAttributes[name];
        if (customParserOf(type)) parsers.set(name, type);
        if (customStringifyOf(type)) stringifiers.set(name, type);
      });
    }
    this.xufaCustom = { version, parsers, stringifiers };
    return this.xufaCustom;
  }

  // An instance of a row of @xufa/orm (values by attribute), with the instances of the joined includes in it.
  static xufaFromRow(row, joined) {
    // The parse functions given to types (as Sequelize calls them for the values read).
    const { parsers } = this.xufaCustomTypes();
    if (parsers.size) {
      parsers.forEach((type, name) => {
        const parse = customParserOf(type);
        if (parse && name in row && row[name] !== null && row[name] !== undefined) row[name] = parse(row[name]);
      });
    }
    // Ranges as their bounds.
    if (this.xufaRanges.size) {
      this.xufaRanges.forEach(({ subtype, array }, name) => {
        if (!(name in row)) return;
        const value = row[name];
        if (array) row[name] = Array.isArray(value) ? value.map((item) => parseRange(item, subtype)) : value;
        else row[name] = parseRange(value, subtype);
      });
    }
    if (joined) {
      for (let i = 0; i < joined.length; i += 1) {
        const node = joined[i];
        const key = `$${node.fieldName}`;
        let related = row[key];
        delete row[key];
        if (related && node.deletedAt && related[node.deletedAt] !== null && related[node.deletedAt] !== undefined) {
          related = null;
        }
        if (node.attributes && node.attributes.length === 0) continue;
        row[node.as] = related ? node.model.xufaFromRow(related, node.children) : null;
        if (related && node.attributes) row[node.as].xufaKeep(node.attributes);
      }
    }
    const instance = new this.xufaInstance(row);
    if (joined) {
      for (let i = 0; i < joined.length; i += 1) if (joined[i].as in row) exposeInclude(instance, joined[i].as);
    }
    return instance;
  }

  // Keeps only some attributes (and the includes): those of include.attributes.
  xufaKeep(names) {
    const keep = new Set(names);
    const { associations } = this.constructor;
    Object.keys(this.dataValues).forEach((key) => {
      const value = this.dataValues[key];
      // The includes stay (a belongsTo not found is null).
      if (keep.has(key) || isInstance(value) || Array.isArray(value) || associations[key]) return;
      delete this.dataValues[key];
    });
  }

  constructor(values = {}, options = {}) {
    const model = this.constructor;
    this.dataValues = {};
    this._previousDataValues = {};
    this._changed = null;
    this.isNewRecord = options.isNewRecord !== undefined ? options.isNewRecord : true;
    this._options = options;
    if (this.isNewRecord) {
      const attributes = model.rawAttributes;
      const names = Object.keys(attributes);
      const { deletedAt } = model.xufaTimestamps;
      for (let i = 0; i < names.length; i += 1) {
        const name = names[i];
        const attribute = attributes[name];
        // As Sequelize: the default of deletedAt (paranoid) is set even when a value is given; the value then replaces
        // it, unless deletedAt is in the primary key (a primary key set is not changed).
        if (values && name in values && !(name === deletedAt && attribute.defaultValue !== undefined)) continue;
        if (attribute.defaultValue !== undefined) this.dataValues[name] = defaultValueOf(attribute.defaultValue);
        else if (attribute.primaryKey && attribute.autoIncrement) this.dataValues[name] = null;
      }
      Object.keys(this.dataValues).forEach((name) => {
        this._changed = this._changed || new Set();
        this._changed.add(name);
      });
    }
    // The values it is built with: the timestamps of a saved instance too (build(saved.toJSON(), { isNewRecord:
    // false }) keeps them, as Sequelize 7).
    if (values) this.set(values, { raw: options.raw, xufaInitial: true });
    if (!this.isNewRecord) {
      this._previousDataValues = { ...this.dataValues };
      this._changed = null;
    }
  }

  get sequelize() {
    return this.constructor.sequelize;
  }

  get rawAttributes() {
    return this.constructor.rawAttributes;
  }

  get Model() {
    return this.constructor;
  }

  // Values

  get(key, options) {
    if (key !== undefined && key !== null && typeof key === 'object') {
      options = key;
      key = undefined;
    }
    const model = this.constructor;
    if (key !== undefined) {
      if (!(options && options.raw)) {
        const getter = model.xufaGetters.get(key);
        if (getter) return getter.call(this, key, options || {});
      }
      const value = this.dataValues[key];
      if (options && options.plain) return plainOf(value, options);
      return value;
    }
    const result = {};
    const keys = Object.keys(this.dataValues);
    const plain = options && options.plain;
    for (let i = 0; i < keys.length; i += 1) {
      const name = keys[i];
      const value = this.get(name, options && options.raw ? options : undefined);
      result[name] = plain ? plainOf(value, options) : value;
    }
    const asked = this._options && this._options.attributes;
    let added = false;
    model.xufaGetters.forEach((getter, name) => {
      if (asked && !asked.includes(name)) return;
      if (!(name in result) && !(options && options.raw)) {
        const value = getter.call(this, name, options || {});
        result[name] = plain ? plainOf(value, options) : value;
        added = true;
      }
    });
    if (!added) return result;
    // The values of getters (virtual attributes) in the order of the attributes (as Sequelize 7), then the rest.
    const ordered = {};
    Object.keys(model.rawAttributes).forEach((name) => {
      if (name in result) ordered[name] = result[name];
    });
    Object.keys(result).forEach((name) => {
      if (!(name in ordered)) ordered[name] = result[name];
    });
    return ordered;
  }

  getDataValue(key) {
    return this.dataValues[key];
  }

  set(key, value, options) {
    if (key !== null && typeof key === 'object' && !Array.isArray(key)) {
      const values = valuesOf(this.constructor, key);
      const names = Object.keys(values);
      for (let i = 0; i < names.length; i += 1) this.set(names[i], values[names[i]], value);
      return this;
    }
    const model = this.constructor;
    if (!(options && options.raw)) {
      const setter = model.xufaSetters.get(key);
      if (setter) {
        setter.call(this, value, key);
        return this;
      }
    }
    // The instances of includes.
    if (
      model.associations[key] &&
      (value === null || isInstance(value) || Array.isArray(value) || isPlainObject(value))
    ) {
      const association = model.associations[key];
      const target = association.target;
      const make = (item) =>
        isInstance(item) || item === null ? item : target.build(item, { isNewRecord: this.isNewRecord });
      this.dataValues[key] = Array.isArray(value) ? value.map(make) : make(value);
      exposeInclude(this, key);
      return this;
    }
    if (model.xufaThroughNames && model.xufaThroughNames.has(key) && !model.rawAttributes[key]) {
      this.dataValues[key] = value;
      return this;
    }
    if (!model.rawAttributes[key] && !(options && options.raw)) return this;
    if (!(options && options.raw)) {
      // As Sequelize: a primary key set is not changed, nor the timestamps of a saved instance.
      if (model.primaryKeyAttributes.includes(key) && this.dataValues[key]) return this;
      if (!this.isNewRecord && !(options && options.xufaInitial) && Object.values(model.xufaTimestamps).includes(key))
        return this;
      // The value before, for previous() of values not saved yet.
      if (key in this.dataValues && !(key in this._previousDataValues)) {
        if (!this.xufaBefore) this.xufaBefore = {};
        this.xufaBefore[key] = this.dataValues[key];
      }
      // As Sequelize's sanitizers of dates: strings and numbers set are Dates (DATE) or days (DATEONLY), and
      // 'Infinity' and '-Infinity' (in any case) are Infinity and -Infinity. Expressions of SQL are left as they are.
      const { type } = model.rawAttributes[key] || {};
      if (
        type &&
        (type.kind === 'datetime' || type.kind === 'date') &&
        value !== null &&
        value !== undefined &&
        !isFragment(value) &&
        value.xufaCol === undefined
      ) {
        value = type._sanitize(value);
      }
      // BIGINT values set are as the database gives them (the bigint option: bigints or strings).
      const { bigint } = model.sequelize.options;
      if (
        type &&
        type.kind === 'bigint' &&
        (bigint === 'bigint' || bigint === 'string') &&
        ((typeof value === 'number' && Number.isInteger(value)) ||
          typeof value === 'bigint' ||
          (typeof value === 'string' && /^-?\d+$/.test(value)))
      ) {
        value = bigint === 'bigint' ? BigInt(value) : String(value);
      }
    }
    this.setDataValue(key, value);
    return this;
  }

  setDataValue(key, value) {
    if (this._previousDataValues === this.dataValues) this._previousDataValues = { ...this.dataValues };
    const before = this._previousDataValues[key];
    this.dataValues[key] = value;
    if (!sameValue(before, value) || (value !== null && typeof value === 'object' && !(value instanceof Date))) {
      if (!this._changed) this._changed = new Set();
      this._changed.add(key);
    } else if (this._changed) this._changed.delete(key);
  }

  changed(key, value) {
    if (key === undefined) return this._changed && this._changed.size ? [...this._changed] : false;
    if (value === undefined) return Boolean(this._changed && this._changed.has(key));
    if (!this._changed) this._changed = new Set();
    if (value) this._changed.add(key);
    else this._changed.delete(key);
    return this;
  }

  previous(key) {
    const before = this.xufaBefore || {};
    if (key === undefined) {
      const result = {};
      (this._changed || []).forEach((name) => {
        if (name in this._previousDataValues) result[name] = this._previousDataValues[name];
        else if (name in before) result[name] = before[name];
      });
      return result;
    }
    return key in this._previousDataValues ? this._previousDataValues[key] : before[key];
  }

  toJSON() {
    return this.get({ plain: true });
  }

  // The condition of the row of this instance, for its writes and reloads. Sequelize gives {} for a model without a
  // primary key, which would write every row of the table: an instance of such a model is only created.
  xufaKeyWhere(action) {
    const model = this.constructor;
    if (model.primaryKeyAttributes.length === 0) {
      throw new errors.InstanceError(
        `A ${model.name} cannot be ${action}: the model has no primary key (use ${model.name}.update() and ${model.name}.destroy() with a where)`
      );
    }
    return this.where();
  }

  where() {
    const model = this.constructor;
    return Object.fromEntries(model.primaryKeyAttributes.map((name) => [name, this.dataValues[name]]));
  }

  equals(other) {
    if (!other || other.constructor.xufa !== this.constructor.xufa) return false;
    return this.constructor.primaryKeyAttributes.every((name) => this.dataValues[name] === other.dataValues[name]);
  }

  equalsOneOf(others) {
    return others.some((other) => this.equals(other));
  }

  setAttributes(values) {
    return this.set(values);
  }

  // The hooks of the model, from its instances (as Sequelize has them on both).
  addHook(...args) {
    this.constructor.addHook(...args);
    return this;
  }

  removeHook(...args) {
    this.constructor.removeHook(...args);
    return this;
  }

  hasHook(type) {
    return this.constructor.hasHook(type);
  }

  hasHooks(type) {
    return this.constructor.hasHook(type);
  }

  isSoftDeleted() {
    const { deletedAt } = this.constructor.xufaTimestamps;
    if (!deletedAt) throw new InstanceError('Model is not paranoid');
    const value = this.dataValues[deletedAt];
    return value !== null && value !== undefined && new Date(value) <= new Date();
  }

  async validate(options = {}) {
    await validateInstance(this, options);
  }

  // The values of the attributes stored (all, or those given) for @xufa/orm.
  xufaRow(names) {
    const model = this.constructor;
    const row = {};
    const problems = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      const value = this.dataValues[name];
      // A key the database gives is not sent, nor are the values of generated columns.
      if (value === undefined || (value === null && name === model.primaryKeyAttribute)) continue;
      if (model.xufaGenerated.has(name)) continue;
      // Expressions of SQL (fn, col, literal) as they are.
      if (isFragment(value) || (value && value.xufaCol !== undefined)) {
        const { sql, params } = fragmentOf(new Context(model), value);
        row[name] = { kind: 'raw', sql, params };
        continue;
      }
      try {
        let stored = model.xufaRangeText(name, xufaStringified(model, name, value));
        // Strings take other values as their text (as Sequelize stores them).
        const { kind } = model.rawAttributes[name].type;
        if ((kind === 'string' || kind === 'text') && stored !== null && typeof stored !== 'string') {
          if (stored instanceof Date) stored = stored.toISOString();
          else if (typeof stored !== 'object') stored = String(stored);
        }
        row[name] = model.xufaFieldOf.get(name).clean(stored);
      } catch (err) {
        problems.push(new ValidationErrorItem(err.message, 'Validation error', name, value, this, 'type'));
      }
    }
    if (problems.length) throw new ValidationError(null, problems);
    checkEnums(model, row, this);
    return row;
  }

  // Saving

  async save(options = {}) {
    const model = this.constructor;
    options = model.sequelize.constructor.xufaWithCLS(options);
    const ready = model.xufaReady();
    if (ready) await ready;
    if (options.include) return model.sequelize.xufaRun(options, () => this.xufaSaveWithIncludes(options));
    return model.sequelize.xufaRun(options, () =>
      this.isNewRecord ? this.xufaInsert(options) : this.xufaUpdate(options)
    );
  }

  // Saves the instances of the includes too: those it points to (belongsTo) first, then it, then those that point to
  // it (hasMany, hasOne) and those linked to it (belongsToMany, with the values of their through model).
  async xufaSaveWithIncludes(options) {
    const model = this.constructor;
    const includes = normalizeIncludes(model, options.include);
    // As Sequelize: the options of the include (with its own keys), the transaction and logging, and parentRecord.
    const nested = (include) => ({
      ...include.xufaOptions,
      association: undefined,
      model: undefined,
      where: undefined,
      transaction: options.transaction,
      logging: options.logging,
      parentRecord: this,
      include: include.include.length ? include.include : undefined,
    });
    for (const include of includes) {
      const { association } = include;
      const value = this.dataValues[association.as];
      if (association.associationType !== 'BelongsTo' || !isInstance(value)) continue;
      if (value.isNewRecord || value.changed()) await value.save(nested(include));
      this.set(association.foreignKey, value.get(association.targetKey, { raw: true }));
    }
    // The includes that point to it are saved after it, before its after hooks.
    const children = async () => {
      for (const include of includes) {
        const { association } = include;
        const items = [].concat(this.dataValues[association.as] || []).filter(isInstance);
        if (association.associationType === 'HasMany' || association.associationType === 'HasOne') {
          for (const item of items) {
            item.set(
              { ...association.scope, [association.foreignKey]: this.get(association.sourceKey, { raw: true }) },
              { raw: true }
            );
            await item.save(nested(include));
          }
        } else if (association.associationType === 'BelongsToMany') {
          const through = association.throughModel;
          for (const item of items) {
            if (item.isNewRecord || item.changed()) await item.save(nested(include));
            const extra = item.dataValues[through.name];
            const values = extra && isInstance(extra) ? extra.get() : extra || {};
            const link = await through.create(
              {
                ...values,
                ...association.throughScope,
                [association.foreignKey]: this.get(association.sourceKey, { raw: true }),
                [association.otherKey]: item.get(association.targetKey, { raw: true }),
              },
              { transaction: options.transaction }
            );
            item.dataValues[through.name] = link;
          }
        }
      }
    };
    const own = { ...options, include: undefined, xufaChildren: children };
    if (this.isNewRecord) await this.xufaInsert(own);
    else await this.xufaUpdate(own);
    return this;
  }

  // The validation of a write: nothing to wait for (or a ValidationError thrown) when there are no hooks of validation
  // nor validators, its promise otherwise.
  xufaValidate(options, fields) {
    if (options.validate === false) return undefined;
    const model = this.constructor;
    if (
      options.hooks !== false &&
      (model.hasHook('beforeValidate') || model.hasHook('afterValidate') || model.hasHook('validationFailed'))
    ) {
      return this.xufaValidateWithHooks(options, fields);
    }
    return validateInstance(this, fields ? { fields, skipModel: false } : {});
  }

  async xufaValidateWithHooks(options, fields) {
    const model = this.constructor;
    if (options.hooks !== false) await model.runHooks('beforeValidate', this, options);
    try {
      await validateInstance(this, fields ? { fields, skipModel: false } : {});
    } catch (err) {
      if (options.hooks !== false && model.hasHook('validationFailed'))
        await model.runHooks('validationFailed', this, options, err);
      throw err;
    }
    if (options.hooks !== false) await model.runHooks('afterValidate', this, options);
  }

  async xufaInsert(options) {
    const model = this.constructor;
    const { createdAt, updatedAt } = model.xufaTimestamps;
    const now = new Date();
    if (createdAt && (this.dataValues[createdAt] === undefined || this.dataValues[createdAt] === null)) {
      this.setDataValue(createdAt, model.xufaDefaultTimestamp(createdAt) || now);
    }
    if (updatedAt && !(options.silent && this.dataValues[updatedAt])) {
      this.setDataValue(updatedAt, model.xufaDefaultTimestamp(updatedAt) || now);
    }
    // With fields, only those are validated.
    const validating = this.xufaValidate(options, options.fields);
    if (validating) await validating;
    const hooks = options.hooks !== false;
    if (hooks) {
      const before = model.xufaHook('beforeCreate', this, options);
      if (before) await before;
      const beforeSave = model.xufaHook('beforeSave', this, options);
      if (beforeSave) await beforeSave;
    }
    const names = options.fields
      ? model.xufaDbAttributes.filter(
          (name) => options.fields.includes(name) || name === createdAt || name === updatedAt
        )
      : model.xufaDbAttributes;
    const row = this.xufaRow(names);
    // ignoreDuplicates: a row that breaks a unique key is not inserted (nor an error): nothing is read back.
    const ignore = Boolean(options.ignoreDuplicates);
    const [pk] = await model.xufaBackend.insert(
      model.xufaMeta,
      [row],
      ignore ? { conflict: { fields: [], update: null } } : undefined
    );
    const pkName = model.primaryKeyAttribute;
    const missing = this.dataValues[pkName] === null || this.dataValues[pkName] === undefined;
    if (missing && (pk !== null || !ignore)) this.dataValues[pkName] = pk;
    if (!ignore || (pk !== null && pk !== undefined)) {
      await this.xufaReadBack(names, options);
      await this.xufaReadRanges(names, options);
    }
    this.isNewRecord = false;
    if (options.xufaChildren) await options.xufaChildren();
    // The changes are there for the hooks after (as Sequelize keeps them).
    if (hooks) {
      const after = model.xufaHook('afterCreate', this, options);
      if (after) await after;
      const afterSave = model.xufaHook('afterSave', this, options);
      if (afterSave) await afterSave;
    }
    this._previousDataValues = this.dataValues;
    this._changed = null;
    this.xufaBefore = null;
    return this;
  }

  // The values of some attributes the database made (fn(), literal() and col() values), read back from the row.
  async xufaReadBack(names, options) {
    const model = this.constructor;
    const pkName = model.primaryKeyAttribute;
    const made = names.filter((name) => {
      const value = this.dataValues[name];
      return value && typeof value === 'object' && (isFragment(value) || value.xufaCol !== undefined);
    });
    // The values of the generated columns, as the database made them.
    model.xufaGenerated.forEach((name) => {
      if (!made.includes(name)) made.push(name);
    });
    if (made.length === 0 || !pkName) return;
    const row = await model.unscoped().findOne({
      where: { [pkName]: this.dataValues[pkName] },
      attributes: [pkName, ...made],
      paranoid: false,
      transaction: options.transaction,
      rejectOnEmpty: false,
    });
    if (row) {
      made.forEach((name) => {
        this.dataValues[name] = row.dataValues[name];
      });
    }
  }

  // The ranges saved, read back as the database keeps them (bounds parsed, canonical), as RETURNING gives them.
  async xufaReadRanges(names, options) {
    const model = this.constructor;
    const pkName = model.primaryKeyAttribute;
    if (model.xufaRanges.size === 0 || !pkName) return;
    const ranges = names.filter((name) => model.xufaRanges.has(name) && this.dataValues[name] !== null);
    if (ranges.length === 0) return;
    const row = await model.unscoped().findOne({
      where: { [pkName]: this.dataValues[pkName] },
      attributes: [pkName, ...ranges],
      paranoid: false,
      transaction: options.transaction,
      rejectOnEmpty: false,
    });
    if (!row) return;
    ranges.forEach((name) => {
      this.dataValues[name] = row.dataValues[name];
    });
    this._previousDataValues = { ...this._previousDataValues };
    ranges.forEach((name) => {
      this._previousDataValues[name] = row.dataValues[name];
    });
  }

  async xufaUpdate(options) {
    const model = this.constructor;
    let names = options.fields ? [...options.fields] : this.changed() || [];
    names = names.filter((name) => model.xufaFieldOf.has(name));
    if (names.length === 0) {
      if (options.xufaChildren) await options.xufaChildren();
      return this;
    }
    const { updatedAt } = model.xufaTimestamps;
    if (updatedAt && !options.silent && !names.includes(updatedAt)) {
      this.setDataValue(updatedAt, new Date());
      names.push(updatedAt);
    }
    await this.xufaValidate(options, names);
    const hooks = options.hooks !== false;
    if (hooks) {
      const before = { ...this.dataValues };
      await model.runHooks('beforeUpdate', this, options);
      await model.runHooks('beforeSave', this, options);
      // Hooks can change more values (saved, and validated, unless the fields were given).
      if (!options.fields || options.xufaDefaultFields) {
        const added = (this.changed() || []).filter(
          (name) =>
            !names.includes(name) && model.xufaFieldOf.has(name) && !sameValue(before[name], this.dataValues[name])
        );
        const touched = [
          ...added,
          ...names.filter((name) => name !== updatedAt && !sameValue(before[name], this.dataValues[name])),
        ];
        if (touched.length && options.validate !== false) {
          await validateInstance(this, { fields: touched, skipModel: true });
        }
        names.push(...added);
      }
    }
    const row = this.xufaRow(names);
    const assignments = Object.keys(row).map((name) => ({ field: model.xufaFieldOf.get(name), value: row[name] }));
    const where = this.xufaKeyWhere('saved again');
    const version = model.xufaVersion;
    const current = version ? this._previousDataValues[version] : undefined;
    if (version) {
      where[version] = current;
      assignments.push({ field: model.xufaFieldOf.get(version), value: current + 1 });
    }
    const query = new QuerySet(model.xufa).filter(where).orderBy().toQuery();
    const count = await model.xufaBackend.update(query, assignments);
    if (version) {
      if (count === 0) {
        throw new errors.OptimisticLockError({ modelName: model.name, values: row, where });
      }
      this.dataValues[version] = current + 1;
    }
    // With returning (as RETURNING gives them in Sequelize), the values the database made are read back; those of
    // generated columns always.
    if (options.returning || model.xufaGenerated.size) await this.xufaReadBack(options.returning ? names : [], options);
    await this.xufaReadRanges(names, options);
    if (options.xufaChildren) await options.xufaChildren();
    if (hooks) {
      await model.runHooks('afterUpdate', this, options);
      await model.runHooks('afterSave', this, options);
    }
    // The values saved are not changes any more (others set and not saved still are).
    const pending = (this.changed() || []).filter((name) => !names.includes(name));
    if (pending.length === 0) {
      this._previousDataValues = this.dataValues;
      this._changed = null;
    } else {
      const previous = { ...this._previousDataValues };
      names.forEach((name) => {
        previous[name] = this.dataValues[name];
      });
      this._previousDataValues = previous;
      this._changed = new Set(pending);
    }
    this.xufaBefore = null;
    return this;
  }

  // As Sequelize: sets the values (those of options.fields, when given; undefined ones are left out) and saves them,
  // with the values their setters changed, and those hooks change.
  async update(values, options = {}) {
    if (Array.isArray(options)) options = { fields: options };
    const given = Object.fromEntries(Object.entries(values || {}).filter(([, value]) => value !== undefined));
    const changedBefore = this.changed() || [];
    const fields = options.fields;
    // With fields, only their values are set (and those of virtual attributes, whose setters set others).
    const settable = (name) =>
      fields.includes(name) || (this.rawAttributes[name] && this.rawAttributes[name].type.kind === 'virtual');
    this.set(fields ? Object.fromEntries(Object.entries(given).filter(([name]) => settable(name))) : given, options);
    if (fields) return this.save(options);
    const changed = this.changed() || [];
    const sideEffects = changed.filter((name) => !changedBefore.includes(name));
    const names = [...new Set([...Object.keys(given), ...sideEffects])].filter((name) => changed.includes(name));
    return this.save({ ...options, fields: names, xufaDefaultFields: true });
  }

  async destroy(options = {}) {
    const model = this.constructor;
    options = model.sequelize.constructor.xufaWithCLS(options);
    const ready = model.xufaReady();
    if (ready) await ready;
    return model.sequelize.xufaRun(options, async () => {
      if (options.hooks !== false) await model.runHooks('beforeDestroy', this, options);
      const { deletedAt } = model.xufaTimestamps;
      if (deletedAt && !options.force) {
        // As Sequelize: deletedAt is set once (while it is null or its default), saved with the other changes.
        const attribute = model.rawAttributes[deletedAt];
        const defaultValue = Object.hasOwn(attribute, 'defaultValue') ? attribute.defaultValue : null;
        const current = this.getDataValue(deletedAt);
        const unset = current === null || current === undefined;
        const isDefault =
          defaultValue !== null && defaultValue !== undefined && current instanceof Date && defaultValue instanceof Date
            ? current.getTime() === defaultValue.getTime()
            : current === defaultValue;
        if (unset || isDefault) this.setDataValue(deletedAt, new Date());
        const fields = [...new Set([...(this.changed() || []), deletedAt])];
        await this.save({ ...options, fields, hooks: false, validate: false, silent: true });
      } else {
        await this.xufaDestroyDependents(options);
        const query = new QuerySet(model.xufa).filter(this.xufaKeyWhere('destroyed')).orderBy().toQuery();
        await model.xufaBackend.delete(query);
      }
      if (options.hooks !== false) await model.runHooks('afterDestroy', this, options);
      return this;
    });
  }

  // As Sequelize: the instances of associations with onDelete CASCADE and hooks: true are destroyed one by one
  // first (with their hooks), not only by the database.
  async xufaDestroyDependents(options) {
    if (options.hooks === false) return;
    const model = this.constructor;
    for (const association of Object.values(model.associations)) {
      const { associationType } = association;
      if (!association.options.hooks || (associationType !== 'HasMany' && associationType !== 'HasOne')) continue;
      if (String(association.options.onDelete || '').toUpperCase() !== 'CASCADE') continue;
      const key = this.get(association.sourceKey, { raw: true });
      if (key === null || key === undefined) continue;
      const dependents = await association.target.unscoped().findAll({
        where: { ...association.scope, [association.foreignKey]: key },
        transaction: options.transaction,
      });
      for (const dependent of dependents) await dependent.destroy({ transaction: options.transaction });
    }
  }

  async restore(options = {}) {
    const model = this.constructor;
    options = model.sequelize.constructor.xufaWithCLS(options);
    const { deletedAt } = model.xufaTimestamps;
    if (!deletedAt) throw new InstanceError('Model is not paranoid');
    if (options.hooks !== false) await model.runHooks('beforeRestore', this, options);
    this.setDataValue(deletedAt, model.xufaUndeleted());
    await this.save({ ...options, fields: [deletedAt], hooks: false, omitNull: false });
    if (options.hooks !== false) await model.runHooks('afterRestore', this, options);
    return this;
  }

  async reload(options = {}) {
    const model = this.constructor;
    const reloaded = await model.findOne({
      ...options,
      where: this.xufaKeyWhere('reloaded'),
      include: options.include || this._options.include,
      paranoid: false,
      rejectOnEmpty: false,
    });
    if (!reloaded)
      throw new InstanceError(
        'Instance could not be reloaded because it does not exist anymore (find call returned null)'
      );
    // As Sequelize: the options of the instance found (its includes), and its values (only those asked for, when
    // attributes are given).
    this._options = reloaded._options;
    this.dataValues = options.attributes ? { ...this.dataValues, ...reloaded.dataValues } : reloaded.dataValues;
    this._previousDataValues = this.dataValues;
    this._changed = null;
    return this;
  }

  async increment(fields, options = {}) {
    const model = this.constructor;
    const amounts = incrementsOf(fields, options);
    const own = this.xufaKeyWhere('incremented');
    const where = options.where ? { [Op.and]: [own, options.where] } : own;
    await model.increment(amounts, { ...options, where, by: undefined });
    // As Sequelize: the instance takes the new values (from RETURNING), unless returning is false.
    if (options.returning === false) return this;
    Object.entries(amounts).forEach(([name, by]) => {
      const value = this.dataValues[name];
      if (typeof value === 'number') this.dataValues[name] = value + by;
    });
    return this;
  }

  async decrement(fields, options = {}) {
    const amounts = incrementsOf(fields, options);
    Object.keys(amounts).forEach((name) => {
      amounts[name] = -amounts[name];
    });
    return this.increment(amounts, { ...options, by: undefined });
  }

  // Finding

  static async findAll(options = {}) {
    const ready = this.xufaReady();
    if (ready) await ready;
    options = this.xufaScoped(options);
    if (this.hasHook('beforeFind')) await this.runHooks('beforeFind', options);
    if (this.hasHook('beforeFindAfterExpandIncludeAll'))
      await this.runHooks('beforeFindAfterExpandIncludeAll', options);
    if (this.hasHook('beforeFindAfterOptions')) await this.runHooks('beforeFindAfterOptions', options);
    // It reads: on a replica, with replication.
    const result = await this.sequelize.xufaReading(options, () =>
      this.sequelize.xufaRun(options, () =>
        options.groupedLimit ? this.xufaGroupedLimit(options) : this.xufaFind(options)
      )
    );
    // enableRuntimeAttributes (of the options, or of the model), as Sequelize 7: the values of the rows that no
    // attribute has ([literal(...), 'name'] in attributes) are properties of the instances too, as attributes are.
    const runtime =
      options.enableRuntimeAttributes !== undefined
        ? options.enableRuntimeAttributes
        : this.options.enableRuntimeAttributes;
    if (runtime && !options.raw && Array.isArray(result)) result.forEach(exposeRuntimeAttributes);
    // afterFind gets what the find gives: the instance (or null) of findOne.
    if (this.hasHook('afterFind')) {
      await this.runHooks('afterFind', options.xufaOne ? result[0] || null : result, options);
    }
    // rejectOnEmpty (of the options, or of the model): nothing found is an error (EmptyResultError, or the one given).
    const reject = options.rejectOnEmpty !== undefined ? options.rejectOnEmpty : this.options.rejectOnEmpty;
    if (reject && Array.isArray(result) && result.length === 0) {
      if (reject instanceof Error) throw reject;
      throw typeof reject === 'function' ? new reject() : new EmptyResultError(); // eslint-disable-line new-cap
    }
    return result;
  }

  // groupedLimit ({ limit, on, values }): the first rows (in the order of the find) of each value of the key of an
  // association: a window of the query for a hasMany (on: User.Tasks, values: keys of users), and a query of each value
  // for a belongsToMany (on: User.Projects, values: keys of projects; each row gets the projects it was found by).
  static async xufaGroupedLimit(options) {
    const { limit, on, values } = options.groupedLimit;
    const rest = { ...options, groupedLimit: undefined };
    const and = (own) => (rest.where ? { [Op.and]: [own, rest.where] } : own);
    if (on.associationType === 'HasMany') {
      const { foreignKey } = on;
      const per = { names: [this.xufaFieldOf.get(foreignKey).name], limit, offset: 0 };
      return this.xufaFind({ ...rest, where: and({ [foreignKey]: values }), xufaPer: per });
    }
    if (on.associationType !== 'BelongsToMany') throw new NotSupportedError(`groupedLimit on ${on.associationType}`);
    const { foreignKey, otherKey, sourceKey, targetKey } = on;
    const { transaction } = options;
    const links = await on.throughModel.findAll({
      where: { [otherKey]: values },
      attributes: [foreignKey, otherKey],
      raw: true,
      transaction,
    });
    const byValue = new Map(values.map((value) => [value, []]));
    links.forEach((link) => {
      const group = byValue.get(link[otherKey]);
      if (group) group.push(link[foreignKey]);
    });
    // The first rows of each value, then the rows of all of them (in the order of the find, once each).
    const found = new Map();
    for (const [value, keys] of byValue) {
      if (keys.length === 0) continue;
      const rows = await this.xufaFind({
        where: and({ [sourceKey]: keys }),
        order: rest.order,
        attributes: [sourceKey],
        limit,
        raw: true,
        transaction,
      });
      rows.forEach((row) => {
        if (!found.has(row[sourceKey])) found.set(row[sourceKey], []);
        found.get(row[sourceKey]).push(value);
      });
    }
    if (found.size === 0) return [];
    const result = await this.xufaFind({ ...rest, where: and({ [sourceKey]: [...found.keys()] }) });
    if (!rest.raw) {
      result.forEach((instance) => {
        const keys = found.get(instance.dataValues[sourceKey]) || [];
        instance.dataValues[on.as] = keys.map((key) => on.target.build({ [targetKey]: key }, { isNewRecord: false }));
      });
    }
    return result;
  }

  // The keys of the parents that required includes of polymorphic keys have (as rows of their targets, by the key and
  // the scope): options.xufaLoose, by association.
  static async xufaLooseKeys(options) {
    if (!options.include) return options;
    const includes = normalizeIncludes(this, options.include);
    const loose = includes.filter((include) => include.required && include.association.xufaLoose);
    if (loose.length === 0) return options;
    const found = new Map();
    for (const include of loose) {
      const { association } = include;
      const own = association.associationType === 'BelongsTo';
      const where = { ...association.scope, ...include.where };
      const column = own ? association.targetKey : association.foreignKey;
      const rows = await association.target
        .unscoped()
        .findAll({ attributes: [column], where, raw: true, transaction: options.transaction });
      found.set(association, [...new Set(rows.map((row) => row[column]))]);
    }
    return { ...options, xufaLoose: found };
  }

  static async xufaFind(options) {
    options = await this.xufaLooseKeys(options);
    const plan = planFind(this, options);
    if (plan.aggregate) return this.xufaFindGroups(plan, options);
    if (plan.values) {
      const rows = await plan.qs;
      const named = rows.map((row) => Object.fromEntries(plan.values.map(({ path, alias }) => [alias, row[path]])));
      return options.raw ? named : named.map((values) => this.build(values, { isNewRecord: false, raw: true }));
    }
    const rows = await this.xufaBackend.select(plan.qs.toQuery());
    if (options.raw && !plan.separate.length) return rows.map((row) => rawRow(row, plan.joined, options.nest));
    const instances = new Array(rows.length);
    for (let i = 0; i < rows.length; i += 1) instances[i] = this.xufaFromRow(rows[i], plan.joined);
    if (plan.renames) instances.forEach((instance) => renameValues(instance.dataValues, plan.renames));
    if (plan.separate.length) await loadSeparate(instances, plan.separate, options);
    // Orders by the rows of includes loaded apart order the instances as a join would (their first row).
    if (plan.separate.length && options.order && !options.limit && !options.offset && !plan.sqlOrdered) {
      sortAsJoined(this, instances, options.order);
    }
    // With includes, the keys the query needed (to join them) are left out when not asked for.
    if (options.attributes && (plan.joined || plan.separate.length)) {
      const keep = attributesOf(this, options.attributes).selected;
      instances.forEach((instance) => instance.xufaKeep(keep));
    }
    // Raw rows with includes loaded apart: one for every row of the includes, as a join gives them.
    if (options.raw) return instances.flatMap((instance) => flattenRaw(instance, options.nest));
    // The includes and the attributes asked for are options of the instances (getters of others are left out of get()).
    if (options.include || options.attributes) {
      const instanceOptions = { isNewRecord: false, raw: true, include: options.include };
      if (options.attributes) instanceOptions.attributes = attributesOf(this, options.attributes).selected;
      instances.forEach((instance) => {
        instance._options = instanceOptions;
      });
    }
    return instances;
  }

  // Grouped queries and aggregates in attributes: values of @xufa/orm.
  static async xufaFindGroups(plan, options) {
    const { qs, groups, aggregates } = plan;
    let rows;
    if (groups.length) rows = await qs.values(...groups.map((group) => group.path)).annotate(aggregates);
    else rows = [await qs.aggregate(aggregates)];
    const named = rows.map((row) => {
      const values = {};
      groups.forEach((group) => {
        values[group.name] = row[group.path];
      });
      Object.keys(aggregates).forEach((key) => {
        values[key] = row[key];
      });
      return values;
    });
    if (options.raw) return named;
    return named.map((values) => this.build(values, { isNewRecord: false, raw: true }));
  }

  static async findOne(options = {}) {
    if (options === null || typeof options !== 'object')
      throw new Error('The argument passed to findOne must be an options object');
    const pk = this.primaryKeyAttribute;
    // A condition on the primary key gives one row at most: no LIMIT.
    const byKey = options.where && Object.keys(options.where).length === 1 && isUnique(this, options.where[pk]);
    const one = { ...options, xufaOne: true };
    const items = await this.findAll(byKey || options.limit !== undefined ? one : { ...one, limit: 1 });
    return items.length ? items[0] : null;
  }

  static findByPk(key, options = {}) {
    if (key === null || key === undefined) return Promise.resolve(null);
    const pk = this.primaryKeyAttribute;
    // A number no integer key can have (beyond the integers of the column): no row, as Sequelize's literal finds.
    const { kind } = (this.rawAttributes[pk] && this.rawAttributes[pk].type) || {};
    const limit = kind === 'integer' ? 2147483647 : Number.MAX_SAFE_INTEGER;
    const impossible =
      (kind === 'integer' || kind === 'bigint') &&
      typeof key === 'number' &&
      (!Number.isInteger(key) || Math.abs(key) > limit);
    const own = impossible ? this.sequelize.constructor.literal('1 = 0') : { [pk]: key };
    return this.findOne({ ...options, where: options.where ? { [Op.and]: [own, options.where] } : own });
  }

  // The instances of some primary keys, in one query (as Sequelize 7): values, or objects of the attributes of a
  // composite key. No query for none.
  static async findByPks(keys, options = {}) {
    if (!Array.isArray(keys)) throw new TypeError(`${this.name}.findByPks() takes an array of primary keys`);
    const names = this.primaryKeyAttributes;
    if (names.length === 0) throw new Error(`${this.name} has no primary key: it cannot be found by primary keys`);
    if (keys.length === 0) return [];
    let own;
    if (names.length === 1) own = { [names[0]]: { [Op.in]: keys } };
    else {
      own = {
        [Op.or]: keys.map((key) => {
          if (!isPlainObject(key) || names.some((name) => key[name] === undefined)) {
            throw new TypeError(`The keys of ${this.name} are objects of ${names.join(', ')}`);
          }
          return Object.fromEntries(names.map((name) => [name, key[name]]));
        }),
      };
    }
    return this.findAll({ ...options, where: options.where ? { [Op.and]: [own, options.where] } : own });
  }

  static async findAndCountAll(options = {}) {
    const countOptions = { ...options, attributes: undefined, order: undefined, limit: undefined, offset: undefined };
    const [count, rows] = await Promise.all([this.count(countOptions), this.findAll(options)]);
    return { count, rows };
  }

  static async count(options = {}) {
    const ready = this.xufaReady();
    if (ready) await ready;
    options = this.xufaScoped(options);
    if (this.hasHook('beforeCount')) await this.runHooks('beforeCount', options);
    // As Sequelize: through aggregate(column, 'count'), without limit, offset nor order.
    return this.aggregate(options.col || '*', 'count', {
      ...options,
      limit: null,
      offset: null,
      order: null,
      plain: !options.group,
      xufaCount: true,
    });
  }

  static xufaCount(options) {
    return this.sequelize.xufaRun(options, async () => {
      options = await this.xufaLooseKeys(options);
      const plan = planFind(this, {
        ...options,
        attributes: undefined,
        order: undefined,
        limit: undefined,
        offset: undefined,
        xufaCount: true,
      });
      const target =
        options.col && options.col !== '*' ? options.col : options.distinct ? this.primaryKeyAttribute : undefined;
      const count = Count(target && plan.context.path(target), { distinct: Boolean(options.distinct && target) });
      if (options.group) {
        const groups = [].concat(options.group).map((entry) => {
          // A name, col(), or [name].
          const item = Array.isArray(entry) ? entry[0] : entry;
          const name = typeof item === 'string' ? item : item.xufaCol;
          return { name, path: plan.context.path(name) };
        });
        const rows = await plan.qs.values(...groups.map((group) => group.path)).annotate({ count });
        return rows.map((row) => {
          const values = {};
          groups.forEach((group) => {
            values[group.name] = row[group.path];
          });
          values.count = row.count;
          return values;
        });
      }
      if (!target) return plan.qs.count();
      return (await plan.qs.aggregate({ count })).count;
    });
  }

  static async aggregate(attribute, fn, options = {}) {
    // A count (count() comes here scoped already).
    if (options.xufaCount && fn === 'count') return this.sequelize.xufaReading(options, () => this.xufaCount(options));
    const ready = this.xufaReady();
    if (ready) await ready;
    options = this.xufaScoped(options);
    // It reads: on a replica, with replication.
    return this.sequelize.xufaReading(options, () => this.xufaAggregate(attribute, fn, options));
  }

  static xufaAggregate(attribute, fn, options) {
    return this.sequelize.xufaRun(options, async () => {
      const plan = planFind(this, {
        ...options,
        attributes: undefined,
        order: undefined,
        limit: undefined,
        offset: undefined,
      });
      const make = AGGREGATES[fn.toUpperCase()];
      if (!make) throw new NotSupportedError(`The aggregate ${fn}`);
      const { value } = await plan.qs.aggregate({
        value: make(plan.context.path(attribute), options.distinct ? { distinct: true } : undefined),
      });
      // Decimals are numbers in aggregates (as Sequelize gives them).
      const definition = this.rawAttributes[attribute];
      if (value !== null && definition && definition.type.kind === 'decimal') return Number(value);
      return value;
    });
  }

  static max(attribute, options) {
    return this.aggregate(attribute, 'max', options);
  }

  static min(attribute, options) {
    return this.aggregate(attribute, 'min', options);
  }

  static sum(attribute, options) {
    return this.aggregate(attribute, 'sum', options);
  }

  // Writing

  // As Sequelize: with options.fields, only those values are set (the associations of includes too).
  static async create(values = {}, options = {}) {
    let given = values;
    if (options.fields && values && typeof values === 'object' && !isInstance(values)) {
      given = Object.fromEntries(
        Object.entries(values).filter(([name]) => options.fields.includes(name) || this.associations[name])
      );
    }
    const instance = this.build(given, { isNewRecord: true, include: options.include });
    return instance.save(options);
  }

  // The values of the columns of the table that no attribute has (added by others), for the instances given: read by
  // their primary keys with SELECT *, as RETURNING * gives them.
  static async xufaReadExtraColumns(instances, options) {
    const pk = this.primaryKeyAttribute;
    const keys = instances
      .map((instance) => instance.dataValues[pk])
      .filter((key) => key !== null && key !== undefined);
    if (keys.length === 0) return;
    const backend = this.xufaBackend;
    const { dialect } = backend;
    const meta = this.xufaMeta;
    const pkField = this.rawAttributes[pk].field;
    const placeholders = keys.map((_, i) => dialect.placeholder(i + 1)).join(', ');
    const sql = `SELECT * FROM ${dialect.quoteTable(meta.table, meta.schema)} WHERE ${dialect.quote(pkField)} IN (${placeholders})`;
    const rows = await this.sequelize.xufaRun(options, () => backend.raw(sql, keys));
    const fields = new Set(Object.values(this.rawAttributes).map((attribute) => attribute.field));
    const byKey = new Map(rows.map((row) => [String(row[pkField]), row]));
    instances.forEach((instance) => {
      const row = byKey.get(String(instance.dataValues[pk]));
      if (!row) return;
      Object.keys(row).forEach((column) => {
        if (!fields.has(column)) instance.dataValues[column] = row[column];
      });
    });
  }

  static async bulkCreate(records, options = {}) {
    options = this.sequelize.constructor.xufaWithCLS(options);
    if (
      options.updateOnDuplicate !== undefined &&
      (!Array.isArray(options.updateOnDuplicate) || !options.updateOnDuplicate.length)
    ) {
      throw new Error('updateOnDuplicate option only supports non-empty array.');
    }
    if (options.include) return this.xufaBulkCreateWithIncludes(records, options);
    const ready = this.xufaReady();
    if (ready) await ready;
    const instances = records.map((record) =>
      isInstance(record) ? record : this.build(record, { isNewRecord: true })
    );
    if (instances.length === 0) return instances;
    return this.sequelize.xufaRun(options, async () => {
      const hooks = options.hooks !== false;
      const bulkHooks = hooks && !options.xufaIncluded;
      if (bulkHooks && this.hasHook('beforeBulkCreate')) await this.runHooks('beforeBulkCreate', instances, options);
      const { createdAt, updatedAt } = this.xufaTimestamps;
      const now = new Date();
      // As Sequelize: the errors of every record, as an AggregateError of BulkRecordErrors.
      if (options.validate) {
        const failed = [];
        for (let i = 0; i < instances.length; i += 1) {
          try {
            await instances[i].xufaValidate(options);
          } catch (err) {
            failed.push(new errors.BulkRecordError(err, instances[i]));
          }
        }
        if (failed.length) throw new errors.AggregateError(failed);
      }
      if (options.individualHooks && hooks) {
        for (let i = 0; i < instances.length; i += 1) {
          await this.runHooks('beforeCreate', instances[i], options);
          await this.runHooks('beforeSave', instances[i], options);
        }
      }
      const names = options.fields
        ? this.xufaDbAttributes.filter(
            (name) => options.fields.includes(name) || name === createdAt || name === updatedAt
          )
        : this.xufaDbAttributes;
      const rows = new Array(instances.length);
      for (let i = 0; i < instances.length; i += 1) {
        const { dataValues } = instances[i];
        if (createdAt && (dataValues[createdAt] === undefined || dataValues[createdAt] === null))
          dataValues[createdAt] = this.xufaDefaultTimestamp(createdAt) || now;
        if (updatedAt && (dataValues[updatedAt] === undefined || dataValues[updatedAt] === null || !options.silent))
          dataValues[updatedAt] = this.xufaDefaultTimestamp(updatedAt) || now;
        rows[i] = instances[i].xufaRow(names);
      }
      const conflict = this.xufaConflict(options);
      const pks = await this.xufaBackend.insert(this.xufaMeta, rows, conflict ? { conflict } : undefined);
      const pk = this.primaryKeyAttribute;
      for (let i = 0; i < instances.length; i += 1) {
        const instance = instances[i];
        const missing = instance.dataValues[pk] === null || instance.dataValues[pk] === undefined;
        if (missing && (pks[i] !== null || !conflict)) instance.dataValues[pk] = pks[i];
        instance.isNewRecord = false;
        instance._previousDataValues = instance.dataValues;
        instance._changed = null;
      }
      // returning: ['*'] (RETURNING * in Sequelize): the columns of the table that the model does not have too.
      if (Array.isArray(options.returning) && options.returning.includes('*') && pk) {
        await this.xufaReadExtraColumns(instances, options);
      }
      if (options.individualHooks && hooks) {
        for (let i = 0; i < instances.length; i += 1) {
          await this.runHooks('afterCreate', instances[i], options);
          await this.runHooks('afterSave', instances[i], options);
        }
      }
      if (bulkHooks && this.hasHook('afterBulkCreate')) await this.runHooks('afterBulkCreate', instances, options);
      return instances;
    });
  }

  // As Sequelize: bulkCreate with includes creates those the records point to (belongsTo) in bulk first, then the
  // records, then those that point to them (hasMany, hasOne) and those linked to them (belongsToMany, with the rows of
  // their through model), each in bulk, between the hooks of the bulk.
  static async xufaBulkCreateWithIncludes(records, options) {
    const ready = this.xufaReady();
    if (ready) await ready;
    const instances = records.map((record) =>
      isInstance(record) ? record : this.build(record, { isNewRecord: true, include: options.include })
    );
    return this.sequelize.xufaRun(options, async () => {
      const hooks = options.hooks !== false;
      const includes = normalizeIncludes(this, options.include);
      const nested = (include) => ({
        ...include.xufaOptions,
        association: undefined,
        model: undefined,
        where: undefined,
        transaction: options.transaction,
        logging: options.logging,
        include: include.include.length ? include.include : undefined,
      });
      if (hooks && this.hasHook('beforeBulkCreate')) await this.runHooks('beforeBulkCreate', instances, options);
      for (const include of includes) {
        const { association } = include;
        if (association.associationType !== 'BelongsTo') continue;
        const targets = instances.map((instance) => instance.dataValues[association.as]).filter(isInstance);
        const created = targets.filter((target) => target.isNewRecord);
        if (created.length) await association.target.bulkCreate(created, nested(include));
        instances.forEach((instance) => {
          const target = instance.dataValues[association.as];
          if (isInstance(target))
            instance.set(association.foreignKey, target.get(association.targetKey, { raw: true }), { raw: true });
        });
      }
      await this.bulkCreate(instances, { ...options, include: undefined, xufaIncluded: true });
      for (const include of includes) {
        const { association } = include;
        const { associationType } = association;
        if (associationType === 'HasMany' || associationType === 'HasOne') {
          const children = instances.flatMap((instance) =>
            []
              .concat(instance.dataValues[association.as] || [])
              .filter(isInstance)
              .map((child) => {
                child.set(
                  {
                    ...association.scope,
                    [association.foreignKey]: instance.get(association.sourceKey, { raw: true }),
                  },
                  { raw: true }
                );
                return child;
              })
          );
          if (children.length) await association.target.bulkCreate(children, nested(include));
        } else if (associationType === 'BelongsToMany') {
          const through = association.throughModel;
          const pairs = instances.flatMap((instance) =>
            []
              .concat(instance.dataValues[association.as] || [])
              .filter(isInstance)
              .map((item) => [instance, item])
          );
          const created = pairs.map(([, item]) => item).filter((item) => item.isNewRecord);
          if (created.length) await association.target.bulkCreate(created, nested(include));
          const rows = pairs.map(([instance, item]) => {
            const extra = item.dataValues[through.name];
            const values = extra && isInstance(extra) ? extra.get() : extra || {};
            return {
              ...values,
              ...association.throughScope,
              [association.foreignKey]: instance.get(association.sourceKey, { raw: true }),
              [association.otherKey]: item.get(association.targetKey, { raw: true }),
            };
          });
          if (rows.length) {
            const links = await through.bulkCreate(rows, {
              transaction: options.transaction,
              logging: options.logging,
            });
            pairs.forEach(([, item], i) => {
              item.dataValues[through.name] = links[i];
            });
          }
        }
      }
      if (hooks && this.hasHook('afterBulkCreate')) await this.runHooks('afterBulkCreate', instances, options);
      return instances;
    });
  }

  static async update(values, options = {}) {
    values = valuesOf(this, values);
    // The scope gives a where too (checked after it, as Sequelize does).
    options = this.xufaScoped({ ...options });
    if (!options || !options.where) throw new Error('Missing where attribute in the options parameter');
    const ready = this.xufaReady();
    if (ready) await ready;
    return this.sequelize.xufaRun(options, async () => {
      const hooks = options.hooks !== false;
      values = { ...values };
      const { updatedAt } = this.xufaTimestamps;
      if (updatedAt && !options.silent && values[updatedAt] === undefined) values[updatedAt] = new Date();
      if (hooks && this.hasHook('beforeBulkUpdate')) {
        const hookOptions = { ...options, attributes: values };
        await this.runHooks('beforeBulkUpdate', hookOptions);
        values = hookOptions.attributes;
      }
      if (options.individualHooks) {
        const instances = await this.findAll({ ...options, xufaNoScope: true });
        for (let i = 0; i < instances.length; i += 1) {
          instances[i].set(values);
          // The values changed by the hooks (beforeUpdate) are saved too.
          await instances[i].save({ ...options, fields: options.fields });
        }
        if (hooks && this.hasHook('afterBulkUpdate'))
          await this.runHooks('afterBulkUpdate', { ...options, attributes: values });
        return [instances.length, instances];
      }
      // The values through the setters of the attributes (virtual ones set others), fragments as they are.
      const fragments = Object.keys(values).filter((name) => isFragment(values[name]));
      const plainValues = Object.fromEntries(Object.entries(values).filter(([name]) => !fragments.includes(name)));
      // An instance without values that gets them (so the setters' changes are its changes).
      const probe = this.build({}, { isNewRecord: false, raw: false });
      probe.set(plainValues);
      Object.keys(plainValues).forEach((name) => {
        if (this.xufaFieldOf.has(name) && probe.dataValues[name] === undefined)
          probe.dataValues[name] = plainValues[name];
      });
      let names = [
        ...new Set(
          [...Object.keys(plainValues), ...Object.keys(probe.dataValues)].filter((name) => this.xufaFieldOf.has(name))
        ),
      ].filter((name) => probe.dataValues[name] !== undefined && (name in plainValues || probe.changed(name)));
      if (options.fields) {
        const allowed = new Set([...options.fields, this.xufaTimestamps.updatedAt].filter(Boolean));
        names = names.filter((name) => allowed.has(name));
      }
      // sideEffects: false: only the values given (not those virtual setters set).
      if (options.sideEffects === false) names = names.filter((name) => name in plainValues);
      checkEnums(this, Object.fromEntries(names.map((name) => [name, probe.dataValues[name]])), probe);
      if (options.validate !== false) await validateInstance(probe, { fields: names, skipModel: true });
      // include (as Sequelize 7): the rows whose includes are there (required, or with a where), as a find gives them.
      const plan = planFind(this, {
        where: options.where,
        paranoid: options.paranoid,
        include: options.include,
        xufaWrite: true,
      });
      const changes = {};
      names.forEach((name) => {
        changes[name] = this.xufaRangeText(name, probe.dataValues[name]);
      });
      const context = new Context(this);
      fragments.forEach((name) => {
        if (!this.xufaFieldOf.has(name) || (options.fields && !options.fields.includes(name))) return;
        const { sql, params } = fragmentOf(context, values[name]);
        changes[name] = Raw(sql, params);
        names.push(name);
      });
      // As Sequelize: nothing to update (or only updatedAt, which is set by itself) runs no query.
      const { updatedAt: updatedAtName } = this.xufaTimestamps;
      const nothing = names.length === 0 || (names.length === 1 && names[0] === updatedAtName);
      let keys;
      if (options.returning && !nothing) keys = await plan.qs.valuesList(this.primaryKeyAttribute, { flat: true });
      const count = nothing ? 0 : await plan.qs.update(changes);
      if (hooks && this.hasHook('afterBulkUpdate'))
        await this.runHooks('afterBulkUpdate', { ...options, attributes: values });
      if (options.returning) {
        const rows =
          keys && keys.length
            ? await this.findAll({ where: { [this.primaryKeyAttribute]: keys }, transaction: options.transaction })
            : [];
        return [count, rows];
      }
      return [count];
    });
  }

  static async increment(fields, options = {}) {
    const ready = this.xufaReady();
    if (ready) await ready;
    options = this.xufaScoped({ ...options });
    const amounts = incrementsOf(fields, options);
    return this.sequelize.xufaRun(options, async () => {
      const plan = planFind(this, { where: options.where || {}, xufaWrite: true });
      const changes = {};
      Object.entries(amounts).forEach(([name, by]) => {
        changes[name] = F(name).add(by);
      });
      const { updatedAt } = this.xufaTimestamps;
      if (updatedAt && !options.silent) changes[updatedAt] = new Date();
      if (this.xufaVersion) changes[this.xufaVersion] = F(this.xufaVersion).add(1);
      const count = await plan.qs.update(changes);
      return [[], count];
    });
  }

  static decrement(fields, options = {}) {
    const amounts = incrementsOf(fields, options);
    Object.keys(amounts).forEach((name) => {
      amounts[name] = -amounts[name];
    });
    return this.increment(amounts, { ...options, by: undefined });
  }

  static async destroy(options = {}) {
    options = this.xufaScoped({ ...options });
    if (!options || (!options.where && !options.truncate)) {
      throw new Error('Missing where or truncate attribute in the options parameter of model.destroy.');
    }
    const ready = this.xufaReady();
    if (ready) await ready;
    return this.sequelize.xufaRun(options, async () => {
      const hooks = options.hooks !== false;
      if (hooks && this.hasHook('beforeBulkDestroy')) await this.runHooks('beforeBulkDestroy', options);
      let count;
      if (options.individualHooks) {
        const instances = await this.findAll({ where: options.where, transaction: options.transaction });
        for (let i = 0; i < instances.length; i += 1) await instances[i].destroy(options);
        count = instances.length;
      } else {
        const { deletedAt } = this.xufaTimestamps;
        const plan = planFind(this, {
          where: options.truncate ? {} : options.where,
          xufaWrite: true,
          paranoid: options.force ? false : options.paranoid,
        });
        if (deletedAt && !options.force) count = await plan.qs.update({ [deletedAt]: new Date() });
        else count = await this.xufaBackend.delete({ ...plan.qs.toQuery(), orderBy: [] });
      }
      if (hooks && this.hasHook('afterBulkDestroy')) await this.runHooks('afterBulkDestroy', options);
      return count;
    });
  }

  static truncate(options = {}) {
    return this.destroy({ ...options, truncate: true, force: true });
  }

  static async restore(options = {}) {
    options = this.sequelize.constructor.xufaWithCLS(options);
    const { deletedAt } = this.xufaTimestamps;
    if (!deletedAt) throw new Error('Model is not paranoid');
    const ready = this.xufaReady();
    if (ready) await ready;
    return this.sequelize.xufaRun(options, async () => {
      if (options.hooks !== false && this.hasHook('beforeBulkRestore'))
        await this.runHooks('beforeBulkRestore', options);
      const where = { [Op.and]: [options.where || {}, { [deletedAt]: { [Op.ne]: this.xufaUndeleted() } }] };
      // individualHooks: the hooks of each instance (beforeRestore of all, the restore, afterRestore of all).
      let instances = null;
      if (options.individualHooks) {
        instances = await this.findAll({ where, paranoid: false, transaction: options.transaction });
        await Promise.all(instances.map((instance) => this.runHooks('beforeRestore', instance, options)));
      }
      const plan = planFind(this, { where, paranoid: false, xufaWrite: true });
      await plan.qs.update({ [deletedAt]: this.xufaUndeleted() });
      if (instances) {
        instances.forEach((instance) => instance.setDataValue(deletedAt, this.xufaUndeleted()));
        await Promise.all(instances.map((instance) => this.runHooks('afterRestore', instance, options)));
      }
      if (options.hooks !== false && this.hasHook('afterBulkRestore')) await this.runHooks('afterBulkRestore', options);
    });
  }

  static async findOrCreate(options = {}) {
    if (!options.where) throw new Error('Missing where attribute in the options parameter passed to findOrCreate.');
    options = this.sequelize.constructor.xufaWithCLS(options);
    // As Sequelize: in a transaction of its own when it is given none.
    if (!options.transaction) {
      return this.sequelize.transaction((transaction) => this.findOrCreate({ ...options, transaction }));
    }
    const found = await this.findOne({ where: options.where, transaction: options.transaction });
    if (found) return [found, false];
    const values = { ...equalities(options.where), ...options.defaults };
    const instance = this.build(values, { isNewRecord: true });
    try {
      // In a transaction, the create is a savepoint of it (a unique error does not abort the transaction).
      if (options.transaction) {
        await this.sequelize.transaction({ transaction: options.transaction }, (t) =>
          instance.save({ ...options, transaction: t })
        );
      } else await instance.save(options);
      return [instance, true];
    } catch (err) {
      if (!(err instanceof errors.UniqueConstraintError)) throw err;
      // As Sequelize: a value of the where that the create changed (hooks) is an error of its own.
      Object.keys(err.fields || {}).forEach((column) => {
        const name = this.xufaAttributeOf(column);
        if (!options.where || !Object.hasOwn(options.where, name)) return;
        const given = options.where[name];
        const created = instance.get(name);
        if (given !== null && typeof given !== 'object' && String(given) !== String(created)) {
          throw new Error(
            `${this.name}#findOrCreate: value used for ${name} was not equal for both the find and the create calls, '${given}' vs '${created}'`
          );
        }
      });
      const existing = await this.findOne({ where: options.where, transaction: options.transaction });
      if (existing) return [existing, false];
      throw err;
    }
  }

  static findCreateFind(options) {
    return this.findOrCreate(options);
  }

  static async findOrBuild(options = {}) {
    const found = await this.findOne(options);
    if (found) return [found, false];
    return [this.build({ ...equalities(options.where || {}), ...options.defaults }), true];
  }

  // The unique keys of the model (attributes, named groups, unique indexes), each as a list of attributes.
  // partial: with the partial unique indexes (for conflicts with conflictWhere).
  static xufaUniqueGroups(partial = false) {
    const groups = [];
    const named = new Map();
    Object.entries(this.rawAttributes).forEach(([name, attribute]) => {
      const { unique } = attribute;
      if (!unique) return;
      const key = typeof unique === 'string' ? unique : unique.name;
      if (unique === true || !key) groups.push([name]);
      else {
        if (!named.has(key)) named.set(key, []);
        named.get(key).push(name);
      }
    });
    groups.push(...named.values(), ...this.xufaUniqueKeys);
    (this.options.indexes || []).forEach((index) => {
      if (index.unique && (!index.where || partial)) {
        groups.push(
          index.fields.map((field) =>
            this.xufaAttributeOf(typeof field === 'string' ? field : field.name || field.attribute)
          )
        );
      }
    });
    return groups;
  }

  // The keys of a conflict, as Sequelize takes them: those given (conflictAttributes, conflictFields), the first unique
  // key with an attribute updated, or the primary key.
  static xufaConflictKeys(updated, given, partial = false) {
    if (given && given.length) return given;
    const groups = this.xufaUniqueGroups(partial);
    for (const name of updated) {
      const group = groups.find((names) => names.includes(name));
      if (group)
        return updated.some((item) => this.primaryKeyAttributes.includes(item)) ? this.primaryKeyAttributes : group;
    }
    return this.primaryKeyAttributes;
  }

  // The conflict of @xufa/orm for the options of bulkCreate: ignoreDuplicates, or updateOnDuplicate (and
  // conflictAttributes).
  static xufaConflict(options) {
    if (options.ignoreDuplicates) return { fields: [], update: null };
    if (!options.updateOnDuplicate) return null;
    const update = options.updateOnDuplicate.filter((name) => typeof name === 'string' && this.xufaFieldOf.has(name));
    // As Sequelize 7: [attribute, value] sets the attribute to a value or to SQL (literal('count + 1'), fn(...)).
    const set = options.updateOnDuplicate
      .filter((item) => Array.isArray(item))
      .map(([name, value]) => {
        if (!this.xufaFieldOf.has(name)) throw new Error(`${this.name} has no attribute ${name} (updateOnDuplicate)`);
        return { field: this.xufaFieldOf.get(name), sql: this.xufaAssignmentSql(value) };
      });
    let keys = options.conflictAttributes;
    if (!keys || !keys.length) {
      // As Sequelize: the fields of the unique indexes and of the first unique key, or the primary key.
      keys = [];
      (this.options.indexes || []).forEach((index) => {
        if (index.unique && !index.where) {
          keys.push(
            ...index.fields.map((field) =>
              this.xufaAttributeOf(typeof field === 'string' ? field : field.name || field.attribute)
            )
          );
        }
      });
      const first = this.xufaUniqueGroups().find((names) => names.length);
      if (first && !keys.length) keys.push(...first);
      if (!keys.length) keys = this.primaryKeyAttributes;
    }
    return {
      fields: [...new Set(keys)].map((name) => this.xufaFieldOf.get(name)),
      update: update.map((name) => this.xufaFieldOf.get(name)),
      set,
      where: options.conflictWhere ? this.xufaConditionSql(options.conflictWhere) : undefined,
      // As Sequelize 7: ON CONFLICT ... DO UPDATE ... WHERE: the rows there are updated only when it holds.
      updateWhere: options.onConflictUpdateWhere
        ? this.xufaConditionSql(options.onConflictUpdateWhere, true)
        : undefined,
    };
  }

  // The SQL a column is set to in ON CONFLICT ... DO UPDATE: a value as a literal of SQL, or an expression (literal,
  // fn, col) with the names of the model as its table (excluded names the row that was not inserted).
  static xufaAssignmentSql(value) {
    const dialect = this.sequelize.dialectName;
    if (!isFragment(value) && !(value && value.xufaCol !== undefined)) return literal(value, dialect);
    const { sql, params } = fragmentOf(new Context(this), value);
    const meta = this.xufaMeta;
    const table = this.xufaBackend.dialect.quoteTable(meta.table, meta.schema);
    // Its parameters as literals (outside quotes), and its table by its name.
    let index = 0;
    let quote = null;
    let out = '';
    for (const char of sql.split(Raw.TABLE).join(table)) {
      if (quote) {
        if (char === quote) quote = null;
        out += char;
      } else if (char === "'" || char === '"') {
        quote = char;
        out += char;
      } else if (char === '?' && index < params.length) {
        out += literal(params[index], dialect);
        index += 1;
      } else out += char;
    }
    return out;
  }

  // The SQL of simple conditions on attributes (of partial indexes and conflicts), with the columns of the attributes.
  // `qualified`: the columns with the table (ON CONFLICT ... DO UPDATE ... WHERE, where excluded has them too).
  static xufaConditionSql(where, qualified = false) {
    if (!where || typeof where !== 'object' || where.xufaLiteral !== undefined)
      return whereSql(where, this.sequelize.dialectName);
    const columns = {};
    Object.keys(where).forEach((name) => {
      columns[this.rawAttributes[name] ? this.rawAttributes[name].field : name] = where[name];
    });
    Object.getOwnPropertySymbols(where).forEach((symbol) => {
      columns[symbol] = where[symbol];
    });
    const meta = this.xufaMeta;
    const table = qualified ? this.xufaBackend.dialect.quoteTable(meta.table, meta.schema) : undefined;
    return whereSql(columns, this.sequelize.dialectName, table);
  }

  // Inserts the values, or updates the row with the same unique key (INSERT ... ON CONFLICT ... DO UPDATE): as
  // Sequelize in SQLite and PostgreSQL, [instance, null].
  static async upsert(values, options = {}) {
    values = valuesOf(this, values);
    options = this.sequelize.constructor.xufaWithCLS(options);
    const ready = this.xufaReady();
    if (ready) await ready;
    options = { hooks: true, validate: true, ...options };
    const pk = this.primaryKeyAttribute;
    const hasPrimary = values[pk] !== undefined && values[pk] !== null;
    const instance = this.build(values);
    if (options.validate) await instance.validate(options);
    return this.sequelize.xufaRun(options, async () => {
      // What the hooks change in the values is what is inserted or updated.
      if (options.hooks && this.hasHook('beforeUpsert')) {
        await this.runHooks('beforeUpsert', values, options);
        instance.set(values);
      }
      // As Sequelize: the values given are those updated (not the defaults of the instance).
      const fields = options.fields || Object.keys(values);
      const { createdAt, updatedAt } = this.xufaTimestamps;
      const now = new Date();
      if (createdAt && !instance.dataValues[createdAt]) instance.dataValues[createdAt] = now;
      if (updatedAt && !instance.dataValues[updatedAt]) instance.dataValues[updatedAt] = now;
      let updated = fields.filter((name) => this.xufaFieldOf.has(name));
      if (updatedAt && !updated.includes(updatedAt)) updated.push(updatedAt);
      if (!hasPrimary) updated = updated.filter((name) => name !== pk);
      const keys = this.xufaConflictKeys(updated, options.conflictFields, Boolean(options.conflictWhere));
      const row = instance.xufaRow(this.xufaDbAttributes);
      // updateValues (as Sequelize 7): what a row there gets instead of the values inserted (literal('count + 1')).
      const updateValues = options.updateValues || {};
      Object.keys(updateValues).forEach((name) => {
        if (!this.xufaFieldOf.has(name)) throw new Error(`${this.name} has no attribute ${name} (updateValues)`);
      });
      const conflict = {
        fields: keys.map((name) => this.xufaFieldOf.get(name)),
        update: updated
          .filter((name) => !keys.includes(name) && !(name in updateValues))
          .map((name) => this.xufaFieldOf.get(name)),
        set: Object.entries(updateValues).map(([name, value]) => ({
          field: this.xufaFieldOf.get(name),
          sql: this.xufaAssignmentSql(value),
        })),
        where: options.conflictWhere ? this.xufaConditionSql(options.conflictWhere) : undefined,
        updateWhere: options.onConflictUpdateWhere
          ? this.xufaConditionSql(options.onConflictUpdateWhere, true)
          : undefined,
      };
      const [key] = await this.xufaBackend.insert(this.xufaMeta, [row], { conflict });
      // The row as it is in the database (what RETURNING * gives in Sequelize).
      const where =
        key !== null && key !== undefined
          ? { [pk]: key }
          : Object.fromEntries(keys.map((name) => [name, instance.dataValues[name]]));
      const record = await this.unscoped().findOne({ where, paranoid: false, transaction: options.transaction });
      if (record) {
        instance.dataValues = record.dataValues;
        instance._previousDataValues = instance.dataValues;
      }
      instance.isNewRecord = false;
      instance._changed = null;
      const result = [instance, null];
      if (options.hooks && this.hasHook('afterUpsert')) await this.runHooks('afterUpsert', result, options);
      return result;
    });
  }

  // Loads the targets of a belongsToMany of some instances, through the through model: an array for each instance.
  static async xufaLoadThrough(association, parents, options = {}) {
    const { throughModel: through, target } = association;
    const keys = [...new Set(parents.map((parent) => parent.get(association.sourceKey, { raw: true })))].filter(
      (key) => key !== null && key !== undefined
    );
    if (keys.length === 0) return parents.map(() => []);
    const conditions = [{ [`${association.foreignKey}__in`]: keys }];
    const context = new Context(target, `${association.targetField}__`);
    if (options.where) conditions.push(translateWhere(context, options.where));
    if (options.through && options.through.where)
      conditions.push(translateWhere(new Context(through, ''), options.through.where));
    if (association.throughScope) conditions.push(translateWhere(new Context(through, ''), association.throughScope));
    for (let i = conditions.length - 1; i >= 0; i -= 1) if (!conditions[i]) conditions.splice(i, 1);
    const { deletedAt } = target.xufaTimestamps;
    if (deletedAt && options.paranoid !== false) conditions.push(target.xufaNotDeleted(`${association.targetField}__`));
    const throughDeleted = through.xufaTimestamps.deletedAt;
    const throughParanoid = !(options.through && options.through.paranoid === false);
    if (throughDeleted && throughParanoid) conditions.push({ [`${throughDeleted}__isnull`]: true });
    // The through instance under its name, or the one given (through: { as }), with the attributes asked for.
    const throughAs = (options.through && options.through.as) || through.name;
    if (throughAs !== through.name) target.xufaDefineValue(throughAs);
    const throughAttributes = options.joinTableAttributes || (options.through && options.through.attributes);
    // Orders on attributes of the targets (order: ['name', ['id', 'DESC']]), and of the through model (order:
    // [[Through, 'numYears', 'DESC']], as orders of parents by attributes of the through model give them).
    const isThrough = (item) =>
      item === through || (item && item.model === through) || item === through.name || item === throughAs;
    const order = [].concat(options.order || []).flatMap((item) => {
      if (Array.isArray(item) && item.length === 3 && isThrough(item[0])) {
        const [, name, direction] = item;
        if (typeof name !== 'string' || !through.rawAttributes[name]) return [];
        const path = (through.xufaPaths && through.xufaPaths.get(name)) || name;
        return [
          String(direction || 'ASC')
            .toUpperCase()
            .startsWith('DESC')
            ? `-${path}`
            : path,
        ];
      }
      const [name, direction] = Array.isArray(item) ? item : [item];
      if (typeof name !== 'string' || !target.rawAttributes[name]) return [];
      const path = `${association.targetField}__${(target.xufaPaths && target.xufaPaths.get(name)) || name}`;
      return [
        String(direction || 'ASC')
          .toUpperCase()
          .startsWith('DESC')
          ? `-${path}`
          : path,
      ];
    });
    const qs = new QuerySet(through.xufa)
      .filter(and(...conditions))
      .selectRelated(association.targetField)
      .orderBy(...order);
    const rows = await through.xufaBackend.select(qs.toQuery());
    const groups = new Map(keys.map((key) => [key, []]));
    const targets = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const related = row[`$${association.targetField}`];
      delete row[`$${association.targetField}`];
      if (!related) continue;
      const item = target.xufaFromRow(related, null);
      const group = groups.get(row[association.foreignKey]);
      if (!(Array.isArray(throughAttributes) && throughAttributes.length === 0)) {
        const link = through.xufaFromRow(row, null);
        if (Array.isArray(throughAttributes)) link.xufaKeep(throughAttributes);
        item.dataValues[throughAs] = link;
      }
      group.push(item);
      targets.push(item);
    }
    if (options.include) {
      const separate = normalizeIncludes(target, options.include).map((include) => ({ path: [], include }));
      await loadSeparate(targets, separate, options);
    }
    return parents.map((parent) => groups.get(parent.get(association.sourceKey, { raw: true })) || []);
  }

  // Schema

  static async sync(options = {}) {
    // As Sequelize: sync({ schema }) makes the table in that schema, its references to the tables there.
    if (options.schema && options.schema !== this.xufaSchema) {
      const copy = this.xufaSyncCopy(options.schema, options.schemaDelimiter);
      await copy.sync({ ...options, schema: undefined });
      return this;
    }
    const ready = this.xufaReady();
    if (ready) await ready;
    // With a search path (PostgreSQL), the tables are made in its first schema.
    if (options.searchPath) return this.sequelize.xufaRun(options, () => this.xufaSync(options));
    return this.sequelize.xufaLogging(options, () => this.xufaSync(options));
  }

  static async xufaSync(options) {
    if (options.hooks !== false && this.hasHook('beforeSync')) await this.runHooks('beforeSync', options);
    const backend = this.xufaBackend;
    if (options.force) {
      await backend.dropSchema([this.xufaMeta]);
      await this.xufaDropEnums();
    } else if (options.alter) await this.xufaAlter(options.alter === true ? {} : options.alter);
    // As Sequelize 7: the schema of the table is made when it is not there (its enum types are made in it).
    await backend.ensureSchemas([this.xufaMeta]);
    await this.xufaCreateEnums();
    await backend.createSchema([this.xufaMeta]);
    if (this.sequelize.dialectName === 'postgres') await this.xufaComments(options);
    if (options.hooks !== false && this.hasHook('afterSync')) await this.runHooks('afterSync', options);
    return this;
  }

  // The enum types of the model in PostgreSQL (made before its table, dropped after it).
  // The table of the enum types of the model: its name, and its schema in PostgreSQL (the types are made in it).
  static xufaEnumTable() {
    if (this.xufaSchema && this.sequelize.dialectName === 'postgres') {
      return { table: this.tableName, schema: this.xufaSchema };
    }
    return this.tableName;
  }

  static xufaEnums() {
    if (this.sequelize.dialectName !== 'postgres') return [];
    return this.xufaDbAttributes
      .map((name) => this.rawAttributes[name])
      .filter((attribute) => enumValuesOf(attribute))
      .map((attribute) => {
        const { name, schema } = enumOptionsOf(attribute);
        // A named ENUM (Sequelize 7): a type of its own name, which other columns can have too.
        return {
          column: attribute.field,
          values: enumValuesOf(attribute),
          named: name || schema ? { name, schema } : null,
        };
      });
  }

  static async xufaCreateEnums() {
    for (const { column, values, named } of this.xufaEnums()) {
      // The schema of a named type is made when it is not there.
      if (named && named.schema) await this.xufaBackend.ensureSchemas([{ schema: named.schema }]);
      await this.xufaBackend.raw(createEnumSql(this.xufaEnumTable(), column, values, named), []);
      await this.xufaAddEnumValues(column, values, named);
    }
    if (this.xufaEnums().length) this.xufaBackend.forgetStatements();
  }

  // As Sequelize: the values of the model that the enum type of a column lacks are added, in their order (each after
  // the value before it, or before the first one).
  static async xufaAddEnumValues(column, values, named) {
    const table = this.xufaEnumTable();
    const schema = enumTypeSchema(table, named);
    const rows = await this.xufaBackend.raw(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typname = $1 AND n.nspname = COALESCE($2, current_schema()) ORDER BY e.enumsortorder`,
      [enumTypeName(table, column, named), schema]
    );
    const existing = new Set(rows.map((row) => row.label));
    const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
    for (let i = 0; i < values.length; i += 1) {
      const value = String(values[i]);
      if (existing.has(value)) continue;
      const previous = i > 0 ? String(values[i - 1]) : null;
      const next = values
        .slice(i + 1)
        .map(String)
        .find((item) => existing.has(item));
      let place = '';
      if (previous !== null && existing.has(previous)) place = ` AFTER ${literal(previous)}`;
      else if (next !== undefined) place = ` BEFORE ${literal(next)}`;
      await this.xufaBackend.raw(
        `ALTER TYPE ${enumTypeRef(table, column, named)} ADD VALUE ${literal(value)}${place}`,
        []
      );
      existing.add(value);
    }
  }

  static async xufaDropEnums() {
    // Named types are kept (other tables can have them).
    for (const { column, named } of this.xufaEnums()) {
      if (named) continue;
      await this.xufaBackend.raw(`DROP TYPE IF EXISTS ${enumTypeRef(this.xufaEnumTable(), column)}`, []);
    }
    if (this.xufaEnums().length) this.xufaBackend.forgetStatements();
  }

  // sync({ alter }): the table made as the model is, with the QueryInterface: the columns it lacks added, those of
  // the model changed when their type or nullability differ, and those not in the model dropped (unless drop is false).
  static async xufaAlter(alter) {
    const qi = this.sequelize.getQueryInterface();
    if (!(await qi.tableExists(this))) return;
    const columns = await qi.describeTable(this);
    const dialect = this.sequelize.dialectName;
    const fields = new Set();
    for (const name of this.xufaDbAttributes) {
      const attribute = this.rawAttributes[name];
      const { field } = attribute;
      fields.add(field);
      const definition = {
        type: attribute.type,
        allowNull: attribute.allowNull,
        defaultValue: dbDefaultOf(attribute.defaultValue),
        primaryKey: attribute.primaryKey,
        autoIncrement: attribute.autoIncrement,
        unique: attribute.unique,
        references: attribute.references,
        onDelete: attribute.onDelete,
        onUpdate: attribute.onUpdate,
      };
      const current = columns[field];
      if (!current)
        await qi.addColumn(this, field, {
          ...definition,
          generatedAs: attribute.generatedAs,
          generatedColumn: attribute.generatedColumn,
        });
      // Generated columns are left as they are (the database computes them).
      else if (!attribute.primaryKey && attribute.generatedAs === undefined) {
        const nullable = attribute.allowNull !== false;
        // An ENUM of PostgreSQL has its own type (whose values are added apart): changed when the column has another.
        const enumType = dialect === 'postgres' && enumValuesOf(attribute);
        const wanted = enumType
          ? attribute.type.key === 'ARRAY'
            ? 'ARRAY'
            : 'USER-DEFINED'
          : sqlTypeOf(attribute.type, dialect);
        if ((wanted && wanted.toUpperCase() !== String(current.type).toUpperCase()) || nullable !== current.allowNull) {
          await qi.changeColumn(this, field, { ...definition, references: undefined });
        }
      }
    }
    if (alter.drop !== false) {
      for (const column of Object.keys(columns)) if (!fields.has(column)) await qi.removeColumn(this, column);
    }
    if (dialect === 'postgres') {
      await this.xufaAlterFillfactor();
      await this.xufaAlterDeferrables();
    }
  }

  // The foreign keys whose deferrable the model says otherwise (PostgreSQL): changed (ALTER CONSTRAINT).
  static async xufaAlterDeferrables() {
    const wanted = new Map();
    this.xufaForeignKeys.forEach((key, name) => {
      const attribute = this.rawAttributes[name];
      if (!attribute) return;
      // The attribute's, as it is now (it can be changed after the association copied it).
      const deferrable = (attribute.references && attribute.references.deferrable) || key.deferrable;
      if (deferrable) wanted.set(attribute.field, deferrableSql(deferrable));
    });
    if (wanted.size === 0) return;
    const qi = this.sequelize.getQueryInterface();
    const meta = this.xufaMeta;
    const table = this.xufaBackend.dialect.quoteTable(meta.table, meta.schema);
    for (const row of await qi.getForeignKeyReferencesForTable(this)) {
      const sql = wanted.get(row.columnName);
      if (!sql || sql === row.deferrable.xufaDeferrable) continue;
      const name = `"${String(row.constraintName).replace(/"/g, '""')}"`;
      await this.xufaBackend.raw(`ALTER TABLE ${table} ALTER CONSTRAINT ${name} ${sql}`, []);
    }
  }

  // The fillfactor of the table as the model says it (set, or reset when the model has none).
  static async xufaAlterFillfactor() {
    const meta = this.xufaMeta;
    const backend = this.xufaBackend;
    const [row] = await backend.raw(
      `SELECT c.reloptions FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE c.relname = $1 AND n.nspname = COALESCE($2, current_schema())`,
      [meta.table, meta.schema]
    );
    const option = ((row && row.reloptions) || []).find((item) => item.startsWith('fillfactor='));
    const current = option ? Number(option.slice('fillfactor='.length)) : null;
    const wanted = meta.fillfactor || null;
    if (current === wanted) return;
    const table = backend.dialect.quoteTable(meta.table, meta.schema);
    await backend.raw(
      wanted ? `ALTER TABLE ${table} SET (fillfactor = ${wanted})` : `ALTER TABLE ${table} RESET (fillfactor)`,
      []
    );
  }

  static async drop() {
    const ready = this.xufaReady();
    if (ready) await ready;
    await this.xufaBackend.dropSchema([this.xufaMeta]);
  }

  static async describe(schema, options) {
    if (schema) throw new NotSupportedError('Schemas');
    return this.sequelize.getQueryInterface().describeTable(this, options);
  }

  static get queryInterface() {
    return this.sequelize.getQueryInterface();
  }
}

for (const type of [...HOOKS, ...KEPT_HOOKS]) {
  Model[type] = function addTypedHook(name, fn) {
    return this.addHook(type, name, fn);
  };
}

function incrementsOf(fields, options) {
  const by = options.by === undefined ? 1 : options.by;
  if (typeof fields === 'string') return { [fields]: by };
  if (Array.isArray(fields)) return Object.fromEntries(fields.map((name) => [name, by]));
  return { ...fields };
}

// The values of a plain object (instances as their plain values).
// Instances as objects: their getters take the options given (get({ plain: true, ...options })).
function plainOf(value, options) {
  const plain = { ...options, plain: true };
  if (isInstance(value)) return value.get(plain);
  if (Array.isArray(value) && value.length && isInstance(value[0])) return value.map((item) => item.get(plain));
  return value;
}

// Whether a value of a condition on the primary key is one value (not operators nor lists).
function isUnique(model, value) {
  return value !== undefined && value !== null && (typeof value !== 'object' || value instanceof Date);
}

// The equalities of a where (to create what was not found).
function equalities(where) {
  const values = {};
  Object.keys(where).forEach((key) => {
    const value = where[key];
    if (value === null || typeof value !== 'object' || value instanceof Date) values[key] = value;
    else if (Object.getOwnPropertySymbols(value).length === 1 && value[Op.eq] !== undefined) values[key] = value[Op.eq];
  });
  (where[Op.and] ? [].concat(where[Op.and]) : []).forEach((item) => Object.assign(values, equalities(item)));
  return values;
}

// Merges the options of scopes: conditions are ANDed, includes added, the rest replaced.
// Includes of the same model (and alias) merged into one, as Sequelize merges them: their options over those before,
// their includes merged too.
function mergeIncludes(base, extra) {
  const asObject = (item) => {
    if (typeof item === 'function') return { model: item };
    if (typeof item === 'string' || (item && item.associationType)) return { association: item };
    return item;
  };
  const keyOf = (item) => {
    if (item.all) return null;
    if (item.association) return typeof item.association === 'string' ? item.association : item.association.as;
    const model = item.model && (item.model.xufaBase || item.model);
    return model ? `${model.name}|${typeof item.as === 'string' ? item.as : ''}` : null;
  };
  const result = [];
  const byKey = new Map();
  [...[].concat(base || []), ...[].concat(extra || [])].map(asObject).forEach((item) => {
    const key = keyOf(item);
    if (key === null || !byKey.has(key)) {
      if (key !== null) byKey.set(key, result.length);
      result.push(item);
      return;
    }
    const index = byKey.get(key);
    const merged = mergeOptions(result[index], item);
    if (result[index].include || item.include) merged.include = mergeIncludes(result[index].include, item.include);
    result[index] = merged;
  });
  return result;
}

// As Sequelize: the options over the scope; their wheres merged key by key (those of the options win), others with
// Op.and.
function mergeOptions(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  // Options given as undefined leave those of the scope.
  const merged = { ...base };
  Object.keys(extra).forEach((key) => {
    if (extra[key] !== undefined) merged[key] = extra[key];
  });
  Object.getOwnPropertySymbols(extra).forEach((key) => {
    merged[key] = extra[key];
  });
  if (base.where && extra.where) {
    merged.where =
      isPlainObject(base.where) && isPlainObject(extra.where)
        ? { ...base.where, ...extra.where }
        : { [Op.and]: [base.where, extra.where] };
  }
  if (base.include && extra.include) merged.include = mergeIncludes(base.include, extra.include);
  if (Array.isArray(base.attributes) && Array.isArray(extra.attributes)) {
    merged.attributes = [...new Set([...base.attributes, ...extra.attributes])];
  }
  return merged;
}

// The values of an order item for an instance: through its associations (every row of those of many), to its
// attribute.
function orderValues(model, instance, parts) {
  const attribute = parts[parts.length - 1];
  let current = [instance];
  let currentModel = model;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    let association;
    if (typeof part === 'string') association = currentModel.associations[part];
    else if (part && part.associationType) association = part;
    else {
      const options = typeof part === 'function' ? { model: part } : part;
      const target = options.model && (options.model.xufaBase || options.model);
      association = Object.values(currentModel.associations).find((candidate) =>
        options.as ? candidate.as === options.as : target && candidate.target.name === target.name
      );
    }
    if (!association) return [];
    current = current.flatMap((item) => [].concat(item.dataValues[association.as] || []));
    currentModel = association.target;
  }
  let name = attribute;
  if (attribute && attribute.xufaCol) name = attribute.xufaCol;
  return current.map((item) => item.dataValues[name]).filter((value) => value !== undefined);
}

function compareValues(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  const x = a instanceof Date ? a.getTime() : a;
  const y = b instanceof Date ? b.getTime() : b;
  if (x < y) return -1;
  return x > y ? 1 : 0;
}

// Sorts instances by an order with items through includes of many rows: each instance by its smallest value of them
// (ascending) or its largest (descending), as a join of their rows would put it.
function sortAsJoined(model, instances, order) {
  const items = (Array.isArray(order) ? order : [order]).map((item) => {
    const parts = Array.isArray(item) ? [...item] : [item];
    let desc = false;
    if (parts.length > 1 && typeof parts[parts.length - 1] === 'string' && DIRECTIONS.test(parts[parts.length - 1])) {
      desc = parts.pop().toUpperCase().startsWith('DESC');
    }
    return { parts, desc };
  });
  if (!items.some(({ parts }) => parts.length > 1)) return;
  const keys = new Map(
    instances.map((instance) => [
      instance,
      items.map(({ parts, desc }) => {
        const values = orderValues(model, instance, parts).filter((value) => value !== null);
        if (values.length === 0) return null;
        return values.reduce((best, value) => (compareValues(value, best) * (desc ? -1 : 1) < 0 ? value : best));
      }),
    ])
  );
  instances.sort((a, b) => {
    for (let i = 0; i < items.length; i += 1) {
      const result = compareValues(keys.get(a)[i], keys.get(b)[i]);
      if (result !== 0) return items[i].desc ? -result : result;
    }
    return 0;
  });
}

// The raw rows of an instance with includes: its values and those of its includes as 'books.title' keys, a row for
// every row of the includes of many (or nested objects with nest).
function flattenRaw(instance, nest, prefix = '') {
  let rows = [{}];
  const { dataValues } = instance;
  Object.keys(dataValues).forEach((key) => {
    const value = dataValues[key];
    if (isInstance(value)) {
      const children = flattenRaw(value, false, `${prefix}${key}.`);
      rows = rows.flatMap((row) => children.map((child) => ({ ...row, ...child })));
    } else if (Array.isArray(value) && value.every(isInstance)) {
      if (value.length === 0) return;
      const children = value.flatMap((item) => flattenRaw(item, false, `${prefix}${key}.`));
      rows = rows.flatMap((row) => children.map((child) => ({ ...row, ...child })));
    } else
      rows.forEach((row) => {
        row[`${prefix}${key}`] = value;
      });
  });
  if (!nest) return rows;
  return rows.map((row) => {
    const nested = {};
    Object.keys(row).forEach((key) => {
      const steps = key.split('.');
      let target = nested;
      for (let i = 0; i < steps.length - 1; i += 1) {
        target[steps[i]] = target[steps[i]] || {};
        target = target[steps[i]];
      }
      target[steps[steps.length - 1]] = row[key];
    });
    return nested;
  });
}

// The rows of raw queries: the values of joined includes as 'author.name' keys, or nested with nest.
function rawRow(row, joined, nest, prefix = '', target = row) {
  if (!joined) return row;
  joined.forEach((node) => {
    const key = `$${node.fieldName}`;
    const related = row[key];
    delete row[key];
    if (nest) {
      row[node.as] = related ? rawRow(related, node.children, true) : null;
      return;
    }
    const base = `${prefix}${node.as}.`;
    Object.keys(node.model.rawAttributes).forEach((name) => {
      if (node.model.rawAttributes[name].type.kind === 'virtual') return;
      target[`${base}${name}`] = related ? related[name] : null;
    });
    if (related) rawRow(related, node.children, false, base, target);
  });
  return row;
}

// A value written as the stringify function given to its type makes it (as Sequelize writes it), as the field takes
// it: the text of json values parsed.
function xufaStringified(model, name, value) {
  if (value === null || value === undefined) return value;
  const type = model.xufaCustomTypes().stringifiers.get(name);
  const how = type && customStringifyOf(type);
  if (!how) return value;
  const options = { dialect: model.sequelize.dialectName, timezone: model.sequelize.options.timezone || '+00:00' };
  let text;
  if (how === 'bindParam') {
    type.bindParam(value, {
      ...options,
      bindParam: (bound) => {
        text = bound;
        return '$1';
      },
    });
  } else text = type.stringify(value, options);
  // The text of the database as the value of the field: json and geometries parsed, hstore read.
  if (typeof text !== 'string') return text;
  if (type.kind === 'json' || type.kind === 'geometry') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  if (type.kind === 'hstore') return parseHstore(text);
  return text;
}

// The values of an instance (and of those it includes) that no attribute nor association has, as properties.
function exposeRuntimeAttributes(instance) {
  if (!isInstance(instance)) return;
  const model = instance.constructor;
  Object.keys(instance.dataValues).forEach((key) => {
    const value = instance.dataValues[key];
    if (model.associations[key]) {
      [].concat(value).forEach(exposeRuntimeAttributes);
      return;
    }
    if (model.rawAttributes[key] || key in instance) return;
    Object.defineProperty(instance, key, {
      configurable: true,
      get() {
        return this.get(key);
      },
      set(next) {
        this.set(key, next, { raw: true });
      },
    });
  });
}

// The values of an object given for a model: a plain object as it is; an instance of a class of its own (as Sequelize
// 7 takes it), its own values and those its getters give for the attributes and associations of the model.
function valuesOf(model, values) {
  if (values === null || typeof values !== 'object' || isPlainObject(values) || isInstance(values)) return values;
  if (Array.isArray(values) || values instanceof Date || Buffer.isBuffer(values) || values instanceof Map)
    return values;
  const plain = { ...values };
  [...Object.keys(model.rawAttributes), ...Object.keys(model.associations)].forEach((name) => {
    if (!(name in plain) && name in values && values[name] !== undefined) plain[name] = values[name];
  });
  return plain;
}

function renameValues(values, renames) {
  renames.forEach(([from, to]) => {
    values[to] = values[from];
    if (!renames.some(([other]) => other === to)) delete values[from];
  });
}

// Paths of attributes in @xufa/orm for a model reached at `base` (author__ for the includes of author). '$a.b$'
// names an attribute of an include from the root of the query, and '$xufa:path$' is a path of @xufa/orm.
class Context {
  constructor(model, base = '', root = model) {
    this.model = model;
    this.base = base;
    this.root = root;
    this.dialect = model.sequelize.dialectName;
  }

  path(key) {
    if (key.length > 2 && key[0] === '$' && key[key.length - 1] === '$') {
      const inner = key.slice(1, -1);
      if (inner.startsWith('xufa:')) return inner.slice(5);
      const parts = inner.split('.');
      const attribute = parts.pop();
      let model = this.root;
      const steps = [];
      // The model of the query itself (its name, as the alias of its table).
      if (parts.length && !model.associations[parts[0]] && (parts[0] === model.name || parts[0] === model.tableName)) {
        parts.shift();
      }
      parts.forEach((alias) => {
        const association = model.associations[alias];
        if (!association) throw new errors.BaseError(`${model.name} has no association ${alias}`);
        steps.push(associationPath(association));
        model = association.target;
      });
      steps.push(attribute);
      return steps.join('__');
    }
    // 'data.owner.name' is a path inside the values of a json attribute (see jsonPath).
    return String(this.jsonPath(key));
  }

  // The path of a key in conditions: for 'data.owner.name' (a path inside the values of the json attribute data:
  // indexes as data.tags[0] or data.tags.0, keys in double quotes as data."a.b", a cast after :: left out), a JsonRef
  // of its keys; otherwise the path of @xufa/orm.
  jsonPath(key) {
    if (key.length > 2 && key[0] === '$' && key[key.length - 1] === '$') return this.path(key);
    const split = /[.[]|::/.exec(key);
    if (!split) return this.base + key;
    const attribute = key.slice(0, split.index);
    // Otherwise 'author.name' is an attribute of an include, as '$author.name$'.
    if (!this.isJson(attribute)) {
      if (split[0] === '.') return this.path(`$${key}$`);
      return this.base + key;
    }
    const rest = key.slice(split.index + (split[0] === '.' ? 1 : 0));
    const { steps } = parseJsonPath(rest);
    return steps.length ? new JsonRef(this.base + attribute, steps) : this.base + attribute;
  }

  isJson(key) {
    const attribute = this.model.rawAttributes[key];
    return Boolean(attribute && attribute.type.kind === 'json');
  }

  isRange(key) {
    const attribute = this.model.rawAttributes[key];
    return Boolean(attribute && attribute.type.kind === 'range');
  }
}

// The path of @xufa/orm through an association.
function associationPath(association) {
  if (association.xufaLoose) throw new NotSupportedError('Conditions across polymorphic associations');
  switch (association.associationType) {
    case 'BelongsTo':
      return association.source.xufaPaths.get(association.foreignKey);
    case 'BelongsToMany':
      return `${association.sourceRelation}__${association.targetField}`;
    default:
      return association.relatedName;
  }
}

// The association of an include of a model (and an alias), as Sequelize finds it.
function includedAssociation(model, target, alias) {
  const associations = model.getAssociations(target);
  if (associations.length === 0)
    throw new errors.EagerLoadingError(`${target.name} is not associated to ${model.name}!`);
  const association = model.getAssociationForAlias(target, alias);
  if (association) return association;
  if (associations.length > 1) {
    throw new errors.EagerLoadingError(
      `${target.name} is associated to ${model.name} multiple times. To identify the correct association, you must use the 'as' keyword to specify the alias of the association you want to include.`
    );
  }
  if (alias) {
    throw new errors.EagerLoadingError(
      `${target.name} is associated to ${model.name} using an alias. You've included an alias (${alias}), but it does not match the alias(es) defined in your association (${associations.map((item) => item.as).join(', ')}).`
    );
  }
  throw new errors.EagerLoadingError(
    `${target.name} is associated to ${model.name} using an alias. You must use the 'as' keyword to specify the alias within your include statement.`
  );
}

// The includes of options as { association, include (nested), where, required, attributes, through, paranoid }.
const ALL_TYPES = {
  BelongsTo: ['BelongsTo'],
  HasOne: ['HasOne'],
  HasMany: ['HasMany'],
  BelongsToMany: ['BelongsToMany'],
  One: ['BelongsTo', 'HasOne'],
  Many: ['HasMany', 'BelongsToMany'],
};

// include: [{ all: true | type, nested, attributes }]: the associations of those types (and theirs, nested).
function includeAll(model, item, seen = new Set([model])) {
  const types = item.all === true ? null : ALL_TYPES[item.all];
  if (item.all !== true && !types)
    throw new Error(
      `include all '${item.all}' is not valid - must be BelongsTo, HasOne, HasMany, One, Has, Many or All`
    );
  return Object.values(model.associations)
    .filter((association) => !types || types.includes(association.associationType))
    .filter((association) => !item.nested || !seen.has(association.target))
    .map((association) => ({
      association,
      include: item.nested ? includeAll(association.target, item, new Set([...seen, association.target])) : [],
      required: false,
      attributes: item.attributes,
    }));
}

function normalizeIncludes(model, includes) {
  const items = [].concat(includes || []);
  // An include of an association given also in an include all is that one.
  const explicit = items.filter((item) => !(item && item.all));
  return items.flatMap((item) => {
    if (item && item.all) {
      const named = normalizeIncludes(model, explicit).map((include) => include.association);
      return includeAll(model, item).filter((include) => !named.includes(include.association));
    }
    let options;
    if (typeof item === 'string') options = { association: item };
    else if (typeof item === 'function') options = { model: item };
    else if (item && item.associationType) options = { association: item };
    else if (item && typeof item === 'object') options = { ...item };
    else throw new Error('Include unexpected. Element has to be either a Model, an Association or an object.');
    let association = options.association;
    if (typeof association === 'string') association = model.associations[association];
    else if (!association) {
      if (options.model) association = includedAssociation(model, options.model.xufaBase || options.model, options.as);
      else
        association = model.associations[typeof options.as === 'string' ? options.as : options.as && options.as.plural];
    }
    if (!association)
      throw new errors.BaseError(`Association with alias "${options.association}" does not exist on ${model.name}`);
    // An include of a copy of the target in another schema (Target.schema('s')): its rows are those of that copy (as
    // Sequelize reads them), loaded apart.
    if (
      options.model &&
      options.model.xufaCopy &&
      options.model !== association.target &&
      (options.model.xufaBase || options.model) === (association.target.xufaBase || association.target) &&
      association.associationType !== 'BelongsToMany'
    ) {
      association = Object.create(association, { target: { value: options.model, enumerable: true } });
      if (association.associationType === 'BelongsTo') options.separate = true;
    }
    const target = options.model && options.model.xufaScope ? options.model : association.target;
    let { where } = options;
    const required = options.required !== undefined ? options.required : Boolean(where);
    // The scope of the association filters its targets too.
    if (association.scope) where = where ? { [Op.and]: [association.scope, where] } : association.scope;
    if (target.xufaScope && target.xufaScope.where)
      where = where ? { [Op.and]: [target.xufaScope.where, where] } : target.xufaScope.where;
    return [
      {
        association,
        include: normalizeIncludes(association.target, options.include),
        where,
        required,
        attributes: options.attributes,
        through: options.through,
        paranoid: options.paranoid,
        order: options.order,
        separate: options.separate,
        xufaOptions: options,
      },
    ];
  });
}

// Whether an attribute is a VIRTUAL computed by the database (VIRTUAL(type, (includeAs) => [literal, name])).
function isComputed(model, name) {
  const definition = model.rawAttributes[name];
  return Boolean(
    definition && definition.type.kind === 'virtual' && typeof definition.type.options.fields === 'function'
  );
}

// The attributes asked for: { names, renames, aggregates } (names null for all).
function attributesOf(model, attributes) {
  if (!attributes) return { names: null };
  if (Array.isArray(attributes) && attributes.length === 0) {
    throw new errors.QueryError(
      `Attempted a SELECT query for model '${model.name}' as ${model.name} without selecting any columns`
    );
  }
  let items = attributes;
  if (!Array.isArray(attributes)) {
    const exclude = new Set(attributes.exclude || []);
    items = [...Object.keys(model.rawAttributes).filter((name) => !exclude.has(name)), ...(attributes.include || [])];
  }
  const names = [];
  const renames = [];
  const aggregates = {};
  // Values inside json attributes: { path ('data.owner'), alias }; fragments (literal, fn): { value, alias }.
  const json = [];
  const fragments = [];
  // The names the instances get (attributes and aliases).
  const selected = items.map((item) => (Array.isArray(item) ? item[1] : typeof item === 'string' ? item : null));
  items.forEach((item, index) => {
    // literal('... AS "alias"'): the alias is in the SQL.
    if (item && item.xufaLiteral !== undefined) {
      const match = /^([\s\S]*?)\s+AS\s+(["`]?)(\w+)\2\s*$/i.exec(item.xufaLiteral);
      const alias = match ? match[3] : item.xufaLiteral;
      fragments.push({ value: match ? { xufaLiteral: match[1] } : item, alias });
      selected[index] = alias;
      return;
    }
    if (typeof item === 'string') {
      const definition = model.rawAttributes[item];
      // A VIRTUAL with the attributes it is made of (VIRTUAL(type, ['a', 'b'])) selects them.
      if (definition && definition.type.kind === 'virtual') {
        const { fields } = definition.type.options;
        // As Sequelize 7 (include as): VIRTUAL(type, (includeAs) => [literal(...), name]) is computed by the database,
        // includeAs naming the table of the model in the query (its includes too).
        if (typeof fields === 'function') {
          const made = fields(model.name);
          const [source, alias] = Array.isArray(made) ? made : [made, item];
          if (!isFragment(source))
            throw new Error(`The SQL of the VIRTUAL ${model.name}.${item} must be a literal or a fn`);
          fragments.push({ value: source, alias: alias || item });
          selected[index] = alias || item;
          return;
        }
        names.push(...(fields || []));
        return;
      }
      if (item.includes('.')) json.push({ path: item, alias: item });
      else names.push(item);
      return;
    }
    if (Array.isArray(item)) {
      if (item.length !== 2) {
        throw new Error(
          `${JSON.stringify(item)} is not a valid attribute definition. Please use the following format: ['attribute definition', 'alias']`
        );
      }
      const [source, alias] = item;
      const aggregate = aggregateOf(source);
      if (aggregate) aggregates[alias] = aggregate;
      // An aggregate of an expression (SUM(CAST(... AS INT)), COUNT(DISTINCT(fn(...)))): its SQL, as an aggregate.
      else if (source && source.xufaFn && AGGREGATES[source.xufaFn.toUpperCase()]) aggregates[alias] = { raw: source };
      else if (source && source.xufaJson) json.push({ path: source.xufaJson, alias });
      else if (isFragment(source)) fragments.push({ value: source, alias });
      else if (typeof source === 'string' && source.includes('.')) json.push({ path: source, alias });
      else if (typeof source === 'string' || (source && source.xufaCol)) {
        const name = typeof source === 'string' ? source : source.xufaCol;
        names.push(name);
        renames.push([name, alias]);
      } else throw new NotSupportedError('Attributes that are not attributes nor aggregates');
      return;
    }
    if (item && item.xufaCol) {
      names.push(item.xufaCol);
      return;
    }
    throw new NotSupportedError('Attributes that are not attributes nor aggregates');
  });
  return { names, renames, aggregates, json, fragments, selected: selected.filter(Boolean) };
}

// The order as names of @xufa/orm ('-author__name').
// `nested` (a Map) takes the orders of includes loaded apart (hasMany, hasOne, belongsToMany) by the aliases that
// reach them ('books', 'books.tags'): they order the rows of those includes.
function orderOf(model, context, order, nested) {
  if (!order) return null;
  const items = Array.isArray(order) ? order : [order];
  const names = items.map((item) => {
    if (typeof item === 'string' && context.aliases && context.aliases.has(item)) {
      const { sql, params } = context.aliases.get(item);
      return Raw(sql, params);
    }
    if (typeof item === 'string') return context.path(item);
    if (item && item.xufaCol) return context.path(item.xufaCol);
    if (isFragment(item)) {
      const { sql, params } = fragmentOf(context, item);
      return Raw(sql, params);
    }
    // An attribute as its definition (Model.rawAttributes.id).
    if (item && !Array.isArray(item) && typeof item.fieldName === 'string') return context.path(item.fieldName);
    if (!Array.isArray(item)) throw new NotSupportedError('Orders of this expression');
    // [attribute] without a direction (an alias of the attributes is its SQL).
    if (item.length === 1 && typeof item[0] === 'string') {
      if (context.aliases && context.aliases.has(item[0])) {
        const { sql, params } = context.aliases.get(item[0]);
        return Raw(sql, params);
      }
      return context.path(item[0]);
    }
    // [attribute, literal('ASC, name DESC')]: the literal after the column.
    if (item.length === 2 && typeof item[0] === 'string' && item[1] && item[1].xufaLiteral !== undefined) {
      return Raw(`${columnSql(context, item[0])} ${literalSql(context, item[1].xufaLiteral)}`, []);
    }
    // [literal() | fn(), direction]
    if (isFragment(item[0]) && item.length <= 2) {
      const { sql, params } = fragmentOf(context, item[0]);
      const direction = item[1] && DIRECTIONS.test(item[1]) ? ` ${item[1].toUpperCase()}` : '';
      return Raw(`${sql}${direction}`, params);
    }
    const parts = [...item];
    let direction = 'ASC';
    if (parts.length > 1 && typeof parts[parts.length - 1] === 'string' && DIRECTIONS.test(parts[parts.length - 1])) {
      direction = parts.pop().toUpperCase();
    }
    const attribute = parts.pop();
    // An alias of a literal or a function of the attributes: its SQL.
    if (parts.length === 0 && typeof attribute === 'string' && context.aliases && context.aliases.has(attribute)) {
      const { sql, params } = context.aliases.get(attribute);
      return Raw(`${sql} ${direction}`, params);
    }
    const steps = [];
    const aliases = [];
    let current = model;
    for (let index = 0; index < parts.length; index += 1) {
      const association = orderAssociation(current, parts[index]);
      if (!association) throw new errors.BaseError(`Unable to find the association to order by in ${current.name}`);
      aliases.push(association.as);
      if (association.associationType !== 'BelongsTo') {
        if (!nested) throw new NotSupportedError('Order by attributes of hasMany, hasOne and belongsToMany includes');
        const key = aliases.join('.');
        nested.set(key, [...(nested.get(key) || []), [...parts.slice(index + 1), attribute, direction]]);
        // The parents by the rows of an include of theirs: in SQL (limits too), by the first of the rows of each, as a
        // join orders them.
        const sql = includeOrderSql(model, parts, attribute, direction);
        if (!sql) return null;
        nested.xufaSql = true;
        return Raw(`${sql} ${direction.startsWith('DESC') ? 'DESC' : 'ASC'}`, []);
      }
      steps.push(associationPath(association));
      current = association.target;
    }
    let name;
    if (typeof attribute === 'string') name = attribute;
    else if (attribute && attribute.xufaCol) name = attribute.xufaCol;
    else if (attribute && attribute.xufaJson) name = attribute.xufaJson;
    else if (attribute && typeof attribute.fieldName === 'string') name = attribute.fieldName;
    else throw new NotSupportedError('Orders of literals and functions');
    const path = steps.length ? `${steps.join('__')}__${name}` : context.path(name);
    return direction.startsWith('DESC') ? `-${path}` : path;
  });
  return names.filter((name) => name !== null);
}

// The SQL of the value an instance is ordered by through an include of many (hasMany, hasOne, belongsToMany: an attribute
// of the targets, or of the through model with [Target, Through, 'attribute']): the first one of its rows (MIN, or MAX
// in descending orders), as a correlated subquery. Null when the order is not of those.
function includeOrderSql(model, parts, attribute, direction) {
  const name = typeof attribute === 'string' ? attribute : attribute && attribute.fieldName;
  if (typeof name !== 'string') return null;
  const q = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;
  const qi = model.sequelize.getQueryInterface();
  const fn = direction.startsWith('DESC') ? 'MAX' : 'MIN';
  const fieldOf = (owner, attributeName) =>
    owner.rawAttributes[attributeName] && owner.rawAttributes[attributeName].field;
  // The conditions of the rows: not deleted (paranoid models) and the values of scopes.
  const conditions = (owner, alias, scope) => {
    const items = [];
    const { deletedAt } = owner.xufaTimestamps;
    if (deletedAt) items.push(`${alias}.${q(fieldOf(owner, deletedAt))} IS NULL`);
    Object.entries(scope || {}).forEach(([key, value]) => {
      const column = fieldOf(owner, key);
      if (!column || (value !== null && typeof value === 'object')) return;
      items.push(
        value === null
          ? `${alias}.${q(column)} IS NULL`
          : `${alias}.${q(column)} = ${literal(value, owner.sequelize.dialectName)}`
      );
    });
    return items;
  };
  // The steps from the model of the query: belongsTo, hasOne, hasMany and belongsToMany (the through model of the
  // last belongsToMany can name the column: [Target, Through, 'attribute']).
  const tables = [];
  const correlations = [];
  let previous = Raw.TABLE;
  let current = model;
  let column = null;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const last = tables.length && tables[tables.length - 1];
    const throughPart = typeof part === 'function' ? part : part && part.model;
    if (
      last &&
      last.through &&
      index === parts.length - 1 &&
      throughPart &&
      (throughPart.xufaBase || throughPart).name === last.through.name
    ) {
      column = `${last.throughAlias}.${q(fieldOf(last.through, name) || '')}`;
      if (!fieldOf(last.through, name)) return null;
      break;
    }
    const association = orderAssociation(current, part);
    if (!association || association.xufaLoose) return null;
    const { source, target } = association;
    const alias = `o${index}`;
    const on = [];
    const step = { join: '', through: null, throughAlias: null };
    if (association.associationType === 'BelongsTo') {
      on.push(
        `${alias}.${q(fieldOf(target, association.targetKey))} = ${previous}.${q(fieldOf(source, association.foreignKey))}`
      );
      step.join = `${qi.qt(target)} AS ${alias}`;
    } else if (association.associationType === 'HasMany' || association.associationType === 'HasOne') {
      on.push(
        `${alias}.${q(fieldOf(target, association.foreignKey))} = ${previous}.${q(fieldOf(source, association.sourceKey))}`
      );
      step.join = `${qi.qt(target)} AS ${alias}`;
    } else if (association.associationType === 'BelongsToMany') {
      const through = association.throughModel;
      const throughAlias = `${alias}t`;
      // The through model first: its key to the source, then the target by its other key.
      tables.push({
        join: `${qi.qt(through)} AS ${throughAlias}`,
        on: [
          `${throughAlias}.${q(fieldOf(through, association.foreignKey))} = ${previous}.${q(fieldOf(source, association.sourceKey))}`,
          ...conditions(through, throughAlias, association.throughScope),
        ],
      });
      on.push(
        `${alias}.${q(fieldOf(target, association.targetKey))} = ${throughAlias}.${q(fieldOf(through, association.otherKey))}`
      );
      step.join = `${qi.qt(target)} AS ${alias}`;
      step.through = through;
      step.throughAlias = throughAlias;
    } else return null;
    if (on.some((item) => item.includes('"undefined"'))) return null;
    on.push(...conditions(target, alias, association.scope));
    step.on = on;
    tables.push(step);
    previous = alias;
    current = target;
  }
  if (tables.length === 0) return null;
  if (!column) {
    const field = fieldOf(current, name);
    if (!field) return null;
    column = `${previous}.${q(field)}`;
  }
  // The first table is correlated with the row of the query (in WHERE); the others are joined.
  const [first, ...joined] = tables;
  correlations.push(...first.on);
  const joins = joined.map(({ join, on }) => ` JOIN ${join} ON ${on.join(' AND ')}`).join('');
  return `(SELECT ${fn}(${column}) FROM ${first.join}${joins} WHERE ${correlations.join(' AND ')})`;
}

// The association an order names from a model: by its alias, the association itself, a model or { model, as }.
function orderAssociation(current, part) {
  if (typeof part === 'string') return current.associations[part];
  if (part && part.associationType) return part;
  const options = typeof part === 'function' ? { model: part } : part;
  if (!options) return undefined;
  const target = options.model && (options.model.xufaBase || options.model);
  return Object.values(current.associations).find((candidate) =>
    options.as ? candidate.as === options.as : target && candidate.target.name === target.name
  );
}

// The plan of a find: the QuerySet of @xufa/orm, the includes joined (belongsTo, made from the rows) and those
// loaded with queries of their own (hasMany, hasOne, belongsToMany, and what is under them).
function planFind(model, options) {
  const context = new Context(model);
  const conditions = [];
  const add = (condition) => {
    if (condition) conditions.push(condition);
  };
  if (options.where) add(translateWhere(context, options.where));
  const { deletedAt } = model.xufaTimestamps;
  if (deletedAt && options.paranoid !== false) conditions.push(model.xufaNotDeleted());
  const related = [];
  const separate = [];
  const includes = options.include ? normalizeIncludes(model, options.include) : [];
  // Aggregates in the attributes of includes loaded apart (attributes: [[fn('COUNT', col('comments.id')), 'n']]) are
  // of the query itself, as '<alias>.<name>' (the include gives no rows of its own then).
  let rootAttributes = options.attributes;
  includes.forEach((include) => {
    if (include.association.associationType === 'BelongsTo' || !Array.isArray(include.attributes)) return;
    const hoisted = include.attributes.filter((item) => Array.isArray(item) && aggregateOf(item[0]));
    if (hoisted.length === 0 || hoisted.length !== include.attributes.length) return;
    rootAttributes = [
      ...(rootAttributes || []),
      ...hoisted.map(([source, alias]) => [source, `${include.association.as}.${alias}`]),
    ];
    include.attributes = [];
  });
  const nestedOrders = new Map();
  // The aliases of literals and functions in the attributes: orders can name them ([['customAttribute', 'DESC']]).
  if (rootAttributes && options.order) {
    const { fragments } = attributesOf(model, rootAttributes);
    if (fragments && fragments.length) {
      context.aliases = new Map(fragments.map(({ value, alias }) => [alias, fragmentOf(context, value)]));
    }
  }
  const parentOrder =
    options.xufaCount || options.xufaWrite ? null : orderOf(model, context, options.order, nestedOrders);
  const walk = (current, items, base, path, joinedList) => {
    items.forEach((include) => {
      const { association } = include;
      const target = association.target;
      // A belongsTo with attributes that are not names (json paths, fragments, VIRTUALs computed by SQL), or of a
      // polymorphic key, is loaded apart.
      if (
        association.associationType === 'BelongsTo' &&
        ((Array.isArray(include.attributes) &&
          include.attributes.some((item) => typeof item !== 'string' || isComputed(target, item))) ||
          association.xufaLoose)
      ) {
        include.separate = true;
      }
      if (association.associationType === 'BelongsTo' && !include.separate) {
        const fieldName = current.xufaPaths.get(association.foreignKey);
        const step = `${base}${fieldName}`;
        related.push(step);
        if (include.where) add(translateWhere(new Context(target, `${step}__`, model), include.where));
        if (include.required && !include.where) conditions.push({ [`${step}__isnull`]: false });
        const targetDeleted = target.xufaTimestamps.deletedAt;
        if (include.required && targetDeleted && include.paranoid !== false)
          conditions.push({ [`${step}__${targetDeleted}__isnull`]: true });
        const node = {
          as: association.as,
          fieldName,
          model: target,
          children: [],
          attributes: include.attributes
            ? Array.isArray(include.attributes) && include.attributes.length === 0
              ? []
              : attributesOf(target, include.attributes).names
            : null,
          deletedAt: include.paranoid !== false ? targetDeleted : null,
        };
        joinedList.push(node);
        walk(target, include.include, `${step}__`, [...path, association.as], node.children);
        return;
      }
      // Conditions on the through model of a belongsToMany filter the parents too.
      if (association.associationType === 'BelongsToMany' && include.through && include.through.where) {
        include.required = include.required !== false;
        const step = `${base}${association.sourceRelation}__`;
        add(translateWhere(new Context(association.throughModel, step, model), include.through.where));
      }
      // Loaded apart; the parents are filtered by them when they are required.
      const key = [...path, association.as].join('.');
      if (nestedOrders.has(key)) include.order = [...(include.order || []), ...nestedOrders.get(key)];
      separate.push({ path, include });
      // An include asked to be separate (separate: true) is a query of its own: it does not filter the parents.
      const asked = Boolean(include.xufaOptions && include.xufaOptions.separate) && !association.xufaLoose;
      if (include.required && !asked) {
        // A polymorphic key: the parents with rows, found before (options.xufaLoose).
        if (association.xufaLoose) {
          const keys = options.xufaLoose && options.xufaLoose.get(association);
          if (!keys || path.length) throw new NotSupportedError('Required includes inside polymorphic associations');
          const sourceKey =
            association.associationType === 'BelongsTo' ? association.foreignKey : association.sourceKey;
          add(translateWhere(context, { [sourceKey]: keys }));
        } else add(requiredOf(target, include, `${base}${associationPath(association)}`));
      }
    });
  };
  // The condition of a required include loaded apart: its where (or that it exists), and the conditions of the
  // required includes under it, on the same related rows (one object, as @xufa/orm takes them).
  const requiredOf = (target, include, step) => {
    const parts = [
      include.where
        ? translateWhere(new Context(target, `${step}__`, model), include.where)
        : { [`${step}__isnull`]: false },
    ];
    (include.include || []).forEach((child) => {
      const { association } = child;
      const throughWhere = association.associationType === 'BelongsToMany' && child.through && child.through.where;
      if (!child.required && !throughWhere) return;
      if (throughWhere) {
        const throughStep = `${step}__${association.sourceRelation}__`;
        parts.push(translateWhere(new Context(association.throughModel, throughStep, model), child.through.where));
      }
      const childStep =
        association.associationType === 'BelongsTo'
          ? `${step}__${target.xufaPaths.get(association.foreignKey)}`
          : `${step}__${associationPath(association)}`;
      parts.push(requiredOf(association.target, child, childStep));
    });
    if (parts.length === 1) return parts[0];
    return parts.every(isPlainObject) ? Object.assign({}, ...parts) : and(...parts);
  };
  const joined = [];
  walk(model, includes, '', [], joined);
  let qs = new QuerySet(model.xufa);
  const where = conditions.length === 1 ? conditions[0] : and(...conditions);
  if (conditions.length) qs = qs.filter(where);
  // sqlOrdered: the parents are ordered by their includes in SQL (not in memory).
  const plan = {
    qs,
    joined: joined.length ? joined : null,
    separate,
    context,
    aggregate: false,
    sqlOrdered: Boolean(nestedOrders.xufaSql),
  };
  if (options.xufaCount || options.xufaWrite) {
    plan.qs = qs.orderBy();
    return plan;
  }
  const attributes = attributesOf(model, rootAttributes);
  // group without aggregates, with includes, gives the instances (their rows are the groups).
  const hasAggregates = Boolean(attributes.aggregates && Object.keys(attributes.aggregates).length);
  if (hasAggregates || (options.group && !includes.length)) {
    plan.aggregate = true;
    plan.groups = [].concat(options.group || []).map((entry) => {
      const item = Array.isArray(entry) ? entry[0] : entry;
      const name = typeof item === 'string' ? item : item.xufaCol;
      return { name, path: context.path(name) };
    });
    plan.aggregates = {};
    Object.entries(attributes.aggregates || {}).forEach(([alias, aggregate]) => {
      if (aggregate.raw) {
        const { sql, params } = fragmentOf(context, aggregate.raw);
        plan.aggregates[alias] = Raw(sql, params);
        return;
      }
      plan.aggregates[alias] = AGGREGATES[aggregate.fn](
        aggregate.attribute && context.path(aggregate.attribute),
        aggregate.distinct ? { distinct: true } : undefined
      );
    });
    let grouped = qs.orderBy();
    if (options.order) {
      const names = orderOf(model, context, options.order).map((name) => {
        if (typeof name !== 'string')
          throw new NotSupportedError('Orders of functions and literals in grouped queries');
        const desc = name.startsWith('-');
        const key = desc ? name.slice(1) : name;
        const group = plan.groups.find((item) => item.path === key || item.name === key);
        return `${desc ? '-' : ''}${group ? group.path : key}`;
      });
      grouped = grouped.orderBy(...names);
    }
    if (options.limit !== undefined && options.limit !== null) grouped = grouped.limit(options.limit);
    if (options.offset) grouped = grouped.offset(options.offset);
    plan.qs = grouped;
    return plan;
  }
  // Values inside json attributes: a query of values, made instances.
  if (attributes.json && attributes.json.length) {
    if (related.length || separate.length) throw new NotSupportedError('JSON attributes with includes');
    plan.values = [
      ...attributes.names.map((name) => ({ path: context.path(name), alias: name })),
      ...attributes.json.map(({ path, alias }) => ({ path: context.path(path), alias })),
    ];
    let values = qs.values(...plan.values.map((item) => item.path));
    const order = orderOf(model, context, options.order);
    values = order ? values.orderBy(...order) : values.orderBy();
    if (options.limit !== undefined && options.limit !== null) values = values.limit(options.limit);
    if (options.offset) values = values.offset(options.offset);
    plan.qs = values;
    return plan;
  }
  // Fragments are values selected with the objects.
  if (attributes.fragments && attributes.fragments.length) {
    const extra = {};
    attributes.fragments.forEach(({ value, alias }) => {
      const { sql, params } = fragmentOf(context, value);
      extra[alias] = Raw(sql, params);
    });
    qs = qs.extra(extra);
  }
  if (attributes.names) {
    // The primary key and the keys of the includes are needed to put them together.
    const names = new Set(attributes.names.filter((name) => model.xufaFieldOf.has(name)));
    if (includes.length || separate.length) names.add(model.primaryKeyAttribute);
    includes.forEach((include) => {
      const { association } = include;
      if (association.associationType === 'BelongsTo') names.add(association.foreignKey);
      else if (association.sourceKey) names.add(association.sourceKey);
    });
    qs = qs.only(...[...names].map((name) => (name === model.primaryKeyAttribute ? 'pk' : name)));
    if (attributes.renames.length) plan.renames = attributes.renames;
  }
  if (related.length) qs = qs.selectRelated(...related);
  qs = parentOrder && parentOrder.length ? qs.orderBy(...parentOrder) : qs.orderBy();
  if (options.limit !== undefined && options.limit !== null) qs = qs.limit(options.limit);
  if (options.offset) qs = qs.offset(options.offset);
  // The first rows of each parent of a separate include (by its key): a window of the query.
  if (options.xufaPer) qs = qs.limitPer(options.xufaPer.names, options.xufaPer.limit, options.xufaPer.offset);
  // lock (true, a level of Transaction.LOCK, or { level }) and skipLocked or noWait (as Sequelize 7: an error instead
  // of waiting for rows locked by others): the rows locked (PostgreSQL).
  if (options.lock) {
    const level = typeof options.lock === 'object' ? options.lock.level : options.lock;
    const modes = { SHARE: 'share', 'KEY SHARE': 'keyShare', 'NO KEY UPDATE': 'noKeyUpdate' };
    if (options.skipLocked && options.noWait) throw new Error('A lock cannot have both skipLocked and noWait');
    qs = qs.selectForUpdate({
      mode: modes[String(level).toUpperCase()] || 'update',
      skipLocked: options.skipLocked,
      noWait: options.noWait,
      of: typeof options.lock === 'object' && options.lock.of ? 'self' : null,
    });
  }
  plan.qs = qs;
  return plan;
}

// The instances reached from `instances` through the aliases of a path.
function reach(instances, path) {
  let current = instances;
  path.forEach((alias) => {
    const next = [];
    current.forEach((instance) => {
      const value = instance.dataValues[alias];
      if (Array.isArray(value)) next.push(...value);
      else if (value) next.push(value);
    });
    current = next;
  });
  return current;
}

// Loads the includes that are not joined: one query for each, for every parent at once.
async function loadSeparate(instances, separate, options) {
  for (let i = 0; i < separate.length; i += 1) {
    const { path, include } = separate[i];
    const parents = reach(instances, path);
    if (parents.length) await loadInclude(parents, include, options);
  }
}

// The attributes of an include loaded apart, with the aliases of literals that name it (literal('... AS
// "PostComments.someProperty"'), as joined queries read them) as aliases of its own attributes ("someProperty").
function ownAliases(attributes, as) {
  if (!Array.isArray(attributes)) return attributes;
  const prefix = new RegExp(`(\\s+AS\\s+(["\`]?))${as.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\w+\\2\\s*)$`, 'i');
  return attributes.map((item) => {
    if (!item || item.xufaLiteral === undefined || !prefix.test(item.xufaLiteral)) return item;
    return { ...item, xufaLiteral: item.xufaLiteral.replace(prefix, '$1$3') };
  });
}

async function loadInclude(parents, include, options) {
  // attributes: [] filters the parents only.
  if (Array.isArray(include.attributes) && include.attributes.length === 0) return;
  const { association } = include;
  const { target } = association;
  const common = {
    include: include.include,
    attributes: ownAliases(include.attributes, association.as),
    paranoid: include.paranoid,
    order: include.order,
    transaction: options.transaction,
  };
  switch (association.associationType) {
    case 'HasMany':
    case 'HasOne': {
      const { foreignKey, sourceKey, as } = association;
      const keys = [...new Set(parents.map((parent) => parent.dataValues[sourceKey]))].filter(
        (key) => key !== null && key !== undefined
      );
      const own = { [foreignKey]: keys };
      const where = include.where ? { [Op.and]: [own, include.where] } : own;
      // The attributes asked for as they are (literals and renames too), with the key that groups the rows.
      let attributes;
      if (Array.isArray(common.attributes)) {
        const { names } = attributesOf(target, common.attributes);
        attributes = names.includes(foreignKey) ? common.attributes : [...common.attributes, foreignKey];
      } else if (common.attributes)
        attributes = [...new Set([...attributesOf(target, common.attributes).names, foreignKey])];
      // limit of an include (separate): the first rows of each parent, by a window of the query.
      const limit = include.xufaOptions && include.xufaOptions.limit;
      const per = limit ? { names: [target.xufaFieldOf.get(foreignKey).name], limit, offset: 0 } : undefined;
      // The scope of the target is in include.where already.
      const children = keys.length
        ? await target.findAll({
            ...common,
            attributes,
            where,
            xufaNoScope: true,
            xufaPer: per,
          })
        : [];
      const groups = new Map();
      children.forEach((child) => {
        const key = child.dataValues[foreignKey];
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      });
      // An include with attributes: [] filters, and is not given.
      if (!(Array.isArray(include.attributes) && include.attributes.length === 0)) {
        parents.forEach((parent) => {
          const group = groups.get(parent.dataValues[sourceKey]);
          parent.dataValues[as] = association.associationType === 'HasMany' ? group || [] : group ? group[0] : null;
          exposeInclude(parent, as);
        });
      }
      break;
    }
    case 'BelongsTo': {
      const { foreignKey, targetKey, as } = association;
      const keys = [...new Set(parents.map((parent) => parent.dataValues[foreignKey]))].filter(
        (key) => key !== null && key !== undefined
      );
      const own = { [targetKey]: keys };
      const where = include.where ? { [Op.and]: [own, include.where] } : own;
      // The key it is found by is selected too.
      const attributes =
        Array.isArray(common.attributes) && !common.attributes.includes(targetKey)
          ? [...common.attributes, targetKey]
          : common.attributes;
      const found = keys.length ? await target.findAll({ ...common, attributes, where, xufaNoScope: true }) : [];
      const byKey = new Map(found.map((item) => [item.dataValues[targetKey], item]));
      parents.forEach((parent) => {
        parent.dataValues[as] = byKey.get(parent.dataValues[foreignKey]) || null;
        exposeInclude(parent, as);
      });
      break;
    }
    case 'BelongsToMany': {
      const groups = await target.xufaLoadThrough(association, parents, {
        ...common,
        where: include.where,
        through: include.through,
      });
      if (!(Array.isArray(include.attributes) && include.attributes.length === 0)) {
        parents.forEach((parent, i) => {
          parent.dataValues[association.as] = groups[i];
          exposeInclude(parent, association.as);
        });
      }
      break;
    }
    default:
      throw new NotSupportedError(`Includes of ${association.associationType}`);
  }
}

export { Model, HOOKS, Context, normalizeIncludes };
