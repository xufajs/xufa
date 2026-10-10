import { Database, Model, fields, Sum } from '../index.js';
import { MongoClient } from '@xufa/mongo';
import { defineSuite } from './suite.js';
import { url, available } from '../../mongo/test/server.js';

describe.skipIf(!available)('mongodb', () => {
  defineSuite('mongodb', () => new Database({ backend: 'mongodb', url }));

  describe('mongodb backend: decimals as Decimal128', () => {
    class Item extends Model {
      static fields = {
        name: fields.string(),
        price: fields.decimal({ precision: 10, scale: 2, null: true }),
      };

      static options = { table: 'dec_migrate' };
    }
    let db;
    let client;

    beforeAll(async () => {
      db = new Database({ backend: 'mongodb', url }).register(Item);
      await db.connect();
      await db.drop();
      await db.sync();
      client = new MongoClient(url);
      await client.connect();
    });

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
      if (client) await client.close();
    });

    const collection = () => client.db().collection('dec_migrate');
    const typesOf = async () =>
      (
        await collection()
          .aggregate([{ $sort: { _id: 1 } }, { $project: { t: { $type: '$price' } } }])
          .toArray()
      ).map((doc) => doc.t);

    it('writes decimals as Decimal128, and gives them as text', async () => {
      await Item.objects.delete();
      const item = await Item.objects.create({ name: 'x', price: '1E+3' });
      expect((await collection().findOne({ name: 'x' })).price.constructor.name).toBe('Decimal128');
      expect((await Item.objects.get({ pk: item.pk })).price).toBe('1000.00'); // with the places of its scale, as every backend gives it
      await Item.objects.create({ name: 'y', price: '0.05' });
      expect((await Item.objects.get({ name: 'y' })).price).toBe('0.05');
    });

    it('converts the decimals written as strings before (migrateDecimals)', async () => {
      await Item.objects.delete();
      await collection().insertMany([
        { _id: 1, name: 'a', price: '6' },
        { _id: 2, name: 'b', price: '100.50' },
        { _id: 3, name: 'c', price: '20' },
        { _id: 4, name: 'd', price: null },
        { _id: 5, name: 'e', price: 'not a number' },
      ]);
      // Read as they are, but compared as text until they are converted.
      expect((await Item.objects.get({ name: 'b' })).price).toBe('100.50');
      expect(await db.migrateDecimals()).toEqual({ Item: 3 });
      expect(await typesOf()).toEqual(['decimal', 'decimal', 'decimal', 'null', 'string']);
      expect((await Item.objects.filter({ price__gt: '10' }).orderBy('name')).map((item) => item.name)).toEqual([
        'b',
        'c',
      ]);
      const { total } = await Item.objects.filter({ name__in: ['a', 'b', 'c'] }).aggregate({ total: Sum('price') });
      expect(total).toBe(126.5);
      expect(await db.migrateDecimals()).toEqual({ Item: 0 });
    });

    it('refuses decimals of more than 34 digits', async () => {
      class Huge extends Model {
        static fields = { value: fields.decimal({ precision: 40, scale: 0 }) };

        static options = { table: 'dec_huge' };
      }
      const other = new Database({ backend: 'mongodb', url }).register(Huge);
      await other.connect();
      try {
        await expect(other.sync()).rejects.toThrow('34 digits');
      } finally {
        await other.close();
      }
    });
  });
});

// A replica set (XUFA_MONGO_RS_URL, or three members on 27031-27033: rs3): transactions are real there. The suite again,
// and transactions that conflict. Skipped when it cannot be reached.
import { spawnSync } from 'node:child_process';
import { parseUrl } from '@xufa/mongo';

const rsUrl =
  process.env.XUFA_MONGO_RS_URL || 'mongodb://127.0.0.1:27031,127.0.0.1:27032,127.0.0.1:27033/xufa_test?replicaSet=rs3';
function rsReachable() {
  if (rsUrl === 'off') return false;
  const [{ host, port }] = parseUrl(rsUrl).hosts;
  const script = `require('node:net').connect(${port}, ${JSON.stringify(host)}).on('connect', () => process.exit(0)).on('error', () => process.exit(1));`;
  return spawnSync(process.execPath, ['-e', script], { timeout: 3000 }).status === 0;
}

describe.skipIf(!rsReachable())('mongodb replica set', () => {
  defineSuite('mongodb', () => new Database({ backend: 'mongodb', url: rsUrl }));

  describe('mongodb transactions that conflict', () => {
    class Counter extends Model {
      static fields = { name: fields.string(), n: fields.integer({ default: 0 }) };

      static options = { table: 'tx_counters' };
    }
    let db;

    beforeAll(async () => {
      db = new Database({ backend: 'mongodb', url: rsUrl }).register(Counter);
      await db.connect();
      await db.drop();
      await db.sync();
    }, 60000);

    afterAll(async () => {
      if (db) {
        await db.drop();
        await db.close();
      }
    });

    // Each reads the counter, waits (so the others write it too), then writes it.
    const increment = (runs, options) =>
      db.transaction(async () => {
        runs.push(1);
        const counter = await Counter.objects.get({ name: 'hits' });
        await new Promise((resolve) => setTimeout(resolve, 50));
        await Counter.objects.filter({ pk: counter.pk }).update({ n: counter.n + 1 });
      }, options);

    it('the one in conflict runs again (a write conflict is transient): every increment counts', async () => {
      expect(db.backend.supportsTransactions).toBe(true);
      await Counter.objects.create({ name: 'hits' });
      const runs = [];
      await Promise.all([increment(runs), increment(runs), increment(runs)]);
      expect((await Counter.objects.get({ name: 'hits' })).n).toBe(3);
      expect(runs.length).toBeGreaterThan(3);
    }, 30000);

    it('retry: false runs once: the conflict is thrown, and its writes are rolled back', async () => {
      await Counter.objects.filter({ name: 'hits' }).update({ n: 0 });
      const runs = [];
      const results = await Promise.allSettled([increment(runs, { retry: false }), increment(runs, { retry: false })]);
      expect(runs.length).toBe(2);
      const failed = results.filter((result) => result.status === 'rejected');
      expect(failed.length).toBe(1);
      expect(failed[0].reason.message).toMatch(/WriteConflict|Write conflict/i);
      expect((await Counter.objects.get({ name: 'hits' })).n).toBe(1);
    }, 30000);
  });
});
