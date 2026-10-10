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
import { Database } from './database.js';
import { Databases } from './databases.js';
import { ModelError } from './errors.js';
import { current, currentDatabase, tenantModels } from './context.js';
import * as faultsModule from './faults.js';

class Tenants {
  // `routes`: the databases of the models in tenants with several (as those of Databases), for every tenant.
  constructor({ models = [], config, setup, max = 100, routes = {} } = {}) {
    if (typeof config !== 'function') throw new TypeError('Tenants needs config(tenantId)');
    this.models = models;
    // (Out of a tenant, they are no database's: lib/model.js says so.)
    for (const model of models) tenantModels.add(model);
    this.routes = routes;
    this.config = config;
    this.setup = setup;
    this.max = max;
    // Databases (and those being opened) by tenant, the least used first.
    this.databases = new Map();
    // Functions called with each database opened (and set up), before it is given (rollbackEach of the tests).
    this.listeners = new Set();
  }

  // Calls fn(db, tenantId) with each database opened from now on, once it is set up; gives the function that stops it.
  onOpen(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // The databases open now (those that failed to open left out).
  async opened() {
    const settled = await Promise.allSettled(this.databases.values());
    return settled.filter((one) => one.status === 'fulfilled').map((one) => one.value);
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
      for (const fn of this.listeners) await fn(db, id);
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
      const { databaseFaults } = faultsModule;
      this.faultsOf = databaseFaults();
      for (const [id, opening] of this.databases) {
        opening.then((db) => this.installFaults(db, id)).catch(() => {});
      }
    }
    return this.faultsOf;
  }

  installFaults(db, id) {
    const databases = db instanceof Databases ? [...db.databases.values()] : [db];
    const { install } = faultsModule;
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

  // Runs fn in a tenant: the queries of the models use its database. What it gives is awaited in the tenant: a
  // QuerySet given back (run(id, () => Book.objects.all())) runs when awaited, which would be out of it.
  async run(tenantId, fn) {
    const db = await this.database(tenantId);
    return current.run({ db }, async () => await fn()); // eslint-disable-line no-return-await
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

export { Tenants, currentDatabase, current };
