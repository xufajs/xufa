// Results kept in a cache: of querysets (QuerySet.cached()) and of functions of yours (cached()).
//
// A queryset is cached by a key made from all it is (its model, conditions, order, slice, values, annotations...),
// written the same way every time (keys of objects sorted, dates, bytes and bigints as themselves), and from the
// versions of the models it reads: every write to one of them (insert, update, delete, from anywhere: Database wraps
// its backend) gives it a new version, so what was cached for the old one is not read again (it expires, or is
// evicted). The versions live in the cache of the database (db.cache): with a SharedCache or a NetCache, a write in
// one process is seen by every one. Every model a cached queryset reads needs the option `cache` (writes to models
// without it are not followed); inside transactions nothing is read nor kept, and the writes of a transaction give
// new versions again once it is committed (what was read meanwhile was the data before it).
//
//   const top = await Book.objects.filter({ author__country: 'ES' }).orderBy('-sales').limit(10).cached({ ttl: 60000 });
//
//   const rates = cached(async (currency) => fetchRates(currency), { ttl: 600000 });
//   await rates('EUR'); // the next calls of the next 10 minutes are answered from the cache
import { reportCacheError } from './cache-errors.js';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { MemoryCache } from './cache.js';
import { resolvePath } from './query.js';

// --- Keys: a value written the same way every time.

function isModel(value) {
  return typeof value === 'function' && value.meta && typeof value.meta === 'object' && value.meta.fieldMap;
}

// The text of a value for a key, adding the models it names to `models` (fields name their model and, for relations,
// the model they lead to).
function describe(value, models, seen = new Set()) {
  if (value === undefined) return 'u';
  if (value === null) return 'n';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'boolean':
      return value ? 't' : 'f';
    case 'bigint':
      return `${value}n`;
    case 'symbol':
      return value.toString();
    case 'function':
      if (isModel(value)) {
        models.add(value);
        return `M:${value.meta.key}`;
      }
      throw new TypeError(`A function cannot be part of the key of a cache (${value.name || 'anonymous'})`);
    default:
      break;
  }
  if (value instanceof Date) return `D:${Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString()}`;
  if (value instanceof RegExp) return `R:${value.toString()}`;
  if (ArrayBuffer.isView(value))
    return `B:${Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('base64')}`;
  if (seen.has(value)) throw new TypeError('A value with cycles cannot be part of the key of a cache');
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => describe(item, models, seen)).join(',')}]`;
    // A field: its model and name (and the model a relation leads to).
    if (typeof value.attname === 'string' && isModel(value.model)) {
      models.add(value.model);
      if (isModel(value.target)) models.add(value.target);
      return `F:${value.model.meta.key}.${value.name}`;
    }
    // A queryset given as a value (a subquery): its model and its state.
    if (isModel(value.model) && value.state && typeof value.state === 'object') {
      models.add(value.model);
      return `Q:${value.model.meta.key}${describeState(value.state, models, seen)}`;
    }
    if (value instanceof Map) {
      const entries = [...value].map(
        ([key, item]) => `${describe(key, models, seen)}=>${describe(item, models, seen)}`
      );
      return `Map{${entries.sort().join(',')}}`;
    }
    if (value instanceof Set)
      return `Set{${[...value]
        .map((item) => describe(item, models, seen))
        .sort()
        .join(',')}}`;
    const name = value.constructor && value.constructor !== Object ? `${value.constructor.name}` : '';
    const keys = Object.keys(value).sort();
    return `${name}{${keys.map((key) => `${JSON.stringify(key)}:${describe(value[key], models, seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

// The hashes of the texts seen last (the keys of the same querysets come again and again): a hash of SHA-256 made
// once for each, not for every read.
const HASHES_MAX = 2000;
const hashes = new Map();
function hash(text) {
  let known = hashes.get(text);
  if (known === undefined) {
    known = crypto.createHash('sha256').update(text).digest('base64url');
    if (hashes.size >= HASHES_MAX) hashes.clear();
    hashes.set(text, known);
  }
  return known;
}

// The models of the paths of names a queryset keeps as text (orderBy('writer__name'), values(), only(), selectRelated()):
// conditions are kept resolved (their fields name their models), these are not.
function addPathModels(model, names, models) {
  for (const name of names || []) {
    if (typeof name !== 'string') continue;
    try {
      describe(resolvePath(model, name.replace(/^-/, ''), true, true).fields, models);
    } catch {
      // A wrong name: the query says so when it runs.
    }
  }
}

// What of the state of a queryset makes its results (not where it runs, nor how it is cached or cancelled).
const NOT_OF_RESULTS = new Set(['db', 'cached', 'signal']);

// The text of the state of a queryset, as describe() of it would be but in one pass, with no copy: the states of
// querysets have their fields in the same order always (those of a new queryset, changed), so they are not sorted;
// fields that are null, false or empty lists are left out.
function describeState(state, models, seen) {
  let text = '{';
  for (const key of Object.keys(state)) {
    if (NOT_OF_RESULTS.has(key)) continue;
    const value = state[key];
    if (value === null || value === false || (Array.isArray(value) && value.length === 0)) continue;
    text += `${key}:${describe(value, models, seen)},`;
  }
  return `${text}}`;
}

// A MemoryCache as it is (no faults, which wrap its methods): read and written at once, with no promise.
const atOnce = (store) =>
  store instanceof MemoryCache && store.get === MemoryCache.prototype.get && store.set === MemoryCache.prototype.set;

// The versions of models in a MemoryCache, at once.
function versionsNow(db, store, models) {
  const versions = new Array(models.length);
  for (let i = 0; i < models.length; i += 1) {
    const key = versionKey(db, models[i].meta);
    let version = store.getNow(key);
    if (version === undefined) {
      version = newVersion();
      store.setNow(key, version);
    }
    versions[i] = version;
  }
  return versions;
}

// --- Versions of models.

const versionKey = (db, meta) => `${db.name}:${meta.key}:v`;
const newVersion = () => crypto.randomBytes(9).toString('base64url');

function storeOf(db) {
  if (!db.cache) db.cache = new MemoryCache();
  return db.cache;
}

// The versions of the models (made when there is none yet, or it was evicted).
async function versionsOf(db, models) {
  const store = storeOf(db);
  return Promise.all(
    models.map(async (model) => {
      const key = versionKey(db, model.meta);
      let version = await store.get(key);
      if (version === undefined) {
        version = newVersion();
        await store.set(key, version);
      }
      return version;
    })
  );
}

// The models whose writes were made in the transaction running (to give them new versions once it is committed).
const transactionWrites = new AsyncLocalStorage();

// After a write to a model with the option `cache`: a new version (and again after the commit of its transaction).
async function changed(db, meta) {
  if (!meta || !meta.options || !meta.options.cache) return;
  const writes = transactionWrites.getStore();
  if (writes) writes.add(meta);
  await storeOf(db).set(versionKey(db, meta), newVersion());
}

// Wraps the writes of the backend of a database (insert, update, delete), and its transactions.
function followWrites(db) {
  const { backend } = db;
  for (const method of ['insert', 'update', 'delete']) {
    const write = backend[method];
    if (typeof write !== 'function') continue;
    backend[method] = function followedWrite(target, ...args) {
      // insert(meta, rows), update(query, ...) and delete(query): the meta of the model written. Writes to models
      // without the option cache are the backend's as they are (no step more).
      const meta = target && target.meta ? target.meta : target;
      if (!meta || !meta.options || !meta.options.cache) return write.call(this, target, ...args);
      return write.call(this, target, ...args).then(async (result) => {
        await changed(db, meta);
        return result;
      });
    };
  }
}

async function inTransaction(db, run) {
  if (db.backend.inTransaction || transactionWrites.getStore()) return run();
  const writes = new Set();
  const result = await transactionWrites.run(writes, run);
  // Committed: what was read while it ran is not what is there now.
  await Promise.all([...writes].map((meta) => storeOf(db).set(versionKey(db, meta), newVersion())));
  return result;
}

// --- Querysets.

/**
 * The result of `compute` for a queryset, from the cache of its database when its key and the versions of the models
 * it reads are the same. `kind` tells the results apart (objects, count...); `raw` and `make` turn results into what
 * is kept and back (the rows of objects).
 */
async function cachedQuery(qs, kind, compute, { raw = (value) => value, make = (value) => value, extra } = {}) {
  const db = qs.db;
  if (db.backend.inTransaction) return compute();
  const models = new Set([qs.model]);
  const { state } = qs;
  for (const names of [state.orderBy, state.values, state.only, state.related, state.prefetch]) {
    addPathModels(qs.model, names, models);
  }
  const description = `${kind}|${describe(extra, models)}|${describeState(qs.state, models, new Set())}`;
  const list = models.size === 1 ? [qs.model] : [...models].sort((a, b) => (a.meta.key < b.meta.key ? -1 : 1));
  const without = list.filter((model) => !model.meta.options.cache);
  if (without.length) {
    const names = without.map((model) => model.name).join(', ');
    throw new TypeError(`cached() reads ${names}, which has no option cache: its writes would not be followed`);
  }
  const store = storeOf(db);
  if (atOnce(store)) {
    // In the process: the versions and what is kept, read at once.
    const key = `${db.name}:${qs.model.meta.key}:q:${hash(`${description}|${versionsNow(db, store, list).join(',')}`)}`;
    const kept = store.getNow(key);
    if (kept !== undefined) return make(kept.value);
    const result = await compute();
    store.setNow(key, { value: raw(result) }, qs.state.cached.ttl);
    return result;
  }
  // A cache that fails to read is a miss, and one that fails to keep keeps nothing: the database answers.
  let key;
  try {
    const versions = await versionsOf(db, list);
    key = `${db.name}:${qs.model.meta.key}:q:${hash(`${description}|${versions.join(',')}`)}`;
    const kept = await store.get(key);
    if (kept !== undefined) return make(kept.value);
  } catch (err) {
    reportCacheError(db, err, 'get');
    return compute();
  }
  // A write while it is read gives new versions: what is kept here is under the old ones, and not read again.
  const result = await compute();
  await Promise.resolve()
    .then(() => store.set(key, { value: raw(result) }, qs.state.cached.ttl))
    .catch((err) => reportCacheError(db, err, 'set'));
  return result;
}

// --- Functions of yours.

/**
 * A function whose results are kept: the same arguments (by `key(...args)`, the arguments by default, written as the
 * keys of querysets) give the result kept for `ttl` ms, and calls made while one runs wait for it. Errors are not
 * kept. `cache`: where (a MemoryCache of its own by default; a SharedCache or NetCache shares them, and then `name`
 * tells functions apart).
 */
function cached(fn, options = {}) {
  if (typeof fn !== 'function') throw new TypeError('cached() needs a function');
  const { key = (...args) => args, ttl = 0, cache, name } = options;
  if (cache && !name)
    throw new TypeError('cached() with a cache of yours needs a name (keys of other functions are there)');
  const store = cache || new MemoryCache({ max: options.max });
  const prefix = `cached:${name || fn.name || 'fn'}:`;
  const running = new Map();
  // Its errors of the cache: onCacheError, or a warning.
  const ownHandler = options.onCacheError;
  const keyOf = (args) => `${prefix}${hash(describe(key(...args), new Set()))}`;

  async function call(...args) {
    const id = keyOf(args);
    let kept;
    try {
      kept = await store.get(id);
    } catch (err) {
      reportCacheError(call, err, 'get');
    }
    if (kept !== undefined) return kept.value;
    if (running.has(id)) return structuredClone(await running.get(id));
    const promise = (async () => {
      try {
        const value = await fn(...args);
        await Promise.resolve()
          .then(() => store.set(id, { value }, ttl))
          .catch((err) => reportCacheError(call, err, 'set'));
        return value;
      } finally {
        running.delete(id);
      }
    })();
    running.set(id, promise);
    return promise;
  }
  call.onCacheError = ownHandler;
  /** Forgets the result of some arguments. */
  call.invalidate = (...args) => store.delete(keyOf(args));
  /** Forgets every result. */
  call.clear = () => store.clear(prefix);
  return call;
}

export { cached, cachedQuery, followWrites, inTransaction, describe, changed };
