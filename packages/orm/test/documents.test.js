// db.documents(): schemaless collections of MongoDB, their ids, their cache and their writes behind.
import { Database, MemoryCache, SharedCache, FaultError, UnsupportedError } from '../index.js';
import { MongoClient, ObjectId } from '@xufa/mongo';
import { Bus } from '@xufa/cluster';
import { url, available } from '../../mongo/test/server.js';

describe.skipIf(!available)('documents', () => {
  let db;
  let client;
  let raw;

  beforeAll(async () => {
    client = await new MongoClient(url).connect();
    raw = client.db();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    db = new Database({ backend: 'mongodb', url, name: 'docs' });
    await db.connect();
    for (const name of ['doc_items', 'doc_cached', 'doc_behind', 'doc_renamed']) await raw.collection(name).drop().catch(() => {});
  });

  afterEach(async () => {
    await db.close();
  });

  describe('ids, reads and writes', () => {
    it('gives id where MongoDB has _id: ObjectIds for 24 hex digits, other ids as they are', async () => {
      const items = db.documents('doc_items');
      const inserted = await items.insertOne({ name: 'pen' });
      expect(inserted).toEqual({ name: 'pen', id: expect.stringMatching(/^[0-9a-f]{24}$/) });
      expect((await raw.collection('doc_items').findOne({ name: 'pen' }))._id).toBeInstanceOf(ObjectId);
      await items.insertOne({ id: 'code-1', name: 'cap' });
      expect(await raw.collection('doc_items').findOne({ _id: 'code-1' })).toEqual({ _id: 'code-1', name: 'cap' });
      expect(await items.findById(inserted.id)).toEqual(inserted);
      expect(await items.findById('code-1')).toEqual({ name: 'cap', id: 'code-1' });
      expect(await items.findById('64a000000000000000000999')).toBeNull();
      const both = await items.find({ id: { $in: [inserted.id, 'code-1'] } }, { sort: { name: 1 } });
      expect(both.map((doc) => doc.name)).toEqual(['cap', 'pen']);
      expect(await items.find({ id: { $ne: inserted.id } })).toEqual([{ name: 'cap', id: 'code-1' }]);
    });

    it('finds with the options of the driver, counts, streams and aggregates', async () => {
      const items = db.documents('doc_items');
      await items.insertMany(['b', 'A', 'c', 'á'].map((name, n) => ({ name, n })));
      const sorted = await items.find({}, { sort: { name: 1 }, collation: { locale: 'en', strength: 1 }, projection: { _id: 0, name: 1 } });
      expect(sorted.map((doc) => doc.name)).toEqual(['A', 'á', 'b', 'c']);
      expect((await items.find({ n: { $gte: 1 } }, { sort: { n: -1 }, skip: 1, limit: 1 }))[0].n).toBe(2);
      expect(await items.count({ n: { $lt: 2 } })).toBe(2);
      expect(await items.count({}, { estimated: true })).toBe(4);
      const names = [];
      for await (const doc of await items.cursor({}, { sort: { n: 1 }, batchSize: 2 })) names.push(doc.name);
      expect(names).toEqual(['b', 'A', 'c', 'á']);
      const groups = await items.aggregate([{ $group: { _id: { $mod: ['$n', 2] }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
      expect(groups).toEqual([{ id: '0', count: 2 }, { id: '1', count: 2 }]);
    });

    it('updates ($set), replaces, saves and removes by id', async () => {
      const items = db.documents('doc_items');
      const { id } = await items.insertOne({ name: 'pen', price: 1 });
      expect(await items.update({ id, price: 2 })).toEqual({ name: 'pen', price: 2, id });
      expect(await items.update({ id: '64a000000000000000000999', price: 2 })).toBeNull();
      expect(await items.replace({ id, name: 'ink' })).toEqual({ name: 'ink', id });
      expect(await items.save({ id, stock: 3 })).toEqual({ name: 'ink', stock: 3, id });
      const saved = await items.save({ id: '64a000000000000000000777', name: 'new' });
      expect(saved).toEqual({ id: '64a000000000000000000777', name: 'new' });
      expect(await items.removeById(id)).toBe(1);
      expect(await items.findById(id)).toBeNull();
    });

    it('updates and removes many, findOneAnd..., bulkWrite, indexes, rename', async () => {
      const items = db.documents('doc_items');
      await items.insertMany([{ k: 1 }, { k: 1 }, { k: 2 }]);
      expect((await items.updateMany({ k: 1 }, { $set: { many: true } })).modifiedCount).toBe(2);
      expect((await items.updateMany({ k: 2 }, [{ $set: { twice: { $multiply: ['$k', 2] } } }])).modifiedCount).toBe(1);
      expect((await items.findOne({ k: 2 })).twice).toBe(4);
      const after = await items.findOneAndUpdate({ k: 2 }, { $inc: { k: 1 } }, { returnDocument: 'after' });
      expect(after).toMatchObject({ k: 3, id: expect.any(String) });
      expect(await items.findOneAndReplace({ id: after.id }, { id: 'ignored', k: 9 })).toMatchObject({ k: 3 });
      expect(await items.findOneAndDelete({ k: 9 })).toMatchObject({ k: 9, id: after.id });
      expect(await items.remove({ k: 1 }, { justOne: true })).toBe(1);
      expect(await items.remove({})).toBe(1);
      const bulk = await items.bulkWrite([{ insertOne: { document: { k: 5 } } }, { updateOne: { filter: { k: 5 }, update: { $set: { b: 1 } } } }]);
      expect([bulk.insertedCount, bulk.modifiedCount]).toEqual([1, 1]);
      expect(await items.createIndex({ k: 1 }, { name: 'by_k' })).toBe('by_k');
      expect((await items.indexes()).map((index) => index.name)).toContain('by_k');
      await items.dropIndex('by_k');
      const renamed = await items.rename('doc_renamed');
      expect(await renamed.count()).toBe(1);
      expect(await renamed.drop()).toBe(true);
    });

    it('is of MongoDB only', () => {
      expect(() => new Database({ backend: 'memory' }).documents('x')).toThrow(UnsupportedError);
    });
  });

  describe('the cache', () => {
    it('answers by id and by an index, and every write keeps it right', async () => {
      const items = db.documents('doc_cached', { cache: { indexes: ['code'] } });
      const pen = await items.insertOne({ code: 'P1', name: 'pen' });
      // Changed behind its back: the cache answers until a write of the collection.
      await raw.collection('doc_cached').updateOne({ _id: new ObjectId(pen.id) }, { $set: { name: 'changed' } });
      expect((await items.findById(pen.id)).name).toBe('pen');
      expect((await items.findOne({ code: 'P1' })).name).toBe('pen');
      expect((await items.findOne({ code: 'P1', name: 'changed' })).name).toBe('changed');
      expect((await items.update({ id: pen.id, price: 2 })).name).toBe('changed');
      expect(await items.findById(pen.id)).toEqual({ code: 'P1', name: 'changed', price: 2, id: pen.id });
      await items.findOneAndUpdate({ code: 'P1' }, { $set: { price: 3 } }, { returnDocument: 'after' });
      expect((await items.findById(pen.id)).price).toBe(3);
      await items.findOneAndUpdate({ code: 'P1' }, { $set: { price: 4 } });
      expect((await items.findById(pen.id)).price).toBe(4);
      await items.updateMany({}, { $set: { price: 5 } });
      expect((await items.findOne({ code: 'P1' })).price).toBe(5);
      await items.bulkWrite([{ updateOne: { filter: { code: 'P1' }, update: { $set: { price: 6 } } } }]);
      expect((await items.findById(pen.id)).price).toBe(6);
      // A code that moved to another document is not answered from the old one.
      await items.update({ id: pen.id, code: 'P2' });
      expect(await items.findOne({ code: 'P1' })).toBeNull();
      await items.removeById(pen.id);
      expect(await items.findById(pen.id)).toBeNull();
    });

    it('expires by its ttl, and a cache that fails to read is a miss', async () => {
      const store = new MemoryCache();
      const errors = [];
      db.onCacheError = (err, { operation }) => errors.push(operation);
      const items = db.documents('doc_cached', { cache: { ttl: 30, store } });
      const pen = await items.insertOne({ name: 'pen' });
      await raw.collection('doc_cached').updateOne({ _id: new ObjectId(pen.id) }, { $set: { name: 'changed' } });
      expect((await items.findById(pen.id)).name).toBe('pen');
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect((await items.findById(pen.id)).name).toBe('changed');
      store.faults.fail({ operations: 'get' });
      await raw.collection('doc_cached').updateOne({ _id: new ObjectId(pen.id) }, { $set: { name: 'again' } });
      expect((await items.findById(pen.id)).name).toBe('again');
      expect(errors).toContain('get');
      store.faults.clear();
    });

    it('is shared through the bus of a cluster (SharedCache)', async () => {
      const bus = new Bus();
      const primary = new Database({ backend: 'mongodb', url, name: 'docs', cache: new SharedCache({ bus, name: 'documents' }) });
      const worker = new Database({ backend: 'mongodb', url, name: 'docs', cache: new SharedCache({ bus, name: 'documents' }) });
      const pen = await primary.documents('doc_cached', { cache: { indexes: ['code'] } }).insertOne({ code: 'P1' });
      await raw.collection('doc_cached').deleteMany({});
      expect(await worker.documents('doc_cached', { cache: { indexes: ['code'] } }).findOne({ code: 'P1' })).toEqual(pen);
      await primary.close();
      await worker.close();
    });
  });

  describe('write-behind', () => {
    it('writes single documents to the cache while the database is down, and synchronizes them', async () => {
      const items = db.documents('doc_behind', { cache: { indexes: ['code'], ttl: 60000 }, writeBehind: true });
      const kept = await items.insertOne({ code: 'K', n: 1 });
      const gone = await items.insertOne({ code: 'G', n: 1 });
      db.faults.down();
      const pen = await items.insertOne({ code: 'P', n: 1 });
      expect(pen.id).toMatch(/^[0-9a-f]{24}$/);
      expect(await items.update({ id: pen.id, n: 2 })).toEqual({ code: 'P', n: 2, id: pen.id });
      expect(await items.update({ id: kept.id, n: 5 })).toEqual({ code: 'K', n: 5, id: kept.id });
      expect(await items.removeById(gone.id)).toBe(1);
      expect(await items.findOne({ code: 'P' })).toEqual({ code: 'P', n: 2, id: pen.id });
      expect(await items.pending()).toEqual({ [pen.id]: 'I', [kept.id]: 'U', [gone.id]: 'D' });
      // Writes of many documents fail.
      await expect(items.updateMany({}, { $set: { x: 1 } })).rejects.toThrow(FaultError);
      db.faults.up();
      expect(await items.synchronize()).toEqual({ done: 3, left: 0, error: null });
      expect(await items.pending()).toEqual({});
      const stored = await raw.collection('doc_behind').find({}, { sort: { code: 1 } }).toArray();
      expect(stored.map(({ code, n }) => [code, n])).toEqual([['K', 5], ['P', 2]]);
    });

    it('throws what is not unavailability (a duplicate key), and without writeBehind', async () => {
      const behind = db.documents('doc_behind', { cache: true, writeBehind: true });
      const { id } = await behind.insertOne({ n: 1 });
      await expect(behind.insertOne({ id, n: 2 })).rejects.toThrow(/duplicate key/);
      expect(await behind.pending()).toEqual({});
      const plain = db.documents('doc_items', { cache: true });
      db.faults.down();
      await expect(plain.insertOne({ n: 1 })).rejects.toThrow(FaultError);
      db.faults.up();
    });

    it('tells onUnavailable of the writes that fail for unavailability', async () => {
      const told = [];
      const items = db.documents('doc_behind', { cache: true, writeBehind: true, onUnavailable: (err) => told.push(err instanceof FaultError) });
      db.faults.down();
      await items.insertOne({ n: 1 });
      db.faults.up();
      await expect(items.insertOne({ id: (await items.insertOne({ n: 2 })).id, n: 3 })).rejects.toThrow(/duplicate key/);
      expect(told).toEqual([true]);
    });

    it('asks available() before writing', async () => {
      let up = false;
      const items = db.documents('doc_behind', { cache: true, writeBehind: true, available: () => up });
      const doc = await items.insertOne({ n: 1 });
      expect(await raw.collection('doc_behind').countDocuments()).toBe(0);
      expect(await items.findById(doc.id)).toEqual(doc);
      up = true;
      await items.synchronize();
      expect(await raw.collection('doc_behind').countDocuments()).toBe(1);
    });
  });
});
