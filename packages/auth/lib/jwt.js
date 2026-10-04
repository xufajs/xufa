// JSON Web Tokens (RFC 7519), signed (JWS, compact form) with the keys of a KeySet: HS256/384/512, RS256/384/512,
// PS256/384/512, ES256/384/512 and EdDSA, all by node:crypto.
//
//   const token = signJwt({ sub: '42', role: 'admin' }, keys, { expiresIn: '15m', issuer: 'app' });
//   const claims = verifyJwt(token, keys, { issuer: 'app' });   // or a TokenError (401) with its reason
//
// verifyJwt() takes only the algorithms of its keys (a token cannot choose `none`, nor HMAC with a public key), and
// checks exp and nbf (with clockTolerance seconds of leeway) and, when they are given, iss, aud, sub and maxAge.
const crypto = require('node:crypto');
const { KeySet, HMAC } = require('./keys');
const { seconds } = require('./duration');
const { TokenError } = require('./errors');

const HASHES = { 256: 'sha256', 384: 'sha384', 512: 'sha512' };
// The bytes of each half of the signatures of ECDSA (r and s) in JWS.
const EC_SIZES = { ES256: 32, ES384: 48, ES512: 66 };

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);

function keySetOf(keys) {
  return keys instanceof KeySet ? keys : new KeySet(keys);
}

function sign(key, input) {
  const { algorithm } = key;
  if (HMAC[algorithm]) return crypto.createHmac(HMAC[algorithm], key.secret).update(input).digest();
  if (algorithm === 'EdDSA') return crypto.sign(null, Buffer.from(input), key.privateKey);
  const hash = HASHES[algorithm.slice(2)];
  if (algorithm.startsWith('PS')) {
    return crypto.sign(hash, Buffer.from(input), {
      key: key.privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    });
  }
  if (algorithm.startsWith('ES')) {
    return crypto.sign(hash, Buffer.from(input), { key: key.privateKey, dsaEncoding: 'ieee-p1363' });
  }
  return crypto.sign(hash, Buffer.from(input), key.privateKey);
}

function verifySignature(key, input, signature) {
  const { algorithm } = key;
  if (HMAC[algorithm]) {
    const expected = crypto.createHmac(HMAC[algorithm], key.secret).update(input).digest();
    return expected.length === signature.length && crypto.timingSafeEqual(expected, signature);
  }
  if (algorithm === 'EdDSA') return crypto.verify(null, Buffer.from(input), key.publicKey, signature);
  const hash = HASHES[algorithm.slice(2)];
  if (algorithm.startsWith('PS')) {
    return crypto.verify(
      hash,
      Buffer.from(input),
      {
        key: key.publicKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
      },
      signature
    );
  }
  if (algorithm.startsWith('ES')) {
    if (signature.length !== EC_SIZES[algorithm] * 2) return false;
    return crypto.verify(hash, Buffer.from(input), { key: key.publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  }
  return crypto.verify(hash, Buffer.from(input), key.publicKey, signature);
}

// A token of the claims, signed by the current key of the set. Options: expiresIn and notBefore (seconds or '15m'),
// issuer, audience, subject, jwtId (or jwtId: true for a random one), header (more fields of the header) and
// timestamp: false (no iat). Claims given in the payload are kept unless an option sets them.
function signJwt(payload, keys, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('The payload of a JWT must be an object');
  }
  const set = keySetOf(keys);
  const key = set.signing;
  const issued = options.now === undefined ? now() : Math.floor(options.now);
  const claims = { ...payload };
  if (options.timestamp !== false && claims.iat === undefined) claims.iat = issued;
  if (options.expiresIn !== undefined) claims.exp = issued + Math.floor(seconds(options.expiresIn, 'expiresIn'));
  if (options.notBefore !== undefined) claims.nbf = issued + Math.floor(seconds(options.notBefore, 'notBefore'));
  if (options.issuer !== undefined) claims.iss = options.issuer;
  if (options.audience !== undefined) claims.aud = options.audience;
  if (options.subject !== undefined) claims.sub = String(options.subject);
  if (options.jwtId !== undefined) claims.jti = options.jwtId === true ? crypto.randomUUID() : String(options.jwtId);
  const header = { ...options.header, alg: key.algorithm, typ: 'JWT', kid: key.id };
  const input = `${encode(header)}.${encode(claims)}`;
  return `${input}.${sign(key, input).toString('base64url')}`;
}

// The header and claims of a token, without verifying it (null when it is not a JWT).
function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    return { header, payload, signature: parts[2] };
  } catch {
    return null;
  }
}

function fail(message, reason) {
  const err = new TokenError(message);
  err.reason = reason;
  return err;
}

// Whether a claim (a string, or a list of them for aud) is one of the expected values (strings or RegExps).
const includesValue = (expected, actual) => {
  const items = [].concat(actual).filter((item) => typeof item === 'string');
  return []
    .concat(expected)
    .some((value) => items.some((item) => (value instanceof RegExp ? value.test(item) : value === item)));
};

// The claims of a token signed by one of the keys, or a TokenError (status 401) whose reason is 'malformed',
// 'algorithm', 'signature', 'expired', 'notBefore', 'issuer', 'audience', 'subject' or 'maxAge'. Options: algorithms
// (the ones taken; all those of the keys by default), issuer and audience (a value or a list, strings or RegExps),
// subject, maxAge (of iat, in seconds or '1d'), clockTolerance (seconds) and now (seconds since the epoch).
function verifyJwt(token, keys, options = {}) {
  const set = keySetOf(keys);
  const decoded = decodeJwt(token);
  if (!decoded || !/^[A-Za-z0-9_-]+$/.test(decoded.signature)) throw fail('The token is not a JWT', 'malformed');
  const { header, payload } = decoded;
  const algorithms = options.algorithms || set.algorithms;
  if (typeof header.alg !== 'string' || !algorithms.includes(header.alg)) {
    throw fail(`The algorithm of the token is not taken: ${header.alg}`, 'algorithm');
  }
  if (header.crit !== undefined) throw fail('The token has critical extensions', 'malformed');
  const input = token.slice(0, token.lastIndexOf('.'));
  const signature = Buffer.from(decoded.signature, 'base64url');
  const candidates = set.candidates(header.kid, header.alg);
  if (!candidates.some((key) => verifySignature(key, input, signature))) {
    throw fail('The signature of the token is not valid', 'signature');
  }
  const time = options.now === undefined ? now() : options.now;
  const tolerance = options.clockTolerance === undefined ? 0 : seconds(options.clockTolerance, 'clockTolerance');
  for (const claim of ['exp', 'nbf', 'iat']) {
    if (payload[claim] !== undefined && typeof payload[claim] !== 'number') {
      throw fail(`The claim ${claim} of the token is not a number`, 'malformed');
    }
  }
  if (payload.exp !== undefined && time >= payload.exp + tolerance) throw fail('The token expired', 'expired');
  if (payload.nbf !== undefined && time < payload.nbf - tolerance) {
    throw fail('The token is not valid yet', 'notBefore');
  }
  if (options.issuer !== undefined && !includesValue(options.issuer, payload.iss)) {
    throw fail('The issuer of the token is not the expected one', 'issuer');
  }
  if (options.audience !== undefined && (payload.aud === undefined || !includesValue(options.audience, payload.aud))) {
    throw fail('The audience of the token is not the expected one', 'audience');
  }
  if (options.subject !== undefined && payload.sub !== options.subject) {
    throw fail('The subject of the token is not the expected one', 'subject');
  }
  if (options.maxAge !== undefined) {
    if (typeof payload.iat !== 'number') throw fail('The token has no iat to check its age', 'maxAge');
    if (time - payload.iat > seconds(options.maxAge, 'maxAge') + tolerance) {
      throw fail('The token is too old', 'maxAge');
    }
  }
  return payload;
}

module.exports = { signJwt, verifyJwt, decodeJwt };
