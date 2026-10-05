// Reads that stop with a signal: QuerySet.signal(), withSignal(), and the plugin with `cancel` (the signal of each
// request, aborted when its client goes away). Reads not started throw its reason; PostgreSQL cancels the one that
// runs (and the server stops it: pg_stat_activity). Writes are not stopped.
const http = require('node:http');
const xufa = require('@xufa/http');
const { Database, Model, fields, withSignal, plugin } = require('..');
const { url, available } = require('../../pg/test/server');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Note extends Model {
  static fields = { text: fields.string({ maxLength: 50 }), size: fields.integer({ default: 0 }) };
}

// A GET to the app that the client leaves after `ms`.
function leave(port, path, ms) {
  return new Promise((resolve) => {
    const req = http.get({ port, host: '127.0.0.1', path }, () => {});
    req.on('error', () => resolve());
    req.on('close', () => resolve());
    setTimeout(() => req.destroy(), ms);
  });
}

describe('cancellation', () => {
  describe('memory', () => {
    let db;
    beforeAll(async () => {
      db = new Database({ backend: 'memory' });
      db.register(Note);
      await db.connect();
      await db.sync();
      await Note.objects.create({ text: 'a', size: 1 });
    });
    afterAll(() => db.close());

    it('reads of a queryset with an aborted signal throw its reason', async () => {
      const controller = new AbortController();
      const notes = Note.objects.signal(controller.signal);
      expect(await notes.count()).toBe(1);
      controller.abort(new Error('client gone'));
      await expect(notes.count()).rejects.toThrow('client gone');
      await expect(notes.filter({ text: 'a' }).first()).rejects.toThrow('client gone');
      await expect(notes.exists()).rejects.toThrow('client gone');
      await expect(notes.aggregate({ total: { sum: 'size' } })).rejects.toThrow('client gone');
      await expect(notes.values('text')).rejects.toThrow('client gone');
      // Without it, the same queryset reads.
      expect(await notes.signal(null).count()).toBe(1);
    });

    it('withSignal: the reads of the code it runs', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(withSignal(controller.signal, async () => Note.objects.count())).rejects.toThrow(/abort/i);
      expect(await Note.objects.count()).toBe(1);
    });

    it('writes are not stopped', async () => {
      const controller = new AbortController();
      controller.abort();
      await withSignal(controller.signal, async () => {
        const note = await Note.objects.create({ text: 'b' });
        await Note.objects.filter({ pk: note.pk }).update({ size: 2 });
        await note.delete();
      });
      expect(await Note.objects.count()).toBe(1);
    });
  });

  describe('the plugin with cancel', () => {
    let app;
    let port;
    const seen = {};

    beforeAll(async () => {
      const db = new Database({ backend: 'memory' });
      db.register(Note);
      app = xufa();
      await app.register(plugin, { database: db, sync: true, cancel: true });
      app.get('/slow', async () => {
        await wait(150);
        try {
          seen.count = await Note.objects.count();
        } catch (err) {
          seen.count = err.name;
        }
        return {};
      });
      app.get('/fine', async () => ({ count: await Note.objects.count() }));
      await app.listen({ port: 0, host: '127.0.0.1' });
      port = app.server.address().port;
    });
    afterAll(() => app.close());

    it('the reads of a request whose client left throw', async () => {
      await leave(port, '/slow', 30);
      await wait(250);
      expect(seen.count).toBe('AbortError');
    });

    it('requests whose client waits read', async () => {
      const res = await app.inject({ url: '/fine' });
      expect(res.statusCode).toBe(200);
      expect(typeof res.json().count).toBe('number');
    });

    it('without cancel, they are not stopped', async () => {
      const db = new Database({ backend: 'memory' });
      db.register(Note);
      const other = xufa();
      await other.register(plugin, { database: db, sync: true });
      let read;
      other.get('/slow', async () => {
        await wait(150);
        read = await Note.objects.count();
        return {};
      });
      await other.listen({ port: 0, host: '127.0.0.1' });
      try {
        await leave(other.server.address().port, '/slow', 30);
        await wait(250);
        expect(typeof read).toBe('number');
      } finally {
        await other.close();
      }
    });
  });

  describe.skipIf(!available)('postgres', () => {
    let db;
    beforeAll(async () => {
      db = new Database({ backend: 'postgres', url, max: 3 });
      await db.connect();
    });
    afterAll(() => db.close());

    const sleeping = async () =>
      Number(
        (
          await db.backend.raw(
            "SELECT count(*) AS n FROM pg_stat_activity WHERE state = 'active' AND query LIKE 'SELECT pg_sleep(4)%'"
          )
        )[0].n
      );

    it('a read that runs is cancelled in the server, and the pool still works', async () => {
      const controller = new AbortController();
      const started = Date.now();
      setTimeout(() => controller.abort(), 150);
      await expect(withSignal(controller.signal, async () => db.backend.raw('SELECT pg_sleep(4)'))).rejects.toThrow(
        /abort/i
      );
      expect(Date.now() - started).toBeLessThan(2000);
      await wait(100);
      expect(await sleeping()).toBe(0);
      expect(await db.backend.raw('SELECT 1 AS one')).toEqual([{ one: 1 }]);
    });

    it('a request whose client left: its query stops in the server', async () => {
      const app = xufa();
      await app.register(plugin, { database: db, connect: false, close: false, cancel: true });
      let error;
      app.get('/report', async () => {
        try {
          await db.backend.raw('SELECT pg_sleep(4)');
        } catch (err) {
          error = err;
        }
        return {};
      });
      await app.listen({ port: 0, host: '127.0.0.1' });
      try {
        await leave(app.server.address().port, '/report', 150);
        await wait(300);
        expect(error && error.name).toBe('AbortError');
        expect(await sleeping()).toBe(0);
      } finally {
        await app.close();
      }
    });

    it('not inside a transaction: its statements are not cut', async () => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 50);
      const rows = await withSignal(controller.signal, () =>
        db.transaction(async () => db.backend.raw('SELECT pg_sleep(0.3), 1 AS one'))
      );
      expect(rows[0].one).toBe(1);
    });
  });
});
