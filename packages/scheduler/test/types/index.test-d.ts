import { expectTypeOf } from '@xufa/test';
import {
  Scheduler,
  createScheduler,
  schedulerPlugin,
  memoryLock,
  ormLock,
  memoryHistory,
  ormHistory,
  History,
  OrmHistory,
  HistoryEntry,
  nextRuns,
  toMs,
  JobInfo,
  Lock,
  OrmLock,
  RunContext,
  SchedulerError,
  TimeoutError,
} from '../..';

const scheduler = new Scheduler({ timezone: 'Europe/Madrid', lock: memoryLock(), onError: (err, job) => job.failures });
expectTypeOf(createScheduler()).toEqualTypeOf<Scheduler>();

expectTypeOf(scheduler.add({ name: 'cleanup', every: '10m', run: async ({ signal }) => signal.aborted })).toEqualTypeOf<JobInfo>();
scheduler.add({
  name: 'report',
  cron: '0 8 * * mon-fri',
  timezone: 'UTC',
  timeout: '5m',
  overlap: 'wait',
  run: () => {},
});
scheduler.add({ name: 'once', at: new Date(), run: () => {} });
scheduler.add({ name: 'soon', in: 30000, immediate: true, lock: false, run: () => {} });
scheduler.add({
  name: 'typed',
  every: 1000,
  data: { table: 'sessions' },
  run: (context) => {
    expectTypeOf(context).toEqualTypeOf<RunContext<{ table: string }>>();
    expectTypeOf(context.data.table).toEqualTypeOf<string>();
    expectTypeOf(context.scheduledAt).toEqualTypeOf<Date>();
  },
});
// @ts-expect-error
scheduler.add({ name: 'x', every: '1m', overlap: 'queue', run: () => {} });
// @ts-expect-error
scheduler.add({ name: 'x', every: '1m' });

expectTypeOf(scheduler.job('cleanup')).toEqualTypeOf<JobInfo | null>();
expectTypeOf(scheduler.jobs()[0].next).toEqualTypeOf<Date | null>();
expectTypeOf(scheduler.remove('cleanup')).toEqualTypeOf<boolean>();
expectTypeOf(scheduler.start()).toEqualTypeOf<Scheduler>();
expectTypeOf(scheduler.stop({ timeout: '5s' })).toEqualTypeOf<Promise<void>>();
expectTypeOf(scheduler.runNow<number>('report')).toEqualTypeOf<Promise<number | undefined>>();

scheduler.on('failure', (event) => {
  expectTypeOf(event.name).toEqualTypeOf<string>();
  expectTypeOf(event.error).toEqualTypeOf<unknown>();
});
scheduler.on('skip', (event) => {
  expectTypeOf(event.why).toEqualTypeOf<'running' | 'locked'>();
});

expectTypeOf(memoryLock()).toEqualTypeOf<Lock>();
const lock = ormLock({}, { table: 'locks' });
expectTypeOf(lock).toEqualTypeOf<OrmLock>();
expectTypeOf(lock.sync()).toEqualTypeOf<Promise<void>>();
expectTypeOf(nextRuns('@daily', 3, { timezone: 'UTC' })).toEqualTypeOf<Date[]>();
expectTypeOf(toMs('1h30m')).toEqualTypeOf<number>();
expectTypeOf(new SchedulerError('x').code).toEqualTypeOf<'XUFA_SCHEDULER_ERR'>();
expectTypeOf(new TimeoutError('x').code).toEqualTypeOf<'XUFA_SCHEDULER_TIMEOUT'>();
expectTypeOf(schedulerPlugin({}, { jobs: [{ name: 'x', every: '1m', run: () => {} }], start: false }, () => {})).toEqualTypeOf<void>();

// Retries, history, catchUp.
const recorded = new Scheduler({ history: memoryHistory({ keep: 10 }) });
recorded.add({
  name: 'retried',
  cron: '@hourly',
  catchUp: true,
  retries: 3,
  retryDelay: '2s',
  retryFactor: 3,
  maxRetryDelay: '1m',
  run: ({ attempt }) => expectTypeOf(attempt).toEqualTypeOf<number>(),
});
// @ts-expect-error
recorded.add({ name: 'x', in: '1m', catchUp: true, run: () => {} });
expectTypeOf(recorded.history('retried', { limit: 5 })).toEqualTypeOf<Promise<HistoryEntry[]>>();
recorded.on('retry', (event) => expectTypeOf(event.delay).toEqualTypeOf<number>());
recorded.on('catchUp', (event) => expectTypeOf(event.scheduledAt).toEqualTypeOf<Date>());
recorded.on('done', (event) => expectTypeOf(event.attempts).toEqualTypeOf<number>());
expectTypeOf(memoryHistory()).toEqualTypeOf<History>();
const runs = ormHistory({}, { maxAge: null });
expectTypeOf(runs).toEqualTypeOf<OrmHistory>();
expectTypeOf(runs.prune(new Date())).toEqualTypeOf<Promise<number>>();
expectTypeOf(runs.last('x')).toEqualTypeOf<Promise<HistoryEntry | null>>();
expectTypeOf({} as HistoryEntry['status']).toEqualTypeOf<'done' | 'failed' | 'timeout'>();
expectTypeOf(scheduler.job('x')!.retries).toEqualTypeOf<number>();

// health(): a check of xufa.health.
{
  const watched = new Scheduler();
  const health = watched.health({ late: '30s', failures: 2, maxRun: '10m', jobs: ['report'], critical: true });
  health.check().then((report) => {
    expectTypeOf(report.status).toEqualTypeOf<'up' | 'degraded' | 'down'>();
    expectTypeOf(report.jobs.report.failuresInRow).toEqualTypeOf<number>();
  });
  // @ts-expect-error
  watched.health({ failures: 'two' });
}
