// Where sessions are kept: in memory (one process, tests), or as objects of a model of @xufa/orm (any backend: shared
// by every process and machine with the database; a TTL index deletes them when they expire, db.expire()).
//
// A store: get(id) gives { data, expiresAt } or null; set(id, data, expiresAt); delete(id). ormStore() makes its model
// with the ORM of the database (db.orm): the package does not depend on @xufa/orm.

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
// asyncCommit (PostgreSQL): a write of a session does not wait for the disk (SET LOCAL synchronous_commit TO OFF, the
// statements of its transaction sent together): the visits of a page that writes its session answer in less time; a
// crash of the server may lose the writes of its last fraction of a second (never more, and nothing else is lost). The
// records of the users (logouts everywhere) are written as always.
function ormStore(db, { table = 'xufa_sessions', model: modelName = 'XufaSession', asyncCommit = false } = {}) {
  if (!db || typeof db.register !== 'function' || !db.orm)
    throw new TypeError('ormStore(db): db is a Database of @xufa/orm');
  const { Model, fields } = db.orm;
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
  let upsert = true;
  // The INSERT of a write without waiting for the disk (asyncCommit, PostgreSQL), made once.
  let asyncInsert = null;
  const asyncPool = () => {
    const { backend } = db;
    return asyncCommit && backend && backend.dialect && backend.dialect.name === 'postgres' && backend.pool
      ? backend.pool
      : null;
  };
  const insertText = () => {
    if (!asyncInsert) {
      const { meta } = Session;
      const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;
      const [id, data, expires] = ['id', 'data', 'expiresAt'].map((name) => quote(meta.field(name).column));
      asyncInsert =
        `INSERT INTO ${quote(meta.table)} (${id}, ${data}, ${expires}) VALUES ($1, $2, $3) ` +
        `ON CONFLICT (${id}) DO UPDATE SET ${data} = EXCLUDED.${data}, ${expires} = EXCLUDED.${expires}`;
    }
    return asyncInsert;
  };
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
    // One statement in SQL databases (an INSERT that updates the row there); a read and a write in those without
    // inserts with conflicts (memory, MongoDB), found out at the first write.
    async set(id, data, expiresAt) {
      // The records of the users (user:<id>: their generations of "log out everywhere" and lists of sessions) always
      // wait for the disk: a logout everywhere is not undone by a crash. Only the data of sessions does not.
      const pool = String(id).startsWith('user:') ? null : asyncPool();
      if (pool) {
        const client = await pool.connect();
        try {
          // Sent together (one round trip): the commit waits for nothing.
          await Promise.all([
            client.query('BEGIN'),
            client.query('SET LOCAL synchronous_commit TO OFF'),
            client.query(insertText(), [id, JSON.stringify(data), expiresAt]),
            client.query('COMMIT'),
          ]);
        } finally {
          client.release();
        }
        return;
      }
      if (upsert) {
        try {
          await Session.objects.bulkCreate([{ id, data, expiresAt }], {
            validate: false,
            updateConflicts: true,
            uniqueFields: ['id'],
            updateFields: ['data', 'expiresAt'],
          });
          return;
        } catch (err) {
          if (!err || err.code !== 'XUFA_ORM_ERR_UNSUPPORTED') throw err;
          upsert = false;
        }
      }
      await Session.objects.updateOrCreate({ id }, { data, expiresAt });
    },
    async delete(id) {
      await Session.objects.filter({ pk: id }).delete();
    },
  };
}

export { memoryStore, ormStore };
