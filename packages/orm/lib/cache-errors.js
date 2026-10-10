// Errors of caches that are not errors of what reads them: a cache that fails to read (get) or to keep (set) is a miss,
// and what asked reads the database. They go to the onCacheError of the database (or of cached()), or to a warning of
// the process (once for each database: a cache down fails every read).
const warned = new WeakSet();

function reportCacheError(owner, err, operation) {
  const handler = owner && owner.onCacheError;
  if (typeof handler === 'function') {
    try {
      handler(err, { operation });
    } catch {
      // A handler that throws stops nothing.
    }
    return;
  }
  if (owner && typeof owner === 'object') {
    if (warned.has(owner)) return;
    warned.add(owner);
  }
  process.emitWarning(`A cache failed to ${operation}; the database answers (${err && err.message})`, {
    code: 'XUFA_ORM_CACHE',
  });
}

export { reportCacheError };
