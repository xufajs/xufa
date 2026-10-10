// Tenants: users may use the tenants of their claims (tenants, or tenant; '*' every tenant). Routes with
// { auth: { tenant: true } } (the tenant of the request) or { tenant: '*' }, with roles; and canUseTenant as the
// authorize of the tenants of @xufa/orm, checked before a tenant is entered.
import xufa from '@xufa/http';
import { Tenants, Model, fields, plugin as orm } from '@xufa/orm';
import * as auth from '../index.js';

const KEY = 'a secret of at least thirty-two bytes!';

const bearer = async (app, claims) => ({ authorization: `Bearer ${await app.auth.sign(claims)}` });

describe('tenantsOf', () => {
  it('tenants (a list) or tenant, as texts', () => {
    expect(auth.tenantsOf({ tenants: ['a', 2] })).toEqual(['a', '2']);
    expect(auth.tenantsOf({ tenant: 'a' })).toEqual(['a']);
    expect(auth.tenantsOf({ tenants: ['*'] })).toEqual(['*']);
    expect(auth.tenantsOf({})).toEqual([]);
    expect(auth.tenantsOf(null)).toEqual([]);
    expect(auth.ALL_TENANTS).toBe('*');
  });
});

describe('routes of tenants', () => {
  async function build(options) {
    const app = xufa();
    app.register(auth.plugin, { keys: KEY, ...options });
    // The tenant of the request: a parameter of the path (without the ORM).
    app.get('/t/:tenant/books', { config: { auth: { tenant: true } } }, async (request) => ({ tenant: request.params.tenant }));
    app.delete('/t/:tenant/books', { config: { auth: { tenant: true, roles: 'admin' } } }, async () => ({ deleted: true }));
    app.get('/all/stats', { config: { auth: { tenant: '*' } } }, async () => ({ every: true }));
    await app.ready();
    return app;
  }
  const of = (request) => request.params.tenant;

  it('{ tenant: true }: a user of the tenant of the request; 401 without one', async () => {
    const app = await build({ tenants: { of } });
    const ada = await bearer(app, { sub: '1', tenants: ['acme', 'globex'] });
    const grace = await bearer(app, { sub: '2', tenant: 'globex' });
    expect((await app.inject({ url: '/t/acme/books', headers: ada })).json()).toEqual({ tenant: 'acme' });
    expect((await app.inject({ url: '/t/globex/books', headers: grace })).statusCode).toBe(200);
    const denied = await app.inject({ url: '/t/acme/books', headers: grace });
    expect([denied.statusCode, denied.json().message]).toEqual([403, 'You cannot use this tenant']);
    expect((await app.inject({ url: '/t/acme/books' })).statusCode).toBe(401);
    await app.close();
  });

  it("'*' is every tenant; { tenant: '*' } is only for those users; with roles, both", async () => {
    const app = await build({ tenants: { of } });
    const root = await bearer(app, { sub: '0', tenants: ['*'], role: 'admin' });
    const member = await bearer(app, { sub: '1', tenants: ['acme'], role: 'user' });
    const memberAdmin = await bearer(app, { sub: '2', tenants: ['acme'], role: 'admin' });
    expect((await app.inject({ url: '/t/anything/books', headers: root })).statusCode).toBe(200);
    expect((await app.inject({ url: '/all/stats', headers: root })).json()).toEqual({ every: true });
    const notGlobal = await app.inject({ url: '/all/stats', headers: member });
    expect([notGlobal.statusCode, notGlobal.json().message]).toEqual([403, 'You cannot use every tenant']);
    expect((await app.inject({ method: 'DELETE', url: '/t/acme/books', headers: member })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: '/t/acme/books', headers: memberAdmin })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/t/globex/books', headers: memberAdmin })).statusCode).toBe(403);
    await app.close();
  });

  it('tenants of a user of your own (claim), and a request without tenant', async () => {
    const app = xufa();
    app.register(auth.plugin, {
      keys: KEY,
      tenants: { of: (request) => request.headers['x-tenant'], claim: (user) => user.orgs || [] },
    });
    app.get('/books', { config: { auth: { tenant: true } } }, async () => ({ ok: true }));
    await app.ready();
    const user = await bearer(app, { sub: '1', orgs: ['acme'] });
    expect((await app.inject({ url: '/books', headers: { ...user, 'x-tenant': 'acme' } })).statusCode).toBe(200);
    const none = await app.inject({ url: '/books', headers: user });
    expect([none.statusCode, none.json().message]).toEqual([403, 'The request has no tenant']);
    expect(await app.auth.tenantsOf({ orgs: ['x'] })).toEqual(['x']);
    await app.close();
  });

  it('a tenant of a rule that is not true nor *: the app does not start (routes added after the plugin)', async () => {
    const app = xufa();
    app.register(auth.plugin, { keys: KEY });
    app.register(async (scope) => {
      scope.get('/x', { config: { auth: { tenant: 'acme' } } }, async () => ({}));
    });
    await expect(app.ready()).rejects.toThrow(/The tenant of a rule of auth is true \(of the request\) or '\*'/);
  });

  it('... and routes declared before the plugin answer 500 with why', async () => {
    const app = xufa();
    app.get('/x', { config: { auth: { tenant: 'acme' } } }, async () => ({}));
    app.register(auth.plugin, { keys: KEY });
    await app.ready();
    const res = await app.inject({ url: '/x', headers: await bearer(app, { sub: '1' }) });
    expect([res.statusCode, res.json().message]).toEqual([500, expect.stringMatching(/true \(of the request\) or '\*'/)]);
    await app.close();
  });
});

describe('with the tenants of @xufa/orm', () => {
  it('canUseTenant as their authorize: refused before the tenant is entered; its queries in the tenant', async () => {
    class Note extends Model {
      static fields = { text: fields.string() };
    }
    const looked = [];
    const tenants = new Tenants({
      models: [Note],
      config: (id) => {
        looked.push(id);
        return { backend: 'memory' };
      },
      setup: (db) => db.sync(),
    });
    const app = xufa();
    app.register(auth.plugin, { keys: KEY });
    app.register(orm, {
      tenants: {
        tenants,
        resolve: (request) => request.headers['x-tenant'],
        authorize: (request, id, reply) => app.auth.canUseTenant(request, id, reply),
      },
    });
    app.post('/notes', { config: { auth: { tenant: true } } }, async (request) => Note.objects.create(request.body));
    app.get('/notes', { config: { auth: { tenant: true } } }, async () => Note.objects.valuesList('text', { flat: true }));
    await app.ready();
    const ada = { ...(await bearer(app, { sub: '1', tenants: ['acme'] })), 'x-tenant': 'acme' };
    expect((await app.inject({ method: 'POST', url: '/notes', headers: ada, payload: { text: 'hello' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/notes', headers: ada })).json()).toEqual(['hello']);
    const intruder = { ...(await bearer(app, { sub: '2', tenants: ['globex'] })), 'x-tenant': 'acme' };
    expect((await app.inject({ url: '/notes', headers: intruder })).statusCode).toBe(403);
    const anonymous = await app.inject({ url: '/notes', headers: { 'x-tenant': 'acme' } });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.headers['www-authenticate']).toMatch(/^Bearer/);
    const other = { ...(await bearer(app, { sub: '3', tenants: ['acme'] })), 'x-tenant': 'globex' };
    expect((await app.inject({ url: '/notes', headers: other })).statusCode).toBe(403);
    expect(looked).toEqual(['acme']); // globex was never looked up
    await app.close();
  });
});
