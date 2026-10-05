import { expectType, expectError } from 'tsd';
import { MongoClient, Collection, Cursor, ObjectId, MongoServerError, InsertManyResult, Document } from '../..';
import { Decimal128 } from '../..';

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
  expectType<Collection<User>>(users);
  const cursor = users.find({ age: { $gte: 18 } }, { sort: { name: 1 }, readPreference: 'secondary' });
  expectType<Cursor<User>>(cursor);
  expectType<User[]>(await cursor.toArray());
  expectType<User | null>(await users.findOne({ name: 'Ada' }));
  for await (const user of users.find()) expectType<User>(user);
  expectType<InsertManyResult>(await users.insertMany([{ name: 'Ada', age: 36 }], { ordered: false, writeConcern: { w: 'majority' } }));
  expectType<number>((await users.updateMany({}, { $inc: { age: 1 } })).modifiedCount);
  expectType<Document[]>(await users.aggregate([{ $group: { _id: '$age' } }]).toArray());
  const session = client.startSession();
  expectType<number>(await session.withTransaction(async () => 1));
  expectType<string>(new ObjectId().toHexString());
  expectError(users.insertOne({ name: 'Ada' }));
  try {
    await users.insertOne({ name: 'Ada', age: 1 });
  } catch (err) {
    if (err instanceof MongoServerError) expectType<number | undefined>(err.code);
  }
  await client.close();
}

void main;

// Decimal128: texts and parts.
const price = Decimal128.fromString('19.99');
expectType<string>(price.toString());
expectType<number | bigint>(price.toParts().coefficient);
expectType<Decimal128>(Decimal128.fromParts(false, 1999n, -2));
