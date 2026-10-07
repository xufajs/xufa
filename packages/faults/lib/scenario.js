'use strict';

// Scenarios: faults that come and go on a timeline, as an outage does (a database that gets slow, then a cache that
// goes down, then a payment provider that answers 503 now and then), for game days in staging and for tests.
//
//   const run = scenario({
//     name: 'payments brownout',
//     steps: [
//       { at: 0, target: db, kind: 'delay', options: { operations: 'read', ms: 300 }, for: '2m' },
//       { at: '30s', target: payments, kind: 'respond', options: { status: 503, rate: 0.2 }, for: '1m' },
//       { at: '1m', target: cache, kind: 'down', for: '30s' },
//     ],
//   });
//   await run.run();                 // or run.start() ... run.stop()
//
// A step makes its rule `at` (a duration from the start: 0, 5000, '30s', '2m') and removes it after `for` (without
// it, at the end of the scenario). The scenario ends at `duration`, or when its last step ends; ending or stopping
// removes every rule it made (and lets go what they hold). Steps are checked before it starts (their targets, kinds
// and options), so a mistake fails at once, not in the middle of a game day.
//
// `targets` gives names to targets (steps then name them: { target: 'db' }); a target is faults, or what has them
// (db.faults, cache.faults, client.faults...). onEvent(event) is told of each event (start, step, end of a step,
// error, done, stopped), as status().events keeps them.
const KINDS = ['fail', 'delay', 'hang', 'down', 'respond', 'drop'];
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };

// A duration in ms: a number, or text as '500ms', '30s', '2m', '1h'.
function msOf(value, what, { zero = false } = {}) {
  if (typeof value === 'number' && Number.isFinite(value) && (zero ? value >= 0 : value > 0)) return value;
  const found = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(value).trim());
  const ms = found ? Number(found[1]) * UNITS[found[2]] : NaN;
  if (!(zero ? ms >= 0 : ms > 0)) throw new TypeError(`${what} is a duration (5000, '30s', '2m', '1h')`);
  return ms;
}

const isFaults = (value) =>
  value !== null && typeof value === 'object' && typeof value.fail === 'function' && Array.isArray(value.rules);

class Scenario {
  constructor({ name = 'scenario', steps, duration, targets = {}, onEvent } = {}) {
    if (!Array.isArray(steps) || steps.length === 0) throw new TypeError('A scenario has steps (a list of them)');
    this.name = String(name);
    this.onEvent = typeof onEvent === 'function' ? onEvent : null;
    this.steps = steps.map((step, index) => {
      const what = `Step ${index + 1} of the scenario ${this.name}`;
      if (!step || typeof step !== 'object') throw new TypeError(`${what} is an object`);
      const { at = 0, target, kind, options = {} } = step;
      const given = typeof target === 'string' ? targets[target] : target;
      if (typeof target === 'string' && !Object.hasOwn(targets, target)) {
        throw new TypeError(`${what}: no target ${target} (${Object.keys(targets).join(', ') || 'none named'})`);
      }
      const faults = isFaults(given) ? given : given && given.faults;
      if (!isFaults(faults)) throw new TypeError(`${what}: its target is not faults, nor has them`);
      const label = typeof target === 'string' ? target : faults.name;
      if (!KINDS.includes(kind) || typeof faults[kind] !== 'function') {
        const kinds = KINDS.filter((name) => typeof faults[name] === 'function');
        throw new TypeError(`${what}: ${label} has no faults of the kind ${kind} (${kinds.join(', ')})`);
      }
      if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new TypeError(`${what}: its options are an object`);
      }
      try {
        faults.check(kind, options);
      } catch (err) {
        throw new TypeError(`${what}: ${err.message}`);
      }
      return {
        index,
        at: msOf(at, `${what}: at`, { zero: true }),
        for: step.for === undefined ? null : msOf(step.for, `${what}: for`),
        target: label,
        faults,
        kind,
        options,
        rule: null,
        state: 'waiting',
      };
    });
    const last = Math.max(...this.steps.map((step) => step.at + (step.for || 0)));
    this.duration = duration === undefined ? last : msOf(duration, `The duration of the scenario ${this.name}`);
    if (this.duration < last) {
      throw new TypeError(`The duration of the scenario ${this.name} is shorter than its steps (${last} ms)`);
    }
    if (this.duration === 0) throw new TypeError(`The scenario ${this.name} lasts no time: give it a duration`);
    this.state = 'ready';
    this.startedAt = null;
    this.endedAt = null;
    this.events = [];
    this.timers = new Set();
    this.finished = null;
  }

  emit(type, step, extra = {}) {
    const event = {
      type,
      at: this.startedAt === null ? 0 : Date.now() - this.startedAt,
      ...(step ? { step: step.index + 1, target: step.target, kind: step.kind } : {}),
      ...extra,
    };
    this.events.push(event);
    if (this.onEvent) {
      try {
        this.onEvent(event, this);
      } catch (err) {
        // What is told of events does not stop the scenario.
      }
    }
  }

  later(ms, fn) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
  }

  // Starts it (once); run() also waits for its end.
  start() {
    if (this.state !== 'ready') throw new Error(`The scenario ${this.name} has already run (it is ${this.state})`);
    this.state = 'running';
    this.startedAt = Date.now();
    let resolve;
    this.finished = new Promise((done) => {
      resolve = done;
    });
    this.resolve = resolve;
    this.emit('start');
    for (const step of this.steps) this.later(step.at, () => this.begin(step));
    this.later(this.duration, () => this.end('done'));
    return this;
  }

  run() {
    if (this.state === 'ready') this.start();
    return this.finished;
  }

  begin(step) {
    try {
      step.rule = step.faults[step.kind](step.options);
      step.state = 'active';
      this.emit('step', step);
      if (step.for !== null) this.later(step.for, () => this.finish(step));
    } catch (err) {
      step.state = 'failed';
      this.emit('error', step, { message: err.message });
    }
  }

  finish(step) {
    if (step.state !== 'active') return;
    step.rule.remove();
    step.state = 'done';
    this.emit('end', step);
  }

  end(type) {
    if (this.state !== 'running') return;
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const step of this.steps) {
      if (step.state === 'active') this.finish(step);
      else if (step.state === 'waiting') step.state = 'skipped';
    }
    this.state = type;
    this.endedAt = Date.now();
    this.emit(type);
    this.resolve(this);
  }

  // Stops it: its rules removed, the steps not made skipped.
  stop() {
    this.end('stopped');
    return this;
  }

  status() {
    const now = this.endedAt || Date.now();
    return {
      name: this.name,
      state: this.state,
      duration: this.duration,
      elapsed: this.startedAt === null ? 0 : Math.min(now - this.startedAt, this.duration),
      startedAt: this.startedAt === null ? null : new Date(this.startedAt).toISOString(),
      steps: this.steps.map((step) => ({
        at: step.at,
        for: step.for,
        target: step.target,
        kind: step.kind,
        state: step.state,
        hits: step.rule ? step.rule.hits : 0,
      })),
      events: [...this.events],
    };
  }
}

function scenario(options) {
  return new Scenario(options);
}

module.exports = { Scenario, scenario, msOf, KINDS };
