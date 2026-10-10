// The jobs of a queue of @xufa/queue in the admin: their list (by status, name and queue, newest first), a job with its
// payload, result and error, and its buttons: retry a failed job, retry every failed one (of a name), and delete one
// that does not run (a pending one is cancelled so). Routes under api/_jobs, asked to authorize() (and the login) as
// the rest, writes with the header of the admin.
import { message as msg } from './messages.js';

const STATUSES = ['pending', 'running', 'done', 'failed'];
// The wait of the oldest job due that is late (as the default maxLag of queue.health()).
const LATE = 5 * 60 * 1000;
const JOB_PAGE = 25;

class JobsError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const iso = (date) => (date ? new Date(date).toISOString() : null);
// The jobs of pipelines (a step of a run, the end of a wait): tried again through their run (retry of the run goes on
// from its failed steps), not alone.
const PIPELINE_JOBS = /^xufa:(block|pipeline):/;
// The jobs of the app: those of pipelines left out.
const appJobs = (qs) => qs.exclude({ name__startswith: 'xufa:block:' }).exclude({ name__startswith: 'xufa:pipeline:' });
const stepOf = (job) =>
  PIPELINE_JOBS.test(job.name) && job.payload && job.payload.run !== undefined
    ? { run: job.payload.run, step: job.payload.step }
    : null;
const firstLine = (text) => (text ? String(text).split('\n')[0] : null);

function rowOf(job) {
  return {
    id: job.pk,
    name: job.name,
    queue: job.queue,
    status: job.status,
    priority: job.priority,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    key: job.key,
    runAt: iso(job.runAt),
    createdAt: iso(job.createdAt),
    finishedAt: iso(job.finishedAt),
    error: firstLine(job.lastError),
    // A job of a step of a pipeline: its run and step.
    pipeline: stepOf(job),
  };
}

function registerJobs(app, queue) {
  if (!queue || typeof queue.retry !== 'function' || !queue.jobs) {
    throw new TypeError('queue of the admin is a Queue of @xufa/queue');
  }
  const answer = (reply, err) => {
    if (err instanceof JobsError) return reply.code(err.statusCode).send({ error: err.message, errors: {} });
    throw err;
  };
  const found = async (id) => {
    const job = await queue.jobs
      .filter({ pk: id })
      .first()
      .catch(() => null);
    if (!job) throw new JobsError(msg('noJob', { id }), 404);
    return job;
  };
  // The workers of this process look at once (those of others at their next look).
  const wake = () => {
    for (const worker of queue.workers || []) if (typeof worker.wake === 'function') worker.wake();
  };

  // The jobs, newest first: by status, name and queue, in pages; the counts by status (of the jobs filtered by name
  // and queue), the failed ones Retry all takes, and the names and queues. The jobs of pipelines only with
  // ?pipelines=1 (they are many, and the runs show them).
  app.get('/api/_jobs', async (request, reply) => {
    try {
      const query = request.query || {};
      const withPipelines = query.pipelines === '1' || query.pipelines === 'true';
      let base = withPipelines ? queue.jobs.all() : appJobs(queue.jobs);
      if (query.name) base = base.filter({ name: String(query.name) });
      if (query.queue) base = base.filter({ queue: String(query.queue) });
      let qs = base;
      if (query.status) {
        if (!STATUSES.includes(query.status)) throw new JobsError(msg('jobStatus', { status: query.status }), 400);
        qs = qs.filter({ status: query.status });
      }
      const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const count = await qs.count();
      const jobs = await qs.orderBy('-createdAt', '-pk').slice((page - 1) * JOB_PAGE, page * JOB_PAGE);
      const counts = { pending: 0, running: 0, done: 0, failed: 0 };
      for (const status of STATUSES) counts[status] = await base.filter({ status }).count();
      let retryable = appJobs(queue.jobs).filter({ status: 'failed' });
      if (query.name) retryable = retryable.filter({ name: String(query.name) });
      const all = withPipelines ? queue.jobs.all() : appJobs(queue.jobs);
      const names = await all.valuesList('name', { flat: true }).distinct().orderBy('name');
      const queues = await queue.jobs.valuesList('queue', { flat: true }).distinct().orderBy('queue');
      const defined = queue.handlers
        ? [...queue.handlers.keys()].filter((name) => withPipelines || !PIPELINE_JOBS.test(name))
        : [];
      // What waits in the queue (the jobs of pipelines too: they wait for the same workers): the jobs due now, how long
      // the oldest has waited, those scheduled later, and the workers of this process.
      let waiting = queue.jobs.all().filter({ status: 'pending' });
      if (query.queue) waiting = waiting.filter({ queue: String(query.queue) });
      const now = new Date();
      const oldest = await waiting.filter({ runAt__lte: now }).orderBy('runAt').only('runAt').first();
      const wait = oldest ? Math.max(0, now.getTime() - new Date(oldest.runAt).getTime()) : 0;
      const due = {
        now: await waiting.filter({ runAt__lte: now }).count(),
        later: await waiting.filter({ runAt__gt: now }).count(),
        oldest: oldest ? new Date(oldest.runAt).toISOString() : null,
        wait,
        late: wait > LATE,
        workers: (queue.workers || []).length,
      };
      return {
        count,
        page,
        size: JOB_PAGE,
        counts,
        due,
        retryable: await retryable.count(),
        names: [...new Set([...names, ...defined])].sort(),
        queues,
        results: jobs.map(rowOf),
      };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // Every failed job tried again (those of a name, with ?name=): how many.
  app.post('/api/_jobs/retry', async (request) => {
    const name = request.query && request.query.name ? String(request.query.name) : null;
    // The jobs of pipelines are left out: their runs are tried again (from the admin's runs).
    let failed = appJobs(queue.jobs).filter({ status: 'failed' });
    if (name) failed = failed.filter({ name });
    const ids = await failed.valuesList('pk', { flat: true });
    const retried = ids.length ? await queue.retry(ids) : 0;
    wake();
    return { retried };
  });

  // A job: its fields, payload, result and the whole error of its last run.
  app.get('/api/_jobs/:id', async (request, reply) => {
    try {
      const job = await found(request.params.id);
      return {
        ...rowOf(job),
        payload: job.payload === undefined ? null : job.payload,
        result: job.result === undefined ? null : job.result,
        lastError: job.lastError || null,
        lockedBy: job.lockedBy || null,
        lockedUntil: iso(job.lockedUntil),
      };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.post('/api/_jobs/:id/retry', async (request, reply) => {
    try {
      const job = await found(request.params.id);
      const step = stepOf(job);
      if (step) throw new JobsError(msg('jobOfStep', { step: step.step, run: step.run }), 409);
      if (!(await queue.retry([request.params.id]))) throw new JobsError(msg('retryJobs'), 409);
      wake();
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // Deletes a job that does not run: a pending one is cancelled, a failed or done one forgotten.
  app.delete('/api/_jobs/:id', async (request, reply) => {
    try {
      await found(request.params.id);
      const deleted = await queue.jobs
        .filter({ pk: request.params.id, status__in: ['pending', 'done', 'failed'] })
        .delete();
      if (!deleted) throw new JobsError(msg('deleteRunning'), 409);
      return reply.code(204).send();
    } catch (err) {
      return answer(reply, err);
    }
  });
}

export { registerJobs, rowOf, appJobs };
