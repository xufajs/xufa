'use strict';

// union(), intersection() and difference() of QuerySets, as Django's (UNION, INTERSECT and EXCEPT): the rows of
// several queries, each once (union({ all: true }) keeps those in several).
//
// QuerySets of objects of one model with no slice are one query, their conditions combined (indexes serve it, on every
// backend), and stay a QuerySet: ORed (union), ANDed (intersection), or those of the others excluded (difference). The
// union of values is one query too (its rows once). The rest (slices, values for intersection and difference, models
// that differ, union({ all: true })) run each and are combined by their rows: a CombinedQuerySet, which orders, slices,
// counts and is awaited.
//
//   Book.objects.filter({ pages__gt: 500 }).union(Book.objects.filter({ authorId: 1 }))       // one query
//   Book.objects.filter({ year: 2001 }).difference(Book.objects.filter({ genre: 'sf' }))      // one query
//   Book.objects.values('genre').filter({ year: 2001 }).intersection(Book.objects.values('genre').filter({ year: 2005 }))
const { QueryError } = require('./errors');
const { resolveWhere } = require('./query');

const OPERATIONS = new Set(['union', 'intersection', 'difference']);

const isModelObject = (row) => Boolean(row && row.constructor && row.constructor.meta && row.constructor.meta.fields);

// What makes two rows the same: the model and key of objects, or the values.
function identityOf(row) {
  if (isModelObject(row)) {
    const { meta } = row.constructor;
    const keys = meta.pkFields.length ? meta.pkFields : meta.fields;
    return `${row.constructor.name}:${JSON.stringify(keys.map((field) => row[field.attname]))}`;
  }
  return JSON.stringify(row);
}

// Orders values as the databases do: nulls first ascending, dates by time.
function compare(a, b) {
  const left = a instanceof Date ? a.getTime() : a;
  const right = b instanceof Date ? b.getTime() : b;
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return left < right ? -1 : 1;
}

// The rows once, in their order.
function once(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const id = identityOf(row);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

class CombinedQuerySet {
  constructor(op, parts, { all = false } = {}, state = { orderBy: null, limit: null, offset: 0 }) {
    this.op = op;
    this.parts = parts;
    this.all = all;
    this.state = state;
    this.cache = undefined;
  }

  clone(changes) {
    return new CombinedQuerySet(this.op, this.parts, { all: this.all }, { ...this.state, ...changes });
  }

  // The order of the rows: names of fields (or of values), '-name' descending.
  orderBy(...names) {
    names.forEach((name) => {
      if (typeof name !== 'string') throw new QueryError(`orderBy() of a ${this.op} takes names of fields`);
    });
    return this.clone({ orderBy: names });
  }

  limit(count) {
    if (!Number.isInteger(count) || count < 0) throw new QueryError('limit must be a positive integer');
    return this.clone({ limit: count });
  }

  offset(count) {
    if (!Number.isInteger(count) || count < 0) throw new QueryError('offset must be a positive integer');
    return this.clone({ offset: count });
  }

  slice(start, end) {
    let qs = this.offset(this.state.offset + start);
    if (end !== undefined) qs = qs.limit(Math.max(0, end - start));
    return qs;
  }

  union(...others) {
    // eslint-disable-next-line no-use-before-define
    return combine('union', [this, ...others.filter((item) => !isOptions(item))], optionsOf(others));
  }

  intersection(...others) {
    // eslint-disable-next-line no-use-before-define
    return combine('intersection', [this, ...others]);
  }

  difference(...others) {
    // eslint-disable-next-line no-use-before-define
    return combine('difference', [this, ...others]);
  }

  get sliced() {
    return this.state.limit !== null || this.state.offset > 0;
  }

  // The value of a name in a row: of an object, of values, or of a list of valuesList() (by the names of its parts).
  valueOf(row, name) {
    if (Array.isArray(row)) {
      const names = this.parts[0].state.values || [];
      const at = names.indexOf(name);
      if (at < 0) throw new QueryError(`orderBy() of a ${this.op} of lists: ${name} is not one of their values`);
      return row[at];
    }
    if (row === null || typeof row !== 'object') {
      const names = this.parts[0].state.values || [];
      if (names[0] !== name) throw new QueryError(`orderBy() of a ${this.op} of values: ${name} is not their value`);
      return row;
    }
    if (isModelObject(row) && !(name in row)) {
      const field = row.constructor.meta.field(name);
      if (field) return row[field.attname];
    }
    return row[name];
  }

  // The rows of the parts, combined (before the order and the slice).
  async combined() {
    const lists = await Promise.all(this.parts.map((part) => part.fetch()));
    if (this.op === 'union') return this.all ? lists.flat() : once(lists.flat());
    const others = lists.slice(1).map((rows) => new Set(rows.map(identityOf)));
    const first = once(lists[0]);
    if (this.op === 'intersection') return first.filter((row) => others.every((ids) => ids.has(identityOf(row))));
    return first.filter((row) => !others.some((ids) => ids.has(identityOf(row))));
  }

  async fetch() {
    if (this.cache) return this.cache;
    let rows = await this.combined();
    const { orderBy, limit, offset } = this.state;
    if (orderBy && orderBy.length) {
      const keys = orderBy.map((name) => ({ name: name.replace(/^-/, ''), desc: name.startsWith('-') }));
      rows = rows
        .map((row, index) => ({ row, index }))
        .sort((a, b) => {
          for (const { name, desc } of keys) {
            const order = compare(this.valueOf(a.row, name), this.valueOf(b.row, name));
            if (order !== 0) return desc ? -order : order;
          }
          return a.index - b.index;
        })
        .map((item) => item.row);
    }
    if (offset || limit !== null) rows = rows.slice(offset, limit === null ? undefined : offset + limit);
    this.cache = rows;
    return rows;
  }

  then(resolve, reject) {
    return this.fetch().then(resolve, reject);
  }

  catch(reject) {
    return this.fetch().catch(reject);
  }

  async *[Symbol.asyncIterator]() {
    const items = await this.fetch();
    for (let i = 0; i < items.length; i += 1) yield items[i];
  }

  async count() {
    if (this.cache) return this.cache.length;
    // union({ all: true }) without a slice is the sum of the counts of its parts.
    if (this.op === 'union' && this.all && !this.sliced) {
      const counts = await Promise.all(this.parts.map((part) => part.count()));
      return counts.reduce((sum, count) => sum + count, 0);
    }
    return (await this.fetch()).length;
  }

  async exists() {
    if (this.cache) return this.cache.length > 0;
    if (this.op === 'union' && !this.sliced) {
      return (await Promise.all(this.parts.map((part) => part.exists()))).some(Boolean);
    }
    return (await this.fetch()).length > 0;
  }

  async first() {
    const rows = await this.clone({ limit: 1 }).fetch();
    return rows.length ? rows[0] : null;
  }
}

const isOptions = (item) =>
  Boolean(item) && typeof item === 'object' && !(item instanceof CombinedQuerySet) && typeof item.fetch !== 'function';
const optionsOf = (items) => {
  const last = items[items.length - 1];
  return isOptions(last) ? last : {};
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// QuerySets that are one query with their conditions combined: one model and database, no slice, lock, aggregates
// nor limitPer, the same values, objects deleted softly and loading options. Intersections and differences of values
// compare values, not objects: they are not (the values of the objects in both are not the values in both).
function mergeable(op, parts) {
  const [first] = parts;
  if (op !== 'union' && first.state && first.state.values) return false;
  return parts.every((part) => {
    const { state } = part;
    return (
      typeof part.clone === 'function' &&
      !(part instanceof CombinedQuerySet) &&
      part.model === first.model &&
      part.db === first.db &&
      state.limit === null &&
      !state.offset &&
      !state.annotations &&
      !state.per &&
      !state.lock &&
      !state.extra &&
      state.deleted === first.state.deleted &&
      Boolean(state.distinct) === Boolean(first.state.distinct) &&
      same(state.values, first.state.values) &&
      state.list === first.state.list &&
      state.flat === first.state.flat &&
      same(state.only, first.state.only) &&
      same(state.related, first.state.related) &&
      same(state.prefetch, first.state.prefetch)
    );
  });
}

// The parts of one query combined: its conditions.
function merge(op, parts) {
  const [first] = parts;
  // Rows of values are given once, as UNION does (objects are once already).
  const changes = { orderBy: null, distinct: Boolean(first.state.values) || first.state.distinct };
  const wheres = parts.map((part) => part.state.where);
  if (op === 'union') {
    // A part without conditions is every object: so is the union.
    if (wheres.includes(null)) return first.clone({ ...changes, where: null });
    return first.clone({ ...changes, where: wheres.reduce((left, right) => ({ op: 'or', children: [left, right] })) });
  }
  if (op === 'intersection') {
    const kept = wheres.filter(Boolean);
    const where = kept.length ? kept.reduce((left, right) => ({ op: 'and', children: [left, right] })) : null;
    return first.clone({ ...changes, where });
  }
  // difference: the first, but not the others; a part without conditions takes every object away.
  if (wheres.slice(1).includes(null))
    return first.clone({ ...changes, where: resolveWhere(first.model, { pk__in: [] }) });
  const excluded = wheres.slice(1).map((where) => ({ op: 'not', children: [where] }));
  const where = [wheres[0], ...excluded]
    .filter(Boolean)
    .reduce((left, right) => ({ op: 'and', children: [left, right] }));
  return first.clone({ ...changes, where });
}

function combine(op, given, { all = false } = {}) {
  if (!OPERATIONS.has(op)) throw new QueryError(`Not a combination of queries: ${op}`);
  if (given.length < 2 && op !== 'union') throw new QueryError(`${op}() takes other QuerySets`);
  if (given.length === 0) throw new QueryError(`${op}() takes QuerySets`);
  for (const part of given) {
    if (!(part instanceof CombinedQuerySet) && (!part || typeof part.fetch !== 'function' || !part.model)) {
      throw new QueryError(`${op}() takes QuerySets of models`);
    }
  }
  if (op !== 'union' && all) throw new QueryError(`${op}() gives each row once: it takes no all`);
  // A union (or intersection) of combinations of the same kind, not ordered nor sliced, is one of their parts; so is
  // the difference of a difference with others (the first part only).
  const flat = (part, index) =>
    part instanceof CombinedQuerySet &&
    part.op === op &&
    part.all === all &&
    !part.sliced &&
    !part.state.orderBy &&
    (op !== 'difference' || index === 0);
  const parts = given.flatMap((part, index) => (flat(part, index) ? part.parts : [part]));
  if (!all && mergeable(op, parts)) return merge(op, parts);
  return new CombinedQuerySet(op, parts, { all });
}

module.exports = { combine, CombinedQuerySet, isOptions, optionsOf };
