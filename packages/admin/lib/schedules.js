// The schedules of a Scheduler of @xufa/scheduler in the admin: its jobs (when they run next, how their runs went),
// those that start runs of pipelines (pipelines.schedule() of @xufa/queue) with their last run and how many; and Run
// now. Under api/_runs/schedules (the permissions of the runs: _runs.view, _runs.change).
import { message as msg } from './messages.js';
import { runOf } from './runs.js';

const iso = (date) => (date ? new Date(date).toISOString() : null);

function registerSchedules(app, scheduler, pipelines) {
  if (!scheduler || typeof scheduler.jobs !== 'function' || typeof scheduler.runNow !== 'function') {
    throw new TypeError('scheduler of the admin is a Scheduler of @xufa/scheduler');
  }
  // The pipeline a job starts (schedule() of these pipelines, on this scheduler), or null.
  const startsOf = (name) => {
    const entry = pipelines && pipelines.schedules ? pipelines.schedules.get(name) : null;
    return entry && entry.scheduler === scheduler ? entry : null;
  };

  app.get('/api/_runs/schedules', async () => {
    const jobs = scheduler.jobs();
    const results = await Promise.all(
      jobs.map(async (info) => {
        const starts = startsOf(info.name);
        const mine = starts ? pipelines.runs.filter({ trigger: starts.trigger }) : null;
        const last = mine ? await mine.orderBy('-createdAt', '-pk').first() : null;
        return {
          name: info.name,
          schedule: info.schedule,
          next: iso(info.next),
          running: info.running,
          // The runs of the job in this process (a run of a pipeline job is the start of a run).
          runs: info.runs,
          failures: info.failures,
          skipped: info.skipped,
          lastRun: iso(info.lastRun),
          lastDuration: info.lastDuration,
          lastError: info.lastError ? String(info.lastError.message || info.lastError) : null,
          // The pipeline it starts: its runs (trigger), the last and how many.
          pipeline: starts ? starts.pipeline : null,
          trigger: starts ? starts.trigger : null,
          lastPipelineRun: last ? runOf(last) : null,
          pipelineRuns: mine ? await mine.count() : null,
        };
      })
    );
    // The next first; those that do not run again last.
    results.sort((a, b) => (a.next || '~').localeCompare(b.next || '~') || a.name.localeCompare(b.name));
    return { results };
  });

  // Runs a job now: one that starts a run of a pipeline gives the run; another runs on (202).
  app.post('/api/_runs/schedules/:name/run', async (request, reply) => {
    const { name } = request.params;
    if (!scheduler.jobs().some((info) => info.name === name)) {
      return reply.code(404).send({ error: msg('noSchedule', { name }), errors: {} });
    }
    if (startsOf(name)) {
      try {
        const result = await scheduler.runNow(name);
        if (!result) return reply.code(409).send({ error: msg('scheduleRunning', { name }), errors: {} });
        return { ok: true, run: result.run };
      } catch (err) {
        return reply.code(500).send({ error: String(err.message || err), errors: {} });
      }
    }
    scheduler.runNow(name).catch(() => {
      // Its failure is the scheduler's (its events, history and logger).
    });
    return reply.code(202).send({ ok: true, run: null });
  });
}

export { registerSchedules };
