// Documents: the collections of a MongoDB database as they are, schemaless, with MongoDB's filters, updates and
// pipelines, for what models do not describe (data of many shapes, code that grew on a driver). db.documents(name):
//
//   const products = db.documents('products', { cache: { indexes: ['code'], ttl: 60000 } });
//   await products.insertOne({ code: 'P1', name: 'Pen' });          // { code, name, id: '65f…' }
//   await products.findById('65f…');                               // the cache, then the database
//   await products.findOne({ code: 'P1' });                         // the cache by an index, then the database
//   await products.find({ price: { $gt: 3 } }, { sort: { price: 1 }, limit: 20 });
//   await products.update({ id: '65f…', price: 4 });                // $set, and the document as it is now
//
// Ids: documents have `id` (a string) where MongoDB has `_id`: an id of 24 hex digits is an ObjectId in the database,
// any other is kept as it is. Filters on `id` are filters on `_id` (with $eq, $ne, $in and $nin too). Only the top
// level is mapped: `_id`s inside documents are as they are.
//
// The cache (option `cache`: true or { indexes, ttl, store }): the database's cache (db.cache: a SharedCache shares
// it between the processes of a cluster, a NetCache between machines) or a store of its own. findById, and findOne of
// one equality on `id` or on a field of `indexes` (fields of unique values), are answered from it; every write keeps
// it right (the documents written are kept, those deleted forgotten; writes of many documents forget the collection).
// A cache that fails to read or keep is a miss (onCacheError of the database).
//
// Write-behind (option `writeBehind`): while the database is unavailable (a network error, no server, not connected,
// a fault; or `available()` false), writes of single documents go to the cache and to a list of pending ids, and
// synchronize() writes them when it is back. Reads by id are answered from the cache, even if expired, when the
// database fails. Documents written behind are kept without expiry until synchronized. onUnavailable(err) is told of
// the writes that fail for unavailability (with or without writeBehind).
import { reportCacheError } from './cache-errors.js';
import { MemoryCache } from './cache.js';
import { BackendError, UnsupportedError } from './errors.js';
import { isFault } from '@xufa/faults';

const HEX_ID = /^[0-9a-f]{24}$/;
const UNAVAILABLE = new Set([
  'MongoNetworkError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
]);
const PENDING = 'pending';
// The kinds of pending writes: inserted, updated, deleted.
const INSERT = 'I';
const UPDATE = 'U';
const DELETE = 'D';

// Whether an error says the database is unavailable (not that the write was wrong).
function unavailable(err) {
  return Boolean(err) && (UNAVAILABLE.has(err.name) || isFault(err));
}

function cacheValue(value) {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

class Documents {
  constructor(db, name, options = {}) {
    if (db.backend.name !== 'mongodb') throw new UnsupportedError('db.documents()', db.backend.name);
    this.db = db;
    this.name = name;
    this.ObjectId = db.backend.ObjectId;
    const cache = options.cache === true ? {} : options.cache || null;
    this.cacheSettings = cache
      ? { indexes: cache.indexes || [], ttl: cache.ttl || 0, store: cache.store || null }
      : null;
    this.writeBehind = Boolean(options.writeBehind);
    this.available = typeof options.available === 'function' ? options.available : null;
    this.onUnavailable = typeof options.onUnavailable === 'function' ? options.onUnavailable : null;
    this.prefix = `${db.name}:documents:${name}:`;
    this.connecting = null;
  }

  // The collection of the driver (connecting the database the first time).
  async collection() {
    const { backend } = this.db;
    if (!backend.db) {
      if (!this.connecting) this.connecting = this.db.connect().finally(() => (this.connecting = null));
      await this.connecting;
    }
    return backend.db.collection(this.name);
  }

  // Runs an operation of the database through its faults (db.faults: operations of the model with this name).
  run(operation, fn) {
    const faults = this.db.faultsOf;
    if (faults && faults.rules.length) return faults.apply({ operation, model: this.name, tenant: null }, fn);
    return fn();
  }

  // Ids.

  key(id) {
    return typeof id === 'string' && HEX_ID.test(id) ? new this.ObjectId(id) : id;
  }

  // A document for the database: `id` as `_id`.
  toDb(doc) {
    const out = { ...doc };
    if (out.id) {
      out._id = typeof out.id === 'string' ? this.key(out.id) : out.id;
      delete out.id;
    }
    return out;
  }

  // A document of the database: `_id` as `id` (a string).
  fromDb(doc) {
    if (doc === null || doc === undefined) return null;
    const out = { ...doc };
    if (out._id !== undefined && out._id !== null) {
      out.id = String(out._id);
      delete out._id;
    }
    return out;
  }

  // A filter for the database: `id` as `_id`, its values (and those of $eq, $ne, $in, $nin) as keys.
  filter(filter = {}) {
    if (!filter || filter.id === undefined) return filter || {};
    const { id, ...rest } = filter;
    let value = id;
    if (value && typeof value === 'object' && !(value instanceof this.ObjectId) && !Array.isArray(value)) {
      value = { ...value };
      for (const op of ['$eq', '$ne']) if (op in value) value[op] = this.key(value[op]);
      for (const op of ['$in', '$nin'])
        if (Array.isArray(value[op])) value[op] = value[op].map((item) => this.key(item));
    } else value = this.key(value);
    return { _id: value, ...rest };
  }

  // The cache.

  store() {
    const settings = this.cacheSettings;
    if (settings.store) return settings.store;
    if (!this.db.cache) this.db.cache = new MemoryCache();
    return this.db.cache;
  }

  idKey(id) {
    return `${this.prefix}id:${id}`;
  }

  indexKey(field, value) {
    return `${this.prefix}${field}:${cacheValue(value)}`;
  }

  // The field and value of a filter the cache can answer: one equality on id or on an index.
  lookupOf(filter) {
    if (!this.cacheSettings || !filter || typeof filter !== 'object') return null;
    const keys = Object.keys(filter);
    if (keys.length !== 1) return null;
    const [field] = keys;
    if (field !== 'id' && !this.cacheSettings.indexes.includes(field)) return null;
    const value = filter[field];
    if (value === null || value === undefined || typeof value === 'object') return null;
    return { field, value };
  }

  async cached(lookup) {
    try {
      const store = this.store();
      if (lookup.field === 'id') return await store.get(this.idKey(lookup.value));
      const indexKey = this.indexKey(lookup.field, lookup.value);
      const id = await store.get(indexKey);
      if (id === undefined) return undefined;
      const doc = await store.get(this.idKey(id));
      // An index of a value the document no longer has is not taken.
      if (!doc || cacheValue(doc[lookup.field]) !== cacheValue(lookup.value)) {
        await store.delete(indexKey);
        return undefined;
      }
      return doc;
    } catch (err) {
      reportCacheError(this.db, err, 'get');
      return undefined;
    }
  }

  async keep(doc, ttl = this.cacheSettings && this.cacheSettings.ttl) {
    if (!this.cacheSettings || !doc || doc.id === undefined) return;
    try {
      const store = this.store();
      await store.set(this.idKey(doc.id), doc, ttl);
      for (const field of this.cacheSettings.indexes) {
        const value = doc[field];
        if (value !== null && value !== undefined && typeof value !== 'object') {
          await store.set(this.indexKey(field, value), doc.id, ttl);
        }
      }
    } catch (err) {
      reportCacheError(this.db, err, 'set');
    }
  }

  // Forgetting fails as an error (what the cache kept would be old).
  async forget(id) {
    if (this.cacheSettings && id !== undefined && id !== null) await this.store().delete(this.idKey(String(id)));
  }

  async clearCache() {
    if (this.cacheSettings) await this.store().clear(this.prefix);
  }

  // Reads.

  async findById(id, { projection } = {}) {
    return this.findOne({ id }, { projection });
  }

  async findOne(filter = {}, options = {}) {
    const lookup = options.projection ? null : this.lookupOf(filter);
    let cached;
    if (lookup) {
      cached = await this.cached(lookup);
      if (cached !== undefined) return cached;
    }
    let doc;
    try {
      const collection = await this.collection();
      doc = this.fromDb(await this.run('select', () => collection.findOne(this.filter(filter), options)));
    } catch (err) {
      // While the database is unavailable, a document written behind is still read.
      if (lookup && this.writeBehind && unavailable(err)) {
        const kept = await this.keptBehind(lookup);
        if (kept) return kept;
      }
      throw err;
    }
    if (doc && lookup) await this.keep(doc);
    return doc;
  }

  // The documents of a filter: options of the driver's find (sort, skip, limit, projection, collation, hint...).
  async find(filter = {}, options = {}) {
    return (await this.cursor(filter, options)).toArray();
  }

  // A cursor of the documents (for await, next, toArray), read in batches.
  async cursor(filter = {}, options = {}) {
    const collection = await this.collection();
    const cursor = await this.run('select', async () => collection.find(this.filter(filter), options));
    return cursor.map((doc) => this.fromDb(doc));
  }

  async count(filter = {}, { estimated = false, ...options } = {}) {
    const collection = await this.collection();
    return this.run('count', () =>
      estimated ? collection.estimatedDocumentCount(options) : collection.countDocuments(this.filter(filter), options)
    );
  }

  // The documents of a pipeline (its _id as id, as documents are).
  async aggregate(pipeline, options = {}) {
    const collection = await this.collection();
    return this.run('aggregate', () =>
      collection
        .aggregate(pipeline, options)
        .map((doc) => this.fromDb(doc))
        .toArray()
    );
  }

  // Writes.

  async insertOne(doc) {
    const item = this.toDb(doc);
    try {
      if (await this.isAvailable()) {
        const collection = await this.collection();
        await this.run('insert', () => collection.insertOne(item));
        const out = this.fromDb(item);
        await this.keep(out);
        return out;
      }
    } catch (err) {
      if (!(await this.failed(err))) throw err;
    }
    return this.insertBehind(doc);
  }

  async insertMany(docs) {
    const items = docs.map((doc) => this.toDb(doc));
    const collection = await this.collection();
    await this.run('insert', () => collection.insertMany(items));
    const out = items.map((item) => this.fromDb(item));
    if (this.cacheSettings) for (const doc of out) await this.keep(doc);
    return out;
  }

  // $set of the fields of the document (by its id), and the document as it is now (null when there is none).
  async update(doc) {
    const { id, ...fields } = doc;
    try {
      if (await this.isAvailable()) {
        const collection = await this.collection();
        const filter = { _id: this.key(id) };
        const updated = await this.run('update', () =>
          collection.findOneAndUpdate(filter, { $set: fields }, { returnDocument: 'after' })
        );
        const out = this.fromDb(updated);
        if (out) await this.keep(out);
        else await this.forget(id);
        return out;
      }
    } catch (err) {
      if (!(await this.failed(err))) throw err;
    }
    return this.updateBehind(doc, true);
  }

  // The document replaced by this one (by its id), and as it is now.
  async replace(doc) {
    const { id, ...fields } = doc;
    try {
      if (await this.isAvailable()) {
        const collection = await this.collection();
        const replaced = await this.run('update', () =>
          collection.findOneAndReplace({ _id: this.key(id) }, fields, { returnDocument: 'after' })
        );
        const out = this.fromDb(replaced);
        if (out) await this.keep(out);
        else await this.forget(id);
        return out;
      }
    } catch (err) {
      if (!(await this.failed(err))) throw err;
    }
    return this.updateBehind(doc, false);
  }

  // Inserts a document without id, or with one that does not exist; updates the one with its id.
  async save(doc) {
    if (!doc.id) return this.insertOne(doc);
    if (!(await this.isAvailable())) return this.writeBehind ? this.saveBehind(doc) : this.update(doc);
    let exists;
    try {
      const collection = await this.collection();
      exists = await this.run('select', () => collection.countDocuments({ _id: this.key(doc.id) }, { limit: 1 }));
    } catch (err) {
      if (!(await this.failed(err))) throw err;
      return this.saveBehind(doc);
    }
    return exists ? this.update(doc) : this.insertOne(doc);
  }

  async updateMany(filter, update, options = {}) {
    const collection = await this.collection();
    const result = await this.run('update', () => collection.updateMany(this.filter(filter), update, options));
    await this.clearCache();
    return result;
  }

  // Deletes the documents of a filter (justOne: the first): how many.
  async remove(filter = {}, { justOne = false } = {}) {
    const collection = await this.collection();
    const query = this.filter(filter);
    const result = await this.run('delete', () =>
      justOne ? collection.deleteOne(query) : collection.deleteMany(query)
    );
    await this.clearCache();
    return result.deletedCount;
  }

  async removeById(id) {
    try {
      if (await this.isAvailable()) {
        const collection = await this.collection();
        const result = await this.run('delete', () => collection.deleteOne({ _id: this.key(id) }));
        await this.forget(id);
        return result.deletedCount;
      }
    } catch (err) {
      if (!(await this.failed(err))) throw err;
    }
    await this.forget(id);
    await this.markPending(String(id), DELETE);
    return 1;
  }

  // The driver's findOneAndUpdate / Replace / Delete (returnDocument 'before' by default, includeResultMetadata...),
  // with documents as documents are; the cache keeps the document after, or forgets it.
  async findOneAndUpdate(filter, update, options = {}) {
    return this.findOneAnd('findOneAndUpdate', 'update', filter, update, options);
  }

  async findOneAndReplace(filter, replacement, options = {}) {
    const { id, ...fields } = replacement;
    return this.findOneAnd('findOneAndReplace', 'update', filter, fields, options);
  }

  async findOneAndDelete(filter, options = {}) {
    return this.findOneAnd('findOneAndDelete', 'delete', filter, undefined, options);
  }

  async findOneAnd(method, operation, filter, change, options) {
    const collection = await this.collection();
    const args = change === undefined ? [this.filter(filter), options] : [this.filter(filter), change, options];
    const result = await this.run(operation, () => collection[method](...args));
    const raw = options.includeResultMetadata ? result && result.value : result;
    const doc = this.fromDb(raw);
    if (this.cacheSettings && doc) {
      if (method !== 'findOneAndDelete' && options.returnDocument === 'after' && !options.projection)
        await this.keep(doc);
      else await this.forget(doc.id);
    }
    return options.includeResultMetadata ? { ...result, value: doc } : doc;
  }

  // The driver's bulkWrite (filters as the driver takes them: `_id`); the collection's cache is forgotten.
  async bulkWrite(operations, options = {}) {
    const collection = await this.collection();
    const result = await this.run('update', () => collection.bulkWrite(operations, options));
    await this.clearCache();
    return result;
  }

  // Indexes and the collection.

  async createIndex(keys, options) {
    return (await this.collection()).createIndex(keys, options);
  }

  async dropIndex(name, options) {
    return (await this.collection()).dropIndex(name, options);
  }

  async indexes() {
    return (await this.collection()).indexes();
  }

  async drop() {
    await this.clearCache();
    return (await this.collection()).drop();
  }

  async rename(newName, options) {
    await this.clearCache();
    await (await this.collection()).rename(newName, options);
    return this.db.documents(newName);
  }

  // Write-behind.

  async isAvailable() {
    if (!this.available) return true;
    try {
      return Boolean(await this.available());
    } catch {
      return false;
    }
  }

  // A write that failed: whether it goes behind (with writeBehind, when the database is unavailable; onUnavailable is
  // told of the unavailability first).
  async failed(err) {
    if (!unavailable(err)) return false;
    if (this.onUnavailable) {
      try {
        await this.onUnavailable(err);
      } catch {
        // What it does is its own: the write goes on.
      }
    }
    return this.writeBehind;
  }

  noWriteBehind() {
    return new BackendError(`The database of ${this.name} is not available, and it has no writeBehind`);
  }

  async keptBehind(lookup) {
    try {
      return (await this.cached(lookup)) || null;
    } catch {
      return null;
    }
  }

  async insertBehind(doc) {
    if (!this.writeBehind) throw this.noWriteBehind();
    const out = { id: new this.ObjectId().toHexString(), ...doc };
    if (typeof out.id !== 'string') out.id = String(out.id);
    await this.keep(out, 0);
    await this.markPending(out.id, INSERT);
    return out;
  }

  async updateBehind(doc, merge) {
    if (!this.writeBehind) throw this.noWriteBehind();
    const id = String(doc.id);
    let out = { ...doc, id };
    if (merge) {
      const old = await this.cached({ field: 'id', value: id });
      if (!old) throw new BackendError(`The database of ${this.name} is not available, and ${id} is not in the cache`);
      out = { ...old, ...doc, id };
    }
    await this.keep(out, 0);
    if ((await this.pendingOf(id)) !== INSERT) await this.markPending(id, UPDATE);
    return out;
  }

  async saveBehind(doc) {
    if (!this.writeBehind) throw this.noWriteBehind();
    const id = String(doc.id);
    const out = { ...doc, id };
    await this.keep(out, 0);
    if ((await this.pendingOf(id)) !== INSERT) await this.markPending(id, UPDATE);
    return out;
  }

  // The writes waiting for the database: { id: 'I' | 'U' | 'D' }.
  async pending() {
    if (!this.cacheSettings) return {};
    return (await this.store().get(`${this.prefix}${PENDING}`)) || {};
  }

  async pendingOf(id) {
    return (await this.pending())[id];
  }

  async markPending(id, kind) {
    if (!this.cacheSettings) throw new BackendError(`writeBehind of ${this.name} needs its option cache`);
    const pending = await this.pending();
    pending[id] = kind;
    await this.store().set(`${this.prefix}${PENDING}`, pending, 0);
  }

  async donePending(id) {
    const pending = await this.pending();
    delete pending[id];
    await this.store().set(`${this.prefix}${PENDING}`, pending, 0);
  }

  // Writes what was written behind: { done, failed } (the first error stops it; what is left waits for the next).
  async synchronize() {
    const pending = await this.pending();
    let done = 0;
    let error = null;
    const collection = await this.collection();
    for (const [id, kind] of Object.entries(pending)) {
      try {
        if (kind === DELETE) await collection.deleteOne({ _id: this.key(id) });
        else {
          const doc = await this.cached({ field: 'id', value: id });
          if (doc) {
            const { id: docId, ...fields } = doc;
            await collection.updateOne({ _id: this.key(id) }, { $set: fields }, { upsert: true });
            await this.keep(doc);
          }
        }
        await this.donePending(id);
        done += 1;
      } catch (err) {
        error = err;
        break;
      }
    }
    return { done, left: Object.keys(pending).length - done, error };
  }
}

export { Documents, unavailable };
