// The keys of JWTs: one signs (the current one), all verify, each by its id (the `kid` of the tokens), so keys can be
// rotated: a new one signs while the tokens of the old one are still accepted until it is removed.
//
//   const keys = new KeySet({ current: '2026-10', keys: { '2026-10': process.env.JWT_KEY, '2026-07': oldKey } });
//
// A key is a secret (a string or Buffer, for HS256/384/512), or a KeyObject or PEM of node:crypto (RS, PS, ES and
// EdDSA: the private key signs, and its public key verifies). Each key has its algorithm: given ({ key, algorithm }),
// or HS256 for secrets and the algorithm its type has (RS256 for RSA, ES256/384/512 for its curve, EdDSA).
const crypto = require('node:crypto');

const HMAC = { HS256: 'sha256', HS384: 'sha384', HS512: 'sha512' };
const CURVES = { prime256v1: 'ES256', secp384r1: 'ES384', secp521r1: 'ES512' };

// The algorithms of the types of asymmetric keys.
const FAMILIES = {
  rsa: ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'],
  'rsa-pss': ['PS256', 'PS384', 'PS512'],
  ec: ['ES256', 'ES384', 'ES512'],
  ed25519: ['EdDSA'],
  ed448: ['EdDSA'],
};

const isPem = (value) => typeof value === 'string' && value.includes('-----BEGIN');

// A key as { id, algorithm, secret | privateKey + publicKey }.
function normalizeKey(id, given) {
  const entry =
    given && typeof given === 'object' && !Buffer.isBuffer(given) && !(given instanceof crypto.KeyObject)
      ? given
      : { key: given };
  const { key, algorithm } = entry;
  if (key === undefined || key === null || key === '') throw new TypeError(`The key ${id} is empty`);
  if (key instanceof crypto.KeyObject ? key.type === 'secret' : !isPem(key)) {
    const secret = key instanceof crypto.KeyObject ? key.export() : Buffer.from(key);
    const alg = algorithm || 'HS256';
    if (!HMAC[alg]) {
      throw new TypeError(`The key ${id} is a secret: its algorithm is HS256, HS384 or HS512, not ${alg}`);
    }
    // RFC 7518: a key of HMAC has at least as many bits as the hash.
    const bytes = Number(alg.slice(2)) / 8;
    if (secret.length < bytes) throw new RangeError(`The key ${id} of ${alg} must have ${bytes} bytes at least`);
    return { id, algorithm: alg, secret };
  }
  let privateKey = null;
  let publicKey;
  if (key instanceof crypto.KeyObject) {
    if (key.type === 'private') {
      privateKey = key;
      publicKey = crypto.createPublicKey(key);
    } else publicKey = key;
  } else if (/-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(key)) {
    privateKey = crypto.createPrivateKey(key);
    publicKey = crypto.createPublicKey(privateKey);
  } else publicKey = crypto.createPublicKey(key);
  const type = publicKey.asymmetricKeyType;
  const allowed = FAMILIES[type];
  if (!allowed) throw new TypeError(`The key ${id} is of a type JWTs do not use: ${type}`);
  let alg = algorithm;
  if (!alg) alg = type === 'ec' ? CURVES[publicKey.asymmetricKeyDetails.namedCurve] : allowed[0];
  if (!allowed.includes(alg)) throw new TypeError(`The key ${id} (${type}) cannot be of ${alg}`);
  if (type === 'ec' && CURVES[publicKey.asymmetricKeyDetails.namedCurve] !== alg) {
    throw new TypeError(`The key ${id} is of the curve ${publicKey.asymmetricKeyDetails.namedCurve}, not of ${alg}`);
  }
  return { id, algorithm: alg, privateKey, publicKey };
}

class KeySet {
  // new KeySet(secret) (one key, its id 'default'), or new KeySet({ current, keys: { id: key | { key, algorithm } } }).
  constructor(options) {
    const set =
      options && typeof options === 'object' && !Buffer.isBuffer(options) && options.keys
        ? options
        : { current: 'default', keys: { default: options } };
    const ids = Object.keys(set.keys);
    if (!ids.length) throw new TypeError('A KeySet needs a key');
    this.keys = new Map(ids.map((id) => [id, normalizeKey(id, set.keys[id])]));
    this.current = set.current === undefined ? ids[0] : set.current;
    if (!this.keys.has(this.current)) throw new TypeError(`The current key ${this.current} is not one of the keys`);
  }

  // The key that signs.
  get signing() {
    const key = this.keys.get(this.current);
    if (!key.secret && !key.privateKey) throw new TypeError(`The key ${key.id} has no private key: it cannot sign`);
    return key;
  }

  get(id) {
    return this.keys.get(id);
  }

  // The keys that may have signed a token: the one of its kid, or (without kid) every key of its algorithm.
  candidates(kid, algorithm) {
    if (kid !== undefined) {
      const key = this.keys.get(kid);
      return key && key.algorithm === algorithm ? [key] : [];
    }
    return [...this.keys.values()].filter((key) => key.algorithm === algorithm);
  }

  get algorithms() {
    return [...new Set([...this.keys.values()].map((key) => key.algorithm))];
  }

  // The public keys as a JWKS ({ keys: [...] }), to publish them (/.well-known/jwks.json): secrets are left out.
  toJWKS() {
    const keys = [];
    for (const key of this.keys.values()) {
      if (!key.publicKey) continue;
      keys.push({ ...key.publicKey.export({ format: 'jwk' }), kid: key.id, alg: key.algorithm, use: 'sig' });
    }
    return { keys };
  }
}

module.exports = { KeySet, HMAC };
