// verify(token, secretOrPublicKey, options, callback): the payload of a token whose signature is valid and whose
// claims hold, as jsonwebtoken verifies it (the same options, checks and errors), with EdDSA (Ed25519, Ed448) too.
const { KeyObject } = require('node:crypto');
const { JsonWebTokenError, NotBeforeError, TokenExpiredError } = require('./errors');
const { decodeOrThrow } = require('./decode');
const timespan = require('./timespan');
const { validateAsymmetricKey, keyObjectOf } = require('./keys');
const jws = require('./jws');

const PUB_KEY_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'];
const EC_KEY_ALGS = ['ES256', 'ES384', 'ES512', 'ES256K'];

const mediaType = (typ) => (typeof typ === 'string' ? typ.toLowerCase().replace(/^application\//, '') : undefined);
// The types of options.type, normalized; null when it is not a string or a list of them.
function typesOf(type) {
  const list = [].concat(type);
  return list.length > 0 && list.every((item) => typeof item === 'string') ? list.map(mediaType) : null;
}
const RSA_KEY_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512'];
const HS_ALGS = ['HS256', 'HS384', 'HS512'];
const ED_KEY_ALGS = ['EdDSA'];

module.exports = function verify(token, secretOrPublicKeyArg, optionsArg, callbackArg) {
  let options = optionsArg;
  let callback = callbackArg;
  if (typeof options === 'function' && !callback) {
    callback = options;
    options = {};
  }
  // A copy: algorithms is set on it.
  options = { ...(options || {}) };

  const done =
    callback ||
    ((err, data) => {
      if (err) throw err;
      return data;
    });

  if (options.clockTimestamp && typeof options.clockTimestamp !== 'number') {
    return done(new JsonWebTokenError('clockTimestamp must be a number'));
  }
  // A string would be joined to exp as text, and Infinity or NaN would take any expired token (jsonwebtoken#1021).
  if (
    options.clockTolerance !== undefined &&
    (typeof options.clockTolerance !== 'number' ||
      !Number.isFinite(options.clockTolerance) ||
      options.clockTolerance < 0)
  ) {
    return done(new JsonWebTokenError('clockTolerance must be a non-negative number'));
  }
  if (options.type !== undefined && !typesOf(options.type)) {
    return done(new JsonWebTokenError('type must be a string or an array of strings'));
  }
  if (options.nonce !== undefined && (typeof options.nonce !== 'string' || options.nonce.trim() === '')) {
    return done(new JsonWebTokenError('nonce must be a non-empty string'));
  }
  if (
    options.allowInvalidAsymmetricKeyTypes !== undefined &&
    typeof options.allowInvalidAsymmetricKeyTypes !== 'boolean'
  ) {
    return done(new JsonWebTokenError('allowInvalidAsymmetricKeyTypes must be a boolean'));
  }

  const clockTimestamp = options.clockTimestamp || Math.floor(Date.now() / 1000);

  if (!token) return done(new JsonWebTokenError('jwt must be provided'));
  if (typeof token !== 'string') return done(new JsonWebTokenError('jwt must be a string'));

  const parts = token.split('.');
  if (parts.length !== 3) return done(new JsonWebTokenError('jwt malformed'));

  let decodedToken;
  try {
    decodedToken = decodeOrThrow(token, { complete: true });
  } catch (err) {
    // A payload that is not JSON is a malformed token, not a SyntaxError (jsonwebtoken#591).
    return done(err instanceof SyntaxError ? new JsonWebTokenError('jwt malformed') : err);
  }
  if (!decodedToken) return done(new JsonWebTokenError('invalid token'));

  const { header } = decodedToken;
  // RFC 7515 4.1.11: extensions named in crit must be understood, or the token refused. None is (jsonwebtoken does
  // not look at crit).
  if (header.crit !== undefined) {
    return done(new JsonWebTokenError('jwt critical header extensions are not supported'));
  }
  // The type of token expected (RFC 8725 3.11), as RFC 7515 compares typ: ignoring case and "application/".
  if (options.type !== undefined && !typesOf(options.type).includes(mediaType(header.typ))) {
    return done(new JsonWebTokenError(`jwt type invalid. expected: ${[].concat(options.type).join(' or ')}`));
  }
  let getSecret;
  if (typeof secretOrPublicKeyArg === 'function') {
    if (!callback) {
      return done(
        new JsonWebTokenError('verify must be called asynchronous if secret or public key is provided as a callback')
      );
    }
    getSecret = secretOrPublicKeyArg;
  } else {
    getSecret = (tokenHeader, secretCallback) => secretCallback(null, secretOrPublicKeyArg);
  }

  return getSecret(header, (err, secretOrPublicKeyGiven) => {
    let secretOrPublicKey = secretOrPublicKeyGiven;
    if (err) return done(new JsonWebTokenError(`error in secret or public key callback: ${err.message}`));

    const hasSignature = parts[2].trim() !== '';
    if (!hasSignature && secretOrPublicKey) return done(new JsonWebTokenError('jwt signature is required'));
    if (hasSignature && !secretOrPublicKey) return done(new JsonWebTokenError('secret or public key must be provided'));
    if (!hasSignature && !options.algorithms) {
      return done(new JsonWebTokenError('please specify "none" in "algorithms" to verify unsigned tokens'));
    }

    if (secretOrPublicKey != null && !(secretOrPublicKey instanceof KeyObject)) {
      secretOrPublicKey = keyObjectOf(secretOrPublicKey, 'public');
      if (!secretOrPublicKey) return done(new JsonWebTokenError('secretOrPublicKey is not valid key material'));
    }

    // Without algorithms, those of the kind of the key: never HMAC with a public key, nor none.
    if (!options.algorithms) {
      if (secretOrPublicKey.type === 'secret') options.algorithms = HS_ALGS;
      else if (['rsa', 'rsa-pss'].includes(secretOrPublicKey.asymmetricKeyType)) options.algorithms = RSA_KEY_ALGS;
      else if (secretOrPublicKey.asymmetricKeyType === 'ec') options.algorithms = EC_KEY_ALGS;
      else if (['ed25519', 'ed448'].includes(secretOrPublicKey.asymmetricKeyType)) options.algorithms = ED_KEY_ALGS;
      else options.algorithms = PUB_KEY_ALGS;
    }

    if (options.algorithms.indexOf(decodedToken.header.alg) === -1) {
      return done(new JsonWebTokenError('invalid algorithm'));
    }

    if (header.alg.startsWith('HS') && secretOrPublicKey.type !== 'secret') {
      return done(new JsonWebTokenError(`secretOrPublicKey must be a symmetric key when using ${header.alg}`));
    }
    if (/^(?:RS|PS|ES|EdDSA$)/.test(header.alg) && secretOrPublicKey.type !== 'public') {
      return done(new JsonWebTokenError(`secretOrPublicKey must be an asymmetric key when using ${header.alg}`));
    }

    if (!options.allowInvalidAsymmetricKeyTypes) {
      try {
        validateAsymmetricKey(header.alg, secretOrPublicKey);
      } catch (e) {
        return done(e);
      }
    }

    // The claims, once the signature holds.
    const checkClaims = () => {
      const { payload } = decodedToken;
      const tolerance = options.clockTolerance || 0;

      if (typeof payload.nbf !== 'undefined' && !options.ignoreNotBefore) {
        if (typeof payload.nbf !== 'number') return done(new JsonWebTokenError('invalid nbf value'));
        if (payload.nbf > clockTimestamp + tolerance) {
          return done(new NotBeforeError('jwt not active', new Date(payload.nbf * 1000)));
        }
      }

      if (typeof payload.exp !== 'undefined' && !options.ignoreExpiration) {
        if (typeof payload.exp !== 'number') return done(new JsonWebTokenError('invalid exp value'));
        if (clockTimestamp >= payload.exp + tolerance) {
          return done(new TokenExpiredError('jwt expired', new Date(payload.exp * 1000)));
        }
      }

      if (options.audience) {
        const audiences = Array.isArray(options.audience) ? options.audience : [options.audience];
        const target = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        // A RegExp tests strings only: jsonwebtoken's turns a missing aud into "undefined", which /.*/ takes.
        const match = target.some((targetAudience) =>
          audiences.some((audience) =>
            audience instanceof RegExp
              ? typeof targetAudience === 'string' && audience.test(targetAudience)
              : audience === targetAudience
          )
        );
        if (!match) return done(new JsonWebTokenError(`jwt audience invalid. expected: ${audiences.join(' or ')}`));
      }

      if (options.issuer) {
        const invalidIssuer =
          (typeof options.issuer === 'string' && payload.iss !== options.issuer) ||
          (Array.isArray(options.issuer) && options.issuer.indexOf(payload.iss) === -1);
        if (invalidIssuer) return done(new JsonWebTokenError(`jwt issuer invalid. expected: ${options.issuer}`));
      }

      if (options.subject && payload.sub !== options.subject) {
        return done(new JsonWebTokenError(`jwt subject invalid. expected: ${options.subject}`));
      }
      if (options.jwtid && payload.jti !== options.jwtid) {
        return done(new JsonWebTokenError(`jwt jwtid invalid. expected: ${options.jwtid}`));
      }
      if (options.nonce && payload.nonce !== options.nonce) {
        return done(new JsonWebTokenError(`jwt nonce invalid. expected: ${options.nonce}`));
      }

      // maxAge: 0 is a limit too (jsonwebtoken ignores it).
      if (options.maxAge != null) {
        if (typeof payload.iat !== 'number')
          return done(new JsonWebTokenError('iat required when maxAge is specified'));
        const maxAgeTimestamp = timespan(options.maxAge, payload.iat);
        if (typeof maxAgeTimestamp === 'undefined') {
          return done(
            new JsonWebTokenError(
              '"maxAge" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60'
            )
          );
        }
        if (clockTimestamp >= maxAgeTimestamp + tolerance) {
          return done(new TokenExpiredError('maxAge exceeded', new Date(maxAgeTimestamp * 1000)));
        }
      }

      if (options.complete === true) {
        return done(null, { header, payload, signature: decodedToken.signature });
      }
      return done(null, payload);
    };

    // An ECDSA signature of the wrong size is a signature that is not valid (jsonwebtoken#767).
    const signatureError = (e) =>
      e instanceof TypeError && /signatures must be/.test(e.message) ? new JsonWebTokenError('invalid signature') : e;

    // On the event loop, with a callback too: a verification takes 20 to 90 µs, about what a hand-off to the thread
    // pool costs (bench/micro/jwt-async.js).
    let valid;
    try {
      valid = jws.verify(token, decodedToken.header.alg, secretOrPublicKey);
    } catch (e) {
      return done(signatureError(e));
    }
    if (!valid) return done(new JsonWebTokenError('invalid signature'));
    return checkClaims();
  });
};
