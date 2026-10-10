// scheduler.health(): a check of xufa.health. Up while the jobs run when due; degraded when a job missed a run (in the
// history: no machine ran it; without one: the timers of this process are late), when its last runs failed (or timed
// out), or when a run goes on for longer than maxRun; each job's next and last runs in its details; and in an app.
import xufa from '@xufa/http';
import { Scheduler, memoryHistory, SchedulerError } from '../index.js';
import { fakeClock } from './clock.js';

const MINUTE = 60000;

describe('scheduler.health()', () => {
  it('up while the jobs run; each job with its next run, last run and status', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock, history: memoryHistory() });
    scheduler.add({ name: 'tick', every: '1m', run: () => 'ok' });
    scheduler.start();
    await clock.advance(3 * MINUTE + 10);
    const report = await scheduler.health().check();
    expect(report).toEqual({
      status: 'up',
      started: true,
      jobs: {
        tick: {
          schedule: 'every 1m',
          next: new Date(4 * MINUTE).toISOString(),
          running: false,
          lastRun: new Date(3 * MINUTE).toISOString(),
          lastStatus: 'done',
          failuresInRow: 0,
        },
      },
    });
    expect(scheduler.health().critical).toBe(false);
    expect(scheduler.health({ critical: true, timeout: '2s' })).toMatchObject({ critical: true, timeout: '2s' });
    await scheduler.stop();
  });

  it('a run no machine made (the history has none since): missed, once it is late', async () => {
    const clock = fakeClock(10 * MINUTE);
    const history = memoryHistory();
    // Another machine ran it at 9 and 10 min, then stopped; this process does not run it (stopped).
    history.record({
      name: 'sync',
      scheduledAt: new Date(9 * MINUTE),
      startedAt: new Date(9 * MINUTE),
      status: 'done',
    });
    history.record({
      name: 'sync',
      scheduledAt: new Date(10 * MINUTE),
      startedAt: new Date(10 * MINUTE),
      status: 'done',
    });
    const scheduler = new Scheduler({ clock, history });
    scheduler.add({ name: 'sync', every: '1m', run: () => 1 });
    const health = scheduler.health({ late: '30s' });
    expect((await health.check()).status).toBe('up');
    // 11 min was due; at 11:20 it is not late yet, at 11:40 it is.
    await clock.advance(MINUTE + 20000);
    expect((await health.check()).status).toBe('up');
    await clock.advance(20000);
    const late = await health.check();
    expect([late.status, late.error]).toEqual([
      'degraded',
      `sync missed its run of ${new Date(11 * MINUTE).toISOString()}`,
    ]);
    expect(late.jobs.sync).toMatchObject({ missed: new Date(11 * MINUTE).toISOString(), lastStatus: 'done' });
    // A machine runs it: up again.
    history.record({
      name: 'sync',
      scheduledAt: new Date(11 * MINUTE),
      startedAt: new Date(11 * MINUTE),
      status: 'done',
    });
    expect((await health.check()).status).toBe('up');
  });

  it('cron: missed in its time zone', async () => {
    const clock = fakeClock(Date.parse('2026-10-08T09:00:00Z'));
    const history = memoryHistory();
    history.record({
      name: 'report',
      scheduledAt: new Date('2026-10-07T06:00:00Z'),
      startedAt: new Date('2026-10-07T06:00:00Z'),
      status: 'done',
    });
    const scheduler = new Scheduler({ clock, history, timezone: 'Europe/Madrid' });
    scheduler.add({ name: 'report', cron: '0 8 * * mon-fri', run: () => 1 });
    const report = await scheduler.health({ late: '5m' }).check();
    expect(report.error).toBe('report missed its run of 2026-10-08T06:00:00.000Z');
  });

  it('the last runs failed (failures: how many in a row), in the history or in this process', async () => {
    const clock = fakeClock(0);
    const history = memoryHistory();
    const scheduler = new Scheduler({ clock, history });
    let n = 0;
    scheduler.add({
      name: 'flaky',
      every: '1m',
      run: () => {
        n += 1;
        if (n >= 2) throw new Error('the mail server is down');
      },
    });
    scheduler.start();
    await clock.advance(MINUTE + 10); // done
    expect((await scheduler.health().check()).status).toBe('up');
    await clock.advance(MINUTE); // failed
    const once = await scheduler.health().check();
    expect([once.status, once.error, once.jobs.flaky.failuresInRow]).toEqual([
      'degraded',
      'flaky failed its last run',
      1,
    ]);
    // Allowing two in a row: up until the second.
    expect((await scheduler.health({ failures: 2 }).check()).status).toBe('up');
    await clock.advance(MINUTE);
    expect((await scheduler.health({ failures: 2 }).check()).error).toBe('flaky failed its last 2 runs');
    await scheduler.stop();

    // Without a history: the failures of this process.
    const local = new Scheduler({ clock: fakeClock(0) });
    local.add({ name: 'broken', every: '1m', timeout: '1s', run: () => new Promise(() => {}) });
    local.start();
    await local.clock.advance(MINUTE + 2000);
    const report = await local.health().check();
    expect([report.status, report.jobs.broken.lastStatus]).toEqual(['degraded', 'failed']);
    await local.stop();
  });

  it('maxRun: a run that goes on for too long; jobs: only those named', async () => {
    const clock = fakeClock(0);
    const scheduler = new Scheduler({ clock });
    let finish;
    scheduler.add({ name: 'import', every: '1h', run: () => new Promise((resolve) => (finish = resolve)) });
    scheduler.add({ name: 'other', every: '1h', run: () => new Promise(() => {}) });
    scheduler.start();
    await clock.advance(3600000 + 10 * MINUTE);
    const report = await scheduler.health({ maxRun: '5m', jobs: ['import'] }).check();
    expect([report.status, report.error, Object.keys(report.jobs)]).toEqual([
      'degraded',
      'import runs for 600 s',
      ['import'],
    ]);
    expect(report.jobs.import.running).toBe(true);
    finish();
    await clock.advance(10);
    expect((await scheduler.health({ maxRun: '5m', jobs: ['import'] }).check()).status).toBe('up');
    expect(() => scheduler.health({ failures: 0 })).toThrow(SchedulerError);
    await expect(scheduler.health({ jobs: ['nope'] }).check()).rejects.toThrow('there is no job nope');
    await scheduler.stop({ timeout: 0 });
  });

  it('in an app: a check of xufa.health', async () => {
    const scheduler = new Scheduler({ history: memoryHistory() });
    scheduler.add({ name: 'tick', every: '1h', run: () => 1 });
    const app = xufa();
    app.register(xufa.health, { cache: 0, checks: { scheduler: scheduler.health() } });
    await app.ready();
    const report = (await app.inject('/health')).json();
    expect(report.checks.scheduler).toMatchObject({ status: 'up', critical: false, details: { started: false } });
    await app.close();
  });
});
