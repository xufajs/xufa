// Signing and verifying JWTs with node:crypto's one-shot functions, synchronously (as @xufa/jwt and jsonwebtoken do)
// against with a callback (the work done in libuv's thread pool, UV_THREADPOOL_SIZE threads, 4 by default). Three
// measures for each algorithm and operation, each mode in a process of its own:
// - tokens a second, 64 at a time (a server with 64 requests waiting), sequential for sync;
// - the stall of the event loop meanwhile: how late a timer of 1 ms fires (p50, p99, max), the wait of other requests;
// - the time of one token alone (concurrency 1), where the hand-off to the pool is a cost and nothing runs beside it.
// node bench/micro/jwt-async.js [ms per measure] [--pool N]  (--pool: UV_THREADPOOL_SIZE of the processes measured)
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ALGORITHMS = {
  RS256: { key: () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), hash: 'sha256' },
  PS256: {
    key: () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }),
    hash: 'sha256',
    options: { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST },
  },
  ES256: {
    key: () => crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }),
    hash: 'sha256',
    options: { dsaEncoding: 'ieee-p1363' },
  },
  EdDSA: { key: () => crypto.generateKeyPairSync('ed25519'), hash: null },
};
const BATCH = 64;

function setup(algorithm, operation) {
  const { key, hash, options = {} } = ALGORITHMS[algorithm];
  const { privateKey, publicKey } = key();
  const header = Buffer.from(JSON.stringify({ alg: algorithm, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: '42', role: 'admin', iat: 1, exp: 2 })).toString('base64url');
  const input = Buffer.from(`${header}.${payload}`);
  const signature = crypto.sign(hash, input, { key: privateKey, ...options });
  if (operation === 'sign') {
    const k = { key: privateKey, ...options };
    return {
      sync: () => crypto.sign(hash, input, k),
      async: (done) => crypto.sign(hash, input, k, done),
    };
  }
  const k = { key: publicKey, ...options };
  return {
    sync: () => crypto.verify(hash, input, k, signature),
    async: (done) => crypto.verify(hash, input, k, signature, done),
  };
}

// One batch of BATCH tokens: one after another (sync), or all handed to the pool at once (async).
function batch(fns, mode) {
  if (mode === 'sync') {
    for (let i = 0; i < BATCH; i += 1) fns.sync();
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let left = BATCH;
    const done = (err) => {
      if (err) reject(err);
      else if (--left === 0) resolve();
    };
    for (let i = 0; i < BATCH; i += 1) fns.async(done);
  });
}

// How late a timer of 1 ms fires, in ms, while `work` runs.
function lagSampler() {
  const lags = [];
  let expected = 0;
  let timer;
  const tick = () => {
    const now = performance.now();
    lags.push(Math.max(0, now - expected));
    expected = now + 1;
    timer = setTimeout(tick, 1);
  };
  expected = performance.now() + 1;
  timer = setTimeout(tick, 1);
  return () => {
    clearTimeout(timer);
    return lags.sort((a, b) => a - b);
  };
}
const quantile = (sorted, q) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;

async function child(algorithm, operation, mode, ms) {
  const fns = setup(algorithm, operation);
  for (let i = 0; i < 5; i += 1) await batch(fns, mode);

  // Throughput, and the lag of the event loop meanwhile. A setImmediate between batches lets timers run, as the
  // requests of a server would come between pieces of work.
  const stop = lagSampler();
  let tokens = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    await batch(fns, mode);
    tokens += BATCH;
    await new Promise(setImmediate);
  }
  const elapsed = performance.now() - start;
  const lags = stop();

  // One token alone.
  const single = mode === 'sync' ? () => Promise.resolve(fns.sync()) : () => new Promise((r) => fns.async(r));
  for (let i = 0; i < 200; i += 1) await single();
  let ones = 0;
  const oneStart = performance.now();
  while (performance.now() - oneStart < ms / 2) {
    await single();
    ones += 1;
  }
  const oneUs = ((performance.now() - oneStart) / ones) * 1000;

  process.stdout.write(
    JSON.stringify({
      ops: (tokens / elapsed) * 1000,
      p50: quantile(lags, 0.5),
      p99: quantile(lags, 0.99),
      max: lags[lags.length - 1] || 0,
      oneUs,
    })
  );
}

function main() {
  const args = process.argv.slice(2);
  const poolAt = args.indexOf('--pool');
  const env = { ...process.env };
  if (poolAt !== -1) {
    env.UV_THREADPOOL_SIZE = args[poolAt + 1];
    args.splice(poolAt, 2);
  }
  const ms = Number(args[0]) || 2000;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const lag = (r) => `${r.p50.toFixed(1)} / ${r.p99.toFixed(1)} / ${r.max.toFixed(1)}`;
  process.stdout.write(
    `UV_THREADPOOL_SIZE=${env.UV_THREADPOOL_SIZE || 4}, ${BATCH} at a time, Node.js ${process.version}\n\n` +
      '| Case | sync ops/s | async ops/s | async / sync | sync lag ms p50/p99/max | async lag ms p50/p99/max | one alone sync µs | one alone async µs |\n' +
      '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n'
  );
  for (const algorithm of Object.keys(ALGORITHMS)) {
    for (const operation of ['sign', 'verify']) {
      const r = {};
      for (const mode of ['sync', 'async']) {
        const out = execFileSync(process.execPath, [__filename, '--child', algorithm, operation, mode, String(ms)], {
          cwd: __dirname,
          env,
        });
        r[mode] = JSON.parse(out);
      }
      process.stdout.write(
        `| ${algorithm} ${operation} | ${fmt(r.sync.ops)} | ${fmt(r.async.ops)} | ${(r.async.ops / r.sync.ops).toFixed(2)}x | ${lag(r.sync)} | ${lag(r.async)} | ${r.sync.oneUs.toFixed(1)} | ${r.async.oneUs.toFixed(1)} |\n`
      );
    }
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]));
else main();
