// The keys of the JWTs of each tenant: a KeySet by tenant, made from the records of a store, kept a while in memory,
// rotated, revoked, and published as a JWKS. The private keys are kept encrypted in the store: with a passphrase
// (PKCS#8, for RS, PS, ES and EdDSA) or AES-256-GCM (HMAC secrets), each derived from the secret of the vault, the
// tenant and the key, so a copy of the store is no key, and the key of one tenant cannot be moved to another.
//
//   const vault = new KeyVault({ secret: process.env.VAULT_SECRET, store: vaultModelStore(TenantKeys) });
//   await vault.create('acme');                            // the first key of a tenant (ES256 by default)
//   app.register(auth.plugin, { keys: (request) => vault.keys(tenantOf(request)), ... });
//   await vault.rotate('acme');                            // a new key, signing after `ttl`; the old one still verifies
//   app.get('/.well-known/jwks.json', (request) => vault.jwks(tenantOf(request)));
//
// Rotation without failures in a cluster: each process keeps the KeySet of a tenant `ttl` (5 minutes), so a new key
// is published at once (it verifies) and signs only `ttl` after, when every process has loaded it: no process meets a
// token of a key it does not know. The key it replaces still verifies for `keep` (a day) after it stops signing, as
// long as the tokens it signed may live. The records change by compare-and-swap on their version: two processes that
// rotate at once do not lose a key.
const crypto = require('node:crypto');
const { KeySet, HMAC } = require('./keys');
const { seconds } = require('./duration');

const ALGORITHMS = {
  HS256: { kind: 'secret', bytes: 32 },
  HS384: { kind: 'secret', bytes: 48 },
  HS512: { kind: 'secret', bytes: 64 },
  RS256: { kind: 'rsa' },
  RS384: { kind: 'rsa' },
  RS512: { kind: 'rsa' },
  PS256: { kind: 'rsa' },
  PS384: { kind: 'rsa' },
  PS512: { kind: 'rsa' },
  ES256: { kind: 'ec', curve: 'prime256v1' },
  ES384: { kind: 'ec', curve: 'secp384r1' },
  ES512: { kind: 'ec', curve: 'secp521r1' },
  EdDSA: { kind: 'ed25519' },
};

class VaultError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

// A store of the records of the tenants, in memory (for tests and one process): the records are kept as JSON, as a
// database would. put(tenant, record, version): only when the record has that version (null: when there is none).
class MemoryKeyStore {
  constructor() {
    this.records = new Map();
  }

  async get(tenant) {
    const text = this.records.get(tenant);
    return text === undefined ? null : JSON.parse(text);
  }

  // Compare and swap, with nothing awaited between the two: atomic in the process.
  async put(tenant, record, version) {
    const text = this.records.get(tenant);
    const current = text === undefined ? null : JSON.parse(text).version;
    if (current !== version) return false;
    this.records.set(tenant, JSON.stringify(record));
    return true;
  }

  async delete(tenant) {
    this.records.delete(tenant);
  }
}

// A store on a model of @xufa/orm with the fields of vaultFields(fields).
function vaultModelStore(Model) {
  return {
    async get(tenant) {
      const row = await Model.objects.filter({ tenant }).first();
      return row ? { version: Number(row.version), keys: row.keys } : null;
    },
    async put(tenant, record, version) {
      const values = { keys: record.keys, version: record.version, updatedAt: new Date() };
      if (version === null) {
        try {
          await Model.objects.create({ tenant, ...values });
          return true;
        } catch (err) {
          if (err && err.name === 'UniqueError') return false; // created by another process meanwhile
          throw err;
        }
      }
      return (await Model.objects.filter({ tenant, version }).update(values)) > 0;
    },
    async delete(tenant) {
      await Model.objects.filter({ tenant }).delete();
    },
  };
}

// The fields of a model of the keys of the tenants, for vaultModelStore, made with the fields of @xufa/orm:
//
//   class TenantKeys extends Model {
//     static fields = vaultFields(fields);
//   }
function vaultFields(fields) {
  return {
    tenant: fields.string({ primaryKey: true, maxLength: 255 }),
    keys: fields.json(),
    version: fields.integer(),
    updatedAt: fields.datetime(),
  };
}

const newId = () => `k${Date.now().toString(36)}${crypto.randomBytes(6).toString('base64url')}`;

class KeyVault {
  // secret: 32 bytes or more (the keys of the store are encrypted with it). store: a MemoryKeyStore by default.
  // algorithm: of the keys made (ES256). ttl: how long a KeySet is kept in memory, and how long a new key waits to
  // sign (5m). keep: how long a key verifies after it stops signing (1d; longer than the tokens live). rotateAfter: a
  // key older is rotated when its tenant is used (none). max: tenants kept in memory (1000). autoCreate: keys() of a
  // tenant without keys makes them (false: an error; tenants may come from what clients send).
  constructor({
    secret,
    store = new MemoryKeyStore(),
    algorithm = 'ES256',
    ttl = '5m',
    keep = '1d',
    rotateAfter,
    max = 1000,
    autoCreate = false,
  } = {}) {
    if (secret === undefined || Buffer.byteLength(secret) < 32) {
      throw new VaultError('A KeyVault needs a secret of 32 bytes or more', 'XUFA_AUTH_VAULT_SECRET');
    }
    if (!ALGORITHMS[algorithm])
      throw new VaultError(`Not an algorithm of JWTs: ${algorithm}`, 'XUFA_AUTH_VAULT_ALGORITHM');
    this.secret = Buffer.from(secret);
    this.store = store;
    this.algorithm = algorithm;
    this.ttl = seconds(ttl, 'ttl') * 1000;
    this.keep = seconds(keep, 'keep') * 1000;
    this.rotateAfter = rotateAfter === undefined ? null : seconds(rotateAfter, 'rotateAfter') * 1000;
    if (this.keep < this.ttl) {
      throw new VaultError('keep must be as long as ttl at least (processes keep keys ttl)', 'XUFA_AUTH_VAULT_OPTIONS');
    }
    this.max = max;
    this.autoCreate = autoCreate;
    this.cache = new Map(); // tenant => { keys: KeySet, until, record }, the least used first
    this.loading = new Map(); // tenant => promise
  }

  // --- The KeySets.

  // The KeySet of a tenant: the keys that verify, and the one that signs now.
  async keys(tenant) {
    const id = this.#tenantId(tenant);
    const cached = this.cache.get(id);
    if (cached && cached.until > Date.now()) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return cached.keys;
    }
    if (!this.loading.has(id)) {
      const loading = this.#load(id).finally(() => this.loading.delete(id));
      this.loading.set(id, loading);
    }
    return this.loading.get(id);
  }

  // The public keys of a tenant as a JWKS (/.well-known/jwks.json): HMAC secrets are not in it.
  async jwks(tenant) {
    return (await this.keys(tenant)).toJWKS();
  }

  // Forgets the KeySet of a tenant in this process (the others load it again after ttl).
  invalidate(tenant) {
    if (tenant === undefined) this.cache.clear();
    else this.cache.delete(String(tenant));
  }

  async #load(id) {
    let record = await this.store.get(id);
    if (!record) {
      if (!this.autoCreate) throw new VaultError(`The tenant ${id} has no keys`, 'XUFA_AUTH_VAULT_NO_KEYS');
      record = await this.#change(id, (current) => current || this.#first(id), { create: true });
    }
    if (this.rotateAfter !== null) {
      const signing = this.#signingOf(record, Date.now());
      if (signing && Date.now() - signing.createdAt >= this.rotateAfter && !this.#pending(record, Date.now())) {
        record = await this.#change(id, (current) => this.#rotated(id, current, {}));
      }
    }
    const keys = this.#keySetOf(id, record);
    this.cache.set(id, { keys, until: Date.now() + this.ttl });
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value);
    return keys;
  }

  // --- Changes.

  // The first key of a tenant; an error when it has keys.
  async create(tenant, { algorithm = this.algorithm } = {}) {
    const id = this.#tenantId(tenant);
    await this.#change(
      id,
      (current) => {
        if (current) throw new VaultError(`The tenant ${id} has keys already`, 'XUFA_AUTH_VAULT_EXISTS');
        return this.#first(id, algorithm);
      },
      { create: true }
    );
    this.invalidate(id);
    return this.keys(id);
  }

  // A new key: it verifies at once and signs after ttl (immediate: at once, when a key is compromised: other
  // processes may refuse its tokens until they load it, within ttl). The key it replaces verifies `keep` more.
  async rotate(tenant, { algorithm, immediate = false } = {}) {
    const id = this.#tenantId(tenant);
    await this.#change(id, (current) => {
      if (!current) throw new VaultError(`The tenant ${id} has no keys`, 'XUFA_AUTH_VAULT_NO_KEYS');
      return this.#rotated(id, current, { algorithm, immediate });
    });
    this.invalidate(id);
    return this.keys(id);
  }

  // Removes a key at once (it verifies no more): a key that leaked. The current one cannot be revoked without
  // another to sign: rotate({ immediate: true }) first.
  async revoke(tenant, keyId) {
    const id = this.#tenantId(tenant);
    await this.#change(id, (current) => {
      if (!current || !current.keys.some((key) => key.id === keyId)) {
        throw new VaultError(`The tenant ${id} has no key ${keyId}`, 'XUFA_AUTH_VAULT_NO_KEYS');
      }
      const now = Date.now();
      const keys = current.keys.filter((key) => key.id !== keyId);
      if (!keys.some((key) => key.activeAt <= now && !key.retiredAt)) {
        throw new VaultError(`${keyId} is the key that signs: rotate first`, 'XUFA_AUTH_VAULT_CURRENT');
      }
      return { version: current.version + 1, keys };
    });
    this.invalidate(id);
  }

  // Removes every key of a tenant.
  async remove(tenant) {
    const id = this.#tenantId(tenant);
    await this.store.delete(id);
    this.invalidate(id);
  }

  // Changes the record of a tenant by `fn(current)`, again while another process changed it meanwhile.
  async #change(id, fn, { create = false } = {}) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const current = await this.store.get(id);
      if (!current && !create) throw new VaultError(`The tenant ${id} has no keys`, 'XUFA_AUTH_VAULT_NO_KEYS');
      const next = fn(current);
      if (next === current) return current;
      if (await this.store.put(id, next, current ? current.version : null)) return next;
    }
    throw new VaultError(`The keys of ${id} changed too often to change them`, 'XUFA_AUTH_VAULT_CONFLICT');
  }

  #first(id, algorithm = this.algorithm) {
    const now = Date.now();
    return { version: 1, keys: [this.#newKey(id, algorithm, now)] };
  }

  #rotated(id, current, { algorithm, immediate }) {
    const now = Date.now();
    const signing = this.#signingOf(current, now);
    const activeAt = immediate ? now : now + this.ttl;
    const key = this.#newKey(id, algorithm || (signing ? signing.algorithm : this.algorithm), activeAt);
    const keys = current.keys
      // Keys that are no more needed: they stopped signing more than `keep` ago.
      .filter((each) => !each.retiredAt || each.retiredAt + this.keep > now)
      // Keys waiting to sign: the new one replaces them.
      .filter((each) => each.activeAt <= now || each.retiredAt)
      .map((each) => (each.activeAt <= now && !each.retiredAt ? { ...each, retiredAt: activeAt } : each));
    return { version: current.version + 1, keys: [...keys, key] };
  }

  // The key that signs at `now`: the newest active one that has not retired.
  #signingOf(record, now) {
    const active = record.keys.filter((key) => key.activeAt <= now && (!key.retiredAt || key.retiredAt > now));
    return active.sort((a, b) => b.activeAt - a.activeAt)[0];
  }

  #pending(record, now) {
    return record.keys.some((key) => key.activeAt > now);
  }

  // --- Keys, encrypted.

  #newKey(tenant, algorithm, activeAt) {
    const spec = ALGORITHMS[algorithm];
    if (!spec) throw new VaultError(`Not an algorithm of JWTs: ${algorithm}`, 'XUFA_AUTH_VAULT_ALGORITHM');
    const id = newId();
    const base = { id, algorithm, createdAt: Date.now(), activeAt, retiredAt: null };
    if (spec.kind === 'secret') {
      return { ...base, secret: this.#seal(tenant, id, crypto.randomBytes(spec.bytes)) };
    }
    let pair;
    if (spec.kind === 'rsa') pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    else if (spec.kind === 'ec') pair = crypto.generateKeyPairSync('ec', { namedCurve: spec.curve });
    else pair = crypto.generateKeyPairSync('ed25519');
    return {
      ...base,
      privateKey: pair.privateKey.export({
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: this.#passphrase(tenant, id),
      }),
      publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' }),
    };
  }

  #derived(tenant, keyId) {
    return Buffer.from(crypto.hkdfSync('sha256', this.secret, `tenant:${tenant}`, `xufa-keyvault:${keyId}`, 32));
  }

  #passphrase(tenant, keyId) {
    return this.#derived(tenant, keyId).toString('base64url');
  }

  // An HMAC secret, sealed: "iv.ciphertext.tag" in base64url, the tenant and key as additional data.
  #seal(tenant, keyId, secret) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.#derived(tenant, keyId), iv);
    cipher.setAAD(Buffer.from(`${tenant}\u0000${keyId}`));
    const sealed = Buffer.concat([cipher.update(secret), cipher.final()]);
    return [iv, sealed, cipher.getAuthTag()].map((part) => part.toString('base64url')).join('.');
  }

  #open(tenant, keyId, text) {
    const [iv, sealed, tag] = String(text)
      .split('.')
      .map((part) => Buffer.from(part, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.#derived(tenant, keyId), iv);
    decipher.setAAD(Buffer.from(`${tenant}\u0000${keyId}`));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed), decipher.final()]);
  }

  // The KeySet of a record now: every key that verifies, the one that signs as current.
  #keySetOf(tenant, record) {
    const now = Date.now();
    const usable = record.keys.filter((key) => !key.retiredAt || key.retiredAt + this.keep > now);
    const signing = this.#signingOf(record, now);
    if (!signing) throw new VaultError(`The tenant ${tenant} has no key that signs`, 'XUFA_AUTH_VAULT_NO_KEYS');
    const keys = {};
    try {
      for (const key of usable) {
        keys[key.id] = HMAC[key.algorithm]
          ? { key: this.#open(tenant, key.id, key.secret), algorithm: key.algorithm }
          : { key: key.privateKey, passphrase: this.#passphrase(tenant, key.id), algorithm: key.algorithm };
      }
      // The private keys are decrypted here.
      return new KeySet({ current: signing.id, keys });
    } catch {
      throw new VaultError(
        `The keys of ${tenant} cannot be read with the secret of this vault (another secret, or another tenant)`,
        'XUFA_AUTH_VAULT_SECRET'
      );
    }
  }

  #tenantId(tenant) {
    if (tenant === undefined || tenant === null || tenant === '') {
      throw new VaultError('A tenant is needed', 'XUFA_AUTH_VAULT_TENANT');
    }
    return String(tenant);
  }
}

module.exports = { KeyVault, MemoryKeyStore, vaultModelStore, vaultFields, VaultError };
