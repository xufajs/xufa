// Scenarios: rules that come and go on a timeline. Steps start `at` and end after `for` (or at the end); the end and
// stop() remove every rule made (and let go what they hold); steps are checked before anything starts; events and
// status say what happened. And over HTTP: scenarios defined or of the body, listed, started, stopped.
import xufa from '@xufa/http';
import { Faults, scenario, cacheFaults, plugin } from '../index.js';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function database() {
  return new Faults({
    name: 'database',
    operations: ['select', 'insert'],
    groups: { read: ['select'], write: ['insert'] },
    filters: { models: 'model' },
  });
}

function memoryCache() {
  const map = new Map();
  const cache = {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
  cache.faults = cacheFaults(cache, 'cache');
  return cache;
}

describe('scenarios', () => {
  it('steps start at their time and end after `for`; the end removes what is left', async () => {
    const db = database();
    const cache = memoryCache();
    // The rules there after each event (timers of different times fire in their order, however late: no test of
    // the clock, which a busy machine would fail).
    const states = [];
    const kinds = (faults) => faults.rules.map((rule) => rule.kind).join(',') || '-';
    const run = scenario({
      name: 'brownout',
      targets: { db, cache },
      steps: [
        { at: 0, target: 'db', kind: 'delay', options: { operations: 'read', ms: 1 }, for: '250ms' },
        { at: '150ms', target: cache, kind: 'down' },
        { at: 200, target: 'db', kind: 'fail', options: { models: ['Order'] }, for: 150 },
      ],
      duration: 600,
      onEvent: (event) => {
        states.push(`${event.type}${event.step ? ` ${event.step}` : ''}: db ${kinds(db)}, cache ${kinds(cache.faults)}`);
      },
    });
    expect(run.duration).toBe(600);
    run.start();
    await tick(300);
    await expect(cache.faults.apply({ operation: 'get', key: 'k' }, () => 1)).rejects.toThrow(/down/);
    await run.run();
    expect(states).toEqual([
      'start: db -, cache -',
      'step 1: db delay, cache -',
      'step 2: db delay, cache down',
      'step 3: db delay,fail, cache down',
      'end 1: db fail, cache down', // 250 ms
      'end 3: db -, cache down', // 350 ms
      'end 2: db -, cache -', // the end of the scenario (600 ms)
      'done: db -, cache -',
    ]);
    expect([run.state, cache.faults.rules.length]).toEqual(['done', 0]);
    const status = run.status();
    expect(status.steps.map((step) => [step.target, step.kind, step.state])).toEqual([
      ['db', 'delay', 'done'],
      ['cache', 'down', 'done'],
      ['db', 'fail', 'done'],
    ]);
    expect(status.events.map((event) => event.type)).toEqual(['start', 'step', 'step', 'step', 'end', 'end', 'end', 'done']);
    expect(status.elapsed).toBe(600);
  });

  it('the duration is that of the last step when not given; stop() removes the rules and skips the steps not made', async () => {
    const db = database();
    const events = [];
    const run = scenario({
      steps: [
        { target: db, kind: 'hang', options: { operations: 'read' }, for: '1s' },
        { at: '500ms', target: db, kind: 'fail' },
      ],
      onEvent: (event) => events.push(event.type),
    });
    expect(run.duration).toBe(1000);
    run.start();
    await tick(5);
    let released = false;
    const held = db.apply({ operation: 'select' }, () => {
      released = true;
    });
    await tick(5);
    expect(released).toBe(false);
    run.stop();
    await held;
    expect([released, db.rules.length, run.state]).toEqual([true, 0, 'stopped']);
    expect(run.status().steps.map((step) => step.state)).toEqual(['done', 'skipped']);
    expect(run.status().steps[0].hits).toBe(1);
    expect(events).toEqual(['start', 'step', 'end', 'stopped']);
    expect(() => run.start()).toThrow(/has already run \(it is stopped\)/);
    await expect(run.run()).resolves.toBe(run);
  });

  it('steps are checked before it starts: targets, kinds, options, durations', () => {
    const db = database();
    const steps = (step) => scenario({ name: 'x', targets: { db }, steps: [step] });
    expect(() => scenario({ steps: [] })).toThrow('A scenario has steps');
    expect(() => steps({ target: 'cache', kind: 'fail' })).toThrow('Step 1 of the scenario x: no target cache (db)');
    expect(() => steps({ target: {}, kind: 'fail' })).toThrow('its target is not faults');
    expect(() => steps({ target: 'db', kind: 'explode' })).toThrow('db has no faults of the kind explode (fail, delay, hang, down)');
    expect(() => steps({ target: 'db', kind: 'fail', options: { operations: 'drop' } })).toThrow(/not drop/);
    expect(() => steps({ target: 'db', kind: 'fail', options: { rate: 2 } })).toThrow(/from 0 to 1/);
    expect(() => steps({ target: 'db', kind: 'delay', options: {} })).toThrow(/has ms/);
    expect(() => steps({ target: 'db', kind: 'fail', at: 'soon' })).toThrow(/at is a duration/);
    expect(() => steps({ target: 'db', kind: 'fail', for: 0 })).toThrow(/for is a duration/);
    expect(() => steps({ target: 'db', kind: 'fail' })).toThrow('lasts no time: give it a duration');
    expect(() => scenario({ steps: [{ target: db, kind: 'fail', for: '1m' }], duration: '30s' })).toThrow(
      /shorter than its steps/
    );
    expect(db.rules).toEqual([]); // nothing made by the checks
  });
});

describe('scenarios over HTTP', () => {
  const TOKEN = 'a-token-of-the-staging-admin';
  const auth = { authorization: `Bearer ${TOKEN}` };

  async function makeApp(options = {}) {
    const db = database();
    const cache = memoryCache();
    const app = xufa();
    await app.register(plugin, {
      targets: { db, cache },
      token: TOKEN,
      scenarios: {
        'cache down': { steps: [{ target: 'cache', kind: 'down', for: '1s' }] },
        'slow reads': {
          steps: [{ target: 'db', kind: 'delay', options: { operations: 'read', ms: 5, models: { regex: '^Ord' } } }],
          duration: '200ms',
        },
      },
      ...options,
    });
    await app.ready();
    return { app, db, cache };
  }

  it('defined ones listed and started (once at a time), their rules marked; stopped by id', async () => {
    const { app, cache } = await makeApp();
    const listed = (await app.inject({ url: '/_faults/scenarios', headers: auth })).json();
    expect(listed.defined['cache down']).toEqual({ duration: 1000, steps: [{ at: 0, for: 1000, target: 'cache', kind: 'down' }] });
    expect(listed.runs).toEqual([]);
    const started = await app.inject({ method: 'POST', url: '/_faults/scenarios/cache%20down', headers: auth });
    expect(started.statusCode).toBe(201);
    const { id } = started.json();
    expect(started.json()).toMatchObject({ name: 'cache down', state: 'running' });
    await tick(5);
    expect(cache.faults.rules.map((rule) => rule.kind)).toEqual(['down']);
    const again = await app.inject({ method: 'POST', url: '/_faults/scenarios/cache%20down', headers: auth });
    expect([again.statusCode, again.json().message]).toEqual([409, 'The scenario cache down is running']);
    const rules = (await app.inject({ url: '/_faults', headers: auth })).json().targets.cache.rules;
    expect(rules.map((rule) => rule.scenario)).toEqual([id]);
    expect((await app.inject({ method: 'DELETE', url: `/_faults/scenarios/${id}`, headers: auth })).statusCode).toBe(204);
    expect(cache.faults.rules).toEqual([]);
    const runs = (await app.inject({ url: '/_faults/scenarios', headers: auth })).json().runs;
    expect(runs.map((run) => [run.id, run.state])).toEqual([[id, 'stopped']]);
    expect((await app.inject({ method: 'POST', url: '/_faults/scenarios/nope', headers: auth })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/_faults/scenarios/s99', headers: auth })).statusCode).toBe(404);
    await app.close();
  });

  it('one of the body: filters of JSON, checked; never longer than maxDuration; stopped when the app closes', async () => {
    const { app, db } = await makeApp({ maxDuration: '1m' });
    const post = (body) => app.inject({ method: 'POST', url: '/_faults/scenarios', headers: auth, payload: body });
    const made = await post({
      name: 'orders fail',
      steps: [{ target: 'db', kind: 'fail', options: { models: { regex: '^Ord' }, rate: 0.5 }, for: '10s' }],
    });
    expect(made.statusCode).toBe(201);
    await tick(5);
    expect(db.rules[0].options.models).toEqual(/^Ord/);
    const bad = [
      [{ steps: [{ target: 'nope', kind: 'fail' }] }, /no target nope/],
      [{ steps: [{ target: 'db', kind: 'fail', options: { match: 'x' } }] }, /Options a fail does not take: match/],
      [{ steps: [{ target: 'db', kind: 'fail', for: '2m' }] }, /more than maxDuration/],
      [{ steps: 'all' }, /is \{ steps/],
    ];
    for (const [body, message] of bad) {
      const response = await post(body);
      expect([response.statusCode, response.json().message]).toEqual([400, expect.stringMatching(message)]);
    }
    await app.close();
    expect(db.rules).toEqual([]); // the scenario running was stopped
  });

  it('scenarios defined are checked when the plugin is registered; targets cannot be named scenarios or ui', async () => {
    const register = (options) => xufa().register(plugin, { token: TOKEN, ...options }).ready();
    await expect(
      register({ targets: { db: database() }, scenarios: { broken: { steps: [{ target: 'db', kind: 'melt' }] } } })
    ).rejects.toThrow(/no faults of the kind melt/);
    await expect(register({ targets: { scenarios: database() } })).rejects.toThrow('A target cannot be named scenarios');
    const { app } = await makeApp();
    expect((await app.inject({ url: '/_faults/scenarios' })).statusCode).toBe(401);
    await app.close();
  });
});
