import { expectTypeOf } from '@xufa/test';
import { MongoClient, Collection, Cursor, ObjectId, MongoServerError, InsertManyResult, Document } from '../..';
import { Decimal128, MongoNetworkError } from '../..';

interface User {
  _id?: ObjectId;
  name: string;
  age: number;
}

async function main() {
  const client = await new MongoClient('mongodb://localhost:27017/app', {
    readPreference: 'secondaryPreferred',
    compressors: 'zstd,zlib',
    retryWrites: true,
  }).connect();
  const users = client.db().collection<User>('users');
  expectTypeOf(users).toEqualTypeOf<Collection<User>>();
  const cursor = users.find({ age: { $gte: 18 } }, { sort: { name: 1 }, readPreference: 'secondary' });
  expectTypeOf(cursor).toEqualTypeOf<Cursor<User>>();
  expectTypeOf(await cursor.toArray()).toEqualTypeOf<User[]>();
  expectTypeOf(await users.findOne({ name: 'Ada' })).toEqualTypeOf<User | null>();
  for await (const user of users.find()) expectTypeOf(user).toEqualTypeOf<User>();
  expectTypeOf(await users.insertMany([{ name: 'Ada', age: 36 }], { ordered: false, writeConcern: { w: 'majority' } })).toEqualTypeOf<InsertManyResult>();
  expectTypeOf((await users.updateMany({}, { $inc: { age: 1 } })).modifiedCount).toEqualTypeOf<number>();
  expectTypeOf(await users.aggregate([{ $group: { _id: '$age' } }]).toArray()).toEqualTypeOf<Document[]>();
  const session = client.startSession();
  expectTypeOf(await session.withTransaction(async () => 1)).toEqualTypeOf<number>();
  expectTypeOf(new ObjectId().toHexString()).toEqualTypeOf<string>();
  // @ts-expect-error
  users.insertOne({ name: 'Ada' });
  try {
    await users.insertOne({ name: 'Ada', age: 1 });
  } catch (err) {
    if (err instanceof MongoServerError) expectTypeOf(err.code).toEqualTypeOf<number | undefined>();
  }
  await client.close();
}

void main;

// Decimal128: texts and parts.
const price = Decimal128.fromString('19.99');
expectTypeOf(price.toString()).toEqualTypeOf<string>();
expectTypeOf(price.toParts().coefficient).toEqualTypeOf<number | bigint>();
expectTypeOf(Decimal128.fromParts(false, 1999n, -2)).toEqualTypeOf<Decimal128>();

// withTransaction: its timeout, and the labels of the errors.
{
  const txClient = new MongoClient('mongodb://localhost/test');
  const session = txClient.startSession();
  session.withTransaction(async () => 1, { timeout: 30000 }).then((n) => expectTypeOf(n).toEqualTypeOf<number>());
  expectTypeOf(new MongoNetworkError('x').hasErrorLabel('TransientTransactionError')).toEqualTypeOf<boolean>();
  expectTypeOf(session.retryCommit()).toEqualTypeOf<Promise<void>>();
}

// What applications of the official driver use: map, collation, findOneAnd..., bulkWrite, rename.
async function compat(): Promise<void> {
  const db = new MongoClient('mongodb://localhost/test').db();
  const books = db.collection<{ _id?: number; title: string; n: number }>('books');
  expectTypeOf(await books.find().collation({ locale: 'en' }).map((doc) => doc.title).toArray()).toEqualTypeOf<string[]>();
  expectTypeOf(await books.estimatedDocumentCount()).toEqualTypeOf<number>();
  const after = await books.findOneAndUpdate({ n: 1 }, { $inc: { n: 1 } }, { returnDocument: 'after', upsert: true });
  expectTypeOf(after).toEqualTypeOf<{ _id?: number; title: string; n: number } | null>();
  const bulk = await books.bulkWrite([{ insertOne: { document: { title: 'a', n: 1 } } }, { deleteMany: { filter: { n: 0 } } }]);
  expectTypeOf(bulk.upsertedCount).toEqualTypeOf<number>();
  expectTypeOf((await books.rename('volumes', { dropTarget: true })).collectionName).toEqualTypeOf<string>();
  expectTypeOf((await books.updateOne({ n: 1 }, { $set: { n: 2 } })).upsertedCount).toEqualTypeOf<number>();
}

void compat;
