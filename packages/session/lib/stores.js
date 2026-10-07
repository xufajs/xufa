'use strict';

// Where sessions are kept: in memory (one process, tests), or as objects of a model of @xufa/orm (any backend: shared
// by every process and machine with the database; a TTL index deletes them when they expire, db.expire()).
//
// A store: get(id) gives { data, expiresAt } or null; set(id, data, expiresAt); delete(id).

function memoryStore({ now = () => Date.now() } = {}) {
  const sessions = new Map();
  return {
    sessions,
    async get(id) {
      const found = sessions.get(id);
      if (!found) return null;
      if (found.expiresAt.getTime() <= now()) {
        sessions.delete(id);
        return null;
      }
      return { data: structuredClone(found.data), expiresAt: found.expiresAt };
    },
    async set(id, data, expiresAt) {
      sessions.set(id, { data: structuredClone(data), expiresAt });
    },
    async delete(id) {
      sessions.delete(id);
    },
  };
}

// A store in a database of @xufa/orm: its model (table xufa_sessions) is registered in db, and db.sync() or a
// migration makes it.
function ormStore(db, { table = 'xufa_sessions', model: modelName = 'XufaSession' } = {}) {
  const { Model, fields } = require('@xufa/orm'); // eslint-disable-line global-require
  if (!db || typeof db.register !== 'function') throw new TypeError('ormStore(db): db is a Database of @xufa/orm');
  const Session = {
    [modelName]: class extends Model {
      static fields = {
        id: fields.string({ maxLength: 64, primaryKey: true }),
        data: fields.json(),
        expiresAt: fields.datetime(),
      };

      static options = { table, indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] };
    },
  }[modelName];
  db.register(Session);
  return {
    model: Session,
    async get(id) {
      const found = await Session.objects.filter({ pk: id }).first();
      if (!found) return null;
      if (found.expiresAt.getTime() <= Date.now()) {
        await Session.objects.filter({ pk: id }).delete();
        return null;
      }
      return { data: found.data || {}, expiresAt: found.expiresAt };
    },
    async set(id, data, expiresAt) {
      await Session.objects.updateOrCreate({ id }, { data, expiresAt });
    },
    async delete(id) {
      await Session.objects.filter({ pk: id }).delete();
    },
  };
}

module.exports = { memoryStore, ormStore };
