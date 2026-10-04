// Client and Pool, with the API of pg (node-postgres): new Client(config), connect(), query(text, values) giving
// { rows, rowCount, command, fields }, end(); Pool: query(), connect() for a client of its own (release() it), end().
//
// A Pool sends the queries of pool.query() to its connections pipelined: the least busy one takes the next query,
// and new connections are opened (up to max) only when they are all busy. pool.connect() gives a connection to one
// user (for transactions) until it is released.
const fs = require('node:fs');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { Connection } = require('./connection');
const { copyRows } = require('./copy');
const { escapeIdentifier, escapeLiteral } = require('./types');
const { parseRequireAuth, parseChannelBinding } = require('./auth');
const { traceQuery, traceConnect, tracePoolConnect, publishRelease, publishRemove } = require('./diagnostics');
const { ConnectionError, PgError } = require('./errors');

// Text of a URL decoded, or as it is when it is no valid percent-encoding (a stray % in a password).
function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

// The parameters of a connection string as libpq reads them: percent-decoded, and + is a plus (not a space, as
// URLSearchParams would make it).
function paramsOf(search) {
  const params = new Map();
  for (const part of search.replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const index = part.indexOf('=');
    params.set(decode(index === -1 ? part : part.slice(0, index)), index === -1 ? '' : decode(part.slice(index + 1)));
  }
  return params;
}

// The TLS options of an sslmode (libpq's), and of the files of the certificates: null for no TLS. `prefer` uses TLS
// when the server has it; `require` encrypts without checking the certificate (unless a root certificate is given:
// then as verify-ca); `verify-ca` checks the chain but not the host; `verify-full` both.
function sslOf(mode, files) {
  const given = Object.values(files).some((value) => value !== undefined);
  if (mode === undefined && !given) return null;
  if (mode === 'disable' || mode === 'allow') return null;
  const ssl = {};
  if (files.sslcert) ssl.cert = fs.readFileSync(files.sslcert);
  if (files.sslkey) ssl.key = fs.readFileSync(files.sslkey);
  if (files.sslrootcert && files.sslrootcert !== 'system') ssl.ca = fs.readFileSync(files.sslrootcert);
  if (files.sslpassword !== undefined) ssl.passphrase = files.sslpassword;
  switch (mode) {
    case 'prefer':
    case 'no-verify':
      ssl.rejectUnauthorized = false;
      break;
    case 'require':
      if (files.sslrootcert) ssl.checkServerIdentity = () => undefined;
      else ssl.rejectUnauthorized = false;
      break;
    case 'verify-ca':
      ssl.checkServerIdentity = () => undefined;
      break;
    case undefined:
    case 'verify-full':
      break;
    default:
      throw new PgError(`Invalid sslmode: ${mode}`);
  }
  return ssl;
}

// A connection string with several hosts (postgres://u@h1:5432,h2:5433/db), which URL cannot read: the string with
// the first host, and the hosts ({ host, port }).
function splitHosts(connectionString) {
  const match = /^([a-z][a-z0-9+.-]*:\/\/)([^/?#]*)(.*)$/is.exec(connectionString);
  if (!match) return { text: connectionString, hosts: null };
  const [, scheme, authority, rest] = match;
  const at = authority.lastIndexOf('@');
  const list = authority.slice(at + 1);
  if (!list.includes(',')) return { text: connectionString, hosts: null };
  const hosts = list.split(',').map((item) => {
    const bracket = /^\[([^\]]*)\](?::(\d*))?$/.exec(item);
    if (bracket) return { host: bracket[1], port: bracket[2] || undefined };
    const colon = item.lastIndexOf(':');
    if (colon === -1) return { host: decode(item), port: undefined };
    return { host: decode(item.slice(0, colon)), port: item.slice(colon + 1) || undefined };
  });
  return { text: `${scheme}${authority.slice(0, at + 1)}${list.split(',')[0]}${rest}`, hosts };
}

const SESSION_ATTRS = new Set(['any', 'read-write', 'read-only', 'primary', 'standby', 'prefer-standby']);

// The hosts of a config: [{ host, port }].
function hostsOf(options) {
  const hosts = [].concat(options.host);
  const ports = [].concat(options.port);
  if (ports.length !== 1 && ports.length !== hosts.length) {
    throw new PgError(`${hosts.length} hosts and ${ports.length} ports: give one port, or one for each host`);
  }
  return hosts.map((host, i) => ({ host, port: ports.length === 1 ? ports[0] : ports[i] }));
}

// Whether a connection is what target_session_attrs asks for: by the parameters the server reports (in_hot_standby
// and default_transaction_read_only, PostgreSQL 14 and later), or by asking it.
async function sessionIs(connection, attrs) {
  if (attrs === 'any') return true;
  const { parameters } = connection;
  let standby = parameters.in_hot_standby === undefined ? undefined : parameters.in_hot_standby === 'on';
  if (standby === undefined) {
    const { rows } = await connection.query('SELECT pg_catalog.pg_is_in_recovery() AS standby');
    standby = rows[0].standby === true || rows[0].standby === 't';
  }
  if (attrs === 'primary') return !standby;
  if (attrs === 'standby' || attrs === 'prefer-standby') return standby;
  let readOnly = standby;
  if (!readOnly) {
    if (parameters.default_transaction_read_only !== undefined) {
      readOnly = parameters.default_transaction_read_only === 'on';
    } else {
      const { rows } = await connection.query('SHOW transaction_read_only');
      readOnly = rows[0].transaction_read_only === 'on';
    }
  }
  return attrs === 'read-only' ? readOnly : !readOnly;
}

// A connection to the first host that takes it and is what target_session_attrs asks for (as libpq does: the hosts in
// order, or shuffled with load_balance_hosts=random; prefer-standby takes any host when none is a standby). Each host
// has the whole connectionTimeoutMillis.
async function connectTo(options) {
  const attrs = options.target_session_attrs || 'any';
  let hosts = hostsOf(options);
  if (hosts.length === 1 && attrs === 'any') return new Connection({ ...options, ...hosts[0] }).connect();
  if (options.load_balance_hosts === 'random') {
    hosts = hosts
      .map((host) => ({ host, order: Math.random() }))
      .sort((a, b) => a.order - b.order)
      .map((item) => item.host);
  }
  const failures = [];
  const passes = attrs === 'prefer-standby' ? ['prefer-standby', 'any'] : [attrs];
  for (const pass of passes) {
    for (const target of hosts) {
      let connection = null;
      try {
        connection = await new Connection({ ...options, ...target }).connect();
        if (await sessionIs(connection, pass)) return connection;
        failures.push(`${target.host}:${target.port} is not ${pass}`);
        await connection.end();
      } catch (err) {
        if (connection) connection.destroy();
        failures.push(`${target.host}:${target.port}: ${err.message}`);
      }
    }
  }
  throw new ConnectionError(`No host could be used (${failures.join('; ')})`);
}

// The options of a connection string, an object (with connectionString or not) and the PG* variables (the options of
// the object first, then those of the string, then the variables).
function parseConfig(config = {}) {
  const options = typeof config === 'string' ? { connectionString: config } : { ...config };
  const { env } = process;
  let params = new Map();
  if (options.connectionString) {
    const { text, hosts } = splitHosts(options.connectionString);
    const url = new URL(text);
    if (hosts) {
      options.host ??= hosts.map((item) => item.host);
      options.port ??= hosts.map((item) => item.port);
    }
    params = paramsOf(url.search);
    if (url.username) options.user ??= decode(url.username);
    if (url.password) options.password ??= decode(url.password);
    // A unix socket is its directory, percent-encoded (postgres://%2Fvar%2Frun%2Fpostgresql/db) or as ?host=.
    if (url.hostname) options.host ??= decode(url.hostname).replace(/^\[|\]$/g, '');
    if (url.port) options.port ??= Number(url.port);
    const database = decode(url.pathname.slice(1));
    if (database) options.database ??= database;
    for (const [key, name] of [
      ['host', 'host'],
      ['port', 'port'],
      ['user', 'user'],
      ['password', 'password'],
      ['dbname', 'database'],
      ['application_name', 'application_name'],
      ['options', 'options'],
    ]) {
      if (params.has(key)) options[name] ??= params.get(key);
    }
    if (params.has('connect_timeout')) options.connectionTimeoutMillis ??= Number(params.get('connect_timeout')) * 1000;
    if (params.has('target_session_attrs')) options.target_session_attrs ??= params.get('target_session_attrs');
    if (params.has('load_balance_hosts')) options.load_balance_hosts ??= params.get('load_balance_hosts');
    if (params.has('require_auth')) options.require_auth ??= params.get('require_auth');
    if (params.has('channel_binding')) options.channel_binding ??= params.get('channel_binding');
  }
  // They refuse weak authentication: a misspelt one is an error, not ignored.
  for (const name of ['requireAuth', 'channelBinding']) {
    if (options[name] !== undefined) {
      throw new PgError(`${name} is spelt as in libpq: ${name === 'requireAuth' ? 'require_auth' : 'channel_binding'}`);
    }
  }
  if (options.require_auth === undefined && env.PGREQUIREAUTH !== undefined) options.require_auth = env.PGREQUIREAUTH;
  if (options.channel_binding === undefined && env.PGCHANNELBINDING) options.channel_binding = env.PGCHANNELBINDING;
  // Checked now, not at the first connection.
  parseRequireAuth(options.require_auth);
  parseChannelBinding(options.channel_binding);
  // TLS: ssl in the object, or sslmode (or ssl=true/false) and the files of the string or of the variables.
  if (options.ssl === undefined) {
    let mode = params.get('sslmode');
    if (mode === undefined && params.has('ssl'))
      mode = ['true', '1'].includes(params.get('ssl')) ? 'verify-full' : 'disable';
    mode ??= env.PGSSLMODE || undefined;
    const files = {
      sslcert: params.get('sslcert') ?? env.PGSSLCERT,
      sslkey: params.get('sslkey') ?? env.PGSSLKEY,
      sslrootcert: params.get('sslrootcert') ?? env.PGSSLROOTCERT,
      sslpassword: params.get('sslpassword'),
    };
    const ssl = sslOf(mode, files);
    options.ssl = ssl || false;
    if (mode === 'prefer') options.sslmode = 'prefer';
  }
  options.host ??= env.PGHOST || '127.0.0.1';
  options.port ??= env.PGPORT ?? 5432;
  // Several hosts: lists ('a,b' or arrays), and a port for each (or one for all).
  if (typeof options.host === 'string' && options.host.includes(',')) options.host = options.host.split(',');
  if (typeof options.port === 'string' && options.port.includes(',')) options.port = options.port.split(',');
  options.port = Array.isArray(options.port)
    ? options.port.map((port) => Number(port === undefined || port === '' ? 5432 : port))
    : Number(options.port);
  if (options.target_session_attrs === undefined && env.PGTARGETSESSIONATTRS) {
    options.target_session_attrs = env.PGTARGETSESSIONATTRS;
  }
  if (options.load_balance_hosts === undefined && env.PGLOADBALANCEHOSTS) {
    options.load_balance_hosts = env.PGLOADBALANCEHOSTS;
  }
  hostsOf(options);
  if (options.target_session_attrs !== undefined && !SESSION_ATTRS.has(options.target_session_attrs)) {
    throw new PgError(`Invalid target_session_attrs: ${options.target_session_attrs}`);
  }
  if (options.load_balance_hosts !== undefined && !['disable', 'random'].includes(options.load_balance_hosts)) {
    throw new PgError(`Invalid load_balance_hosts: ${options.load_balance_hosts}`);
  }
  options.user ??= env.PGUSER || os.userInfo().username;
  if (options.password === undefined && env.PGPASSWORD !== undefined) options.password = env.PGPASSWORD;
  options.database ??= env.PGDATABASE || (typeof options.user === 'string' ? options.user : undefined);
  if (options.application_name === undefined && env.PGAPPNAME) options.application_name = env.PGAPPNAME;
  if (options.options === undefined && env.PGOPTIONS) options.options = env.PGOPTIONS;
  if (options.connectionTimeoutMillis === undefined && env.PGCONNECT_TIMEOUT) {
    options.connectionTimeoutMillis = Number(env.PGCONNECT_TIMEOUT) * 1000;
  }
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
// A query, traced (pg:query) when someone listens.
function runQuery(connection, textOrConfig, values) {
  const config = typeof textOrConfig === 'string' ? { text: textOrConfig } : textOrConfig;
  return traceQuery(connection, config, () => runQueryUntraced(connection, textOrConfig, values));
}

async function runQueryUntraced(connection, textOrConfig, values) {
  const config = typeof textOrConfig === 'string' ? { text: textOrConfig, values } : { ...textOrConfig };
  if (values !== undefined) config.values = values;
  const options = { rowMode: config.rowMode, prepare: config.prepare };
  const { text } = config;
  // describe: the types of the parameters and the columns of a text, without running it.
  if (config.describe) return connection.query(text, undefined, { describe: true });
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
    if (this.connection || this.connecting) throw new PgError('The client is already connected');
    this.connecting = true;
    let connection;
    try {
      connection = await traceConnect(this.options, () => connectTo(this.options));
    } finally {
      this.connecting = false;
    }
    this.connection = connection;
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
    this.ending = null;
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
      connection = await traceConnect(this.options, () => connectTo(this.options));
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
    if (index !== -1) {
      this.connections.splice(index, 1);
      publishRemove(connection);
    }
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

  // A connection for one user until release(): the transactions run in it (traced as pg:pool:connect).
  connect() {
    return tracePoolConnect(this, () => this.connectUntraced());
  }

  async connectUntraced() {
    for (;;) {
      if (this.ended) throw new PgError('The pool has ended');
      const idle = this.connections.find(
        (connection) => !connection.taken && !connection.closed && connection.busy === 0
      );
      const connection = idle || (this.totalCount < this.max ? await this.open() : null);
      if (connection && !connection.taken && connection.busy === 0) {
        this.use(connection).taken = true;
        connection.uses = (connection.uses || 0) + 1;
        return new PoolClient(this, connection);
      }
      await this.wait();
    }
  }

  release(connection, err) {
    publishRelease(connection, err);
    connection.taken = false;
    if (err || connection.closed || connection.transactionStatus !== 'I') {
      // A connection left in a transaction (or broken) is not given to anyone else.
      connection.discarded = true;
      this.remove(connection);
      connection.destroy();
    } else if (!this.ended) this.onIdle(connection);
    // pool.end() waits for the connections given by connect() to be released.
    if (connection.onRelease) connection.onRelease();
  }

  // After changes of the schema (DROP and CREATE of tables or types): the statements every connection prepared are
  // prepared again (each closes them before its next query).
  forgetStatements() {
    this.connections.forEach((connection) => connection.forgetStatements());
  }

  // Ends the pool: no new queries nor connections; the queries already sent end (the server runs them), the
  // connections given by connect() are waited for until they are released, and then every connection is closed.
  end() {
    if (!this.ending) this.ending = this.endConnections();
    return this.ending;
  }

  async endConnections() {
    this.ended = true;
    const connections = this.connections;
    this.connections = [];
    this.wake();
    await Promise.all(
      connections.map(async (connection) => {
        clearTimeout(connection.idleTimer);
        if (connection.taken) {
          await new Promise((resolve) => {
            connection.onRelease = resolve;
          });
        }
        await connection.end();
      })
    );
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

// As pg: client.escapeIdentifier(name) and client.escapeLiteral(text).
for (const Class of [Client, PoolClient]) {
  Class.prototype.escapeIdentifier = escapeIdentifier;
  Class.prototype.escapeLiteral = escapeLiteral;
}

// Explicit resource management: `using client = await pool.connect()` releases the client at the end of its block,
// and `await using` ends a Client or a Pool.
PoolClient.prototype[Symbol.dispose] = function dispose() {
  this.release();
};
Client.prototype[Symbol.asyncDispose] = function asyncDispose() {
  return this.end();
};
Pool.prototype[Symbol.asyncDispose] = function asyncDispose() {
  return this.end();
};

module.exports = { Client, Pool, PoolClient, parseConfig };
