// The KeyVault: the keys of each tenant, encrypted in a store, rotated without failures, and the plugin with them.
import { KeyVault, MemoryKeyStore, vaultModelStore, vaultFields, signJwt, verifyJwt } from '../index.js';
import * as auth from '../index.js';
import * as ormModule from '@xufa/orm';
import httpModule from '@xufa/http';

const SECRET = 'a secret of the vault, 32 bytes or more!';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reasonOf = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.reason || err.code;
  }
};

describe('KeyVault', () => {
  it('keys of every algorithm, a KeySet by tenant, and tenants that do not verify each other', async () => {
    const vault = new KeyVault({ secret: SECRET });
    for (const algorithm of ['HS256', 'HS512', 'RS256', 'PS256', 'ES256', 'ES384', 'ES512', 'EdDSA']) {
      const keys = await vault.create(`tenant-${algorithm}`, { algorithm });
      expect(keys.signing.algorithm).toBe(algorithm);
      const token = signJwt({ sub: algorithm }, keys);
      expect(verifyJwt(token, await vault.keys(`tenant-${algorithm}`)).sub).toBe(algorithm);
    }
    const acme = await vault.create('acme');
    await vault.create('globex');
    const token = signJwt({ sub: '1' }, acme);
    // ES256 both, other keys: the token of acme is not one of globex.
    expect(reasonOf(() => verifyJwt(token, acme))).toBe(null);
    const globexKeys = await vault.keys('globex');
    expect(reasonOf(() => verifyJwt(token, globexKeys))).toBe('signature');
    await expect(vault.create('acme')).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_EXISTS' });
    await expect(vault.keys('nobody')).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_NO_KEYS' });
    await expect(vault.keys('')).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_TENANT' });
  });

  it('keeps the private keys encrypted, readable only with its secret and by their tenant', async () => {
    const store = new MemoryKeyStore();
    const vault = new KeyVault({ secret: SECRET, store });
    await vault.create('acme');
    await vault.create('hmac', { algorithm: 'HS256' });
    const text = JSON.stringify([...store.records.values()]);
    expect(text).toMatch(/BEGIN ENCRYPTED PRIVATE KEY/);
    expect(text).not.toMatch(/BEGIN PRIVATE KEY/);
    const secretOf = (await vault.keys('hmac')).signing.secret.toString('base64url');
    expect(text).not.toContain(secretOf);
    await expect(new KeyVault({ secret: `${SECRET}!`, store }).keys('acme')).rejects.toMatchObject({
      code: 'XUFA_AUTH_VAULT_SECRET',
    });
    // The record of a tenant copied to another is no key there (each key is bound to its tenant).
    for (const tenant of ['acme', 'hmac']) {
      await store.put(`copy-of-${tenant}`, await store.get(tenant), null);
      await expect(vault.keys(`copy-of-${tenant}`)).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_SECRET' });
    }
    expect(() => new KeyVault({ secret: 'short' })).toThrow(/32 bytes/);
  });

  it('rotates: the new key verifies at once and signs after ttl; the old one verifies keep more', async () => {
    const vault = new KeyVault({ secret: SECRET, ttl: 0.15, keep: 0.4 });
    const first = await vault.create('acme');
    const oldToken = signJwt({ sub: 'old' }, first);
    const rotated = await vault.rotate('acme');
    // Published: two keys, the old one still signs.
    expect(rotated.keys.size).toBe(2);
    expect(rotated.current).toBe(first.current);
    const pendingId = [...rotated.keys.keys()].find((id) => id !== first.current);
    await sleep(200);
    const later = await vault.keys('acme');
    expect(later.current).toBe(pendingId);
    expect(verifyJwt(oldToken, later).sub).toBe('old');
    await sleep(450);
    const muchLater = await vault.keys('acme');
    expect(muchLater.keys.has(first.current)).toBe(false);
    expect(reasonOf(() => verifyJwt(oldToken, muchLater))).toBe('signature');
  });

  it('rotates at once (immediate), revokes a key, and not the one that signs', async () => {
    const vault = new KeyVault({ secret: SECRET });
    const first = await vault.create('acme');
    const leaked = signJwt({ sub: 'leaked' }, first);
    await expect(vault.revoke('acme', first.current)).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_CURRENT' });
    const now = await vault.rotate('acme', { immediate: true, algorithm: 'EdDSA' });
    expect(now.current).not.toBe(first.current);
    expect(now.signing.algorithm).toBe('EdDSA');
    await vault.revoke('acme', first.current);
    const after = await vault.keys('acme');
    expect(after.keys.has(first.current)).toBe(false);
    expect(reasonOf(() => verifyJwt(leaked, after))).not.toBe(null);
    await expect(vault.revoke('acme', 'nope')).rejects.toMatchObject({ code: 'XUFA_AUTH_VAULT_NO_KEYS' });
  });

  it('two vaults (processes) on one store do not lose a write', async () => {
    const store = new MemoryKeyStore();
    const a = new KeyVault({ secret: SECRET, store });
    const b = new KeyVault({ secret: SECRET, store });
    const created = await Promise.allSettled([a.create('acme'), b.create('acme')]);
    expect(created.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    await Promise.all([a.rotate('acme'), b.rotate('acme'), a.rotate('acme')]);
    const record = await store.get('acme');
    expect(record.version).toBe(4);
    // One key signs, one waits: rotations at once replace the waiting key.
    const now = Date.now();
    expect(record.keys.filter((key) => key.activeAt > now)).toHaveLength(1);
    expect(record.keys.filter((key) => key.activeAt <= now && !key.retiredAt)).toHaveLength(0);
  });

  it('autoCreate makes the keys of a tenant the first time; rotateAfter rotates old keys when used', async () => {
    const vault = new KeyVault({ secret: SECRET, autoCreate: true, ttl: 0.05, keep: 1, rotateAfter: 0.1 });
    const first = await vault.keys('new-tenant');
    expect(first.keys.size).toBe(1);
    await sleep(150);
    vault.invalidate();
    const second = await vault.keys('new-tenant');
    expect(second.keys.size).toBe(2); // a new key, waiting ttl to sign
    expect(second.current).toBe(first.current);
  });

  it('a store on a model of @xufa/orm', async () => {
    const { Database, Model, fields } = ormModule;
    class TenantKeys extends Model {
      static fields = vaultFields(fields);
    }
    const db = new Database({ backend: 'memory', name: 'vault-test' });
    db.register(TenantKeys);
    await db.connect();
    await db.sync();
    const store = vaultModelStore(TenantKeys);
    const vault = new KeyVault({ secret: SECRET, store });
    const keys = await vault.create('acme');
    await vault.rotate('acme');
    const other = new KeyVault({ secret: SECRET, store });
    expect((await other.keys('acme')).current).toBe(keys.current);
    expect(await store.put('acme', { version: 9, keys: [] }, 1)).toBe(false); // compare and swap
    const created = await Promise.allSettled([vault.create('globex'), other.create('globex')]);
    expect(created.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await store.get('globex')).version).toBe(1);
    await vault.remove('acme');
    expect(await store.get('acme')).toBe(null);
    await db.close();
  });
});

describe('the plugin with a KeyVault', () => {
  it('signs and verifies with the keys of the tenant of each request', async () => {
    const xufa = httpModule;
    const vault = new KeyVault({ secret: SECRET });
    await vault.create('acme');
    await vault.create('globex');
    const app = xufa();
    await app.register(auth.plugin, { keys: (request) => vault.keys(request.headers['x-tenant']) });
    app.post('/token', async (request) => ({ token: await app.auth.sign({ sub: '7' }, request) }));
    app.get('/me', { config: { auth: true } }, (request) => ({ sub: request.user.sub }));
    const tokenOf = async (tenant) =>
      (await app.inject({ method: 'POST', url: '/token', headers: { 'x-tenant': tenant } })).json().token;
    const acmeToken = await tokenOf('acme');
    const me = (tenant, token) =>
      app.inject({ url: '/me', headers: { 'x-tenant': tenant, authorization: `Bearer ${token}` } });
    expect((await me('acme', acmeToken)).json()).toEqual({ sub: '7' });
    expect((await me('globex', acmeToken)).statusCode).toBe(401);
    await app.close();
  });
});
