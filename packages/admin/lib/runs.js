// The runs of the pipelines of @xufa/queue in the admin: their list, a run with its steps and the graph of its
// definition, and its buttons (retry, cancel, resume a paused step). Routes under api/_runs (models cannot start with
// _), asked to authorize() as the rest, writes with the header of the admin.
import { layout } from './layout.js';
import { message as msg } from './messages.js';

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
    // The jobs of its steps: their priority and queue, and when its first steps run (start() with delay or at).
    priority: run.priority || 0,
    queue: run.queue || null,
    runAt: iso(run.runAt),
    // A run of a step of another run (the block pipeline).
    parent: run.parent || null,
    parentStep: run.parentStep || null,
    depth: run.depth || 0,
  };
}

// The steps of the definition a run keeps, as the graph shows them: with where each is drawn (its column and row, in
// the order that crosses the fewest arrows), and the points long arrows pass through.
function graphOf(definition) {
  const steps = (definition.steps || []).map((step) => ({ id: step.id, after: step.after || [] }));
  const drawn = layout(steps);
  return {
    concurrency: definition.concurrency || null,
    columns: drawn.columns,
    rows: drawn.rows,
    edges: drawn.edges,
    steps: (definition.steps || []).map((step) => ({
      id: step.id,
      block: step.block,
      after: step.after || [],
      when: step.when === undefined ? null : typeof step.when === 'string' ? step.when : '(a function)',
      result: Boolean(step.result),
      waitTimeout: step.waitTimeout === undefined ? null : step.waitTimeout,
      at: drawn.at[step.id],
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

// The options of start() from the body of POST api/_runs, and the errors of its fields.
// A delay as the queue takes it: milliseconds, or '30s', '10m', '1h30m' (ms, s, m, h, d, w).
const DELAY = /^(?:\d+|(?:\d+(?:\.\d+)?\s*(?:ms|s|m|h|d|w)\s*)+)$/;
function startOptions(body, pipelines) {
  const errors = {};
  const options = {};
  const fail = (field, message) => {
    errors[field] = [message];
  };
  if (typeof body.pipeline !== 'string' || !pipelines.pipelines.has(body.pipeline)) {
    fail('pipeline', body.pipeline ? msg('noPipeline', { name: body.pipeline }) : msg('choosePipeline'));
  }
  const given = (value) => value !== undefined && value !== null && value !== '';
  if (given(body.delay) && given(body.at)) fail('at', msg('delayOrAt'));
  else if (given(body.delay)) {
    const delay = typeof body.delay === 'number' ? body.delay : String(body.delay).trim();
    const valid = typeof delay === 'number' ? Number.isFinite(delay) && delay >= 0 : DELAY.test(delay);
    if (!valid) fail('delay', msg('delay'));
    else options.delay = typeof delay === 'string' && /^\d+$/.test(delay) ? Number(delay) : delay;
  } else if (given(body.at)) {
    const at = new Date(body.at);
    if (Number.isNaN(at.getTime())) fail('at', msg('notDate'));
    else options.at = at;
  }
  if (given(body.priority)) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority)) fail('priority', msg('wholeNumber'));
    else options.priority = priority;
  }
  if (given(body.key)) {
    if (typeof body.key !== 'string' || body.key.length > 200) fail('key', msg('keyLength'));
    else options.key = body.key;
  }
  return { options, errors };
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
  // How far the run of a step (the block pipeline) is: its status, and its steps ended (done or skipped), failed and
  // in all.
  const progressOf = async (id) => {
    const state = await pipelines.get(id).catch(() => null);
    if (!state) return null;
    const rows = Object.values(state.steps);
    const total = ((state.run.definition || {}).steps || []).length || rows.length;
    const count = (...statuses) => rows.filter((row) => statuses.includes(row.status)).length;
    return { status: state.run.status, done: count('done', 'skipped'), failed: count('failed'), total };
  };
  const found = async (id) => {
    const state = await pipelines.get(id).catch(() => null);
    if (!state) throw new RunsError(msg('noRun', { id }), 404);
    return state;
  };

  // The runs, newest first: by status and pipeline, in pages; the counts by status, and the names of the pipelines.
  app.get('/api/_runs', async (request, reply) => {
    try {
      const query = request.query || {};
      let qs = pipelines.runs;
      if (query.status) {
        if (!STATUSES.includes(query.status)) throw new RunsError(msg('runStatus', { status: query.status }), 400);
        qs = qs.filter({ status: query.status });
      }
      if (query.pipeline) qs = qs.filter({ pipeline: String(query.pipeline) });
      // The runs a schedule started (trigger 'schedule:<name>'), or an event.
      if (query.trigger) qs = qs.filter({ trigger: String(query.trigger) });
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
        steps: Object.fromEntries(
          await Promise.all(
            Object.entries(steps).map(async ([id, row]) => [
              id,
              { ...stepOf(row), childProgress: row.child ? await progressOf(row.child) : null },
            ])
          )
        ),
      };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.post('/api/_runs/:id/retry', async (request, reply) => {
    try {
      await found(request.params.id);
      if (!(await pipelines.retry(request.params.id))) throw new RunsError(msg('retryRuns'), 409);
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.post('/api/_runs/:id/cancel', async (request, reply) => {
    try {
      await found(request.params.id);
      if (!(await pipelines.cancel(request.params.id))) throw new RunsError(msg('cancelRuns'), 409);
      return { ok: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // The pipelines that may be started, with their steps and their graph (for the form that starts a run).
  app.get('/api/_runs/pipelines', async () => ({
    results: [...pipelines.pipelines.values()]
      .map((definition) => ({
        name: definition.name,
        trigger: definition.trigger || null,
        steps: (definition.steps || []).map((step) => step.id),
        graph: graphOf(definition),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  // Starts a run: { pipeline, input (any JSON), delay ('10m', or milliseconds) or at (a date), priority, key }. With a
  // key, a run of that key still running is given back instead (existing: true). Errors by field (400).
  app.post('/api/_runs', async (request, reply) => {
    try {
      const body = request.body && typeof request.body === 'object' ? request.body : {};
      const { options, errors } = startOptions(body, pipelines);
      if (Object.keys(errors).length) {
        return reply.code(400).send({ error: Object.values(errors)[0][0], errors });
      }
      // The run of the key still running (start() gives it back), if any.
      const before = options.key ? await pipelines.runs.filter({ key: options.key, status: 'running' }).first() : null;
      const run = await pipelines.start(body.pipeline, body.input === undefined ? null : body.input, options);
      const existing = Boolean(before) && String(before.pk) === String(run.pk);
      return reply.code(existing ? 200 : 201).send({ ...runOf(run), existing });
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

export { registerRuns, registerHealth, graphOf, runOf };
