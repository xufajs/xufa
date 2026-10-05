// Attacks on JWT verification: each must be refused.
const crypto = require('node:crypto');
const jwt = require('..');
const jws = require('../lib/jws');

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const forge = (header, payload, signature = '') => `${b64(header)}.${b64(payload)}.${signature}`;

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaPublicPem = rsa.publicKey.export({ type: 'spki', format: 'pem' });
const ec = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const ed = crypto.generateKeyPairSync('ed25519');
const secret = 'a long and random secret of the server, not this one';

const refused = (token, key, options) => {
  expect(() => jwt.verify(token, key, options)).toThrow(jwt.JsonWebTokenError);
};

describe('verification refuses forged tokens', () => {
  test('a token signed with HS256 and the RSA public key as secret (algorithm confusion)', () => {
    const header = { alg: 'HS256', typ: 'JWT' };
    const input = `${b64(header)}.${b64({ sub: 'admin' })}`;
    const signature = crypto.createHmac('sha256', rsaPublicPem).update(input).digest('base64url');
    refused(`${input}.${signature}`, rsaPublicPem);
    refused(`${input}.${signature}`, rsa.publicKey);
    // Even with HS256 among the algorithms taken: the key is not a secret.
    refused(`${input}.${signature}`, rsaPublicPem, { algorithms: ['HS256', 'RS256'] });
  });

  test('unsigned tokens (alg none), unless none is taken and no key is given', () => {
    const token = forge({ alg: 'none', typ: 'JWT' }, { sub: 'admin' });
    refused(token, secret);
    refused(token, secret, { algorithms: ['none'] });
    refused(token, rsaPublicPem);
    refused(token, undefined);
    expect(jwt.verify(token, undefined, { algorithms: ['none'] })).toEqual({ sub: 'admin' });
  });

  test('a signature taken off, or of another token', () => {
    const token = jwt.sign({ sub: 'user' }, secret);
    const [header, payload] = token.split('.');
    refused(`${header}.${payload}.`, secret);
    const other = jwt.sign({ sub: 'other' }, secret);
    refused(`${header}.${b64({ sub: 'admin', iat: 1 })}.${other.split('.')[2]}`, secret);
  });

  test('a payload or a header changed after signing', () => {
    const token = jwt.sign({ sub: 'user', role: 'reader' }, rsa.privateKey, { algorithm: 'RS256' });
    const [header, , signature] = token.split('.');
    refused(`${header}.${b64({ sub: 'user', role: 'admin', iat: 1 })}.${signature}`, rsa.publicKey);
    refused(`${b64({ alg: 'RS256', typ: 'JWT', kid: 'x' })}.${token.split('.')[1]}.${signature}`, rsa.publicKey);
  });

  test('an algorithm of another case, or one the key does not take', () => {
    const token = jwt.sign({ sub: 'user' }, secret);
    const [, payload, signature] = token.split('.');
    refused(`${b64({ alg: 'hs256', typ: 'JWT' })}.${payload}.${signature}`, secret);
    const es = jwt.sign({ sub: 'user' }, ec.privateKey, { algorithm: 'ES256' });
    refused(es, ec.publicKey, { algorithms: ['RS256'] });
    refused(es, rsa.publicKey);
  });

  test('an ECDSA signature of zeros (CVE-2022-21449), or of another length', () => {
    const input = `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64({ sub: 'admin' })}`;
    refused(`${input}.${Buffer.alloc(64).toString('base64url')}`, ec.publicKey);
    // Of another length: 'invalid signature', a JsonWebTokenError as any other (jsonwebtoken throws a TypeError).
    expect(() => jwt.verify(`${input}.${Buffer.alloc(63).toString('base64url')}`, ec.publicKey)).toThrow(
      new jwt.JsonWebTokenError('invalid signature')
    );
  });

  test('EdDSA: signed by another key, or verified with a key of another kind', () => {
    const token = jwt.sign({ sub: 'user' }, ed.privateKey, { algorithm: 'EdDSA' });
    expect(jwt.verify(token, ed.publicKey)).toMatchObject({ sub: 'user' });
    refused(token, crypto.generateKeyPairSync('ed25519').publicKey);
    // As jsonwebtoken: a key of another kind is refused by the check of keys (an Error, not a JsonWebTokenError).
    expect(() => jwt.verify(token, ec.publicKey, { algorithms: ['EdDSA'] })).toThrow(/"ec" key type must be one of/);
    expect(() => jwt.sign({ sub: 'user' }, rsa.privateKey, { algorithm: 'EdDSA' })).toThrow(/rsa/);
  });

  test('a header with critical extensions', () => {
    const header = { alg: 'HS256', typ: 'JWT', crit: ['exp'] };
    const input = `${b64(header)}.${b64({ sub: 'user' })}`;
    const signature = crypto.createHmac('sha256', secret).update(input).digest('base64url');
    expect(() => jwt.verify(`${input}.${signature}`, secret)).toThrow(
      'jwt critical header extensions are not supported'
    );
  });

  test('HMAC signatures are compared whatever their length', () => {
    const token = jwt.sign({ sub: 'user' }, secret);
    const [header, payload] = token.split('.');
    for (const signature of ['', 'A', 'AAAA', 'x'.repeat(200)]) {
      expect(jws.verify(`${header}.${payload}.${signature}`, 'HS256', secret)).toBe(false);
    }
  });
});

describe('key material', () => {
  it('confusion is refused with a PEM string kept in the cache too', () => {
    // The public PEM as the secret of an HS256 token: refused before and after the PEM is cached.
    const forged = jws.sign({ header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: '1' }, secret: rsaPublicPem });
    for (let i = 0; i < 2; i += 1) {
      expect(() => jwt.verify(forged, rsaPublicPem)).toThrow(/invalid algorithm/);
    }
  });

  it('the same string is a private key for sign() and a public one for verify()', () => {
    const pem = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });
    const token = jwt.sign({ sub: '1' }, pem, { algorithm: 'RS256' });
    expect(jwt.verify(token, pem).sub).toBe('1');
    expect(jwt.verify(jwt.sign({ sub: '2' }, pem, { algorithm: 'RS256' }), rsaPublicPem).sub).toBe('2');
  });

  it('a secret with "-----BEGIN" is still a secret', () => {
    const odd = '-----BEGIN not a key, a secret';
    const token = jwt.sign({ sub: '1' }, odd);
    expect(jwt.verify(token, odd).sub).toBe('1');
    expect(() => jwt.verify(token, `${odd}!`)).toThrow(/invalid signature/);
  });

  it('a Buffer secret is read each time (it can change)', () => {
    const key = Buffer.from(secret);
    const token = jwt.sign({ sub: '1' }, key);
    expect(jwt.verify(token, key).sub).toBe('1');
    key[0] ^= 1;
    expect(() => jwt.verify(token, key)).toThrow(/invalid signature/);
  });

  it('many secrets: the cache stays bounded and each one still verifies', () => {
    const secrets = Array.from({ length: 200 }, (_, i) => `${secret}-${i}`);
    const tokens = secrets.map((s, i) => jwt.sign({ n: i }, s));
    secrets.forEach((s, i) => expect(jwt.verify(tokens[i], s).n).toBe(i));
    expect(() => jwt.verify(tokens[0], secrets[1])).toThrow(/invalid signature/);
  });
});

describe('claims jsonwebtoken lets through', () => {
  it('a RegExp audience does not take a token without aud, or with an aud that is not a string', () => {
    for (const payload of [{ sub: '1' }, { aud: 123 }, { aud: [null] }]) {
      const token = jwt.sign(payload, secret);
      expect(() => jwt.verify(token, secret, { audience: /.*/ })).toThrow(/jwt audience invalid/);
    }
    expect(jwt.verify(jwt.sign({ aud: 'api' }, secret), secret, { audience: /^api$/ }).aud).toBe('api');
  });

  it('maxAge: 0 is a limit, not none', () => {
    const token = jwt.sign({ iat: 1000 }, secret);
    expect(() => jwt.verify(token, secret, { maxAge: 0, clockTimestamp: 1001 })).toThrow(/maxAge exceeded/);
    expect(() => jwt.verify(jwt.sign({}, secret, { noTimestamp: true }), secret, { maxAge: 0 })).toThrow(
      /iat required/
    );
  });
});

describe('fixes of the open pull requests of jsonwebtoken', () => {
  it('an iat of 0 is kept, and exp and nbf count from it (#1043)', () => {
    expect(jwt.decode(jwt.sign({ iat: 0 }, secret, { expiresIn: 86400, notBefore: 60 }))).toEqual({
      iat: 0,
      nbf: 60,
      exp: 86400,
    });
  });

  it('clockTolerance must be a number of seconds, finite and not negative (#1036)', () => {
    const token = jwt.sign({ exp: 1000 }, secret);
    for (const clockTolerance of ['5', Infinity, NaN, -1]) {
      expect(() => jwt.verify(token, secret, { clockTolerance, clockTimestamp: 5000 })).toThrow(
        'clockTolerance must be a non-negative number'
      );
    }
    expect(jwt.verify(token, secret, { clockTolerance: 5, clockTimestamp: 1004 }).exp).toBe(1000);
  });

  it('a payload that is not JSON is "jwt malformed" (#1025)', () => {
    const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64('{nope')}.c2ln`;
    expect(() => jwt.verify(token, secret)).toThrow(new jwt.JsonWebTokenError('jwt malformed'));
  });

  it('claims named as the methods of objects are claims (#946)', () => {
    expect(jwt.decode(jwt.sign({ toString: 1, valueOf: 2, constructor: 3 }, secret))).toMatchObject({ toString: 1 });
  });

  it('an empty payload is refused when signing (#810)', () => {
    expect(() => jwt.sign('', secret)).toThrow('payload is required');
    expect(() => jwt.sign(Buffer.alloc(0), secret)).toThrow('payload is required');
  });

  it('exp, nbf and iat of Infinity or NaN are refused when signing (#1013)', () => {
    expect(() => jwt.sign({ exp: Infinity }, secret)).toThrow('"exp" should be a number of seconds');
    expect(() => jwt.sign({ nbf: NaN }, secret)).toThrow('"nbf" should be a number of seconds');
    expect(() => jwt.sign({ iat: -Infinity }, secret)).toThrow('"iat" should be a number of seconds');
  });

  it('type: the typ expected, ignoring case and "application/" (#1006)', () => {
    const access = jwt.sign({ sub: '1' }, secret, { header: { typ: 'at+jwt' } });
    expect(jwt.verify(access, secret, { type: 'at+JWT' }).sub).toBe('1');
    expect(jwt.verify(access, secret, { type: ['jwt', 'application/at+jwt'] }).sub).toBe('1');
    expect(() => jwt.verify(jwt.sign({ sub: '1' }, secret), secret, { type: 'at+jwt' })).toThrow(
      'jwt type invalid. expected: at+jwt'
    );
    expect(() => jwt.verify(access, secret, { type: 5 })).toThrow('type must be a string or an array of strings');
  });

  it('ES256K, on secp256k1 only (#978)', () => {
    const k1 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    const token = jwt.sign({ sub: '1' }, k1.privateKey, { algorithm: 'ES256K' });
    expect(jwt.decode(token, { complete: true }).header.alg).toBe('ES256K');
    expect(jwt.verify(token, k1.publicKey).sub).toBe('1');
    expect(() => jwt.sign({}, ec.privateKey, { algorithm: 'ES256K' })).toThrow(/requires curve "secp256k1"/);
    expect(() => jwt.sign({}, k1.privateKey, { algorithm: 'ES256' })).toThrow(/requires curve "prime256v1"/);
    // A token that says ES256 for a secp256k1 key is refused too.
    const forged = jws.sign({ header: { alg: 'ES256', typ: 'JWT' }, payload: { sub: '1' }, privateKey: k1.privateKey });
    expect(() => jwt.verify(forged, k1.publicKey)).toThrow(/requires curve/);
  });
});

describe('fixes of the open pull requests of jws', () => {
  const notJson = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64('{nope')}.c2ln`;

  it('jwt.decode() of a payload that is not JSON is null, and verify() says "jwt malformed" (jws#107)', () => {
    expect(jwt.decode(notJson)).toBe(null);
    expect(jwt.decode(notJson, { complete: true })).toBe(null);
    expect(() => jwt.verify(notJson, secret)).toThrow(new jwt.JsonWebTokenError('jwt malformed'));
    // jws.decode itself throws, as jws and its tests have it.
    expect(() => jws.decode(notJson)).toThrow(SyntaxError);
  });

  it('jws.decode reads the payload in the encoding it was signed with (jws#106)', () => {
    const token = jws.sign({ header: { alg: 'HS256' }, payload: 'h\u00e9llo', secret, encoding: 'latin1' });
    expect(jws.decode(token, { encoding: 'latin1' }).payload).toBe('h\u00e9llo');
    expect(jws.decode(token).payload).not.toBe('h\u00e9llo');
  });

  it('createVerify passes encoding and json to decode (jws#105, jws#106)', async () => {
    const latin = jws.sign({ header: { alg: 'HS256' }, payload: 'h\u00e9llo', secret, encoding: 'latin1' });
    const json = jws.sign({ header: { alg: 'HS256' }, payload: '{"a":1}', secret });
    const done = (opts) =>
      new Promise((resolve, reject) => {
        jws.createVerify({ algorithm: 'HS256', secret, ...opts }).on('done', (valid, decoded) => resolve([valid, decoded])).on('error', reject);
      });
    const [valid, decoded] = await done({ signature: latin, encoding: 'latin1' });
    expect(valid).toBe(true);
    expect(decoded.payload).toBe('h\u00e9llo');
    expect((await done({ signature: json, json: true }))[1].payload).toEqual({ a: 1 });
    expect((await done({ signature: json }))[1].payload).toBe('{"a":1}');
  });
});
