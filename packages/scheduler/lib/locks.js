// Locks: which process runs a time of a job, when several have the same jobs (processes on several machines). A lock
// is { claim({ name, slot, ttl }), renew({ name, token, ttl }), release({ name, token }) }: claim gives a token, or
// null when that time (slot, ms) was taken, or a run of the job goes on in another process (its claim not released
// and younger than ttl ms); renew keeps a claim while its run goes on; release frees it.
//
// - memoryLock(): in this process (tests, or several schedulers in one process).
// - ormLock(db): in a table of a database of @xufa/orm (any backend), so processes on any machine share it. The
//   times of a job agree between machines (every is aligned to the clock), so the first to claim one runs it. The
//   expiry uses the clock of each machine: keep them in time (NTP), and ttl well above their difference.
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { SchedulerError } from './errors.js';

const ownerToken = () => `${os.hostname()}:${process.pid}:${randomBytes(6).toString('hex')}`;

function memoryLock({ now = () => Date.now() } = {}) {
  const claims = new Map(); // name -> { slot, until, token }
  return {
    claim({ name, slot, ttl }) {
      const current = claims.get(name);
      if (current && (current.slot >= slot || current.until > now())) return null;
      const token = ownerToken();
      claims.set(name, { slot, until: now() + ttl, token });
      return token;
    },
    renew({ name, token, ttl }) {
      const current = claims.get(name);
      if (current && current.token === token) current.until = now() + ttl;
    },
    release({ name, token }) {
      const current = claims.get(name);
      if (current && current.token === token) current.until = now();
    },
  };
}

// A lock in a table of an ORM database: its model (registered in db at once) is created by db.sync(), or by
// lock.sync() alone. Options: table ('xufa_scheduler_locks'), model (the name of its model, 'XufaSchedulerLock').
function ormLock(db, { table = 'xufa_scheduler_locks', model: modelName = 'XufaSchedulerLock' } = {}) {
  if (!db || typeof db.register !== 'function' || !db.orm) {
    throw new SchedulerError('ormLock(db): db is a Database of @xufa/orm');
  }
  const { Model, fields, UniqueError } = db.orm;
  const Lock = {
    [modelName]: class extends Model {
      static fields = {
        name: fields.string({ maxLength: 200, primaryKey: true }),
        slot: fields.datetime(),
        until: fields.datetime(),
        owner: fields.string({ maxLength: 200 }),
      };

      static options = { table };
    },
  }[modelName];
  db.register(Lock);

  return {
    model: Lock,
    // Creates the table of the locks (when it does not exist).
    async sync() {
      await db.backend.createSchema([Lock.meta]);
    },
    async claim({ name, slot, ttl }) {
      const token = ownerToken();
      const now = Date.now();
      const values = { slot: new Date(slot), until: new Date(now + ttl), owner: token };
      try {
        await Lock.objects.create({ name, ...values });
        return token;
      } catch (err) {
        if (!(err instanceof UniqueError)) throw err;
      }
      // Taken by this update alone: an earlier time, and no run going on.
      const updated = await Lock.objects
        .filter({ name, slot__lt: values.slot, until__lte: new Date(now) })
        .update(values);
      return updated === 1 ? token : null;
    },
    async renew({ name, token, ttl }) {
      await Lock.objects.filter({ name, owner: token }).update({ until: new Date(Date.now() + ttl) });
    },
    async release({ name, token }) {
      await Lock.objects.filter({ name, owner: token }).update({ until: new Date() });
    },
  };
}

export { memoryLock, ormLock };
