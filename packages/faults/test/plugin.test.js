// The plugin that turns faults on and off over HTTP (for staging): protected (a token, authorize, or none: an error),
// off in production unless allowed; rules added with their options as JSON (filters as names or { regex }), listed,
// removed, released, up, cleared; expiring after `for` (never more than maxDuration), and gone when the app closes.
// The same on @xufa/http and fastify.
const xufa = require('@xufa/http');
const fastify = require('fastify');
const { Faults, cacheFaults, plugin, FaultError } = require('..');

const TOKEN = 'a-token-of-the-staging-admin';
const auth = { authorization: `Bearer ${TOKEN}` };
const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The cache of these tests, with its faults reachable (cacheFaults gives them back).
function cacheWithFaults() {
  const map = new Map([['user:1', 'ada']]);
  const cache = {
    async get(key) {
      return map.get(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
    async clear() {
      map.clear();
    },
  };
  cache.faults = cacheFaults(cache, 'cache');
  return cache;
}

function apiWithFaults() {
  const faults = new Faults({
    operations: ['get', 'post'],
    groups: { read: ['get'] },
    filters: { paths: { field: 'path', prefixes: true } },
  });
  faults.respond = (options) => faults.add('respond', options, { replace: () => ({ status: options.status }) });
  return { faults, call: (operation, path) => faults.apply({ operation, path }, () => ({ status: 200 })) };
}

for (const [name, make] of [
  ['@xufa/http', () => xufa()],
  ['fastify', () => fastify()],
]) {
  describe(`faults over HTTP (${name})`, () => {
    let app;
    let cache;
    let api;
    const call = (method, url, payload) => app.inject({ method, url, payload, headers: auth });

    beforeEach(async () => {
      cache = cacheWithFaults();
      api = apiWithFaults();
      app = make();
      await app.register(plugin, { targets: { cache, api: api.faults }, token: TOKEN, maxDuration: '1h' });
      await app.ready();
    });
    afterEach(async () => {
      await app.close();
      cache.faults.clear();
      api.faults.clear();
    });

    it('protected: 401 without the token or with another one', async () => {
      expect((await app.inject({ url: '/_faults' })).statusCode).toBe(401);
      const wrong = await app.inject({ url: '/_faults', headers: { authorization: 'Bearer another-token-entirely' } });
      expect([wrong.statusCode, wrong.headers['www-authenticate']]).toEqual([401, 'Bearer realm="faults"']);
      expect((await app.inject({ url: '/_faults', headers: { 'x-faults-token': TOKEN } })).statusCode).toBe(200);
      expect(cache.faults.rules).toEqual([]);
    });

    it('a rule from JSON (filters as names or { regex }), listed, acting on the target, removed', async () => {
      const added = await call('POST', '/_faults/cache/fail', { operations: 'read', keys: ['user:', { regex: '^session-\\d+$' }], times: 5, for: '10m' });
      expect(added.statusCode).toBe(201);
      const rule = added.json();
      expect(rule).toMatchObject({ target: 'cache', kind: 'fail', operations: ['get'], times: 5, hits: 0, active: true });
      expect(rule.filters).toEqual({ keys: ['user:', { regex: '^session-\\d+$', flags: '' }] });
      expect(Date.parse(rule.expiresAt) - Date.now()).toBeGreaterThan(9 * 60000);
      const err = await cache.get('user:1').catch((e) => e);
      expect(err).toBeInstanceOf(FaultError);
      expect(await cache.get('order:1')).toBe(undefined);
      const listed = (await call('GET', '/_faults')).json();
      expect(listed.targets.cache).toMatchObject({ operations: ['get', 'set', 'delete', 'clear'], filters: ['keys'], kinds: ['fail', 'delay', 'hang', 'down'] });
      expect(listed.targets.cache.rules).toEqual([expect.objectContaining({ id: rule.id, hits: 1 })]);
      expect(listed.targets.api.kinds).toEqual(['fail', 'delay', 'hang', 'down', 'respond']);
      expect((await call('DELETE', `/_faults/cache/rules/${rule.id}`)).statusCode).toBe(204);
      expect(await cache.get('user:1')).toBe('ada');
      expect((await call('DELETE', `/_faults/cache/rules/${rule.id}`)).statusCode).toBe(404);
    });

    it('kinds of the target (respond), hang and release, down and up, clear one or all', async () => {
      expect((await call('POST', '/_faults/api/respond', { status: 503, paths: '/payments', times: 1 })).statusCode).toBe(201);
      expect(await api.call('get', '/payments/1')).toEqual({ status: 503 });
      expect(await api.call('get', '/payments/1')).toEqual({ status: 200 });
      const hang = (await call('POST', '/_faults/api/hang', { operations: 'read' })).json();
      let done = false;
      const held = api.call('get', '/x').then(() => {
        done = true;
      });
      await tick(20);
      expect(done).toBe(false);
      expect((await call('POST', `/_faults/api/rules/${hang.id}/release`)).statusCode).toBe(200);
      await held;
      expect(done).toBe(true);
      await call('DELETE', `/_faults/api/rules/${hang.id}`);
      await call('POST', '/_faults/cache/down');
      expect(await cache.get('user:1').catch((e) => e.message)).toBe('The cache is down (a fault injected)');
      expect((await call('POST', '/_faults/cache/up')).statusCode).toBe(204);
      expect(await cache.get('user:1')).toBe('ada');
      await call('POST', '/_faults/cache/fail');
      await call('POST', '/_faults/api/fail');
      expect((await call('DELETE', '/_faults/cache')).statusCode).toBe(204);
      expect([cache.faults.rules.length, api.faults.rules.length]).toEqual([0, 1]);
      expect((await call('DELETE', '/_faults')).statusCode).toBe(204);
      expect(api.faults.rules.length).toBe(0);
    });

    it('400 for options it does not take, a bad regex, a bad duration; 404 for targets and kinds', async () => {
      const unknown = await call('POST', '/_faults/cache/fail', { keys: 'a', match: 'x => true' });
      expect([unknown.statusCode, unknown.json().message]).toEqual([400, expect.stringMatching(/does not take: match/)]);
      expect((await call('POST', '/_faults/cache/fail', { keys: { regex: '(' } })).statusCode).toBe(400);
      expect((await call('POST', '/_faults/cache/fail', { for: 'soon' })).json().message).toMatch(/for is a duration/);
      expect((await call('POST', '/_faults/cache/fail', { operations: 'drop' })).statusCode).toBe(400);
      expect((await call('POST', '/_faults/cache/delay', {})).statusCode).toBe(400); // no ms
      expect((await call('POST', '/_faults/nope/fail')).statusCode).toBe(404);
      expect((await call('POST', '/_faults/cache/respond')).statusCode).toBe(404);
      expect(cache.faults.rules).toEqual([]);
    });

    it('rules expire (for, never more than maxDuration), and those made here go when the app closes', async () => {
      await call('POST', '/_faults/cache/fail', { for: 50 });
      expect(cache.faults.rules).toHaveLength(1);
      await tick(80);
      expect(cache.faults.rules).toHaveLength(0);
      const own = cache.faults.fail({ operations: 'write' }); // not made here: stays
      await call('POST', '/_faults/cache/fail', { for: '2h' }); // capped at 1h
      const listed = (await call('GET', '/_faults')).json().targets.cache.rules;
      expect(Date.parse(listed[1].expiresAt) - Date.now()).toBeLessThanOrEqual(3600000);
      expect(listed[0].expiresAt).toBe(null);
      await app.close();
      expect(cache.faults.rules).toEqual([own]);
    });
  });
}

describe('faults plugin: registration', () => {
  const register = async (options, env) => {
    const before = process.env.NODE_ENV;
    if (env !== undefined) process.env.NODE_ENV = env;
    const app = xufa();
    try {
      await app.register(plugin, { targets: { cache: cacheWithFaults() }, ...options });
      await app.ready();
      return app;
    } finally {
      process.env.NODE_ENV = before;
    }
  };

  it('a protection is required; the token is long enough; targets have faults', async () => {
    await expect(register({})).rejects.toThrow(/needs a protection/);
    await expect(register({ token: 'short' })).rejects.toThrow(/16 characters/);
    await expect(register({ token: TOKEN, targets: { x: {} } })).rejects.toThrow(/target x is not faults/);
  });

  it('authorize(request), and auth as the config of the routes (for @xufa/auth)', async () => {
    const app = xufa();
    const seen = [];
    app.addHook('onRoute', (route) => seen.push([route.url, route.config && route.config.auth, route.method]));
    await app.register(plugin, {
      targets: { cache: cacheWithFaults() },
      authorize: (request) => request.headers['x-role'] === 'admin',
      auth: 'admin',
    });
    await app.ready();
    expect((await app.inject({ url: '/_faults' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/_faults', headers: { 'x-role': 'admin' } })).statusCode).toBe(200);
    // Every route of the faults has the rule; the files of the page (no data in them) have none.
    const pages = ['/_faults/ui', '/_faults/ui.js', '/_faults/ui.css'];
    expect(seen.filter(([url]) => !pages.includes(url)).every(([, rule]) => rule === 'admin')).toBe(true);
    expect(seen.filter(([url, , method]) => pages.includes(url) && method === 'GET').map(([, rule]) => rule)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    await app.close();
  });

  it('the page: served without the protection (it has no data), strict headers, the routes still protected', async () => {
    const app = xufa();
    await app.register(plugin, { targets: { cache: cacheWithFaults() }, token: TOKEN, path: '/ops/"faults' });
    await app.ready();
    const page = await app.inject({ url: '/ops/"faults/ui' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['content-security-policy']).toMatch(/default-src 'none'; script-src 'self'/);
    expect(page.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect([page.headers['x-content-type-options'], page.headers['cache-control']]).toEqual(['nosniff', 'no-store']);
    // The path of the routes, escaped in its attribute; no inline scripts (the CSP would refuse them).
    expect(page.body).toContain('data-base="/ops/&quot;faults"');
    expect(page.body).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
    expect(page.body).toContain('<script src="ui.js" defer></script>');
    const script = await app.inject({ url: '/ops/"faults/ui.js' });
    const style = await app.inject({ url: '/ops/"faults/ui.css' });
    expect([script.statusCode, script.headers['content-type']]).toEqual([200, 'text/javascript; charset=utf-8']);
    expect([style.statusCode, style.headers['content-type']]).toEqual([200, 'text/css; charset=utf-8']);
    // Values of the server are set as text, never as HTML.
    expect(script.body).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
    expect((await app.inject({ url: '/ops/"faults' })).statusCode).toBe(401);
    await app.close();
  });

  it('ui: false leaves the page out', async () => {
    const app = xufa();
    await app.register(plugin, { targets: { cache: cacheWithFaults() }, token: TOKEN, ui: false });
    await app.ready();
    // No route: not found, with or without the token.
    expect((await app.inject({ url: '/_faults/ui' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/_faults/ui', headers: auth })).statusCode).toBe(404);
    await app.close();
  });

  it('off in production (no routes), unless enabled with allowProduction', async () => {
    const off = await register({ token: TOKEN }, 'production');
    expect((await off.inject({ url: '/_faults', headers: auth })).statusCode).toBe(404);
    await off.close();
    await expect(register({ token: TOKEN, enabled: true }, 'production')).rejects.toThrow(/allowProduction/);
    const on = await register({ token: TOKEN, enabled: true, allowProduction: true }, 'production');
    expect((await on.inject({ url: '/_faults', headers: auth })).statusCode).toBe(200);
    await on.close();
  });
});
