'use strict';

// The maintenance mode of an app kept in its database (any backend), so that every machine of the app sees it: xufa
// down --everywhere sets it, xufa up clears it, and the plugin xufa.maintenance of @xufa/http reads it (store).
//
//   app.register(xufa.maintenance, { store: maintenance(db) });
//   await maintenance(db).set({ message: 'Back in 10 minutes', retryAfter: 600 });
const { Model } = require('./model');
const fields = require('./fields');

function maintenanceModel(table, name) {
  return {
    [name]: class extends Model {
      static fields = {
        key: fields.string({ maxLength: 100, unique: true }),
        state: fields.json(),
        since: fields.datetime(),
      };

      static options = { table };
    },
  }[name];
}

const isUnique = (err) => Boolean(err) && err.code === 'XUFA_ORM_ERR_UNIQUE';

// The store of db: get() (the state, or null when the app is up), set(state), clear(). Options: key ('app': several
// apps on one database each with theirs), table ('xufa_maintenance'), model ('XufaMaintenance').
function maintenance(db, options = {}) {
  if (!db || typeof db.register !== 'function') throw new TypeError('maintenance(db): db is a Database of @xufa/orm');
  const key = options.key || 'app';
  const name = options.model || 'XufaMaintenance';
  const State =
    db.models && db.models.get(name)
      ? db.models.get(name)
      : maintenanceModel(options.table || 'xufa_maintenance', name);
  if (!(db.models && db.models.get(name))) db.register(State);

  return {
    model: State,
    async get() {
      const row = await State.objects.filter({ key }).first();
      return row ? row.state : null;
    },
    async set(state = {}) {
      const value = { since: new Date().toISOString(), ...state };
      const since = new Date(value.since);
      if (await State.objects.filter({ key }).update({ state: value, since })) return value;
      try {
        await State.objects.create({ key, state: value, since });
      } catch (err) {
        if (!isUnique(err)) throw err;
        await State.objects.filter({ key }).update({ state: value, since });
      }
      return value;
    },
    async clear() {
      return (await State.objects.filter({ key }).delete()) > 0;
    },
  };
}

module.exports = { maintenance };
