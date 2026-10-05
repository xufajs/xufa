// JSON Web Tokens (RFC 7519) signed with the keys of a KeySet. The tokens are made and checked by @xufa/jwt (the API,
// checks and tests of jsonwebtoken); this joins it to the rest of @xufa/auth: the current key of the set signs, every
// key that may have signed a token verifies it, and what fails is a TokenError (401) with its reason.
//
//   const token = signJwt({ sub: '42', role: 'admin' }, keys, { expiresIn: '15m', issuer: 'app' });
//   const claims = verifyJwt(token, keys, { issuer: 'app' });   // or a TokenError (401) with its reason
const crypto = require('node:crypto');
const jwt = require('@xufa/jwt');
const { KeySet, HMAC } = require('./keys');
const { seconds } = require('./duration');
const { TokenError } = require('./errors');

const now = () => Math.floor(Date.now() / 1000);

function keySetOf(keys) {
  return keys instanceof KeySet ? keys : new KeySet(keys);
}

const secretOf = (key, side) => (HMAC[key.algorithm] ? key.secret : key[side]);

// A token of the claims, signed by the current key of the set. Options: expiresIn and notBefore (seconds or '15m'),
// issuer, audience, subject, jwtId (or jwtId: true for a random one), header (more fields of the header) and
// timestamp: false (no iat). Claims given in the payload are kept unless an option sets them.
function signJwt(payload, keys, options = {}) {
  return jwt.sign(...signArgs(payload, keys, options));
}

// signJwt() as a Promise: a token of an RSA key is signed in libuv's thread pool, so the event loop does not wait for
// it (about half a millisecond). The others take 20 to 90 µs, about what the hand-off costs, and are signed here.
async function signJwtAsync(payload, keys, options = {}) {
  const args = signArgs(payload, keys, options);
  if (!/^(?:RS|PS)/.test(args[2].algorithm)) return jwt.sign(...args);
  return new Promise((resolve, reject) => {
    jwt.sign(...args, (err, token) => (err ? reject(err) : resolve(token)));
  });
}

// The arguments of jwt.sign() for signJwt and signJwtAsync.
function signArgs(payload, keys, options) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('The payload of a JWT must be an object');
  }
  const key = keySetOf(keys).signing;
  const issued = options.now === undefined ? now() : Math.floor(options.now);
  const claims = { ...payload };
  if (options.timestamp !== false && claims.iat === undefined) claims.iat = issued;
  if (options.expiresIn !== undefined) claims.exp = issued + Math.floor(seconds(options.expiresIn, 'expiresIn'));
  if (options.notBefore !== undefined) claims.nbf = issued + Math.floor(seconds(options.notBefore, 'notBefore'));
  if (options.issuer !== undefined) claims.iss = options.issuer;
  if (options.audience !== undefined) claims.aud = options.audience;
  if (options.subject !== undefined) claims.sub = String(options.subject);
  if (options.jwtId !== undefined) claims.jti = options.jwtId === true ? crypto.randomUUID() : String(options.jwtId);
  // The algorithm, the kid and typ are the key's: a header given cannot change them.
  const { alg, kid, typ, ...header } = options.header || {};
  const signOptions = {
    algorithm: key.algorithm,
    keyid: key.id,
    header,
    // The claims above are the token's: jsonwebtoken's noTimestamp would remove an iat given, so it is only set when
    // there is none (and then none is added).
    noTimestamp: claims.iat === undefined,
  };
  return [claims, secretOf(key, 'privateKey'), signOptions];
}

// The header and claims of a token, without verifying it (null when it is not a JWT).
function decodeJwt(token) {
  if (typeof token !== 'string') return null;
  let decoded;
  try {
    decoded = jwt.decode(token, { complete: true, json: true });
  } catch {
    return null;
  }
  if (!decoded || !decoded.header || typeof decoded.header !== 'object') return null;
  const { payload } = decoded;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return decoded;
}

function fail(message, reason) {
  const err = new TokenError(message);
  err.reason = reason;
  return err;
}

// The messages of @xufa/jwt's verify() (jsonwebtoken's), by the reason of the TokenError.
const REASONS = [
  [/^maxAge exceeded$|^iat required when maxAge/, 'The token is too old', 'maxAge'],
  [/^jwt expired$/, 'The token expired', 'expired'],
  [/^jwt not active$/, 'The token is not valid yet', 'notBefore'],
  [/^invalid signature$|signatures must be/, 'The signature of the token is not valid', 'signature'],
  [
    /^invalid algorithm$|key type must be one of|requires curve|RSA-PSS|must be an? (a)?symmetric key/,
    'The algorithm of the token is not taken',
    'algorithm',
  ],
  [/^jwt audience invalid/, 'The audience of the token is not the expected one', 'audience'],
  [/^jwt subject invalid/, 'The subject of the token is not the expected one', 'subject'],
  [/critical/, 'The token has critical extensions', 'malformed'],
  [/^invalid (exp|nbf) value/, 'A time claim of the token is not a number', 'malformed'],
];

function failureOf(err) {
  const message = err.message || '';
  const found = REASONS.find(([pattern]) => pattern.test(message));
  return found ? fail(found[1], found[2]) : fail('The token is not a JWT', 'malformed');
}

// Whether iss is one of the expected values, strings or RegExps (jsonwebtoken's issuer takes strings only).
const issuerMatches = (expected, iss) =>
  typeof iss === 'string' &&
  [].concat(expected).some((value) => (value instanceof RegExp ? value.test(iss) : value === iss));

// The claims of a token signed by one of the keys, or a TokenError (status 401) whose reason is 'malformed',
// 'algorithm', 'signature', 'expired', 'notBefore', 'issuer', 'audience', 'subject' or 'maxAge'. Options: algorithms
// (the ones taken; all those of the keys by default), issuer and audience (a value or a list, strings or RegExps),
// subject, maxAge (of iat, in seconds or '1d'), clockTolerance (seconds) and now (seconds since the epoch).
function verifyJwt(token, keys, options = {}) {
  const check = checkOf(token, keys, options);
  let error = fail('The signature of the token is not valid', 'signature');
  for (const key of check.candidates) {
    try {
      jwt.verify(token, secretOf(key, 'publicKey'), check.verifyOptions);
      error = null;
      break;
    } catch (err) {
      error = failureOf(err);
      // Another key may have signed it: only a signature that is not valid lets the next one try.
      if (error.reason !== 'signature') break;
    }
  }
  if (error) throw error;
  return check.claims();
}

// verifyJwt() as a Promise, for code that awaits either: verifications take 20 to 90 µs, about what a hand-off to the
// thread pool costs, so they are done here.
async function verifyJwtAsync(token, keys, options = {}) {
  return verifyJwt(token, keys, options);
}

// What verifyJwt needs: the token decoded, its algorithm checked, the keys to try, the options of
// @xufa/jwt's verify(), and claims(): the payload once the issuer is checked (jsonwebtoken's takes strings only).
function checkOf(token, keys, options) {
  const set = keySetOf(keys);
  const decoded = decodeJwt(token);
  if (!decoded) throw fail('The token is not a JWT', 'malformed');
  const { header, payload } = decoded;
  // The algorithm chooses the keys to try, so it is checked first.
  const algorithms = options.algorithms || set.algorithms;
  if (typeof header.alg !== 'string' || !algorithms.includes(header.alg)) {
    throw fail(`The algorithm of the token is not taken: ${header.alg}`, 'algorithm');
  }
  return {
    candidates: set.candidates(header.kid, header.alg),
    verifyOptions: {
      algorithms: [header.alg],
      clockTimestamp: options.now === undefined ? now() : options.now,
      clockTolerance: options.clockTolerance === undefined ? 0 : seconds(options.clockTolerance, 'clockTolerance'),
      audience: options.audience,
      subject: options.subject,
      maxAge: options.maxAge === undefined ? undefined : seconds(options.maxAge, 'maxAge'),
    },
    claims() {
      if (options.issuer !== undefined && !issuerMatches(options.issuer, payload.iss)) {
        throw fail('The issuer of the token is not the expected one', 'issuer');
      }
      return payload;
    },
  };
}

module.exports = { signJwt, signJwtAsync, verifyJwt, verifyJwtAsync, decodeJwt };
