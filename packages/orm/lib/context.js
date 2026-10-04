// The database of the code running when it is one of a tenant (lib/tenants.js): { db } in an AsyncLocalStorage, read by
// Model.db.
const { AsyncLocalStorage } = require('node:async_hooks');

const current = new AsyncLocalStorage();

function currentDatabase() {
  const store = current.getStore();
  return store ? store.db : null;
}

module.exports = { current, currentDatabase };
