// The SQL types of the attributes, as Sequelize 6 writes them in SQLite and PostgreSQL (so the tables are the same
// as those Sequelize makes, and describeTable gives what it gives): VARCHAR(255), TINYINT(1), DATETIME,
// TIMESTAMP WITH TIME ZONE...

const { rangeSqlType } = require('./range');

const SQLITE = {
  STRING: (o) => `VARCHAR${o.binary ? ' BINARY' : ''}(${o.length || 255})`,
  CHAR: (o) => `CHAR${o.binary ? ' BINARY' : ''}(${o.length || 255})`,
  TEXT: () => 'TEXT',
  CITEXT: () => 'TEXT COLLATE NOCASE',
  TSVECTOR: () => 'TEXT',
  TINYINT: () => 'TINYINT',
  SMALLINT: () => 'SMALLINT',
  MEDIUMINT: () => 'MEDIUMINT',
  INTEGER: () => 'INTEGER',
  BIGINT: () => 'BIGINT',
  FLOAT: () => 'FLOAT',
  REAL: () => 'REAL',
  DOUBLE: () => 'DOUBLE PRECISION',
  DECIMAL: (o) => (o.precision ? `DECIMAL(${o.precision},${o.scale || 0})` : 'DECIMAL'),
  NUMERIC: (o) => (o.precision ? `NUMERIC(${o.precision},${o.scale || 0})` : 'NUMERIC'),
  BOOLEAN: () => 'TINYINT(1)',
  DATE: () => 'DATETIME',
  DATEONLY: () => 'DATE',
  TIME: () => 'TIME',
  UUID: () => 'UUID',
  JSON: () => 'JSON',
  JSONB: () => 'JSON',
  BLOB: () => 'BLOB',
  ENUM: () => 'TEXT',
  ARRAY: () => 'JSON',
  INET: () => 'TEXT',
  CIDR: () => 'TEXT',
  MACADDR: () => 'TEXT',
};

const POSTGRES = {
  ...SQLITE,
  CITEXT: () => 'CITEXT',
  TSVECTOR: () => 'TSVECTOR',
  TINYINT: () => 'SMALLINT',
  MEDIUMINT: () => 'INTEGER',
  BOOLEAN: () => 'BOOLEAN',
  DATE: () => 'TIMESTAMP WITH TIME ZONE',
  JSONB: () => 'JSONB',
  BLOB: () => 'BYTEA',
  STRING: (o) => (o.binary ? 'BYTEA' : `VARCHAR(${o.length || 255})`),
  // An enum type of its own, as Sequelize makes it: "enum_<table>_<column>" (or the one it names).
  ENUM: (o, where) => (where ? enumTypeRef(where.table, where.column, o) : 'VARCHAR(255)'),
  // The type of the items with [] (an enum of the column: "enum_<table>_<column>"[]).
  ARRAY: (o, where) => `${(o.type && sqlTypeOf(o.type, 'postgres', where)) || 'TEXT'}[]`,
  RANGE: (o) => rangeSqlType(o.subtype),
  INET: () => 'INET',
  CIDR: () => 'CIDR',
  MACADDR: () => 'MACADDR',
  HSTORE: () => 'HSTORE',
  // GEOMETRY, GEOMETRY(POINT), GEOMETRY(POINT,4326) (and GEOGRAPHY), as PostGIS names them.
  GEOMETRY: (o) => geometrySqlType('GEOMETRY', o),
  GEOGRAPHY: (o) => geometrySqlType('GEOGRAPHY', o),
};

function geometrySqlType(name, { type, srid }) {
  if (!type && (srid === undefined || srid === null)) return name;
  const shape = type ? String(type).toUpperCase() : 'GEOMETRY';
  return `${name}(${shape}${srid !== undefined && srid !== null ? `,${srid}` : ''})`;
}

const TYPES = { sqlite: SQLITE, postgres: POSTGRES };

// The name of the enum type of a column: enum_<table>_<column> (of the name of the table, without its schema), or
// the name of the ENUM (`named`: the options of the ENUM, { name, schema }).
function enumTypeName(table, column, named) {
  if (named && named.name) return named.name;
  const name = table && typeof table === 'object' ? table.table : table;
  return `enum_${name}_${column}`;
}

// The schema of the enum type of a column: of the ENUM, or of its table (null: the search path's).
function enumTypeSchema(table, named) {
  if (named && named.schema) return named.schema;
  return table && typeof table === 'object' ? table.schema || null : null;
}

// The enum type of a column in SQL: in the schema of its table ("schema"."enum_<table>_<column>"), as Sequelize
// makes it. `table`: a name, or { table, schema }.
function enumTypeRef(table, column, named) {
  const name = `"${enumTypeName(table, column, named).replace(/"/g, '""')}"`;
  const schema = enumTypeSchema(table, named);
  return schema ? `"${String(schema).replace(/"/g, '""')}".${name}` : name;
}

// The options of the ENUM of a column (of an ARRAY of ENUM too): { values, name, schema }.
function enumOptionsOf(attribute) {
  const { type } = attribute;
  if (!type || typeof type === 'string') return null;
  if (type.key === 'ENUM') return type.options || {};
  const item = type.key === 'ARRAY' && type.options && type.options.type;
  return item && item.key === 'ENUM' ? item.options || {} : null;
}

// The SQL type of a DataType in a dialect (undefined in others, which use the types of @xufa/orm). `where` is the
// { table, column } of the column (the enums of PostgreSQL are named by them).
function sqlTypeOf(type, dialect, where) {
  const types = TYPES[dialect];
  const make = types && types[type.key];
  return make ? make(type.options || {}, where) : undefined;
}

// The values of the enum type a column needs in PostgreSQL: of an ENUM, or of an ARRAY of ENUM (null otherwise).
function enumValuesOf(attribute) {
  const { type } = attribute;
  if (!type || typeof type === 'string') return null;
  if (type.key === 'ENUM') return attribute.values || type.options.values || [];
  const item = type.key === 'ARRAY' && type.options && type.options.type;
  if (item && item.key === 'ENUM') return item.options.values || [];
  return null;
}

// The statement that makes the enum type of a column in PostgreSQL (when it does not exist).
function createEnumSql(table, column, values, named) {
  const labels = values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
  const name = enumTypeRef(table, column, named);
  return `DO $$ BEGIN CREATE TYPE ${name} AS ENUM(${labels}); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
}

// The definition of a primary key the database gives (after its name).
function autoIncrementOf(type, dialect) {
  if (dialect === 'sqlite') return 'INTEGER PRIMARY KEY AUTOINCREMENT';
  if (dialect === 'postgres') return type.key === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'SERIAL PRIMARY KEY';
  return undefined;
}

// GENERATED ALWAYS AS (sql) STORED | VIRTUAL of a generated column: generatedAs is a literal (or SQL as text),
// generatedColumn 'STORED' (the default) or 'VIRTUAL'.
function generatedSql(name, attribute) {
  const { generatedAs, generatedColumn = 'STORED' } = attribute;
  const sql = generatedAs && generatedAs.xufaLiteral !== undefined ? generatedAs.xufaLiteral : generatedAs;
  if (typeof sql !== 'string' || sql.trim() === '') throw new Error(`The generatedAs of ${name} is a literal of SQL`);
  const mode = String(generatedColumn).toUpperCase();
  if (mode !== 'STORED' && mode !== 'VIRTUAL') throw new Error(`The generatedColumn of ${name} is STORED or VIRTUAL`);
  if (attribute.defaultValue !== undefined) throw new Error(`The generated column ${name} cannot have a defaultValue`);
  return ` GENERATED ALWAYS AS (${sql}) ${mode}`;
}

module.exports = {
  generatedSql,
  sqlTypeOf,
  autoIncrementOf,
  enumTypeName,
  enumTypeSchema,
  enumTypeRef,
  createEnumSql,
  enumValuesOf,
  enumOptionsOf,
};
