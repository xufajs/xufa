// The database of the code running when it is one of a tenant (lib/tenants.js): { db } in an AsyncLocalStorage, read by
// Model.db.
import { AsyncLocalStorage } from 'node:async_hooks';

const current = new AsyncLocalStorage();

function currentDatabase() {
  const store = current.getStore();
  return store ? store.db : null;
}

// The signal of the code running: the request of the plugin with `cancel` (read when a query starts, so requests
// without queries make none), or the one of withSignal(). Reads that start after it is aborted throw its reason, and
// PostgreSQL cancels the read that runs. Writes are not stopped: one the client did not wait for may still be wanted.
const cancellation = new AsyncLocalStorage();

function currentSignal() {
  const store = cancellation.getStore();
  if (!store) return null;
  return store.request ? store.request.signal : store.signal || null;
}

/** Runs fn with the reads of its queries stopped when `signal` is aborted. */
function withSignal(signal, fn) {
  return cancellation.run({ signal }, fn);
}

// The models of Tenants: their queries run in a tenant, never in another database (outside one, an error).
const tenantModels = new WeakSet();

export { current, currentDatabase, cancellation, currentSignal, withSignal, tenantModels };
