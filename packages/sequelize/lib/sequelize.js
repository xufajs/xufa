// Sequelize: a connection to a database (postgres or sqlite, and mongodb or memory with @xufa/orm's backends), the
// models defined in it, transactions and raw queries. The database is a Database of @xufa/orm, opened (and the models
// built in it) before the first query.
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { Database } from '@xufa/orm';
import { Model, HOOKS } from './model.js';
import { DataTypes } from './data-types.js';
import { Op } from './operators.js';
import * as errors from './errors.js';
import { Transaction } from './transaction.js';
import { Deferrable } from './deferrable.js';
import { Validator } from './validate.js';
import { QueryTypes, formatQuery, nestRow } from './query.js';
import { QueryInterface, literal } from './query-interface.js';
import DIALECT_INFO from './dialects.json' with { type: 'json' };
import { ConnectionManager } from './connection-manager.js';
import * as associations from './associations.js';
import * as inflection from './utils.js';
import { createRequire } from 'node:module';
import * as dataTypesModule from './data-types.js';

const require = createRequire(import.meta.url);

const { isPlainObject } = inflection;

const DIALECTS = {
  postgres: 'postgres',
  postgresql: 'postgres',
  sqlite: 'sqlite',
  mongodb: 'mongodb',
  memory: 'memory',
};

// The options of the constructor: (url, options), (database, username, password, options) or (options).
function parseArguments(args) {
  if (typeof args[0] === 'string' && args[0].includes(':') && (args.length === 1 || isPlainObject(args[1]))) {
    const url = args[0];
    const options = { ...(args[1] || {}) };
    if (url.startsWith('sqlite:')) {
      options.dialect = 'sqlite';
      const storage = url.slice('sqlite:'.length).replace(/^\/\//, '');
      options.storage = options.storage || (storage === ':memory:' || storage === '' ? ':memory:' : storage);
    } else {
      const parsed = new URL(url);
      const protocol = parsed.protocol.replace(/:$/, '');
      options.dialect = options.dialect || DIALECTS[protocol] || protocol;
      options.url = url;
      options.database = options.database || decodeURIComponent(parsed.pathname.slice(1));
    }
    return options;
  }
  if (isPlainObject(args[0])) return { ...args[0] };
  const [database, username, password, options = {}] = args;
  return { ...options, database, username, password };
}

// Hooks are kept, as Sequelize keeps them, in options.hooks: { type: [{ name, fn }] } (functions given there too).
// No hooks: the same empty list (hooks are looked up on every operation).
const NO_HOOKS = Object.freeze([]);

function hooksOf(store, type) {
  const hooks = store && store.hooks && store.hooks[type];
  if (!hooks || (Array.isArray(hooks) && hooks.length === 0)) return NO_HOOKS;
  return []
    .concat(hooks || [])
    .map((hook) => (typeof hook === 'function' ? { fn: hook } : { ...hook, fn: hook.fn || hook.hook }));
}

function addHookTo(store, type, name, fn) {
  const hook = typeof name === 'function' ? name : fn;
  if (!store.hooks) store.hooks = {};
  store.hooks[type] = [...hooksOf(store, type), { name: typeof name === 'string' ? name : undefined, fn: hook }];
}

function removeHookFrom(store, type, nameOrFn) {
  if (!store.hooks) return;
  store.hooks[type] = hooksOf(store, type).filter((hook) => hook.name !== nameOrFn && hook.fn !== nameOrFn);
}

// The settings of the connections of PostgreSQL, as Sequelize gives them to pg: those of dialectOptions it takes
// (ssl, application_name, the timeouts, options...), ssl of the options, and client_min_messages (warning by
// default; clientMinMessages of the options or of dialectOptions, false or 'IGNORE' to leave the server's).
const PG_DIALECT_OPTIONS = [
  'application_name',
  'ssl',
  'client_encoding',
  'binary',
  'keepAlive',
  'keepAliveInitialDelayMillis',
  'statement_timeout',
  'query_timeout',
  'connectionTimeoutMillis',
  'idle_in_transaction_session_timeout',
  'lock_timeout',
  'options',
  'stream',
];
function pgDialectOptions(options) {
  const dialectOptions = options.dialectOptions || {};
  const result = {};
  PG_DIALECT_OPTIONS.forEach((name) => {
    if (dialectOptions[name] !== undefined) result[name] = dialectOptions[name];
  });
  if (result.ssl === undefined && options.ssl !== undefined) result.ssl = options.ssl;
  let level = options.clientMinMessages;
  if (level === undefined) level = dialectOptions.clientMinMessages;
  if (level === undefined) level = 'warning';
  if (level !== false && String(level).toUpperCase() !== 'IGNORE') {
    const setting = `-c client_min_messages=${String(level).toLowerCase()}`;
    result.options = result.options ? `${result.options} ${setting}` : setting;
  }
  return result;
}

// The errors of connections by their cause, as Sequelize gives them.
const CONNECTION_ERRORS = {
  ECONNREFUSED: errors.ConnectionRefusedError,
  ENOTFOUND: errors.HostNotFoundError,
  EAI_AGAIN: errors.HostNotFoundError,
  EHOSTUNREACH: errors.HostNotReachableError,
  ENETUNREACH: errors.HostNotReachableError,
  EINVAL: errors.InvalidConnectionError,
  ETIMEDOUT: errors.ConnectionTimedOutError,
  // No connection of the pool in time (pool.acquire).
  ACQUIRE_TIMEOUT: errors.ConnectionAcquireTimeoutError,
};

class Sequelize {
  constructor(...args) {
    const options = parseArguments(args);
    const config = {
      database: options.database,
      username: options.username,
      password: options.password,
      host: options.host || 'localhost',
      port: options.port,
    };
    // The hooks of the class (beforeInit, afterInit) can change the config and the options.
    Sequelize.xufaRunSync('beforeInit', config, options);
    this.options = {
      dialect: 'sqlite',
      logging: console.log, // eslint-disable-line no-console
      define: {},
      replication: false,
      // The version of the server, as Sequelize keeps it (0: not known yet).
      databaseVersion: 0,
      ...options,
      hooks: {},
    };
    // The configuration of the connections, as Sequelize gives it.
    this.config = {
      ...config,
      pool: this.options.pool,
      protocol: this.options.protocol,
      native: this.options.native,
      ssl: this.options.ssl,
      replication: this.options.replication,
      dialectModule: this.options.dialectModule,
      dialectModulePath: this.options.dialectModulePath,
      keepDefaultTimezone: this.options.keepDefaultTimezone,
      dialectOptions: this.options.dialectOptions,
    };
    // How BIGINT values are given: numbers while they are safe integers (bigints beyond), bigints, or strings (as
    // Sequelize 6 gives them in PostgreSQL).
    if (this.options.bigint !== undefined && !['number', 'bigint', 'string'].includes(this.options.bigint)) {
      throw new errors.BaseError(`The bigint option is number, bigint or string (not ${this.options.bigint})`);
    }
    const dialect = DIALECTS[this.options.dialect];
    if (!dialect) {
      throw new errors.BaseError(
        `The dialect ${this.options.dialect} is not supported. Supported dialects: postgres and sqlite (by @xufa/sequelize).`
      );
    }
    this.dialectName = dialect;
    // What the dialect is and supports, as Sequelize tells it (sequelize.dialect.supports).
    this.dialect = { ...(DIALECT_INFO[dialect] || { name: dialect, supports: {} }) };
    // The oldest version of the server Sequelize supports, and the query generator (that of the query interface, with
    // the operatorsAliases as OperatorsAliasMap).
    this.dialect.defaultVersion = dialect === 'postgres' ? '9.5.0' : '3.8.0';
    Object.defineProperty(this.dialect, 'queryGenerator', {
      get: () => this.getQueryInterface().queryGenerator,
      configurable: true,
    });
    this.models = {};
    this.modelManager = {
      models: [],
      // A model defined with the name of another replaces it.
      addModel: (model) => {
        // A model of the same name (in the same schema) is replaced.
        this.modelManager.models = this.modelManager.models.filter(
          (other) => other.name !== model.name || (other.xufaSchema || null) !== (model.xufaSchema || null)
        );
        this.models[model.name] = model;
        this.modelManager.models.push(model);
        this.xufaPending = true;
      },
      getModel: (name) => this.models[name],
      get all() {
        return this.models;
      },
      removeModel: (model) => {
        this.modelManager.models = this.modelManager.models.filter((other) => other !== model);
        if (this.models[model.name] === model) delete this.models[model.name];
      },
      findModel: (fn) => this.modelManager.models.find(fn),
    };
    Object.entries(options.hooks || {}).forEach(([type, hooks]) => {
      [].concat(hooks).forEach((hook) => this.addHook(type, hook));
    });
    this.xufaDb = new Database({ backend: dialect, ...this.backendOptions(dialect) });
    this.xufaIsReady = false;
    this.xufaPending = false;
    this.xufaConnecting = null;
    this.xufaConnectionManager = new ConnectionManager(this);
    if (this.xufaDb.backend.pool) this.xufaConnectionManager.xufaOpenThrough(this.xufaDb.backend.pool);
    this.installLogging();
    this.installReplication();
    this.installPoolHooks();
    Sequelize.xufaRunSync('afterInit', this);
  }

  xufaHookList(type) {
    return hooksOf(this.options, type);
  }

  // Hooks of the class.

  static addHook(type, name, fn) {
    addHookTo(Sequelize.options, type, name, fn);
    return this;
  }

  // As with CLS in Sequelize: the queries made inside a managed transaction are part of it without { transaction }
  // (they always are in SQLite).
  static useCLS(namespace) {
    if (!namespace || typeof namespace.get !== 'function' || typeof namespace.run !== 'function') {
      throw new Error('Must provide CLS namespace');
    }
    Sequelize._cls = namespace;
    return this;
  }

  // Runs in a context of the CLS namespace (when there is one).
  static _clsRun(fn) {
    const ns = Sequelize._cls;
    if (!ns) return fn();
    let result;
    ns.run((context) => {
      result = fn(context);
    });
    return result;
  }

  // The transaction of the CLS context, for options not given one.
  static xufaWithCLS(options) {
    const ns = Sequelize._cls;
    if (!ns || !options || options.transaction !== undefined) return options;
    const transaction = ns.get('transaction');
    return transaction ? { ...options, transaction } : options;
  }

  static removeHook(type, nameOrFn) {
    removeHookFrom(Sequelize.options, type, nameOrFn);
    return this;
  }

  static hasHook(type) {
    return hooksOf(Sequelize.options, type).length > 0;
  }

  static xufaRunSync(type, ...args) {
    hooksOf(Sequelize.options, type).forEach((hook) => hook.fn.apply(Sequelize, args));
  }

  // Hooks run as they are defined (beforeDefine, afterDefine): not waited for.
  xufaRunSync(type, ...args) {
    hooksOf(this.options, type).forEach((hook) => hook.fn.apply(this, args));
  }

  backendOptions(dialect) {
    const { options, config } = this;
    if (dialect === 'sqlite') return { filename: options.storage || ':memory:' };
    if (dialect === 'postgres') {
      // replication (as Sequelize): the primary (write) is the database of @xufa/orm; the replicas (read) are pools of
      // their own (see installReplication).
      const { replication } = options;
      if (replication && replication.write) return this.pgServerOptions(replication.write);
      return this.pgServerOptions({});
    }
    if (dialect === 'mongodb') return { url: options.url, database: config.database };
    return {};
  }

  // beforePoolAcquire(config) and afterPoolAcquire(connection, config), as Sequelize runs them (PostgreSQL): around
  // what takes the pool, each query (whose connection is the pool's to choose: the pool is given) and each connection
  // of transactions. Nothing is run when there are no such hooks.
  installPoolHooks() {
    const { pool } = this.xufaDb.backend;
    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') return;
    const query = pool.query.bind(pool);
    const connect = pool.connect.bind(pool);
    const around = async (acquire) => {
      if (this.hasHook('beforePoolAcquire')) await this.runHooks('beforePoolAcquire', this.config);
      const taken = await acquire();
      if (this.hasHook('afterPoolAcquire')) await this.runHooks('afterPoolAcquire', taken, this.config);
      return taken;
    };
    pool.query = (...args) => {
      if (!this.hasHook('beforePoolAcquire') && !this.hasHook('afterPoolAcquire')) return query(...args);
      return around(async () => pool).then(() => query(...args));
    };
    pool.connect = () => {
      if (!this.hasHook('beforePoolAcquire') && !this.hasHook('afterPoolAcquire')) return connect();
      return around(connect);
    };
  }

  // The settings of a server of PostgreSQL: those of the instance, with those given over them (the servers of
  // replication: host, port, username, password, database).
  pgServerOptions(server) {
    const { options, config } = this;
    const pool = options.pool || {};
    const connection = { ...pgDialectOptions(options), max: pool.max || 10 };
    if (pool.idle !== undefined) connection.idleTimeoutMillis = pool.idle;
    // How long a query waits for a connection of the pool (pool.acquire, 60 s by default as in Sequelize).
    connection.acquireTimeoutMillis = pool.acquire !== undefined ? pool.acquire : 60000;
    if (options.url && !server.host) {
      // The options of the connection string (?options=-c...) go with those made here (client_min_messages).
      let given = null;
      try {
        given = new URL(options.url).searchParams.get('options');
      } catch {
        // not a URL there
      }
      if (given && connection.options) connection.options = `${given} ${connection.options}`;
      return { url: options.url, ...connection };
    }
    // The settings as they are (a wrong one fails when connecting, as in Sequelize).
    return {
      host: server.host || config.host,
      port: server.port || config.port || 5432,
      user: server.username || config.username,
      password: server.password !== undefined ? server.password : config.password,
      database: server.database || config.database,
      ...connection,
    };
  }

  // replication: { write, read: [...] } (PostgreSQL), as Sequelize: what reads (finds, counts, aggregates, queries of
  // type SELECT; not with useMaster) runs on the replicas, in turn, and read-only transactions too; the rest on the
  // primary. The pools are chosen by connectionManager.pool.read.acquire() and .write.acquire().
  installReplication() {
    this.xufaReplica = new AsyncLocalStorage();
    const { replication } = this.options;
    const { pool } = this.xufaDb.backend;
    const reads = replication && Array.isArray(replication.read) ? replication.read : [];
    if (this.dialectName !== 'postgres' || !pool || reads.length === 0) return;
    // Pools of the class of the pool of the primary (that of @xufa/pg), whose connections are opened by
    // connectionManager._connect too.
    const Pool = pool.constructor;
    this.xufaReadPools = reads.map((server) => {
      const { url, ...settings } = this.pgServerOptions(server);
      const read = new Pool(url ? { connectionString: url, ...settings } : settings);
      read.on('error', () => {});
      this.xufaConnectionManager.xufaOpenThrough(read);
      return read;
    });
    const query = pool.query.bind(pool);
    const connect = pool.connect.bind(pool);
    const write = { query, connect };
    let next = 0;
    const manager = this.xufaConnectionManager;
    manager.xufaPools = {
      read: {
        acquire: () => {
          const chosen = this.xufaReadPools[next % this.xufaReadPools.length];
          next += 1;
          return chosen;
        },
      },
      write: { acquire: () => write },
    };
    const target = () => (this.xufaReplica.getStore() === 'read' ? manager.pool.read : manager.pool.write).acquire();
    pool.query = (...args) => target().query(...args);
    pool.connect = () => target().connect();
  }

  // With replication: a read-only transaction on a replica, the others on the primary (savepoints where they are).
  xufaReplicaOf(transaction, fn) {
    if (!this.xufaReadPools || transaction.options.transaction) return fn();
    return this.xufaReplica.run(transaction.options.readOnly ? 'read' : 'write', fn);
  }

  // Runs what reads on the replicas (with replication, unless useMaster).
  xufaReading(options, fn) {
    if (!this.xufaReadPools || (options && (options.useMaster || options.transaction)) || this.xufaReplica.getStore()) {
      return fn();
    }
    return this.xufaReplica.run('read', fn);
  }

  // The SQL run is given to options.logging (console.log by default, as in Sequelize; false for none).
  // The options of a call (logging, benchmark) are those of its async context.
  installLogging() {
    const { backend } = this.xufaDb;
    this.xufaLogContext = new AsyncLocalStorage();
    if (typeof backend.query !== 'function' || typeof backend.execute !== 'function') return;
    const query = backend.query.bind(backend);
    const execute = backend.execute.bind(backend);
    backend.query = (sql, params) => this.xufaLogged(sql, params, () => query(sql, params));
    backend.execute = (sql, params) => this.xufaLogged(sql, params, () => execute(sql, params));
  }

  xufaLogged(sql, params, run) {
    const store = this.xufaLogContext.getStore();
    const logging = store && store.logging !== undefined ? store.logging : this.options.logging;
    if (!logging) return run();
    const log = typeof logging === 'function' ? logging : console.log; // eslint-disable-line no-console
    const options = (store && store.options) || {};
    // The parameters as Sequelize logs them: "a", 1 (or the object of named binds).
    const stringify = (value) =>
      JSON.stringify(value, (key, item) => (typeof item === 'bigint' ? item.toString() : item));
    const text = params && params.length ? `${sql}; ${params.map(stringify).join(', ')}` : sql;
    const benchmark = store && store.benchmark !== undefined ? store.benchmark : this.options.benchmark;
    const id = (store && store.transactionId) || 'default';
    if (!benchmark) {
      log(`Executing (${id}): ${text}`, options);
      return run();
    }
    const start = Date.now();
    return Promise.resolve(run()).then((result) => {
      log(`Executed (${id}): ${text}`, Date.now() - start, options);
      return result;
    });
  }

  getDialect() {
    return this.dialectName;
  }

  getDatabaseName() {
    return this.config.database;
  }

  // Models

  define(name, attributes = {}, options = {}) {
    const model = { [name]: class extends Model {} }[name];
    model.init(attributes, { ...options, modelName: name, sequelize: this });
    return model;
  }

  model(name) {
    if (!this.isDefined(name)) throw new Error(`${name} has not been defined`);
    return this.models[name];
  }

  isDefined(name) {
    return Object.hasOwn(this.models, name);
  }

  // A model given by its name or by its table name.
  xufaModelOf(reference) {
    if (typeof reference === 'function') return reference;
    if (reference && typeof reference === 'object') {
      return Object.values(this.models).find(
        (model) => model.tableName === reference.tableName && (model.xufaSchema || null) === (reference.schema || null)
      );
    }
    if (this.models[reference]) return this.models[reference];
    return Object.values(this.models).find((model) => model.tableName === reference);
  }

  // Builds the models not built yet (in @xufa/orm) and opens the database: before the first query.
  // `model`: a model to build too (one defined before the models were cleared, still in use).
  async xufaReady(model) {
    await this.xufaConnect();
    if (this.xufaPending || !this.xufaIsReady || (model && !model.xufaBuilt)) {
      this.xufaBuildModels(model);
      this.xufaIsReady = true;
    }
  }

  // Opens the database (without building the models: what the QueryInterface needs).
  async xufaConnect() {
    // As Sequelize: the directory of an SQLite file is made when it is not there.
    const { storage } = this.options;
    if (this.dialectName === 'sqlite' && storage && storage !== ':memory:' && !storage.startsWith('file:')) {
      const dir = path.dirname(path.resolve(storage));
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }
    if (!this.xufaConnecting) {
      this.xufaConnecting = this.xufaDb.connect().catch((err) => {
        this.xufaConnecting = null;
        // As Sequelize words the errors of SQLite: SQLITE_CANTOPEN: ...
        if (err && err.errcode === 14 && !/^SQLITE_/.test(err.message)) err.message = `SQLITE_CANTOPEN: ${err.message}`;
        // The error of its cause (ECONNREFUSED: ConnectionRefusedError...), or a ConnectionError.
        let code;
        for (let item = err; item && !code; item = item.cause) code = item.code;
        const ByCause = CONNECTION_ERRORS[code] || errors.ConnectionError;
        throw new ByCause(err);
      });
    }
    await this.xufaConnecting;
  }

  // Builds a model again (its attributes changed), and the models that point to it (their keys point to the new one).
  xufaRebuild(model, seen = new Set()) {
    if (seen.has(model)) return;
    seen.add(model);
    model.xufaBuilt = false;
    this.xufaPending = true;
    // A model and its copies in schemas have the same attributes: they are built again together.
    const base = model.xufaBase || model;
    [
      base,
      ...(base.xufaCopies ? base.xufaCopies.values() : []),
      ...(base.xufaSyncCopies ? base.xufaSyncCopies.values() : []),
    ]
      .filter((member) => member.xufaBuilt)
      .forEach((member) => this.xufaRebuild(member, seen));
    this.modelManager.models.forEach((other) => {
      if (!other.xufaBuilt) return;
      const points = [...other.xufaForeignKeys.values()].some((key) => key.target === model);
      if (points) this.xufaRebuild(other, seen);
    });
  }

  xufaBuildModels(extra) {
    this.xufaPending = false;
    const models = this.modelManager.models.filter((model) => !model.xufaBuilt);
    // A model asked for, and the models its keys point to, built when they are not.
    const add = (model) => {
      if (!model || model.xufaBuilt || models.includes(model)) return;
      models.push(model);
    };
    // Scoped models are their base; copies in other schemas are models of their own.
    // (a scoped model is the model it scopes, a copy in a schema too).
    const unscoped = extra && Object.hasOwn(extra, 'xufaIsScoped') ? extra.xufaBase : extra;
    add(unscoped && (unscoped.xufaCopy ? unscoped : unscoped.xufaBase || unscoped));
    // The models the keys of each one point to (copies in schemas too), built when they are not.
    for (let i = 0; i < models.length; i += 1) {
      const model = models[i];
      model.xufaForeignKeys.forEach((key) => add(model.xufaTargetOf(key)));
    }
    if (models.length === 0) return;
    models.forEach((model) => model.xufaBuild());
    // In the order they were defined: a model defined again (with the name of one before) replaces it.
    models.forEach((model) => {
      const old = this.xufaDb.models.get(model.xufa.name);
      if (old) {
        // The reverse relations of the model replaced go away from the models it pointed to.
        old.meta.relations.forEach((field) => {
          const { meta } = field.target;
          meta.reverse = meta.reverse.filter((other) => other !== field);
        });
        this.xufaDb.models.delete(model.xufa.name);
      }
      this.xufaDb.register(model.xufa);
    });
    models.forEach((model) => model.xufaPrepare());
  }

  async authenticate() {
    await this.xufaReady();
    if (this.xufaDb.backend.raw) await this.xufaDb.backend.raw('SELECT 1', []);
  }

  // Runs with the logging of options (logging: false, a function, benchmark).
  xufaLogging(options, fn) {
    if (!options || (options.logging === undefined && options.benchmark === undefined)) return fn();
    return this.xufaLogContext.run({ logging: options.logging, benchmark: options.benchmark, options }, fn);
  }

  // Tables are made in the transaction given ({ transaction }), when there is one.
  async sync(options = {}) {
    if (options.transaction) return this.xufaRun(options, () => this.xufaSync(options));
    return this.xufaLogging(options, () => this.xufaSync(options));
  }

  async xufaSync(options) {
    if (options.match && !options.match.test(this.config.database || '')) {
      throw new Error(`Database "${this.config.database}" does not match sync match parameter "${options.match}"`);
    }
    await this.xufaReady();
    if (options.hooks !== false) await this.runHooks('beforeBulkSync', options);
    // Models of the same table (a model defined again by another name): the table is the last one's, as Sequelize
    // makes the tables one after the other (each sync({ force }) drops the table of the one before).
    const all = this.xufaMetas();
    const lastOf = new Map(all.map((meta) => [meta.key, meta]));
    const metas = all.filter((meta) => lastOf.get(meta.key) === meta);
    const models = metas
      .map((meta) => this.modelManager.models.find((item) => item.xufa === meta.model))
      .filter(Boolean);
    if (options.force) {
      await this.xufaDb.backend.dropSchema([...metas].reverse());
      for (const model of models) await model.xufaDropEnums();
    } else if (options.alter) {
      for (const meta of metas) {
        const model = this.modelManager.models.find((item) => item.xufa === meta.model);
        if (model) await model.xufaAlter(options.alter === true ? {} : options.alter);
      }
    }
    // The hooks of each model (beforeSync, afterSync) around the tables made.
    const hooks = options.hooks !== false;
    if (hooks) for (const model of models) if (model.hasHook('beforeSync')) await model.runHooks('beforeSync', options);
    // As Sequelize 7: the schemas of the tables are made when they are not there (their enum types are made in them).
    await this.xufaDb.backend.ensureSchemas(metas);
    for (const model of models) await model.xufaCreateEnums();
    await this.xufaDb.backend.createSchema(metas);
    // The comments of the columns (PostgreSQL).
    if (this.dialectName === 'postgres') for (const model of models) await model.xufaComments(options);
    if (hooks) for (const model of models) if (model.hasHook('afterSync')) await model.runHooks('afterSync', options);
    if (options.hooks !== false) await this.runHooks('afterBulkSync', options);
    return this;
  }

  // Deletes the rows of every model.
  async truncate(options = {}) {
    await this.xufaReady();
    const models = [...this.modelManager.models].reverse();
    for (const model of models) await model.truncate(options);
  }

  // The version of the database server.
  async databaseVersion() {
    await this.xufaReady();
    const { backend } = this.xufaDb;
    const sql = this.dialectName === 'sqlite' ? 'SELECT sqlite_version() AS version' : 'SHOW server_version';
    const [row] = await backend.raw(sql, []);
    return String(row.version || row.server_version).split(' ')[0];
  }

  async drop() {
    await this.xufaReady();
    await this.xufaDb.backend.dropSchema(this.xufaMetas().reverse());
  }

  // The metas of the models defined, each after those it points to.
  xufaMetas() {
    const current = new Set(this.modelManager.models.map((model) => model.xufa));
    const sorted = [];
    const visiting = new Set();
    const visit = (model) => {
      if (sorted.includes(model.meta) || visiting.has(model)) return;
      visiting.add(model);
      model.meta.relations.forEach((field) => {
        if (current.has(field.target)) visit(field.target);
      });
      visiting.delete(model);
      sorted.push(model.meta);
    };
    current.forEach(visit);
    return sorted;
  }

  async close() {
    if (this.xufaConnecting) {
      await this.xufaConnecting.catch(() => {});
      await this.xufaDb.close();
    }
    if (this.xufaReadPools) await Promise.all(this.xufaReadPools.map((pool) => pool.end().catch(() => {})));
    this.xufaConnecting = null;
    this.xufaIsReady = false;
  }

  // Session variables of MySQL and MariaDB, which Sequelize sets only there.
  async set() {
    throw new Error('sequelize.set is only supported for mysql or mariadb');
  }

  // Hooks of every model.

  addHook(type, name, fn) {
    addHookTo(this.options, type, name, fn);
    return this;
  }

  removeHook(type, nameOrFn) {
    removeHookFrom(this.options, type, nameOrFn);
    return this;
  }

  hasHook(type) {
    return this.xufaHasHook(type);
  }

  xufaHasHook(type) {
    return hooksOf(this.options, type).length > 0;
  }

  // Logs as Sequelize does: with options.logging (and its benchmark), unless it is false.
  // As Sequelize: the last argument is options when it is an object with logging (else the arguments are all logged).
  log(...args) {
    const last = args[args.length - 1];
    const given = isPlainObject(last) && Object.hasOwn(last, 'logging');
    const options = given ? last : this.options;
    if (given && last.logging === console.log) args.pop(); // eslint-disable-line no-console
    if (!options.logging) return;
    const log = options.logging === true ? console.log : options.logging; // eslint-disable-line no-console
    log(...args);
  }

  async runHooks(type, ...args) {
    const hooks = hooksOf(this.options, type);
    for (let i = 0; i < hooks.length; i += 1) await hooks[i].fn.apply(this, args);
  }

  // Transactions: managed (transaction(fn): committed when fn ends, rolled back when it throws) or not (transaction()
  // gives one to commit() or rollback()). The queries made in fn, or given { transaction }, are part of it.
  async transaction(options, fn) {
    if (typeof options === 'function') {
      fn = options;
      options = {};
    }
    await this.xufaReady();
    const { backend } = this.xufaDb;
    if (fn) {
      const transaction = new Transaction(this, options);
      // In a transaction given (options.transaction), it is a savepoint of it. With CLS, the transaction is the one of
      // the context of the callback.
      const result = await Sequelize._clsRun(() =>
        this.xufaRun(options, () =>
          this.xufaReplicaOf(transaction, () =>
            this.xufaDb.transaction(
              async () => {
                transaction.xufaStore = backend.context.getStore();
                if (Sequelize._cls) Sequelize._cls.set('transaction', transaction);
                await transaction.xufaDefer();
                try {
                  return await fn(transaction);
                } catch (err) {
                  transaction.finished = 'rollback';
                  throw err;
                }
              },
              { mode: transaction.options.type }
            )
          )
        )
      );
      transaction.finished = 'commit';
      await transaction.xufaAfterCommit();
      return result;
    }
    return Transaction.start(this, options);
  }

  // Runs an operation in the transaction of options (when it is not the one of the async context), with the errors of
  // the database as those of Sequelize.
  // options.searchPath (PostgreSQL): the operation runs with that search_path ('schema_one,public'), set for it in a
  // transaction of its own (or in the one given) with SET LOCAL, so its tables are those of the first schemas.
  xufaWithSearchPath(options, fn) {
    const path = String(options.searchPath)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => `"${name.replace(/^"|"$/g, '').replace(/"/g, '""')}"`)
      .join(', ');
    const run = async (transaction) => {
      await this.xufaDb.backend.context.run(transaction.xufaStore, () =>
        this.xufaDb.backend.raw(`SET LOCAL search_path TO ${path}`, [])
      );
      // The queries of the operation without a transaction stay in this one (they would run outside it).
      transaction.xufaStore.xufaSearchPath = options.searchPath;
      return this.xufaRun({ ...options, transaction, xufaSearchPathSet: true }, fn);
    };
    if (options.transaction) return run(options.transaction);
    return this.transaction((transaction) => run(transaction));
  }

  xufaRun(options, fn) {
    if (options && options.searchPath && !options.xufaSearchPathSet && this.dialectName === 'postgres') {
      return this.xufaWithSearchPath(options, fn);
    }
    const transaction = options && options.transaction;
    const logged = options && (options.logging !== undefined || options.benchmark !== undefined || transaction);
    // The logging of the options, and the transaction (its id is in the log, as Sequelize writes it).
    const call = logged
      ? () => {
          const outer = this.xufaLogContext.getStore();
          const store = {
            logging: options.logging !== undefined ? options.logging : outer && outer.logging,
            benchmark: options.benchmark !== undefined ? options.benchmark : outer && outer.benchmark,
            options,
            transactionId: transaction ? transaction.id : outer && outer.transactionId,
          };
          return this.xufaLogContext.run(store, fn);
        }
      : fn;
    // The errors as those of Sequelize (a handler of the promise: no async function more for every call).
    const failed = (err) => {
      throw this.xufaError(err);
    };
    const run = () => {
      let result;
      try {
        result = call();
      } catch (err) {
        return Promise.reject(this.xufaError(err));
      }
      return Promise.resolve(result).then(undefined, failed);
    };
    // As Sequelize: what is given transaction: null runs outside the transaction of its context (and, without CLS, in
    // PostgreSQL, what is given none), where the database has connections for it (not an SQLite in memory).
    const { backend } = this.xufaDb;
    const store = backend.context.getStore();
    const outside =
      transaction === null ||
      (!transaction && !Sequelize._cls && this.dialectName === 'postgres' && !(store && store.xufaSearchPath));
    if (outside && store && (this.dialectName === 'postgres' || backend.separate)) {
      return backend.context.exit(run);
    }
    if (transaction && transaction.xufaStore) {
      if (transaction.finished) {
        const error = new Error(
          `${transaction.finished} has been called on this transaction(${transaction.id}), you can no longer use it. (The rejected query is attached as the 'sql' property of this error)`
        );
        if (options.xufaSql) error.sql = options.xufaSql;
        return Promise.reject(error);
      }
      const { context } = this.xufaDb.backend;
      if (context.getStore() !== transaction.xufaStore) return context.run(transaction.xufaStore, run);
    }
    return run();
  }

  // The errors of the database (and of @xufa/orm) as those of Sequelize.
  xufaError(err) {
    if (err instanceof errors.BaseError) return err;
    // A UniqueError of the ORM: the error of the database, which says the columns and values as Sequelize reads them.
    if (err && err.code === 'XUFA_ORM_ERR_UNIQUE' && err.cause) err = err.cause;
    if (err && err.code === 'XUFA_ORM_ERR_VALIDATION') {
      const items = Object.entries(err.errors || {}).flatMap(([path, messages]) =>
        messages.map((message) => new errors.ValidationErrorItem(message, 'Validation error', path))
      );
      return new errors.ValidationError(null, items);
    }
    if (!err || typeof err !== 'object' || (err.code && String(err.code).startsWith('XUFA_'))) return err;
    const message = String(err.message || '');
    const sqliteCode = err.errcode;
    // A database locked by another connection (SQLite): SQLITE_BUSY, as Sequelize words it.
    if (sqliteCode === 5) {
      return new errors.DatabaseError(Object.assign(err, { message: `SQLITE_BUSY: ${message}` }));
    }
    // Unique keys.
    const sqliteUnique = sqliteCode !== undefined && /^UNIQUE constraint failed/.test(message);
    if (err.code === '23505' || sqliteCode === 2067 || sqliteCode === 1555 || sqliteUnique || err.code === 11000) {
      const fields = {};
      // The detail of PostgreSQL is in the language of the server: only its (columns)=(values) is read.
      const detail = /\((.+)\)=\((.*)\)/.exec(err.detail || '');
      if (detail) {
        const columns = detail[1].split(', ').map((column) => column.replace(/"/g, ''));
        const values = detail[2].split(', ');
        columns.forEach((column, i) => {
          fields[column] = values[i];
        });
      } else {
        const failed = /UNIQUE constraint failed: (.+)$/.exec(message);
        if (failed)
          failed[1].split(', ').forEach((column) => {
            fields[column.split('.').pop()] = undefined;
          });
      }
      // The message of the unique key ({ unique: { name, msg } }) of the attributes of the model of the table.
      const table = err.table || (/UNIQUE constraint failed: ([^.]+)\./.exec(message) || [])[1];
      const model = this.modelManager.models.find((item) => item.tableName === table || item.xufaTable() === table);
      let custom = null;
      const items = Object.keys(fields).map((column) => {
        const attributes = model ? model.rawAttributes : {};
        const name = Object.keys(attributes).find((key) => attributes[key].field === column);
        const unique = name && attributes[name].unique;
        const text =
          unique && typeof unique === 'object' && unique.msg ? unique.msg : `${name || column} must be unique`;
        if (unique && typeof unique === 'object' && unique.msg) custom = unique.msg;
        return new errors.ValidationErrorItem(text, 'unique violation', name || column, fields[column]);
      });
      return new errors.UniqueConstraintError({
        parent: err,
        fields,
        errors: items,
        message: custom || 'Validation error',
      });
    }
    if (
      err.code === '23503' ||
      err.code === '23001' ||
      sqliteCode === 787 ||
      (sqliteCode !== undefined && /FOREIGN KEY constraint failed/.test(message))
    ) {
      // PostgreSQL names the columns and values in the detail, in any language: Key (a, b)=(1, 2) ... The reltype
      // (child: a row that references one missing; parent: a row still referenced) only from English messages.
      const key = /\(([^)]*)\)=\((.*)\)/.exec(err.detail || '');
      let reltype;
      if (/^insert or update on table/.test(message)) reltype = 'child';
      else if (/^update or delete on table/.test(message)) reltype = 'parent';
      return new errors.ForeignKeyConstraintError({
        parent: err,
        table: err.table,
        fields: key
          ? key[1].split(', ').map((name) => name.replace(/^"|"$/g, ''))
          : err.column
            ? [err.column]
            : undefined,
        value: key ? key[2].split(', ') : undefined,
        reltype,
        index: err.constraint,
      });
    }
    if (err.code === '23P01') return new errors.ExclusionConstraintError({ parent: err });
    if (err.code === '57014') return new errors.TimeoutError(err);
    const connection = CONNECTION_ERRORS[err.code || (err.cause && err.cause.code)];
    if (connection) return new connection(err); // eslint-disable-line new-cap
    if (err.code || sqliteCode !== undefined || err.severity) return new errors.DatabaseError(err);
    return err;
  }

  // Raw SQL: replacements (? or :name, written as parameters) or bind ($1 or $name). The type says what is given:
  // SELECT gives the rows (instances of options.model with mapToModel), RAW (by default) [rows, metadata].
  async query(sql, options = {}) {
    // The end of a transaction (queryInterface.commitTransaction, rollbackTransaction): logged, and done.
    if (options && options.xufaControl && options.transaction) return this.xufaControlQuery(sql, options);
    // Queries of type SELECT read (on a replica, with replication).
    if (this.xufaReadPools && options && options.type === 'SELECT' && !this.xufaReplica.getStore()) {
      return this.xufaReading(options, () => this.query(sql, options));
    }
    options = Sequelize.xufaWithCLS(options);
    await this.xufaReady();
    const { backend } = this.xufaDb;
    if (typeof backend.raw !== 'function') throw new errors.NotSupportedError(`Raw queries on ${this.dialectName}`);
    options = { ...options };
    let text = sql;
    if (typeof sql === 'object' && sql !== null) {
      if (sql.values !== undefined) {
        if (options.replacements !== undefined) {
          throw new Error('Both `sql.values` and `options.replacements` cannot be set at the same time');
        }
        options.replacements = sql.values;
      }
      if (sql.bind !== undefined) {
        if (options.bind !== undefined)
          throw new Error('Both `sql.bind` and `options.bind` cannot be set at the same time');
        options.bind = sql.bind;
      }
      text = sql.query;
    }
    text = String(text).trim();
    options.xufaSql = text;
    if (options.replacements && options.bind)
      throw new Error('Both `replacements` and `bind` cannot be set at the same time');
    const { query, params } = formatQuery(text, options, this.dialectName);
    const type = options.type || (options.model || options.nest || options.plain ? QueryTypes.SELECT : QueryTypes.RAW);
    // retry: { max, match }: the query is run again (up to max times) on the errors that match.
    const retry = options.retry || {};
    const max = retry.max || 1;
    const matches = (err) =>
      [].concat(retry.match || []).some((match) => {
        if (match instanceof RegExp) return match.test(err.message) || match.test(err.name);
        if (typeof match === 'function') return err instanceof match;
        return String(err.message).includes(match) || err.name === match;
      });
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.xufaRawQuery(query, params, type, options);
      } catch (err) {
        if (attempt >= max || !matches(err)) {
          // rawErrors: the error of the database as it is.
          if (options.rawErrors && err.parent) throw err.parent;
          throw err;
        }
      }
    }
  }

  xufaControlQuery(sql, options) {
    const { transaction } = options;
    const store = {
      logging: options.logging,
      benchmark: options.benchmark,
      options,
      transactionId: transaction.id,
    };
    const end = () => transaction.xufaControl(options.xufaControl);
    return this.xufaLogContext
      .run(store, () => this.xufaLogged(String(sql), [], end))
      .then(
        () => [[], 0],
        (err) => Promise.reject(this.xufaError(err))
      );
  }

  xufaRawQuery(query, params, type, options) {
    const { backend } = this.xufaDb;
    // After changes of the schema, prepared statements are prepared again (PostgreSQL).
    if (/^\s*(CREATE|DROP|ALTER|DO)\b/i.test(query)) {
      return this.xufaRun(options, () => backend.raw(query, params)).then((rows) => {
        backend.forgetStatements();
        return type === QueryTypes.SELECT ? rows : [rows, rows];
      });
    }
    return this.xufaRun(options, async () => {
      if (
        type === QueryTypes.UPDATE ||
        type === QueryTypes.BULKUPDATE ||
        type === QueryTypes.DELETE ||
        type === QueryTypes.BULKDELETE
      ) {
        const count = await backend.run(() => backend.execute(query, params));
        return type === QueryTypes.UPDATE ? [undefined, count] : count;
      }
      // Plain objects (the rows of node:sqlite have no prototype).
      const rows = (await backend.raw(query, params)).map((row) =>
        Object.getPrototypeOf(row) === null ? { ...row } : row
      );
      if (type === QueryTypes.SELECT) {
        let result = rows;
        if (options.model && options.mapToModel !== false) {
          result = rows.map((row) =>
            options.model.build(mapFields(options.model, row, options.fieldMap), { isNewRecord: false, raw: true })
          );
        } else {
          if (options.fieldMap) result = result.map((row) => mapFields(null, row, options.fieldMap));
          if (options.nest) result = result.map(nestRow);
        }
        return options.plain ? result[0] || null : result;
      }
      if (type === QueryTypes.INSERT) return [rows, rows.length];
      // The foreign keys of a table (queryGenerator.getForeignKeysQuery): in PostgreSQL, from their definitions.
      if (type === QueryTypes.FOREIGNKEYS) return this.dialectName === 'postgres' ? rows.map(foreignKeyRow) : rows;
      // As Sequelize in PostgreSQL: SHOW and DESCRIBE give their rows.
      if (this.dialectName === 'postgres' && /^\s*(show|describe)\b/i.test(query)) return rows;
      return [rows, rows];
    });
  }

  // A value as a literal of SQL.
  escape(value) {
    return literal(value, this.dialectName);
  }

  // The parsers of types of Sequelize's connection managers: @xufa/orm reads the values of every type itself, so there
  // are none to refresh or clear (tests and code that reset them run).
  // As Sequelize: the parse and stringify functions given to the DataTypes are taken (the parse functions of types the
  // dialect cannot parse are an error).
  refreshTypes() {
    dataTypesModule.checkParsers(this.dialectName);
    this.xufaTypesVersion = (this.xufaTypesVersion || 0) + 1;
  }

  get connectionManager() {
    return this.xufaConnectionManager;
  }

  getQueryInterface() {
    if (!this.xufaQueryInterface) this.xufaQueryInterface = new QueryInterface(this);
    return this.xufaQueryInterface;
  }

  get queryInterface() {
    return this.getQueryInterface();
  }

  createSchema(schema, options) {
    return this.getQueryInterface().createSchema(schema, options);
  }

  showAllSchemas(options) {
    return this.getQueryInterface().showAllSchemas(options);
  }

  dropSchema(schema, options) {
    return this.getQueryInterface().dropSchema(schema, options);
  }

  dropAllSchemas(options) {
    return this.getQueryInterface().dropAllSchemas(options);
  }

  random() {
    throw new errors.NotSupportedError('sequelize.random()');
  }

  // Expressions

  static fn(name, ...args) {
    return new Utils.Fn(name, args);
  }

  static col(name) {
    return new Utils.Col(name);
  }

  static literal(sql) {
    return new Utils.Literal(sql);
  }

  static where(attribute, comparator, value) {
    return new Utils.Where(attribute, comparator, value);
  }

  static cast(value, type) {
    return new Utils.Cast(value, type);
  }

  // A path inside json values ('data.owner.name'), with the value it is compared with; or conditions of json values
  // as objects ({ data: { owner: 'x' } }).
  static json(conditionsOrPath, value) {
    return new Utils.Json(conditionsOrPath, value);
  }

  static and(...items) {
    return { [Op.and]: items };
  }

  static or(...items) {
    return { [Op.or]: items };
  }

  fn(...args) {
    return Sequelize.fn(...args);
  }

  col(name) {
    return Sequelize.col(name);
  }

  literal(sql) {
    return Sequelize.literal(sql);
  }

  where(...args) {
    return Sequelize.where(...args);
  }

  and(...items) {
    return Sequelize.and(...items);
  }

  or(...items) {
    return Sequelize.or(...items);
  }

  cast(...args) {
    return Sequelize.cast(...args);
  }

  json(...args) {
    return Sequelize.json(...args);
  }
}

// The expressions of Sequelize (Sequelize.Utils.Fn...): what they are is in their xufa* properties.
class SequelizeMethod {}
const Utils = {
  SequelizeMethod,
  TICK_CHAR: '`',
  removeTicks(text, tickChar = '`') {
    return String(text).split(tickChar).join('');
  },
  addTicks(text, tickChar = '`') {
    return tickChar + Utils.removeTicks(text, tickChar) + tickChar;
  },
  // The helpers of Sequelize's Utils that code outside of it uses.
  useInflection: inflection.useInflection,
  pluralize: (text) => inflection.pluralize(text),
  singularize: (text) => inflection.singularize(text),
  camelize: (text) => text.trim().replace(/[-_\s]+(.)?/g, (_, char) => (char ? char.toUpperCase() : '')),
  underscore: (text) => inflection.underscore(text),
  camelizeIf: (text, condition) => (condition ? Utils.camelize(text) : text),
  underscoredIf: (text, condition) => (condition ? inflection.underscore(text) : text),
  isPrimitive: (value) => ['string', 'number', 'boolean'].includes(typeof value),
  // Fills what a has not (undefined) with what b has, merging plain objects.
  mergeDefaults(a, b) {
    for (const [key, value] of Object.entries(b || {})) {
      if (isPlainObject(a[key]) && isPlainObject(value)) Utils.mergeDefaults(a[key], value);
      else if (a[key] === undefined) a[key] = value;
    }
    return a;
  },
  spliceStr: (text, index, count, add) => text.slice(0, index) + add + text.slice(index + count),
  // A copy of arrays and plain objects, with the other objects kept (or copied by fn, when it gives a value).
  cloneDeep(value, fn) {
    const copy = (item) => {
      if (Array.isArray(item)) return item.map(copy);
      if (isPlainObject(item))
        return Object.fromEntries(Object.entries(item).map(([key, inner]) => [key, copy(inner)]));
      const custom = typeof fn === 'function' ? fn(item) : undefined;
      if (custom !== undefined) return custom;
      return item;
    };
    return copy(value || {});
  },
  isColString: (value) => typeof value === 'string' && value[0] === '$' && value[value.length - 1] === '$',
  canTreatArrayAsAnd: (array) => array.some((item) => isPlainObject(item) || item instanceof Utils.Where),
  combineTableNames: (a, b) => (a.toLowerCase() < b.toLowerCase() ? a + b : b + a),
  // The value of a default: called when it is a function, generated for UUIDV1/UUIDV4/NOW, copied when it is an
  // array or a plain object.
  toDefaultValue(value, dialect) {
    if (typeof value === 'function' && !value.kind) return value();
    const type = value && (typeof value === 'function' ? value.key : value.key);
    if (type === 'UUIDV1' || type === 'UUIDV4') return require('node:crypto').randomUUID(); // eslint-disable-line global-require
    if (type === 'UUIDV7') return dataTypesModule.uuidv7();
    if (type === 'NOW') return Utils.now(dialect);
    if (Array.isArray(value)) return value.slice();
    if (isPlainObject(value)) return { ...value };
    return value;
  },
  // Whether a default can be the default of the column (not generated by the code).
  defaultValueSchemable(value) {
    if (value === undefined) return false;
    const type = value && value.key;
    if (type === 'NOW' || type === 'UUIDV1' || type === 'UUIDV4' || type === 'UUIDV7') return false;
    return typeof value !== 'function';
  },
  stack() {
    const prepare = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const { stack } = new Error();
    Error.prepareStackTrace = prepare;
    return stack.slice(1);
  },
  // The time now: with milliseconds in the dialects that keep them (all of these).
  now(dialect) {
    const date = new Date();
    if (!['mariadb', 'mysql', 'postgres', 'sqlite', 'mssql', 'db2', 'oracle'].includes(dialect))
      date.setMilliseconds(0);
    return date;
  },
  // A class that can be called without new.
  classToInvokable: (Class) =>
    new Proxy(Class, {
      apply: (_, __, args) => new Class(...args),
      construct: (_, args) => new Class(...args),
    }),
  Fn: class Fn extends SequelizeMethod {
    constructor(fn, args) {
      super();
      this.fn = fn;
      this.xufaFn = fn;
      this.args = args;
    }
  },
  Col: class Col extends SequelizeMethod {
    constructor(col) {
      super();
      this.col = col;
      this.xufaCol = col;
    }
  },
  Literal: class Literal extends SequelizeMethod {
    constructor(val) {
      super();
      this.val = val;
      this.xufaLiteral = val;
    }
  },
  Cast: class Cast extends SequelizeMethod {
    constructor(value, type) {
      super();
      this.val = value;
      this.value = value;
      this.type = type;
      this.xufaCast = true;
    }
  },
  Where: class Where extends SequelizeMethod {
    constructor(attribute, comparator, value) {
      super();
      this.xufaWhere = true;
      this.attribute = attribute;
      this.comparator = comparator;
      this.value = value;
    }
  },
  Json: class Json extends SequelizeMethod {
    constructor(conditionsOrPath, value) {
      super();
      if (typeof conditionsOrPath === 'string') {
        this.path = conditionsOrPath;
        this.xufaJson = conditionsOrPath;
        this.value = value;
      } else {
        this.xufaJson = null;
        this.conditions = conditionsOrPath;
      }
    }
  },
};

// A foreign key of PostgreSQL (constraint_name, condef) as Sequelize gives it: id, table, from, to, on_update,
// on_delete.
function foreignKeyRow(row) {
  const parts =
    row.condef !== undefined &&
    row.condef.match(
      /FOREIGN KEY \((.+)\) REFERENCES (.+)\((.+)\)( ON (UPDATE|DELETE) (CASCADE|RESTRICT))?( ON (UPDATE|DELETE) (CASCADE|RESTRICT))?/
    );
  if (!parts) return row;
  const result = { ...row, id: row.constraint_name, table: parts[2], from: parts[1], to: parts[3] };
  for (let i = 5; i <= 8; i += 3) {
    if (/(UPDATE|DELETE)/.test(parts[i] || '')) result[`on_${parts[i].toLowerCase()}`] = parts[i + 1];
  }
  return result;
}

// The rows of raw queries with columns renamed to attributes (by fieldMap, or the fields of the model).
function mapFields(model, row, fieldMap) {
  if (!fieldMap && !(model && model.xufaColumns)) return row;
  const values = {};
  Object.keys(row).forEach((column) => {
    const name =
      (fieldMap && fieldMap[column]) || (model && model.xufaColumns && model.xufaColumns.get(column)) || column;
    values[name] = row[column];
  });
  return values;
}

// The hints of tables (MSSQL) and indexes (MySQL) of Sequelize: accepted in the options, and ignored, as Sequelize
// does in PostgreSQL and SQLite.
const TableHints = Object.freeze({
  NOLOCK: 'NOLOCK',
  READUNCOMMITTED: 'READUNCOMMITTED',
  UPDLOCK: 'UPDLOCK',
  REPEATABLEREAD: 'REPEATABLEREAD',
  SERIALIZABLE: 'SERIALIZABLE',
  READCOMMITTED: 'READCOMMITTED',
  TABLOCK: 'TABLOCK',
  TABLOCKX: 'TABLOCKX',
  PAGLOCK: 'PAGLOCK',
  ROWLOCK: 'ROWLOCK',
  NOWAIT: 'NOWAIT',
  READPAST: 'READPAST',
  XLOCK: 'XLOCK',
  SNAPSHOT: 'SNAPSHOT',
  NOEXPAND: 'NOEXPAND',
});
const IndexHints = Object.freeze({ USE: 'USE', FORCE: 'FORCE', IGNORE: 'IGNORE' });

Object.assign(Sequelize, {
  Op,
  DataTypes,
  Model,
  QueryTypes,
  QueryInterface,
  Transaction,
  LOCK: Transaction.LOCK,
  Deferrable,
  Utils,
  Validator,
  TableHints,
  IndexHints,
  useInflection: inflection.useInflection,
  ...associations,
  ...DataTypes,
  ...errors,
});

// What code that resets the type parsers of Sequelize's connection manager calls (nothing to do here).

// sequelize.Sequelize: the class (its data types, Op...), as Sequelize gives it on the instances.
Object.defineProperty(Sequelize.prototype, 'Sequelize', {
  get() {
    return Sequelize;
  },
});

// The hooks of every model and of the Sequelize instance, as methods: sequelize.beforeCreate(fn), Sequelize.beforeDefine.
[
  ...HOOKS,
  'beforeBulkSync',
  'afterBulkSync',
  'beforeDefine',
  'afterDefine',
  'beforeInit',
  'afterInit',
  'beforeConnect',
  'afterConnect',
  'beforeDisconnect',
  'afterDisconnect',
  'beforeQuery',
  'afterQuery',
].forEach((type) => {
  Sequelize.prototype[type] = function addTypedHook(name, fn) {
    return this.addHook(type, name, fn);
  };
});
Sequelize.options = { hooks: {} };
// The hooks of the class: Sequelize keeps the ones of models too (Sequelize.beforeCreate(fn)), but only runs those of
// init and define.
[
  ...HOOKS,
  'beforeBulkSync',
  'afterBulkSync',
  'beforeDefine',
  'afterDefine',
  'beforeInit',
  'afterInit',
  'beforeConnect',
  'afterConnect',
  'beforeDisconnect',
  'afterDisconnect',
  'beforePoolAcquire',
  'afterPoolAcquire',
].forEach((type) => {
  Sequelize[type] = function addTypedHook(name, fn) {
    return this.addHook(type, name, fn);
  };
});
Sequelize.hasHooks = Sequelize.hasHook;
Sequelize.prototype.hasHooks = Sequelize.prototype.hasHook;
Sequelize.Sequelize = Sequelize;
Sequelize.default = Sequelize;
// The version of Sequelize whose API this is.
Sequelize.version = '6.37.8';
Sequelize.prototype.Op = Op;
Sequelize.prototype.Validator = Validator;
Sequelize.prototype.QueryTypes = QueryTypes;
Sequelize.prototype.DataTypes = DataTypes;

// As Sequelize: validate is authenticate (the same function).
Sequelize.prototype.validate = Sequelize.prototype.authenticate;

export { Sequelize };
