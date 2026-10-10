// The schema of the tables of the models as data (what migrations record and compare), the same for every backend:
//
//   { table, model, fillfactor, columns: { [column]: { type, primaryKey, null, maxLength, references } },
//     indexes: [{ name, columns, unique }] }
//
// `type` is the type the backends store (the type of the key they point to, for foreign keys); `references` is
// { table, column } for foreign keys. Unique fields are unique indexes (so they can be added and dropped by name).

function indexName(table, columns, unique) {
  return `${table}_${columns.join('_')}_${unique ? 'uniq' : 'idx'}`;
}

// The name of an index of the options of a model (its own, or one made of its table and columns).
function indexNameOf(meta, index) {
  if (index.name) return index.name;
  const lower = new Set(index.lower || []);
  const named = index.fields.map((name) => {
    const field = meta.field(name);
    const column = field ? field.column : name;
    return lower.has(name) ? `lower_${column}` : column;
  });
  return indexName(meta.table, named, Boolean(index.unique));
}

function columnOf(field) {
  const column = { type: field.dbType, primaryKey: field.primaryKey, null: Boolean(field.null) };
  if (field.type === 'string' && field.maxLength !== undefined) column.maxLength = field.maxLength;
  // The SQL type and the DEFAULT of the column, when the field says them.
  if (field.options.sqlType) column.sqlType = field.options.sqlType;
  if (field.options.dbDefault !== undefined) column.default = field.options.dbDefault;
  // Geometries: geography or geometry, their shape and SRID.
  if (field.type === 'geometry') {
    column.geo = { geography: field.geography };
    if (field.shape) column.geo.shape = field.shape;
    if (field.srid !== null) column.geo.srid = field.srid;
  }
  // Arrays: the type of their items (and its length, for strings).
  if (field.type === 'array') {
    column.items = field.base.dbType;
    if (field.base.type === 'string' && field.base.maxLength !== undefined) column.itemLength = field.base.maxLength;
  }
  if (field.type === 'decimal' && field.precision !== undefined) {
    column.precision = field.precision;
    if (field.scale !== undefined) column.scale = field.scale;
  }
  // A foreign key with dbConstraint false is no constraint of the database.
  if (field.type === 'foreignKey' && field.options.dbConstraint !== false) {
    const target = field.target.meta;
    column.references = { table: target.table, column: field.targetField.column };
    if (target.schema) column.references.schema = target.schema;
    if (field.dbOnDelete) column.references.onDelete = field.dbOnDelete;
    if (field.dbOnUpdate) column.references.onUpdate = field.dbOnUpdate;
    // DEFERRABLE INITIALLY DEFERRED... of the constraint (PostgreSQL).
    if (field.options.dbDeferrable) column.references.deferrable = field.options.dbDeferrable;
  }
  return column;
}

function specOf(meta) {
  const columns = {};
  meta.fields.forEach((field) => {
    columns[field.column] = columnOf(field);
  });
  const indexes = [];
  meta.fields.forEach((field) => {
    if (field.primaryKey) return;
    if (field.unique)
      indexes.push({ name: indexName(meta.table, [field.column], true), columns: [field.column], unique: true });
    // Foreign keys are indexed (joins, reverse relations and deletes use them) unless their option index is false.
    else if (field.index || (field.type === 'foreignKey' && field.options.index !== false)) {
      indexes.push({ name: indexName(meta.table, [field.column], false), columns: [field.column], unique: false });
    }
  });
  meta.indexes.forEach((index) => {
    const fields = index.fields.map((name) => meta.field(name));
    if (fields.some((field) => !field)) throw new Error(`Invalid index ${index.fields} in ${meta.name}`);
    const names = fields.map((field) => field.column);
    const unique = Boolean(index.unique);
    // lower: the columns compared in lower case (Lower(name)).
    const lower = (index.lower || []).map((name) => meta.field(name).column);
    const spec = { name: indexNameOf(meta, index), columns: names, unique };
    if (lower.length) spec.lower = lower;
    // condition: the SQL of the rows of a partial index (SQL backends).
    if (index.condition) spec.condition = index.condition;
    // include: columns kept in the index besides its keys (PostgreSQL's INCLUDE), so a query of them reads the index
    // alone (an index-only scan: the pages of a list skipped without reading their rows).
    if (index.include && index.include.length) {
      spec.include = index.include.map((name) => {
        const field = name === 'pk' ? meta.pk : meta.field(name);
        if (!field) throw new Error(`Invalid include ${name} of an index of ${meta.name}`);
        return field.column;
      });
    }
    // expireAfter: a TTL index (seconds after the date of its field): native in MongoDB, swept by db.expire() in all.
    if (index.expireAfter !== undefined) spec.expireAfter = index.expireAfter;
    indexes.push(spec);
  });
  const spec = { table: meta.table, model: meta.name, fillfactor: meta.fillfactor || null, columns, indexes };
  // The schema, when the table has one (specs of tables without one stay as they were); and STRICT (SQLite).
  if (meta.schema) spec.schema = meta.schema;
  if (meta.strict) spec.strict = true;
  return spec;
}

// The default of a field for the rows that exist when it is added: its value when it is not a function, the time of
// the migration for autoNow and autoNowAdd ({ now: true }), and undefined otherwise.
function defaultOf(field) {
  if (field.autoNow || field.autoNowAdd) return { now: true };
  if (field.default === undefined || typeof field.default === 'function') return undefined;
  return field.default;
}

export { specOf, columnOf, defaultOf, indexName, indexNameOf };
