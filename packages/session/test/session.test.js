// @xufa/session: a session kept by a signed cookie (in memory and in a database of @xufa/orm), a login that
// regenerates it, flash messages, destroy, cookies forged or of old sessions, rotated secrets, CSRF tokens, and
// sessions that expire.
import xufa from '@xufa/http';
import { Database } from '@xufa/orm';
import { sessionPlugin, memoryStore, ormStore, parseCookies, serializeCookie, sign, unsign } from '../index.js';
import * as indexModule from '../index.js';

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
  // The users of sessions.
  app.post('/sign-in', async (request) => {
    await request.session.login(request.body.userId);
    request.session.set('cart', ['book']);
    return { ok: true };
  });
  app.get('/who', async (request) => ({
    user: request.session.user,
    cart: request.session.get('cart') || null,
    ended: Boolean(request.session.endedEverywhere),
    token: request.session.csrfToken(),
  }));
  app.post('/everywhere', { config: { csrf: false } }, async (request) => {
    await request.session.logoutEverywhere();
    return { ok: true };
  });
  app.post('/others', { config: { csrf: false } }, async (request) => {
    await request.session.logoutOthers();
    return { ok: true };
  });
  app.post('/end/:id', { config: { csrf: false } }, async (request) => {
    await app.sessions.logoutUser(request.params.id);
    return { ok: true };
  });
  app.post('/webhook', { config: { csrf: false } }, async () => ({ done: true }));
  // The sessions of the user of this one, and one of them ended.
  app.get('/mine', async (request) =>
    (await app.sessions.list(request.session.user)).map((item) => ({
      ...item,
      current: item.handle === request.session.handle,
    }))
  );
  app.post('/mine/:handle/end', { config: { csrf: false } }, async (request) => ({
    ended: await app.sessions.end(request.session.user, request.params.handle),
  }));
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
      const login = await app.inject({
        method: 'POST',
        url: '/login',
        headers: { cookie: before },
        payload: { userId: 7 },
      });
      const after = cookieOf(login);
      expect(after).not.toBe(before);
      const me = await app.inject({ url: '/me', headers: { cookie: after } });
      expect(me.json()).toMatchObject({ userId: 7, notice: 'Welcome back' });
      expect((await app.inject({ url: '/me', headers: { cookie: after } })).json().notice).toBe(null);
      // The id of before the login: a new session.
      expect((await app.inject({ url: '/me', headers: { cookie: before } })).json().userId).toBe(null);
      const logout = await app.inject({
        method: 'POST',
        url: '/logout',
        headers: { cookie: after, 'x-csrf-token': me.json().token },
      });
      expect(logout.headers['set-cookie']).toMatch(/^sid=; Max-Age=0;/);
      expect((await app.inject({ url: '/me', headers: { cookie: after } })).json().userId).toBe(null);
    });

    it('users: logged out of the other sessions, of every one, or by an admin; others untouched', async () => {
      // A browser: its cookie, kept as the server changes it.
      const browser = () => {
        let cookie = null;
        return async (request) => {
          const res = await app.inject({ ...request, headers: { ...(cookie ? { cookie } : {}), ...request.headers } });
          const made = cookieOf(res);
          if (made) cookie = made.endsWith('=') ? null : made;
          return res;
        };
      };
      const [laptop, phone, tablet, other] = [browser(), browser(), browser(), browser()];
      for (const [send, userId] of [
        [laptop, 7],
        [phone, 7],
        [tablet, 7],
        [other, 8],
      ]) {
        await send({ method: 'POST', url: '/sign-in', payload: { userId } });
      }
      expect((await phone({ url: '/who' })).json()).toMatchObject({ user: '7', cart: ['book'], ended: false });
      expect(await app.sessions.generationOf(7)).toBe(0);
      expect((await app.sessions.list(7)).length).toBe(3);

      // The others of the laptop: the phone and the tablet are emptied at their next request.
      await laptop({ method: 'POST', url: '/others' });
      expect((await phone({ url: '/who' })).json()).toMatchObject({ user: null, cart: null, ended: true });
      expect((await tablet({ url: '/who' })).json()).toMatchObject({ user: null, ended: true });
      expect((await laptop({ url: '/who' })).json()).toMatchObject({ user: '7', cart: ['book'], ended: false });
      expect((await other({ url: '/who' })).json()).toMatchObject({ user: '8', ended: false });
      // Emptied once: a new session after it.
      expect((await phone({ url: '/who' })).json().ended).toBe(false);

      // Logged in again on the phone (the new generation), then everywhere from it: the laptop too.
      await phone({ method: 'POST', url: '/sign-in', payload: { userId: 7 } });
      expect((await phone({ url: '/who' })).json().user).toBe('7');
      const everywhere = await phone({ method: 'POST', url: '/everywhere' });
      expect(everywhere.headers['set-cookie']).toMatch(/^sid=; Max-Age=0;/);
      expect((await laptop({ url: '/who' })).json()).toMatchObject({ user: null, ended: true });
      expect((await phone({ url: '/who' })).json().user).toBe(null);
      expect(await app.sessions.generationOf(7)).toBe(2);
      expect(await app.sessions.list(7)).toEqual([]);

      // An admin ends the sessions of another user.
      await laptop({ method: 'POST', url: '/end/8' });
      expect((await other({ url: '/who' })).json()).toMatchObject({ user: null, ended: true });
      // No user: logging out everywhere only ends this session.
      const nobody = browser();
      await nobody({ url: '/count' });
      expect((await nobody({ method: 'POST', url: '/everywhere' })).statusCode).toBe(200);
    });
  });
}

describe('session', () => {
  it('the sessions of a user: listed with their devices (never their ids), ended one by one, gone when they end', async () => {
    const store = memoryStore();
    const app = makeApp({ store });
    await app.ready();
    const browser = (agent, ip) => {
      let cookie = null;
      return async (request) => {
        const res = await app.inject({
          remoteAddress: ip,
          ...request,
          headers: { 'user-agent': agent, ...(cookie ? { cookie } : {}), ...request.headers },
        });
        const made = cookieOf(res);
        if (made) cookie = made.endsWith('=') ? null : made;
        return res;
      };
    };
    const laptop = browser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', '10.0.0.1');
    const phone = browser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1', '10.0.0.2');
    const other = browser('curl/8.0', '10.0.0.3');
    await laptop({ method: 'POST', url: '/sign-in', payload: { userId: 7 } });
    await phone({ method: 'POST', url: '/sign-in', payload: { userId: 7 } });
    await other({ method: 'POST', url: '/sign-in', payload: { userId: 8 } });
    const mine = (await laptop({ url: '/mine' })).json();
    expect(
      mine.map((item) => [item.agent.includes('iPhone') ? 'phone' : 'laptop', item.ip, item.current]).sort()
    ).toEqual([
      ['laptop', '10.0.0.1', true],
      ['phone', '10.0.0.2', false],
    ]);
    expect(mine[0]).toEqual({
      handle: expect.stringMatching(/^[\w-]{22}$/),
      agent: expect.any(String),
      ip: expect.any(String),
      since: expect.any(String),
      seen: expect.any(String),
      expiresAt: expect.any(String),
      current: expect.any(Boolean),
    });
    // Handles are not ids: no session is opened by one.
    for (const item of mine) expect(await store.get(item.handle)).toBe(null);
    // The laptop ends the phone: the phone is a new session at its next request, the laptop goes on.
    const phoneHandle = mine.find((item) => !item.current).handle;
    expect((await laptop({ method: 'POST', url: `/mine/${phoneHandle}/end` })).json()).toEqual({ ended: true });
    expect((await phone({ url: '/who' })).json().user).toBe(null);
    expect((await laptop({ url: '/who' })).json().user).toBe('7');
    expect((await laptop({ method: 'POST', url: `/mine/${phoneHandle}/end` })).json()).toEqual({ ended: false });
    // Not a session of another user: the user 8 cannot end the laptop.
    const laptopHandle = (await laptop({ url: '/mine' })).json()[0].handle;
    expect((await other({ method: 'POST', url: `/mine/${laptopHandle}/end` })).json()).toEqual({ ended: false });
    // A new id (logoutOthers) keeps the device and its time since, under a new handle.
    const before = (await laptop({ url: '/mine' })).json();
    await laptop({ method: 'POST', url: '/others' });
    const after = (await laptop({ url: '/mine' })).json();
    expect([after.length, after[0].since, after[0].handle === before[0].handle]).toEqual([1, before[0].since, false]);
    // Logged out: its list is empty; everywhere: so is that of every session.
    await laptop({ method: 'POST', url: '/logout' });
    expect(await app.sessions.list(7)).toEqual([]);
    await other({ method: 'POST', url: '/everywhere' });
    expect(await app.sessions.list(8)).toEqual([]);
  });

  it('the user of a session is kept by it: not set, listed nor cleared as a value', async () => {
    const { Session } = indexModule;
    const session = new Session('id', { __user: { id: '7', generation: 0 }, a: 1 }, { fresh: false });
    expect(session.user).toBe('7');
    expect(() => session.set('__user', {})).toThrow('__user is a key of the session itself');
    expect(() => session.set('__device', {})).toThrow('__device is a key of the session itself');
    expect(session.all()).toEqual({ a: 1 });
    expect(session.clear().user).toBe('7');
    await expect(new Session('id', {}, { fresh: true }).login(1)).rejects.toThrow('need the session plugin');
  });

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
    expect(
      (await app.inject({ method: 'POST', url: '/transfer', headers: { cookie, 'x-csrf-token': 'wrong' } })).statusCode
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/transfer', headers: { cookie, 'x-csrf-token': token } })).statusCode
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/transfer', headers: { cookie }, payload: { _csrf: token } }))
        .statusCode
    ).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/webhook', headers: { cookie } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/transfer' })).statusCode).toBe(200);
  });

  it('CSRF of a visitor without a session: its token in a signed cookie, no session kept; checked, then kept', async () => {
    const memory = memoryStore();
    const writes = [];
    const store = { ...memory, set: (id, data, expiresAt) => (writes.push(id), memory.set(id, data, expiresAt)) };
    const app = makeApp({ csrf: true, store });
    // A page with a form: the token in sid_csrf, nothing in the store, no session cookie.
    const page = await app.inject('/me');
    const cookies = [].concat(page.headers['set-cookie']);
    expect(cookies.map((item) => item.split('=')[0])).toEqual(['sid_csrf']);
    expect(cookies[0]).toMatch(/HttpOnly/);
    expect(writes).toEqual([]);
    const csrf = cookies[0].split(';')[0];
    const { token } = page.json();
    // The same token while it has no session; the cookie is not sent again.
    const again = await app.inject({ url: '/me', headers: { cookie: csrf } });
    expect([again.json().token, again.headers['set-cookie']]).toEqual([token, undefined]);
    expect(await app.sessions.csrfTokenOf(csrf)).toBe(token);
    // Its writes are checked (a login form can't be forged), those of a visitor without the cookie are not.
    expect((await app.inject({ method: 'POST', url: '/transfer', headers: { cookie: csrf } })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/transfer',
          headers: { cookie: csrf, 'x-csrf-token': 'x'.repeat(32) },
        })
      ).statusCode
    ).toBe(403);
    expect(
      (await app.inject({ method: 'POST', url: '/transfer', headers: { cookie: csrf, 'x-csrf-token': token } }))
        .statusCode
    ).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/transfer' })).statusCode).toBe(200);
    // A session that starts keeping something keeps that token: the forms already shown still work.
    const counted = await app.inject({ url: '/count', headers: { cookie: csrf } });
    const cookie = `${cookieOf(counted)}; ${csrf}`;
    expect(writes).toHaveLength(1);
    expect((await app.inject({ url: '/me', headers: { cookie } })).json().token).toBe(token);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/transfer',
          headers: { cookie: cookieOf(counted), 'x-csrf-token': token },
        })
      ).statusCode
    ).toBe(200);
    // A login makes a new one (as Django rotates it).
    const login = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { cookie, 'x-csrf-token': token },
      payload: { userId: 7 },
    });
    const after = (await app.inject({ url: '/me', headers: { cookie: `${cookieOf(login)}; ${csrf}` } })).json();
    expect(after.userId).toBe(7);
    expect(after.token).not.toBe(token);
  });

  it('rolling: the expiry pushed back once touchAfter has passed since the session was written, not at every request', async () => {
    const memory = memoryStore();
    const writes = [];
    const store = { ...memory, set: (id, data, expiresAt) => (writes.push(id), memory.set(id, data, expiresAt)) };
    const app = makeApp({ store, maxAge: '14d' });
    app.get('/read', async (request) => ({ count: request.session.get('count') || 0 }));
    const cookie = cookieOf(await app.inject('/count'));
    const id = writes[0];
    // Read soon after: nothing written, no cookie sent.
    for (let i = 0; i < 3; i += 1) {
      const res = await app.inject({ url: '/read', headers: { cookie } });
      expect([res.json().count, res.headers['set-cookie']]).toEqual([1, undefined]);
    }
    expect(writes).toHaveLength(1);
    // Written 2 hours ago (by its expiry): read now, its expiry is pushed back (the default touchAfter is 1 hour).
    const { data } = await memory.get(id);
    await memory.set(id, data, new Date(Date.now() + 14 * 86400000 - 2 * 3600000));
    const touched = await app.inject({ url: '/read', headers: { cookie } });
    expect(touched.headers['set-cookie']).toMatch(/^sid=.*Max-Age=1209600/);
    expect(writes).toHaveLength(2);
    expect((await memory.get(id)).expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 86400000 - 60000);
    // touchAfter: 0, at every request (as before); half of a short maxAge by default.
    const every = makeApp({ store, touchAfter: 0 });
    const before = writes.length;
    await every.inject({ url: '/count', headers: { cookie } });
    await every.inject({ url: '/me', headers: { cookie } });
    expect(writes.length - before).toBe(2);
    await expect(makeApp({ touchAfter: 'soon' }).ready()).rejects.toThrow(/Not a duration/);
  });

  it('the last seen time of a user: written with the session, not a write a minute', async () => {
    const memory = memoryStore();
    const writes = [];
    const store = { ...memory, set: (id, data, expiresAt) => (writes.push(id), memory.set(id, data, expiresAt)) };
    const app = makeApp({ store });
    const login = await app.inject({ method: 'POST', url: '/sign-in', payload: { userId: 'u1' } });
    const cookie = cookieOf(login);
    const [first] = await app.sessions.list('u1');
    const before = writes.length;
    // Reads soon after (an hour by default): nothing written, even 5 minutes after it was last seen.
    const id = [...writes].reverse().find((key) => !key.startsWith('user:'));
    const { data, expiresAt } = await memory.get(id);
    data.__device.seen -= 5 * 60000;
    await memory.set(id, data, expiresAt);
    await app.inject({ url: '/who', headers: { cookie } });
    await app.inject({ url: '/who', headers: { cookie } });
    expect(writes.length).toBe(before);
    // A request that changes the session writes its last seen time too.
    await app.inject({ url: '/count', headers: { cookie } });
    const [after] = await app.sessions.list('u1');
    expect(after.seen.getTime()).toBeGreaterThanOrEqual(first.seen.getTime());
    expect(writes.length).toBe(before + 1);
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

  it('the store of the ORM writes a session in one statement in SQL (an upsert), and in two in the others', async () => {
    for (const backend of ['sqlite', 'memory']) {
      const db = new Database(backend === 'sqlite' ? { backend, filename: ':memory:' } : { backend });
      const orm = ormStore(db);
      await db.connect();
      await db.sync();
      const later = new Date(Date.now() + 60000);
      await orm.set('s1', { count: 1 }, later);
      await orm.set('s1', { count: 2, nested: { list: [1, 2] } }, later);
      await orm.set('s2', { other: true }, later);
      expect([backend, (await orm.get('s1')).data]).toEqual([backend, { count: 2, nested: { list: [1, 2] } }]);
      expect(await orm.model.objects.count()).toBe(2);
      await db.close();
    }
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

describe.skipIf(!process.env.XUFA_PG_URL)('ormStore on PostgreSQL', () => {
  it('asyncCommit: writes without waiting for the disk, read back as any', async () => {
    const db = new Database({ backend: 'postgres', url: process.env.XUFA_PG_URL });
    const orm = ormStore(db, { table: 'xufa_sessions_async', model: 'AsyncSession', asyncCommit: true });
    await db.connect();
    await db.sync();
    try {
      const later = new Date(Date.now() + 60000);
      await orm.set('a1', { count: 1 }, later);
      await orm.set('a1', { count: 2, list: [1, 'two'] }, later);
      await Promise.all([orm.set('a2', { n: 2 }, later), orm.set('a3', { n: 3 }, later)]);
      expect((await orm.get('a1')).data).toEqual({ count: 2, list: [1, 'two'] });
      expect(await orm.model.objects.count()).toBe(3);
      await orm.delete('a2');
      expect(await orm.get('a2')).toBe(null);
      // The records of users (logouts everywhere) wait for the disk: they do not take a client of their own.
      const { pool } = db.backend;
      const connect = pool.connect.bind(pool);
      let clients = 0;
      pool.connect = () => ((clients += 1), connect());
      await orm.set('user:7', { generation: 1, sessions: [] }, later);
      expect([clients, (await orm.get('user:7')).data.generation]).toEqual([0, 1]);
      await orm.set('a4', { n: 4 }, later);
      expect(clients).toBe(1);
      pool.connect = connect;
    } finally {
      await orm.model.objects.all().delete();
      await db.close();
    }
  });
});
