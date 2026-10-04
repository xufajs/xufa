// A replica set: XUFA_MONGO_RS_URL, or one of three members on 27031-27033 (rs3). Skipped when it cannot be reached.
const { spawnSync } = require('node:child_process');
const { MongoClient, parseUrl } = require('..');

const url =
  process.env.XUFA_MONGO_RS_URL || 'mongodb://127.0.0.1:27031,127.0.0.1:27032,127.0.0.1:27033/xufa_test?replicaSet=rs3';

function reachable() {
  if (url === 'off') return false;
  const [{ host, port }] = parseUrl(url).hosts;
  const script = `require('node:net').connect(${port}, ${JSON.stringify(host)}).on('connect', () => process.exit(0)).on('error', () => process.exit(1));`;
  return spawnSync(process.execPath, ['-e', script], { timeout: 3000 }).status === 0;
}

const available = reachable();

describe.skipIf(!available)('replica set', () => {
  let client;
  let collection;

  beforeAll(async () => {
    client = await new MongoClient(url, { heartbeatFrequencyMS: 1000 }).connect();
    collection = client.db().collection('rs_test');
    await collection.drop();
  }, 60000);

  afterAll(async () => {
    if (client) {
      await collection.drop();
      await client.close();
    }
  }, 60000);

  it('finds every member from one of them', async () => {
    const [first] = parseUrl(url).hosts;
    const one = await new MongoClient(`mongodb://${first.host}:${first.port}/?replicaSet=rs3`).connect();
    try {
      for (let i = 0; i < 40 && one.topology.servers.size < 3; i += 1)
        await new Promise((resolve) => setTimeout(resolve, 250));
      expect(one.topology.servers.size).toBe(3);
      expect(one.topology.type).toBe('ReplicaSet');
      expect(one.supportsTransactions).toBe(true);
    } finally {
      await one.close();
    }
  }, 30000);

  it('reads from secondaries by read preference', async () => {
    await collection.insertMany(
      Array.from({ length: 10 }, (_, i) => ({ i })),
      { writeConcern: { w: 'majority' } }
    );
    const hello = await client.db().command({ hello: 1 }, { readPreference: 'secondary' });
    expect(hello.secondary).toBe(true);
    const docs = await collection.find({}, { readPreference: 'secondary', sort: { i: 1 } }).toArray();
    expect(docs.map((doc) => doc.i)).toEqual(Array.from({ length: 10 }, (_, i) => i));
    expect(await collection.countDocuments({}, { readPreference: 'secondaryPreferred' })).toBe(10);
    const primary = await client.db().command({ hello: 1 }, { readPreference: 'primary' });
    expect(primary.isWritablePrimary).toBe(true);
  }, 30000);

  it('runs transactions', async () => {
    const session = client.startSession();
    await session.withTransaction(async () => {
      await collection.insertOne({ tx: 1 }, { session });
      await collection.insertOne({ tx: 2 }, { session });
    });
    await expect(
      session.withTransaction(async () => {
        await collection.insertOne({ tx: 3 }, { session });
        throw new Error('rolled back');
      })
    ).rejects.toThrow('rolled back');
    await session.endSession();
    expect(await collection.countDocuments({ tx: { $exists: true } })).toBe(2);
  }, 30000);

  it('keeps writing when the primary steps down (retryable writes)', async () => {
    await collection.deleteMany({});
    const before = client.topology.primary.address;
    let written = 0;
    let stop = false;
    const writer = (async () => {
      while (!stop) {
        await collection.insertOne({ n: written });
        written += 1;
      }
    })();
    await new Promise((resolve) => setTimeout(resolve, 300));
    // The primary steps down: the writes wait for the new one, and the one cut is sent again (once applied).
    await client
      .db('admin')
      .command({ replSetStepDown: 30, force: true })
      .catch(() => {});
    for (let i = 0; i < 120; i += 1) {
      const primary = client.topology.primary;
      if (primary && primary.address !== before && written > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
    stop = true;
    await writer;
    expect(client.topology.primary.address).not.toBe(before);
    const docs = await collection.find({}).toArray();
    expect(docs).toHaveLength(written);
    expect(new Set(docs.map((doc) => doc.n)).size).toBe(written);
    await collection.insertMany(Array.from({ length: 3000 }, (_, i) => ({ batch: i })));
    expect(await collection.countDocuments({ batch: { $exists: true } })).toBe(3000);
  }, 120000);
});
