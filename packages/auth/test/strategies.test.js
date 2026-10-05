// The strategies of the plugin: API keys and HTTP Basic beside the access tokens (JWT), tried in order on every
// request; routes that ask for some of them; the challenges of 401 answers; and the keys and their hashes.
const xufa = require('@xufa/http');
const { Model, fields, Database } = require('@xufa/orm');
const auth = require('..');

const KEY = 'a secret of at least thirty-two bytes!';
const FAST = { ln: 10 };
const basicHeader = (username, password) => ({
  authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
});

async function setup(pluginOptions = {}, basicOptions = {}) {
  const users = [
    { id: 1, email: 'ada@example.com', password: await auth.hashPassword('analytical', FAST), role: 'admin' },
    { id: 2, email: 'grace@example.com', password: await auth.hashPassword('cobol', FAST), role: 'user' },
  ];
  const ci = auth.generateApiKey();
  const old = auth.generateApiKey({ prefix: 'old_' });
  const revoked = auth.generateApiKey();
  const records = new Map([
    [ci.id, { hash: ci.hash, subject: 1 }],
    [old.id, { hash: old.hash, subject: 2, expiresAt: new Date(Date.now() - 1000) }],
    [revoked.id, { hash: revoked.hash, subject: 2, revokedAt: new Date() }],
  ]);
  const finds = [];
  const apiKey = auth.apiKey({
    find: (id) => {
      finds.push(id);
      return records.get(id) || null;
    },
    user: (record) => users.find((user) => user.id === record.subject),
  });
  const basic = auth.basic({
    findUser: (email) => users.find((user) => user.email === email) || null,
    passwordOptions: FAST,
    ...basicOptions,
  });
  const app = xufa();
  app.register(auth.plugin, { keys: KEY, strategies: ['jwt', apiKey, basic], ...pluginOptions });
  app.register(async (child) => {
    child.get('/whoami', (request) => ({
      user: request.user && (request.user.email || request.user.sub),
      strategy: request.authStrategy,
      auth: request.auth,
    }));
    child.get('/me', { config: { auth: true } }, (request) => ({ id: request.user.id || request.user.sub }));
    child.get('/keys-only', { config: { auth: { strategy: 'apiKey' } } }, (request) => ({ id: request.user.id }));
    child.get('/admin-by-key', { config: { auth: { strategy: ['apiKey'], roles: 'admin' } } }, () => ({ ok: true }));
    child.get('/checked', { config: { auth: { check: (user) => user.id === 2 } } }, () => ({ ok: true }));
  });
  await app.ready();
  return { app, users, keys: { ci, old, revoked }, finds };
}

describe('strategies', () => {
  describe('API keys', () => {
    it('a valid key identifies its user', async () => {
      const { app, keys } = await setup();
      const res = await app.inject({ url: '/whoami', headers: { 'x-api-key': keys.ci.key } });
      expect(res.json()).toEqual({ user: 'ada@example.com', strategy: 'apiKey', auth: { apiKey: keys.ci.id } });
    });

    it('wrong, malformed, expired and revoked keys are refused', async () => {
      const { app, keys } = await setup();
      const wrong = `${keys.ci.id}.${'A'.repeat(43)}`;
      for (const key of [
        wrong,
        'nodot',
        `${keys.ci.id}.`,
        keys.old.key,
        keys.revoked.key,
        `missing.${'B'.repeat(43)}`,
      ]) {
        const open = await app.inject({ url: '/whoami', headers: { 'x-api-key': key } });
        expect(open.json().user).toBe(null);
        const closed = await app.inject({ url: '/me', headers: { 'x-api-key': key } });
        expect(closed.statusCode).toBe(401);
      }
      const expired = await app.inject({ url: '/me', headers: { 'x-api-key': keys.old.key } });
      expect(expired.json().message).toBe('The API key expired');
    });

    it('only the hash of the secret is kept, and the key cannot be made from it', () => {
      const { key, id, hash } = auth.generateApiKey();
      expect(key.startsWith(`${id}.`)).toBe(true);
      expect(id.startsWith('xk_')).toBe(true);
      const { secret } = auth.parseApiKey(key);
      expect(hash).toBe(auth.hashApiKey(secret));
      expect(hash).not.toContain(secret);
      expect(auth.verifyApiKey(secret, hash)).toBe(true);
      expect(auth.verifyApiKey(`${secret}x`, hash)).toBe(false);
      expect(auth.verifyApiKey(secret, 'short')).toBe(false);
      expect(() => auth.generateApiKey({ prefix: 'a.b' })).toThrow();
    });

    it('from the Authorization header with a scheme, and from the query only when asked', async () => {
      const ci = auth.generateApiKey();
      const app = xufa();
      app.register(auth.plugin, {
        strategies: [
          auth.apiKey({
            header: null,
            scheme: 'ApiKey',
            query: 'api_key',
            find: (id) => (id === ci.id ? { hash: ci.hash, user: { id: 7 } } : null),
          }),
        ],
      });
      app.get('/me', { config: { auth: true } }, (request) => request.user);
      const byScheme = await app.inject({ url: '/me', headers: { authorization: `ApiKey ${ci.key}` } });
      expect(byScheme.json()).toEqual({ id: 7 });
      const byQuery = await app.inject({ url: `/me?api_key=${encodeURIComponent(ci.key)}` });
      expect(byQuery.json()).toEqual({ id: 7 });
      const byHeader = await app.inject({ url: '/me', headers: { 'x-api-key': ci.key } });
      expect(byHeader.statusCode).toBe(401);
    });

    it('keys in a model of the ORM (apiKeyFields)', async () => {
      class ApiKey extends Model {
        static fields = auth.apiKeyFields(fields);
      }
      const db = new Database({ backend: 'memory' });
      db.register(ApiKey);
      await db.connect();
      await db.sync();
      try {
        const { key, id, hash } = auth.generateApiKey();
        await ApiKey.objects.create({ id, hash, subject: '42', name: 'CI', scopes: ['read'] });
        const app = xufa();
        app.register(auth.plugin, {
          strategies: [
            auth.apiKey({
              find: (given) => ApiKey.objects.filter({ id: given }).first(),
              user: (record) => ({ id: record.subject, scopes: record.scopes }),
            }),
          ],
        });
        app.get('/me', { config: { auth: true } }, (request) => request.user);
        const res = await app.inject({ url: '/me', headers: { 'x-api-key': key } });
        expect(res.json()).toEqual({ id: '42', scopes: ['read'] });
        await ApiKey.objects.filter({ id }).update({ revokedAt: new Date() });
        expect((await app.inject({ url: '/me', headers: { 'x-api-key': key } })).statusCode).toBe(401);
      } finally {
        await db.close();
      }
    });
  });

  describe('HTTP Basic', () => {
    it('a username and password identify the user', async () => {
      const { app } = await setup();
      const res = await app.inject({ url: '/whoami', headers: basicHeader('ada@example.com', 'analytical') });
      expect(res.json()).toEqual({
        user: 'ada@example.com',
        strategy: 'basic',
        auth: { username: 'ada@example.com' },
      });
    });

    it('wrong passwords, unknown users and malformed headers are 401 with the Basic challenge', async () => {
      const { app } = await setup();
      for (const headers of [
        basicHeader('ada@example.com', 'wrong'),
        basicHeader('nobody@example.com', 'analytical'),
        { authorization: `Basic ${Buffer.from('no-colon').toString('base64')}` },
      ]) {
        const res = await app.inject({ url: '/me', headers });
        expect(res.statusCode).toBe(401);
        expect(res.headers['www-authenticate']).toBe('Basic realm="api", charset="UTF-8"');
      }
    });

    it('a checked password is remembered, and a changed one is checked again', async () => {
      const { app, users } = await setup();
      // A hash that is slow to check (scrypt of 2^15): remembered, the next request does not check it.
      users[1].password = await auth.hashPassword('cobol', { ln: 15 });
      const headers = basicHeader('grace@example.com', 'cobol');
      const time = async (given) => {
        const start = process.hrtime.bigint();
        const res = await app.inject({ url: '/me', headers: given });
        return { status: res.statusCode, ms: Number(process.hrtime.bigint() - start) / 1e6 };
      };
      const first = await time(headers);
      const second = await time(headers);
      expect([first.status, second.status]).toEqual([200, 200]);
      expect(second.ms).toBeLessThan(first.ms / 3);
      // A new password: the old one no longer works, though it was remembered.
      users[1].password = await auth.hashPassword('fortran', FAST);
      expect((await time(headers)).status).toBe(401);
      expect((await time(basicHeader('grace@example.com', 'fortran'))).status).toBe(200);
    });

    it('failures lock the username (429 with Retry-After)', async () => {
      const { app } = await setup({}, { lockout: { maxAttempts: 2 } });
      const wrong = basicHeader('ada@example.com', 'wrong');
      expect((await app.inject({ url: '/me', headers: wrong })).statusCode).toBe(401);
      expect((await app.inject({ url: '/me', headers: wrong })).statusCode).toBe(401);
      const locked = await app.inject({ url: '/me', headers: basicHeader('ada@example.com', 'analytical') });
      expect(locked.statusCode).toBe(429);
      expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('several strategies', () => {
    it('tokens still work beside them, with their claims as request.auth', async () => {
      const { app } = await setup();
      const token = await app.auth.sign({ sub: '9', role: 'user' });
      const res = await app.inject({ url: '/whoami', headers: { authorization: `Bearer ${token}` } });
      expect(res.json()).toMatchObject({ user: '9', strategy: 'jwt', auth: { sub: '9', role: 'user' } });
    });

    it('without credentials: 401 with the challenge of every strategy that has one', async () => {
      const { app } = await setup();
      const res = await app.inject({ url: '/me' });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe('Bearer realm="api", Basic realm="api", charset="UTF-8"');
    });

    it('a route of some strategies refuses the others', async () => {
      const { app, keys } = await setup();
      const token = await app.auth.sign({ sub: '1', role: 'admin' });
      const byToken = await app.inject({ url: '/keys-only', headers: { authorization: `Bearer ${token}` } });
      expect(byToken.statusCode).toBe(401);
      const byKey = await app.inject({ url: '/keys-only', headers: { 'x-api-key': keys.ci.key } });
      expect(byKey.json()).toEqual({ id: 1 });
    });

    it('roles and checks of a route with strategies', async () => {
      const { app, keys } = await setup();
      expect((await app.inject({ url: '/admin-by-key', headers: { 'x-api-key': keys.ci.key } })).statusCode).toBe(200);
      const grace = basicHeader('grace@example.com', 'cobol');
      expect((await app.inject({ url: '/checked', headers: grace })).statusCode).toBe(200);
      const ada = basicHeader('ada@example.com', 'analytical');
      expect((await app.inject({ url: '/checked', headers: ada })).statusCode).toBe(403);
    });

    it('a strategy runs once per request', async () => {
      const { app, keys, finds } = await setup();
      await app.inject({ url: '/keys-only', headers: { 'x-api-key': keys.ci.key } });
      expect(finds).toEqual([keys.ci.id]);
    });

    it('a plugin of strategies only, without keys, cannot sign', async () => {
      const app = xufa();
      app.register(auth.plugin, { strategies: [auth.apiKey({ find: () => null })] });
      await app.ready();
      await expect(app.auth.sign({ sub: '1' })).rejects.toThrow(/no keys/);
    });

    it('wrong configurations are refused', async () => {
      const make = async (options) => {
        const app = xufa();
        app.register(auth.plugin, options);
        await app.ready();
      };
      await expect(make({})).rejects.toThrow(/keys or strategies/);
      await expect(make({ strategies: ['jwt'] })).rejects.toThrow(/needs keys/);
      await expect(make({ keys: KEY, strategies: ['jwt', 'jwt'] })).rejects.toThrow(/Two strategies/);
      await expect(make({ keys: KEY, strategies: [{ name: 'x' }] })).rejects.toThrow(/A strategy is/);
      expect(() => auth.apiKey({})).toThrow(/find/);
      expect(() => auth.basic({})).toThrow(/findUser/);
    });
  });
});
