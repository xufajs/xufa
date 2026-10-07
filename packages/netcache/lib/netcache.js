// A cache shared by the machines of a service: each node keeps a copy (reads do not leave the machine), and every
// set, delete and clear is sent to the other nodes over TCP, which @xufa/discovery finds. Writes carry versions of a
// hybrid clock, so the copies end the same whatever the order writes arrive in; deletes and clears keep theirs for a
// while (lib/store.js), so a late write does not bring back what was deleted.
//
// Nothing is lost quietly: each node keeps a log of what it sent to each peer (the last `queue` writes); a peer that
// connects again says which was the last it applied, and the rest is sent again. When that is not possible (the log
// was too short, or a node wrote before it knew of a peer that was there), the peer is told to empty its copy: an
// empty cache asks the database, a stale one would answer wrong. A node that starts gets the entries of its first
// peer (sync).
//
//   const cache = await new NetCache({ secret, service: 'shop' }).start();
//   const db = new Database({ backend: 'postgres', url, cache });   // the models of option cache, in every machine
const crypto = require('node:crypto');
const net = require('node:net');
const v8 = require('node:v8');
const { EventEmitter } = require('node:events');
const { Discovery } = require('@xufa/discovery');
const { Clock } = require('./clock');
const { Store } = require('./store');
const { Wire, baseKey } = require('./wire');

const SNAPSHOT_BATCH = 500;

class NetCacheError extends Error {
  constructor(message, code = 'XUFA_NETCACHE_ERR_OPTIONS') {
    super(message);
    this.name = 'NetCacheError';
    this.code = code;
  }
}

class NetCache extends EventEmitter {
  constructor(options = {}) {
    super();
    const {
      secret,
      insecure = false,
      service = 'xufa',
      max = 10000,
      ttl = 0,
      port = 0,
      host = '0.0.0.0',
      advertise,
      queue = 10000,
      sync = true,
      settle = 300,
      tombstoneTtl = 60000,
      maxFrame = 16 * 1024 * 1024,
      discovery = {},
      marshal,
    } = options;
    if (secret === undefined && !insecure) {
      throw new NetCacheError(
        'NetCache needs a secret (or insecure: true, on a network where every machine is trusted)'
      );
    }
    if (secret !== undefined && Buffer.byteLength(secret) < 16) {
      throw new NetCacheError('secret must be a string or Buffer of 16 bytes or more');
    }
    this.id = crypto.randomUUID();
    this.service = `netcache:${service}`;
    this.key = secret === undefined ? null : baseKey(secret, this.service);
    this.ttl = ttl;
    this.options = { port, host, advertise, queue, sync, settle, maxFrame };
    this.discoveryOptions = discovery;
    this.secret = secret;
    this.clock = new Clock(this.id);
    // Values as v8 writes them (the structured clone), or with `marshal` (true, or a Registry of @xufa/marshal) as
    // marshal writes them, so the instances of registered classes come back as themselves. Each value says which
    // (v8 starts with 0xff, marshal with "["): nodes of either kind read the values of the others.
    this.encode = v8.serialize;
    let readMarshal = null;
    if (marshal) {
      const { stringify, parse, registry } = require('@xufa/marshal'); // eslint-disable-line global-require
      const options = { registry: marshal === true ? registry : marshal };
      this.encode = (value) => Buffer.from(stringify(value, options));
      readMarshal = (bytes) => parse(bytes.toString(), options);
    }
    const decode = (bytes) => {
      if (bytes[0] !== 0x5b) return v8.deserialize(bytes);
      if (!readMarshal) {
        const { parse } = require('@xufa/marshal'); // eslint-disable-line global-require
        readMarshal = (written) => parse(written.toString());
      }
      return readMarshal(bytes);
    };
    this.store = new Store({ max, tombstoneTtl, decode });
    this.started = false;
    this.startedAt = 0;
    this.lastWriteAt = 0;
    this.synced = false;
    this.peers = new Map(); // id => { id, address, port, wire, log, seq, applied, lost, retry, timer }
    this.stats = { sent: 0, applied: 0, ignored: 0, resent: 0, resets: 0, snapshots: 0 };
  }

  // --- The store of a cache: get, set, delete, clear (as the caches of @xufa/orm, and the store of Lockout).

  // Its faults (@xufa/faults): get, set, delete and clear made to fail, wait or hang, for tests of resilience.
  get faults() {
    if (!this.faultsOf) {
      const { cacheFaults } = require('@xufa/faults'); // eslint-disable-line global-require
      Object.defineProperty(this, 'faultsOf', { value: cacheFaults(this, 'netcache'), enumerable: false });
    }
    return this.faultsOf;
  }

  async get(key) {
    return this.store.get(key);
  }

  async set(key, value, ttl = this.ttl) {
    const version = this.clock.now();
    const bytes = this.encode(value);
    const expires = ttl ? Date.now() + ttl : 0;
    this.store.set(key, bytes, expires, version);
    this.#broadcast({ t: 'set', k: key, b: bytes, e: expires, v: version });
  }

  async delete(keys) {
    for (const key of [].concat(keys)) {
      const version = this.clock.now();
      this.store.delete(key, version);
      this.#broadcast({ t: 'del', k: key, v: version });
    }
  }

  async clear(prefix = '') {
    const version = this.clock.now();
    this.store.clear(prefix, version);
    this.#broadcast({ t: 'clear', k: prefix, v: version });
  }

  // A message to the nodes connected now ('publish' (channel, data, peer) on them), as the pub/sub of Redis: not kept,
  // not sent again; a node that is not connected does not get it. The data is written as the values (v8, or marshal).
  publish(channel, data) {
    if (typeof channel !== 'string') throw new NetCacheError('channel must be a string');
    const message = { t: 'pub', c: channel, d: this.encode(data) };
    let sent = 0;
    for (const peer of this.peers.values()) {
      if (peer.wire && peer.wire.ready && peer.helloed && peer.wire.send(message)) sent += 1;
    }
    return sent;
  }

  get size() {
    return this.store.size;
  }

  // A check of xufa.health of @xufa/http: down when it is not started; degraded when peers it knows are not
  // connected, or fewer than minPeers are; the peers, those connected, the keys and the writes not acknowledged yet.
  // Not critical by default (a cache that misses asks the database).
  health({ minPeers = 0, critical = false, timeout } = {}) {
    const check = async () => {
      if (!this.started) return { status: 'down', error: 'The netcache is not started' };
      const connected = this.connected.length;
      let unacknowledged = 0;
      for (const peer of this.peers.values()) unacknowledged += peer.log ? peer.log.length : 0;
      const details = { peers: this.peers.size, connected, keys: this.size, unacknowledged, resets: this.stats.resets };
      const problems = [];
      if (connected < this.peers.size) problems.push(`${this.peers.size - connected} peers not connected`);
      if (connected < minPeers) problems.push(`${connected} peers connected (${minPeers} at least)`);
      return {
        status: problems.length ? 'degraded' : 'up',
        ...(problems.length ? { error: problems.join('; ') } : {}),
        ...details,
      };
    };
    return { check, critical, ...(timeout !== undefined ? { timeout } : {}) };
  }

  // The peers connected now.
  get connected() {
    return [...this.peers.values()].filter((peer) => peer.wire && peer.wire.ready).map((peer) => peer.id);
  }

  // --- Running.

  async start() {
    if (this.started) return this;
    this.server = net.createServer((socket) => this.#accept(socket));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.options.port, this.options.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.port = this.server.address().port;
    const meta = { netcache: { port: this.port, id: this.id, started: Date.now() } };
    if (this.options.advertise) meta.netcache.host = this.options.advertise;
    this.discovery =
      this.discoveryOptions instanceof Discovery
        ? this.discoveryOptions
        : new Discovery({ ...this.discoveryOptions, service: this.service, secret: this.secret, meta });
    if (this.discoveryOptions instanceof Discovery) this.discovery.setMeta({ ...this.discovery.meta, ...meta });
    this.discovery.on('up', (peer) => this.#found(peer));
    this.discovery.on('update', (peer) => this.#found(peer));
    this.discovery.on('down', (peer) => this.#lost(peer));
    this.started = true;
    this.startedAt = Date.now();
    if (!this.discovery.started) await this.discovery.start();
    this.discovery.peers.forEach((peer) => this.#found(peer));
    this.sweeper = setInterval(() => this.store.sweep(), Math.min(10000, this.store.tombstoneTtl));
    this.sweeper.unref();
    // What each peer sent and this node applied is acknowledged, so that the peer drops it from its log.
    this.acker = setInterval(() => {
      for (const peer of this.peers.values()) this.#ack(peer);
    }, 200);
    this.acker.unref();
    // The nodes there now answer the hello of the discovery at once: once they are connected, the writes of this
    // node reach them all.
    await new Promise((resolve) => setTimeout(resolve, this.options.settle));
    await this.#connectedToKnown(this.options.settle * 5);
    return this;
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    clearInterval(this.sweeper);
    clearInterval(this.acker);
    for (const peer of this.peers.values()) {
      clearTimeout(peer.timer);
      if (peer.wire) peer.wire.close();
    }
    this.peers.clear();
    if (!(this.discoveryOptions instanceof Discovery)) await this.discovery.stop();
    await new Promise((resolve) => this.server.close(() => resolve()));
  }

  // Resolves once the peers known are connected (or after `timeout`).
  async #connectedToKnown(timeout) {
    const until = Date.now() + timeout;
    while (Date.now() < until && [...this.peers.values()].some((peer) => !(peer.wire && peer.wire.ready))) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  // --- Peers.

  #peerOf(id, address, port) {
    let peer = this.peers.get(id);
    if (!peer) {
      peer = {
        id,
        address,
        port,
        wire: null,
        log: [],
        seq: 0,
        applied: 0,
        acked: 0,
        lost: false,
        retry: 100,
        timer: null,
      };
      // A node there before this one wrote: it may keep values this node changed before knowing it.
      peer.missed = this.lastWriteAt > 0;
      this.peers.set(id, peer);
    } else {
      if (address) peer.address = address;
      if (port) peer.port = port;
    }
    return peer;
  }

  #found(found) {
    const info = found.meta && found.meta.netcache;
    if (!this.started || !info || info.id === this.id) return;
    const peer = this.#peerOf(info.id, info.host || found.address, info.port);
    if (peer.missed && info.started > this.lastWriteAt) peer.missed = false; // it started after: it missed nothing
    // One connection by pair: the node of the lower id opens it.
    if (this.id < peer.id && !peer.wire && !peer.timer) this.#dial(peer);
  }

  #lost(found) {
    const info = found.meta && found.meta.netcache;
    const peer = info && this.peers.get(info.id);
    if (!peer || (peer.wire && peer.wire.ready)) return; // a connection alive is the better word
    clearTimeout(peer.timer);
    if (peer.wire) peer.wire.close();
    this.peers.delete(peer.id);
  }

  #dial(peer) {
    peer.timer = null;
    if (!this.started || !this.peers.has(peer.id)) return;
    const socket = net.connect(peer.port, peer.address);
    this.#attach(socket, true, peer);
  }

  #accept(socket) {
    if (!this.started) return socket.destroy();
    return this.#attach(socket, false, null);
  }

  #attach(socket, dialer, dialed) {
    const wire = new Wire(socket, {
      key: this.key,
      service: this.service,
      dialer,
      maxFrame: this.options.maxFrame,
      hi: { id: this.id, started: this.startedAt },
    });
    if (dialed) dialed.wire = wire;
    wire.on('ready', (hi) => {
      if (dialed && hi.id !== dialed.id) return wire.close(new Error('another node at that address'));
      const peer = dialed || this.#peerOf(hi.id, socket.remoteAddress, null);
      if (!dialed) {
        if (peer.wire && peer.wire !== wire && peer.wire.ready) return wire.close(new Error('connected already'));
        peer.wire = wire;
      }
      if (peer.missed && hi.started > this.lastWriteAt) peer.missed = false;
      peer.retry = 100;
      // What this node applied of the peer: it sends again what comes after.
      wire.send({ t: 'hello', last: peer.applied, sync: this.options.sync && !this.synced });
      this.synced = true;
      this.emit('peer', peer.id, 'connected');
      return undefined;
    });
    wire.on('message', (message) => {
      const peer = [...this.peers.values()].find((candidate) => candidate.wire === wire);
      if (peer) this.#receive(peer, message);
    });
    wire.on('close', (err) => {
      const peer = [...this.peers.values()].find((candidate) => candidate.wire === wire);
      if (!peer) return;
      peer.wire = null;
      peer.helloed = false;
      if (err) this.#error(err);
      this.emit('peer', peer.id, 'disconnected');
      // The dialer tries again while the peer is there (a backoff up to 5 s).
      if (this.started && this.id < peer.id && this.peers.has(peer.id)) {
        peer.timer = setTimeout(() => this.#dial(peer), peer.retry);
        peer.retry = Math.min(peer.retry * 2, 5000);
      }
    });
  }

  // --- Writes to the peers.

  #broadcast(op) {
    this.lastWriteAt = Date.now();
    if (!this.started) return;
    for (const peer of this.peers.values()) {
      peer.seq += 1;
      const message = { ...op, seq: peer.seq };
      peer.log.push(message);
      // A write the peer has not acknowledged drops out of a full log: the peer will be reset if it asks for it.
      if (peer.log.length > this.options.queue) {
        peer.log.shift();
        peer.lost = true;
      }
      if (peer.wire && peer.wire.ready && peer.helloed) {
        peer.wire.send(message);
        this.stats.sent += 1;
      }
    }
  }

  // After the hello of a peer: the writes after the last it applied, or a reset when some are not in the log.
  #resend(peer, last) {
    const first = peer.log.length ? peer.log[0].seq : peer.seq + 1;
    if (peer.missed || (peer.lost && first > last + 1) || last > peer.seq) {
      peer.wire.send({ t: 'reset', seq: last });
      peer.missed = false;
      peer.lost = false;
    }
    for (const message of peer.log) {
      if (message.seq > last) {
        peer.wire.send(message);
        this.stats.resent += 1;
      }
    }
    // What the peer has applied is no longer needed.
    peer.log = peer.log.filter((message) => message.seq > last);
    peer.helloed = true;
  }

  #snapshot(peer) {
    let batch = [];
    for (const entry of this.store.snapshot()) {
      batch.push(entry);
      if (batch.length === SNAPSHOT_BATCH) {
        peer.wire.send({ t: 'snap', entries: batch });
        batch = [];
      }
    }
    peer.wire.send({ t: 'snap', entries: batch, done: true });
  }

  // --- Writes of the peers.

  #receive(peer, message) {
    switch (message.t) {
      case 'hello':
        this.#resend(peer, Number(message.last) || 0);
        if (message.sync) this.#snapshot(peer);
        return;
      case 'pub':
        if (typeof message.c === 'string' && Buffer.isBuffer(message.d)) {
          this.emit('publish', message.c, this.store.decode(message.d), peer.id);
        }
        return;
      case 'ack':
        peer.log = peer.log.filter((sent) => sent.seq > message.seq);
        return;
      case 'reset':
        this.store.reset();
        peer.applied = message.seq;
        peer.acked = Math.min(peer.acked, peer.applied);
        this.stats.resets += 1;
        this.emit('reset', peer.id);
        return;
      case 'snap':
        for (const [key, bytes, expires, version] of message.entries) {
          this.clock.see(version);
          this.store.set(key, bytes, expires, version);
        }
        if (message.done) {
          this.stats.snapshots += 1;
          this.emit('synced', peer.id);
        }
        return;
      default:
        break;
    }
    if (message.seq <= peer.applied) return; // sent again, applied already
    peer.applied = message.seq;
    this.clock.see(message.v);
    let applied = false;
    if (message.t === 'set') applied = this.store.set(message.k, message.b, message.e, message.v);
    else if (message.t === 'del') applied = this.store.delete(message.k, message.v);
    else if (message.t === 'clear') applied = this.store.clear(message.k, message.v);
    if (peer.applied - peer.acked >= 100) this.#ack(peer);
    if (applied) {
      this.stats.applied += 1;
      this.emit('change', { op: message.t, key: message.k, peer: peer.id });
    } else {
      this.stats.ignored += 1;
    }
  }

  #ack(peer) {
    if (peer.applied > peer.acked && peer.wire && peer.wire.ready) {
      peer.wire.send({ t: 'ack', seq: peer.applied });
      peer.acked = peer.applied;
    }
  }

  #error(err) {
    if (this.listenerCount('error') > 0) this.emit('error', err);
  }
}

module.exports = { NetCache, NetCacheError };
