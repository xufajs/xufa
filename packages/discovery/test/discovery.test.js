// Nodes of this machine only: unicast to 127.0.0.1, and multicast on the loopback interface with a TTL of 0 (on a
// group and port of their own), so no packet of the tests leaves the machine.
const dgram = require('node:dgram');
const { Discovery, DiscoveryError, MAX_PACKET } = require('..');
const { createCodec } = require('../lib/codec');

const nodes = [];
const node = (options) => {
  const discovery = new Discovery({ interval: 50, ...options });
  nodes.push(discovery);
  return discovery;
};
const sockets = [];
afterEach(async () => {
  await Promise.all(nodes.splice(0).map((discovery) => discovery.stop()));
  for (const socket of sockets.splice(0)) socket.close();
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const local = (options = {}) => ({ transport: 'unicast', port: 0, address: '127.0.0.1', ...options });

// Unicast nodes on ports of their own; each one knows the first (a seed).
async function unicastNodes(count, options = {}) {
  const first = await node(local(options)).start();
  const rest = [];
  for (let i = 1; i < count; i += 1) {
    rest.push(await node(local({ seeds: [`127.0.0.1:${first.port}`], ...options })).start());
  }
  return [first, ...rest];
}
const allSee = (list, count) =>
  Promise.all(list.map((d) => d.waitFor((peers) => peers.length === count, { timeout: 3000 })));

// A socket that sends packets by hand (as a node that dies, or an attacker).
async function rawSocket() {
  const socket = dgram.createSocket('udp4');
  sockets.push(socket);
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return (packet, port) => new Promise((resolve) => socket.send(packet, port, '127.0.0.1', resolve));
}

describe('unicast', () => {
  it('nodes find each other through one seed, with their meta', async () => {
    const [a, b, c] = await unicastNodes(3, { meta: { role: 'api' } });
    await allSee([a, b, c], 2);
    // b and c only know a, and found each other through it.
    expect(b.peers.map((peer) => peer.id).sort()).toEqual([a.id, c.id].sort());
    expect(c.get(b.id)).toMatchObject({
      id: b.id,
      service: 'xufa',
      address: '127.0.0.1',
      port: b.port,
      meta: { role: 'api' },
    });
  });

  it('a node that starts is seen at once (its hello is answered), not after an interval', async () => {
    const [a] = await unicastNodes(1, { interval: 5000 });
    const b = await node(local({ interval: 5000, seeds: [`127.0.0.1:${a.port}`] })).start();
    const started = Date.now();
    await allSee([a, b], 1);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('up, update, and down by goodbye', async () => {
    const [a, b] = await unicastNodes(2);
    await allSee([a, b], 1);
    const updated = new Promise((resolve) => a.once('update', (peer, previous) => resolve([peer, previous])));
    b.setMeta({ state: 'busy' });
    const [peer, previous] = await updated;
    expect(peer).toMatchObject({ id: b.id, meta: { state: 'busy' } });
    expect(previous).toEqual({});

    const down = new Promise((resolve) => a.once('down', (gone, reason) => resolve([gone.id, reason])));
    await b.stop();
    expect(await down).toEqual([b.id, 'bye']);
    expect(a.peers).toEqual([]);
  });

  it('down by timeout: a node that is not heard any more', async () => {
    const [a] = await unicastNodes(1, { interval: 50, timeout: 200 });
    const send = await rawSocket();
    const codec = createCodec({ service: 'xufa' });
    const ups = [];
    a.on('up', (peer) => ups.push(peer.id));
    const down = new Promise((resolve) => a.once('down', (gone, reason) => resolve([gone.id, reason, Date.now()])));
    const sent = Date.now();
    await send(codec.encode({ t: 'here', id: 'dead', s: 'xufa', n: 1, at: sent, m: {} }), a.port);
    const [id, reason, at] = await down;
    expect([id, reason]).toEqual(['dead', 'timeout']);
    expect(ups).toEqual(['dead']);
    expect(at - sent).toBeGreaterThanOrEqual(200);
  });

  it('messages to all, and to one', async () => {
    const [a, b, c] = await unicastNodes(3);
    await allSee([a, b, c], 2);
    const got = [];
    for (const d of [b, c]) d.on('message', (event, data, from) => got.push([d.id, event, data, from.id]));
    await a.send('hi', { n: 1 });
    await a.send('only', [2], { to: c.id });
    await sleep(100);
    expect(got).toContainEqual([b.id, 'hi', { n: 1 }, a.id]);
    expect(got).toContainEqual([c.id, 'hi', { n: 1 }, a.id]);
    expect(got).toContainEqual([c.id, 'only', [2], a.id]);
    expect(got.filter(([id, event]) => id === b.id && event === 'only')).toEqual([]);
    expect(() => a.send('x', 1, { to: 'nobody' })).toThrow(DiscoveryError);
    expect(() => a.send('x', 'y'.repeat(MAX_PACKET))).toThrow(expect.objectContaining({ code: 'XUFA_DISCOVERY_ERR_SIZE' }));
  });

  it('nodes of another service on the same seeds are not peers', async () => {
    const [a, b] = await unicastNodes(2, { service: 'one' });
    const other = await node(local({ service: 'two', seeds: [`127.0.0.1:${a.port}`] })).start();
    await allSee([a, b], 1);
    await sleep(200);
    expect(a.peers.map((peer) => peer.id)).toEqual([b.id]);
    expect(other.peers).toEqual([]);
  });
});

describe('secret', () => {
  const secret = 'a secret of sixteen bytes or more';

  it('nodes with the secret see each other; without it, or with another, they are not seen', async () => {
    const [a, b] = await unicastNodes(2, { secret });
    const plain = await node(local({ seeds: [`127.0.0.1:${a.port}`] })).start();
    const other = await node(local({ secret: `${secret}!`, seeds: [`127.0.0.1:${a.port}`] })).start();
    await allSee([a, b], 1);
    await sleep(200);
    expect(a.peers.map((peer) => peer.id)).toEqual([b.id]);
    expect(plain.peers).toEqual([]);
    expect(other.peers).toEqual([]);
    expect(a.stats.dropped).toBeGreaterThan(0);
  });

  it('a packet sent again, changed, or too old is refused', async () => {
    const [a] = await unicastNodes(1, { secret, interval: 5000 });
    const codec = createCodec({ secret, service: 'xufa' });
    const send = await rawSocket();
    const message = { t: 'here', id: 'x', s: 'xufa', n: 5, at: Date.now(), m: {} };
    const packet = codec.encode(message);
    await send(packet, a.port);
    await a.waitFor((peers) => peers.length === 1, { timeout: 2000 });
    const dropped = a.stats.dropped;
    await send(packet, a.port); // the same packet again
    const changed = Buffer.from(packet);
    changed[changed.length - 20] ^= 1;
    await send(changed, a.port);
    await send(codec.encode({ ...message, n: 6, at: Date.now() - 60000 }), a.port); // older than maxSkew
    await sleep(100);
    expect(a.stats.dropped - dropped).toBe(3);
  });
});

describe('multicast', () => {
  it('nodes of one machine find each other on the loopback interface', async () => {
    const options = { port: 29071, group: '239.255.29.71', interface: '127.0.0.1', ttl: 0 };
    const a = await node(options).start();
    const b = await node(options).start();
    const c = await node(options).start();
    await allSee([a, b, c], 2);
    const got = [];
    c.on('message', (event, data, from) => got.push([event, from.id]));
    b.on('message', (event) => got.push(['b got', event]));
    await a.send('to c', null, { to: c.id });
    await sleep(100);
    expect(got).toEqual([['to c', a.id]]);
  });
});

describe('options and packets', () => {
  it('refuses options that cannot work', () => {
    expect(() => new Discovery({ transport: 'tcp' })).toThrow(/transport must be one of/);
    expect(() => new Discovery({ interval: 1000, timeout: 1000 })).toThrow(/timeout must be longer/);
    expect(() => new Discovery({ secret: 'short' })).toThrow(/16 bytes or more/);
    expect(() => new Discovery({ seeds: ['nohost'] })).toThrow(/host:port/);
    expect(() => new Discovery({ meta: [] })).toThrow(/meta must be an object/);
    expect(() => new Discovery({ meta: { big: 'x'.repeat(MAX_PACKET) } })).toThrow(
      expect.objectContaining({ code: 'XUFA_DISCOVERY_ERR_SIZE' })
    );
    expect(() => new Discovery().send('x')).toThrow(expect.objectContaining({ code: 'XUFA_DISCOVERY_ERR_STOPPED' }));
  });

  it('packets: plain and sealed, and what is not one of them', () => {
    const plain = createCodec({ service: 's' });
    const sealed = createCodec({ secret: 'sixteen bytes at least', service: 's' });
    const other = createCodec({ secret: 'sixteen bytes at least', service: 't' });
    const message = { t: 'here', id: 'a', s: 's', n: 1, at: 1 };
    expect(plain.decode(plain.encode(message))).toEqual(message);
    expect(sealed.decode(sealed.encode(message))).toEqual(message);
    expect(plain.encode(message).includes('"id":"a"')).toBe(true);
    expect(sealed.encode(message).includes('"id":"a"')).toBe(false);
    // The key depends on the service too; plain and sealed do not mix; other packets are nothing.
    expect(other.decode(sealed.encode(message))).toBe(null);
    expect(sealed.decode(plain.encode(message))).toBe(null);
    expect(plain.decode(sealed.encode(message))).toBe(null);
    for (const junk of ['', 'XD', 'hello', 'XD\u0001\u0000[1]', 'XD\u0001\u0000null', 'XD\u0002\u0000{}']) {
      expect(plain.decode(Buffer.from(junk))).toBe(null);
    }
  });
});
