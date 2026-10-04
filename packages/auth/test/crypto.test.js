// Passwords, JWTs and one-time codes: their own round trips, and the test vectors of their RFCs.
const crypto = require('node:crypto');
const {
  hashPassword,
  verifyPassword,
  needsRehash,
  KeySet,
  signJwt,
  verifyJwt,
  decodeJwt,
  TokenError,
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  totp,
  verifyTotp,
  totpUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require('..');

// Fast parameters for the tests (the defaults take 128 MiB and a fraction of a second).
const FAST = { ln: 10 };

describe('passwords', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse', FAST);
    expect(hash).toMatch(/^\$scrypt\$ln=10,r=8,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
    expect(await verifyPassword('correct horse', hash)).toBe(true);
    expect(await verifyPassword('correct hors', hash)).toBe(false);
    expect(await hashPassword('correct horse', FAST)).not.toBe(hash);
  });

  it('verifies hashes of other parameters, and says when they should be made again', async () => {
    const old = await hashPassword('secret', { ln: 8, r: 4 });
    expect(await verifyPassword('secret', old)).toBe(true);
    expect(needsRehash(old, FAST)).toBe(true);
    expect(needsRehash(await hashPassword('secret', FAST), FAST)).toBe(false);
    expect(needsRehash('$2b$10$bcrypthash')).toBe(true);
  });

  it('uses the defaults of OWASP', async () => {
    const hash = await hashPassword('secret');
    expect(hash.startsWith('$scrypt$ln=17,r=8,p=1$')).toBe(true);
    expect(await verifyPassword('secret', hash)).toBe(true);
  });

  it('normalizes the password and refuses what is no hash', async () => {
    const hash = await hashPassword('café', FAST);
    expect(await verifyPassword('café', hash)).toBe(true);
    expect(await verifyPassword('x', 'not a hash')).toBe(false);
    expect(await verifyPassword('x', null)).toBe(false);
    await expect(hashPassword('', FAST)).rejects.toThrow('must be a text');
  });
});

describe('JSON Web Tokens', () => {
  const secret = 'a secret of at least thirty-two bytes!';

  it('verifies the example of RFC 7515 (A.1, HS256)', () => {
    const k = 'AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow';
    const token =
      'eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9' +
      '.eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290Ijp0cnVlfQ' +
      '.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const keys = new KeySet(Buffer.from(k, 'base64url'));
    const claims = verifyJwt(token, keys, { now: 1300819379 });
    expect(claims).toEqual({ iss: 'joe', exp: 1300819380, 'http://example.com/is_root': true });
    expect(() => verifyJwt(token, keys, { now: 1300819380 })).toThrow('expired');
  });

  it('signs and verifies with every algorithm', () => {
    const pairs = {
      RS256: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }),
      PS384: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }),
      ES256: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }),
      ES384: crypto.generateKeyPairSync('ec', { namedCurve: 'P-384' }),
      ES512: crypto.generateKeyPairSync('ec', { namedCurve: 'P-521' }),
      EdDSA: crypto.generateKeyPairSync('ed25519'),
    };
    for (const [algorithm, { privateKey, publicKey }] of Object.entries(pairs)) {
      const signer = new KeySet({ keys: { k1: { key: privateKey, algorithm } } });
      const token = signJwt({ sub: '42' }, signer);
      expect(decodeJwt(token).header).toEqual({ alg: algorithm, typ: 'JWT', kid: 'k1' });
      // Verified with the public key alone (as another service would).
      const pem = publicKey.export({ type: 'spki', format: 'pem' });
      expect(verifyJwt(token, new KeySet({ keys: { k1: { key: pem, algorithm } } })).sub).toBe('42');
    }
    for (const algorithm of ['HS256', 'HS384', 'HS512']) {
      const keys = new KeySet({ keys: { s: { key: crypto.randomBytes(64), algorithm } } });
      expect(verifyJwt(signJwt({ a: 1 }, keys), keys).a).toBe(1);
    }
  });

  it('checks the times and the claims', () => {
    const keys = new KeySet(secret);
    const token = signJwt({ role: 'admin' }, keys, {
      expiresIn: '15m',
      notBefore: 10,
      issuer: 'app',
      audience: ['api', 'web'],
      subject: 42,
      jwtId: true,
      now: 1000,
    });
    const claims = verifyJwt(token, keys, { now: 1010, issuer: 'app', audience: 'api', subject: '42' });
    expect(claims).toMatchObject({ role: 'admin', iat: 1000, nbf: 1010, exp: 1900, iss: 'app', sub: '42' });
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    const reasonOf = (options) => {
      try {
        verifyJwt(token, keys, { now: 1010, ...options });
        return null;
      } catch (err) {
        expect(err).toBeInstanceOf(TokenError);
        expect(err.statusCode).toBe(401);
        return err.reason;
      }
    };
    expect(reasonOf({ now: 1009 })).toBe('notBefore');
    expect(reasonOf({ now: 1005, clockTolerance: 5 })).toBe(null);
    expect(reasonOf({ now: 1900 })).toBe('expired');
    expect(reasonOf({ issuer: 'other' })).toBe('issuer');
    expect(reasonOf({ issuer: /^ap/ })).toBe(null);
    expect(reasonOf({ audience: 'mobile' })).toBe('audience');
    expect(reasonOf({ subject: '7' })).toBe('subject');
    expect(reasonOf({ maxAge: 5 })).toBe('maxAge');
  });

  it('refuses tokens that choose their algorithm or are changed', () => {
    const keys = new KeySet(secret);
    const token = signJwt({ sub: '1' }, keys);
    const [header, payload, signature] = token.split('.');
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`;
    expect(() => verifyJwt(none, keys)).toThrow(TokenError);
    const changed = Buffer.from(JSON.stringify({ sub: '2', iat: 1 })).toString('base64url');
    expect(() => verifyJwt(`${header}.${changed}.${signature}`, keys)).toThrow('signature');
    expect(() => verifyJwt('a.b', keys)).toThrow('not a JWT');
    expect(() => verifyJwt(token, keys, { algorithms: ['HS512'] })).toThrow('algorithm');
    // HMAC signed with the public key of an RSA key set: its algorithm is not one of the set.
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const forged = signJwt({ sub: 'admin' }, new KeySet({ keys: { k: { key: crypto.createSecretKey(Buffer.from(pem)), algorithm: 'HS256' } } }));
    expect(() => verifyJwt(forged, new KeySet({ keys: { k: privateKey } }))).toThrow('algorithm');
  });

  it('rotates keys by their ids, and publishes the public ones', () => {
    const old = new KeySet({ current: 'v1', keys: { v1: 'the first key, long enough to sign' } });
    const token = signJwt({ sub: '1' }, old);
    const rotated = new KeySet({
      current: 'v2',
      keys: { v2: 'the second key, long enough to sign', v1: 'the first key, long enough to sign' },
    });
    expect(verifyJwt(token, rotated).sub).toBe('1');
    expect(decodeJwt(signJwt({}, rotated)).header.kid).toBe('v2');
    expect(() => verifyJwt(token, new KeySet({ keys: { v2: 'the second key, long enough to sign' } }))).toThrow('signature');
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    const jwks = new KeySet({ keys: { ed: privateKey, hs: secret } }).toJWKS();
    expect(jwks.keys).toEqual([expect.objectContaining({ kid: 'ed', alg: 'EdDSA', kty: 'OKP', use: 'sig' })]);
    expect(jwks.keys[0].d).toBeUndefined();
  });

  it('refuses keys that are too short or of the wrong kind', () => {
    expect(() => new KeySet('short')).toThrow('32 bytes');
    const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    expect(() => new KeySet({ keys: { k: { key: publicKey, algorithm: 'ES384' } } })).toThrow('curve');
    expect(() => signJwt({}, new KeySet({ keys: { k: publicKey } }))).toThrow('cannot sign');
  });
});

describe('one-time codes', () => {
  it('gives the codes of RFC 4226 (HOTP)', () => {
    const secret = Buffer.from('12345678901234567890');
    const codes = Array.from({ length: 10 }, (_, counter) => hotp(secret, counter));
    expect(codes).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ]);
  });

  it('gives the codes of RFC 6238 (TOTP)', () => {
    const secrets = {
      SHA1: base32Encode(Buffer.from('12345678901234567890')),
      SHA256: base32Encode(Buffer.from('12345678901234567890123456789012')),
      SHA512: base32Encode(Buffer.from('1234567890123456789012345678901234567890123456789012345678901234')),
    };
    const vectors = [
      [59, '94287082', '46119246', '90693936'],
      [1111111109, '07081804', '68084774', '25091201'],
      [1111111111, '14050471', '67062674', '99943326'],
      [1234567890, '89005924', '91819424', '93441116'],
      [2000000000, '69279037', '90698825', '38618901'],
      [20000000000, '65353130', '77737706', '47863826'],
    ];
    for (const [time, ...codes] of vectors) {
      ['SHA1', 'SHA256', 'SHA512'].forEach((algorithm, i) => {
        expect(totp(secrets[algorithm], { time, digits: 8, algorithm })).toBe(codes[i]);
      });
    }
  });

  it('verifies codes within the window, once', () => {
    const secret = generateSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const time = 1700000000;
    const code = totp(secret, { time });
    const step = verifyTotp(code, secret, { time });
    expect(step).toBe(Math.floor(time / 30));
    expect(verifyTotp(code, secret, { time: time + 30 })).toBe(step);
    expect(verifyTotp(code, secret, { time: time + 60 })).toBe(null);
    expect(verifyTotp(code, secret, { time, after: step })).toBe(null);
    expect(verifyTotp(code.split('').join(' '), secret, { time })).toBe(step);
    expect(verifyTotp('12345', secret, { time })).toBe(null);
  });

  it('writes secrets as base32 and URIs for the apps', () => {
    const bytes = crypto.randomBytes(20);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw 6ytb-oi======').toString()).toBe('foobar');
    expect(totpUri({ secret: 'JBSWY3DPEHPK3PXP', label: 'ada@example.com', issuer: 'Acme Co' })).toBe(
      'otpauth://totp/Acme%20Co:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme+Co'
    );
    expect(totpUri({ secret: 'JBSWY3DPEHPK3PXP', label: 'ada', algorithm: 'SHA256', digits: 8, period: 60 })).toBe(
      'otpauth://totp/ada?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60'
    );
  });

  it('makes recovery codes and their hashes', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashRecoveryCode(codes[0].toUpperCase().replace('-', ' '))).toBe(hashRecoveryCode(codes[0]));
  });
});
