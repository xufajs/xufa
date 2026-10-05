// Which algorithms each kind of asymmetric key takes, and the curves and RSA-PSS parameters they need (as
// jsonwebtoken's validateAsymmetricKey, with Ed25519 and Ed448 for EdDSA).
const { createPrivateKey, createPublicKey, createSecretKey } = require('node:crypto');

const ALGORITHMS_OF_KEYS = {
  ec: ['ES256', 'ES384', 'ES512', 'ES256K'],
  rsa: ['RS256', 'PS256', 'RS384', 'PS384', 'RS512', 'PS512'],
  'rsa-pss': ['PS256', 'PS384', 'PS512'],
  ed25519: ['EdDSA'],
  ed448: ['EdDSA'],
};

const CURVES = {
  ES256: 'prime256v1',
  ES384: 'secp384r1',
  ES512: 'secp521r1',
  ES256K: 'secp256k1',
};

function validateAsymmetricKey(algorithm, key) {
  if (!algorithm || !key) return;
  const keyType = key.asymmetricKeyType;
  if (!keyType) return;
  const allowed = ALGORITHMS_OF_KEYS[keyType];
  if (!allowed) throw new Error(`Unknown key type "${keyType}".`);
  if (!allowed.includes(algorithm)) {
    throw new Error(`"alg" parameter for "${keyType}" key type must be one of: ${allowed.join(', ')}.`);
  }
  if (keyType === 'ec') {
    const curve = key.asymmetricKeyDetails.namedCurve;
    if (curve !== CURVES[algorithm])
      throw new Error(`"alg" parameter "${algorithm}" requires curve "${CURVES[algorithm]}".`);
  } else if (keyType === 'rsa-pss') {
    const length = parseInt(algorithm.slice(-3), 10);
    const { hashAlgorithm, mgf1HashAlgorithm, saltLength } = key.asymmetricKeyDetails;
    if (hashAlgorithm !== `sha${length}` || mgf1HashAlgorithm !== hashAlgorithm) {
      throw new Error(
        `Invalid key for this operation, its RSA-PSS parameters do not meet the requirements of "alg" ${algorithm}.`
      );
    }
    // eslint-disable-next-line no-bitwise
    if (saltLength !== undefined && saltLength > length >> 3) {
      throw new Error(
        `Invalid key for this operation, its RSA-PSS parameter saltLength does not meet the requirements of "alg" ${algorithm}.`
      );
    }
  }
}

// The KeyObject of the key material given to sign() (kind 'private') or verify() ('public'), as jsonwebtoken makes it:
// an asymmetric key when it parses as one, else a secret (null when it is neither). Two shortcuts that give the same
// result: material in PEM (a string or Buffer, the only form parsed without options) has "-----BEGIN", so a secret
// without it is not tried as a key (that try throws, and was two thirds of the time of HS256); and strings, which
// cannot change, are kept with their KeyObject (KeyObjects cannot change either), so a PEM is not parsed each time.
const KEY_CACHE_SIZE = 64;
const keyCache = { private: new Map(), public: new Map() };
const PEM = '-----BEGIN';

function parseKey(material, kind) {
  const isText = typeof material === 'string';
  if (!(isText || Buffer.isBuffer(material)) || material.includes(PEM)) {
    try {
      return kind === 'private' ? createPrivateKey(material) : createPublicKey(material);
    } catch {
      // not a key: a secret
    }
  }
  try {
    return createSecretKey(isText ? Buffer.from(material) : material);
  } catch {
    return null;
  }
}

function keyObjectOf(material, kind) {
  if (typeof material !== 'string') return parseKey(material, kind);
  const cache = keyCache[kind];
  let key = cache.get(material);
  if (key === undefined) {
    key = parseKey(material, kind);
    if (cache.size >= KEY_CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(material, key);
  }
  return key;
}

module.exports = { validateAsymmetricKey, keyObjectOf, ALGORITHMS_OF_KEYS };
