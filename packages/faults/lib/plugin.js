'use strict';

// The faults of an app turned on and off over HTTP, for staging: a plugin of @xufa/http (and fastify) with routes
// under /_faults, protected (a token, an authorize function or a rule of @xufa/auth: one is required), off in
// production unless allowed, rules that expire (maxDuration), every change logged.
//
//   app.register(require('@xufa/faults').plugin, {
//     targets: { db, cache: db.cache, payments, bus },   // faults, or what has them (db.faults, client.faults...)
//     token: process.env.FAULTS_TOKEN,                     // Authorization: Bearer <token>
//   });
//
//   GET    /_faults                          the targets: their operations, filters, kinds and rules
//   POST   /_faults/:target/:kind            a rule (fail, delay, hang, down, respond, drop...): its options as JSON
//   DELETE /_faults/:target/rules/:id        that rule removed
//   POST   /_faults/:target/rules/:id/release   what it holds goes on
//   POST   /_faults/:target/up               no more down
//   DELETE /_faults/:target                  the rules of the target removed
//   DELETE /_faults                          every rule of every target removed
//   GET    /_faults/scenarios                the scenarios defined (option scenarios) and those run
//   POST   /_faults/scenarios/:name          a scenario defined started
//   POST   /_faults/scenarios                a scenario of the body ({ name, steps, duration }) started
//   DELETE /_faults/scenarios/:id            a scenario stopped (its rules removed)
//   GET    /_faults/ui                       a page that does all of this (ui: false leaves it out)
//
// The options of a rule are those of the faults (operations, rate, after, times, ms, jitter, message, the filters of
// the target, and those of respond), with `for`: how long it stays (a duration: 30000, '30s', '10m'), never more than
// maxDuration. Filters are names, lists of them, or { regex: '...' }; functions (match, error) cannot be sent.
const crypto = require('node:crypto');
const { Scenario } = require('./scenario');
const fs = require('node:fs');
const nodePath = require('node:path');

const KINDS = ['fail', 'delay', 'hang', 'down', 'respond', 'drop'];
const COMMON = ['operations', 'rate', 'after', 'times', 'ms', 'jitter', 'message', 'for'];
const RESPOND = ['status', 'headers', 'json', 'body'];
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
const ERROR = Symbol('faults plugin error');

// The files of the page (lib/ui), read once. They hold no data: they are served without the protection of the routes,
// and the page asks the routes (with the token it is given, or the cookies of the browser).
let uiFiles = null;
function uiFile(name) {
  if (!uiFiles) {
    const dir = nodePath.join(__dirname, 'ui');
    uiFiles = {
      html: fs.readFileSync(nodePath.join(dir, 'index.html'), 'utf8'),
      js: fs.readFileSync(nodePath.join(dir, 'ui.js'), 'utf8'),
      css: fs.readFileSync(nodePath.join(dir, 'ui.css'), 'utf8'),
    };
  }
  return uiFiles[name];
}
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeAttribute = (text) => String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);
const UI_HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function durationOf(value, what) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const found = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(String(value).trim());
  if (!found) throw Object.assign(new TypeError(`${what} is a duration (30000, '30s', '10m', '1h')`), { [ERROR]: 400 });
  return Number(found[1]) * UNITS[found[2]];
}

const fail = (status, message) => Object.assign(new Error(message), { [ERROR]: status });

// A filter of JSON as one of the faults: names, lists of them, { regex }.
function filterOf(value, name) {
  const one = (item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (item && typeof item === 'object' && typeof item.regex === 'string') {
      if (item.regex.length > 200) throw fail(400, `The regex of ${name} is too long (200 characters at most)`);
      try {
        return new RegExp(item.regex, typeof item.flags === 'string' ? item.flags : '');
      } catch (err) {
        throw fail(400, `The regex of ${name}: ${err.message}`);
      }
    }
    throw fail(400, `${name}: names, or { regex: '...' }`);
  };
  return Array.isArray(value) ? value.map(one) : one(value);
}

// The options of a value as JSON (regular expressions as { regex }, classes by their names).
function jsonOf(value) {
  if (value instanceof RegExp) return { regex: value.source, flags: value.flags };
  if (typeof value === 'function') return value.name;
  if (Array.isArray(value)) return value.map(jsonOf);
  return value;
}

const isFaults = (value) =>
  value !== null && typeof value === 'object' && typeof value.fail === 'function' && Array.isArray(value.rules);

function faultsOf(target, name) {
  const faults = isFaults(target) ? target : target && target.faults;
  if (!isFaults(faults))
    throw new TypeError(`The target ${name} is not faults, nor has them (db, cache, client, bus...)`);
  return faults;
}

// The token of a request (Authorization: Bearer, or x-faults-token), compared in constant time.
function tokenMatches(request, expected) {
  const header = request.headers.authorization;
  const given = header && /^Bearer /i.test(header) ? header.slice(7).trim() : request.headers['x-faults-token'];
  if (typeof given !== 'string' || given === '') return false;
  const digest = (text) => crypto.createHash('sha256').update(text).digest();
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

async function faultsPlugin(app, options = {}) {
  const {
    targets = {},
    token,
    authorize,
    auth,
    path = '/_faults',
    ui = true,
    maxDuration = '1h',
    scenarios = {},
    enabled = process.env.NODE_ENV !== 'production',
    allowProduction = false,
  } = options;
  if (!enabled) return;
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error('The faults plugin is for staging: in production it needs allowProduction: true');
  }
  if (token === undefined && authorize === undefined && auth === undefined) {
    throw new TypeError(
      'The faults plugin needs a protection: token, authorize(request) or auth (a rule of @xufa/auth)'
    );
  }
  if (token !== undefined && (typeof token !== 'string' || token.length < 16)) {
    throw new TypeError('The token of the faults plugin is a text of 16 characters or more');
  }
  if (authorize !== undefined && typeof authorize !== 'function') {
    throw new TypeError('authorize of the faults plugin is a function of the request');
  }
  const longest = durationOf(maxDuration, 'maxDuration');
  for (const [name, target] of Object.entries(targets)) {
    if (name === 'scenarios' || name === 'ui')
      throw new TypeError(`A target cannot be named ${name} (a route of its own)`);
    faultsOf(target, name);
  }

  // Rules by id (those made here, and those found when listing), and their timers.
  let next = 1;
  const ids = new WeakMap();
  const byId = new Map(); // id -> { rule, target, expiresAt, timer }
  const idOf = (rule, target) => {
    if (!ids.has(rule)) {
      const id = String(next);
      next += 1;
      ids.set(rule, id);
      byId.set(id, { rule, target, expiresAt: null, timer: null });
    }
    return ids.get(rule);
  };
  const forget = (id) => {
    const entry = byId.get(id);
    if (entry && entry.timer) clearTimeout(entry.timer);
    byId.delete(id);
  };

  const targetOf = (name) => {
    if (!Object.hasOwn(targets, name)) throw fail(404, `No target ${name} (${Object.keys(targets).join(', ')})`);
    return faultsOf(targets[name], name);
  };
  const kindsOf = (faults) => KINDS.filter((kind) => typeof faults[kind] === 'function');
  const describe = (rule, target) => {
    const id = idOf(rule, target);
    const entry = byId.get(id);
    const filters = {};
    for (const name of Object.keys(rule.faults.filters || {})) {
      if (rule.options[name] !== undefined) filters[name] = jsonOf(rule.options[name]);
    }
    return {
      id,
      target,
      kind: rule.kind,
      operations: [...rule.operations],
      filters,
      rate: rule.rate,
      after: rule.after,
      times: rule.times === Infinity ? null : rule.times,
      ms: rule.ms || undefined,
      jitter: rule.jitter || undefined,
      hits: rule.hits,
      active: rule.active,
      expiresAt: entry.expiresAt,
      scenario: ruleScenarios.get(rule),
    };
  };
  const rulesOf = (name) => {
    const faults = targetOf(name);
    const rules = [...faults.rules, ...(faults.holding ? faults.holding : [])];
    return rules.map((rule) => describe(rule, name));
  };

  // The options of a body for a kind of a target.
  function optionsOf(faults, kind, body) {
    if (body === undefined || body === null) return {};
    if (typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'The body is an object of options');
    const filters = Object.keys(faults.filters || {});
    const allowed = new Set([...COMMON, ...filters, ...(kind === 'respond' ? RESPOND : [])]);
    const unknown = Object.keys(body).filter((key) => !allowed.has(key));
    if (unknown.length) {
      throw fail(400, `Options a ${kind} does not take: ${unknown.join(', ')} (it takes ${[...allowed].join(', ')})`);
    }
    const out = {};
    for (const [key, value] of Object.entries(body)) {
      if (key === 'for') continue;
      out[key] = filters.includes(key) ? filterOf(value, key) : value;
    }
    return out;
  }

  const base = path.replace(/\/$/, '');
  // Scenarios: those defined (checked now), and those run (the last 20 kept, for their status).
  let nextScenario = 1;
  const runs = new Map(); // id -> Scenario
  const ruleScenarios = new WeakMap(); // rule -> id of its scenario
  function scenarioOf(spec, name) {
    if (!spec || typeof spec !== 'object' || !Array.isArray(spec.steps)) {
      throw fail(400, `The scenario ${name} is { steps: [{ at, target, kind, options, for }], duration }`);
    }
    const steps = spec.steps.map((step, index) => {
      if (!step || typeof step !== 'object') throw fail(400, `Step ${index + 1} of the scenario ${name} is an object`);
      if (typeof step.target !== 'string' || !Object.hasOwn(targets, step.target)) {
        throw fail(
          400,
          `Step ${index + 1} of the scenario ${name}: no target ${step.target} (${Object.keys(targets).join(', ')})`
        );
      }
      return { ...step, options: optionsOf(faultsOf(targets[step.target], step.target), step.kind, step.options) };
    });
    let made;
    try {
      made = new Scenario({ name, steps, duration: spec.duration, targets });
    } catch (err) {
      throw fail(400, err.message);
    }
    if (made.duration > longest) {
      throw fail(400, `The scenario ${name} lasts ${made.duration} ms, more than maxDuration (${longest} ms)`);
    }
    return made;
  }
  const defined = new Map();
  for (const [name, spec] of Object.entries(scenarios)) {
    try {
      scenarioOf(spec, name);
    } catch (err) {
      throw new TypeError(err.message);
    }
    defined.set(name, spec);
  }
  function startScenario(made, request) {
    const id = `s${nextScenario}`;
    nextScenario += 1;
    made.onEvent = (event) => {
      if (event.type === 'step') ruleScenarios.set(made.steps[event.step - 1].rule, id);
      const level = event.type === 'error' ? 'error' : 'warn';
      app.log[level]({ scenario: made.name, id, ...event }, `fault scenario: ${event.type}`);
    };
    runs.set(id, made);
    for (const old of [...runs.keys()]) {
      if (runs.size <= 20) break;
      if (runs.get(old).state !== 'running') runs.delete(old);
    }
    made.start();
    request.log.warn({ scenario: made.name, id }, 'fault scenario started');
    return { id, ...made.status() };
  }

  const uiUrls = new Set(ui ? [`${base}/ui`, `${base}/ui.js`, `${base}/ui.css`] : []);

  app.addHook('onRequest', async (request, reply) => {
    if (uiUrls.has(request.routeOptions.url)) return undefined;
    let allowed = true;
    if (token !== undefined) allowed = tokenMatches(request, token);
    if (allowed && authorize !== undefined) allowed = Boolean(await authorize(request));
    if (!allowed) {
      reply.header('www-authenticate', 'Bearer realm="faults"');
      reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Not allowed to change faults' });
      return reply;
    }
    return undefined;
  });

  app.setErrorHandler((err, request, reply) => {
    const status = err[ERROR] || (err instanceof TypeError ? 400 : err.statusCode || 500);
    const error = { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict' }[status] || 'Internal Server Error';
    reply.code(status).send({ statusCode: status, error, message: err.message });
  });

  app.addHook('onClose', async () => {
    // What was turned on here does not stay after the app.
    for (const made of runs.values()) made.stop();
    for (const [id, entry] of [...byId]) {
      if (entry.expiresAt !== null) entry.rule.remove();
      forget(id);
    }
  });

  const config = auth === undefined ? {} : { auth };
  const route = { schema: { hide: true }, config };

  if (ui) {
    const page = { schema: { hide: true } };
    const send = (reply, type, body) => reply.headers(UI_HEADERS).type(type).send(body);
    app.get(`${base}/ui`, page, async (request, reply) =>
      send(reply, 'text/html; charset=utf-8', uiFile('html').replace('{{base}}', escapeAttribute(base)))
    );
    app.get(`${base}/ui.js`, page, async (request, reply) =>
      send(reply, 'text/javascript; charset=utf-8', uiFile('js'))
    );
    app.get(`${base}/ui.css`, page, async (request, reply) => send(reply, 'text/css; charset=utf-8', uiFile('css')));
  }

  app.get(`${base}`, route, async () => {
    const out = {};
    for (const name of Object.keys(targets)) {
      const faults = targetOf(name);
      out[name] = {
        operations: [...faults.known],
        groups: faults.groups,
        filters: Object.keys(faults.filters || {}),
        kinds: kindsOf(faults),
        rules: rulesOf(name),
      };
    }
    return { targets: out, maxDuration: longest };
  });

  app.post(`${base}/:target/:kind`, route, async (request, reply) => {
    const { target, kind } = request.params;
    const faults = targetOf(target);
    if (!kindsOf(faults).includes(kind)) {
      throw fail(404, `${target} has no faults of the kind ${kind} (${kindsOf(faults).join(', ')})`);
    }
    const body = request.body || {};
    const ms = Math.min(body.for === undefined ? longest : durationOf(body.for, 'for'), longest);
    const rule = faults[kind](optionsOf(faults, kind, body));
    const id = idOf(rule, target);
    const entry = byId.get(id);
    entry.expiresAt = new Date(Date.now() + ms).toISOString();
    entry.timer = setTimeout(() => {
      rule.remove();
      forget(id);
      app.log.warn({ target, kind, rule: id }, 'fault expired');
    }, ms);
    entry.timer.unref();
    request.log.warn({ target, kind, rule: id, options: body }, 'fault injected');
    reply.code(201);
    return describe(rule, target);
  });

  const ruleOf = (request) => {
    const { target, id } = request.params;
    targetOf(target);
    const entry = byId.get(id);
    if (!entry || entry.target !== target) throw fail(404, `${target} has no rule ${id}`);
    return entry;
  };

  app.delete(`${base}/:target/rules/:id`, route, async (request, reply) => {
    const { rule } = ruleOf(request);
    rule.remove();
    forget(request.params.id);
    request.log.warn({ target: request.params.target, rule: request.params.id }, 'fault removed');
    reply.code(204).send();
  });

  app.post(`${base}/:target/rules/:id/release`, route, async (request) => {
    const { rule } = ruleOf(request);
    rule.release();
    request.log.warn({ target: request.params.target, rule: request.params.id }, 'fault released');
    return describe(rule, request.params.target);
  });

  app.post(`${base}/:target/up`, route, async (request, reply) => {
    targetOf(request.params.target).up();
    request.log.warn({ target: request.params.target }, 'faults up');
    reply.code(204).send();
  });

  app.delete(`${base}/:target`, route, async (request, reply) => {
    targetOf(request.params.target).clear();
    request.log.warn({ target: request.params.target }, 'faults cleared');
    reply.code(204).send();
  });

  app.get(`${base}/scenarios`, route, async () => ({
    defined: Object.fromEntries(
      [...defined].map(([name, spec]) => {
        const made = scenarioOf(spec, name);
        return [
          name,
          {
            duration: made.duration,
            steps: made.status().steps.map(({ at, for: lasts, target, kind }) => ({ at, for: lasts, target, kind })),
          },
        ];
      })
    ),
    runs: [...runs].map(([id, made]) => ({ id, ...made.status() })),
  }));

  app.post(`${base}/scenarios/:name`, route, async (request, reply) => {
    const { name } = request.params;
    if (!defined.has(name))
      throw fail(404, `No scenario ${name} (${[...defined.keys()].join(', ') || 'none defined'})`);
    if ([...runs.values()].some((made) => made.name === name && made.state === 'running')) {
      throw fail(409, `The scenario ${name} is running`);
    }
    reply.code(201);
    return startScenario(scenarioOf(defined.get(name), name), request);
  });

  app.post(`${base}/scenarios`, route, async (request, reply) => {
    const body = request.body || {};
    const name = typeof body.name === 'string' && body.name ? body.name : 'scenario';
    reply.code(201);
    return startScenario(scenarioOf(body, name), request);
  });

  app.delete(`${base}/scenarios/:id`, route, async (request, reply) => {
    const made = runs.get(request.params.id);
    if (!made) throw fail(404, `No scenario ${request.params.id}`);
    made.stop();
    request.log.warn({ scenario: made.name, id: request.params.id }, 'fault scenario stopped');
    reply.code(204).send();
  });

  app.delete(`${base}`, route, async (request, reply) => {
    for (const name of Object.keys(targets)) targetOf(name).clear();
    request.log.warn('every fault cleared');
    reply.code(204).send();
  });
}

faultsPlugin[Symbol.for('fastify.display-name')] = '@xufa/faults plugin';

module.exports = { faultsPlugin, durationOf };
