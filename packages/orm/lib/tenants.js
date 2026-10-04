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
const { Database } = require('./database');
const { ModelError } = require('./errors');
const { current, currentDatabase } = require('./context');

class Tenants {
  constructor({ models = [], config, setup, max = 100 } = {}) {
    if (typeof config !== 'function') throw new TypeError('Tenants needs config(tenantId)');
    this.models = models;
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
      const db = new Database({ name: `tenant:${id}`, ...options }).register(...this.models);
      await db.connect();
      if (this.setup) await this.setup(db, id);
      return db;
    })();
    this.databases.set(id, opening);
    opening.catch(() => this.databases.delete(id));
    this.evict();
    return opening;
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
