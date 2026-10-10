// @xufa/jwt: JSON Web Tokens with the API of jsonwebtoken (sign, verify, decode and its errors), its checks and its
// test suite, and those of jws and jwa below it, without dependencies. EdDSA (Ed25519, Ed448) is there too.
import { JsonWebTokenError, NotBeforeError, TokenExpiredError } from './lib/errors.js';
import decode from './lib/decode.js';
import verify from './lib/verify.js';
import sign from './lib/sign.js';

// Names only (no require() in the object): Node finds them, so `import { sign } from '@xufa/jwt'` works.

export { decode, verify, sign, JsonWebTokenError, NotBeforeError, TokenExpiredError };
