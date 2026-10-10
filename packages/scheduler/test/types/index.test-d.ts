import { expectType, expectError } from 'tsd';
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
expectType<Scheduler>(createScheduler());

expectType<JobInfo>(scheduler.add({ name: 'cleanup', every: '10m', run: async ({ signal }) => signal.aborted }));
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
    expectType<RunContext<{ table: string }>>(context);
    expectType<string>(context.data.table);
    expectType<Date>(context.scheduledAt);
  },
});
expectError(scheduler.add({ name: 'x', every: '1m', overlap: 'queue', run: () => {} }));
expectError(scheduler.add({ name: 'x', every: '1m' }));

expectType<JobInfo | null>(scheduler.job('cleanup'));
expectType<Date | null>(scheduler.jobs()[0].next);
expectType<boolean>(scheduler.remove('cleanup'));
expectType<Scheduler>(scheduler.start());
expectType<Promise<void>>(scheduler.stop({ timeout: '5s' }));
expectType<Promise<number | undefined>>(scheduler.runNow<number>('report'));

scheduler.on('failure', (event) => {
  expectType<string>(event.name);
  expectType<unknown>(event.error);
});
scheduler.on('skip', (event) => {
  expectType<'running' | 'locked'>(event.why);
});

expectType<Lock>(memoryLock());
const lock = ormLock({}, { table: 'locks' });
expectType<OrmLock>(lock);
expectType<Promise<void>>(lock.sync());
expectType<Date[]>(nextRuns('@daily', 3, { timezone: 'UTC' }));
expectType<number>(toMs('1h30m'));
expectType<'XUFA_SCHEDULER_ERR'>(new SchedulerError('x').code);
expectType<'XUFA_SCHEDULER_TIMEOUT'>(new TimeoutError('x').code);
expectType<void>(schedulerPlugin({}, { jobs: [{ name: 'x', every: '1m', run: () => {} }], start: false }, () => {}));

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
  run: ({ attempt }) => expectType<number>(attempt),
});
expectError(recorded.add({ name: 'x', in: '1m', catchUp: true, run: () => {} }));
expectType<Promise<HistoryEntry[]>>(recorded.history('retried', { limit: 5 }));
recorded.on('retry', (event) => expectType<number>(event.delay));
recorded.on('catchUp', (event) => expectType<Date>(event.scheduledAt));
recorded.on('done', (event) => expectType<number>(event.attempts));
expectType<History>(memoryHistory());
const runs = ormHistory({}, { maxAge: null });
expectType<OrmHistory>(runs);
expectType<Promise<number>>(runs.prune(new Date()));
expectType<Promise<HistoryEntry | null>>(runs.last('x'));
expectType<'done' | 'failed' | 'timeout'>({} as HistoryEntry['status']);
expectType<number>(scheduler.job('x')!.retries);

// health(): a check of xufa.health.
{
  const watched = new Scheduler();
  const health = watched.health({ late: '30s', failures: 2, maxRun: '10m', jobs: ['report'], critical: true });
  health.check().then((report) => {
    expectType<'up' | 'degraded' | 'down'>(report.status);
    expectType<number>(report.jobs.report.failuresInRow);
  });
  expectError(watched.health({ failures: 'two' }));
}
