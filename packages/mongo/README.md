# @xufa/mongo

A MongoDB driver with no dependencies: BSON, the wire protocol (OP_MSG), SCRAM-SHA-256 and SCRAM-SHA-1
authentication, TLS, `mongodb+srv://` connection strings, a pool of connections, sessions and transactions. It has
the API of the [official driver](https://www.mongodb.com/docs/drivers/node/) for what applications use most. The
MongoDB backend of [@xufa/orm](../orm) is made with it.

```js
const { MongoClient, ObjectId } = require('@xufa/mongo');

const client = await new MongoClient('mongodb://localhost:27017/app').connect();
const users = client.db().collection('users');

const { insertedId } = await users.insertOne({ name: 'Ada', born: new Date('1815-12-10') });
const found = await users.find({ name: /^a/i }, { sort: { name: 1 }, limit: 10 }).toArray();
await users.updateMany({ born: { $lt: new Date('1900-01-01') } }, { $set: { era: 'xix' } });
for await (const user of users.aggregate([{ $group: { _id: '$era', n: { $sum: 1 } } }])) console.log(user);

const session = client.startSession();
await session.withTransaction(async () => {
  await users.insertOne({ name: 'Grace' }, { session });
});
await session.endSession();
await client.close();
```

- `MongoClient(url, options)`: `connect()`, `db(name)`, `startSession()`, `close()`. Options (also in the connection
  string): `maxPoolSize` (5 by server), `readPreference`, `retryWrites` and `retryReads` (true), `replicaSet`,
  `directConnection`, `heartbeatFrequencyMS` (10000), `serverSelectionTimeoutMS` (30000), `localThresholdMS` (15),
  `compressors` (`zstd`, `zlib`), `zlibCompressionLevel`, `authSource`, `authMechanism`, `tls`, `tlsOptions`,
  `connectTimeoutMS`, `appName`.
- `Db`: `collection()`, `command()`, `listCollections()`, `createCollection()`, `dropDatabase()`.
- `Collection`: `find`, `findOne`, `aggregate`, `countDocuments`, `insertOne`, `insertMany`, `updateOne`,
  `updateMany`, `replaceOne`, `deleteOne`, `deleteMany`, `createIndex`, `dropIndex`, `indexes`, `drop`. Every one
  takes `{ session }`; reads take `{ readPreference }`, and writes `{ writeConcern }`. As in the official driver, `insertOne` and `insertMany` set `_id` on the documents without
  one. `insertMany` sends its documents in messages of a few megabytes (any number of them), encoding the next
  while the server inserts one; with `{ ordered: false }`, a large insert is cut in parts that the connections of
  the pool send at the same time, inserted by the server in parallel.
- Cursors: `toArray()`, `next()`, `for await`, `sort`, `skip`, `limit`, `project`, `batchSize`, `close()`.
- BSON: `serialize`, `deserialize`, `ObjectId`, `Binary`, `Timestamp`, `Decimal128`, `Int32`, `Double`, `MinKey`,
  `MaxKey`. Integers that fit are int32 and the rest of numbers doubles; bigints are int64, and int64 values are
  numbers when they are safe integers.
- Errors: `MongoServerError` (with the `code` of the server, 11000 for duplicate keys), `MongoNetworkError`.

## Deployments

- Replica sets: the members are found from the hosts given (their hello), and checked every
  `heartbeatFrequencyMS` (and at once when one fails). Writes go to the primary; reads follow the read preference
  (`primary`, `primaryPreferred`, `secondary`, `secondaryPreferred`, `nearest`: among the members of those within
  `localThresholdMS` of the fastest). When the primary changes, commands wait (up to `serverSelectionTimeoutMS`)
  for the new one. Sharded clusters (mongos) and single servers too.
- Retryable writes: `insertOne`, `insertMany` (each message), `updateOne`, `replaceOne`, `deleteOne` and the commit
  of transactions are sent again once (on the new primary) when their server fails, with the same session and
  transaction number, so the server applies them once. Reads are retried once too (`retryReads`).
- Compression: `compressors: 'zstd,zlib'` asks the server for them; the messages after the handshake are compressed
  with the first one agreed. zstd needs Node.js 22.15 or later.

Not yet: change streams, and connection strings with tags of read preferences.

## Performance

What makes it fast: BSON is encoded into a reused buffer and decoded without calling into C++ for short strings,
with the keys of the documents of a reply made once; ObjectIds are three integers (no buffer each); the commands of
the same tick are written to the socket with one system call, and many commands share a connection at the same
time. `node bench/mongo.js` compares it with the official driver on a server of yours, and `node bench/micro/bson.js`
compares the BSON of both.

## Tests

The tests that need a server use `XUFA_MONGO_URL` (`mongodb://127.0.0.1:27017/xufa_test` by default, and `off` to
skip them) and only touch the collections they create in that database. Those of replica sets (failover, read
preferences, transactions) use `XUFA_MONGO_RS_URL` (a replica set `rs3` of three members on 27031 to 27033 by
default), and are skipped when it cannot be reached.

## License

MIT.
