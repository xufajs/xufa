// MongoClient: the deployment (lib/topology.js) and the API of the official driver for what an application uses
// most: databases, collections, cursors, sessions and transactions. Writes go to the primary and reads follow the
// read preference; single writes and reads are retried once when their server fails (retryWrites, retryReads).
//
//   const client = await new MongoClient('mongodb://localhost:27017/app').connect();
//   const users = client.db().collection('users');
//   await users.insertOne({ name: 'Ada' });
//   const found = await users.find({ name: /^a/i }).sort({ name: 1 }).toArray();
import { promises as dns } from 'node:dns';
import { randomUUID } from 'node:crypto';
import { Topology, isRetryable, isStateChange } from './topology.js';
import { COMPRESSORS } from './connection.js';
import { ObjectId, Binary, cursorIdOf, serializeSections } from './bson.js';
import { MongoError, MongoNetworkError, MongoNotConnectedError } from './errors.js';

function parseUrl(url) {
  const match = /^(mongodb(?:\+srv)?):\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([^/?]+)(?:\/([^?]*))?(?:\?(.*))?$/.exec(url);
  if (!match) throw new MongoError(`Invalid MongoDB connection string: ${url}`);
  const [, scheme, user, password, hosts, database, query] = match;
  const options = Object.fromEntries(new URLSearchParams(query || ''));
  return {
    srv: scheme === 'mongodb+srv',
    username: user ? decodeURIComponent(user) : undefined,
    password: password !== undefined ? decodeURIComponent(password) : undefined,
    hosts: hosts.split(',').map((item) => {
      const index = item.lastIndexOf(':');
      const host = index > 0 && !item.endsWith(']') ? item.slice(0, index) : item;
      const port = index > 0 && !item.endsWith(']') ? Number(item.slice(index + 1)) : 27017;
      return { host: host.replace(/^\[|\]$/g, ''), port };
    }),
    database: database ? decodeURIComponent(database) : undefined,
    options,
  };
}

const truthy = (value) => value === true || value === 'true';
const falsy = (value) => value === false || value === 'false';

const noop = () => {};

// A cursor reads its batches ahead: when a reply arrives, the getMore of the next batch is sent before the batch is
// decoded (the id of the cursor is read from the bytes of the reply), so the server makes a batch while the client
// decodes the one before. { prefetch: false } turns it off. The getMores go to the server of the first command.
class Cursor {
  constructor(collection, command, options = {}) {
    this.collection = collection;
    this.command = command;
    this.options = options;
    this.buffer = [];
    this.position = 0;
    this.id = null;
    this.started = false;
    this.closed = false;
    this.server = null;
    // map(): what each document is given through.
    this.transform = null;
    // The getMore read ahead, sent but not taken yet.
    this.ahead = null;
    this.onReply = options.prefetch === false ? undefined : (message, offset) => this.readAhead(message, offset);
  }

  sort(sort) {
    this.command.sort = sort;
    return this;
  }

  skip(count) {
    this.command.skip = count;
    return this;
  }

  limit(count) {
    this.command.limit = count;
    return this;
  }

  project(projection) {
    this.command.projection = projection;
    return this;
  }

  collation(collation) {
    this.command.collation = collation;
    return this;
  }

  // The documents of the cursor given through fn (next, toArray, for await): as the official driver, the same cursor,
  // and a second map applies after the first.
  map(fn) {
    const previous = this.transform;
    this.transform = previous ? (doc) => fn(previous(doc)) : fn;
    return this;
  }

  batchSize(size) {
    this.options.batchSize = size;
    if (this.command.find) this.command.batchSize = size;
    else this.command.cursor = { batchSize: size };
    return this;
  }

  async next() {
    if (this.position >= this.buffer.length) await this.fetch();
    if (this.position >= this.buffer.length) return null;
    const doc = this.buffer[this.position];
    this.buffer[this.position] = undefined;
    this.position += 1;
    return this.transform ? this.transform(doc) : doc;
  }

  // Whether next() has a document (it stays for next()).
  async hasNext() {
    if (this.position >= this.buffer.length) await this.fetch();
    return this.position < this.buffer.length;
  }

  // fn with each document, until there are no more or it returns false.
  async forEach(fn) {
    for (let doc = await this.next(); doc !== null; doc = await this.next()) {
      if (fn(doc) === false) break;
    }
  }

  run(command, extra) {
    const { client, db } = this.collection;
    const { session, readPreference } = this.options;
    return client.run(db.name, command, { session, readPreference, ...extra });
  }

  getMore() {
    const command = { getMore: BigInt(this.id), collection: this.collection.name };
    if (this.options.batchSize) command.batchSize = this.options.batchSize;
    return this.run(command, { onReply: this.onReply, server: this.server });
  }

  // Called with the bytes of every reply of the cursor before they are decoded: sends the next getMore at once.
  readAhead(message, offset) {
    if (this.closed || this.ahead) return;
    const id = cursorIdOf(message, offset);
    if (id === null || id === 0n) return;
    this.id = id;
    this.ahead = this.getMore();
    // Its errors are thrown by the fetch that takes it, and not reported as unhandled when none does.
    this.ahead.catch(noop);
  }

  async fetch() {
    if (!this.started) {
      this.started = true;
      const reply = await this.run(this.command, {
        onReply: this.onReply,
        retry: this.options.write ? false : 'read',
        onServer: (server) => {
          this.server = server;
        },
      });
      this.id = reply.cursor.id;
      this.buffer = reply.cursor.firstBatch;
      this.position = 0;
      return;
    }
    let request = this.ahead;
    this.ahead = null;
    if (!request) {
      if (!this.id || this.id === 0n) return;
      request = this.getMore();
    }
    const reply = await request;
    this.id = reply.cursor.id;
    this.buffer = reply.cursor.nextBatch;
    this.position = 0;
  }

  // Takes whole batches at a time.
  async toArray() {
    const items = [];
    for (;;) {
      if (this.position >= this.buffer.length) await this.fetch();
      if (this.position >= this.buffer.length) return items;
      const { transform } = this;
      for (let i = this.position; i < this.buffer.length; i += 1) {
        items.push(transform ? transform(this.buffer[i]) : this.buffer[i]);
      }
      this.buffer = [];
      this.position = 0;
    }
  }

  async close() {
    this.closed = true;
    // A getMore read ahead has to end before the cursor is killed (the server does not kill a cursor in use).
    if (this.ahead) {
      const reply = await this.ahead.catch(() => null);
      this.ahead = null;
      if (reply) this.id = reply.cursor.id;
    }
    if (this.id && this.id !== 0n && this.server) {
      await this.run({ killCursors: this.collection.name, cursors: [BigInt(this.id)] }, { server: this.server }).catch(
        noop
      );
    }
    this.id = 0;
    this.buffer = [];
    this.position = 0;
  }

  async *[Symbol.asyncIterator]() {
    try {
      for (let item = await this.next(); item !== null; item = await this.next()) yield item;
    } finally {
      await this.close();
    }
  }
}

// Unordered inserts are cut in parts of this number of documents at least.
const UNORDERED_PART = 1000;
// The bytes of the messages of documents (and the size of the header of a message, before its sections).
const BATCH_BYTES = 4 * 1024 * 1024;
const MESSAGE_HEADER = 20;

// The keys of an index as the official driver takes them: { field: 1 }, 'field', or [['field', 1], ...].
function indexKeys(keys) {
  if (typeof keys === 'string') return { [keys]: 1 };
  if (Array.isArray(keys)) {
    const key = {};
    for (const item of keys) {
      if (typeof item === 'string') key[item] = 1;
      else key[item[0]] = item[1];
    }
    return key;
  }
  return keys;
}

// The default name of an index: field_direction joined by _ (slug_1, a_1_b_-1, title_text).
function indexName(key) {
  return Object.entries(key)
    .map(([field, value]) => `${field}_${value}`)
    .join('_');
}

// As the official driver, documents without _id get one (the server keeps _id first in the documents stored).
function withId(doc) {
  if (doc._id === undefined) doc._id = new ObjectId();
  return doc;
}

// Stages of aggregations that write (they run on the primary).
function writesTo(pipeline) {
  return pipeline.some((stage) => stage && (stage.$out !== undefined || stage.$merge !== undefined));
}

// (Options of the methods may be null, as the official driver takes them.)
class Collection {
  constructor(db, name) {
    this.db = db;
    this.client = db.client;
    this.name = name;
  }

  // The official driver's names of it.
  get collectionName() {
    return this.name;
  }

  get dbName() {
    return this.db.name;
  }

  // A write (on the primary), retried once when `retry` and its server fails. options.writeConcern is sent with it.
  write(command, options, retry) {
    const doc = options.writeConcern ? { ...command, writeConcern: options.writeConcern } : command;
    return this.client.run(this.db.name, doc, { session: options.session, retry: retry ? 'write' : false });
  }

  // A read (by the read preference), retried once when its server fails.
  read(command, options) {
    return this.client.run(this.db.name, command, {
      session: options.session,
      readPreference: options.readPreference,
      retry: 'read',
    });
  }

  find(filter = {}, options) {
    options = options ?? {};
    const {
      session,
      sort,
      skip,
      limit,
      projection,
      batchSize,
      hint,
      collation,
      allowDiskUse,
      prefetch,
      readPreference,
    } = options;
    const command = {
      find: this.name,
      filter,
      sort,
      skip,
      limit,
      projection,
      batchSize,
      hint,
      collation,
      allowDiskUse,
    };
    return new Cursor(this, command, { session, batchSize, prefetch, readPreference });
  }

  async findOne(filter = {}, options) {
    options = options ?? {};
    const [doc] = await this.find(filter, { ...options, limit: 1, batchSize: 1 }).toArray();
    return doc || null;
  }

  aggregate(pipeline, options) {
    options = options ?? {};
    const { session, batchSize, allowDiskUse, hint, collation, prefetch, readPreference } = options;
    const command = {
      aggregate: this.name,
      pipeline,
      cursor: batchSize ? { batchSize } : {},
      allowDiskUse,
      hint,
      collation,
    };
    const write = writesTo(pipeline);
    return new Cursor(this, command, {
      session,
      batchSize,
      prefetch,
      readPreference: write ? undefined : readPreference,
      write,
    });
  }

  // The count the collection's metadata keeps (fast; not filtered).
  async estimatedDocumentCount(options) {
    options = options ?? {};
    const reply = await this.read({ count: this.name }, options);
    return reply.n;
  }

  async countDocuments(filter = {}, options) {
    options = options ?? {};
    const pipeline = [{ $match: filter }];
    if (options.skip) pipeline.push({ $skip: options.skip });
    if (options.limit) pipeline.push({ $limit: options.limit });
    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });
    const [result] = await this.aggregate(pipeline, options).toArray();
    return result ? result.n : 0;
  }

  async insertOne(doc, options) {
    options = options ?? {};
    const document = withId(doc);
    await this.write({ insert: this.name, documents: [document], ordered: true }, options, true);
    return { acknowledged: true, insertedId: document._id };
  }

  // Inserts the documents (those without _id get one, so their ids are known) in messages of a few megabytes, one
  // after the other when ordered (the default: the first error stops the insert), encoding the next while the
  // server inserts one. Unordered, a large insert is cut in parts sent at the same time on the connections of the
  // pool, which the server inserts in parallel; the first error is thrown when every part has ended.
  async insertMany(docs, options) {
    options = options ?? {};
    const documents = docs.map(withId);
    const ordered = options.ordered !== false;
    const command = { insert: this.name, ordered, writeConcern: options.writeConcern };
    if (ordered) await this.client.writeBatches(this.db.name, command, 'documents', documents, options.session);
    else {
      const part = Math.max(UNORDERED_PART, Math.ceil(documents.length / this.client.maxPoolSize));
      const parts = [];
      for (let start = 0; start < documents.length; start += part) {
        parts.push(documents.slice(start, start + part));
      }
      const results = await Promise.allSettled(
        parts.map((items) => this.client.writeBatches(this.db.name, command, 'documents', items, options.session))
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
    return { acknowledged: true, insertedCount: documents.length, insertedIds: documents.map((doc) => doc._id) };
  }

  // Updates of one document are retryable writes; those of many are not (as in the official driver).
  async update(filter, update, multi, options) {
    const statement = { q: filter, u: update, multi, upsert: Boolean(options.upsert) };
    if (options.arrayFilters) statement.arrayFilters = options.arrayFilters;
    const reply = await this.write({ update: this.name, updates: [statement] }, options, !multi);
    return {
      acknowledged: true,
      matchedCount: reply.n - (reply.upserted ? reply.upserted.length : 0),
      modifiedCount: reply.nModified,
      upsertedCount: reply.upserted ? reply.upserted.length : 0,
      upsertedId: reply.upserted ? reply.upserted[0]._id : null,
    };
  }

  updateOne(filter, update, options) {
    options = options ?? {};
    return this.update(filter, update, false, options);
  }

  updateMany(filter, update, options) {
    options = options ?? {};
    return this.update(filter, update, true, options);
  }

  replaceOne(filter, replacement, options) {
    options = options ?? {};
    return this.update(filter, replacement, false, options);
  }

  async remove(filter, limit, options) {
    const reply = await this.write({ delete: this.name, deletes: [{ q: filter, limit }] }, options, limit === 1);
    return { acknowledged: true, deletedCount: reply.n };
  }

  deleteOne(filter, options) {
    options = options ?? {};
    return this.remove(filter, 1, options);
  }

  deleteMany(filter, options) {
    options = options ?? {};
    return this.remove(filter, 0, options);
  }

  // findAndModify, as the official driver: the document before (returnDocument 'before', the default) or after the
  // change, or null; with includeResultMetadata, { value, ok, lastErrorObject }. A retryable write.
  async findAndModify(filter, change, options) {
    const { returnDocument, upsert, projection, sort, arrayFilters, collation, hint, includeResultMetadata } = options;
    const command = { findAndModify: this.name, query: filter, ...change, sort, fields: projection, collation, hint };
    if (!change.remove) {
      command.new = returnDocument === 'after';
      command.upsert = Boolean(upsert);
      if (arrayFilters) command.arrayFilters = arrayFilters;
    }
    const reply = await this.write(command, options, true);
    const value = reply.value === undefined ? null : reply.value;
    return includeResultMetadata ? { value, ok: reply.ok, lastErrorObject: reply.lastErrorObject } : value;
  }

  findOneAndUpdate(filter, update, options) {
    options = options ?? {};
    return this.findAndModify(filter, { update }, options);
  }

  findOneAndReplace(filter, replacement, options) {
    options = options ?? {};
    return this.findAndModify(filter, { update: replacement }, options);
  }

  findOneAndDelete(filter, options) {
    options = options ?? {};
    return this.findAndModify(filter, { remove: true }, options);
  }

  // Renames the collection (renameCollection, on admin): the collection of the new name.
  async rename(newName, options) {
    options = options ?? {};
    const command = { renameCollection: `${this.db.name}.${this.name}`, to: `${this.db.name}.${newName}` };
    if (options.dropTarget) command.dropTarget = true;
    await this.client.run('admin', command, { session: options.session });
    return this.db.collection(newName);
  }

  // Inserts, updates, replacements and deletes in as few commands as they can go: as the official driver, ordered (the
  // default) keeps their order (a run of the same kind is one command) and stops at the first error; unordered sends
  // each kind once, inserts first. The result counts them: insertedCount, matchedCount, modifiedCount, deletedCount, upsertedCount,
  // and insertedIds and upsertedIds by the index of their operation.
  async bulkWrite(operations, options) {
    options = options ?? {};
    const ordered = options.ordered !== false;
    const runs = [];
    const runOf = (kind) => {
      if (ordered) {
        const last = runs[runs.length - 1];
        if (last && last.kind === kind) return last;
      } else {
        const found = runs.find((run) => run.kind === kind);
        if (found) return found;
      }
      const run = { kind, items: [], indexes: [] };
      runs.push(run);
      return run;
    };
    operations.forEach((operation, index) => {
      const [name] = Object.keys(operation);
      const op = operation[name];
      let run;
      let item;
      switch (name) {
        case 'insertOne':
          run = runOf('insert');
          item = withId(op.document);
          break;
        case 'updateOne':
        case 'updateMany':
        case 'replaceOne':
          run = runOf('update');
          item = { q: op.filter, u: name === 'replaceOne' ? op.replacement : op.update, multi: name === 'updateMany' };
          item.upsert = Boolean(op.upsert);
          if (op.arrayFilters) item.arrayFilters = op.arrayFilters;
          if (op.collation) item.collation = op.collation;
          if (op.hint) item.hint = op.hint;
          break;
        case 'deleteOne':
        case 'deleteMany':
          run = runOf('delete');
          item = { q: op.filter, limit: name === 'deleteOne' ? 1 : 0 };
          if (op.collation) item.collation = op.collation;
          if (op.hint) item.hint = op.hint;
          break;
        default:
          throw new TypeError(`Unknown operation of bulkWrite: ${name}`);
      }
      run.items.push(item);
      run.indexes.push(index);
    });
    const result = {
      acknowledged: true,
      insertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
      insertedIds: {},
      upsertedIds: {},
    };
    const { session, writeConcern } = options;
    const send = async (run) => {
      const field = { insert: 'documents', update: 'updates', delete: 'deletes' }[run.kind];
      const command = { [run.kind]: this.name, ordered, writeConcern };
      const totals = await this.client.writeBatches(this.db.name, command, field, run.items, session);
      if (run.kind === 'insert') {
        result.insertedCount += totals.n;
        run.items.forEach((doc, i) => {
          result.insertedIds[run.indexes[i]] = doc._id;
        });
      } else if (run.kind === 'delete') {
        result.deletedCount += totals.n;
      } else {
        result.upsertedCount += totals.upserted.length;
        result.matchedCount += totals.n - totals.upserted.length;
        result.modifiedCount += totals.nModified;
        for (const { index, _id } of totals.upserted) result.upsertedIds[run.indexes[index]] = _id;
      }
    };
    if (ordered) {
      for (const run of runs) await send(run);
    } else {
      // (As the official driver: the inserts, then the updates, then the deletes. Their ids are by the index of the
      // operation in the list given; the official driver numbers them its own way when unordered.)
      const order = ['insert', 'update', 'delete'];
      runs.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      for (const run of runs) await send(run);
    }
    return result;
  }

  async createIndex(keys, options) {
    options = options ?? {};
    const { session, ...rest } = options;
    const key = indexKeys(keys);
    const name = rest.name || indexName(key);
    await this.write({ createIndexes: this.name, indexes: [{ key, ...rest, name }] }, { session });
    return name;
  }

  // Several indexes in one command: their names.
  async createIndexes(specs, options) {
    options = options ?? {};
    const { session, ...rest } = options;
    const indexes = specs.map(({ key, name, ...spec }) => ({ key, ...spec, name: name || indexName(key) }));
    await this.write({ createIndexes: this.name, indexes, ...rest }, { session });
    return indexes.map((index) => index.name);
  }

  // The reply of the server ({ nIndexesWas, ok }), as the official driver.
  dropIndex(name, options) {
    options = options ?? {};
    return this.write({ dropIndexes: this.name, index: name }, options);
  }

  // Every index but _id's.
  async dropIndexes(options) {
    options = options ?? {};
    await this.write({ dropIndexes: this.name, index: '*' }, options);
    return true;
  }

  // The indexes, as a cursor (every batch of them).
  listIndexes(options) {
    options = options ?? {};
    const { session, readPreference, batchSize } = options;
    const command = { listIndexes: this.name, cursor: batchSize ? { batchSize } : {} };
    return new Cursor(this, command, { session, readPreference, batchSize });
  }

  indexes(options) {
    options = options ?? {};
    return this.listIndexes(options).toArray();
  }

  async indexExists(names, options) {
    options = options ?? {};
    const existing = new Set((await this.indexes(options)).map((index) => index.name));
    return [].concat(names).every((name) => existing.has(name));
  }

  // Drops the collection: false when it did not exist.
  async drop(options) {
    options = options ?? {};
    try {
      await this.write({ drop: this.name }, options);
      return true;
    } catch (err) {
      if (err.code === 26) return false;
      throw err;
    }
  }
}

class Db {
  constructor(client, name) {
    this.client = client;
    this.name = name;
  }

  // The official driver's name of it.
  get databaseName() {
    return this.name;
  }

  collection(name) {
    return new Collection(this, name);
  }

  // A command, on the primary (or by `readPreference`).
  command(command, options) {
    options = options ?? {};
    return this.client.run(this.name, command, { session: options.session, readPreference: options.readPreference });
  }

  // The collections, as a cursor (toArray(), for await), as the official driver.
  listCollections(filter = {}, { nameOnly = false, readPreference, session, batchSize } = {}) {
    const command = { listCollections: 1, filter, nameOnly, cursor: batchSize ? { batchSize } : {} };
    const target = { client: this.client, db: this, name: '$cmd.listCollections' };
    return new Cursor(target, command, { readPreference, session, batchSize });
  }

  async createCollection(name, options) {
    options = options ?? {};
    await this.command({ create: name, ...options });
    return this.collection(name);
  }

  async dropDatabase() {
    await this.command({ dropDatabase: 1 });
  }

  // The commands of the deployment (on admin), as the official driver's db.admin().
  admin() {
    return new Admin(this.client);
  }
}

class Admin {
  constructor(client) {
    this.client = client;
  }

  command(command, options = {}) {
    return this.client.run('admin', command, { session: options.session, readPreference: options.readPreference });
  }

  // { databases: [{ name, sizeOnDisk, empty }], totalSize, ok }.
  listDatabases({ nameOnly, session } = {}) {
    return this.command(nameOnly ? { listDatabases: 1, nameOnly: true } : { listDatabases: 1 }, { session });
  }

  ping(options) {
    return this.command({ ping: 1 }, options);
  }

  serverStatus(options) {
    return this.command({ serverStatus: 1 }, options);
  }

  buildInfo(options) {
    return this.command({ buildInfo: 1 }, options);
  }
}

function newSessionId() {
  return { id: new Binary(Buffer.from(randomUUID().replace(/-/g, ''), 'hex'), 4) };
}

// A logical session, for transactions: pass it as { session } to the operations made in it.
class ClientSession {
  constructor(client) {
    this.client = client;
    this.id = newSessionId();
    this.txnNumber = 0n;
    this.transaction = null;
  }

  get inTransaction() {
    return this.transaction !== null;
  }

  startTransaction() {
    if (this.transaction) throw new MongoError('A transaction is already in progress');
    this.txnNumber += 1n;
    this.transaction = { started: false };
  }

  // The fields of a command in the session (and in its transaction).
  apply(command) {
    command.lsid = this.id;
    if (this.transaction) {
      command.txnNumber = this.txnNumber;
      command.autocommit = false;
      if (!this.transaction.started) {
        command.startTransaction = true;
        this.transaction.started = true;
      }
    }
  }

  async end(command, extra = {}) {
    const { transaction } = this;
    this.transaction = null;
    if (!transaction || !transaction.started) return;
    if (command === 'commitTransaction') this.committed = this.txnNumber;
    await this.runEnd(command, extra);
  }

  // commitTransaction and abortTransaction are retried once (they are retryable writes). A network error of a commit
  // leaves its result unknown (UnknownTransactionCommitResult), as the drivers of MongoDB label it.
  async runEnd(command, extra) {
    try {
      await this.client.run(
        'admin',
        { [command]: 1, lsid: this.id, txnNumber: this.txnNumber, autocommit: false, ...extra },
        { retry: 'write', keepSession: true }
      );
    } catch (err) {
      // (Errors of the server come with their labels.)
      if (command === 'commitTransaction' && err instanceof MongoNetworkError)
        labelOf(err, 'UnknownTransactionCommitResult');
      throw err;
    }
  }

  commitTransaction() {
    return this.end('commitTransaction');
  }

  // Commits the last transaction again (its result was unknown): with a majority write concern, as the drivers do.
  async retryCommit() {
    if (this.committed !== this.txnNumber) throw new MongoError('There is no commit to retry');
    await this.runEnd('commitTransaction', { writeConcern: { w: 'majority', wtimeout: 10000 } });
  }

  abortTransaction() {
    return this.end('abortTransaction');
  }

  // Runs fn(session) in a transaction: committed when it ends, aborted when it throws. As the drivers of MongoDB do
  // (the Convenient API for Transactions), the whole transaction runs again on a TransientTransactionError (a write
  // conflict, an election, a network error inside it), and its commit again on an UnknownTransactionCommitResult,
  // until `timeout` (120 s) has passed since it started; fn may then run more than once.
  async withTransaction(fn, { timeout = TRANSACTION_TIMEOUT } = {}) {
    const start = Date.now();
    const inTime = () => Date.now() - start < timeout;
    for (;;) {
      this.startTransaction();
      let result;
      try {
        result = await fn(this);
      } catch (err) {
        // Errors inside a transaction are transient when they are of the network (the transaction can run again).
        if (err instanceof MongoNetworkError) labelOf(err, 'TransientTransactionError');
        if (this.transaction) await this.abortTransaction().catch(() => {});
        if (hasLabel(err, 'TransientTransactionError') && inTime()) continue;
        throw err;
      }
      // fn ended the transaction itself: nothing to commit.
      if (!this.transaction) return result;
      try {
        await this.commitTransaction();
        return result;
      } catch (first) {
        let err = first;
        // The result of the commit is unknown: committed again, while there is time.
        while (hasLabel(err, 'UnknownTransactionCommitResult') && codeOf(err) !== 'MaxTimeMSExpired' && inTime()) {
          try {
            await this.retryCommit();
            return result;
          } catch (again) {
            err = again;
          }
        }
        if (hasLabel(err, 'TransientTransactionError') && inTime()) continue;
        throw err;
      }
    }
  }

  async endSession() {
    if (this.transaction) await this.abortTransaction().catch(() => {});
    await this.client.run('admin', { endSessions: [this.id] }).catch(() => {});
  }
}

// How long withTransaction() retries a transaction (as the drivers of MongoDB: 120 s).
const TRANSACTION_TIMEOUT = 120000;

// Whether an error (or its cause: an error of the ORM over one of the driver) has a label.
function hasLabel(err, label) {
  for (let current = err, depth = 0; current && depth < 5; current = current.cause, depth += 1) {
    if (Array.isArray(current.errorLabels) && current.errorLabels.includes(label)) return true;
  }
  return false;
}

// The name of the code of an error of the server (or of its cause).
const codeOf = (err) => (err && (err.codeName || (err.cause && err.cause.codeName))) || null;

// Adds a label to an error (errors of the network have none from the server).
function labelOf(err, label) {
  if (!err || typeof err !== 'object') return;
  if (!Array.isArray(err.errorLabels)) err.errorLabels = [];
  if (!err.errorLabels.includes(label)) err.errorLabels.push(label);
}

const DEFAULT_COMPRESSORS = [];

class MongoClient {
  constructor(url = 'mongodb://127.0.0.1:27017', options = {}) {
    this.url = url;
    this.parsed = parseUrl(url);
    this.options = { ...this.parsed.options, ...options };
    this.maxPoolSize = Number(this.options.maxPoolSize || 5);
    this.readPreference = this.options.readPreference || 'primary';
    this.retryWrites = !falsy(this.options.retryWrites);
    this.retryReads = !falsy(this.options.retryReads);
    this.topology = null;
    this.closed = false;
    this.opening = null;
    // Server sessions (lsid) of retryable writes, reused.
    this.sessions = [];
  }

  // The hello of the primary (or of a server): the limits of the deployment.
  get hello() {
    if (!this.topology) return null;
    const primary = this.topology.primary;
    if (primary) return primary.hello;
    for (const server of this.topology.servers.values()) if (server.hello) return server.hello;
    return null;
  }

  get maxWriteBatchSize() {
    return (this.hello && this.hello.maxWriteBatchSize) || 100000;
  }

  // Whether the deployment has transactions and retryable writes (replica sets and sharded clusters).
  get supportsTransactions() {
    return Boolean(
      this.topology && this.topology.type !== 'Single' && this.hello && this.hello.logicalSessionTimeoutMinutes
    );
  }

  // Every connection of the pools (of every server).
  get connections() {
    if (!this.topology) return [];
    return [...this.topology.servers.values()].flatMap((server) => server.connections);
  }

  async resolveHosts() {
    const { parsed, options } = this;
    if (!parsed.srv) return parsed.hosts;
    const [{ host }] = parsed.hosts;
    const records = await dns.resolveSrv(`_mongodb._tcp.${host}`);
    try {
      const txt = await dns.resolveTxt(host);
      const extra = Object.fromEntries(new URLSearchParams(txt.map((parts) => parts.join('')).join('&')));
      this.options = { ...extra, ...options };
    } catch {
      // No TXT record: no options from DNS.
    }
    if (this.options.tls === undefined && this.options.ssl === undefined) this.options.tls = true;
    return records.map((record) => ({ host: record.name, port: record.port }));
  }

  topologyOptions() {
    const { options, parsed } = this;
    const compressors = String(options.compressors || DEFAULT_COMPRESSORS.join(','))
      .split(',')
      .map((name) => name.trim())
      .filter((name) => COMPRESSORS[name]);
    const number = (value, fallback) => (value === undefined ? fallback : Number(value));
    return {
      tls: truthy(options.tls) || truthy(options.ssl),
      tlsOptions: options.tlsOptions,
      connectTimeoutMS: number(options.connectTimeoutMS, undefined),
      appName: options.appName,
      compressors,
      zlibCompressionLevel: number(options.zlibCompressionLevel, undefined),
      // As the official driver: undefined values are written as null unless ignoreUndefined.
      ignoreUndefined: truthy(options.ignoreUndefined),
      username: options.username || parsed.username,
      password: options.password !== undefined ? options.password : parsed.password || '',
      authSource: options.authSource || parsed.database || 'admin',
      authMechanism: options.authMechanism || 'SCRAM-SHA-256',
      maxPoolSize: this.maxPoolSize,
      heartbeatFrequencyMS: Math.max(500, number(options.heartbeatFrequencyMS, 10000)),
      serverSelectionTimeoutMS: number(options.serverSelectionTimeoutMS, 30000),
      localThresholdMS: number(options.localThresholdMS, 15),
      directConnection: truthy(options.directConnection),
      replicaSet: options.replicaSet,
    };
  }

  // Connects: the servers are checked, and it resolves once there is one to write to.
  async connect() {
    this.closed = false;
    if (this.topology && !this.opening) return this;
    if (!this.opening) {
      this.opening = (async () => {
        const hosts = await this.resolveHosts();
        const topology = new Topology(hosts, this.topologyOptions());
        this.topology = topology;
        try {
          await topology.connect();
        } catch (err) {
          topology.close();
          this.topology = null;
          throw err;
        }
        return this;
      })();
    }
    try {
      return await this.opening;
    } finally {
      this.opening = null;
    }
  }

  acquireSession() {
    const timeout = ((this.hello && this.hello.logicalSessionTimeoutMinutes) || 30) - 1;
    while (this.sessions.length) {
      const session = this.sessions.pop();
      if (Date.now() - session.lastUse < timeout * 60000) return session;
    }
    return { id: newSessionId(), txnNumber: 0n, lastUse: Date.now() };
  }

  releaseSession(session) {
    session.lastUse = Date.now();
    this.sessions.push(session);
  }

  // Runs a command. Options: session, readPreference (of reads), retry ('write' or 'read': once, when the server
  // fails), server (to use that one: getMore), onServer (called with the server used), onReply (with the bytes of
  // the reply, before they are decoded).
  async run(database, command, options = {}) {
    if (this.closed) throw new MongoNotConnectedError();
    if (!this.topology) await this.connect();
    const { session, onReply } = options;
    const mode = options.readPreference || (options.retry === 'read' ? this.readPreference : 'primary');
    const inTransaction = Boolean(session && session.inTransaction);
    const write = options.retry === 'write';
    let retry =
      (write && this.retryWrites && this.supportsTransactions && (!inTransaction || options.keepSession)) ||
      (options.retry === 'read' && this.retryReads && !inTransaction);
    const doc = { ...command, $db: database };
    let serverSession = null;
    if (session) session.apply(doc);
    else if (write && retry && !options.keepSession) {
      // A retryable write has a session and a transaction number: the server applies it once, even when sent twice.
      serverSession = this.acquireSession();
      serverSession.txnNumber += 1n;
      doc.lsid = serverSession.id;
      doc.txnNumber = serverSession.txnNumber;
    }
    try {
      for (;;) {
        // (A close() while the command waited.)
        if (!this.topology) throw new MongoNotConnectedError();
        let server = options.server || this.topology.selectNow(mode);
        if (!server) server = await this.topology.select(mode);
        if (mode !== 'primary' || (this.topology.type === 'Single' && server.type === 'RSSecondary')) {
          doc.$readPreference = { mode: mode === 'primary' ? 'primaryPreferred' : mode };
        } else delete doc.$readPreference;
        try {
          const connection = server.idleConnection() || (await server.connection());
          if (options.onServer) options.onServer(server);
          return await connection.command(doc, onReply);
        } catch (err) {
          if (isStateChange(err)) server.markUnknown(err);
          if (!retry || options.server || !isRetryable(err)) throw err;
          retry = false;
        }
      }
    } finally {
      if (serverSession) this.releaseSession(serverSession);
    }
  }

  // Sends a command with documents (a document sequence named `identifier`) in as many messages as needed, one
  // after the other: the next message is encoded while the server runs the one before, and is sent when it ends.
  // Each message is a retryable write (retried once, on the new primary, when its server fails).
  async writeBatches(database, command, identifier, docs, session) {
    if (!this.topology) await this.connect();
    const { maxMessageSizeBytes = 48000000, maxWriteBatchSize = 100000 } = this.hello || {};
    const maxBytes = Math.min(maxMessageSizeBytes, BATCH_BYTES);
    const retryable = this.retryWrites && this.supportsTransactions && !(session && session.inTransaction);
    const serverSession = !session && retryable ? this.acquireSession() : null;
    const encode = (start) => {
      const doc = { ...command, $db: database };
      if (session) session.apply(doc);
      else if (serverSession) {
        serverSession.txnNumber += 1n;
        doc.lsid = serverSession.id;
        doc.txnNumber = serverSession.txnNumber;
      }
      return serializeSections(
        doc,
        identifier,
        docs,
        start,
        MESSAGE_HEADER,
        maxBytes,
        maxWriteBatchSize,
        this.topology.options.ignoreUndefined
      );
    };
    const send = async (batch, retry) => {
      const server = this.topology.selectNow('primary') || (await this.topology.select('primary'));
      try {
        const connection = server.idleConnection() || (await server.connection());
        return { reply: connection.sendNow(batch.message), server };
      } catch (err) {
        if (isStateChange(err)) server.markUnknown(err);
        if (!retry || !isRetryable(err)) throw err;
        return send(batch, false);
      }
    };
    const settle = async (batch, sent) => {
      try {
        return await sent.reply;
      } catch (err) {
        if (isStateChange(err)) sent.server.markUnknown(err);
        if (!retryable || !isRetryable(err)) throw err;
        return (await send(batch, false)).reply;
      }
    };
    try {
      // The connection is taken before the first message is encoded: parts sent at the same time encode theirs
      // while the server runs the others.
      // What the server counted, over every message: n, nModified, and the upserted documents (their index in docs).
      const totals = { n: 0, nModified: 0, upserted: [] };
      let batch = null;
      let start = 0;
      for (;;) {
        const server = this.topology.selectNow('primary') || (await this.topology.select('primary'));
        if (!server.idleConnection()) await server.connection();
        if (batch === null) batch = encode(0);
        const sent = await send(batch, retryable);
        const next = batch.end < docs.length ? encode(batch.end) : null;
        const reply = await settle(batch, sent);
        totals.n += reply.n || 0;
        totals.nModified += reply.nModified || 0;
        if (reply.upserted) {
          for (const { index, _id } of reply.upserted) totals.upserted.push({ index: index + start, _id });
        }
        if (!next) return totals;
        start = batch.end;
        batch = next;
      }
    } finally {
      if (serverSession) this.releaseSession(serverSession);
    }
  }

  db(name = this.parsed.database || 'test') {
    return new Db(this, name);
  }

  // As the official driver's: a client, connected.
  static connect(url, options) {
    return new MongoClient(url, options).connect();
  }

  startSession() {
    return new ClientSession(this);
  }

  async close() {
    if (this.topology) {
      if (this.sessions.length) {
        const ids = this.sessions.map((session) => session.id);
        this.sessions = [];
        await this.run('admin', { endSessions: ids }).catch(() => {});
      }
      this.topology.close();
    }
    this.topology = null;
    // Until connect() again, its commands fail (MongoNotConnectedError), as the official driver's.
    this.closed = true;
  }
}

export { MongoClient, Db, Admin, Collection, Cursor, ClientSession, parseUrl };
