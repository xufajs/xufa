// The description of a query that every backend compiles: it is where the ORM is the same for SQL and NoSQL
// databases. Conditions are written as in Django ({ author__name__icontains: 'ada' }, Q objects for OR and NOT, F for
// other fields) and resolved here against the models, so the backends get fields, never names:
//
//   leaf:  { fields: [Field, ...], lookup: 'icontains', value }  the fields before the last are the foreign keys
//                                                                  followed (joins, $lookup stages)
//   node:  { op: 'and' | 'or' | 'not', children: [...] }
//   F:     { kind: 'F', fields: [Field, ...], ops: [{ op: '+', value }] }
//   exists: { op: 'exists', through: [ForeignKey, ...], relation: ForeignKey, where }  objects of another model whose
//          foreign key `relation` points to the object (reached by the foreign keys `through`) and that match `where`
//          (conditions across reverse relations: Author.objects.filter({ books__title: 'X' }))
const { ForeignKey } = require('./fields');
const { FieldError, LookupError, QueryError } = require('./errors');

const SEPARATOR = '__';
const COMPARISONS = ['exact', 'in', 'isnull', 'gt', 'gte', 'lt', 'lte', 'range'];
// like and ilike take patterns of SQL LIKE: % is any text, _ any character, and \ escapes them.
const TEXT_LOOKUPS = [
  'iexact',
  'contains',
  'icontains',
  'startswith',
  'istartswith',
  'endswith',
  'iendswith',
  'like',
  'ilike',
  'regex',
  'iregex',
];
const LOOKUPS = new Set([...COMPARISONS, ...TEXT_LOOKUPS]);
const TEXT_TYPES = new Set(['string', 'text', 'uuid']);
const EQUALITY_TYPES = new Set(['json', 'boolean']);
const OPS = { add: '+', sub: '-', mul: '*', div: '/' };

class Q {
  constructor(conditions, op = 'and') {
    this.op = op;
    this.children = conditions === undefined ? [] : [conditions];
  }

  static from(op, items) {
    const q = new Q(undefined, op);
    q.children = items;
    return q;
  }

  and(...items) {
    return Q.from('and', [this, ...items]);
  }

  or(...items) {
    return Q.from('or', [this, ...items]);
  }

  not() {
    return Q.from('not', [this]);
  }
}

// A condition on a value inside a json field, its path given as a list of keys and indexes: any key, also those that
// look like lookups or have the separator (jsonPath('data', ['in'], 1), jsonPath('data', ['a__b', 0], 'x', 'gt')).
class JsonPath {
  constructor(field, path, value, lookup = 'exact') {
    if (!Array.isArray(path) || path.length === 0) throw new QueryError('A json path must be a list of keys');
    path.forEach((key) => {
      const index = typeof key === 'number';
      if (index ? !Number.isInteger(key) || key < 0 || key > MAX_JSON_INDEX : typeof key !== 'string') {
        throw new QueryError(`Invalid key of a json path: ${String(key)}`);
      }
    });
    this.field = field;
    this.path = path.slice();
    this.value = value;
    this.lookup = lookup;
  }
}

// The greatest index of a json array in a path (as Sequelize 7): beyond it, PostgreSQL has no operator (jsonb -> bigint).
const MAX_JSON_INDEX = 2 ** 31 - 1;

function jsonPath(field, path, value, lookup) {
  return new JsonPath(field, path, value, lookup);
}

// A fragment of SQL (SQL databases only): in conditions, orders (Raw('x DESC')) and values ({ total: Raw('...') }).
// `?` are its parameters; Raw.TABLE in it is the table of the model (its alias in the query).
function Raw(sql, params = []) {
  if (!new.target) return new Raw(sql, params);
  this.sql = sql;
  this.params = params;
}
Raw.TABLE = '\u0000table\u0000';

const and = (...items) => Q.from('and', items);
const or = (...items) => Q.from('or', items);
const not = (...items) => Q.from('not', [Q.from('and', items)]);

// A reference to a field, to compare fields between them or to update a field from its value: F('views').add(1).
function F(name, ops = []) {
  if (!new.target) return new F(name, ops);
  this.name = name;
  this.ops = ops;
}
for (const [method, op] of Object.entries(OPS)) {
  F.prototype[method] = function operate(value) {
    return new F(this.name, [...this.ops, { op, value }]);
  };
}

class Aggregate {
  constructor(fn, name, options = {}) {
    this.fn = fn;
    this.name = name;
    this.distinct = Boolean(options.distinct);
  }
}

const Count = (name, options) => new Aggregate('count', name, options);
const Sum = (name) => new Aggregate('sum', name);
const Avg = (name) => new Aggregate('avg', name);
const Min = (name) => new Aggregate('min', name);
const Max = (name) => new Aggregate('max', name);

// Resolves a path of names ('author__publisher__name') into the fields it goes through. The rest of the names, which
// are not fields, are returned as `rest` (the lookup). A foreign key followed by the key of its model (author__id)
// stops at the foreign key, whose value is that key, so no join is needed.
// `reverse`: reverse relations can be followed too (aggregates: Count('books'), Sum('books__pages'), joined in SQL);
// a path that ends at one is of the primary keys of its objects.
// Whether some field of a model has the separator in its name (a__b): its paths are read by the longest names.
const SEPARATOR_NAMES = new WeakMap();
function hasSeparatorNames(meta) {
  let has = SEPARATOR_NAMES.get(meta);
  if (has === undefined) {
    has = [...meta.fieldMap.keys()].some((name) => name.includes(SEPARATOR));
    SEPARATOR_NAMES.set(meta, has);
  }
  return has;
}

// The field of a model a path names from its part i: the longest name of a field (names can have the separator), and
// the part after it.
function fieldAt(meta, parts, i) {
  if (hasSeparatorNames(meta)) {
    for (let j = parts.length; j > i + 1; j -= 1) {
      const field = meta.field(parts.slice(i, j).join(SEPARATOR));
      if (field) return { field, next: j };
    }
  }
  return { field: meta.field(parts[i]), next: i + 1 };
}

function resolvePath(model, path, allowRest = true, reverse = false) {
  const parts = path.split(SEPARATOR);
  const fields = [];
  let current = model;
  let i = 0;
  while (i < parts.length) {
    const { meta } = current;
    const { field, next: after } = fieldAt(meta, parts, i);
    if (!field) {
      const relation = meta.reverseRelation(parts[i]);
      if (relation && reverse) {
        fields.push(reverseStep(relation));
        i += 1;
        current = relation.model;
        // The end of the path: the key of the related rows (their foreign key when they have none).
        if (i === parts.length) fields.push(current.meta.pk || relation);
        continue;
      }
      if (relation) {
        throw new QueryError(`The reverse relation ${model.name}.${parts[i]} can only be followed in conditions`);
      }
      break;
    }
    fields.push(field);
    i = after;
    if (!(field instanceof ForeignKey) || i === parts.length) break;
    const target = field.target;
    const { field: next, next: following } = fieldAt(target.meta, parts, i);
    if (!next) break;
    if (next === field.targetField) {
      i = following;
      break;
    }
    current = target;
  }
  if (fields.length === 0) {
    if (model.meta.computedField && model.meta.computedField(parts[0])) {
      throw new QueryError(
        `${parts[0]} is a computed field that is not stored: queries cannot use it (stored: true makes it a column)`
      );
    }
    throw new FieldError(parts[0], model.name);
  }
  const rest = parts.slice(i);
  // In conditions, the names after a json field are a path inside its values (data__owner__name), and the last one
  // can be a lookup (data__pages__gte).
  if (rest.length && lastOf(fields).dbType === 'json') {
    // In orders and values, every name after it is of the path.
    if (!allowRest) return { fields, rest: undefined, jsonPath: rest };
    const lookup = LOOKUPS.has(rest[rest.length - 1]) ? rest[rest.length - 1] : undefined;
    const jsonPath = lookup ? rest.slice(0, -1) : rest;
    if (jsonPath.length) return { fields, rest: lookup, jsonPath };
  }
  if (rest.length > (allowRest ? 1 : 0)) throw new FieldError(path, model.name);
  return { fields, rest: rest[0] };
}

// When a key of conditions follows a reverse relation (books__title, author__books__pages__gt), the foreign keys to
// the model that has it (through), the relation (the foreign key of the other model) and the rest of the key.
function findReverse(model, key) {
  const parts = key.split(SEPARATOR);
  const through = [];
  let current = model;
  for (let i = 0; i < parts.length;) {
    const { meta } = current;
    const { field, next } = fieldAt(meta, parts, i);
    if (!field) {
      const rest = parts.slice(i + 1).join(SEPARATOR);
      const relation = meta.reverseRelation(parts[i]);
      if (relation) return { through, relation, rest };
      // A many-to-many relation: the links of the through model to the object, and the object of their other key.
      const many = meta.manyToManyRelation(parts[i]);
      if (!many) return null;
      if (rest === 'isnull') return { through, relation: many.from, rest };
      const other =
        rest === '' || LOOKUPS.has(rest)
          ? `${many.to.name}${rest ? SEPARATOR + rest : ''}`
          : `${many.to.name}${SEPARATOR}${rest}`;
      return { through, relation: many.from, rest: other };
    }
    if (!(field instanceof ForeignKey) || field.attname === parts.slice(i, next).join(SEPARATOR)) return null;
    through.push(field);
    current = field.target;
    i = next;
  }
  return null;
}

function lastOf(fields) {
  return fields[fields.length - 1];
}

// Encrypted fields cannot be compared, sorted nor computed by the database: `what` is what was tried.
function refuseEncrypted(field, what) {
  if (field.encrypted) throw new QueryError(`${field.model.name}.${field.name} is encrypted: it cannot be ${what}`);
}

function resolveF(model, ref) {
  const { fields } = resolvePath(model, ref.name, false);
  refuseEncrypted(lastOf(fields), 'in an F expression');
  const ops = ref.ops.map(({ op, value }) => {
    if (value instanceof F) return { op, value: resolveF(model, value) };
    if (typeof value !== 'number') throw new QueryError(`F expressions only operate with numbers and F (${ref.name})`);
    return { op, value };
  });
  return { kind: 'F', fields, ops };
}

function cleanValue(field, value, path) {
  try {
    // An object for a primary key is its key (books: book).
    if (field.primaryKey && value && typeof value === 'object' && value.constructor && value.constructor.meta) {
      return field.toValue(value.pk);
    }
    return field.toValue(value);
  } catch (err) {
    throw new QueryError(`Invalid value for ${path}: ${err.message}`);
  }
}

// A condition on a value inside json values: compared as it is (numbers, strings, booleans, dates).
function resolveJsonLeaf(fields, path, lookup, value, key) {
  if (!LOOKUPS.has(lookup)) throw new LookupError(lookup, lastOf(fields).name, lastOf(fields).model.name);
  if (value instanceof F) throw new QueryError(`The path ${key} cannot compare with an F expression`);
  if (lookup === 'isnull') return { fields, path, lookup, value: Boolean(value) };
  if (value === undefined) throw new QueryError(`The value of ${key} is undefined`);
  if (value === null) {
    if (lookup !== 'exact') throw new QueryError(`The lookup ${lookup} of ${key} cannot compare with null`);
    return { fields, path, lookup: 'isnull', value: true };
  }
  if ((lookup === 'in' || lookup === 'range') && !Array.isArray(value)) {
    throw new QueryError(`The value of ${key} must be an array`);
  }
  if (lookup === 'in')
    return { fields, path, lookup, value: value.filter((item) => item !== null && item !== undefined) };
  if (TEXT_LOOKUPS.includes(lookup) && typeof value !== 'string') {
    throw new QueryError(`The value of ${key} must be a string`);
  }
  return { fields, path, lookup, value };
}

// A condition on a composite primary key (pk, pk__exact, pk__in, pk__isnull): conditions on its fields.
function compositeLeaf(model, key, value) {
  const { pk } = model.meta;
  const [name, lookup = 'exact', ...more] = key.split(SEPARATOR);
  if (name !== 'pk' || !pk || !pk.composite || more.length) return null;
  const leavesOf = (item) => {
    let values;
    try {
      values = pk.valuesOf(item);
    } catch (err) {
      throw new QueryError(`Invalid value for ${key}: ${err.message}`);
    }
    return { op: 'and', children: pk.fields.map((field, i) => resolveLeaf(model, field.name, values[i])) };
  };
  if (lookup === 'exact') {
    if (value === null) return { op: 'and', children: pk.fields.map((field) => resolveLeaf(model, field.name, null)) };
    return leavesOf(value);
  }
  if (lookup === 'isnull') {
    return { op: 'and', children: pk.fields.map((field) => resolveLeaf(model, `${field.name}__isnull`, value)) };
  }
  if (lookup === 'in') {
    if (!Array.isArray(value)) throw new QueryError(`The value of ${key} must be an array`);
    // No keys: a condition no row meets.
    if (value.length === 0) return resolveLeaf(model, `${pk.fields[0].name}__in`, []);
    return { op: 'or', children: value.map(leavesOf) };
  }
  throw new LookupError(lookup, 'pk', model.name);
}

// The names of an order with the primary key: each field of a composite one.
function expandPkOrder(model, names) {
  const { pk } = model.meta;
  if (!pk || !pk.composite) return names;
  return names.flatMap((name) => {
    if (name === 'pk' || name === '-pk') return pk.fields.map((field) => `${name[0] === '-' ? '-' : ''}${field.name}`);
    return [name];
  });
}

function resolveLeaf(model, key, value) {
  const composite = compositeLeaf(model, key, value);
  if (composite) return composite;
  const { fields, rest, jsonPath } = resolvePath(model, key);
  if (jsonPath) return resolveJsonLeaf(fields, jsonPath, rest || 'exact', value, key);
  const field = lastOf(fields);
  const lookup = rest || 'exact';
  const type = field.dbType;
  // Encrypted values: isnull, and exact and in when they are deterministic (the same value, the same text).
  const nullCheck = lookup === 'isnull' || (lookup === 'exact' && value === null);
  if (field.encrypted && !(nullCheck || (field.deterministic && (lookup === 'exact' || lookup === 'in')))) {
    throw new QueryError(
      `${field.model.name}.${field.name} is encrypted: its conditions are isnull${field.deterministic ? ', exact and in' : ' (exact and in when it is deterministic)'}`
    );
  }
  if (
    !LOOKUPS.has(lookup) ||
    (TEXT_LOOKUPS.includes(lookup) && !TEXT_TYPES.has(type)) ||
    (EQUALITY_TYPES.has(type) && !['exact', 'in', 'isnull'].includes(lookup)) ||
    (type === 'json' && lookup === 'in')
  ) {
    throw new LookupError(lookup, field.name, field.model.name);
  }
  if (value instanceof F) {
    if (!['exact', 'gt', 'gte', 'lt', 'lte'].includes(lookup)) {
      throw new QueryError(`The lookup ${lookup} of ${key} cannot compare with an F expression`);
    }
    return { fields, lookup, value: resolveF(model, value) };
  }
  if (lookup === 'isnull') return { fields, lookup, value: Boolean(value) };
  if (value === undefined) throw new QueryError(`The value of ${key} is undefined`);
  if (value === null) {
    if (lookup !== 'exact') throw new QueryError(`The lookup ${lookup} of ${key} cannot compare with null`);
    return { fields, lookup: 'isnull', value: true };
  }
  if (lookup === 'in') {
    if (!Array.isArray(value)) throw new QueryError(`The value of ${key} must be an array`);
    const values = value.filter((item) => item !== null && item !== undefined);
    return { fields, lookup, value: values.map((item) => cleanValue(field, item, key)) };
  }
  if (lookup === 'range') {
    if (!Array.isArray(value) || value.length !== 2) throw new QueryError(`The value of ${key} must be [from, to]`);
    return { fields, lookup, value: value.map((item) => cleanValue(field, item, key)) };
  }
  if (TEXT_LOOKUPS.includes(lookup)) {
    if (typeof value !== 'string') throw new QueryError(`The value of ${key} must be a string`);
    return { fields, lookup, value };
  }
  return { fields, lookup, value: cleanValue(field, value, key) };
}

// Resolves conditions (objects, Q) into a node or a leaf. Several keys of an object are ANDed.
function resolveWhere(model, item) {
  if (item instanceof Raw) return { op: 'raw', sql: item.sql, params: item.params };
  if (item instanceof JsonPath) {
    const { fields, rest, jsonPath: more } = resolvePath(model, item.field, false);
    if (rest !== undefined || more || lastOf(fields).dbType !== 'json') {
      throw new QueryError(`${item.field} of ${model.name} is not a json field`);
    }
    return resolveJsonLeaf(fields, item.path, item.lookup, item.value, `${item.field}${JSON.stringify(item.path)}`);
  }
  if (item instanceof Q) {
    const children = item.children.map((child) => resolveWhere(model, child)).filter(Boolean);
    if (item.op === 'not') return children.length ? { op: 'not', children: [and1(children)] } : null;
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { op: item.op, children };
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new QueryError('Conditions must be objects or Q');
  const children = [];
  // The conditions of one object across the same reverse relation are of the same related object (as in Django).
  const groups = new Map();
  Object.keys(item).forEach((key) => {
    const dated = dateCondition(model, key, item[key]);
    if (dated) {
      children.push(dated);
      return;
    }
    const reverse = findReverse(model, key);
    if (!reverse) {
      children.push(resolveLeaf(model, key, item[key]));
      return;
    }
    const { through, relation, rest } = reverse;
    const id = `${pathKey(through)}>${relation.model.name}.${relation.name}`;
    let group = groups.get(id);
    if (!group) {
      group = { through, relation, conditions: {}, isnull: undefined };
      groups.set(id, group);
      children.push(group);
    }
    if (rest === 'isnull') group.isnull = Boolean(item[key]);
    else if (rest === '' || LOOKUPS.has(rest)) group.conditions[rest ? `pk${SEPARATOR}${rest}` : 'pk'] = item[key];
    else group.conditions[rest] = item[key];
  });
  const nodes = children.map((child) => {
    if (!child.relation) return child;
    const { through, relation, conditions, isnull } = child;
    const where = Object.keys(conditions).length ? resolveWhere(relation.model, conditions) : null;
    const exists = { op: 'exists', through, relation, where };
    // books__isnull: true is the objects without books.
    return isnull === true ? { op: 'not', children: [exists] } : exists;
  });
  if (nodes.length === 0) return null;
  return nodes.length === 1 ? nodes[0] : { op: 'and', children: nodes };
}

// The parts of dates that conditions take, as Django's, in UTC. year and date are rewritten as ranges of the field
// (createdAt__year: 2026, createdAt__date__gte: '2026-10-01'): the same on every backend, and indexes serve them. The
// others are numbers taken out of the field by each backend (createdAt__month: 10, createdAt__week_day__in: [1, 7]):
// month, day, week_day (1 Sunday to 7 Saturday), iso_week_day (1 Monday to 7 Sunday), week (of ISO), quarter; and of
// datetimes hour, minute and second.
const RANGE_PARTS = new Set(['year', 'date']);
const EXTRACTED_PARTS = new Set([
  'month',
  'day',
  'week_day',
  'iso_week_day',
  'week',
  'quarter',
  'hour',
  'minute',
  'second',
]);
const TIME_PARTS = new Set(['hour', 'minute', 'second']);
const DATE_PARTS = new Set([...RANGE_PARTS, ...EXTRACTED_PARTS]);
const DATE_LOOKUPS = new Set(['exact', 'gt', 'gte', 'lt', 'lte', 'in', 'range', 'isnull']);
const DAY = 86400000;

function dateCondition(model, key, value) {
  const parts = key.split(SEPARATOR);
  let lookup = 'exact';
  if (parts.length > 2 && DATE_LOOKUPS.has(parts[parts.length - 1]) && DATE_PARTS.has(parts[parts.length - 2])) {
    lookup = parts.pop();
  }
  if (parts.length < 2 || !DATE_PARTS.has(parts[parts.length - 1])) return null;
  // A path that is of fields as it is (a field named date) is not a part of a date.
  try {
    const plain = resolvePath(model, key, true);
    if (plain.rest === undefined || plain.jsonPath) return null;
  } catch (err) {
    if (!(err instanceof FieldError)) throw err;
  }
  const part = parts.pop();
  const name = parts.join(SEPARATOR);
  let fields;
  try {
    ({ fields } = resolvePath(model, name, false));
  } catch (err) {
    return null;
  }
  const field = lastOf(fields);
  if (field.type !== 'date' && field.type !== 'datetime') {
    throw new LookupError(`${part}${lookup === 'exact' ? '' : SEPARATOR + lookup}`, name, model.name);
  }
  if (lookup === 'isnull') return resolveLeaf(model, `${name}${SEPARATOR}isnull`, value);
  if (EXTRACTED_PARTS.has(part)) return partLeaf(fields, field, part, lookup, value, key);
  if (part === 'date' && field.type === 'date') return resolveLeaf(model, `${name}${SEPARATOR}${lookup}`, value);
  // The interval [from, to) of a year or a day, as values of the field.
  const interval = (given) => {
    let start;
    let end;
    if (part === 'year') {
      const year = Number(given);
      if (!Number.isInteger(year)) throw new QueryError(`${key}: a year is an integer (it is ${given})`);
      start = Date.UTC(year, 0, 1);
      end = Date.UTC(year + 1, 0, 1);
    } else {
      const day = given instanceof Date ? given : new Date(`${String(given).slice(0, 10)}T00:00:00Z`);
      if (Number.isNaN(day.getTime())) throw new QueryError(`${key}: not a date (${given})`);
      start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
      end = start + DAY;
    }
    const as = (time) => (field.type === 'date' ? new Date(time).toISOString().slice(0, 10) : new Date(time));
    return [as(start), as(end)];
  };
  const range = (from, to) => ({ [`${name}${SEPARATOR}gte`]: from, [`${name}${SEPARATOR}lt`]: to });
  let conditions;
  switch (lookup) {
    case 'exact':
      conditions = range(...interval(value));
      break;
    case 'gt':
      conditions = { [`${name}${SEPARATOR}gte`]: interval(value)[1] };
      break;
    case 'gte':
      conditions = { [`${name}${SEPARATOR}gte`]: interval(value)[0] };
      break;
    case 'lt':
      conditions = { [`${name}${SEPARATOR}lt`]: interval(value)[0] };
      break;
    case 'lte':
      conditions = { [`${name}${SEPARATOR}lt`]: interval(value)[1] };
      break;
    case 'range':
      if (!Array.isArray(value) || value.length !== 2) throw new QueryError(`${key} takes [from, to]`);
      conditions = range(interval(value[0])[0], interval(value[1])[1]);
      break;
    default: {
      if (!Array.isArray(value)) throw new QueryError(`${key} takes an array`);
      if (value.length === 0) return resolveLeaf(model, `${name}${SEPARATOR}in`, []);
      return resolveWhere(
        model,
        Q.from(
          'or',
          value.map((item) => range(...interval(item)))
        )
      );
    }
  }
  return resolveWhere(model, conditions);
}

// A condition on a number taken out of a date: { fields, part, lookup, value } (integers), compiled by each backend.
function partLeaf(fields, field, part, lookup, value, key) {
  if (TIME_PARTS.has(part) && field.type !== 'datetime') {
    throw new LookupError(part, field.name, field.model.name);
  }
  const integer = (item) => {
    const number = typeof item === 'string' && /^-?\d+$/.test(item.trim()) ? Number(item) : item;
    if (!Number.isInteger(number)) throw new QueryError(`${key}: the ${part} is an integer (it is ${String(item)})`);
    return number;
  };
  if (value instanceof F) throw new QueryError(`${key} cannot compare with an F expression`);
  if (value === null || value === undefined) throw new QueryError(`${key} cannot compare with ${value}`);
  if (lookup === 'in') {
    if (!Array.isArray(value)) throw new QueryError(`${key} takes an array`);
    return { fields, part, lookup, value: value.map(integer) };
  }
  if (lookup === 'range') {
    if (!Array.isArray(value) || value.length !== 2) throw new QueryError(`${key} takes [from, to]`);
    return { fields, part, lookup, value: value.map(integer) };
  }
  return { fields, part, lookup, value: integer(value) };
}

// The number of a part of a date (a Date, or a text of a date or a datetime), in UTC: what the backends without a
// language for it (memory, files) compare, and what the others compute. null for what is not a date.
function datePartOf(value, part) {
  if (value === null || value === undefined) return null;
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  const time = date.getTime();
  if (Number.isNaN(time)) return null;
  switch (part) {
    case 'year':
      return date.getUTCFullYear();
    case 'month':
      return date.getUTCMonth() + 1;
    case 'day':
      return date.getUTCDate();
    case 'week_day':
      return date.getUTCDay() + 1;
    case 'iso_week_day':
      return ((date.getUTCDay() + 6) % 7) + 1;
    case 'quarter':
      return Math.floor(date.getUTCMonth() / 3) + 1;
    case 'hour':
      return date.getUTCHours();
    case 'minute':
      return date.getUTCMinutes();
    case 'second':
      return date.getUTCSeconds();
    case 'week': {
      // ISO 8601: the week of the Thursday of the date's week; week 1 has the year's first Thursday.
      const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7));
      const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4));
      return 1 + Math.round(((day - firstThursday) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    }
    default:
      throw new QueryError(`Not a part of a date: ${part}`);
  }
}

// The start of the year, quarter, month, week (Monday), day, hour, minute or second of a date, in UTC: a Date for
// datetimes, a text YYYY-MM-DD for dates; null for what is not a date.
function truncOf(value, unit, type) {
  if (value === null || value === undefined) return null;
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const d = date.getUTCDate();
  let time;
  switch (unit) {
    case 'year':
      time = Date.UTC(y, 0, 1);
      break;
    case 'quarter':
      time = Date.UTC(y, m - (m % 3), 1);
      break;
    case 'month':
      time = Date.UTC(y, m, 1);
      break;
    case 'week':
      time = Date.UTC(y, m, d) - ((date.getUTCDay() + 6) % 7) * DAY;
      break;
    case 'day':
      time = Date.UTC(y, m, d);
      break;
    case 'hour':
      time = Date.UTC(y, m, d, date.getUTCHours());
      break;
    case 'minute':
      time = Date.UTC(y, m, d, date.getUTCHours(), date.getUTCMinutes());
      break;
    case 'second':
      time = Date.UTC(y, m, d, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
      break;
    default:
      throw new QueryError(`Not a unit of Trunc: ${unit}`);
  }
  return type === 'date' ? new Date(time).toISOString().slice(0, 10) : new Date(time);
}

const EXTRACTS = new Set(['year', ...EXTRACTED_PARTS]);
const TRUNCS = new Set(['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second']);

// A number of a date of a field, in values() (and so in the groups of annotate()), as Django's ExtractMonth...:
// values({ month: Extract('createdAt', 'month') }). The parts are those of the conditions, and year.
function Extract(field, part) {
  if (!new.target) return new Extract(field, part);
  if (typeof field !== 'string') throw new QueryError('Extract(field, part): field is the name of a field');
  if (!EXTRACTS.has(part))
    throw new QueryError(`Extract(${field}, ${part}): the parts are ${[...EXTRACTS].join(', ')}`);
  this.field = field;
  this.part = part;
}

// The start of the year, quarter, month, week, day, hour, minute or second of a field, as Django's TruncMonth...:
// values({ month: Trunc('createdAt', 'month') }) gives the first instant of its month (a Date; a date for dates).
function Trunc(field, unit) {
  if (!new.target) return new Trunc(field, unit);
  if (typeof field !== 'string') throw new QueryError('Trunc(field, unit): field is the name of a field');
  if (!TRUNCS.has(unit)) throw new QueryError(`Trunc(${field}, ${unit}): the units are ${[...TRUNCS].join(', ')}`);
  this.field = field;
  this.unit = unit;
}

// The item of values() of an Extract or a Trunc: { key, fields, part } or { key, fields, trunc }.
function resolveDateValue(model, key, value) {
  const { fields, jsonPath } = resolvePath(model, value.field, false);
  const field = lastOf(fields);
  const name =
    value instanceof Extract ? `Extract(${value.field}, ${value.part})` : `Trunc(${value.field}, ${value.unit})`;
  if (jsonPath || (field.type !== 'date' && field.type !== 'datetime')) {
    throw new QueryError(`${name}: ${value.field} of ${model.name} is not a date nor a datetime`);
  }
  const unit = value instanceof Extract ? value.part : value.unit;
  if (field.type === 'date' && TIME_PARTS.has(unit)) {
    throw new QueryError(`${name}: ${value.field} of ${model.name} is a date: it has no ${unit}`);
  }
  return value instanceof Extract ? { key, fields, part: value.part } : { key, fields, trunc: value.unit };
}

// Whether conditions follow reverse relations.
function hasExists(node) {
  if (!node || !node.op || node.op === 'raw') return false;
  if (node.op === 'exists') return true;
  return node.children.some(hasExists);
}

function and1(children) {
  return children.length === 1 ? children[0] : { op: 'and', children };
}

function combine(op, left, right) {
  if (!left) return right;
  if (!right) return left;
  return { op, children: [left, right] };
}

function resolveOrder(model, name) {
  if (name instanceof Raw) return { raw: name.sql, params: name.params, desc: false };
  const desc = name.startsWith('-');
  const { fields, jsonPath } = resolvePath(model, desc ? name.slice(1) : name, false);
  refuseEncrypted(lastOf(fields), 'an order');
  return jsonPath ? { fields, desc, jsonPath } : { fields, desc };
}

// A step of a path along a reverse relation (the foreign key of the other model): one for every relation.
const REVERSE_STEPS = new WeakMap();
function reverseStep(relation) {
  let step = REVERSE_STEPS.get(relation);
  if (!step) {
    step = Object.freeze({ name: relation.relatedName, reverse: relation });
    REVERSE_STEPS.set(relation, step);
  }
  return step;
}

function resolveAggregate(model, aggregate) {
  // A fragment of SQL that aggregates (SQL databases): Raw('SUM(CASE WHEN ... END)'), its value as the driver gives it.
  if (aggregate instanceof Raw)
    return { fn: 'raw', fields: null, distinct: false, raw: aggregate.sql, params: aggregate.params };
  if (!(aggregate instanceof Aggregate)) {
    throw new QueryError('Aggregates must be made with Count, Sum, Avg, Min, Max (or Raw, in SQL databases)');
  }
  if (aggregate.name === undefined || aggregate.name === '*') {
    if (aggregate.fn !== 'count') throw new QueryError(`${aggregate.fn} needs a field`);
    return { fn: 'count', fields: null, distinct: false };
  }
  const { fields } = resolvePath(model, aggregate.name, false, true);
  if (aggregate.fn !== 'count') refuseEncrypted(lastOf(fields), `aggregated by ${aggregate.fn}`);
  return { fn: aggregate.fn, fields, distinct: aggregate.distinct };
}

// The key of a path of fields, to name joins and the columns of values().
function pathKey(fields) {
  return fields.map((field) => field.name).join(SEPARATOR);
}

// Every leaf of a condition tree.
// Every leaf of a condition tree (those of the conditions of exists nodes are of another query).
function eachLeaf(node, fn) {
  if (!node || node.op === 'exists' || node.op === 'raw') return;
  if (node.op) node.children.forEach((child) => eachLeaf(child, fn));
  else fn(node);
}

// Every exists node of a condition tree (not those inside other exists nodes).
function eachExists(node, fn) {
  if (!node || !node.op || node.op === 'raw') return;
  if (node.op === 'exists') fn(node);
  else node.children.forEach((child) => eachExists(child, fn));
}

function eachF(value, fn) {
  if (!value || value.kind !== 'F') return;
  fn(value);
  value.ops.forEach((item) => eachF(item.value, fn));
}

// The chains of foreign keys a query follows (for its conditions, order, values, aggregates and selectRelated), each
// once and after its prefixes, so a backend can join them in order.
function collectJoins(query, extra = []) {
  const joins = new Map();
  const add = (fields, includeLast) => {
    const end = includeLast ? fields.length : fields.length - 1;
    for (let i = 1; i <= end; i += 1) {
      const chain = fields.slice(0, i);
      const key = pathKey(chain);
      if (!joins.has(key)) joins.set(key, chain);
    }
  };
  eachLeaf(query.where, (leaf) => {
    add(leaf.fields, false);
    eachF(leaf.value, (ref) => add(ref.fields, false));
  });
  // The object a reverse relation points to is joined (its key is compared).
  eachExists(query.where, (node) => add(node.through, true));
  (query.orderBy || []).forEach((item) => item.fields && add(item.fields, false));
  (query.values || []).forEach((item) => item.fields && add(item.fields, false));
  (query.related || []).forEach((chain) => add(chain, true));
  extra.forEach((fields) => add(fields, false));
  return [...joins.values()];
}

// The parts of a LIKE pattern: { text } (literal text) and { any: true } (%) or { one: true } (_).
function likeParts(pattern) {
  const parts = [];
  let text = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\' && i + 1 < pattern.length) {
      i += 1;
      text += pattern[i];
    } else if (char === '%' || char === '_') {
      if (text) parts.push({ text });
      text = '';
      parts.push(char === '%' ? { any: true } : { one: true });
    } else text += char;
  }
  if (text) parts.push({ text });
  return parts;
}

// The source of a regular expression that matches what a LIKE pattern matches.
function likeToRegex(pattern) {
  const source = likeParts(pattern)
    .map((part) => {
      if (part.any) return '[\\s\\S]*';
      if (part.one) return '[\\s\\S]';
      return part.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return `^${source}$`;
}

module.exports = {
  LOOKUPS,
  datePartOf,
  truncOf,
  Extract,
  Trunc,
  resolveDateValue,
  expandPkOrder,
  Raw,
  likeParts,
  likeToRegex,
  Q,
  JsonPath,
  jsonPath,
  and,
  or,
  not,
  F,
  Aggregate,
  Count,
  Sum,
  Avg,
  Min,
  Max,
  SEPARATOR,
  resolvePath,
  resolveWhere,
  resolveOrder,
  resolveAggregate,
  resolveF,
  combine,
  pathKey,
  eachLeaf,
  eachExists,
  hasExists,
  collectJoins,
  lastOf,
};
