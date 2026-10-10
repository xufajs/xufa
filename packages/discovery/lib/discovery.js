// A node of a service that finds the other nodes of that service by UDP: each one says it is there every `interval`
// milliseconds (with its meta: its URL, its role...), and the others hold it as a peer until it says goodbye or is
// not heard for `timeout` milliseconds. A node that starts says hello, and the others answer at once.
//
// Three transports: multicast (a group of the LAN, the default), broadcast (the LAN, where multicast is filtered) and
// unicast (seeds: addresses to say it to, for networks with neither, as the ones of most clouds; the nodes tell each
// other the addresses they know, so one seed is enough). With a secret, packets are sealed (lib/codec.js): only the
// nodes that know it join, and packets older than `maxSkew` or seen already are refused.
import crypto from 'node:crypto';
import dgram from 'node:dgram';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { createCodec, MAX_PACKET } from './codec.js';

const DEFAULTS = {
  service: 'xufa',
  transport: 'multicast',
  port: 29050,
  address: '0.0.0.0',
  group: '239.255.29.5',
  broadcastAddress: '255.255.255.255',
  ttl: 1,
  interval: 1000,
  maxSkew: 30000,
};
const TRANSPORTS = ['multicast', 'broadcast', 'unicast'];
// The addresses of other peers a node passes on (unicast), at most.
const GOSSIP = 32;

class DiscoveryError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'DiscoveryError';
    this.code = code;
  }
}

const fail = (message, code = 'XUFA_DISCOVERY_ERR_OPTIONS') => {
  throw new DiscoveryError(message, code);
};

// 'host:port' (or [host, port]) as { host, port }.
function addressOf(seed) {
  if (Array.isArray(seed)) return { host: String(seed[0]), port: Number(seed[1]) };
  const match = /^\[?([^\]]+?)\]?:(\d+)$/.exec(String(seed));
  if (!match) fail(`A seed must be "host:port": ${seed}`);
  return { host: match[1], port: Number(match[2]) };
}

function optionsOf(given) {
  const options = { ...DEFAULTS, ...given };
  if (typeof options.service !== 'string' || !options.service) fail('service must be a non-empty string');
  if (!TRANSPORTS.includes(options.transport)) fail(`transport must be one of ${TRANSPORTS.join(', ')}`);
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) fail('port must be 0 to 65535');
  if (!Number.isFinite(options.interval) || options.interval < 10) fail('interval must be 10 ms or more');
  if (options.timeout === undefined) options.timeout = options.interval * 3 + 500;
  if (!Number.isFinite(options.timeout) || options.timeout <= options.interval) {
    fail('timeout must be longer than interval');
  }
  if (options.secret !== undefined) {
    const length = Buffer.byteLength(options.secret);
    if (!(typeof options.secret === 'string' || Buffer.isBuffer(options.secret)) || length < 16) {
      fail('secret must be a string or Buffer of 16 bytes or more');
    }
  }
  options.seeds = (options.seeds || []).map(addressOf);
  return options;
}

const copyOf = (peer) => ({ ...peer, meta: peer.meta });

class Discovery extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = optionsOf(options);
    this.id = options.id === undefined ? crypto.randomUUID() : String(options.id);
    this.service = this.options.service;
    this.codec = createCodec({ secret: this.options.secret, service: this.service });
    this.meta = this.#checkedMeta(options.meta === undefined ? {} : options.meta);
    this.stats = { sent: 0, received: 0, dropped: 0, sendErrors: 0 };
    this.started = false;
    this.#peers = new Map();
    this.#seqs = new Map();
    this.#learned = new Map();
  }

  #peers;
  #seqs; // id => [last seq, when]: replays are refused, also of nodes gone
  #learned; // 'host:port' => { host, port, at }: addresses passed on by others (unicast)
  #seq = 0;
  #socket = null;
  #timer = null;
  #answerTimer = null;

  // The peers now, as copies.
  get peers() {
    return [...this.#peers.values()].map(copyOf);
  }

  get(id) {
    const peer = this.#peers.get(id);
    return peer ? copyOf(peer) : undefined;
  }

  // The socket bound: the port it got (with port 0) is `discovery.port`.
  get port() {
    return this.#socket ? this.#socket.address().port : this.options.port;
  }

  async start() {
    if (this.started) return this;
    const { transport, port, address } = this.options;
    const shared = transport !== 'unicast';
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: shared });
    socket.on('message', (packet, rinfo) => this.#receive(packet, rinfo));
    socket.on('error', (err) => this.#error(err));
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind({ port, address, exclusive: !shared }, () => {
        socket.off('error', reject);
        resolve();
      });
    });
    if (transport === 'multicast') this.#joinGroup(socket);
    if (transport === 'broadcast') socket.setBroadcast(true);
    this.#socket = socket;
    this.started = true;
    this.#send({ t: 'hello', m: this.meta });
    this.#schedule();
    return this;
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    clearTimeout(this.#timer);
    clearTimeout(this.#answerTimer);
    const socket = this.#socket;
    await this.#send({ t: 'bye' });
    this.#socket = null;
    await new Promise((resolve) => socket.close(resolve));
    this.#peers.clear();
  }

  // Changes the meta of this node, and tells the others now.
  setMeta(meta) {
    this.meta = this.#checkedMeta(meta);
    if (this.started) this.#send({ t: 'here', m: this.meta });
  }

  // A message to every peer, or to one (`to`: its id): 'message' (event, data, peer) where it arrives. Datagrams can
  // be lost: what must arrive needs answers and retries, or another channel.
  send(event, data, { to } = {}) {
    if (!this.started) throw new DiscoveryError('The discovery is not started', 'XUFA_DISCOVERY_ERR_STOPPED');
    if (typeof event !== 'string') fail('event must be a string');
    const message = { t: 'msg', e: event, d: data };
    if (to === undefined) return this.#send(message);
    const peer = this.#peers.get(to);
    if (!peer) throw new DiscoveryError(`No peer ${to}`, 'XUFA_DISCOVERY_ERR_PEER');
    message.to = to;
    // On a shared port (multicast, broadcast) a datagram to one address reaches one of the sockets of that machine:
    // the message goes to all, and the one it is for takes it.
    return this.options.transport === 'unicast' ? this.#send(message, [peer]) : this.#send(message);
  }

  // The peers once `predicate(peers)` holds: at once, or when they change; rejects after `timeout` ms.
  waitFor(predicate, { timeout = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      const check = () => {
        const peers = this.peers;
        if (!predicate(peers)) return;
        done();
        resolve(peers);
      };
      const timer = setTimeout(() => {
        done();
        reject(new DiscoveryError(`The peers were not there in ${timeout} ms`, 'XUFA_DISCOVERY_ERR_TIMEOUT'));
      }, timeout);
      const done = () => {
        clearTimeout(timer);
        for (const event of ['up', 'down', 'update']) this.off(event, check);
      };
      for (const event of ['up', 'down', 'update']) this.on(event, check);
      check();
    });
  }

  #checkedMeta(meta) {
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) fail('meta must be an object');
    const size = this.codec.encode(this.#message({ t: 'here', m: meta })).length;
    if (size > MAX_PACKET) {
      throw new DiscoveryError(`meta makes packets of ${size} bytes: ${MAX_PACKET} at most`, 'XUFA_DISCOVERY_ERR_SIZE');
    }
    return JSON.parse(JSON.stringify(meta));
  }

  #message(fields) {
    return { ...fields, id: this.id, s: this.service, n: this.#seq, at: Date.now() };
  }

  #joinGroup(socket) {
    const { group, ttl } = this.options;
    socket.setMulticastTTL(ttl);
    socket.setMulticastLoopback(true);
    if (this.options.interface) socket.setMulticastInterface(this.options.interface);
    // On every IPv4 interface (loopback too, for nodes of one machine): the group is joined on each network.
    let joined = 0;
    for (const addresses of Object.values(os.networkInterfaces())) {
      for (const { family, address } of addresses || []) {
        if (family !== 'IPv4' && family !== 4) continue;
        try {
          socket.addMembership(group, address);
          joined += 1;
        } catch {
          // an interface that cannot join (down, or no multicast)
        }
      }
    }
    if (joined === 0) socket.addMembership(group);
  }

  // Where a message goes: the group, the broadcast address, or (unicast) the seeds and every address known.
  #targets() {
    const { transport, port, group, broadcastAddress, seeds } = this.options;
    if (transport === 'multicast') return [{ host: group, port }, ...seeds];
    if (transport === 'broadcast') return [{ host: broadcastAddress, port }, ...seeds];
    const targets = new Map();
    for (const seed of seeds) targets.set(`${seed.host}:${seed.port}`, seed);
    for (const [key, address] of this.#learned) targets.set(key, address);
    for (const peer of this.#peers.values())
      targets.set(`${peer.address}:${peer.port}`, { host: peer.address, port: peer.port });
    return [...targets.values()];
  }

  // Sends a message to the targets (or the peers given); resolves once handed to the network.
  #send(fields, peers) {
    this.#seq += 1;
    const message = this.#message(fields);
    if (this.options.transport === 'unicast' && (fields.t === 'here' || fields.t === 'hello')) {
      message.p = this.#gossip(message);
    }
    const packet = this.codec.encode(message);
    if (packet.length > MAX_PACKET) {
      throw new DiscoveryError(`A packet of ${packet.length} bytes: ${MAX_PACKET} at most`, 'XUFA_DISCOVERY_ERR_SIZE');
    }
    const targets = peers ? peers.map((peer) => ({ host: peer.address, port: peer.port })) : this.#targets();
    const socket = this.#socket;
    return Promise.all(
      targets.map(
        ({ host, port }) =>
          new Promise((resolve) => {
            socket.send(packet, port, host, (err) => {
              if (err) {
                this.stats.sendErrors += 1;
                this.#error(err);
              } else {
                this.stats.sent += 1;
              }
              resolve();
            });
          })
      )
    ).then(() => undefined);
  }

  // The addresses of the peers known, as many as fit in the packet.
  #gossip(message) {
    const list = [];
    for (const peer of this.#peers.values()) {
      if (list.length >= GOSSIP) break;
      list.push([peer.address, peer.port]);
    }
    while (list.length > 0 && this.codec.encode({ ...message, p: list }).length > MAX_PACKET) list.pop();
    return list;
  }

  #schedule() {
    // ±10%: nodes started together do not keep sending at the same moment.
    const delay = this.options.interval * (0.9 + Math.random() * 0.2);
    this.#timer = setTimeout(() => {
      if (!this.started) return;
      this.#expire();
      this.#send({ t: 'here', m: this.meta });
      this.#schedule();
    }, delay);
  }

  // A hello is answered at once, but once for those that come together (and for forged ones, at most every 200 ms).
  #answerSoon() {
    if (this.#answerTimer) return;
    this.#answerTimer = setTimeout(() => {
      this.#answerTimer = null;
      if (this.started) this.#send({ t: 'here', m: this.meta });
    }, 20);
  }

  #expire() {
    const now = Date.now();
    for (const peer of [...this.#peers.values()]) {
      if (now - peer.lastSeen > this.options.timeout) this.#remove(peer, 'timeout');
    }
    const forget = now - this.options.maxSkew * 2;
    for (const [id, [, at]] of this.#seqs) if (at < forget && !this.#peers.has(id)) this.#seqs.delete(id);
    for (const [key, { at }] of this.#learned) if (now - at > this.options.timeout) this.#learned.delete(key);
  }

  #remove(peer, reason) {
    this.#peers.delete(peer.id);
    this.emit('down', copyOf(peer), reason);
  }

  #receive(packet, rinfo) {
    const message = this.codec.decode(packet);
    if (!message || message.s !== this.service || typeof message.id !== 'string' || message.id === this.id) {
      if (!message || message.id !== this.id) this.stats.dropped += 1;
      return;
    }
    if (!Number.isInteger(message.n) || !Number.isFinite(message.at)) {
      this.stats.dropped += 1;
      return;
    }
    // Sealed: fresh, and not seen already (a packet recorded and sent again is refused).
    const now = Date.now();
    const last = this.#seqs.get(message.id);
    if (this.codec.sealed && (Math.abs(now - message.at) > this.options.maxSkew || (last && message.n <= last[0]))) {
      this.stats.dropped += 1;
      return;
    }
    this.#seqs.set(message.id, [Math.max(message.n, last ? last[0] : 0), now]);
    this.stats.received += 1;
    if (message.t === 'bye') {
      const peer = this.#peers.get(message.id);
      if (peer) this.#remove(peer, 'bye');
      return;
    }
    const peer = this.#seen(message, rinfo, now);
    if (message.t === 'hello') this.#answerSoon();
    if (Array.isArray(message.p) && this.options.transport === 'unicast') this.#learn(message.p, now);
    if (message.t === 'msg' && (message.to === undefined || message.to === this.id) && typeof message.e === 'string') {
      this.emit('message', message.e, message.d, copyOf(peer));
    }
  }

  // The peer of a message: new ('up'), with another meta ('update'), or seen again.
  #seen(message, rinfo, now) {
    let peer = this.#peers.get(message.id);
    const meta = message.m !== null && typeof message.m === 'object' && !Array.isArray(message.m) ? message.m : null;
    if (!peer) {
      peer = {
        id: message.id,
        service: message.s,
        address: rinfo.address,
        port: rinfo.port,
        meta: meta || {},
        since: now,
        lastSeen: now,
      };
      this.#peers.set(peer.id, peer);
      this.emit('up', copyOf(peer));
      return peer;
    }
    peer.lastSeen = now;
    peer.address = rinfo.address;
    peer.port = rinfo.port;
    if (meta && JSON.stringify(meta) !== JSON.stringify(peer.meta)) {
      const previous = peer.meta;
      peer.meta = meta;
      this.emit('update', copyOf(peer), previous);
    }
    return peer;
  }

  #learn(addresses, now) {
    for (const entry of addresses.slice(0, GOSSIP)) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !Number.isInteger(entry[1])) continue;
      const [host, port] = entry;
      if (port <= 0 || port > 65535) continue;
      if (port === this.port && ['127.0.0.1', '0.0.0.0'].includes(host)) continue;
      this.#learned.set(`${host}:${port}`, { host, port, at: now });
    }
  }

  #error(err) {
    if (this.listenerCount('error') > 0) this.emit('error', err);
  }
}

function createDiscovery(options) {
  return new Discovery(options);
}

export { Discovery, DiscoveryError, createDiscovery, MAX_PACKET };
