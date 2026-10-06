// The scheduler on a clock of its own (the time moves when the test says): when jobs run (every aligned or not,
// cron, at, in, immediate), overlaps (skip, wait, allow), timeouts, failures that stop no other job, stop(), runNow(),
// long waits, and the events and state of the jobs.
const { Scheduler, SchedulerError, TimeoutError } = require('..');

const flush = () => new Promise((resolve) => setImmediate(resolve));

// A clock whose time moves by advance(ms), running the timers due on the way, in order.
function fakeClock(start = 0) {
  let now = start;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + Math.max(0, ms), fn, id: seq, ms });
      return seq;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await flush();
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
      await flush();
    },
    longest: () => Math.max(0, ...[...timers.values()].map((timer) => timer.ms)),
    sleep(ms) {
      return new Promise((resolve) => this.setTimeout(resolve, ms));
    },
  };
}

describe('when jobs run', () => {
  it('every is aligned to the clock; align: false counts from the start', async () => {
    const clock = fakeClock(3000);
    const scheduler = new Scheduler({ clock });
    const aligned = [];
    const counted = [];
    scheduler.add({ name: 'aligned', every: '10s', run: ({ scheduledAt }) => aligned.push(scheduledAt.getTime()) });
    scheduler.add({ name: 'counted', every: 10000, align: false, run: () => counted.push(clock.now()) });
    scheduler.start();
    expect(scheduler.job('aligned').next.getTime()).toBe(10000);
    await clock.advance(30000);
    expect(aligned).toEqual([10000, 20000, 30000]);
    expect(counted).toEqual([13000, 23000, 33000]); // from the start at 3 s
    await clock.advance(5000);
    expect(aligned).toEqual([10000, 20000, 30000]);
    expect(counted).toEqual([13000, 23000, 33000]);
    expect(scheduler.job('aligned')).toMatchObject({ runs: 3, failures: 0, skipped: 0, running: false });
    await scheduler.stop();
  });

  it('cron, in a time zone', async () => {
    const clock = fakeClock(Date.parse('2026-10-09T05:59:00Z'));
    const scheduler = new Scheduler({ clock, timezone: 'Europe/Madrid' });
    const runs = [];
    scheduler.add({ name: 'report', cron: '0 8 * * mon-fri', run: ({ scheduledAt }) => runs.push(scheduledAt.toISOString()) });
    scheduler.start();
    expect(scheduler.job('report').schedule).toBe('cron 0 8 * * mon-fri (Europe/Madrid)');
    await clock.advance(4 * 86400000);
    expect(runs).toEqual(['2026-10-09T06:00:00.000Z', '2026-10-12T06:00:00.000Z']);
    await scheduler.stop();
  });

  it('an hour that repeats (the clock goes back) runs once', async () => {
    const clock = fakeClock(Date.parse('2026-10-24T22:00:00Z'));
    const scheduler = new Scheduler({ clock });
    const runs = [];
    scheduler.add({ name: 'night', cron: '30 2 * * *', timezone: 'Europe/Madrid', run: ({ scheduledAt }) => runs.push(scheduledAt.toISOString()) });
    scheduler.start();
    await clock.advance(2 * 86400000);
    expect(runs).toEqual(['2026-10-25T00:30:00.000Z', '2026-10-26T01:30:00.000Z']);
    await scheduler.stop();
  });

  it('at and in run once; immediate runs at the start too', async () => {
    const clock = fakeClock(1000);
    const scheduler = new Scheduler({ clock });
    const seen = [];
    scheduler.add({ name: 'at', at: new Date(5000), run: () => seen.push(`at ${clock.now()}`) });
    scheduler.add({ name: 'in', in: '2s', run: () => seen.push(`in ${clock.now()}`) });
    scheduler.add({ name: 'past', at: '1970-01-01T00:00:00.500Z', run: () => seen.push(`past ${clock.now()}`) });
    scheduler.add({ name: 'now', every: '1h', immediate: true, run: () => seen.push(`now ${clock.now()}`) });
    scheduler.start();
    await clock.advance(10000);
    expect(seen).toEqual(['now 1000', 'past 1000', 'in 3000', 'at 5000']);
    expect(scheduler.job('at')).toMatchObject({ next: null, runs: 1 });
    await clock.advance(10000);
    expect(seen).toHaveLength(4);
    await scheduler.stop();
  });

  it('jobs added after the start, removed, and the errors of add()', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock }).start();
    const runs = [];
    scheduler.add({ name: 'late', every: '1s', run: () => runs.push(clock.now()) });
    await clock.advance(2500);
    expect(runs).toEqual([1000, 2000]);
    expect(scheduler.remove('late')).toBe(true);
    expect(scheduler.remove('late')).toBe(false);
    await clock.advance(5000);
    expect(runs).toEqual([1000, 2000]);
    const run = () => {};
    scheduler.add({ name: 'one', every: '1m', run });
    for (const [spec, message] of [
      [{ name: 'one', every: '1m', run }, /already a job one/],
      [{ every: '1m', run }, /has a name/],
      [{ name: 'x', every: '1m' }, /no run function/],
      [{ name: 'x', run }, /one of every, cron, at or in \(it has 0\)/],
      [{ name: 'x', every: '1m', cron: '* * * * *', run }, /it has 2/],
      [{ name: 'x', every: 'often', run }, /'often' is not a duration/],
      [{ name: 'x', every: '1m', overlap: 'queue', run }, /overlap of x is skip, wait, allow/],
      [{ name: 'x', at: 'someday', run }, /not a date/],
      [{ name: 'x', cron: '0 0 30 2 *', run }, /never runs/],
    ]) {
      expect(() => scheduler.add(spec)).toThrow(message);
      expect(() => scheduler.add(spec)).toThrow(SchedulerError);
    }
    expect(scheduler.jobs().map((job) => job.name)).toEqual(['one']);
    await scheduler.stop();
  });

  it('waits longer than the longest timeout of Node.js are made of several', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    const runs = [];
    scheduler.add({ name: 'far', in: '40d', run: () => runs.push(clock.now()) });
    scheduler.start();
    expect(clock.longest()).toBe(2147483647);
    await clock.advance(39 * 86400000);
    expect(runs).toEqual([]);
    await clock.advance(86400000);
    expect(runs).toEqual([40 * 86400000]);
    await scheduler.stop();
  });
});

describe('runs', () => {
  it('overlap skip (the default): a time while a run goes on is left out', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    const skips = [];
    scheduler.on('skip', (event) => skips.push(`${event.why} ${event.scheduledAt.getTime()}`));
    let started = 0;
    scheduler.add({
      name: 'slow',
      every: '10s',
      run: async () => {
        started += 1;
        await clock.sleep(25000);
      },
    });
    scheduler.start();
    await clock.advance(60000);
    // 10 s (to 35 s: 20 and 30 skipped), 40 s (to 65 s: 50 and 60 skipped).
    expect(started).toBe(2);
    expect(skips).toEqual(['running 20000', 'running 30000', 'running 50000', 'running 60000']);
    expect(scheduler.job('slow')).toMatchObject({ runs: 1, skipped: 4, running: true });
    await scheduler.stop({ timeout: 0 });
  });

  it('overlap wait: the times while a run goes on are one run, when it ends', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    const starts = [];
    scheduler.add({
      name: 'slow',
      every: '10s',
      overlap: 'wait',
      run: async ({ scheduledAt }) => {
        starts.push(`${scheduledAt.getTime()}@${clock.now()}`);
        await clock.sleep(25000);
      },
    });
    scheduler.start();
    await clock.advance(61000);
    // 20 and 30 are one run, when the first ends (35 s); 40 and 50 one too, at 60 s (60 itself is skipped: running).
    expect(starts).toEqual(['10000@10000', '30000@35000', '50000@60000']);
    await scheduler.stop({ timeout: 0 });
  });

  it('overlap allow: runs at once', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    let most = 0;
    let now = 0;
    scheduler.add({
      name: 'many',
      every: '10s',
      overlap: 'allow',
      run: async () => {
        now += 1;
        most = Math.max(most, now);
        await clock.sleep(25000);
        now -= 1;
      },
    });
    scheduler.start();
    await clock.advance(60000);
    expect(most).toBe(3);
    await scheduler.stop({ timeout: 0 });
  });

  it('timeout: the signal is aborted with a TimeoutError, the run fails and the job is free', async () => {
    const clock = fakeClock(0);
    const errors = [];
    const scheduler = new Scheduler({ clock, onError: (err, job) => errors.push(`${job.name}: ${err.name}`) });
    const reasons = [];
    let runs = 0;
    scheduler.add({
      name: 'stuck',
      every: '10s',
      timeout: '3s',
      run: ({ signal }) => {
        runs += 1;
        signal.addEventListener('abort', () => reasons.push(signal.reason));
        return new Promise(() => {}); // never ends
      },
    });
    scheduler.start();
    await clock.advance(25000);
    expect(runs).toBe(2);
    expect(reasons).toHaveLength(2);
    expect(reasons[0]).toBeInstanceOf(TimeoutError);
    expect(reasons[0].message).toBe('The job stuck went over its timeout of 3000 ms');
    expect(errors).toEqual(['stuck: TimeoutError', 'stuck: TimeoutError']);
    expect(scheduler.job('stuck')).toMatchObject({ failures: 2, skipped: 0, running: false, lastDuration: 3000 });
    await scheduler.stop();
  });

  it('a failure stops no other job, nor the next runs of its job; events and the logger', async () => {
    const clock = fakeClock(0);
    const logged = [];
    const logger = {
      debug: () => {},
      warn: () => {},
      error: (obj, msg) => logged.push(`${msg} (${obj.err.message})`),
    };
    const scheduler = new Scheduler({ clock, logger, onError: () => { throw new Error('onError fails too'); } });
    const events = [];
    for (const name of ['run', 'done', 'failure']) scheduler.on(name, (event) => events.push(`${name} ${event.name}`));
    let fine = 0;
    let calls = 0;
    scheduler.add({ name: 'bad', every: '1s', run: () => { calls += 1; throw new Error(`boom ${calls}`); } });
    scheduler.add({ name: 'good', every: '1s', run: async () => { fine += 1; return 'ok'; } });
    scheduler.start();
    await clock.advance(3000);
    expect(fine).toBe(3);
    expect(calls).toBe(3);
    expect(logged).toEqual(['Job bad failed (boom 1)', 'Job bad failed (boom 2)', 'Job bad failed (boom 3)']);
    expect(events.slice(0, 4)).toEqual(['run bad', 'failure bad', 'run good', 'done good']);
    const bad = scheduler.job('bad');
    expect(bad).toMatchObject({ runs: 0, failures: 3 });
    expect(bad.lastError.message).toBe('boom 3');
    expect(scheduler.job('good')).toMatchObject({ runs: 3, failures: 0, lastError: null });
    await scheduler.stop();
  });

  it('runNow(): the result, or what the run throws; skipped while a run goes on', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    let release;
    scheduler.add({ name: 'sum', every: '1h', data: { a: 2 }, run: ({ data }) => data.a + 3 });
    scheduler.add({ name: 'bad', every: '1h', run: () => Promise.reject(new Error('nope')) });
    scheduler.add({ name: 'held', every: '1h', run: () => new Promise((resolve) => { release = resolve; }) });
    expect(await scheduler.runNow('sum')).toBe(5);
    await expect(scheduler.runNow('bad')).rejects.toThrow('nope');
    await expect(scheduler.runNow('none')).rejects.toThrow(/no job none/);
    const first = scheduler.runNow('held');
    await flush();
    expect(await scheduler.runNow('held')).toBe(undefined);
    expect(scheduler.job('held').skipped).toBe(1);
    release('done');
    expect(await first).toBe('done');
  });

  it('stop() waits for the runs going on, and aborts those that go over its timeout', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    let finished = false;
    let aborted = null;
    scheduler.add({
      name: 'polite',
      every: '1s',
      run: () => new Promise((resolve) => setTimeout(() => { finished = true; resolve(); }, 30)),
    });
    scheduler.add({
      name: 'rude',
      every: '1s',
      run: ({ signal }) => new Promise(() => signal.addEventListener('abort', () => { aborted = signal.reason; })),
    });
    scheduler.start();
    await clock.advance(1000);
    await scheduler.stop({ timeout: 100 });
    expect(finished).toBe(true);
    expect(aborted.message).toBe('The scheduler stopped');
    expect(scheduler.jobs().every((job) => job.next === null)).toBe(true);
    await clock.advance(10000);
    expect(scheduler.job('polite').runs).toBe(1);
  });
});
