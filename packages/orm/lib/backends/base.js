// Backend: what a database has to do for the ORM. Its methods take the descriptions of queries made by QuerySets
// (lib/query.js) and give rows: objects with the values of the fields by attname (already JavaScript values) and,
// under `$<name>`, the rows of the relations selected; or, for values() and aggregates, objects by key.
//
//   select(query)                          rows
//   selectObjects(query, db)               (optional) the objects of the model, made by the backend
//   count(query)                           number
//   aggregate(query, aggregates, groupBy)  rows by key
//   insert(meta, rows)                     the primary keys of the rows inserted, in order
//   update(query, assignments)             number of rows updated
//   delete(query)                          number of rows deleted
//   createSchema(metas), dropSchema(metas), transaction(fn), connect(), close()
//
// This class gives transactions to backends with one connection (memory, SQLite): a transaction holds it, and the
// queries made from outside it wait for it to end. Backends with pools of connections override transaction().
const { AsyncLocalStorage } = require('node:async_hooks');
const { UnsupportedError } = require('../errors');

class Backend {
  constructor(options = {}) {
    this.options = options;
    this.context = new AsyncLocalStorage();
    this.queue = Promise.resolve();
  }

  get name() {
    return 'base';
  }

  async connect() {}

  async close() {}

  // A round trip to the server of the backend (none here: memory, files, storage without a server to ask).
  async ping() {
    return true;
  }

  get inTransaction() {
    return this.context.getStore() !== undefined;
  }

  // Runs an operation when no transaction of another async context holds the connection.
  async run(fn) {
    if (!this.inTransaction) await this.queue;
    return fn();
  }

  // options.serial: false lets a savepoint start while another of its level is open (it is then made after it, and
  // must end before it: savepoints kept open while others are made, as those of transactions held by hand).
  async transaction(fn, options = {}) {
    const store = this.context.getStore();
    if (store) {
      // A savepoint. Those of the same level run one after another (they share the connection, and releasing one
      // would end those made after it); each runs in a context of its own (the same connection), where savepoints
      // inside it nest.
      const previous = options.serial === false ? null : store.savepoints || Promise.resolve();
      let done = () => {};
      if (previous) {
        store.savepoints = new Promise((resolve) => {
          done = resolve;
        });
        await previous;
      }
      const inner = Object.create(store);
      inner.depth = (store.depth || 0) + 1;
      inner.savepoints = null;
      this.savepointCount = (this.savepointCount || 0) + 1;
      const name = `xufa_sp_${this.savepointCount}`;
      try {
        await this.savepoint(name);
        return await this.context.run(inner, async () => {
          try {
            const result = await fn();
            await this.releaseSavepoint(name);
            return result;
          } catch (err) {
            await this.rollbackToSavepoint(name);
            throw err;
          }
        });
      } finally {
        done();
      }
    }
    const previous = this.queue;
    let release;
    this.queue = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.context.run({ depth: 0 }, async () => {
        await this.begin();
        let result;
        try {
          result = await fn();
        } catch (err) {
          await this.rollback();
          throw err;
        }
        await this.commit();
        return result;
      });
    } finally {
      release();
    }
  }

  unsupported(what) {
    return new UnsupportedError(what, this.name);
  }

  async begin() {
    throw this.unsupported('Transactions');
  }

  async commit() {}

  async rollback() {}

  async savepoint() {
    throw this.unsupported('Nested transactions');
  }

  async releaseSavepoint() {}

  async rollbackToSavepoint() {}
}

module.exports = { Backend };
