import { expectTypeOf } from '@xufa/test';
import { Database } from '@xufa/orm';
import { Queue, Job, queuePlugin, Pipelines, StepStatus } from '../..';
import xufa from '@xufa/http';
import { usePool } from '@xufa/cluster';
import { Scheduler } from '@xufa/scheduler';

const db = new Database({ backend: 'memory' });
const queue = new Queue(db, { attempts: 5, backoff: { delay: '10s', max: '1h' }, keepDone: true });
queue.define<{ userId: number }>('welcome', async (payload, job) => {
  expectTypeOf(payload.userId).toEqualTypeOf<number>();
  expectTypeOf(job.attempts).toEqualTypeOf<number>();
});
expectTypeOf(queue.enqueue('welcome', { userId: 1 }, { delay: '5m', key: 'welcome:1' })).toEqualTypeOf<Promise<Job<{ userId: number }>>>();
expectTypeOf(queue.runDue()).toEqualTypeOf<Promise<{ done: number; retrying: number; failed: number }>>();
queue.work({ concurrency: 4, queues: ['mail'] });
queue.define('convert', (payload, job) => job.node.url, { pool: usePool('converters'), timeout: '1m' });
queue.on('failed', (job, err) => {
  expectTypeOf(job.name).toEqualTypeOf<string>();
});
const app = xufa();
app.register(queuePlugin, { queue, work: { concurrency: 2 } });
expectTypeOf(app.queue).toEqualTypeOf<Queue>();

const pipelines = new Pipelines(queue);
pipelines.block('fetch', { timeout: '1m', run: async (input: { url: string }, ctx) => ctx.config.size });
pipelines.block('approve', (input, ctx) => ctx.wait());
pipelines.define({
  name: 'ingest',
  trigger: 'document.uploaded',
  steps: [
    { id: 'fetch', block: 'fetch' },
    {
      id: 'report',
      block: 'transform',
      after: ['fetch'],
      when: 'input > 0',
      config: { value: 'input * 2' },
      result: true,
    },
  ],
});
expectTypeOf(pipelines.check({ name: 'x', steps: [] })).toEqualTypeOf<string[]>();
(async () => {
  const run = await pipelines.start<number>('ingest', { url: 'x' }, { key: 'k' });
  expectTypeOf(run.result).toEqualTypeOf<number | null>();
  const state = await pipelines.get(run.pk);
  if (state) expectTypeOf(state.steps.fetch.status).toEqualTypeOf<StepStatus>();
  expectTypeOf(await pipelines.retry(run.pk)).toEqualTypeOf<boolean>();
})();

// health() of the database and the queue, in xufa.health.
xufa().register(xufa.health, {
  checks: { database: db.health({ slow: '200ms' }), queue: queue.health({ maxLag: '1m', maxFailed: 0 }) },
});
expectTypeOf(queue.health().critical).toEqualTypeOf<boolean>();

pipelines.define({
  name: 'limited',
  concurrency: 2,
  steps: [
    { id: 'approve', block: 'wait', waitTimeout: '24h', onTimeout: { output: { approved: false } } },
    { id: 'ask', run: (input, ctx) => ctx.wait({ timeout: '1h', onTimeout: 'skip' }), after: 'approve' },
  ],
});

pipelines.define({
  name: 'outer',
  steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'limited', input: '{ n: input }' }, waitTimeout: '1h' }],
});
(async () => {
  const state = await pipelines.get(1);
  if (state) {
    expectTypeOf(state.run.parent).toEqualTypeOf<string | null>();
    expectTypeOf(state.steps.sub.child).toEqualTypeOf<string | null>();
  }
})();
new Pipelines(queue, { maxDepth: 5 });

// Tasks, and runs that start later, with a priority, in a queue.
{
  const tasks = new Pipelines(new Queue(new Database()));
  tasks.task('monthly-report', async (input: { month: number }) => ({ file: `report-${input.month}` }), {
    attempts: 3,
    description: 'The report of a month',
  });
  tasks.start('monthly-report', { month: 10 }, { delay: '1h', priority: 5, queue: 'reports' }).then((run) => {
    expectTypeOf(run.priority).toEqualTypeOf<number>();
    expectTypeOf(run.runAt).toEqualTypeOf<Date | null>();
  });
  tasks.start('monthly-report', { month: 11 }, { at: new Date() });
  // @ts-expect-error
  tasks.start('monthly-report', null, { at: new Date(), delay: '1h' });
  // @ts-expect-error
  tasks.task('x', 'not a function');
  const scheduler = new Scheduler();
  tasks.schedule(scheduler, 'monthly-report', {
    cron: '0 6 1 * *',
    timezone: 'Europe/Madrid',
    input: ({ scheduledAt }: { scheduledAt: Date }) => ({ month: scheduledAt.getMonth() + 1 }),
    priority: 2,
  });
  expectTypeOf(tasks.schedules.get('monthly-report')?.trigger).toEqualTypeOf<string | undefined>();
  // @ts-expect-error
  tasks.schedule(scheduler, 'monthly-report');
}
