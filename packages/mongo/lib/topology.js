// The servers of a deployment and how commands find theirs. A Topology knows the members of a replica set (from the
// seeds and the hello of each), checks them every heartbeatFrequencyMS (and at once when one fails), and selects a
// server for each command: the primary for writes, and by the read preference for reads. Each Server has a pool of
// connections. A command that fails because its server went away (network errors, "not primary") marks the server
// unknown, so the next selection waits for the new primary; MongoClient retries such commands once (retryable writes
// and reads).
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { Connection } from './connection.js';
import { authenticate } from './scram.js';
import { MongoError, MongoNetworkError, MongoServerError } from './errors.js';

import __package_json1 from '../package.json' with { type: 'json' };
const VERSION = __package_json1.version;

// Errors of a server that is no longer the primary (or is shutting down).
const NOT_PRIMARY = new Set([10107, 13435, 13436, 189, 91, 11600, 11602]);
// Errors after which a command can be sent again (the retryable errors of the specifications of the drivers).
const RETRYABLE = new Set([...NOT_PRIMARY, 6, 7, 89, 9001, 262, 63, 150, 134]);

function isNetworkError(err) {
  return err instanceof MongoNetworkError;
}

function isStateChange(err) {
  return isNetworkError(err) || (err instanceof MongoServerError && NOT_PRIMARY.has(err.code));
}

function isRetryable(err) {
  if (isNetworkError(err)) return true;
  if (!(err instanceof MongoServerError)) return false;
  return RETRYABLE.has(err.code) || err.hasErrorLabel('RetryableWriteError');
}

function parseAddress(address) {
  const index = address.lastIndexOf(':');
  return { host: address.slice(0, index).replace(/^\[|\]$/g, ''), port: Number(address.slice(index + 1)) };
}

// Waits keep the process alive (a command waits for a server); only the heartbeat of the monitors is unref'd.
const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

class Server {
  constructor(topology, address) {
    this.topology = topology;
    this.address = address;
    const { host, port } = parseAddress(address);
    this.host = host;
    this.port = port;
    // Unknown, Standalone, Mongos, RSPrimary, RSSecondary, RSArbiter, RSOther.
    this.type = 'Unknown';
    this.hello = null;
    this.roundTrip = null;
    this.error = null;
    this.connections = [];
    this.openings = new Set();
    this.monitor = null;
    this.checking = null;
  }

  get maxPoolSize() {
    return this.topology.maxPoolSize;
  }

  get isWritable() {
    return this.type === 'RSPrimary' || this.type === 'Standalone' || this.type === 'Mongos';
  }

  get isReadable() {
    return this.isWritable || this.type === 'RSSecondary';
  }

  // A new connection: hello (with the compressors to agree on) and authentication.
  async open() {
    const { options } = this.topology;
    const connection = new Connection({
      host: this.host,
      port: this.port,
      tls: options.tls,
      tlsOptions: options.tlsOptions,
      connectTimeoutMS: options.connectTimeoutMS,
      zlibCompressionLevel: options.zlibCompressionLevel,
    });
    await connection.connect();
    try {
      const hello = await connection.command({
        hello: 1,
        client: {
          driver: { name: 'xufa-mongo', version: VERSION },
          os: { type: os.type(), name: process.platform, architecture: process.arch },
          platform: `Node.js ${process.version}`,
          ...(options.appName ? { application: { name: options.appName } } : {}),
        },
        ...(options.compressors.length ? { compression: options.compressors } : {}),
        $db: 'admin',
      });
      connection.hello = hello;
      if (hello.compression && hello.compression.length) connection.compressor = hello.compression[0];
      if (options.username) {
        await authenticate(connection, {
          username: options.username,
          password: options.password,
          source: options.authSource,
          mechanism: options.authMechanism,
        });
      }
    } catch (err) {
      connection.destroy();
      throw err;
    }
    return connection;
  }

  // A connection of the pool with nothing to wait for (or the least busy when the pool is full), without opening one.
  idleConnection() {
    const { connections } = this;
    let best = null;
    for (let i = 0; i < connections.length; i += 1) {
      const connection = connections[i];
      if (!connection.closed) {
        if (connection.busy === 0) return connection;
        if (best === null || connection.busy < best.busy) best = connection;
      }
    }
    return connections.length >= this.maxPoolSize ? best : null;
  }

  // The least busy connection, opening new ones up to maxPoolSize.
  async connection() {
    this.connections = this.connections.filter((item) => !item.closed);
    let best = null;
    for (let i = 0; i < this.connections.length; i += 1) {
      if (!best || this.connections[i].busy < best.busy) best = this.connections[i];
    }
    if ((!best || best.busy > 0) && this.connections.length + this.openings.size < this.maxPoolSize) {
      const opening = this.open();
      this.openings.add(opening);
      try {
        const connection = await opening;
        this.connections.push(connection);
        return connection;
      } finally {
        this.openings.delete(opening);
      }
    }
    if (best) return best;
    // Every connection of the pool is being opened: the first opened is used.
    await Promise.race(this.openings).catch(() => {});
    return this.connection();
  }

  // Checks the server (hello on a connection of its own) and updates what is known of it.
  check() {
    if (!this.checking) {
      this.checking = (async () => {
        const start = performance.now();
        try {
          if (!this.monitor || this.monitor.closed) this.monitor = await this.open();
          const hello = await this.monitor.command({ hello: 1, $db: 'admin' });
          const time = performance.now() - start;
          this.roundTrip = this.roundTrip === null ? time : 0.2 * time + 0.8 * this.roundTrip;
          this.describe(hello);
        } catch (err) {
          this.markUnknown(err);
        } finally {
          this.checking = null;
        }
      })();
    }
    return this.checking;
  }

  describe(hello) {
    this.hello = hello;
    this.error = null;
    if (hello.msg === 'isdbgrid') this.type = 'Mongos';
    else if (!hello.setName) this.type = hello.isreplicaset ? 'RSOther' : 'Standalone';
    else if (hello.isWritablePrimary) this.type = 'RSPrimary';
    else if (hello.secondary) this.type = 'RSSecondary';
    else if (hello.arbiterOnly) this.type = 'RSArbiter';
    else this.type = 'RSOther';
    this.topology.onDescription(this);
  }

  // The server failed (or stepped down): its connections are closed, and the topology checks the servers again.
  markUnknown(err) {
    const wasKnown = this.type !== 'Unknown';
    this.type = 'Unknown';
    this.error = err;
    this.roundTrip = null;
    const { connections } = this;
    this.connections = [];
    connections.forEach((connection) => connection.destroy(err instanceof MongoNetworkError ? err : undefined));
    if (this.monitor && isNetworkError(err)) {
      this.monitor.destroy();
      this.monitor = null;
    }
    if (wasKnown) this.topology.requestCheck();
  }

  close() {
    this.connections.forEach((connection) => connection.destroy());
    this.connections = [];
    if (this.monitor) this.monitor.destroy();
    this.monitor = null;
  }
}

class Topology extends EventEmitter {
  constructor(seeds, options) {
    super();
    this.options = options;
    this.maxPoolSize = options.maxPoolSize;
    this.servers = new Map();
    this.setName = options.replicaSet || null;
    this.direct = options.directConnection;
    this.timer = null;
    this.checkRequested = null;
    this.closed = false;
    seeds.forEach(({ host, port }) => this.addServer(`${host}:${port}`));
  }

  addServer(address) {
    if (!this.servers.has(address)) this.servers.set(address, new Server(this, address));
    return this.servers.get(address);
  }

  // Single (one server, or directConnection), ReplicaSet or Sharded.
  get type() {
    const servers = [...this.servers.values()];
    if (servers.some((server) => server.type === 'Mongos')) return 'Sharded';
    if (servers.some((server) => server.type.startsWith('RS')) && !this.direct) return 'ReplicaSet';
    return 'Single';
  }

  get primary() {
    for (const server of this.servers.values()) if (server.type === 'RSPrimary') return server;
    return null;
  }

  // What a server tells of the others: the members of its replica set are added, and a new primary makes the old one
  // unknown.
  onDescription(server) {
    const { hello } = server;
    if (hello.setName && !this.direct) {
      if (this.setName === null) this.setName = hello.setName;
      if (hello.setName !== this.setName) {
        server.markUnknown(new MongoError(`${server.address} is of the replica set ${hello.setName}`));
        return;
      }
      [...(hello.hosts || []), ...(hello.passives || [])].forEach((address) => {
        if (!this.servers.has(address)) this.addServer(address).check();
      });
      if (server.type === 'RSPrimary') {
        this.servers.forEach((other) => {
          if (other !== server && other.type === 'RSPrimary')
            other.markUnknown(new MongoError('A new primary was elected'));
        });
        // Members the primary does not list are not of the set.
        const members = new Set([...(hello.hosts || []), ...(hello.passives || []), ...(hello.arbiters || [])]);
        this.servers.forEach((other, address) => {
          if (!members.has(address) && other !== server) {
            other.close();
            this.servers.delete(address);
          }
        });
      }
    }
    this.emit('description', server);
  }

  async checkAll() {
    await Promise.all([...this.servers.values()].map((server) => server.check()));
  }

  // Checks every server soon (at most every 500 ms): after a failure, the new state is learnt fast.
  requestCheck() {
    if (this.closed || this.checkRequested) return;
    this.checkRequested = delay(this.lastCheck && performance.now() - this.lastCheck < 500 ? 500 : 0).then(async () => {
      this.lastCheck = performance.now();
      try {
        await this.checkAll();
      } finally {
        this.checkRequested = null;
      }
    });
  }

  async connect() {
    this.lastCheck = performance.now();
    await this.checkAll();
    const { heartbeatFrequencyMS } = this.options;
    this.timer = setInterval(() => {
      if (!this.checkRequested) this.checkAll().catch(() => {});
    }, heartbeatFrequencyMS);
    this.timer.unref();
    // Connecting is having a server to send writes to.
    await this.select('primary');
  }

  // The servers a read preference can read from.
  candidates(mode) {
    const servers = [...this.servers.values()];
    const type = this.type;
    if (type === 'Single')
      return servers.filter((server) => server.isReadable || server.type === 'RSOther').slice(0, 1);
    if (type === 'Sharded') return servers.filter((server) => server.type === 'Mongos');
    const primary = servers.filter((server) => server.type === 'RSPrimary');
    const secondaries = servers.filter((server) => server.type === 'RSSecondary');
    switch (mode) {
      case 'primary':
        return primary;
      case 'primaryPreferred':
        return primary.length ? primary : secondaries;
      case 'secondary':
        return secondaries;
      case 'secondaryPreferred':
        return secondaries.length ? secondaries : primary;
      case 'nearest':
        return [...primary, ...secondaries];
      default:
        throw new MongoError(`Unknown read preference ${mode}`);
    }
  }

  // Of the candidates, one of those within localThresholdMS of the fastest (at random).
  pick(servers) {
    if (servers.length <= 1) return servers[0] || null;
    const fastest = Math.min(...servers.map((server) => server.roundTrip ?? Infinity));
    const near = servers.filter((server) => (server.roundTrip ?? Infinity) <= fastest + this.options.localThresholdMS);
    return near[Math.floor(Math.random() * near.length)];
  }

  // The server of the cases where it is known (no wait): the path of most commands.
  selectNow(mode) {
    return this.pick(this.candidates(mode));
  }

  // A server for a read preference, waiting (checking the servers) up to serverSelectionTimeoutMS.
  async select(mode = 'primary') {
    const deadline = performance.now() + this.options.serverSelectionTimeoutMS;
    for (;;) {
      if (this.closed) throw new MongoError('The client is closed');
      const server = this.selectNow(mode);
      if (server) return server;
      if (performance.now() > deadline) {
        const errors = [...this.servers.values()].map(
          (item) => `${item.address}: ${item.error ? item.error.message : item.type}`
        );
        throw new MongoError(
          `No server for the read preference ${mode} in ${this.options.serverSelectionTimeoutMS} ms (${errors.join('; ')})`
        );
      }
      this.requestCheck();
      await Promise.race([new Promise((resolve) => this.once('description', resolve)), delay(250)]);
    }
  }

  close() {
    this.closed = true;
    clearInterval(this.timer);
    this.servers.forEach((server) => server.close());
  }
}

export { Topology, Server, isRetryable, isStateChange, isNetworkError, NOT_PRIMARY };
