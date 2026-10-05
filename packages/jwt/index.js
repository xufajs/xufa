// @xufa/jwt: JSON Web Tokens with the API of jsonwebtoken (sign, verify, decode and its errors), its checks and its
// test suite, and those of jws and jwa below it, without dependencies. EdDSA (Ed25519, Ed448) is there too.
const { JsonWebTokenError, NotBeforeError, TokenExpiredError } = require('./lib/errors');
const decode = require('./lib/decode');
const verify = require('./lib/verify');
const sign = require('./lib/sign');

// Names only (no require() in the object): Node finds them, so `import { sign } from '@xufa/jwt'` works.
module.exports = { decode, verify, sign, JsonWebTokenError, NotBeforeError, TokenExpiredError };
