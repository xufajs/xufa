// The messages between the processes of a cluster: workers send events and requests to the primary, and the primary
// sends to a worker or to every one. Messages go through the IPC of node:cluster with the advanced serialization
// (structured clone: Dates, Maps, Sets, BigInts, typed arrays and shared references arrive as they were sent).
//
// In one process (no workers), the same calls deliver the messages to the handlers of that process, so code written
// for a cluster runs as it is in development and in tests.
//
// With useMarshal() (start({ marshal })), data goes as @xufa/marshal writes it: the instances of registered classes
// arrive as themselves, and so do the errors thrown by the handlers of requests (their class, cause and fields).
const cluster = require('node:cluster');

const TAG = '__xufaBus';
const EMPTY = [];

class BusError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'BusError';
  }
}

// An error sent back by the handler of a request: its message, name and code.
function errorOf(data) {
  const err = new BusError(data.message);
  if (data.name) err.name = data.name;
  if (data.code !== undefined) err.code = data.code;
  return err;
}

// The faults of a bus (bus.faults), for tests of resilience: its events lost (fail, down, drop), late (delay) or held
// until released (hang), as IPC between processes can be; its requests failed (fail, down: a BusError), without a
// reply (drop: they time out as a request whose message was lost does), late or held. Events by name (events: names
// or regular expressions).
const EVENTS = ['send', 'sendTo', 'broadcast'];

function busFaults(bus) {
  const { Faults, sleep } = require('@xufa/faults'); // eslint-disable-line global-require
  const faults = new Faults({
    name: 'bus',
    operations: [...EVENTS, 'request'],
    groups: { events: EVENTS },
    filters: { events: 'event' },
    downMessage: 'The bus is down (a fault injected)',
    error: (rule, context) =>
      Object.assign(
        new BusError(rule.message || `A fault of the bus (injected): ${context.operation} ${context.event}`),
        {
          code: 'XUFA_FAULT',
        }
      ),
  });
  // Messages lost: events not delivered, requests without a reply.
  faults.drop = (options) => faults.add('drop', options);
  for (const operation of EVENTS) {
    const original = bus[operation].bind(bus);
    bus[operation] = (event, ...args) => {
      if (faults.rules.length === 0) return original(event, ...args);
      let wait = 0;
      const held = [];
      for (const { rule, kind, ms } of faults.pick({ operation, event })) {
        if (kind === 'delay') wait += ms;
        else if (kind === 'hang') held.push(rule);
        else return undefined; // fail, down, drop: lost
      }
      if (!wait && held.length === 0) return original(event, ...args);
      (async () => {
        if (wait) await sleep(wait);
        for (const rule of held) await rule.held();
        original(event, ...args);
      })().catch((err) => process.emitWarning(err));
      return undefined;
    };
  }
  const request = bus.request.bind(bus);
  bus.request = (event, data, options = {}) => {
    if (faults.rules.length === 0) return request(event, data, options);
    const timeout = options.timeout === undefined ? 30000 : options.timeout;
    const context = { operation: 'request', event };
    const picked = faults.pick(context);
    return (async () => {
      for (const { rule, kind, ms } of picked) {
        if (kind === 'delay') await sleep(ms);
        else if (kind === 'hang') await rule.held();
        else if (kind === 'drop') {
          // No reply: its timeout, as a request whose message was lost (never, without one).
          return new Promise((resolve, reject) => {
            if (timeout)
              setTimeout(() => reject(new BusError(`The request ${event} had no reply in ${timeout} ms`)), timeout);
          });
        } else throw rule.errorFor(context);
      }
      return request(event, data, options);
    })();
  };
  return faults;
}

class Bus {
  // Its faults (made the first time), for tests of resilience.
  get faults() {
    if (!this.faultsOf) Object.defineProperty(this, 'faultsOf', { value: busFaults(this), enumerable: false });
    return this.faultsOf;
  }

  constructor() {
    this.handlers = new Map();
    this.pending = new Map();
    this.nextId = 1;
    this.listening = false;
    this.local = true;
    this.marshaller = null;
  }

  // Sends data written by @xufa/marshal, with `registry` (its default one when not given). The processes that
  // receive must know the same classes (they run the same code).
  useMarshal(registry) {
    const { marshal, unmarshal, registry: fallback } = require('@xufa/marshal'); // eslint-disable-line global-require
    const options = { registry: registry || fallback };
    this.marshaller = { write: (value) => marshal(value, options), read: (nodes) => unmarshal(nodes, options) };
    return this;
  }

  get isPrimary() {
    return cluster.isPrimary;
  }

  // Whether messages go to other processes (a primary with workers, or a worker).
  get clustered() {
    return !this.local;
  }

  // Ids of the workers (in the primary).
  get workers() {
    return cluster.workers ? Object.keys(cluster.workers).map(Number) : [];
  }

  // Starts listening to the other processes (called by start(); a worker of a cluster listens from its start).
  listen() {
    if (this.listening) return;
    this.listening = true;
    if (cluster.isPrimary) {
      this.local = false;
      cluster.on('message', (worker, message) => this.receive(message, worker));
    } else {
      this.local = false;
      process.on('message', (message) => this.receive(message, null));
    }
  }

  // handler(data, sender): sender is the worker (in the primary) or null (in a worker). Its result (or the promise
  // of it) is the reply of requests.
  on(event, handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(handler);
    return this;
  }

  off(event, handler) {
    const list = this.handlers.get(event);
    if (list)
      this.handlers.set(
        event,
        list.filter((item) => item !== handler)
      );
    return this;
  }

  async dispatch(event, data, sender) {
    const list = this.handlers.get(event) || EMPTY;
    let result;
    for (let i = 0; i < list.length; i += 1) result = await list[i](data, sender);
    return result;
  }

  receive(message, worker) {
    const envelope = message && message[TAG];
    if (!envelope) return;
    const { kind, event, id } = envelope;
    let { data } = envelope;
    if (envelope.marshalled) {
      // Written by a bus with useMarshal(): read it so (with this registry, or the default one of @xufa/marshal).
      if (!this.marshaller) this.useMarshal();
      data = this.marshaller.read(data);
    }
    switch (kind) {
      case 'event':
        this.dispatch(event, data, worker).catch((err) => process.emitWarning(err));
        return;
      case 'request':
        this.dispatch(event, data, worker).then(
          (result) => this.post(worker, { kind: 'reply', id, data: result }),
          (err) => this.post(worker, { kind: 'reply', id, error: err })
        );
        return;
      case 'reply': {
        const request = this.pending.get(id);
        if (!request) return;
        this.pending.delete(id);
        clearTimeout(request.timer);
        if (envelope.error) {
          request.reject(envelope.marshalled ? this.marshaller.read(envelope.error) : errorOf(envelope.error));
        } else request.resolve(data);
        return;
      }
      case 'broadcast':
        // A worker broadcasting: the primary sends it to every worker (but the sender when `others`).
        this.broadcast(event, data, { except: envelope.others ? worker.id : undefined });
        return;
      default:
    }
  }

  // Sends to the primary (from a worker), or to a worker (from the primary).
  post(worker, given) {
    let envelope = given;
    if (this.marshaller) {
      envelope = { ...given, data: this.marshaller.write(given.data), marshalled: true };
      if (given.error) envelope.error = this.marshaller.write(given.error);
    } else if (given.error) {
      const { message, name, code } = given.error;
      envelope = { ...given, error: { message, name, code } };
    }
    const message = { [TAG]: envelope };
    if (worker) {
      if (worker.isConnected()) worker.send(message);
    } else if (process.send && process.connected) process.send(message);
  }

  // An event to the primary (in a worker).
  send(event, data) {
    if (this.local || cluster.isPrimary) {
      this.dispatch(event, data, null).catch((err) => process.emitWarning(err));
      return;
    }
    this.post(null, { kind: 'event', event, data });
  }

  // An event to one worker (in the primary).
  sendTo(workerId, event, data) {
    if (this.local) {
      this.dispatch(event, data, null).catch((err) => process.emitWarning(err));
      return;
    }
    const worker = cluster.workers && cluster.workers[workerId];
    if (!worker) throw new BusError(`There is no worker ${workerId}`);
    this.post(worker, { kind: 'event', event, data });
  }

  // An event to every worker: from the primary, or from a worker (through the primary; `others` leaves it out).
  broadcast(event, data, { except, others = false } = {}) {
    if (this.local) {
      if (!others) this.dispatch(event, data, null).catch((err) => process.emitWarning(err));
      return;
    }
    if (!cluster.isPrimary) {
      this.post(null, { kind: 'broadcast', event, data, others });
      return;
    }
    Object.values(cluster.workers || {}).forEach((worker) => {
      if (worker && worker.id !== except) this.post(worker, { kind: 'event', event, data });
    });
  }

  // A request to the primary (in a worker): the promise of the reply of its handler.
  request(event, data, { timeout = 30000 } = {}) {
    if (this.local || cluster.isPrimary) return this.dispatch(event, data, null);
    return new Promise((resolve, reject) => {
      const id = this.nextId;
      this.nextId += 1;
      const timer = timeout
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new BusError(`The request ${event} had no reply in ${timeout} ms`));
          }, timeout)
        : null;
      this.pending.set(id, { resolve, reject, timer });
      this.post(null, { kind: 'request', event, data, id });
    });
  }
}

module.exports = { Bus, BusError };
