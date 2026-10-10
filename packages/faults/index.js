// @xufa/faults: faults made to happen, to see what an app does when what it uses fails, is slow or hangs (tests of
// resilience, chaos in staging). The rules of the faults of xufa: the ORM (db.faults), the HTTP client
// (client.faults), the caches (cache.faults) and the bus of the cluster (bus.faults) are made of it, each with the
// operations it has and what a fault of it does.
//
//   const faults = new Faults({ operations: ['get', 'set'], groups: { read: ['get'] }, filters: { keys: 'key' } });
//   faults.fail({ operations: 'read', rate: 0.1 });
//   await faults.apply({ operation: 'get', key: 'a' }, () => store.get('a'));
//
// A rule matches operations (names, or groups of them), the filters of who made it (models, tenants, events...: an
// option of names, or of prefixes and regular expressions for those of text), and `match(context)`; `rate` is the
// chance of each match (faults.random), `after` leaves the first matches alone, `times` removes it after that many.
// What it does: fail (its error), delay (ms, jitter), hang (until released), down (every operation fails), or what the
// one that made it says (kinds of its own: a reply, a message lost). Each rule counts its hits.

class FaultError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'FaultError';
    this.code = 'XUFA_FAULT';
    this.statusCode = 503;
    this.operation = context.operation;
  }
}

// An error of a fault injected, whatever made it (the ORM, a cache, the bus...): its code ends in FAULT
// (XUFA_FAULT, XUFA_ORM_ERR_FAULT), so instanceof FaultError is true of all of them.
const isFault = (value) => value instanceof Error && typeof value.code === 'string' && /(^|_)FAULT$/.test(value.code);
Object.defineProperty(FaultError, Symbol.hasInstance, { value: isFault });

// A value matches a filter: one of the names (exactly), or of the prefixes and regular expressions (of text).
function matcherOf(values, prefixes) {
  const list = [].concat(values);
  return (value) => {
    if (value === undefined || value === null) return false;
    const text = String(value);
    return list.some((item) => {
      if (item instanceof RegExp) return item.test(text);
      if (typeof item === 'function') return item.name === text; // classes (models) by their names
      return prefixes ? text.startsWith(String(item)) : text === String(item);
    });
  };
}

class Rule {
  constructor(faults, kind, options = {}, extra = {}) {
    this.faults = faults;
    this.kind = kind;
    this.operations = faults.operationsOf(options.operations);
    this.filters = [];
    for (const [option, filter] of Object.entries(faults.filters)) {
      if (options[option] === undefined) continue;
      const { field, prefixes = false } = typeof filter === 'string' ? { field: filter } : filter;
      const matches = matcherOf(options[option], prefixes);
      this.filters.push((context) => matches(context[field]));
    }
    if (options.match !== undefined && typeof options.match !== 'function') {
      throw new TypeError('match of a fault is a function of the context of the operation');
    }
    this.match = options.match || null;
    this.rate = options.rate === undefined ? 1 : Number(options.rate);
    if (!(this.rate >= 0 && this.rate <= 1)) throw new TypeError('The rate of a fault is from 0 to 1');
    this.after = options.after === undefined ? 0 : options.after;
    this.times = options.times === undefined ? Infinity : options.times;
    this.ms = options.ms === undefined ? 0 : options.ms;
    this.jitter = options.jitter === undefined ? 0 : options.jitter;
    this.error = options.error;
    this.message = options.message;
    this.options = options;
    this.replace = extra.replace || null;
    this.hits = 0;
    this.seen = 0;
    this.active = true;
    this.waiting = new Set();
  }

  matches(context) {
    if (!this.operations.has(context.operation)) return false;
    for (const filter of this.filters) if (!filter(context)) return false;
    return !this.match || Boolean(this.match(context));
  }

  errorFor(context) {
    if (typeof this.error === 'function') return this.error(context);
    if (this.error instanceof Error) return this.error;
    return this.faults.errorOf(this, context);
  }

  // Ends its waits (hang) and takes it away.
  remove() {
    this.active = false;
    this.faults.rules = this.faults.rules.filter((rule) => rule !== this);
    this.release();
    this.faults.settle();
    return this;
  }

  // What it holds (hang) goes on.
  release() {
    for (const resume of this.waiting) resume();
    this.waiting.clear();
    this.faults.holding.delete(this);
    this.faults.settle();
    return this;
  }

  // A promise that ends when it is released (or when the signal is aborted: rejected with its reason).
  held(signal) {
    if (!this.active) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        this.waiting.delete(done);
        if (signal) signal.removeEventListener('abort', aborted);
        resolve();
      };
      const aborted = () => {
        this.waiting.delete(done);
        reject(signal.reason);
      };
      if (signal) {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        signal.addEventListener('abort', aborted, { once: true });
      }
      this.waiting.add(done);
    });
  }
}

// A wait of ms, or the reason of the signal when it is aborted first.
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason);
      return;
    }
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', aborted, { once: true });
  });
}

// The faults that have rules (or hold operations), of every copy of this package in the process: what clearFaults()
// clears. A faults leaves it when it has none.
const ACTIVE = Symbol.for('xufa.faults.active');
if (!globalThis[ACTIVE]) Object.defineProperty(globalThis, ACTIVE, { value: new Set() });
const active = globalThis[ACTIVE];

class Faults {
  // operations: the names of the operations; groups: names of lists of them ({ read: [...] }); defaults: the
  // operations of a rule that names none (all); filters: options of rules to fields of the context ({ models:
  // 'model', paths: { field: 'path', prefixes: true } }); error(rule, context): the error of a fail; downMessage.
  constructor({ operations = [], groups = {}, defaults, filters = {}, error, downMessage, name } = {}) {
    this.name = name || 'faults';
    this.known = operations;
    this.groups = groups;
    this.defaults = defaults || operations;
    this.filters = filters;
    this.errorOfOwn = error || null;
    this.downMessage = downMessage || 'It is down (a fault injected)';
    this.rules = [];
    // Hangs of their last time (removed, still holding): released by clear() too.
    this.holding = new Set();
    this.random = Math.random;
  }

  operationsOf(value) {
    if (value === undefined) return new Set(this.defaults);
    const list = [].concat(value).flatMap((item) => (Object.hasOwn(this.groups, item) ? this.groups[item] : [item]));
    for (const item of list) {
      if (!this.known.includes(item)) {
        const names = [...this.known, ...Object.keys(this.groups)];
        throw new TypeError(`A fault is of ${names.join(', ')} (not ${item})`);
      }
    }
    return new Set(list);
  }

  errorOf(rule, context) {
    if (this.errorOfOwn) return this.errorOfOwn(rule, context);
    const what = context.operation;
    return new FaultError(rule.message || `A fault (injected): ${what}`, context);
  }

  fail(options) {
    return this.add('fail', options);
  }

  delay(options = {}) {
    if (!(options.ms >= 0)) throw new TypeError('A delay of a fault has ms (milliseconds)');
    return this.add('delay', options);
  }

  // Operations that do not end until the rule is released (or removed, or the faults cleared).
  hang(options) {
    return this.add('hang', options);
  }

  // Every operation fails, until up().
  down(options = {}) {
    return this.add('down', { operations: this.known, message: this.downMessage, ...options });
  }

  up() {
    this.rules.filter((rule) => rule.kind === 'down').forEach((rule) => rule.remove());
    return this;
  }

  clear() {
    [...this.rules].forEach((rule) => rule.remove());
    [...this.holding].forEach((rule) => rule.release());
    return this;
  }

  // Out of the active ones when it has no rules and holds nothing.
  settle() {
    if (this.rules.length === 0 && this.holding.size === 0) active.delete(this);
  }

  // Throws what a rule of these options would throw (its operations, rate, match; the ms of a delay), without making
  // it: scenarios check their steps before they start.
  check(kind, options = {}) {
    if (kind === 'delay' && !(options.ms >= 0)) throw new TypeError('A delay of a fault has ms (milliseconds)');
    new Rule(this, kind, kind === 'down' ? { operations: this.known, ...options } : options); // eslint-disable-line no-new
    return this;
  }

  // A rule (of a kind of its own: extra.replace(context) is what the operation gives instead).
  add(kind, options, extra) {
    const rule = new Rule(this, kind, options, extra);
    this.rules.push(rule);
    active.add(this);
    return rule;
  }

  // The rules that act on an operation (their hits counted): what to do, in order, at once (for those that cannot
  // wait, as events).
  pick(context) {
    const picked = [];
    for (const rule of [...this.rules]) {
      if (!rule.active || !rule.matches(context)) continue;
      rule.seen += 1;
      if (rule.seen <= rule.after) continue;
      if (rule.rate < 1 && this.random() >= rule.rate) continue;
      rule.hits += 1;
      const ms = rule.kind === 'delay' ? rule.ms + (rule.jitter ? this.random() * rule.jitter : 0) : 0;
      picked.push({ rule, kind: rule.kind, ms });
      if (rule.hits >= rule.times) {
        // Removed, but what it holds now is held (a hang of its last time waits for its release).
        rule.faults.rules = rule.faults.rules.filter((item) => item !== rule);
        if (rule.kind === 'hang') this.holding.add(rule);
        else rule.active = false;
        this.settle();
      }
      // A fail ends the operation: the rules after it do not act.
      if (rule.kind === 'fail' || rule.kind === 'down' || rule.replace) break;
    }
    return picked;
  }

  // An operation, with the faults that act on it: waits (delay, hang: cut short by context.signal), its error (fail,
  // down), what a kind of its own gives instead; then the operation itself.
  async apply(context, run) {
    if (this.rules.length === 0) return run();
    for (const { rule, kind, ms } of this.pick(context)) {
      if (kind === 'delay') await sleep(ms, context.signal);
      else if (kind === 'hang') await rule.held(context.signal);
      else if (rule.replace) return rule.replace(context);
      else throw rule.errorFor(context);
    }
    return run();
  }
}

// Wraps methods of an object (in it, once): each call goes through the faults, with the context made by
// contextOf(method, args) ({ operation, ...fields }). Without rules, the calls are as they were.
function wrap(faults, target, methods, contextOf) {
  for (const method of methods) {
    const original = target[method];
    if (typeof original !== 'function') continue;
    Object.defineProperty(target, method, {
      configurable: true,
      writable: true,
      value: function withFaults(...args) {
        if (faults.rules.length === 0) return original.apply(this, args);
        return faults.apply(contextOf(method, args), () => original.apply(this, args));
      },
    });
  }
  return faults;
}

// The faults of a cache of xufa (MemoryCache, SharedCache, LocalCache of the ORM, NetCache): its get, set, delete and
// clear (read: get; write: the rest), its keys by prefix or regular expression.
const CACHE_OPERATIONS = ['get', 'set', 'delete', 'clear'];

function cacheFaults(cache, name = 'cache') {
  const faults = new Faults({
    name,
    operations: CACHE_OPERATIONS,
    groups: { read: ['get'], write: ['set', 'delete', 'clear'] },
    filters: { keys: { field: 'key', prefixes: true } },
    downMessage: `The ${name} is down (a fault injected)`,
    error: (rule, context) =>
      new FaultError(
        rule.message ||
          `A fault of the ${name} (injected): ${context.operation}${context.key ? ` of ${context.key}` : ''}`,
        context
      ),
  });
  return wrap(faults, cache, CACHE_OPERATIONS, (operation, [key]) => {
    const first = Array.isArray(key) ? key[0] : key;
    return { operation, key: first === undefined ? null : first };
  });
}

// The faults that have rules now: of the database, its caches, the clients, the bus... (every copy of this package).
function activeFaults() {
  return [...active];
}

// Removes every rule of every faults, and lets go what they hold: after each test, so a test that failed before its
// faults.clear() leaves none to the next one. Gives the number of rules removed.
function clearFaults() {
  let removed = 0;
  for (const faults of [...active]) {
    removed += faults.rules.length;
    faults.clear();
  }
  return removed;
}

// What a faults has left: 'cache: fail of get (hits 2)', a line for each rule (and each hang still holding).
function leftOf(faults) {
  const describe = (rule, holding) =>
    `${faults.name}: ${rule.kind} of ${[...rule.operations].join(', ')} (hits ${rule.hits}${holding ? ', holding' : ''})`;
  return [
    ...faults.rules.map((rule) => describe(rule, false)),
    ...[...faults.holding].map((rule) => describe(rule, true)),
  ];
}

// clearFaults() after each test: with the afterEach of the runner (a global of Jest, Vitest, vyntra or Mocha), or of
// the hooks given (require('node:test')). strict: a test that ends with faults still set fails (they are cleared
// all the same), so a test that forgets to clean up is found, not the next one that fails for it.
//
//   useFaults();                                  useFaults({ strict: true });
//   useFaults(require('node:test'));              useFaults(require('node:test'), { strict: true });
function useFaults(hooksOrOptions, options) {
  const given = hooksOrOptions && typeof hooksOrOptions.afterEach === 'function';
  const hooks = given ? hooksOrOptions : (hooksOrOptions && hooksOrOptions.hooks) || globalThis;
  const { strict = false } = (given ? options : hooksOrOptions) || {};
  if (!hooks || typeof hooks.afterEach !== 'function') {
    throw new TypeError("useFaults(): no afterEach (give the hooks of your runner: useFaults(require('node:test')))");
  }
  hooks.afterEach(() => {
    const left = strict ? [...active].flatMap(leftOf) : [];
    clearFaults();
    if (left.length) {
      throw new Error(`The test ended with faults still set (cleared now):\n  - ${left.join('\n  - ')}`);
    }
  });
}

// The plugin of @xufa/http (and fastify) that turns faults on and off over HTTP, for staging (lib/plugin.js).
export { faultsPlugin as plugin } from './lib/plugin.js';
export { Scenario, scenario } from './lib/scenario.js';

export { Faults, FaultError, isFault, sleep, wrap, cacheFaults, activeFaults, clearFaults, useFaults };
