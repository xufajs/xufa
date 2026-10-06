// Caches of the objects of models. A cache is a store of values by key with get, set, delete and clear (of the keys
// of a prefix); the ORM keeps there the rows of the models whose option `cache` is set (see ModelCache).
//
//   MemoryCache   in the process: an LRU of `max` keys, whose values expire after `ttl` ms.
//   SharedCache   in the primary of a cluster (@xufa/cluster): the workers ask it (one copy, shared by all).
//   LocalCache    in each process, with invalidations sent to the others through the primary (reads do not leave
//                 the process; writes reach every copy).
//
// Values are copied in and out (structured clone): the objects of the ORM cannot change what is cached.

class MemoryCache {
  // Its faults (lib/faults.js): get, set, delete and clear made to fail, wait or hang, for tests of resilience.
  get faults() {
    if (!this.faultsOf) {
      const { cacheFaults } = require('@xufa/faults'); // eslint-disable-line global-require
      Object.defineProperty(this, 'faultsOf', { value: cacheFaults(this, 'cache'), enumerable: false });
    }
    return this.faultsOf;
  }

  constructor({ max = 10000, ttl = 0 } = {}) {
    this.max = max;
    this.ttl = ttl;
    this.entries = new Map();
  }

  get size() {
    return this.entries.size;
  }

  async get(key) {
    return this.getNow(key);
  }

  getNow(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expires && entry.expires < Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Most recently used last (the first ones are evicted).
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  async set(key, value, ttl = this.ttl) {
    this.setNow(key, value, ttl);
  }

  setNow(key, value, ttl = this.ttl) {
    this.entries.delete(key);
    this.entries.set(key, { value: structuredClone(value), expires: ttl ? Date.now() + ttl : 0 });
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value);
  }

  async delete(keys) {
    this.deleteNow(keys);
  }

  deleteNow(keys) {
    [].concat(keys).forEach((key) => this.entries.delete(key));
  }

  async clear(prefix = '') {
    this.clearNow(prefix);
  }

  clearNow(prefix = '') {
    if (!prefix) {
      this.entries.clear();
      return;
    }
    [...this.entries.keys()].forEach((key) => {
      if (key.startsWith(prefix)) this.entries.delete(key);
    });
  }
}

const SHARED = 'xufa:cache';
const INVALIDATE = 'xufa:cache:invalidate';

// The cache of a cluster in its primary: every process (the primary too) creates a SharedCache with the bus; in the
// primary it holds the data and answers the workers. `store` (in the primary): where it holds them, a MemoryCache by
// default, or any cache (get, set, delete, clear), such as the NetCache of @xufa/netcache, shared with other machines.
// The events served in each process (by bus): in one process (workers: 0), the primary and the worker both make a
// SharedCache, and the second one asks the first.
const serving = new WeakMap();

class SharedCache {
  // Its faults (lib/faults.js): get, set, delete and clear made to fail, wait or hang, for tests of resilience.
  get faults() {
    if (!this.faultsOf) {
      const { cacheFaults } = require('@xufa/faults'); // eslint-disable-line global-require
      Object.defineProperty(this, 'faultsOf', { value: cacheFaults(this, 'cache'), enumerable: false });
    }
    return this.faultsOf;
  }

  constructor({ bus, max, ttl, name = 'default', store } = {}) {
    if (!bus) throw new TypeError('SharedCache needs the bus of @xufa/cluster');
    this.bus = bus;
    this.event = `${SHARED}:${name}`;
    if (!serving.has(bus)) serving.set(bus, new Set());
    if (bus.isPrimary && !serving.get(bus).has(this.event)) {
      serving.get(bus).add(this.event);
      this.store = store || new MemoryCache({ max, ttl });
      bus.on(this.event, ({ op, key, value, ttl: time }) => {
        switch (op) {
          case 'get':
            return this.store.get(key);
          case 'set':
            return this.store.set(key, value, time);
          case 'delete':
            return this.store.delete(key);
          default:
            return this.store.clear(key);
        }
      });
    }
  }

  get(key) {
    return this.bus.request(this.event, { op: 'get', key });
  }

  async set(key, value, ttl) {
    await this.bus.request(this.event, { op: 'set', key, value, ttl });
  }

  async delete(keys) {
    await this.bus.request(this.event, { op: 'delete', key: keys });
  }

  async clear(prefix = '') {
    await this.bus.request(this.event, { op: 'clear', key: prefix });
  }
}

// A cache in each process whose deletes and clears reach the caches of the other processes (broadcast through the
// primary). Each process keeps its own copy: reads are as fast as in MemoryCache.
class LocalCache extends MemoryCache {
  constructor({ bus, max, ttl, name = 'default' } = {}) {
    super({ max, ttl });
    if (!bus) throw new TypeError('LocalCache needs the bus of @xufa/cluster');
    this.bus = bus;
    this.event = `${INVALIDATE}:${name}`;
    bus.on(this.event, ({ keys, prefix }) => {
      if (keys) super.deleteNow(keys);
      else super.clearNow(prefix);
    });
  }

  async delete(keys) {
    super.deleteNow(keys);
    this.bus.broadcast(this.event, { keys: [].concat(keys) }, { others: true });
  }

  async clear(prefix = '') {
    super.clearNow(prefix);
    this.bus.broadcast(this.event, { prefix }, { others: true });
  }
}

module.exports = { MemoryCache, SharedCache, LocalCache };
