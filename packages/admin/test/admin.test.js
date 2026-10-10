// @xufa/admin: the page and its API on a memory database: the models and their fields as the forms show them, lists
// with search, filters, order and pages, labels (toString() and foreign keys), creates and updates with the errors of
// the model by field, deletes (soft too), choices of foreign keys, authorize() and the header of writes. (The page
// itself was driven in Chrome while it was written: lists, search, forms with errors, creates and edits.)
import xufa from '@xufa/http';
import { Database, Model, fields, factory } from '@xufa/orm';
import { admin, describeModel, AdminError } from '../index.js';
import { createRequire } from 'node:module';
import * as pageModule from '../lib/page.js';
import * as buildModule from '../client/build.js';
import * as queueModule from '@xufa/queue';
import * as schedulerModule from '@xufa/scheduler';
import * as authModule from '@xufa/auth';
import * as sessionModule from '@xufa/session';

const require = createRequire(import.meta.url);

function models() {
  class Author extends Model {
    static fields = {
      name: fields.string({ maxLength: 100 }),
      country: fields.string({ null: true, choices: ['ES', 'UK'] }),
    };
  }
  class Book extends Model {
    static options = { softDelete: true };

    static fields = {
      title: fields.string({ maxLength: 200, unique: true }),
      pages: fields.integer({ null: true, validate: [{ rule: 'value > 0', message: 'Pages are more than 0.' }] }),
      published: fields.boolean({ default: false }),
      author: fields.foreignKey(() => Author),
      notes: fields.text({ null: true }),
      createdAt: fields.datetime({ autoNowAdd: true }),
    };

    toString() {
      return `«${this.title}»`;
    }
  }
  return { Author, Book };
}

async function setUp(options = {}) {
  const { Author, Book } = models();
  const db = new Database({ backend: 'memory' }).register(Author, Book);
  await db.sync();
  const ada = await Author.objects.create({ name: 'Ada', country: 'UK' });
  const grace = await Author.objects.create({ name: 'Grace' });
  await factory(Book, {
    title: (n) => `Book ${String(n).padStart(2, '0')}`,
    pages: (n) => n * 10,
    author: ada,
    published: (n) => n % 2 === 0,
  }).createMany(12);
  const app = xufa();
  app.register(admin, { prefix: '/admin', models: [Book, Author], authorize: () => true, ...options });
  await app.ready();
  return { app, Author, Book, ada, grace };
}

const WRITE = { 'x-xufa-admin': '1' };

describe('admin', () => {
  it('the files of the page: hashed addresses cached for good, compressed, 304 with their ETag', async () => {
    const { app } = await setUp({ authorize: () => false });
    // The page is not for this request, its files are (they have no data).
    expect((await app.inject('/admin/')).statusCode).toBe(403);
    const html = pageModule.page('Shop');
    const [, js] = /src="assets\/admin\.js\?v=([0-9a-f]{16})"/.exec(html);
    const [, css] = /href="assets\/admin\.css\?v=([0-9a-f]{16})"/.exec(html);
    const script = await app.inject({
      url: `/admin/assets/admin.js?v=${js}`,
      headers: { 'accept-encoding': 'gzip, br' },
    });
    expect(script.statusCode).toBe(200);
    expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(script.headers['content-encoding']).toBe('br');
    expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const plain = await app.inject(`/admin/assets/admin.css?v=${css}`);
    expect([plain.headers['content-encoding'], plain.headers['content-type']]).toEqual([
      undefined,
      'text/css; charset=utf-8',
    ]);
    expect(plain.body).toContain('--accent');
    const gzip = await app.inject({ url: '/admin/assets/admin.css', headers: { 'accept-encoding': 'gzip' } });
    expect([gzip.headers['content-encoding'], gzip.headers['cache-control']]).toEqual(['gzip', 'no-cache']);
    const again = await app.inject({ url: '/admin/assets/admin.css', headers: { 'if-none-match': gzip.headers.etag } });
    expect(again.statusCode).toBe(304);
    expect((await app.inject('/admin/assets/secret.json')).statusCode).toBe(404);
    expect((await app.inject('/admin/assets/..%2Fpackage.json')).statusCode).toBe(404);
  });

  it('the page is the build of client/src (npm run build)', async () => {
    const { build, OUT } = buildModule;
    const files = await build();
    const fs = require('node:fs');
    const path = require('node:path');
    for (const [name, content] of Object.entries(files)) {
      expect([name, fs.readFileSync(path.join(OUT, name)).equals(content)]).toEqual([name, true]);
    }
  });

  it('the page, and the models with their fields, lists, searches and filters', async () => {
    const { app } = await setUp({ title: 'Shop' });
    const page = await app.inject('/admin/');
    expect([page.statusCode, page.headers['content-type']]).toEqual([200, 'text/html; charset=utf-8']);
    expect(page.body).toContain('<title>Shop</title>');
    expect((await app.inject('/admin')).headers.location).toBe('/admin/');
    expect(page.body).toContain('data-view="admin"');
    const { models: described } = (await app.inject('/admin/api/models')).json();
    const book = described.find((model) => model.name === 'Book');
    expect(book.count).toBe(12);
    expect(book.list).toEqual(['id', 'title', 'pages', 'published', 'author', 'createdAt']);
    expect(book.search).toEqual(['title']);
    expect(book.filters).toEqual(['published', 'author']);
    expect(book.softDelete).toBe('deletedAt');
    const byName = Object.fromEntries(book.fields.map((field) => [field.name, field]));
    expect(byName.title).toMatchObject({ input: 'text', required: true, maxLength: 200, readOnly: false });
    expect(byName.pages).toMatchObject({ input: 'number', required: false, null: true });
    expect(byName.published).toMatchObject({ input: 'checkbox', required: false, default: false });
    expect(byName.author).toMatchObject({ input: 'select', target: 'Author', attname: 'authorId', required: true });
    expect(byName.createdAt.readOnly).toBe(true);
    expect(byName.id.readOnly).toBe(true);
    const author = described.find((model) => model.name === 'Author');
    expect(author.fields.find((field) => field.name === 'country')).toMatchObject({
      input: 'choices',
      choices: ['ES', 'UK'],
    });
  });

  it('lists: pages, search, filters, order; labels of the objects and of their foreign keys', async () => {
    const { app, grace } = await setUp();
    const first = (await app.inject('/admin/api/Book?size=10')).json();
    expect([first.count, first.results.length, first.page]).toEqual([12, 10, 1]);
    expect(first.results[0]).toMatchObject({ label: '«Book 01»', related: { author: 'Ada' } });
    expect((await app.inject('/admin/api/Book?size=10&page=2')).json().results).toHaveLength(2);
    // Each word in some field (01, 10, 11, 12 have a 1); "quoted words" are one (10, 11, 12).
    expect((await app.inject('/admin/api/Book?search=book 1')).json().count).toBe(4);
    expect((await app.inject(`/admin/api/Book?search=${encodeURIComponent('"book 1"')}`)).json().count).toBe(3);
    expect((await app.inject('/admin/api/Book?filter.published=true')).json().count).toBe(6);
    const ordered = (await app.inject('/admin/api/Book?order=-pages')).json().results.map((item) => item.values.pages);
    expect(ordered.slice(0, 3)).toEqual([120, 110, 100]);
    expect((await app.inject('/admin/api/Book?order=nope')).statusCode).toBe(400);
    expect((await app.inject('/admin/api/Nope')).statusCode).toBe(404);
    expect((await app.inject(`/admin/api/Author/choices?pk=${grace.pk}`)).json()).toEqual([
      { pk: grace.pk, label: 'Grace' },
    ]);
    const choices = (await app.inject('/admin/api/Author/choices')).json();
    expect(choices.map((choice) => choice.label)).toEqual(['Ada', 'Grace']);
  });

  it("creates and updates with the errors of the model by field; deletes (softly, with the model's option)", async () => {
    const { app, Book, grace } = await setUp();
    const invalid = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', pages: -1 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().errors).toEqual({ pages: ['Pages are more than 0.'], author: ['This field is required.'] });
    const created = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', pages: 5, authorId: grace.pk, createdAt: '2000-01-01' },
    });
    expect(created.statusCode).toBe(201);
    const { pk } = created.json();
    const book = await Book.objects.get({ pk });
    expect([book.title, book.authorId, book.createdAt.getFullYear() > 2000]).toEqual(['New', grace.pk, true]);
    const duplicate = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: WRITE,
      payload: { title: 'New', authorId: grace.pk },
    });
    expect([duplicate.statusCode, duplicate.json().errors]).toEqual([
      409,
      { title: ['There is already one with this value.'] },
    ]);
    const updated = await app.inject({
      method: 'PATCH',
      url: `/admin/api/Book/${pk}`,
      headers: WRITE,
      payload: { title: 'Renamed', notes: '' },
    });
    expect([updated.statusCode, updated.json().values.title, updated.json().values.notes]).toEqual([
      200,
      'Renamed',
      null,
    ]);
    const one = (await app.inject(`/admin/api/Book/${pk}`)).json();
    expect(one).toMatchObject({ label: '«Renamed»', related: { author: 'Grace' } });
    expect((await app.inject({ method: 'DELETE', url: `/admin/api/Book/${pk}`, headers: WRITE })).statusCode).toBe(204);
    expect((await app.inject(`/admin/api/Book/${pk}`)).statusCode).toBe(404);
    expect(await Book.objects.onlyDeleted().count()).toBe(1);
  });

  it('authorize() and the header of writes; models only read', async () => {
    const { app } = await setUp({ authorize: (request) => request.headers['x-staff'] === 'yes' });
    expect((await app.inject('/admin/api/models')).statusCode).toBe(403);
    expect((await app.inject({ url: '/admin/api/models', headers: { 'x-staff': 'yes' } })).statusCode).toBe(200);
    const noHeader = await app.inject({
      method: 'POST',
      url: '/admin/api/Book',
      headers: { 'x-staff': 'yes' },
      payload: {},
    });
    expect([noHeader.statusCode, noHeader.json().error]).toEqual([
      403,
      'Writes of the admin need the header x-xufa-admin: 1',
    ]);
    const { Author } = models();
    await expect(
      xufa()
        .register(admin, { models: [Author] })
        .ready()
    ).rejects.toThrow(/needs login .* or authorize/);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { app: production } = await setUp({ authorize: 'development' });
      expect((await production.inject('/admin/api/models')).statusCode).toBe(403);
    } finally {
      process.env.NODE_ENV = previous;
    }
    const { Author: Writer } = models();
    const db = new Database({ backend: 'memory' }).register(Writer);
    await db.sync();
    const only = xufa();
    only.register(admin, { models: [[Writer, { readOnlyModel: true }]], authorize: () => true });
    expect(
      (await only.inject({ method: 'POST', url: '/api/Author', headers: WRITE, payload: { name: 'x' } })).statusCode
    ).toBe(405);
  });

  it('related lists: the objects of other models that point to one (an author and its books), in pages', async () => {
    const { app, ada, grace } = await setUp();
    const described = (await app.inject('/admin/api/models')).json().models;
    expect(described.find((model) => model.name === 'Author').related).toEqual([
      { name: 'bookSet', model: 'Book', label: 'Books', field: 'author', attname: 'authorId' },
    ]);
    expect(described.find((model) => model.name === 'Book').related).toEqual([]);
    const first = (await app.inject(`/admin/api/Author/${ada.pk}/related/bookSet`)).json();
    expect([first.count, first.page, first.size, first.results.length, first.field]).toEqual([12, 1, 10, 10, 'author']);
    expect(first.results[0]).toMatchObject({ related: { author: 'Ada' } });
    expect((await app.inject(`/admin/api/Author/${ada.pk}/related/bookSet?page=2`)).json().results).toHaveLength(2);
    expect((await app.inject(`/admin/api/Author/${grace.pk}/related/bookSet`)).json().count).toBe(0);
    // Soft-deleted books are not there, as in their list.
    await app.inject({ method: 'DELETE', url: `/admin/api/Book/${first.results[0].pk}`, headers: WRITE });
    expect((await app.inject(`/admin/api/Author/${ada.pk}/related/bookSet`)).json().count).toBe(11);
    const unknown = await app.inject(`/admin/api/Author/${ada.pk}/related/nope`);
    expect([unknown.statusCode, unknown.json().error]).toEqual([404, 'Author has no relation nope']);
    expect((await app.inject('/admin/api/Author/999/related/bookSet')).statusCode).toBe(404);
  });

  it('related lists: those of inlines (by name), none with false, and errors of the option', async () => {
    const { Author, Book } = models();
    const db = new Database({ backend: 'memory' }).register(Author, Book);
    await db.sync();
    const describe = async (inlines) => {
      const app = xufa();
      app.register(admin, { models: [Book, [Author, { inlines }]], authorize: () => true });
      await app.ready();
      return (await app.inject('/api/models')).json().models.find((model) => model.name === 'Author').related;
    };
    expect((await describe(['bookSet'])).map((item) => item.name)).toEqual(['bookSet']);
    expect(await describe(false)).toEqual([]);
    await expect(describe(['books'])).rejects.toThrow('Author has no relation books of a model of the admin (bookSet)');
    await expect(describe('bookSet')).rejects.toThrow(/inlines of Author is a list/);
    // A model out of the admin is not a related list.
    const app = xufa();
    app.register(admin, { models: [Author], authorize: () => true });
    await app.ready();
    expect((await app.inject('/api/models')).json().models[0].related).toEqual([]);
  });

  it('actions of a model on the objects selected: run on a QuerySet of them, its message, errors', async () => {
    const seen = [];
    const { app, Book } = await setUp({
      modelOptions: {
        Book: {
          actions: {
            markPublished: (books) => books.update({ published: true }),
            archive: {
              label: 'Send to the archive',
              confirm: 'Archive them?',
              danger: true,
              permission: 'Book.delete',
              run: async (books, context) => {
                seen.push([context.pks, context.model.name, await books.count()]);
                return 'Archived.';
              },
            },
            check: {
              run: () => {
                throw new AdminError('Not now');
              },
            },
          },
        },
      },
    });
    const book = (await app.inject('/admin/api/models')).json().models.find((model) => model.name === 'Book');
    expect(book.actions).toEqual([
      { name: 'markPublished', label: 'Mark published', permission: 'Book.change', confirm: null, danger: false },
      {
        name: 'archive',
        label: 'Send to the archive',
        permission: 'Book.delete',
        confirm: 'Archive them?',
        danger: true,
      },
      { name: 'check', label: 'Check', permission: 'Book.change', confirm: null, danger: false },
    ]);
    const drafts = await Book.objects.filter({ published: false }).orderBy('pk').limit(3);
    const pks = drafts.map((draft) => draft.pk);
    const run = (action, payload, headers = WRITE) =>
      app.inject({ method: 'POST', url: `/admin/api/Book/actions/${action}`, headers, payload });
    const published = await run('markPublished', { pks });
    expect(published.json()).toEqual({ message: 'Mark published: 3 objects', count: 3 });
    expect(await Book.objects.filter({ pk__in: pks, published: true }).count()).toBe(3);
    expect((await run('archive', { pks: [pks[0], 'nope'] })).json()).toEqual({ message: 'Archived.', count: 1 });
    expect(seen).toEqual([[[pks[0], 'nope'], 'Book', 1]]);
    const failed = await run('check', { pks });
    expect([failed.statusCode, failed.json().error]).toEqual([400, 'Not now']);
    expect((await run('nope', { pks })).statusCode).toBe(404);
    expect((await run('markPublished', {})).json().error).toBe('An action needs pks: the keys of the objects selected');
    expect((await run('markPublished', { pks: [{}] })).statusCode).toBe(400);
    expect((await run('markPublished', { pks: Array.from({ length: 1001 }, (_, n) => n) })).statusCode).toBe(400);
    expect((await run('markPublished', { pks }, {})).statusCode).toBe(403);
    // Soft-deleted objects are not in the QuerySet of an action.
    await Book.objects.get({ pk: pks[1] }).then((object) => object.delete());
    expect((await run('markPublished', { pks })).json().count).toBe(2);
  });

  it('actions: the errors of the option', async () => {
    const { Author } = models();
    const start = (actions) => {
      const app = xufa();
      app.register(admin, { models: [[Author, { actions }]], authorize: () => true });
      return app.ready();
    };
    await expect(start([])).rejects.toThrow(/actions of Author is/);
    await expect(start({ 'not a name': () => 0 })).rejects.toThrow('Not a name of an action of Author: not a name');
    await expect(start({ go: { label: 'Go' } })).rejects.toThrow('The action go of Author needs run(objects, context)');
  });

  it('describeModel: options of a model, and fields that are not there', () => {
    const { Book } = models();
    expect(describeModel(Book, { list: ['title'], search: [], filters: [], label: 'Books' })).toMatchObject({
      label: 'Books',
      list: ['title'],
    });
    expect(() => describeModel(Book, { list: ['nope'] })).toThrow(/has no field nope/);
  });

  it('describeModel: labels and help of fields, labels of choices, blank: false is required', () => {
    class Copy extends Model {
      static fields = {
        status: fields.string({
          choices: { a: 'Available', o: 'On loan' },
          default: 'a',
          label: 'Availability',
          help: 'Can it be borrowed?',
        }),
        shelf: fields.string({ choices: ['A', 'B'], null: true }),
        imprint: fields.string({ blank: false, default: '' }),
      };
    }
    new Database({ backend: 'memory' }).register(Copy);
    const described = Object.fromEntries(describeModel(Copy).fields.map((field) => [field.name, field]));
    expect(described.status).toMatchObject({
      label: 'Availability',
      help: 'Can it be borrowed?',
      choices: ['a', 'o'],
      choiceLabels: ['Available', 'On loan'],
    });
    expect([described.shelf.choiceLabels, described.shelf.label, described.imprint.required]).toEqual([
      null,
      null,
      true,
    ]);
  });
});

describe('admin: runs of pipelines and the health of the app', () => {
  const { Queue, Pipelines } = queueModule;

  async function setUpRuns(options = {}) {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0 });
    const pipelines = new Pipelines(queue);
    await db.sync();
    pipelines.block('double', (input) => input * 2);
    pipelines.block('boom', () => {
      throw new Error('the converter is down');
    });
    pipelines.define({
      name: 'approval',
      concurrency: 2,
      steps: [
        { id: 'first', block: 'double' },
        { id: 'approve', block: 'wait', after: 'first', waitTimeout: '1h' },
        { id: 'last', block: 'double', after: 'approve', when: 'input > 0', result: true },
      ],
    });
    pipelines.define({ name: 'broken', steps: [{ id: 'only', block: 'boom', attempts: 1 }] });
    const app = xufa();
    app.register(xufa.health, { cache: 0, checks: { database: db.health(), queue: queue.health() } });
    app.register(admin, { prefix: '/admin', models: [], authorize: () => true, pipelines, ...options });
    await app.ready();
    return { app, db, queue, pipelines };
  }

  it('lists the runs (by status and pipeline), and gives a run with its graph and steps', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    const waiting = await pipelines.start('approval', 21);
    await pipelines.start('broken');
    await queue.runDue();
    const models = (await app.inject('/admin/api/models')).json();
    expect([models.runs, models.health]).toEqual([true, true]);
    const list = (await app.inject('/admin/api/_runs')).json();
    expect(list.count).toBe(2);
    expect(list.counts).toEqual({ running: 1, done: 0, failed: 1, cancelled: 0 });
    expect(list.pipelines).toEqual(['approval', 'broken']);
    expect(list.results.map((run) => [run.pipeline, run.status])).toEqual([
      ['broken', 'failed'],
      ['approval', 'running'],
    ]);
    expect((await app.inject('/admin/api/_runs?status=failed')).json().results[0].error).toBe(
      'The step only failed: the converter is down'
    );
    expect((await app.inject('/admin/api/_runs?pipeline=approval')).json().count).toBe(1);
    expect((await app.inject('/admin/api/_runs?status=nope')).statusCode).toBe(400);
    const run = (await app.inject(`/admin/api/_runs/${waiting.pk}`)).json();
    expect(run).toMatchObject({ pipeline: 'approval', status: 'running', input: 21, inFlight: 0 });
    const at = (column) => ({ column, row: 0 });
    expect(run.graph).toEqual({
      concurrency: 2,
      columns: 3,
      rows: 1,
      edges: [
        { from: 'first', to: 'approve', points: [] },
        { from: 'approve', to: 'last', points: [] },
      ],
      steps: [
        { id: 'first', block: 'double', after: [], when: null, result: false, waitTimeout: null, at: at(0) },
        { id: 'approve', block: 'wait', after: ['first'], when: null, result: false, waitTimeout: '1h', at: at(1) },
        {
          id: 'last',
          block: 'double',
          after: ['approve'],
          when: 'input > 0',
          result: true,
          waitTimeout: null,
          at: at(2),
        },
      ],
    });
    expect(run.steps.first).toMatchObject({ status: 'done', output: 42, attempts: 1 });
    expect(run.steps.approve.status).toBe('paused');
    expect(Date.parse(run.steps.approve.pausedUntil) - Date.now()).toBeGreaterThan(59 * 60000);
    expect((await app.inject('/admin/api/_runs/999')).statusCode).toBe(404);
  });

  it('resume, cancel and retry: with the header of the admin, and errors that say why', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    const run = await pipelines.start('approval', 1);
    const broken = await pipelines.start('broken');
    await queue.runDue();
    const post = (url, body) =>
      app.inject({ method: 'POST', url: `/admin/api/_runs/${url}`, headers: WRITE, payload: body || {} });
    expect((await app.inject({ method: 'POST', url: `/admin/api/_runs/${run.pk}/cancel` })).statusCode).toBe(403);
    expect((await post(`${run.pk}/steps/first/resume`)).json().error).toMatch(/is done, not paused/);
    expect((await post(`${run.pk}/steps/approve/resume`, { output: 5 })).json()).toEqual({ ok: true });
    await queue.runDue();
    const done = (await app.inject(`/admin/api/_runs/${run.pk}`)).json();
    expect([done.status, done.result, done.steps.approve.output]).toEqual(['done', 10, 5]);
    expect((await post(`${run.pk}/cancel`)).statusCode).toBe(409);
    expect((await post(`${broken.pk}/retry`)).json()).toEqual({ ok: true });
    expect((await app.inject(`/admin/api/_runs/${broken.pk}`)).json().status).toBe('running');
    expect((await post(`${broken.pk}/cancel`)).json()).toEqual({ ok: true });
    expect((await app.inject(`/admin/api/_runs/${broken.pk}`)).json().status).toBe('cancelled');
    expect((await post(`${broken.pk}/retry`)).json()).toEqual({ ok: true });
    expect((await post('999/retry')).statusCode).toBe(404);
  });

  it('starts a run: its input, now or later, its priority and key; errors by field; the pipelines to choose', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    const start = (body, headers = WRITE) =>
      app.inject({ method: 'POST', url: '/admin/api/_runs', headers, payload: body });
    const defined = (await app.inject('/admin/api/_runs/pipelines')).json().results;
    expect(defined).toMatchObject([
      { name: 'approval', trigger: null, steps: ['first', 'approve', 'last'] },
      { name: 'broken', trigger: null, steps: ['only'] },
    ]);
    // Their graph, as a run's, for the form that starts one.
    expect(defined[0].graph).toMatchObject({ concurrency: 2, columns: 3, rows: 1 });
    expect(defined[0].graph.steps.map((step) => [step.id, step.block, step.at])).toEqual([
      ['first', 'double', { column: 0, row: 0 }],
      ['approve', 'wait', { column: 1, row: 0 }],
      ['last', 'double', { column: 2, row: 0 }],
    ]);
    expect((await start({ pipeline: 'approval', input: 21 }, {})).statusCode).toBe(403);

    const now = await start({ pipeline: 'approval', input: 21, priority: '5' });
    expect(now.statusCode).toBe(201);
    expect(now.json()).toMatchObject({ pipeline: 'approval', status: 'running', priority: 5, existing: false });
    await queue.runDue();
    const run = (await app.inject(`/admin/api/_runs/${now.json().id}`)).json();
    expect([run.input, run.steps.first.output]).toEqual([21, 42]);

    // Later: in some time, or at a date.
    const later = (await start({ pipeline: 'broken', delay: '1h30m' })).json();
    expect(Date.parse(later.runAt) - Date.now()).toBeGreaterThan(89 * 60000);
    const at = new Date(Date.now() + 86400000).toISOString();
    expect((await start({ pipeline: 'broken', at })).json().runAt).toBe(at);

    // A key: the run of that key still running is given back.
    const keyed = await start({ pipeline: 'approval', input: 1, key: 'report-7' });
    const again = await start({ pipeline: 'approval', input: 2, key: 'report-7' });
    expect([keyed.statusCode, again.statusCode, again.json().existing]).toEqual([201, 200, true]);
    expect(again.json().id).toBe(keyed.json().id);

    // Errors by field.
    const errorsOf = async (body) => (await start(body)).json().errors;
    expect(await errorsOf({})).toEqual({ pipeline: ['Choose a pipeline'] });
    expect(await errorsOf({ pipeline: 'nope' })).toEqual({ pipeline: ['No pipeline named nope'] });
    expect(await errorsOf({ pipeline: 'broken', delay: 'soon' })).toEqual({
      delay: ['A time as 30s, 10m, 2h or 1h30m'],
    });
    expect(await errorsOf({ pipeline: 'broken', delay: '10m', at })).toEqual({
      at: ['Start in some time, or at a date: not both'],
    });
    expect(await errorsOf({ pipeline: 'broken', at: 'tomorrow' })).toEqual({ at: ['Not a date'] });
    expect(await errorsOf({ pipeline: 'broken', priority: 1.5 })).toEqual({ priority: ['A whole number'] });
    expect(await errorsOf({ pipeline: 'broken', key: 'k'.repeat(201) })).toEqual({
      key: ['Text of 200 characters at most'],
    });
    expect((await start({ pipeline: 'broken', delay: '' })).statusCode).toBe(201);
    expect(await pipelines.runs.count()).toBe(5);
  });

  it('schedules: the jobs of the scheduler, those that start runs with their last run; run now; runs by trigger', async () => {
    const { Scheduler } = schedulerModule;
    const scheduler = new Scheduler();
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0 });
    const pipelines = new Pipelines(queue);
    await db.sync();
    pipelines.task('nightly-export', (input) => ({ rows: input.rows }), { attempts: 1 });
    pipelines.schedule(scheduler, 'nightly-export', { cron: '0 2 * * *', timezone: 'UTC', input: { rows: 3 } });
    let cleaned = 0;
    scheduler.add({
      name: 'cleanup',
      every: '10m',
      run: () => {
        cleaned += 1;
      },
    });
    const app = xufa();
    app.register(admin, { prefix: '/admin', models: [], authorize: () => true, pipelines, queue, scheduler });
    await app.ready();
    const post = (url) => app.inject({ method: 'POST', url: `/admin/api/_runs/${url}`, headers: WRITE, payload: {} });

    expect((await app.inject('/admin/api/models')).json().schedules).toBe(true);
    const listed = (await app.inject('/admin/api/_runs/schedules')).json().results;
    expect(listed.map((item) => [item.name, item.schedule, item.pipeline, item.pipelineRuns])).toEqual(
      expect.arrayContaining([
        ['nightly-export', 'cron 0 2 * * * (UTC)', 'nightly-export', 0],
        ['cleanup', 'every 10m', null, null],
      ])
    );
    // Not started: no next time yet.
    expect(listed.find((item) => item.name === 'cleanup').next).toBe(null);

    // Run now: a run of the pipeline (marked by its trigger), or a job that runs on.
    const started = (await post('schedules/nightly-export/run')).json();
    expect(started).toEqual({ ok: true, run: expect.any(String) });
    const other = await post('schedules/cleanup/run');
    expect([other.statusCode, other.json()]).toEqual([202, { ok: true, run: null }]);
    await queue.runDue();
    expect(cleaned).toBe(1);
    const after = (await app.inject('/admin/api/_runs/schedules')).json().results;
    const nightly = after.find((item) => item.name === 'nightly-export');
    expect([nightly.pipelineRuns, String(nightly.lastPipelineRun.id), nightly.lastPipelineRun.status]).toEqual([
      1,
      started.run,
      'done',
    ]);
    const byTrigger = (await app.inject('/admin/api/_runs?trigger=schedule:nightly-export')).json();
    expect(byTrigger.results.map((run) => [String(run.id), run.trigger])).toEqual([
      [started.run, 'schedule:nightly-export'],
    ]);
    expect((await post('schedules/nope/run')).json().error).toBe('No schedule nope');
    // Without the header of writes: refused.
    expect((await app.inject({ method: 'POST', url: '/admin/api/_runs/schedules/cleanup/run' })).statusCode).toBe(403);
    await scheduler.stop();
  });

  it('a run of a step of another run: the step links to it, and it to its parent', async () => {
    const { app, queue, pipelines } = await setUpRuns();
    pipelines.define({ name: 'outer', steps: [{ id: 'sub', block: 'pipeline', config: { pipeline: 'approval' } }] });
    const outer = await pipelines.start('outer', 3);
    await queue.runDue();
    const parent = (await app.inject(`/admin/api/_runs/${outer.pk}`)).json();
    expect(parent.steps.sub.status).toBe('paused');
    const childId = parent.steps.sub.child;
    const child = (await app.inject(`/admin/api/_runs/${childId}`)).json();
    expect(child).toMatchObject({ pipeline: 'approval', parentStep: 'sub', depth: 1, input: 3 });
    expect(String(child.parent)).toBe(String(outer.pk));
    // The step shows how far its run is: first done, approve paused, last waiting.
    expect(parent.steps.sub.childProgress).toEqual({ status: 'running', done: 1, failed: 0, total: 3 });
    expect(child.steps.first.childProgress).toBe(null);
    // Where the graph draws the steps, and its arrows.
    expect(child.graph).toMatchObject({ columns: 3, rows: 1 });
    expect(child.graph.steps.map((step) => step.at)).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
    ]);
    expect(child.graph.edges).toEqual([
      { from: 'first', to: 'approve', points: [] },
      { from: 'approve', to: 'last', points: [] },
    ]);
    await pipelines.resume(childId, 'approve', 5);
    for (let i = 0; i < 4; i += 1) await queue.runDue();
    const after = (await app.inject(`/admin/api/_runs/${outer.pk}`)).json();
    expect(after.steps.sub.childProgress).toEqual({ status: 'done', done: 3, failed: 0, total: 3 });
  });

  it('the health of the app: its report, as GET /health gives it; none without xufa.health', async () => {
    const { app, db } = await setUpRuns();
    const report = (await app.inject('/admin/api/_health')).json();
    expect(report.status).toBe('up');
    expect(Object.keys(report.checks)).toEqual(['database', 'queue']);
    db.backend.ping = async () => {
      throw new Error('the database is gone');
    };
    expect((await app.inject('/admin/api/_health')).json()).toMatchObject({
      status: 'down',
      checks: { database: { status: 'down', error: 'the database is gone' } },
    });
    const plain = xufa();
    plain.register(admin, { prefix: '/admin', models: [], authorize: () => true });
    expect((await plain.inject('/admin/api/models')).json()).toMatchObject({ runs: false, health: false });
    expect((await plain.inject('/admin/api/_health')).statusCode).toBe(404);
    expect((await plain.inject('/admin/api/_runs')).statusCode).toBe(404);
    // authorize() asks for these too.
    const closed = await setUpRuns({ authorize: () => false });
    expect((await closed.app.inject('/admin/api/_runs')).statusCode).toBe(403);
    expect((await closed.app.inject('/admin/api/_health')).statusCode).toBe(403);
  });
});

describe('admin: its login (@xufa/auth and @xufa/session)', () => {
  const auth = authModule;
  const { sessionPlugin } = sessionModule;
  const PASSWORDS = { ln: 4 }; // light scrypt for tests (the default is 2^17)

  async function setUpLogin(options = {}) {
    class User extends Model {
      static fields = {
        email: fields.string({ unique: true }),
        password: fields.string(),
        role: fields.string({ default: 'user' }),
        totpSecret: fields.string({ null: true }),
        totpStep: fields.integer({ null: true }),
        recoveryCodes: fields.json({ default: () => [] }),
      };
    }
    const { Author } = models();
    const db = new Database({ backend: 'memory' }).register(User, Author);
    await db.sync();
    const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
    const secret = auth.generateSecret();
    await User.objects.create({ email: 'ada@example.com', password: hash, role: 'staff' });
    await User.objects.create({ email: 'bob@example.com', password: hash, role: 'user' });
    await User.objects.create({ email: 'tom@example.com', password: hash, role: 'staff', totpSecret: secret });
    const app = xufa();
    if (options.session !== false) {
      app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    }
    app.register(admin, {
      prefix: '/admin',
      models: [Author],
      login: {
        findUser: (email) => User.objects.filter({ email: email.toLowerCase() }).first(),
        allow: (user) => user.role === 'staff',
        name: (user) => user.email,
        totp: (user) => user.totpSecret,
        lastTotpStep: (user) => user.totpStep,
        onTotp: (user, step) => User.objects.filter({ pk: user.pk }).update({ totpStep: step }),
        passwordOptions: PASSWORDS,
        lockout: { maxAttempts: 3 },
        ...(options.reload || options.account ? { reload: (id) => User.objects.filter({ pk: id }).first() } : {}),
        ...(options.account
          ? {
              setPassword: (user, hash) => User.objects.filter({ pk: user.pk }).update({ password: hash }),
              setTotp: (user, secret) =>
                User.objects.filter({ pk: user.pk }).update({ totpSecret: secret, totpStep: null }),
              recoveryCodes: (user) => user.recoveryCodes,
              setRecoveryCodes: (user, hashes) =>
                User.objects.filter({ pk: user.pk }).update({ recoveryCodes: hashes }),
            }
          : {}),
      },
      ...(options.authorize ? { authorize: options.authorize } : {}),
    });
    await app.ready();
    const csrfOf = (html) => /name="csrf-token" content="([^"]*)"/.exec(html)[1];
    // A browser: its cookie, and the CSRF token of its session.
    const browser = () => {
      let cookie = '';
      const send = async (request) => {
        const res = await app.inject({ ...request, headers: { cookie, ...request.headers } });
        const set = res.headers['set-cookie'];
        if (set) cookie = [].concat(set)[0].split(';')[0];
        return res;
      };
      const loginAs = async (username, password, code) => {
        const page = await send({ url: '/admin/login' });
        return send({
          method: 'POST',
          url: '/admin/login',
          headers: { ...WRITE, 'x-csrf-token': csrfOf(page.body) },
          payload: { username, password, ...(code ? { code } : {}) },
        });
      };
      return { send, loginAs, cookieOf: () => cookie };
    };
    return { app, User, secret, browser, ...browser() };
  }

  it('sessions: those of the user (device, address, last seen), each ended; those of another user', async () => {
    const { browser, User, secret } = await setUpLogin();
    const [laptop, phone, colleague] = [browser(), browser(), browser()];
    const agent = (name) => ({ 'user-agent': name });
    await laptop.send({ url: '/admin/login', headers: agent('Mozilla/5.0 (Windows NT 10.0) Chrome/140.0') });
    await laptop.loginAs('ada@example.com', 'right-horse-battery');
    await phone.loginAs('ada@example.com', 'right-horse-battery');
    await colleague.loginAs('tom@example.com', 'right-horse-battery', auth.totp(secret));
    const meta = (await laptop.send({ url: '/admin/api/models' })).json();
    expect(meta.sessions).toEqual({ others: true, end: true });
    const write = async (who, url) =>
      who.send({
        method: 'POST',
        url,
        headers: { ...WRITE, 'x-csrf-token': (await who.send({ url: '/admin/api/models' })).json().csrf },
        payload: {},
      });

    const mine = (await laptop.send({ url: '/admin/api/_account/sessions' })).json().results;
    expect(mine).toHaveLength(2);
    expect(mine.filter((item) => item.current)).toHaveLength(1);
    expect(Object.keys(mine[0]).sort()).toEqual(['agent', 'current', 'expiresAt', 'handle', 'ip', 'seen', 'since']);
    const current = mine.find((item) => item.current);
    const other = mine.find((item) => !item.current);
    // This one is ended by logging out; the phone by the laptop.
    const refused = await write(laptop, `/admin/api/_account/sessions/${current.handle}/end`);
    expect([refused.statusCode, refused.json().error]).toEqual([
      400,
      'This is the session you are using: log out to end it',
    ]);
    expect((await write(laptop, `/admin/api/_account/sessions/${other.handle}/end`)).json()).toEqual({ ended: true });
    expect((await phone.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    expect((await laptop.send({ url: '/admin/api/models' })).statusCode).toBe(200);
    expect((await write(laptop, `/admin/api/_account/sessions/${other.handle}/end`)).statusCode).toBe(404);

    // Those of another user (by its id): listed, one ended, or all.
    const tom = await User.objects.get({ email: 'tom@example.com' });
    const toms = (await laptop.send({ url: `/admin/api/_sessions/${tom.pk}` })).json();
    expect([toms.user, toms.results.length, toms.results[0].current]).toEqual([String(tom.pk), 1, false]);
    expect((await write(laptop, `/admin/api/_sessions/${tom.pk}/end`)).json()).toEqual({ ended: true });
    expect((await colleague.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    expect((await laptop.send({ url: `/admin/api/_sessions/${tom.pk}` })).json().results).toEqual([]);
    // Without a session: 401.
    expect((await browser().send({ url: '/admin/api/_account/sessions' })).statusCode).toBe(401);
  });

  it('logging out everywhere, or of the other sessions: every browser of the user, through the store', async () => {
    const { browser } = await setUpLogin();
    const [laptop, phone, colleague] = [browser(), browser(), browser()];
    await laptop.loginAs('ada@example.com', 'right-horse-battery');
    await phone.loginAs('ada@example.com', 'right-horse-battery');
    await colleague.loginAs('tom@example.com', 'right-horse-battery').then(() => null);
    const models = async (who) => who.send({ url: '/admin/api/models' });
    const csrf = async (who) => (await models(who)).json().csrf;
    expect((await models(laptop)).statusCode).toBe(200);
    expect((await models(phone)).statusCode).toBe(200);

    // The others of the laptop: the phone is logged out; the laptop goes on with a new CSRF token.
    const others = await laptop.send({
      method: 'POST',
      url: '/admin/logout',
      headers: { ...WRITE, 'x-csrf-token': await csrf(laptop) },
      payload: { others: true },
    });
    expect(others.statusCode).toBe(200);
    expect((await models(phone)).statusCode).toBe(401);
    const laptopNow = await models(laptop);
    expect([laptopNow.statusCode, laptopNow.json().csrf]).toEqual([200, others.json().csrf]);

    // Back on the phone, then everywhere from it: the laptop too.
    await phone.loginAs('ada@example.com', 'right-horse-battery');
    expect((await models(phone)).statusCode).toBe(200);
    const everywhere = await phone.send({
      method: 'POST',
      url: '/admin/logout',
      headers: { ...WRITE, 'x-csrf-token': await csrf(phone) },
      payload: { everywhere: true },
    });
    expect(everywhere.statusCode).toBe(200);
    expect((await models(phone)).statusCode).toBe(401);
    expect((await models(laptop)).statusCode).toBe(401);

    // Without a user, nothing to log out everywhere.
    const stranger = browser();
    const page = await stranger.send({ url: '/admin/login' });
    const token = /name="csrf-token" content="([^"]*)"/.exec(page.body)[1];
    const refused = await stranger.send({
      method: 'POST',
      url: '/admin/logout',
      headers: { ...WRITE, 'x-csrf-token': token },
      payload: { everywhere: true },
    });
    expect(refused.statusCode).toBe(401);
  });

  it('without a user: the page goes to the login page, the API answers 401', async () => {
    const { send } = await setUpLogin();
    const page = await send({ url: '/admin/' });
    expect([page.statusCode, page.headers.location]).toEqual([302, '/admin/login']);
    // Without the slash too (a relative 'login' would be /login there).
    expect((await send({ url: '/admin' })).headers.location).toBe('/admin/login');
    expect((await send({ url: '/admin/api/models' })).json()).toMatchObject({ login: true });
    expect((await send({ url: '/admin/api/models' })).statusCode).toBe(401);
    const login = await send({ url: '/admin/login' });
    expect(login.statusCode).toBe(200);
    expect(login.body).toContain('data-view="login"');
    expect(login.body).toMatch(/name="csrf-token" content="[^"]+"/);
  });

  it('wrong users, passwords and users not allowed get the same answer; the header and the CSRF token are needed', async () => {
    const { send, loginAs } = await setUpLogin();
    expect((await send({ method: 'POST', url: '/admin/login', payload: {} })).statusCode).toBe(403);
    for (const [user, password] of [
      ['ada@example.com', 'wrong'],
      ['nobody@example.com', 'right-horse-battery'],
      ['bob@example.com', 'right-horse-battery'],
    ]) {
      const res = await loginAs(user, password);
      expect([res.statusCode, res.json().error]).toEqual([401, 'Wrong user or password']);
    }
    // The session asks for its CSRF token (csrf: true).
    await send({ url: '/admin/login' });
    const forged = await send({
      method: 'POST',
      url: '/admin/login',
      headers: WRITE,
      payload: { username: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect(forged.statusCode).toBe(403);
  });

  it('logs in (a new session id), works with the token of the session, and logs out', async () => {
    const { send, loginAs, cookieOf } = await setUpLogin();
    await send({ url: '/admin/login' });
    const before = cookieOf();
    const res = await loginAs('ADA@example.com', 'right-horse-battery');
    expect(res.json()).toEqual({ ok: true, user: { name: 'ada@example.com' } });
    expect(cookieOf()).not.toBe(before);
    const models = (await send({ url: '/admin/api/models' })).json();
    expect(models.user).toEqual({ name: 'ada@example.com' });
    expect((await send({ url: '/admin/' })).statusCode).toBe(200);
    expect((await send({ url: '/admin/login' })).headers.location).toBe('./');
    const create = (headers) => send({ method: 'POST', url: '/admin/api/Author', headers, payload: { name: 'Mary' } });
    expect((await create(WRITE)).statusCode).toBe(403);
    expect((await create({ ...WRITE, 'x-csrf-token': models.csrf })).statusCode).toBe(201);
    expect(
      (await send({ method: 'POST', url: '/admin/logout', headers: { ...WRITE, 'x-csrf-token': models.csrf } })).json()
    ).toEqual({ ok: true });
    expect((await send({ url: '/admin/api/models' })).statusCode).toBe(401);
  });

  it('the code of an authenticator app: asked for after the password, each code once', async () => {
    const { loginAs, secret, send } = await setUpLogin();
    const asked = await loginAs('tom@example.com', 'right-horse-battery');
    expect([asked.statusCode, asked.json()]).toEqual([
      401,
      { error: 'The code of your authenticator app', errors: {}, code: true },
    ]);
    expect((await loginAs('tom@example.com', 'right-horse-battery', '000000')).json().error).toBe('Wrong code');
    const code = auth.totp(secret);
    expect((await loginAs('tom@example.com', 'right-horse-battery', code)).json().ok).toBe(true);
    // Logged out, the same code does not log in again.
    const { csrf } = (await send({ url: '/admin/api/models' })).json();
    await send({ method: 'POST', url: '/admin/logout', headers: { ...WRITE, 'x-csrf-token': csrf } });
    expect((await loginAs('tom@example.com', 'right-horse-battery', code)).json().error).toBe('Wrong code');
  });

  it('too many failures lock the user out (429 with Retry-After), even with the right password', async () => {
    const { loginAs } = await setUpLogin();
    for (let i = 0; i < 3; i += 1) await loginAs('ada@example.com', 'wrong');
    const locked = await loginAs('ada@example.com', 'right-horse-battery');
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    // Another user from the same address is not locked by those (its address takes 20).
    expect((await loginAs('tom@example.com', 'right-horse-battery')).json().code).toBe(true);
  });

  it('reload(): a user deleted, or not allowed any more, is logged out at once; without it, it stays', async () => {
    const reloaded = await setUpLogin({ reload: true });
    await reloaded.loginAs('ada@example.com', 'right-horse-battery');
    expect((await reloaded.send({ url: '/admin/api/models' })).json().user).toEqual({ name: 'ada@example.com' });
    await reloaded.User.objects.filter({ email: 'ada@example.com' }).update({ role: 'user' });
    expect((await reloaded.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    expect((await reloaded.send({ url: '/admin/' })).headers.location).toBe('/admin/login');
    // Allowed again, it logs in again: the session forgot it.
    await reloaded.User.objects.filter({ email: 'ada@example.com' }).update({ role: 'staff' });
    expect((await reloaded.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    await reloaded.loginAs('ada@example.com', 'right-horse-battery');
    expect((await reloaded.send({ url: '/admin/api/models' })).statusCode).toBe(200);
    await reloaded.User.objects.filter({ email: 'ada@example.com' }).delete();
    expect((await reloaded.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    // Without reload, the session is trusted until it ends.
    const kept = await setUpLogin();
    await kept.loginAs('ada@example.com', 'right-horse-battery');
    await kept.User.objects.filter({ email: 'ada@example.com' }).update({ role: 'user' });
    expect((await kept.send({ url: '/admin/api/models' })).statusCode).toBe(200);
  });

  it('the account: changes the password (the other sessions end), sets up an app with a QR code, recovery codes', async () => {
    const { browser, User } = await setUpLogin({ account: true });
    const [laptop, phone] = [browser(), browser()];
    await laptop.loginAs('ada@example.com', 'right-horse-battery');
    await phone.loginAs('ada@example.com', 'right-horse-battery');
    expect((await laptop.send({ url: '/admin/api/models' })).json().account).toBe(true);
    const write = async (who, path, payload) =>
      who.send({
        method: 'POST',
        url: `/admin/api/_account${path}`,
        headers: { ...WRITE, 'x-csrf-token': (await who.send({ url: '/admin/api/models' })).json().csrf },
        payload,
      });
    const state = (await laptop.send({ url: '/admin/api/_account' })).json();
    expect(state).toEqual({
      name: 'ada@example.com',
      password: true,
      totp: { can: true, enabled: false },
      recovery: { left: 0 },
    });

    // The password: the current one is needed, the new one checked; the other sessions end.
    const wrong = await write(laptop, '/password', { current: 'nope', password: 'a-new-long-password' });
    expect([wrong.statusCode, wrong.json().errors]).toEqual([400, { current: ['Not your password'] }]);
    const short = await write(laptop, '/password', { current: 'right-horse-battery', password: 'short' });
    expect([short.statusCode, short.json().errors]).toEqual([400, { password: ['At least 10 characters'] }]);
    const changed = await write(laptop, '/password', {
      current: 'right-horse-battery',
      password: 'a-new-long-password',
    });
    expect([changed.statusCode, typeof changed.json().csrf]).toEqual([200, 'string']);
    expect((await phone.send({ url: '/admin/api/models' })).statusCode).toBe(401);
    expect((await laptop.send({ url: '/admin/api/models' })).statusCode).toBe(200);
    expect((await browser().loginAs('ada@example.com', 'right-horse-battery')).statusCode).toBe(401);

    // An app: the password, then a QR code; its first code confirms it, and gives recovery codes once.
    expect((await write(laptop, '/totp/start', { password: 'right-horse-battery' })).statusCode).toBe(400);
    const started = (await write(laptop, '/totp/start', { password: 'a-new-long-password' })).json();
    expect(started.uri).toMatch(/^otpauth:\/\/totp\/Admin:ada%40example\.com\?secret=/);
    expect(started.svg).toMatch(/^<svg/);
    expect((await User.objects.get({ email: 'ada@example.com' })).totpSecret).toBe(null);
    expect((await write(laptop, '/totp/confirm', { code: '000000' })).json().errors).toEqual({ code: ['Wrong code'] });
    const { recoveryCodes } = (await write(laptop, '/totp/confirm', { code: auth.totp(started.secret) })).json();
    expect(recoveryCodes).toHaveLength(10);
    expect((await User.objects.get({ email: 'ada@example.com' })).totpSecret).toBe(started.secret);
    expect((await laptop.send({ url: '/admin/api/_account' })).json().totp).toEqual({ can: true, enabled: true });
    expect((await write(laptop, '/totp/confirm', { code: auth.totp(started.secret) })).statusCode).toBe(400);

    // The login asks for a code now: a recovery code works once.
    const other = browser();
    expect((await other.loginAs('ada@example.com', 'a-new-long-password')).json()).toMatchObject({
      code: true,
      recovery: true,
    });
    expect(
      (await other.loginAs('ada@example.com', 'a-new-long-password', recoveryCodes[0].toUpperCase())).statusCode
    ).toBe(200);
    expect((await browser().loginAs('ada@example.com', 'a-new-long-password', recoveryCodes[0])).statusCode).toBe(401);
    expect((await laptop.send({ url: '/admin/api/_account' })).json().recovery).toEqual({ left: 9 });
    // New codes replace the old ones; removing the app drops them.
    const renewed = (await write(laptop, '/recovery', { password: 'a-new-long-password' })).json().recoveryCodes;
    expect(renewed).toHaveLength(10);
    expect((await browser().loginAs('ada@example.com', 'a-new-long-password', recoveryCodes[1])).statusCode).toBe(401);
    expect((await write(laptop, '/totp/disable', { password: 'a-new-long-password' })).json()).toEqual({ ok: true });
    expect((await laptop.send({ url: '/admin/api/_account' })).json()).toMatchObject({
      totp: { enabled: false },
      recovery: { left: 0 },
    });
    expect((await browser().loginAs('ada@example.com', 'a-new-long-password')).statusCode).toBe(200);
    // Without a session: 401; without reload there is no account page.
    expect((await browser().send({ url: '/admin/api/_account' })).statusCode).toBe(401);
    const plain = await setUpLogin();
    await plain.loginAs('ada@example.com', 'right-horse-battery');
    expect((await plain.send({ url: '/admin/api/models' })).json().account).toBe(false);
    expect((await plain.send({ url: '/admin/api/_account' })).statusCode).toBe(404);
  });

  it('login: { model }: the staff of a model of users (AbstractUser) log in by username; the last login is set', async () => {
    class Staff extends auth.AbstractUser(Model, fields, { passwordOptions: PASSWORDS }) {
      static options = { table: 'admin_model_staff' };
    }
    const db = new Database({ backend: 'memory' }).register(Staff);
    await db.sync();
    await Staff.createUser({ username: 'ada', password: 'right-horse-battery', isStaff: true });
    await Staff.createUser({ username: 'bob', password: 'right-horse-battery' });
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(admin, { prefix: '/admin', models: [Staff], login: { model: Staff, passwordOptions: PASSWORDS } });
    await app.ready();
    const loginAs = async (username) => {
      const page = await app.inject('/admin/login');
      const cookie = [].concat(page.headers['set-cookie'])[0].split(';')[0];
      const csrf = /name="csrf-token" content="([^"]*)"/.exec(page.body)[1];
      const res = await app.inject({
        method: 'POST',
        url: '/admin/login',
        headers: { cookie, ...WRITE, 'x-csrf-token': csrf },
        payload: { username, password: 'right-horse-battery' },
      });
      return {
        res,
        cookie: res.headers['set-cookie'] ? [].concat(res.headers['set-cookie'])[0].split(';')[0] : cookie,
      };
    };
    const ada = await loginAs('ada');
    expect(ada.res.statusCode).toBe(200);
    expect((await Staff.objects.get({ username: 'ada' })).lastLogin).toBeInstanceOf(Date);
    // The account page: the user is read again (reload of the model).
    expect((await app.inject({ url: '/admin/api/models', headers: { cookie: ada.cookie } })).json().account).toBe(true);
    // Not staff: the answer of a wrong password.
    expect((await loginAs('bob')).res.statusCode).toBe(401);
    await app.close();
  });

  it('login: { model } with groups: what a user may is read again at each request (a group taken away)', async () => {
    class StaffGroup extends auth.AbstractGroup(Model, fields) {
      static options = { table: 'admin_groups_group' };
    }
    class Member extends auth.AbstractUser(Model, fields, { passwordOptions: PASSWORDS, groups: () => StaffGroup }) {
      static options = { table: 'admin_groups_member' };
    }
    const db = new Database({ backend: 'memory' }).register(StaffGroup, Member);
    await db.sync();
    const editors = await StaffGroup.objects.create({ name: 'editors', permissions: ['Member.view'] });
    const ada = await Member.createUser({ username: 'ada', password: 'right-horse-battery', isStaff: true });
    await ada.groups.set([editors.pk]);
    const rbac = new auth.Rbac({ model: StaffGroup });
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(admin, {
      prefix: '/admin',
      models: [Member],
      login: { model: Member, passwordOptions: PASSWORDS },
      rbac,
    });
    await app.ready();
    const page = await app.inject('/admin/login');
    let cookie = [].concat(page.headers['set-cookie'])[0].split(';')[0];
    const csrf = /name="csrf-token" content="([^"]*)"/.exec(page.body)[1];
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: { cookie, ...WRITE, 'x-csrf-token': csrf },
      payload: { username: 'ada', password: 'right-horse-battery' },
    });
    expect(res.statusCode).toBe(200);
    if (res.headers['set-cookie']) cookie = [].concat(res.headers['set-cookie'])[0].split(';')[0];
    expect((await app.inject({ url: '/admin/api/Member', headers: { cookie } })).statusCode).toBe(200);
    await ada.groups.set([]);
    expect((await app.inject({ url: '/admin/api/Member', headers: { cookie } })).statusCode).toBe(403);
    await app.close();
  });

  it('the pickers of permissions and roles: the fields of users and groups, and what they offer', async () => {
    class PickGroup extends auth.AbstractGroup(Model, fields) {
      static options = { table: 'admin_pick_group' };
    }
    class PickUser extends auth.AbstractUser(Model, fields, { passwordOptions: PASSWORDS, groups: () => PickGroup }) {
      static options = { table: 'admin_pick_user', permissions: { unlock: 'Can unlock a user' } };
    }
    const db = new Database({ backend: 'memory' }).register(PickGroup, PickUser);
    await db.sync();
    await PickGroup.objects.create({ name: 'editors', permissions: ['PickUser.view'] });
    await PickUser.createUser({ username: 'root', password: 'right-horse-battery', isStaff: true, isSuperuser: true });
    const rbac = new auth.Rbac({ roles: { viewer: ['*.view'] }, model: PickGroup });
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(admin, {
      prefix: '/admin',
      models: [PickUser, PickGroup],
      login: { model: PickUser, passwordOptions: PASSWORDS },
      rbac,
    });
    await app.ready();
    const page = await app.inject('/admin/login');
    let cookie = [].concat(page.headers['set-cookie'])[0].split(';')[0];
    const csrf = /name="csrf-token" content="([^"]*)"/.exec(page.body)[1];
    const res = await app.inject({
      method: 'POST',
      url: '/admin/login',
      headers: { cookie, ...WRITE, 'x-csrf-token': csrf },
      payload: { username: 'root', password: 'right-horse-battery' },
    });
    expect(res.statusCode).toBe(200);
    if (res.headers['set-cookie']) cookie = [].concat(res.headers['set-cookie'])[0].split(';')[0];
    const { models } = (await app.inject({ url: '/admin/api/models', headers: { cookie } })).json();
    const inputOf = (model, name) =>
      models.find((item) => item.name === model).fields.find((field) => field.name === name).input;
    expect(inputOf('PickUser', 'permissions')).toBe('permissions');
    expect(inputOf('PickGroup', 'permissions')).toBe('permissions');
    expect(inputOf('PickGroup', 'inherits')).toBe('roles');
    const offered = (await app.inject({ url: '/admin/api/_permissions', headers: { cookie } })).json();
    expect(offered.permissions.slice(0, 2)).toEqual([
      { name: '*', kind: 'all' },
      { name: '*.view', kind: 'viewAll' },
    ]);
    const names = offered.permissions.map((item) => item.name);
    expect(names).toEqual(
      expect.arrayContaining(['PickUser.*', 'PickUser.add', 'PickUser.view', 'PickUser.unlock', 'PickGroup.delete'])
    );
    // Of the admin's own pages, the data model and the sessions here (no queue, runs nor health).
    expect(names.filter((name) => name.startsWith('_'))).toEqual([
      '_schema.view',
      '_sessions.view',
      '_sessions.change',
    ]);
    expect(offered.permissions.find((item) => item.name === 'PickUser.unlock')).toEqual({
      name: 'PickUser.unlock',
      kind: 'one',
      model: 'Pick users',
      label: 'Can unlock a user',
    });
    // The roles: those of the code and the groups of the database.
    expect(offered.roles).toEqual(['editors', 'viewer']);
    await app.close();
  });

  it('needs @xufa/session; authorize() is asked after the login, with request.adminUser', async () => {
    const without = await setUpLogin({ session: false });
    const res = await without.send({ url: '/admin/api/models' });
    expect([res.statusCode, res.json().error]).toEqual([
      500,
      'The login of the admin needs @xufa/session (registered before the admin)',
    ]);
    const seen = [];
    const strict = await setUpLogin({
      authorize: (request) => {
        seen.push(request.adminUser.name);
        return false;
      },
    });
    await strict.loginAs('ada@example.com', 'right-horse-battery');
    expect((await strict.send({ url: '/admin/api/models' })).statusCode).toBe(403);
    expect(seen).toEqual(['ada@example.com']);
  });
});

describe('admin: the jobs of a queue', () => {
  const { Queue } = queueModule;

  async function setUpJobs(options = {}) {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0, keepDone: true });
    await db.sync();
    let broken = true;
    queue.define('welcome', ({ email }) => ({ sent: email }));
    queue.define(
      'invoice',
      () => {
        if (broken) throw new Error('the printer is out of paper');
        return 'printed';
      },
      { attempts: 1 }
    );
    queue.define('report', () => 'made', { attempts: 1 });
    await queue.enqueue('welcome', { email: 'ada@example.com' });
    await queue.enqueue('invoice', { order: 1 });
    await queue.enqueue('invoice', { order: 2 });
    await queue.runDue();
    await queue.enqueue('report', { month: 10 }, { delay: '1h', queue: 'reports' });
    const app = xufa();
    app.register(admin, { prefix: '/admin', models: [], authorize: () => true, queue, ...options });
    await app.ready();
    return { app, queue, fix: () => (broken = false) };
  }

  it('what waits in the queue: the jobs due now, the wait of the oldest (late after 5 minutes), those later', async () => {
    const { app, queue } = await setUpJobs();
    // Only the report, an hour from now.
    expect((await app.inject('/admin/api/_jobs')).json().due).toEqual({
      now: 0,
      later: 1,
      oldest: null,
      wait: 0,
      late: false,
      workers: 0,
    });
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    await queue.enqueue('welcome', { email: 'grace@example.com' }, { at: tenMinutesAgo });
    await queue.enqueue('welcome', { email: 'linus@example.com' });
    const { due } = (await app.inject('/admin/api/_jobs')).json();
    expect([due.now, due.later, due.oldest, due.late]).toEqual([2, 1, tenMinutesAgo.toISOString(), true]);
    expect(due.wait).toBeGreaterThanOrEqual(10 * 60 * 1000);
    expect((await app.inject('/admin/api/_jobs?queue=reports')).json().due).toMatchObject({ now: 0, later: 1 });
  });

  it('lists the jobs (by status, name and queue), and gives a job with its payload, result and error', async () => {
    const { app } = await setUpJobs();
    expect((await app.inject('/admin/api/models')).json().jobs).toBe(true);
    const list = (await app.inject('/admin/api/_jobs')).json();
    expect(list.count).toBe(4);
    expect(list.counts).toEqual({ pending: 1, running: 0, done: 1, failed: 2 });
    expect(list.names).toEqual(['invoice', 'report', 'welcome']);
    expect(list.queues).toEqual(['default', 'reports']);
    expect(list.results.map((job) => [job.name, job.status])).toEqual([
      ['report', 'pending'],
      ['invoice', 'failed'],
      ['invoice', 'failed'],
      ['welcome', 'done'],
    ]);
    const failed = (await app.inject('/admin/api/_jobs?status=failed')).json();
    expect(failed.results[0]).toMatchObject({
      attempts: 1,
      maxAttempts: 1,
      error: 'Error: the printer is out of paper',
    });
    expect((await app.inject('/admin/api/_jobs?queue=reports')).json().count).toBe(1);
    expect((await app.inject('/admin/api/_jobs?name=welcome')).json().count).toBe(1);
    expect((await app.inject('/admin/api/_jobs?status=nope')).statusCode).toBe(400);
    const job = (await app.inject(`/admin/api/_jobs/${failed.results[0].id}`)).json();
    expect(job.payload).toEqual({ order: 2 });
    expect(job.lastError).toMatch(/^Error: the printer is out of paper\n\s+at /);
    const done = (await app.inject(`/admin/api/_jobs/${list.results[3].id}`)).json();
    expect(done).toMatchObject({ status: 'done', result: { sent: 'ada@example.com' } });
    expect((await app.inject('/admin/api/_jobs/999')).statusCode).toBe(404);
  });

  it('retries one failed job, or every failed one (of a name); deletes those that do not run', async () => {
    const { app, queue, fix } = await setUpJobs();
    const post = (url) => app.inject({ method: 'POST', url: `/admin/api/_jobs/${url}`, headers: WRITE, payload: {} });
    const failed = (await app.inject('/admin/api/_jobs?status=failed')).json().results;
    expect((await app.inject({ method: 'POST', url: `/admin/api/_jobs/${failed[0].id}/retry` })).statusCode).toBe(403);
    fix();
    expect((await post(`${failed[0].id}/retry`)).json()).toEqual({ ok: true });
    expect((await post(`${failed[0].id}/retry`)).statusCode).toBe(409);
    expect((await post('retry?name=welcome')).json()).toEqual({ retried: 0 });
    expect((await post('retry?name=invoice')).json()).toEqual({ retried: 1 });
    await queue.runDue();
    expect((await app.inject('/admin/api/_jobs?status=done&name=invoice')).json().count).toBe(2);
    // The pending report is cancelled; a running job is not deleted.
    const pending = (await app.inject('/admin/api/_jobs?status=pending')).json().results[0];
    const del = (id) => app.inject({ method: 'DELETE', url: `/admin/api/_jobs/${id}`, headers: WRITE });
    expect((await del(pending.id)).statusCode).toBe(204);
    expect((await app.inject('/admin/api/_jobs?name=report')).json().count).toBe(0);
    const running = await queue.enqueue('welcome', { email: 'x' });
    await queue.jobs.filter({ pk: running.pk }).update({ status: 'running' });
    expect((await del(running.pk)).statusCode).toBe(409);
    expect((await post('retry')).json()).toEqual({ retried: 0 });
  });

  it('the jobs of steps of pipelines name their run; they are tried again with it, not alone', async () => {
    const { Pipelines } = queueModule;
    const { app, queue } = await setUpJobs();
    const pipelines = new Pipelines(queue);
    await queue.db.sync();
    pipelines.block('fail', () => {
      throw new Error('the converter is down');
    });
    pipelines.define({ name: 'broken', steps: [{ id: 'only', block: 'fail', attempts: 1 }] });
    const run = await pipelines.start('broken');
    await queue.runDue();
    // Hidden by default (the runs show them): the failed ones are the two invoices, and Retry all takes those.
    const listed = (await app.inject('/admin/api/_jobs?status=failed')).json();
    expect([listed.count, listed.counts.failed, listed.retryable]).toEqual([2, 2, 2]);
    expect(listed.names).toEqual(['invoice', 'report', 'welcome']);
    const shown = (await app.inject('/admin/api/_jobs?status=failed&pipelines=1')).json();
    expect([shown.count, shown.retryable]).toEqual([3, 2]);
    expect(shown.names).toContain('xufa:block:fail');
    const failed = (await app.inject('/admin/api/_jobs?status=failed&pipelines=1&name=xufa:block:fail')).json()
      .results[0];
    expect(failed.pipeline).toEqual({ run: String(run.pk), step: 'only' });
    const retry = await app.inject({ method: 'POST', url: `/admin/api/_jobs/${failed.id}/retry`, headers: WRITE });
    expect([retry.statusCode, retry.json().error]).toEqual([
      409,
      `A job of the step only of the run ${run.pk}: retry its run`,
    ]);
    // Retry all: the two failed invoices, not the job of the pipeline.
    expect((await app.inject({ method: 'POST', url: '/admin/api/_jobs/retry', headers: WRITE })).json()).toEqual({
      retried: 2,
    });
    expect((await app.inject('/admin/api/_jobs?status=failed&pipelines=1')).json().count).toBe(1);
  });

  it('is asked to authorize() as the rest; without queue there are no jobs', async () => {
    const closed = await setUpJobs({ authorize: () => false });
    expect((await closed.app.inject('/admin/api/_jobs')).statusCode).toBe(403);
    const plain = xufa();
    plain.register(admin, { prefix: '/admin', models: [], authorize: () => true });
    expect((await plain.inject('/admin/api/models')).json().jobs).toBe(false);
    expect((await plain.inject('/admin/api/_jobs')).statusCode).toBe(404);
  });
});

describe('admin: the work (jobs and runs together)', () => {
  const { Queue, Pipelines } = queueModule;

  async function setUpWork(options = {}) {
    const db = new Database({ backend: 'memory' });
    const queue = new Queue(db, { backoff: 0, keepDone: true });
    const pipelines = new Pipelines(queue);
    await db.sync();
    queue.define('welcome', ({ email }) => ({ sent: email }));
    pipelines.task('monthly-report', ({ month }) => ({ file: `report-${month}.csv` }));
    pipelines.task(
      'broken',
      () => {
        throw new Error('the converter is down');
      },
      { attempts: 1 }
    );
    // A few milliseconds apart: newest first is one order.
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    await queue.enqueue('welcome', { email: 'ada@example.com' });
    await tick();
    await pipelines.start('monthly-report', { month: 10 });
    await tick();
    await pipelines.start('broken', null);
    await tick();
    await queue.runDue();
    // One later: scheduled.
    await pipelines.start('monthly-report', { month: 11 }, { delay: '1h' });
    const app = xufa();
    app.register(admin, { prefix: '/admin', models: [], authorize: () => true, queue, pipelines, ...options });
    await app.ready();
    return { app, queue, pipelines };
  }

  it('the jobs of the app and the runs, newest first, by status; the jobs of the steps left out', async () => {
    const { app } = await setUpWork();
    const work = (await app.inject('/admin/api/_work')).json();
    expect(work.kinds).toEqual({ jobs: true, runs: true });
    expect(work.counts).toEqual({ pending: 0, running: 1, done: 2, failed: 1, cancelled: 0 });
    expect(work.count).toBe(4);
    expect(work.results.map((item) => [item.kind, item.title, item.status])).toEqual([
      ['run', 'monthly-report', 'running'],
      ['run', 'broken', 'failed'],
      ['run', 'monthly-report', 'done'],
      ['job', 'welcome', 'done'],
    ]);
    // The scheduled run: when its first step runs.
    expect(new Date(work.results[0].runAt).getTime()).toBeGreaterThan(Date.now() + 59 * 60000);
    const failed = (await app.inject('/admin/api/_work?status=failed')).json();
    expect(failed.results.map((item) => [item.kind, item.error])).toEqual([
      ['run', 'The step broken failed: the converter is down'],
    ]);
    expect((await app.inject('/admin/api/_work?status=lost')).statusCode).toBe(400);
  });

  it('each kind for those who may view it', async () => {
    const { app } = await setUpWork({
      rbac: { roles: { operator: ['_jobs.view'] } },
      authorize: (request) => {
        request.user = { roles: request.headers['x-role'] ? [request.headers['x-role']] : [] };
        return true;
      },
    });
    const work = await app.inject({ url: '/admin/api/_work', headers: { 'x-role': 'operator' } });
    expect(work.json().kinds).toEqual({ jobs: true, runs: false });
    expect(work.json().results.map((item) => item.kind)).toEqual(['job']);
    expect((await app.inject({ url: '/admin/api/_runs', headers: { 'x-role': 'operator' } })).statusCode).toBe(403);
  });
});

describe('admin: searches across relations', () => {
  it('paths of relations (author__name, and back: bookSet__title), ^ starts with, = exactly; wrong ones at start', async () => {
    const { app } = await setUp({
      modelOptions: { Book: { search: ['title', 'author__name'] }, Author: { search: ['^name', 'bookSet__title'] } },
    });
    const books = async (search) =>
      (await app.inject(`/admin/api/Book?search=${encodeURIComponent(search)}`))
        .json()
        .results.map((item) => item.values.title);
    expect((await books('ada')).length).toBe(12); // every book is of Ada
    expect(await books('grace')).toEqual([]);
    expect(await books('ada 07')).toEqual(['Book 07']); // each word: ada in the author, 07 in the title
    const authors = async (search) =>
      (await app.inject(`/admin/api/Author?search=${encodeURIComponent(search)}`))
        .json()
        .results.map((item) => item.values.name);
    expect(await authors('gr')).toEqual(['Grace']); // starts with
    expect(await authors('race')).toEqual([]);
    expect(await authors('book 12')).toEqual(['Ada']); // the title of one of her books, each once
    const models = (await app.inject('/admin/api/models')).json().models;
    expect(models.find((model) => model.name === 'Book').search).toEqual(['title', 'author__name']);
    await expect(setUp({ modelOptions: { Book: { search: ['author__nope'] } } })).rejects.toThrow(
      'cannot search author__nope'
    );
    await expect(setUp({ modelOptions: { Book: { search: ['ti tle'] } } })).rejects.toThrow('not a search');
  });
});

describe('admin: the data model', () => {
  it('the models of the admin and those they point to; no through models of the ORM; schema: false hides it', async () => {
    class Writer extends Model {
      static fields = { name: fields.string({ maxLength: 100 }) };

      static options = { table: 'schema_writers' };
    }
    class Topic extends Model {
      static fields = { name: fields.string({ maxLength: 50 }) };

      static options = { table: 'schema_topics' };
    }
    class Essay extends Model {
      static fields = {
        title: fields.string({ maxLength: 200 }),
        writer: fields.foreignKey(() => Writer),
        topics: fields.manyToMany(() => Topic, { blank: true }),
      };

      static options = { table: 'schema_essays', ordering: ['title'] };
    }
    const db = new Database({ backend: 'memory' }).register(Writer, Topic, Essay);
    await db.sync();
    const app = xufa();
    app.register(admin, { prefix: '/admin', models: [Essay], authorize: () => true });
    await app.ready();
    const schema = (await app.inject('/admin/api/_schema')).json();
    expect(schema.tenants).toBe(false);
    expect(schema.models.map((model) => [model.name, model.place, model.listed])).toEqual([
      ['Essay', 'project', true],
      ['Writer', 'project', false],
      ['Topic', 'project', false],
    ]);
    expect(schema.models[0].spec).toEqual({
      table: 'schema_essays',
      ordering: ['title'],
      fields: {
        title: { type: 'string', maxLength: 200 },
        writer: { type: 'foreignKey', to: 'Writer' },
        topics: { type: 'manyToMany', to: 'Topic', blank: true },
      },
    });
    await app.close();

    const hidden = xufa();
    hidden.register(admin, { prefix: '/admin', models: [Essay], authorize: () => true, schema: false });
    await hidden.ready();
    expect((await hidden.inject('/admin/api/models')).json().schema).toBe(false);
    expect((await hidden.inject('/admin/api/_schema')).statusCode).toBe(404);
    await hidden.close();
  });
});
