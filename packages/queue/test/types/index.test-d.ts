import { expectType } from 'tsd';
import { Database } from '@xufa/orm';
import { Queue, Job, queuePlugin, Pipelines, StepStatus } from '../..';
import xufa from '@xufa/http';
import { usePool } from '@xufa/cluster';

const db = new Database({ backend: 'memory' });
const queue = new Queue(db, { attempts: 5, backoff: { delay: '10s', max: '1h' }, keepDone: true });
queue.define<{ userId: number }>('welcome', async (payload, job) => {
  expectType<number>(payload.userId);
  expectType<number>(job.attempts);
});
expectType<Promise<Job<{ userId: number }>>>(
  queue.enqueue('welcome', { userId: 1 }, { delay: '5m', key: 'welcome:1' })
);
expectType<Promise<{ done: number; retrying: number; failed: number }>>(queue.runDue());
queue.work({ concurrency: 4, queues: ['mail'] });
queue.define('convert', (payload, job) => job.node.url, { pool: usePool('converters'), timeout: '1m' });
queue.on('failed', (job, err) => {
  expectType<string>(job.name);
});
const app = xufa();
app.register(queuePlugin, { queue, work: { concurrency: 2 } });
expectType<Queue>(app.queue);

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
expectType<string[]>(pipelines.check({ name: 'x', steps: [] }));
(async () => {
  const run = await pipelines.start<number>('ingest', { url: 'x' }, { key: 'k' });
  expectType<number | null>(run.result);
  const state = await pipelines.get(run.pk);
  if (state) expectType<StepStatus>(state.steps.fetch.status);
  expectType<boolean>(await pipelines.retry(run.pk));
})();

// health() of the database and the queue, in xufa.health.
xufa().register(xufa.health, {
  checks: { database: db.health({ slow: '200ms' }), queue: queue.health({ maxLag: '1m', maxFailed: 0 }) },
});
expectType<boolean>(queue.health().critical);

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
    expectType<string | null>(state.run.parent);
    expectType<string | null>(state.steps.sub.child);
  }
})();
new Pipelines(queue, { maxDepth: 5 });
