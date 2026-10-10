// The QueryInterface of Sequelize for SQLite and PostgreSQL: tables (create, describe, rename, drop), columns (add,
// remove, change, rename), indexes and constraints, and rows in bulk. Its SQL is that of Sequelize: the types of
// sql-types.js, constraints named as it names them. SQLite cannot change most of a table: it is made again (a new
// table, the rows copied, the old one dropped and the new one renamed), as SQLite recommends.
import { NotSupportedError, UnknownConstraintError } from './errors.js';
import { normalizeType, DataType } from './data-types.js';
import {
  generatedSql,
  sqlTypeOf,
  autoIncrementOf,
  createEnumSql,
  enumTypeName,
  enumTypeSchema,
  enumTypeRef,
  enumValuesOf,
  enumOptionsOf,
} from './sql-types.js';
import { Op } from './operators.js';
import { underscore, isPlainObject } from './utils.js';
import { deferrableSql, deferrableOf } from './deferrable.js';

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

// An object with more properties that are not enumerable (what Sequelize 7 adds to what Sequelize 6 gives: they do
// not change its keys, nor its JSON).
function withHidden(object, hidden) {
  Object.entries(hidden).forEach(([key, value]) => {
    if (value !== undefined) Object.defineProperty(object, key, { value, configurable: true, writable: true });
  });
  return object;
}

// The type of a column of a STRICT table of SQLite: INTEGER, REAL, TEXT or BLOB, by the rules of SQLite (dates,
// decimals and json are text), with its collation.
function strictSqliteType(type) {
  const upper = type.toUpperCase();
  const collation = /\sCOLLATE\s+\w+/i.exec(type);
  let strict = 'TEXT';
  if (upper.includes('INT')) strict = 'INTEGER';
  else if (/CHAR|CLOB|TEXT/.test(upper)) strict = 'TEXT';
  else if (upper.includes('BLOB')) strict = 'BLOB';
  else if (/REAL|FLOA|DOUB/.test(upper)) strict = 'REAL';
  return collation ? `${strict}${collation[0]}` : strict;
}

// Whether a type of PostgreSQL (as Sequelize writes it: VARCHAR(255), INTEGER) is the one format_type gives.
const PG_ALIASES = [
  [/^varchar\b/, 'character varying'],
  [/^char\b(?! varying)/, 'character'],
  [/^int4$|^int$/, 'integer'],
  [/^int8$/, 'bigint'],
  [/^int2$/, 'smallint'],
  [/^float8$|^double$/, 'double precision'],
  [/^float4$/, 'real'],
  [/^bool$/, 'boolean'],
  [/^decimal\b/, 'numeric'],
  [/^timestamptz$/, 'timestamp with time zone'],
  [/^timestamp$/, 'timestamp without time zone'],
  [/^time$/, 'time without time zone'],
];
function samePgType(type, current) {
  if (!current) return false;
  const normal = (text) => {
    let out = String(text)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\s*\(\s*/g, '(')
      .replace(/\s*,\s*/g, ',');
    PG_ALIASES.forEach(([pattern, name]) => {
      out = out.replace(pattern, name);
    });
    return out;
  };
  return normal(type) === normal(current);
}

// The index of the parenthesis that closes the one at `open` (quoted names and strings skipped).
function closingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' || char === "'") {
      i = text.indexOf(char, i + 1);
      while (i !== -1 && text[i + 1] === char) i = text.indexOf(char, i + 2);
      if (i === -1) return text.length;
    } else if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

// A list of SQL split at its commas outside parentheses and quotes.
function splitTopLevel(text) {
  const items = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' || char === "'") {
      i = text.indexOf(char, i + 1);
      while (i !== -1 && text[i + 1] === char) i = text.indexOf(char, i + 2);
      if (i === -1) break;
    } else if (char === '(') depth += 1;
    else if (char === ')') depth -= 1;
    else if (char === ',' && depth === 0) {
      items.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  items.push(text.slice(start).trim());
  return items;
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
// `table`: the table its columns are of, in SQL (when other tables have them, as excluded in ON CONFLICT).
function whereSql(where, dialect, table) {
  if (!where) return '';
  if (typeof where === 'string') return where;
  if (where.xufaLiteral) return where.xufaLiteral;
  const list = (items) => items.map((item) => literal(item, dialect)).join(', ');
  const parts = [];
  Object.keys(where).forEach((column) => {
    const value = where[column];
    const name = table ? `${table}.${quote(column)}` : quote(column);
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
    const items = [].concat(where[op]).map((item) => `(${whereSql(item, dialect, table)})`);
    if (op === Op.and) parts.push(items.join(' AND '));
    else if (op === Op.or) parts.push(`(${items.join(' OR ')})`);
    else if (op === Op.not) parts.push(`NOT (${whereSql(where[op], dialect, table)})`);
    else throw new NotSupportedError(`The operator ${String(op)} in the conditions of the QueryInterface`);
  });
  return parts.join(' AND ');
}

// A value as a parameter of a query: objects as JSON, and in SQLite dates as ISO text and booleans as 1 or 0.
function parameterOf(value, dialect) {
  if (value !== null && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    return JSON.stringify(value);
  }
  if (dialect === 'sqlite' && value instanceof Date) return value.toISOString();
  if (dialect === 'sqlite' && typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

// LIMIT and OFFSET (an OFFSET alone needs a LIMIT in SQLite: -1, none).
function limitSql({ limit, offset }, dialect) {
  const limited = limit !== undefined && limit !== null;
  let sql = limited ? ` LIMIT ${Number(limit)}` : '';
  if (offset) sql += `${!limited && dialect === 'sqlite' ? ' LIMIT -1' : ''} OFFSET ${Number(offset)}`;
  return sql;
}

const unquote = (text) => text.trim().replace(/^["`]|["`]$/g, '');

// The kind of a fragment of Sequelize (ours, or the classes of Sequelize's Utils): literal, col, fn, cast, where,
// json (null: not one).
function fragmentKind(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.xufaLiteral !== undefined) return 'literal';
  if (value.xufaCol !== undefined) return 'col';
  if (value.xufaFn !== undefined) return 'fn';
  if (value.xufaCast) return 'cast';
  if (value.xufaWhere) return 'where';
  if (value.xufaJson !== undefined) return 'json';
  const kinds = { Literal: 'literal', Col: 'col', Fn: 'fn', Cast: 'cast', Where: 'where', Json: 'json' };
  return (value.constructor && kinds[value.constructor.name]) || null;
}

class QueryInterface {
  constructor(sequelize) {
    this.sequelize = sequelize;
    this.queryGenerator = {
      // The options of the Sequelize instance (quoteIdentifiers...).
      options: sequelize.options,
      OperatorsAliasMap: sequelize.options.operatorsAliases || false,
      _dialect: sequelize.dialect,
      dialect: sequelize.dialect.name,
      quoteIdentifier: (name) => quote(name),
      quoteIdentifiers: (name) => String(name).split('.').map(quote).join('.'),
      quoteTable: (table) => this.qt(tableNameOf(table)),
      addSchema: (options) => this.addSchema(options),
      escape: (value) => literal(value, sequelize.getDialect()),
      selectQuery: (table, options, model) => this.selectQuery(table, options, model),
      // The query of the foreign keys of a table, run with { type: QueryTypes.FOREIGNKEYS } (as Sequelize's).
      getForeignKeysQuery: (table) => this.foreignKeysQuery(table),
      handleSequelizeMethod: (fragment) => this.fragmentSql(fragment),
    };
  }

  foreignKeysQuery(table) {
    const name = tableNameOf(table);
    if (this.dialect === 'sqlite') return `PRAGMA foreign_key_list(${this.qt(name)})`;
    const relname = String(name.table || name).replace(/'/g, "''");
    return `SELECT conname as constraint_name, pg_catalog.pg_get_constraintdef(r.oid, true) as condef FROM pg_catalog.pg_constraint r WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = '${relname}' LIMIT 1) AND r.contype = 'f' ORDER BY 1;`;
  }

  // The SQL of a fragment (literal(), col(), fn(), cast(), where(), json()) out of a query, with its values written
  // as literals, as queryGenerator.handleSequelizeMethod gives it.
  fragmentSql(fragment) {
    const { dialect } = this;
    const escape = (value) => literal(value, dialect);
    const sqlOf = (value) => (fragmentKind(value) ? this.fragmentSql(value) : escape(value));
    const columns = (name) => String(name).split('.').map(quote).join('.');
    // A path in a json column: ("data"#>>'{a,b}') in PostgreSQL, json_extract("data",'$.a.b') in SQLite.
    const extract = (column, keys) => {
      if (dialect === 'postgres') return `(${quote(column)}#>>${escape(`{${keys.join(',')}}`)})`;
      return `json_extract(${quote(column)},${escape(`$.${keys.join('.')}`)})`;
    };
    switch (fragmentKind(fragment)) {
      case 'literal':
        return String(fragment.val);
      case 'col':
        return fragment.col === '*' ? '*' : columns(fragment.col);
      case 'fn':
        return `${fragment.fn}(${(fragment.args || []).map(sqlOf).join(', ')})`;
      case 'cast':
        return `CAST(${sqlOf(fragment.val)} AS ${String(fragment.type).toUpperCase()})`;
      case 'where': {
        const left = typeof fragment.attribute === 'string' ? columns(fragment.attribute) : sqlOf(fragment.attribute);
        const comparator = typeof fragment.comparator === 'string' ? fragment.comparator : '=';
        const value = fragment.value !== undefined ? fragment.value : fragment.logic;
        return value === null ? `${left} IS NULL` : `${left} ${comparator} ${sqlOf(value)}`;
      }
      case 'json': {
        // A path ('data.a.b'; with arrows or SQL of its own, as it is), compared with a value; or conditions of paths.
        if (typeof fragment.path === 'string') {
          const { path } = fragment;
          if (path.includes('->') || path.includes('(')) return path;
          const [column, ...keys] = path.split('.');
          const sql = keys.length ? extract(column, keys) : quote(column);
          return fragment.value === undefined ? sql : `${sql} = ${escape(String(fragment.value))}`;
        }
        const conditions = [];
        const walk = (column, keys, value) => {
          if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            Object.entries(value).forEach(([key, item]) => walk(column, [...keys, key], item));
          } else conditions.push(`${extract(column, keys)} = ${escape(String(value))}`);
        };
        Object.entries(fragment.conditions || {}).forEach(([column, value]) => walk(column, [], value));
        return conditions.join(' AND ');
      }
      default:
        throw new TypeError('handleSequelizeMethod takes a fragment (literal, col, fn, cast, where or json)');
    }
  }

  get backend() {
    return this.sequelize.xufaDb.backend;
  }

  // The SQL of a SELECT, as queryGenerator.selectQuery(table, options) writes it in Sequelize (for subqueries and
  // queries of your own): attributes (names, [expression, alias], literal(), fn(), col()), where (simple
  // conditions), group, order, limit and offset. The names of the attributes of a model given are its columns.
  selectQuery(table, options = {}, model = null) {
    const { dialect } = this;
    const name = tableNameOf(table);
    const alias = quote(
      options.tableAs ||
        String(name.table || name)
          .split('.')
          .pop()
    );
    const columnOf = (attribute) => {
      const definition = model && model.rawAttributes && model.rawAttributes[attribute];
      return definition ? definition.field : attribute;
    };
    const expression = (item) => {
      if (typeof item === 'string')
        return item.includes('.') ? item.split('.').map(quote).join('.') : `${alias}.${quote(columnOf(item))}`;
      if (item && item.xufaCol) return quote(item.xufaCol);
      return literal(item, dialect);
    };
    const attributes = (options.attributes || ['*']).map((item) => {
      if (item === '*') return '*';
      if (Array.isArray(item)) return `${expression(item[0])} AS ${quote(item[1])}`;
      return expression(item);
    });
    let sql = `SELECT ${attributes.join(', ')} FROM ${this.qt(name)} AS ${alias}`;
    if (options.where && (typeof options.where !== 'object' || Reflect.ownKeys(options.where).length)) {
      const columns = {};
      if (typeof options.where === 'object' && !options.where.xufaLiteral) {
        Object.keys(options.where).forEach((key) => {
          columns[columnOf(key)] = options.where[key];
        });
        Object.getOwnPropertySymbols(options.where).forEach((symbol) => {
          columns[symbol] = options.where[symbol];
        });
      }
      sql += ` WHERE ${whereSql(typeof options.where === 'object' && !options.where.xufaLiteral ? columns : options.where, dialect, alias)}`;
    }
    if (options.group) sql += ` GROUP BY ${[].concat(options.group).map(expression).join(', ')}`;
    if (options.order) {
      const order = (Array.isArray(options.order) ? options.order : [options.order]).map((item) =>
        Array.isArray(item)
          ? `${expression(item[0])} ${String(item[1] || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`
          : expression(item)
      );
      sql += ` ORDER BY ${order.join(', ')}`;
    }
    if (options.limit !== undefined && options.limit !== null) sql += ` LIMIT ${Number.parseInt(options.limit, 10)}`;
    if (options.offset) sql += ` OFFSET ${Number.parseInt(options.offset, 10)}`;
    return `${sql};`;
  }

  // A table quoted: "schema"."table" in PostgreSQL ('schema.table' is a name in SQLite, as Sequelize makes it).
  qt(name) {
    const ref = tableNameOf(name);
    if (this.dialect !== 'postgres') return quote(String(ref));
    return ref.schema ? `${quote(ref.schema)}.${quote(ref.table)}` : quote(ref.table);
  }

  // Whether a column of a table of PostgreSQL is unique by itself: its primary key, or a unique constraint or index
  // of it alone (not partial, nor of expressions).
  async isUniqueColumn(table, column, options = {}) {
    const rows = await this.raw(
      `SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = $1::regclass AND i.indisunique AND i.indnatts = 1
         AND i.indpred IS NULL AND i.indexprs IS NULL AND a.attname = $2`,
      [this.qt(table), column],
      options
    );
    return rows.length > 0;
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
    // A column as its CREATE TABLE had it (generated columns of SQLite made again).
    if (attribute.xufaColumnSql) return attribute.xufaColumnSql;
    const typed = typeof attribute.type !== 'string';
    if (attribute.primaryKey && attribute.autoIncrement && inlinePrimaryKey) {
      return `${quote(name)} ${autoIncrementOf(typed ? attribute.type : { key: attribute.type }, dialect)}`;
    }
    const where = table ? { table, column: name } : undefined;
    let type = typed ? sqlTypeOf(attribute.type, dialect, where) || 'TEXT' : attribute.type;
    const serial = attribute.autoIncrement && dialect === 'postgres';
    if (serial) type = typed && attribute.type.key === 'BIGINT' ? 'BIGSERIAL' : 'SERIAL';
    let sql = `${quote(name)} ${type}`;
    // A generated column (Sequelize 7): its SQL after its type, no default.
    if (attribute.generatedAs !== undefined) sql += generatedSql(name, attribute);
    if (attribute.allowNull === false) sql += ' NOT NULL';
    const value = attribute.defaultValue;
    if (
      value !== undefined &&
      !serial &&
      attribute.generatedAs === undefined &&
      !(typeof value === 'function' && !value.kind)
    ) {
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

  // options.strict (SQLite, as Sequelize 7): a STRICT table, its columns of the types STRICT has.
  createTableSql(table, attributes, options = {}, name = table) {
    const strict = Boolean(options.strict) && this.dialect === 'sqlite';
    const columns = {};
    Object.entries(attributes).forEach(([key, definition]) => {
      const attribute = this.normalizeAttribute(definition);
      if (strict && !(attribute.primaryKey && attribute.autoIncrement)) {
        attribute.type = strictSqliteType(
          typeof attribute.type === 'string' ? attribute.type : sqlTypeOf(attribute.type, 'sqlite') || 'TEXT'
        );
      }
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
    return `CREATE TABLE IF NOT EXISTS ${this.qt(name)} (${parts.join(', ')})${strict ? ' STRICT' : ''}`;
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
        if (values)
          await this.raw(createEnumSql(name, attribute.field || key, values, enumOptionsOf(attribute)), [], options);
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
    // As Sequelize: table_info. A table with generated columns (which table_info leaves out) is read with table_xinfo
    // (hidden 2 and 3; 1 are the hidden columns of virtual tables), and their definitions as its CREATE TABLE has them
    // (a table made again keeps them).
    let rows = await this.raw(`PRAGMA TABLE_INFO(${quote(name)})`, [], options);
    let definitions = null;
    const [master] = rows.length
      ? await this.raw("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", [name], options)
      : [];
    if (master && /\bAS\s*\(/i.test(master.sql)) {
      rows = (await this.raw(`PRAGMA TABLE_XINFO(${quote(name)})`, [], options)).filter((row) => row.hidden !== 1);
    }
    if (rows.some((row) => row.hidden === 2 || row.hidden === 3)) {
      const { sql } = master;
      const open = sql.indexOf('(');
      definitions = splitTopLevel(sql.slice(open + 1, closingParen(sql, open)));
    }
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
      if (definitions && (row.hidden === 2 || row.hidden === 3)) {
        const own = definitions.find((item) => unquote(item.split(/\s/)[0]) === row.name);
        column.generated = row.hidden === 3 ? 'STORED' : 'VIRTUAL';
        if (own) column.xufaColumnSql = own;
      }
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
         (SELECT array_agg(e.enumlabel::text) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid JOIN pg_catalog.pg_namespace tn ON tn.oid = t.typnamespace WHERE t.typname = c.udt_name AND tn.nspname = c.udt_schema) AS "special",
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
    if (values) await this.raw(createEnumSql(tableNameOf(table), key, values, enumOptionsOf(definition)), [], options);
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

  // As Sequelize 6: the column gets the definition given (in PostgreSQL, NULL allowed and no default unless they are
  // given; in SQLite, what is not given stays).
  async changeColumn(table, column, dataTypeOrOptions, options = {}) {
    const name = tableNameOf(table);
    const attribute = this.normalizeAttribute(dataTypeOrOptions);
    if (this.dialect === 'postgres') {
      const change = { ...attribute, allowNull: attribute.allowNull === false ? false : true };
      if (attribute.defaultValue === undefined) change.dropDefaultValue = true;
      await this.changeColumns(name, { [column]: change }, options);
      return;
    }
    const fields = await this.describeTable(name, options);
    if (!fields[column]) throw new Error(`Table ${name} doesn't have the column ${column}`);
    // As Sequelize: the options given over those the column has (unique, allowNull... stay unless given).
    fields[column] = { ...fields[column], ...attribute };
    await this.rebuild(name, fields, options);
  }

  // Changes columns of a table, as Sequelize 7: { column: definition (or a type) }, in one ALTER TABLE in
  // PostgreSQL (one rebuild of the table in SQLite). Only what a definition gives changes: the type, NULL when
  // allowNull is true or false, the default when defaultValue is given (dropDefaultValue: true drops it), unique,
  // references, comment and autoIncrement. In PostgreSQL an ENUM keeps the type of its column: the values it lacks are
  // added to it, and it is made again when some are left out (the rows must not have them).
  async changeColumns(table, columns, options = {}) {
    const name = tableNameOf(table);
    const changes = Object.entries(columns).map(([column, definition]) => [column, this.changeOf(definition)]);
    if (changes.length === 0) return;
    const described = await this.describeTable(name, options);
    const missing = changes.map(([column]) => column).filter((column) => !described[column]);
    if (missing.length) {
      throw new Error(`Table ${name} doesn't have the column${missing.length > 1 ? 's' : ''} ${missing.join(', ')}`);
    }
    if (this.dialect !== 'postgres') {
      changes.forEach(([column, change]) => {
        const field = { ...described[column], ...change };
        if (change.dropDefaultValue) delete field.defaultValue;
        delete field.dropDefaultValue;
        described[column] = field;
      });
      await this.rebuild(name, described, options);
      return;
    }
    await this.changePostgresColumns(name, described, changes, options);
  }

  // A definition of changeColumns: the keys given (a type alone is { type }).
  changeOf(definition) {
    if (!isPlainObject(definition)) return this.normalizeAttribute(definition);
    const change = {};
    Object.keys(definition).forEach((key) => {
      if (definition[key] !== undefined) change[key] = definition[key];
    });
    if (change.type !== undefined && typeof change.type !== 'string') change.type = normalizeType(change.type);
    return change;
  }

  async changePostgresColumns(name, described, changes, options) {
    const ref = tableNameOf(name);
    const actions = [];
    const before = [];
    const after = [];
    const cleanup = [];
    for (const [column, change] of changes) {
      const target = quote(column);
      const current = described[column];
      let defaultValue = change.defaultValue;
      let dropDefault = Boolean(change.dropDefaultValue) && defaultValue === undefined;
      if (change.type !== undefined) {
        const values = typeof change.type !== 'string' && enumValuesOf(change);
        if (values) {
          const plan = await this.pgEnumPlan(ref, column, values, options, enumOptionsOf(change));
          before.push(...plan.before);
          after.push(...plan.after);
          cleanup.push(...plan.cleanup);
          if (plan.retype) {
            const type = sqlTypeOf(change.type, 'postgres', { table: ref, column }).replace(plan.ref, plan.retype);
            const array = change.type.key === 'ARRAY';
            // The default (of the type before) is dropped first, and set again after (unless another is given).
            if (current.defaultValue !== null && current.defaultValue !== undefined && !dropDefault) {
              actions.push(`ALTER COLUMN ${target} DROP DEFAULT`);
              if (defaultValue === undefined && !current.autoIncrement) defaultValue = current.defaultValue;
            }
            actions.push(`ALTER COLUMN ${target} TYPE ${type} USING (${target}::text${array ? '[]' : ''}::${type})`);
          }
        } else {
          const type = typeof change.type === 'string' ? change.type : sqlTypeOf(change.type, 'postgres');
          // A column of that type already is left as it is (PostgreSQL refuses the type of a column a generated
          // column uses, even the same one).
          if (type && samePgType(type, (await this.pgColumnTypes(name, options)).get(column))) {
            // nothing to change
          } else if (type) actions.push(`ALTER COLUMN ${target} TYPE ${type} USING (${target}::${type})`);
        }
      }
      if (change.allowNull === false) actions.push(`ALTER COLUMN ${target} SET NOT NULL`);
      else if (change.allowNull === true) actions.push(`ALTER COLUMN ${target} DROP NOT NULL`);
      if (change.autoIncrement === true && !current.autoIncrement) {
        const sequence = this.qt(new TableRef(`${ref.table}_${column}_seq`, ref.schema));
        before.push(`CREATE SEQUENCE IF NOT EXISTS ${sequence} OWNED BY ${this.qt(ref)}.${target}`);
        actions.push(`ALTER COLUMN ${target} SET DEFAULT nextval(${literal(sequence, 'postgres')}::regclass)`);
        after.push(
          `SELECT setval(${literal(sequence, 'postgres')}::regclass, COALESCE(MAX(${target}), 0) + 1, false) FROM ${this.qt(ref)}`
        );
        defaultValue = undefined;
        dropDefault = false;
      } else if (change.autoIncrement === false && current.autoIncrement && defaultValue === undefined)
        dropDefault = true;
      if (defaultValue !== undefined) {
        actions.push(`ALTER COLUMN ${target} SET DEFAULT ${literal(defaultValue, 'postgres')}`);
      } else if (dropDefault) actions.push(`ALTER COLUMN ${target} DROP DEFAULT`);
      // A column already unique (by a constraint or a unique index of it alone) is not made unique again: each
      // sync({ alter }) would add a constraint.
      if (change.unique && !(await this.isUniqueColumn(name, column, options))) actions.push(`ADD UNIQUE (${target})`);
      if (change.references) actions.push(`ADD FOREIGN KEY (${target})${this.referencesSql(change)}`);
      if (typeof change.comment === 'string') {
        after.push(`COMMENT ON COLUMN ${this.qt(name)}.${target} IS ${literal(change.comment, 'postgres')}`);
      }
    }
    try {
      for (const statement of before) await this.raw(statement, [], options);
      if (actions.length) await this.raw(`ALTER TABLE ${this.qt(name)} ${actions.join(', ')}`, [], options);
    } catch (err) {
      // The enum types made for the change are dropped when it fails (outside transactions, which roll them back).
      if (!options.transaction) {
        for (const statement of cleanup) await this.raw(statement, [], options).catch(() => {});
      }
      throw err;
    }
    for (const statement of after) await this.raw(statement, [], options);
  }

  // The types of the columns of a table of PostgreSQL, as format_type writes them (integer, character varying(255)).
  async pgColumnTypes(table, options) {
    const rows = await this.raw(
      `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a
       WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped`,
      [this.qt(table)],
      options
    );
    return new Map(rows.map((row) => [row.name, row.type]));
  }

  // How the enum type of a column gets `values`: { before, after, cleanup } statements and `retype`, the type the
  // column is changed to (null when it has that type already). The type is made when it is not there, gets the values
  // it lacks (each after the value before it, or before the next one), or is made again (as <type>_xufa_new, renamed
  // after) when values are left out or are in another order.
  // A named type (Sequelize 7) only gets values: other columns can have it.
  async pgEnumPlan(ref, column, values, options, enumOptions = {}) {
    const named = enumOptions && (enumOptions.name || enumOptions.schema) ? enumOptions : null;
    const typeRef = enumTypeRef(ref, column, named);
    const typeName = enumTypeName(ref, column, named);
    const typeSchema = enumTypeSchema(ref, named);
    const labels = values.map(String);
    const rows = await this.raw(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE t.typname = $1 AND n.nspname = COALESCE($2, current_schema()) ORDER BY e.enumsortorder`,
      [typeName, typeSchema],
      options
    );
    const [{ uses }] = await this.raw(
      `SELECT count(*)::int AS uses FROM pg_attribute a JOIN pg_type t ON t.oid = a.atttypid OR t.typarray = a.atttypid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE a.attrelid = $1::regclass AND a.attname = $2 AND NOT a.attisdropped
         AND t.typname = $3 AND n.nspname = COALESCE($4, current_schema())`,
      [this.qt(ref), column, typeName, typeSchema],
      options
    );
    const existing = rows.map((row) => row.label);
    const plan = { before: [], after: [], cleanup: [], ref: typeRef, retype: typeRef };
    if (existing.length === 0) {
      if (named && named.schema) plan.before.push(`CREATE SCHEMA IF NOT EXISTS ${quote(named.schema)}`);
      plan.before.push(createEnumSql(ref, column, labels, named));
      return plan;
    }
    const kept = labels.filter((label) => existing.includes(label));
    const inOrder = kept.every((label, i) => existing.indexOf(label) === i) && kept.length === existing.length;
    if (inOrder || named) {
      const have = new Set(existing);
      labels.forEach((label, i) => {
        if (have.has(label)) return;
        const previous = i > 0 ? labels[i - 1] : null;
        const next = labels.slice(i + 1).find((item) => have.has(item));
        let place = '';
        if (previous !== null && have.has(previous)) place = ` AFTER ${literal(previous, 'postgres')}`;
        else if (next !== undefined) place = ` BEFORE ${literal(next, 'postgres')}`;
        plan.before.push(`ALTER TYPE ${typeRef} ADD VALUE ${literal(label, 'postgres')}${place}`);
        have.add(label);
      });
      if (uses > 0) plan.retype = null;
      return plan;
    }
    const fresh = enumTypeRef(ref, `${column}_xufa_new`);
    plan.before.push(`DROP TYPE IF EXISTS ${fresh}`, createEnumSql(ref, `${column}_xufa_new`, labels));
    plan.cleanup.push(`DROP TYPE IF EXISTS ${fresh}`);
    plan.after.push(`DROP TYPE ${typeRef}`, `ALTER TYPE ${fresh} RENAME TO ${quote(typeName)}`);
    plan.retype = fresh;
    return plan;
  }

  async renameColumn(table, before, after, options = {}) {
    const name = tableNameOf(table);
    await this.assertTableHasColumn(name, before, options);
    await this.raw(`ALTER TABLE ${this.qt(name)} RENAME COLUMN ${quote(before)} TO ${quote(after)}`, [], options);
  }

  // SQLite: the table made again with the columns described (copying those that were there) or by the CREATE TABLE
  // given, and its indexes.
  async rebuild(table, fields, options, createSql) {
    // The columns copied: those there and kept, but generated ones (the database makes their values).
    const before = await this.raw(`PRAGMA TABLE_INFO(${quote(table)})`, [], options);
    const columns = before.map((row) => row.name).filter((column) => fields[column] && !fields[column].generated);
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
      // A STRICT table stays STRICT.
      create = this.createTableSql(table, attributes, { strict: /\)\s*STRICT\s*;?\s*$/i.test(original) }, temp);
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
        // index_xinfo: the keys (key = 1) with their order and collation (as Sequelize 7 gives them).
        const columns = await this.raw(`PRAGMA INDEX_XINFO(${quote(row.name)})`, [], options);
        const fields = [];
        columns
          .filter((column) => column.key)
          .forEach((column) => {
            // As Sequelize 6 gives them (no order); the name and collation of Sequelize 7 are there, not enumerable.
            fields[column.seqno] = withHidden(
              { attribute: column.name, length: undefined, order: undefined },
              {
                name: column.name,
                collate: column.coll && column.coll.toUpperCase() !== 'BINARY' ? column.coll : undefined,
                xufaOrder: column.desc ? 'DESC' : 'ASC',
              }
            );
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
         ix.indnkeyatts AS keys, upper(am.amname) AS method,
         array_agg(a.attnum) AS column_indexes, array_agg(a.attname::text) AS column_names,
         pg_get_indexdef(ix.indexrelid) AS definition
       FROM pg_class t, pg_class i, pg_index ix, pg_attribute a, pg_am am
       WHERE t.oid = ix.indrelid AND i.oid = ix.indexrelid AND a.attrelid = t.oid AND t.relkind = 'r'
         AND am.oid = i.relam
         AND t.relname = $1 AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = COALESCE($2, current_schema()))
       GROUP BY i.relname, ix.indexrelid, ix.indisprimary, ix.indisunique, ix.indkey, ix.indnkeyatts, am.amname
       ORDER BY i.relname`,
      [splitTable(name)[1], splitTable(name)[0]],
      options
    );
    return rows.map((row) => {
      // The keys in the definition: CREATE ... ON t USING btree (a DESC, "b" COLLATE "C") INCLUDE (c) WHERE ...
      const definition = row.definition;
      const open = definition.indexOf('(', definition.search(/ ON /));
      const attributes = splitTopLevel(definition.slice(open + 1, closingParen(definition, open)));
      const byIndex = new Map(row.column_indexes.map((index, i) => [String(index), row.column_names[i]]));
      const keys = String(row.indkey).split(' ');
      const fields = keys
        .slice(0, row.keys)
        .map((key, i) => {
          const attribute = byIndex.get(key);
          if (!attribute) return null;
          const text = attributes[i] || '';
          let order;
          if (/\sDESC\b/.test(text)) order = 'DESC';
          else if (/\sASC\b/.test(text)) order = 'ASC';
          const collation = /\sCOLLATE\s+("(?:[^"]|"")+"|\S+)/.exec(text);
          const collate = collation ? collation[1].replace(/^"|"$/g, '').replace(/""/g, '"') : undefined;
          return withHidden({ attribute, collate, order, length: undefined }, { name: attribute });
        })
        .filter(Boolean);
      return {
        name: row.name,
        primary: row.primary,
        unique: row.unique,
        definition,
        tableName: String(name),
        fields,
        // As Sequelize 7: the method (BTREE, GIN...) and the columns of INCLUDE.
        method: row.method,
        includes: keys
          .slice(row.keys)
          .map((key) => byIndex.get(key))
          .filter(Boolean),
      };
    });
  }

  // The indexes as Sequelize 7 describes them (showIndexes): { name, unique, primary, fields: [{ name, order,
  // collate }] }, with the method and the columns of INCLUDE in PostgreSQL; the order of every field, in SQLite too.
  async showIndexes(table, options = {}) {
    const postgres = this.dialect === 'postgres';
    return (await this.showIndex(table, options)).map((index) => ({
      name: index.name,
      ...(postgres ? { method: index.method } : {}),
      unique: index.unique,
      primary: index.primary,
      fields: index.fields.map((field) => ({
        name: field.name,
        order: field.xufaOrder || field.order || 'ASC',
        collate: field.collate,
      })),
      ...(postgres ? { includes: index.includes } : {}),
    }));
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
    // As Sequelize: with the deferrable of each key (Deferrable.NOT, INITIALLY_IMMEDIATE or INITIALLY_DEFERRED).
    const rows = await this.raw(
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
    return rows.map((row) => ({ ...row, deferrable: deferrableOf(row.isDeferrable, row.initiallyDeferred) }));
  }

  // Rows

  async bulkInsert(table, records, options = {}) {
    if (!records.length) return [];
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const params = [];
    const placeholder = () => (this.dialect === 'postgres' ? `$${params.length}` : '?');
    const tuples = records.map((record) => {
      const values = columns.map((column) => {
        const value = record[column];
        if (value === undefined) return this.dialect === 'postgres' ? 'DEFAULT' : 'NULL';
        if (value && (value.xufaLiteral !== undefined || value.xufaFn !== undefined))
          return literal(value, this.dialect);
        params.push(parameterOf(value, this.dialect));
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

  // A row inserted (with the values of its columns): [the row as the database has it, 1].
  async insert(instance, table, values, options = {}) {
    const [row] = await this.bulkInsert(table, [values], { ...options, returning: true });
    if (instance) instance.isNewRecord = false;
    return [row, 1];
  }

  // A row inserted, or updated with updateValues when one with the same key is there (options.conflictFields, or
  // the primary key of options.model, or the columns of where): [the row, null].
  async upsert(table, insertValues, updateValues, where, options = {}) {
    const { model } = options;
    let keys = options.conflictFields || [];
    if (!keys.length && model) keys = model.primaryKeyAttributes.map((name) => model.rawAttributes[name].field || name);
    if (!keys.length) keys = Object.keys(where || {});
    if (!keys.length) throw new Error('upsert needs the columns of its key (options.conflictFields)');
    const params = [];
    const value = (item) => {
      if (item && (item.xufaLiteral !== undefined || item.xufaFn !== undefined)) return literal(item, this.dialect);
      params.push(parameterOf(item, this.dialect));
      return this.dialect === 'postgres' ? `$${params.length}` : '?';
    };
    const columns = Object.keys(insertValues);
    const updates = Object.keys(updateValues).filter((column) => !keys.includes(column));
    const sql =
      `INSERT INTO ${this.qt(tableNameOf(table))} (${columns.map(quote).join(', ')}) ` +
      `VALUES (${columns.map((column) => value(insertValues[column])).join(', ')}) ` +
      `ON CONFLICT (${keys.map(quote).join(', ')}) ` +
      (updates.length
        ? `DO UPDATE SET ${updates.map((column) => `${quote(column)} = ${value(updateValues[column])}`).join(', ')}`
        : 'DO NOTHING') +
      ' RETURNING *';
    const [row] = await this.raw(sql, params, options);
    return [row && model ? model.build(row, { isNewRecord: false, raw: true }) : row || null, null];
  }

  // The rows of a table (options: where, attributes, order, limit, offset): instances of model when one is given.
  async select(model, table, options = {}) {
    const rows = await this.raw(this.selectSql(table, options), [], options);
    if (!model) return rows;
    // The columns of the rows as the attributes of the model.
    const named = (row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          (model.xufaColumns && model.xufaColumns.get(column)) || column,
          value,
        ])
      );
    return rows.map((row) => model.build(named(row), { isNewRecord: false, raw: true }));
  }

  selectSql(table, options) {
    const attributes = (options.attributes || []).map((attribute) => {
      if (Array.isArray(attribute)) {
        const [expression, alias] = attribute;
        const sql = typeof expression === 'string' ? quote(expression) : literal(expression, this.dialect);
        return `${sql} AS ${quote(alias)}`;
      }
      return typeof attribute === 'string' ? quote(attribute) : literal(attribute, this.dialect);
    });
    const condition = whereSql(options.where, this.dialect);
    const order = [].concat(options.order || []).map((item) => {
      const [column, direction = 'ASC'] = [].concat(item);
      return `${typeof column === 'string' ? quote(column) : literal(column, this.dialect)} ${direction}`;
    });
    return (
      `SELECT ${attributes.length ? attributes.join(', ') : '*'} FROM ${this.qt(tableNameOf(table))}` +
      (condition ? ` WHERE ${condition}` : '') +
      (order.length ? ` ORDER BY ${order.join(', ')}` : '') +
      limitSql(options, this.dialect)
    );
  }

  // One value of the first row of a query (attributeSelector names it), as Model.aggregate() reads it: of its
  // options.dataType when given. With plain: false, the rows.
  async rawSelect(table, options = {}, attributeSelector) {
    if (attributeSelector === undefined) throw new Error('Please pass an attribute selector!');
    const rows = await this.raw(this.selectSql(table, options), [], options);
    if (options.plain === false) return rows;
    const result = rows.length ? rows[0][attributeSelector] : null;
    const type = options.dataType && normalizeType(options.dataType);
    if (result === null || result === undefined || !type) return result === undefined ? null : result;
    if (type.kind === 'float' || type.kind === 'decimal') return Number.parseFloat(result);
    if (type.kind === 'integer') return Number.parseInt(result, 10);
    if (type.kind === 'datetime') return result instanceof Date ? result : new Date(result);
    return result;
  }

  // Columns of rows added to (or subtracted from), with other columns set too: Sequelize's (model, table, where,
  // { column: by }, { column: value }, options).
  async increment(model, table, where, amounts, extra = {}, options = {}) {
    return this.arithmetic('+', table, where, amounts, extra, options);
  }

  async decrement(model, table, where, amounts, extra = {}, options = {}) {
    return this.arithmetic('-', table, where, amounts, extra, options);
  }

  async arithmetic(operator, table, where, amounts, extra, options) {
    const sets = [
      ...Object.entries(amounts).map(
        ([column, by]) => `${quote(column)} = ${quote(column)} ${operator} ${literal(by, this.dialect)}`
      ),
      ...Object.entries(extra || {}).map(([column, value]) => `${quote(column)} = ${literal(value, this.dialect)}`),
    ];
    const condition = whereSql(where, this.dialect);
    const table_ = this.qt(tableNameOf(table));
    return this.execute(`UPDATE ${table_} SET ${sets.join(', ')}${condition ? ` WHERE ${condition}` : ''}`, options);
  }

  // The row of an instance deleted (identifier: its key), as bulkDelete.
  async delete(instance, table, identifier, options = {}) {
    return this.bulkDelete(table, identifier, options);
  }

  // The names of the foreign keys of tables: { table: [names] } (SQLite has no names of them: []).
  async getForeignKeysForTables(tables, options = {}) {
    const result = {};
    for (const table of tables) {
      const name = typeof table === 'object' && table.tableName ? `${table.schema}.${table.tableName}` : String(table);
      const keys = await this.getForeignKeyReferencesForTable(table, options);
      result[name] = [...new Set(keys.map((key) => key.constraintName).filter(Boolean))];
    }
    return result;
  }

  quoteIdentifier(identifier) {
    return quote(identifier);
  }

  quoteIdentifiers(identifiers) {
    return String(identifiers).split('.').map(quote).join('.');
  }

  quoteTable(table) {
    return this.qt(tableNameOf(table));
  }

  // Databases (PostgreSQL), as Sequelize writes them.

  async createDatabase(name, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Databases in ${this.dialect}`);
    const text = (value) => literal(String(value), this.dialect);
    const sql =
      `CREATE DATABASE ${quote(name)}` +
      (options.encoding ? ` ENCODING = ${text(options.encoding)}` : '') +
      (options.collate ? ` LC_COLLATE = ${text(options.collate)}` : '') +
      (options.ctype ? ` LC_CTYPE = ${text(options.ctype)}` : '') +
      (options.template ? ` TEMPLATE = ${text(options.template)}` : '');
    await this.execute(sql, options);
  }

  async dropDatabase(name, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Databases in ${this.dialect}`);
    await this.execute(`DROP DATABASE IF EXISTS ${quote(name)}`, options);
  }

  // Triggers (PostgreSQL), as Sequelize writes them: timing after, before, instead_of or after_constraint; events
  // insert, update, delete or truncate.
  async createTrigger(table, triggerName, timing, events, functionName, params, optionsArray, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Triggers in ${this.dialect}`);
    const TIMINGS = { after: 'AFTER', before: 'BEFORE', instead_of: 'INSTEAD OF', after_constraint: 'AFTER' };
    if (!TIMINGS[timing]) throw new Error(`Invalid trigger event specified: ${timing}`);
    const EVENTS = { insert: 'INSERT', update: 'UPDATE', delete: 'DELETE', truncate: 'TRUNCATE' };
    const entries = Object.entries(events || {});
    if (!entries.length) throw new Error('no table change events specified to trigger on');
    const spec = entries
      .map(([key, event]) => {
        if (!EVENTS[event]) throw new Error(`parseTriggerEventSpec: undefined trigger event ${key}`);
        return EVENTS[event];
      })
      .join(' OR ');
    const extra = optionsArray && optionsArray.length ? ` ${optionsArray.join(' ')}` : '';
    const sql =
      `CREATE ${timing === 'after_constraint' ? 'CONSTRAINT ' : ''}TRIGGER ${quote(triggerName)} ${TIMINGS[timing]} ` +
      `${spec} ON ${this.qt(tableNameOf(table))}${extra} EXECUTE PROCEDURE ${functionName}(${functionParams(params)});`;
    await this.raw(sql, [], options);
  }

  async dropTrigger(table, triggerName, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Triggers in ${this.dialect}`);
    await this.raw(`DROP TRIGGER ${quote(triggerName)} ON ${this.qt(tableNameOf(table))} RESTRICT;`, [], options);
  }

  async renameTrigger(table, oldName, newName, options = {}) {
    if (this.dialect !== 'postgres') throw new NotSupportedError(`Triggers in ${this.dialect}`);
    await this.raw(
      `ALTER TRIGGER ${quote(oldName)} ON ${this.qt(tableNameOf(table))} RENAME TO ${quote(newName)};`,
      [],
      options
    );
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

  // The end of a transaction not managed, as Sequelize runs it: a query (COMMIT; or ROLLBACK;) with the
  // transaction, which ends the transaction of @xufa/orm (or its savepoint) and is logged.
  async commitTransaction(transaction, options = {}) {
    if (!transaction) throw new Error('Unable to commit a transaction without transaction object!');
    return this.sequelize.query('COMMIT;', { ...options, transaction, xufaControl: 'commit' });
  }

  async rollbackTransaction(transaction, options = {}) {
    if (!transaction) throw new Error('Unable to rollback a transaction without transaction object!');
    return this.sequelize.query('ROLLBACK;', { ...options, transaction, xufaControl: 'rollback' });
  }

  databaseVersion() {
    return this.sequelize.databaseVersion();
  }
}

export { QueryInterface, literal, whereSql };
