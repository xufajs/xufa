// @xufa/session: a session kept by a signed cookie (in memory and in a database of @xufa/orm), a login that
// regenerates it, flash messages, destroy, cookies forged or of old sessions, rotated secrets, CSRF tokens, and
// sessions that expire.
const xufa = require('@xufa/http');
const { Database } = require('@xufa/orm');
const { sessionPlugin, memoryStore, ormStore, parseCookies, serializeCookie, sign, unsign } = require('..');

const SECRET = 'a-secret-of-thirty-two-characters!!';

function makeApp(options = {}) {
  const app = xufa();
  app.register(sessionPlugin, { secret: SECRET, ...options });
  app.get('/count', async (request) => {
    const count = (request.session.get('count') || 0) + 1;
    request.session.set('count', count);
    return { count };
  });
  app.post('/login', async (request) => {
    request.session.regenerate().set('userId', request.body.userId);
    request.session.flash('notice', 'Welcome back');
    return { ok: true };
  });
  app.get('/me', async (request) => ({
    userId: request.session.get('userId') || null,
    notice: request.session.flash('notice') || null,
    token: request.session.csrfToken(),
  }));
  app.post('/logout', async (request) => {
    request.session.destroy();
    return { ok: true };
  });
  app.post('/transfer', async () => ({ done: true }));
  app.post('/webhook', { config: { csrf: false } }, async () => ({ done: true }));
  return app;
}

const cookieOf = (res) => {
  const header = [].concat(res.headers['set-cookie'] || [])[0];
  return header ? header.split(';')[0] : null;
};

for (const [name, store] of [
  ['memory', () => memoryStore()],
  [
    'orm',
    () => {
      const db = new Database({ backend: 'memory' });
      const made = ormStore(db);
      made.db = db;
      return made;
    },
  ],
]) {
  describe(`sessions in ${name}`, () => {
    let app;
    let sessions;

    beforeEach(async () => {
      sessions = store();
      if (sessions.db) await sessions.db.sync();
      app = makeApp({ store: sessions });
      await app.ready();
    });

    it('kept by a signed cookie: HttpOnly, SameSite=Lax, saved when it changes', async () => {
      const first = await app.inject('/count');
      expect(first.json()).toEqual({ count: 1 });
      const header = first.headers['set-cookie'];
      expect(header).toMatch(/^sid=[\w-]+\.[\w-]+; Max-Age=1209600; Path=\/; HttpOnly; SameSite=Lax$/);
      const cookie = cookieOf(first);
      expect((await app.inject({ url: '/count', headers: { cookie } })).json()).toEqual({ count: 2 });
      expect((await app.inject({ url: '/count', headers: { cookie } })).json()).toEqual({ count: 3 });
      // A request that does not use the session makes none.
      expect((await app.inject({ method: 'POST', url: '/webhook' })).headers['set-cookie']).toBe(undefined);
    });

    it('a login regenerates it (the old id is worth nothing); flash once; destroy clears the cookie', async () => {
      const before = cookieOf(await app.inject('/count'));
      const login = await app.inject({ method: 'POST', url: '/login', headers: { cookie: before }, payload: { userId: 7 } });
      const after = cookieOf(login);
      expect(after).not.toBe(before);
      const me = await app.inject({ url: '/me', headers: { cookie: after } });
      expect(me.json()).toMatchObject({ userId: 7, notice: 'Welcome back' });
      expect((await app.inject({ url: '/me', headers: { cookie: after } })).json().notice).toBe(null);
      // The id of before the login: a new session.
      expect((await app.inject({ url: '/me', headers: { cookie: before } })).json().userId).toBe(null);
      const logout = await app.inject({ method: 'POST', url: '/logout', headers: { cookie: after, 'x-csrf-token': me.json().token } });
      expect(logout.headers['set-cookie']).toMatch(/^sid=; Max-Age=0;/);
      expect((await app.inject({ url: '/me', headers: { cookie: after } })).json().userId).toBe(null);
    });
  });
}

describe('session', () => {
  it('cookies forged or signed with another secret are new sessions; rotated secrets still read the old ones', async () => {
    const store = memoryStore();
    const app = makeApp({ store });
    const cookie = cookieOf(await app.inject('/count'));
    const [, value] = cookie.split('=');
    const forged = `sid=${value.split('.')[0]}.AAAA`;
    expect((await app.inject({ url: '/count', headers: { cookie: forged } })).json()).toEqual({ count: 1 });
    const rotated = makeApp({ store, secret: ['a-new-secret-of-thirty-two-characters', SECRET] });
    const res = await rotated.inject({ url: '/count', headers: { cookie } });
    expect(res.json()).toEqual({ count: 2 });
    expect(unsign(cookieOf(res).split('=')[1], ['a-new-secret-of-thirty-two-characters'])).not.toBe(null);
    await expect(makeApp({ secret: 'short' }).ready()).rejects.toThrow(/32 characters or more/);
  });

  it('CSRF: writes of a session need its token (header or _csrf of the form), but not those without one', async () => {
    const app = makeApp({ csrf: true });
    const cookie = cookieOf(await app.inject({ method: 'POST', url: '/login', payload: { userId: 1 } }));
    const { token } = (await app.inject({ url: '/me', headers: { cookie } })).json();
    const refused = await app.inject({ method: 'POST', url: '/transfer', headers: { cookie } });
    expect([refused.statusCode, refused.json().code]).toEqual([403, 'XUFA_SESSION_CSRF']);
    expect((await app.inject({ method: 'POST', url: '/transfer', headers: { cookie, 'x-csrf-token': 'wrong' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/transfer', headers: { cookie, 'x-csrf-token': token } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/transfer', headers: { cookie }, payload: { _csrf: token } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/webhook', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/transfer' })).statusCode).toBe(200);
  });

  it('sessions expire (maxAge), in the store and in the database (a TTL index)', async () => {
    let now = Date.now();
    const store = memoryStore({ now: () => now });
    const app = makeApp({ store, maxAge: '1h' });
    const cookie = cookieOf(await app.inject('/count'));
    now += 2 * 3600000;
    expect((await app.inject({ url: '/count', headers: { cookie } })).json()).toEqual({ count: 1 });
    const db = new Database({ backend: 'memory' });
    const orm = ormStore(db);
    await db.sync();
    expect(orm.model.meta.indexes[0]).toMatchObject({ fields: ['expiresAt'], expireAfter: 0 });
    await orm.set('a', { x: 1 }, new Date(Date.now() - 1000));
    expect(await orm.get('a')).toBe(null);
  });

  it('cookies: parsed and written', () => {
    expect(parseCookies('a=1; b="two"; c=%C3%A9; a=3')).toEqual({ a: '1', b: 'two', c: 'é' });
    expect(serializeCookie('x', 'é', { maxAge: 60000, secure: true, sameSite: 'strict', domain: 'example.com' })).toBe(
      'x=%C3%A9; Max-Age=60; Domain=example.com; Path=/; HttpOnly; Secure; SameSite=Strict'
    );
    expect(unsign(sign('id', SECRET), [SECRET])).toBe('id');
    expect(unsign('id.bad', [SECRET])).toBe(null);
  });
});
