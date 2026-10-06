// Faults: what goes wrong in a database, made to happen, to see what an app does then (tests of resilience, chaos in
// staging). db.faults (and dbs.faults of Databases, tenants.faults of Tenants) makes operations of the database fail,
// wait or hang, as a database that is down, slow or lost would:
//
//   db.faults.fail({ operations: 'write', models: [Order], rate: 0.2 });   // 1 write of Order in 5 fails
//   db.faults.delay({ operations: 'read', ms: 300, jitter: 200 });          // reads take 300 to 500 ms more
//   const hung = db.faults.hang({ models: ['Payment'] });                   // until hung.release()
//   db.faults.down(); ... db.faults.up();                                   // every operation fails, then none
//   db.faults.clear();
//
// A rule matches operations (select, count, aggregate, insert, update, delete, transaction, connect; 'read' and
// 'write' for the first six; all of them but connect by default), models (classes or names), tenants (of Tenants),
// a rate, after and times (the rules of @xufa/faults). The errors of fail are FaultErrors (code XUFA_ORM_ERR_FAULT,
// status 503), or `error`.
//
// The caches of models (MemoryCache, SharedCache, LocalCache) have faults too (cache.faults: get, set, delete, clear;
// keys by prefix or regular expression): a cache that fails to read or write is a miss (the database answers), and one
// that fails to delete is an error (what it keeps would be old).
//
// Without rules, the operations are as they were (the check of an empty list). Objects of the cache of models (get()
// of a cached model) do not reach the database: no fault of the database happens to them.
const { Faults } = require('@xufa/faults');
const { BackendError } = require('./errors');

const READS = ['select', 'count', 'aggregate'];
const WRITES = ['insert', 'update', 'delete'];
const OPERATIONS = [...READS, ...WRITES, 'transaction', 'connect'];

class FaultError extends BackendError {
  constructor(message, { operation, model, tenant } = {}) {
    super(message);
    this.code = 'XUFA_ORM_ERR_FAULT';
    this.statusCode = 503;
    this.operation = operation;
    this.model = model === undefined ? null : model;
    this.tenant = tenant === undefined ? null : tenant;
  }
}

// The faults of a database: its operations, by model and tenant.
function databaseFaults() {
  return new Faults({
    name: 'database',
    operations: OPERATIONS,
    groups: { read: READS, write: WRITES },
    defaults: [...READS, ...WRITES, 'transaction'],
    filters: { models: 'model', tenants: 'tenant' },
    downMessage: 'The database is down (a fault injected)',
    error(rule, context) {
      const { operation, model, tenant } = context;
      const what = `${operation}${model ? ` of ${model}` : ''}${tenant ? ` in the tenant ${tenant}` : ''}`;
      return new FaultError(rule.message || `A fault of the database (injected): ${what}`, context);
    },
  });
}

// Wraps the operations of a backend (once): the faults of these rules happen to them. `tenant`: the tenant of the
// database (of Tenants).
function install(faults, backend, tenant = null) {
  const installed = backend.faultLayers || (backend.faultLayers = new Set());
  if (installed.has(faults)) return;
  installed.add(faults);
  for (const operation of OPERATIONS) {
    const original = backend[operation];
    if (typeof original !== 'function') continue;
    backend[operation] = function withFaults(target, ...args) {
      if (faults.rules.length === 0) return original.call(this, target, ...args);
      const meta = target && target.meta ? target.meta : target;
      const model = operation === 'transaction' || operation === 'connect' || !meta || !meta.name ? null : meta.name;
      return faults.apply({ operation, model, tenant }, () => original.call(this, target, ...args));
    };
  }
}

// instanceof FaultError of the ORM: of the database, and of every fault injected (caches too).
const { isFault } = require('@xufa/faults');

Object.defineProperty(FaultError, Symbol.hasInstance, { value: isFault });

module.exports = { databaseFaults, install, FaultError, OPERATIONS };
