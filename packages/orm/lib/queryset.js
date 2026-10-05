// QuerySet: a lazy, immutable query on a model, as in Django. Every method that refines it gives a new QuerySet; it
// runs when it is awaited (or iterated), and the methods that read or write something (get, count, update...) are
// async. Model.objects gives a QuerySet of every object of the model.
//
//   const books = await Book.objects.filter({ author__name: 'Ada', pages__gte: 100 }).orderBy('-pages').limit(10);
const { ForeignKey } = require('./fields');
const { STATE } = require('./meta');
const { currentSignal } = require('./context');
const { cachedQuery } = require('./query-cache');
const {
  Q,
  F,
  Raw,
  resolvePath,
  resolveWhere,
  resolveOrder,
  expandPkOrder,
  resolveAggregate,
  resolveF,
  combine,
  pathKey,
  lastOf,
  SEPARATOR,
  collectJoins,
  eachExists,
} = require('./query');
const modelCache = require('./model-cache');
const { NotFoundError, MultipleObjectsError, QueryError, ProtectedError, ValidationError } = require('./errors');
const { uniqueErrorOf } = require('./errors');
const { affects } = require('./computed');

const MAX_GET_RESULTS = 21;

const INITIAL = {
  where: null,
  orderBy: null,
  limit: null,
  offset: 0,
  only: null,
  values: null,
  flat: false,
  list: false,
  related: [],
  prefetch: [],
  annotations: null,
  extra: null,
  lock: null,
  per: null,
  db: null,
  defaults: null,
  signal: null,
  cached: null,
};

class QuerySet {
  constructor(model, state = INITIAL) {
    this.model = model;
    this.state = state;
    this.cache = undefined;
  }

  clone(changes) {
    return new QuerySet(this.model, { ...this.state, ...changes });
  }

  get db() {
    return this.state.db || this.model.db;
  }

  // The signal of its reads (signal(), or the one of the code running: lib/context.js), after checking it: a read
  // does not start once it is aborted.
  readSignal() {
    const signal = this.state.signal || currentSignal();
    if (signal) signal.throwIfAborted();
    return signal;
  }

  get backend() {
    return this.db.backend;
  }

  // Refining

  all() {
    return this.clone({});
  }

  filter(...conditions) {
    let { where } = this.state;
    for (let i = 0; i < conditions.length; i += 1)
      where = combine('and', where, resolveWhere(this.model, conditions[i]));
    return this.clone({ where });
  }

  exclude(...conditions) {
    const node = resolveWhere(this.model, Q.from('and', conditions));
    return this.clone({
      where: node ? combine('and', this.state.where, { op: 'not', children: [node] }) : this.state.where,
    });
  }

  // orderBy('name', '-createdAt', 'author__name'). With no names, the query has no order (not even the model's).
  orderBy(...names) {
    names.forEach((name) => {
      if (typeof name !== 'string' && !(name instanceof Raw)) throw new QueryError('orderBy takes names of fields');
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

  // The first `count` objects (after `offset`) of every group of values of some fields, in the order of the query: a
  // window of ROW_NUMBER() in SQL, a slice of every group in the others. Book.objects.orderBy('-pages').limitPer('author',
  // 3) gives the three longest books of each author (prefetches of the first objects of each parent).
  limitPer(names, count, offset = 0) {
    if (!Number.isInteger(count) || count < 0) throw new QueryError('limitPer() takes a positive integer');
    if (!Number.isInteger(offset) || offset < 0)
      throw new QueryError('the offset of limitPer() must be a positive integer');
    const list = [].concat(names);
    if (list.length === 0 || list.some((name) => typeof name !== 'string')) {
      throw new QueryError('limitPer() takes names of fields');
    }
    return this.clone({ per: { names: list, limit: count, offset } });
  }

  // slice(start, end), as Array.prototype.slice (without negative indexes).
  slice(start, end) {
    let qs = this.offset(this.state.offset + start);
    if (end !== undefined) qs = qs.limit(Math.max(0, end - start));
    return qs;
  }

  // Loads only some fields of the objects (and the primary key).
  only(...names) {
    return this.clone({ only: names });
  }

  // Gives plain objects with the fields named (every field when there is none), which can follow relations:
  // values('title', 'author__name').
  values(...names) {
    return this.clone({ values: names, list: false, flat: false });
  }

  // Gives arrays of the values of the fields named, or the values themselves with { flat: true } and one field.
  valuesList(...args) {
    const options = args.length && typeof args[args.length - 1] === 'object' ? args.pop() : {};
    if (options.flat && args.length !== 1) throw new QueryError('valuesList with flat takes one field');
    return this.clone({ values: args, list: true, flat: Boolean(options.flat) });
  }

  // Loads the objects related by foreign keys in the same query (a join, or $lookup): selectRelated('author').
  selectRelated(...names) {
    return this.clone({ related: [...this.state.related, ...names] });
  }

  // Loads related objects with one more query for every relation: foreign keys and reverse relations (author.books).
  prefetchRelated(...names) {
    return this.clone({ prefetch: [...this.state.prefetch, ...names] });
  }

  // Aggregates of every group of values(): Book.objects.values('authorId').annotate({ books: Count() }).
  annotate(aggregates) {
    return this.clone({ annotations: { ...this.state.annotations, ...aggregates } });
  }

  using(db) {
    return this.clone({ db });
  }

  // Locks the rows selected until the end of the transaction, as Django's select_for_update(): { skipLocked, noWait,
  // of: 'self' (the rows of the model only, not those of selectRelated), mode: 'update' (default), 'share',
  // 'noKeyUpdate' or 'keyShare' } (PostgreSQL; SQLite locks the whole database).
  // Its results kept in the cache of the database (lib/query-cache.js), for `ttl` ms (the ttl of the option cache of
  // the model by default), until a model it reads is written. Every model it reads needs the option cache.
  cached(options = {}) {
    if (this.state.lock) throw new QueryError('cached() cannot be used with selectForUpdate()');
    const settings = this.model.meta.options.cache;
    const ttl = options.ttl !== undefined ? options.ttl : settings && settings !== true ? settings.ttl : undefined;
    return this.clone({ cached: { ttl } });
  }

  // Its reads stop when the signal is aborted: they throw its reason, and PostgreSQL cancels the one that runs.
  signal(signal) {
    return this.clone({ signal: signal || null });
  }

  selectForUpdate(options = {}) {
    const { mode = 'update', skipLocked = false, noWait = false, of = null } = options;
    return this.clone({ lock: { mode, skipLocked: Boolean(skipLocked), noWait: Boolean(noWait), of } });
  }

  // Values of fragments of SQL selected with the objects, as Django's extra(): extra({ books: Raw('(SELECT ...)') })
  // gives each object its `books` (SQL databases).
  extra(values) {
    return this.clone({ extra: { ...this.state.extra, ...values } });
  }

  // The description of the query given to the backend.
  toQuery() {
    const { model, state } = this;
    const { meta } = model;
    const query = {
      model,
      meta,
      where: state.where,
      orderBy: [],
      limit: state.limit,
      offset: state.offset,
      only: null,
      values: null,
      related: [],
      extra: state.extra
        ? Object.entries(state.extra).map(([key, raw]) => ({ key, raw: raw.sql, params: raw.params }))
        : null,
      lock: state.lock,
      per: null,
      signal: state.signal || currentSignal(),
    };
    if (state.per) {
      if (state.lock) throw new QueryError('limitPer() cannot lock rows');
      if (state.annotations) throw new QueryError('limitPer() cannot be used with annotate()');
      query.per = {
        fields: state.per.names.map((name) => {
          const { fields, jsonPath } = resolvePath(model, name, false);
          if (jsonPath || lastOf(fields).composite) throw new QueryError(`limitPer(): ${name} is not a field`);
          return fields;
        }),
        limit: state.per.limit,
        offset: state.per.offset,
      };
    }
    if (state.values) {
      const names = state.values.length ? state.values : meta.fields.map((field) => field.attname);
      // Names, or { key: Raw(sql) } for values of fragments of SQL.
      query.values = names.flatMap((name) => {
        if (name && typeof name === 'object') {
          return Object.entries(name).map(([key, raw]) => ({ key, raw: raw.sql, params: raw.params }));
        }
        const { fields, jsonPath } = resolvePath(model, name, false);
        return jsonPath ? { key: name, fields, jsonPath } : { key: name, fields };
      });
    } else if (state.only) {
      const only = new Set(meta.pkFields);
      state.only.forEach((name) => {
        const field = meta.field(name);
        if (!field) throw new QueryError(`only(): ${model.name} has no field ${name}`);
        only.add(field);
      });
      query.only = meta.fields.filter((field) => only.has(field));
    }
    if (!state.values) {
      // Every chain comes after its prefixes: selectRelated('author__publisher') loads the author too.
      const chains = new Map();
      state.related.forEach((name) => {
        const { fields } = resolvePath(model, name, false);
        if (
          !fields.every((field) => field instanceof ForeignKey) ||
          lastOf(fields).attname === name.split(SEPARATOR).pop()
        ) {
          throw new QueryError(`selectRelated(): ${name} is not a foreign key of ${model.name}`);
        }
        for (let i = 1; i <= fields.length; i += 1) {
          const chain = fields.slice(0, i);
          const key = pathKey(chain);
          if (!chains.has(key)) chains.set(key, chain);
        }
      });
      query.related = [...chains.values()];
    }
    const order = state.orderBy || meta.ordering;
    if (!state.annotations) {
      query.orderBy = expandPkOrder(model, order).map((name) => resolveOrder(model, name));
    }
    checkDatabases(query);
    return query;
  }

  // Reading

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

  async fetch() {
    if (this.cache) return this.cache;
    this.readSignal();
    const { state } = this;
    if (state.cached) {
      // Objects are kept as their rows, and made again from them.
      const objects = !state.annotations && !state.values;
      if (objects && (state.related.length || state.prefetch.length)) {
        throw new QueryError(
          'cached() keeps objects without the related ones: leave out selectRelated() and prefetchRelated(), or use values()'
        );
      }
      const result = await cachedQuery(
        this,
        'fetch',
        () => this.fetchFresh(),
        objects
          ? {
              raw: (items) => items.map((item) => item.toRow()),
              make: (rows) => rows.map((row) => this.model.fromRow(row, state.db)),
            }
          : {}
      );
      this.cache = result;
      return result;
    }
    const result = await this.fetchFresh();
    this.cache = result;
    return result;
  }

  async fetchFresh() {
    const { state } = this;
    let result;
    if (state.annotations) result = this.shapeValues(await this.fetchGroups());
    else {
      const { backend } = this;
      if (state.per && !backend.limitPer) result = await this.fetchPer();
      else if (state.values) result = this.shapeValues(await backend.select(this.toQuery()));
      else {
        // Backends that can make the objects themselves (SQL) skip the rows by attname.
        if (backend.selectObjects) result = await backend.selectObjects(this.toQuery(), state.db);
        else result = (await backend.select(this.toQuery())).map((row) => this.model.fromRow(row, state.db));
        if (state.prefetch.length) await prefetch(this.model, result, state.prefetch, state.db);
      }
    }
    return result;
  }

  // limitPer() in backends without windows: the objects of every group, sliced here.
  async fetchPer() {
    const { model, state } = this;
    if (state.values) throw new QueryError('limitPer() with values() needs a SQL database');
    const names = state.per.names.map((name) => {
      const { fields } = resolvePath(model, name, false);
      if (fields.length !== 1) throw new QueryError(`limitPer() of a relation (${name}) needs a SQL database`);
      return fields[0].attname;
    });
    const all = await this.clone({ per: null, limit: null, offset: 0 }).fetch();
    const counts = new Map();
    const { limit, offset } = state.per;
    const kept = all.filter((item) => {
      const key = JSON.stringify(names.map((name) => item[name]));
      const seen = counts.get(key) || 0;
      counts.set(key, seen + 1);
      return seen >= offset && seen < offset + limit;
    });
    return kept.slice(state.offset, state.limit === null ? undefined : state.offset + state.limit);
  }

  shapeValues(rows) {
    const { state } = this;
    if (!state.list) return rows;
    const keys = state.values.length ? state.values : this.model.meta.fields.map((field) => field.attname);
    if (state.flat) return rows.map((row) => row[keys[0]]);
    return rows.map((row) => keys.map((key) => row[key]));
  }

  async fetchGroups() {
    const { model, state } = this;
    if (!state.values) throw new QueryError('annotate() needs values(): the fields to group by');
    const query = this.toQuery();
    const aggregates = Object.keys(state.annotations).map((key) => ({
      key,
      ...resolveAggregate(model, state.annotations[key]),
    }));
    const keys = new Set([...query.values.map((item) => item.key), ...aggregates.map((item) => item.key)]);
    query.groupOrder = (state.orderBy || []).map((name) => {
      const desc = name.startsWith('-');
      const key = desc ? name.slice(1) : name;
      if (!keys.has(key)) throw new QueryError(`Groups can only be ordered by their values and annotations (${key})`);
      return { key, desc };
    });
    return this.backend.aggregate(query, aggregates, query.values);
  }

  // Whether the query is all the objects of the model (no condition, slice nor options): get() of it can use the
  // cache of the model.
  get plain() {
    const { state } = this;
    return (
      state.where === null &&
      state.limit === null &&
      !state.offset &&
      !state.only &&
      !state.values &&
      state.related.length === 0 &&
      state.prefetch.length === 0 &&
      !state.annotations &&
      !state.lock &&
      !state.per
    );
  }

  async get(...conditions) {
    const lookup = this.plain ? modelCache.lookupOf(this.model, conditions) : null;
    if (lookup) {
      const row = await modelCache.read(this.db, this.model, lookup);
      if (row) return this.model.fromRow(row, this.state.db);
      const instance = await this.getFromDatabase(conditions);
      await modelCache.write(this.db, this.model, instance, lookup.settings);
      return instance;
    }
    return this.getFromDatabase(conditions);
  }

  async getFromDatabase(conditions) {
    const qs = (conditions.length ? this.filter(...conditions) : this).clone({ limit: MAX_GET_RESULTS });
    const items = await qs.fetch();
    if (items.length === 0) throw new NotFoundError(this.model.name);
    if (items.length > 1) {
      throw new MultipleObjectsError(items.length === MAX_GET_RESULTS ? 'more than 20' : items.length, this.model.name);
    }
    return items[0];
  }

  // The first object (by the order of the query, or the primary key), or null.
  async first() {
    const { meta } = this.model;
    const qs = this.state.orderBy || meta.ordering.length || !meta.pk ? this : this.orderBy('pk');
    const items = await qs.clone({ limit: 1 }).fetch();
    return items.length ? items[0] : null;
  }

  async last() {
    const order = this.state.orderBy || this.model.meta.ordering;
    if (order.length === 0 && !this.model.meta.pk) {
      throw new QueryError(`last() of ${this.model.name}, which has no primary key, needs an order`);
    }
    const reversed = (order.length ? order : ['pk']).map((name) => (name.startsWith('-') ? name.slice(1) : `-${name}`));
    return this.orderBy(...reversed).first();
  }

  async count() {
    if (this.cache) return this.cache.length;
    if (this.state.per) return (await this.fetch()).length;
    this.readSignal();
    if (this.state.cached) return cachedQuery(this, 'count', () => this.backend.count(this.toQuery()));
    return this.backend.count(this.toQuery());
  }

  async exists() {
    if (this.cache) return this.cache.length > 0;
    if (this.state.per) return (await this.fetch()).length > 0;
    const key = (this.model.meta.pkFields[0] || this.model.meta.fields[0]).attname;
    const items = await this.clone({ values: [key], list: true, flat: true, limit: 1, orderBy: [] }).fetch();
    return items.length > 0;
  }

  // Aggregates of the whole query: aggregate({ pages: Sum('pages'), books: Count() }) gives { pages, books }.
  async aggregate(aggregates) {
    if (this.state.per) throw new QueryError('aggregate() cannot be used with limitPer()');
    this.readSignal();
    const query = { ...this.toQuery(), orderBy: [] };
    const items = Object.keys(aggregates).map((key) => ({ key, ...resolveAggregate(this.model, aggregates[key]) }));
    const compute = async () => (await this.backend.aggregate(query, items, null))[0];
    if (this.state.cached) return cachedQuery(this, 'aggregate', compute, { extra: items });
    return compute();
  }

  // Writing

  async create(data = {}) {
    const instance = new this.model({ ...this.state.defaults, ...data });
    await instance.save({ db: this.state.db });
    return instance;
  }

  // Gets the object of the conditions (equalities), or creates it with them and the defaults: [object, created].
  async getOrCreate(conditions, defaults = {}) {
    try {
      return [await this.get(conditions), false];
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
    }
    return [await this.create({ ...equalities(this.model, conditions), ...defaults }), true];
  }

  async updateOrCreate(conditions, defaults = {}) {
    let instance;
    try {
      instance = await this.get(conditions);
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      return [await this.create({ ...equalities(this.model, conditions), ...defaults }), true];
    }
    Object.assign(instance, defaults);
    await instance.save({ db: this.state.db });
    return [instance, false];
  }

  // Inserts many objects (instances or data) in as few queries as possible, without the hooks of save(). As in
  // Django, rows that break a unique key can be ignored (ignoreConflicts; their objects get no key) or update the
  // row there (updateConflicts with updateFields, on the uniqueFields given or the primary key), in SQL databases.
  // uniqueCondition is the SQL of the rows of a partial unique index of uniqueFields (ON CONFLICT ... WHERE).
  async bulkCreate(items, options = {}) {
    const { validate = true, ignoreConflicts, updateConflicts, updateFields = [], uniqueFields = [] } = options;
    const { uniqueCondition } = options;
    const { model } = this;
    const instances = items.map((item) =>
      item instanceof model ? item : new model({ ...this.state.defaults, ...item })
    );
    const rows = instances.map((instance) => {
      instance.prepareSave(true);
      if (validate) instance.validate();
      return instance.toRow();
    });
    if (rows.length === 0) return instances;
    let conflict = null;
    if (ignoreConflicts || updateConflicts) {
      const resolve = (name) => {
        const field = model.meta.field(name);
        if (!field) throw new QueryError(`bulkCreate(): ${model.name} has no field ${name}`);
        return field;
      };
      conflict = {
        fields: uniqueFields.map(resolve),
        update: updateConflicts ? updateFields.map(resolve).filter((field) => !field.primaryKey) : null,
        where: uniqueCondition,
      };
    }
    const pks = await this.backend
      .insert(model.meta, rows, conflict ? { conflict } : undefined)
      .catch((err) => Promise.reject(uniqueErrorOf(model.meta, err) || err));
    instances.forEach((instance, i) => {
      // A composite key is given, not made by the database.
      const { pk } = model.meta;
      if (pk && !pk.composite && (pks[i] !== null || !conflict)) instance[pk.attname] = pks[i];
      instance[STATE].adding = false;
      instance[STATE].db = this.state.db || null;
    });
    return instances;
  }

  // Updates every object of the query with the values given (F expressions included), without loading them: the
  // number of objects updated.
  async update(values) {
    const { model } = this;
    this.checkWritable('update');
    const assignments = [];
    const errors = {};
    Object.keys(values).forEach((name) => {
      const field = model.meta.field(name);
      if (!field) throw new QueryError(`update(): ${model.name} has no field ${name}`);
      if (field.primaryKey) throw new QueryError('update() cannot change the primary key');
      if (field.computed !== null) throw new QueryError(`update(): ${name} is computed: the ORM sets it`);
      let value = values[name];
      if (value instanceof Raw) {
        // A fragment of SQL as the value (SQL databases).
        value = { kind: 'raw', sql: value.sql, params: value.params };
      } else if (value instanceof F) {
        value = resolveF(model, value);
        if (value.fields.length > 1) throw new QueryError('update() cannot use F expressions across relations');
      } else {
        try {
          value = field.clean(value);
          const messages = field.check(value);
          if (messages.length) errors[field.name] = messages;
        } catch (err) {
          errors[field.name] = [err.message];
        }
      }
      assignments.push({ field, value });
    });
    if (Object.keys(errors).length) throw ValidationError(model.name, errors);
    if (assignments.length === 0) return 0;
    const changed = new Set(assignments.map((assignment) => assignment.field));
    const computed = model.meta.storedComputed.filter((field) => affects(field, changed));
    if (computed.length === 0) {
      const count = await this.backend
        .update(this.toQuery(), assignments)
        .catch((err) => Promise.reject(uniqueErrorOf(model.meta, err) || err));
      await modelCache.clear(this.db, model);
      return count;
    }
    // Stored computed fields read a field updated: the objects are found first (the update can change what the
    // conditions select), updated, and their computed fields set again.
    requireKey(model, 'update() of fields read by stored computed fields');
    return this.db.transaction(async () => {
      const keys = await this.keys();
      const count = await this.backend
        .update(this.toQuery(), assignments)
        .catch((err) => Promise.reject(uniqueErrorOf(model.meta, err) || err));
      await recomputeKeys(this, keys, computed);
      await modelCache.clear(this.db, model);
      return count;
    });
  }

  // Computes the stored computed fields of the objects of the query again and saves those that changed (after adding
  // one to a table with rows, or when what it reads was changed outside the ORM): the number of objects changed.
  async recompute() {
    this.checkWritable('recompute');
    const { model } = this;
    if (model.meta.storedComputed.length === 0) return 0;
    requireKey(model, 'recompute()');
    return this.db.transaction(async () => {
      const changed = await recomputeKeys(this, await this.keys(), model.meta.storedComputed);
      await modelCache.clear(this.db, model);
      return changed;
    });
  }

  // The primary keys of the objects of the query.
  async keys() {
    const { pk, pkFields } = this.model.meta;
    const only = pkFields.map((field) => field.name);
    const keysOnly = { only, related: [], prefetch: [], values: null, list: false, flat: false, annotations: null };
    const objects = await this.clone(keysOnly).fetch();
    return objects.map((object) => (pk.composite ? object.pk : object[pk.attname]));
  }

  // Deletes every object of the query and, as their foreign keys say (onDelete), the objects related to them: the
  // number of objects of this model deleted.
  async delete() {
    this.checkWritable('delete');
    return this.db.transaction(() => collectAndDelete(this, new Map()));
  }

  checkWritable(operation) {
    if (this.state.limit !== null || this.state.offset || this.state.per) {
      throw new QueryError(`${operation}() cannot be used on a query with limit or offset`);
    }
  }
}

const RECOMPUTE_BATCH = 500;

// Stored computed fields are set again by the keys of their objects: a model without one cannot.
function requireKey(model, operation) {
  if (model.meta.pk) return;
  throw new QueryError(`${operation} needs a primary key, and ${model.name} has none`);
}

// Sets again the stored computed fields given of the objects of these keys: loads them in batches, computes the
// fields, and writes the objects whose values changed with one update for each set of values. The number changed.
async function recomputeKeys(queryset, keys, fields) {
  const { model } = queryset;
  const objects = model.objects.using(queryset.state.db);
  let changed = 0;
  for (let start = 0; start < keys.length; start += RECOMPUTE_BATCH) {
    const batch = await objects
      .filter({ pk__in: keys.slice(start, start + RECOMPUTE_BATCH) })
      .orderBy()
      .fetch();
    const groups = new Map();
    for (const object of batch) {
      const values = [];
      let same = true;
      const errors = {};
      for (const field of fields) {
        let value;
        try {
          value = field.clean(field.compute(object));
        } catch (err) {
          errors[field.name] = [err.message];
          continue;
        }
        const messages = field.check(value);
        if (messages.length) errors[field.name] = messages;
        // Each field computed is seen by those computed after it.
        if (!sameValue(field, object[field.attname], value)) same = false;
        object[field.attname] = value;
        values.push(value);
      }
      if (Object.keys(errors).length) throw ValidationError(model.name, errors);
      if (same) continue;
      const key = groupKey(values);
      const group = groups.get(key);
      if (group) group.keys.push(object.pk);
      else groups.set(key, { values, keys: [object.pk] });
    }
    for (const { values, keys: groupKeys } of groups.values()) {
      const assignments = fields.map((field, i) => ({ field, value: values[i] }));
      await queryset.backend
        .update(objects.filter({ pk__in: groupKeys }).orderBy().toQuery(), assignments)
        .catch((err) => Promise.reject(uniqueErrorOf(model.meta, err) || err));
      changed += groupKeys.length;
    }
  }
  return changed;
}

// The text of a decimal without the zeros that do not count: databases give 6.00 back as 6.
function canonicalDecimal(value) {
  let text = String(value).trim();
  const negative = text.startsWith('-');
  if (negative || text.startsWith('+')) text = text.slice(1);
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  text = text.replace(/^0+(?=\d)/, '');
  return negative && text !== '0' ? `-${text}` : text;
}

function sameValue(field, a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
  if (field.dbType === 'decimal') return canonicalDecimal(a) === canonicalDecimal(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object')
    return groupKey([a]) === groupKey([b]);
  return a === b;
}

// The values of a group of objects as text: objects with the same values are written by one update.
function groupKey(values) {
  return JSON.stringify(values, (key, value) => {
    if (typeof value === 'bigint') return `${value}n`;
    if (Buffer.isBuffer(value)) return `b:${value.toString('base64')}`;
    if (value && value.type === 'Buffer' && Array.isArray(value.data))
      return `b:${Buffer.from(value.data).toString('base64')}`;
    return value;
  });
}

// The QuerySet of a many-to-many accessor (book.tags): the objects linked to `owner`, and the methods that link and
// unlink them (they change the through model only). Its refinements are plain QuerySets.
class RelatedSet extends QuerySet {
  constructor(model, state, link) {
    super(model, state);
    this.link = link;
  }

  keysOf(items) {
    return items.flat().map((item) => (item && typeof item === 'object' ? item.pk : item));
  }

  links() {
    const { owner, through, from } = this.link;
    return through.objects.using(this.state.db).filter({ [from.attname]: owner.pk });
  }

  // Links objects (or keys) not linked yet.
  async add(...items) {
    const { owner, from, to } = this.link;
    const keys = [...new Set(this.keysOf(items))];
    if (keys.length === 0) return;
    const linked = new Set(
      await this.links()
        .filter({ [`${to.attname}__in`]: keys })
        .valuesList(to.attname, { flat: true })
    );
    const missing = keys.filter((key) => !linked.has(key));
    if (missing.length) {
      await this.link.through.objects
        .using(this.state.db)
        .bulkCreate(missing.map((key) => ({ [from.attname]: owner.pk, [to.attname]: key })));
    }
    this.cache = undefined;
  }

  async remove(...items) {
    const keys = this.keysOf(items);
    if (keys.length)
      await this.links()
        .filter({ [`${this.link.to.attname}__in`]: keys })
        .delete();
    this.cache = undefined;
  }

  async clear() {
    await this.links().delete();
    this.cache = undefined;
  }

  // Links exactly the objects given: those not given are unlinked, and the new ones linked.
  async set(items) {
    const { to } = this.link;
    const keys = new Set(this.keysOf(items));
    const linked = await this.links().valuesList(to.attname, { flat: true });
    const extra = linked.filter((key) => !keys.has(key));
    if (extra.length)
      await this.links()
        .filter({ [`${to.attname}__in`]: extra })
        .delete();
    await this.add([...keys]);
  }
}

// A query joins the tables of its relations (or $lookup them): they have to be in the database of the model. Across
// databases, relations are followed with more queries (prefetchRelated, load(), the reverse accessors).
function checkDatabases(query) {
  // The databases where the code runs: those of its tenant, when it runs in one.
  const dbOf = (model) => {
    try {
      return model.db;
    } catch {
      return null;
    }
  };
  const db = dbOf(query.model);
  if (!db) return;
  const fail = (model) => {
    throw new QueryError(
      `${query.model.name} and ${model.name} are in different databases: a query cannot join them ` +
        '(use prefetchRelated or load())'
    );
  };
  collectJoins(query).forEach((chain) => {
    chain.forEach((field) => {
      const other = dbOf(field.target);
      if (other && other !== db) fail(field.target);
    });
  });
  const visit = (where) =>
    eachExists(where, (node) => {
      const other = dbOf(node.relation.model);
      if (other && other !== db) fail(node.relation.model);
      visit(node.where);
    });
  visit(query.where);
}

function equalities(model, conditions) {
  const data = {};
  Object.keys(conditions).forEach((key) => {
    // Fields by their names (which can have the separator), not paths with lookups.
    if (!key.includes(SEPARATOR) || model.meta.fieldMap.has(key)) data[key] = conditions[key];
  });
  return data;
}

async function collectAndDelete(qs, seen) {
  const { model } = qs;
  const { meta } = model;
  const reverse = meta.reverse.filter((field) => field.onDelete !== 'doNothing');
  if (reverse.length === 0) {
    const count = await qs.backend.delete({ ...qs.toQuery(), orderBy: [] });
    await modelCache.clear(qs.db, model);
    return count;
  }
  // Without a primary key, the rows related to them go by the values their foreign keys point to (toField).
  if (!meta.pk) {
    for (let i = 0; i < reverse.length; i += 1) {
      const field = reverse[i];
      const values = await qs.valuesList(field.targetField.attname, { flat: true }).orderBy();
      const related = field.model.objects.using(qs.state.db).filter({ [`${field.attname}__in`]: values });
      if (field.onDelete === 'protect') {
        if (await related.exists()) throw new ProtectedError(model.name, `${field.model.name}.${field.name}`);
      } else if (field.onDelete === 'setNull') await related.update({ [field.name]: null });
      else await collectAndDelete(related, seen);
    }
    return qs.backend.delete({ ...qs.toQuery(), orderBy: [] });
  }
  let pks = await qs.valuesList('pk', { flat: true }).orderBy();
  const done = seen.get(model) || new Set();
  seen.set(model, done);
  pks = pks.filter((pk) => !done.has(pk));
  if (pks.length === 0) return 0;
  pks.forEach((pk) => done.add(pk));
  for (let i = 0; i < reverse.length; i += 1) {
    const field = reverse[i];
    const related = field.model.objects.using(qs.state.db).filter({ [`${field.attname}__in`]: pks });
    if (field.onDelete === 'protect') {
      if (await related.exists()) throw new ProtectedError(model.name, `${field.model.name}.${field.name}`);
    } else if (field.onDelete === 'setNull') await related.update({ [field.name]: null });
    else await collectAndDelete(related, seen);
  }
  const count = await qs.backend.delete(model.objects.using(qs.state.db).filter({ pk__in: pks }).orderBy().toQuery());
  await modelCache.clear(qs.db, model);
  return count;
}

// Loads the relations named for the objects given, with one query for each relation.
async function prefetch(model, instances, names, db) {
  if (instances.length === 0) return;
  const { meta } = model;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const field = meta.field(name);
    if (field instanceof ForeignKey && field.name === name) {
      const keys = [...new Set(instances.map((item) => item[field.attname]).filter((key) => key !== null))];
      const { attname } = field.targetField;
      const related = keys.length ? await field.target.objects.using(db).filter({ [`${attname}__in`]: keys }) : [];
      const byKey = new Map(related.map((item) => [item[attname], item]));
      instances.forEach((item) => {
        const target = byKey.get(item[field.attname]);
        if (target) item[STATE].related.set(name, target);
      });
      continue;
    }
    const many = meta.manyToManyRelation(name);
    if (many) {
      const keys = instances.map((item) => item.pk);
      const links = await many.field.through.objects
        .using(db)
        .filter({ [`${many.from.attname}__in`]: keys })
        .selectRelated(many.to.name);
      const groups = new Map(keys.map((key) => [key, []]));
      links.forEach((link) => groups.get(link[many.from.attname]).push(link[many.to.name]));
      instances.forEach((item) => item[STATE].related.set(name, groups.get(item.pk)));
      continue;
    }
    const reverse = meta.reverseRelation(name);
    if (!reverse) throw new QueryError(`prefetchRelated(): ${model.name} has no relation ${name}`);
    const keys = instances.map((item) => item.pk);
    const related = await reverse.model.objects.using(db).filter({ [`${reverse.attname}__in`]: keys });
    const groups = new Map(keys.map((key) => [key, []]));
    related.forEach((item) => {
      const group = groups.get(item[reverse.attname]);
      if (group) group.push(item);
    });
    instances.forEach((item) => item[STATE].related.set(name, groups.get(item.pk)));
  }
}

module.exports = { QuerySet, RelatedSet, pathKey, lastOf };
