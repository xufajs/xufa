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
import { AsyncLocalStorage } from 'node:async_hooks';
import { UnsupportedError, BackendError } from '../errors.js';

// The context of the transactions of a backend: that of the async context, or the transaction pinned to the whole
// backend (pin(): the transaction of a test, that every query is part of, wherever it comes from).
class TransactionContext {
  constructor(backend) {
    this.storage = new AsyncLocalStorage();
    this.backend = backend;
  }

  getStore() {
    const store = this.storage.getStore();
    return store !== undefined ? store : this.backend.pinned || undefined;
  }

  run(store, fn) {
    return this.storage.run(store, fn);
  }
}

class Backend {
  constructor(options = {}) {
    this.options = options;
    this.context = new TransactionContext(this);
    this.queue = Promise.resolve();
    // The transaction pinned to the backend (a test's), or null.
    this.pinned = null;
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

  // Opens a transaction that every query of the backend is part of, from any async context, until unpin() rolls it
  // back: the transaction of a test (db.beginTest()). Transactions inside it are savepoints.
  async pin() {
    if (this.pinned) throw new BackendError('A transaction of a test is open already (rollbackTest() first)');
    await this.queue;
    const store = await this.openPinned();
    this.pinned = store;
    try {
      await this.begin();
    } catch (err) {
      this.pinned = null;
      await this.closePinned(store);
      throw err;
    }
  }

  // Rolls back the transaction pinned (nothing it wrote stays), and frees what it held.
  async unpin() {
    const store = this.pinned;
    if (!store) return;
    try {
      await this.rollback();
    } finally {
      this.pinned = null;
      await this.closePinned(store);
    }
  }

  // The store of a pinned transaction (what its queries run on), and what closes it.
  async openPinned() {
    return { depth: 0 };
  }

  async closePinned() {}

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

export { Backend };
