// The copy of the cache of one node: values by key, serialized (v8, the structured clone of Node: Dates, Buffers,
// BigInts, Maps and Sets come back as they were), each with the version of its write and when it expires. A write is
// applied only when it is newer than what the key has: its value, the tombstone of a delete, or a clear of a prefix
// of it. Tombstones and clears are kept `tombstoneTtl` ms, so that a write older than them that arrives late (from
// another node) does not bring back what was deleted.
import v8 from 'node:v8';
import { compare } from './clock.js';

class Store {
  // `decode(bytes)`: the value of what was written (v8.deserialize by default).
  constructor({ max = 10000, tombstoneTtl = 60000, decode = v8.deserialize } = {}) {
    this.decode = decode;
    this.max = max;
    this.tombstoneTtl = tombstoneTtl;
    this.entries = new Map(); // key => { bytes, expires, version }, the least used first
    this.tombstones = new Map(); // key => { version, until }
    this.clears = []; // { prefix, version, until }
  }

  get size() {
    return this.entries.size;
  }

  // The value of a key (a copy), or undefined.
  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return this.decode(entry.bytes);
  }

  // Whether a write of `version` to `key` is newer than its tombstone and the clears of its prefixes.
  #fresh(key, version) {
    const tombstone = this.tombstones.get(key);
    if (tombstone && compare(tombstone.version, version) >= 0) return false;
    for (const clear of this.clears) {
      if (key.startsWith(clear.prefix) && compare(clear.version, version) >= 0) return false;
    }
    return true;
  }

  // Applies a set; false when what the key has is newer (or it has expired already).
  set(key, bytes, expires, version) {
    if (expires && expires <= Date.now()) return false;
    const current = this.entries.get(key);
    if (current && compare(current.version, version) >= 0) return false;
    if (!this.#fresh(key, version)) return false;
    this.entries.delete(key);
    this.entries.set(key, { bytes, expires, version });
    this.tombstones.delete(key);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value);
    return true;
  }

  delete(key, version) {
    const current = this.entries.get(key);
    if (current && compare(current.version, version) > 0) return false;
    const tombstone = this.tombstones.get(key);
    if (tombstone && compare(tombstone.version, version) >= 0) return false;
    this.entries.delete(key);
    this.tombstones.set(key, { version, until: Date.now() + this.tombstoneTtl });
    return true;
  }

  // Removes the keys of a prefix ('' for all) written before `version`.
  clear(prefix, version) {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(prefix) && compare(entry.version, version) < 0) this.entries.delete(key);
    }
    this.clears.push({ prefix, version, until: Date.now() + this.tombstoneTtl });
    return true;
  }

  // Everything, at once: what is kept when writes may have been missed (an empty cache is never wrong).
  reset() {
    this.entries.clear();
  }

  // The entries alive, oldest use first: [key, bytes, expires, version].
  *snapshot() {
    const now = Date.now();
    for (const [key, { bytes, expires, version }] of this.entries) {
      if (!expires || expires > now) yield [key, bytes, expires, version];
    }
  }

  // Forgets tombstones and clears past their time, and values expired.
  sweep() {
    const now = Date.now();
    for (const [key, { until }] of this.tombstones) if (until <= now) this.tombstones.delete(key);
    this.clears = this.clears.filter(({ until }) => until > now);
    for (const [key, { expires }] of this.entries) if (expires && expires <= now) this.entries.delete(key);
  }
}

export { Store };
