// Nodes of this machine only: TCP and discovery (unicast) on 127.0.0.1.
const net = require('node:net');
const { isDeepStrictEqual } = require('node:util');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { NetCache, NetCacheError } = require('..');
const { Store } = require('../lib/store');
const { Clock, compare } = require('../lib/clock');
const { Wire, baseKey } = require('../lib/wire');

const SECRET = 'a secret of sixteen bytes or more';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const caches = [];
afterEach(async () => {
  await Promise.all(caches.splice(0).map((cache) => cache.stop()));
});

// A node; `seed`: a node whose discovery it knows.
async function node(seed, options = {}) {
  const cache = new NetCache({
    secret: SECRET,
    host: '127.0.0.1',
    settle: 100,
    ...options,
    discovery: {
      transport: 'unicast',
      port: 0,
      address: '127.0.0.1',
      interval: 50,
      seeds: seed ? [`127.0.0.1:${seed.discovery.port}`] : [],
      ...options.discovery,
    },
  });
  caches.push(cache);
  return cache.start();
}
async function nodes(count, options) {
  const first = await node(null, options);
  const rest = [];
  for (let i = 1; i < count; i += 1) rest.push(await node(first, options));
  return [first, ...rest];
}
// Until every node holds `value` at `key` (undefined: none), or 2 s.
async function settled(list, key, value) {
  const until = Date.now() + 2000;
  for (;;) {
    const values = await Promise.all(list.map((cache) => cache.get(key)));
    if (values.every((got) => isDeepStrictEqual(got, value))) return values;
    if (Date.now() > until) return values;
    await sleep(10);
  }
}
// Once `cache` connects to a peer again.
const reconnection = (cache) =>
  new Promise((resolve) => {
    const listener = (id, state) => {
      if (state !== 'connected') return;
      cache.off('peer', listener);
      resolve();
    };
    cache.on('peer', listener);
  });
const allConnected = async (list) => {
  const until = Date.now() + 3000;
  while (list.some((cache) => cache.connected.length < list.length - 1) && Date.now() < until) await sleep(10);
  return list.map((cache) => cache.connected.length);
};

describe('the store of a node', () => {
  const clock = new Clock('a');
  const v = () => clock.now();

  it('a write applies only when newer: values, deletes and clears keep their versions', () => {
    const store = new Store();
    const [v1, v2, v3, v4] = [v(), v(), v(), v()];
    expect(store.set('k', Buffer.from([0xff, 0x0d, 0x22, 0x01, 0x61]), 0, v2)).toBe(true);
    expect(store.set('k', Buffer.from('older'), 0, v1)).toBe(false);
    expect(store.delete('k', v1)).toBe(false); // a delete older than the value
    expect(store.delete('k', v3)).toBe(true);
    expect(store.set('k', Buffer.from('late'), 0, v2)).toBe(false); // a write older than the delete: not back
    expect(store.size).toBe(0);
    store.set('p:1', Buffer.from('x'), 0, v4);
    store.set('p:2', Buffer.from('x'), 0, v1);
    store.clear('p:', v3);
    expect([...store.snapshot()].map(([key]) => key)).toEqual(['p:1']); // written after the clear: kept
    expect(store.set('p:3', Buffer.from('x'), 0, v2)).toBe(false); // older than the clear
  });

  it('the clock orders writes of other nodes after those seen; ties by node', () => {
    const a = new Clock('a');
    const b = new Clock('b');
    const far = [Date.now() + 60000, 5, 'b'];
    a.see(far);
    expect(compare(a.now(), far)).toBe(1);
    expect(compare([1, 0, 'a'], [1, 0, 'b'])).toBe(-1);
    expect(compare(null, b.now())).toBe(-1);
  });
});

describe('a cache of several machines', () => {
  it('needs a secret, unless insecure', () => {
    expect(() => new NetCache()).toThrow(NetCacheError);
    expect(() => new NetCache({ secret: 'short' })).toThrow(/16 bytes/);
    expect(() => new NetCache({ insecure: true })).not.toThrow();
  });

  it('sets, deletes and clears reach every node; values come back as they were, as copies', async () => {
    const [a, b, c] = await nodes(3);
    expect(await allConnected([a, b, c])).toEqual([2, 2, 2]);
    const value = { when: new Date(0), n: 10n, buf: Buffer.from('hi'), tags: new Set(['x']), map: new Map([[1, 2]]) };
    await a.set('book:1', value);
    expect(await settled([a, b, c], 'book:1', value)).toEqual([value, value, value]);
    const copy = await b.get('book:1');
    copy.tags.add('y');
    expect((await b.get('book:1')).tags).toEqual(new Set(['x']));

    await c.delete('book:1');
    expect(await settled([a, b, c], 'book:1', undefined)).toEqual([undefined, undefined, undefined]);

    await a.set('book:2', 2);
    await a.set('author:1', 1);
    await settled([a, b, c], 'author:1', 1);
    await b.clear('book:');
    expect(await settled([a, b, c], 'book:2', undefined)).toEqual([undefined, undefined, undefined]);
    expect(await settled([a, b, c], 'author:1', 1)).toEqual([1, 1, 1]);
  });

  it('a value expires on every node at the same time (ttl)', async () => {
    const [a, b] = await nodes(2);
    await a.set('session', 's', 150);
    expect(await settled([a, b], 'session', 's')).toEqual(['s', 's']);
    await sleep(200);
    expect([await a.get('session'), await b.get('session')]).toEqual([undefined, undefined]);
  });

  it('writes of one key at once on several nodes end the same on all', async () => {
    const [a, b, c] = await nodes(3);
    await allConnected([a, b, c]);
    for (let round = 0; round < 20; round += 1) {
      await Promise.all([a.set('x', `a${round}`), b.set('x', `b${round}`), c.set('x', `c${round}`)]);
    }
    await sleep(200);
    const values = await Promise.all([a, b, c].map((cache) => cache.get('x')));
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toMatch(/^[abc]19$/);
  });

  it('a connection that breaks: the writes it missed are sent again', async () => {
    const [a, b] = await nodes(2);
    await allConnected([a, b]);
    const [low, high] = a.id < b.id ? [a, b] : [b, a];
    await high.set('before', 1);
    await settled([low], 'before', 1);
    // The connection breaks; writes made meanwhile wait in the log.
    const reconnected = reconnection(low);
    [...low.peers.values()][0].wire.socket.destroy();
    await high.set('during', 2);
    await high.delete('before');
    await reconnected;
    expect(await settled([low], 'during', 2)).toEqual([2]);
    expect(await low.get('before')).toBeUndefined();
    expect(high.stats.resent + high.stats.sent).toBeGreaterThan(0);
    expect(low.stats.resets).toBe(0);
  });

  it('when the writes missed are more than the log keeps, the peer empties its copy (never stale)', async () => {
    const [a, b] = await nodes(2, { queue: 5 });
    await allConnected([a, b]);
    const [low, high] = a.id < b.id ? [a, b] : [b, a];
    await high.set('old', 'v1');
    await low.set('mine', 'x');
    await settled([low], 'old', 'v1');
    const reconnected = reconnection(low);
    [...low.peers.values()][0].wire.socket.destroy();
    await high.set('old', 'v2'); // lost from the log below
    for (let i = 0; i < 10; i += 1) await high.set(`k${i}`, i);
    await reconnected;
    await settled([low], 'k9', 9);
    expect(low.stats.resets).toBe(1);
    expect(await low.get('old')).toBeUndefined(); // v1 would be stale: gone
    expect(await low.get('mine')).toBeUndefined();
    expect(await low.get('k9')).toBe(9); // what the log kept, applied after the reset
  });

  it('a node that starts gets the entries of a peer', async () => {
    const [a, b] = await nodes(2);
    await a.set('one', 1);
    await a.set('two', { n: 2 });
    await settled([b], 'two', { n: 2 });
    const c = await node(a);
    expect(await settled([c], 'two', { n: 2 })).toEqual([{ n: 2 }]);
    expect(await c.get('one')).toBe(1);
  });

  it('nodes of another secret, or without one, are not peers', async () => {
    const [a] = await nodes(1);
    const other = await node(a, { secret: `${SECRET}!` });
    await a.set('k', 'secret value');
    await sleep(300);
    expect(a.connected).toEqual([]);
    expect(other.connected).toEqual([]);
    expect(await other.get('k')).toBeUndefined();
  });
});

describe('values written by @xufa/marshal', () => {
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }

    norm() {
      return Math.hypot(this.x, this.y);
    }
  }

  it('marshal: instances of registered classes come back as themselves on every node', async () => {
    const { Registry } = require('@xufa/marshal');
    const registry = new Registry().register(Point);
    const [a, b] = await nodes(2, { marshal: registry });
    const shared = { n: 1 };
    await a.set('p', { point: new Point(3, 4), twice: [shared, shared] });
    const until = Date.now() + 2000;
    while ((await b.get('p')) === undefined && Date.now() < until) await sleep(10);
    const got = await b.get('p');
    expect(got.point).toBeInstanceOf(Point);
    expect(got.point.norm()).toBe(5);
    expect(got.twice[0]).toBe(got.twice[1]);
  });

  it('nodes with and without marshal read the values of each other', async () => {
    const { Registry } = require('@xufa/marshal');
    const [a] = await nodes(1, { marshal: new Registry().register(Point) });
    const plain = await node(a);
    await allConnected([a, plain]);
    await a.set('from-marshal', new Point(1, 2));
    await plain.set('from-v8', new Map([[1, 'one']]));
    expect(await settled([plain], 'from-marshal', { x: 1, y: 2 })).toEqual([{ x: 1, y: 2 }]);
    expect(await settled([a], 'from-v8', new Map([[1, 'one']]))).toEqual([new Map([[1, 'one']])]);
  });
});

describe('publish', () => {
  it('messages to the nodes connected, not kept', async () => {
    const [a, b, c] = await nodes(3);
    await allConnected([a, b, c]);
    const got = [];
    for (const n of [b, c]) n.on('publish', (channel, data, peer) => got.push([n.id, channel, data, peer]));
    expect(a.publish('news', { at: new Date(0), n: 1n })).toBe(2);
    const until = Date.now() + 2000;
    while (got.length < 2 && Date.now() < until) await sleep(10);
    expect(got).toContainEqual([b.id, 'news', { at: new Date(0), n: 1n }, a.id]);
    expect(got).toContainEqual([c.id, 'news', { at: new Date(0), n: 1n }, a.id]);
    expect(a.size).toBe(0); // nothing was stored
  });
});

describe('the wire', () => {
  // Two wires over a real TCP connection.
  async function pair(keys = [baseKey(SECRET, 's'), baseKey(SECRET, 's')]) {
    const accepted = new Promise((resolve) => {
      const server = net.createServer((socket) => {
        server.close();
        resolve(socket);
      });
      server.listen(0, '127.0.0.1', () => {
        pair.port = server.address().port;
      });
    });
    while (!pair.port) await sleep(5);
    const client = net.connect(pair.port, '127.0.0.1');
    pair.port = 0;
    const options = (key, dialer, id) => ({ key, service: 's', dialer, maxFrame: 1 << 20, hi: { id } });
    const left = new Wire(client, options(keys[0], true, 'left'));
    const right = new Wire(await accepted, options(keys[1], false, 'right'));
    const ready = (wire) =>
      new Promise((resolve) => {
        wire.once('ready', () => resolve(true));
        wire.once('close', () => resolve(false));
      });
    return { left, right, ready: await Promise.all([ready(left), ready(right)]) };
  }

  it('sealed frames go both ways', async () => {
    const { left, right, ready } = await pair();
    expect(ready).toEqual([true, true]);
    const got = new Promise((resolve) => right.once('message', resolve));
    left.send({ t: 'set', k: 'a', b: Buffer.from('x') });
    expect(await got).toEqual({ t: 'set', k: 'a', b: Buffer.from('x') });
    left.close();
    right.close();
  });

  it('another secret is refused at the handshake', async () => {
    const { ready, left, right } = await pair([baseKey(SECRET, 's'), baseKey(`${SECRET}!`, 's')]);
    expect(ready).toEqual([false, false]);
    left.close();
    right.close();
  });

  it('a frame changed on the way closes the connection', async () => {
    const { left, right, ready } = await pair();
    expect(ready).toEqual([true, true]);
    const closed = new Promise((resolve) => right.once('close', (err) => resolve(err && err.message)));
    // A sealed frame with one bit changed, written under the wire.
    const head = Buffer.alloc(4);
    const body = Buffer.alloc(40, 7);
    head.writeUInt32BE(body.length);
    left.socket.write(Buffer.concat([head, body]));
    expect(await closed).toMatch(/authenticate|Unsupported state/);
    left.close();
  });
});

describe('with @xufa/orm', () => {
  it('two machines with one database: what one saves, the cache of the other forgets', async () => {
    const { Database, Model, fields } = require('@xufa/orm');
    const filename = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'netcache-')), 'db.sqlite');
    class Book extends Model {
      static fields = { title: fields.string() };

      static options = { cache: true };
    }
    const [cacheA, cacheB] = await nodes(2);
    await allConnected([cacheA, cacheB]);
    const dbA = new Database({ backend: 'sqlite', filename, name: 'shop', cache: cacheA });
    const dbB = new Database({ backend: 'sqlite', filename, name: 'shop', cache: cacheB });
    dbA.register(Book);
    await dbA.connect();
    await dbA.sync();
    const book = await Book.objects.create({ title: 'Dune' });
    await Book.objects.get({ id: book.id }); // cached
    await settled([cacheB], [...cacheA.store.entries.keys()][0], await cacheA.get([...cacheA.store.entries.keys()][0]));
    expect(cacheB.size).toBe(cacheA.size);
    expect(cacheA.size).toBeGreaterThan(0);

    // The other machine saves the book: the cached row goes from both.
    await dbB.connect();
    dbB.register(Book);
    await Book.objects.using(dbB).filter({ id: book.id }).update({ title: 'Dune Messiah' });
    await sleep(100);
    expect(cacheA.size).toBe(0);
    expect((await Book.objects.using(dbA).get({ id: book.id })).title).toBe('Dune Messiah');
    await dbA.close();
    await dbB.close();
  });
});

describe('netcache.faults', () => {
  it('get, set, delete and clear made to fail (cacheFaults of @xufa/faults)', async () => {
    const cache = await node();
    await cache.set('session:1', 'a');
    cache.faults.fail({ operations: 'read', keys: 'session:', times: 1 });
    const err = await cache.get('session:1').catch((e) => e);
    expect(err.message).toBe('A fault of the netcache (injected): get of session:1');
    expect(await cache.get('session:1')).toBe('a');
  });
});

describe('health', () => {
  it('down when not started; degraded with peers not connected or fewer than minPeers; up otherwise', async () => {
    const stopped = new NetCache({ secret: SECRET });
    expect(await stopped.health().check()).toEqual({ status: 'down', error: 'The netcache is not started' });
    const [a] = await nodes(1);
    expect(a.health().critical).toBe(false);
    expect(await a.health().check()).toMatchObject({ status: 'up', peers: 0, connected: 0, unacknowledged: 0 });
    expect(await a.health({ minPeers: 1 }).check()).toMatchObject({
      status: 'degraded',
      error: '0 peers connected (1 at least)',
    });
    const b = await node(a);
    expect(await allConnected([a, b])).toEqual([1, 1]);
    await a.set('k', 1);
    const up = await a.health({ minPeers: 1 }).check();
    expect(up).toMatchObject({ status: 'up', peers: 1, connected: 1, keys: 1 });
    // Until b acknowledges the write.
    const until = Date.now() + 2000;
    while ((await a.health().check()).unacknowledged > 0 && Date.now() < until) await sleep(10);
    // A peer known whose connection is gone.
    a.peers.set('ghost', { id: 'ghost', log: [{ seq: 1 }] });
    expect(await a.health().check()).toMatchObject({ status: 'degraded', error: '1 peers not connected', unacknowledged: 1 });
    a.peers.delete('ghost');
  });
});
