// Pipelines of @xufa/queue: steps in order, in parallel and joined, results, conditions (skipped steps and their
// branches), failures (retrying, failed, retry() from where it stopped), steps that wait for resume(), transforms,
// triggers, cancel, validation, a step whose job runs twice, a late step after its timeout, pools of nodes, recover()
// and workers on several queues. On the memory backend and SQLite (PostgreSQL with XUFA_PG_URL, MongoDB with
// XUFA_MONGO_URL).
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { Database } = require('@xufa/orm');
const { Bus, Pool } = require('@xufa/cluster');
const { Queue, Pipelines, PipelineError } = require('..');

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

const BACKENDS = [
  ['memory', () => ({ backend: 'memory' })],
  [
    'sqlite',
    () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-pipelines-'));
      dirs.push(dir);
      return { backend: 'sqlite', filename: path.join(dir, 'pipelines.db') };
    },
  ],
];
if (process.env.XUFA_PG_URL) BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL })]);
if (process.env.XUFA_MONGO_URL)
  BACKENDS.push(['mongodb', () => ({ backend: 'mongodb', url: process.env.XUFA_MONGO_URL })]);

const until = async (check, timeout = 5000) => {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const statusesOf = (state) => Object.fromEntries(Object.entries(state.steps).map(([id, step]) => [id, step.status]));

for (const [name, options] of BACKENDS) {
  describe(`pipelines on ${name}`, () => {
    let db;
    let queue;
    let pipelines;

    beforeEach(async () => {
      db = new Database(options());
      queue = new Queue(db, { backoff: 0, table: 'xufa_test_pjobs' });
      pipelines = new Pipelines(queue, { table: 'xufa_test_pipeline' });
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterEach(async () => {
      await queue.stop();
      await db.drop();
      await db.close();
    });

    it('runs steps in order, in parallel and joined, and keeps each step and the result', async () => {
      const ran = [];
      pipelines.block('double', (input, { step }) => {
        ran.push(step);
        return input * 2;
      });
      pipelines.block('sum', (input, { step }) => {
        ran.push(step);
        return Object.values(input).reduce((a, b) => a + b, 0);
      });
      pipelines.define({
        name: 'math',
        steps: [
          { id: 'first', block: 'double' },
          { id: 'left', block: 'double', after: ['first'] },
          { id: 'right', block: 'double', after: 'first' },
          { id: 'total', block: 'sum', after: ['left', 'right'] },
        ],
      });
      const run = await pipelines.start('math', 5);
      expect(run.status).toBe('running');
      expect(await queue.runDue()).toEqual({ done: 4, retrying: 0, failed: 0 });
      const state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('done');
      // first: 10; left and right: 20 each; total: 40 (the last step's output is the result).
      expect(state.run.result).toBe(40);
      expect(statusesOf(state)).toEqual({ first: 'done', left: 'done', right: 'done', total: 'done' });
      expect(state.steps.left.output).toBe(20);
      expect(state.steps.total.attempts).toBe(1);
      expect(ran[0]).toBe('first');
      expect(ran[3]).toBe('total');
      expect(state.run.definition.steps.map((step) => step.id)).toEqual(['first', 'left', 'right', 'total']);
    });

    it('conditions: a step whose when is false is skipped with its branch; a join runs with the steps done', async () => {
      pipelines.block('echo', (input, { config }) => config.value ?? input);
      pipelines.define({
        name: 'branches',
        steps: [
          { id: 'size', block: 'echo' },
          { id: 'big', block: 'echo', after: 'size', when: 'input > 100', config: { value: 'big' } },
          { id: 'bigger', block: 'echo', after: 'big', config: { value: 'bigger' } },
          { id: 'small', block: 'echo', after: 'size', when: (input) => input <= 100, config: { value: 'small' } },
          { id: 'join', block: 'echo', after: ['bigger', 'small'] },
        ],
      });
      const run = await pipelines.start('branches', 7);
      await queue.runDue();
      const state = await pipelines.get(run.pk);
      expect(statusesOf(state)).toEqual({
        size: 'done',
        big: 'skipped',
        bigger: 'skipped',
        small: 'done',
        join: 'done',
      });
      expect(state.steps.join.output).toEqual({ small: 'small' });
      expect(state.run.status).toBe('done');
    });

    it('results: the outputs of the steps marked result, merged', async () => {
      pipelines.block('give', (input, { config }) => config.give);
      const run = await pipelines.start(
        {
          name: 'merged',
          steps: [
            { id: 'a', block: 'give', config: { give: { a: 1 } }, result: true },
            { id: 'b', block: 'give', config: { give: { b: 2 } }, result: true },
            { id: 'log', block: 'give', after: ['a', 'b'], config: { give: 'not the result' } },
          ],
        },
        null
      );
      await queue.runDue();
      expect((await pipelines.get(run.pk)).run.result).toEqual({ a: 1, b: 2 });
    });

    it('failures: retrying, then the step and the run failed; retry() goes on from the step that failed', async () => {
      let broken = true;
      const ran = [];
      pipelines.block('ok', (input, { step }) => {
        ran.push(step);
        return step;
      });
      pipelines.block('flaky', {
        attempts: 2,
        run: () => {
          ran.push('flaky');
          if (broken) throw new Error('the converter is down');
          return 'fixed';
        },
      });
      pipelines.define({
        name: 'fragile',
        steps: [
          { id: 'start', block: 'ok' },
          { id: 'model', block: 'flaky', after: 'start' },
          { id: 'end', block: 'ok', after: 'model' },
        ],
      });
      const failed = [];
      pipelines.on('failed', (run, err, step) => failed.push([step, err.message]));
      const run = await pipelines.start('fragile');
      expect(await queue.runDue()).toEqual({ done: 1, retrying: 1, failed: 1 });
      let state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('failed');
      expect(state.run.error).toBe('The step model failed: the converter is down');
      expect(statusesOf(state)).toEqual({ start: 'done', model: 'failed', end: 'waiting' });
      expect(state.steps.model.error).toContain('the converter is down');
      expect(failed).toEqual([['model', 'the converter is down']]);
      broken = false;
      expect(await pipelines.retry(run.pk)).toBe(true);
      await queue.runDue();
      state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('done');
      expect(state.run.result).toBe('end');
      // start ran once: retry() does not run again the steps done.
      expect(ran).toEqual(['start', 'flaky', 'flaky', 'flaky', 'end']);
    });

    it('a step that waits: paused until resume() gives its output', async () => {
      pipelines.block('ask', (input) => ({ asked: input }));
      pipelines.define({
        name: 'approval',
        steps: [
          { id: 'ask', block: 'ask' },
          { id: 'approve', block: 'wait', after: 'ask' },
          {
            id: 'publish',
            block: 'transform',
            after: 'approve',
            config: { value: 'input.ok ? "published" : "dropped"' },
          },
        ],
      });
      const run = await pipelines.start('approval', 'post 1');
      await queue.runDue();
      let state = await pipelines.get(run.pk);
      expect(statusesOf(state)).toEqual({ ask: 'done', approve: 'paused', publish: 'waiting' });
      await expect(pipelines.resume(run.pk, 'publish', {})).rejects.toThrow(/not paused/);
      state = await pipelines.resume(run.pk, 'approve', { ok: true });
      expect(state.steps.approve.output).toEqual({ ok: true });
      await queue.runDue();
      expect((await pipelines.get(run.pk)).run.result).toBe('published');
    });

    it('transform: expressions over the input, the outputs and the run', async () => {
      pipelines.block('scores', () => ({ readability: 0.82, spam: 0.31 }));
      const definition = JSON.parse(
        JSON.stringify({
          name: 'report',
          trigger: 'document.checked',
          steps: [
            { id: 1, block: 'scores' },
            {
              id: 2,
              parent: 1,
              block: 'transform',
              config: {
                map: { user: 'run.input.user', best: 'input.readability > input.spam ? "readability" : "spam"' },
              },
              result: true,
            },
          ],
        })
      );
      pipelines.define(definition);
      pipelines.define({ name: 'other', trigger: 'document.checked', steps: [{ id: 'x', block: 'scores' }] });
      const runs = await pipelines.trigger('document.checked', { user: 'ada' });
      expect(runs.map((run) => run.pipeline).sort()).toEqual(['other', 'report']);
      expect(runs[0].trigger).toBe('document.checked');
      await queue.runDue();
      const report = runs.find((run) => run.pipeline === 'report');
      expect((await pipelines.get(report.pk)).run.result).toEqual({ user: 'ada', best: 'readability' });
      expect(await pipelines.trigger('nothing')).toEqual([]);
    });

    it('cancel(): the steps not started are not run', async () => {
      pipelines.block('noop', () => 1);
      pipelines.define({
        name: 'two',
        steps: [
          { id: 'a', block: 'noop' },
          { id: 'b', block: 'noop', after: 'a' },
        ],
      });
      const run = await pipelines.start('two');
      expect(await pipelines.cancel(run.pk)).toBe(true);
      expect(await pipelines.cancel(run.pk)).toBe(false);
      await queue.runDue();
      const state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('cancelled');
      expect(statusesOf(state)).toEqual({ a: 'cancelled', b: 'cancelled' });
    });

    it('a step runs once when its job runs twice; a run with a key is not started twice', async () => {
      let runs = 0;
      pipelines.block('count', () => {
        runs += 1;
        return runs;
      });
      pipelines.define({ name: 'once', steps: [{ id: 'only', block: 'count' }] });
      const run = await pipelines.start('once', null, { key: 'once:1' });
      expect((await pipelines.start('once', null, { key: 'once:1' })).pk).toEqual(run.pk);
      // Another job for the same step (as one taken back by the queue after its worker died).
      await queue.enqueue('xufa:block:count', { run: String(run.pk), step: 'only' });
      await queue.runDue();
      expect(runs).toBe(1);
      expect((await pipelines.get(run.pk)).run.result).toBe(1);
    });

    it('a step past its timeout is tried again, and its late end does not count', async () => {
      let calls = 0;
      let late = null;
      pipelines.block('slow', {
        timeout: 30,
        attempts: 2,
        run: async () => {
          calls += 1;
          if (calls === 1) {
            late = new Promise((resolve) => setTimeout(resolve, 80)).then(() => 'late');
            return late;
          }
          return 'second';
        },
      });
      pipelines.define({ name: 'slow', steps: [{ id: 's', block: 'slow' }] });
      const run = await pipelines.start('slow');
      expect(await queue.runDue()).toEqual({ done: 1, retrying: 1, failed: 0 });
      await late;
      await new Promise((resolve) => setTimeout(resolve, 20));
      const state = await pipelines.get(run.pk);
      expect(state.steps.s.output).toBe('second');
      expect(state.steps.s.attempts).toBe(2);
    });

    it('a block with a pool of nodes runs with ctx.node', async () => {
      const bus = new Bus();
      const pool = new Pool('converters', { bus, nodes: [{ id: 'converter-1' }] });
      pipelines.block('infer', { pool, run: (input, { node }) => `${input} on ${node.id}` });
      pipelines.define({ name: 'pooled', steps: [{ id: 'infer', block: 'infer' }] });
      const run = await pipelines.start('pooled', 'report.docx');
      await queue.runDue();
      expect((await pipelines.get(run.pk)).run.result).toBe('report.docx on converter-1');
      pool.close();
    });

    it('recover(): a step queued without its job is queued again', async () => {
      pipelines.block('noop', () => 'ok');
      pipelines.define({ name: 'lost', steps: [{ id: 'a', block: 'noop' }] });
      const run = await pipelines.start('lost');
      // The process stopped after the step was queued and before its job was written.
      await queue.jobs.delete();
      expect(await queue.runDue()).toEqual({ done: 0, retrying: 0, failed: 0 });
      expect(await pipelines.recover()).toBe(1);
      await queue.runDue();
      expect((await pipelines.get(run.pk)).run.status).toBe('done');
    });

    it('concurrency: never more steps of a run at once than its limit, among every worker', async () => {
      const other = new Queue(db, { jobModel: queue.Job, backoff: 0 });
      const otherPipelines = new Pipelines(other, { models: pipelines });
      const running = new Map();
      const most = new Map();
      const block = async (input, { run }) => {
        running.set(run.id, (running.get(run.id) || 0) + 1);
        most.set(run.id, Math.max(most.get(run.id) || 0, running.get(run.id)));
        await new Promise((resolve) => setTimeout(resolve, 15));
        running.set(run.id, running.get(run.id) - 1);
        return 1;
      };
      for (const engine of [pipelines, otherPipelines]) {
        engine.block('work', block);
        engine.define({
          name: 'limited',
          concurrency: 2,
          steps: [
            { id: 'start', block: 'work' },
            ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, block: 'work', after: 'start' })),
            { id: 'end', block: 'work', after: ['a', 'b', 'c', 'd', 'e', 'f'] },
          ],
        });
      }
      const runs = [await pipelines.start('limited'), await pipelines.start('limited')];
      queue.work({ concurrency: 6, poll: 10 });
      other.work({ concurrency: 6, poll: 10 });
      await until(async () => (await pipelines.runs.filter({ status: 'done' }).count()) === 2, 20000);
      await other.stop();
      for (const run of runs) {
        expect(most.get(run.pk)).toBe(2);
        expect((await pipelines.get(run.pk)).run.inFlight).toBe(0);
      }
    }, 30000);

    it('a paused step gives its place back; resume() goes on', async () => {
      const order = [];
      pipelines.block('note', (input, { step }) => {
        order.push(step);
        return step;
      });
      pipelines.define({
        name: 'one-at-once',
        concurrency: 1,
        steps: [
          { id: 'approve', block: 'wait' },
          { id: 'other', block: 'note' },
          { id: 'after', block: 'note', after: 'approve' },
        ],
      });
      const run = await pipelines.start('one-at-once');
      await queue.runDue();
      let state = await pipelines.get(run.pk);
      expect(statusesOf(state)).toEqual({ approve: 'paused', other: 'done', after: 'waiting' });
      expect(state.run.inFlight).toBe(0);
      await pipelines.resume(run.pk, 'approve', 'yes');
      await queue.runDue();
      state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('done');
      expect(order).toEqual(['other', 'after']);
    });

    it('waitTimeout: a step paused too long fails its run, skips its branch, or goes on with an output', async () => {
      pipelines.block('echo', (input) => input);
      // The block asks for a wait of its own (over the step's).
      pipelines.block('ask', (input, ctx) => ctx.wait({ timeout: 200, onTimeout: { output: 'by default' } }));
      const define = (name, step) =>
        pipelines.define({
          name,
          steps: [
            { id: 'approve', block: 'wait', ...step },
            { id: 'next', block: 'echo', after: 'approve' },
          ],
        });
      define('fails', { waitTimeout: 200 });
      define('skips', { waitTimeout: 200, onTimeout: 'skip' });
      define('defaults', { waitTimeout: '200ms', onTimeout: { output: { approved: false } } });
      define('resumed', { waitTimeout: 200 });
      pipelines.define({
        name: 'asks',
        steps: [
          { id: 'approve', block: 'ask' },
          { id: 'next', block: 'echo', after: 'approve' },
        ],
      });
      const runs = {};
      for (const name of ['fails', 'skips', 'defaults', 'resumed', 'asks']) runs[name] = await pipelines.start(name);
      // The five steps (due before their timeouts).
      await queue.runDue({ limit: 5 });
      const paused = await pipelines.get(runs.fails.pk);
      expect(paused.steps.approve.status).toBe('paused');
      expect(paused.steps.approve.pausedUntil).toBeInstanceOf(Date);
      // Resumed in time: its timeout does nothing.
      await pipelines.resume(runs.resumed.pk, 'approve', 'in time');
      await new Promise((resolve) => setTimeout(resolve, 250));
      await queue.runDue();
      const failed = await pipelines.get(runs.fails.pk);
      expect(failed.run.status).toBe('failed');
      expect(failed.run.error).toMatch(/The step approve failed: The step approve waited more than 200 ms/);
      expect(statusesOf(failed)).toEqual({ approve: 'failed', next: 'waiting' });
      const skipped = await pipelines.get(runs.skips.pk);
      expect([skipped.run.status, statusesOf(skipped)]).toEqual(['done', { approve: 'skipped', next: 'skipped' }]);
      expect((await pipelines.get(runs.defaults.pk)).run.result).toEqual({ approved: false });
      expect((await pipelines.get(runs.resumed.pk)).run.result).toBe('in time');
      expect((await pipelines.get(runs.asks.pk)).run.result).toBe('by default');
      // A failed run tried again waits again (the job of its step only: not past its new timeout).
      expect(await pipelines.retry(runs.fails.pk)).toBe(true);
      await queue.runDue({ limit: 1 });
      expect((await pipelines.get(runs.fails.pk)).steps.approve.status).toBe('paused');
    });

    it('the block pipeline: a step runs another pipeline, waits, and goes on with its result', async () => {
      pipelines.block('double', (input) => input * 2);
      pipelines.define({
        name: 'child',
        steps: [
          { id: 'a', block: 'double' },
          { id: 'b', block: 'double', after: 'a' },
        ],
      });
      pipelines.define({
        name: 'parent',
        steps: [
          { id: 'first', block: 'double' },
          { id: 'sub', block: 'pipeline', after: 'first', config: { pipeline: 'child' } },
          { id: 'shaped', block: 'pipeline', after: 'first', config: { pipeline: 'child', input: 'input * 10' } },
          { id: 'last', block: 'transform', after: ['sub', 'shaped'], config: { value: 'input.sub + input.shaped' } },
        ],
      });
      const run = await pipelines.start('parent', 1);
      await queue.runDue();
      const state = await pipelines.get(run.pk);
      // first: 2; sub: child of 2 (8); shaped: child of 20 (80); last: 88.
      expect([state.run.status, state.run.result]).toEqual(['done', 88]);
      expect([state.steps.sub.status, state.steps.sub.output, state.steps.shaped.output]).toEqual(['done', 8, 80]);
      const child = await pipelines.get(state.steps.sub.child);
      expect(child.run).toMatchObject({
        pipeline: 'child',
        status: 'done',
        input: 2,
        result: 8,
        parentStep: 'sub',
        depth: 1,
      });
      expect(String(child.run.parent)).toBe(String(run.pk));
      expect(await pipelines.runs.filter({ parent: String(run.pk) }).count()).toBe(2);
    });

    it('a child that fails fails its step and run; retry() starts another child', async () => {
      let broken = true;
      pipelines.block('maybe', () => {
        if (broken) throw new Error('the converter is down');
        return 'converted';
      });
      pipelines.define({ name: 'convert', steps: [{ id: 'only', block: 'maybe', attempts: 1 }] });
      pipelines.define({ name: 'outer', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'convert' } }] });
      const run = await pipelines.start('outer');
      await queue.runDue();
      let state = await pipelines.get(run.pk);
      expect(state.run.status).toBe('failed');
      const first = state.steps.sub.child;
      expect(state.run.error).toBe(
        `The step sub failed: The pipeline convert (run ${first}) failed: The step only failed: the converter is down`
      );
      broken = false;
      expect(await pipelines.retry(run.pk)).toBe(true);
      await queue.runDue();
      state = await pipelines.get(run.pk);
      expect([state.run.status, state.run.result]).toEqual(['done', 'converted']);
      expect(String(state.steps.sub.child)).not.toBe(String(first));
    });

    it('a child waits: the deadline of its step cancels it; cancelling the parent cancels it', async () => {
      pipelines.define({ name: 'approval', steps: [{ id: 'approve', block: 'wait' }] });
      pipelines.define({
        name: 'limited',
        steps: [
          {
            id: 'sub',
            block: 'pipeline',
            config: { pipeline: 'approval' },
            waitTimeout: 200,
            onTimeout: { output: 'late' },
          },
        ],
      });
      pipelines.define({ name: 'open', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'approval' } }] });
      const limited = await pipelines.start('limited');
      const open = await pipelines.start('open');
      // The steps of the parents, then those of their children (due before the deadline).
      await queue.runDue({ limit: 4 });
      const childOf = async (run) => (await pipelines.get(run.pk)).steps.sub.child;
      const [limitedChild, openChild] = [await childOf(limited), await childOf(open)];
      expect((await pipelines.get(limitedChild)).steps.approve.status).toBe('paused');
      expect(await pipelines.cancel(open.pk)).toBe(true);
      expect((await pipelines.get(openChild)).run.status).toBe('cancelled');
      await new Promise((resolve) => setTimeout(resolve, 250));
      await queue.runDue();
      expect((await pipelines.get(limited.pk)).run).toMatchObject({ status: 'done', result: 'late' });
      expect((await pipelines.get(limitedChild)).run.status).toBe('cancelled');
    });

    it('a child that ends at once (every step skipped) ends its step; a cycle stops at maxDepth', async () => {
      pipelines.block('double', (input) => input * 2);
      pipelines.define({ name: 'nothing', steps: [{ id: 'never', block: 'double', when: 'false' }] });
      pipelines.define({ name: 'quick', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'nothing' } }] });
      const quick = await pipelines.start('quick', 1);
      await queue.runDue();
      expect((await pipelines.get(quick.pk)).run).toMatchObject({ status: 'done', result: null });
      pipelines.define({ name: 'loop', steps: [{ id: 'again', block: 'pipeline', config: { pipeline: 'loop' } }] });
      const loop = await pipelines.start('loop');
      await queue.runDue();
      const top = await pipelines.get(loop.pk);
      expect(top.run.status).toBe('failed');
      // Each run failed with the one it started, down to the one too deep.
      expect(await pipelines.runs.filter({ pipeline: 'loop' }).count()).toBe(11);
      expect(await pipelines.runs.filter({ pipeline: 'loop', status: 'failed' }).count()).toBe(11);
      const deepest = await pipelines.runs.filter({ pipeline: 'loop', depth: 10 }).first();
      expect(deepest.error).toMatch(/10 deep at most \(maxDepth\)/);
      pipelines.define({ name: 'lost', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'nope' } }] });
      const lost = await pipelines.start('lost');
      await queue.runDue();
      expect((await pipelines.get(lost.pk)).run.error).toMatch(/No pipeline named nope/);
    });

    it('workers on two queues of the database run the steps of many runs, each step once', async () => {
      const other = new Queue(db, { jobModel: queue.Job, backoff: 0 });
      const otherPipelines = new Pipelines(other, { models: pipelines });
      const counts = new Map();
      const block = (input, { run, step }) => {
        const key = `${run.id}:${step}`;
        counts.set(key, (counts.get(key) || 0) + 1);
        return 1;
      };
      for (const engine of [pipelines, otherPipelines]) {
        engine.block('step', block);
        engine.define({
          name: 'wide',
          steps: [
            { id: 'a', block: 'step' },
            { id: 'b', block: 'step', after: 'a' },
            { id: 'c', block: 'step', after: 'a' },
            { id: 'd', block: 'step', after: ['b', 'c'] },
          ],
        });
      }
      const runs = [];
      for (let i = 0; i < 6; i += 1) runs.push(await pipelines.start('wide'));
      queue.work({ concurrency: 3, poll: 10 });
      other.work({ concurrency: 3, poll: 10 });
      await until(async () => (await pipelines.runs.filter({ status: 'done' }).count()) === 6, 10000);
      await other.stop();
      expect(counts.size).toBe(24);
      expect([...counts.values()].every((count) => count === 1)).toBe(true);
    }, 30000);
  });
}

describe('pipelines: definitions', () => {
  const queue = new Queue(new Database({ backend: 'memory' }));
  const pipelines = new Pipelines(queue);
  pipelines.block('noop', { validate: (config) => (config.bad ? 'bad is not allowed' : undefined), run: () => 1 });

  it('says every error of a definition', () => {
    const errors = pipelines.check({
      name: 'broken',
      steps: [
        { id: 'a', block: 'nope' },
        { id: 'a', block: 'noop' },
        { id: 'b', block: 'noop', after: 'missing', config: { bad: true } },
        { id: 'c', block: 'noop', after: 'd' },
        { id: 'd', block: 'noop', after: 'c', when: 'input >' },
        { id: 'e', block: 'transform', config: {} },
      ],
    });
    expect(errors).toEqual([
      'step a: no block nope (pipelines.block() registers it)',
      'steps[1]: the id a is there twice',
      'step b: bad is not allowed',
      expect.stringMatching(/^step d: when: /),
      'step e: config.map or config.value',
      'step b: after missing, which is not a step',
      'a cycle: c -> d -> c',
    ]);
    expect(() => pipelines.define({ name: 'x', steps: [{ id: 'a', block: 'nope' }] })).toThrow(PipelineError);
    expect(pipelines.check({ name: 'empty', steps: [] })).toEqual(['steps is a list of steps']);
    expect(
      pipelines.check({
        name: 'limits',
        concurrency: 0,
        steps: [{ id: 'a', block: 'wait', waitTimeout: 'soon', onTimeout: 'maybe' }],
      })
    ).toEqual([
      'concurrency is an integer of 1 or more',
      "step a: waitTimeout is a duration (as '24h')",
      "step a: onTimeout is 'fail', 'skip' or { output }",
    ]);
    expect(pipelines.check({ name: 'sub', steps: [{ id: 'a', block: 'pipeline', config: {} }] })).toEqual([
      'step a: config.pipeline is the name of a pipeline',
    ]);
  });

  it('steps of code: functions as run and when', async () => {
    await queue.db.sync();
    pipelines.define({
      name: 'code',
      steps: [
        { id: 'hello', run: (input) => `hello ${input}` },
        { id: 'shout', run: (input) => input.toUpperCase(), after: 'hello', when: (input) => input.length > 3 },
      ],
    });
    const run = await pipelines.start('code', 'ada');
    await queue.runDue();
    expect((await pipelines.get(run.pk)).run.result).toBe('HELLO ADA');
    await expect(pipelines.start('missing')).rejects.toThrow('No pipeline named missing');
  });
});
