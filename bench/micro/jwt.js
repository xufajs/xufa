// @xufa/jwt against jsonwebtoken: signing, verifying and decoding tokens with the same keys and claims. Each library
// and case runs in a process of its own, as in logger.js, so that no case inherits the type feedback of another.
// node bench/micro/jwt.js [rounds]
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const libraries = {
  jsonwebtoken: () => require('jsonwebtoken'),
  xufa: () => require('@xufa/jwt'),
};

const claims = { sub: '42', role: 'admin', scope: ['read', 'write'] };
const signOptions = { expiresIn: '15m', issuer: 'app', audience: 'api' };
const verifyOptions = { issuer: 'app', audience: 'api' };

// The keys as PEM text, as most applications give them (and a KeyObject for RS256, which is not parsed each time).
function keysOf(algorithm) {
  if (algorithm.startsWith('HS')) {
    const secret = crypto.randomBytes(32).toString('hex');
    return { sign: secret, verify: secret };
  }
  const options = {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  };
  const { publicKey, privateKey } = algorithm.startsWith('ES')
    ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256', ...options })
    : algorithm === 'EdDSA'
      ? crypto.generateKeyPairSync('ed25519', options)
      : crypto.generateKeyPairSync('rsa', { modulusLength: 2048, ...options });
  return { sign: privateKey, verify: publicKey };
}

// [algorithm, operation, key form]
const cases = {
  'HS256 sign': ['HS256', 'sign'],
  'HS256 verify': ['HS256', 'verify'],
  'HS256 decode': ['HS256', 'decode'],
  'RS256 sign': ['RS256', 'sign'],
  'RS256 verify': ['RS256', 'verify'],
  'RS256 verify, KeyObject': ['RS256', 'verify', 'object'],
  'ES256 sign': ['ES256', 'sign'],
  'ES256 verify': ['ES256', 'verify'],
  'EdDSA sign': ['EdDSA', 'sign'],
  'EdDSA verify': ['EdDSA', 'verify'],
};

// Operations a second: batches until a quarter of a second has gone, after a warm-up.
function child(libraryName, caseName) {
  const jwt = libraries[libraryName]();
  const [algorithm, operation, form] = cases[caseName];
  if (libraryName === 'jsonwebtoken' && algorithm === 'EdDSA') return process.stdout.write('NaN');
  const keys = keysOf(algorithm);
  if (form === 'object') keys.verify = crypto.createPublicKey(keys.verify);
  const token = jwt.sign(claims, keys.sign, { algorithm, ...signOptions });
  const fns = {
    sign: () => jwt.sign(claims, keys.sign, { algorithm, ...signOptions }),
    verify: () => jwt.verify(token, keys.verify, { algorithms: [algorithm], ...verifyOptions }),
    decode: () => jwt.decode(token, { complete: true }),
  };
  const fn = fns[operation];
  // RSA signing takes about a millisecond: smaller batches for the asymmetric algorithms.
  const batch = algorithm.startsWith('HS') ? 2000 : 20;
  for (let i = 0; i < batch * 20; i += 1) fn();
  let calls = 0;
  const start = process.hrtime.bigint();
  let ns = 0;
  while (ns < 500e6) {
    for (let i = 0; i < batch; i += 1) fn();
    calls += batch;
    ns = Number(process.hrtime.bigint() - start);
  }
  process.stdout.write(String((calls / ns) * 1e9));
}

function main() {
  const rounds = Number(process.argv[2]) || 5;
  const fmt = (n) => (Number.isNaN(n) ? 'n/a' : Math.round(n).toLocaleString('en-US'));
  process.stdout.write(
    '| Case | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |\n| --- | ---: | ---: | ---: |\n'
  );
  for (const caseName of Object.keys(cases)) {
    const ops = {};
    // The libraries take turns; the best round of each is kept.
    for (let round = 0; round < rounds; round += 1) {
      for (const name of Object.keys(libraries)) {
        const out = execFileSync(process.execPath, [__filename, '--child', name, caseName], { cwd: __dirname });
        const value = Number(out);
        ops[name] = Number.isNaN(value) ? NaN : Math.max(ops[name] || 0, value);
      }
    }
    const ratio = Number.isNaN(ops.jsonwebtoken) ? 'n/a' : `${(ops.xufa / ops.jsonwebtoken).toFixed(2)}x`;
    process.stdout.write(`| ${caseName} | ${fmt(ops.jsonwebtoken)} | ${fmt(ops.xufa)} | ${ratio} |\n`);
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4]);
else main();
