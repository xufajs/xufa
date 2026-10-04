// MongoBackend: MongoDB with @xufa/mongo. Options: `url` (mongodb://..., with the database in its path) and
// `database`, or a `client` (a MongoClient) of your own. Keys of the models are ObjectIds, given as their hex strings.
//
// Transactions need a replica set or a sharded cluster: on a standalone server, db.transaction() runs its function
// without one (its writes are not atomic). Transactions inside transactions are part of the outer one: when one
// throws, the outer one is rolled back when it ends.
const { MongoCompiler, column } = require('./compiler');
const { specOf } = require('../../schema');
const { Backend } = require('../base');
const { lastOf } = require('../../query');
const { BackendError } = require('../../errors');
const { tableKey } = require('../../meta');

// Composite primary keys are not supported: their models fail clearly.
function noComposite(meta) {
  if (meta.pk && meta.pk.composite)
    throw new BackendError(`Composite primary keys (${meta.name}) are not supported by MongoDB`);
}

class MongoBackend extends Backend {
  constructor(options = {}) {
    super(options);
    const mongo = require('@xufa/mongo');
    this.ObjectId = mongo.ObjectId;
    this.ownClient = !options.client;
    this.client =
      options.client || new mongo.MongoClient(options.url || 'mongodb://127.0.0.1:27017', options.clientOptions);
    this.databaseName = options.database;
    this.compiler = new MongoCompiler((field, value) => this.encode(field, value));
  }

  get name() {
    return 'mongodb';
  }

  get supportsTransactions() {
    return this.client.supportsTransactions;
  }

  // MongoDB has no savepoints: a transaction that fails inside another rolls the outer one back.
  get supportsSavepoints() {
    return false;
  }

  async connect() {
    await this.client.connect();
    this.db = this.client.db(this.databaseName);
  }

  async close() {
    if (this.ownClient) await this.client.close();
  }

  collection(meta) {
    if (!this.db) throw new BackendError('The mongodb database is not connected (call db.connect())');
    noComposite(meta);
    return this.db.collection(meta.key);
  }

  get session() {
    const store = this.context.getStore();
    return store ? store.session : undefined;
  }

  encode(field, value) {
    if (value === null || value === undefined) return null;
    if (field.encrypted) return field.seal(value);
    if ((field.dbType === 'datetime' || field.dbType === 'date') && typeof value === 'number') {
      throw new BackendError(`MongoDB has no infinite dates (${field.model.name}.${field.name})`);
    }
    if (field.dbType === 'id') {
      if (typeof value === 'string' && this.ObjectId.isValid(value)) return new this.ObjectId(value);
      return value;
    }
    return value;
  }

  decode(field, value) {
    if (value === null || value === undefined) return null;
    if (field.encrypted) return field.open(value);
    switch (field.dbType) {
      case 'id': {
        const key = value instanceof this.ObjectId ? value.toHexString() : value;
        return field.fromDb ? field.fromDb(key) : key;
      }
      case 'integer':
      case 'float':
        return Number(value);
      case 'bigint': {
        const number = typeof value === 'bigint' && Number.isSafeInteger(Number(value)) ? Number(value) : value;
        return field.fromDb ? field.fromDb(number) : number;
      }
      case 'bytes':
        return Buffer.isBuffer(value) ? value : Buffer.from(value.buffer || value);
      default:
        return value;
    }
  }

  async aggregateDocs(meta, pipeline) {
    return this.collection(meta).aggregate(pipeline, { session: this.session }).toArray();
  }

  async select(query) {
    if (query.extra) throw this.unsupported('Fragments of SQL (extra)');
    const { pipeline, toRow } = this.compiler.select(query, (field, value) => this.decode(field, value));
    const docs = await this.aggregateDocs(query.meta, pipeline);
    return docs.map(toRow);
  }

  async count(query) {
    const [result] = await this.aggregateDocs(query.meta, this.compiler.count(query));
    return result ? result.n : 0;
  }

  async aggregate(query, aggregates, groupBy) {
    if (aggregates.some((item) => item.fn === 'raw')) throw this.unsupported('Fragments of SQL (Raw)');
    if (aggregates.some((item) => item.fields && item.fields.some((field) => field.reverse))) {
      throw new BackendError('Aggregates across reverse relations are not supported by MongoDB');
    }
    const docs = await this.aggregateDocs(query.meta, this.compiler.aggregate(query, aggregates, groupBy));
    if (docs.length === 0 && !groupBy) docs.push({ _id: null });
    return docs.map((doc) => {
      const row = {};
      (groupBy || []).forEach(({ key, fields }, i) => {
        row[key] = this.decode(lastOf(fields), doc._id[`g${i}`]);
      });
      aggregates.forEach((item, i) => {
        let value = doc[`a${i}`];
        if (item.distinct) {
          const values = (value || []).filter((entry) => entry !== null);
          if (item.fn === 'count') value = values.length;
          else value = values.length ? values.reduce((total, entry) => total + entry, 0) : null;
          if (item.fn === 'avg' && value !== null) value /= values.length;
        } else if (!item.fields || item.fn === 'count') value = value || 0;
        else if (item.fn === 'sum' && !doc[`n${i}`]) value = null;
        if (value === undefined) value = null;
        if (item.fn === 'min' || item.fn === 'max') value = this.decode(lastOf(item.fields), value);
        else if (value !== null) value = Number(value);
        row[item.key] = value;
      });
      return row;
    });
  }

  async insert(meta, rows, options = {}) {
    if (options.conflict) throw this.unsupported('Inserts with conflicts');
    noComposite(meta);
    const { pk } = meta;
    const docs = rows.map((row) => {
      const doc = {};
      // No primary key: MongoDB's _id, never read.
      if (!pk) {
        meta.fields.forEach((field) => {
          doc[column(field)] = this.encode(field, row[field.attname]);
        });
        return doc;
      }
      let key = row[pk.attname];
      if (key === null || key === undefined) {
        if (pk.type !== 'id') throw new BackendError(`The primary key of ${meta.table} is required`);
        key = new this.ObjectId();
      }
      doc._id = this.encode(pk, key);
      meta.fields.forEach((field) => {
        if (!field.primaryKey) doc[column(field)] = this.encode(field, row[field.attname]);
      });
      return doc;
    });
    try {
      await this.collection(meta).insertMany(docs, { session: this.session });
    } catch (err) {
      throw new BackendError(err.message, { cause: err });
    }
    return docs.map((doc) => (pk ? this.decode(pk, doc._id) : null));
  }

  // The filter of an update or a delete: the keys selected first when the conditions follow relations.
  async writeFilter(query) {
    const filter = this.compiler.writeFilter(query);
    if (filter) return filter;
    const pipeline = [...this.compiler.match({ ...query, related: [], orderBy: [] }), { $project: { _id: 1 } }];
    const docs = await this.aggregateDocs(query.meta, pipeline);
    return { _id: { $in: docs.map((doc) => doc._id) } };
  }

  async update(query, assignments) {
    const filter = await this.writeFilter(query);
    try {
      const result = await this.collection(query.meta).updateMany(filter, this.compiler.update(assignments), {
        session: this.session,
      });
      return result.matchedCount;
    } catch (err) {
      throw new BackendError(err.message, { cause: err });
    }
  }

  async delete(query) {
    const filter = await this.writeFilter(query);
    const result = await this.collection(query.meta).deleteMany(filter, { session: this.session });
    return result.deletedCount;
  }

  async createSchema(metas) {
    metas.forEach(noComposite);
    const existing = new Set((await this.db.listCollections({}, { nameOnly: true })).map((item) => item.name));
    for (let i = 0; i < metas.length; i += 1) {
      const meta = metas[i];
      if (!existing.has(meta.key)) await this.db.createCollection(meta.key);
      const indexes = this.compiler.indexesOf(specOf(meta));
      for (let j = 0; j < indexes.length; j += 1) {
        await this.collection(meta).createIndex(indexes[j].key, indexes[j].options);
      }
    }
  }

  // Migrations: MongoDB has no schema, so they create and drop collections and indexes, fill the fields added with
  // their default, and unset and rename fields (types are not converted).
  async appliedMigrations() {
    const docs = await this.db.collection('xufa_migrations').find({}).toArray();
    return docs.map((doc) => doc._id);
  }

  async recordMigration(name) {
    await this.db.collection('xufa_migrations').insertOne({ _id: name, appliedAt: new Date() });
  }

  migrationTransaction(fn) {
    return fn();
  }

  async migrationOperation(op, before, after) {
    const collection = (name) => this.db.collection(name);
    switch (op.op) {
      case 'createTable': {
        // A collection is named by the key of its table (schema.table when it has a schema).
        const name = tableKey(op.spec.table, op.spec.schema);
        const existing = await this.db.listCollections({ name }, { nameOnly: true });
        if (existing.length === 0) await this.db.createCollection(name);
        const indexes = this.compiler.indexesOf(op.spec);
        for (let i = 0; i < indexes.length; i += 1)
          await collection(name).createIndex(indexes[i].key, indexes[i].options);
        return;
      }
      case 'dropTable':
        await collection(op.table).drop();
        return;
      case 'addColumn': {
        const value = op.default && op.default.now === true ? new Date() : op.default;
        await collection(op.table).updateMany(
          { [op.column]: { $exists: false } },
          { $set: { [op.column]: value === undefined ? null : value } }
        );
        return;
      }
      case 'dropColumn':
        await collection(op.table).updateMany({}, { $unset: { [op.column]: '' } });
        return;
      case 'renameColumn':
        await collection(op.table).updateMany({}, { $rename: { [op.from]: op.to } });
        return;
      case 'renameTable':
        await this.client.run('admin', {
          renameCollection: `${this.db.name}.${op.from}`,
          to: `${this.db.name}.${op.to}`,
        });
        return;
      case 'createIndex': {
        const spec = { ...after.tables[op.table], indexes: [op.index] };
        const [index] = this.compiler.indexesOf(spec);
        await collection(op.table).createIndex(index.key, index.options);
        return;
      }
      case 'dropIndex':
        await collection(op.table)
          .dropIndex(op.name)
          .catch((err) => {
            // An index that does not exist (27) is already dropped.
            if (!err.cause || err.cause.code !== 27) {
              if (err.code !== 27) throw err;
            }
          });
        return;
      case 'alterColumn':
      case 'setOptions':
        return;
      case 'sql':
        throw this.unsupported('SQL in migrations');
      default:
        throw new BackendError(`Unknown migration operation ${op.op}`);
    }
  }

  async dropSchema(metas) {
    for (let i = 0; i < metas.length; i += 1) await this.collection(metas[i]).drop();
  }

  async transaction(fn) {
    const store = this.context.getStore();
    if (store) {
      try {
        return await fn();
      } catch (err) {
        store.failed = err;
        throw err;
      }
    }
    if (!this.supportsTransactions) return this.context.run({ session: undefined }, fn);
    const session = this.client.startSession();
    const state = { session, failed: null };
    try {
      return await this.context.run(state, async () => {
        session.startTransaction();
        let result;
        try {
          result = await fn();
        } catch (err) {
          await session.abortTransaction();
          throw err;
        }
        if (state.failed) {
          await session.abortTransaction();
          throw new BackendError('The transaction was rolled back: a transaction inside it failed', {
            cause: state.failed,
          });
        }
        await session.commitTransaction();
        return result;
      });
    } finally {
      await session.endSession();
    }
  }
}

module.exports = { MongoBackend };
