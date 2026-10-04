// MongoClient: the deployment (lib/topology.js) and the API of the official driver for what an application uses
// most: databases, collections, cursors, sessions and transactions. Writes go to the primary and reads follow the
// read preference; single writes and reads are retried once when their server fails (retryWrites, retryReads).
//
//   const client = await new MongoClient('mongodb://localhost:27017/app').connect();
//   const users = client.db().collection('users');
//   await users.insertOne({ name: 'Ada' });
//   const found = await users.find({ name: /^a/i }).sort({ name: 1 }).toArray();
const dns = require('node:dns').promises;
const { randomUUID } = require('node:crypto');
const { Topology, isRetryable, isStateChange } = require('./topology');
const { COMPRESSORS } = require('./connection');
const { ObjectId, Binary, cursorIdOf, serializeSections } = require('./bson');
const { MongoError } = require('./errors');

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
    return doc;
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
      for (let i = this.position; i < this.buffer.length; i += 1) items.push(this.buffer[i]);
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

// As the official driver, documents without _id get one (the server keeps _id first in the documents stored).
function withId(doc) {
  if (doc._id === undefined) doc._id = new ObjectId();
  return doc;
}

// Stages of aggregations that write (they run on the primary).
function writesTo(pipeline) {
  return pipeline.some((stage) => stage && (stage.$out !== undefined || stage.$merge !== undefined));
}

class Collection {
  constructor(db, name) {
    this.db = db;
    this.client = db.client;
    this.name = name;
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

  find(filter = {}, options = {}) {
    const { session, sort, skip, limit, projection, batchSize, hint, collation, prefetch, readPreference } = options;
    const command = { find: this.name, filter, sort, skip, limit, projection, batchSize, hint, collation };
    return new Cursor(this, command, { session, batchSize, prefetch, readPreference });
  }

  async findOne(filter = {}, options = {}) {
    const [doc] = await this.find(filter, { ...options, limit: 1, batchSize: 1 }).toArray();
    return doc || null;
  }

  aggregate(pipeline, options = {}) {
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

  async countDocuments(filter = {}, options = {}) {
    const pipeline = [{ $match: filter }];
    if (options.skip) pipeline.push({ $skip: options.skip });
    if (options.limit) pipeline.push({ $limit: options.limit });
    pipeline.push({ $group: { _id: 1, n: { $sum: 1 } } });
    const [result] = await this.aggregate(pipeline, options).toArray();
    return result ? result.n : 0;
  }

  async insertOne(doc, options = {}) {
    const document = withId(doc);
    await this.write({ insert: this.name, documents: [document], ordered: true }, options, true);
    return { acknowledged: true, insertedId: document._id };
  }

  // Inserts the documents (those without _id get one, so their ids are known) in messages of a few megabytes, one
  // after the other when ordered (the default: the first error stops the insert), encoding the next while the
  // server inserts one. Unordered, a large insert is cut in parts sent at the same time on the connections of the
  // pool, which the server inserts in parallel; the first error is thrown when every part has ended.
  async insertMany(docs, options = {}) {
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
      upsertedId: reply.upserted ? reply.upserted[0]._id : null,
    };
  }

  updateOne(filter, update, options = {}) {
    return this.update(filter, update, false, options);
  }

  updateMany(filter, update, options = {}) {
    return this.update(filter, update, true, options);
  }

  replaceOne(filter, replacement, options = {}) {
    return this.update(filter, replacement, false, options);
  }

  async remove(filter, limit, options) {
    const reply = await this.write({ delete: this.name, deletes: [{ q: filter, limit }] }, options, limit === 1);
    return { acknowledged: true, deletedCount: reply.n };
  }

  deleteOne(filter, options = {}) {
    return this.remove(filter, 1, options);
  }

  deleteMany(filter, options = {}) {
    return this.remove(filter, 0, options);
  }

  async createIndex(keys, options = {}) {
    const { session, ...rest } = options;
    const name =
      rest.name ||
      Object.entries(keys)
        .map(([key, value]) => `${key}_${value}`)
        .join('_');
    await this.write({ createIndexes: this.name, indexes: [{ key: keys, ...rest, name }] }, { session });
    return name;
  }

  async dropIndex(name, options = {}) {
    await this.write({ dropIndexes: this.name, index: name }, options);
  }

  async indexes(options = {}) {
    const reply = await this.read({ listIndexes: this.name, cursor: {} }, options);
    return reply.cursor.firstBatch;
  }

  // Drops the collection: false when it did not exist.
  async drop(options = {}) {
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

  collection(name) {
    return new Collection(this, name);
  }

  // A command, on the primary (or by `readPreference`).
  command(command, options = {}) {
    return this.client.run(this.name, command, { session: options.session, readPreference: options.readPreference });
  }

  async listCollections(filter = {}, { nameOnly = false, readPreference } = {}) {
    const reply = await this.client.run(
      this.name,
      { listCollections: 1, filter, nameOnly, cursor: {} },
      { readPreference, retry: 'read' }
    );
    return reply.cursor.firstBatch;
  }

  async createCollection(name, options = {}) {
    await this.command({ create: name, ...options });
    return this.collection(name);
  }

  async dropDatabase() {
    await this.command({ dropDatabase: 1 });
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

  async end(command) {
    const { transaction } = this;
    this.transaction = null;
    if (!transaction || !transaction.started) return;
    // commitTransaction and abortTransaction are retried once (they are retryable writes).
    await this.client.run(
      'admin',
      { [command]: 1, lsid: this.id, txnNumber: this.txnNumber, autocommit: false },
      { retry: 'write', keepSession: true }
    );
  }

  commitTransaction() {
    return this.end('commitTransaction');
  }

  abortTransaction() {
    return this.end('abortTransaction');
  }

  // Runs fn(session) in a transaction: committed when it ends, aborted when it throws.
  async withTransaction(fn) {
    this.startTransaction();
    let result;
    try {
      result = await fn(this);
    } catch (err) {
      await this.abortTransaction().catch(() => {});
      throw err;
    }
    await this.commitTransaction();
    return result;
  }

  async endSession() {
    if (this.transaction) await this.abortTransaction().catch(() => {});
    await this.client.run('admin', { endSessions: [this.id] }).catch(() => {});
  }
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
      return serializeSections(doc, identifier, docs, start, MESSAGE_HEADER, maxBytes, maxWriteBatchSize);
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
      let batch = null;
      for (;;) {
        const server = this.topology.selectNow('primary') || (await this.topology.select('primary'));
        if (!server.idleConnection()) await server.connection();
        if (batch === null) batch = encode(0);
        const sent = await send(batch, retryable);
        const next = batch.end < docs.length ? encode(batch.end) : null;
        await settle(batch, sent);
        if (!next) return;
        batch = next;
      }
    } finally {
      if (serverSession) this.releaseSession(serverSession);
    }
  }

  db(name = this.parsed.database || 'test') {
    return new Db(this, name);
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
  }
}

module.exports = { MongoClient, Db, Collection, Cursor, ClientSession, parseUrl };
