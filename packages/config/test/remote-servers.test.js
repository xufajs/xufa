// The remote sources against real servers (test/remote.test.js has a server of its own that answers as they do):
// Consul (XUFA_CONSUL_URL, as `consul agent -dev`) and Vault (XUFA_VAULT_URL and XUFA_VAULT_TOKEN, as
// `vault server -dev -dev-root-token-id=<token>`). Without them, these tests are skipped.
//
//   XUFA_CONSUL_URL=http://127.0.0.1:8500 XUFA_VAULT_URL=http://127.0.0.1:8200 XUFA_VAULT_TOKEN=root npx vyntra test/remote-servers.test.js
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteConfig, watchConfig, sources } from '../index.js';

const CONSUL = process.env.XUFA_CONSUL_URL;
const VAULT = process.env.XUFA_VAULT_URL;
const VAULT_TOKEN = process.env.XUFA_VAULT_TOKEN;

// Keys of a run of their own, removed after it.
const run = `xufa-test-${crypto.randomBytes(4).toString('hex')}`;
let cwd;
beforeAll(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-config-servers-'));
});
afterAll(() => fs.rmSync(cwd, { recursive: true, force: true }));

async function call(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok && !options.allow) throw new Error(`${options.method || 'GET'} ${url}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

describe.skipIf(!CONSUL)('Consul', () => {
  const put = (key, value) => call(`${CONSUL}/v1/kv/${run}/${key}`, { method: 'PUT', body: value });
  const load = (remote) => loadRemoteConfig({ cwd, dotenv: false, environment: { CONSUL_HTTP_ADDR: CONSUL }, remote });

  beforeAll(async () => {
    await put('shop/db/host', 'db.internal');
    await put('shop/db/pool', '{"max": 20}');
    await put('shop/name', 'shop');
    await put('shop/greeting', 'hi {{ config.name }}');
    await put('shop/empty/', ''); // a folder of the tree, without a value
    await put('doc.yaml', 'level: debug\nflags:\n  - a\n  - b\n');
  });
  afterAll(() => call(`${CONSUL}/v1/kv/${run}?recurse=true`, { method: 'DELETE' }));

  it('keys as a tree (JSON values, templates), and a key as a document', async () => {
    const config = await load([
      sources.consul({ prefix: `${run}/shop` }),
      sources.consul({ key: `${run}/doc.yaml`, at: 'logging' }),
    ]);
    expect({ ...config }).toEqual({
      db: { host: 'db.internal', pool: { max: 20 } },
      name: 'shop',
      greeting: 'hi shop',
      logging: { level: 'debug', flags: ['a', 'b'] },
    });
  });

  it('a prefix with no keys (a mistake: Consul answers 404), and a key that is not there, are errors', async () => {
    const empty = await load([sources.consul({ prefix: `${run}/nothing`, retries: 0 })]).catch((e) => e);
    expect([empty.errors[0].path, empty.errors[0].message]).toEqual([
      `consul ${run}/nothing`,
      `no keys under ${run}/nothing/`,
    ]);
    const err = await load([sources.consul({ key: `${run}/missing.json`, retries: 0 })]).catch((e) => e);
    expect(err.errors[0].message).toMatch(/404/);
  });

  it('watchConfig: a key changed in Consul is a new configuration', async () => {
    const changes = [];
    const watcher = await watchConfig(
      {
        cwd,
        dotenv: false,
        environment: { CONSUL_HTTP_ADDR: CONSUL },
        remote: [sources.consul({ prefix: `${run}/shop` })],
      },
      { interval: '1h', onChange: (next, previous, paths) => changes.push(paths) }
    );
    await put('shop/db/host', 'db2.internal');
    await watcher.refresh();
    expect([watcher.current.db.host, changes]).toEqual(['db2.internal', [['db.host']]]);
    watcher.stop();
  });

  it('watchConfig follows Consul with blocking queries: a change is read at once, not at the next interval', async () => {
    const changes = [];
    const watcher = await watchConfig(
      {
        cwd,
        dotenv: false,
        environment: { CONSUL_HTTP_ADDR: CONSUL },
        remote: [sources.consul({ prefix: `${run}/shop` })],
      },
      { interval: '1h', onChange: (next, previous, paths) => changes.push([[...paths].sort(), next.name]) }
    );
    await new Promise((resolve) => setTimeout(resolve, 300)); // the first query, for the index
    const started = Date.now();
    await put('shop/name', 'shop 2');
    for (let i = 0; i < 100 && changes.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changes).toEqual([[['greeting', 'name'], 'shop 2']]); // greeting is a template of name
    expect(Date.now() - started).toBeLessThan(3000);
    // Another change, read again at once; then stopped (its query aborted).
    await put('shop/name', 'shop 3');
    for (let i = 0; i < 100 && changes.length === 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(changes[1]).toEqual([['greeting', 'name'], 'shop 3']);
    watcher.stop();
    await put('shop/name', 'shop');
  });
});

describe.skipIf(!VAULT || !VAULT_TOKEN)('Vault', () => {
  const vault = (route, options = {}) =>
    call(`${VAULT}/v1/${route}`, {
      ...options,
      headers: { 'x-vault-token': VAULT_TOKEN, 'content-type': 'application/json', ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  const secret = { db: { password: 'p{{a}}ss' }, apiKey: 'k-1' };
  let approle;

  beforeAll(async () => {
    // KV 2 (secret/, as the dev server has it), KV 1 at a mount of the run, AppRole with a policy that reads them.
    await vault(`secret/data/${run}/shop`, { method: 'POST', body: { data: secret } });
    await vault(`sys/mounts/${run}-kv1`, { method: 'POST', body: { type: 'kv', options: { version: '1' } } });
    await vault(`${run}-kv1/shop`, { method: 'POST', body: secret });
    await vault('sys/auth/approle', { method: 'POST', body: { type: 'approle' }, allow: true });
    await vault(`sys/policies/acl/${run}`, {
      method: 'PUT',
      body: { policy: `path "secret/data/${run}/*" { capabilities = ["read"] }` },
    });
    await vault(`auth/approle/role/${run}`, { method: 'POST', body: { token_policies: [run], token_ttl: '5m' } });
    const roleId = (await vault(`auth/approle/role/${run}/role-id`)).data.role_id;
    const secretId = (await vault(`auth/approle/role/${run}/secret-id`, { method: 'POST', body: {} })).data.secret_id;
    approle = { roleId, secretId };
  });
  afterAll(async () => {
    await vault(`secret/metadata/${run}/shop`, { method: 'DELETE', allow: true });
    await vault(`sys/mounts/${run}-kv1`, { method: 'DELETE', allow: true });
    await vault(`auth/approle/role/${run}`, { method: 'DELETE', allow: true });
    await vault(`sys/policies/acl/${run}`, { method: 'DELETE', allow: true });
  });

  const load = (remote, environment = { VAULT_ADDR: VAULT, VAULT_TOKEN }) =>
    loadRemoteConfig({ cwd, dotenv: false, environment, remote });

  it('KV 2 with a token: the secret, redacted, its texts not templates', async () => {
    const config = await load([sources.vault({ path: `${run}/shop`, at: 'vault' })]);
    expect(config.vault.db.password).toBe('p{{a}}ss');
    expect(config.redacted()).toEqual({ vault: { db: { password: '[redacted]' }, apiKey: '[redacted]' } });
  });

  it('KV 1, at a mount of its own', async () => {
    const config = await load([sources.vault({ mount: `${run}-kv1`, path: 'shop', kv: 1 })]);
    expect(config.apiKey).toBe('k-1');
  });

  it('AppRole: it logs in with the role and its secret, without a token', async () => {
    const config = await load([sources.vault({ path: `${run}/shop`, ...approle })], { VAULT_ADDR: VAULT });
    expect(config.db.password).toBe('p{{a}}ss');
  });

  it('a token refused, and a secret that is not there, are errors that say so', async () => {
    const refused = await load([sources.vault({ path: `${run}/shop`, retries: 0 })], {
      VAULT_ADDR: VAULT,
      VAULT_TOKEN: 'not-a-token',
    }).catch((e) => e);
    expect(refused.errors[0].message).toMatch(/403/);
    const missing = await load([sources.vault({ path: `${run}/nothing`, retries: 0 })]).catch((e) => e);
    expect(missing.errors[0].message).toMatch(/404/);
  });
});
