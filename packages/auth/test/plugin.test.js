// The plugin in an app of @xufa/http: routes that need a user, roles, the tokens of headers, cookies and queries,
// and the routes of logging in, refreshing and logging out.
const xufa = require('@xufa/http');
const auth = require('..');

const KEY = 'a secret of at least thirty-two bytes!';
const FAST = { ln: 10 };

async function makeUsers() {
  const users = [
    { id: 1, email: 'ada@example.com', password: await auth.hashPassword('analytical', FAST), role: 'admin' },
    { id: 2, email: 'grace@example.com', password: await auth.hashPassword('cobol', FAST), role: 'user' },
    {
      id: 3,
      email: 'alan@example.com',
      password: await auth.hashPassword('enigma', FAST),
      role: 'user',
      totpSecret: auth.generateSecret(),
      lastTotpStep: null,
    },
  ];
  return users;
}

function buildApp(options = {}, users = []) {
  const app = xufa();
  app.register(auth.plugin, {
    keys: KEY,
    login: {
      findUser: (email) => users.find((user) => user.email === email.toLowerCase()) || null,
      claims: (user) => ({ sub: String(user.id), role: user.role }),
      totp: (user) => user.totpSecret,
      lastTotpStep: (user) => user.lastTotpStep,
      onTotp: (user, step) => {
        user.lastTotpStep = step;
      },
      passwordOptions: FAST,
      lockout: { maxAttempts: 3 },
      ...options.login,
    },
    ...options.plugin,
  });
  app.register(async (child) => {
    child.get('/public', (request) => ({ user: request.user && request.user.sub }));
    child.get('/me', { onRequest: child.authenticate }, (request) => request.user);
    child.get('/admin', { config: { auth: ['admin'] } }, () => ({ ok: true }));
    child.get('/mine/:id', { config: { auth: (user, request) => user.sub === request.params.id } }, () => ({ ok: true }));
  });
  return app;
}

const login = (app, payload) => app.inject({ method: 'POST', url: '/auth/login', payload });
const bearer = (token) => ({ authorization: `Bearer ${token}` });

describe('auth plugin', () => {
  let users;

  beforeEach(async () => {
    users = await makeUsers();
  });

  it('gives tokens to users that log in, and their routes to them', async () => {
    const app = buildApp({}, users);
    const res = await login(app, { username: 'Ada@example.com', password: 'analytical' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(auth.decodeJwt(body.accessToken).payload).toMatchObject({ sub: '1', role: 'admin' });
    const me = await app.inject({ url: '/me', headers: bearer(body.accessToken) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ sub: '1', role: 'admin' });
    expect((await app.inject({ url: '/admin', headers: bearer(body.accessToken) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/mine/1', headers: bearer(body.accessToken) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/mine/2', headers: bearer(body.accessToken) })).statusCode).toBe(403);
    expect((await app.inject({ url: '/public', headers: bearer(body.accessToken) })).json()).toEqual({ user: '1' });
  });

  it('answers 401 without a valid token, and 403 without the role', async () => {
    const app = buildApp({}, users);
    const none = await app.inject({ url: '/me' });
    expect(none.statusCode).toBe(401);
    expect(none.json().code).toBe('XUFA_AUTH_UNAUTHORIZED');
    expect(none.headers['www-authenticate']).toBe('Bearer realm="api"');
    const bad = await app.inject({ url: '/me', headers: bearer('nope') });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('XUFA_AUTH_INVALID_TOKEN');
    expect(bad.headers['www-authenticate']).toContain('error="invalid_token"');
    const expired = auth.signJwt({ sub: '1' }, KEY, { expiresIn: 60, now: Date.now() / 1000 - 120 });
    expect((await app.inject({ url: '/me', headers: bearer(expired) })).json().message).toBe('The token expired');
    // A route that needs no user works with a bad token too.
    expect((await app.inject({ url: '/public', headers: bearer('nope') })).json()).toEqual({ user: null });
    const { accessToken } = (await login(app, { username: 'grace@example.com', password: 'cobol' })).json();
    const forbidden = await app.inject({ url: '/admin', headers: bearer(accessToken) });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().code).toBe('XUFA_AUTH_FORBIDDEN');
  });

  it('refuses wrong credentials, and locks the account after too many', async () => {
    const app = buildApp({}, users);
    for (const payload of [
      { username: 'ada@example.com', password: 'wrong' },
      { username: 'nobody@example.com', password: 'x' },
      { username: 'ada@example.com' },
    ]) {
      const res = await login(app, payload);
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('Invalid credentials');
    }
    // The third failure (the one without password is not one) locks the account: the next login is refused.
    expect((await login(app, { username: 'ada@example.com', password: 'wrong again' })).statusCode).toBe(401);
    expect((await login(app, { username: 'ada@example.com', password: 'and again' })).statusCode).toBe(401);
    const locked = await login(app, { username: 'ada@example.com', password: 'wrong' });
    expect(locked.statusCode).toBe(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    // Locked even with the right password, until the lock ends.
    expect((await login(app, { username: 'ada@example.com', password: 'analytical' })).statusCode).toBe(429);
    expect((await login(app, { username: 'grace@example.com', password: 'cobol' })).statusCode).toBe(200);
  });

  it('asks for the code of the authenticator app, and takes each code once', async () => {
    const app = buildApp({}, users);
    const alan = users[2];
    const missing = await login(app, { username: 'alan@example.com', password: 'enigma' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().code).toBe('XUFA_AUTH_TOTP_REQUIRED');
    const wrong = await login(app, { username: 'alan@example.com', password: 'enigma', code: '000000' });
    expect(wrong.json().code).toBe('XUFA_AUTH_UNAUTHORIZED');
    const code = auth.totp(alan.totpSecret);
    const ok = await login(app, { username: 'alan@example.com', password: 'enigma', code });
    expect(ok.statusCode).toBe(200);
    expect(alan.lastTotpStep).toBe(Math.floor(Date.now() / 30000));
    const replayed = await login(app, { username: 'alan@example.com', password: 'enigma', code });
    expect(replayed.statusCode).toBe(401);
  });

  it('rotates refresh tokens, and logs out', async () => {
    const app = buildApp({}, users);
    const first = (await login(app, { username: 'ada@example.com', password: 'analytical' })).json();
    const refreshed = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: first.refreshToken } });
    expect(refreshed.statusCode).toBe(200);
    const second = refreshed.json();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(auth.decodeJwt(second.accessToken).payload).toMatchObject({ sub: '1', role: 'admin' });
    // The old one again: stolen, so the family is revoked.
    const reused = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: first.refreshToken } });
    expect(reused.statusCode).toBe(401);
    const after = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: second.refreshToken } });
    expect(after.statusCode).toBe(401);
    const again = (await login(app, { username: 'ada@example.com', password: 'analytical' })).json();
    const out = await app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: again.refreshToken } });
    expect(out.statusCode).toBe(204);
    const gone = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: again.refreshToken } });
    expect(gone.statusCode).toBe(401);
  });

  it('reloads the claims of the user when refreshing', async () => {
    const app = buildApp(
      {
        login: {
          reload: (subject) => {
            const user = users.find((item) => String(item.id) === subject);
            return user && !user.disabled ? { sub: subject, role: user.role } : null;
          },
        },
      },
      users
    );
    const first = (await login(app, { username: 'grace@example.com', password: 'cobol' })).json();
    users[1].role = 'admin';
    const second = (await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: first.refreshToken } })).json();
    expect(auth.decodeJwt(second.accessToken).payload.role).toBe('admin');
    users[1].disabled = true;
    const refused = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: second.refreshToken } });
    expect(refused.statusCode).toBe(401);
    expect(refused.json().message).toBe('The user is no longer valid');
  });

  it('keeps the refresh token in a cookie, and reads tokens from cookies and queries', async () => {
    const app = buildApp({ plugin: { refreshCookie: true, token: { cookie: 'access', query: 'token' } } }, users);
    const res = await login(app, { username: 'ada@example.com', password: 'analytical' });
    expect(res.json().refreshToken).toBeUndefined();
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toMatch(/^refresh_token=[^;]+; Path=\/auth; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
    const cookie = setCookie.split(';')[0];
    const refreshed = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie } });
    expect(refreshed.statusCode).toBe(200);
    const { accessToken } = refreshed.json();
    expect((await app.inject({ url: '/me', headers: { cookie: `a=b; access=${accessToken}` } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/me?token=${accessToken}` })).statusCode).toBe(200);
    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie: refreshed.headers['set-cookie'].split(';')[0] } });
    expect(out.statusCode).toBe(204);
    expect(out.headers['set-cookie']).toContain('Max-Age=0');
  });

  it('makes the hash of a password again when its parameters changed', async () => {
    users[0].password = await auth.hashPassword('analytical', { ln: 8 });
    const app = buildApp({ login: { rehash: (user, hash) => Object.assign(user, { password: hash }) } }, users);
    expect((await login(app, { username: 'ada@example.com', password: 'analytical' })).statusCode).toBe(200);
    expect(users[0].password.startsWith('$scrypt$ln=10,')).toBe(true);
  });

  it('uses the keys of each request (per tenant), and maps the claims to users', async () => {
    const keys = {
      acme: new auth.KeySet('the key of acme, long enough to sign'),
      globex: new auth.KeySet('the key of globex, long enough to sign'),
    };
    const app = xufa();
    app.register(auth.plugin, {
      keys: (request) => keys[request.headers['x-tenant']],
      user: (claims, request) => ({ id: Number(claims.sub), tenant: request.headers['x-tenant'] }),
    });
    app.get('/me', { config: { auth: true } }, (request) => request.user);
    await app.ready();
    const token = await app.auth.sign({ sub: '5' }, { headers: { 'x-tenant': 'acme' } });
    const ok = await app.inject({ url: '/me', headers: { ...bearer(token), 'x-tenant': 'acme' } });
    expect(ok.json()).toEqual({ id: 5, tenant: 'acme' });
    const other = await app.inject({ url: '/me', headers: { ...bearer(token), 'x-tenant': 'globex' } });
    expect(other.statusCode).toBe(401);
  });

  it('works without the routes of login', async () => {
    const app = xufa();
    app.register(auth.plugin, { keys: KEY, accessToken: { expiresIn: '1h', issuer: 'app', audience: 'api' } });
    app.get('/me', { config: { auth: true } }, (request) => request.user);
    await app.ready();
    expect((await app.inject({ method: 'POST', url: '/auth/login', payload: {} })).statusCode).toBe(404);
    const token = await app.auth.sign({ sub: '9' });
    expect(auth.decodeJwt(token).payload).toMatchObject({ iss: 'app', aud: 'api' });
    expect((await app.inject({ url: '/me', headers: bearer(token) })).json().sub).toBe('9');
    const foreign = auth.signJwt({ sub: '9' }, KEY, { issuer: 'other', audience: 'api' });
    expect((await app.inject({ url: '/me', headers: bearer(foreign) })).statusCode).toBe(401);
  });
});
