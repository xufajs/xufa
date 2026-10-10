import xufa from '@xufa/http';
import { Tenants, Model, fields, plugin } from '../index.js';

function makeModels() {
  class Tag extends Model {
    static fields = { name: fields.string() };
  }
  class Note extends Model {
    static fields = { text: fields.string(), tags: fields.manyToMany(() => Tag, { relatedName: 'notes' }) };

    static options = { cache: true };
  }
  return { Tag, Note };
}

describe('tenants', () => {
  it('runs code in the database of each tenant', async () => {
    const { Tag, Note } = makeModels();
    const opened = [];
    const tenants = new Tenants({
      models: [Tag, Note],
      config: (id) => (id === 'missing' ? null : { backend: 'sqlite' }),
      setup: async (db, id) => {
        opened.push(id);
        await db.sync();
      },
    });
    await tenants.run('acme', async () => {
      const note = await Note.objects.create({ text: 'acme note' });
      await note.tags.add(await Tag.objects.create({ name: 'a' }));
    });
    await tenants.run('globex', () => Note.objects.create({ text: 'globex note' }));
    const counts = await Promise.all(
      ['acme', 'globex', 'acme'].map((id) =>
        tenants.run(id, async () => [
          (await Note.objects.valuesList('text', { flat: true }))[0],
          await Tag.objects.count(),
        ])
      )
    );
    expect(counts).toEqual([
      ['acme note', 1],
      ['globex note', 0],
      ['acme note', 1],
    ]);
    // The cache of each tenant is its own.
    const ids = await Promise.all(
      ['acme', 'globex'].map((id) => tenants.run(id, async () => (await Note.objects.get({ pk: 1 })).text))
    );
    expect(ids).toEqual(['acme note', 'globex note']);
    expect(opened).toEqual(['acme', 'globex']);
    await expect(tenants.run('missing', () => 1)).rejects.toThrow('there is no tenant missing');
    await tenants.close();
  });

  it('routes the models of a tenant to several databases (a provider for each collection)', async () => {
    class Writer extends Model {
      static fields = { name: fields.string() };
    }
    class Post extends Model {
      static fields = {
        title: fields.string(),
        writer: fields.foreignKey(() => Writer, { relatedName: 'posts' }),
        labels: fields.manyToMany(() => Label, { relatedName: 'posts' }), // eslint-disable-line no-use-before-define
      };
    }
    class Label extends Model {
      static fields = { name: fields.string() };
    }
    class Visit extends Model {
      static fields = {
        path: fields.string(),
        post: fields.foreignKey(() => Post, { null: true, dbConstraint: false }),
      };
    }
    class Token extends Model {
      static fields = { value: fields.string() };

      static options = { database: 'cache' };
    }
    const tenants = new Tenants({
      models: [Writer, Post, Label, Visit, Token],
      routes: { Visit: 'events' },
      config: (id) => ({
        databases: {
          default: { backend: 'sqlite' },
          events: { backend: id === 'acme' ? 'memory' : 'sqlite' },
          cache: { backend: 'memory' },
        },
        // A route of the tenant over those of the Tenants.
        routes: id === 'globex' ? { Visit: 'default' } : {},
      }),
      setup: (db) => db.sync(),
    });
    try {
      const run = (id) =>
        tenants.run(id, async () => {
          const writer = await Writer.objects.create({ name: `writer of ${id}` });
          const post = await Post.objects.create({ title: 'hello', writer });
          await post.labels.add(await Label.objects.create({ name: 'news' }));
          await Visit.objects.create({ path: '/hello', post });
          await Token.objects.create({ value: id });
          const [visit] = await Visit.objects.all().prefetchRelated('post');
          return {
            backends: [Writer, Visit, Token].map((model) => model.db.backend.name),
            separate: Visit.db !== Writer.db,
            visitPost: visit.post.title,
            labels: await Label.objects.filter({ posts__title: 'hello' }).count(),
            writers: await Writer.objects.filter({ posts__title: 'hello' }).valuesList('name', { flat: true }),
            tokens: await Token.objects.valuesList('value', { flat: true }),
          };
        });
      expect(await run('acme')).toEqual({
        backends: ['sqlite', 'memory', 'memory'],
        separate: true,
        visitPost: 'hello',
        labels: 1,
        writers: ['writer of acme'],
        tokens: ['acme'],
      });
      // Another tenant, another layout: its visits in its default database (and joined there).
      expect(await run('globex')).toMatchObject({ backends: ['sqlite', 'sqlite', 'memory'], separate: false });
      expect(await tenants.run('globex', () => Visit.objects.filter({ post__title: 'hello' }).count())).toBe(1);
      // Across databases a query cannot join.
      await expect(tenants.run('acme', () => Visit.objects.filter({ post__title: 'hello' }).count())).rejects.toThrow(
        'are in different databases'
      );
    } finally {
      await tenants.close();
    }
  });

  it('a model of tenants out of one: an error, never the database of a tenant opened before', async () => {
    const { Tag, Note } = makeModels();
    const tenants = new Tenants({ models: [Tag, Note], config: () => ({ backend: 'memory' }), setup: (db) => db.sync() });
    await tenants.run('acme', () => Note.objects.create({ text: 'acme note' }));
    expect(() => Note.objects.all().db).toThrow('it is a model of tenants: its queries run in a tenant');
    await expect(Note.objects.count()).rejects.toThrow('a model of tenants');
    await tenants.close();
  });

  it('a QuerySet given back by run() is read in the tenant (awaited there)', async () => {
    const { Tag, Note } = makeModels();
    const tenants = new Tenants({
      models: [Tag, Note],
      config: () => ({ backend: 'memory' }),
      setup: (db) => db.sync(),
    });
    await tenants.run('acme', () => Note.objects.create({ text: 'acme note' }));
    await tenants.database('globex');
    // (Awaited out of the tenant, it read the database the model was registered in first: acme's.)
    expect(await tenants.run('globex', () => Note.objects.all())).toEqual([]);
    expect(await tenants.run('globex', () => Note.objects.valuesList('text', { flat: true }))).toEqual([]);
    expect(await tenants.run('acme', () => Note.objects.valuesList('text', { flat: true }))).toEqual(['acme note']);
    await tenants.close();
  });

  it('keeps the databases of the last tenants used', async () => {
    const { Tag, Note } = makeModels();
    const tenants = new Tenants({ models: [Tag, Note], config: () => ({ backend: 'memory' }), max: 2 });
    await tenants.run('a', () => {});
    await tenants.run('b', () => {});
    await tenants.run('a', () => {});
    await tenants.run('c', () => {});
    expect([...tenants.databases.keys()]).toEqual(['a', 'c']);
    await tenants.close();
  });

  it('runs each request in its tenant (plugin)', async () => {
    const { Tag, Note } = makeModels();
    const tenants = new Tenants({
      models: [Tag, Note],
      config: (id) => (id === 'nope' ? null : { backend: 'memory' }),
      setup: (db) => db.sync(),
    });
    const app = xufa();
    app.register(plugin, { tenants: { tenants, resolve: (request) => request.headers['x-tenant'] } });
    app.post('/notes', async (request) => Note.objects.create(request.body));
    app.get('/notes', async (request) => ({
      tenant: request.tenant,
      notes: await Note.objects.valuesList('text', { flat: true }),
    }));
    await app.ready();
    await app.inject({ method: 'POST', url: '/notes', headers: { 'x-tenant': 'one' }, payload: { text: 'first' } });
    await app.inject({ method: 'POST', url: '/notes', headers: { 'x-tenant': 'two' }, payload: { text: 'second' } });
    expect((await app.inject({ url: '/notes', headers: { 'x-tenant': 'one' } })).json()).toEqual({
      tenant: 'one',
      notes: ['first'],
    });
    expect((await app.inject({ url: '/notes', headers: { 'x-tenant': 'two' } })).json()).toEqual({
      tenant: 'two',
      notes: ['second'],
    });
    expect((await app.inject('/notes')).statusCode).toBe(400);
    expect((await app.inject({ url: '/notes', headers: { 'x-tenant': 'nope' } })).statusCode).toBe(404);
    await app.close();
    expect(tenants.databases.size).toBe(0);
  });

  it('routes with config { tenant: false } choose their tenant themselves (the admin does)', async () => {
    const { Tag, Note } = makeModels();
    const tenants = new Tenants({
      models: [Tag, Note],
      config: () => ({ backend: 'memory' }),
      setup: (db) => db.sync(),
    });
    const app = xufa();
    app.register(plugin, { tenants: { tenants, resolve: (request) => request.headers['x-tenant'], authorize: false } });
    app.get('/own/:tenant', { config: { tenant: false } }, (request) =>
      tenants.run(request.params.tenant, async () => ({ tenant: request.tenant, notes: await Note.objects.count() }))
    );
    await app.ready();
    await tenants.run('one', () => Note.objects.create({ text: 'first' }));
    expect((await app.inject('/own/one')).json()).toEqual({ tenant: null, notes: 1 });
    expect((await app.inject({ url: '/own/two', headers: { 'x-tenant': 'one' } })).json()).toEqual({
      tenant: null,
      notes: 0,
    });
    await app.close();
  });

  it('authorize: checked before the tenant is entered (403, or the error it throws); a warning without it', async () => {
    const { Tag, Note } = makeModels();
    const looked = [];
    const tenants = new Tenants({
      models: [Tag, Note],
      config: (id) => {
        looked.push(id);
        return { backend: 'memory' };
      },
      setup: (db) => db.sync(),
    });
    const warnings = [];
    const app = xufa({ logger: { level: 'warn', stream: { write: (line) => warnings.push(JSON.parse(line).msg) } } });
    app.register(plugin, {
      tenants: {
        tenants,
        resolve: (request) => request.headers['x-tenant'],
        // As a check of a user would: later (after an await), and an error of its own for some.
        authorize: async (request, id) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          if (request.headers['x-user'] === undefined) {
            throw Object.assign(new Error('Who are you?'), { statusCode: 401 });
          }
          return request.headers['x-user'].split(',').includes(id);
        },
      },
    });
    app.post('/notes', async (request) => Note.objects.create(request.body));
    app.get('/notes', async (request) => ({
      tenant: request.tenant,
      notes: await Note.objects.valuesList('text', { flat: true }),
    }));
    await app.ready();
    expect(warnings).toEqual([]);
    const as = (user, tenant) => ({ 'x-user': user, 'x-tenant': tenant });
    await app.inject({ method: 'POST', url: '/notes', headers: as('one,two', 'one'), payload: { text: 'first' } });
    await app.inject({ method: 'POST', url: '/notes', headers: as('two', 'two'), payload: { text: 'second' } });
    // The queries of the handler run in the tenant entered after the check.
    expect((await app.inject({ url: '/notes', headers: as('one', 'one') })).json()).toEqual({
      tenant: 'one',
      notes: ['first'],
    });
    expect((await app.inject({ url: '/notes', headers: as('one,two', 'two') })).json()).toEqual({
      tenant: 'two',
      notes: ['second'],
    });
    const denied = await app.inject({ url: '/notes', headers: as('one', 'three') });
    expect([denied.statusCode, denied.json().message]).toEqual([403, 'You cannot use this tenant']);
    const anonymous = await app.inject({ url: '/notes', headers: { 'x-tenant': 'one' } });
    expect([anonymous.statusCode, anonymous.json().message]).toEqual([401, 'Who are you?']);
    // A tenant refused is not even looked up.
    expect(looked).toEqual(['one', 'two']);
    await app.close();

    const open = xufa({ logger: { level: 'warn', stream: { write: (line) => warnings.push(JSON.parse(line).msg) } } });
    open.register(plugin, {
      tenants: { tenants: new Tenants({ models: [], config: () => ({ backend: 'memory' }) }), resolve: () => 'x' },
    });
    await open.ready();
    expect(warnings).toEqual([expect.stringMatching(/without tenants.authorize: any request may use any tenant/)]);
    await open.close();
    const fromUser = xufa({
      logger: { level: 'warn', stream: { write: (line) => warnings.push(JSON.parse(line).msg) } },
    });
    fromUser.register(plugin, {
      tenants: {
        tenants: new Tenants({ models: [], config: () => ({ backend: 'memory' }) }),
        resolve: () => 'x',
        authorize: false,
      },
    });
    await fromUser.ready();
    expect(warnings).toHaveLength(1);
    await fromUser.close();
    const wrong = xufa();
    wrong.register(plugin, {
      tenants: { tenants: new Tenants({ models: [], config: () => null }), resolve: () => 'x', authorize: 'auth' },
    });
    await expect(wrong.ready()).rejects.toThrow('tenants.authorize is a function (request, id, reply), or false');
  });
});
