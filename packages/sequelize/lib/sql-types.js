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
  // An enum type of its own, as Sequelize makes it: "enum_<table>_<column>".
  ENUM: (o, where) => (where ? enumTypeRef(where.table, where.column) : 'VARCHAR(255)'),
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

// The name of the enum type of a column: enum_<table>_<column> (of the name of the table, without its schema).
function enumTypeName(table, column) {
  const name = table && typeof table === 'object' ? table.table : table;
  return `enum_${name}_${column}`;
}

// The enum type of a column in SQL: in the schema of its table ("schema"."enum_<table>_<column>"), as Sequelize
// makes it. `table`: a name, or { table, schema }.
function enumTypeRef(table, column) {
  const name = `"${enumTypeName(table, column)}"`;
  const schema = table && typeof table === 'object' ? table.schema : null;
  return schema ? `"${String(schema).replace(/"/g, '""')}".${name}` : name;
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
function createEnumSql(table, column, values) {
  const labels = values.map((value) => `'${String(value).replace(/'/g, "''")}'`).join(', ');
  const name = enumTypeRef(table, column);
  return `DO $$ BEGIN CREATE TYPE ${name} AS ENUM(${labels}); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
}

// The definition of a primary key the database gives (after its name).
function autoIncrementOf(type, dialect) {
  if (dialect === 'sqlite') return 'INTEGER PRIMARY KEY AUTOINCREMENT';
  if (dialect === 'postgres') return type.key === 'BIGINT' ? 'BIGSERIAL PRIMARY KEY' : 'SERIAL PRIMARY KEY';
  return undefined;
}

module.exports = { sqlTypeOf, autoIncrementOf, enumTypeName, enumTypeRef, createEnumSql, enumValuesOf };
