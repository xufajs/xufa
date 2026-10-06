'use strict';

// @xufa/scheduler: jobs run every so often, on cron expressions or once, each on a timer of its own: no overlapping
// runs, timeouts that abort, retries with backoff, failures that stop no other job, a history of the runs (and times
// missed run when a process starts again), and, with a lock in a database, each time run by one process among those
// of several machines. No dependencies.
const { Scheduler } = require('./lib/scheduler');
const { Cron } = require('./lib/cron');
const { memoryLock, ormLock } = require('./lib/locks');
const { memoryHistory, ormHistory } = require('./lib/history');
const { schedulerPlugin } = require('./lib/plugin');
const { toMs } = require('./lib/duration');
const errors = require('./lib/errors');

const createScheduler = (options) => new Scheduler(options);

// The next times of a cron expression (to check one): nextRuns('0 8 * * mon-fri', 3, { timezone }).
function nextRuns(expression, count = 5, { timezone, from = Date.now() } = {}) {
  const cron = new Cron(expression, { timezone });
  const out = [];
  let at = from instanceof Date ? from.getTime() : from;
  while (out.length < count) {
    at = cron.next(at);
    if (at === null) break;
    out.push(new Date(at));
  }
  return out;
}

module.exports = {
  Scheduler,
  createScheduler,
  schedulerPlugin,
  memoryLock,
  ormLock,
  memoryHistory,
  ormHistory,
  nextRuns,
  toMs,
  ...errors,
};
