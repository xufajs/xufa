// Pipelines: graphs of steps run as jobs of a queue, each run and each of its steps kept in the database. A pipeline
// is data (it can be stored, edited and shown): steps that run a block (a kind of work registered by code) with their
// config, after other steps (fan out, join), when a condition holds, and whose outputs make the result of the run.
//
//   const pipelines = new Pipelines(queue);
//   pipelines.block('fetch', async (input, { config, signal }) => fetchDocument(input.url, { signal }));
//   pipelines.define({
//     name: 'ingest',
//     trigger: 'document.uploaded',
//     steps: [
//       { id: 'document', block: 'fetch' },
//       { id: 'text', block: 'extract', after: ['document'], config: { format: 'text' } },
//       { id: 'keywords', block: 'keywords', after: ['text'] },
//       { id: 'summary', block: 'summarize', after: ['text'], when: 'input.words > 1000' },
//       { id: 'publish', block: 'transform', after: ['keywords', 'summary'], config: { map: { tags: 'input.keywords' } } },
//     ],
//   });
//   const run = await pipelines.start('ingest', { url });     // or pipelines.trigger('document.uploaded', { url })
//
// Each step is a job (retries, backoff, timeouts, pools of the queue), so the steps of a run go to every worker of
// every machine with the database. Every change of a step or a run is an update made only from the status it expects
// (compare and set): two branches that end at once cannot overwrite each other, a step runs once even when its job is
// run twice, and a run whose process died goes on when its jobs are taken back (or with recover()).
//
// A pipeline can limit the steps of a run that run at once (concurrency: a counter of the run, taken and given back
// with updates only one process can make), and a step that waits for resume() can wait for a while only
// (waitTimeout, then onTimeout: fail, skip, or go on with an output): a job of the queue at its end, so the limit holds
// when processes restart.
//
// A step of the block 'pipeline' runs another pipeline (config.pipeline, with the step's input or config.input) and
// waits for it as a paused step: the child run's result is its output; a child that fails or is cancelled fails it;
// its waitTimeout holds (the child is cancelled then); cancelling a run cancels its children.
import { EventEmitter } from 'node:events';
import { QueueError } from './errors.js';
import { ms } from './duration.js';
import * as expressionModule from '@xufa/expression';

const RUN_STATUSES = ['running', 'done', 'failed', 'cancelled'];
const STEP_STATUSES = ['waiting', 'queued', 'running', 'retrying', 'paused', 'done', 'skipped', 'failed', 'cancelled'];
const FINISHED = new Set(['done', 'skipped']);
const JOB_PREFIX = 'xufa:block:';
// The job at the end of the wait of a paused step.
const TIMEOUT_JOB = 'xufa:pipeline:timeout';
// The steps that take a place of the concurrency of their run.
const IN_FLIGHT = ['queued', 'running', 'retrying'];
// What a block gives (ctx.wait()) to stay paused until resume(run, step, output).
const WAIT = Symbol('xufa.pipelines.wait');

class PipelineError extends QueueError {
  constructor(message, errors) {
    super(message);
    this.name = 'PipelineError';
    this.code = 'XUFA_PIPELINE_ERR';
    if (errors) this.errors = errors;
  }
}

function models(orm, prefix, names) {
  const { Model, fields } = orm;
  const Run = {
    [names.run]: class extends Model {
      static fields = {
        pipeline: fields.string({ maxLength: 200 }),
        status: fields.string({ maxLength: 20, default: 'running', choices: RUN_STATUSES }),
        input: fields.json({ null: true }),
        result: fields.json({ null: true }),
        error: fields.text({ null: true }),
        definition: fields.json(),
        trigger: fields.string({ maxLength: 200, null: true }),
        key: fields.string({ maxLength: 200, null: true, index: true }),
        // Its steps queued or running, with a limit of concurrency.
        inFlight: fields.integer({ default: 0 }),
        // The jobs of its steps: their priority and queue (those of a step win), and when its first steps run.
        priority: fields.integer({ default: 0 }),
        queue: fields.string({ maxLength: 200, null: true }),
        runAt: fields.datetime({ null: true }),
        // A run of a step of another run (the block 'pipeline'): that run and step, and how deep it is.
        parent: fields.string({ maxLength: 64, null: true, index: true }),
        parentStep: fields.string({ maxLength: 200, null: true }),
        depth: fields.integer({ default: 0 }),
        createdAt: fields.datetime({ autoNowAdd: true }),
        finishedAt: fields.datetime({ null: true }),
      };

      static options = { table: `${prefix}_runs`, indexes: [['pipeline', 'status']] };
    },
  }[names.run];
  const Step = {
    [names.step]: class extends Model {
      static fields = {
        run: fields.string({ maxLength: 64 }),
        step: fields.string({ maxLength: 200 }),
        block: fields.string({ maxLength: 200 }),
        status: fields.string({ maxLength: 20, default: 'waiting', choices: STEP_STATUSES }),
        output: fields.json({ null: true }),
        error: fields.text({ null: true }),
        attempts: fields.integer({ default: 0 }),
        // A paused step with waitTimeout: when it stops waiting.
        pausedUntil: fields.datetime({ null: true }),
        // The run a step of the block 'pipeline' waits for.
        child: fields.string({ maxLength: 64, null: true }),
        startedAt: fields.datetime({ null: true }),
        finishedAt: fields.datetime({ null: true }),
      };

      static options = { table: `${prefix}_steps`, indexes: [{ fields: ['run', 'step'], unique: true }] };
    },
  }[names.step];
  return { Run, Step };
}

let expressions = null;
function expression(source) {
  if (!expressions) {
    try {
      expressions = expressionModule;
    } catch (err) {
      throw new PipelineError(`Conditions and transforms written as text need @xufa/expression (${err.message})`);
    }
  }
  return expressions.compile(source);
}

const errorText = (err) => (err && err.stack ? err.stack : String(err));
// What a step does when it waited for its waitTimeout: fail (its run fails), skip (its branch is skipped), or go on with
// { output }.
const validOnTimeout = (value) =>
  value === 'fail' || value === 'skip' || (typeof value === 'object' && value !== null && 'output' in value);
const messageOf = (err) => (err && err.message ? err.message : String(err));
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

class Pipelines extends EventEmitter {
  constructor(queue, options = {}) {
    super();
    if (!queue || typeof queue.define !== 'function' || !queue.db) {
      throw new PipelineError('new Pipelines(queue): a Queue of @xufa/queue');
    }
    this.queue = queue;
    this.db = queue.db;
    if (options.models) {
      // The models of other Pipelines on the same database (another queue of its jobs): their runs shared.
      this.Run = options.models.Run;
      this.Step = options.models.Step;
    } else {
      const prefix = options.table || 'xufa_pipeline';
      const { Run, Step } = models(queue.orm, prefix, {
        run: options.runModel || 'XufaPipelineRun',
        step: options.stepModel || 'XufaPipelineStep',
      });
      this.Run = Run;
      this.Step = Step;
      this.db.register(Run);
      this.db.register(Step);
    }
    this.blocks = new Map();
    this.pipelines = new Map();
    // The schedules that start runs (schedule()): by the name of their job of the scheduler.
    this.schedules = new Map();
    // Functions of steps defined in code (run, when), by pipeline and step: a run keeps its definition as data.
    this.functions = new Map();
    this.block('transform', {
      // The values of expressions: config.map ({ key: expression }) gives an object, config.value one value.
      validate(config) {
        if (config.map !== undefined && !isObject(config.map)) return 'config.map is an object of expressions';
        if (config.map === undefined && typeof config.value !== 'string') return 'config.map or config.value';
        return undefined;
      },
      run(input, ctx) {
        const scope = { input, outputs: ctx.outputs, run: ctx.run, config: ctx.config };
        if (ctx.config.map === undefined) return expression(ctx.config.value)(scope);
        const out = {};
        for (const [key, source] of Object.entries(ctx.config.map)) out[key] = expression(source)(scope);
        return out;
      },
    });
    // A step that waits for resume(): an approval, a callback of another system.
    this.block('wait', { run: (input, ctx) => ctx.wait() });
    // A step that runs another pipeline and waits for its result (config.pipeline; config.input: an expression of its
    // input, over input, outputs, run and config).
    this.maxDepth = options.maxDepth === undefined ? 10 : options.maxDepth;
    this.block('pipeline', {
      validate(config) {
        if (typeof config.pipeline !== 'string' || config.pipeline === '')
          return 'config.pipeline is the name of a pipeline';
        if (config.input !== undefined && typeof config.input !== 'string') return 'config.input is an expression';
        return undefined;
      },
      run: (input, ctx) => this.startChild(input, ctx),
    });
    queue.define(TIMEOUT_JOB, (payload) => this.pauseTimedOut(payload), { attempts: 5 });
  }

  // Creates the tables of the runs and steps (db.sync() makes them too).
  async sync() {
    await this.db.backend.createSchema([this.Run.meta, this.Step.meta]);
  }

  // A kind of step: run(input, ctx), and validate(config) (an error message, or nothing). Its other options are those
  // of the jobs of the queue (attempts, backoff, timeout, queue, pool).
  block(type, spec) {
    if (typeof type !== 'string' || type === '') throw new PipelineError('block(type, spec): type is a string');
    const block = typeof spec === 'function' ? { run: spec } : { ...spec };
    if (typeof block.run !== 'function') throw new PipelineError(`block(${type}): run(input, ctx) is a function`);
    const { run, validate, ...jobOptions } = block;
    this.blocks.set(type, { type, run, validate });
    this.queue.define(`${JOB_PREFIX}${type}`, (payload, job) => this.runStep(payload, job), {
      ...jobOptions,
      onFailure: (job, err, final) => this.onJobFailed(job, err, final),
    });
    return this;
  }

  // Checks a definition: every error found, or an empty list.
  check(definition) {
    const errors = [];
    if (!isObject(definition)) return ['A pipeline is an object: { name, steps }'];
    if (typeof definition.name !== 'string' || definition.name === '') errors.push('name is a string');
    if (definition.trigger !== undefined && typeof definition.trigger !== 'string') errors.push('trigger is a string');
    if (
      definition.concurrency !== undefined &&
      (!Number.isInteger(definition.concurrency) || definition.concurrency < 1)
    ) {
      errors.push('concurrency is an integer of 1 or more');
    }
    if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
      errors.push('steps is a list of steps');
      return errors;
    }
    const ids = new Set();
    for (const [at, step] of definition.steps.entries()) {
      const where = `steps[${at}]`;
      if (!isObject(step)) {
        errors.push(`${where} is an object`);
        continue;
      }
      const id = step.id === undefined ? undefined : String(step.id);
      if (!id) errors.push(`${where}: id is needed`);
      else if (ids.has(id)) errors.push(`${where}: the id ${id} is there twice`);
      else ids.add(id);
      const name = id ? `step ${id}` : where;
      if (typeof step.run !== 'function') {
        const block = this.blocks.get(step.block);
        if (!block) errors.push(`${name}: no block ${step.block} (pipelines.block() registers it)`);
        else if (block.validate) {
          const problem = block.validate(step.config || {});
          if (problem) errors.push(`${name}: ${problem}`);
        }
      }
      if (step.config !== undefined && !isObject(step.config)) errors.push(`${name}: config is an object`);
      if (step.when !== undefined) {
        if (typeof step.when === 'string') {
          try {
            expression(step.when);
          } catch (err) {
            errors.push(`${name}: when: ${messageOf(err)}`);
          }
        } else if (typeof step.when !== 'function') errors.push(`${name}: when is an expression or a function`);
      }
      if (step.result !== undefined && typeof step.result !== 'boolean') errors.push(`${name}: result is a boolean`);
      if (step.waitTimeout !== undefined) {
        try {
          if (!(ms(step.waitTimeout) > 0)) errors.push(`${name}: waitTimeout is more than 0`);
        } catch {
          errors.push(`${name}: waitTimeout is a duration (as '24h')`);
        }
      }
      if (step.onTimeout !== undefined && !validOnTimeout(step.onTimeout)) {
        errors.push(`${name}: onTimeout is 'fail', 'skip' or { output }`);
      }
    }
    // After: steps that are there, and no cycles.
    const after = new Map();
    for (const step of definition.steps) {
      if (!isObject(step) || step.id === undefined) continue;
      const id = String(step.id);
      const list = [].concat(step.after === undefined ? (step.parent === undefined ? [] : step.parent) : step.after);
      after.set(id, list.map(String));
      for (const parent of after.get(id)) {
        if (!ids.has(parent)) errors.push(`step ${id}: after ${parent}, which is not a step`);
        else if (parent === id) errors.push(`step ${id}: after itself`);
      }
    }
    const state = new Map();
    const visit = (id, path) => {
      if (state.get(id) === 'done') return;
      if (state.get(id) === 'visiting') {
        errors.push(`a cycle: ${[...path, id].join(' -> ')}`);
        return;
      }
      state.set(id, 'visiting');
      for (const parent of after.get(id) || []) if (ids.has(parent) && parent !== id) visit(parent, [...path, id]);
      state.set(id, 'done');
    };
    for (const id of after.keys()) visit(id, []);
    return [...new Set(errors)];
  }

  // A pipeline: { name, trigger, steps: [{ id, block | run, config, after, when, result, attempts, priority, queue }] }.
  // Steps of code can give run and when as functions (the definition kept with each run is its data).
  define(definition) {
    const errors = this.check(definition);
    if (errors.length) {
      const name = isObject(definition) && definition.name ? definition.name : '?';
      throw new PipelineError(`The pipeline ${name} is not valid: ${errors.join('; ')}`, errors);
    }
    const steps = definition.steps.map((given) => {
      const id = String(given.id);
      const step = {
        id,
        block: given.block,
        config: given.config || {},
        after: []
          .concat(given.after === undefined ? (given.parent === undefined ? [] : given.parent) : given.after)
          .map(String),
      };
      for (const key of ['result', 'attempts', 'priority', 'queue', 'waitTimeout', 'onTimeout'])
        if (given[key] !== undefined) step[key] = given[key];
      if (typeof given.run === 'function') {
        step.block = `${definition.name}/${id}`;
        this.block(step.block, { run: given.run, ...(given.options || {}) });
      }
      if (typeof given.when === 'function') {
        this.functions.set(`${definition.name}/${id}`, given.when);
        step.when = { function: true };
      } else if (given.when !== undefined) step.when = given.when;
      return step;
    });
    const pipeline = { name: definition.name, steps };
    if (definition.trigger) pipeline.trigger = definition.trigger;
    if (definition.concurrency) pipeline.concurrency = definition.concurrency;
    if (definition.description) pipeline.description = definition.description;
    this.pipelines.set(definition.name, pipeline);
    return this;
  }

  // A task: a block and a pipeline of one step that runs it, by one name (its runs kept, retried and shown as those of
  // any pipeline). Options: those of the block (attempts, backoff, timeout, queue, pool, validate) and of the pipeline
  // (trigger, description).
  //
  //   pipelines.task('monthly-report', async ({ month }) => makeReport(month), { attempts: 3 });
  //   await pipelines.start('monthly-report', { month: 10 }, { delay: '1h' });
  task(name, run, options = {}) {
    if (typeof name !== 'string' || name === '') throw new PipelineError('task(name, run): name is a string');
    if (typeof run !== 'function') throw new PipelineError(`task(${name}): run(input, ctx) is a function`);
    const { trigger, description, ...blockOptions } = options;
    this.block(name, { ...blockOptions, run });
    this.define({
      name,
      ...(trigger ? { trigger } : {}),
      ...(description ? { description } : {}),
      steps: [{ id: name, block: name, result: true }],
    });
    return this;
  }

  // A pipeline (a task too) started on a schedule of a Scheduler of @xufa/scheduler: a job of the scheduler (its every,
  // cron, timezone, at or in, catchUp, lock, retries...) whose run starts a run of the pipeline, kept and retried as
  // any other (trigger 'schedule:<name>', key 'schedule:<name>:<time due>': a time already started is not started
  // again). input: a value, or input({ scheduledAt, name }) for each time. Options of the run: priority, queue. With
  // the lock of the scheduler (ormLock(db)), one machine starts each time. The info of the job.
  //
  //   pipelines.task('monthly-report', async ({ month }) => makeReport(month), { attempts: 3 });
  //   pipelines.schedule(scheduler, 'monthly-report', { cron: '0 6 1 * *', input: ({ scheduledAt }) => ({ month: scheduledAt.getMonth() }) });
  schedule(scheduler, pipeline, spec = {}) {
    if (!scheduler || typeof scheduler.add !== 'function') {
      throw new PipelineError('schedule(scheduler, pipeline, spec): a Scheduler of @xufa/scheduler');
    }
    if (!this.pipelines.has(pipeline)) throw new PipelineError(`schedule(): no pipeline named ${pipeline}`);
    const { name = pipeline, input = null, priority, queue, run, ...timing } = spec;
    if (run !== undefined) throw new PipelineError(`schedule(${name}): the run is that of the pipeline (no run)`);
    const trigger = `schedule:${name}`;
    const info = scheduler.add({
      ...timing,
      name,
      // Its runs record the run of the pipeline they started.
      run: async ({ scheduledAt }) => {
        const key = `${trigger}:${scheduledAt.toISOString()}`;
        const started = await this.Run.objects.filter({ key }).first();
        if (started) return { run: String(started.pk), again: true };
        const given = typeof input === 'function' ? await input({ scheduledAt, name }) : input;
        const created = await this.start(pipeline, given === undefined ? null : given, {
          key,
          trigger,
          ...(priority !== undefined ? { priority } : {}),
          ...(queue !== undefined ? { queue } : {}),
        });
        return { run: String(created.pk) };
      },
    });
    this.schedules.set(name, { name, pipeline, trigger, scheduler });
    return info;
  }

  // Starts a run of a pipeline (its name, or a definition not defined before): its steps without after are queued.
  // Options: key (a run with that key running is given instead of another), trigger; and those of the jobs of its
  // steps, as enqueue(): priority and queue (for every step without its own), delay or at (when its first steps run).
  async start(pipeline, input = null, options = {}) {
    const definition = typeof pipeline === 'string' ? this.pipelines.get(pipeline) : null;
    if (typeof pipeline === 'string' && !definition) throw new PipelineError(`No pipeline named ${pipeline}`);
    if (!definition) {
      this.define(pipeline);
      return this.start(pipeline.name, input, options);
    }
    if (options.key) {
      const existing = await this.Run.objects.filter({ key: options.key, status: 'running' }).first();
      if (existing) return existing;
    }
    if (options.priority !== undefined && !Number.isInteger(options.priority)) {
      throw new PipelineError(`The priority of a run is an integer: ${options.priority}`);
    }
    if (options.delay !== undefined && options.at !== undefined) {
      throw new PipelineError('A run takes delay or at, not both');
    }
    const runAt =
      options.at !== undefined
        ? new Date(options.at)
        : options.delay !== undefined
          ? new Date(Date.now() + ms(options.delay))
          : null;
    if (runAt && Number.isNaN(runAt.getTime())) throw new PipelineError(`Not a date: ${options.at}`);
    const run = await this.Run.objects.create({
      priority: options.priority || 0,
      queue: options.queue || null,
      runAt,
      pipeline: definition.name,
      input,
      definition,
      trigger: options.trigger || null,
      key: options.key || null,
      parent: options.parent ? options.parent.run : null,
      parentStep: options.parent ? options.parent.step : null,
      depth: options.parent ? options.parent.depth : 0,
    });
    const id = String(run.pk);
    await this.Step.objects.bulkCreate(
      definition.steps.map((step) => new this.Step({ run: id, step: step.id, block: step.block }))
    );
    this.emit('started', run);
    await this.advance(run);
    return run;
  }

  // Starts a run of every pipeline whose trigger is the event: the runs.
  async trigger(event, input = null, options = {}) {
    const runs = [];
    for (const pipeline of this.pipelines.values()) {
      if (pipeline.trigger === event) runs.push(await this.start(pipeline.name, input, { ...options, trigger: event }));
    }
    return runs;
  }

  // The run (its row) with its steps by id: { run, steps: { id: step } }.
  async get(runId) {
    const run = await this.Run.objects.filter({ pk: runId }).first();
    if (!run) return null;
    const steps = {};
    for (const step of await this.Step.objects.filter({ run: String(run.pk) })) steps[step.step] = step;
    return { run, steps };
  }

  // The runs, as a queryset (pipelines.runs.filter({ status: 'failed' })).
  get runs() {
    return this.Run.objects;
  }

  // The input of a step: the input of the run (no after), the output of its step (one), or the outputs by step.
  static inputOf(step, run, outputs, statuses) {
    if (step.after.length === 0) return run.input;
    const done = step.after.filter((id) => statuses[id] === 'done');
    if (step.after.length === 1) return outputs[done[0]];
    return Object.fromEntries(done.map((id) => [id, outputs[id]]));
  }

  // Moves a run on: steps whose steps before ended are queued (or skipped: their condition is false, or every step
  // before was skipped), and the run is done when every step is. Safe to call any time, from any process.
  async advance(given) {
    const run = await this.Run.objects.filter({ pk: given.pk }).first();
    if (!run || run.status !== 'running') return;
    const id = String(run.pk);
    const definition = run.definition;
    const rows = await this.Step.objects.filter({ run: id });
    const byId = new Map(rows.map((row) => [row.step, row]));
    const statuses = Object.fromEntries(rows.map((row) => [row.step, row.status]));
    const outputs = Object.fromEntries(
      rows.filter((row) => row.status === 'done').map((row) => [row.step, row.output])
    );
    const limit = definition.concurrency || 0;
    // The run has no place left (in this pass): steps wait, but those skipped are skipped.
    let full = false;
    let changed = true;
    while (changed) {
      changed = false;
      for (const step of definition.steps) {
        if (statuses[step.id] !== 'waiting') continue;
        if (!step.after.every((parent) => FINISHED.has(statuses[parent]))) continue;
        let skip = step.after.length > 0 && step.after.every((parent) => statuses[parent] === 'skipped');
        if (!skip && step.when !== undefined) {
          let holds;
          try {
            holds = this.condition(run, step, Pipelines.inputOf(step, run, outputs, statuses), outputs);
          } catch (err) {
            await this.fail(run, step.id, err);
            return;
          }
          skip = !holds;
        }
        const row = byId.get(step.id);
        if (skip) {
          const moved = await this.Step.objects
            .filter({ pk: row.pk, status: 'waiting' })
            .update({ status: 'skipped', finishedAt: new Date() });
          statuses[step.id] = 'skipped';
          if (moved) this.emit('step', run, step.id, 'skipped');
          changed = true;
          continue;
        }
        if (limit) {
          if (full || !(await this.takePlace(run, limit))) {
            full = true;
            continue;
          }
        }
        // Only the process that moves it to queued enqueues its job.
        const moved = await this.Step.objects.filter({ pk: row.pk, status: 'waiting' }).update({ status: 'queued' });
        statuses[step.id] = 'queued';
        if (moved) await this.enqueueStep(run, step);
        else if (limit) await this.givePlace(run);
      }
    }
    if (definition.steps.every((step) => FINISHED.has(statuses[step.id]))) {
      const result = Pipelines.resultOf(definition, outputs, statuses);
      const finished = await this.Run.objects
        .filter({ pk: run.pk, status: 'running' })
        .update({ status: 'done', result: result === undefined ? null : result, finishedAt: new Date() });
      if (finished) {
        run.status = 'done';
        run.result = result === undefined ? null : result;
        this.emit('completed', run);
        await this.childEnded(run);
      }
    }
  }

  // A place of the concurrency of a run: an update only one process can make while there are places.
  async takePlace(run, limit) {
    const { F } = this.queue.orm;
    const taken = await this.Run.objects
      .filter({ pk: run.pk, status: 'running', inFlight__lt: limit })
      .update({ inFlight: F('inFlight').add(1) });
    return taken > 0;
  }

  async givePlace(run) {
    if (!run.definition.concurrency) return;
    const { F } = this.queue.orm;
    await this.Run.objects.filter({ pk: run.pk, inFlight__gt: 0 }).update({ inFlight: F('inFlight').sub(1) });
  }

  // The places taken, counted again from its steps (retry, recover).
  async recount(run) {
    if (!run.definition.concurrency) return;
    const inFlight = await this.Step.objects.filter({ run: String(run.pk), status__in: IN_FLIGHT }).count();
    await this.Run.objects.filter({ pk: run.pk }).update({ inFlight });
  }

  // The job of a step: the priority and queue of the step, else of the run; its first steps when the run is due.
  enqueueStep(run, step) {
    const runId = String(run.pk);
    const options = { key: `${JOB_PREFIX}${runId}:${step.id}` };
    if (run.priority) options.priority = run.priority;
    if (run.queue) options.queue = run.queue;
    for (const key of ['attempts', 'priority', 'queue']) if (step[key] !== undefined) options[key] = step[key];
    if (step.after.length === 0 && run.runAt && new Date(run.runAt).getTime() > Date.now()) options.at = run.runAt;
    return this.queue.enqueue(`${JOB_PREFIX}${step.block}`, { run: runId, step: step.id }, options);
  }

  condition(run, step, input, outputs) {
    const scope = {
      input,
      outputs,
      run: { id: run.pk, pipeline: run.pipeline, input: run.input },
      config: step.config,
    };
    if (isObject(step.when) && step.when.function) {
      const fn = this.functions.get(`${run.pipeline}/${step.id}`);
      if (!fn) throw new PipelineError(`The condition of step ${step.id} is a function this process does not have`);
      return Boolean(fn(input, scope));
    }
    return Boolean(expression(step.when)(scope));
  }

  // The result of a run: the outputs of the steps marked result (merged when objects), or else the output of its
  // last step (the outputs by step when several steps end it).
  static resultOf(definition, outputs, statuses) {
    const marked = definition.steps.filter((step) => step.result && statuses[step.id] === 'done');
    if (marked.length > 0) {
      if (marked.length === 1) return outputs[marked[0].id];
      if (marked.every((step) => isObject(outputs[step.id]))) {
        return Object.assign({}, ...marked.map((step) => outputs[step.id]));
      }
      return Object.fromEntries(marked.map((step) => [step.id, outputs[step.id]]));
    }
    const parents = new Set(definition.steps.flatMap((step) => step.after));
    const last = definition.steps.filter((step) => !parents.has(step.id) && statuses[step.id] === 'done');
    if (last.length === 0) return undefined;
    if (last.length === 1) return outputs[last[0].id];
    return Object.fromEntries(last.map((step) => [step.id, outputs[step.id]]));
  }

  // The job of a step: runs its block once (a job run twice finds it running or done), and moves the run on.
  async runStep(payload, job) {
    const { run: runId, step: stepId } = payload;
    const run = await this.Run.objects.filter({ pk: runId }).first();
    if (!run) return { skipped: 'no run' };
    const row = await this.Step.objects.filter({ run: String(run.pk), step: stepId }).first();
    if (!row) return { skipped: 'no step' };
    if (run.status !== 'running') {
      await this.Step.objects
        .filter({ pk: row.pk, status__in: ['waiting', 'queued', 'retrying'] })
        .update({ status: 'cancelled', finishedAt: new Date() });
      return { skipped: `the run is ${run.status}` };
    }
    if (FINISHED.has(row.status)) {
      // Done by a run of its job that stopped before it moved the run on.
      await this.advance(run);
      return { skipped: 'done before' };
    }
    const now = new Date();
    let taken = await this.Step.objects
      .filter({ pk: row.pk, status__in: ['waiting', 'queued', 'retrying'] })
      .update({ status: 'running', attempts: job.attempts, startedAt: now, error: null });
    if (!taken) {
      // The job of a worker that died while it ran this step, taken back by the queue (a later attempt).
      taken = await this.Step.objects
        .filter({ pk: row.pk, status: 'running', attempts__lt: job.attempts })
        .update({ attempts: job.attempts, startedAt: now, error: null });
    }
    if (!taken) return { skipped: 'running elsewhere' };
    this.emit('step', run, stepId, 'running');
    const definition = run.definition;
    const step = definition.steps.find((item) => item.id === stepId);
    const block = this.blocks.get(step.block);
    if (!block) throw new PipelineError(`No block ${step.block} in this process (pipelines.block() registers it)`);
    const rows = await this.Step.objects.filter({ run: String(run.pk) });
    const statuses = Object.fromEntries(rows.map((item) => [item.step, item.status]));
    const outputs = Object.fromEntries(
      rows.filter((item) => item.status === 'done').map((item) => [item.step, item.output])
    );
    let waitOptions = null;
    const ctx = {
      config: step.config,
      step: stepId,
      run: { id: run.pk, pipeline: run.pipeline, input: run.input },
      outputs,
      job,
      signal: job.signal,
      node: job.node,
      attempt: job.attempts,
      // Paused until resume(); { timeout, onTimeout } over those of the step.
      wait: (options) => {
        waitOptions = options || null;
        return WAIT;
      },
    };
    const output = await block.run(Pipelines.inputOf(step, run, outputs, statuses), ctx);
    if (output === WAIT) {
      await this.pause(run, row, step, job.attempts, waitOptions || {});
      return { paused: stepId };
    }
    await this.finish(run, row, output, { status: 'running', attempts: job.attempts }, true);
    return output === undefined ? null : output;
  }

  // Ends a step with its output (from the status it expects), gives its place back when it had one, and moves the
  // run on.
  async finish(run, row, output, from, hadPlace = false) {
    const done = await this.Step.objects.filter({ pk: row.pk, ...from }).update({
      status: 'done',
      output: output === undefined ? null : output,
      finishedAt: new Date(),
      pausedUntil: null,
    });
    if (!done) return false;
    if (hadPlace) await this.givePlace(run);
    this.emit('step', run, row.step, 'done');
    await this.advance(run);
    return true;
  }

  // A step that gave ctx.wait(): paused (its place given back), until resume() or the end of its wait.
  async pause(run, row, step, attempts, options) {
    const given = options.timeout !== undefined ? options.timeout : step.waitTimeout;
    const timeout = given === undefined || given === null ? 0 : ms(given);
    const onTimeout = options.onTimeout !== undefined ? options.onTimeout : step.onTimeout || 'fail';
    if (!validOnTimeout(onTimeout))
      throw new PipelineError(`onTimeout of step ${step.id} is 'fail', 'skip' or { output }`);
    // The end of this wait: the job of its timeout applies to this pause only (not to a later one of the step).
    const until = timeout ? new Date(Date.now() + timeout) : null;
    const paused = await this.Step.objects
      .filter({ pk: row.pk, status: 'running', attempts })
      .update({ status: 'paused', pausedUntil: until });
    if (!paused) return;
    if (timeout) {
      const runId = String(run.pk);
      await this.queue.enqueue(
        TIMEOUT_JOB,
        { run: runId, step: step.id, until: until.toISOString(), onTimeout, timeout },
        { delay: timeout, key: `${TIMEOUT_JOB}:${runId}:${step.id}:${until.getTime()}` }
      );
    }
    this.emit('step', run, step.id, 'paused');
    if (run.definition.concurrency) {
      await this.givePlace(run);
      await this.advance(run);
    }
    // A child run that ended before its step paused (its steps all skipped, or quick): the step ends now.
    const now = await this.Step.objects.filter({ pk: row.pk }).first();
    if (now && now.child && now.status === 'paused') {
      const child = await this.Run.objects.filter({ pk: now.child }).first();
      if (child && child.status !== 'running') await this.childEnded(child);
    }
  }

  // The run of a step of the block 'pipeline': a child of its run, started (one deeper), and the step paused until it
  // ends. A child an earlier run of the step started (its job taken back) is cancelled.
  async startChild(input, ctx) {
    const parent = await this.Run.objects.filter({ pk: ctx.run.id }).first();
    const depth = (parent.depth || 0) + 1;
    if (depth > this.maxDepth) {
      throw new PipelineError(`Pipelines started from pipelines ${this.maxDepth} deep at most (maxDepth): a cycle?`);
    }
    const parentId = String(parent.pk);
    const row = await this.Step.objects.filter({ run: parentId, step: ctx.step }).first();
    if (row && row.child) await this.cancel(row.child);
    const scope = { input, outputs: ctx.outputs, run: ctx.run, config: ctx.config };
    const childInput = ctx.config.input === undefined ? input : expression(ctx.config.input)(scope);
    const child = await this.start(ctx.config.pipeline, childInput === undefined ? null : childInput, {
      parent: { run: parentId, step: ctx.step, depth },
    });
    await this.Step.objects.filter({ run: parentId, step: ctx.step }).update({ child: String(child.pk) });
    return ctx.wait();
  }

  // A child run ended: the step of its parent that waits for it (paused, with it as its child) ends with its result,
  // or fails (and its run) when the child failed or was cancelled.
  async childEnded(child) {
    if (!child.parent) return;
    const parent = await this.Run.objects.filter({ pk: child.parent }).first();
    if (!parent || parent.status !== 'running') return;
    const row = await this.Step.objects.filter({ run: String(parent.pk), step: child.parentStep }).first();
    if (!row) return;
    const from = { status: 'paused', child: String(child.pk) };
    if (child.status === 'done') {
      await this.finish(parent, row, child.result, from);
      return;
    }
    const fresh = await this.Run.objects.filter({ pk: child.pk }).first();
    const why = fresh && fresh.error ? `: ${fresh.error}` : '';
    const err = new PipelineError(
      `The pipeline ${child.pipeline} (run ${child.pk}) ${child.status === 'cancelled' ? 'was cancelled' : 'failed'}${why}`
    );
    const failed = await this.Step.objects
      .filter({ pk: row.pk, ...from })
      .update({ status: 'failed', error: errorText(err), finishedAt: new Date(), pausedUntil: null });
    if (failed) await this.failRun(parent, row.step, err);
  }

  // The end of the wait of a paused step (the job of its timeout): nothing when it was resumed (or the run ended);
  // otherwise as onTimeout says. Each change only from this pause (paused, with its end), so resume() and it do not both
  // apply, and the timeout of a pause does not end a later one.
  async pauseTimedOut(payload) {
    const run = await this.Run.objects.filter({ pk: payload.run }).first();
    if (!run || run.status !== 'running') return { skipped: 'the run is not running' };
    const row = await this.Step.objects.filter({ run: String(run.pk), step: payload.step }).first();
    if (!row) return { skipped: 'no step' };
    const outcome = await this.applyTimeout(run, row, payload);
    // The run it waited for (the block 'pipeline'): cancelled once the wait ended, whatever onTimeout said (the step is
    // not paused any more, so its end changes nothing).
    if (outcome.timedOut && row.child) await this.cancel(row.child);
    return outcome;
  }

  async applyTimeout(run, row, { step: stepId, until, onTimeout, timeout }) {
    const from = { pk: row.pk, status: 'paused', pausedUntil: new Date(until) };
    if (isObject(onTimeout)) {
      const done = await this.finish(run, row, onTimeout.output, { status: 'paused', pausedUntil: new Date(until) });
      return done ? { timedOut: stepId, output: true } : { skipped: 'not paused' };
    }
    if (onTimeout === 'skip') {
      const skipped = await this.Step.objects
        .filter(from)
        .update({ status: 'skipped', finishedAt: new Date(), pausedUntil: null });
      if (!skipped) return { skipped: 'not paused' };
      this.emit('step', run, stepId, 'skipped');
      await this.advance(run);
      return { timedOut: stepId, skipped: true };
    }
    const err = new PipelineError(`The step ${stepId} waited more than ${timeout} ms`);
    err.code = 'XUFA_PIPELINE_WAIT_TIMEOUT';
    const failed = await this.Step.objects
      .filter(from)
      .update({ status: 'failed', error: errorText(err), finishedAt: new Date(), pausedUntil: null });
    if (!failed) return { skipped: 'not paused' };
    await this.failRun(run, stepId, err);
    return { timedOut: stepId, failed: true };
  }

  // Ends a paused step (a 'wait' block, or one that gave ctx.wait()) with its output, and moves the run on.
  async resume(runId, stepId, output = null) {
    const run = await this.Run.objects.filter({ pk: runId }).first();
    if (!run) throw new PipelineError(`No run ${runId}`);
    if (run.status !== 'running') throw new PipelineError(`The run ${runId} is ${run.status}`);
    const row = await this.Step.objects.filter({ run: String(run.pk), step: String(stepId) }).first();
    if (!row) throw new PipelineError(`No step ${stepId} in the run ${runId}`);
    if (!(await this.finish(run, row, output, { status: 'paused' }))) {
      throw new PipelineError(`The step ${stepId} of the run ${runId} is ${row.status}, not paused`);
    }
    return this.get(run.pk);
  }

  // A job of a step failed: tried again later (retrying), or the step and its run failed.
  async onJobFailed(job, err, final) {
    if (!job || typeof job.name !== 'string' || !job.name.startsWith(JOB_PREFIX)) return;
    const { run: runId, step: stepId } = job.payload || {};
    try {
      const run = await this.Run.objects.filter({ pk: runId }).first();
      if (!run) return;
      const row = await this.Step.objects.filter({ run: String(run.pk), step: stepId }).first();
      if (!row) return;
      if (!final) {
        const moved = await this.Step.objects
          .filter({ pk: row.pk, status: 'running' })
          .update({ status: 'retrying', error: errorText(err) });
        if (moved) this.emit('step', run, stepId, 'retrying');
        return;
      }
      await this.fail(run, stepId, err, row);
    } catch (failure) {
      if (this.listenerCount('error')) this.emit('error', failure);
      else process.emitWarning(failure);
    }
  }

  async fail(run, stepId, err, row) {
    const step = row || (await this.Step.objects.filter({ run: String(run.pk), step: stepId }).first());
    await this.Step.objects
      .filter({ pk: step.pk, status__in: ['waiting', 'queued', 'running', 'retrying', 'paused'] })
      .update({ status: 'failed', error: errorText(err), finishedAt: new Date() });
    await this.failRun(run, stepId, err);
  }

  async failRun(run, stepId, err) {
    const failed = await this.Run.objects
      .filter({ pk: run.pk, status: 'running' })
      .update({ status: 'failed', error: `The step ${stepId} failed: ${messageOf(err)}`, finishedAt: new Date() });
    if (failed) {
      run.status = 'failed';
      this.emit('step', run, stepId, 'failed');
      this.emit('failed', run, err, stepId);
      await this.childEnded(run);
    }
  }

  // Cancels a run: its steps not started are not run, and those running end without moving it on.
  async cancel(runId) {
    const cancelled = await this.Run.objects
      .filter({ pk: runId, status: 'running' })
      .update({ status: 'cancelled', finishedAt: new Date() });
    if (!cancelled) return false;
    await this.Step.objects
      .filter({ run: String(runId), status__in: ['waiting', 'queued', 'retrying', 'paused'] })
      .update({ status: 'cancelled', finishedAt: new Date() });
    // Its children that run (the steps of the block 'pipeline'), cancelled too.
    for (const child of await this.Run.objects.filter({ parent: String(runId), status: 'running' })) {
      await this.cancel(child.pk);
    }
    const run = await this.Run.objects.filter({ pk: runId }).first();
    if (run) await this.childEnded(run);
    return true;
  }

  // A failed (or cancelled) run goes on from where it stopped: its failed and cancelled steps wait again; those done
  // are not run again.
  async retry(runId) {
    const moved = await this.Run.objects
      .filter({ pk: runId, status__in: ['failed', 'cancelled'] })
      .update({ status: 'running', error: null, finishedAt: null });
    if (!moved) return false;
    await this.Step.objects
      .filter({ run: String(runId), status__in: ['failed', 'cancelled'] })
      .update({ status: 'waiting', error: null, finishedAt: null, attempts: 0 });
    const run = await this.Run.objects.get({ pk: runId });
    await this.recount(run);
    await this.advance(run);
    return true;
  }

  // Runs whose process stopped between two steps (a step queued without its job, or one done and the run not moved
  // on): moved on again. Their number.
  async recover() {
    const runs = await this.Run.objects.filter({ status: 'running' });
    for (const run of runs) {
      const id = String(run.pk);
      await this.recount(run);
      for (const row of await this.Step.objects.filter({ run: id, status: 'queued' })) {
        const step = run.definition.steps.find((item) => item.id === row.step);
        // Keyed: a job pending or running for the step is given back instead of another.
        if (step) await this.enqueueStep(run, step);
      }
      await this.advance(run);
    }
    return runs.length;
  }
}

export { Pipelines, PipelineError, WAIT };
