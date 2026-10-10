// Remote sources (loadRemoteConfig): HTTP documents (JSON, YAML, ETag), the keys of Consul (a tree, or a document),
// the secrets of Vault (a token, AppRole, KV 1 and 2), folders of secrets; their place among the layers (after the
// files, before the variables), `at`, sensitive keys redacted, texts that are not templates, failures (all at once,
// optional, retries, timeouts, the last good ones of cacheFile); and watchConfig() reading them again.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, loadRemoteConfig, watchConfig, sources, ConfigError } from '../index.js';

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A server of the three: /config/* documents, /v1/kv/* Consul, /v1/secret/* and /v1/auth/approle/login Vault.
const state = {};
function reset() {
  Object.assign(state, {
    documents: {
      '/config/shop.json': { type: 'application/json', body: JSON.stringify({ server: { port: 8080 }, name: 'shop' }) },
      '/config/shop.yaml': { type: 'application/yaml', body: 'flags:\n  beta: true\n' },
    },
    kv: {
      'apps/shop/db/host': 'db.internal',
      'apps/shop/db/pool': '{"max": 20}',
      'apps/shop/greeting': 'hi {{ config.name }}',
      'apps/shop/': null,
      'apps/doc.yaml': 'level: debug\n',
    },
    secrets: { 'shop/production': { db: { password: 'p{{a}}ss' }, apiKey: 'k-1' } },
    tokens: new Set(['root-token']),
    requests: [],
    down: false,
    slow: 0,
  });
}
reset();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  state.requests.push({ path: url.pathname, headers: req.headers });
  if (state.slow) await tick(state.slow);
  if (state.down) {
    res.writeHead(503).end('down');
    return;
  }
  const json = (status, body) =>
    res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  const doc = state.documents[url.pathname];
  if (doc) {
    const etag = `"${crypto.createHash('sha1').update(doc.body).digest('hex')}"`;
    if (req.headers['if-none-match'] === etag) return void res.writeHead(304).end();
    return void res.writeHead(200, { 'content-type': doc.type, etag }).end(doc.body);
  }
  if (url.pathname.startsWith('/v1/kv/')) {
    if (req.headers['x-consul-token'] !== 'consul-token') return void res.writeHead(403).end('ACL not found');
    const key = decodeURIComponent(url.pathname.slice('/v1/kv/'.length));
    if (url.searchParams.has('raw')) {
      return state.kv[key] === undefined ? void res.writeHead(404).end() : void res.end(state.kv[key]);
    }
    const found = Object.entries(state.kv)
      .filter(([k]) => k.startsWith(key))
      .map(([Key, value]) => ({ Key, Value: value === null ? null : Buffer.from(value).toString('base64') }));
    return found.length ? json(200, found) : void res.writeHead(404).end();
  }
  if (url.pathname === '/v1/auth/approle/login') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { role_id: role, secret_id: secret } = JSON.parse(body);
    if (role !== 'role' || secret !== 'secret') return json(400, { errors: ['invalid role or secret ID'] });
    state.tokens.add('approle-token');
    return json(200, { auth: { client_token: 'approle-token' } });
  }
  if (url.pathname.startsWith('/v1/secret/')) {
    if (!state.tokens.has(req.headers['x-vault-token'])) return json(403, { errors: ['permission denied'] });
    const v2 = url.pathname.startsWith('/v1/secret/data/');
    const secret = state.secrets[url.pathname.slice(v2 ? '/v1/secret/data/'.length : '/v1/secret/'.length)];
    if (!secret) return json(404, { errors: [] });
    return json(200, v2 ? { data: { data: secret, metadata: { version: 3 } } } : { data: secret });
  }
  res.writeHead(404).end();
});

let base;
let cwd;
beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => {
  reset();
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-config-remote-'));
});
afterEach(() => fs.rmSync(cwd, { recursive: true, force: true }));

const environment = () => ({
  CONSUL_HTTP_ADDR: base,
  CONSUL_HTTP_TOKEN: 'consul-token',
  VAULT_ADDR: base,
  VAULT_TOKEN: 'root-token',
});
const load = (options) => loadRemoteConfig({ cwd, dotenv: false, environment: environment(), ...options });
const quiet = { onSourceError: () => {} };

describe('remote sources', () => {
  it('HTTP documents (JSON, YAML), Consul keys as a tree and a key as a document, in their order', async () => {
    const config = await load({
      remote: [
        sources.http({ url: `${base}/config/shop.json` }),
        sources.http({ url: `${base}/config/shop.yaml` }),
        sources.consul({ prefix: 'apps/shop' }),
        sources.consul({ key: 'apps/doc.yaml', at: 'logging' }),
      ],
    });
    expect({ ...config }).toEqual({
      server: { port: 8080 },
      name: 'shop',
      flags: { beta: true },
      db: { host: 'db.internal', pool: { max: 20 } },
      greeting: 'hi shop', // a template of Consul, resolved
      logging: { level: 'debug' },
    });
    expect(config.sources).toEqual([
      `http ${base}/config/shop.json`,
      `http ${base}/config/shop.yaml`,
      'consul apps/shop',
      'consul apps/doc.yaml',
    ]);
  });

  it('after the files, before the variables; the schema converts what they give', async () => {
    fs.mkdirSync(path.join(cwd, 'config'));
    fs.writeFileSync(path.join(cwd, 'config/default.json'), JSON.stringify({ server: { port: 1, host: 'localhost' } }));
    const config = await load({
      environment: { ...environment(), PORT: '9090' },
      schema: {
        server: { port: { type: 'port', env: 'PORT' }, host: { type: 'string' } },
        db: { pool: { max: { type: 'integer' } }, host: { type: 'string' } },
        greeting: { type: 'string' },
        name: { type: 'string' },
      },
      remote: [sources.http({ url: `${base}/config/shop.json` }), sources.consul({ prefix: 'apps/shop' })],
    });
    expect([config.server.port, config.server.host, config.db.pool.max]).toEqual([9090, 'localhost', 20]);
  });

  it('Vault: KV 2 with a token, KV 1, AppRole; secret: redacted, and its texts are not templates', async () => {
    const config = await load({ remote: [sources.vault({ path: 'shop/production', at: 'vault' })] });
    expect(config.vault.db.password).toBe('p{{a}}ss');
    expect(config.redacted()).toEqual({ vault: { db: { password: '[redacted]' }, apiKey: '[redacted]' } });
    const v1 = await load({ remote: [sources.vault({ path: 'shop/production', kv: 1 })] });
    expect(v1.apiKey).toBe('k-1');
    const approle = await load({
      environment: { VAULT_ADDR: base },
      remote: [sources.vault({ path: 'shop/production', roleId: 'role', secretId: 'secret' })],
    });
    expect(approle.apiKey).toBe('k-1');
    expect(state.requests.some((r) => r.headers['x-vault-token'] === 'approle-token')).toBe(true);
  });

  it('a folder of secrets: a file a key, documents by their names, hidden ones left out', async () => {
    const dir = path.join(cwd, 'secrets');
    fs.mkdirSync(path.join(dir, '..data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'db_password'), 's3cr{{e}}t\n');
    fs.writeFileSync(path.join(dir, 'features.yaml'), 'dark: true\n');
    fs.writeFileSync(path.join(dir, '.hidden'), 'x');
    const config = await load({ remote: [sources.directory({ dir, at: 'files', sensitive: true })] });
    expect({ ...config }).toEqual({ files: { db_password: 's3cr{{e}}t', features: { dark: true } } });
    expect(config.redacted().files.db_password).toBe('[redacted]');
  });

  it('failures: every one at once; optional ones left out; retried; timeouts', async () => {
    const err = await load({
      remote: [
        sources.http({ url: `${base}/config/missing.json`, retries: 0 }),
        sources.consul({ prefix: 'apps/none', retries: 0 }),
        sources.vault({ path: 'shop/production', token: 'wrong', retries: 0 }),
      ],
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect(err.errors.map((e) => e.path)).toEqual([
      `http ${base}/config/missing.json`,
      'consul apps/none',
      'vault secret/shop/production',
    ]);
    expect(err.errors[2].message).toMatch(/403/);
    const warnings = [];
    const optional = await load({
      onSourceError: (e, source) => warnings.push(source.name),
      remote: [
        sources.http({ url: `${base}/config/shop.json` }),
        sources.http({ url: `${base}/nope.json`, optional: true, retries: 0, name: 'flags' }),
      ],
    });
    expect([optional.name, warnings]).toEqual(['shop', ['flags']]);
    // Retried: down for the first attempt only.
    state.down = true;
    setTimeout(() => (state.down = false), 100);
    expect((await load({ remote: [sources.http({ url: `${base}/config/shop.json`, retries: 2 })] })).name).toBe('shop');
    state.slow = 300;
    const slow = await load({
      remote: [sources.http({ url: `${base}/config/shop.json`, timeout: 50, retries: 0 })],
    }).catch((e) => e);
    expect(slow.errors[0].message).toBe('no answer in 50 ms');
  });

  it('cacheFile: the last good trees when a source fails (never those of sensitive sources)', async () => {
    const remote = [
      sources.http({ url: `${base}/config/shop.json`, retries: 0 }),
      sources.vault({ path: 'shop/production', at: 'secrets', retries: 0 }),
    ];
    await load({ remote, cacheFile: 'cache.json' });
    const cached = JSON.parse(fs.readFileSync(path.join(cwd, 'cache.json'), 'utf8'));
    expect(Object.keys(cached)).toEqual([`http ${base}/config/shop.json`]);
    state.down = true;
    const warnings = [];
    const err = await load({ remote, cacheFile: 'cache.json', onSourceError: (e) => warnings.push(e.message) }).catch(
      (e) => e
    );
    expect(err.errors.map((e) => e.path)).toEqual(['vault secret/shop/production']); // no cache of secrets
    expect(warnings[0]).toMatch(/503.*is used/);
    const config = await load({ remote: [remote[0]], cacheFile: 'cache.json', ...quiet });
    expect(config.server.port).toBe(8080);
  });

  it('ETag: a document not changed is not sent again', async () => {
    const source = sources.http({ url: `${base}/config/shop.json` });
    await load({ remote: [source] });
    const again = await load({ remote: [source] });
    expect(again.name).toBe('shop');
    expect(state.requests[1].headers['if-none-match']).toMatch(/^"/);
  });

  it('options checked; loadConfig() says to use loadRemoteConfig()', async () => {
    expect(() => sources.http({})).toThrow(/url is required/);
    expect(() => sources.consul({ prefix: 'a', key: 'b' })).toThrow(/a prefix .* or a key/);
    await expect(load({ remote: [{ name: 'x' }] })).rejects.toThrow(/load\(\{ env, name, signal \}\)/);
    expect(() => loadConfig({ remote: [] })).toThrow(/loadRemoteConfig/);
  });
});

describe('watchConfig', () => {
  it('a new configuration when a source changes (onChange with the paths); a failure keeps the one there was', async () => {
    const changes = [];
    const errors = [];
    const watcher = await watchConfig(
      {
        cwd,
        dotenv: false,
        environment: environment(),
        remote: [sources.http({ url: `${base}/config/shop.json`, retries: 0 })],
      },
      {
        interval: '1h',
        onChange: (next, previous, paths) => changes.push([previous.server.port, next.server.port, paths]),
        onError: (e) => errors.push(e),
      }
    );
    expect(watcher.current.server.port).toBe(8080);
    await watcher.refresh();
    expect(changes).toEqual([]); // nothing changed
    state.documents['/config/shop.json'].body = JSON.stringify({ server: { port: 8081 }, name: 'shop' });
    const next = await watcher.refresh();
    expect(changes).toEqual([[8080, 8081, ['server.port']]]);
    expect(next).toBe(watcher.current);
    state.down = true;
    await watcher.refresh();
    expect([watcher.current.server.port, errors.length]).toEqual([8081, 1]);
    watcher.stop();
    await expect(watchConfig({ remote: [] }, { interval: 'soon' })).rejects.toThrow(/interval/);
  });
});
