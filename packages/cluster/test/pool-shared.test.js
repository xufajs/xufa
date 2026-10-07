// Pools across machines: nodes that answer busy (429) are left aside and the work goes to others; pools of several
// machines (here, pools on buses of their own) share the slots of the same nodes through a database (ormSlots), on
// the memory backend and SQLite (PostgreSQL with XUFA_PG_URL, MongoDB with XUFA_MONGO_URL); the slots of a machine
// that died come back after their ttl.
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { Database } = require('@xufa/orm');
const { Bus, Pool, PoolClient, ormSlots } = require('..');

const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));
const busy = (retryAfter) => Object.assign(new Error('Too Many Requests'), { statusCode: 429, retryAfter });

let pools = [];
function machine(name, options) {
  const bus = new Bus();
  const pool = new Pool(name, { bus, ...options });
  pools.push(pool);
  return { pool, client: new PoolClient(name, { bus }) };
}

afterEach(() => {
  for (const pool of pools) pool.close();
  pools = [];
});

describe('pool: busy nodes', () => {
  it('a node that answers 429 is left aside; the work goes to another, not as a failure', async () => {
    const { pool, client } = machine('busy', { nodes: ['a', 'b'] });
    const seen = [];
    pool.on('busy', ({ node, for: wait }) => seen.push([node.id, wait]));
    const tried = [];
    const result = await client.use(
      (node) => {
        tried.push(node.id);
        if (node.id === 'a') throw busy(200);
        return node.id;
      },
      { retries: 0 }
    );
    expect(tried).toEqual(['a', 'b']);
    expect(result).toBe('b');
    expect(seen).toEqual([['a', 200]]);
    expect(pool.stats().byNode.every((node) => node.failures === 0)).toBe(true);
    // a is aside for 200 ms: the next work goes to b.
    expect(await client.use((node) => node.id)).toBe('b');
  });

  it('with one node, the work waits until its Retry-After passes', async () => {
    const { client } = machine('one', { nodes: ['only'] });
    let calls = 0;
    const started = Date.now();
    const result = await client.use(() => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error('busy'), { status: 429, headers: { 'retry-after': '0' } });
      if (calls === 2) throw busy(80);
      return 'served';
    });
    expect(result).toBe('served');
    expect(calls).toBe(3);
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
  });

  it('gives up after maxBusy busy answers, and busy(err) says what is busy', async () => {
    const { client } = machine('stubborn', { nodes: ['x'], busyFor: 1 });
    let calls = 0;
    await expect(
      client.use(
        () => {
          calls += 1;
          throw Object.assign(new Error('overloaded'), { code: 'OVERLOADED' });
        },
        { maxBusy: 2 }
      )
    ).rejects.toThrow('overloaded');
    expect(calls).toBe(1);
    const bus = new Bus();
    pools.push(new Pool('custom', { bus, nodes: ['x'], busyFor: 1 }));
    const custom = new PoolClient('custom', { bus, busy: (err) => err.code === 'OVERLOADED' });
    calls = 0;
    await expect(
      custom.use(
        () => {
          calls += 1;
          throw Object.assign(new Error('overloaded'), { code: 'OVERLOADED' });
        },
        { maxBusy: 2 }
      )
    ).rejects.toThrow('overloaded');
    expect(calls).toBe(3);
  });
});

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const BACKENDS = [
  ['memory', () => ({ backend: 'memory' })],
  [
    'sqlite',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-slots-'));
      dirs.push(dir);
      return { backend: 'sqlite', filename: path.join(dir, 'slots.db') };
    },
  ],
];
if (process.env.XUFA_PG_URL) BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL })]);
if (process.env.XUFA_MONGO_URL)
  BACKENDS.push(['mongodb', () => ({ backend: 'mongodb', url: process.env.XUFA_MONGO_URL })]);

for (const [name, options] of BACKENDS) {
  describe(`pools of several machines on ${name}`, () => {
    let db;
    let stores;

    beforeEach(async () => {
      db = new Database(options());
      // Each machine has its store (its owner); they share the database.
      stores = [ormSlots(db, { ttl: '2s', table: 'xufa_test_slots' })];
      stores.push(ormSlots(db, { ttl: '2s', model: stores[0].model }));
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterEach(async () => {
      for (const pool of pools) pool.close();
      pools = [];
      await sleep(20);
      await db.drop();
      await db.close();
    });

    it('never gives a node more works at once than its slots, among every machine', async () => {
      const nodes = [{ id: 'a', slots: 2 }, { id: 'b', slots: 1 }];
      const machines = stores.map((store) =>
        machine('converters', { nodes, slots: (node) => node.slots, shared: store, pollEvery: 10 })
      );
      const running = { a: 0, b: 0 };
      const most = { a: 0, b: 0 };
      const done = [];
      const work = (client, n) =>
        client.use(async (node) => {
          running[node.id] += 1;
          most[node.id] = Math.max(most[node.id], running[node.id]);
          await sleep(5);
          running[node.id] -= 1;
          done.push(n);
        });
      await Promise.all(
        machines.flatMap(({ client }, m) => Array.from({ length: 8 }, (_, i) => work(client, `${m}:${i}`)))
      );
      expect(done).toHaveLength(16);
      expect(most).toEqual({ a: 2, b: 1 });
      await sleep(20);
      // Every slot was given back.
      expect(await stores[0].held('converters')).toEqual({});
    }, 30000);

    it('the slots of a machine that died come back after their ttl', async () => {
      const dead = ormSlots(db, { ttl: 150, model: stores[0].model });
      // A machine took the only slot of the node and died (no release, no renewal).
      expect(await dead.claim('converters', 'a', 1)).toEqual(expect.any(String));
      expect(await stores[0].claim('converters', 'a', 1)).toBe(null);
      const { client } = machine('converters', { nodes: ['a'], shared: stores[0], pollEvery: 20 });
      const started = Date.now();
      expect(await client.use((node) => node.id)).toBe('a');
      expect(Date.now() - started).toBeGreaterThanOrEqual(100);
    }, 10000);

    it('a machine renews the slots it holds while its works run', async () => {
      const store = ormSlots(db, { ttl: 90, model: stores[0].model });
      const { client } = machine('converters', { nodes: ['a'], shared: store });
      const other = ormSlots(db, { ttl: 90, model: stores[0].model });
      let stolen = 'not tried';
      await client.use(async () => {
        await sleep(200);
        stolen = await other.claim('converters', 'a', 1);
      });
      // Held past its ttl (renewed every 30 ms): no other machine took it.
      expect(stolen).toBe(null);
    }, 10000);
  });
}
