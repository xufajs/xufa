// Locks: several schedulers with the same jobs (as processes on several machines) and one lock: each time of a job
// runs in one of them. memoryLock(), and ormLock() on the memory and SQLite backends of @xufa/orm: claims, a claim
// kept while its run goes on (no other process starts it), released, and expired when its process died.
import { Database } from '@xufa/orm';
import { Scheduler, memoryLock, ormLock } from '../index.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeClock(start = 0) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + Math.max(0, ms), fn, id: seq });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        // The claims of the database are promises of its own: let them settle.
        for (let i = 0; i < 5; i += 1) await flush();
        let due = null;
        for (const timer of timers.values()) {
          if (timer.at <= end && (due === null || timer.at < due.at || (timer.at === due.at && timer.id < due.id))) {
            due = timer;
          }
        }
        if (due === null) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
      }
      now = end;
      for (let i = 0; i < 5; i += 1) await flush();
    },
  };
}

// Three schedulers (machines) with the same job, on one lock: the runs of each, and the skips 'locked'.
async function threeMachines(lock, job = {}) {
  const clock = fakeClock(0);
  const runs = [];
  const locked = [];
  const schedulers = ['a', 'b', 'c'].map((machine) => {
    const scheduler = new Scheduler({ clock, lock });
    scheduler.on('skip', (event) => locked.push(`${machine} ${event.why}`));
    scheduler.add({
      name: 'nightly',
      every: '10s',
      run: async ({ scheduledAt }) => {
        runs.push(`${machine} ${scheduledAt.getTime()}`);
        if (job.duration) await new Promise((resolve) => clock.setTimeout(resolve, job.duration));
      },
      ...job.options,
    });
    return scheduler.start();
  });
  return { clock, runs, locked, schedulers, stop: () => Promise.all(schedulers.map((s) => s.stop({ timeout: 0 }))) };
}

describe('memoryLock', () => {
  it('each time runs once among the schedulers', async () => {
    const { clock, runs, locked, stop } = await threeMachines(memoryLock());
    await clock.advance(30000);
    expect(runs.map((run) => run.split(' ')[1])).toEqual(['10000', '20000', '30000']);
    expect(locked).toHaveLength(6);
    // At each time, the machine that ran is not among those locked out.
    for (let i = 0; i < 3; i += 1) {
      const ran = runs[i].split(' ')[0];
      expect(locked.slice(i * 2, i * 2 + 2).map((x) => x.split(' ')[0]).sort()).toEqual(['a', 'b', 'c'].filter((m) => m !== ran));
    }
    await stop();
  });

  it('a run going on (longer than the interval) is not started in another scheduler; a job without lock runs everywhere', async () => {
    const lock = memoryLock({ now: () => 0 });
    const long = await threeMachines(lock, { duration: 25000 });
    await long.clock.advance(60000);
    // 10 s runs to 35 s: 20 and 30 are skipped (the claim is not released); 40 runs.
    expect(long.runs.map((run) => run.split(' ')[1])).toEqual(['10000', '40000']);
    await long.stop();

    const free = await threeMachines(memoryLock(), { options: { lock: false } });
    await free.clock.advance(10000);
    expect(free.runs).toEqual(['a 10000', 'b 10000', 'c 10000']);
    await free.stop();
  });

  it('a claim expires after its ttl (a process that died)', () => {
    let now = 0;
    const lock = memoryLock({ now: () => now });
    const token = lock.claim({ name: 'x', slot: 1000, ttl: 5000 });
    expect(typeof token).toBe('string');
    expect(lock.claim({ name: 'x', slot: 2000, ttl: 5000 })).toBe(null); // its run goes on
    now = 6000;
    expect(typeof lock.claim({ name: 'x', slot: 2000, ttl: 5000 })).toBe('string'); // expired
    expect(lock.claim({ name: 'x', slot: 1500, ttl: 5000 })).toBe(null); // an earlier time
  });
});

for (const backend of ['memory', 'sqlite']) {
  describe(`ormLock (${backend})`, () => {
    let db;
    let lock;

    beforeEach(async () => {
      db = new Database({ backend });
      lock = ormLock(db);
      await db.connect();
      await db.sync();
    });

    afterEach(async () => {
      await db.close();
    });

    it('each time runs once among the schedulers', async () => {
      const { clock, runs, locked, stop } = await threeMachines(lock);
      await clock.advance(30000);
      expect(runs.map((run) => run.split(' ')[1])).toEqual(['10000', '20000', '30000']);
      expect(locked).toHaveLength(6);
      await stop();
      const row = await lock.model.objects.get({ name: 'nightly' });
      expect(row.slot.getTime()).toBe(30000);
    });

    it('claims: one per time; not while a run goes on; renewed; released; expired', async () => {
      const first = await lock.claim({ name: 'job', slot: 1000, ttl: 60000 });
      expect(typeof first).toBe('string');
      expect(await lock.claim({ name: 'job', slot: 1000, ttl: 60000 })).toBe(null); // the same time
      expect(await lock.claim({ name: 'job', slot: 2000, ttl: 60000 })).toBe(null); // its run goes on
      await lock.renew({ name: 'job', token: first, ttl: 120000 });
      expect((await lock.model.objects.get({ name: 'job' })).until.getTime()).toBeGreaterThan(Date.now() + 100000);
      await lock.release({ name: 'job', token: 'not mine' });
      expect(await lock.claim({ name: 'job', slot: 2000, ttl: 60000 })).toBe(null);
      await lock.release({ name: 'job', token: first });
      const second = await lock.claim({ name: 'job', slot: 2000, ttl: 30 });
      expect(typeof second).toBe('string');
      // Its process died: the claim expires after its ttl.
      expect(await lock.claim({ name: 'job', slot: 3000, ttl: 60000 })).toBe(null);
      await wait(50);
      expect(typeof (await lock.claim({ name: 'job', slot: 3000, ttl: 60000 }))).toBe('string');
    });

    it('claims at once from several schedulers: one wins', async () => {
      const results = await Promise.all(Array.from({ length: 8 }, () => lock.claim({ name: 'race', slot: 5000, ttl: 60000 })));
      expect(results.filter((token) => token !== null)).toHaveLength(1);
    });
  });
}

describe('ormLock', () => {
  it('sync() creates its table alone; a database of another kind is refused', async () => {
    const db = new Database({ backend: 'sqlite' });
    const lock = ormLock(db, { table: 'my_locks', model: 'MyLock' });
    await db.connect();
    await lock.sync();
    expect(typeof (await lock.claim({ name: 'x', slot: 1, ttl: 1000 }))).toBe('string');
    expect(lock.model.meta.table).toBe('my_locks');
    await db.close();
    expect(() => ormLock({})).toThrow(/db is a Database of @xufa\/orm/);
  });
});
