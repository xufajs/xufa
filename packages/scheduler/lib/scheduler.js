'use strict';

// The scheduler: jobs run every so often (every), on a cron expression (cron), or once (at, in), each on a timer of
// its own, so a slow job delays no other one and the failure of one stops none.
//
//   const scheduler = new Scheduler({ logger, lock, history });
//   scheduler.add({ name: 'cleanup', every: '10m', run: async ({ signal }) => ... });
//   scheduler.add({ name: 'report', cron: '0 8 * * mon-fri', timezone: 'Europe/Madrid', timeout: '5m', run });
//   scheduler.start();
//   await scheduler.stop();
//
// - A run does not overlap the one before it: overlap 'skip' (the default) leaves the time out, 'wait' runs it once
//   when the other one ends (the times in between are one run), 'allow' runs them at once.
// - timeout: the signal of an attempt is aborted with a TimeoutError, and the attempt fails (an attempt that does not
//   stop on its signal goes on by itself).
// - retries: a run that fails is tried again (retries times more), after retryDelay, multiplied by retryFactor each
//   time (up to maxRetryDelay). The attempts are one run: the job is running, and keeps its claim of the lock.
// - every is aligned to the clock: every '10m' runs at :00, :10, :20..., every '90s' at the multiples of 90 seconds
//   since 1970 (align: false counts from the start instead). So processes on other machines agree on the times of a
//   job, and a lock (lock option: ormLock(db) of a database) makes one of them run each time.
// - Times missed (a process stopped, or busy) are not run later, unless the job has catchUp and the scheduler a
//   history: when it starts, the last time due that the history has no run of runs once.
// - history (memoryHistory(), ormHistory(db)): every run is recorded (when, how long, how it ended, its attempts).
// - Events: 'run' (a run starts), 'retry', 'done', 'failure', 'skip' (with why: 'running' or 'locked').
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { SchedulerError, TimeoutError } = require('./errors');
const { toMs } = require('./duration');
const { Cron } = require('./cron');

const MAX_DELAY = 2147483647; // the longest timeout of Node.js: longer waits are made of several
const OVERLAPS = ['skip', 'wait', 'allow'];
const CATCH_UP_STEPS = 100000; // times of a cron job looked through for the last one missed

const systemClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer),
};

const HOST = os.hostname();

class Job {
  constructor(spec, defaults) {
    if (!spec || typeof spec !== 'object') throw new SchedulerError('add(job): a job is an object');
    const { name, run } = spec;
    if (typeof name !== 'string' || name === '') throw new SchedulerError('add(job): a job has a name');
    if (typeof run !== 'function') throw new SchedulerError(`add(job): the job ${name} has no run function`);
    const kinds = ['every', 'cron', 'at', 'in'].filter((key) => spec[key] !== undefined);
    if (kinds.length !== 1) {
      throw new SchedulerError(`add(job): the job ${name} has one of every, cron, at or in (it has ${kinds.length})`);
    }
    const overlap = spec.overlap || 'skip';
    if (!OVERLAPS.includes(overlap)) {
      throw new SchedulerError(`add(job): the overlap of ${name} is ${OVERLAPS.join(', ')}`);
    }
    this.name = name;
    this.run = run;
    this.kind = kinds[0];
    this.overlap = overlap;
    this.timeout = spec.timeout === undefined ? null : toMs(spec.timeout, `the timeout of ${name}`);
    this.immediate = spec.immediate === true;
    this.locked = spec.lock !== false;
    this.lockTtl =
      spec.lockTtl !== undefined ? toMs(spec.lockTtl, `the lockTtl of ${name}`) : this.timeout || defaults.lockTtl;
    this.data = spec.data;

    const retries = spec.retries === undefined ? 0 : spec.retries;
    if (!Number.isInteger(retries) || retries < 0) {
      throw new SchedulerError(`add(job): the retries of ${name} are a whole number, 0 or more`);
    }
    this.retries = retries;
    this.retryDelay = toMs(spec.retryDelay === undefined ? 1000 : spec.retryDelay, `the retryDelay of ${name}`);
    this.retryFactor = spec.retryFactor === undefined ? 2 : spec.retryFactor;
    if (typeof this.retryFactor !== 'number' || !(this.retryFactor >= 1)) {
      throw new SchedulerError(`add(job): the retryFactor of ${name} is a number, 1 or more`);
    }
    this.maxRetryDelay =
      spec.maxRetryDelay === undefined ? Infinity : toMs(spec.maxRetryDelay, `the maxRetryDelay of ${name}`);

    if (this.kind === 'every') {
      this.interval = toMs(spec.every, `every of ${name}`);
      if (this.interval < 1) throw new SchedulerError(`add(job): every of ${name} is at least 1 ms`);
      this.align = spec.align !== false;
      this.schedule = typeof spec.every === 'number' ? `every ${spec.every} ms` : `every ${spec.every}`;
    } else if (this.kind === 'cron') {
      this.cron = new Cron(spec.cron, { timezone: spec.timezone || defaults.timezone });
      this.schedule = `cron ${spec.cron}${this.cron.zone.name ? ` (${this.cron.zone.name})` : ''}`;
    } else if (this.kind === 'at') {
      const at = spec.at instanceof Date ? spec.at.getTime() : new Date(spec.at).getTime();
      if (!Number.isFinite(at)) throw new SchedulerError(`add(job): at of ${name} is not a date`);
      this.at = at;
      this.schedule = `at ${new Date(at).toISOString()}`;
    } else {
      this.delay = toMs(spec.in, `in of ${name}`);
      this.schedule = `in ${spec.in}`;
    }

    this.catchUp = spec.catchUp === true;
    if (this.catchUp) {
      if (this.kind !== 'cron' && !(this.kind === 'every' && this.align)) {
        throw new SchedulerError(`add(job): catchUp is of jobs of cron, or of every aligned to the clock (${name})`);
      }
      if (!defaults.history) throw new SchedulerError(`add(job): catchUp needs a history in the scheduler (${name})`);
    }

    this.next = null; // the time of the next run (ms), or null
    this.timer = null;
    this.started = null; // when the scheduler started the job (align: false counts from it)
    this.running = 0;
    this.pending = null; // the time of a run waiting for the one running (overlap 'wait')
    this.lastWall = null; // the wall-clock time of the last cron run (an hour that repeats runs once)
    this.done = false; // a job of once that ran
    this.stats = { runs: 0, failures: 0, skipped: 0, retries: 0, lastRun: null, lastDuration: null, lastError: null };
  }

  // The time of the run after `now` (ms), or null.
  nextAfter(now) {
    if (this.kind === 'every') {
      if (this.align) return (Math.floor(now / this.interval) + 1) * this.interval;
      const elapsed = now - this.started;
      return this.started + (Math.floor(elapsed / this.interval) + 1) * this.interval;
    }
    if (this.kind === 'cron') {
      let next = this.cron.next(now);
      // The same wall-clock time again (an hour that repeats): the one after.
      while (next !== null && this.lastWall !== null && this.cron.wallKey(next) === this.lastWall) {
        next = this.cron.next(next);
      }
      return next;
    }
    if (this.done) return null;
    if (this.kind === 'at') return this.at;
    return this.started + this.delay;
  }

  // The last time due after `last` and not after `now` (ms), or null: what catchUp runs.
  missedAfter(last, now) {
    if (this.kind === 'every') {
      const due = Math.floor(now / this.interval) * this.interval;
      return due > last ? due : null;
    }
    let missed = null;
    let at = this.cron.next(last);
    for (let steps = 0; at !== null && at <= now && steps < CATCH_UP_STEPS; steps += 1) {
      missed = at;
      at = this.cron.next(at);
    }
    return missed;
  }

  // The wait before the attempt after `attempt` (1, 2...).
  retryWait(attempt) {
    return Math.min(this.maxRetryDelay, this.retryDelay * this.retryFactor ** (attempt - 1));
  }

  info() {
    return {
      name: this.name,
      schedule: this.schedule,
      next: this.next === null ? null : new Date(this.next),
      running: this.running > 0,
      ...this.stats,
      lastRun: this.stats.lastRun === null ? null : new Date(this.stats.lastRun),
    };
  }
}

class Scheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.clock = options.clock || systemClock;
    this.logger = options.logger || null;
    this.lock = options.lock || null;
    this.historyStore = options.history || null;
    this.onError = typeof options.onError === 'function' ? options.onError : null;
    this.defaults = {
      timezone: options.timezone || null,
      lockTtl: options.lockTtl === undefined ? 600000 : toMs(options.lockTtl, 'lockTtl'),
      history: this.historyStore,
    };
    this.unref = options.unref === true;
    this.map = new Map();
    this.started = false;
    this.inFlight = new Set(); // the runs going on: { job, controller, stopped, wake, promise }
    this.catchingUp = new Set(); // the checks of catchUp going on
  }

  // Adds a job (scheduled at once if the scheduler runs). Its info.
  add(spec) {
    const job = new Job(spec, this.defaults);
    if (this.map.has(job.name)) throw new SchedulerError(`add(job): there is already a job ${job.name}`);
    this.map.set(job.name, job);
    if (this.started) this.begin(job);
    return job.info();
  }

  // Removes a job: no more runs (one going on ends by itself). Whether there was one.
  remove(name) {
    const job = this.map.get(name);
    if (!job) return false;
    this.unschedule(job);
    job.pending = null;
    this.map.delete(name);
    return true;
  }

  has(name) {
    return this.map.has(name);
  }

  // The state of a job (next run, running, runs, failures, skipped, retries, last run, its duration and error), or
  // null.
  job(name) {
    const job = this.map.get(name);
    return job ? job.info() : null;
  }

  jobs() {
    return [...this.map.values()].map((job) => job.info());
  }

  // The runs of a job in the history, the last first ([] without a history).
  async history(name, options) {
    if (!this.historyStore) return [];
    return this.historyStore.list(name, options);
  }

  start() {
    if (this.started) return this;
    this.started = true;
    for (const job of this.map.values()) this.begin(job);
    return this;
  }

  // Stops the timers and the retries, waits for the runs going on (up to timeout: 10 s), and aborts the signals of
  // those left.
  async stop({ timeout = 10000 } = {}) {
    this.started = false;
    for (const job of this.map.values()) {
      this.unschedule(job);
      job.pending = null;
    }
    for (const run of this.inFlight) {
      run.stopped = true;
      if (run.wake) run.wake();
    }
    const waits = [...this.inFlight].map((run) => run.promise).concat([...this.catchingUp]);
    if (waits.length === 0) return;
    let timer;
    const waited = new Promise((resolve) => {
      timer = setTimeout(resolve, toMs(timeout, 'stop timeout'));
    });
    await Promise.race([Promise.allSettled(waits), waited]);
    clearTimeout(timer);
    for (const run of this.inFlight) {
      if (run.controller) run.controller.abort(new SchedulerError('The scheduler stopped'));
    }
  }

  // Runs a job now, out of its schedule (with its lock, overlap and retries): the result of the run, or undefined
  // when it was skipped. It throws what the run throws.
  async runNow(name) {
    const job = this.map.get(name);
    if (!job) throw new SchedulerError(`runNow(): there is no job ${name}`);
    if (job.running > 0 && job.overlap !== 'allow') {
      this.skip(job, 'running', this.clock.now());
      return undefined;
    }
    const outcome = await this.execute(job, this.clock.now());
    if (outcome && outcome.error) throw outcome.error;
    return outcome ? outcome.result : undefined;
  }

  // -- Inside.

  begin(job) {
    job.started = this.clock.now();
    if (job.immediate) this.fire(job, job.started);
    this.plan(job, job.started);
    if (job.catchUp) this.catchUp(job, job.started);
  }

  // The last time due before the start that the history has no run of (when it has runs of the job): run now.
  catchUp(job, now) {
    const check = (async () => {
      const last = await this.historyStore.last(job.name);
      if (!last || !this.started || this.map.get(job.name) !== job) return;
      const missed = job.missedAfter(new Date(last.scheduledAt).getTime(), now);
      if (missed === null) return;
      this.emit('catchUp', { name: job.name, scheduledAt: new Date(missed) });
      if (this.logger)
        this.logger.info({ job: job.name }, `Job ${job.name} catches up ${new Date(missed).toISOString()}`);
      this.fire(job, missed);
    })().catch((err) => {
      if (this.logger) this.logger.warn({ err, job: job.name }, `The history of the job ${job.name} was not read`);
    });
    this.catchingUp.add(check);
    check.finally(() => this.catchingUp.delete(check));
  }

  unschedule(job) {
    if (job.timer !== null) this.clock.clearTimeout(job.timer);
    job.timer = null;
    job.next = null;
  }

  // Sets the timer of the next run after `after`.
  plan(job, after) {
    this.unschedule(job);
    if (!this.started) return;
    const next = job.nextAfter(after);
    if (next === null) return;
    job.next = next;
    this.arm(job);
  }

  arm(job) {
    const wait = Math.max(0, job.next - this.clock.now());
    const timer = this.clock.setTimeout(
      () => {
        job.timer = null;
        // Woken early (a long wait made of several, or a clock moved): wait again.
        if (this.clock.now() < job.next) {
          this.arm(job);
          return;
        }
        const at = job.next;
        // Before the next time is found: an hour that repeats is not that time again.
        if (job.kind === 'cron') job.lastWall = job.cron.wallKey(at);
        if (job.kind === 'at' || job.kind === 'in') {
          job.done = true;
          job.next = null;
        } else {
          this.plan(job, Math.max(this.clock.now(), at));
        }
        this.fire(job, at);
      },
      Math.min(wait, MAX_DELAY)
    );
    if (this.unref && timer && typeof timer.unref === 'function') timer.unref();
    job.timer = timer;
  }

  skip(job, why, at) {
    job.stats.skipped += 1;
    this.emit('skip', { name: job.name, scheduledAt: new Date(at), why });
    if (this.logger) this.logger.debug({ job: job.name, why }, `Job ${job.name} skipped (${why})`);
  }

  // A time of a job has come.
  fire(job, at) {
    if (job.kind === 'cron') job.lastWall = job.cron.wallKey(at);
    if (job.running > 0) {
      if (job.overlap === 'skip') {
        this.skip(job, 'running', at);
        return;
      }
      if (job.overlap === 'wait') {
        job.pending = at;
        return;
      }
    }
    this.execute(job, at);
  }

  // One run: claimed in the lock (when there is one), then its attempts, each with its signal and timeout. Its
  // outcome: { result } or { error }, or null when it was skipped.
  async execute(job, at) {
    const lock = this.lock && job.locked ? this.lock : null;
    job.running += 1;
    let token = null;
    if (lock) {
      try {
        token = await lock.claim({ name: job.name, slot: at, ttl: job.lockTtl });
      } catch (err) {
        job.running -= 1;
        this.failed(job, err, at, 0);
        this.afterRun(job);
        return { error: err };
      }
      if (!token) {
        job.running -= 1;
        this.skip(job, 'locked', at);
        this.afterRun(job);
        return null;
      }
    }

    const run = { job, controller: null, stopped: false, wake: null, promise: null };
    this.inFlight.add(run);
    const timers = [];
    if (lock && job.lockTtl > 0) {
      // The claim kept while the run goes on (its retries too).
      const every = Math.max(1, Math.floor(job.lockTtl / 2));
      const renew = () => {
        Promise.resolve(lock.renew({ name: job.name, token, ttl: job.lockTtl })).catch((err) => {
          if (this.logger) this.logger.warn({ err, job: job.name }, `The lock of the job ${job.name} was not renewed`);
        });
        timers.push(this.clock.setTimeout(renew, every));
      };
      timers.push(this.clock.setTimeout(renew, every));
    }
    const started = this.clock.now();
    this.emit('run', { name: job.name, scheduledAt: new Date(at) });
    if (this.logger) this.logger.debug({ job: job.name }, `Job ${job.name} started`);

    run.promise = (async () => {
      let outcome;
      let attempt = 0;
      for (;;) {
        attempt += 1;
        outcome = await this.attempt(job, at, attempt, run);
        if (!outcome.error || run.stopped || attempt > job.retries) break;
        const delay = job.retryWait(attempt);
        job.stats.retries += 1;
        this.emit('retry', { name: job.name, scheduledAt: new Date(at), attempt, error: outcome.error, delay });
        if (this.logger) {
          this.logger.warn(
            { err: outcome.error, job: job.name, attempt },
            `Job ${job.name} failed, again in ${delay} ms`
          );
        }
        await new Promise((resolve) => {
          const timer = this.clock.setTimeout(resolve, delay);
          run.wake = () => {
            this.clock.clearTimeout(timer);
            resolve();
          };
        });
        run.wake = null;
        if (run.stopped) break;
      }

      for (const timer of timers) this.clock.clearTimeout(timer);
      this.inFlight.delete(run);
      job.running -= 1;
      const duration = this.clock.now() - started;
      if (outcome.error) this.failed(job, outcome.error, at, duration, attempt);
      else {
        job.stats.runs += 1;
        job.stats.lastRun = started;
        job.stats.lastDuration = duration;
        job.stats.lastError = null;
        this.emit('done', {
          name: job.name,
          scheduledAt: new Date(at),
          duration,
          attempts: attempt,
          result: outcome.result,
        });
        if (this.logger) this.logger.debug({ job: job.name, duration }, `Job ${job.name} done`);
      }
      this.record(job, at, started, duration, attempt, outcome.error);
      if (lock) {
        Promise.resolve(lock.release({ name: job.name, token })).catch((err) => {
          if (this.logger) this.logger.warn({ err, job: job.name }, `The lock of the job ${job.name} was not released`);
        });
      }
      this.afterRun(job);
      return outcome;
    })();
    return run.promise;
  }

  // One attempt of a run: { result } or { error } (a TimeoutError at its timeout).
  attempt(job, at, attempt, run) {
    const controller = new AbortController();
    run.controller = controller;
    return new Promise((resolve) => {
      let timer = null;
      let settled = false;
      const settle = (outcome) => {
        if (settled) return;
        settled = true;
        if (timer !== null) this.clock.clearTimeout(timer);
        resolve(outcome);
      };
      if (job.timeout !== null) {
        timer = this.clock.setTimeout(() => {
          const error = new TimeoutError(job.name, job.timeout);
          controller.abort(error);
          settle({ error });
        }, job.timeout);
      }
      const context = {
        name: job.name,
        scheduledAt: new Date(at),
        attempt,
        signal: controller.signal,
        data: job.data,
        scheduler: this,
      };
      Promise.resolve()
        .then(() => job.run(context))
        .then(
          (result) => settle({ result }),
          (error) => settle({ error })
        );
    });
  }

  // The run in the history (its errors logged: a history that fails stops no job).
  record(job, at, started, duration, attempts, error) {
    if (!this.historyStore) return;
    const entry = {
      name: job.name,
      scheduledAt: new Date(at),
      startedAt: new Date(started),
      duration,
      status: error === undefined ? 'done' : error instanceof TimeoutError ? 'timeout' : 'failed',
      attempts,
      error: error === undefined ? null : String((error && error.message) || error),
      host: HOST,
    };
    Promise.resolve()
      .then(() => this.historyStore.record(entry))
      .catch((err) => {
        if (this.logger) this.logger.warn({ err, job: job.name }, `The run of the job ${job.name} was not recorded`);
      });
  }

  failed(job, error, at, duration, attempts = 1) {
    job.stats.failures += 1;
    job.stats.lastRun = this.clock.now() - duration;
    job.stats.lastDuration = duration;
    job.stats.lastError = error;
    this.emit('failure', { name: job.name, scheduledAt: new Date(at), duration, attempts, error });
    if (this.logger) this.logger.error({ err: error, job: job.name }, `Job ${job.name} failed`);
    if (this.onError) {
      try {
        this.onError(error, job.info());
      } catch {
        // An onError that throws stops nothing.
      }
    }
  }

  // After a run: the one waiting (overlap 'wait').
  afterRun(job) {
    if (job.pending !== null && job.running === 0 && this.map.get(job.name) === job) {
      const at = job.pending;
      job.pending = null;
      this.execute(job, at);
    }
  }
}

module.exports = { Scheduler, systemClock };
