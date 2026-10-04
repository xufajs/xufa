// Client and Pool, with the API of pg (node-postgres): new Client(config), connect(), query(text, values) giving
// { rows, rowCount, command, fields }, end(); Pool: query(), connect() for a client of its own (release() it), end().
//
// A Pool sends the queries of pool.query() to its connections pipelined: the least busy one takes the next query,
// and new connections are opened (up to max) only when they are all busy. pool.connect() gives a connection to one
// user (for transactions) until it is released.
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { Connection } = require('./connection');
const { copyRows } = require('./copy');
const { ConnectionError, PgError } = require('./errors');

// The options of a connection string, an object (with connectionString or not) and the PG* variables.
function parseConfig(config = {}) {
  const options = typeof config === 'string' ? { connectionString: config } : { ...config };
  const { env } = process;
  if (options.connectionString) {
    const url = new URL(options.connectionString);
    if (url.username) options.user ??= decodeURIComponent(url.username);
    if (url.password) options.password ??= decodeURIComponent(url.password);
    if (url.hostname) options.host ??= decodeURIComponent(url.hostname).replace(/^\[|\]$/g, '');
    if (url.port) options.port ??= Number(url.port);
    const database = decodeURIComponent(url.pathname.slice(1));
    if (database) options.database ??= database;
    url.searchParams.forEach((value, key) => {
      if (key === 'sslmode') {
        if (value !== 'disable' && value !== 'prefer' && value !== 'allow') {
          options.ssl ??= value === 'require' || value === 'no-verify' ? { rejectUnauthorized: false } : true;
        }
      } else if (key === 'application_name') options.application_name ??= value;
      else if (key === 'options') options.options ??= value;
    });
  }
  options.host ??= env.PGHOST || '127.0.0.1';
  options.port = Number(options.port ?? env.PGPORT ?? 5432);
  options.user ??= env.PGUSER || os.userInfo().username;
  if (options.password === undefined && env.PGPASSWORD !== undefined) options.password = env.PGPASSWORD;
  options.database ??= env.PGDATABASE || options.user;
  if (options.types && !(options.types instanceof Map))
    options.types = new Map(Object.entries(options.types).map(([oid, fn]) => [Number(oid), fn]));
  return options;
}

const EMPTY = [];

// A statement prepared before a change of its tables (ALTER TABLE...) fails once: it is prepared again. The error is
// known by the function of the server that raises it (its message depends on the language of the server).
// A statement whose types were dropped (and made again: DROP TYPE, CREATE TYPE) fails to find them: the same.
function isStalePlan(err) {
  if (!err) return false;
  if (err.routine === 'RevalidateCachedQuery' || err.code === '26000') return true;
  return err.code === 'XX000' && /^getType(Input|Output|Send|Receive)Info$/.test(err.routine || '');
}

// A statement prepared before its tables were made again (DROP TABLE, CREATE TABLE) keeps the types of the parameters
// of the old ones: a value that is not of them fails (invalid text for the type, mismatch of types). Prepared again,
// a statement that fails for its values fails the same.
const TYPE_ERRORS = new Set(['22P02', '42804', '42883']);

// The server does not prepare texts of several statements: they run as simple queries.
function isMultipleStatements(err) {
  return Boolean(err) && err.code === '42601' && err.routine === 'exec_parse_message';
}

// Runs a query. A text is prepared the second time it runs (then its results are read in binary and its plan kept):
// texts run once, as those with their values written in them, are sent as pg does, without filling the cache of
// statements. Queries without values are prepared too, unless their text has several statements: those are simple
// queries (their results are an array, as in pg), and the connection remembers their texts.
async function runQuery(connection, textOrConfig, values) {
  const config = typeof textOrConfig === 'string' ? { text: textOrConfig, values } : { ...textOrConfig };
  if (values !== undefined) config.values = values;
  const options = { rowMode: config.rowMode, prepare: config.prepare };
  const { text } = config;
  // Queries with a signal or a timeout can be cancelled (and have their connection to themselves).
  const timeout = config.query_timeout ?? config.timeout ?? connection.options.query_timeout;
  const cancellable = config.signal || timeout ? { signal: config.signal, timeout } : null;
  const send = (params) =>
    cancellable
      ? connection.cancellableQuery(text, params, options, cancellable)
      : connection.query(text, params, options);
  let params = config.values;
  if (connection.prepare && config.prepare !== false && !connection.simpleTexts.has(text)) {
    if (connection.ranBefore(text)) {
      if (params === undefined) params = EMPTY;
    } else options.prepare = false;
  }
  const prepared = params !== undefined && connection.statements.has(text);
  try {
    return await send(params);
  } catch (err) {
    if (prepared && err && TYPE_ERRORS.has(err.code) && connection.statements.has(text)) {
      connection.statements.delete(text);
      return send(params);
    }
    if (params === EMPTY && isMultipleStatements(err)) {
      connection.statements.delete(text);
      if (connection.simpleTexts.size >= 1000) connection.simpleTexts.clear();
      connection.simpleTexts.add(text);
      return send(undefined);
    }
    if (!isStalePlan(err) || params === undefined) throw err;
    connection.statements.delete(text);
    // Queries sent at the same time as the first of a text of several statements fail as stale: simple too.
    return send(params === EMPTY && connection.simpleTexts.has(text) ? undefined : params);
  }
}

class Client extends EventEmitter {
  constructor(config) {
    super();
    this.options = parseConfig(config);
    this.connection = null;
  }

  get processID() {
    return this.connection && this.connection.processID;
  }

  async connect() {
    if (this.connection) throw new PgError('The client is already connected');
    const connection = new Connection(this.options);
    this.connection = connection;
    await connection.connect();
    connection.on('notice', (notice) => this.emit('notice', notice));
    connection.on('notification', (message) => this.emit('notification', message));
    connection.on('end', (err) => {
      if (!this.ending) this.emit('error', err);
      this.emit('end');
    });
    return this;
  }

  query(textOrConfig, values) {
    if (!this.connection) return Promise.reject(new ConnectionError('The client is not connected'));
    return runQuery(this.connection, textOrConfig, values);
  }

  // COPY ... FROM STDIN with data (a Buffer, a string, or an iterable or async iterable of them): { rowCount }.
  copyFrom(text, data) {
    if (!this.connection) return Promise.reject(new ConnectionError('The client is not connected'));
    return this.connection.copyFrom(text, data);
  }

  // COPY ... TO STDOUT: an async iterator of the chunks of data.
  copyTo(text) {
    if (!this.connection) throw new ConnectionError('The client is not connected');
    return this.connection.copyTo(text);
  }

  // Loads rows (arrays, or objects by column) into a table with COPY, binary when it can: the number of rows.
  copyRows(table, columns, rows) {
    if (!this.connection) return Promise.reject(new ConnectionError('The client is not connected'));
    return copyRows(this.connection, table, columns, rows);
  }

  // After changes of the schema (DROP and CREATE of tables or types): the statements prepared are prepared again.
  forgetStatements() {
    if (this.connection) this.connection.forgetStatements();
  }

  async end() {
    this.ending = true;
    if (this.connection) await this.connection.end();
  }
}

class Pool extends EventEmitter {
  constructor(config = {}) {
    super();
    const {
      max = 10,
      idleTimeoutMillis = 10000,
      ...rest
    } = typeof config === 'string' ? { connectionString: config } : config;
    this.options = parseConfig(rest);
    this.max = max;
    this.idleTimeoutMillis = idleTimeoutMillis;
    // Connections, those given by connect() included (taken), and those being opened.
    this.connections = [];
    this.opening = 0;
    this.waiting = [];
    this.ended = false;
  }

  get totalCount() {
    return this.connections.length + this.opening;
  }

  get idleCount() {
    return this.connections.filter((connection) => !connection.taken && connection.busy === 0).length;
  }

  get waitingCount() {
    return this.waiting.length;
  }

  async open() {
    this.opening += 1;
    let connection;
    try {
      connection = await new Connection(this.options).connect();
    } finally {
      this.opening -= 1;
    }
    connection.taken = false;
    connection.idleTimer = null;
    connection.on('drain', () => this.onIdle(connection));
    connection.on('end', (err) => {
      this.remove(connection);
      // Connections closed by the pool (released with an error, or in a transaction) are not errors.
      if (!this.ended && !connection.discarded) this.emit('error', err, connection);
    });
    connection.on('notice', (notice) => this.emit('notice', notice));
    this.connections.push(connection);
    this.emit('connect', connection);
    return connection;
  }

  remove(connection) {
    const index = this.connections.indexOf(connection);
    if (index !== -1) this.connections.splice(index, 1);
    clearTimeout(connection.idleTimer);
    this.wake();
  }

  // A connection with nothing to run: it is given to who waits, or closed after idleTimeoutMillis.
  onIdle(connection) {
    if (connection.taken) return;
    this.wake();
    if (connection.busy === 0 && this.idleTimeoutMillis > 0 && !connection.idleTimer) {
      connection.idleTimer = setTimeout(() => {
        connection.idleTimer = null;
        if (!connection.taken && connection.busy === 0) {
          this.remove(connection);
          connection.end();
        }
      }, this.idleTimeoutMillis);
      connection.idleTimer.unref();
    }
  }

  wake() {
    const waiters = this.waiting;
    this.waiting = [];
    waiters.forEach((waiter) => waiter());
  }

  wait() {
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  use(connection) {
    clearTimeout(connection.idleTimer);
    connection.idleTimer = null;
    return connection;
  }

  // The connection for a query: the least busy of those not taken, or a new one when all are busy.
  async shared() {
    for (;;) {
      if (this.ended) throw new PgError('The pool has ended');
      let best = null;
      for (let i = 0; i < this.connections.length; i += 1) {
        const connection = this.connections[i];
        if (!connection.taken && !connection.closed && (best === null || connection.busy < best.busy))
          best = connection;
      }
      if (best !== null && (best.busy === 0 || this.totalCount >= this.max)) return this.use(best);
      if (this.totalCount < this.max) return this.use(await this.open());
      await this.wait();
    }
  }

  async query(textOrConfig, values) {
    const connection = this.connections.length ? this.pick() : null;
    return runQuery(connection || (await this.shared()), textOrConfig, values);
  }

  // The path of most queries: an idle connection (or the least busy when the pool is full), without awaiting.
  pick() {
    let best = null;
    for (let i = 0; i < this.connections.length; i += 1) {
      const connection = this.connections[i];
      if (!connection.taken && !connection.closed) {
        if (connection.busy === 0) return this.use(connection);
        if (best === null || connection.busy < best.busy) best = connection;
      }
    }
    return best !== null && this.totalCount >= this.max ? this.use(best) : null;
  }

  // COPY takes a connection of the pool for itself while it runs.
  async copyFrom(text, data) {
    const client = await this.connect();
    try {
      return await client.copyFrom(text, data);
    } finally {
      client.release();
    }
  }

  async *copyTo(text) {
    const client = await this.connect();
    try {
      yield* client.copyTo(text);
    } finally {
      client.release();
    }
  }

  async copyRows(table, columns, rows) {
    const client = await this.connect();
    try {
      return await client.copyRows(table, columns, rows);
    } finally {
      client.release();
    }
  }

  // A connection for one user until release(): the transactions run in it.
  async connect() {
    for (;;) {
      if (this.ended) throw new PgError('The pool has ended');
      const idle = this.connections.find(
        (connection) => !connection.taken && !connection.closed && connection.busy === 0
      );
      const connection = idle || (this.totalCount < this.max ? await this.open() : null);
      if (connection && !connection.taken && connection.busy === 0) {
        this.use(connection).taken = true;
        return new PoolClient(this, connection);
      }
      await this.wait();
    }
  }

  release(connection, err) {
    connection.taken = false;
    if (err || connection.closed || connection.transactionStatus !== 'I') {
      // A connection left in a transaction (or broken) is not given to anyone else.
      connection.discarded = true;
      this.remove(connection);
      connection.destroy();
      return;
    }
    this.onIdle(connection);
  }

  // After changes of the schema (DROP and CREATE of tables or types): the statements every connection prepared are
  // prepared again (each closes them before its next query).
  forgetStatements() {
    this.connections.forEach((connection) => connection.forgetStatements());
  }

  async end() {
    this.ended = true;
    const connections = this.connections;
    this.connections = [];
    this.wake();
    await Promise.all(connections.map((connection) => connection.end()));
  }
}

class PoolClient extends EventEmitter {
  constructor(pool, connection) {
    super();
    this.pool = pool;
    this.connection = connection;
    this.released = false;
  }

  get processID() {
    return this.connection.processID;
  }

  query(textOrConfig, values) {
    if (this.released) return Promise.reject(new PgError('The client was released to the pool'));
    return runQuery(this.connection, textOrConfig, values);
  }

  copyFrom(text, data) {
    if (this.released) return Promise.reject(new PgError('The client was released to the pool'));
    return this.connection.copyFrom(text, data);
  }

  copyTo(text) {
    if (this.released) throw new PgError('The client was released to the pool');
    return this.connection.copyTo(text);
  }

  copyRows(table, columns, rows) {
    if (this.released) return Promise.reject(new PgError('The client was released to the pool'));
    return copyRows(this.connection, table, columns, rows);
  }

  // Gives the connection back to the pool; with an error (or true), it is closed instead.
  release(err) {
    if (this.released) return;
    this.released = true;
    this.pool.release(this.connection, err);
  }
}

module.exports = { Client, Pool, PoolClient, parseConfig };
