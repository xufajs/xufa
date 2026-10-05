// Transactions of Sequelize. A managed one is a transaction of @xufa/orm; one not managed (sequelize.transaction()
// with no function) runs one of @xufa/orm until commit() or rollback() ends it: its queries are those given
// { transaction } (run in its async context, so they use its connection).

const { randomUUID } = require('node:crypto');

const ROLLBACK = Symbol('xufa.sequelize.rollback');
// A transaction whose COMMIT or ROLLBACK failed: rolled back, and its connection closed instead of given back.
const DISCARD = Object.assign(new Error('The transaction was discarded'), { discardConnection: true });
const ISOLATION = new Set(['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']);

class Transaction {
  constructor(sequelize, options = {}) {
    this.sequelize = sequelize;
    this.options = { type: 'DEFERRED', isolationLevel: null, readOnly: false, ...options };
    this.id = randomUUID();
    this.finished = undefined;
    this.xufaStore = null;
    this.xufaCommitHooks = [];
  }

  // As Sequelize: a transaction that cannot start because the database is busy (SQLite) is tried again (retry: { max,
  // match }, 5 times on SQLITE_BUSY by default), waiting a little more each time.
  static async start(sequelize, options = {}) {
    const retry = { max: 5, match: ['SQLITE_BUSY'], ...sequelize.options.retry, ...options.retry };
    const matches = (err) =>
      []
        .concat(retry.match || [])
        .some((match) => (match instanceof RegExp ? match.test(err.message) : String(err.message).includes(match)));
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await Transaction.xufaStart(sequelize, options);
      } catch (err) {
        if (attempt >= retry.max || !matches(err)) throw err;
        await new Promise((resolve) => setTimeout(resolve, 100 * 1.1 ** attempt));
      }
    }
  }

  static async xufaStart(sequelize, options) {
    const transaction = new Transaction(sequelize, options);
    let started;
    const ready = new Promise((resolve) => {
      started = resolve;
    });
    let finish;
    const ended = new Promise((resolve) => {
      finish = resolve;
    });
    const { backend } = sequelize.xufaDb;
    // In a transaction given (options.transaction), it is a savepoint of it.
    const parent = options && options.transaction && options.transaction.xufaStore;
    const run = (fn) => (parent ? sequelize.xufaDb.backend.context.run(parent, fn) : fn());
    // With replication: read-only transactions on a replica, the others on the primary.
    const replica = (fn) =>
      sequelize.xufaReadPools && !parent
        ? sequelize.xufaReplica.run(transaction.options.readOnly ? 'read' : 'write', fn)
        : fn();
    transaction.xufaRunning = run(() =>
      replica(() =>
        sequelize.xufaDb.transaction(
          async () => {
            transaction.xufaStore = backend.context.getStore();
            await transaction.xufaDefer();
            started();
            const action = await ended;
            if (action === 'rollback') throw ROLLBACK;
            if (action === 'discard') throw DISCARD;
          },
          // Held open by hand: a savepoint made while others are open nests after them.
          { mode: transaction.options.type, serial: false }
        )
      )
    ).catch((err) => {
      if (err !== ROLLBACK && err !== DISCARD) throw sequelize.xufaError(err);
    });
    transaction.xufaFinish = finish;
    // A transaction that fails to start (BEGIN) rejects here.
    await Promise.race([ready, transaction.xufaRunning]);
    return transaction;
  }

  // As Sequelize: COMMIT and ROLLBACK through queryInterface.commitTransaction() and rollbackTransaction() (run by
  // sequelize.query, and logged with the id of the transaction). When they fail, the transaction is rolled back and
  // its connection closed.
  async commit() {
    if (this.finished)
      throw new Error(`Transaction cannot be committed because it has been finished with state: ${this.finished}`);
    if (!this.xufaFinish) {
      this.finished = 'commit';
      return;
    }
    this.finished = 'commit';
    await this.xufaEnd(() => this.sequelize.getQueryInterface().commitTransaction(this, this.options));
    await this.xufaAfterCommit();
  }

  async rollback() {
    if (this.finished)
      throw new Error(`Transaction cannot be rolled back because it has been finished with state: ${this.finished}`);
    if (!this.xufaFinish && !this.xufaStore)
      throw new Error('Transaction cannot be rolled back because it never started');
    this.finished = 'rollback';
    if (this.xufaFinish) {
      await this.xufaEnd(() => this.sequelize.getQueryInterface().rollbackTransaction(this, this.options));
    }
  }

  async xufaEnd(fn) {
    try {
      await fn();
    } catch (err) {
      if (!this.xufaEnded) {
        this.xufaEnded = true;
        this.xufaFinish('discard');
        await this.xufaRunning.catch(() => {});
      }
      throw err;
    }
  }

  // The end of the transaction: commit or rollback (what COMMIT and ROLLBACK of sequelize.query do here).
  xufaControl(action) {
    if (!this.xufaEnded) {
      this.xufaEnded = true;
      this.xufaFinish(action);
    }
    return this.xufaRunning;
  }

  // At the start (PostgreSQL): the isolation level (of the options, or of the Sequelize instance) of a transaction
  // that is not a savepoint, and SET CONSTRAINTS of options.deferrable.
  async xufaDefer() {
    if (this.sequelize.getDialect() !== 'postgres') return;
    const { backend } = this.sequelize.xufaDb;
    const isolationLevel = this.options.isolationLevel || this.sequelize.options.isolationLevel;
    const level = String(isolationLevel || '').toUpperCase();
    if (!this.options.transaction && ISOLATION.has(level)) {
      await backend.raw(`SET TRANSACTION ISOLATION LEVEL ${level}`, []);
    }
    const { deferrable } = this.options;
    if (deferrable) await backend.raw(deferrable.xufaDeferrable, []);
  }

  afterCommit(fn) {
    if (typeof fn !== 'function') throw new TypeError('"fn" must be a function');
    this.xufaCommitHooks.push(fn);
  }

  async xufaAfterCommit() {
    for (let i = 0; i < this.xufaCommitHooks.length; i += 1) await this.xufaCommitHooks[i](this);
  }

  static get ISOLATION_LEVELS() {
    return {
      READ_UNCOMMITTED: 'READ UNCOMMITTED',
      READ_COMMITTED: 'READ COMMITTED',
      REPEATABLE_READ: 'REPEATABLE READ',
      SERIALIZABLE: 'SERIALIZABLE',
    };
  }

  static get TYPES() {
    return { DEFERRED: 'DEFERRED', IMMEDIATE: 'IMMEDIATE', EXCLUSIVE: 'EXCLUSIVE' };
  }

  static get LOCK() {
    return { UPDATE: 'UPDATE', SHARE: 'SHARE', KEY_SHARE: 'KEY SHARE', NO_KEY_UPDATE: 'NO KEY UPDATE' };
  }

  get LOCK() {
    return Transaction.LOCK;
  }
}

module.exports = { Transaction };
