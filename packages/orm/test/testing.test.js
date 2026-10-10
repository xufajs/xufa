// Tests in transactions (rollbackEach): what a test writes, directly, in transactions inside it (savepoints, one of
// them failing), and from requests to an app, is there while it runs and gone at its end; the data made before the
// tests stays. On memory, SQLite (in memory and in a file, with connections of its own), files, PostgreSQL
// (XUFA_PG_URL) and MongoDB: a replica set rolls back (XUFA_MONGO_RS_URL, or rs3 on 27031-27033), a server alone is
// emptied after each test (flush).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import xufa from '@xufa/http';
import { Database, Tenants, Model, fields, rollbackEach } from '../index.js';
import { url as mongoUrl, available as mongoAvailable } from '../../mongo/test/server.js';

const dirs = [];
afterAll(() => dirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-testing-'));
  dirs.push(dir);
  return dir;
};

const rsUrl =
  process.env.XUFA_MONGO_RS_URL || 'mongodb://127.0.0.1:27031,127.0.0.1:27032,127.0.0.1:27033/xufa_test?replicaSet=rs3';
const reachable = (address) => {
  const { hostname, port } = new URL(address.replace(/^mongodb:\/\/([^,/]+).*/, 'http://$1'));
  const script = `require('node:net').connect(${port}, ${JSON.stringify(hostname)}).on('connect', () => process.exit(0)).on('error', () => process.exit(1));`;
  return spawnSync(process.execPath, ['-e', script], { timeout: 3000 }).status === 0;
};

const BACKENDS = [
  ['memory', () => ({ backend: 'memory' }), 'rollback'],
  ['sqlite in memory', () => ({ backend: 'sqlite', filename: ':memory:' }), 'rollback'],
  ['sqlite in a file', () => ({ backend: 'sqlite', filename: path.join(tmp(), 'app.db') }), 'rollback'],
  ['files', () => ({ backend: 'fs', dir: tmp() }), 'rollback'],
];
if (process.env.XUFA_PG_URL)
  BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL }), 'rollback']);
if (mongoAvailable) BACKENDS.push(['mongodb alone', () => ({ backend: 'mongodb', url: mongoUrl }), 'flush']);
if (reachable(rsUrl)) BACKENDS.push(['mongodb replica set', () => ({ backend: 'mongodb', url: rsUrl }), 'rollback']);

for (const [name, options, expected] of BACKENDS) {
  describe(`rollbackEach on ${name}`, () => {
    class Author extends Model {
      static fields = { name: fields.string() };

      static options = { table: 'testing_authors' };
    }
    class Book extends Model {
      static fields = { title: fields.string(), author: fields.foreignKey(() => Author, { null: true }) };

      static options = { table: 'testing_books' };
    }
    let db;
    let app;

    beforeAll(async () => {
      db = new Database(options()).register(Author, Book);
      await db.connect();
      await db.drop();
      await db.sync();
      // The data of every test: made once, before them.
      await Author.objects.create({ name: 'Ada' });
      app = xufa();
      app.post('/books', async (request) => Book.objects.create({ title: request.body.title }));
      await app.ready();
    }, 30000);

    afterAll(async () => {
      if (app) await app.close();
      if (db) {
        await Author.objects.delete();
        await db.drop();
        await db.close();
      }
    });

    rollbackEach(() => db);

    it(`${expected}: what the test writes is there while it runs`, async () => {
      expect(db.canRollbackTests).toBe(expected === 'rollback');
      const ada = await Author.objects.get({ name: 'Ada' });
      await Book.objects.create({ title: 'Notes', author: ada });
      // A transaction inside: kept; one that fails: rolled back (a savepoint), where there are savepoints.
      await db.transaction(() => Book.objects.create({ title: 'Kept' }));
      if (name !== 'mongodb replica set') {
        await expect(
          db.transaction(async () => {
            await Book.objects.create({ title: 'Lost' });
            throw new Error('no');
          })
        ).rejects.toThrow('no');
      }
      // A request to the app: in the same transaction.
      expect((await app.inject({ method: 'POST', url: '/books', payload: { title: 'By HTTP' } })).statusCode).toBe(200);
      // (Without transactions, the one that failed kept what it wrote.)
      const titles = expected === 'flush' ? ['By HTTP', 'Kept', 'Lost', 'Notes'] : ['By HTTP', 'Kept', 'Notes'];
      expect((await Book.objects.valuesList('title', { flat: true })).sort()).toEqual(titles);
    });

    it('the next test: nothing of the last one, the data before the tests still there', async () => {
      expect(await Book.objects.count()).toBe(0);
      expect(await Author.objects.valuesList('name', { flat: true })).toEqual(expected === 'rollback' ? ['Ada'] : []);
    });
  });
}

describe('rollbackEach on tenants', () => {
  class Note extends Model {
    static fields = { text: fields.string() };

    static options = { table: 'testing_notes' };
  }
  const tenants = new Tenants({
    models: [Note],
    config: (id) => (['acme', 'globex', 'initech'].includes(id) ? { backend: 'sqlite', filename: ':memory:' } : null),
    setup: (db) => db.sync(),
  });
  const notesOf = (id) => tenants.run(id, () => Note.objects.valuesList('text', { flat: true }));

  beforeAll(async () => {
    // A tenant open before the tests, with data of every test.
    await tenants.run('acme', () => Note.objects.create({ text: 'Before' }));
  });
  afterAll(() => tenants.close());

  rollbackEach([null, tenants]);

  it('what a test writes in the tenants open and those it opens', async () => {
    await tenants.run('acme', () => Note.objects.create({ text: 'Acme' }));
    await tenants.run('globex', () => Note.objects.create({ text: 'Globex' }));
    expect(await notesOf('acme')).toEqual(['Before', 'Acme']);
    expect(await notesOf('globex')).toEqual(['Globex']);
  });

  it('the next test: rolled back in both, the data before the tests still there', async () => {
    expect(await notesOf('acme')).toEqual(['Before']);
    expect(await notesOf('globex')).toEqual([]);
    expect((await tenants.opened()).length).toBe(2);
  });

  it('onOpen(): each database opened, set up; the function it gives stops it', async () => {
    const seen = [];
    const stop = tenants.onOpen((db, id) => seen.push([id, db.models.size]));
    await tenants.database('initech');
    expect(stop()).toBe(true);
    expect(seen).toEqual([['initech', 1]]);
  });
});

describe('rollbackEach()', () => {
  it('needs hooks and a database; mode', () => {
    const db = new Database({ backend: 'memory' });
    expect(() => rollbackEach(db, { beforeEach: 1, afterEach: 1 })).toThrow('the hooks of the tests');
    expect(() => rollbackEach({}, { beforeEach() {}, afterEach() {} })).toThrow('a Database');
    expect(() => rollbackEach(db, { beforeEach() {}, afterEach() {}, mode: 'sometimes' })).toThrow('mode is auto');
  });

  it('beginTest() twice is an error; rollbackTest() without one is nothing', async () => {
    const db = new Database({ backend: 'memory' });
    await db.connect();
    await db.beginTest();
    await expect(db.beginTest()).rejects.toThrow('open already');
    await db.rollbackTest();
    await db.rollbackTest();
  });
});
