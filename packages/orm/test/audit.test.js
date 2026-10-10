// The audit log (option audit of a Database): entries of the changes of objects, with the values before and after,
// on every backend; who and in what context (with(), the requests of the plugin); events of log(); what is redacted
// or left out; the models audited; a change and its entries in one transaction; retain; tenants; and the shared suite
// of the backends on an audited database (auditing changes nothing else).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { Database, Tenants, Model, AuditEntry, auditResource, fields, F, plugin, setEncryptionKeys, generateEncryptionKey } from '../index.js';
import { defineSuite } from './suite.js';
import * as pg from '../../pg/test/server.js';
import * as mongo from '../../mongo/test/server.js';

// composite: false for MongoDB (no composite primary keys).
function makeModels({ composite = true } = {}) {
  // Tables of their own: other test files use author and book in the same PostgreSQL and MongoDB databases.
  class Author extends Model {
    static options = { table: 'audited_author' };
    static fields = { name: fields.string(), password: fields.string({ default: '' }) };
  }
  class Book extends Model {
    static options = { table: 'audited_book' };
    static fields = {
      title: fields.string(),
      price: fields.decimal({ precision: 8, scale: 2 }),
      meta: fields.json({ null: true }),
      author: fields.foreignKey(Author, { onDelete: 'cascade' }),
      editor: fields.foreignKey(Author, { null: true, onDelete: 'setNull', relatedName: 'edited' }),
      notes: fields.string({ null: true, audit: 'redact' }),
      views: fields.integer({ default: 0, audit: false }),
      card: fields.encrypted(fields.string(), { null: true }),
      at: fields.datetime({ null: true }),
    };
  }
  class Membership extends Model {
    static options = { primaryKey: ['team', 'user'], table: 'audited_membership' };
    static fields = { team: fields.string(), user: fields.string(), role: fields.string() };
  }
  class Hit extends Model {
    static options = { primaryKey: false, table: 'audited_hit' };
    static fields = { path: fields.string(), count: fields.integer() };
  }
  class Session extends Model {
    static options = { audit: false, table: 'audited_session' };
    static fields = { token: fields.string() };
  }
  return composite ? { Author, Book, Membership, Hit, Session } : { Author, Book, Hit, Session };
}

const changesOf = (entry) => entry.changes;
const summary = (entries) => entries.map((e) => [e.action, e.model, e.key]);

function auditTests(name, makeDatabase, { atomic = true, composite = true } = {}) {
  describe(`${name}`, () => {
    let db;
    let models;

    beforeAll(async () => {
      setEncryptionKeys(generateEncryptionKey());
      models = makeModels({ composite });
      db = makeDatabase({ redact: ['password'] });
      db.register(...Object.values(models));
      await db.connect();
      await db.drop();
      await db.sync();
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
      setEncryptionKeys(null);
    });

    beforeEach(async () => {
      const { Book, Author, Membership, Hit, Session } = models;
      for (const model of [Book, Author, Membership, Hit, Session, AuditEntry].filter(Boolean)) {
        await model.objects.using(db).delete();
      }
    });

    it('create, update and delete: the values given, those that changed, those deleted; the key apart', async () => {
      const { Author, Book } = models;
      const ada = await Author.objects.create({ name: 'Ada' });
      const book = await Book.objects.create({
        title: 'Notes',
        price: '10.50',
        author: ada,
        meta: { a: { b: 1 }, tags: ['x'] },
      });
      book.title = 'Notes on the Engine';
      book.meta = { tags: ['x'], a: { b: 2, c: true } }; // other order: only b and c changed
      await book.save();
      await book.save(); // nothing changed: no entry
      await book.delete();
      const entries = await db.audit.entries();
      expect(summary(entries)).toEqual([
        ['create', 'Author', String(ada.pk)],
        ['create', 'Book', entries[1].key],
        ['update', 'Book', entries[1].key],
        ['delete', 'Book', entries[1].key],
      ]);
      expect(changesOf(entries[1])).toEqual([
        { field: 'title', to: 'Notes' },
        { field: 'price', to: '10.50' },
        { field: 'meta', to: { a: { b: 1 }, tags: ['x'] } },
        { field: 'author', to: ada.pk },
      ]);
      expect(changesOf(entries[2])).toEqual([
        { field: 'title', from: 'Notes', to: 'Notes on the Engine' },
        { field: 'meta', path: ['a', 'b'], from: 1, to: 2 },
        { field: 'meta', path: ['a', 'c'], to: true },
      ]);
      const deleted = Object.fromEntries(changesOf(entries[3]).map((c) => [c.field, c.from]));
      expect(deleted.title).toBe('Notes on the Engine');
      expect(Number(deleted.price)).toBe(10.5);
      expect(entries.every((e) => e.at instanceof Date && e.actor === null && e.context === null)).toBe(true);
    });

    it('an update of texts and datetimes is not read again (one read, before); others are; the entries the same', async () => {
      const { Author, Book } = models;
      const ada = await Author.objects.create({ name: 'Ada' });
      const book = await Book.objects.create({ title: 'Notes', price: '10.50', author: ada });
      const backend = db.backend || db;
      const select = backend.select;
      let reads = 0;
      backend.select = function counted(...args) {
        reads += 1;
        return select.apply(this, args);
      };
      try {
        const at = new Date(Date.UTC(2026, 9, 7, 13, 5, 9, 123));
        await Book.objects.filter({ pk: book.pk }).update({ title: 'Notes on the Engine', at });
        expect(reads).toBe(1);
        await Book.objects.filter({ pk: book.pk }).update({ price: '12.00' });
        expect(reads).toBe(3);
      } finally {
        backend.select = select;
      }
      const [first, second] = (await db.audit.history(book)).filter((entry) => entry.action === 'update');
      expect(first.changes).toEqual([
        { field: 'title', from: 'Notes', to: 'Notes on the Engine' },
        { field: 'at', from: null, to: '2026-10-07T13:05:09.123Z' },
      ]);
      // Decimals as each database gives them back (10.5 in SQLite).
      expect(second.changes.map((c) => [c.field, Number(c.from), Number(c.to)])).toEqual([['price', 10.5, 12]]);
    });

    it('querysets: bulkCreate, update (with F), delete, and what deleting does to related objects', async () => {
      const { Author, Book } = models;
      const [ada, grace] = await Author.objects.bulkCreate([{ name: 'Ada' }, { name: 'Grace' }]);
      await Book.objects.bulkCreate([
        { title: 'A', price: '1.00', author: ada, editor: grace },
        { title: 'B', price: '2.00', author: grace },
      ]);
      await AuditEntry.objects.using(db).delete();
      const graceId = grace.pk;
      expect(await Book.objects.update({ price: F('price').add(1) })).toBe(2);
      await grace.delete(); // B goes with its author (cascade); A loses its editor (setNull)
      const entries = await db.audit.entries();
      const prices = entries
        .filter((e) => e.action === 'update' && e.changes[0].field === 'price')
        .map((e) => e.changes[0])
        .map(({ from, to }) => [Number(from), Number(to)])
        .sort((x, y) => x[0] - y[0]);
      expect(prices).toEqual([
        [1, 2],
        [2, 3],
      ]);
      const rest = entries.filter((e) => !(e.action === 'update' && e.changes[0].field === 'price'));
      expect(rest.map((e) => [e.action, e.model]).sort()).toEqual([
        ['delete', 'Author'],
        ['delete', 'Book'],
        ['update', 'Book'],
      ]);
      expect(rest.find((e) => e.action === 'update').changes).toEqual([{ field: 'editor', from: graceId, to: null }]);
    });

    it('who and in what context: with() (nested, merged; functions asked when an entry is made)', async () => {
      const { Author } = models;
      let asked = 0;
      await db.audit.with({ actor: 'u1', requestId: 'r1' }, async () => {
        await Author.objects.create({ name: 'Ada' });
        await db.audit.with(
          {
            actor: () => {
              asked += 1;
              return 42;
            },
            context: { reason: 'ticket 7' },
          },
          () => Author.objects.create({ name: 'Grace' })
        );
      });
      await Author.objects.create({ name: 'Alan' });
      const entries = await db.audit.entries();
      expect(entries.map((e) => [e.actor, e.context])).toEqual([
        ['u1', { requestId: 'r1' }],
        ['42', { requestId: 'r1', reason: 'ticket 7' }],
        [null, null],
      ]);
      expect(asked).toBe(1);
      expect((await db.audit.entries({ actor: 42 })).length).toBe(1);
    });

    it('redacted (encrypted, audit: "redact", the option redact) and left out (audit: false) fields', async () => {
      const { Author, Book } = models;
      const ada = await Author.objects.create({ name: 'Ada', password: 'secret' });
      const book = await Book.objects.create({ title: 'A', price: '1.00', author: ada, notes: 'n', card: '4111' });
      book.views = 10; // left out: no entry
      await book.save();
      book.notes = 'm';
      book.card = '4242';
      await book.save();
      const entries = await db.audit.entries();
      expect(changesOf(entries[0])).toEqual([
        { field: 'name', to: 'Ada' },
        { field: 'password', redacted: true },
      ]);
      expect(changesOf(entries[1]).filter((c) => c.redacted)).toEqual([
        { field: 'notes', redacted: true },
        { field: 'card', redacted: true },
      ]);
      expect(changesOf(entries[2])).toEqual([
        { field: 'notes', redacted: true },
        { field: 'card', redacted: true },
      ]);
      expect(entries).toHaveLength(3);
      expect(JSON.stringify(entries.map((e) => e.changes))).not.toMatch(/secret|4111|4242|"n"|"m"/);
    });

    it('composite keys, models without a key, and models with audit: false', async () => {
      const { Membership, Hit, Session } = models;
      if (!Membership) return;
      const member = await Membership.objects.create({ team: 'core', user: 'ada', role: 'admin' });
      member.role = 'owner';
      await member.save();
      await Hit.objects.create({ path: '/', count: 1 });
      await Hit.objects.filter({ path: '/' }).update({ count: 2 });
      await Session.objects.create({ token: 't' });
      const entries = await db.audit.entries();
      expect(summary(entries)).toEqual([
        ['create', 'Membership', '["core","ada"]'],
        ['update', 'Membership', '["core","ada"]'],
        ['create', 'Hit', null],
        ['update', 'Hit', null],
      ]);
      expect(changesOf(entries[1])).toEqual([{ field: 'role', from: 'admin', to: 'owner' }]);
      expect(changesOf(entries[3])).toEqual([{ field: 'count', from: 1, to: 2 }]);
      expect((await db.audit.history(member)).map((e) => e.action)).toEqual(['create', 'update']);
      expect(await db.audit.entries({ key: ['core', 'ada'] }).count()).toBe(2);
    });

    it('events of log(): of the database, or of an object; entries() by action, model, since and until', async () => {
      const { Author } = models;
      const ada = await Author.objects.create({ name: 'Ada' });
      const before = new Date(Date.now() - 1000);
      await db.audit.with({ actor: 'u1' }, () => db.audit.log('export', { rows: 1200, at: new Date(0) }));
      await db.audit.log('viewed', null, { object: ada });
      const exported = await db.audit.entries({ action: 'export' });
      expect(exported.map((e) => [e.model, e.key, e.actor, e.data])).toEqual([
        [null, null, 'u1', { rows: 1200, at: '1970-01-01T00:00:00.000Z' }],
      ]);
      expect((await db.audit.history(ada)).map((e) => e.action)).toEqual(['create', 'viewed']);
      expect(await db.audit.entries({ model: Author, since: before }).count()).toBe(2);
      expect(await db.audit.entries({ until: before }).count()).toBe(0);
      await expect(db.audit.log('')).rejects.toThrow('The action of an audit entry is a text');
    });

    it.skipIf(!atomic)(
      'a change and its entries are one: when the entry fails, the change is rolled back',
      async () => {
        const { Author } = models;
        const ada = await Author.objects.create({ name: 'Ada' });
        db.faults.fail({ operations: 'insert', models: ['AuditEntry'] });
        ada.name = 'Ada Lovelace';
        await expect(ada.save()).rejects.toThrow(/A fault of the database/);
        await expect(Author.objects.create({ name: 'Grace' })).rejects.toThrow(/A fault of the database/);
        db.faults.clear();
        expect(await Author.objects.valuesList('name', { flat: true })).toEqual(['Ada']);
      }
    );

    it('group(): several writes that are one change, one entry for each object (fields back where they were: none)', async () => {
      const { Author } = models;
      const ada = await Author.objects.create({ name: 'Ada' });
      const grace = await Author.objects.create({ name: 'Grace' });
      await AuditEntry.objects.using(db).delete();
      const result = await db.audit.with({ actor: 'u1' }, () =>
        db.audit.group(async () => {
          ada.name = 'Ada B.';
          await ada.save();
          ada.name = 'Ada Lovelace';
          await ada.save();
          grace.name = 'Grace H.';
          await grace.save();
          grace.name = 'Grace';
          await grace.save(); // back to what it was: no change
          await db.audit.log('renamed', { count: 1 });
          return 'done';
        })
      );
      expect(result).toBe('done');
      const entries = await db.audit.entries();
      expect(entries.map((e) => [e.action, e.key, e.actor, e.changes])).toEqual([
        ['update', String(ada.pk), 'u1', [{ field: 'name', from: 'Ada', to: 'Ada Lovelace' }]],
        ['renamed', null, 'u1', null],
      ]);
    });

    it('retain: db.expire() deletes the entries older than it', async () => {
      const { Author } = models;
      await Author.objects.create({ name: 'Ada' });
      await db.audit.log('old');
      await AuditEntry.objects
        .using(db)
        .filter({ action: 'old' })
        .update({ at: new Date(Date.now() - 40 * 86400e3) });
      const retained = new Database({ backend: 'memory', audit: { retain: '30d' } });
      expect(retained.audit.retain).toBe(30 * 86400);
      db.audit.retain = 30 * 86400;
      try {
        expect(await db.expire()).toEqual({ AuditEntry: 1 });
      } finally {
        db.audit.retain = null;
      }
      expect((await db.audit.entries()).map((e) => e.action)).toEqual(['create']);
    });
  });
}

describe('audit log', () => {
  auditTests('memory', (options) => new Database({ backend: 'memory', audit: options }));
  auditTests('sqlite', (options) => new Database({ backend: 'sqlite', filename: ':memory:', audit: options }));
  auditTests('fs', (options) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-audit-'));
    return new Database({ backend: 'fs', dir, audit: options });
  });
  describe.skipIf(!pg.available)('postgres', () => {
    auditTests('postgres', (options) => new Database({ backend: 'postgres', url: pg.url, audit: options }));
  });
  // MongoDB without a replica set has no transactions: a change and its entries are not one.
  describe.skipIf(!mongo.available)('mongodb', () => {
    auditTests('mongodb', (options) => new Database({ backend: 'mongodb', url: mongo.url, audit: options }), {
      atomic: false,
      composite: false,
    });
  });

  it('the models audited: models, exclude; a blob backend has none', () => {
    const { Author, Book } = makeModels();
    const only = new Database({ backend: 'memory', audit: { models: [Author] } }).register(Author, Book);
    expect([only.audit.audits(Author.meta), only.audit.audits(Book.meta)]).toEqual([true, false]);
    const but = new Database({ backend: 'memory', audit: { exclude: ['Author'] } }).register(Author, Book);
    expect([but.audit.audits(Author.meta), but.audit.audits(Book.meta), but.audit.audits(AuditEntry.meta)]).toEqual([
      false,
      true,
      false,
    ]);
    expect(new Database({ backend: 'memory' }).audit).toBe(null);
    expect(() => new Database({ backend: 'memory-blob', audit: true })).toThrow(/needs a database, not a blob or mail backend/);
  });

  it('rows whose encrypted values cannot be decrypted are still updated and deleted (their entries without them)', async () => {
    setEncryptionKeys(generateEncryptionKey());
    class Card extends Model {
      static fields = { owner: fields.string(), number: fields.encrypted(fields.string()) };
    }
    // The same table, its text as stored: a value written from outside, not encrypted.
    class RawCard extends Model {
      static fields = { owner: fields.string(), number: fields.text() };
      static options = { table: 'card', audit: false };
    }
    const db = new Database({ backend: 'sqlite', filename: ':memory:', audit: true }).register(Card);
    await db.connect();
    await db.sync();
    db.register(RawCard);
    try {
      const card = await Card.objects.create({ owner: 'ada', number: '4111' });
      await RawCard.objects.filter({ pk: card.pk }).update({ number: 'plain text' });
      expect(await Card.objects.filter({ pk: card.pk }).update({ owner: 'grace' })).toBe(1);
      expect(await Card.objects.filter({ pk: card.pk }).delete()).toBe(1);
      const entries = await db.audit.entries();
      expect(entries.map((e) => [e.action, e.changes])).toEqual([
        [
          'create',
          [
            { field: 'owner', to: 'ada' },
            { field: 'number', redacted: true },
          ],
        ],
        ['update', [{ field: 'owner', from: 'ada', to: 'grace' }]],
        ['delete', [{ field: 'owner', from: 'grace' }]],
      ]);
    } finally {
      await db.close();
      setEncryptionKeys(null);
    }
  });

  for (const backend of ['memory', 'sqlite']) {
    it(`${backend}: an update() of what stored computed fields read is one entry for each object`, async () => {
      class Line extends Model {
        static options = { table: 'audited_line' };
        static fields = {
          price: fields.integer(),
          qty: fields.integer(),
          total: fields.integer({ computed: 'price * qty', stored: true }),
          note: fields.string({ default: '' }),
        };
      }
      const db = new Database({ backend, filename: ':memory:', audit: true }).register(Line);
      await db.connect();
      await db.sync();
      await Line.objects.bulkCreate([
        { price: 10, qty: 1 },
        { price: 5, qty: 2 },
      ]);
      await AuditEntry.objects.using(db).delete();
      expect(await Line.objects.update({ qty: 3 })).toBe(2);
      const entries = await db.audit.entries();
      expect(entries.map((e) => [e.action, e.changes])).toEqual([
        [
          'update',
          [
            { field: 'qty', from: 1, to: 3 },
            { field: 'total', from: 10, to: 30 },
          ],
        ],
        [
          'update',
          [
            { field: 'qty', from: 2, to: 3 },
            { field: 'total', from: 10, to: 15 },
          ],
        ],
      ]);
      // Fields not read by computed ones: one write, one entry, as before.
      await Line.objects.filter({ price: 10 }).update({ note: 'x' });
      const after = await db.audit.entries();
      expect(after.map((e) => e.changes)).toEqual([
        ...entries.map((e) => e.changes),
        [{ field: 'note', from: '', to: 'x' }],
      ]);
      await db.close();
    });
  }

  it('tenants: each one has its own log (that of its database)', async () => {
    const { Author } = makeModels();
    const tenants = new Tenants({
      models: [Author],
      config: () => ({ backend: 'memory', audit: true }),
      setup: (db) => db.sync(),
    });
    await tenants.run('acme', () => Author.objects.create({ name: 'Ada' }));
    await tenants.run('globex', async () => {
      await Author.objects.create({ name: 'Grace' });
      await Author.objects.create({ name: 'Alan' });
    });
    const counts = await Promise.all(['acme', 'globex'].map((id) => tenants.run(id, () => AuditEntry.objects.count())));
    expect(counts).toEqual([1, 2]);
    await tenants.close();
  });

  it('auditResource(): the entries over HTTP, read only, newest first, filtered; auth required', async () => {
    const { Author } = makeModels();
    const db = new Database({ backend: 'memory', audit: true }).register(Author);
    const app = xufa();
    const rules = [];
    app.addHook('onRoute', (route) => rules.push([route.method, route.url, route.config && route.config.auth]));
    app.register(plugin, { database: db, sync: true });
    app.register(db.audit.resource({ auth: 'admin' }), { prefix: '/audit' });
    await app.ready();
    const ada = await Author.objects.create({ name: 'Ada' });
    ada.name = 'Ada Lovelace';
    await ada.save();
    await Author.objects.create({ name: 'Grace' });
    const list = (await app.inject('/audit')).json();
    expect([list.count, list.results.map((e) => e.action)]).toEqual([3, ['create', 'update', 'create']]);
    expect(list.results[1].changes).toEqual([{ field: 'name', from: 'Ada', to: 'Ada Lovelace' }]); // newest first
    expect((await app.inject(`/audit?key=${ada.pk}`)).json().results.map((e) => e.action)).toEqual([
      'update',
      'create',
    ]);
    expect((await app.inject('/audit?action=update')).json().count).toBe(1);
    expect((await app.inject('/audit?action__in=create,update&model=Author')).json().count).toBe(3);
    const future = new Date(Date.now() + 60000).toISOString();
    expect((await app.inject(`/audit?at__gte=${future}`)).json().count).toBe(0);
    expect((await app.inject('/audit?ordering=at')).json().results[0].action).toBe('create');
    const one = await app.inject(`/audit/${list.results[1].id}`);
    expect([one.statusCode, one.json().action]).toEqual([200, 'update']);
    // Read only: no route writes it.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((await app.inject({ method, url: `/audit/${list.results[1].id}`, payload: {} })).statusCode).toBe(404);
    }
    // The rule of @xufa/auth on its routes; without auth, no resource.
    expect(rules.filter(([, url]) => url.startsWith('/audit')).every(([, , rule]) => rule === 'admin')).toBe(true);
    expect(() => auditResource({})).toThrow(/auditResource\(\) needs auth/);
    await app.close();
  });

  it('auditResource() without a database: the log of the tenant of each request', async () => {
    const { Author } = makeModels();
    const tenants = new Tenants({
      models: [Author],
      config: () => ({ backend: 'memory', audit: true }),
      setup: (db) => db.sync(),
    });
    const app = xufa();
    app.register(plugin, { tenants: { tenants, resolve: (request) => request.headers['x-tenant'], authorize: false } });
    app.register(auditResource({ auth: false }), { prefix: '/audit' });
    app.post('/authors', async (request) => Author.objects.create(request.body));
    await app.ready();
    const post = (tenant, name) =>
      app.inject({ method: 'POST', url: '/authors', headers: { 'x-tenant': tenant }, payload: { name } });
    await post('acme', 'Ada');
    await post('globex', 'Grace');
    await post('globex', 'Alan');
    const log = async (tenant) =>
      (await app.inject({ url: '/audit', headers: { 'x-tenant': tenant } }))
        .json()
        .results.map((entry) => entry.changes[0].to);
    expect(await log('acme')).toEqual(['Ada']);
    expect(await log('globex')).toEqual(['Alan', 'Grace']);
    await app.close();
  });

  it('the plugin: the actor and context of each request, asked when an entry is made', async () => {
    const { Author } = makeModels();
    const db = new Database({ backend: 'memory', audit: true }).register(Author);
    const app = xufa();
    app.register(plugin, {
      database: db,
      sync: true,
      audit: { actor: (request) => request.user && request.user.id, context: (request) => ({ ip: request.ip }) },
    });
    app.addHook('preHandler', async (request) => {
      request.user = { id: request.headers['x-user'] };
    });
    app.post('/authors', async (request) => Author.objects.create(request.body));
    const response = await app.inject({
      method: 'POST',
      url: '/authors',
      headers: { 'x-user': 'u7' },
      payload: { name: 'Ada' },
    });
    expect(response.statusCode).toBe(200);
    const [entry] = await db.audit.entries();
    expect([entry.actor, entry.context]).toEqual(['u7', { ip: '127.0.0.1' }]);
    await app.close();
    await expect(
      xufa()
        .register(plugin, { database: db, audit: { actor: 'u1' } })
        .ready()
    ).rejects.toThrow(/audit is \{ actor\(request\), context\(request\) \}/);
  });
});

// Auditing changes nothing else: the suite of the backends on an audited database.
defineSuite('memory (audited)', () => new Database({ backend: 'memory', audit: true }));
defineSuite('sqlite (audited)', () => new Database({ backend: 'sqlite', filename: ':memory:', audit: true }));
