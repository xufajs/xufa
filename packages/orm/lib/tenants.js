// Tenants: a database for each tenant, made the first time it is used (from config(tenantId): the options of a
// Database), with the models registered in it. Code run in a tenant (run(), or a request of the plugin) uses its
// database: Book.objects is the books of the tenant. The databases of the last `max` tenants used are kept open.
//
//   const tenants = new Tenants({
//     models: [Author, Book],
//     config: async (id) => ({ backend: 'postgres', url: `postgres://.../tenant_${id}` }),
//     setup: (db) => db.migrate({ dir: 'migrations' }),
//   });
//   await tenants.run('acme', () => Book.objects.count());
//
// A tenant can have several databases, its models routed to them as in Databases: config gives { databases: { name:
// options }, routes: { Model: name } } (over the routes of the Tenants), and each model goes to the database of its
// option `database`, of its route, or to the default one (default):
//
//   config: (id) => ({
//     databases: { default: { backend: 'postgres', url }, events: { backend: 'mongodb', url: mongoUrl } },
//     routes: { Event: 'events' },
//   }),
const { Database } = require('./database');
const { Databases } = require('./databases');
const { ModelError } = require('./errors');
const { current, currentDatabase } = require('./context');

class Tenants {
  // `routes`: the databases of the models in tenants with several (as those of Databases), for every tenant.
  constructor({ models = [], config, setup, max = 100, routes = {} } = {}) {
    if (typeof config !== 'function') throw new TypeError('Tenants needs config(tenantId)');
    this.models = models;
    this.routes = routes;
    this.config = config;
    this.setup = setup;
    this.max = max;
    // Databases (and those being opened) by tenant, the least used first.
    this.databases = new Map();
  }

  // The database of a tenant, opened (and set up) the first time.
  database(tenantId) {
    if (tenantId === undefined || tenantId === null || tenantId === '') {
      return Promise.reject(new ModelError('Tenants', 'a tenant id is needed'));
    }
    const id = String(tenantId);
    let opening = this.databases.get(id);
    if (opening) {
      this.databases.delete(id);
      this.databases.set(id, opening);
      return opening;
    }
    opening = (async () => {
      const options = await this.config(id);
      if (!options) throw new ModelError('Tenants', `there is no tenant ${id}`);
      const db = this.open(id, options).register(...this.models);
      // The faults of the tenants, before it connects (so a tenant can be down).
      if (this.faultsOf) this.installFaults(db, id);
      await db.connect();
      if (this.setup) await this.setup(db, id);
      return db;
    })();
    this.databases.set(id, opening);
    opening.catch(() => this.databases.delete(id));
    this.evict();
    return opening;
  }

  // The database of a tenant from its options: a Database (or Databases) given, the databases of `databases` with the
  // models routed to them, or the options of one Database.
  open(id, options) {
    if (options instanceof Database || options instanceof Databases) return options;
    if (options.databases) {
      const config = {};
      Object.entries(options.databases).forEach(([name, settings]) => {
        config[name] = settings instanceof Database ? settings : { ...settings, name: `tenant:${id}:${name}` };
      });
      return new Databases(config, {
        routes: { ...this.routes, ...options.routes },
        defaultName: options.defaultName || 'default',
      });
    }
    return new Database({ name: `tenant:${id}`, ...options });
  }

  // The faults of the databases of every tenant (lib/faults.js): those open and those opened after; rules can name
  // tenants ({ tenants: ['acme'] }).
  get faults() {
    if (!this.faultsOf) {
      const { databaseFaults } = require('./faults'); // eslint-disable-line global-require
      this.faultsOf = databaseFaults();
      for (const [id, opening] of this.databases) {
        opening.then((db) => this.installFaults(db, id)).catch(() => {});
      }
    }
    return this.faultsOf;
  }

  installFaults(db, id) {
    const databases = db instanceof Databases ? [...db.databases.values()] : [db];
    const { install } = require('./faults'); // eslint-disable-line global-require
    for (const one of databases) install(this.faultsOf, one.backend, id);
  }

  // Closes the databases of the tenants used least, beyond `max`.
  evict() {
    while (this.databases.size > this.max) {
      const [id, opening] = this.databases.entries().next().value;
      this.databases.delete(id);
      opening.then((db) => db.close()).catch(() => {});
    }
  }

  // Runs fn in a tenant: the queries of the models use its database.
  async run(tenantId, fn) {
    const db = await this.database(tenantId);
    return current.run({ db }, fn);
  }

  // Enters a tenant for the rest of the async context (a request): it is set at once, and its database when it is
  // open (the promise given).
  enter(tenantId) {
    const store = { db: null };
    current.enterWith(store);
    return this.database(tenantId).then((db) => {
      store.db = db;
      return db;
    });
  }

  async close() {
    const openings = [...this.databases.values()];
    this.databases.clear();
    await Promise.all(openings.map((opening) => opening.then((db) => db.close()).catch(() => {})));
  }
}

module.exports = { Tenants, currentDatabase, current };
