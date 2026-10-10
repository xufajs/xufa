// Roles and permissions by tenant (Rbac): patterns, inherited roles, grants in a tenant or in every one, superusers;
// the rules { can } of routes, request.can(), the tenants of users, and the permissions of the resources of @xufa/orm
// in tenants.
import xufa from '@xufa/http';
import * as orm from '@xufa/orm';

const { Tenants, Model, fields } = orm;
import * as auth from '../index.js';

const KEY = 'a secret of at least thirty-two bytes!';
const bearer = async (app, claims) => ({ authorization: `Bearer ${await app.auth.sign(claims)}` });

const ROLES = {
  viewer: ['*.view'],
  editor: { inherits: 'viewer', permissions: ['Book.add', 'Book.change'] },
  manager: { inherits: ['editor'], permissions: ['Book.*', 'Author.*'] },
  owner: ['*'],
};

describe('Rbac', () => {
  const rbac = new auth.Rbac({ roles: ROLES });

  it('patterns: exact, Book.*, *.view and *; roles take those of the roles they inherit', async () => {
    const editor = { grants: [{ role: 'editor', tenant: 'acme' }] };
    expect(await rbac.can(editor, 'Book.view', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(editor, 'Author.view', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(editor, 'Book.change', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(editor, 'Book.delete', { tenant: 'acme' })).toBe(false);
    expect(await rbac.can(editor, ['Book.view', 'Book.add'], { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(editor, ['Book.view', 'Book.delete'], { tenant: 'acme' })).toBe(false);
    const manager = { grants: { acme: 'manager' } };
    expect(await rbac.can(manager, 'Book.delete', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(manager, 'Shop.delete', { tenant: 'acme' })).toBe(false);
    // A * is a part of a name, not a dot: Book.* is not Bookshelf.view nor Book.cover.view.
    expect(await rbac.can(manager, 'Book.cover.view', { tenant: 'acme' })).toBe(false);
    expect(rbac.permissionsIn(await rbac.access(manager), 'acme')).toEqual([
      '*.view',
      'Book.add',
      'Book.change',
      'Book.*',
      'Author.*',
    ]);
  });

  it('a * matches no dot', () => {
    const only = new auth.Rbac({ roles: { books: ['Book.*'], views: ['*.view'] } });
    const access = { superuser: false, grants: [{ role: 'books', tenant: '*' }] };
    expect(only.allows(access, 'Book.view')).toBe(true);
    expect(only.allows(access, 'Bookshelf.view')).toBe(false);
    expect(only.allows(access, 'Book.cover.view')).toBe(false);
    const views = { superuser: false, grants: [{ role: 'views', tenant: '*' }] };
    expect(only.allows(views, 'Book.view')).toBe(true);
    expect(only.allows(views, 'Book.viewer')).toBe(false);
    expect(only.allows(views, 'a.b.view')).toBe(false);
  });

  it('grants by tenant: a role in one tenant is nothing in another; one in every tenant (*) is everywhere', async () => {
    const ada = {
      grants: [
        { role: 'owner', tenant: 'acme' },
        { role: 'viewer', tenant: 'globex' },
      ],
    };
    expect(await rbac.can(ada, 'Book.delete', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(ada, 'Book.delete', { tenant: 'globex' })).toBe(false);
    expect(await rbac.can(ada, 'Book.view', { tenant: 'globex' })).toBe(true);
    expect(await rbac.can(ada, 'Book.view', { tenant: 'initech' })).toBe(false);
    // Without a tenant, only the grants of every tenant.
    expect(await rbac.can(ada, 'Book.view')).toBe(false);
    const support = { grants: [{ role: 'viewer' }, { role: 'manager', tenant: 'acme' }] };
    expect(await rbac.can(support, 'Book.view', { tenant: 'anything' })).toBe(true);
    expect(await rbac.can(support, 'Book.view')).toBe(true);
    expect(await rbac.can(support, 'Book.delete', { tenant: 'acme' })).toBe(true);
    expect(await rbac.can(support, 'Book.delete', { tenant: 'globex' })).toBe(false);
    expect(rbac.tenantsIn(await rbac.access(ada))).toEqual(['acme', 'globex']);
    expect(rbac.tenantsIn(await rbac.access(support))).toEqual(['*']);
    expect(rbac.inTenant(await rbac.access(ada), 'acme')).toBe(true);
    expect(rbac.inTenant(await rbac.access(ada), 'initech')).toBe(false);
    expect(rbac.rolesIn(await rbac.access(support), 'acme')).toEqual(['viewer', 'manager']);
  });

  it('superusers may do everything in every tenant; users of roles and tenants of their claims', async () => {
    const root = { superuser: true };
    expect(await rbac.can(root, 'Anything.at.all', { tenant: 'x' })).toBe(true);
    expect(await rbac.can({ isSuperuser: true }, 'Book.delete')).toBe(true);
    expect(rbac.tenantsIn(await rbac.access(root))).toEqual(['*']);
    expect(rbac.permissionsIn(await rbac.access(root), 'x')).toEqual(['*']);
    // Roles (role or roles) in the tenants of the user (tenant or tenants), or in every tenant without them.
    expect(await rbac.access({ roles: ['viewer', 'editor'], tenants: ['a', 'b'] })).toEqual({
      superuser: false,
      grants: [
        { role: 'viewer', tenant: 'a' },
        { role: 'viewer', tenant: 'b' },
        { role: 'editor', tenant: 'a' },
        { role: 'editor', tenant: 'b' },
      ],
    });
    expect((await rbac.access({ role: 'viewer' })).grants).toEqual([{ role: 'viewer', tenant: '*' }]);
    expect(await rbac.access(null)).toEqual({ superuser: false, grants: [] });
    // A role that is not there any more gives nothing.
    expect(await rbac.can({ grants: { acme: 'gone' } }, 'Book.view', { tenant: 'acme' })).toBe(false);
    expect(rbac.tenantsIn(await rbac.access({ grants: { acme: 'gone' } }))).toEqual([]);
  });

  it('grants() and superuser() of your own (a table of memberships)', async () => {
    const memberships = [
      { user: 1, tenant: 'acme', role: 'editor' },
      { user: 1, tenant: 'globex', role: 'viewer' },
    ];
    const own = new auth.Rbac({
      roles: ROLES,
      grants: async (user) => memberships.filter((row) => row.user === user.id),
      superuser: (user) => user.staff === 'root',
    });
    expect(await own.can({ id: 1 }, 'Book.change', { tenant: 'acme' })).toBe(true);
    expect(await own.can({ id: 1 }, 'Book.change', { tenant: 'globex' })).toBe(false);
    expect(await own.can({ id: 2, staff: 'root' }, 'Book.change', { tenant: 'globex' })).toBe(true);
    expect(await own.can({ id: 3, superuser: true }, 'Book.view', { tenant: 'acme' })).toBe(false);
    const none = new auth.Rbac({ roles: ROLES, superuser: false });
    expect(await none.can({ superuser: true }, 'Book.view')).toBe(false);
  });

  it('wrong roles and grants are errors', () => {
    expect(() => new auth.Rbac({ roles: { a: { inherits: 'b' } } })).toThrow('inherits b, which is not a role');
    expect(() => new auth.Rbac({ roles: { a: { inherits: 'b' }, b: { inherits: 'a' } } })).toThrow('in a circle');
    expect(() => new auth.Rbac({ roles: { a: [''] } })).toThrow(auth.RbacError);
    expect(() => new auth.Rbac({ roles: { a: 'Book.view' } })).toThrow('is a list of permissions');
    expect(() => new auth.Rbac({ roles: ROLES, grants: 'x' })).toThrow('grants is a function');
    return expect(rbac.access({ grants: [{ tenant: 'acme' }] })).rejects.toThrow('A grant is { role, tenant }');
  });
});

describe('the rbac of the plugin', () => {
  async function build(options = {}) {
    const app = xufa();
    app.register(auth.plugin, {
      keys: KEY,
      rbac: { roles: ROLES },
      tenants: { of: (request) => request.params.tenant },
      ...options,
    });
    app.get('/t/:tenant/books', { config: { auth: { can: 'Book.view' } } }, async () => ({ ok: true }));
    app.delete('/t/:tenant/books/:id', { config: { auth: { can: 'Book.delete' } } }, async () => ({ deleted: true }));
    app.get('/t/:tenant/can', { config: { auth: true } }, async (request) => ({
      add: await request.can('Book.add'),
      remove: await request.can('Book.delete'),
      elsewhere: await request.can('Book.add', 'globex'),
      tenants: await app.auth.tenantsOf(request.user),
    }));
    await app.ready();
    return app;
  }

  it('{ can }: the permission in the tenant of the request (403 without it, 401 without a user)', async () => {
    const app = await build();
    const ada = await bearer(app, { sub: '1', grants: { acme: 'editor', globex: 'manager' } });
    expect((await app.inject({ url: '/t/acme/books', headers: ada })).statusCode).toBe(200);
    expect((await app.inject({ url: '/t/initech/books', headers: ada })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: '/t/acme/books/1', headers: ada })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: '/t/globex/books/1', headers: ada })).statusCode).toBe(200);
    expect((await app.inject({ url: '/t/acme/books' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/t/acme/can', headers: ada })).json()).toEqual({
      add: true,
      remove: false,
      elsewhere: true,
      tenants: ['acme', 'globex'],
    });
    const root = await bearer(app, { sub: '0', superuser: true });
    expect((await app.inject({ method: 'DELETE', url: '/t/initech/books/1', headers: root })).statusCode).toBe(200);
    await app.close();
  });

  it('an Rbac given, and { tenant: true } with the tenants of the grants', async () => {
    const rbac = new auth.Rbac({ roles: ROLES });
    const app = xufa();
    app.register(auth.plugin, { keys: KEY, rbac, tenants: { of: (request) => request.params.tenant } });
    app.get('/t/:tenant', { config: { auth: { tenant: true } } }, async () => ({ ok: true }));
    await app.ready();
    expect(app.auth.rbac).toBe(rbac);
    const user = await bearer(app, { sub: '1', grants: [{ role: 'viewer', tenant: 'acme' }] });
    expect((await app.inject({ url: '/t/acme', headers: user })).statusCode).toBe(200);
    expect((await app.inject({ url: '/t/globex', headers: user })).statusCode).toBe(403);
    expect(await app.auth.access({ grants: { acme: 'viewer' } })).toEqual({
      superuser: false,
      grants: [{ role: 'viewer', tenant: 'acme' }],
    });
    await app.close();
  });

  it('a rule with can needs rbac: the app does not start', async () => {
    const app = xufa();
    app.register(auth.plugin, { keys: KEY });
    app.register(async (scope) => {
      scope.get('/x', { config: { auth: { can: 'Book.view' } } }, async () => ({}));
    });
    await expect(app.ready()).rejects.toThrow('needs the option rbac');
  });
});

describe('permissions of resources in tenants', () => {
  class Book extends Model {
    static fields = { title: fields.string({ maxLength: 50 }) };
  }

  it('<Model>.view/add/change/delete by tenant, over the tenants of @xufa/orm', async () => {
    const tenants = new Tenants({ models: [Book], config: () => ({ backend: 'memory' }), setup: (db) => db.sync() });
    const app = xufa();
    app.register(auth.plugin, { keys: KEY, rbac: { roles: ROLES } });
    app.register(orm.plugin, {
      tenants: {
        tenants,
        resolve: (request) => request.headers['x-tenant'],
        authorize: (request, id, reply) => app.auth.canUseTenant(request, id, reply),
      },
    });
    app.register(orm.resource(Book, { permissions: true }), { prefix: '/notes' });
    await app.ready();
    const editor = await bearer(app, { sub: '1', grants: { acme: 'editor', globex: 'viewer' } });
    const send = (tenant, headers, request) => app.inject({ ...request, headers: { ...headers, 'x-tenant': tenant } });
    const created = await send('acme', editor, { method: 'POST', url: '/notes', payload: { title: 'a' } });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();
    expect((await send('acme', editor, { url: '/notes' })).json().count).toBe(1);
    expect(
      (await send('acme', editor, { method: 'PATCH', url: `/notes/${id}`, payload: { title: 'b' } })).statusCode
    ).toBe(200);
    expect((await send('acme', editor, { method: 'DELETE', url: `/notes/${id}` })).statusCode).toBe(403);
    // A viewer in globex: it reads, it does not write.
    expect((await send('globex', editor, { url: '/notes' })).json().count).toBe(0);
    expect((await send('globex', editor, { method: 'POST', url: '/notes', payload: { title: 'c' } })).statusCode).toBe(
      403
    );
    // Not a member of initech: 403 before its database is looked up.
    expect((await send('initech', editor, { url: '/notes' })).statusCode).toBe(403);
    const owner = await bearer(app, { sub: '2', grants: [{ role: 'owner', tenant: '*' }] });
    expect((await send('acme', owner, { method: 'DELETE', url: `/notes/${id}` })).statusCode).toBe(204);
    await app.close();
  });

  it('permissions with a name, over the rule of auth; wrong permissions are errors', () => {
    expect(() => orm.resource(Book, { permissions: 3 })).toThrow(
      'permissions of the resource of Book is true or a name'
    );
    const routes = [];
    const fake = {
      get: (path, options) => routes.push((options.config || {}).auth),
      post: (path, options) => routes.push((options.config || {}).auth),
      put: (path, options) => routes.push((options.config || {}).auth),
      patch: () => {},
      delete: (path, options) => routes.push((options.config || {}).auth),
    };
    return Promise.resolve(
      orm.resource(Book, {
        permissions: 'notes',
        auth: { list: false, get: 'admin', delete: { strategy: 'jwt' } },
        openapi: false,
      })(fake)
    ).then(() => {
      expect(routes).toEqual([
        false,
        { roles: 'admin', can: 'notes.view' },
        { can: 'notes.add' },
        { can: 'notes.change' },
        { strategy: 'jwt', can: 'notes.delete' },
      ]);
    });
  });
});

describe('rules of objects in resources', () => {
  class Note extends Model {
    static fields = { title: fields.string({ maxLength: 50 }), ownerId: fields.integer() };

    static options = { table: 'rule_notes' };
  }

  it('lists, gets, changes and deletes only the objects of the where of the roles', async () => {
    const db = new orm.Database({ backend: 'memory' }).register(Note);
    await db.sync();
    const mine = await Note.objects.create({ title: 'mine', ownerId: 1 });
    const theirs = await Note.objects.create({ title: 'theirs', ownerId: 2 });
    const app = xufa();
    app.register(auth.plugin, {
      keys: KEY,
      rbac: {
        roles: {
          writer: {
            permissions: ['Note.view', 'Note.add', 'Note.change', 'Note.delete'],
            where: {
              'Note.add': (user) => ({ ownerId: Number(user.sub) }),
              'Note.change': (user) => ({ ownerId: Number(user.sub) }),
              'Note.delete': () => false,
            },
          },
        },
      },
    });
    app.register(orm.resource(Note, { permissions: true }), { prefix: '/notes' });
    await app.ready();
    expect(await app.auth.scopeOf({ user: null }, 'Note.view')).toBe(false);
    const writer = await bearer(app, { sub: '1', roles: ['writer'] });
    expect((await app.inject({ url: '/notes', headers: writer })).json().count).toBe(2);
    const patch = (note) =>
      app.inject({ method: 'PATCH', url: `/notes/${note.pk}`, headers: writer, payload: { title: 'changed' } });
    expect([(await patch(mine)).statusCode, (await patch(theirs)).statusCode]).toEqual([200, 404]);
    expect((await app.inject({ method: 'DELETE', url: `/notes/${mine.pk}`, headers: writer })).statusCode).toBe(404);
    expect((await Note.objects.orderBy('pk')).map((note) => note.title)).toEqual(['changed', 'theirs']);
    // A note of another: not kept.
    const add = (ownerId) =>
      app.inject({ method: 'POST', url: '/notes', headers: writer, payload: { title: 'new', ownerId } });
    expect([(await add(1)).statusCode, (await add(2)).statusCode]).toEqual([201, 403]);
    expect(await Note.objects.filter({ title: 'new' }).count()).toBe(1);
    await app.close();
  });
});
