const xufa = require('@xufa/http');
const { Tenants, Model, fields, plugin } = require('..');

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
});
