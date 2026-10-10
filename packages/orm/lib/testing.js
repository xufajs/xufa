// The databases of tests, as Django's TestCase: each test runs in a transaction rolled back at its end, so it starts
// with the data before it (what the setup made once, in a before()) and leaves nothing. Every query is part of it,
// from the test or from the requests it makes to the app (app.inject()); transactions inside are savepoints. A
// database that cannot roll back (MongoDB without a replica set, mail, storage) is emptied after each test instead.
//
//   import { test, beforeEach, afterEach } from 'node:test';
//   rollbackEach(db, { beforeEach, afterEach });     // or rollbackEach(db) with the globals of vyntra, jest, mocha
//
// mode: 'auto' (roll back when the database can, else empty it), 'rollback' or 'flush'.
//
// The databases of Tenants are those of the tests too: those open when a test starts, and those it opens.
//
//   rollbackEach([db, tenants]);

// The databases of a target: a Database, a Databases, a list of them, or a function that gives them (made later, in a
// before()).
// A Tenants gives none here: its databases are taken when a test starts (tenantsOf).
function databasesOf(target) {
  if (typeof target === 'function') return databasesOf(target());
  if (Array.isArray(target)) return target.filter((item) => item != null).flatMap(databasesOf);
  if (isTenants(target)) return [];
  if (target && target.databases instanceof Map) return [...target.databases.values()];
  if (target && typeof target.beginTest === 'function') return [target];
  throw new TypeError('rollbackEach(db): a Database, a Databases, a Tenants, or a list of them (nulls left out)');
}

const isTenants = (target) => Boolean(target) && typeof target.onOpen === 'function';

function tenantsOf(target) {
  if (typeof target === 'function') return tenantsOf(target());
  if (Array.isArray(target)) return target.filter((item) => item != null).flatMap(tenantsOf);
  return isTenants(target) ? [target] : [];
}

// The databases of a database of a tenant (a Databases gives its own).
const partsOf = (db) => (db.databases instanceof Map ? [...db.databases.values()] : [db]);

function rollbackEach(target, { beforeEach, afterEach, mode = 'auto' } = {}) {
  const before = beforeEach || globalThis.beforeEach;
  const after = afterEach || globalThis.afterEach;
  if (typeof before !== 'function' || typeof after !== 'function') {
    throw new TypeError(
      'rollbackEach(db, { beforeEach, afterEach }): the hooks of the tests (those of node:test, or globals)'
    );
  }
  if (!['auto', 'rollback', 'flush'].includes(mode))
    throw new TypeError(`rollbackEach(): mode is auto, rollback or flush (${mode})`);
  if (typeof target !== 'function') databasesOf(target);
  // Those of each test (a function gives them when the test runs).
  let dbs = [];
  // While a test runs: the databases of tenants opened then join it.
  let running = false;
  const watched = new WeakSet();
  const rollsBack = (db) => mode === 'rollback' || (mode === 'auto' && db.canRollbackTests);
  const join = async (db) => {
    for (const one of partsOf(db)) {
      dbs.push(one);
      if (rollsBack(one)) await one.beginTest();
    }
  };
  before(async () => {
    dbs = [];
    const tenants = tenantsOf(target);
    for (const registry of tenants) {
      if (watched.has(registry)) continue;
      watched.add(registry);
      registry.onOpen((db) => (running ? join(db) : undefined));
    }
    const open = (await Promise.all(tenants.map((registry) => registry.opened()))).flat();
    for (const db of [...databasesOf(target), ...open]) await join(db);
    running = true;
  });
  after(async () => {
    running = false;
    // The last ones first (as they were opened in order).
    for (const db of [...dbs].reverse()) {
      if (rollsBack(db)) await db.rollbackTest();
      else await db.flush();
    }
    dbs = [];
  });
}

export { rollbackEach };
