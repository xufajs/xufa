// @xufa/admin and keys that cannot be ones (an address with /Book/nope, a filter author=nope, an action on ['nope']):
// not found, an error of the request or no object, never a query that the database refuses (Postgres errors on
// "nope" for an integer key). On memory and SQLite, and on Postgres with XUFA_PG_URL.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { admin } from '../index.js';

const WRITE = { 'x-xufa-admin': '1' };
const BACKENDS = [
  ['memory', () => ({ backend: 'memory' })],
  ['sqlite', () => ({ backend: 'sqlite', filename: ':memory:' })],
];
if (process.env.XUFA_PG_URL) BACKENDS.push(['postgres', () => ({ backend: 'postgres', url: process.env.XUFA_PG_URL })]);

describe.each(BACKENDS)('admin: keys that cannot be ones (%s)', (_, config) => {
  let db;
  let app;
  let ada;
  let Writer;
  let Novel;

  beforeAll(async () => {
    Writer = class AdminKeysWriter extends Model {
      static fields = { name: fields.string({ maxLength: 100 }) };
    };
    Novel = class AdminKeysNovel extends Model {
      static fields = {
        title: fields.string({ maxLength: 100 }),
        writer: fields.foreignKey(() => Writer),
      };
    };
    db = new Database(config()).register(Writer, Novel);
    await db.connect();
    await db.drop();
    await db.sync();
    ada = await Writer.objects.create({ name: 'Ada' });
    await Novel.objects.create({ title: 'One', writer: ada });
    app = xufa();
    app.register(admin, { models: [Novel, Writer], authorize: () => true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
    await db.close();
  });

  it('an object, its related lists, updates and deletes: 404', async () => {
    for (const request of [
      { url: '/api/AdminKeysWriter/nope' },
      { url: '/api/AdminKeysWriter/1.5' },
      { url: '/api/AdminKeysWriter/nope/related/adminKeysNovelSet' },
      { method: 'PATCH', url: '/api/AdminKeysWriter/nope', headers: WRITE, payload: { name: 'x' } },
      { method: 'DELETE', url: '/api/AdminKeysWriter/nope', headers: WRITE },
    ]) {
      const res = await app.inject(request);
      expect([request.url, res.statusCode]).toEqual([request.url, 404]);
    }
    expect((await app.inject(`/api/AdminKeysWriter/${ada.pk}`)).statusCode).toBe(200);
  });

  it('filters, choices and actions: an error of the request, or no object', async () => {
    const filtered = await app.inject('/api/AdminKeysNovel?filter.writer=nope');
    expect([filtered.statusCode, filtered.json().error]).toEqual([400, 'Not a key of AdminKeysWriter: nope']);
    expect((await app.inject(`/api/AdminKeysNovel?filter.writer=${ada.pk}`)).json().count).toBe(1);
    expect((await app.inject('/api/AdminKeysWriter/choices?pk=nope')).json()).toEqual([]);
    expect((await app.inject(`/api/AdminKeysWriter/choices?pk=${ada.pk}`)).json()).toEqual([
      { pk: ada.pk, label: 'Ada' },
    ]);
  });
});
