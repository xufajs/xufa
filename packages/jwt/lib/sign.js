// sign(payload, secretOrPrivateKey, options, callback): a JWT, as jsonwebtoken makes it (the same options, checks and
// errors), with EdDSA (Ed25519, Ed448) too.
const { KeyObject } = require('node:crypto');
const timespan = require('./timespan');
const { validateAsymmetricKey, keyObjectOf } = require('./keys');
const jws = require('./jws');

const SUPPORTED_ALGS = [
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
  'ES256K',
  'HS256',
  'HS384',
  'HS512',
  'none',
  'EdDSA',
];

// The checks of lodash that jsonwebtoken uses (boxed values count, as there).
const tagOf = (value) => Object.prototype.toString.call(value);
const isString = (value) =>
  typeof value === 'string' || (typeof value === 'object' && tagOf(value) === '[object String]');
const isNumber = (value) =>
  typeof value === 'number' || (typeof value === 'object' && tagOf(value) === '[object Number]');
const isBoolean = (value) =>
  value === true || value === false || (typeof value === 'object' && tagOf(value) === '[object Boolean]');
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || tagOf(value) !== '[object Object]') return false;
  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;
  const Ctor = Object.prototype.hasOwnProperty.call(proto, 'constructor') && proto.constructor;
  return (
    typeof Ctor === 'function' && Function.prototype.toString.call(Ctor) === Function.prototype.toString.call(Object)
  );
}

const SIGN_OPTIONS = {
  expiresIn: {
    isValid: (value) => Number.isInteger(value) || (isString(value) && value),
    message: '"expiresIn" should be a number of seconds or string representing a timespan',
  },
  notBefore: {
    isValid: (value) => Number.isInteger(value) || (isString(value) && value),
    message: '"notBefore" should be a number of seconds or string representing a timespan',
  },
  audience: {
    isValid: (value) => isString(value) || Array.isArray(value),
    message: '"audience" must be a string or array',
  },
  algorithm: {
    isValid: (value) => SUPPORTED_ALGS.includes(value),
    message: '"algorithm" must be a valid string enum value',
  },
  header: { isValid: isPlainObject, message: '"header" must be an object' },
  encoding: { isValid: isString, message: '"encoding" must be a string' },
  issuer: { isValid: isString, message: '"issuer" must be a string' },
  subject: { isValid: isString, message: '"subject" must be a string' },
  jwtid: { isValid: isString, message: '"jwtid" must be a string' },
  noTimestamp: { isValid: isBoolean, message: '"noTimestamp" must be a boolean' },
  keyid: { isValid: isString, message: '"keyid" must be a string' },
  mutatePayload: { isValid: isBoolean, message: '"mutatePayload" must be a boolean' },
  allowInsecureKeySizes: { isValid: isBoolean, message: '"allowInsecureKeySizes" must be a boolean' },
  allowInvalidAsymmetricKeyTypes: {
    isValid: isBoolean,
    message: '"allowInvalidAsymmetricKeyTypes" must be a boolean',
  },
};

// Finite: Infinity and NaN are written as null, a token that no verify() takes (jsonwebtoken signs it; its tests say
// "TODO ... should fail validation").
const isSeconds = (value) => isNumber(value) && Number.isFinite(Number(value));
const REGISTERED_CLAIMS = {
  iat: { isValid: isSeconds, message: '"iat" should be a number of seconds' },
  exp: { isValid: isSeconds, message: '"exp" should be a number of seconds' },
  nbf: { isValid: isSeconds, message: '"nbf" should be a number of seconds' },
};

function validate(schema, allowUnknown, object, parameterName) {
  if (!isPlainObject(object)) throw new Error(`Expected "${parameterName}" to be a plain object.`);
  Object.keys(object).forEach((key) => {
    // Own keys only: a payload with toString or valueOf is not checked by Object.prototype's (jsonwebtoken#946).
    const validator = Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;
    if (!validator) {
      if (!allowUnknown) throw new Error(`"${key}" is not allowed in "${parameterName}"`);
      return;
    }
    if (!validator.isValid(object[key])) throw new Error(validator.message);
  });
}

const OPTIONS_TO_PAYLOAD = { audience: 'aud', issuer: 'iss', subject: 'sub', jwtid: 'jti' };
const OPTIONS_FOR_OBJECTS = ['expiresIn', 'notBefore', 'noTimestamp', 'audience', 'issuer', 'subject', 'jwtid'];

function once(fn) {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}

module.exports = function sign(payloadArg, secretOrPrivateKeyArg, optionsArg, callbackArg) {
  let payload = payloadArg;
  let secretOrPrivateKey = secretOrPrivateKeyArg;
  let options = optionsArg;
  let callback = callbackArg;
  if (typeof options === 'function') {
    callback = options;
    options = {};
  } else {
    options = options || {};
  }

  const isObjectPayload = typeof payload === 'object' && !Buffer.isBuffer(payload);
  const header = {
    alg: options.algorithm || 'HS256',
    typ: isObjectPayload ? 'JWT' : undefined,
    kid: options.keyid,
    ...options.header,
  };

  function failure(err) {
    if (callback) return callback(err);
    throw err;
  }

  if (!secretOrPrivateKey && options.algorithm !== 'none') {
    return failure(new Error('secretOrPrivateKey must have a value'));
  }

  if (secretOrPrivateKey != null && !(secretOrPrivateKey instanceof KeyObject)) {
    secretOrPrivateKey = keyObjectOf(secretOrPrivateKey, 'private');
    if (!secretOrPrivateKey) return failure(new Error('secretOrPrivateKey is not valid key material'));
  }

  if (header.alg.startsWith('HS') && secretOrPrivateKey.type !== 'secret') {
    return failure(new Error(`secretOrPrivateKey must be a symmetric key when using ${header.alg}`));
  }
  if (/^(?:RS|PS|ES|EdDSA$)/.test(header.alg)) {
    if (secretOrPrivateKey.type !== 'private') {
      return failure(new Error(`secretOrPrivateKey must be an asymmetric key when using ${header.alg}`));
    }
    if (
      !options.allowInsecureKeySizes &&
      /^(?:RS|PS)/.test(header.alg) &&
      secretOrPrivateKey.asymmetricKeyDetails !== undefined &&
      secretOrPrivateKey.asymmetricKeyDetails.modulusLength < 2048
    ) {
      return failure(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
    }
  }

  // An empty payload makes a token that verify() cannot read (jsonwebtoken#800).
  if (typeof payload === 'undefined' || payload === '' || (Buffer.isBuffer(payload) && payload.length === 0)) {
    return failure(new Error('payload is required'));
  }
  if (isObjectPayload) {
    try {
      validate(REGISTERED_CLAIMS, true, payload, 'payload');
    } catch (error) {
      return failure(error);
    }
    if (!options.mutatePayload) payload = { ...payload };
  } else {
    const invalid = OPTIONS_FOR_OBJECTS.filter((opt) => typeof options[opt] !== 'undefined');
    if (invalid.length > 0) {
      return failure(new Error(`invalid ${invalid.join(',')} option for ${typeof payload} payload`));
    }
  }

  if (typeof payload.exp !== 'undefined' && typeof options.expiresIn !== 'undefined') {
    return failure(new Error('Bad "options.expiresIn" option the payload already has an "exp" property.'));
  }
  if (typeof payload.nbf !== 'undefined' && typeof options.notBefore !== 'undefined') {
    return failure(new Error('Bad "options.notBefore" option the payload already has an "nbf" property.'));
  }

  try {
    validate(SIGN_OPTIONS, false, options, 'options');
  } catch (error) {
    return failure(error);
  }

  if (!options.allowInvalidAsymmetricKeyTypes) {
    try {
      validateAsymmetricKey(header.alg, secretOrPrivateKey);
    } catch (error) {
      return failure(error);
    }
  }

  // An iat of 0 is a time too (jsonwebtoken#874).
  const timestamp = typeof payload.iat === 'number' ? payload.iat : Math.floor(Date.now() / 1000);
  if (options.noTimestamp) delete payload.iat;
  else if (isObjectPayload) payload.iat = timestamp;

  if (typeof options.notBefore !== 'undefined') {
    try {
      payload.nbf = timespan(options.notBefore, timestamp);
    } catch (err) {
      return failure(err);
    }
    if (typeof payload.nbf === 'undefined') {
      return failure(
        new Error('"notBefore" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60')
      );
    }
  }

  if (typeof options.expiresIn !== 'undefined' && typeof payload === 'object') {
    try {
      payload.exp = timespan(options.expiresIn, timestamp);
    } catch (err) {
      return failure(err);
    }
    if (typeof payload.exp === 'undefined') {
      return failure(
        new Error('"expiresIn" should be a number of seconds or string representing a timespan eg: "1d", "20h", 60')
      );
    }
  }

  for (const key of Object.keys(OPTIONS_TO_PAYLOAD)) {
    const claim = OPTIONS_TO_PAYLOAD[key];
    if (typeof options[key] !== 'undefined') {
      if (typeof payload[claim] !== 'undefined') {
        return failure(new Error(`Bad "options.${key}" option. The payload already has an "${claim}" property.`));
      }
      payload[claim] = options[key];
    }
  }

  const encoding = options.encoding || 'utf8';

  if (typeof callback === 'function') {
    // With a callback, an RSA key signs in the thread pool (about half a millisecond the event loop does not wait);
    // jsonwebtoken signs on the loop either way.
    const done = once(callback);
    jws.signAsync({ header, privateKey: secretOrPrivateKey, payload, encoding }, (err, signature) => {
      if (err) return done(err);
      if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
        return done(new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`));
      }
      return done(null, signature);
    });
    return undefined;
  }
  const signature = jws.sign({ header, payload, secret: secretOrPrivateKey, encoding });
  if (!options.allowInsecureKeySizes && /^(?:RS|PS)/.test(header.alg) && signature.length < 256) {
    throw new Error(`secretOrPrivateKey has a minimum key size of 2048 bits for ${header.alg}`);
  }
  return signature;
};
