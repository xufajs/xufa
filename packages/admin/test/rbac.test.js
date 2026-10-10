// @xufa/admin with roles and permissions (the Rbac of @xufa/auth) and tenants (those of @xufa/orm): the models a user
// sees and what it may do with them, by tenant; superusers and grants in every tenant; the tenant chosen by the page
// (x-xufa-tenant); the jobs, runs and health in every tenant; and the users of request.user without the login.
import xufa from '@xufa/http';
import { Database, Model, Tenants, fields, plugin as orm } from '@xufa/orm';
import * as auth from '@xufa/auth';
import { sessionPlugin } from '@xufa/session';
import { Queue } from '@xufa/queue';
import { admin } from '../index.js';
import * as pluginModule from '../lib/plugin.js';

const WRITE = { 'x-xufa-admin': '1' };
const PASSWORDS = { ln: 4 };
const ROLES = {
  viewer: ['Book.view', 'Author.view'],
  editor: { inherits: 'viewer', permissions: ['Book.add', 'Book.change'] },
  manager: { inherits: 'editor', permissions: ['Book.delete', 'Author.*'] },
  operator: ['_jobs.*', '_health.view'],
  authors: ['Author.view'],
};

function models() {
  class Author extends Model {
    static fields = { name: fields.string({ maxLength: 100 }) };
  }
  class Book extends Model {
    static fields = {
      title: fields.string({ maxLength: 200 }),
      author: fields.foreignKey(() => Author, { null: true }),
    };
  }
  return { Author, Book };
}

async function setUp({ login = true, extra = {} } = {}) {
  const { Author, Book } = models();
  // Two tenants with their own books.
  const tenants = new Tenants({
    models: [Author, Book],
    config: (id) => (['acme', 'globex', 'initech'].includes(id) ? { backend: 'memory' } : null),
    setup: (db) => db.sync(),
  });
  for (const [tenant, titles] of [
    ['acme', ['Acme 1', 'Acme 2']],
    ['globex', ['Globex 1']],
  ]) {
    await tenants.run(tenant, async () => {
      for (const title of titles) await Book.objects.create({ title });
    });
  }
  // The users and their roles by tenant (a table of memberships), in a database of their own.
  class User extends Model {
    static fields = {
      email: fields.string({ unique: true }),
      password: fields.string(),
      superuser: fields.boolean({ default: false }),
    };
  }
  const users = new Database({ backend: 'memory' }).register(User);
  await users.sync();
  const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
  const memberships = [
    { email: 'eve@example.com', tenant: 'acme', role: 'editor' },
    { email: 'eve@example.com', tenant: 'globex', role: 'viewer' },
    { email: 'max@example.com', tenant: 'globex', role: 'manager' },
    { email: 'ops@example.com', tenant: '*', role: 'operator' },
    { email: 'ops@example.com', tenant: '*', role: 'viewer' },
  ];
  for (const email of ['eve@example.com', 'max@example.com', 'ops@example.com', 'nobody@example.com']) {
    await User.objects.create({ email, password: hash });
  }
  await User.objects.create({ email: 'root@example.com', password: hash, superuser: true });
  const rbac = new auth.Rbac({
    roles: ROLES,
    grants: (user) => memberships.filter((row) => row.email === user.email),
  });
  const db = new Database({ backend: 'memory' });
  const queue = new Queue(db, { backoff: 0 });
  await db.sync();
  queue.define('send-email', () => {
    throw new Error('the mail server is down');
  });

  const app = xufa();
  app.register(xufa.health, { cache: 0, checks: { database: db.health() } });
  app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
  // The ORM resolves the tenants of the app's own routes from a header of its own: the admin chooses its tenant.
  app.register(orm, {
    tenants: { tenants, resolve: (request) => request.headers['x-app-tenant'], authorize: false },
  });
  app.register(admin, {
    prefix: '/admin',
    models: [Book, Author],
    rbac,
    tenants: { tenants, list: () => ['acme', 'globex', 'initech'], label: (id) => id.toUpperCase() },
    queue,
    ...(login
      ? {
          login: {
            findUser: (email) => User.objects.using(users).filter({ email }).first(),
            passwordOptions: PASSWORDS,
            reload: (id) => User.objects.using(users).filter({ pk: id }).first(),
          },
        }
      : {}),
    ...extra,
  });
  app.get('/books', async () => Book.objects.count());
  await app.ready();

  // A browser of each user: its cookie.
  const browser = async (email) => {
    let cookie = '';
    const send = async (request) => {
      const res = await app.inject({ ...request, headers: { cookie, ...request.headers } });
      const set = res.headers['set-cookie'];
      if (set) cookie = [].concat(set)[0].split(';')[0];
      return res;
    };
    if (email) {
      const res = await send({
        method: 'POST',
        url: '/admin/login',
        headers: WRITE,
        payload: { username: email, password: 'right-horse-battery' },
      });
      if (res.statusCode !== 200) throw new Error(`${email}: ${res.body}`);
    }
    return send;
  };
  return { app, tenants, queue, users, User, Book, browser, memberships };
}

const inTenant = (tenant, headers = {}) => ({ 'x-xufa-tenant': tenant, ...headers });

describe('admin: roles and permissions by tenant', () => {
  it('the tenants of a user, its models and what it may do with them in each tenant', async () => {
    const { browser } = await setUp();
    const eve = await browser('eve@example.com');
    const home = (await eve({ url: '/admin/api/models' })).json();
    expect(home.tenants).toEqual([
      { id: 'acme', label: 'ACME' },
      { id: 'globex', label: 'GLOBEX' },
    ]);
    // Without a tenant chosen, the first one.
    expect(home.tenant).toBe('acme');
    expect(home.models.map((model) => [model.name, model.count, model.can])).toEqual([
      ['Book', 2, { add: true, change: true, delete: false }],
      ['Author', 0, { add: false, change: false, delete: false }],
    ]);
    // In globex, a viewer: it sees the books of globex, and changes nothing.
    const globex = (await eve({ url: '/admin/api/models', headers: inTenant('globex') })).json();
    expect(globex.models.map((model) => [model.name, model.count, model.can.change])).toEqual([
      ['Book', 1, false],
      ['Author', 0, false],
    ]);
    expect((await eve({ url: '/admin/api/Book', headers: inTenant('globex') })).json().count).toBe(1);
    const denied = await eve({
      method: 'POST',
      url: '/admin/api/Book',
      headers: inTenant('globex', WRITE),
      payload: { title: 'Nope' },
    });
    expect([denied.statusCode, denied.json().error]).toEqual([403, 'You cannot do this (Book.add)']);
    // In acme, an editor: adds and changes books, deletes none; authors are only seen.
    const made = await eve({
      method: 'POST',
      url: '/admin/api/Book',
      headers: inTenant('acme', WRITE),
      payload: { title: 'Acme 3' },
    });
    expect(made.statusCode).toBe(201);
    const { pk } = made.json();
    const changed = await eve({
      method: 'PATCH',
      url: `/admin/api/Book/${pk}`,
      headers: inTenant('acme', WRITE),
      payload: { title: 'Acme 3b' },
    });
    expect(changed.json().values.title).toBe('Acme 3b');
    expect(
      (await eve({ method: 'DELETE', url: `/admin/api/Book/${pk}`, headers: inTenant('acme', WRITE) })).statusCode
    ).toBe(403);
    expect(
      (
        await eve({
          method: 'POST',
          url: '/admin/api/Author',
          headers: inTenant('acme', WRITE),
          payload: { name: 'A' },
        })
      ).statusCode
    ).toBe(403);
    // The choices of the author of a book: it may add books.
    expect((await eve({ url: '/admin/api/Author/choices', headers: inTenant('acme') })).statusCode).toBe(200);
    // Not a member of initech: 403, whatever the page says.
    const other = await eve({ url: '/admin/api/Book', headers: inTenant('initech') });
    expect([other.statusCode, other.json().error]).toEqual([403, 'You cannot use the tenant initech']);
    // The jobs, runs and health are of every tenant: an editor of acme sees none.
    expect(home.jobs).toBe(false);
    expect(home.health).toBe(false);
    expect((await eve({ url: '/admin/api/_jobs' })).statusCode).toBe(403);
    expect((await eve({ url: '/admin/api/_health' })).statusCode).toBe(403);
  });

  it('the books of each tenant are its own; the app keeps resolving its tenants for its own routes', async () => {
    const { app, browser } = await setUp();
    const max = await browser('max@example.com');
    const books = (await max({ url: '/admin/api/Book', headers: inTenant('globex') })).json();
    expect(books.results.map((book) => book.values.title)).toEqual(['Globex 1']);
    const { pk } = books.results[0];
    expect(
      (await max({ method: 'DELETE', url: `/admin/api/Book/${pk}`, headers: inTenant('globex', WRITE) })).statusCode
    ).toBe(204);
    expect((await max({ url: '/admin/api/models' })).json().tenants).toEqual([{ id: 'globex', label: 'GLOBEX' }]);
    expect((await app.inject({ url: '/books', headers: { 'x-app-tenant': 'acme' } })).json()).toBe(2);
    expect((await app.inject({ url: '/books', headers: { 'x-app-tenant': 'globex' } })).json()).toBe(0);
    expect((await app.inject({ url: '/books' })).statusCode).toBe(400);
  });

  it('a superuser and grants in every tenant: every tenant of list(); the jobs of an operator', async () => {
    const { browser, queue } = await setUp();
    const root = await browser('root@example.com');
    const home = (await root({ url: '/admin/api/models' })).json();
    expect(home.tenants.map((tenant) => tenant.id)).toEqual(['acme', 'globex', 'initech']);
    expect(home.jobs && home.health).toBe(true);
    expect(home.actions).toEqual({ runs: { change: true }, jobs: { change: true, delete: true } });
    expect(
      (await root({ method: 'DELETE', url: '/admin/api/Book/1', headers: inTenant('acme', WRITE) })).statusCode
    ).toBe(204);
    // A tenant of list() that does not exist any more: 404.
    expect((await root({ url: '/admin/api/Book', headers: inTenant('gone') })).statusCode).toBe(404);

    await queue.enqueue('send-email', { to: 'a@example.com' }, { attempts: 1 });
    await queue.runDue();
    const ops = await browser('ops@example.com');
    const opsHome = (await ops({ url: '/admin/api/models', headers: inTenant('initech') })).json();
    expect(opsHome.tenant).toBe('initech');
    expect(opsHome.models.map((model) => [model.name, model.can])).toEqual([
      ['Book', { add: false, change: false, delete: false }],
      ['Author', { add: false, change: false, delete: false }],
    ]);
    expect([opsHome.jobs, opsHome.runs, opsHome.health]).toEqual([true, false, true]);
    expect(opsHome.actions.jobs).toEqual({ change: true, delete: true });
    const jobs = (await ops({ url: '/admin/api/_jobs?status=failed' })).json();
    expect(jobs.count).toBe(1);
    expect(
      (await ops({ method: 'POST', url: `/admin/api/_jobs/${jobs.results[0].id}/retry`, headers: WRITE, payload: {} }))
        .statusCode
    ).toBe(200);
    expect((await ops({ url: '/admin/api/_health' })).statusCode).toBe(200);
  });

  it('the data model: for _schema.view (a superuser here), the models of the tenants placed there', async () => {
    const { browser } = await setUp({ extra: { appOf: (model) => (model.name === 'Book' ? 'library' : null) } });
    const root = await browser('root@example.com');
    expect((await root({ url: '/admin/api/models' })).json().schema).toBe(true);
    const schema = (await root({ url: '/admin/api/_schema' })).json();
    expect(schema.tenants).toBe(true);
    expect(schema.models.map((model) => [model.name, model.place, model.app, model.listed])).toEqual([
      ['Book', 'tenant', 'library', true],
      ['Author', 'tenant', null, true],
    ]);
    const book = schema.models[0];
    expect(book.pk).toEqual(['id']);
    expect(book.spec.fields.author).toEqual({ type: 'foreignKey', to: 'Author', null: true });
    // An operator has no _schema.view: no page, and 403.
    const ops = await browser('ops@example.com');
    expect((await ops({ url: '/admin/api/models', headers: inTenant('initech') })).json().schema).toBe(false);
    expect((await ops({ url: '/admin/api/_schema' })).statusCode).toBe(403);
    // What the pickers of permissions offer: for every user of the admin.
    expect((await ops({ url: '/admin/api/_permissions' })).statusCode).toBe(200);
  });

  it('a user without roles cannot log in; one whose grants go is logged out (reload)', async () => {
    const { browser, memberships } = await setUp();
    await expect(browser('nobody@example.com')).rejects.toThrow('Wrong user or password');
    const max = await browser('max@example.com');
    expect((await max({ url: '/admin/api/models' })).statusCode).toBe(200);
    // Moved from manager to viewer: the next request knows it.
    memberships.find((row) => row.email === 'max@example.com').role = 'viewer';
    const now = (await max({ url: '/admin/api/models' })).json();
    expect(now.models[0].can).toEqual({ add: false, change: false, delete: false });
    // Out of every tenant: logged out.
    memberships.splice(
      memberships.findIndex((row) => row.email === 'max@example.com'),
      1
    );
    expect((await max({ url: '/admin/api/models' })).statusCode).toBe(401);
  });

  it('without login: what request.user may (of @xufa/auth); 403 for users without roles', async () => {
    const { app } = await setUp({
      login: false,
      extra: {
        authorize: (request) => {
          // The user of a header, as @xufa/auth would set it from a token.
          const header = request.headers['x-user'];
          request.user = header ? JSON.parse(header) : null;
          return true;
        },
      },
    });
    const as = (user, request) =>
      app.inject({ ...request, headers: { 'x-user': JSON.stringify(user), ...request.headers } });
    const eve = { email: 'eve@example.com' };
    const models = (await as(eve, { url: '/admin/api/models' })).json();
    expect([models.tenant, models.models[0].can]).toEqual(['acme', { add: true, change: true, delete: false }]);
    expect((await as(eve, { url: '/admin/api/Book', headers: inTenant('globex') })).json().count).toBe(1);
    // The grants() of the rbac reads the memberships by email: grants in the claims of a user are not asked.
    const nobody = await as({ email: 'nobody@example.com', grants: { acme: 'manager' } }, { url: '/admin/api/models' });
    expect([nobody.statusCode, nobody.json().error]).toEqual([403, 'The admin is not for you (no roles)']);
  });

  it('sessions: its own for every user; those of others with _sessions.view and .change', async () => {
    const { browser, User, users } = await setUp();
    const eve = await browser('eve@example.com');
    const ops = await browser('ops@example.com');
    const meta = (await eve({ url: '/admin/api/models' })).json();
    expect(meta.sessions).toEqual({ others: false, end: false });
    expect((await eve({ url: '/admin/api/_account/sessions' })).json().results).toHaveLength(1);
    const max = await User.objects.using(users).get({ email: 'max@example.com' });
    const denied = await eve({ url: `/admin/api/_sessions/${max.pk}` });
    expect([denied.statusCode, denied.json().error]).toEqual([403, 'You cannot do this (_sessions.view)']);
    expect((await ops({ url: `/admin/api/_sessions/${max.pk}` })).statusCode).toBe(403);
  });

  it('actions: only those the user may run, by their permissions', async () => {
    const { browser } = await setUp({
      extra: {
        modelOptions: {
          Book: { actions: { touch: () => 0, purge: { permission: 'Book.delete', run: () => 'Purged.' } } },
        },
      },
    });
    const eve = await browser('eve@example.com');
    const actionsOf = async (tenant) =>
      (await eve({ url: '/admin/api/models', headers: inTenant(tenant) })).json().models[0].actions.map((a) => a.name);
    // An editor in acme (Book.change), a viewer in globex.
    expect(await actionsOf('acme')).toEqual(['touch']);
    expect(await actionsOf('globex')).toEqual([]);
    const run = (action, tenant) =>
      eve({
        method: 'POST',
        url: `/admin/api/Book/actions/${action}`,
        headers: inTenant(tenant, WRITE),
        payload: { pks: [1] },
      });
    expect((await run('touch', 'acme')).json()).toEqual({ message: 'Touch: 0 objects', count: 0 });
    const denied = await run('purge', 'acme');
    expect([denied.statusCode, denied.json().error]).toEqual([403, 'You cannot do this (Book.delete)']);
    expect((await run('touch', 'globex')).statusCode).toBe(403);
  });

  it('related lists: only of the models the user may view', async () => {
    const { browser, memberships } = await setUp();
    memberships.push({ email: 'nobody@example.com', tenant: 'acme', role: 'authors' });
    const ann = await browser('nobody@example.com');
    const eve = await browser('eve@example.com');
    const relatedOf = async (send) =>
      (await send({ url: '/admin/api/models', headers: inTenant('acme') }))
        .json()
        .models.find((model) => model.name === 'Author').related;
    expect((await relatedOf(eve)).map((item) => item.name)).toEqual(['bookSet']);
    expect(await relatedOf(ann)).toEqual([]);
    const denied = await ann({ url: '/admin/api/Author/1/related/bookSet', headers: inTenant('acme') });
    expect([denied.statusCode, denied.json().error]).toEqual([403, 'You cannot do this (Book.view)']);
  });
});

describe('admin: rbac without tenants', () => {
  it('the roles of every tenant; options of Rbac given', async () => {
    const { Author, Book } = models();
    const db = new Database({ backend: 'memory' }).register(Author, Book);
    await db.sync();
    await Book.objects.create({ title: 'One' });
    const app = xufa();
    app.register(admin, {
      prefix: '/admin',
      models: [Book, Author],
      rbac: { roles: ROLES },
      authorize: (request) => {
        request.user = { roles: [request.headers['x-role']] };
        return true;
      },
    });
    await app.ready();
    const as = (role, request) => app.inject({ ...request, headers: { 'x-role': role, ...request.headers } });
    const viewer = (await as('viewer', { url: '/admin/api/models' })).json();
    expect([viewer.tenants, viewer.tenant]).toEqual([null, null]);
    expect(viewer.models.map((model) => model.can.add)).toEqual([false, false]);
    expect((await as('viewer', { method: 'DELETE', url: '/admin/api/Book/1', headers: WRITE })).statusCode).toBe(403);
    expect((await as('manager', { method: 'DELETE', url: '/admin/api/Book/1', headers: WRITE })).statusCode).toBe(204);
    expect((await as('operator', { url: '/admin/api/models' })).json().models).toEqual([]);
    expect(() =>
      pluginModule.configure({
        models: [],
        authorize: () => true,
        tenants: { tenants: {}, list: () => [] },
      })
    ).toThrow('tenants is the Tenants of @xufa/orm');
  });
});
