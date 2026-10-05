# @xufa/jwt

JSON Web Tokens with the API of [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) (`sign`, `verify`,
`decode` and its errors), and of [jws](https://github.com/brianloveswords/node-jws) and
[jwa](https://github.com/brianloveswords/node-jwa) below it, without dependencies: everything is done by
`node:crypto`. It passes the test suites of the three (607 tests, with the vectors of RFC 7515 and checks against the
`openssl` command), and tests of its own on attacks on verification.

```sh
npm install @xufa/jwt
```

```js
const jwt = require('@xufa/jwt');

const token = jwt.sign({ sub: '42', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '15m', issuer: 'app' });
const claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'app' });

// Asymmetric keys: the private one signs, the public one verifies.
const signed = jwt.sign({ sub: '42' }, privateKey, { algorithm: 'ES256', keyid: 'k1' });
jwt.verify(signed, publicKey); // ES256/384/512 taken for an EC key, never HMAC nor none
```

`require('jsonwebtoken')` can be replaced by `require('@xufa/jwt')`: the options, the checks, the messages and the
errors (`JsonWebTokenError`, `TokenExpiredError`, `NotBeforeError`) are those of jsonwebtoken 9, with the fixes of its
open pull requests that hold:

- Added: EdDSA and ES256K; `verify(token, key, { type: 'at+jwt' })`, the `typ` expected (RFC 8725); named imports from
  ES modules (`import { sign } from '@xufa/jwt'`).
- Stricter: tokens with `crit` are refused; a RegExp in `audience` tests strings only (jsonwebtoken tests a missing
  `aud` as `"undefined"`, which `/.*/` takes); `maxAge: 0` is a limit; `clockTolerance` must be a number of
  seconds (jsonwebtoken joins a string such as `'5'` to `exp` as text, and takes `Infinity`); `exp`, `nbf` and `iat`
  of `Infinity` or `NaN`, and empty payloads, are refused when signing.
- Fixed: an `iat` of 0 is kept; a payload with keys such as `toString` signs; a payload that is not JSON, and an
  ECDSA signature of the wrong size, are `JsonWebTokenError`s ('jwt malformed', 'invalid signature'), not a
  `SyntaxError` or `TypeError`; `decode()` of a payload that is not JSON is `null` (as any token that is not one).
- From the open pull requests of jws: `jws.decode(token, { encoding })` reads the payload in the encoding it was signed
  with, and `createVerify()` passes its `encoding` and `json` to it (jws reads utf8 whatever is given).

## Algorithms

HS256/384/512 (HMAC), RS256/384/512 (RSASSA-PKCS1-v1_5), PS256/384/512 (RSASSA-PSS), ES256/384/512 (ECDSA),
`none` (only when asked for, without a key), and two jsonwebtoken does not have: **EdDSA** (Ed25519 and Ed448, RFC 8037) and **ES256K** (ECDSA on secp256k1, RFC 8812).

## What verify() refuses

- An algorithm the options do not take; without `algorithms`, those of the kind of the key (a secret: HS*; RSA: RS*
  and PS*; EC: ES*; Ed25519/Ed448: EdDSA), so a token cannot choose HMAC with a public key as its secret, nor `none`.
- A key of another kind than the algorithm (an EC key of another curve, RSA-PSS keys with other parameters), and RSA
  keys under 2048 bits for signing.
- A signature that is not valid (HMAC compared in constant time), or of the wrong size (ECDSA).
- `exp` passed and `nbf` not reached (with `clockTolerance` seconds of leeway), and, when asked, `aud`, `iss`, `sub`,
  `jti`, `nonce` and `maxAge`.
- A header with `crit` (RFC 7515 4.1.11: extensions that are not understood must be refused; jsonwebtoken does not look
  at it).

## jws and jwa

`require('@xufa/jwt/jws')` has jws's `sign`, `verify`, `decode`, `isValid`, `createSign` and `createVerify` (streams),
and `require('@xufa/jwt/jwa')` jwa's `jwa(algorithm)`, `{ sign(input, key), verify(input, signature, key) }`.

## Performance

Against jsonwebtoken 9 (`node bench/micro/jwt.js`, keys as text): HS256 signs and verifies 4.5x and 5.0x faster,
RS256 1.7x and 2.1x, ES256 2.9x and 1.6x, and decodes 1.4x faster. The signatures are the same work (`node:crypto`);
jsonwebtoken tries a secret as a PEM key first (which throws) and parses PEM keys on every call, while @xufa/jwt skips
what has no `-----BEGIN` and keeps the KeyObject of each key given as a string. With KeyObjects both sign and verify as
fast. Decoding (and so verifying) parses the header once and splits the token once (jws: twice and three times). On
Linux (WSL2, same machine): HS256 3.8x and 4.1x, RS256 1.6x and 1.7x, ES256 2.6x and 1.5x, decode 1.3x.

With a callback, `sign()` makes RSA signatures (RS, PS) in libuv's thread pool, so the event loop does not wait for
their half a millisecond: 64 tokens at a time stall it 42 ms when signed on the loop, under 1 ms in the pool, and with
the 4 threads of the pool 3.3x as many are signed a second (`node bench/micro/jwt-async.js`, Windows and Linux). The
rest (other signatures, every verification, HMAC) is done on the loop: it takes 20 to 90 µs, about what the hand-off
costs (15 to 20 µs on Windows, 35 to 40 µs on Linux), and in the pool it was up to a third slower when no core was
free.

## Tests

`test/jsonwebtoken`, `test/jws` and `test/jwa` are the suites of those packages, ported to vyntra by
`tools/port-jwt/port.js` from checkouts of their repositories (the requires and mocha's hooks are rewritten; the tests
are not changed). `test/security.test.js` tries forged tokens: algorithm confusion (HMAC with an RSA public key),
`none`, signatures taken off or of other tokens, headers and payloads changed, all-zero ECDSA signatures
(CVE-2022-21449), and critical extensions.

## TypeScript

The declarations of jsonwebtoken (`@types/jsonwebtoken`), with EdDSA and ES256K among the algorithms and `type`.

## License

MIT. The declarations are from DefinitelyTyped (MIT).
