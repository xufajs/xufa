'use strict';

// Queue: jobs to run in the background, kept as objects of a model of @xufa/orm (any backend: SQLite, PostgreSQL,
// MongoDB, memory, files), as the queues of Laravel and Rails' Active Job. A job enqueued in a transaction is there
// only when the transaction commits, with the data it was enqueued for (an outbox: no message lost or sent too early).
//
//   const queue = new Queue(db);
//   queue.define('welcome', async ({ userId }, job) => sendWelcome(userId), { attempts: 5, timeout: '30s' });
//   await queue.enqueue('welcome', { userId: 1 }, { delay: '5m' });
//   queue.work({ concurrency: 4 });             // workers, in any process or machine with the database
//
// Workers claim each job with a write that only one of them can make (an update of a pending job to running), so a
// job runs once among every worker of every machine. A job that fails is tried again after a delay that grows
// (backoff), up to its attempts, and then kept as failed (retry() takes it back). A job that runs longer than its
// timeout is failed (its signal aborted); one whose worker died (it ran past lockedUntil) is taken back by the others.
//
// A kind of job with a pool (createPool or usePool of @xufa/cluster: nodes that take a few works at once each) waits
// for a free node before it is claimed: it stays pending while it waits, its timeout counts its run only, and it runs
// with job.node (its signal is aborted too when the pool takes the node back).
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { QueueError } = require('./errors');
const { ms } = require('./duration');

const STATUSES = ['pending', 'running', 'done', 'failed'];

function jobModel(orm, table, modelName) {
  const { Model, fields } = orm;
  return {
    [modelName]: class extends Model {
      static fields = {
        name: fields.string({ maxLength: 200 }),
        queue: fields.string({ maxLength: 100, default: 'default' }),
        payload: fields.json({ null: true }),
        status: fields.string({ maxLength: 20, default: 'pending', choices: STATUSES }),
        priority: fields.integer({ default: 0 }),
        runAt: fields.datetime(),
        attempts: fields.integer({ default: 0 }),
        maxAttempts: fields.integer({ default: 3 }),
        key: fields.string({ maxLength: 200, null: true, index: true }),
        lockedBy: fields.string({ maxLength: 200, null: true }),
        lockedUntil: fields.datetime({ null: true }),
        lastError: fields.text({ null: true }),
        result: fields.json({ null: true }),
        createdAt: fields.datetime({ autoNowAdd: true }),
        finishedAt: fields.datetime({ null: true }),
      };

      static options = { table, indexes: [['status', 'queue', 'runAt']] };
    },
  }[modelName];
}

// The delay before attempt n + 1 (n: attempts made): fixed, or exponential (delay * 2^(n-1)), up to max; with jitter.
function backoffDelay(backoff, attempts) {
  if (typeof backoff === 'function') return ms(backoff(attempts));
  const {
    type = 'exponential',
    delay = 1000,
    max = 3600000,
    jitter = true,
  } = typeof backoff === 'object' && backoff !== null ? backoff : { delay: backoff };
  let wait = type === 'fixed' ? ms(delay) : ms(delay) * 2 ** Math.max(0, attempts - 1);
  wait = Math.min(wait, ms(max));
  return jitter ? Math.round(wait * (0.8 + Math.random() * 0.4)) : wait;
}

class Queue extends EventEmitter {
  constructor(db, options = {}) {
    super();
    let orm;
    try {
      orm = require('@xufa/orm'); // eslint-disable-line global-require
    } catch (err) {
      throw new QueueError(`Queue needs @xufa/orm (${err.message})`);
    }
    if (!db || typeof db.register !== 'function') throw new QueueError('new Queue(db): db is a Database of @xufa/orm');
    this.db = db;
    this.orm = orm;
    this.Job = options.jobModel || jobModel(orm, options.table || 'xufa_jobs', options.model || 'XufaJob');
    if (!options.jobModel) db.register(this.Job);
    this.handlers = new Map();
    this.defaults = {
      attempts: options.attempts || 3,
      backoff: options.backoff === undefined ? { type: 'exponential', delay: '5s', max: '1h' } : options.backoff,
      timeout: options.timeout === undefined ? '5m' : options.timeout,
      queue: options.queue || 'default',
    };
    // Done jobs are deleted, or kept (keepDone: true) with their results.
    this.keepDone = Boolean(options.keepDone);
    this.logger = options.logger || null;
    this.owner = `${os.hostname()}:${process.pid}:${randomBytes(4).toString('hex')}`;
    this.workers = [];
  }

  // Creates the table of the jobs (when it does not exist); db.sync() makes it too.
  async sync() {
    await this.db.backend.createSchema([this.Job.meta]);
  }

  // A kind of job: its function (payload, job) and options (attempts, backoff, timeout, queue, pool, and
  // onFailure(job, err, final): waited for when a run fails, before the job is tried again or failed).
  define(name, handler, options = {}) {
    if (typeof name !== 'string' || name === '') throw new QueueError('define(name, handler): name is a string');
    if (typeof handler !== 'function') throw new QueueError(`define(${name}, handler): handler is a function`);
    if (options.pool !== undefined && (!options.pool || typeof options.pool.acquire !== 'function')) {
      throw new QueueError(`define(${name}): pool is a pool of @xufa/cluster (createPool or usePool)`);
    }
    this.handlers.set(name, { handler, ...this.defaults, ...options });
    return this;
  }

  // Adds a job: the object of the model. Options: delay (ms or '10m'), at (a Date), priority (higher first), queue,
  // attempts, and key: a job with the same key pending or running makes this one not added (the one there is given).
  async enqueue(name, payload = null, options = {}) {
    const spec = this.handlers.get(name) || { ...this.defaults };
    if (options.key) {
      const existing = await this.Job.objects.filter({ key: options.key, status__in: ['pending', 'running'] }).first();
      if (existing) return existing;
    }
    const runAt = options.at ? new Date(options.at) : new Date(Date.now() + (options.delay ? ms(options.delay) : 0));
    const job = await this.Job.objects.create({
      name,
      queue: options.queue || spec.queue,
      payload,
      priority: options.priority || 0,
      runAt,
      maxAttempts: options.attempts || spec.attempts,
      key: options.key || null,
    });
    // Workers of this process look at once.
    for (const worker of this.workers) worker.wake();
    return job;
  }

  // Claims a job: an update that only one worker can make (pending to running). The job, or null.
  async claim(id, timeout) {
    const now = Date.now();
    const { F } = this.orm;
    const claimed = await this.Job.objects.filter({ pk: id, status: 'pending', runAt__lte: new Date(now) }).update({
      status: 'running',
      lockedBy: this.owner,
      lockedUntil: new Date(now + timeout),
      attempts: F('attempts').add(1),
    });
    if (claimed !== 1) return null;
    return this.Job.objects.get({ pk: id });
  }

  // Jobs whose workers stopped while they ran (past lockedUntil): pending again, or failed when out of attempts.
  async recover() {
    const now = new Date();
    const stalled = await this.Job.objects.filter({ status: 'running', lockedUntil__lt: now }).limit(100);
    let count = 0;
    for (const job of stalled) {
      const failed = job.attempts >= job.maxAttempts;
      const changed = await this.Job.objects.filter({ pk: job.pk, status: 'running', lockedBy: job.lockedBy }).update(
        failed
          ? {
              status: 'failed',
              lockedBy: null,
              lockedUntil: null,
              finishedAt: now,
              lastError: 'The worker stopped while it ran (lockedUntil passed)',
            }
          : { status: 'pending', lockedBy: null, lockedUntil: null, runAt: now }
      );
      count += changed;
      if (changed && failed) {
        const err = new QueueError('The worker stopped while it ran (lockedUntil passed)');
        await this.failure(job, err, true);
        this.emit('failed', job, err);
      }
    }
    return count;
  }

  // The onFailure(job, err, final) of its kind, waited for (its errors are warnings): before the job is pending again.
  async failure(job, err, final) {
    const spec = this.handlers.get(job.name);
    if (!spec || typeof spec.onFailure !== 'function') return;
    try {
      await spec.onFailure(job, err, final);
    } catch (failure) {
      if (this.logger) this.logger.error({ err: failure, job: job.pk, name: job.name }, 'onFailure of a job failed');
      else process.emitWarning(failure);
    }
  }

  // Claims a job and runs it: the outcome, or null when another worker claimed it first. A kind of job with a pool
  // waits for a node of it before (and gives it back when the job was not claimed).
  async take(id, spec, signal) {
    const lease = spec && spec.pool ? await spec.pool.acquire({ signal }) : null;
    let job;
    try {
      job = await this.claim(id, ms(spec ? spec.timeout : this.defaults.timeout) + 30000);
    } catch (err) {
      if (lease) lease.release();
      throw err;
    }
    if (!job) {
      if (lease) lease.release();
      return null;
    }
    return this.execute(job, lease);
  }

  // Runs one job claimed (with the lease of a node of its pool): done (deleted, or kept), tried again later, or failed.
  async execute(job, lease = null) {
    const spec = this.handlers.get(job.name);
    const finish = (values) =>
      this.Job.objects.filter({ pk: job.pk, lockedBy: this.owner, status: 'running' }).update(values);
    if (!spec) {
      await finish({
        status: 'failed',
        lockedBy: null,
        finishedAt: new Date(),
        lastError: `No job named ${job.name} is defined`,
      });
      this.emit('failed', job, new QueueError(`No job named ${job.name} is defined`));
      return 'failed';
    }
    const timeout = ms(spec.timeout);
    const controller = new AbortController();
    job.signal = lease ? AbortSignal.any([controller.signal, lease.signal]) : controller.signal;
    if (lease) job.node = lease.node;
    let timer = null;
    const races = [
      Promise.resolve().then(() => spec.handler(job.payload, job)),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => {
          const err = new QueueError(`The job ${job.name} (${job.pk}) ran more than ${timeout} ms`);
          err.timeout = true;
          controller.abort(err);
          reject(err);
        }, timeout);
      }),
    ];
    // The pool took the node back (its leaseTimeout, the node gone): the run failed.
    if (lease) {
      races.push(
        new Promise((resolve, reject) => {
          lease.signal.addEventListener('abort', () => reject(lease.signal.reason), { once: true });
        })
      );
    }
    try {
      const result = await Promise.race(races);
      clearTimeout(timer);
      if (lease) lease.release();
      if (this.keepDone) {
        await finish({
          status: 'done',
          lockedBy: null,
          lockedUntil: null,
          finishedAt: new Date(),
          result: result === undefined ? null : result,
        });
      } else {
        await this.Job.objects.filter({ pk: job.pk, lockedBy: this.owner }).delete();
      }
      this.emit('completed', job, result);
      return 'done';
    } catch (err) {
      clearTimeout(timer);
      // The error: a busy answer (429) leaves the node aside instead of counting a failure.
      if (lease) lease.release(err && typeof err === 'object' ? err : true);
      const message = err && err.stack ? err.stack : String(err);
      const final = job.attempts >= job.maxAttempts;
      await this.failure(job, err, final);
      if (final) {
        await finish({
          status: 'failed',
          lockedBy: null,
          lockedUntil: null,
          finishedAt: new Date(),
          lastError: message,
        });
        if (this.logger) this.logger.error({ err, job: job.pk, name: job.name }, 'a job failed');
        this.emit('failed', job, err);
        return 'failed';
      }
      const wait = backoffDelay(spec.backoff, job.attempts);
      await finish({
        status: 'pending',
        lockedBy: null,
        lockedUntil: null,
        runAt: new Date(Date.now() + wait),
        lastError: message,
      });
      this.emit('retrying', job, err, wait);
      return 'retrying';
    }
  }

  // The ids of the jobs due of some queues, in order (priority, then time).
  async due(queues, count) {
    let query = this.Job.objects.filter({ status: 'pending', runAt__lte: new Date() });
    if (queues) query = query.filter({ queue__in: queues });
    return query.orderBy('-priority', 'runAt', 'id').limit(count).valuesList('id', { flat: true });
  }

  // Runs the jobs due now, one after another, until there is none (or `limit` were run): for tests and scripts.
  // Counts by outcome.
  async runDue({ queues = null, limit = Infinity } = {}) {
    const counts = { done: 0, retrying: 0, failed: 0 };
    let run = 0;
    await this.recover();
    while (run < limit) {
      const ids = await this.due(queues, 1);
      if (ids.length === 0) break;
      const row = await this.Job.objects.filter({ pk: ids[0] }).only('name').first();
      const outcome = await this.take(ids[0], row && this.handlers.get(row.name));
      if (!outcome) continue;
      counts[outcome] += 1;
      run += 1;
    }
    return counts;
  }

  // Starts a worker: it runs up to `concurrency` jobs at once, of some queues (all by default), looking for jobs every
  // `poll` (1 s) and at once when this process enqueues one. Gives the worker (stop() stops it).
  work({ queues = null, concurrency = 1, poll = '1s' } = {}) {
    const worker = new Worker(this, { queues, concurrency, poll: ms(poll) });
    this.workers.push(worker);
    worker.start();
    return worker;
  }

  // Stops the workers, waiting for the jobs they run (up to `timeout` ms: those still running are then taken back by
  // other workers once their lockedUntil passes).
  async stop({ timeout = 30000 } = {}) {
    const workers = this.workers;
    this.workers = [];
    await Promise.all(workers.map((worker) => worker.stop({ timeout })));
  }

  // Failed jobs, pending again (all, or those of the ids given, or a queryset's): their number.
  async retry(ids) {
    let query = this.Job.objects.filter({ status: 'failed' });
    if (ids !== undefined) query = query.filter({ pk__in: [].concat(ids) });
    return query.update({ status: 'pending', attempts: 0, runAt: new Date(), finishedAt: null });
  }

  // The jobs, as a queryset of their model (Job.objects): queue.jobs.filter({ status: 'failed' }).
  get jobs() {
    return this.Job.objects;
  }

  // A check of xufa.health of @xufa/http: the counts of the jobs, how long the oldest job due has waited (lag) and the
  // workers of this process; degraded when the lag is more than maxLag ('5m'), or pending or failed jobs more than
  // maxPending or maxFailed; down when the jobs cannot be read. Not critical by default (the app serves without it).
  health({ maxLag = '5m', maxPending, maxFailed, critical = false, timeout } = {}) {
    const lagLimit = ms(maxLag);
    const check = async () => {
      const counts = await this.counts();
      const oldest = await this.Job.objects
        .filter({ status: 'pending', runAt__lte: new Date() })
        .orderBy('runAt')
        .only('runAt')
        .first();
      const lag = oldest ? Math.max(0, Date.now() - new Date(oldest.runAt).getTime()) : 0;
      const problems = [];
      if (lag > lagLimit) problems.push(`the oldest job due waits for ${Math.round(lag / 1000)} s`);
      if (maxPending !== undefined && counts.pending > maxPending) problems.push(`${counts.pending} jobs pending`);
      if (maxFailed !== undefined && counts.failed > maxFailed) problems.push(`${counts.failed} jobs failed`);
      return {
        status: problems.length ? 'degraded' : 'up',
        ...(problems.length ? { error: problems.join('; ') } : {}),
        ...counts,
        lag,
        workers: this.workers.length,
      };
    };
    return { check, critical, ...(timeout !== undefined ? { timeout } : {}) };
  }

  // Counts of the jobs by status.
  async counts() {
    const rows = await this.Job.objects.values('status').annotate({ count: this.orm.Count() });
    const counts = { pending: 0, running: 0, done: 0, failed: 0 };
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }
}

class Worker {
  constructor(queue, { queues, concurrency, poll }) {
    this.queue = queue;
    this.queues = queues;
    this.concurrency = concurrency;
    this.poll = poll;
    this.active = new Set();
    // Jobs waiting for a node of their pool (not claimed yet), and what stops them waiting.
    this.reserved = new Set();
    this.stopping = new AbortController();
    this.running = false;
    this.timer = null;
    this.looping = null;
    this.again = false;
    this.lastRecover = 0;
  }

  start() {
    this.running = true;
    if (this.stopping.signal.aborted) this.stopping = new AbortController();
    this.wake();
  }

  wake() {
    if (!this.running) return;
    if (this.looping) {
      this.again = true;
      return;
    }
    clearTimeout(this.timer);
    this.looping = this.fill().finally(() => {
      this.looping = null;
      if (!this.running) return;
      if (this.again) {
        this.again = false;
        this.wake();
      } else this.timer = setTimeout(() => this.wake(), this.poll);
    });
  }

  // Claims jobs while there is room, and runs them.
  async fill() {
    const { queue } = this;
    try {
      if (Date.now() - this.lastRecover > Math.max(this.poll * 10, 10000)) {
        this.lastRecover = Date.now();
        await queue.recover();
      }
      while (this.running && this.active.size < this.concurrency) {
        const ids = await queue.due(this.queues, this.concurrency - this.active.size + this.reserved.size);
        if (ids.length === 0) return;
        let claimed = 0;
        for (const id of ids) {
          if (!this.running || this.active.size >= this.concurrency) break;
          if (this.reserved.has(id)) continue;
          const row = await queue.Job.objects.filter({ pk: id }).only('name').first();
          const handler = row && queue.handlers.get(row.name);
          if (handler && handler.pool) {
            // It waits for a node (taking a place of the concurrency), and is claimed when it gets one.
            claimed += 1;
            this.reserved.add(id);
            const run = queue
              .take(id, handler, this.stopping.signal)
              .then(
                () => this.wake(),
                (err) => this.waitFailed(err)
              )
              .finally(() => {
                this.reserved.delete(id);
                this.active.delete(run);
              });
            this.active.add(run);
            continue;
          }
          const job = await queue.claim(id, ms(handler ? handler.timeout : queue.defaults.timeout) + 30000);
          if (!job) continue;
          claimed += 1;
          const run = queue
            .execute(job)
            .catch((err) => queue.emit('error', err))
            .finally(() => {
              this.active.delete(run);
              this.wake();
            });
          this.active.add(run);
        }
        // Every job seen was taken by other workers: look again later.
        if (claimed === 0) return;
      }
    } catch (err) {
      if (queue.listenerCount('error')) queue.emit('error', err);
      else if (queue.logger) queue.logger.error({ err }, 'the worker of the queue could not read its jobs');
    }
  }

  // A job that could not get a node: it stays pending (the next look tries again); only unexpected errors are told.
  waitFailed(err) {
    const { queue } = this;
    if (this.stopping.signal.aborted) return;
    if (err && ['XUFA_POOL_WAIT_TIMEOUT', 'XUFA_POOL_FULL', 'XUFA_POOL_CANCELLED'].includes(err.code)) return;
    if (queue.listenerCount('error')) queue.emit('error', err);
    else if (queue.logger) queue.logger.error({ err }, 'a job of the queue could not get a node of its pool');
  }

  async stop({ timeout = 30000 } = {}) {
    this.running = false;
    this.stopping.abort(new QueueError('The worker of the queue stopped'));
    clearTimeout(this.timer);
    if (this.looping) await this.looping;
    let timer;
    await Promise.race([
      Promise.all([...this.active]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeout);
      }),
    ]);
    clearTimeout(timer);
  }
}

module.exports = { Queue, Worker, backoffDelay };
