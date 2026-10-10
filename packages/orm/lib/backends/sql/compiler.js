// Compiles the descriptions of queries (lib/query.js) to SQL with parameters, in a dialect. The foreign keys a query
// follows are LEFT JOINs (t1, t2... after t0, the table of the model); conditions under NOT are made two-valued with
// COALESCE, so that NULL is false as in MongoDB and JavaScript; NULLs sort first.
import { collectJoins, pathKey, lastOf, hasExists } from '../../query.js';
import { specOf } from '../../schema.js';
import { STATE, State, defineState, tableKey } from '../../meta.js';

const OPERATORS = { exact: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const FUNCTIONS = { count: 'COUNT', sum: 'SUM', avg: 'AVG', min: 'MIN', max: 'MAX' };
const MAX_PARAMS = 30000;
// Decoders of sets of columns kept (beyond, they are forgotten and compiled again).
const MAX_DECODERS = 1000;
// Compiled queries kept for every model (beyond, they are forgotten and compiled again).
const MAX_PLANS = 500;
// The field of values inside json values (decoded by the jsonValue decoders).
const JSON_VALUE = { dbType: 'jsonValue' };
// The field of values of fragments of SQL (given as the driver gives them).
const RAW_VALUE = { dbType: 'raw' };
// The field of numbers of dates (Extract).
const INTEGER_VALUE = { dbType: 'integer' };

// The SQL of a value of values(): its column, or a number (Extract) or a start (Trunc) of a date of it.
function dateValueSql(dialect, sql, item) {
  if (item.part) return dialect.datePart(sql, item.part, lastOf(item.fields).dbType);
  if (item.trunc) return dialect.dateTrunc(sql, item.trunc, lastOf(item.fields).dbType);
  return sql;
}
const TABLE_MARKER = '\u0000table\u0000';
// The OFFSET from which a page asks for its keys first (deferrable()).
const DEFER_FROM = 100;
const TEXT_LOOKUPS = new Set(['contains', 'startswith', 'endswith', 'icontains', 'istartswith', 'iendswith']);

// A number for every object used in the keys of compiled queries (models, relations of EXISTS conditions).
const ids = new WeakMap();
let nextId = 1;
function idOf(object) {
  let id = ids.get(object);
  if (id === undefined) {
    id = nextId;
    nextId += 1;
    ids.set(object, id);
  }
  return id;
}

// The shape of a condition: what its SQL depends on (its fields, lookups and nodes, and the values that change the
// SQL: isnull, the length of in, an empty string), with its leaves in the order they are compiled. Null when it
// cannot be cached (F expressions).
function shapeOf(node, leaves) {
  if (!node) return '';
  if (node.op === 'and' || node.op === 'or' || node.op === 'not') {
    let shape = `${node.op}(`;
    for (let i = 0; i < node.children.length; i += 1) {
      const child = shapeOf(node.children[i], leaves);
      if (child === null) return null;
      shape += `${child},`;
    }
    return `${shape})`;
  }
  if (node.op === 'raw') {
    leaves.push(node);
    return `R${JSON.stringify(node.sql)}:${node.params.length}`;
  }
  if (node.op === 'exists') {
    const where = shapeOf(node.where, leaves);
    return where === null ? null : `E${pathKey(node.through)}/${idOf(node.relation)}(${where})`;
  }
  const { lookup, value } = node;
  if (value !== null && typeof value === 'object' && value.kind === 'F') return null;
  leaves.push(node);
  let extra = '';
  if (lookup === 'isnull') extra = value ? '1' : '0';
  else if (lookup === 'in') extra = String(value.length);
  else if (TEXT_LOOKUPS.has(lookup) && value === '') extra = 'e';
  if (node.path) {
    const sample = Array.isArray(value) ? value.find((item) => item !== null) : value;
    extra += `>${JSON.stringify(node.path)}:${typeof sample}`;
  }
  if (node.part) extra += `#${node.part}`;
  return `${pathKey(node.fields)}~${lookup}${extra}`;
}

// Compiles the decoder of the columns of a select: an object literal for the row, with one for every relation
// loaded (null when its key is null), whose values are those of the driver passed through the decoder of their type.
function compileDecoder(dialect, columns, related) {
  const decoders = [];
  const root = { entries: [], children: new Map() };
  columns.forEach((column, i) => {
    let node = root;
    column.path.forEach((step) => {
      if (!node.children.has(step)) {
        const child = { entries: [], children: new Map() };
        node.children.set(step, child);
        node.entries.push({ key: step, node: child });
      }
      node = node.children.get(step);
    });
    const decode = dialect.decoderOf(column.field);
    let value = `row.c${i}`;
    if (decode) {
      decoders.push(decode);
      value = `d${decoders.length - 1}(${value})`;
    }
    node.entries.push({ key: column.key, value });
  });
  // The primary key of each relation, by its path: a relation whose key is null was not found.
  const pks = new Map(
    related.map((chain) => [chain.map((field) => `$${field.name}`).join('.'), lastOf(chain).targetField.attname])
  );
  const lines = [];
  let count = 0;
  // Each relation is a variable, made before the object that has it.
  const build = (node, path) => {
    const fields = node.entries.map((entry) => {
      if (!entry.node) return `${JSON.stringify(entry.key)}: ${entry.value}`;
      const name = `r${count}`;
      count += 1;
      const childPath = path ? `${path}.${entry.key}` : entry.key;
      const object = build(entry.node, childPath);
      const pk = JSON.stringify(pks.get(childPath));
      lines.push(`let ${name} = ${object};`, `if (${name}[${pk}] === null) ${name} = null;`);
      return `${JSON.stringify(entry.key)}: ${name}`;
    });
    return `{ ${fields.join(', ')} }`;
  };
  const object = build(root, '');
  const params = decoders.map((_, i) => `d${i}`);
  const body = `return function decode(row) {${lines.join(' ')} return ${object}; };`;
  // eslint-disable-next-line no-new-func
  return new Function(...params, body)(...decoders);
}

// Compiles the function that makes an object of the model from a row of the driver: a constructor for the model, and
// one for every relation loaded (with the prototype of its model), sets the fields of their columns; each relation
// whose key is not null is made and set on the object that has it.
function compileMaker(dialect, model, columns, related) {
  const decoders = [];
  const chains = new Map(related.map((chain) => [chain.map((field) => `$${field.name}`).join('.'), chain]));
  const root = { model, name: null, assignments: [], pk: null, children: [] };
  const nodes = new Map([['', root]]);
  columns.forEach((column, i) => {
    const path = column.path.join('.');
    let node = nodes.get(path);
    if (!node) {
      const field = lastOf(chains.get(path));
      node = { model: field.target, name: field.name, assignments: [], pk: null, children: [] };
      nodes.set(path, node);
      nodes.get(column.path.slice(0, -1).join('.')).children.push(node);
    }
    const decode = dialect.decoderOf(column.field);
    let value = `row.c${i}`;
    if (decode) {
      decoders.push(decode);
      value = `d${decoders.length - 1}(${value})`;
    }
    node.assignments.push(`this[${JSON.stringify(column.key)}] = ${value};`);
    if (node.model.meta.pk && column.key === node.model.meta.pk.attname) node.pk = i;
  });
  const all = [...nodes.values()];
  const constructors = all.map(
    (node, j) =>
      `function I${j}(row, db) { defineState(this, new State(false, db)); ${node.assignments.join(' ')} } ` +
      `I${j}.prototype = models[${j}].prototype;`
  );
  // The relations of a node, made when their keys are not null.
  const attach = (node, name) =>
    node.children
      .map((child) => {
        const j = all.indexOf(child);
        return (
          `if (row.c${child.pk} !== null) { const o${j} = new I${j}(row, db); ` +
          `${name}[STATE].related.set(${JSON.stringify(child.name)}, o${j}); ${attach(child, `o${j}`)} }`
        );
      })
      .join(' ');
  const body =
    `${constructors.join(' ')} ` +
    `return function make(row, db) { const o0 = new I0(row, db); ${attach(root, 'o0')} return o0; };`;
  const params = ['models', 'State', 'defineState', 'STATE', ...decoders.map((_, i) => `d${i}`)];
  // eslint-disable-next-line no-new-func
  return new Function(...params, body)(
    all.map((node) => node.model),
    State,
    defineState,
    STATE,
    ...decoders
  );
}

const ON_DELETE_SQL = { cascade: 'CASCADE', setNull: 'SET NULL', restrict: 'RESTRICT', noAction: 'NO ACTION' };

// The ON DELETE and ON UPDATE of a foreign key, when it has them.
function onDeleteOf(references) {
  const deferrable = references.deferrable ? ` ${references.deferrable}` : '';
  const onDelete = references.onDelete ? ` ON DELETE ${ON_DELETE_SQL[references.onDelete]}` : '';
  const onUpdate = references.onUpdate ? ` ON UPDATE ${ON_DELETE_SQL[references.onUpdate]}` : '';
  return `${onDelete}${onUpdate}${deferrable}`;
}

// A value of the database as the value of a field (encrypted fields decrypt it).
function decodeField(dialect, field, value) {
  if (field.encrypted) return field.open(value);
  const decoded = dialect.decode(field.dbType, value);
  return field.fromDb ? field.fromDb(decoded) : decoded;
}

class Context {
  // `prefix` names the aliases of a subquery (s1_t0...), so they are not those of the query around it; a subquery
  // shares the parameters of its query.
  // `sources` are where the parameters come from ({ node, kind, k }, or null when they cannot be made again): a
  // compiled query makes its parameters with them from another query of its shape.
  constructor(dialect, meta, aliased, prefix = '', params = [], sources = []) {
    this.dialect = dialect;
    this.meta = meta;
    this.aliased = aliased;
    this.prefix = prefix;
    this.params = params;
    this.sources = sources;
    this.joins = new Map();
    this.subqueries = 0;
  }

  subquery(meta) {
    this.subqueries += 1;
    return new Context(this.dialect, meta, true, `${this.prefix}s${this.subqueries}_`, this.params, this.sources);
  }

  param(value, source = null) {
    this.params.push(value);
    this.sources.push(source);
    return this.dialect.placeholder(this.params.length);
  }

  // The parameters of limit and offset (limit first, when there is one).
  limitParam(query) {
    let count = 0;
    return (value) => {
      const kind = count === 0 && query.limit !== null ? 'limit' : 'offset';
      count += 1;
      return this.param(value, { kind });
    };
  }

  // The alias of the table reached by following a chain of foreign keys, joined the first time.
  alias(chain) {
    if (chain.length === 0) return `${this.prefix}t0`;
    const key = pathKey(chain);
    let join = this.joins.get(key);
    if (!join) {
      const parent = this.alias(chain.slice(0, -1));
      const field = lastOf(chain);
      const alias = `${this.prefix}t${this.joins.size + 1}`;
      const { quote } = this.dialect;
      if (field.reverse) {
        // A reverse relation: the rows of the other model whose foreign key points to the row (aggregates).
        const key = field.reverse;
        join =
          ` LEFT JOIN ${this.dialect.quoteTable(key.model.meta.table, key.model.meta.schema)} AS ${alias}` +
          ` ON ${alias}.${quote(key.column)} = ${parent}.${quote(key.targetField.column)}`;
      } else {
        const target = field.target.meta;
        join =
          ` LEFT JOIN ${this.dialect.quoteTable(target.table, target.schema)} AS ${alias}` +
          ` ON ${alias}.${quote(field.targetField.column)} = ${parent}.${quote(field.column)}`;
      }
      join = { alias, sql: join };
      this.joins.set(key, join);
    }
    return join.alias;
  }

  column(fields) {
    const field = lastOf(fields);
    const column = this.dialect.quote(field.column);
    // Without aliases (UPDATE, DELETE), columns are qualified with the table: subqueries can refer to them.
    if (!this.aliased) return `${this.dialect.quoteTable(this.meta.table, this.meta.schema)}.${column}`;
    return `${this.alias(fields.slice(0, -1))}.${column}`;
  }

  from() {
    const table = this.dialect.quoteTable(this.meta.table, this.meta.schema);
    if (!this.aliased) return table;
    return `${table} AS ${this.prefix}t0${[...this.joins.values()].map((join) => join.sql).join('')}`;
  }
}

class SqlCompiler {
  constructor(dialect) {
    this.dialect = dialect;
    // The decoders of the rows of selects: of every field of a model (by its meta), and of other sets of columns.
    this.plainDecoders = new WeakMap();
    this.decoders = new Map();
    // The same for the functions that make the objects of models from the rows.
    this.plainMakers = new WeakMap();
    this.makers = new Map();
    // Compiled queries by model and shape: { sql, plan, decode, make }.
    this.plans = new WeakMap();
    // The INSERTs of one row by model and columns: { sql, fields }.
    this.inserts = new WeakMap();
  }

  // The compiled query of a key for a model, or undefined.
  plan(meta, key) {
    const plans = this.plans.get(meta);
    return plans && plans.get(key);
  }

  // Keeps a compiled query, with the sources of its parameters as indexes of the leaves of its shape; not when a
  // parameter cannot be made again.
  keep(meta, key, leaves, ctx, compiled) {
    const indexes = new Map(leaves.map((leaf, i) => [leaf, i]));
    const plan = [];
    for (let i = 0; i < ctx.sources.length; i += 1) {
      const source = ctx.sources[i];
      if (source === null) return;
      if (source.node) {
        const leaf = indexes.get(source.node);
        if (leaf === undefined) return;
        plan.push({ kind: source.kind, leaf, k: source.k });
      } else plan.push({ kind: source.kind });
    }
    let plans = this.plans.get(meta);
    if (!plans) {
      plans = new Map();
      this.plans.set(meta, plans);
    }
    if (plans.size >= MAX_PLANS) plans.clear();
    plans.set(key, { ...compiled, plan });
  }

  // The parameters of a compiled query for the leaves of a query of its shape.
  paramsOf(plan, leaves, query) {
    const params = new Array(plan.length);
    for (let i = 0; i < plan.length; i += 1) {
      const { kind, leaf, k } = plan[i];
      if (kind === 'limit') params[i] = query.limit;
      else if (kind === 'offset') params[i] = query.offset;
      else {
        const node = leaves[leaf];
        if (kind === 'raw') params[i] = node.value;
        else if (kind === 'fragment') params[i] = node.params[k];
        else if (kind === 'json') params[i] = this.dialect.jsonParam(k === undefined ? node.value : node.value[k]);
        else if (kind === 'like') params[i] = this.dialect.likePattern(node.value);
        else if (kind === 'number') params[i] = k === undefined ? node.value : node.value[k];
        else if (kind === 'item') params[i] = this.encode(lastOf(node.fields), node.value[k]);
        else params[i] = this.encode(lastOf(node.fields), node.value);
      }
    }
    return params;
  }

  // The key of a query (select or count), with the leaves of its conditions; null when it is not cached.
  keyOf(kind, query, leaves) {
    const where = shapeOf(query.where, leaves);
    if (where === null) return null;
    const lock = query.lock ? JSON.stringify(query.lock) : '';
    let key = `${kind}|${query.limit !== null ? 'L' : ''}${query.offset ? 'O' : ''}${lock}|${where}|`;
    const { orderBy } = query;
    for (let i = 0; i < orderBy.length; i += 1) {
      // Fragments with parameters are not kept (their parameters are not those of conditions).
      if (orderBy[i].raw) {
        if (orderBy[i].params.length) return null;
        key += `R${JSON.stringify(orderBy[i].raw)},`;
        continue;
      }
      const json = orderBy[i].jsonPath ? `>${JSON.stringify(orderBy[i].jsonPath)}` : '';
      const date = orderBy[i].part ? `#${orderBy[i].part}` : orderBy[i].trunc ? `%${orderBy[i].trunc}` : '';
      key += `${orderBy[i].desc ? '-' : ''}${pathKey(orderBy[i].fields)}${json}${date},`;
    }
    if (kind !== 'select') return key;
    if (query.values) {
      if (query.values.some((item) => item.raw && item.params.length)) return null;
      const values = query.values.map(
        (item) =>
          `${item.key}=${item.raw ? `R${JSON.stringify(item.raw)}` : pathKey(item.fields)}${item.part ? `#${item.part}` : ''}${item.trunc ? `%${item.trunc}` : ''}`
      );
      return `${key}|v:${values.join(',')}`;
    }
    if (query.only) key += `|o:${query.only.map((field) => field.attname).join(',')}`;
    if (query.extra) {
      if (query.extra.some((item) => item.params.length)) return null;
      key += `|x:${query.extra.map((item) => `${item.key}=${JSON.stringify(item.raw)}`).join(',')}`;
    }
    if (query.related.length) key += `|r:${query.related.map(pathKey).join(',')}`;
    if (query.per) key += `|p:${query.per.fields.map(pathKey).join(',')}:${query.per.limit}:${query.per.offset}`;
    return key;
  }

  encode(field, value) {
    // Encrypted fields: the text of their values.
    if (field.encrypted) return field.seal(value);
    // Arrays of PostgreSQL: their items as their field (hstore, json...), the array as the driver writes it.
    if (field.dbType === 'array' && field.base && this.dialect.encodesArrayItems && Array.isArray(value)) {
      return value.map((item) => (item === null || item === undefined ? null : this.encode(field.base, item)));
    }
    return this.dialect.encode(field.dbType, value);
  }

  // `source`: where the parameter of the value comes from (a leaf of a condition); none for the operands of F.
  expression(ctx, value, field, source = null) {
    if (value && value.kind === 'F') {
      let sql = ctx.column(value.fields);
      value.ops.forEach(({ op, value: operand }) => {
        sql = `(${sql} ${op} ${this.expression(ctx, operand, field)})`;
      });
      return sql;
    }
    return ctx.param(field ? this.encode(field, value) : value, source);
  }

  where(ctx, node) {
    if (!node) return '';
    if (node.op === 'and' || node.op === 'or') {
      const parts = node.children.map((child) => this.where(ctx, child));
      return `(${parts.join(node.op === 'and' ? ' AND ' : ' OR ')})`;
    }
    if (node.op === 'not') return `NOT COALESCE(${this.where(ctx, node.children[0])}, ${this.dialect.false})`;
    if (node.op === 'exists') return this.exists(ctx, node);
    if (node.op === 'raw')
      return `(${this.fragment(ctx, node.sql, node.params, (k) => ({ node, kind: 'fragment', k }))})`;
    return this.leaf(ctx, node);
  }

  // A fragment of SQL: its ? are parameters (outside quotes), and Raw.TABLE the table of the model in the query.
  fragment(ctx, sql, params, sourceOf = () => null) {
    let index = 0;
    let out = '';
    let quote = null;
    for (let i = 0; i < sql.length; i += 1) {
      const char = sql[i];
      if (quote) {
        out += char;
        if (char === quote) quote = null;
      } else if (char === "'" || char === '"') {
        quote = char;
        out += char;
      } else if (char === '?' && index < params.length) {
        out += ctx.param(params[index], sourceOf(index));
        index += 1;
      } else out += char;
    }
    const table = ctx.aliased ? `${ctx.prefix}t0` : this.dialect.quoteTable(ctx.meta.table, ctx.meta.schema);
    return out.split(TABLE_MARKER).join(table);
  }

  // EXISTS (SELECT 1 FROM the related table WHERE its foreign key is the key of the object AND its conditions).
  exists(ctx, { through, relation, where }) {
    const owner = ctx.column([...through, relation.targetField]);
    const sub = ctx.subquery(relation.model.meta);
    const condition = this.where(sub, where);
    const link = `${sub.column([relation])} = ${owner}`;
    return `EXISTS (SELECT 1 FROM ${sub.from()} WHERE ${link}${condition ? ` AND ${condition}` : ''})`;
  }

  // A condition on a value inside json values (node.path).
  jsonLeaf(ctx, node) {
    const { fields, lookup, value, path } = node;
    const { dialect } = this;
    const base = ctx.column(fields);
    const sample = Array.isArray(value) ? value.find((item) => item !== null) : value;
    const textual = TEXT_LOOKUPS.has(lookup) || ['iexact', 'like', 'ilike', 'regex', 'iregex'].includes(lookup);
    const column = dialect.jsonPath(base, path, textual || lookup === 'isnull' ? 'string' : typeof sample);
    const param = (item, k) => ctx.param(dialect.jsonParam(item), { node, kind: 'json', k });
    switch (lookup) {
      case 'isnull':
        return `${column} IS ${value ? '' : 'NOT '}NULL`;
      case 'exact':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return `${column} ${OPERATORS[lookup]} ${param(value)}`;
      case 'in':
        if (value.length === 0) return dialect.false;
        return `${column} IN (${value.map((item, k) => param(item, k)).join(', ')})`;
      case 'range':
        return `${column} BETWEEN ${param(value[0], 0)} AND ${param(value[1], 1)}`;
      default:
        return this.textLeaf(ctx, node, column);
    }
  }

  // A condition on a part of a date: the number the dialect takes out of the column (NULL for no date).
  partLeaf(ctx, node) {
    const { fields, part, lookup, value } = node;
    const column = this.dialect.datePart(ctx.column(fields), part, lastOf(fields).dbType);
    const param = (k) => ctx.param(k === undefined ? value : value[k], { node, kind: 'number', k });
    switch (lookup) {
      case 'exact':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        return `${column} ${OPERATORS[lookup]} ${param()}`;
      case 'in':
        if (value.length === 0) return this.dialect.false;
        return `${column} IN (${value.map((item, k) => param(k)).join(', ')})`;
      case 'range':
        return `${column} BETWEEN ${param(0)} AND ${param(1)}`;
      default:
        throw new Error(`Unknown lookup ${lookup} of a part of a date`);
    }
  }

  leaf(ctx, node) {
    if (node.path) return this.jsonLeaf(ctx, node);
    if (node.part) return this.partLeaf(ctx, node);
    const { fields, lookup, value } = node;
    const { dialect } = this;
    const field = lastOf(fields);
    const column = ctx.column(fields);
    switch (lookup) {
      case 'exact':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte':
        // NULL compared with anything is NULL: false here, and under NOT made false by COALESCE.
        return `${column} ${OPERATORS[lookup]} ${this.expression(ctx, value, field, { node, kind: 'value' })}`;
      case 'isnull':
        return `${column} IS ${value ? '' : 'NOT '}NULL`;
      case 'in':
        if (value.length === 0) return dialect.false;
        return `${column} IN (${value
          .map((item, k) => ctx.param(this.encode(field, item), { node, kind: 'item', k }))
          .join(', ')})`;
      case 'range': {
        const low = ctx.param(this.encode(field, value[0]), { node, kind: 'item', k: 0 });
        const high = ctx.param(this.encode(field, value[1]), { node, kind: 'item', k: 1 });
        return `${column} BETWEEN ${low} AND ${high}`;
      }
      default:
        return this.textLeaf(ctx, node, column);
    }
  }

  // The lookups of text (of a column, or of a value inside json values).
  textLeaf(ctx, node, column) {
    const { lookup, value } = node;
    const { dialect } = this;
    const text = () => dialect.textParam(ctx.param(value, { node, kind: 'raw' }));
    const lowerText = () => dialect.lower(text());
    switch (lookup) {
      case 'iexact':
        return `${dialect.lower(column)} = ${lowerText()}`;
      case 'regex':
      case 'iregex':
        return dialect.regex(column, () => ctx.param(value, { node, kind: 'raw' }), lookup === 'iregex');
      case 'like':
      case 'ilike':
        return dialect.like(
          column,
          () => ctx.param(dialect.likePattern(value), { node, kind: 'like' }),
          lookup === 'ilike'
        );
      case 'contains':
      case 'startswith':
      case 'endswith':
      case 'icontains':
      case 'istartswith':
      case 'iendswith': {
        // Every string contains, starts and ends with the empty one.
        if (value === '') return `${column} IS NOT NULL`;
        const insensitive = lookup.startsWith('i');
        const target = insensitive ? dialect.lower(column) : column;
        const param = insensitive ? lowerText : text;
        if (lookup.endsWith('contains')) return dialect.contains(target, param);
        if (lookup.endsWith('startswith')) return dialect.startsWith(target, param);
        return dialect.endsWith(target, param);
      }
      default:
        throw new Error(`Unknown lookup ${lookup}`);
    }
  }

  orderBy(ctx, orderBy) {
    if (!orderBy || orderBy.length === 0) return '';
    const items = orderBy.map((item) => {
      const { fields, desc, jsonPath, raw, params } = item;
      if (raw) return this.fragment(ctx, raw, params);
      const column = jsonPath
        ? this.dialect.jsonPath(ctx.column(fields), jsonPath, 'string')
        : dateValueSql(this.dialect, ctx.column(fields), item);
      // NULLs first going up, last going down, on every backend. A column of the table that can't be NULL needs no
      // NULLS: so an index on it (made ASC NULLS LAST by PostgreSQL) orders the rows, instead of a sort of them all.
      const notNull = fields.length === 1 && !jsonPath && !item.part && !item.trunc && !lastOf(fields).null;
      if (notNull) return `${column} ${desc ? 'DESC' : 'ASC'}`;
      return `${column} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
    });
    return ` ORDER BY ${items.join(', ')}`;
  }

  // SELECT: the columns are named c0, c1... and `decode` makes the rows of the backend from them.
  // Compiled once for every shape of query: then only its parameters are made.
  select(query) {
    const leaves = [];
    // A page far into the rows (OFFSET): its keys first, then its rows (see deferrable()); a shape of its own.
    const deferred = this.deferrable(query);
    let key = this.keyOf('select', query, leaves);
    if (key !== null && deferred) key += '|deferred';
    const kept = key === null ? undefined : this.plan(query.meta, key);
    if (kept) {
      return { sql: kept.sql, params: this.paramsOf(kept.plan, leaves, query), decode: kept.decode, make: kept.make };
    }
    const { dialect } = this;
    const ctx = new Context(dialect, query.meta, true);
    const columns = [];
    if (query.values) {
      query.values.forEach(({ key, fields, jsonPath, raw, params, part, trunc }) =>
        columns.push({
          key,
          path: [],
          field: raw ? RAW_VALUE : jsonPath ? JSON_VALUE : part ? INTEGER_VALUE : lastOf(fields),
          fields,
          jsonPath,
          raw,
          params,
          part,
          trunc,
        })
      );
    } else {
      (query.only || query.meta.fields).forEach((field) =>
        columns.push({ key: field.attname, path: [], field, fields: [field] })
      );
      (query.extra || []).forEach(({ key, raw, params }) =>
        columns.push({ key, path: [], field: RAW_VALUE, fields: [], raw, params })
      );
      query.related.forEach((chain) => {
        const path = chain.map((field) => `$${field.name}`);
        lastOf(chain).target.meta.fields.forEach((field) =>
          columns.push({ key: field.attname, path, field, fields: [...chain, field] })
        );
      });
    }
    const select = columns
      .map((column, i) => {
        if (column.raw) return `(${this.fragment(ctx, column.raw, column.params)}) AS c${i}`;
        const sql = dateValueSql(dialect, ctx.column(column.fields), column);
        return `${column.jsonPath ? dialect.jsonValue(sql, column.jsonPath) : sql} AS c${i}`;
      })
      .join(', ');
    let sql;
    if (query.per) sql = this.selectPer(ctx, query, select, columns.length);
    else if (deferred) {
      // The keys of the page (an index of the order skips the rows before it without reading them: with the keys in
      // it, INCLUDE, not even the table), then the rows of those keys with their relations, in the same order.
      const sub = ctx.subquery(query.meta);
      const pk = [query.meta.pk];
      const where = this.where(sub, query.where);
      const innerOrder = this.orderBy(sub, query.orderBy);
      const limit = dialect.limit(query.limit, query.offset, sub.limitParam(query));
      const inner = `SELECT ${sub.column(pk)} FROM ${sub.from()}${where ? ` WHERE ${where}` : ''}${innerOrder}${limit}`;
      const order = this.orderBy(ctx, query.orderBy);
      sql = `SELECT ${select} FROM ${ctx.from()} WHERE ${ctx.column(pk)} IN (${inner})${order}`;
    } else {
      const where = this.where(ctx, query.where);
      const order = this.orderBy(ctx, query.orderBy);
      const limit = dialect.limit(query.limit, query.offset, ctx.limitParam(query));
      const lock = query.lock ? dialect.lock(query.lock) : '';
      sql = `SELECT ${select} FROM ${ctx.from()}${where ? ` WHERE ${where}` : ''}${order}${limit}${lock}`;
    }
    const make = query.values ? null : this.maker(query, columns);
    const compiled = { sql, decode: this.decoder(query, columns), make };
    if (key !== null) this.keep(query.meta, key, leaves, ctx, compiled);
    return { ...compiled, params: ctx.params };
  }

  // Whether a select pages far (OFFSET of DEFER_FROM rows or more, with a limit) by columns of its model: PostgreSQL
  // reads and leaves every row before the page (and joins their relations); asking for the keys of the page first lets
  // it skip them in an index of the order.
  deferrable(query) {
    if (this.dialect.name !== 'postgres') return false;
    if (query.per || query.values || query.lock || query.limit === null || !(query.offset >= DEFER_FROM)) return false;
    const { pk } = query.meta;
    if (!pk || pk.composite) return false;
    return (query.orderBy || []).every(
      (item) => !item.raw && !item.jsonPath && !item.part && !item.trunc && item.fields && item.fields.length === 1
    );
  }

  // limitPer(): the rows numbered in their groups (ROW_NUMBER() OVER (PARTITION BY ...)) by a subquery, and those of
  // the numbers asked. The values of the order are selected too (o0, o1...) to order the rows outside; with fragments
  // in the order, the rows are ordered by their numbers only (the order inside every group).
  selectPer(ctx, query, select, count) {
    const { dialect } = this;
    const { per } = query;
    const partition = per.fields.map((fields) => ctx.column(fields)).join(', ');
    const order = this.orderBy(ctx, query.orderBy);
    const plain = query.orderBy.every((item) => !item.raw);
    const orderColumns = plain
      ? query.orderBy.map((item, i) => {
          const { fields, jsonPath } = item;
          const column = jsonPath
            ? dialect.jsonPath(ctx.column(fields), jsonPath, 'string')
            : dateValueSql(dialect, ctx.column(fields), item);
          return `, ${column} AS o${i}`;
        })
      : [];
    const where = this.where(ctx, query.where);
    const inner =
      `SELECT ${select}${orderColumns.join('')}, ROW_NUMBER() OVER (PARTITION BY ${partition}${order}) AS xufa_rn ` +
      `FROM ${ctx.from()}${where ? ` WHERE ${where}` : ''}`;
    const names = Array.from({ length: count }, (_, i) => `c${i}`).join(', ');
    const outerOrder = plain
      ? query.orderBy.map(({ desc }, i) => `o${i} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`)
      : [];
    outerOrder.push('xufa_rn');
    const limit = dialect.limit(query.limit, query.offset, ctx.limitParam(query));
    return (
      `SELECT ${names} FROM (${inner}) AS xufa_per WHERE xufa_rn > ${per.offset} AND xufa_rn <= ` +
      `${per.offset + per.limit} ORDER BY ${outerOrder.join(', ')}${limit}`
    );
  }

  // The function that makes the objects of the model (and of the relations loaded) from the rows of the driver,
  // compiled once for every set of columns, as decoders.
  maker(query, columns) {
    const plain = !query.only && !query.extra && query.related.length === 0;
    let key;
    if (plain) {
      const maker = this.plainMakers.get(query.meta);
      if (maker) return maker;
    } else {
      key = `${idOf(query.meta)}|${columns.map((column) => `${column.path.join('.')}.${column.key}`).join(',')}`;
      const maker = this.makers.get(key);
      if (maker) return maker;
    }
    const maker = compileMaker(this.dialect, query.meta.model, columns, query.related);
    if (plain) this.plainMakers.set(query.meta, maker);
    else {
      if (this.makers.size >= MAX_DECODERS) this.makers.clear();
      this.makers.set(key, maker);
    }
    return maker;
  }

  // The function that makes the rows of the backend (values by attname, relations under $<name>) from those of the
  // driver (c0, c1...): compiled once for every set of columns, and kept.
  decoder(query, columns) {
    // The columns of every field of the model (the most common query) are known by its meta.
    const plain = !query.values && !query.only && !query.extra && query.related.length === 0;
    let key;
    if (plain) {
      const decoder = this.plainDecoders.get(query.meta);
      if (decoder) return decoder;
    } else {
      key = columns.map((column) => `${column.path.join('.')}.${column.key}:${column.field.dbType}`).join(',');
      const decoder = this.decoders.get(key);
      if (decoder) return decoder;
    }
    const decoder = compileDecoder(this.dialect, columns, query.values ? [] : query.related);
    if (plain) this.plainDecoders.set(query.meta, decoder);
    else {
      if (this.decoders.size >= MAX_DECODERS) this.decoders.clear();
      this.decoders.set(key, decoder);
    }
    return decoder;
  }

  count(query) {
    const leaves = [];
    const key = this.keyOf('count', query, leaves);
    const kept = key === null ? undefined : this.plan(query.meta, key);
    if (kept) return { sql: kept.sql, params: this.paramsOf(kept.plan, leaves, query) };
    const ctx = new Context(this.dialect, query.meta, true);
    const where = this.where(ctx, query.where);
    let sql;
    if (query.limit === null && !query.offset) {
      sql = `SELECT COUNT(*) AS n FROM ${ctx.from()}${where ? ` WHERE ${where}` : ''}`;
    } else {
      const pk = ctx.column([query.meta.pkFields[0] || query.meta.fields[0]]);
      const limit = this.dialect.limit(query.limit, query.offset, ctx.limitParam(query));
      const inner = `SELECT ${pk} FROM ${ctx.from()}${where ? ` WHERE ${where}` : ''}${limit}`;
      sql = `SELECT COUNT(*) AS n FROM (${inner}) AS sub`;
    }
    if (key !== null) this.keep(query.meta, key, leaves, ctx, { sql });
    return { sql, params: ctx.params };
  }

  aggregate(query, aggregates, groupBy) {
    const { dialect } = this;
    const ctx = new Context(dialect, query.meta, true);
    const groups = (groupBy || []).map((item) => ({
      ...item,
      sql: dateValueSql(dialect, ctx.column(item.fields), item),
    }));
    const select = [
      ...groups.map((item, i) => `${item.sql} AS g${i}`),
      ...aggregates.map((item, i) => {
        if (item.fn === 'raw') return `(${this.fragment(ctx, item.raw, item.params)}) AS a${i}`;
        const fn = FUNCTIONS[item.fn];
        if (!item.fields) return `COUNT(*) AS a${i}`;
        return `${fn}(${item.distinct ? 'DISTINCT ' : ''}${ctx.column(item.fields)}) AS a${i}`;
      }),
    ];
    const where = this.where(ctx, query.where);
    let sql = `SELECT ${select.join(', ')} FROM ${ctx.from()}${where ? ` WHERE ${where}` : ''}`;
    if (groups.length) sql += ` GROUP BY ${groups.map((item) => item.sql).join(', ')}`;
    if (query.groupOrder && query.groupOrder.length) {
      const items = query.groupOrder.map(({ key, desc }) => {
        const group = groups.findIndex((item) => item.key === key);
        const name = group === -1 ? `a${aggregates.findIndex((item) => item.key === key)}` : `g${group}`;
        return `${name} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
      });
      sql += ` ORDER BY ${items.join(', ')}`;
    }
    sql += dialect.limit(query.limit, query.offset, (value) => ctx.param(value));
    const decode = (row) => {
      const result = {};
      groups.forEach((item, i) => {
        const value = row[`g${i}`];
        if (item.part) result[item.key] = value === null || value === undefined ? null : Number(value);
        else result[item.key] = decodeField(dialect, lastOf(item.fields), value);
      });
      aggregates.forEach((item, i) => {
        const value = row[`a${i}`];
        if (item.fn === 'raw') result[item.key] = value === undefined ? null : value;
        else if (item.fn === 'count') result[item.key] = Number(value);
        else if (item.fn === 'sum' || item.fn === 'avg') result[item.key] = value === null ? null : Number(value);
        else result[item.key] = decodeField(dialect, lastOf(item.fields), value);
      });
      return result;
    };
    return { sql, params: ctx.params, decode };
  }

  // INSERTs of rows (by attname), as few as possible: one for every group of rows with the same columns, in chunks.
  // Each statement gives the primary keys (RETURNING), with the index of the row they belong to.
  // `conflict`: { fields, update } for rows that break a unique key: ignored (update null), or with the fields of
  // `update` set to the values given (ON CONFLICT of the fields, the primary key by default).
  insert(meta, rows, conflict = null) {
    if (rows.length === 1 && !conflict) {
      const one = this.insertOne(meta, rows[0]);
      if (one) return one;
    }
    const { quote } = this.dialect;
    // The key given back: the primary key (the first of its fields, when it is composite: its values are given); none
    // for a model without one.
    // Rows a conflict can leave out (ignored, or not updated): the columns of the conflict are given back too, so the
    // keys find their rows.
    const partial = Boolean(conflict && (!conflict.update || conflict.updateWhere));
    let matchBy = partial && meta.pk ? this.conflictTarget(meta, conflict) : [];
    // A conflict on any unique key (ignored rows): by the unique fields of one column.
    if (partial && meta.pk && matchBy.length === 0) {
      matchBy = meta.fields.filter((field) => field.unique && !field.primaryKey && field.column);
    }
    const returning = meta.pk
      ? ` RETURNING ${quote(meta.pkFields[0].column)} AS pk${matchBy.map((field, i) => `, ${quote(field.column)} AS m${i}`).join('')}`
      : '';
    const onConflict = conflict ? this.onConflict(meta, conflict) : '';
    const groups = new Map();
    rows.forEach((row, index) => {
      const key = Object.keys(row).join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(index);
    });
    const statements = [];
    groups.forEach((indexes) => {
      const fields = Object.keys(rows[indexes[0]]).map((attname) => meta.field(attname));
      const table = this.dialect.quoteTable(meta.table, meta.schema);
      if (fields.length === 0) {
        indexes.forEach((index) => {
          statements.push({
            sql: `INSERT INTO ${table} DEFAULT VALUES${onConflict}${returning}`,
            params: [],
            indexes: [index],
            ignore: partial,
            matchBy,
          });
        });
        return;
      }
      const columns = fields.map((field) => quote(field.column)).join(', ');
      const size = Math.max(1, Math.floor(MAX_PARAMS / fields.length));
      for (let start = 0; start < indexes.length; start += size) {
        const chunk = indexes.slice(start, start + size);
        const params = [];
        const ctx = new Context(this.dialect, meta, false);
        ctx.params = params;
        const tuples = chunk.map((index) => {
          const row = rows[index];
          const values = fields.map((field) => {
            const value = row[field.attname];
            // Raw values (Raw(sql, params)) are SQL of their own.
            if (value && value.kind === 'raw') return `(${this.fragment(ctx, value.sql, value.params)})`;
            params.push(this.encode(field, value));
            return this.dialect.placeholder(params.length);
          });
          return `(${values.join(', ')})`;
        });
        statements.push({
          sql: `INSERT INTO ${table} (${columns}) VALUES ${tuples.join(', ')}${onConflict}${returning}`,
          params,
          indexes: chunk,
          ignore: partial,
          matchBy,
        });
      }
    });
    return statements;
  }

  // The INSERT of one row (creates), compiled once for every set of columns of a model; none for rows with raw values.
  insertOne(meta, row) {
    const attnames = Object.keys(row);
    if (attnames.length === 0) return null;
    for (let i = 0; i < attnames.length; i += 1) {
      const value = row[attnames[i]];
      if (value && value.kind === 'raw') return null;
    }
    let byColumns = this.inserts.get(meta);
    if (!byColumns) {
      byColumns = new Map();
      this.inserts.set(meta, byColumns);
    }
    const key = attnames.join('\u0000');
    let compiled = byColumns.get(key);
    if (!compiled) {
      const { quote } = this.dialect;
      const fields = attnames.map((attname) => meta.field(attname));
      const table = this.dialect.quoteTable(meta.table, meta.schema);
      const columns = fields.map((field) => quote(field.column)).join(', ');
      const placeholders = fields.map((_, i) => this.dialect.placeholder(i + 1)).join(', ');
      const returning = meta.pk ? ` RETURNING ${quote(meta.pkFields[0].column)} AS pk` : '';
      compiled = { sql: `INSERT INTO ${table} (${columns}) VALUES (${placeholders})${returning}`, fields };
      if (byColumns.size >= MAX_PLANS) byColumns.clear();
      byColumns.set(key, compiled);
    }
    const { fields } = compiled;
    const params = new Array(fields.length);
    for (let i = 0; i < fields.length; i += 1) params[i] = this.encode(fields[i], row[fields[i].attname]);
    return [{ sql: compiled.sql, params, indexes: [0], ignore: false }];
  }

  // where: the SQL of the rows of the partial unique index of the conflict.
  // The fields of the unique key a conflict is on (none: any unique key).
  conflictTarget(meta, { fields, update }) {
    return fields && fields.length ? fields : update ? meta.pkFields : [];
  }

  // `updateWhere`: the SQL of the rows that are updated (the others are left as they are, and not given back).
  // `set`: fields set to SQL of their own ([{ field, sql }]: counters, CURRENT_TIMESTAMP...), with those of `update`.
  onConflict(meta, { fields, update, where, updateWhere, set: own = [] }) {
    const { quote } = this.dialect;
    const target = this.conflictTarget(meta, { fields, update });
    const columns = target.length
      ? ` (${target.map((field) => quote(field.column)).join(', ')})${where ? ` WHERE ${where}` : ''}`
      : '';
    if (!update) return ` ON CONFLICT${columns} DO NOTHING`;
    // With nothing to update, the row is left as it is (and still given back).
    const assignments = [
      ...update.map((field) => `${quote(field.column)} = excluded.${quote(field.column)}`),
      ...own.map(({ field, sql }) => `${quote(field.column)} = ${sql}`),
    ];
    if (assignments.length === 0) assignments.push(`${quote(target[0].column)} = excluded.${quote(target[0].column)}`);
    const set = assignments.join(', ');
    return ` ON CONFLICT${columns} DO UPDATE SET ${set}${updateWhere ? ` WHERE ${updateWhere}` : ''}`;
  }

  // The condition of an UPDATE or a DELETE: the primary key in a SELECT when the conditions follow relations.
  writeWhere(ctx, query) {
    if (!query.where) return '';
    if (collectJoins({ where: query.where }).length === 0 && !hasExists(query.where)) {
      return ` WHERE ${this.where(ctx, query.where)}`;
    }
    const inner = new Context(this.dialect, query.meta, true);
    inner.params = ctx.params;
    const where = this.where(inner, query.where);
    // The rows by their keys (a row value for a composite key); a model without a key has no way to them.
    if (!query.meta.pk) {
      throw new Error(`Updates and deletes of ${query.meta.name} (no primary key) cannot follow relations`);
    }
    const columns = query.meta.pkFields.map((field) => this.dialect.quote(field.column));
    const left = columns.length > 1 ? `(${columns.join(', ')})` : columns[0];
    const select = columns.map((column) => `t0.${column}`).join(', ');
    return ` WHERE ${left} IN (SELECT ${select} FROM ${inner.from()} WHERE ${where})`;
  }

  update(query, assignments) {
    const { quote } = this.dialect;
    const ctx = new Context(this.dialect, query.meta, false);
    const set = assignments.map(({ field, value }) => {
      if (value && value.kind === 'raw')
        return `${quote(field.column)} = (${this.fragment(ctx, value.sql, value.params)})`;
      return `${quote(field.column)} = ${this.expression(ctx, value, field)}`;
    });
    const sql = `UPDATE ${this.dialect.quoteTable(query.meta.table, query.meta.schema)} SET ${set.join(', ')}${this.writeWhere(ctx, query)}`;
    return { sql, params: ctx.params };
  }

  delete(query) {
    const ctx = new Context(this.dialect, query.meta, false);
    return {
      sql: `DELETE FROM ${this.dialect.quoteTable(query.meta.table, query.meta.schema)}${this.writeWhere(ctx, query)}`,
      params: ctx.params,
    };
  }

  // DDL from the schema of tables (schema.js), for sync() and migrations.

  // The type of a column in its table: in a STRICT table of SQLite, the one of INTEGER, REAL, TEXT and BLOB its
  // type is (by the rules of SQLite: INT, then CHAR, CLOB or TEXT, BLOB, then REAL, FLOA or DOUB; the rest is TEXT,
  // as dates, decimals and json are), with its collation.
  typeIn(owner, column) {
    const type = this.columnType(column);
    if (!owner.strict || this.dialect.name !== 'sqlite') return type;
    const upper = type.toUpperCase();
    const collation = /\sCOLLATE\s+\w+/i.exec(type);
    let strict = 'TEXT';
    if (upper.includes('INT')) strict = 'INTEGER';
    else if (/CHAR|CLOB|TEXT/.test(upper)) strict = 'TEXT';
    else if (upper.includes('BLOB')) strict = 'BLOB';
    else if (/REAL|FLOA|DOUB/.test(upper)) strict = 'REAL';
    return collation ? `${strict}${collation[0]}` : strict;
  }

  columnType(column) {
    const { dialect } = this;
    if (column.sqlType) return column.sqlType;
    if (column.type === 'geometry' && dialect.geometryType) return dialect.geometryType(column.geo || {});
    // Arrays: native ones of the type of their items (PostgreSQL), or the type of arrays of the dialect (json text).
    if (column.type === 'array' && dialect.arrayType) {
      return dialect.arrayType(this.columnType({ type: column.items || 'text', maxLength: column.itemLength }));
    }
    if (column.type === 'string' && dialect.stringType) return dialect.stringType(column.maxLength);
    if (column.type === 'decimal' && column.precision !== undefined) {
      return `NUMERIC(${column.precision}${column.scale !== undefined ? `, ${column.scale}` : ''})`;
    }
    return dialect.types[column.type];
  }

  // A literal of a value (the default of a column added): { now: true } is the time of the migration.
  literal(type, value) {
    const encoded = this.dialect.encode(type, value && value.now === true ? new Date() : value);
    if (encoded === null || encoded === undefined) return 'NULL';
    if (typeof encoded === 'boolean') return encoded ? 'TRUE' : 'FALSE';
    if (typeof encoded === 'number' || typeof encoded === 'bigint') return String(encoded);
    if (Array.isArray(encoded)) return `'${this.dialect.arrayLiteral(encoded).replace(/'/g, "''")}'`;
    if (encoded instanceof Date) return `'${encoded.toISOString()}'`;
    return `'${String(encoded).replace(/'/g, "''")}'`;
  }

  // A table ({ table, schema }: a spec, the references of a column...) quoted.
  table(ref) {
    return this.dialect.quoteTable(ref.table, ref.schema);
  }

  // The REFERENCES of a foreign key.
  referencesSql(references) {
    const { quote } = this.dialect;
    return `REFERENCES ${this.table(references)} (${quote(references.column)})${onDeleteOf(references)}`;
  }

  // The definition of a column of the table `owner` ({ table, schema }): its foreign key references a table in
  // `known` (keys of tables) or its own.
  // A column of the SQL type of its field (its sqlType, when it has one: for a key the database gives, the whole
  // definition) and its DEFAULT (its dbDefault, or the value given for the rows a migration adds it to).
  columnDefinition(owner, name, column, known, defaultValue) {
    const { quote } = this.dialect;
    // The columns of a composite primary key are columns (the key is a constraint of the table).
    if (column.primaryKey && !compositeOf(owner)) {
      if (column.type === 'id') return `${quote(name)} ${column.sqlType || this.dialect.autoPrimaryKey}`;
      // NOT NULL: SQLite lets primary keys that are not integers hold NULLs otherwise.
      return `${quote(name)} ${this.typeIn(owner, column)} NOT NULL PRIMARY KEY`;
    }
    let sql = `${quote(name)} ${this.typeIn(owner, column)}`;
    if (!column.null) sql += ' NOT NULL';
    const value = defaultValue !== undefined ? defaultValue : column.default;
    if (value !== undefined) sql += ` DEFAULT ${this.literal(column.type, value)}`;
    const { references } = column;
    const target = references && keyOf(references);
    if (references && (target === keyOf(owner) || known.has(target))) sql += ` ${this.referencesSql(references)}`;
    return sql;
  }

  createIndex(owner, index) {
    const { quote } = this.dialect;
    const lower = new Set(index.lower || []);
    // PostgreSQL: a column that can be NULL is indexed with its NULLs first, as the ORM orders (ASC NULLS FIRST, and
    // DESC NULLS LAST read backwards): its ORDER BY is then read from the index, not sorted (PostgreSQL's own order is
    // NULLs last). SQLite puts them first already.
    const nullsFirst = (column) =>
      this.dialect.name === 'postgres' && owner.columns && owner.columns[column] && owner.columns[column].null;
    const columns = index.columns
      .map((column) => {
        const sql = lower.has(column) ? `LOWER(${quote(column)})` : quote(column);
        return nullsFirst(column) ? `${sql} NULLS FIRST` : sql;
      })
      .join(', ');
    const where = index.condition ? ` WHERE ${index.condition}` : '';
    // INCLUDE: PostgreSQL (the others index the keys only).
    const include =
      index.include && index.include.length && this.dialect.name === 'postgres'
        ? ` INCLUDE (${index.include.map((column) => quote(column)).join(', ')})`
        : '';
    return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quote(index.name)} ON ${this.table(owner)} (${columns})${include}${where}`;
  }

  // CREATE TABLE and CREATE INDEX statements of the schema of a table. `known` are the keys of the tables its foreign
  // keys can reference. `name` makes it with another name (in the same schema).
  createTableSpec(spec, known, { ifNotExists = true, name = spec.table } = {}) {
    const columns = Object.entries(spec.columns).map(([column, columnSpec]) =>
      this.columnDefinition(spec, column, columnSpec, known)
    );
    const composite = compositeOf(spec);
    if (composite) columns.push(`PRIMARY KEY (${composite.map((column) => this.dialect.quote(column)).join(', ')})`);
    const options = this.dialect.tableOptions ? this.dialect.tableOptions(spec) : '';
    const exists = ifNotExists ? 'IF NOT EXISTS ' : '';
    return [
      `CREATE TABLE ${exists}${this.table({ table: name, schema: spec.schema })} (${columns.join(', ')})${options}`,
      ...spec.indexes.map((index) => this.createIndex(spec, index)),
    ];
  }

  createTable(meta, known) {
    return this.createTableSpec(specOf(meta), known);
  }

  // The foreign keys a CREATE TABLE leaves out (to tables not made yet), as ALTER TABLE statements.
  laterForeignKeys(meta, known) {
    const { quote } = this.dialect;
    const spec = specOf(meta);
    return Object.entries(spec.columns)
      .filter(([, column]) => column.references && keyOf(column.references) !== keyOf(spec))
      .filter(([, column]) => !known.has(keyOf(column.references)))
      .map(([name, { references }]) => {
        const constraint = quote(`${spec.table}_${name}_fkey`);
        return (
          `ALTER TABLE ${this.table(spec)} ADD CONSTRAINT ${constraint} FOREIGN KEY (${quote(name)}) ` +
          this.referencesSql(references)
        );
      });
  }

  // A table made again with the schema `after` (SQLite cannot alter or drop most columns): a new table, the rows
  // copied, the old one dropped and the new one renamed.
  rebuild(before, after, known) {
    const { quote } = this.dialect;
    const temp = { table: `xufa_new_${after.table}`, schema: after.schema };
    const common = Object.keys(after.columns)
      .filter((column) => before.columns[column])
      .map(quote)
      .join(', ');
    return [
      ...this.createTableSpec(after, known, { ifNotExists: false, name: temp.table }).slice(0, 1),
      `INSERT INTO ${this.table(temp)} (${common}) SELECT ${common} FROM ${this.table(after)}`,
      `DROP TABLE ${this.table(after)}`,
      // SQLite has no schemas: the new name is the whole name.
      `ALTER TABLE ${this.table(temp)} RENAME TO ${this.table(after)}`,
      ...after.indexes.map((index) => this.createIndex(after, index)),
    ];
  }

  // The statements of a migration operation; `before` and `after` are the schemas around it (their tables by keys).
  migration(op, before, after) {
    const { quote } = this.dialect;
    const sqlite = this.dialect.name === 'sqlite';
    const known = new Set(Object.keys(after.tables));
    // The table of the operation: its spec (with its schema), or its name.
    const spec = (key) => after.tables[key] || before.tables[key] || { table: key, schema: null };
    const owner = op.table ? spec(op.table) : null;
    const table = owner ? this.table(owner) : '';
    switch (op.op) {
      case 'createTable':
        return this.createTableSpec(op.spec, new Set(Object.keys(before.tables)));
      case 'dropTable':
        return [this.dialect.dropTable(owner.table, owner.schema)];
      case 'addColumn': {
        if (op.spec.primaryKey) throw new Error(`A primary key cannot be added to ${op.table}`);
        const value = op.default === undefined && !op.spec.null ? null : op.default;
        const statements = [
          `ALTER TABLE ${table} ADD COLUMN ${this.columnDefinition(owner, op.column, op.spec, known, value)}`,
        ];
        // The default only fills the rows that exist: the ORM gives the values of the new rows.
        if (!sqlite && value !== undefined)
          statements.push(`ALTER TABLE ${table} ALTER COLUMN ${quote(op.column)} DROP DEFAULT`);
        return statements;
      }
      case 'dropColumn':
        if (sqlite) return this.rebuild(before.tables[op.table], after.tables[op.table], known);
        return [`ALTER TABLE ${table} DROP COLUMN ${quote(op.column)}`];
      case 'alterColumn': {
        if (op.from.primaryKey !== op.to.primaryKey) throw new Error(`The primary key of ${op.table} cannot change`);
        if (sqlite) return this.rebuild(before.tables[op.table], after.tables[op.table], known);
        const column = quote(op.column);
        const statements = [];
        if (op.from.type !== op.to.type || op.from.maxLength !== op.to.maxLength) {
          const type = this.columnType(op.to);
          statements.push(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${type} USING ${column}::${type}`);
        }
        if (op.from.null !== op.to.null) {
          statements.push(`ALTER TABLE ${table} ALTER COLUMN ${column} ${op.to.null ? 'DROP' : 'SET'} NOT NULL`);
        }
        if (JSON.stringify(op.from.references) !== JSON.stringify(op.to.references)) {
          // Foreign keys are named as PostgreSQL names those of CREATE TABLE.
          const constraint = quote(`${owner.table}_${op.column}_fkey`);
          statements.push(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
          if (op.to.references) {
            statements.push(
              `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (${column}) ${this.referencesSql(op.to.references)}`
            );
          }
        }
        return statements;
      }
      case 'renameColumn':
        return [`ALTER TABLE ${table} RENAME COLUMN ${quote(op.from)} TO ${quote(op.to)}`];
      case 'renameTable': {
        // The table keeps its schema: the new name is a name (the whole name in SQLite).
        const from = spec(op.from);
        const to = spec(op.to);
        return [`ALTER TABLE ${this.table(from)} RENAME TO ${sqlite ? this.table(to) : quote(to.table)}`];
      }
      case 'setOptions':
        if (sqlite) return [];
        return [
          op.fillfactor
            ? `ALTER TABLE ${table} SET (fillfactor = ${Number(op.fillfactor)})`
            : `ALTER TABLE ${table} RESET (fillfactor)`,
        ];
      case 'createIndex':
        return [this.createIndex(owner, op.index)];
      case 'dropIndex': {
        // An index of PostgreSQL is in the schema of its table.
        const schema = !sqlite && owner && owner.schema ? `${quote(owner.schema)}.` : '';
        return [`DROP INDEX IF EXISTS ${schema}${quote(op.name)}`];
      }
      case 'sql':
        return [].concat(op.sql);
      default:
        throw new Error(`Unknown migration operation ${op.op}`);
    }
  }

  dropTable(meta) {
    return this.dialect.dropTable(meta.table, meta.schema);
  }
}

// The columns of the composite primary key of a spec of a table, or null.
function compositeOf(spec) {
  if (!spec || !spec.columns) return null;
  const columns = Object.keys(spec.columns).filter((column) => spec.columns[column].primaryKey);
  return columns.length > 1 ? columns : null;
}

// The key of a table ({ table, schema }), as the keys of the tables of the schemas of migrations.
function keyOf(ref) {
  return tableKey(ref.table, ref.schema);
}

export { SqlCompiler };
