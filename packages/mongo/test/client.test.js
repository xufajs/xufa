const { MongoClient, MongoServerError, ObjectId, parseUrl } = require('..');
const { url, available } = require('./server');

describe('parseUrl', () => {
  it('parses connection strings', () => {
    expect(parseUrl('mongodb://us%40r:p%3Ass@a:1,b/db?authSource=admin&tls=true')).toEqual({
      srv: false,
      username: 'us@r',
      password: 'p:ss',
      hosts: [
        { host: 'a', port: 1 },
        { host: 'b', port: 27017 },
      ],
      database: 'db',
      options: { authSource: 'admin', tls: 'true' },
    });
    expect(parseUrl('mongodb+srv://cluster.example.com').srv).toBe(true);
    expect(() => parseUrl('http://x')).toThrow('Invalid MongoDB connection string');
  });
});

describe.skipIf(!available)('MongoClient', () => {
  let client;
  let collection;

  beforeAll(async () => {
    client = await new MongoClient(url, { maxPoolSize: 3 }).connect();
    collection = client.db().collection('driver_test');
    await collection.drop();
  });

  afterAll(async () => {
    if (client) {
      await collection.drop();
      await client.close();
    }
  });

  beforeEach(async () => {
    await collection.deleteMany({});
  });

  it('inserts and finds documents', async () => {
    const { insertedId } = await collection.insertOne({ name: 'Ada', age: 36 });
    expect(insertedId).toBeInstanceOf(ObjectId);
    const { insertedIds } = await collection.insertMany([
      { name: 'Grace', age: 85 },
      { name: 'Alan', age: 41 },
    ]);
    expect(insertedIds).toHaveLength(2);
    const doc = await collection.findOne({ _id: insertedId });
    expect(doc).toEqual({ _id: insertedId, name: 'Ada', age: 36 });
    const names = (await collection.find({ age: { $gt: 40 } }, { sort: { name: 1 } }).toArray()).map((d) => d.name);
    expect(names).toEqual(['Alan', 'Grace']);
    expect(await collection.countDocuments({ name: /^A/ })).toBe(2);
    expect(await collection.findOne({ name: 'Nobody' })).toBeNull();
  });

  it('reads cursors in batches', async () => {
    await collection.insertMany(Array.from({ length: 250 }, (_, i) => ({ i })));
    const all = await collection.find({}, { sort: { i: 1 }, batchSize: 20 }).toArray();
    expect(all.map((doc) => doc.i)).toEqual(Array.from({ length: 250 }, (_, i) => i));
    let count = 0;
    for await (const doc of collection.aggregate([{ $match: { i: { $gte: 100 } } }], { batchSize: 7 })) {
      expect(doc.i).toBeGreaterThanOrEqual(100);
      count += 1;
      if (count === 30) break;
    }
    expect(count).toBe(30);
  });

  it('updates and deletes', async () => {
    await collection.insertMany([{ n: 1 }, { n: 2 }, { n: 3 }]);
    const updated = await collection.updateMany({ n: { $gte: 2 } }, { $inc: { n: 10 } });
    expect(updated.matchedCount).toBe(2);
    expect(updated.modifiedCount).toBe(2);
    const upserted = await collection.updateOne({ n: 99 }, { $set: { m: 1 } }, { upsert: true });
    expect(upserted.upsertedId).toBeInstanceOf(ObjectId);
    expect((await collection.deleteMany({ n: { $gt: 10, $lt: 99 } })).deletedCount).toBe(2);
    expect((await collection.deleteOne({})).deletedCount).toBe(1);
    expect(await collection.countDocuments()).toBe(1);
  });

  it('throws the errors of the server', async () => {
    await collection.createIndex({ email: 1 }, { unique: true });
    await collection.insertOne({ email: 'a@b.c' });
    const error = await collection.insertOne({ email: 'a@b.c' }).catch((err) => err);
    expect(error).toBeInstanceOf(MongoServerError);
    expect(error.code).toBe(11000);
    await expect(client.db().command({ notACommand: 1 })).rejects.toBeInstanceOf(MongoServerError);
    await collection.dropIndex('email_1');
  });

  it('runs commands at the same time on the pool', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => collection.insertOne({ i }).then(() => collection.countDocuments({ i })))
    );
    expect(results.every((n) => n === 1)).toBe(true);
    expect(client.connections.length).toBeLessThanOrEqual(3);
  });

  it('round-trips values through the server', async () => {
    const doc = { date: new Date(), long: 2n ** 60n, nested: { list: [1, 'a', null] }, bytes: Buffer.from('xyz') };
    const { insertedId } = await collection.insertOne(doc);
    const found = await collection.findOne({ _id: insertedId });
    expect(found.date.getTime()).toBe(doc.date.getTime());
    expect(found.long).toBe(2n ** 60n);
    expect(found.nested).toEqual(doc.nested);
    expect(found.bytes.toString()).toBe('xyz');
  });

  it('reads batches ahead, in order, and closes cursors read ahead', async () => {
    await collection.insertMany(Array.from({ length: 1000 }, (_, i) => ({ i })));
    const openCursors = async () => (await client.db('admin').command({ serverStatus: 1 })).metrics.cursor.open.total;
    const before = await openCursors();
    for (const prefetch of [true, false]) {
      const docs = await collection.find({}, { sort: { i: 1 }, batchSize: 7, prefetch }).toArray();
      expect(docs.map((doc) => doc.i)).toEqual(Array.from({ length: 1000 }, (_, i) => i));
      let seen = 0;
      for await (const doc of collection.aggregate([{ $sort: { i: 1 } }], { batchSize: 5, prefetch })) {
        expect(doc.i).toBe(seen);
        seen += 1;
        if (seen === 23) break;
      }
    }
    expect(await openCursors()).toBe(before);
  });

  it('throws the errors of a batch read ahead', async () => {
    await collection.insertMany(Array.from({ length: 50 }, (_, i) => ({ i })));
    const cursor = collection.find({}, { batchSize: 10 });
    await cursor.next();
    // The cursor dies on the server while its next batch is read ahead or before.
    await client
      .db()
      .command({ killCursors: 'driver_test', cursors: [BigInt(cursor.id)] })
      .catch(() => {});
    await expect(cursor.toArray()).rejects.toBeInstanceOf(MongoServerError);
  });

  it('inserts more than fits in a command document (16 MB), ordered and not', async () => {
    const big = 'x'.repeat(512 * 1024);
    for (const ordered of [true, false]) {
      await collection.deleteMany({});
      const docs = Array.from({ length: 40 }, (_, i) => ({ i, big }));
      const result = await collection.insertMany(docs, { ordered });
      expect(result.insertedCount).toBe(40);
      expect(await collection.countDocuments()).toBe(40);
    }
  });

  it('stops at the first error when ordered, and inserts the rest when not', async () => {
    const docs = () => Array.from({ length: 3000 }, (_, i) => ({ _id: i === 1500 ? 0 : i + 1 }));
    await collection.insertOne({ _id: 0 });
    await expect(collection.insertMany(docs())).rejects.toMatchObject({ code: 11000 });
    expect(await collection.countDocuments()).toBe(1 + 1500);
    await collection.deleteMany({});
    await collection.insertOne({ _id: 0 });
    await expect(collection.insertMany(docs(), { ordered: false })).rejects.toMatchObject({ code: 11000 });
    expect(await collection.countDocuments()).toBe(3000);
  });

  it('inserts large unordered batches in parts at the same time', async () => {
    const docs = Array.from({ length: 20000 }, (_, i) => ({ i }));
    const result = await collection.insertMany(docs, { ordered: false });
    expect(result.insertedIds).toHaveLength(20000);
    expect(await collection.countDocuments()).toBe(20000);
    expect(new Set((await collection.find({}).toArray()).map((doc) => doc.i)).size).toBe(20000);
  });
});

describe.skipIf(!available)('compression', () => {
  it.each(['zlib', 'zstd'])('sends and receives messages compressed with %s', async (compressor) => {
    const client = await new MongoClient(url, { compressors: compressor }).connect();
    try {
      const collection = client.db().collection(`compressed_${compressor}`);
      await collection.drop();
      await collection.insertMany(Array.from({ length: 2000 }, (_, i) => ({ i, text: 'x'.repeat(100) })));
      const docs = await collection.find({}, { sort: { i: 1 } }).toArray();
      expect(docs).toHaveLength(2000);
      expect(docs[1999].i).toBe(1999);
      expect(client.connections.every((connection) => connection.compressor === compressor)).toBe(true);
      await collection.drop();
    } finally {
      await client.close();
    }
  });
});
