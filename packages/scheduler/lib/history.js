'use strict';

// Histories: the runs of the jobs, recorded by the scheduler: { name, scheduledAt, startedAt, duration, status
// ('done', 'failed' or 'timeout'), attempts, error (its message), host }. A history is { record(entry), last(name),
// list(name, { limit }) }; last() is what catchUp reads.
//
// - memoryHistory({ keep }): in this process, the last `keep` runs of each job (100).
// - ormHistory(db, { maxAge }): in a table of a database of @xufa/orm (any backend), shared by the processes of every
//   machine; runs older than maxAge (30 days) are deleted, at most once an hour.
const { SchedulerError } = require('./errors');
const { toMs } = require('./duration');

function memoryHistory({ keep = 100 } = {}) {
  const runs = new Map(); // name -> entries, the last first
  return {
    record(entry) {
      let list = runs.get(entry.name);
      if (!list) {
        list = [];
        runs.set(entry.name, list);
      }
      list.unshift({ ...entry });
      if (list.length > keep) list.length = keep;
    },
    last(name) {
      const list = runs.get(name);
      return list && list.length ? { ...list[0] } : null;
    },
    list(name, { limit = 20 } = {}) {
      return (runs.get(name) || []).slice(0, limit).map((entry) => ({ ...entry }));
    },
  };
}

// A history in a table of an ORM database: its model (registered in db at once) is created by db.sync(), or by
// history.sync() alone. Options: table ('xufa_scheduler_runs'), model ('XufaSchedulerRun'), maxAge ('30d').
function ormHistory(db, { table = 'xufa_scheduler_runs', model: modelName = 'XufaSchedulerRun', maxAge = '30d' } = {}) {
  let orm;
  try {
    orm = require('@xufa/orm'); // eslint-disable-line global-require
  } catch (err) {
    throw new SchedulerError(`ormHistory() needs @xufa/orm (${err.message})`);
  }
  if (!db || typeof db.register !== 'function') {
    throw new SchedulerError('ormHistory(db): db is a Database of @xufa/orm');
  }
  const keepFor = maxAge === null ? null : toMs(maxAge, 'the maxAge of the history');
  const { Model, fields } = orm;
  const Run = {
    [modelName]: class extends Model {
      static fields = {
        name: fields.string({ maxLength: 200 }),
        scheduledAt: fields.datetime(),
        startedAt: fields.datetime(),
        duration: fields.integer(),
        status: fields.string({ maxLength: 20 }),
        attempts: fields.integer(),
        error: fields.text({ null: true }),
        host: fields.string({ maxLength: 200 }),
      };

      static options = { table, indexes: [['name', 'scheduledAt']] };
    },
  }[modelName];
  db.register(Run);

  const plain = (row) => ({
    name: row.name,
    scheduledAt: row.scheduledAt,
    startedAt: row.startedAt,
    duration: row.duration,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    host: row.host,
  });
  let pruned = 0;

  return {
    model: Run,
    // Creates the table of the runs (when it does not exist).
    async sync() {
      await db.backend.createSchema([Run.meta]);
    },
    async record(entry) {
      await Run.objects.create({ ...entry, duration: Math.round(entry.duration) });
      if (keepFor !== null && Date.now() - pruned > 3600000) {
        pruned = Date.now();
        await this.prune();
      }
    },
    async last(name) {
      const [row] = await Run.objects.filter({ name }).orderBy('-scheduledAt').limit(1);
      return row ? plain(row) : null;
    },
    async list(name, { limit = 20 } = {}) {
      const rows = await Run.objects.filter({ name }).orderBy('-scheduledAt', '-startedAt').limit(limit);
      return rows.map(plain);
    },
    // Deletes the runs older than maxAge (or than `before`): how many.
    async prune(before = keepFor === null ? null : new Date(Date.now() - keepFor)) {
      if (before === null) return 0;
      return Run.objects.filter({ startedAt__lt: before }).delete();
    },
  };
}

module.exports = { memoryHistory, ormHistory };
