# @xufa/queue

Jobs in the background, kept in a database of [@xufa/orm](../orm) (SQLite, PostgreSQL, MongoDB, files or memory): the
queues of Laravel and Rails' Active Job, with no dependencies and no Redis. Workers run on any process or machine that
has the database, each job once; jobs that fail are tried again with backoff; and a job enqueued in a transaction is
there only when the transaction commits, with the data it was enqueued for. Pipelines run graphs of steps as its
jobs, each run and step kept in the database.

Its documentation is in [docs/queue/](../../docs/queue/index.html). This file is the summary.

```sh
npm install @xufa/queue
```

```js
const { Database } = require('@xufa/orm');
const { Queue } = require('@xufa/queue');

const db = new Database({ backend: 'postgres', url: process.env.DATABASE_URL });
const queue = new Queue(db); // its model (table xufa_jobs) is registered in db: db.sync() makes it

queue.define('welcome', async ({ userId }, job) => sendWelcome(userId, { signal: job.signal }), {
  attempts: 5, // runs before it is failed (3)
  backoff: { delay: '10s', max: '1h' }, // exponential, with jitter (5 s to 1 h by default)
  timeout: '30s', // a run longer is failed and its signal aborted ('5m')
});

await db.transaction(async () => {
  const user = await User.objects.create({ email });
  await queue.enqueue('welcome', { userId: user.pk }); // committed with the user, or not at all
});
await queue.enqueue('report', { month: 10 }, { delay: '10m', priority: 5, queue: 'reports', key: 'report:10' });

queue.work({ concurrency: 4, queues: ['default', 'reports'] }); // a worker: in this process, or in others
```

- `enqueue(name, payload, options)`: `delay` ('10m') or `at` (a Date), `priority` (higher first), `queue`,
  `attempts`, and `key`: while a job with that key is pending or running, enqueue gives it instead of adding another.
- Workers claim each job with an update only one of them can make (a pending job to running), so a job runs once
  among every worker; they look for jobs every `poll` (1 s), and at once when their process enqueues one. A job whose
  worker died while it ran (past its `lockedUntil`: its timeout and 30 s) is taken back by the others.
- A job that fails is tried again after its backoff, up to its attempts, and then kept as `failed` with its error
  (`lastError`); `queue.retry()` takes failed jobs back. Done jobs are deleted, or kept with their results
  (`keepDone: true`).
- `queue.jobs` is the queryset of the jobs (`queue.jobs.filter({ status: 'failed' })`), `queue.counts()` counts them
  by status, and the queue emits `completed`, `retrying` and `failed`.
- `define(name, handler, { pool })` with a pool of nodes of [@xufa/cluster](../cluster) (servers that take a few
  tasks at once each): its jobs wait (pending) for a free node before they are claimed, run with `job.node`, and
  their `job.signal` is aborted when the pool takes the node back.
- `queue.health({ maxLag, maxPending, maxFailed })`: a check of `xufa.health` of [@xufa/http](../http): the counts,
  the lag of the oldest job due and the workers; degraded past `maxLag` ('5m') or the others, down when the jobs
  cannot be read; not critical by default.
- `queue.runDue()` runs the jobs due now, one after another, without workers: for tests and scripts.
- `onFailure(job, err, final)` (an option of `define`) is waited for when a run fails, before the job is tried again
  or failed.
- `queue.stop()` stops the workers, waiting for the jobs they run.

## Pipelines

Graphs of steps run as jobs of the queue, each run and each of its steps kept in the database. A pipeline is data (it
can be stored, edited and shown): steps that run a block (a kind of work registered by code) with their config, after
other steps (fan out, join), when a condition holds, and whose outputs make the result of the run.

```js
const { Pipelines } = require('@xufa/queue');

const pipelines = new Pipelines(queue); // its models (xufa_pipeline_runs, xufa_pipeline_steps) registered in db
pipelines.block('fetch', async (input, { signal }) => fetchDocument(input.url, { signal }));
pipelines.block('extract', {
  pool: converters,
  timeout: '2m',
  attempts: 3,
  run: (document, { config, node }) => convert(node, config.format, document),
});

pipelines.define({
  name: 'ingest',
  trigger: 'document.uploaded',
  steps: [
    { id: 'document', block: 'fetch' },
    { id: 'text', block: 'extract', after: 'document', config: { format: 'text' } },
    { id: 'pdf', block: 'extract', after: 'document', config: { format: 'pdf' }, when: 'input.pages >= 2' },
    { id: 'publish', block: 'transform', after: ['text', 'pdf'], config: { map: { words: 'input.text.words' } } },
  ],
});

const run = await pipelines.start('ingest', { url }); // or pipelines.trigger('document.uploaded', { url })
const { run: state, steps } = await pipelines.get(run.pk); // statuses, outputs, errors, attempts
```

- Each step is a job (its block's `attempts`, `backoff`, `timeout`, `queue`, `pool`), so the steps of a run go to
  every worker of every machine with the database. Its input is the run's input (no `after`), the output of the step
  before (one), or the outputs by step (a join).
- `when`: an expression of [@xufa/expression](../expression) over `input`, `outputs`, `run` and `config` (or a
  function, in code). A step whose condition is false is skipped, and so is a step after only skipped steps.
- The result: the outputs of the steps with `result: true` (merged), or the output of the last step.
- `concurrency: n` in a pipeline: at most `n` steps of a run queued or running at once, among every worker (paused
  ones do not count). `waitTimeout` ('24h') in a step: how long it can be paused, then `onTimeout`: `'fail'` (its run
  fails), `'skip'` (its branch is skipped) or `{ output }` (it goes on with it); `ctx.wait({ timeout, onTimeout })` too.
- Blocks built in: `transform` (`config.map` of expressions, or `config.value`) and `wait`: paused until
  `pipelines.resume(runId, stepId, output)` (an approval, a callback). A block can also give `ctx.wait()`. And
  `pipeline`: runs another pipeline (`config.pipeline`, with the step's input or `config.input`, an expression) and
  waits for it as a paused step, its result the step's output; a child that fails or is cancelled fails the step, the
  step's `waitTimeout` holds (and cancels the child), cancelling a run cancels its children, and `maxDepth` (10) stops
  cycles.
- `cancel(runId)`, `retry(runId)` (a failed run goes on from the step that failed; steps done are not run again),
  `recover()` (runs whose process stopped between two steps), `check(definition)` (every error: blocks that are not
  there, steps after steps that are not there, cycles, conditions that do not parse, `validate(config)` of blocks).
- Every change of a step or run is an update made from the status it expects: two branches that end at once do not
  overwrite each other, and a step whose job runs twice runs once. A run keeps the definition it started with.
- Events: `started`, `step` (run, step, status), `completed`, `failed`.

## With @xufa/http

```js
const { queuePlugin } = require('@xufa/queue');

app.register(queuePlugin, { queue, work: { concurrency: 4 } }); // work: leave it out in processes that only enqueue
app.post('/signup', async (request, reply) => {
  await app.queue.enqueue('welcome', { email: request.body.email });
  return reply.code(202).send();
});
```

The workers start when the app is ready, and stop when it closes. With [@xufa/scheduler](../scheduler), jobs can be
enqueued by time (`run: () => queue.enqueue('report')`), and with the mail backends of the ORM a message can be sent
in the background: `queue.define('mail', (message) => Email.objects.create(message))`.

Its tests run on the memory backend and SQLite, and with `XUFA_PG_URL` and `XUFA_MONGO_URL` on PostgreSQL and MongoDB.

## License

MIT
