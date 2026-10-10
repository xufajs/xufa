// Logins locked after too many failures: `maxAttempts` failures of a key (an account, an IP) within `window` lock it
// for `lockFor`. A success clears the failures.
//
//   const lockout = new Lockout({ maxAttempts: 5, window: '15m', lockFor: '15m' });
//   await lockout.check(email);                 // throws Locked (429, retryAfter) while it is locked
//   ok ? await lockout.succeed(email) : await lockout.fail(email);
//
// The failures are kept in a store with get, set(key, value, ttl in ms) and delete: a MemoryCache of its own by
// default (one process), or a cache of @xufa/orm given as `store` (SharedCache counts the failures of every worker
// of a cluster in its primary). Counting is not atomic across processes: concurrent failures may count once.
import { seconds } from './duration.js';
import { Locked } from './errors.js';
import { normalizeIdentifier } from './identifier.js';

// A store in the process: values that expire after their ttl.
class MemoryStore {
  constructor() {
    this.entries = new Map();
  }

  async get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  async set(key, value, ttl) {
    this.entries.set(key, { value: structuredClone(value), expires: ttl ? Date.now() + ttl : 0 });
  }

  async delete(key) {
    this.entries.delete(key);
  }
}

class Lockout {
  constructor({
    store = new MemoryStore(),
    maxAttempts = 5,
    window = '15m',
    lockFor = '15m',
    prefix = 'xufa:lockout:',
  } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError('maxAttempts must be a positive integer');
    }
    this.store = store;
    this.maxAttempts = maxAttempts;
    this.window = seconds(window, 'window') * 1000;
    this.lockFor = seconds(lockFor, 'lockFor') * 1000;
    this.prefix = prefix;
  }

  keyOf(key) {
    // "ＡＤＭＩＮ" and "admin" are one key (see identifier.js): one count of failures.
    return `${this.prefix}${normalizeIdentifier(key)}`;
  }

  // The state of a key: { locked, retryAfter (seconds), failures }.
  async status(key) {
    const entry = await this.store.get(this.keyOf(key));
    const time = Date.now();
    if (!entry) return { locked: false, retryAfter: 0, failures: 0 };
    if (entry.lockedUntil && entry.lockedUntil > time) {
      return {
        locked: true,
        retryAfter: Math.ceil((entry.lockedUntil - time) / 1000),
        failures: entry.failures.length,
      };
    }
    const failures = entry.failures.filter((at) => at > time - this.window);
    return { locked: false, retryAfter: 0, failures: failures.length };
  }

  // Throws Locked (status 429, with retryAfter in seconds) while the key is locked.
  async check(key) {
    const state = await this.status(key);
    if (state.locked) {
      const err = new Locked('Too many failed attempts: try again later');
      err.retryAfter = state.retryAfter;
      throw err;
    }
    return state;
  }

  // A failure: the key is locked when it reaches maxAttempts within the window. Returns the state after it.
  async fail(key) {
    const storeKey = this.keyOf(key);
    const time = Date.now();
    const entry = (await this.store.get(storeKey)) || { failures: [] };
    if (entry.lockedUntil && entry.lockedUntil > time) return this.status(key);
    const failures = entry.failures.filter((at) => at > time - this.window);
    failures.push(time);
    const next = { failures };
    if (failures.length >= this.maxAttempts) {
      next.lockedUntil = time + this.lockFor;
      next.failures = [];
    }
    await this.store.set(storeKey, next, Math.max(this.window, this.lockFor));
    return this.status(key);
  }

  // A success: the failures of the key are forgotten.
  async succeed(key) {
    await this.store.delete(this.keyOf(key));
  }

  // Unlocks a key (an administrator's action).
  async reset(key) {
    await this.store.delete(this.keyOf(key));
  }
}

export { Lockout, MemoryStore };
