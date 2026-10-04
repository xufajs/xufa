// Database: a connection to a database through a backend, and the models registered in it.
//
//   const db = new Database({ backend: 'sqlite', filename: 'app.db' });
//   db.register(Author, Book);
//   await db.connect();
//   await db.sync(); // creates the tables (or collections and indexes) that do not exist
const { Model, defineReverseAccessor, defineManyToManyAccessor } = require('./model');
const fields = require('./fields');
const { lowerFirst, snakeCase } = require('./meta');
const { BackendError, ModelError } = require('./errors');
const { seconds } = require('./duration');
const migrations = require('./migrations');

const backends = new Map();
let nextName = 0;

class Database {
  // `backend` is the name of a backend ('memory', 'sqlite'...), a class of backend or an instance of one. The rest of
  // the options are given to the backend.
  constructor(options = {}) {
    const { backend = 'memory', name, cache, ...rest } = options;
    this.options = rest;
    // The name of the database (in the keys of its cache), and the cache of its models (lib/cache.js).
    this.name = name || `db${(nextName += 1)}`;
    this.cache = cache || null;
    if (typeof backend === 'string') {
      const factory = backends.get(backend);
      if (!factory) throw new BackendError(`Unknown backend ${backend} (${[...backends.keys()].join(', ')})`);
      this.backend = new (factory())(rest);
    } else if (typeof backend === 'function') this.backend = new backend(rest);
    else this.backend = backend;
    this.models = new Map();
    this.expiryTimer = null;
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

  async connect() {
    await this.backend.connect();
    return this;
  }

  async close() {
    this.stopExpiry();
    await this.backend.close();
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
    return deleted;
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
    return this.backend.transaction(fn, options);
  }
}

module.exports = { Database };
