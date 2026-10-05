// sign() and verify() with a callback: RSA keys sign in libuv's thread pool, the rest is done on the event loop; the
// results are those of the calls without a callback.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('..');
const jwa = require('../lib/jwa');

const signCb = promisify(jwt.sign);
const verifyCb = promisify(jwt.verify);

const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const keys = {
  RS256: rsa,
  PS384: rsa,
  ES256: crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }),
  ES512: crypto.generateKeyPairSync('ec', { namedCurve: 'P-521' }),
  ES256K: crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' }),
  EdDSA: crypto.generateKeyPairSync('ed25519'),
};

describe('sign() and verify() with a callback', () => {
  for (const [algorithm, { privateKey, publicKey }] of Object.entries(keys)) {
    it(`${algorithm}: signed with a callback, verified both ways`, async () => {
      let called = false;
      const pending = signCb({ sub: '1' }, privateKey, { algorithm }).then((token) => {
        called = true;
        return token;
      });
      expect(called).toBe(false); // not before sign() returns
      const token = await pending;
      expect(jwt.verify(token, publicKey).sub).toBe('1');
      expect((await verifyCb(token, publicKey)).sub).toBe('1');
      expect((await verifyCb(jwt.sign({ sub: '2' }, privateKey, { algorithm }), publicKey)).sub).toBe('2');
    });
  }

  it('only RSA signs in the thread pool', () => {
    for (const algorithm of ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512']) {
      expect(typeof jwa(algorithm).signAsync).toBe('function');
    }
    for (const algorithm of ['HS256', 'ES256', 'ES256K', 'EdDSA', 'none']) expect(jwa(algorithm).signAsync).toBe(undefined);
    expect(jwa('RS256').verifyAsync).toBe(undefined);
  });

  it('RS256 (deterministic) gives the same token as without a callback', async () => {
    const options = { algorithm: 'RS256', noTimestamp: true };
    expect(await signCb({ sub: '1' }, rsa.privateKey, options)).toBe(jwt.sign({ sub: '1' }, rsa.privateKey, options));
  });

  it('refuses in the callback what is refused without', async () => {
    const token = jwt.sign({ sub: '1' }, keys.ES256.privateKey, { algorithm: 'ES256' });
    const [input, signature] = [token.slice(0, token.lastIndexOf('.')), token.slice(token.lastIndexOf('.') + 1)];
    const flipped = `${input}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
    await expect(verifyCb(flipped, keys.ES256.publicKey)).rejects.toThrow('invalid signature');
    await expect(verifyCb(`${input}.${signature.slice(0, -4)}`, keys.ES256.publicKey)).rejects.toThrow(
      new jwt.JsonWebTokenError('invalid signature')
    );
    await expect(verifyCb(token, keys.ES256K.publicKey)).rejects.toThrow(/requires curve/);
    await expect(verifyCb(token, keys.ES256.publicKey, { audience: 'x' })).rejects.toThrow('jwt audience invalid');
    await expect(signCb({}, keys.ES256.privateKey, { algorithm: 'RS256' })).rejects.toThrow(/"ec"/);
    const small = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
    await expect(signCb({}, small.privateKey, { algorithm: 'RS256' })).rejects.toThrow(/minimum key size of 2048/);
  });

  it('HMAC and none, done on the event loop, answer on a later tick', async () => {
    const token = await signCb({ sub: '1' }, 'a secret', { algorithm: 'HS256' });
    expect((await verifyCb(token, 'a secret')).sub).toBe('1');
    await expect(verifyCb(token, 'another secret')).rejects.toThrow('invalid signature');
    const unsigned = await signCb({ sub: '1' }, null, { algorithm: 'none' });
    expect((await verifyCb(unsigned, null, { algorithms: ['none'] })).sub).toBe('1');
  });

  it('calls back once', async () => {
    let calls = 0;
    await new Promise((resolve) => {
      jwt.sign({ sub: '1' }, rsa.privateKey, { algorithm: 'RS256' }, () => {
        calls += 1;
        setTimeout(resolve, 20);
      });
    });
    expect(calls).toBe(1);
  });
});
