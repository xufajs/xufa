/* eslint-disable no-console */
// The S3 client of @xufa/orm (its s3 backend: SigV4 over fetch, no dependencies) against the AWS SDK v3
// (@aws-sdk/client-s3), on the same store: PUT, GET, HEAD and DELETE of small objects (1 KiB), and a listing of a
// prefix of 100. Each client and operation runs in a process of its own, 16 requests at a time; the best of the
// rounds. The store is XUFA_S3_URL (http://<key>:<secret>@<host>:<port>/<bucket>?region=<region>), as a SeaweedFS
// or MinIO of your own: the network and the store weigh more than the clients, so compare them with each other.
//
//   XUFA_S3_URL=http://xufa:xufa-secret-key@localhost:8333/bench node bench/micro/s3.js [rounds]
const { execFileSync } = require('node:child_process');

const TIME = Number(process.env.BENCH_TIME) || 3000;
const CONCURRENCY = 16;
const BODY = Buffer.alloc(1024, 'x');

function store() {
  const url = new URL(process.env.XUFA_S3_URL);
  return {
    endpoint: `${url.protocol}//${url.host}`,
    bucket: url.pathname.slice(1),
    region: url.searchParams.get('region') || 'us-east-1',
    accessKeyId: decodeURIComponent(url.username),
    secretAccessKey: decodeURIComponent(url.password),
  };
}

// The operations of each client, on keys of a prefix of its own.
async function clientOf(name, prefix) {
  const s = store();
  if (name === 'xufa') {
    // The backend itself (not exported: a path inside the package).
    const path = require('node:path'); // eslint-disable-line global-require
    const lib = path.join(path.dirname(require.resolve('@xufa/orm')), 'lib/backends/blob/s3');
    const { S3Backend } = require(lib); // eslint-disable-line global-require
    const backend = new S3Backend({
      endpoint: s.endpoint,
      bucket: s.bucket,
      region: s.region,
      forcePathStyle: true,
      createBucket: true,
      credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
      prefix,
    });
    await backend.storeCreate();
    return {
      put: (key) => backend.storePut('t', key, BODY, {}),
      get: async (key) => {
        const stream = await backend.storeRead('t', key);
        for await (const chunk of stream) if (!chunk) break;
      },
      head: (key) => backend.storeHead('t', key),
      del: (key) => backend.storeDelete('t', key),
      list: async () => {
        let n = 0;
        for await (const item of backend.storeList('t', 'l/')) if (item.key) n += 1;
        return n;
      },
    };
  }
  const sdk = require('@aws-sdk/client-s3'); // eslint-disable-line global-require
  const client = new sdk.S3Client({
    endpoint: s.endpoint,
    region: s.region,
    forcePathStyle: true,
    credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
  });
  const Key = (key) => `${prefix}t/${key}`;
  return {
    put: (key) => client.send(new sdk.PutObjectCommand({ Bucket: s.bucket, Key: Key(key), Body: BODY })),
    get: async (key) => {
      const answer = await client.send(new sdk.GetObjectCommand({ Bucket: s.bucket, Key: Key(key) }));
      await answer.Body.transformToByteArray();
    },
    head: (key) => client.send(new sdk.HeadObjectCommand({ Bucket: s.bucket, Key: Key(key) })),
    del: (key) => client.send(new sdk.DeleteObjectCommand({ Bucket: s.bucket, Key: Key(key) })),
    list: async () => {
      let n = 0;
      let token;
      do {
        const page = await client.send(
          new sdk.ListObjectsV2Command({ Bucket: s.bucket, Prefix: Key('l/'), ContinuationToken: token })
        );
        n += (page.Contents || []).length;
        token = page.NextContinuationToken;
      } while (token);
      return n;
    },
  };
}

// Child: operations a second of one client and operation.
async function child(name, operation) {
  const prefix = `bench-${name}-${operation}-${process.pid}/`;
  const client = await clientOf(name, prefix);
  const keys = Array.from({ length: 200 }, (_, i) => `k${i}`);
  if (operation !== 'put') await Promise.all(keys.map((key) => client.put(key)));
  if (operation === 'list') await Promise.all(Array.from({ length: 100 }, (_, i) => client.put(`l/${i}`)));
  let next = 0;
  const once = async () => {
    const key = keys[next % keys.length];
    next += 1;
    if (operation === 'del') {
      await client.del(key);
      await client.put(key); // deleted again next time
      return;
    }
    if (operation === 'list') {
      if ((await client.list()) !== 100) throw new Error('the listing is not 100 keys');
      return;
    }
    await client[operation](key);
  };
  for (let i = 0; i < 50; i += 1) await once(); // warm-up
  let count = 0;
  const end = Date.now() + TIME;
  const started = Date.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (Date.now() < end) {
        await once();
        count += 1;
      }
    })
  );
  console.log((count * 1000) / (Date.now() - started));
}

const OPERATIONS = {
  put: 'PUT 1 KiB',
  get: 'GET 1 KiB',
  head: 'HEAD',
  del: 'DELETE (and PUT again)',
  list: 'list 100 keys',
};

function main() {
  if (!process.env.XUFA_S3_URL) {
    console.error('XUFA_S3_URL is the store to measure on (http://<key>:<secret>@<host>:<port>/<bucket>)');
    process.exitCode = 1;
    return;
  }
  const rounds = Number(process.argv[2]) || 3;
  const rows = [];
  for (const [operation, label] of Object.entries(OPERATIONS)) {
    const best = { xufa: 0, 'aws-sdk': 0 };
    for (let round = 0; round < rounds; round += 1) {
      for (const name of Object.keys(best)) {
        const ops = Number(
          execFileSync(process.execPath, [__filename, '--child', name, operation], { encoding: 'utf8' }).trim()
        );
        best[name] = Math.max(best[name], ops);
      }
    }
    rows.push({
      operation: label,
      'xufa ops/s': Math.round(best.xufa),
      'aws-sdk ops/s': Math.round(best['aws-sdk']),
      'xufa / aws-sdk': Number((best.xufa / best['aws-sdk']).toFixed(2)),
    });
  }
  console.log(`S3 clients on ${store().endpoint}, ${CONCURRENCY} at a time, best of ${rounds} rounds`);
  console.table(rows);
}

if (process.argv[2] === '--child') {
  child(process.argv[3], process.argv[4]).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else main();
