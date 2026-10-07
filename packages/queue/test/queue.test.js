// @xufa/queue: jobs enqueued and run (deleted when done, or kept), retries with backoff and failures, retry(),
// timeouts (the signal of the job aborted), delays, priorities, unique keys, jobs enqueued in a transaction that
// fails, workers (concurrency, several workers on one database: each job once), jobs of stopped workers taken back,
// pools of nodes of @xufa/cluster, and the plugin of @xufa/http. On the memory backend and SQLite (and PostgreSQL
// with XUFA_PG_URL, MongoDB with XUFA_MONGO_URL: a replica set, for the test of transactions).
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { Database } = require('@xufa/orm');
const xufa = require('@xufa/http');
const { Bus, Pool, PoolClient } = require('@xufa/cluster');
const { Queue, queuePlugin, backoffDelay } = require('..');

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const BACKENDS = [
  ['memory', () => ({ backend: 'memory' })],
  [
    'sqlite',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-queue-'));
      dirs.push(dir);
      return { backend: 'sqlite', filename: path.join(dir, 'jobs.db') };
    },
  ],
];
if (process.env.XUFA_PG_URL) BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL })]);
if (process.env.XUFA_MONGO_URL)
  BACKENDS.push(['mongodb', () => ({ backend: 'mongodb', url: process.env.XUFA_MONGO_URL })]);

const until = async (check, timeout = 5000) => {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

for (const [name, options] of BACKENDS) {
  describe(`queue on ${name}`, () => {
    let db;
    let queue;

    beforeEach(async () => {
      db = new Database(options());
      queue = new Queue(db, { backoff: 0, table: 'xufa_test_jobs' });
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterEach(async () => {
      await queue.stop();
      await db.drop();
      await db.close();
    });

    it('runs the jobs due with their payloads; done jobs are deleted, or kept with their results', async () => {
      const seen = [];
      queue.define('greet', async ({ name: who }, job) => {
        seen.push([who, job.attempts]);
        return { greeted: who };
      });
      await queue.enqueue('greet', { name: 'Ada' });
      await queue.enqueue('greet', { name: 'Grace' });
      expect(await queue.counts()).toEqual({ pending: 2, running: 0, done: 0, failed: 0 });
      expect(await queue.runDue()).toEqual({ done: 2, retrying: 0, failed: 0 });
      expect(seen).toEqual([
        ['Ada', 1],
        ['Grace', 1],
      ]);
      expect(await queue.jobs.count()).toBe(0);
      queue.keepDone = true;
      await queue.enqueue('greet', { name: 'Linus' });
      await queue.runDue();
      const [kept] = await queue.jobs.filter({ status: 'done' });
      expect([kept.result, kept.finishedAt instanceof Date, kept.lockedBy]).toEqual([{ greeted: 'Linus' }, true, null]);
    });

    it('a job that fails is tried again (backoff), then failed with its error; retry() takes it back', async () => {
      let calls = 0;
      queue.define(
        'flaky',
        async () => {
          calls += 1;
          throw new Error(`failure ${calls}`);
        },
        { attempts: 3 }
      );
      const events = [];
      queue.on('retrying', (job, err) => events.push(`retrying ${err.message}`));
      queue.on('failed', (job, err) => events.push(`failed ${err.message}`));
      await queue.enqueue('flaky');
      expect(await queue.runDue()).toEqual({ done: 0, retrying: 2, failed: 1 });
      expect(events).toEqual(['retrying failure 1', 'retrying failure 2', 'failed failure 3']);
      const [failed] = await queue.jobs.filter({ status: 'failed' });
      expect([failed.attempts, failed.lastError.split('\n')[0]]).toEqual([3, 'Error: failure 3']);
      expect(await queue.retry()).toBe(1);
      queue.define('flaky', async () => 'fixed');
      expect(await queue.runDue()).toEqual({ done: 1, retrying: 0, failed: 0 });
      await queue.enqueue('nobody-defined-it');
      expect((await queue.runDue()).failed).toBe(1);
    });

    it('a job past its timeout is failed, and its signal aborted', async () => {
      let aborted = null;
      queue.define(
        'slow',
        (payload, job) =>
          new Promise((resolve) => {
            job.signal.addEventListener('abort', () => {
              aborted = job.signal.reason.message;
              resolve();
            });
          }),
        { timeout: 30, attempts: 1 }
      );
      await queue.enqueue('slow');
      expect(await queue.runDue()).toEqual({ done: 0, retrying: 0, failed: 1 });
      expect(aborted).toMatch(/ran more than 30 ms/);
    });

    it('delays, times, priorities and unique keys', async () => {
      const order = [];
      queue.define('note', async ({ n }) => order.push(n));
      await queue.enqueue('note', { n: 'later' }, { delay: '1h' });
      await queue.enqueue('note', { n: 'tomorrow' }, { at: new Date(Date.now() + 86400000) });
      await queue.enqueue('note', { n: 'low' });
      await queue.enqueue('note', { n: 'high' }, { priority: 10 });
      const first = await queue.enqueue('note', { n: 'once' }, { key: 'once' });
      const second = await queue.enqueue('note', { n: 'twice' }, { key: 'once' });
      expect(second.pk).toBe(first.pk);
      await queue.runDue();
      expect(order).toEqual(['high', 'low', 'once']);
      expect(await queue.jobs.count()).toBe(2);
    });

    it('a job enqueued in a transaction that fails is not there', async () => {
      // A MongoDB without a replica set has no transactions.
      if (name === 'mongodb' && !process.env.XUFA_MONGO_REPLICA) return;
      queue.define('audit', async () => {});
      await expect(
        db.transaction(async () => {
          await queue.enqueue('audit', { n: 1 });
          throw new Error('rolled back');
        })
      ).rejects.toThrow('rolled back');
      expect(await queue.jobs.count()).toBe(0);
      await db.transaction(() => queue.enqueue('audit', { n: 2 }));
      expect(await queue.jobs.count()).toBe(1);
    });

    it('workers: several jobs at once, each job once among several workers of one database', async () => {
      const other = new Queue(db, { jobModel: queue.Job, backoff: 0 });
      const runs = new Map();
      let running = 0;
      let most = 0;
      const handler = async ({ n }) => {
        running += 1;
        most = Math.max(most, running);
        runs.set(n, (runs.get(n) || 0) + 1);
        await new Promise((resolve) => setTimeout(resolve, 15));
        running -= 1;
      };
      queue.define('work', handler);
      other.define('work', handler);
      for (let n = 0; n < 12; n += 1) await queue.enqueue('work', { n });
      queue.work({ concurrency: 3, poll: 20 });
      other.work({ concurrency: 3, poll: 20 });
      await until(async () => (await queue.jobs.count()) === 0);
      await other.stop();
      expect([...runs.values()].every((count) => count === 1)).toBe(true);
      expect(runs.size).toBe(12);
      expect(most).toBeGreaterThan(1);
      expect(most).toBeLessThanOrEqual(6);
    });

    it('a pool: jobs wait (pending) for a free node, run with job.node, and never more than its slots at once', async () => {
      const bus = new Bus();
      const pool = new Pool('converters', { bus, nodes: [{ id: 'a' }, { id: 'b' }] });
      const other = new Queue(db, { jobModel: queue.Job, backoff: 0 });
      const runs = new Map();
      const nodes = new Set();
      let running = 0;
      let most = 0;
      let mostRunningRows = 0;
      const handler = async ({ n }, job) => {
        running += 1;
        most = Math.max(most, running);
        nodes.add(job.node.id);
        runs.set(n, (runs.get(n) || 0) + 1);
        mostRunningRows = Math.max(mostRunningRows, (await queue.counts()).running);
        await new Promise((resolve) => setTimeout(resolve, 15));
        running -= 1;
        return job.node.id;
      };
      queue.define('convert', handler, { pool });
      other.define('convert', handler, { pool: new PoolClient('converters', { bus }) });
      for (let n = 0; n < 10; n += 1) await queue.enqueue('convert', { n });
      queue.work({ concurrency: 4, poll: 20 });
      other.work({ concurrency: 4, poll: 20 });
      await until(async () => (await queue.jobs.count()) === 0);
      await other.stop();
      expect(runs.size).toBe(10);
      expect([...runs.values()].every((count) => count === 1)).toBe(true);
      expect(most).toBe(2);
      // Jobs waiting for a node are pending, not running: at most the 2 that run, and one finishing for each (its node
      // is given back when its work ends, a moment before its row is). Claimed before a node, 8 could be running.
      expect(mostRunningRows).toBeLessThanOrEqual(4);
      expect([...nodes].sort()).toEqual(['a', 'b']);
      expect(pool.stats()).toMatchObject({ running: 0, waiting: 0, free: 2 });
      pool.close();
    });

    it('a pool: a job whose node is taken back fails that run and is tried again; runDue() waits for nodes', async () => {
      const bus = new Bus();
      const pool = new Pool('converters', { bus, nodes: ['a'], leaseTimeout: 40 });
      const signals = [];
      queue.define(
        'slow',
        (payload, job) => {
          signals.push(job.signal);
          return job.attempts === 1 ? new Promise(() => {}) : job.node.id;
        },
        { pool, attempts: 2 }
      );
      await queue.enqueue('slow');
      // The first run lost its node (leaseTimeout), and the second (no backoff) ran on it again.
      expect(await queue.runDue()).toEqual({ done: 1, retrying: 1, failed: 0 });
      expect(signals[0].aborted).toBe(true);
      expect(signals[0].reason.code).toBe('XUFA_POOL_LEASE_TIMEOUT');
      expect(signals[1].aborted).toBe(false);
      expect(pool.stats()).toMatchObject({ running: 0, free: 1 });
      expect(() => queue.define('bad', () => {}, { pool: {} })).toThrow(/pool is a pool/);
      pool.close();
    });

    it('a pool: stopping a worker stops the jobs waiting for a node (they stay pending)', async () => {
      const bus = new Bus();
      const pool = new Pool('converters', { bus });
      queue.define('waits', () => 'never', { pool });
      await queue.enqueue('waits');
      queue.work({ poll: 20 });
      await until(() => pool.stats().waiting === 1);
      await queue.stop();
      expect(pool.stats().waiting).toBe(0);
      expect(await queue.counts()).toMatchObject({ pending: 1, running: 0 });
      pool.close();
    });

    it('health(): counts, the lag of the oldest job due and the workers; degraded past its limits', async () => {
      queue.define('later', () => {});
      const health = queue.health({ maxPending: 2, maxFailed: 0 });
      expect(health.critical).toBe(false);
      expect(await health.check()).toMatchObject({ status: 'up', pending: 0, failed: 0, lag: 0, workers: 0 });
      await queue.enqueue('later', null, { delay: '1h' }); // not due: no lag
      expect(await health.check()).toMatchObject({ status: 'up', pending: 1, lag: 0 });
      const late = await queue.enqueue('later');
      await queue.jobs.filter({ pk: late.pk }).update({ runAt: new Date(Date.now() - 10 * 60000) });
      const lagging = await health.check();
      expect(lagging.status).toBe('degraded');
      expect(lagging.lag).toBeGreaterThanOrEqual(10 * 60000 - 1000);
      expect(lagging.error).toMatch(/the oldest job due waits for 6\d\d s/);
      expect((await queue.health({ maxLag: '1h' }).check()).status).toBe('up');
      await queue.enqueue('later', null, { delay: '1h' });
      expect((await queue.health({ maxLag: '1h', maxPending: 2 }).check()).error).toBe('3 jobs pending');
      await queue.jobs.filter({ pk: late.pk }).update({ status: 'failed' });
      expect((await queue.health({ maxLag: '1h', maxFailed: 0 }).check()).error).toBe('1 jobs failed');
    });

    it('jobs whose worker stopped while they ran (past lockedUntil) are taken back, or failed', async () => {
      queue.define('lost', async () => 'done again');
      const job = await queue.enqueue('lost', null, { attempts: 2 });
      expect(await queue.claim(job.pk, 1000)).not.toBe(null);
      expect(await queue.claim(job.pk, 1000)).toBe(null); // claimed once
      await queue.jobs.filter({ pk: job.pk }).update({ lockedUntil: new Date(Date.now() - 1000) });
      expect(await queue.recover()).toBe(1);
      expect((await queue.jobs.get({ pk: job.pk })).status).toBe('pending');
      expect(await queue.runDue()).toEqual({ done: 1, retrying: 0, failed: 0 });
    });
  });
}

describe('queue', () => {
  it('backoff: exponential up to its max, fixed, a function', () => {
    const exponential = { delay: 1000, max: 5000, jitter: false };
    expect([1, 2, 3, 4].map((n) => backoffDelay(exponential, n))).toEqual([1000, 2000, 4000, 5000]);
    expect(backoffDelay({ type: 'fixed', delay: '2s', jitter: false }, 5)).toBe(2000);
    expect(backoffDelay((n) => n * 10, 3)).toBe(30);
    const jittered = backoffDelay({ delay: 1000 }, 1);
    expect(jittered >= 800 && jittered <= 1200).toBe(true);
  });

  it('health() of the database and the queue in xufa.health: ready is down without the database only', async () => {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { table: 'xufa_health_jobs' });
    await db.connect();
    await db.sync();
    const app = xufa({ logger: false });
    app.register(xufa.health, { cache: 0, checks: { database: db.health(), queue: queue.health({ maxFailed: 0 }) } });
    const report = (await app.inject('/health')).json();
    expect(report.status).toBe('up');
    expect(report.checks.queue).toMatchObject({ status: 'up', critical: false, details: { pending: 0, workers: 0 } });
    expect(report.checks.database.details.latency).toEqual(expect.any(Number));
    // A queue with failed jobs degrades the app (200); a database that does not answer takes it down (503).
    queue.define('x', () => {});
    const job = await queue.enqueue('x');
    await queue.jobs.filter({ pk: job.pk }).update({ status: 'failed' });
    let ready = await app.inject('/health/ready');
    expect([ready.statusCode, ready.json().status]).toEqual([200, 'degraded']);
    db.backend.ping = async () => {
      throw new Error('the database is gone');
    };
    ready = await app.inject('/health/ready');
    expect([ready.statusCode, ready.json().status]).toEqual([503, 'down']);
    await app.close();
    await db.close();
  });

  it('the plugin of @xufa/http: app.queue, workers with the app', async () => {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0 });
    await db.sync();
    const welcomed = [];
    queue.define('welcome', async ({ user }) => welcomed.push(user));
    const app = xufa();
    app.register(queuePlugin, { queue, work: { poll: 20 } });
    app.post('/signup', async (request, reply) => {
      await app.queue.enqueue('welcome', { user: request.body.user });
      reply.code(202);
      return { queued: true };
    });
    const res = await app.inject({ method: 'POST', url: '/signup', payload: { user: 'ada' } });
    expect(res.statusCode).toBe(202);
    await until(() => welcomed.length === 1);
    expect(welcomed).toEqual(['ada']);
    await app.close();
    expect(queue.workers).toHaveLength(0);
    expect(() => xufa().register(queuePlugin, {})).not.toThrow();
    await expect(xufa().register(queuePlugin, {}).ready()).rejects.toThrow(/takes \{ queue \}/);
  });
});
