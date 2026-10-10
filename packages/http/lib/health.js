// The health of an app, for load balancers, Kubernetes and people: GET /health/live (the process answers: liveness),
// GET /health/ready (the app can serve: its critical checks pass, and it is not closing: readiness) and GET /health
// (every check, with its status, time, error and details). Checks are functions: a database (db.ping()), a queue, a
// pool of nodes, anything. They can run in the background (interval), as a status checker, telling when the status
// changes (onChange) and running a cure for a check down too long (heal).
//
//   app.register(xufa.health, {
//     checks: {
//       database: () => db.ping(),                                   // ms of a round trip; throws when it is down
//       queue: { check: async () => queue.counts(), critical: false }, // degraded, not down, when it fails
//     },
//     interval: '10s',
//     onChange: (status, previous, report) => alert(`The app is ${status}`),
//   });
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
function ms(value, what) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) throw new TypeError(`health: ${what} '${value}' is not a duration (as '10s')`);
  return Number(match[1]) * UNITS[match[2]];
}

const STATUSES = new Set(['up', 'degraded', 'down']);

// The result of a check: what it gave (or threw) as { status, error?, details? }.
function resultOf(value) {
  if (value === undefined || value === true || value === null) return { status: 'up' };
  if (value === false) return { status: 'down' };
  if (typeof value === 'string') return { status: 'down', error: value };
  if (typeof value === 'object' && !Array.isArray(value) && STATUSES.has(value.status)) {
    const { status, error, ...details } = value;
    const result = { status };
    if (error !== undefined) result.error = String(error);
    if (Object.keys(details).length) result.details = details;
    return result;
  }
  return { status: 'up', details: value };
}

function withTimeout(promise, timeout, name) {
  if (!timeout) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`The check ${name} took more than ${timeout} ms`)), timeout);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

class Health {
  constructor(options, log) {
    this.log = log;
    this.timeout = ms(options.timeout === undefined ? '2s' : options.timeout, 'timeout');
    this.cache = ms(options.cache === undefined ? '1s' : options.cache, 'cache');
    this.onChange = options.onChange || null;
    this.checks = new Map();
    for (const [name, given] of Object.entries(options.checks || {})) {
      const spec = typeof given === 'function' ? { check: given } : { ...given };
      if (typeof spec.check !== 'function') throw new TypeError(`health: the check ${name} is a function`);
      this.checks.set(name, {
        name,
        check: spec.check,
        critical: spec.critical !== false,
        timeout: spec.timeout === undefined ? this.timeout : ms(spec.timeout, `checks.${name}.timeout`),
        heal: spec.heal ? { after: ms(spec.heal.after, `checks.${name}.heal.after`), run: spec.heal.run } : null,
      });
    }
    this.results = {};
    this.status = this.checks.size ? null : 'up';
    this.checkedAt = 0;
    this.running = null;
    this.closing = false;
  }

  // Runs every check (one run at a time: those who ask meanwhile get its report).
  run() {
    if (!this.running) {
      this.running = this.runChecks().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  // The report, from the last run when it is newer than cache (or the checks run in the background).
  async current() {
    if (!this.checkedAt || Date.now() - this.checkedAt >= this.cache) await this.run();
    return this.report();
  }

  async runChecks() {
    const now = Date.now();
    await Promise.all(
      [...this.checks.values()].map(async (spec) => {
        const started = process.hrtime.bigint();
        let result;
        try {
          result = resultOf(await withTimeout(Promise.resolve().then(spec.check), spec.timeout, spec.name));
        } catch (err) {
          result = { status: 'down', error: err && err.message ? err.message : String(err) };
        }
        result.duration = Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100;
        const previous = this.results[spec.name];
        result.since = previous && previous.status === result.status ? previous.since : new Date(now).toISOString();
        result.critical = spec.critical;
        this.results[spec.name] = result;
        await this.heal(spec, result, previous, now);
      })
    );
    this.checkedAt = Date.now();
    const status = this.overall();
    if (status !== this.status) {
      const previous = this.status;
      this.status = status;
      if (previous !== null || status !== 'up') {
        const level = status === 'up' ? 'info' : 'warn';
        if (this.log && this.log[level]) this.log[level]({ health: status, previous }, `the app is ${status}`);
      }
      if (this.onChange) {
        try {
          await this.onChange(status, previous, this.report());
        } catch (err) {
          if (this.log && this.log.error) this.log.error({ err }, 'onChange of health failed');
        }
      }
    }
    return this.report();
  }

  // A cure for a check down longer than heal.after (as restarting what it checks): run once, and again after another
  // heal.after if it is still down.
  async heal(spec, result, previous, now) {
    if (!spec.heal) return;
    if (result.status !== 'down') {
      spec.downSince = null;
      return;
    }
    if (!spec.downSince) spec.downSince = previous && previous.status === 'down' ? Date.parse(previous.since) : now;
    if (now - spec.downSince < spec.heal.after) return;
    spec.downSince = now;
    try {
      await spec.heal.run(result);
      if (this.log && this.log.warn) this.log.warn({ check: spec.name }, `healing ${spec.name}`);
    } catch (err) {
      if (this.log && this.log.error) this.log.error({ err, check: spec.name }, `healing ${spec.name} failed`);
    }
  }

  // down when a critical check is down; degraded when another is, or one is degraded; up otherwise.
  overall() {
    let status = 'up';
    for (const result of Object.values(this.results)) {
      if (result.status === 'down' && result.critical) return 'down';
      if (result.status !== 'up') status = 'degraded';
    }
    return status;
  }

  report() {
    return {
      status: this.closing ? 'down' : this.status || 'up',
      ...(this.closing ? { closing: true } : {}),
      checks: { ...this.results },
      uptime: Math.round(process.uptime()),
      checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
    };
  }
}

function health(app, options, done) {
  const { prefix = '/health', interval = 0, details = true, logLevel = 'warn' } = options || {};
  let state;
  let every;
  try {
    state = new Health(options || {}, app.log);
    every = ms(interval, 'interval');
  } catch (err) {
    done(err);
    return;
  }
  const base = prefix.replace(/\/$/, '');
  const config = { maintenance: false };
  const statusCode = (report) => (report.status === 'down' ? 503 : 200);
  const shown = (report) => (details ? report : { status: report.status });

  app.decorate('health', {
    // Runs the checks now: the report.
    check: () => state.run(),
    // The report of the last run (null before the first).
    get report() {
      return state.checkedAt ? state.report() : null;
    },
    get status() {
      return state.closing ? 'down' : state.status;
    },
  });

  app.get(`${base}/live`, { logLevel, config }, async () => ({ status: 'up', uptime: Math.round(process.uptime()) }));
  app.get(`${base}/ready`, { logLevel, config }, async (request, reply) => {
    if (state.closing) return reply.code(503).send({ status: 'down', closing: true });
    const report = await state.current();
    return reply.code(statusCode(report)).send({ status: report.status });
  });
  app.get(base || '/', { logLevel, config }, async (request, reply) => {
    const report = state.closing ? state.report() : await state.current();
    return reply.code(statusCode(report)).send(shown(report));
  });

  let timer = null;
  if (every > 0) {
    app.addHook('onReady', async () => {
      await state.run();
      timer = setInterval(() => state.run().catch(() => {}), every);
      if (typeof timer.unref === 'function') timer.unref();
    });
  }
  // Closing: not ready any more (load balancers stop sending), while the requests in flight end.
  app.addHook('preClose', (closeDone) => {
    state.closing = true;
    clearInterval(timer);
    closeDone();
  });
  done();
}

health[Symbol.for('skip-override')] = true;
health[Symbol.for('fastify.display-name')] = 'xufa.health';

export { health, Health };
