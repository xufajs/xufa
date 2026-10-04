// The QueryInterface of Sequelize for SQLite and PostgreSQL: tables (create, describe, rename, drop), columns (add,
// remove, change, rename), indexes and constraints, and rows in bulk. Its SQL is that of Sequelize: the types of
// sql-types.js, constraints named as it names them. SQLite cannot change most of a table: it is made again (a new
// table, the rows copied, the old one dropped and the new one renamed), as SQLite recommends.
const { NotSupportedError, UnknownConstraintError } = require('./errors');
const { normalizeType, DataType } = require('./data-types');
const { sqlTypeOf, autoIncrementOf, createEnumSql, enumTypeName, enumValuesOf } = require('./sql-types');
const { Op } = require('./operators');
const { underscore, isPlainObject } = require('./utils');
const { deferrableSql } = require('./deferrable');

const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
const ON_ACTIONS = /^(CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION)$/i;

// Statements that change the schema: prepared statements are prepared again after them (PostgreSQL).
const DDL = /^\s*(CREATE|DROP|ALTER|DO)\b/i;

// A table: its name and its schema (a name is a whole name, dots too: schemas come from { tableName, schema } and
// models). As text it is Sequelize's name of it, 'schema.table' (the name of the table in SQLite).
class TableRef {
  constructor(table, schema = null, delimiter = '.') {
    this.table = table;
    this.schema = schema || null;
    this.delimiter = delimiter || '.';
  }

  toString() {
    return this.schema ? `${this.schema}${this.delimiter}${this.table}` : String(this.table);
  }
}

function tableNameOf(table) {
  if (table instanceof TableRef) return table;
  // A model: its table in its schema.
  if (typeof table === 'function' && typeof table.xufaTable === 'function') {
    return new TableRef(table.tableName, table.xufaSchema, table.xufaDelimiter);
  }
  if (table && typeof table === 'object') {
    return new TableRef(table.tableName || table.table, table.schema, table.delimiter || table.schemaDelimiter);
  }
  return new TableRef(table);
}

// The CREATE TABLE of SQLite without one of its constraints (CONSTRAINT "name" ..., up to the next definition: its
// parentheses and strings followed).
function withoutConstraint(sql, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`,\\s*CONSTRAINT\\s+["\`]?${escaped}["\`]?\\s`, 'i').exec(sql);
  if (!match) return sql;
  let i = match.index + match[0].length;
  let depth = 0;
  let quoted = null;
  for (; i < sql.length; i += 1) {
    const char = sql[i];
    if (quoted) {
      if (char === quoted) quoted = null;
    } else if (char === "'" || char === '"' || char === '`') quoted = char;
    else if (char === '(') depth += 1;
    else if (char === ')') {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === ',' && depth === 0) break;
  }
  return sql.slice(0, match.index) + sql.slice(i);
}

// The parameters of a function ([{ type, name, direction }]) and its variables ([{ name, type, default }]).
function functionParams(params) {
  if (!Array.isArray(params)) {
    throw new Error(
      '_expandFunctionParamList: function parameters array required, including an empty one for no arguments'
    );
  }
  return params
    .map((param) => {
      if (!param.type) throw new Error('function or trigger used with a parameter without any type');
      return [param.direction, param.name, param.type].filter(Boolean).join(' ');
    })
    .join(', ');
}

function functionVariables(variables) {
  if (!Array.isArray(variables)) throw new Error('_expandFunctionVariableList: function variables must be an array');
  return variables
    .map((variable) => {
      if (!variable.name || !variable.type) throw new Error('function variable must have a name and type');
      return `DECLARE ${variable.name} ${variable.type}${variable.default ? ` := ${variable.default}` : ''};`;
    })
    .join(' ');
}

// The schema (or null) and the name of a table of PostgreSQL.
function splitTable(name) {
  const ref = tableNameOf(name);
  return [ref.schema, String(ref.table)];
}

// A literal of SQL: strings quoted, booleans in the way of the dialect, NOW, fn() and literal().
function literal(value, dialect) {
  if (value === null || value === undefined) return 'NULL';
  if (value && value.xufaLiteral) return value.xufaLiteral;
  if (value && value.xufaFn !== undefined) {
    const args = value.args.map((arg) => (arg && arg.xufaCol ? quote(arg.xufaCol) : literal(arg, dialect)));
    return `${value.xufaFn}(${args.join(', ')})`;
  }
  if (value instanceof DataType || (typeof value === 'function' && value.kind)) {
    return value.key === 'NOW' ? 'CURRENT_TIMESTAMP' : 'NULL';
  }
  if (typeof value === 'boolean') {
    if (dialect === 'sqlite') return value ? '1' : '0';
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

const COMPARISONS = new Map([
  [Op.eq, '='],
  [Op.ne, '!='],
  [Op.gt, '>'],
  [Op.gte, '>='],
  [Op.lt, '<'],
  [Op.lte, '<='],
  [Op.like, 'LIKE'],
]);

// The SQL of simple conditions (CHECK constraints, partial indexes, bulkDelete, bulkUpdate): equalities, lists,
// nulls and the comparisons of Op on columns.
function whereSql(where, dialect) {
  if (!where) return '';
  if (typeof where === 'string') return where;
  if (where.xufaLiteral) return where.xufaLiteral;
  const list = (items) => items.map((item) => literal(item, dialect)).join(', ');
  const parts = [];
  Object.keys(where).forEach((column) => {
    const value = where[column];
    const name = quote(column);
    if (value === null) parts.push(`${name} IS NULL`);
    else if (Array.isArray(value)) parts.push(`${name} IN (${list(value)})`);
    else if (isPlainObject(value)) {
      Object.getOwnPropertySymbols(value).forEach((op) => {
        const operand = value[op];
        if (COMPARISONS.has(op)) parts.push(`${name} ${COMPARISONS.get(op)} ${literal(operand, dialect)}`);
        else if (op === Op.in) parts.push(`${name} IN (${list(operand)})`);
        else if (op === Op.notIn) parts.push(`${name} NOT IN (${list(operand)})`);
        else if (op === Op.is) parts.push(`${name} IS ${literal(operand, dialect)}`);
        else if (op === Op.not) {
          parts.push(operand === null ? `${name} IS NOT NULL` : `${name} != ${literal(operand, dialect)}`);
        } else if (op === Op.between) {
          parts.push(`${name} BETWEEN ${literal(operand[0], dialect)} AND ${literal(operand[1], dialect)}`);
        } else throw new NotSupportedError(`The operator ${String(op)} in the conditions of the QueryInterface`);
      });
    } else parts.push(`${name} = ${literal(value, dialect)}`);
  });
  Object.getOwnPropertySymbols(where).forEach((op) => {
    const items = [].concat(where[op]).map((item) => `(${whereSql(item, dialect)})`);
    if (op === Op.and) parts.push(items.join(' AND '));
    else if (op === Op.or) parts.push(`(${items.join(' OR ')})`);
    else if (op === Op.not) parts.push(`NOT (${whereSql(where[op], dialect)})`);
    else throw new NotSupportedError(`The operator ${String(op)} in the conditions of the QueryInterface`);
  });
  return parts.join(' AND ');
}

const unquote = (text) => text.trim().replace(/^["`]|["`]$/g, '');

class QueryInterface {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.queryGenerator = {
      _dialect: sequelize.dialect,
      dialect: sequelize.dialect.name,
      quoteIdentifier: (name) => quote(name),
      quoteIdentifiers: (name) => String(name).split('.').map(quote).join('.'),
      quoteTable: (table) => this.qt(tableNameOf(table)),
      addSchema: (options) => this.addSchema(options),
      escape: (value) => literal(value, sequelize.getDialect()),
    };
  }

  get backend() {
    return this.sequelize.xufaDb.backend;
  }

  // A table quoted: "schema"."table" in PostgreSQL ('schema.table' is a name in SQLite, as Sequelize makes it).
  qt(name) {
    const ref = tableNameOf(name);
    if (this.dialect !== 'postgres') return quote(String(ref));
    return ref.schema ? `${quote(ref.schema)}.${quote(ref.table)}` : quote(ref.table);
  }

  get dialect() {
    return this.sequelize.getDialect();
  }

  // A table of a model in its schema, as Sequelize gives it: { tableName, table, name, schema, delimiter, toString }.
  addSchema(options) {
    // A model: its table and schema.
    if (typeof options === 'function' && typeof options.xufaTable === 'function') {
      options = { tableName: options.tableName, schema: options.xufaSchema, schemaDelimiter: options.xufaDelimiter };
    }
    const tableName = options.tableName || options.table;
    if (!options.schema) return tableName;
    const delimiter = options.schemaDelimiter || options.delimiter || '.';
    const qt = (name) => this.qt(name);
    return {
      tableName,
      table: tableName,
      name: tableName,
      schema: options.schema,
      delimiter,
      toString() {
        return qt(new TableRef(tableName, options.schema, delimiter));
      },
    };
  }

  async raw(sql, params = [], options = {}) {
    await this.sequelize.xufaConnect();
    // Tables in the parameters are their names (SQLite: 'schema.table').
    const values = params.map((param) => (param instanceof TableRef ? String(param) : param));
    const rows = await this.sequelize.xufaRun(options, () => this.backend.raw(sql, values));
    if (DDL.test(sql)) this.backend.forgetStatements();
    return rows;
  }

  async execute(sql, options = {}) {
    await this.sequelize.xufaConnect();
    return this.sequelize.xufaRun(options, () => this.backend.run(() => this.backend.execute(sql, [])));
  }

  // Tables

  async showAllTables(options) {
    if (this.dialect === 'sqlite') {
      const rows = await this.raw(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        [],
        options
      );
      return rows.map((row) => row.name);
    }
    if (this.dialect === 'postgres') {
      const rows = await this.raw(
        // Not the tables of extensions (spatial_ref_sys of PostGIS), which only they can drop.
        `SELECT table_name FROM information_schema.tables t WHERE table_schema = current_schema() AND table_type LIKE '%TABLE'
         AND NOT EXISTS (SELECT 1 FROM pg_depend d JOIN pg_class c ON c.oid = d.objid JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE d.deptype = 'e' AND c.relname = t.table_name AND n.nspname = t.table_schema)
         ORDER BY table_name`,
        [],
        options
      );
      return rows.map((row) => row.table_name);
    }
    throw new NotSupportedError(`showAllTables on ${this.dialect}`);
  }

  async tableExists(table, options) {
    const ref = tableNameOf(table);
    if (this.dialect === 'postgres') {
      const rows = await this.raw(
        'SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = COALESCE($2, current_schema())',
        [String(ref.table), ref.schema],
        options
      );
      return rows.length > 0;
    }
    return (await this.showAllTables(options)).includes(String(ref));
  }

  normalizeAttribute(definition) {
    const attribute =
      definition && typeof definition === 'object' && !(definition instanceof DataType) && 'type' in definition
        ? { ...definition }
        : { type: definition };
    if (typeof attribute.type !== 'string') attribute.type = normalizeType(attribute.type);
    return attribute;
  }

  // The definition of a column, as Sequelize writes it.
  columnSql(name, attribute, { inlinePrimaryKey = true, table } = {}) {
    const { dialect } = this;
    const typed = typeof attribute.type !== 'string';
    if (attribute.primaryKey && attribute.autoIncrement && inlinePrimaryKey) {
      return `${quote(name)} ${autoIncrementOf(typed ? attribute.type : { key: attribute.type }, dialect)}`;
    }
    const where = table ? { table, column: name } : undefined;
    let type = typed ? sqlTypeOf(attribute.type, dialect, where) || 'TEXT' : attribute.type;
    const serial = attribute.autoIncrement && dialect === 'postgres';
    if (serial) type = typed && attribute.type.key === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    let sql = `${quote(name)} ${type}`;
    if (attribute.allowNull === false) sql += ' NOT NULL';
    const value = attribute.defaultValue;
    if (value !== undefined && !serial && !(typeof value === 'function' && !value.kind)) {
      sql += ` DEFAULT ${attribute.rawDefault ? value : literal(value, dialect)}`;
    }
    if (attribute.unique === true) sql += ' UNIQUE';
    if (attribute.primaryKey && inlinePrimaryKey) sql += ' PRIMARY KEY';
    if (attribute.references) sql += this.referencesSql(attribute);
    return sql;
  }

  referencesSql(attribute) {
    const { references } = attribute;
    let table = references.model || references.table;
    if (table && typeof table === 'function') table = table.getTableName();
    let sql = ` REFERENCES ${this.qt(tableNameOf(table))} (${quote(references.key || references.field || 'id')})`;
    if (attribute.onDelete && ON_ACTIONS.test(attribute.onDelete))
      sql += ` ON DELETE ${attribute.onDelete.toUpperCase()}`;
    if (attribute.onUpdate && ON_ACTIONS.test(attribute.onUpdate))
      sql += ` ON UPDATE ${attribute.onUpdate.toUpperCase()}`;
    if (references.deferrable && this.dialect === 'postgres') sql += ` ${deferrableSql(references.deferrable)}`;
    return sql;
  }

  createTableSql(table, attributes, options = {}, name = table) {
    const columns = {};
    Object.entries(attributes).forEach(([key, definition]) => {
      const attribute = this.normalizeAttribute(definition);
      columns[attribute.field || key] = attribute;
    });
    const keys = Object.keys(columns).filter((column) => columns[column].primaryKey);
    const inline = keys.length <= 1;
    const parts = Object.entries(columns).map(([column, attribute]) =>
      this.columnSql(column, attribute, { inlinePrimaryKey: inline, table })
    );
    if (!inline) parts.push(`PRIMARY KEY (${keys.map(quote).join(', ')})`);
    const uniques = new Map();
    Object.entries(columns).forEach(([column, attribute]) => {
      if (!attribute.unique || attribute.unique === true) return;
      const group = typeof attribute.unique === 'string' ? attribute.unique : attribute.unique.name;
      if (!uniques.has(group)) uniques.set(group, []);
      uniques.get(group).push(column);
    });
    uniques.forEach((fields, group) => {
      parts.push(`CONSTRAINT ${quote(group)} UNIQUE (${fields.map(quote).join(', ')})`);
    });
    // options.uniqueKeys: named constraints when customIndex is set (as the groups of unique attributes are), unnamed
    // ones otherwise (the database names them, <table>_<columns>_key), as Sequelize writes them.
    Object.entries(options.uniqueKeys || {}).forEach(([group, { fields, customIndex }]) => {
      if (uniques.has(group)) return;
      const constraint = customIndex ? `CONSTRAINT ${quote(group)} ` : '';
      parts.push(`${constraint}UNIQUE (${fields.map(quote).join(', ')})`);
    });
    return `CREATE TABLE IF NOT EXISTS ${this.qt(name)} (${parts.join(', ')})`;
  }

  async createTable(table, attributes, options = {}) {
    // options.schema: the table in that schema.
    const name =
      options.schema && typeof table === 'string'
        ? tableNameOf({ schema: options.schema, tableName: table, delimiter: options.schemaDelimiter })
        : tableNameOf(table);
    if (this.dialect === 'postgres') {
      for (const [key, definition] of Object.entries(attributes)) {
        const attribute = this.normalizeAttribute(definition);
        const values = enumValuesOf(attribute);
        if (values) await this.raw(createEnumSql(name, attribute.field || key, values), [], options);
      }
    }
    await this.raw(this.createTableSql(name, attributes, options), [], options);
    // The comments of the columns, in PostgreSQL.
    if (this.dialect === 'postgres') {
      for (const [key, definition] of Object.entries(attributes)) {
        if (definition && definition.comment) {
          const column = `${this.qt(name)}.${quote(definition.field || key)}`;
          await this.raw(`COMMENT ON COLUMN ${column} IS ${literal(definition.comment, this.dialect)}`, [], options);
        }
      }
    }
  }

  async dropTable(table, options = {}) {
    const cascade = this.dialect === 'postgres' && options.cascade ? ' CASCADE' : '';
    await this.raw(`DROP TABLE IF EXISTS ${this.qt(tableNameOf(table))}${cascade}`, [], options);
  }

  async dropAllTables(options = {}) {
    const skip = new Set(options.skip || []);
    const tables = (await this.showAllTables(options)).filter((table) => !skip.has(table));
    if (this.dialect === 'sqlite') {
      await this.raw('PRAGMA foreign_keys = OFF', [], options);
      try {
        for (const table of tables) await this.raw(`DROP TABLE IF EXISTS ${quote(table)}`, [], options);
      } finally {
        await this.raw('PRAGMA foreign_keys = ON', [], options);
      }
      return;
    }
    for (const table of tables) await this.raw(`DROP TABLE IF EXISTS ${quote(table)} CASCADE`, [], options);
  }

  // The enum types of PostgreSQL: { enum_name, enum_value } (those of a table, or all).
  async pgListEnums(table, options = {}) {
    if (this.dialect !== 'postgres') return [];
    const prefix = table ? `enum_${tableNameOf(table)}_` : '';
    return this.raw(
      `SELECT t.typname AS enum_name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text AS enum_value
       FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = current_schema() AND left(t.typname, length($1)) = $1 GROUP BY 1`,
      [prefix],
      options
    );
  }

  async dropEnum(name, options) {
    if (this.dialect === 'postgres') await this.raw(`DROP TYPE IF EXISTS ${quote(name)}`, [], options);
  }

  async dropAllEnums(options) {
    for (const { enum_name: name } of await this.pgListEnums(null, options)) await this.dropEnum(name, options);
  }

  enumTypeName(table, column) {
    return enumTypeName(tableNameOf(table), column);
  }

  async renameTable(before, after, options) {
    await this.raw(`ALTER TABLE ${this.qt(tableNameOf(before))} RENAME TO ${this.qt(tableNameOf(after))}`, [], options);
  }

  // The columns of a table as Sequelize describes them: { type, allowNull, defaultValue, primaryKey, unique,
  // references, comment, special }.
  async describeTable(table, options = {}) {
    // describeTable(table, schema) or (table, { schema, schemaDelimiter }).
    if (typeof options === 'string') options = { schema: options };
    const schema = options && options.schema;
    const name =
      schema && typeof table === 'string'
        ? tableNameOf({ schema, tableName: table, delimiter: options.schemaDelimiter })
        : tableNameOf(table);
    const result =
      this.dialect === 'sqlite' ? await this.describeSqlite(name, options) : await this.describePostgres(name, options);
    if (Object.keys(result).length === 0) {
      throw new Error(
        `No description found for "${name}" table. Check the table name and schema; remember, they _are_ case sensitive.`
      );
    }
    const keys = await this.getForeignKeyReferencesForTable(name, options);
    keys.forEach((key) => {
      if (result[key.columnName]) {
        result[key.columnName].references = { model: key.referencedTableName, key: key.referencedColumnName };
      }
    });
    return result;
  }

  async describeSqlite(name, options) {
    const result = {};
    const rows = await this.raw(`PRAGMA TABLE_INFO(${quote(name)})`, [], options);
    rows.forEach((row) => {
      let defaultValue;
      if (row.dflt_value === 'NULL') defaultValue = null;
      else if (row.dflt_value !== null) defaultValue = row.dflt_value;
      const column = {
        type: row.type,
        allowNull: row.notnull === 0,
        defaultValue,
        primaryKey: row.pk !== 0,
        unique: false,
      };
      if (column.type === 'TINYINT(1)') column.defaultValue = { 0: false, 1: true }[column.defaultValue];
      if (typeof column.defaultValue === 'string') column.defaultValue = column.defaultValue.replace(/^'(.*)'$/s, '$1');
      result[row.name] = column;
    });
    if (rows.length) {
      const indexes = await this.showIndex(name, options);
      indexes.forEach((index) => {
        if (index.unique && index.fields.length === 1 && result[index.fields[0].attribute]) {
          result[index.fields[0].attribute].unique = true;
        }
      });
    }
    return result;
  }

  async describePostgres(name, options) {
    const result = {};
    const rows = await this.raw(
      `SELECT pk.constraint_type AS "Constraint", c.column_name AS "Field", c.column_default AS "Default",
         c.is_nullable AS "Null",
         (CASE WHEN c.udt_name = 'hstore' THEN 'HSTORE' ELSE c.data_type END) || (CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' ELSE '' END) AS "Type",
         (SELECT array_agg(e.enumlabel::text) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid WHERE t.typname = c.udt_name) AS "special",
         (SELECT pgd.description FROM pg_catalog.pg_statio_all_tables AS st INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
           WHERE c.ordinal_position = pgd.objsubid AND c.table_name = st.relname) AS "Comment"
       FROM information_schema.columns c
       LEFT JOIN (SELECT tc.table_schema, tc.table_name, cu.column_name, tc.constraint_type
         FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage cu
         ON tc.table_schema = cu.table_schema AND tc.table_name = cu.table_name AND tc.constraint_name = cu.constraint_name
         AND tc.constraint_type = 'PRIMARY KEY') pk
       ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
       WHERE c.table_name = $1 AND c.table_schema = COALESCE($2, current_schema()) ORDER BY c.ordinal_position`,
      [splitTable(name)[1], splitTable(name)[0]],
      options
    );
    rows.forEach((row) => {
      const column = {
        type: row.Type.toUpperCase(),
        allowNull: row.Null === 'YES',
        defaultValue: row.Default,
        comment: row.Comment,
        special: row.special || [],
        primaryKey: row.Constraint === 'PRIMARY KEY',
        unique: false,
      };
      if (column.type === 'BOOLEAN') {
        column.defaultValue = { false: false, true: true }[column.defaultValue];
        if (column.defaultValue === undefined) column.defaultValue = null;
      }
      if (typeof column.defaultValue === 'string') {
        if (/^nextval\(/.test(column.defaultValue)) column.autoIncrement = true;
        column.defaultValue = column.defaultValue.replace(/'/g, '');
        if (column.defaultValue.includes('::')) {
          const split = column.defaultValue.split('::');
          if (split[1].toLowerCase() !== 'regclass)') [column.defaultValue] = split;
        }
      }
      result[row.Field] = column;
    });
    return result;
  }

  async assertTableHasColumn(table, column, options) {
    const description = await this.describeTable(table, options);
    if (description[column]) return description;
    throw new Error(`Table ${tableNameOf(table)} doesn't have the column ${column}`);
  }

  // Columns

  async addColumn(table, key, attribute, options = {}) {
    if (!table || !key || !attribute) {
      throw new Error('addColumn takes at least 3 arguments (table, attribute name, attribute definition)');
    }
    const definition = this.normalizeAttribute(attribute);
    // The enum type of the column (of an ENUM or an ARRAY of ENUM), in PostgreSQL.
    const values = this.dialect === 'postgres' && enumValuesOf(definition);
    if (values) await this.raw(createEnumSql(tableNameOf(table), key, values), [], options);
    await this.raw(
      `ALTER TABLE ${this.qt(tableNameOf(table))} ADD COLUMN ${this.columnSql(key, definition)}`,
      [],
      options
    );
  }

  async removeColumn(table, column, options = {}) {
    const name = tableNameOf(table);
    if (this.dialect === 'postgres') {
      await this.raw(`ALTER TABLE ${this.qt(name)} DROP COLUMN IF EXISTS ${quote(column)}`, [], options);
      return;
    }
    const fields = await this.describeTable(name, options);
    delete fields[column];
    await this.rebuild(name, fields, options);
  }

  async changeColumn(table, column, dataTypeOrOptions, options = {}) {
    const name = tableNameOf(table);
    const attribute = this.normalizeAttribute(dataTypeOrOptions);
    if (this.dialect === 'postgres') {
      const target = quote(column);
      const type = typeof attribute.type === 'string' ? attribute.type : sqlTypeOf(attribute.type, 'postgres');
      const statements = [
        attribute.allowNull === false ? `ALTER COLUMN ${target} SET NOT NULL` : `ALTER COLUMN ${target} DROP NOT NULL`,
      ];
      if (attribute.defaultValue !== undefined) {
        statements.push(`ALTER COLUMN ${target} SET DEFAULT ${literal(attribute.defaultValue, 'postgres')}`);
      } else statements.push(`ALTER COLUMN ${target} DROP DEFAULT`);
      statements.push(`ALTER COLUMN ${target} TYPE ${type} USING (${target}::${type})`);
      for (const statement of statements) await this.raw(`ALTER TABLE ${this.qt(name)} ${statement}`, [], options);
      if (attribute.unique) await this.raw(`ALTER TABLE ${this.qt(name)} ADD UNIQUE (${target})`, [], options);
      if (attribute.references) {
        await this.raw(
          `ALTER TABLE ${this.qt(name)} ADD FOREIGN KEY (${target})${this.referencesSql(attribute)}`,
          [],
          options
        );
      }
      if (attribute.comment) {
        await this.raw(
          `COMMENT ON COLUMN ${this.qt(name)}.${target} IS ${literal(attribute.comment, 'postgres')}`,
          [],
          options
        );
      }
      return;
    }
    const fields = await this.describeTable(name, options);
    if (!fields[column]) throw new Error(`Table ${name} doesn't have the column ${column}`);
    // As Sequelize: the options given over those the column has (unique, allowNull... stay unless given).
    fields[column] = { ...fields[column], ...attribute };
    await this.rebuild(name, fields, options);
  }

  async renameColumn(table, before, after, options = {}) {
    const name = tableNameOf(table);
    await this.assertTableHasColumn(name, before, options);
    await this.raw(`ALTER TABLE ${this.qt(name)} RENAME COLUMN ${quote(before)} TO ${quote(after)}`, [], options);
  }

  // SQLite: the table made again with the columns described (copying those that were there) or by the CREATE TABLE
  // given, and its indexes.
  async rebuild(table, fields, options, createSql) {
    const before = await this.raw(`PRAGMA TABLE_INFO(${quote(table)})`, [], options);
    const columns = before.map((row) => row.name).filter((column) => fields[column]);
    const [{ sql: original }] = await this.raw(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      [table],
      options
    );
    const indexes = await this.raw(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
      [table],
      options
    );
    const temp = `${table}_xufa_new`;
    let create;
    if (createSql) {
      create = createSql.replace(
        /^CREATE TABLE (IF NOT EXISTS )?("[^"]+"|`[^`]+`|\S+)/i,
        `CREATE TABLE ${quote(temp)}`
      );
    } else {
      const autoIncrement = /AUTOINCREMENT/i.test(original);
      const attributes = {};
      Object.entries(fields).forEach(([column, field]) => {
        const attribute = { ...field };
        // The defaults described are SQL already.
        if (typeof field.type === 'string') attribute.rawDefault = typeof field.defaultValue === 'string';
        if (attribute.rawDefault && !/^(-?\d+(\.\d+)?|NULL|CURRENT_\w+|\(.*\)|'.*')$/is.test(attribute.defaultValue)) {
          attribute.defaultValue = literal(attribute.defaultValue, 'sqlite');
        }
        if (field.type === 'INTEGER' && field.primaryKey && autoIncrement) attribute.autoIncrement = true;
        attributes[column] = attribute;
      });
      create = this.createTableSql(table, attributes, {}, temp);
    }
    const list = columns.map(quote).join(', ');
    await this.raw('PRAGMA foreign_keys = OFF', [], options);
    try {
      await this.raw(`DROP TABLE IF EXISTS ${quote(temp)}`, [], options);
      await this.raw(create, [], options);
      if (list) await this.raw(`INSERT INTO ${quote(temp)} (${list}) SELECT ${list} FROM ${quote(table)}`, [], options);
      await this.raw(`DROP TABLE ${quote(table)}`, [], options);
      await this.raw(`ALTER TABLE ${quote(temp)} RENAME TO ${quote(table)}`, [], options);
      for (const { sql } of indexes) {
        const used = /\(([^)]*)\)\s*(WHERE.*)?$/is.exec(sql);
        const names = used ? used[1].split(',').map((item) => unquote(item.trim().split(/\s/)[0])) : [];
        if (names.every((column) => fields[column])) await this.raw(sql, [], options);
      }
    } finally {
      await this.raw('PRAGMA foreign_keys = ON', [], options);
    }
  }

  // Indexes

  async showIndex(table, options = {}) {
    const name = tableNameOf(table);
    if (this.dialect === 'sqlite') {
      const rows = await this.raw(`PRAGMA INDEX_LIST(${quote(name)})`, [], options);
      const indexes = [];
      for (const row of rows.reverse()) {
        const columns = await this.raw(`PRAGMA INDEX_INFO(${quote(row.name)})`, [], options);
        const fields = [];
        columns.forEach((column) => {
          fields[column.seqno] = { attribute: column.name, length: undefined, order: undefined };
        });
        indexes.push({
          ...row,
          tableName: String(name),
          unique: Boolean(row.unique),
          primary: row.origin === 'pk',
          constraintName: row.name,
          fields,
        });
      }
      return indexes;
    }
    const rows = await this.raw(
      `SELECT i.relname AS name, ix.indisprimary AS primary, ix.indisunique AS unique, ix.indkey::text AS indkey,
         array_agg(a.attnum) AS column_indexes, array_agg(a.attname::text) AS column_names,
         pg_get_indexdef(ix.indexrelid) AS definition
       FROM pg_class t, pg_class i, pg_index ix, pg_attribute a
       WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND t.relkind = 'r'
         AND t.relname = $1 AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = COALESCE($2, current_schema()))
       GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey ORDER BY i.relname`,
      [splitTable(name)[1], splitTable(name)[0]],
      options
    );
    return rows.map((row) => {
      const attributes = /ON .*? (?:USING .*?\s)?\(([^]*)\)/i.exec(row.definition)[1].split(',');
      const byIndex = new Map(row.column_indexes.map((index, i) => [String(index), row.column_names[i]]));
      const fields = String(row.indkey)
        .split(' ')
        .map((key, i) => {
          const attribute = byIndex.get(key);
          if (!attribute) return null;
          const definition = attributes[i] || '';
          let order;
          if (definition.includes('DESC')) order = 'DESC';
          else if (definition.includes('ASC')) order = 'ASC';
          return { attribute, collate: undefined, order, length: undefined };
        })
        .filter(Boolean);
      return {
        name: row.name,
        primary: row.primary,
        unique: row.unique,
        definition: row.definition,
        tableName: String(name),
        fields,
      };
    });
  }

  // addIndex(table, ['a', 'b'], options) or addIndex(table, { fields, name, unique, where, concurrently, using }).
  async addIndex(table, attributes, options = {}) {
    const index = Array.isArray(attributes) ? { ...options, fields: attributes } : { ...attributes, ...options };
    if (!index.fields) throw new Error('Missing fields for the index');
    const name = tableNameOf(table);
    if (!index.name) {
      const fields = index.fields.map((field) =>
        typeof field === 'string' ? field : field.name || field.attribute || 'expression'
      );
      // Named by the table without its schema (as Sequelize names them).
      const tableOnly = table && typeof table === 'object' ? table.tableName : name;
      index.name = underscore(`${tableOnly}_${fields.join('_')}`);
    }
    const columns = index.fields.map((field) => {
      if (typeof field === 'string') return quote(field);
      // Expressions (literal(), fn()): functional indexes.
      if (field && (field.xufaLiteral !== undefined || field.xufaFn !== undefined))
        return `(${literal(field, this.dialect)})`;
      let sql = quote(field.name || field.attribute);
      if (field.collate) sql += ` COLLATE ${quote(field.collate)}`;
      if (field.order) sql += ` ${field.order}`;
      return sql;
    });
    const unique = index.unique || (index.type && String(index.type).toUpperCase() === 'UNIQUE');
    const concurrently = index.concurrently && this.dialect === 'postgres' ? 'CONCURRENTLY ' : '';
    const using = index.using && this.dialect === 'postgres' ? ` USING ${index.using}` : '';
    const where = index.where ? ` WHERE ${whereSql(index.where, this.dialect)}` : '';
    await this.raw(
      `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${concurrently}IF NOT EXISTS ${quote(index.name)} ON ${this.qt(name)}${using} (${columns.join(', ')})${where}`,
      [],
      options
    );
  }

  async removeIndex(table, indexOrAttributes, options = {}) {
    let name = indexOrAttributes;
    if (Array.isArray(indexOrAttributes)) name = underscore(`${tableNameOf(table)}_${indexOrAttributes.join('_')}`);
    else if (indexOrAttributes && typeof indexOrAttributes === 'object') ({ name } = indexOrAttributes);
    await this.raw(`DROP INDEX IF EXISTS ${quote(name)}`, [], options);
  }

  // Constraints

  constraintSnippet(table, options) {
    const fields = options.fields.map((field) => (typeof field === 'string' ? field : field.name || field.attribute));
    const list = fields.map(quote).join(', ');
    const joined = fields.join('_');
    switch (String(options.type).toUpperCase()) {
      case 'UNIQUE':
        return { name: options.name || `${table}_${joined}_uk`, sql: `UNIQUE (${list})` };
      case 'CHECK':
        return {
          name: options.name || `${table}_${joined}_ck`,
          sql: `CHECK (${whereSql(options.where, this.dialect)})`,
        };
      case 'PRIMARY KEY':
        return { name: options.name || `${table}_${joined}_pk`, sql: `PRIMARY KEY (${list})` };
      case 'FOREIGN KEY': {
        const { references } = options;
        if (!references || !references.table || !(references.field || references.fields)) {
          throw new Error('references object with table and field must be specified');
        }
        const referenced =
          references.field !== undefined ? quote(references.field) : references.fields.map(quote).join(', ');
        let sql = `FOREIGN KEY (${list}) REFERENCES ${this.qt(tableNameOf(references.table))} (${referenced})`;
        if (options.onUpdate) sql += ` ON UPDATE ${options.onUpdate.toUpperCase()}`;
        if (options.onDelete) sql += ` ON DELETE ${options.onDelete.toUpperCase()}`;
        if (options.deferrable && this.dialect === 'postgres') sql += ` ${deferrableSql(options.deferrable)}`;
        return { name: options.name || `${table}_${joined}_${tableNameOf(references.table)}_fk`, sql };
      }
      case 'DEFAULT':
        if (options.defaultValue === undefined)
          throw new Error('Default value must be specified for DEFAULT CONSTRAINT');
        throw new Error('Default constraints are supported only for MSSQL dialect.');
      default:
        throw new Error(`${options.type} is invalid.`);
    }
  }

  async addConstraint(table, options = {}) {
    if (!options.fields) throw new Error('Fields must be specified through options.fields');
    if (!options.type) throw new Error('Constraint type must be specified through options.type');
    const name = tableNameOf(table);
    const snippet = this.constraintSnippet(name, options);
    const constraint = `CONSTRAINT ${quote(snippet.name)} ${snippet.sql}`;
    if (this.dialect === 'postgres') {
      await this.raw(`ALTER TABLE ${this.qt(name)} ADD ${constraint}`, [], options);
      return;
    }
    const [{ sql }] = await this.raw(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
      [name],
      options
    );
    const create = `${sql.slice(0, sql.lastIndexOf(')'))}, ${constraint})`;
    await this.rebuild(name, await this.describeTable(name, options), options, create);
  }

  // The constraints of a table (all, or the one named).
  async showConstraint(table, constraintName, options = {}) {
    const name = tableNameOf(table);
    if (this.dialect === 'postgres') {
      return this.raw(
        `SELECT constraint_catalog AS "constraintCatalog", constraint_schema AS "constraintSchema",
           constraint_name AS "constraintName", table_catalog AS "tableCatalog", table_schema AS "tableSchema",
           table_name AS "tableName", constraint_type AS "constraintType", is_deferrable AS "isDeferrable",
           initially_deferred AS "initiallyDeferred"
         FROM information_schema.table_constraints WHERE table_name = $1 AND table_schema = COALESCE($2, current_schema())
         ${constraintName ? 'AND constraint_name = $3' : ''}`,
        constraintName ? [...splitTable(name).reverse(), constraintName] : splitTable(name).reverse(),
        options
      );
    }
    const [row] = await this.raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [name], options);
    if (!row) return [];
    const constraints = [];
    const pattern =
      /CONSTRAINT\s+("[^"]+"|`[^`]+`|\S+)\s+(UNIQUE|PRIMARY KEY|CHECK|FOREIGN KEY)\s*\(([^)]*)\)(\s*REFERENCES\s+("[^"]+"|`[^`]+`|\S+)\s*\(([^)]*)\)(\s*ON UPDATE (CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?(\s*ON DELETE (CASCADE|SET NULL|SET DEFAULT|RESTRICT|NO ACTION))?)?/gi;
    let match;
    while ((match = pattern.exec(row.sql))) {
      const constraint = {
        constraintName: unquote(match[1]),
        constraintType: match[2].toUpperCase(),
        constraintCondition: `(${match[3]})`,
        sql: row.sql,
        columnNames: match[3].split(',').map(unquote),
      };
      if (match[5]) {
        constraint.referenceTableName = unquote(match[5]);
        constraint.referenceTableKeys = match[6].split(',').map(unquote);
        constraint.updateAction = match[8] || 'NO ACTION';
        constraint.deleteAction = match[10] || 'NO ACTION';
      }
      constraints.push(constraint);
    }
    return constraintName ? constraints.filter((item) => item.constraintName === constraintName) : constraints;
  }

  async removeConstraint(table, constraintName, options = {}) {
    const name = tableNameOf(table);
    const [constraint] = await this.showConstraint(name, constraintName, options);
    if (!constraint) {
      throw new UnknownConstraintError({
        message: `Constraint ${constraintName} on table ${name} does not exist`,
        constraint: constraintName,
        table: String(name),
      });
    }
    if (this.dialect === 'postgres') {
      await this.raw(`ALTER TABLE ${this.qt(name)} DROP CONSTRAINT ${quote(constraintName)}`, [], options);
      return;
    }
    const create = withoutConstraint(constraint.sql, constraintName);
    await this.rebuild(name, await this.describeTable(name, options), options, create);
  }

  async getForeignKeyReferencesForTable(table, options = {}) {
    const name = tableNameOf(table);
    const { database } = this.sequelize.config;
    if (this.dialect === 'sqlite') {
      const rows = await this.raw(`PRAGMA foreign_key_list(${quote(name)})`, [], options);
      return rows.map((row) => ({
        tableName: String(name),
        columnName: row.from,
        referencedTableName: row.table,
        referencedColumnName: row.to,
        tableCatalog: database,
        referencedTableCatalog: database,
      }));
    }
    return this.raw(
      `SELECT DISTINCT tc.constraint_name AS "constraintName", tc.constraint_schema AS "constraintSchema",
         tc.constraint_catalog AS "constraintCatalog", tc.table_name AS "tableName", tc.table_schema AS "tableSchema",
         tc.table_catalog AS "tableCatalog", tc.initially_deferred AS "initiallyDeferred",
         tc.is_deferrable AS "isDeferrable", kcu.column_name AS "columnName",
         ccu.table_schema AS "referencedTableSchema", ccu.table_catalog AS "referencedTableCatalog",
         ccu.table_name AS "referencedTableName", ccu.column_name AS "referencedColumnName"
       FROM information_schema.table_constraints AS tc
       JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
       JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
       WHERE constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = COALESCE($2, current_schema())`,
      splitTable(name).reverse(),
      options
    );
  }

  // Rows

  async bulkInsert(table, records, options = {}) {
    if (!records.length) return [];
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const params = [];
    const placeholder = () => (this.dialect === 'postgres' ? `$${params.length}` : '?');
    const tuples = records.map((record) => {
      const values = columns.map((column) => {
        let value = record[column];
        if (value === undefined) return this.dialect === 'postgres' ? 'DEFAULT' : 'NULL';
        if (value && (value.xufaLiteral !== undefined || value.xufaFn !== undefined))
          return literal(value, this.dialect);
        if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
          value = JSON.stringify(value);
        }
        if (this.dialect === 'sqlite' && value instanceof Date) value = value.toISOString();
        if (this.dialect === 'sqlite' && typeof value === 'boolean') value = value ? 1 : 0;
        params.push(value);
        return placeholder();
      });
      return `(${values.join(', ')})`;
    });
    let sql = `INSERT INTO ${this.qt(tableNameOf(table))} (${columns.map(quote).join(', ')}) VALUES ${tuples.join(', ')}`;
    if (options.ignoreDuplicates) sql += ' ON CONFLICT DO NOTHING';
    if (options.returning) return this.raw(`${sql} RETURNING *`, params, options);
    await this.raw(sql, params, options);
    return records.length;
  }

  async bulkDelete(table, where = {}, options = {}) {
    const condition = whereSql(where, this.dialect);
    return this.execute(`DELETE FROM ${this.qt(tableNameOf(table))}${condition ? ` WHERE ${condition}` : ''}`, options);
  }

  // The row of an instance (identifier) updated with the values of its attributes, in the table given.
  async update(instance, table, values, identifier, options = {}) {
    const model = instance && instance.constructor && instance.constructor.rawAttributes ? instance.constructor : null;
    const columnsOf = (object) =>
      Object.fromEntries(
        Object.entries(object || {}).map(([name, value]) => [
          model && model.rawAttributes[name] ? model.rawAttributes[name].field : name,
          value,
        ])
      );
    return this.bulkUpdate(table, columnsOf(values), columnsOf(identifier), options);
  }

  async bulkUpdate(table, values, where = {}, options = {}) {
    const sets = Object.keys(values).map((column) => `${quote(column)} = ${literal(values[column], this.dialect)}`);
    const condition = whereSql(where, this.dialect);
    const table_ = this.qt(tableNameOf(table));
    return this.execute(`UPDATE ${table_} SET ${sets.join(', ')}${condition ? ` WHERE ${condition}` : ''}`, options);
  }

  // Functions (PostgreSQL), as Sequelize writes them.

  async createFunction(functionName, params, returnType, language, body, optionsArray, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Functions in ${this.dialect}`);
    if (!functionName || !returnType || !language || !body) {
      throw new Error(
        'createFunction missing some parameters. Did you pass functionName, returnType, language and body?'
      );
    }
    const variables = options.variables ? functionVariables(options.variables) : '';
    const statement = options.force ? 'CREATE OR REPLACE FUNCTION' : 'CREATE FUNCTION';
    const extra = optionsArray && optionsArray.length ? optionsArray.join(' ') : '';
    const sql =
      `${statement} ${functionName}(${functionParams(params)}) RETURNS ${returnType} AS $func$ ${variables} ` +
      `BEGIN ${body} END; $func$ language '${language}'${extra};`;
    await this.raw(sql, [], options);
  }

  async dropFunction(functionName, params, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Functions in ${this.dialect}`);
    if (!functionName) throw new Error('requires functionName');
    await this.raw(`DROP FUNCTION ${functionName}(${functionParams(params)}) RESTRICT;`, [], options);
  }

  async renameFunction(oldFunctionName, params, newFunctionName, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Functions in ${this.dialect}`);
    await this.raw(
      `ALTER FUNCTION ${oldFunctionName}(${functionParams(params)}) RENAME TO ${newFunctionName};`,
      [],
      options
    );
  }

  // Schemas: PostgreSQL only.

  async createSchema(schema, options) {
    if (this.dialect === 'postgres') await this.raw(`CREATE SCHEMA IF NOT EXISTS ${quote(schema)}`, [], options);
  }

  async dropSchema(schema, options) {
    if (this.dialect === 'postgres') await this.raw(`DROP SCHEMA IF EXISTS ${quote(schema)} CASCADE`, [], options);
  }

  async showAllSchemas(options) {
    // SQLite has the schemas of Sequelize as prefixes of the names of tables ("special.UserSpecials"): those.
    if (this.dialect === 'sqlite') {
      const tables = await this.showAllTables(options);
      return [...new Set(tables.filter((name) => name.includes('.')).map((name) => name.split('.')[0]))];
    }
    if (this.dialect !== 'postgres') return [];
    const rows = await this.raw(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name <> 'information_schema' AND schema_name <> 'public' AND schema_name !~ E'^pg_'",
      [],
      options
    );
    return rows.map((row) => row.schema_name);
  }

  async dropAllSchemas(options) {
    for (const schema of await this.showAllSchemas(options)) await this.dropSchema(schema, options);
  }

  databaseVersion() {
    return this.sequelize.databaseVersion();
  }
}

module.exports = { QueryInterface, literal, whereSql };
