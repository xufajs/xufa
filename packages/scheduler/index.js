// @xufa/scheduler: jobs run every so often, on cron expressions or once, each on a timer of its own: no overlapping
// runs, timeouts that abort, retries with backoff, failures that stop no other job, a history of the runs (and times
// missed run when a process starts again), and, with a lock in a database, each time run by one process among those
// of several machines. No dependencies.
import { Scheduler } from './lib/scheduler.js';
import { Cron } from './lib/cron.js';
import { memoryLock, ormLock } from './lib/locks.js';
import { memoryHistory, ormHistory } from './lib/history.js';
import { schedulerPlugin } from './lib/plugin.js';
import { toMs } from './lib/duration.js';

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

export * from './lib/errors.js';

export { Scheduler, createScheduler, schedulerPlugin, memoryLock, ormLock, memoryHistory, ormHistory, nextRuns, toMs };
