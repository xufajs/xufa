const { Database, Model, fields, Sum } = require('..');
const { MongoClient } = require('@xufa/mongo');
const { defineSuite } = require('./suite');
const { url, available } = require('../../mongo/test/server');

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
