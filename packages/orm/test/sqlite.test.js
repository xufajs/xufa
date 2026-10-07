const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database, Model, fields } = require('..');
const { defineSuite } = require('./suite');

defineSuite('sqlite', () => new Database({ backend: 'sqlite', filename: ':memory:' }));

describe('sqlite values', () => {
  it('writes once rows whose keys are beyond the safe integers (and reads them as bigints)', async () => {
    class Big extends Model {
      static fields = { id: fields.bigint({ primaryKey: true }), name: fields.string() };
    }
    const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(Big);
    await db.connect();
    await db.sync();
    const key = 9007199254740993n;
    await Big.objects.create({ id: key, name: 'big' });
    const found = await Big.objects.get({ pk: key });
    expect(found.id).toBe(key);
    expect(await Big.objects.count()).toBe(1);
    // A safe key is a number, also given back by the insert.
    const small = await Big.objects.create({ id: 5, name: 'small' });
    expect(small.id).toBe(5);
    await db.close();
  });
});

describe('sqlite files', () => {
  it('gives transactions a connection of their own: the queries outside do not wait for them', async () => {
    class Item extends Model {
      static fields = { name: fields.string() };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-sqlite-'));
    const db = new Database({ backend: 'sqlite', filename: path.join(dir, 'db.sqlite') }).register(Item);
    await db.connect();
    await db.sync();
    await Item.objects.create({ name: 'before' });
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const running = db.transaction(async () => {
      await Item.objects.create({ name: 'inside' });
      expect(await Item.objects.count()).toBe(2);
      await gate;
    });
    await new Promise((resolve) => setImmediate(resolve));
    // Outside: what is committed, at once.
    expect(await Item.objects.count()).toBe(1);
    release();
    await running;
    expect(await Item.objects.count()).toBe(2);
    await expect(
      db.transaction(async () => {
        await Item.objects.create({ name: 'lost' });
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await Item.objects.count()).toBe(2);
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes outside wait for the transactions of the process, and transactions for each other', async () => {
    class Item extends Model {
      static fields = { name: fields.string() };
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-sqlite-'));
    const db = new Database({ backend: 'sqlite', filename: path.join(dir, 'db.sqlite') }).register(Item);
    await db.connect();
    await db.sync();
    const order = [];
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = db.transaction(async () => {
      await Item.objects.create({ name: 'first' });
      await gate;
      order.push('first');
    });
    await new Promise((resolve) => setImmediate(resolve));
    // Both meet the lock of the first: they are made when it commits (not SQLITE_BUSY).
    const second = db.transaction(async () => {
      await Item.objects.create({ name: 'second' });
      order.push('second');
    });
    const outside = Item.objects.create({ name: 'outside' }).then(() => order.push('outside'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toEqual([]);
    release();
    await Promise.all([first, second, outside]);
    expect(order[0]).toBe('first');
    expect((await Item.objects.valuesList('name', { flat: true })).sort()).toEqual(['first', 'outside', 'second']);
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
