import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Bus, Pool, PoolClient, PoolError } from '../index.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

// A promise and its resolve, to hold a work until the test lets it end.
function gate() {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

let pools = [];
function makePool(options = {}) {
  const bus = new Bus();
  const pool = new Pool('converters', { bus, ...options });
  pools.push(pool);
  return { bus, pool, client: new PoolClient('converters', { bus }) };
}

afterEach(() => {
  for (const pool of pools) pool.close();
  pools = [];
});

describe('pool', () => {
  it('gives each node as many works at once as its slots, and the others wait in order', async () => {
    const { pool, client } = makePool({ nodes: [{ id: 'a', slots: 2 }, 'b'], slots: (node) => node.slots || 1 });
    const gates = [];
    const started = [];
    const results = [1, 2, 3, 4, 5].map((n) =>
      client.use(async (node) => {
        started.push([n, node.id]);
        const g = gate();
        gates.push(g);
        await g.promise;
        return n * 10;
      })
    );
    await tick();
    // Three slots: a (2) and b (1); the node with most free slots first, then the one given work longest ago.
    expect(started).toEqual([
      [1, 'a'],
      [2, 'b'],
      [3, 'a'],
    ]);
    expect(pool.stats()).toMatchObject({ nodes: 2, slots: 3, free: 0, running: 3, waiting: 2 });
    gates[1].open();
    await tick();
    await tick();
    // The slot of b came back: the next work there.
    expect(started[3]).toEqual([4, 'b']);
    gates.forEach((g) => g.open());
    await tick();
    await tick();
    gates.forEach((g) => g.open());
    expect(await Promise.all(results)).toEqual([10, 20, 30, 40, 50]);
    expect(pool.stats()).toMatchObject({ free: 3, running: 0, waiting: 0 });
  });

  it('serves higher priorities first, and waits for nodes that come up', async () => {
    const { pool, client } = makePool();
    const order = [];
    const run = (name, priority) => client.use(() => order.push(name), { priority });
    const all = Promise.all([run('low', 0), run('high', 5), run('low2', 0), run('mid', 1)]);
    await tick();
    expect(pool.stats().waiting).toBe(4);
    pool.add('only');
    await all;
    expect(order).toEqual(['high', 'mid', 'low', 'low2']);
  });

  it('tries again on other nodes, and gives the slot back when the work fails', async () => {
    const { pool, client } = makePool({ nodes: ['a', 'b', 'c'] });
    const tried = [];
    const result = await client.use(
      (node, { attempt }) => {
        tried.push([node.id, attempt]);
        if (attempt < 2) throw new Error(`failed on ${node.id}`);
        return node.id;
      },
      { retries: 3 }
    );
    // Each attempt on a node where it did not fail yet.
    expect(tried.map(([, attempt]) => attempt)).toEqual([0, 1, 2]);
    expect(new Set(tried.map(([id]) => id)).size).toBe(3);
    expect(result).toBe(tried[2][0]);
    const stats = pool.stats();
    expect(stats.free).toBe(3);
    expect(stats.byNode.reduce((sum, node) => sum + node.failures, 0)).toBe(2);
    await expect(
      client.use(() => Promise.reject(new Error('no')), { retries: 1, retryOn: () => false })
    ).rejects.toThrow('no');
  });

  it('takes a lease back after leaseTimeout: the signal of the work is aborted, and its slot given to another', async () => {
    const { pool, client } = makePool({ nodes: ['a'], leaseTimeout: 50 });
    let aborted = null;
    const slow = client.use(
      (node, { signal }) =>
        new Promise(() => {
          signal.addEventListener('abort', () => {
            aborted = signal.reason;
          });
        })
    );
    const next = client.use(() => 'next');
    await expect(slow).rejects.toMatchObject({ code: 'XUFA_POOL_LEASE_TIMEOUT', statusCode: 504 });
    expect(aborted).toBeInstanceOf(PoolError);
    expect(await next).toBe('next');
    expect(pool.stats()).toMatchObject({ running: 0, free: 1 });
  });

  it('follows a source of peers: a node that goes takes its leases with it', async () => {
    const discovery = new EventEmitter();
    discovery.peers = [{ id: 'p1', meta: { url: 'http://p1' } }];
    const { pool, client } = makePool({ nodes: discovery });
    const held = client.use(
      (node, { signal }) =>
        new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    );
    await tick();
    expect(pool.stats().running).toBe(1);
    discovery.emit('down', { id: 'p1' });
    await expect(held).rejects.toMatchObject({ code: 'XUFA_POOL_NODE_DOWN' });
    const waiting = client.use((node) => node.meta.url);
    await tick();
    discovery.emit('up', { id: 'p2', meta: { url: 'http://p2' } });
    expect(await waiting).toBe('http://p2');
  });

  it('fallback: from the attempt `after` on, the work goes to its node (a load balancer), without a slot', async () => {
    const { pool, client } = makePool({ nodes: ['a', 'b'] });
    const tried = [];
    const balancer = { id: 'balancer', url: 'http://lb' };
    const result = await client.use(
      (node, { attempt, fallback, signal }) => {
        tried.push([node.id, attempt, fallback]);
        expect(signal).toBeInstanceOf(AbortSignal);
        if (!fallback) {
          expect(pool.stats().free).toBe(1); // a slot taken by the work
          throw new Error(`failed on ${node.id}`);
        }
        expect(pool.stats().free).toBe(2); // none for the balancer
        return `done by ${node.url}`;
      },
      { retries: 4, fallback: { after: 2, node: balancer } }
    );
    expect(result).toBe('done by http://lb');
    expect(tried.map(([, attempt, fallback]) => [attempt, fallback])).toEqual([
      [0, false],
      [1, false],
      [2, true],
    ]);
    // A node made for each attempt, with the error before it; its failures count as attempts too.
    const made = [];
    await expect(
      client.use(
        (node) => {
          throw new Error(`failed on ${node.id}`);
        },
        {
          retries: 2,
          fallback: {
            after: 1,
            node: (attempt, error) => {
              made.push([attempt, error.message]);
              return { id: `lb${attempt}` };
            },
          },
        }
      )
    ).rejects.toThrow('failed on lb2');
    expect(made).toEqual([
      [1, made[0][1]],
      [2, 'failed on lb1'],
    ]);
    expect(made[0][1]).toMatch(/^failed on [ab]$/);
  });

  it('fallback.wait: no node free in that time (none, or all busy), the fallback takes the work', async () => {
    const { client } = makePool({ nodes: [] });
    const started = Date.now();
    const result = await client.use((node, { fallback }) => [node.id, fallback], {
      fallback: { wait: 50, node: { id: 'balancer' } },
    });
    expect(result).toEqual(['balancer', true]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(40);
    // A node free in time: the pool.
    const { client: other } = makePool({ nodes: ['a'] });
    expect(
      await other.use((node, { fallback }) => [node.id, fallback], { fallback: { wait: '1s', node: { id: 'lb' } } })
    ).toEqual(['a', false]);
    // The caller's signal still stops it.
    const controller = new AbortController();
    const stopped = client.use(() => 1, { signal: controller.signal, fallback: { wait: '1m', node: { id: 'lb' } } });
    await tick();
    controller.abort(new Error('not any more'));
    await expect(stopped).rejects.toThrow('not any more');
    // Wrong fallbacks.
    await expect(client.use(() => 1, { fallback: { node: { id: 'lb' } } })).rejects.toThrow('needs after');
    await expect(client.use(() => 1, { fallback: { after: -1, node: { id: 'lb' } } })).rejects.toThrow(PoolError);
    await expect(client.use(() => 1, { fallback: { after: 1 } })).rejects.toThrow('node is an object');
  });

  it('rejects tickets past maxWaiting or waitTimeout, and stops waiting when its signal aborts', async () => {
    const { pool, client } = makePool({ maxWaiting: 1, waitTimeout: 40 });
    const first = client.acquire();
    await tick();
    await expect(client.acquire()).rejects.toMatchObject({ code: 'XUFA_POOL_FULL', statusCode: 503 });
    await expect(first).rejects.toMatchObject({ code: 'XUFA_POOL_WAIT_TIMEOUT' });
    const controller = new AbortController();
    const cancelled = client.acquire({ signal: controller.signal });
    await tick();
    expect(pool.stats().waiting).toBe(1);
    controller.abort(new Error('not any more'));
    await expect(cancelled).rejects.toThrow('not any more');
    await tick();
    expect(pool.stats().waiting).toBe(0);
  });

  it('acquire() gives a lease to release by hand', async () => {
    const { pool, client } = makePool({ nodes: ['a'] });
    const lease = await client.acquire();
    expect(lease.node).toEqual({ id: 'a' });
    expect(pool.stats().free).toBe(0);
    lease.release();
    lease.release();
    await tick();
    expect(pool.stats().free).toBe(1);
    expect(await client.stats()).toMatchObject({ name: 'converters', nodes: 1, free: 1 });
  });

  it('says when there is no pool of that name, or one is made twice', async () => {
    const bus = new Bus();
    await expect(new PoolClient('nope', { bus }).acquire()).rejects.toMatchObject({ code: 'XUFA_POOL_UNKNOWN' });
    const { bus: used } = makePool();
    expect(() => new Pool('converters', { bus: used })).toThrow(/there already/);
    expect(() => new Pool('x', { bus, leaseTimeout: 'soon' })).toThrow(/not a duration/);
  });

  it('close() rejects the tickets and revokes the leases', async () => {
    const { pool, client } = makePool({ nodes: ['a'] });
    const held = client.use(() => new Promise(() => {}));
    const waiting = client.use(() => 'never');
    await tick();
    pool.close();
    await expect(held).rejects.toMatchObject({ code: 'XUFA_POOL_CLOSED' });
    await expect(waiting).rejects.toMatchObject({ code: 'XUFA_POOL_CLOSED' });
  });
});

describe('pool autoscale', () => {
  it('scales up by the demand, and down only after downAfter, counting the works running', async () => {
    const scaled = [];
    const { pool, client } = makePool({
      nodes: ['a'],
      slots: 2,
      autoscale: { perNode: 2, min: 1, max: 4, upEvery: 0, downAfter: 80, scale: (count) => scaled.push(count) },
    });
    const gates = [];
    const works = Array.from({ length: 6 }, () =>
      client.use(async () => {
        const g = gate();
        gates.push(g);
        await g.promise;
      })
    );
    await tick();
    // 6 works (2 running, 4 waiting): 3 nodes of 2.
    expect(scaled).toEqual([3]);
    pool.add('b');
    pool.add('c');
    await tick();
    expect(pool.stats()).toMatchObject({ running: 6, waiting: 0 });
    expect(scaled).toEqual([3]);
    // The queue is empty but 6 works run: no scale down.
    await sleep(120);
    expect(scaled).toEqual([3]);
    gates.forEach((g) => g.open());
    await Promise.all(works);
    // Nothing runs: down to min after downAfter, not before.
    await tick();
    expect(scaled).toEqual([3]);
    await sleep(150);
    expect(scaled).toEqual([3, 1]);
  });

  it('scales from zero nodes when tickets wait', async () => {
    const scaled = [];
    const { client } = makePool({ autoscale: { max: 2, scale: (count) => scaled.push(count), initial: 0 } });
    client.use(() => {}).catch(() => {});
    await tick();
    await tick();
    expect(scaled).toEqual([1]);
  });
});

describe('pool in a cluster', () => {
  it('shares the slots among workers, and frees those of a worker that dies', () => {
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'fixtures', 'pool.js')], { timeout: 30000 });
    const lines = result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(result.status).toBe(0);
    const summary = lines.find((line) => line.summary);
    // 2 nodes of 1 slot: never more than 2 works at once, among 3 workers.
    expect(summary.maxRunning).toBe(2);
    expect(summary.done).toBe(12);
    // The worker that died holding a lease: its slot came back.
    expect(summary.freedAfterCrash).toBe(true);
    expect(summary.final).toMatchObject({ running: 0, waiting: 0, free: 2 });
  }, 40000);
});

describe('pool health', () => {
  it('down without nodes, degraded with too many waiting, up otherwise; from the primary and from a client', async () => {
    const { pool, client } = makePool({ nodes: [] });
    const health = pool.health({ maxWaiting: 1 });
    expect(health.critical).toBe(false);
    expect(await health.check()).toMatchObject({
      status: 'down',
      error: '0 nodes of the pool converters (1 at least)',
      nodes: 0,
    });
    pool.add('a');
    expect(await client.health().check()).toMatchObject({ status: 'up', nodes: 1, slots: 1, free: 1, waiting: 0 });
    const held = await client.acquire();
    const next = client.acquire();
    // Rejected when the pool closes (afterEach).
    client.acquire().catch(() => {});
    await tick();
    expect(await health.check()).toMatchObject({ status: 'degraded', running: 1, waiting: 2 });
    expect((await pool.health({ minNodes: 2 }).check()).status).toBe('down');
    held.release();
    (await next).release();
    expect(pool.health({ critical: true, timeout: 500 })).toMatchObject({ critical: true, timeout: 500 });
  });
});
