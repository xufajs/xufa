// JSON Web Algorithms (RFC 7518) for JWS, as the jwa package gives them: jwa('HS256') is { sign(input, key),
// verify(input, signature, key) }, with signatures in base64url. HS256/384/512 (HMAC), RS256/384/512 (RSASSA-PKCS1),
// PS256/384/512 (RSASSA-PSS), ES256/384/512 (ECDSA, signatures as R || S), none, and two jwa does not have: EdDSA
// (Ed25519 and Ed448, RFC 8037) and ES256K (ECDSA on secp256k1, RFC 8812). All by node:crypto.
import crypto from 'node:crypto';
import util from 'node:util';

const MSG_INVALID_ALGORITHM =
  '"%s" is not a valid algorithm.\n  Supported algorithms are:\n  "HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512" and "none".';
// The texts of jwa, with the space its secret message lacks ("bufferor": jwa#43).
const MSG_INVALID_SECRET = 'secret must be a string or buffer or a KeyObject';
const MSG_INVALID_VERIFIER_KEY = 'key must be a string or a buffer or a KeyObject';
const MSG_INVALID_SIGNER_KEY = 'key must be a string, a buffer or an object';

const typeError = (template, ...args) => new TypeError(util.format(template, ...args));

function checkIsPublicKey(key) {
  if (Buffer.isBuffer(key) || typeof key === 'string') return;
  if (
    typeof key !== 'object' ||
    key === null ||
    typeof key.type !== 'string' ||
    typeof key.asymmetricKeyType !== 'string' ||
    typeof key.export !== 'function'
  ) {
    throw typeError(MSG_INVALID_VERIFIER_KEY);
  }
}

function checkIsPrivateKey(key) {
  if (Buffer.isBuffer(key) || typeof key === 'string' || typeof key === 'object') return;
  throw typeError(MSG_INVALID_SIGNER_KEY);
}

function checkIsSecretKey(key) {
  if (Buffer.isBuffer(key) || typeof key === 'string') return;
  if (typeof key !== 'object' || key === null || key.type !== 'secret' || typeof key.export !== 'function') {
    throw typeError(MSG_INVALID_SECRET);
  }
}

const fromBase64 = (base64) => base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

function toBase64(base64url) {
  let text = base64url.toString();
  const padding = 4 - (text.length % 4);
  if (padding !== 4) text += '='.repeat(padding);
  return text.replace(/-/g, '+').replace(/_/g, '/');
}

// What is signed: strings and Buffers as they are, other values as JSON.
const normalizeInput = (thing) => (Buffer.isBuffer(thing) || typeof thing === 'string' ? thing : JSON.stringify(thing));

function timingSafeEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  return crypto.timingSafeEqual(a, b);
}

function hmacSigner(bits) {
  return function sign(thing, secret) {
    checkIsSecretKey(secret);
    const hmac = crypto.createHmac(`sha${bits}`, secret);
    return fromBase64(hmac.update(normalizeInput(thing)).digest('base64'));
  };
}

function hmacVerifier(bits) {
  const sign = hmacSigner(bits);
  return function verify(thing, signature, secret) {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(sign(thing, secret)));
  };
}

// A key with signing options (padding, encoding): a key given as { key, passphrase } gets them merged.
function withOptions(key, options) {
  if (!options) return key;
  if (
    key !== null &&
    typeof key === 'object' &&
    !Buffer.isBuffer(key) &&
    !(key instanceof crypto.KeyObject) &&
    'key' in key
  ) {
    return { ...key, ...options };
  }
  return { ...options, key };
}

function keySigner(bits, options) {
  return function sign(thing, privateKey) {
    checkIsPrivateKey(privateKey);
    const signer = crypto.createSign(`RSA-SHA${bits}`);
    signer.update(normalizeInput(thing));
    return fromBase64(signer.sign(withOptions(privateKey, options), 'base64'));
  };
}

function keyVerifier(bits, options) {
  return function verify(thing, signature, publicKey) {
    checkIsPublicKey(publicKey);
    const verifier = crypto.createVerify(`RSA-SHA${bits}`);
    verifier.update(normalizeInput(thing));
    return verifier.verify(withOptions(publicKey, options), toBase64(signature), 'base64');
  };
}

const PSS = { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST };
// ECDSA signatures of JWS are R || S, each of the size of the curve (what ecdsa-sig-formatter converts DER to).
const ECDSA = { dsaEncoding: 'ieee-p1363' };
const EC_PARAM_BYTES = { ES256: 32, ES384: 48, ES512: 66, ES256K: 32 };

function ecdsaVerifier(bits, algorithm = `ES${bits}`) {
  const verifyKey = keyVerifier(bits, ECDSA);
  return function verify(thing, signature, publicKey) {
    // As ecdsa-sig-formatter's joseToDer: a signature of another size is refused before the key is looked at.
    const bytes = Buffer.isBuffer(signature) ? signature : Buffer.from(String(signature), 'base64');
    const expected = EC_PARAM_BYTES[algorithm] * 2;
    if (bytes.length !== expected) {
      throw new TypeError(`"${algorithm}" signatures must be "${expected}" bytes, saw "${bytes.length}"`);
    }
    return verifyKey(thing, signature, publicKey);
  };
}

function eddsaSigner() {
  return function sign(thing, privateKey) {
    checkIsPrivateKey(privateKey);
    return fromBase64(crypto.sign(null, Buffer.from(normalizeInput(thing)), privateKey).toString('base64'));
  };
}

function eddsaVerifier() {
  return function verify(thing, signature, publicKey) {
    checkIsPublicKey(publicKey);
    return crypto.verify(
      null,
      Buffer.from(normalizeInput(thing)),
      publicKey,
      Buffer.from(toBase64(signature), 'base64')
    );
  };
}

const noneSigner = () => () => '';
const noneVerifier = () => (thing, signature) => signature === '';

const SIGNERS = {
  hs: (bits) => hmacSigner(bits),
  rs: (bits) => keySigner(bits),
  ps: (bits) => keySigner(bits, PSS),
  es: (bits) => keySigner(bits, ECDSA),
  none: noneSigner,
  eddsa: eddsaSigner,
  es256k: () => keySigner(256, ECDSA),
};
const VERIFIERS = {
  hs: (bits) => hmacVerifier(bits),
  rs: (bits) => keyVerifier(bits),
  ps: (bits) => keyVerifier(bits, PSS),
  es: (bits) => ecdsaVerifier(bits),
  none: noneVerifier,
  eddsa: eddsaVerifier,
  es256k: () => ecdsaVerifier(256, 'ES256K'),
};

// RSA signatures (RS and PS) made in libuv's thread pool (crypto.sign with a callback): one takes about half a
// millisecond, which the event loop does not wait for. Only those: the other signatures and every verification take
// 20 to 90 µs, about what the hand-off to the pool costs (15 to 40 µs, bench/micro/jwt-async.js), and are done on the
// loop. callback(err, signature in base64url).
function asyncSigner(hash, options) {
  return function signAsync(thing, privateKey, callback) {
    try {
      checkIsPrivateKey(privateKey);
      crypto.sign(hash, Buffer.from(normalizeInput(thing)), withOptions(privateKey, options), (err, signature) =>
        err ? callback(err) : callback(null, fromBase64(signature.toString('base64')))
      );
    } catch (err) {
      process.nextTick(callback, err);
    }
  };
}

const ASYNC_SIGNERS = {
  rs: (bits) => asyncSigner(`sha${bits}`),
  ps: (bits) => asyncSigner(`sha${bits}`, PSS),
};

function jwa(algorithm) {
  const match = /^(RS|PS|ES|HS)(256|384|512)$|^(none)$|^(EdDSA)$|^(ES256K)$/.exec(algorithm);
  if (!match) throw typeError(MSG_INVALID_ALGORITHM, algorithm);
  const kind = (match[1] || match[3] || match[4] || match[5]).toLowerCase();
  const bits = match[2];
  const methods = { sign: SIGNERS[kind](bits), verify: VERIFIERS[kind](bits) };
  if (ASYNC_SIGNERS[kind]) methods.signAsync = ASYNC_SIGNERS[kind](bits);
  return methods;
}

export default jwa;

export { jwa as 'module.exports' };
