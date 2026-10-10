// Database: a connection to a database through a backend, and the models registered in it.
//
//   const db = new Database({ backend: 'sqlite', filename: 'app.db' });
//   db.register(Author, Book);
//   await db.connect();
//   await db.sync(); // creates the tables (or collections and indexes) that do not exist
import { Model, defineReverseAccessor, defineManyToManyAccessor } from './model.js';
import fields from './fields.js';
import { lowerFirst, snakeCase } from './meta.js';
import { BackendError, ModelError } from './errors.js';
import { Backend } from './backends/base.js';
import { seconds } from './duration.js';
import * as migrations from './migrations.js';
import * as modelCache from './model-cache.js';
import { followWrites, inTransaction } from './query-cache.js';
import * as auditModule from './audit.js';
import * as faultsModule from './faults.js';

const backends = new Map();
let nextName = 0;

// Milliseconds of an option of health(): a number, or '500ms', '2s', '5m', '1h'.
function healthMs(value, what) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) throw new TypeError(`health(): ${what} '${value}' is not a duration (as '5m')`);
  return Number(match[1]) * { ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2]];
}

// The order to empty models in: those whose foreign keys point to others before them (a cycle: as they come).
function flushOrder(metas) {
  const left = new Set(metas);
  const out = [];
  const pointsTo = (meta) =>
    meta.fields.filter((field) => field.target && field.target.meta !== meta).map((field) => field.target.meta);
  while (left.size) {
    // A model no model left points to goes now.
    const free = [...left].find((meta) => ![...left].some((other) => other !== meta && pointsTo(other).includes(meta)));
    const next = free || left.values().next().value;
    out.push(next);
    left.delete(next);
  }
  return out;
}

class Database {
  // `backend` is the name of a backend ('memory', 'sqlite'...), a class of backend or an instance of one. The rest of
  // the options are given to the backend.
  constructor(options = {}) {
    const { backend = 'memory', name, cache, onCacheError, audit, ...rest } = options;
    this.options = rest;
    // The name of the database (in the keys of its cache), and the cache of its models (lib/cache.js).
    this.name = name || `db${(nextName += 1)}`;
    this.cache = cache || null;
    // What a cache that fails to read or keep is told to (a warning of the process by default): reads go to the database.
    this.onCacheError = typeof onCacheError === 'function' ? onCacheError : null;
    if (typeof backend === 'string') {
      const factory = backends.get(backend);
      if (!factory) throw new BackendError(`Unknown backend ${backend} (${[...backends.keys()].join(', ')})`);
      this.backend = new (factory())(rest);
    } else if (typeof backend === 'function') this.backend = new backend(rest);
    else this.backend = backend;
    this.models = new Map();
    // Tables changed from outside (the fs backend watching its folder): the cached objects of their models go.
    this.backend.changedOutside = (tables) => this.changedOutside(tables);
    // Writes give new versions to the models with the option cache (the results of cached() querysets: lib/query-cache.js).
    followWrites(this);
    this.expiryTimer = null;
    // The audit log of the changes of its objects (lib/audit.js), with the option audit; null without it.
    this.audit = null;
    if (audit) {
      if (this.backend.blobs || this.backend.mail)
        throw new BackendError(`The audit log needs a database, not a blob or mail backend (${this.backend.name})`);
      const { Audit, AuditEntry } = auditModule;
      this.audit = new Audit(this, audit);
      this.register(AuditEntry);
    }
  }

  // The options of a database from a URL, as DATABASE_URL: postgres://..., mongodb:// (and mongodb+srv://),
  // sqlite:path (sqlite::memory:), memory:, fs:folder; and of emails (as EMAIL_URL): smtp:// and smtps://, console:
  // (written to the console) and memory-mail: (kept in memory); with the options given over them.
  static optionsFromUrl(url, options = {}) {
    const text = String(url || '').trim();
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text);
    const kind = scheme ? scheme[1].toLowerCase() : '';
    const rest = text.slice(kind.length + 1).replace(/^\/\//, '');
    if (kind === 'postgres' || kind === 'postgresql') return { backend: 'postgres', url: text, ...options };
    if (kind === 'mongodb' || kind === 'mongodb+srv') return { backend: 'mongodb', url: text, ...options };
    if (kind === 'sqlite')
      return { backend: 'sqlite', filename: rest === ':memory:' || rest === '' ? ':memory:' : rest, ...options };
    if (kind === 'memory') return { backend: 'memory', ...options };
    if (kind === 'fs') return { backend: 'fs', dir: rest, ...options };
    if (kind === 'smtp' || kind === 'smtps') return { backend: 'smtp', url: text, ...options };
    if (kind === 'console') return { backend: 'console-mail', ...options };
    if (kind === 'memory-mail') return { backend: 'memory-mail', ...options };
    throw new BackendError(
      `Not a URL of a database: ${text.replace(/\/\/[^@/]*@/, '//***@')} (postgres://, mongodb://, sqlite:, memory:, fs:, smtp://, console:, memory-mail:)`
    );
  }

  // A database from a URL (Database.fromUrl(process.env.DATABASE_URL)).
  static fromUrl(url, options = {}) {
    return new Database(Database.optionsFromUrl(url, options));
  }

  static registerBackend(name, factory) {
    backends.set(name, factory);
  }

  // Registers models in the database: their QuerySets run in it. The foreign keys between them are resolved here.
  register(...models) {
    models.forEach((model) => {
      const { meta } = model;
      if (meta.abstract) throw new ModelError(model.name, 'abstract models cannot be registered');
      // A model can be in several databases (those of tenants); meta.db is the first.
      const existing = this.models.get(model.name);
      if (existing && existing !== model) throw new ModelError(model.name, 'another model has the same name');
      const blobs = meta.fields.some((field) => field.type === 'blob');
      const mail = meta.fields.some((field) => field.mailInfo);
      if (this.backend.blobs || this.backend.mail) this.backend.shape(meta);
      else if (blobs) {
        throw new ModelError(
          model.name,
          `fields.blob() is of blob backends (disk, memory-blob, s3, azure-blob), not of ${this.backend.name}`
        );
      } else if (mail) {
        throw new ModelError(
          model.name,
          `fields.mailInfo() is of mail backends (smtp, memory-mail, console-mail), not of ${this.backend.name}`
        );
      }
      if (!meta.db) meta.db = this;
      this.models.set(model.name, model);
    });
    // The through models of the many-to-many relations, registered as models of their own.
    [...this.models.values()].forEach((model) => {
      model.meta.manyToMany.forEach((field) => {
        if (!field.through) this.setUpManyToMany(field);
        else if (!this.models.has(field.through.name)) this.models.set(field.through.name, field.through);
      });
    });
    this.models.forEach((model) => {
      model.meta.relations.forEach((field) => {
        const { target } = field;
        if (!field.relatedName) field.relatedName = `${lowerFirst(model.name)}Set`;
        if (!target.meta.reverse.includes(field)) {
          const clash = target.meta.reverseRelation(field.relatedName);
          if (clash || target.meta.field(field.relatedName)) {
            throw new ModelError(model.name, `the related name ${field.relatedName} clashes in ${target.name}`);
          }
          target.meta.reverse.push(field);
          defineReverseAccessor(field);
        }
      });
    });
    return this;
  }

  // The through model of a many-to-many relation (made, or given as `through`), its foreign keys, and the accessors
  // of both models.
  setUpManyToMany(field) {
    const source = field.model;
    const { target } = field;
    let through;
    if (field.throughOption) {
      const option = field.throughOption;
      through = option.prototype instanceof Model ? option : option();
    } else {
      const self = source === target;
      const name = `${source.name}${field.name.charAt(0).toUpperCase()}${field.name.slice(1)}`;
      const sourceName = self ? `from${source.name}` : lowerFirst(source.name);
      const targetName = self ? `to${target.name}` : lowerFirst(target.name);
      // A class with the name of the through model (its name is the name of the model).
      through = { [name]: class extends Model {} }[name];
      through.fields = {
        [sourceName]: fields.foreignKey(source, { relatedName: `${lowerFirst(name)}Set` }),
        [targetName]: fields.foreignKey(target, { relatedName: `${lowerFirst(name)}${self ? 'ToSet' : 'Set'}` }),
      };
      through.options = {
        table: `${source.meta.table}_${snakeCase(field.name)}`,
        schema: source.meta.schema || undefined,
        indexes: [{ fields: [sourceName, targetName], unique: true }],
      };
    }
    const keys = through.meta.relations;
    const sourceKey = keys.find((key) => key.target === source);
    const targetKey = keys.find((key) => key.target === target && key !== sourceKey);
    if (!sourceKey || !targetKey) {
      throw new ModelError(through.name, `it needs a foreign key to ${source.name} and one to ${target.name}`);
    }
    field.through = through;
    field.sourceKey = sourceKey;
    field.targetKey = targetKey;
    if (!field.relatedName) field.relatedName = `${lowerFirst(source.name)}Set`;
    if (target.meta.field(field.relatedName) || target.meta.manyToManyRelation(field.relatedName)) {
      throw new ModelError(source.name, `the related name ${field.relatedName} clashes in ${target.name}`);
    }
    target.meta.reverseManyToMany.push(field);
    if (!this.models.has(through.name)) {
      if (!through.meta.db) through.meta.db = this;
      this.models.set(through.name, through);
    }
    defineManyToManyAccessor(source, field.name, field, sourceKey, targetKey, field.relatedName);
    defineManyToManyAccessor(target, field.relatedName, field, targetKey, sourceKey, field.name);
  }

  model(name) {
    return this.models.get(name);
  }

  changedOutside(tables) {
    const keys = new Set(tables);
    return Promise.all(
      [...this.models.values()]
        .filter((model) => keys.has(model.meta.key))
        .map((model) => modelCache.clear(this, model))
    );
  }

  // The faults of this database (lib/faults.js): operations made to fail, wait or hang, for tests of resilience.
  get faults() {
    if (!this.faultsOf) {
      const { databaseFaults, install } = faultsModule;
      this.faultsOf = databaseFaults();
      install(this.faultsOf, this.backend);
    }
    return this.faultsOf;
  }

  async connect() {
    await this.backend.connect();
    return this;
  }

  async close() {
    this.stopExpiry();
    await this.backend.close();
  }

  // A check of xufa.health of @xufa/http: up with the milliseconds of a ping (degraded when they are more than
  // slow), down when the database does not answer. Critical by default. checks: { database: db.health() }.
  health({ slow, critical = true, timeout } = {}) {
    const limit = healthMs(slow, 'slow');
    const check = async () => {
      const latency = Math.round((await this.ping()) * 100) / 100;
      return { status: limit !== undefined && latency > limit ? 'degraded' : 'up', latency };
    };
    return { check, critical, ...(timeout !== undefined ? { timeout } : {}) };
  }

  // A round trip to the database (SELECT 1, MongoDB's ping; nothing for memory and files): the milliseconds it took.
  // It throws when the database does not answer: health checks call it.
  async ping() {
    const started = process.hrtime.bigint();
    await this.backend.ping();
    return Number(process.hrtime.bigint() - started) / 1e6;
  }

  // Deletes the objects of the models of TTL indexes (indexes with expireAfter) that expired: those whose date is
  // older than expireAfter seconds (`now`: a Date, now by default). They are deleted as QuerySets delete (their
  // relations as onDelete says). Returns the number of objects deleted, by model.
  async expire({ now = new Date() } = {}) {
    const deleted = {};
    for (const model of this.models.values()) {
      for (const { field, after } of model.meta.expiry) {
        const cutoff = new Date(now.getTime() - after * 1000);
        const count = await model.objects
          .using(this)
          .filter({ [`${field.name}__lt`]: cutoff })
          .delete();
        deleted[model.name] = (deleted[model.name] || 0) + count;
      }
    }
    // The entries of the audit log older than its option retain.
    if (this.audit && this.audit.retain !== null) {
      const count = await this.audit.expire(now);
      if (count) deleted.AuditEntry = (deleted.AuditEntry || 0) + count;
    }
    return deleted;
  }

  // MongoDB: converts the values of decimal fields written as strings (before decimals were Decimal128) to Decimal128,
  // in the server. The number of values converted, by model; values that are not numbers are left as they are. Other
  // backends keep decimals as they always did: nothing to convert.
  async migrateDecimals() {
    const converted = {};
    if (typeof this.backend.convertDecimals !== 'function') return converted;
    for (const model of this.models.values()) {
      const fields = model.meta.fields.filter((field) => field.dbType === 'decimal');
      if (fields.length) converted[model.name] = await this.backend.convertDecimals(model.meta, fields);
    }
    return converted;
  }

  // Calls expire() every `interval` (seconds or text: '1m' by default) until stopExpiry() or close(). A run does not
  // start while the previous one has not ended; errors go to onError (a warning of the process by default). In a
  // cluster every process can do it (deleting what expired is the same in all of them), or one.
  startExpiry({ interval = '1m', onError } = {}) {
    this.stopExpiry();
    const ms = Math.max(1, seconds(interval, 'interval') * 1000);
    const report =
      onError || ((err) => process.emitWarning(`Expiring the objects of ${this.name} failed: ${err.message}`));
    let running = false;
    this.expiryTimer = setInterval(() => {
      if (running) return;
      running = true;
      this.expire()
        .catch(report)
        .finally(() => {
          running = false;
        });
    }, ms);
    this.expiryTimer.unref();
    return this;
  }

  stopExpiry() {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
  }

  // Creates the tables (or collections) and indexes of the models that do not exist.
  async sync() {
    await this.backend.createSchema(this.sortedMetas());
  }

  // Drops the tables (or collections) of the models.
  async drop() {
    await this.backend.dropSchema(this.sortedMetas().reverse());
  }

  // The models, each after those it points to (when they do not point to each other).
  sortedMetas() {
    const sorted = [];
    const visiting = new Set();
    const visit = (model) => {
      if (sorted.includes(model.meta) || visiting.has(model)) return;
      visiting.add(model);
      model.meta.relations.forEach((field) => {
        if (this.models.get(field.target.name) === field.target) visit(field.target);
      });
      visiting.delete(model);
      sorted.push(model.meta);
    };
    this.models.forEach(visit);
    return sorted;
  }

  // Migrations (lib/migrations.js): makeMigrations({ dir, name }) writes the migration from the files of `dir` to the
  // models (null when there is nothing to migrate); migrate({ dir, to }) applies those not applied yet;
  // showMigrations({ dir }) gives each with whether it is applied.
  makeMigrations(options) {
    return migrations.makeMigrations(this, options);
  }

  migrate(options) {
    return migrations.migrate(this, options);
  }

  showMigrations(options) {
    return migrations.showMigrations(this, options);
  }

  // Runs a function in a transaction: committed when it ends, rolled back when it throws. The queries made while it
  // runs (in its async context) are part of it; transactions inside it are savepoints. options.mode is the mode of
  // SQLite transactions (DEFERRED, IMMEDIATE or EXCLUSIVE).
  transaction(fn, options) {
    return inTransaction(this, () => this.backend.transaction(fn, options));
  }

  // Tests: beginTest() opens a transaction that every query of the database is part of (from wherever it comes: the
  // test, the requests it makes...) and rollbackTest() rolls it back, as Django's TestCase; transactions inside are
  // savepoints. Backends without transactions (MongoDB alone, mail, storage) cannot: flush() empties their models.
  get canRollbackTests() {
    const { backend } = this;
    return (
      typeof backend.begin === 'function' &&
      backend.begin !== Backend.prototype.begin &&
      !(backend.name === 'mongodb' && backend.supportsTransactions === false)
    );
  }

  async beginTest() {
    await this.backend.pin();
  }

  async rollbackTest() {
    const pinned = this.backend.pinned;
    await this.backend.unpin();
    // What was cached while it was open is not there any more.
    if (pinned) await this.forgetCaches();
  }

  // Deletes every object of the models of the database (those that point to others first), and its caches.
  async flush() {
    const byMeta = new Map([...this.models.values()].map((model) => [model.meta, model]));
    for (const meta of flushOrder([...byMeta.keys()])) {
      if (meta.managed === false || meta.proxy) continue;
      const model = byMeta.get(meta);
      // Every row: those deleted softly too, without cascades nor hooks (each model is emptied in its turn).
      let qs = model.objects.using(this);
      if (meta.softDelete) qs = qs.withDeleted();
      await this.backend.delete({ ...qs.toQuery(), orderBy: [] });
    }
    await this.forgetCaches();
  }

  forgetCaches() {
    return this.changedOutside([...this.models.values()].map((model) => model.meta.key));
  }
}

export { Database };
