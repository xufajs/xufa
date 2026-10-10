// Pools of nodes shared by the processes of a cluster: other servers (or anything) that take a few tasks at once
// each, as document converters. The primary keeps the nodes, their slots (the tasks each one takes at once) and a
// queue of tickets; a worker that needs a node sends a ticket and keeps its work (the function, the request it
// answers, its promise) while it waits. The primary answers the ticket (the reply of a request of the bus) when a slot
// is free, and the slot is free again when the work ends, when its worker dies, when its node goes, or when its lease
// passes leaseTimeout (the signal of the work is then aborted). Nodes are a list, or a source of peers such as a
// Discovery of @xufa/discovery (peers, 'up' and 'down').
//
//   // primary: where the nodes are known
//   const pool = createPool('converters', { nodes: discovery, slots: (peer) => peer.meta.slots || 1, leaseTimeout: '5m' });
//   // workers (and the primary, and one process with workers: 0)
//   const result = await usePool('converters').use((node, { signal }) => post(node.meta.url, body, { signal }), { retries: 2 });
//
// The demand (tickets waiting plus leases running) can scale the nodes (autoscale), so nodes running work are never
// taken away because the queue is empty.
//
// Several machines (each with its primary and its pool) share the slots of the same nodes with a store (shared:
// ormSlots(db)): a slot is given only when the store gives it, so a node never gets more works at once than its slots.
// A node that answers busy (429, or what busy(err) says) is left aside for a while (its Retry-After, or busyFor), and
// the work goes to another one without counting as a failure. With notify (a NetCache of @xufa/netcache, a Discovery of
// @xufa/discovery, or { publish, subscribe }), a machine that gives a slot back tells the others, whose tickets waiting
// are served at once instead of at their next look (pollEvery).
import cluster from 'node:cluster';
import { EventEmitter } from 'node:events';

const ACQUIRE = 'xufa:pool:acquire';
const RELEASE = 'xufa:pool:release';
const CANCEL = 'xufa:pool:cancel';
const STATS = 'xufa:pool:stats';
const REVOKE = 'xufa:pool:revoke';

const NO_NODES = new Set();
const FREED = 'xufa:pool:freed';

// What tells the other machines that a slot was given back: publish(data), subscribe(handler) (its unsubscribe).
// A NetCache (publish on its channel, TCP to the nodes connected), a Discovery (send: datagrams, which can be lost), or
// an object with publish and subscribe.
function notifierOf(given) {
  if (!given) return null;
  const listen = (event, handler) => {
    const listener = (channel, data) => {
      if (channel === FREED) handler(data);
    };
    given.on(event, listener);
    return () => given.off(event, listener);
  };
  if (typeof given.subscribe === 'function' && typeof given.publish === 'function') return given;
  if (typeof given.publish === 'function' && typeof given.on === 'function') {
    return { publish: (data) => given.publish(FREED, data), subscribe: (handler) => listen('publish', handler) };
  }
  if (typeof given.send === 'function' && typeof given.on === 'function') {
    return { publish: (data) => given.send(FREED, data), subscribe: (handler) => listen('message', handler) };
  }
  throw new PoolError('notify: a NetCache, a Discovery, or { publish(data), subscribe(handler) }');
}

// Busy answers: an HTTP 429 (statusCode or status, as the errors of @xufa/client), or code XUFA_POOL_BUSY.
const defaultBusy = (err) =>
  Boolean(err) && (err.statusCode === 429 || err.status === 429 || err.code === 'XUFA_POOL_BUSY');

// The ms a busy answer asks to wait: retryAfter (ms), or its header Retry-After (seconds or a date); or null.
function retryAfterOf(err) {
  if (!err) return null;
  if (typeof err.retryAfter === 'number') return err.retryAfter;
  const headers = err.headers || (err.response && err.response.headers);
  let value = headers && (typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after']);
  if (value === undefined || value === null || value === '') return null;
  value = String(value);
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

const STATUS = {
  XUFA_POOL_FULL: 503,
  XUFA_POOL_BUSY: 429,
  XUFA_POOL_WAIT_TIMEOUT: 503,
  XUFA_POOL_LEASE_TIMEOUT: 504,
  XUFA_POOL_NODE_DOWN: 502,
  XUFA_POOL_WORKER_EXIT: 500,
  XUFA_POOL_CANCELLED: 499,
  XUFA_POOL_CLOSED: 503,
  XUFA_POOL_UNKNOWN: 500,
  XUFA_POOL_ERR: 500,
};

class PoolError extends Error {
  constructor(message, code = 'XUFA_POOL_ERR') {
    super(message);
    this.name = 'PoolError';
    this.code = code;
    this.statusCode = STATUS[code] || 500;
  }
}

// An error of the primary, as it arrives through the bus (a BusError with its name and code): a PoolError again.
function poolErrorOf(err) {
  if (err instanceof PoolError) return err;
  if (err && typeof err.code === 'string' && err.code.startsWith('XUFA_POOL_'))
    return new PoolError(err.message, err.code);
  return err;
}

// Durations: milliseconds, or text as '500ms', '30s', '10m', '1h' and sums ('1m30s').
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
// The fallback of use(): { node (or node(attempt, error)), after (the first attempt that goes there: none by default),
// wait (no node free in that time: the fallback) }.
function fallbackOf(fallback) {
  if (fallback === null || fallback === undefined) return null;
  if (typeof fallback !== 'object' || (!fallback.node && typeof fallback.node !== 'function')) {
    throw new PoolError('use(): fallback is { node, after, wait }: node is an object, or node(attempt, error)');
  }
  const after = fallback.after === undefined ? Infinity : fallback.after;
  if (after !== Infinity && (!Number.isInteger(after) || after < 0)) {
    throw new PoolError(`use(): fallback.after is the first attempt (0, 1...) that goes to the fallback: ${after}`);
  }
  const wait = fallback.wait === undefined || fallback.wait === null ? null : ms(fallback.wait, 'fallback.wait');
  if (after === Infinity && wait === null) {
    throw new PoolError('use(): fallback needs after (an attempt) or wait (a time without a free node)');
  }
  return { node: fallback.node, after, wait };
}

function ms(value, what) {
  if (value === undefined || value === null || value === 0 || value === Infinity) return 0;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  let total = 0;
  const text = String(value).trim();
  const rest = text.replace(/(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/g, (_, n, unit) => {
    total += Number(n) * UNITS[unit];
    return '';
  });
  if (rest.trim() !== '' || text === '')
    throw new PoolError(`${what}: '${value}' is not a duration (as '30s' or '5m')`);
  return total;
}

const unref = (timer) => {
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
};

// A check of xufa.health of @xufa/http from the stats of a pool: down with fewer nodes than minNodes (1), degraded
// with more tickets waiting than maxWaiting; the nodes, slots, free slots, works running and tickets waiting.
function poolHealth(stats, { minNodes = 1, critical = false, maxWaiting, timeout } = {}) {
  const check = async () => {
    const now = await stats();
    const details = { nodes: now.nodes, slots: now.slots, free: now.free, running: now.running, waiting: now.waiting };
    if (now.nodes < minNodes) {
      return { status: 'down', error: `${now.nodes} nodes of the pool ${now.name} (${minNodes} at least)`, ...details };
    }
    if (maxWaiting !== undefined && now.waiting > maxWaiting) {
      return { status: 'degraded', error: `${now.waiting} works wait for a node of ${now.name}`, ...details };
    }
    return { status: 'up', ...details };
  };
  return { check, critical, ...(timeout !== undefined ? { timeout } : {}) };
}

// The pools and the leases of each bus (one bus is shared by every module of a process).
const servers = new WeakMap();
const leases = new WeakMap();

function serversOf(bus) {
  let map = servers.get(bus);
  if (!map) {
    map = new Map();
    servers.set(bus, map);
    const server = (data) => {
      const pool = map.get(data && data.pool);
      if (!pool)
        throw new PoolError(`There is no pool ${data && data.pool} (createPool() in the primary)`, 'XUFA_POOL_UNKNOWN');
      return pool;
    };
    bus.on(ACQUIRE, (data, sender) => server(data).acquireTicket(data, sender));
    bus.on(RELEASE, (data, sender) => {
      const pool = map.get(data && data.pool);
      if (pool) pool.releaseTicket(data, sender);
    });
    bus.on(CANCEL, (data, sender) => {
      const pool = map.get(data && data.pool);
      if (pool) pool.cancelTicket(data, sender);
    });
    bus.on(STATS, (data) => server(data).stats());
  }
  return map;
}

function leasesOf(bus) {
  let map = leases.get(bus);
  if (!map) {
    map = new Map();
    leases.set(bus, map);
    bus.on(REVOKE, ({ pool, ticket, reason }) => {
      const lease = map.get(`${pool}\0${ticket}`);
      if (lease) lease.revoke(new PoolError(reason.message, reason.code));
    });
  }
  return map;
}

// Scales the nodes by the demand: up at once (then not more often than upEvery), down only when the demand was lower
// for downAfter (to the most it wanted in that time). The demand counts the leases running too.
class Autoscaler {
  constructor(pool, options) {
    if (typeof options.scale !== 'function') throw new PoolError('autoscale: scale(count) is a function');
    this.pool = pool;
    this.scaleTo = options.scale;
    this.perNode = options.perNode || 1;
    this.min = options.min || 0;
    this.max = options.max === undefined ? Infinity : options.max;
    this.upEvery = ms(options.upEvery === undefined ? '10s' : options.upEvery, 'autoscale.upEvery');
    this.downAfter = ms(options.downAfter === undefined ? '10m' : options.downAfter, 'autoscale.downAfter');
    this.current = options.initial;
    this.lastUp = 0;
    this.lowSince = null;
    this.lowMost = 0;
    this.timer = null;
  }

  wanted({ waiting, running }) {
    return Math.min(this.max, Math.max(this.min, Math.ceil((waiting + running) / this.perNode)));
  }

  evaluate(stats) {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.current === undefined) this.current = stats.nodes;
    const want = this.wanted(stats);
    const now = Date.now();
    if (want > this.current) {
      this.lowSince = null;
      const at = this.lastUp + this.upEvery;
      if (now >= at) {
        this.lastUp = now;
        this.set(want, stats);
      } else this.later(at - now);
    } else if (want < this.current) {
      if (this.lowSince === null) {
        this.lowSince = now;
        this.lowMost = want;
      } else this.lowMost = Math.max(this.lowMost, want);
      const at = this.lowSince + this.downAfter;
      if (now >= at) {
        this.lowSince = null;
        this.set(this.lowMost, stats);
      } else this.later(at - now);
    } else this.lowSince = null;
  }

  later(wait) {
    this.timer = unref(setTimeout(() => this.evaluate(this.pool.stats()), wait));
  }

  set(count, stats) {
    const from = this.current;
    this.current = count;
    this.pool.emit('scale', { from, to: count, ...stats });
    Promise.resolve()
      .then(() => this.scaleTo(count, stats))
      .catch((err) => {
        if (this.pool.listenerCount('error')) this.pool.emit('error', err);
        else process.emitWarning(err);
      });
  }

  stop() {
    clearTimeout(this.timer);
  }
}

// The pool, in the primary (or in the only process): its nodes, the tickets waiting and the leases given.
class Pool extends EventEmitter {
  constructor(name, options = {}) {
    super();
    if (typeof name !== 'string' || name === '') throw new PoolError('createPool(name): name is a string');
    const { bus } = options;
    if (!bus) throw new PoolError('createPool(name, { bus }): a bus of @xufa/cluster');
    const map = serversOf(bus);
    if (map.has(name)) throw new PoolError(`The pool ${name} is there already (one createPool by name)`);
    this.name = name;
    this.bus = bus;
    this.slotsOf = typeof options.slots === 'function' ? options.slots : () => options.slots || 1;
    this.leaseTimeout = ms(options.leaseTimeout, 'leaseTimeout');
    this.waitTimeout = ms(options.waitTimeout, 'waitTimeout');
    this.maxWaiting = options.maxWaiting === undefined ? Infinity : options.maxWaiting;
    // How long a node that answered busy is left aside (when it does not say).
    this.busyFor = ms(options.busyFor === undefined ? '1s' : options.busyFor, 'busyFor');
    // A store of slots shared with the pools of other machines (ormSlots(db)): how often to look again when every
    // free slot is taken by them.
    this.shared = options.shared || null;
    if (this.shared && (typeof this.shared.claim !== 'function' || typeof this.shared.release !== 'function')) {
      throw new PoolError('shared: a store of slots (ormSlots(db)), with claim and release');
    }
    this.pollEvery = ms(options.pollEvery === undefined ? '500ms' : options.pollEvery, 'pollEvery');
    this.notify = notifierOf(options.notify);
    if (this.notify && !this.shared) throw new PoolError('notify tells the pools of other machines: it needs shared');
    this.pumping = null;
    this.again = false;
    this.wakeTimer = null;
    this.wakeAt = 0;
    this.nodes = new Map();
    this.waiting = [];
    this.leases = new Map();
    this.grants = 0;
    this.closed = false;
    this.demandQueued = false;
    this.cleanups = [];
    map.set(name, this);
    if (cluster.isPrimary) {
      const onExit = (worker) => this.workerExit(worker.id);
      cluster.on('exit', onExit);
      this.cleanups.push(() => cluster.off('exit', onExit));
    }
    if (options.autoscale) this.autoscaler = new Autoscaler(this, options.autoscale);
    if (this.notify) {
      // A slot of another machine came back: the tickets waiting look again now.
      const unsubscribe = this.notify.subscribe((data) => {
        if (data && data.pool === this.name && this.waiting.length > 0) this.wake();
      });
      if (typeof unsubscribe === 'function') this.cleanups.push(unsubscribe);
    }
    this.watch(options.nodes);
    if (this.shared && typeof this.shared.renew === 'function') {
      // The slots held are renewed while they are: those of a machine that died come back after the store's ttl.
      const every = Math.max(50, Math.floor((this.shared.ttl || 30000) / 3));
      const renewal = unref(
        setInterval(() => {
          const tokens = [...this.leases.values()].map((lease) => lease.token).filter(Boolean);
          if (tokens.length) Promise.resolve(this.shared.renew(tokens)).catch((err) => this.fault(err));
        }, every)
      );
      this.cleanups.push(() => clearInterval(renewal));
    }
    // The client of this process: pool.use() and pool.acquire() in the primary.
    this.client = new PoolClient(name, { bus, busy: options.busy });
  }

  // An error of the store of slots: 'error', or a warning.
  fault(err) {
    if (this.listenerCount('error')) this.emit('error', err);
    else process.emitWarning(err);
  }

  // The nodes: a list (strings are ids), or a source of peers (peers, and the events 'up' and 'down').
  watch(source) {
    if (!source) return;
    if (Array.isArray(source)) {
      for (const node of source) this.add(node);
      return;
    }
    if (typeof source.on !== 'function') throw new PoolError('nodes: a list, or a source of peers (as a Discovery)');
    for (const peer of source.peers || []) this.add(peer);
    const up = (peer) => this.add(peer);
    const down = (peer) => this.remove(peer.id);
    source.on('up', up);
    source.on('down', down);
    this.cleanups.push(() => {
      source.off('up', up);
      source.off('down', down);
    });
  }

  // Adds a node (or updates one with the same id): an id, or an object with an id, sent to the work as it is.
  add(given) {
    const node = typeof given === 'string' || typeof given === 'number' ? { id: given } : given;
    if (!node || node.id === undefined || node.id === null) throw new PoolError('A node of a pool has an id');
    const slots = Math.max(0, Math.floor(Number(this.slotsOf(node)) || 0));
    const known = this.nodes.get(node.id);
    if (known) {
      known.data = node;
      known.slots = slots;
    } else {
      this.nodes.set(node.id, {
        id: node.id,
        data: node,
        slots,
        used: 0,
        lastGrant: 0,
        failures: 0,
        leases: new Set(),
      });
      this.emit('up', node);
    }
    this.dispatch();
    this.demand();
    return this;
  }

  // Takes a node away: its leases are revoked (their work's signal aborted), and the tickets wait for other nodes.
  remove(id) {
    const node = this.nodes.get(id);
    if (!node) return this;
    this.nodes.delete(id);
    for (const key of [...node.leases]) {
      this.revoke(key, new PoolError(`The node ${id} of the pool ${this.name} went away`, 'XUFA_POOL_NODE_DOWN'));
    }
    this.emit('down', node.data);
    this.demand();
    return this;
  }

  acquireTicket(data, sender) {
    if (this.closed) throw new PoolError(`The pool ${this.name} is closed`, 'XUFA_POOL_CLOSED');
    if (this.waiting.length >= this.maxWaiting) {
      throw new PoolError(
        `The pool ${this.name} has ${this.waiting.length} tickets waiting (maxWaiting)`,
        'XUFA_POOL_FULL'
      );
    }
    const worker = sender ? sender.id : 0;
    return new Promise((resolve, reject) => {
      const ticket = {
        key: `${worker}:${data.ticket}`,
        worker,
        id: data.ticket,
        priority: data.priority || 0,
        exclude: new Set(data.exclude || []),
        resolve,
        reject,
        timer: null,
      };
      if (this.waitTimeout) {
        ticket.timer = unref(
          setTimeout(() => {
            this.drop(ticket);
            reject(
              new PoolError(
                `No node of the pool ${this.name} was free in ${this.waitTimeout} ms`,
                'XUFA_POOL_WAIT_TIMEOUT'
              )
            );
          }, this.waitTimeout)
        );
      }
      // Higher priority first, then in order of arrival.
      let at = this.waiting.length;
      while (at > 0 && this.waiting[at - 1].priority < ticket.priority) at -= 1;
      this.waiting.splice(at, 0, ticket);
      this.dispatch();
      this.demand();
    });
  }

  drop(ticket) {
    const at = this.waiting.indexOf(ticket);
    if (at >= 0) this.waiting.splice(at, 1);
    clearTimeout(ticket.timer);
    this.demand();
  }

  releaseTicket(data, sender) {
    const key = `${sender ? sender.id : 0}:${data.ticket}`;
    const lease = this.leases.get(key);
    if (!lease) return;
    this.end(lease);
    const node = this.nodes.get(lease.nodeId);
    if (node && data.busy) {
      // It answered busy: left aside for a while (no failure).
      const wait = typeof data.retryAfter === 'number' ? data.retryAfter : this.busyFor;
      node.busyUntil = Date.now() + wait;
      this.emit('busy', { node: node.data, for: wait });
    } else if (node && data.failed) node.failures += 1;
    this.dispatch();
    this.demand();
  }

  // A ticket the worker does not want any more: out of the queue, or its lease ended when it was given already.
  cancelTicket(data, sender) {
    const key = `${sender ? sender.id : 0}:${data.ticket}`;
    const ticket = this.waiting.find((item) => item.key === key);
    if (ticket) {
      this.drop(ticket);
      ticket.reject(new PoolError('The ticket was cancelled', 'XUFA_POOL_CANCELLED'));
      return;
    }
    this.releaseTicket(data, sender);
  }

  // A worker died: its tickets go, and its leases end.
  workerExit(workerId) {
    for (const ticket of this.waiting.filter((item) => item.worker === workerId)) {
      this.drop(ticket);
      ticket.reject(new PoolError(`The worker ${workerId} exited`, 'XUFA_POOL_WORKER_EXIT'));
    }
    let freed = false;
    for (const lease of [...this.leases.values()]) {
      if (lease.worker === workerId) {
        this.end(lease);
        freed = true;
      }
    }
    if (freed) {
      this.dispatch();
      this.demand();
    }
  }

  end(lease) {
    clearTimeout(lease.timer);
    this.leases.delete(lease.key);
    const node = this.nodes.get(lease.nodeId);
    if (node && node.leases.delete(lease.key)) node.used -= 1;
    if (lease.token) this.giveBack(lease.token, lease.nodeId);
  }

  // Gives a slot back to the store, and tells the other machines.
  giveBack(token, nodeId) {
    Promise.resolve()
      .then(() => this.shared.release(token))
      .then(() => {
        if (this.notify) return this.notify.publish({ pool: this.name, node: nodeId });
        return undefined;
      })
      .catch((err) => this.fault(err));
  }

  // Looks for free slots now (instead of at the next look).
  wake() {
    clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.dispatch();
  }

  // Ends a lease and tells its worker (its work's signal is aborted with the reason).
  revoke(key, reason) {
    const lease = this.leases.get(key);
    if (!lease) return;
    this.end(lease);
    this.emit('revoke', { node: lease.nodeId, worker: lease.worker, reason });
    const data = { pool: this.name, ticket: lease.ticket, reason: { message: reason.message, code: reason.code } };
    try {
      if (lease.worker === 0) this.bus.dispatch(REVOKE, data, null).catch((err) => process.emitWarning(err));
      else this.bus.sendTo(lease.worker, REVOKE, data);
    } catch {
      // The worker is gone: nothing to tell.
    }
    this.dispatch();
    this.demand();
  }

  // The free node for a ticket: the one with the most free slots (the one given work longest ago, between equals);
  // nodes where the ticket failed before only when there is no other.
  pick(ticket, full = NO_NODES, now = Date.now()) {
    let avoid = ticket.exclude.size > 0;
    if (avoid) {
      avoid = false;
      for (const node of this.nodes.values()) {
        if (node.slots > 0 && !ticket.exclude.has(node.id)) {
          avoid = true;
          break;
        }
      }
    }
    let best = null;
    for (const node of this.nodes.values()) {
      if (node.used >= node.slots || (avoid && ticket.exclude.has(node.id))) continue;
      if (full.has(node.id) || node.busyUntil > now) continue;
      if (
        !best ||
        node.slots - node.used > best.slots - best.used ||
        (node.slots - node.used === best.slots - best.used && node.lastGrant < best.lastGrant)
      ) {
        best = node;
      }
    }
    return best;
  }

  // Gives the free slots to the tickets, in their order (a ticket that cannot be served yet does not stop the others).
  dispatch() {
    if (this.closed) return;
    if (this.shared) {
      this.pump();
      return;
    }
    for (let i = 0; i < this.waiting.length;) {
      const ticket = this.waiting[i];
      const node = this.pick(ticket);
      if (!node) {
        i += 1;
        continue;
      }
      this.grant(ticket, node, null);
    }
    this.wakeLater(NO_NODES);
  }

  // With a store of slots: one loop at a time claims a slot of the node picked for the first ticket that has one
  // (another node when the store says it is full), and grants it if the ticket still waits.
  pump() {
    if (this.pumping) {
      this.again = true;
      return;
    }
    this.pumping = this.pumpTickets()
      .catch((err) => this.fault(err))
      .finally(() => {
        this.pumping = null;
        if (this.again && !this.closed) {
          this.again = false;
          this.pump();
        }
      });
  }

  async pumpTickets() {
    // Nodes whose slots are all taken by other machines (in this pass).
    const full = new Set();
    while (!this.closed) {
      let ticket = null;
      let node = null;
      for (const item of this.waiting) {
        node = this.pick(item, full);
        if (node) {
          ticket = item;
          break;
        }
      }
      if (!ticket) break;
      // Held here while the store answers, so this machine does not pick it twice.
      node.used += 1;
      let token;
      try {
        token = await this.shared.claim(this.name, node.id, node.slots);
      } catch (err) {
        node.used -= 1;
        this.fault(err);
        full.add(node.id);
        continue;
      }
      node.used -= 1;
      if (!token) {
        full.add(node.id);
        continue;
      }
      if (!this.waiting.includes(ticket) || this.nodes.get(node.id) !== node || this.closed) {
        // The ticket went (cancelled, its worker died, its wait timed out) or the node did, while the store answered.
        this.giveBack(token, node.id);
        continue;
      }
      this.grant(ticket, node, token);
    }
    this.wakeLater(full);
  }

  // Tickets wait while nodes are busy (or, with a store, full): the pool looks again when the first busy one is
  // free, or after pollEvery.
  wakeLater(full) {
    if (this.closed || this.waiting.length === 0) return;
    const now = Date.now();
    let at = full.size > 0 ? now + this.pollEvery : Infinity;
    for (const node of this.nodes.values()) if (node.busyUntil > now) at = Math.min(at, node.busyUntil);
    if (at === Infinity) return;
    if (this.wakeTimer && this.wakeAt <= at) return;
    clearTimeout(this.wakeTimer);
    this.wakeAt = at;
    this.wakeTimer = unref(
      setTimeout(
        () => {
          this.wakeTimer = null;
          this.dispatch();
        },
        Math.max(0, at - now)
      )
    );
  }

  grant(ticket, node, token) {
    const at = this.waiting.indexOf(ticket);
    if (at >= 0) this.waiting.splice(at, 1);
    clearTimeout(ticket.timer);
    node.used += 1;
    this.grants += 1;
    node.lastGrant = this.grants;
    const lease = { key: ticket.key, worker: ticket.worker, ticket: ticket.id, nodeId: node.id, timer: null, token };
    if (this.leaseTimeout) {
      lease.timer = unref(
        setTimeout(
          () =>
            this.revoke(
              lease.key,
              new PoolError(
                `The work on the node ${node.id} of the pool ${this.name} ran more than ${this.leaseTimeout} ms`,
                'XUFA_POOL_LEASE_TIMEOUT'
              )
            ),
          this.leaseTimeout
        )
      );
    }
    this.leases.set(lease.key, lease);
    node.leases.add(lease.key);
    ticket.resolve({ node: node.data });
    this.demand();
  }

  // The demand changed: 'demand' (once by turn of the event loop), and the autoscaler.
  demand() {
    if (this.demandQueued) return;
    this.demandQueued = true;
    queueMicrotask(() => {
      this.demandQueued = false;
      if (this.closed) return;
      const stats = this.stats();
      this.emit('demand', stats);
      if (this.autoscaler) this.autoscaler.evaluate(stats);
    });
  }

  stats() {
    let slots = 0;
    let used = 0;
    const nodes = [];
    for (const node of this.nodes.values()) {
      slots += node.slots;
      used += node.used;
      nodes.push({ id: node.id, slots: node.slots, running: node.used, failures: node.failures });
    }
    return {
      name: this.name,
      nodes: this.nodes.size,
      slots,
      free: Math.max(0, slots - used),
      running: this.leases.size,
      waiting: this.waiting.length,
      byNode: nodes,
    };
  }

  use(fn, options) {
    return this.client.use(fn, options);
  }

  // A check of xufa.health: { minNodes (1), maxWaiting, critical (false) }.
  health(options) {
    return poolHealth(async () => this.stats(), options);
  }

  acquire(options) {
    return this.client.acquire(options);
  }

  // Stops the pool: tickets waiting are rejected, leases revoked, and the nodes' source is not watched any more.
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const ticket of [...this.waiting]) {
      this.drop(ticket);
      ticket.reject(new PoolError(`The pool ${this.name} is closed`, 'XUFA_POOL_CLOSED'));
    }
    for (const key of [...this.leases.keys()]) {
      this.revoke(key, new PoolError(`The pool ${this.name} is closed`, 'XUFA_POOL_CLOSED'));
    }
    for (const cleanup of this.cleanups) cleanup();
    clearTimeout(this.wakeTimer);
    if (this.autoscaler) this.autoscaler.stop();
    serversOf(this.bus).delete(this.name);
  }
}

let nextTicket = 1;

// A lease of a node: its node, a signal aborted when the primary takes it back (timeout, node gone), and release().
class Lease {
  constructor(client, ticket, node) {
    this.client = client;
    this.ticket = ticket;
    this.node = node;
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    this.released = false;
  }

  revoke(reason) {
    this.client.forget(this);
    this.released = true;
    this.controller.abort(reason);
  }

  // Gives the slot back. failed: true, or the error of the work (counted in the node's stats; a busy answer leaves
  // the node aside for a while instead).
  release(failed = false) {
    if (this.released) return;
    this.released = true;
    this.client.forget(this);
    const message = { pool: this.client.name, ticket: this.ticket, failed: Boolean(failed) };
    if (failed && typeof failed === 'object' && this.client.isBusy(failed)) {
      message.failed = false;
      message.busy = true;
      const wait = retryAfterOf(failed);
      if (wait !== null) message.retryAfter = wait;
    }
    this.client.bus.send(RELEASE, message);
  }
}

// The side of the workers: tickets sent to the primary, and the work run when a node is given.
class PoolClient {
  constructor(name, options = {}) {
    const { bus } = options;
    if (typeof name !== 'string' || name === '') throw new PoolError('usePool(name): name is a string');
    if (!bus) throw new PoolError('usePool(name, { bus }): a bus of @xufa/cluster');
    this.name = name;
    this.bus = bus;
    this.leases = leasesOf(bus);
    // Which errors are busy answers of a node (429 by default): the work goes to another node, not a failure.
    this.isBusy = typeof options.busy === 'function' ? options.busy : defaultBusy;
  }

  forget(lease) {
    this.leases.delete(`${this.name}\0${lease.ticket}`);
  }

  // Waits for a free node: a Lease (release() it when done). Options: priority (higher first), exclude (ids of
  // nodes to avoid while there are others), signal (stops waiting).
  async acquire({ priority = 0, exclude = [], signal } = {}) {
    if (signal && signal.aborted) throw signal.reason;
    const ticket = nextTicket;
    nextTicket += 1;
    const onAbort = () => this.bus.send(CANCEL, { pool: this.name, ticket });
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    let reply;
    try {
      reply = await this.bus.request(
        ACQUIRE,
        { pool: this.name, ticket, priority, exclude: [...exclude] },
        { timeout: 0 }
      );
    } catch (err) {
      if (signal && signal.aborted) throw signal.reason;
      throw poolErrorOf(err);
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
    }
    if (!reply || !reply.node) {
      throw new PoolError(`There is no pool ${this.name} (createPool() in the primary)`, 'XUFA_POOL_UNKNOWN');
    }
    const lease = new Lease(this, ticket, reply.node);
    if (signal && signal.aborted) {
      // Cancelled while it was given: the primary took the slot back with the cancel.
      lease.released = true;
      throw signal.reason;
    }
    this.leases.set(`${this.name}\0${ticket}`, lease);
    return lease;
  }

  // Runs fn(node, { signal, attempt, fallback }) on a free node, and gives the slot back when it ends. With fallback
  // ({ node, after, wait }): from the attempt `after` on (or when no node is free in `wait`), on its node instead (a
  // load balancer in front of the nodes...), without a lease. Options: retries (on
  // other nodes while there are: 0), retryOn(err, attempt) (which errors: all), priority, signal. The signal of fn
  // is aborted when the lease is taken back (leaseTimeout, its node gone), and so is its promise.
  async use(
    fn,
    { retries = 0, retryOn = null, priority = 0, signal, avoidFailed = true, maxBusy = 20, fallback = null } = {}
  ) {
    if (typeof fn !== 'function') throw new PoolError('use(fn): fn is a function');
    const spare = fallbackOf(fallback);
    const failed = [];
    let busy = 0;
    let lastError;
    // Whether an error ends the work (no attempt left, or retryOn says so).
    const final = (err, attempt) => attempt >= retries || (retryOn && !retryOn(err, attempt));
    for (let attempt = 0; ; attempt += 1) {
      // From attempt `after` on, the fallback (a load balancer...): no lease, the work goes there.
      if (spare && attempt >= spare.after) {
        try {
          return await this.onFallback(fn, spare, attempt, lastError, signal);
        } catch (err) {
          if (signal && signal.aborted) throw signal.reason;
          if (final(err, attempt)) throw err;
          lastError = err;
          continue;
        }
      }
      let lease;
      // With fallback.wait: no node free in that time, and the fallback takes this attempt.
      const waited = spare && spare.wait !== null ? AbortSignal.timeout(spare.wait) : null;
      const waiting = waited ? (signal ? AbortSignal.any([signal, waited]) : waited) : signal;
      try {
        lease = await this.acquire({ priority, exclude: avoidFailed ? failed : [], signal: waiting });
      } catch (err) {
        if (!waited || !waited.aborted || (signal && signal.aborted)) throw err;
        try {
          return await this.onFallback(fn, spare, attempt, lastError, signal);
        } catch (fallbackError) {
          if (signal && signal.aborted) throw signal.reason;
          if (final(fallbackError, attempt)) throw fallbackError;
          lastError = fallbackError;
          continue;
        }
      }
      const work = signal ? AbortSignal.any([signal, lease.signal]) : lease.signal;
      let onRevoke;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => fn(lease.node, { signal: work, attempt, fallback: false })),
          new Promise((resolve, reject) => {
            onRevoke = () => reject(lease.signal.reason);
            lease.signal.addEventListener('abort', onRevoke, { once: true });
          }),
        ]);
        lease.release();
        return result;
      } catch (err) {
        lease.release(err && typeof err === 'object' ? err : true);
        if (signal && signal.aborted) throw signal.reason;
        if (this.isBusy(err) && busy < maxBusy) {
          // The node was busy: on another (or on it, once it is free again), not an attempt.
          busy += 1;
          attempt -= 1;
          continue;
        }
        if (final(err, attempt)) throw err;
        lastError = err;
        if (!failed.includes(lease.node.id)) failed.push(lease.node.id);
      } finally {
        lease.signal.removeEventListener('abort', onRevoke);
      }
    }
  }

  // An attempt on the fallback: fn(node, { signal, attempt, fallback: true }), its node given or made by
  // node(attempt, lastError).
  async onFallback(fn, spare, attempt, lastError, signal) {
    const node = typeof spare.node === 'function' ? await spare.node(attempt, lastError) : spare.node;
    if (!node) throw new PoolError(`The fallback of the pool ${this.name} gave no node`, 'XUFA_POOL_FALLBACK');
    return fn(node, { signal: signal || new AbortController().signal, attempt, fallback: true });
  }

  // A check of xufa.health, from a worker (the stats of the primary): { minNodes (1), maxWaiting, critical (false) }.
  health(options) {
    return poolHealth(() => this.stats(), options);
  }

  // The state of the pool, from the primary: nodes, slots, free, running, waiting, byNode.
  stats() {
    return this.bus.request(STATS, { pool: this.name }).catch((err) => {
      throw poolErrorOf(err);
    });
  }
}

export { Pool, PoolClient, PoolError, Lease, Autoscaler };
