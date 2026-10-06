// Retries (backoff, attempts, timeouts of each attempt, stop() during a wait, one run for the lock and the overlap),
// the history of the runs (in memory, and in an ORM database: recorded, listed, last, pruned), and catchUp (the last
// time missed runs when a scheduler starts, once among machines that share the history and a lock).
const { Database } = require('@xufa/orm');
const { Scheduler, memoryHistory, ormHistory, memoryLock, ormLock, SchedulerError } = require('..');
const { fakeClock, settle } = require('./clock');

describe('retries', () => {
  it('a run that fails is tried again after a delay that grows; the attempts are one run', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    const attempts = [];
    const retries = [];
    scheduler.on('retry', (event) => retries.push(`${event.attempt} ${event.error.message} ${event.delay}`));
    let done = null;
    scheduler.on('done', (event) => {
      done = event;
    });
    scheduler.add({
      name: 'flaky',
      every: '1h',
      retries: 3,
      retryDelay: '1s',
      run: ({ attempt, scheduledAt }) => {
        attempts.push(`${attempt}@${clock.now()} for ${scheduledAt.getTime()}`);
        if (attempt < 3) throw new Error(`no ${attempt}`);
        return 'yes';
      },
    });
    scheduler.start();
    await clock.advance(3600000 + 5000);
    expect(attempts).toEqual(['1@3600000 for 3600000', '2@3601000 for 3600000', '3@3603000 for 3600000']);
    expect(retries).toEqual(['1 no 1 1000', '2 no 2 2000']);
    expect(done).toMatchObject({ attempts: 3, result: 'yes', duration: 3000 });
    expect(scheduler.job('flaky')).toMatchObject({ runs: 1, failures: 0, retries: 2, lastError: null });
    await scheduler.stop();
  });

  it('when every attempt fails: one failure, with the last error; maxRetryDelay and retryFactor', async () => {
    const clock = fakeClock(0);
    const failures = [];
    const scheduler = new Scheduler({ clock, onError: (err, job) => failures.push(`${err.message} ${job.retries}`) });
    const times = [];
    scheduler.add({
      name: 'broken',
      in: 0,
      retries: 4,
      retryDelay: 1000,
      retryFactor: 3,
      maxRetryDelay: '5s',
      run: ({ attempt }) => {
        times.push(clock.now());
        throw new Error(`attempt ${attempt}`);
      },
    });
    scheduler.start();
    await clock.advance(60000);
    // Waits of 1 s, 3 s, then 5 s (not 9 s), 5 s.
    expect(times).toEqual([0, 1000, 4000, 9000, 14000]);
    expect(failures).toEqual(['attempt 5 4']);
    expect(scheduler.job('broken')).toMatchObject({ runs: 0, failures: 1, retries: 4 });
    await scheduler.stop();
  });

  it('each attempt has its timeout; the job stays running (its times skipped) until the run ends', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    const reasons = [];
    scheduler.add({
      name: 'slow',
      every: '10s',
      timeout: '4s',
      retries: 1,
      retryDelay: '3s',
      run: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            reasons.push(`${signal.reason.name}@${clock.now()}`);
            reject(signal.reason);
          });
        }),
    });
    scheduler.start();
    await clock.advance(25000);
    // 10 s: attempts at 10 (timeout 14), 17 (timeout 21): 20 skipped; 30 not yet.
    expect(reasons).toEqual(['TimeoutError@14000', 'TimeoutError@21000']);
    expect(scheduler.job('slow')).toMatchObject({ failures: 1, skipped: 1, running: false });
    await scheduler.stop();
  });

  it('stop() ends a wait between attempts', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    let attempts = 0;
    scheduler.add({ name: 'x', in: 0, retries: 5, retryDelay: '1h', run: () => { attempts += 1; throw new Error('no'); } });
    scheduler.start();
    await clock.advance(10);
    expect(attempts).toBe(1);
    const started = Date.now();
    await scheduler.stop({ timeout: 5000 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(scheduler.job('x')).toMatchObject({ failures: 1, running: false });
    await clock.advance(7200000);
    expect(attempts).toBe(1);
  });

  it('the claim of the lock is kept through the attempts: no other scheduler runs that time', async () => {
    const clock = fakeClock(0);
    const lock = memoryLock({ now: () => 0 });
    const runs = [];
    const make = (machine) => {
      const scheduler = new Scheduler({ clock, lock });
      scheduler.add({
        name: 'job',
        every: '10s',
        retries: 2,
        retryDelay: '1s',
        run: ({ attempt, scheduledAt }) => {
          runs.push(`${machine} ${scheduledAt.getTime()} #${attempt}`);
          if (attempt === 1) throw new Error('first');
        },
      });
      return scheduler.start();
    };
    const a = make('a');
    const b = make('b');
    await clock.advance(10500);
    await clock.advance(1000);
    expect(runs).toEqual(['a 10000 #1', 'a 10000 #2']);
    await a.stop();
    await b.stop();
  });

  it('errors of the options', () => {
    const scheduler = new Scheduler();
    const run = () => {};
    expect(() => scheduler.add({ name: 'a', every: '1m', retries: -1, run })).toThrow(/whole number/);
    expect(() => scheduler.add({ name: 'a', every: '1m', retries: 1.5, run })).toThrow(/whole number/);
    expect(() => scheduler.add({ name: 'a', every: '1m', retryFactor: 0.5, run })).toThrow(/retryFactor/);
    expect(() => scheduler.add({ name: 'a', every: '1m', retryDelay: 'later', run })).toThrow(SchedulerError);
  });
});

describe('memoryHistory', () => {
  it('records every run: done, failed, timeout, with its attempts; the last first; keep', async () => {
    const clock = fakeClock(0);
    const history = memoryHistory({ keep: 3 });
    const scheduler = new Scheduler({ clock, history });
    let n = 0;
    scheduler.add({
      name: 'mixed',
      every: '10s',
      timeout: '2s',
      run: () => {
        n += 1;
        if (n === 2) throw new Error('second fails');
        if (n === 3) return new Promise(() => {}); // times out
        return n;
      },
    });
    scheduler.start();
    await clock.advance(40000);
    const runs = await scheduler.history('mixed', { limit: 10 });
    expect(runs.map((run) => `${run.scheduledAt.getTime()} ${run.status} ${run.error}`)).toEqual([
      '40000 done null',
      '30000 timeout The job mixed went over its timeout of 2000 ms',
      '20000 failed second fails',
    ]);
    expect(runs[1]).toMatchObject({ name: 'mixed', duration: 2000, attempts: 1, startedAt: new Date(30000) });
    expect(typeof runs[0].host).toBe('string');
    expect(history.last('mixed').scheduledAt).toEqual(new Date(40000));
    expect(history.last('none')).toBe(null);
    expect(await new Scheduler().history('mixed')).toEqual([]);
    await scheduler.stop();
  });
});

for (const backend of ['memory', 'sqlite']) {
  describe(`ormHistory (${backend})`, () => {
    let db;
    let history;

    beforeEach(async () => {
      db = new Database({ backend });
      history = ormHistory(db, { maxAge: null }); // the runs of these tests are of 1970
      await db.connect();
      await db.sync();
    });

    afterEach(async () => {
      await db.close();
    });

    it('records, lists (the last first, limit), last, and prunes runs older than maxAge', async () => {
      const entry = (name, at, status = 'done') => ({
        name,
        scheduledAt: new Date(at),
        startedAt: new Date(at + 5),
        duration: 12.4,
        status,
        attempts: 1,
        error: status === 'done' ? null : 'boom',
        host: 'h1',
      });
      await history.record(entry('a', 1000));
      await history.record(entry('a', 3000, 'failed'));
      await history.record(entry('a', 2000));
      await history.record(entry('b', 9000));
      const list = await history.list('a');
      expect(list.map((run) => run.scheduledAt.getTime())).toEqual([3000, 2000, 1000]);
      expect(list[0]).toEqual({ ...entry('a', 3000, 'failed'), duration: 12 });
      expect((await history.list('a', { limit: 1 })).length).toBe(1);
      expect((await history.last('a')).scheduledAt.getTime()).toBe(3000);
      expect(await history.last('none')).toBe(null);
      expect(await history.prune(new Date(2500))).toBe(2);
      expect((await history.list('a')).map((run) => run.scheduledAt.getTime())).toEqual([3000]);
      expect(await history.prune()).toBe(0); // maxAge: null keeps them
    });

    it('maxAge: runs older are deleted when one is recorded (at most once an hour)', async () => {
      const db2 = new Database({ backend });
      const aged = ormHistory(db2, { maxAge: '1h', table: 'runs_aged', model: 'AgedRun' });
      await db2.connect();
      await db2.sync();
      const at = (ms) => ({ name: 'x', scheduledAt: new Date(ms), startedAt: new Date(ms), duration: 1, status: 'done', attempts: 1, error: null, host: 'h' });
      await aged.record(at(Date.now() - 7200000)); // recorded, then pruned: older than an hour
      await aged.record(at(Date.now()));
      expect((await aged.list('x')).length).toBe(1);
      expect(await aged.prune()).toBe(0);
      await db2.close();
    });

    it('a scheduler records its runs in it', async () => {
      const clock = fakeClock(0);
      const scheduler = new Scheduler({ clock, history });
      scheduler.add({ name: 'tick', every: '1s', run: () => {} });
      scheduler.start();
      await clock.advance(3000);
      await scheduler.stop();
      await settle();
      expect((await history.list('tick')).map((run) => `${run.scheduledAt.getTime()} ${run.status}`)).toEqual([
        '3000 done',
        '2000 done',
        '1000 done',
      ]);
    });
  });
}

describe('catchUp', () => {
  it('the last time missed while stopped runs once when the scheduler starts', async () => {
    const history = memoryHistory();
    history.record({ name: 'hourly', scheduledAt: new Date(3600000), startedAt: new Date(3600000), status: 'done' });
    const clock = fakeClock(4 * 3600000 + 1234); // 2, 3 and 4 h were missed
    const scheduler = new Scheduler({ clock, history });
    const runs = [];
    const caught = [];
    scheduler.on('catchUp', (event) => caught.push(event.scheduledAt.getTime()));
    scheduler.add({ name: 'hourly', every: '1h', catchUp: true, run: ({ scheduledAt }) => runs.push(scheduledAt.getTime()) });
    scheduler.start();
    await clock.advance(10);
    expect(caught).toEqual([4 * 3600000]);
    expect(runs).toEqual([4 * 3600000]);
    await clock.advance(3600000);
    expect(runs).toEqual([4 * 3600000, 5 * 3600000]);
    await scheduler.stop();
  });

  it('nothing to catch up: no runs in the history (a new job), or none missed', async () => {
    const history = memoryHistory();
    const clock = fakeClock(4 * 3600000 + 1234);
    const scheduler = new Scheduler({ clock, history });
    const runs = [];
    scheduler.add({ name: 'new', every: '1h', catchUp: true, run: () => runs.push('new') });
    history.record({ name: 'fresh', scheduledAt: new Date(4 * 3600000), startedAt: new Date(4 * 3600000), status: 'done' });
    scheduler.add({ name: 'fresh', every: '1h', catchUp: true, run: () => runs.push('fresh') });
    scheduler.start();
    await clock.advance(10);
    expect(runs).toEqual([]);
    await scheduler.stop();
  });

  it('cron: the last time missed in its time zone', async () => {
    const history = memoryHistory();
    history.record({ name: 'report', scheduledAt: new Date('2026-10-05T06:00:00Z'), startedAt: new Date(0), status: 'done' });
    const clock = fakeClock(Date.parse('2026-10-08T12:00:00Z'));
    const scheduler = new Scheduler({ clock, history, timezone: 'Europe/Madrid' });
    const runs = [];
    scheduler.add({ name: 'report', cron: '0 8 * * mon-fri', catchUp: true, run: ({ scheduledAt }) => runs.push(scheduledAt.toISOString()) });
    scheduler.start();
    await clock.advance(10);
    expect(runs).toEqual(['2026-10-08T06:00:00.000Z']);
    await scheduler.stop();
  });

  it('several machines with the history and a lock in a database: one catches up', async () => {
    const db = new Database({ backend: 'sqlite' });
    const history = ormHistory(db, { maxAge: null });
    const lock = ormLock(db);
    await db.connect();
    await db.sync();
    await history.record({ name: 'job', scheduledAt: new Date(10000), startedAt: new Date(10000), duration: 1, status: 'done', attempts: 1, error: null, host: 'old' });
    const clock = fakeClock(45000);
    const runs = [];
    const schedulers = ['a', 'b', 'c'].map((machine) => {
      const scheduler = new Scheduler({ clock, history, lock });
      scheduler.add({ name: 'job', every: '10s', catchUp: true, run: ({ scheduledAt }) => runs.push(`${machine} ${scheduledAt.getTime()}`) });
      return scheduler.start();
    });
    await clock.advance(10);
    await settle();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatch(/^[abc] 40000$/);
    await Promise.all(schedulers.map((scheduler) => scheduler.stop()));
    await settle();
    expect((await history.last('job')).scheduledAt.getTime()).toBe(40000);
    await db.close();
  });

  it('errors: of jobs that cannot catch up, and without a history', () => {
    const run = () => {};
    const withHistory = new Scheduler({ history: memoryHistory() });
    expect(() => withHistory.add({ name: 'a', in: '1m', catchUp: true, run })).toThrow(/catchUp is of jobs of cron/);
    expect(() => withHistory.add({ name: 'a', every: '1m', align: false, catchUp: true, run })).toThrow(/catchUp is of/);
    expect(() => new Scheduler().add({ name: 'a', every: '1m', catchUp: true, run })).toThrow(/catchUp needs a history/);
  });
});
