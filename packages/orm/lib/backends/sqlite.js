// SqliteBackend: SQLite with node:sqlite, built into Node.js (22.5 and later). Options: `filename` (':memory:' by
// default) and the options of DatabaseSync. Foreign keys are enforced. In a database of a file, each transaction has a
// connection of its own: the queries made outside it do not wait for it (they read what is committed). A write outside
// transactions that meets the locks of a transaction of this process waits for it to end and is made then; one that
// meets those of another process, or one made in a transaction, fails at once (SQLITE_BUSY). In memory, transactions
// hold the only connection.
const { SqlBackend } = require('./sql/backend');
const { sqlite } = require('./sql/dialects');
const { BackendError } = require('../errors');

let DatabaseSync;

// The function of regular expressions of the regex lookups.
function registerFunctions(connection) {
  if (typeof connection.function !== 'function') return;
  const cache = new Map();
  connection.function('xufa_regexp', { deterministic: true }, (pattern, value, flags) => {
    if (value === null || pattern === null) return null;
    const key = `${flags}/${pattern}`;
    let regex = cache.get(key);
    if (!regex) {
      if (cache.size > 100) cache.clear();
      regex = new RegExp(pattern, flags);
      cache.set(key, regex);
    }
    return regex.test(String(value)) ? 1 : 0;
  });
}

function loadSqlite() {
  if (!DatabaseSync) {
    // Loaded when it is used: node:sqlite warns that it is experimental when it is required.
    const { emitWarning } = process;
    process.emitWarning = (warning, ...args) => {
      if (String(warning).includes('SQLite')) return;
      emitWarning.call(process, warning, ...args);
    };
    try {
      ({ DatabaseSync } = require('node:sqlite'));
    } catch (err) {
      throw new BackendError('The sqlite backend needs node:sqlite (Node.js 22.5 or later)', { cause: err });
    } finally {
      process.emitWarning = emitWarning;
    }
  }
  return DatabaseSync;
}

// The modes of transactions of SQLite (BEGIN DEFERRED, IMMEDIATE or EXCLUSIVE).
const MODES = new Set(['DEFERRED', 'IMMEDIATE', 'EXCLUSIVE']);

// The statements that change rows (a retry after an error reading their results would change them again).
const WRITES = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

// SQLITE_BUSY: a lock of another connection.
const isBusy = (err) => Boolean(err) && err.errcode === 5;

// The bigints of a row as numbers when they are safe integers.
function safeNumbers(row) {
  const keys = Object.keys(row);
  for (let i = 0; i < keys.length; i += 1) {
    const value = row[keys[i]];
    if (typeof value === 'bigint' && Number.isSafeInteger(Number(value))) row[keys[i]] = Number(value);
  }
  return row;
}

class SqliteBackend extends SqlBackend {
  constructor(options = {}) {
    super(options, sqlite);
    this.connection = null;
    this.statements = new Map();
    const { filename = ':memory:' } = options;
    this.separate = filename !== ':memory:' && filename !== '' && !String(filename).startsWith('file::memory:');
    this.migrating = false;
    // The connections of the transactions running (closed with the database), and the promises of their ends.
    this.open = new Set();
    this.ending = new Set();
    this.turn = Promise.resolve();
  }

  // Each call is one statement: one that met a lock wrote nothing, so it is made again once the transactions of this
  // process that hold it end.
  async run(fn) {
    if (!this.separate || this.migrating) return super.run(fn);
    if (this.context.getStore()) return fn();
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        if (!isBusy(err) || this.ending.size === 0) throw err;
        await Promise.allSettled([...this.ending]);
      }
    }
  }

  async transaction(fn, transactionOptions = {}) {
    if (!this.separate || this.migrating || this.context.getStore()) return super.transaction(fn, transactionOptions);
    const given = transactionOptions.mode;
    const mode = MODES.has(String(given).toUpperCase()) ? ` ${String(given).toUpperCase()}` : '';
    // One at a time in this process (SQLite has one writer): a transaction waits for those before it, instead of
    // failing at once on their locks.
    const before = this.turn;
    let done;
    this.turn = new Promise((resolve) => {
      done = resolve;
    });
    await before;
    try {
      return await this.transactionTurn(fn, mode);
    } finally {
      done();
    }
  }

  async transactionTurn(fn, mode) {
    const { filename, ...options } = this.options;
    const Database = loadSqlite();
    const connection = new Database(filename, { ...options, timeout: 0 });
    connection.exec('PRAGMA foreign_keys = ON');
    registerFunctions(connection);
    this.open.add(connection);
    const store = { depth: 0, connection, statements: new Map() };
    let ended;
    const ending = new Promise((resolve) => {
      ended = resolve;
    });
    this.ending.add(ending);
    try {
      return await this.context.run(store, async () => {
        connection.exec(`BEGIN${mode}`);
        let result;
        try {
          result = await fn();
        } catch (err) {
          connection.exec('ROLLBACK');
          throw err;
        }
        connection.exec('COMMIT');
        return result;
      });
    } finally {
      if (this.open.delete(connection)) connection.close();
      this.ending.delete(ending);
      ended();
    }
  }

  async connect() {
    if (this.connection) return;
    const { filename = ':memory:', ...options } = this.options;
    const Database = loadSqlite();
    this.connection = new Database(filename, options);
    this.connection.exec('PRAGMA foreign_keys = ON');
    registerFunctions(this.connection);
  }

  async close() {
    this.open.forEach((connection) => connection.close());
    this.open.clear();
    if (!this.connection) return;
    this.connection.close();
    this.connection = null;
    this.statements.clear();
  }

  // Foreign keys cannot be turned off in a transaction: they are turned off around it, and checked before the commit.
  async migrationTransaction(fn) {
    this.migrating = true;
    await this.run(() => this.execute('PRAGMA foreign_keys = OFF', []));
    try {
      return await this.transaction(async () => {
        const result = await fn();
        const problems = await this.query('PRAGMA foreign_key_check', []);
        if (problems.length) {
          throw new BackendError(`The migration leaves ${problems.length} rows whose foreign keys point to nothing`);
        }
        return result;
      });
    } finally {
      await this.run(() => this.execute('PRAGMA foreign_keys = ON', []));
      this.migrating = false;
    }
  }

  async tables() {
    const rows = await this.query("SELECT name FROM sqlite_master WHERE type = 'table'", []);
    return rows.map((row) => row.name);
  }

  prepare(sql) {
    if (!this.connection) throw new BackendError('The sqlite database is not connected (call db.connect())');
    const store = this.separate ? this.context.getStore() : undefined;
    const connection = store && store.connection ? store.connection : this.connection;
    const statements = store && store.statements ? store.statements : this.statements;
    let statement = statements.get(sql);
    if (!statement) {
      statement = connection.prepare(sql);
      if (statements.size > 500) statements.clear();
      statements.set(sql, statement);
    }
    return statement;
  }

  // Integers beyond the safe ones cannot be read as numbers: the statements that meet one read bigints from then on
  // (the decoders give numbers back for the safe ones).
  async query(sql, params) {
    const statement = this.prepare(sql);
    // Statements that write are never run again (it would write again): they read bigints from the start, and give
    // numbers for the safe ones (as the reads do).
    if (WRITES.test(sql)) {
      if (!statement.readsBigInts) {
        statement.setReadBigInts(true);
        statement.readsBigInts = true;
      }
      return statement.all(...params).map(safeNumbers);
    }
    try {
      return statement.all(...params);
    } catch (err) {
      if (!(err instanceof RangeError) || statement.readsBigInts) throw err;
      statement.setReadBigInts(true);
      statement.readsBigInts = true;
      return statement.all(...params);
    }
  }

  async execute(sql, params) {
    return Number(this.prepare(sql).run(...params).changes);
  }
}

module.exports = { SqliteBackend };
