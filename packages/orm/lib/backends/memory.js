// MemoryBackend: the objects in memory, for tests and prototypes. It runs the descriptions of queries in JavaScript
// with the semantics of the other backends: null is not equal, greater or less than anything (and NOT of it is true),
// nulls sort first, unique fields are enforced, and transactions roll back.
import { Backend } from './base.js';
import { lastOf, likeToRegex, datePartOf, truncOf } from '../query.js';
import { BackendError } from '../errors.js';

function normalize(value) {
  if (value instanceof Date) return value.getTime();
  return value;
}

function equals(a, b) {
  if (a !== null && typeof a === 'object' && !(a instanceof Date)) return JSON.stringify(a) === JSON.stringify(b);
  return normalize(a) === normalize(b);
}

// Nulls first, then numbers, strings... compared as they are.
function compare(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const x = normalize(a);
  const y = normalize(b);
  // Infinite dates (Infinity, -Infinity) against the others, also dates without time (strings).
  if (x === y) return 0;
  if (x === Infinity || y === -Infinity) return 1;
  if (x === -Infinity || y === Infinity) return -1;
  if (x < y) return -1;
  return x > y ? 1 : 0;
}

// The parts of a decimal (its values are text): sign, integer digits and fraction digits, without the zeros that
// do not count.
function decimalParts(value) {
  let text = String(value).trim();
  let negative = text.charCodeAt(0) === 45;
  if (negative || text.charCodeAt(0) === 43) text = text.slice(1);
  const dot = text.indexOf('.');
  const integer = (dot === -1 ? text : text.slice(0, dot)).replace(/^0+/, '');
  const fraction = dot === -1 ? '' : text.slice(dot + 1).replace(/0+$/, '');
  if (integer === '' && fraction === '') negative = false;
  return { negative, integer, fraction };
}

// Decimals compared by their digits, exactly (as numbers, not as text).
function compareDecimals(a, b) {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : -1;
  if (b === null || b === undefined) return 1;
  const x = decimalParts(a);
  const y = decimalParts(b);
  if (x.negative !== y.negative) return x.negative ? -1 : 1;
  const sign = x.negative ? -1 : 1;
  if (x.integer.length !== y.integer.length) return x.integer.length > y.integer.length ? sign : -sign;
  if (x.integer !== y.integer) return x.integer > y.integer ? sign : -sign;
  const length = Math.max(x.fraction.length, y.fraction.length);
  const xf = x.fraction.padEnd(length, '0');
  const yf = y.fraction.padEnd(length, '0');
  if (xf === yf) return 0;
  return xf > yf ? sign : -sign;
}

// How the values of a field compare.
const compareOf = (field) => (field && field.dbType === 'decimal' ? compareDecimals : compare);

function copy(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'object') return structuredClone(value);
  return value;
}

const JSON_VALUE = { dbType: 'jsonValue' };

function encode(field, value) {
  if (value === null || value === undefined) return null;
  // Keys that are integers are numbers here (whatever the mode of the field), so they find their rows.
  if (field.dbType === 'id' && (typeof value === 'bigint' || (typeof value === 'string' && /^-?\d+$/.test(value)))) {
    return Number(value);
  }
  return copy(value);
}

const ARITHMETIC = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
};

// A condition on a part of a date (a number, or null for no date: it matches nothing).
function matchesPart(actual, { lookup, value }) {
  if (actual === null) return false;
  switch (lookup) {
    case 'exact':
      return actual === value;
    case 'gt':
      return actual > value;
    case 'gte':
      return actual >= value;
    case 'lt':
      return actual < value;
    case 'lte':
      return actual <= value;
    case 'in':
      return value.includes(actual);
    case 'range':
      return actual >= value[0] && actual <= value[1];
    default:
      throw new BackendError(`Unknown lookup ${lookup} of a part of a date`);
  }
}

class MemoryBackend extends Backend {
  constructor(options) {
    super(options);
    this.tables = new Map();
    this.snapshots = [];
    // The keys of the rows of models without a primary key (numbers of their own), by row.
    this.rowKeys = new WeakMap();
  }

  // The key of a stored row in its table: its primary key, or its own number.
  rowKey(meta, row) {
    return meta.pk ? meta.pkValue(row) : this.rowKeys.get(row);
  }

  get name() {
    return 'memory';
  }

  // A value as it is kept (stored) and as it is given back (given). Backends that keep their tables elsewhere encrypt
  // the values of encrypted fields here.
  stored(field, value) {
    return encode(field, value);
  }

  given(field, value) {
    return copy(value);
  }

  table(meta) {
    let table = this.tables.get(meta.key);
    if (!table) {
      table = { rows: new Map(), sequence: 0 };
      this.tables.set(meta.key, table);
    }
    return table;
  }

  // The row a foreign key points to (by the primary key of its table, or by the field of toField).
  follow(field, key) {
    if (key === null || key === undefined) return null;
    const { rows } = this.table(field.target.meta);
    const target = field.targetField;
    if (target.primaryKey) return rows.get(key) || null;
    for (const row of rows.values()) if (equals(row[target.attname], key)) return row;
    return null;
  }

  // The value of a chain of fields, or of a path inside its json values.
  valueAt(row, fields, jsonPath) {
    let value = this.valueOf(row, fields);
    if (!jsonPath) return value;
    for (let i = 0; i < jsonPath.length && value !== null; i += 1) {
      value = typeof value === 'object' && value[jsonPath[i]] !== undefined ? value[jsonPath[i]] : null;
    }
    return value;
  }

  // The value at the end of a chain of fields from a row (null when a relation is not found).
  valueOf(row, fields) {
    let current = row;
    for (let i = 0; i < fields.length - 1; i += 1) {
      const field = fields[i];
      current = this.follow(field, current[field.attname]);
      if (!current) return null;
    }
    const value = current[lastOf(fields).attname];
    return value === undefined ? null : value;
  }

  evaluate(row, value) {
    if (!value || value.kind !== 'F') return value;
    let result = this.valueOf(row, value.fields);
    // Decimals are text: their arithmetic is of numbers, and the result text again (of the scale of the field).
    const field = lastOf(value.fields);
    const decimal = field.dbType === 'decimal' && value.ops.length > 0;
    if (decimal && result !== null) result = Number(result);
    for (let i = 0; i < value.ops.length && result !== null; i += 1) {
      const operand = this.evaluate(row, value.ops[i].value);
      result = operand === null ? null : ARITHMETIC[value.ops[i].op](result, decimal ? Number(operand) : operand);
    }
    if (decimal && result !== null) result = field.scale === undefined ? String(result) : result.toFixed(field.scale);
    return result;
  }

  matches(row, node) {
    if (!node) return true;
    if (node.op === 'raw') throw new BackendError('Fragments of SQL (Raw) are not supported by the memory backend');
    if (node.op === 'and') return node.children.every((child) => this.matches(row, child));
    if (node.op === 'or') return node.children.some((child) => this.matches(row, child));
    if (node.op === 'not') return !this.matches(row, node.children[0]);
    if (node.op === 'exists') return this.exists(row, node);
    if (node.part) return matchesPart(datePartOf(this.valueOf(row, node.fields), node.part), node);
    let field = lastOf(node.fields);
    let actual = this.valueOf(row, node.fields);
    const { lookup } = node;
    // A value inside json values (node.path), compared as it is.
    if (node.path) {
      for (let i = 0; i < node.path.length && actual !== null; i += 1) {
        actual = typeof actual === 'object' && actual[node.path[i]] !== undefined ? actual[node.path[i]] : null;
      }
      field = JSON_VALUE;
      if (lookup !== 'isnull' && actual !== null && typeof node.value === 'string' && typeof actual !== 'string')
        return false;
    }
    if (lookup === 'isnull') return (actual === null) === node.value;
    if (actual === null) return false;
    const expected = this.evaluate(row, node.value);
    const order = compareOf(field);
    switch (lookup) {
      case 'exact':
        return (
          expected !== null &&
          (order === compareDecimals ? order(actual, expected) === 0 : equals(actual, this.stored(field, expected)))
        );
      case 'gt':
        return expected !== null && order(actual, expected) > 0;
      case 'gte':
        return expected !== null && order(actual, expected) >= 0;
      case 'lt':
        return expected !== null && order(actual, expected) < 0;
      case 'lte':
        return expected !== null && order(actual, expected) <= 0;
      case 'in':
        return expected.some((item) =>
          order === compareDecimals
            ? item !== null && order(actual, item) === 0
            : equals(actual, this.stored(field, item))
        );
      case 'range':
        return order(actual, expected[0]) >= 0 && order(actual, expected[1]) <= 0;
      case 'iexact':
        return actual.toLowerCase() === expected.toLowerCase();
      case 'contains':
        return actual.includes(expected);
      case 'icontains':
        return actual.toLowerCase().includes(expected.toLowerCase());
      case 'startswith':
        return actual.startsWith(expected);
      case 'istartswith':
        return actual.toLowerCase().startsWith(expected.toLowerCase());
      case 'endswith':
        return actual.endsWith(expected);
      case 'iendswith':
        return actual.toLowerCase().endsWith(expected.toLowerCase());
      case 'like':
      case 'ilike':
        return new RegExp(likeToRegex(expected), lookup === 'ilike' ? 'i' : '').test(actual);
      case 'regex':
      case 'iregex':
        return new RegExp(expected, lookup === 'iregex' ? 'i' : '').test(actual);
      default:
        throw new BackendError(`Unknown lookup ${lookup}`);
    }
  }

  // Whether a row of the related table points to the object (reached through foreign keys) and matches.
  exists(row, { through, relation, where }) {
    let owner = row;
    for (let i = 0; i < through.length && owner; i += 1) {
      owner = this.follow(through[i], owner[through[i].attname]);
    }
    if (!owner) return false;
    const key = owner[relation.targetField.attname];
    for (const related of this.table(relation.model.meta).rows.values()) {
      if (equals(related[relation.attname], key) && this.matches(related, where)) return true;
    }
    return false;
  }

  sorter(orderBy) {
    return (a, b) => {
      for (let i = 0; i < orderBy.length; i += 1) {
        const item = orderBy[i];
        const { fields, desc, jsonPath } = item;
        let result;
        if (item.part || item.trunc) {
          // A part (a number) or a start (a date) of a date: values() of Extract or Trunc.
          result = compare(this.valueOfItem(a, item), this.valueOfItem(b, item));
        } else {
          const order = jsonPath ? compare : compareOf(lastOf(fields));
          result = order(this.valueAt(a, fields, jsonPath), this.valueAt(b, fields, jsonPath));
        }
        if (result !== 0) return desc ? -result : result;
      }
      return 0;
    };
  }

  find(query) {
    let rows = [...this.table(query.meta).rows.values()].filter((row) => this.matches(row, query.where));
    if (query.orderBy && query.orderBy.length) rows.sort(this.sorter(query.orderBy));
    const start = query.offset || 0;
    rows = rows.slice(start, query.limit === null ? undefined : start + query.limit);
    return rows;
  }

  // A row given to the ORM: copies of the values, and of the related rows selected.
  output(row, fields, related) {
    const result = {};
    fields.forEach((field) => {
      result[field.attname] = this.given(field, row[field.attname]);
    });
    related.forEach((chain) => {
      let source = row;
      let target = result;
      for (let i = 0; i < chain.length && target; i += 1) {
        const field = chain[i];
        const name = `$${field.name}`;
        if (!(name in target)) {
          const found = this.follow(field, source[field.attname]);
          target[name] = found ? this.output(found, field.target.meta.fields, []) : null;
          source = found;
        } else source = source && this.follow(field, source[field.attname]);
        target = target[name];
      }
    });
    return result;
  }

  async select(query) {
    if (query.extra) throw this.unsupported('Fragments of SQL (extra)');
    return this.run(() => {
      const rows = this.find(query);
      if (query.values) {
        return rows.map((row) => {
          const result = {};
          query.values.forEach((item) => {
            result[item.key] = this.valueOfItem(row, item);
          });
          return result;
        });
      }
      return rows.map((row) => this.output(row, query.only || query.meta.fields, query.related));
    });
  }

  // A value of values(): of a field, inside a json one, or a number (Extract) or a start (Trunc) of a date.
  valueOfItem(row, { fields, jsonPath, part, trunc }) {
    if (jsonPath) return copy(this.valueAt(row, fields, jsonPath));
    if (part) return datePartOf(this.valueOf(row, fields), part);
    if (trunc) return truncOf(this.valueOf(row, fields), trunc, lastOf(fields).dbType);
    return this.given(lastOf(fields), this.valueOf(row, fields));
  }

  async count(query) {
    return this.run(() => this.find(query).length);
  }

  async aggregate(query, aggregates, groupBy) {
    if (aggregates.some((item) => item.fn === 'raw')) throw this.unsupported('Fragments of SQL (Raw)');
    if (aggregates.some((item) => item.fields && item.fields.some((field) => field.reverse))) {
      throw new BackendError('Aggregates across reverse relations are not supported by the memory backend');
    }
    return this.run(() => {
      const rows = this.find({ ...query, limit: null, offset: 0, orderBy: [] });
      const groups = new Map();
      rows.forEach((row) => {
        const values = (groupBy || []).map((item) =>
          item.part || item.trunc ? this.valueOfItem(row, item) : this.valueOf(row, item.fields)
        );
        const key = JSON.stringify(values.map(normalize));
        if (!groups.has(key)) groups.set(key, { values, rows: [] });
        groups.get(key).rows.push(row);
      });
      if (!groupBy && groups.size === 0) groups.set('[]', { values: [], rows: [] });
      let results = [...groups.values()].map((group) => {
        const result = {};
        (groupBy || []).forEach(({ key, fields, part, trunc }, i) => {
          if (part || trunc) result[key] = copy(group.values[i]);
          else
            result[key] = fields && fields.length ? this.given(lastOf(fields), group.values[i]) : copy(group.values[i]);
        });
        aggregates.forEach((item) => {
          result[item.key] = this.computeAggregate(item, group.rows);
        });
        return result;
      });
      if (query.groupOrder && query.groupOrder.length) {
        results.sort((a, b) => {
          for (let i = 0; i < query.groupOrder.length; i += 1) {
            const { key, desc } = query.groupOrder[i];
            const result = compare(a[key], b[key]);
            if (result !== 0) return desc ? -result : result;
          }
          return 0;
        });
      }
      const start = query.offset || 0;
      results = results.slice(start, query.limit === null ? undefined : start + query.limit);
      return results;
    });
  }

  computeAggregate(item, rows) {
    if (!item.fields) return rows.length;
    const decimal = lastOf(item.fields).dbType === 'decimal';
    const order = decimal ? compareDecimals : compare;
    let values = rows.map((row) => this.valueOf(row, item.fields)).filter((value) => value !== null);
    if (item.distinct) {
      const seen = new Set();
      values = values.filter((value) => {
        const key = JSON.stringify(normalize(value));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    switch (item.fn) {
      case 'count':
        return values.length;
      case 'sum':
        // Decimals are summed as numbers, as SQL databases give them.
        return values.length ? values.reduce((total, value) => total + (decimal ? Number(value) : value), 0) : null;
      case 'avg':
        return values.length
          ? values.reduce((total, value) => total + (decimal ? Number(value) : value), 0) / values.length
          : null;
      case 'min':
        return values.length ? copy(values.reduce((a, b) => (order(a, b) <= 0 ? a : b))) : null;
      default:
        return values.length ? copy(values.reduce((a, b) => (order(a, b) >= 0 ? a : b))) : null;
    }
  }

  checkUnique(meta, table, row, pk) {
    meta.fields.forEach((field) => {
      if (!field.unique || field.primaryKey || row[field.attname] === null) return;
      table.rows.forEach((other, key) => {
        if (key !== pk && equals(other[field.attname], row[field.attname])) {
          const err = new BackendError(`Duplicate value of ${meta.table}.${field.column}`);
          err.unique = [field.column];
          throw err;
        }
      });
    });
    // Unique indexes (unique constraints): their fields together, those of Lower() without case. A row with a null in
    // them is not compared (as SQL); indexes of a condition of SQL are not checked here.
    for (const index of meta.indexes) {
      if (!index.unique || index.condition) continue;
      const fields = index.fields.map((name) => meta.field(name));
      const lower = new Set(index.lower || []);
      const valueOf = (source, field) => {
        const value = source[field.attname];
        return lower.has(field.name) && typeof value === 'string' ? value.toLowerCase() : value;
      };
      if (fields.some((field) => row[field.attname] === null || row[field.attname] === undefined)) continue;
      table.rows.forEach((other, key) => {
        if (key === pk) return;
        if (fields.every((field) => equals(valueOf(other, field), valueOf(row, field)))) {
          const err = new BackendError(
            `Duplicate value of ${meta.table}.${fields.map((field) => field.column).join(', ')}`
          );
          err.unique = fields.map((field) => field.column);
          err.index = index;
          throw err;
        }
      });
    }
  }

  async insert(meta, rows, options = {}) {
    if (options.conflict) throw this.unsupported('Inserts with conflicts');
    return this.run(() => {
      const table = this.table(meta);
      const { pk } = meta;
      const added = [];
      try {
        return rows.map((row) => {
          const stored = {};
          meta.fields.forEach((field) => {
            stored[field.attname] = this.stored(field, row[field.attname]);
          });
          // No primary key: a number of its own.
          if (!pk) {
            table.sequence += 1;
            const key = table.sequence;
            this.rowKeys.set(stored, key);
            this.checkUnique(meta, table, stored, key);
            table.rows.set(key, stored);
            added.push(key);
            return null;
          }
          // A composite key: the JSON of its values (all given).
          if (pk.composite) {
            if (pk.fields.some((field) => stored[field.attname] === null)) {
              throw new BackendError(`The primary key of ${meta.table} is required`);
            }
            const composite = meta.pkValue(stored);
            if (table.rows.has(composite))
              throw Object.assign(new BackendError(`Duplicate primary key ${composite} in ${meta.table}`), {
                unique: meta.pkFields.map((item) => item.column),
              });
            this.checkUnique(meta, table, stored, composite);
            table.rows.set(composite, stored);
            added.push(composite);
            return null;
          }
          let key = stored[pk.attname];
          if (key === null) {
            if (pk.type !== 'id') throw new BackendError(`The primary key of ${meta.table} is required`);
            table.sequence += 1;
            key = table.sequence;
            stored[pk.attname] = key;
          } else if (table.rows.has(key)) {
            throw Object.assign(new BackendError(`Duplicate primary key ${key} in ${meta.table}`), {
              unique: [meta.pk.column],
            });
          } else if (typeof key === 'number' && key > table.sequence) table.sequence = key;
          this.checkUnique(meta, table, stored, key);
          table.rows.set(key, stored);
          added.push(key);
          return key;
        });
      } catch (err) {
        // A failed insert inserts nothing, as one statement.
        added.forEach((key) => table.rows.delete(key));
        throw err;
      }
    });
  }

  async update(query, assignments) {
    if (assignments.some(({ value }) => value && value.kind === 'raw'))
      throw this.unsupported('Fragments of SQL (Raw)');
    return this.run(() => {
      const table = this.table(query.meta);
      const rows = this.find({ ...query, limit: null, offset: 0, orderBy: [] });
      const { meta } = query;
      const updated = rows.map((row) => {
        const next = { ...row };
        assignments.forEach(({ field, value }) => {
          next[field.attname] = this.stored(field, this.evaluate(row, value));
        });
        if (!meta.pk) this.rowKeys.set(next, this.rowKeys.get(row));
        return next;
      });
      updated.forEach((row) => this.checkUnique(meta, table, row, this.rowKey(meta, row)));
      updated.forEach((row) => table.rows.set(this.rowKey(meta, row), row));
      return updated.length;
    });
  }

  async delete(query) {
    return this.run(() => {
      const table = this.table(query.meta);
      const rows = this.find({ ...query, limit: null, offset: 0, orderBy: [] });
      rows.forEach((row) => table.rows.delete(this.rowKey(query.meta, row)));
      return rows.length;
    });
  }

  async createSchema(metas) {
    metas.forEach((meta) => this.table(meta));
  }

  async dropSchema(metas) {
    metas.forEach((meta) => this.tables.delete(meta.key));
  }

  // Migrations in memory: tables created and dropped, and fields added (with their default), dropped and renamed.
  async appliedMigrations() {
    return [...(this.migrations || [])];
  }

  async recordMigration(name) {
    if (!this.migrations) this.migrations = new Set();
    this.migrations.add(name);
  }

  migrationTransaction(fn) {
    return this.transaction(fn);
  }

  async migrationOperation(op) {
    const rowsOf = (table) => (this.tables.get(table) || { rows: new Map() }).rows;
    switch (op.op) {
      case 'createTable':
        if (!this.tables.has(op.spec.table)) this.tables.set(op.spec.table, { rows: new Map(), sequence: 0 });
        return;
      case 'dropTable':
        this.tables.delete(op.table);
        return;
      case 'addColumn': {
        const value = op.default && op.default.now === true ? new Date() : op.default;
        rowsOf(op.table).forEach((row) => {
          if (!(op.column in row)) row[op.column] = value === undefined ? null : copy(value);
        });
        return;
      }
      case 'dropColumn':
        rowsOf(op.table).forEach((row) => {
          delete row[op.column];
        });
        return;
      case 'renameColumn':
        rowsOf(op.table).forEach((row) => {
          row[op.to] = row[op.from];
          delete row[op.from];
        });
        return;
      case 'renameTable':
        this.tables.set(op.to, this.tables.get(op.from));
        this.tables.delete(op.from);
        return;
      case 'sql':
        throw this.unsupported('SQL in migrations');
      default:
        return;
    }
  }

  snapshot() {
    const tables = new Map();
    this.tables.forEach((table, name) => {
      tables.set(name, {
        rows: new Map([...table.rows].map(([key, row]) => [key, structuredClone(row)])),
        sequence: table.sequence,
      });
    });
    return tables;
  }

  async begin() {
    this.snapshots.push(this.snapshot());
  }

  async commit() {
    this.snapshots.pop();
  }

  async rollback() {
    this.tables = this.snapshots.pop();
  }

  async savepoint() {
    this.snapshots.push(this.snapshot());
  }

  async releaseSavepoint() {
    this.snapshots.pop();
  }

  async rollbackToSavepoint() {
    this.tables = this.snapshots.pop();
  }
}

export { MemoryBackend };
