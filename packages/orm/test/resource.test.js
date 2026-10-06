// Resources: the routes of the objects of a model, in an app of @xufa/http.
const xufa = require('@xufa/http');
const { Database, Model, fields, plugin, resource } = require('..');

function makeModels() {
  class Author extends Model {
    static fields = { name: fields.string({ maxLength: 50, unique: true }) };
  }

  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 100 }),
      pages: fields.integer({ null: true, min: 1 }),
      status: fields.string({ default: 'draft', choices: ['draft', 'published'] }),
      secret: fields.string({ null: true }),
      owner: fields.string({ null: true }),
      author: fields.foreignKey(() => Author, { relatedName: 'books', onDelete: 'protect' }),
      createdAt: fields.datetime({ autoNowAdd: true }),
    };

    static options = { ordering: ['title'] };
  }
  return { Author, Book };
}

async function makeApp(bookOptions = {}, authorOptions = {}) {
  const { Author, Book } = makeModels();
  const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Author, Book);
  const app = xufa();
  app.register(plugin, { database: db, sync: true });
  app.register(resource(Author, authorOptions), { prefix: '/authors' });
  const options = typeof bookOptions === 'function' ? bookOptions({ Author, Book }) : bookOptions;
  app.register(resource(Book, { exclude: ['secret'], ...options }), { prefix: '/books' });
  await app.ready();
  const ada = await Author.objects.create({ name: 'Ada' });
  const grace = await Author.objects.create({ name: 'Grace' });
  await Book.objects.bulkCreate([
    { title: 'Notes on the Engine', pages: 120, status: 'published', author: ada, secret: 's1', owner: 'u1' },
    { title: 'The Analytical Engine', pages: 300, author: ada, secret: 's2', owner: 'u2' },
    { title: 'Compilers', pages: 250, status: 'published', author: grace, owner: 'u1' },
  ]);
  return { app, db, Author, Book, ada, grace };
}

const json = (res) => res.json();

describe('resource', () => {
  it('lists, gets, creates, updates and deletes objects', async () => {
    const { app, Book, ada } = await makeApp();
    const list = json(await app.inject({ url: '/books' }));
    expect(list).toMatchObject({ count: 3, limit: 50, offset: 0 });
    expect(list.results.map((book) => book.title)).toEqual(['Compilers', 'Notes on the Engine', 'The Analytical Engine']);
    expect(list.results[0].secret).toBeUndefined();
    const one = await app.inject({ url: `/books/${list.results[1].id}` });
    expect(json(one)).toMatchObject({ title: 'Notes on the Engine', pages: 120, authorId: ada.id });
    const created = await app.inject({ method: 'POST', url: '/books', payload: { title: 'Sketch', author: ada.id } });
    expect(created.statusCode).toBe(201);
    expect(json(created)).toMatchObject({ title: 'Sketch', status: 'draft', authorId: ada.id, pages: null });
    const { id } = json(created);
    const patched = await app.inject({ method: 'PATCH', url: `/books/${id}`, payload: { pages: 42 } });
    expect(json(patched)).toMatchObject({ title: 'Sketch', pages: 42 });
    // PUT sets every writable field: those not given take their default; id and createdAt are ignored.
    const put = await app.inject({
      method: 'PUT',
      url: `/books/${id}`,
      payload: { id: 999, title: 'Sketch 2', authorId: ada.id, createdAt: '2000-01-01T00:00:00Z' },
    });
    expect(json(put)).toMatchObject({ id, title: 'Sketch 2', pages: null, status: 'draft' });
    expect(new Date(json(put).createdAt).getFullYear()).toBeGreaterThan(2000);
    const deleted = await app.inject({ method: 'DELETE', url: `/books/${id}` });
    expect(deleted.statusCode).toBe(204);
    expect(await Book.objects.filter({ pk: id }).exists()).toBe(false);
    expect((await app.inject({ url: `/books/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ url: '/books/abc' })).statusCode).toBe(404);
  });

  it('answers the errors with their status codes', async () => {
    const { app, ada } = await makeApp();
    const invalid = await app.inject({ method: 'POST', url: '/books', payload: { title: 'x', pages: 0, author: ada.id } });
    expect(invalid.statusCode).toBe(400);
    expect(json(invalid).errors).toEqual({ pages: ['Ensure this value is at least 1.'] });
    const unknown = await app.inject({ method: 'POST', url: '/books', payload: { title: 'x', author: ada.id, nope: 1 } });
    expect(unknown.statusCode).toBe(400);
    expect(json(unknown).message).toBe('Book has no field nope');
    const duplicate = await app.inject({ method: 'POST', url: '/authors', payload: { name: 'Ada' } });
    expect(duplicate.statusCode).toBe(409);
    expect(json(duplicate)).toMatchObject({ code: 'XUFA_ORM_ERR_UNIQUE', fields: ['name'] });
    const renamed = await app.inject({ method: 'PATCH', url: `/authors/${ada.id}`, payload: { name: 'Grace' } });
    expect(renamed.statusCode).toBe(409);
    // Ada has books, which protect her.
    const protectedDelete = await app.inject({ method: 'DELETE', url: `/authors/${ada.id}` });
    expect(protectedDelete.statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/books', payload: [] })).statusCode).toBe(400);
  });

  it('filters, searches, orders and pages lists', async () => {
    const { app, grace } = await makeApp({
      filters: { author: ['exact', 'in'], pages: ['gte', 'lte'], status: 'exact' },
      ordering: ['pages', 'title'],
      search: ['title', 'author__name'],
      pageSize: 2,
      maxPageSize: 2,
    });
    const titles = async (url) => json(await app.inject({ url })).results.map((book) => book.title);
    expect(await titles(`/books?author=${grace.id}`)).toEqual(['Compilers']);
    expect(await titles('/books?pages__gte=200&ordering=-pages')).toEqual(['The Analytical Engine', 'Compilers']);
    expect(await titles('/books?status=published&ordering=pages')).toEqual(['Notes on the Engine', 'Compilers']);
    expect(await titles('/books?search=grace')).toEqual(['Compilers']);
    expect(await titles('/books?search=ENGINE&ordering=title')).toEqual(['Notes on the Engine', 'The Analytical Engine']);
    const page = json(await app.inject({ url: '/books?ordering=title&limit=5&offset=2' }));
    expect(page).toMatchObject({ count: 3, limit: 2, offset: 2 });
    expect(page.results.map((book) => book.title)).toEqual(['The Analytical Engine']);
    expect(await titles(`/books?author__in=${grace.id},999`)).toEqual(['Compilers']);
    for (const url of ['/books?secret=s1', '/books?ordering=secret', '/books?limit=-1', '/books?pages__gte=many']) {
      expect((await app.inject({ url })).statusCode).toBe(400);
    }
  });

  it('refuses filters that are not of the model', async () => {
    const { Book } = makeModels();
    expect(() => resource(Book, { filters: ['nope'] })).toThrow('The filter nope');
    expect(() => resource(Book, { actions: ['list', 'destroy'] })).toThrow('Unknown action destroy');
  });

  it('scopes the objects, and gives the fields and actions asked for', async () => {
    const { app } = await makeApp(({ Book }) => ({
      queryset: (request) => Book.objects.filter({ owner: request.headers['x-user'] }),
      fields: ['id', 'title', 'author'],
      related: ['author'],
      actions: ['list', 'get'],
    }));
    const mine = json(await app.inject({ url: '/books', headers: { 'x-user': 'u1' } }));
    expect(mine.results).toEqual([
      { id: 3, title: 'Compilers', authorId: 2, author: { id: 2, name: 'Grace' } },
      { id: 1, title: 'Notes on the Engine', authorId: 1, author: { id: 1, name: 'Ada' } },
    ]);
    // Another's object is not found.
    expect((await app.inject({ url: '/books/2', headers: { 'x-user': 'u1' } })).statusCode).toBe(404);
    expect((await app.inject({ url: '/books/2', headers: { 'x-user': 'u2' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/books', payload: {} })).statusCode).toBe(404);
  });

  it('runs its hooks, and serializes as it is told', async () => {
    const calls = [];
    const { app } = await makeApp({
      readOnly: ['owner'],
      hooks: {
        beforeCreate: (values, request) => ({ ...values, owner: request.headers['x-user'] }),
        afterCreate: (book) => calls.push(`created ${book.title}`),
        beforeUpdate: (book, values) => {
          if (book.status === 'published' && values.title) {
            throw Object.assign(new Error('Published books keep their title'), { statusCode: 409 });
          }
          return values;
        },
        beforeDelete: (book) => calls.push(`deleting ${book.title}`),
      },
      serialize: (book) => ({ title: book.title.toUpperCase(), owner: book.owner }),
      pagination: false,
    });
    const created = await app.inject({
      method: 'POST',
      url: '/books',
      headers: { 'x-user': 'u9' },
      payload: { title: 'Mine', author: 1, owner: 'someone else' },
    });
    expect(json(created)).toEqual({ title: 'MINE', owner: 'u9' });
    expect(json(await app.inject({ url: '/books' }))).toHaveLength(4);
    const refused = await app.inject({ method: 'PATCH', url: '/books/1', payload: { title: 'Other' } });
    expect(refused.statusCode).toBe(409);
    await app.inject({ method: 'DELETE', url: '/books/2' });
    expect(calls).toEqual(['created Mine', 'deleting The Analytical Engine']);
  });

  it('gives the rule of @xufa/auth to the configuration of each route', async () => {
    const seen = [];
    const { Author } = makeModels();
    const app = xufa();
    app.addHook('preHandler', async (request) => {
      seen.push([request.method, request.routeOptions.config.auth]);
    });
    app.register(plugin, { database: new Database({ backend: 'memory' }).register(Author), sync: true });
    app.register(resource(Author, { auth: { list: false, get: true, create: 'admin', delete: ['admin'] } }), {
      prefix: '/authors',
    });
    await app.ready();
    await app.inject({ url: '/authors' });
    await app.inject({ url: '/authors/1' });
    await app.inject({ method: 'POST', url: '/authors', payload: { name: 'x' } });
    await app.inject({ method: 'PATCH', url: '/authors/1', payload: { name: 'y' } });
    await app.inject({ method: 'DELETE', url: '/authors/1' });
    expect(seen).toEqual([
      ['GET', false],
      ['GET', true],
      ['POST', 'admin'],
      ['PATCH', undefined],
      ['DELETE', ['admin']],
    ]);
  });
});

describe('resource with strict: true', () => {
  it('refuses keys that are not writable, every key refused in one ValidationError (400 with its errors)', async () => {
    const { app, Book, ada } = await makeApp({ strict: true, readOnly: ['owner'] });
    const refused = await app.inject({
      method: 'POST',
      url: '/books',
      payload: { title: 'x', author: ada.id, id: 7, createdAt: '2000-01-01T00:00:00Z', owner: 'me', nope: 1 },
    });
    expect(refused.statusCode).toBe(400);
    expect(json(refused)).toMatchObject({
      code: 'XUFA_ORM_ERR_VALIDATION',
      errors: {
        nope: ['Book has no field nope.'],
        id: ['This field is read-only.'],
        createdAt: ['This field is read-only.'],
        owner: ['This field is read-only.'],
      },
    });
    expect(await Book.objects.filter({ title: 'x' }).exists()).toBe(false);
    const created = await app.inject({ method: 'POST', url: '/books', payload: { title: 'x', author: ada.id } });
    expect(created.statusCode).toBe(201);
  });

  it('an update takes read-only keys with the values the object has (the object as it was read)', async () => {
    const { app } = await makeApp({ strict: true });
    const read = json(await app.inject({ url: '/books?limit=1' })).results[0];
    const put = await app.inject({ method: 'PUT', url: `/books/${read.id}`, payload: { ...read, pages: 99 } });
    expect([put.statusCode, json(put).pages]).toEqual([200, 99]);
    const changed = await app.inject({ method: 'PATCH', url: `/books/${read.id}`, payload: { id: read.id + 100, createdAt: read.createdAt } });
    expect(changed.statusCode).toBe(400);
    expect(json(changed).errors).toEqual({ id: ['This field is read-only.'] });
  });

  it('without strict, read-only keys are ignored and an unknown key is a message, as before', async () => {
    const { app, ada } = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/books', payload: { title: 'y', author: ada.id, id: 7 } });
    expect([res.statusCode, json(res).id === 7]).toEqual([201, false]);
  });
});
