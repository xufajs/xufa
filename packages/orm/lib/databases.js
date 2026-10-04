// Databases: several databases by name, and the models routed to them. A model goes to the database of its option
// `database`, or of its route (`routes: { Event: 'events' }`), or to the default one. Relations between models of
// different databases are followed with more queries (prefetchRelated, load(), reverse accessors, deletes); a query
// cannot join them.
//
//   const dbs = new Databases({ default: { backend: 'postgres', url }, events: { backend: 'mongodb', url } });
//   dbs.register(Author, Book, Event);
//   await dbs.connect();
//   await dbs.migrate({ dir: 'migrations' }); // migrations/default, migrations/events
const path = require('node:path');
const { Database } = require('./database');
const { ModelError } = require('./errors');

class Databases {
  // `config`: options of Database by name (or Databases). `routes`: names of databases by model name ('*': all).
  constructor(config = {}, { routes = {}, defaultName = 'default' } = {}) {
    this.databases = new Map();
    this.routes = routes;
    this.defaultName = defaultName;
    Object.entries(config).forEach(([name, options]) => {
      this.databases.set(name, options instanceof Database ? options : new Database({ name, ...options }));
    });
  }

  get(name = this.defaultName) {
    const database = this.databases.get(name);
    if (!database) throw new ModelError(name, 'there is no database with this name');
    return database;
  }

  // The name of the database of a model.
  route(model) {
    const { options } = model.meta;
    return options.database || this.routes[model.name] || this.routes['*'] || this.defaultName;
  }

  register(...models) {
    const groups = new Map();
    models.forEach((model) => {
      const name = this.route(model);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(model);
    });
    groups.forEach((group, name) => this.get(name).register(...group));
    return this;
  }

  each(fn) {
    return Promise.all([...this.databases.entries()].map(([name, database]) => fn(database, name)));
  }

  async connect() {
    await this.each((database) => database.connect());
    return this;
  }

  async close() {
    await this.each((database) => database.close());
  }

  async sync() {
    await this.each((database) => database.sync());
  }

  // Migrations of each database in a folder of its name in `dir`.
  async makeMigrations({ dir, name } = {}) {
    const made = {};
    await this.each(async (database, key) => {
      made[key] = await database.makeMigrations({ dir: path.join(dir, key), name });
    });
    return made;
  }

  async migrate({ dir } = {}) {
    const applied = {};
    await this.each(async (database, key) => {
      applied[key] = await database.migrate({ dir: path.join(dir, key) });
    });
    return applied;
  }

  transaction(name, fn) {
    return this.get(name).transaction(fn);
  }
}

module.exports = { Databases };
