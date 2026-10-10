// Pools of several machines told when a slot comes back (notify): a ticket waiting on one machine is served as soon as
// another gives the slot back, not at its next look (pollEvery, 10 s here). With { publish, subscribe }, a NetCache of
// @xufa/netcache (TCP) and a Discovery of @xufa/discovery (UDP), on 127.0.0.1.
import { EventEmitter } from 'node:events';
import { Database } from '@xufa/orm';
import { NetCache } from '@xufa/netcache';
import { Discovery } from '@xufa/discovery';
import { Bus, Pool, PoolClient, ormSlots } from '../index.js';

const SECRET = 'a secret of sixteen bytes or more';
const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

let pools = [];
const stops = [];
let db;
let model;

beforeEach(async () => {
  db = new Database({ backend: 'memory' });
  model = ormSlots(db, { table: 'xufa_notify_slots' }).model;
  await db.connect();
  await db.sync();
});

afterEach(async () => {
  for (const pool of pools) pool.close();
  pools = [];
  await Promise.all(stops.splice(0).map((stop) => stop()));
  await db.close();
});

function machine(notify) {
  const bus = new Bus();
  const pool = new Pool('converters', {
    bus,
    nodes: ['converter-1'],
    shared: ormSlots(db, { model }),
    pollEvery: '10s',
    notify,
  });
  pools.push(pool);
  return new PoolClient('converters', { bus });
}

// Machine a holds the only slot; machine b waits; a gives it back: how long b took after that.
async function handOver(notifyA, notifyB) {
  const a = machine(notifyA);
  const b = machine(notifyB);
  let release;
  const held = a.use(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  await sleep(30);
  let releasedAt = 0;
  const served = b.use(() => Date.now());
  await sleep(100);
  releasedAt = Date.now();
  release();
  await held;
  return (await served) - releasedAt;
}

// Endpoints of a hub: what one publishes reaches the others.
function hub() {
  const emitter = new EventEmitter();
  let next = 0;
  return () => {
    const me = (next += 1);
    return {
      publish: (data) => emitter.emit('freed', me, data),
      subscribe(handler) {
        const listener = (from, data) => {
          if (from !== me) handler(data);
        };
        emitter.on('freed', listener);
        return () => emitter.off('freed', listener);
      },
    };
  };
}

describe('pool notify', () => {
  it('without notify, the machine waiting looks again only at pollEvery', async () => {
    const a = machine();
    const b = machine();
    let release;
    const held = a.use(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    await sleep(30);
    let served = false;
    b.use(() => {
      served = true;
    }).catch(() => {});
    await sleep(50);
    release();
    await held;
    await sleep(300);
    expect(served).toBe(false);
  });

  it('{ publish, subscribe }: the ticket waiting is served at once', async () => {
    const endpoint = hub();
    expect(await handOver(endpoint(), endpoint())).toBeLessThan(500);
  });

  it('a NetCache: published over TCP to the other machines', async () => {
    const node = async (seed) => {
      const cache = new NetCache({
        secret: SECRET,
        host: '127.0.0.1',
        settle: 100,
        discovery: {
          transport: 'unicast',
          port: 0,
          address: '127.0.0.1',
          interval: 50,
          seeds: seed ? [`127.0.0.1:${seed.discovery.port}`] : [],
        },
      });
      stops.push(() => cache.stop());
      return cache.start();
    };
    const first = await node();
    const second = await node(first);
    const until = Date.now() + 3000;
    while ((first.peers.size < 1 || second.peers.size < 1) && Date.now() < until) await sleep(20);
    await sleep(100);
    expect(await handOver(first, second)).toBeLessThan(500);
  }, 15000);

  it('a Discovery: sent as datagrams to the other machines', async () => {
    const node = async (seed) => {
      const discovery = new Discovery({
        service: 'pool-notify',
        transport: 'unicast',
        port: 0,
        address: '127.0.0.1',
        interval: 50,
        seeds: seed ? [`127.0.0.1:${seed.port}`] : [],
      });
      stops.push(() => discovery.stop());
      await discovery.start();
      return discovery;
    };
    const first = await node();
    const second = await node(first);
    await second.waitFor((peers) => peers.length >= 1, { timeout: 3000 });
    await first.waitFor((peers) => peers.length >= 1, { timeout: 3000 });
    expect(await handOver(first, second)).toBeLessThan(500);
  }, 15000);

  it('needs shared, and something that publishes', () => {
    const bus = new Bus();
    expect(() => new Pool('x', { bus, notify: hub()() })).toThrow(/needs shared/);
    expect(() => new Pool('y', { bus, shared: ormSlots(db, { model }), notify: {} })).toThrow(/NetCache, a Discovery/);
  });
});
