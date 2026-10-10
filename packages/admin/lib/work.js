// The work of the app in one list: the jobs of its queue (those of pipelines left out: their runs show them) and the
// runs of its pipelines, newest first, by status, in pages; each with its kind, so the page opens the job or the run.
// Under api/_work, for those who may view the jobs or the runs (each kind for those who may view it).
import { rowOf, appJobs } from './jobs.js';
import { runOf } from './runs.js';
import { message as msg } from './messages.js';

const STATUSES = ['pending', 'running', 'done', 'failed', 'cancelled'];
const JOB_STATUSES = new Set(['pending', 'running', 'done', 'failed']);
const RUN_STATUSES = new Set(['running', 'done', 'failed', 'cancelled']);
const PAGE = 25;
// The deepest page: both lists are read up to it, then merged.
const MAX_PAGE = 40;

function registerWork(app, { queue, pipelines, can }) {
  app.get('/api/_work', async (request, reply) => {
    const query = request.query || {};
    const status = query.status ? String(query.status) : '';
    if (status && !STATUSES.includes(status)) {
      return reply.code(400).send({ error: msg('workStatus', { status }), errors: {} });
    }
    const jobs = Boolean(queue) && can(request, '_jobs.view');
    const runs = Boolean(pipelines) && can(request, '_runs.view');
    if (!jobs && !runs)
      return reply.code(403).send({ error: msg('forbidden', { permission: '_jobs.view' }), errors: {} });
    const page = Math.min(MAX_PAGE, Math.max(1, Number.parseInt(query.page, 10) || 1));
    const take = page * PAGE;
    const jobSet = jobs ? appJobs(queue.jobs) : null;
    const runSet = runs ? pipelines.runs.all() : null;
    const counts = Object.fromEntries(STATUSES.map((name) => [name, 0]));
    for (const name of STATUSES) {
      if (jobSet && JOB_STATUSES.has(name)) counts[name] += await jobSet.filter({ status: name }).count();
      if (runSet && RUN_STATUSES.has(name)) counts[name] += await runSet.filter({ status: name }).count();
    }
    const items = [];
    let count = 0;
    if (jobSet && (!status || JOB_STATUSES.has(status))) {
      const qs = status ? jobSet.filter({ status }) : jobSet;
      count += await qs.count();
      for (const job of await qs.orderBy('-createdAt', '-pk').limit(take)) {
        const row = rowOf(job);
        items.push({ kind: 'job', ...row, title: row.name });
      }
    }
    if (runSet && (!status || RUN_STATUSES.has(status))) {
      const qs = status ? runSet.filter({ status }) : runSet;
      count += await qs.count();
      for (const run of await qs.orderBy('-createdAt', '-pk').limit(take)) {
        const row = runOf(run);
        items.push({ kind: 'run', ...row, title: row.pipeline });
      }
    }
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return {
      count: Math.min(count, MAX_PAGE * PAGE),
      page,
      size: PAGE,
      counts,
      kinds: { jobs, runs },
      results: items.slice((page - 1) * PAGE, page * PAGE),
    };
  });
}

export { registerWork };
