'use strict';

// The runs of the pipelines of @xufa/queue in the admin: their list, a run with its steps and the graph of its
// definition, and its buttons (retry, cancel, resume a paused step). Routes under api/_runs (models cannot start with
// _), asked to authorize() as the rest, writes with the header of the admin.
const STATUSES = ['running', 'done', 'failed', 'cancelled'];
const RUN_PAGE = 25;

class RunsError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

const iso = (date) => (date ? new Date(date).toISOString() : null);

function runOf(run) {
  return {
    id: run.pk,
    pipeline: run.pipeline,
    status: run.status,
    trigger: run.trigger,
    key: run.key,
    error: run.error,
    createdAt: iso(run.createdAt),
    finishedAt: iso(run.finishedAt),
    // A run of a step of another run (the block pipeline).
    parent: run.parent || null,
    parentStep: run.parentStep || null,
    depth: run.depth || 0,
  };
}

// The steps of the definition a run keeps, as the graph shows them.
function graphOf(definition) {
  return {
    concurrency: definition.concurrency || null,
    steps: (definition.steps || []).map((step) => ({
      id: step.id,
      block: step.block,
      after: step.after || [],
      when: step.when === undefined ? null : typeof step.when === 'string' ? step.when : '(a function)',
      result: Boolean(step.result),
      waitTimeout: step.waitTimeout === undefined ? null : step.waitTimeout,
    })),
  };
}

function stepOf(row) {
  return {
    status: row.status,
    attempts: row.attempts,
    output: row.output === undefined ? null : row.output,
    error: row.error,
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    pausedUntil: iso(row.pausedUntil),
    // The run a step of the block pipeline waits for.
    child: row.child || null,
  };
}

function registerRuns(app, pipelines) {
  if (!pipelines || typeof pipelines.get !== 'function' || !pipelines.Run) {
    throw new TypeError('pipelines of the admin is a Pipelines of @xufa/queue');
  }
  const answer = (reply, err) => {
    if (err instanceof RunsError) return reply.code(err.statusCode).send({ error: err.message, errors: {} });
    if (err && err.code === 'XUFA_PIPELINE_ERR') return reply.code(409).send({ error: err.message, errors: {} });
    throw err;
  };
  const found = async (id) => {
    const state = await pipelines.get(id).catch(() => null);
    if (!state) throw new RunsError(`No run ${id}`, 404);
    return state;
  };

  // The runs, newest first: by status and pipeline, in pages; the counts by status, and the names of the pipelines.
  app.get('/api/_runs', async (request, reply) => {
    try {
      const query = request.query || {};
      let qs = pipelines.runs;
      if (query.status) {
        if (!STATUSES.includes(query.status)) throw new RunsError(`Not a status of runs: ${query.status}`, 400);
        qs = qs.filter({ status: query.status });
      }
      if (query.pipeline) qs = qs.filter({ pipeline: String(query.pipeline) });
      const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
      const count = await qs.count();
      const runs = await qs.orderBy('-createdAt', '-pk').slice((page - 1) * RUN_PAGE, page * RUN_PAGE);
      const counts = {};
      for (const status of STATUSES) counts[status] = await pipelines.runs.filter({ status }).count();
      const names = [...new Set([...pipelines.pipelines.keys()])].sort();
      return { count, page, size: RUN_PAGE, counts, pipelines: names, results: runs.map(runOf) };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // A run: its fields, input and result, its steps by id, and the graph of its definition.
  app.get('/api/_runs/:id', async (request, reply) => {
    try {
      const { run, steps } = await found(request.params.id);
      return {
        ...runOf(run),
        input: run.input === undefined ? null : run.input,
        result: run.result === undefined ? null : run.result,
        inFlight: run.inFlight || 0,
        graph: graphOf(run.definition || {}),
        steps: Object.fromEntries(Object.entries(steps).map(([id, row]) => [id, stepOf(row)])),
      };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.post('/api/_runs/:id/retry', async (request, reply) => {
    try {
      await found(request.params.id);
      if (!(await pipelines.retry(request.params.id)))
        throw new RunsError('Only failed or cancelled runs are tried again', 409);
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.post('/api/_runs/:id/cancel', async (request, reply) => {
    try {
      await found(request.params.id);
      if (!(await pipelines.cancel(request.params.id))) throw new RunsError('Only running runs are cancelled', 409);
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // Resumes a paused step with an output (the body's output: any JSON value).
  app.post('/api/_runs/:id/steps/:step/resume', async (request, reply) => {
    try {
      await found(request.params.id);
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      await pipelines.resume(request.params.id, request.params.step, body.output === undefined ? null : body.output);
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });
}

// The health of the app (xufa.health of @xufa/http, when it is registered): its checks run now.
function registerHealth(app) {
  app.get('/api/_health', async (request, reply) => {
    if (!app.health || typeof app.health.check !== 'function') {
      return reply.code(404).send({ error: 'The app has no xufa.health', errors: {} });
    }
    return app.health.check();
  });
}

module.exports = { registerRuns, registerHealth, graphOf };
