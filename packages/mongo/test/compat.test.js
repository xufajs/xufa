// The official driver (mongodb 7.0.0) and @xufa/mongo, on the same server: the same operations on a collection of each,
// the same results expected (ids and dates compared as their JSON). What applications built on the official driver use
// beyond the basics: collation, allowDiskUse, cursor.map, estimatedDocumentCount, findOneAndUpdate / Replace / Delete,
// bulkWrite, rename, listCollections as a cursor, commands after close().
import * as official from 'mongodb';
import * as xufa from '../index.js';
import { url, available } from './server.js';

const plain = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));

// The results a driver gives, in order, for the same script.
async function script(driver, name) {
  const { MongoClient, ObjectId } = driver;
  const client = await new MongoClient(url, { serverSelectionTimeoutMS: 2000 }).connect();
  const db = client.db();
  const results = [];
  const keep = (label, value) => results.push([label, plain(value)]);
  try {
    for (const suffix of ['', '_renamed']) await db.collection(`${name}${suffix}`).drop().catch(() => {});
    const books = db.collection(name);
    const id = (n) => new ObjectId(`64a000000000000000000${String(n).padStart(3, '0')}`);
    const docs = ['ana', 'Álvaro', 'bea', 'Bruno', 'carla', 'Zoe', 'émile'].map((title, i) => ({
      _id: id(i + 1),
      title,
      n: i,
      at: new Date(Date.UTC(2026, 0, i + 1)),
      tags: i % 2 ? ['a', 'b'] : ['c'],
    }));
    keep('insertMany', (await books.insertMany(docs)).insertedCount);

    keep('find collation option', await books.find({}, { sort: { title: 1 }, collation: { locale: 'en', strength: 1 } }).toArray());
    keep('find collation()', await books.find({ title: 'ANA' }).collation({ locale: 'en', strength: 2 }).toArray());
    keep('find allowDiskUse batchSize', await books.find({ n: { $gte: 2 } }, { allowDiskUse: true, batchSize: 2, sort: { n: -1 } }).toArray());
    keep('find map', await books.find({}, { sort: { n: 1 }, projection: { title: 1 } }).map((doc) => doc.title.toUpperCase()).toArray());
    keep('find map map', await books.find({}, { sort: { n: 1 } }).map((doc) => doc.n).map((n) => n * 10).toArray());
    const cursor = books.find({}, { sort: { n: 1 } }).map((doc) => `#${doc.n}`);
    const iterated = [];
    for await (const item of cursor) iterated.push(item);
    keep('for await map', iterated);
    keep('aggregate map', await books.aggregate([{ $group: { _id: { $size: '$tags' }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]).map((doc) => ({ ...doc, k: 1 })).toArray());

    keep('estimatedDocumentCount', await books.estimatedDocumentCount());
    keep('countDocuments', await books.countDocuments({ n: { $lt: 3 } }));

    keep('findOneAndUpdate before', await books.findOneAndUpdate({ _id: id(1) }, { $set: { n: 100 } }));
    keep('findOneAndUpdate after', await books.findOneAndUpdate({ _id: id(2) }, { $inc: { n: 1 } }, { returnDocument: 'after', projection: { n: 1 } }));
    keep('findOneAndUpdate missing', await books.findOneAndUpdate({ _id: id(99) }, { $set: { n: 1 } }));
    keep('findOneAndUpdate upsert', await books.findOneAndUpdate({ _id: id(50) }, { $set: { title: 'new' } }, { upsert: true, returnDocument: 'after' }));
    keep('findOneAndUpdate sort', await books.findOneAndUpdate({ n: { $gte: 0 } }, { $set: { first: true } }, { sort: { n: -1 }, returnDocument: 'after' }));
    keep('findOneAndUpdate metadata', await books.findOneAndUpdate({ _id: id(3) }, { $set: { n: 7 } }, { includeResultMetadata: true }));
    keep('findOneAndUpdate arrayFilters', await books.findOneAndUpdate({ _id: id(4) }, { $set: { 'tags.$[t]': 'z' } }, { arrayFilters: [{ t: 'a' }], returnDocument: 'after' }));
    keep('findOneAndReplace', await books.findOneAndReplace({ _id: id(5) }, { title: 'replaced', n: 5 }, { returnDocument: 'after' }));
    keep('findOneAndDelete', await books.findOneAndDelete({ _id: id(6) }));
    keep('findOneAndDelete missing', await books.findOneAndDelete({ _id: id(98) }));

    keep('updateOne upsert', await books.updateOne({ _id: id(60) }, { $set: { title: 'up' } }, { upsert: true }));
    keep('null options', [(await books.updateMany({ n: -1 }, { $set: { x: 1 } }, null)).matchedCount, (await books.find({ n: 0 }, null).toArray()).length]);
    keep('updateMany', await books.updateMany({ n: { $lt: 10 } }, { $set: { small: true } }));

    const ordered = await books.bulkWrite([
      { insertOne: { document: { _id: id(70), title: 'bulk', n: 70 } } },
      { insertOne: { document: { _id: id(71), title: 'bulk2', n: 71 } } },
      { updateOne: { filter: { _id: id(70) }, update: { $set: { n: 700 } } } },
      { updateOne: { filter: { _id: id(72) }, update: { $set: { n: 72 } }, upsert: true } },
      { updateMany: { filter: { small: true }, update: { $set: { touched: 1 } } } },
      { replaceOne: { filter: { _id: id(71) }, replacement: { title: 'r', n: 1 } } },
      { replaceOne: { filter: { _id: id(73) }, replacement: { title: 'r2' }, upsert: true } },
      { insertOne: { document: { _id: id(74), title: 'after updates' } } },
      { deleteOne: { filter: { _id: id(74) } } },
      { deleteMany: { filter: { touched: 1 } } },
    ]);
    const counts = (result) => ({
      insertedCount: result.insertedCount,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      deletedCount: result.deletedCount,
      upsertedCount: result.upsertedCount,
      insertedIds: result.insertedIds,
      upsertedIds: result.upsertedIds,
    });
    keep('bulkWrite ordered', counts(ordered));
    const unordered = await books.bulkWrite(
      [
        { deleteOne: { filter: { _id: id(80) } } },
        { insertOne: { document: { _id: id(80), title: 'x' } } },
        { updateOne: { filter: { _id: id(81) }, update: { $set: { n: 1 } }, upsert: true } },
        { insertOne: { document: { _id: id(82), title: 'y' } } },
      ],
      { ordered: false }
    );
    // (Unordered, the official driver numbers the ids its own way: the counts are compared.)
    const { insertedIds, upsertedIds, ...unorderedCounts } = counts(unordered);
    keep('bulkWrite unordered', { ...unorderedCounts, ids: [Object.values(insertedIds), Object.values(upsertedIds)] });
    keep('after bulk', await books.find({}, { sort: { _id: 1 } }).toArray());

    const renamed = await books.rename(`${name}_renamed`);
    await books.insertOne({ _id: id(90), a: undefined, nested: { x: undefined }, list: [1, undefined] });
    await books.updateOne({ _id: id(90) }, { $set: { b: undefined } });
    keep('undefined as null', await books.findOne({ _id: id(90) }));
    keep('listCollections', (await db.listCollections({ name: `${name}_renamed` }, { nameOnly: true }).toArray()).map((c) => c.name.endsWith('_renamed')));
    keep('rename', [renamed.collectionName === `${name}_renamed`, renamed.dbName, await renamed.countDocuments()]);
    await renamed.drop();
  } finally {
    await client.close();
  }
  // After close(), until connect() again: an error, and no connection opened again.
  const error = await db.collection(name).countDocuments().catch((err) => err);
  keep('after close', [error.name, error.message]);
  keep('listCollections after close', await db.listCollections().toArray().catch((err) => err.name));
  const other = await MongoClient.connect(url);
  const { databases } = await other.db().admin().listDatabases({ nameOnly: true });
  keep('static connect, admin', [databases.some((item) => item.name === other.db().databaseName), (await other.db().admin().ping()).ok]);
  await other.close();
  await client.connect();
  keep('connect again', await db.collection(name).countDocuments());
  await client.close();
  return results;
}

describe.skipIf(!available)('@xufa/mongo against the official driver', () => {
  it('gives the same results to the same operations', async () => {
    const [expected, actual] = [await script(official, 'compat_official'), await script(xufa, 'compat_xufa')];
    expect(actual.map(([label]) => label)).toEqual(expected.map(([label]) => label));
    actual.forEach(([label, value], i) => {
      expect({ label, value }).toEqual({ label, value: expected[i][1] });
    });
  });
});
