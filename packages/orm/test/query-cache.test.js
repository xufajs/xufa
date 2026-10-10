// Results kept in caches: querysets (cached()) until a model they read is written, and functions of yours (cached).
import { Database, Model, fields, cached, MemoryCache, Count, Sum } from '../index.js';
import { url, available } from '../../pg/test/server.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Models of their own for each database: a model queries the database it was registered in last.
function models() {
  class Writer extends Model {
    static fields = { name: fields.string({ maxLength: 40 }) };
    static options = { cache: true };
  }
  class Story extends Model {
    static fields = {
      title: fields.string({ maxLength: 40 }),
      writer: fields.foreignKey(Writer, { onDelete: 'cascade' }),
      words: fields.integer({ default: 0 }),
    };
    static options = { cache: { ttl: 60000 } };
  }
  class Loose extends Model {
    static fields = { n: fields.integer() };
  }
  return { Writer, Story, Loose };
}

// Counts the reads that reach the backend.
function countReads(db) {
  const counter = { reads: 0 };
  for (const method of ['select', 'selectObjects', 'count', 'aggregate']) {
    const original = db.backend[method];
    if (typeof original !== 'function') continue;
    db.backend[method] = async function counted(...args) {
      counter.reads += 1;
      return original.apply(this, args);
    };
  }
  return counter;
}

function suite(name, make) {
  describe(name, () => {
    let db;
    let counter;
    let ada;
    let Writer;
    let Story;
    let Loose;

    beforeEach(async () => {
      ({ Writer, Story, Loose } = models());
      db = make();
      db.register(Writer, Story, Loose);
      await db.connect();
      await db.drop().catch(() => {});
      await db.sync();
      ada = await Writer.objects.create({ name: 'Ada' });
      await Story.objects.create({ title: 'One', writer: ada, words: 10 });
      counter = countReads(db);
    });

    afterEach(async () => {
      await db.drop().catch(() => {});
      await db.close();
    });

    const byAda = () => Story.objects.filter({ writer__name: 'Ada' }).orderBy('title').cached();

    it('objects: read once, then from the cache, as objects', async () => {
      const first = await byAda();
      const second = await byAda();
      expect(second.map((story) => story.title)).toEqual(['One']);
      expect(second[0]).toBeInstanceOf(Story);
      expect(second[0].writerId).toBe(ada.pk);
      expect(second[0]).not.toBe(first[0]);
      expect(counter.reads).toBe(1);
    });

    it('a write to the model, or to a model it reads, is seen', async () => {
      await byAda();
      await Story.objects.create({ title: 'Two', writer: ada });
      expect((await byAda()).map((story) => story.title)).toEqual(['One', 'Two']);
      await Writer.objects.filter({ pk: ada.pk }).update({ name: 'Ade' });
      expect(await byAda()).toEqual([]);
      const story = await Story.objects.get({ title: 'One' });
      story.title = 'Uno';
      await story.save();
      expect((await Story.objects.orderBy('title').cached()).map((item) => item.title)).toEqual(['Two', 'Uno']);
      await story.delete();
      expect((await Story.objects.orderBy('title').cached()).map((item) => item.title)).toEqual(['Two']);
    });

    it('values, count, exists, aggregates and first, each by its own key', async () => {
      const values = () => Story.objects.values('title', 'words').cached();
      const sum = () => Story.objects.cached().aggregate({ words: Sum('words'), stories: Count() });
      for (let round = 0; round < 2; round += 1) {
        expect(await values()).toEqual([{ title: 'One', words: 10 }]);
        expect(await Story.objects.cached().count()).toBe(1);
        expect(await Story.objects.filter({ words__gt: 5 }).cached().exists()).toBe(true);
        expect(await sum()).toEqual({ words: 10, stories: 1 });
        expect((await Story.objects.cached().first()).title).toBe('One');
      }
      const first = counter.reads;
      expect(await Story.objects.filter({ words__gt: 50 }).cached().exists()).toBe(false);
      expect(counter.reads).toBe(first + 1);
      // Different arguments are different keys.
      expect(await Story.objects.cached().aggregate({ most: Sum('words') })).toEqual({ most: 10 });
    });

    it('models read through orders and values are followed too', async () => {
      const byWriter = () => Story.objects.orderBy('writer__name', 'title').values('title', 'writer__name').cached();
      expect(await byWriter()).toEqual([{ title: 'One', writer__name: 'Ada' }]);
      await Writer.objects.filter({ pk: ada.pk }).update({ name: 'Ade' });
      expect(await byWriter()).toEqual([{ title: 'One', writer__name: 'Ade' }]);
    });

    it('other conditions, order and slices are other keys', async () => {
      await Story.objects.create({ title: 'Two', writer: ada, words: 99 });
      const titles = async (qs) => (await qs.cached()).map((story) => story.title);
      expect(await titles(Story.objects.filter({ words__gt: 50 }))).toEqual(['Two']);
      expect(await titles(Story.objects.filter({ words__gt: 5 }).orderBy('-words'))).toEqual(['Two', 'One']);
      expect(await titles(Story.objects.filter({ words__gt: 5 }).orderBy('words'))).toEqual(['One', 'Two']);
      expect(await titles(Story.objects.orderBy('words').limit(1))).toEqual(['One']);
      expect(await titles(Story.objects.orderBy('words').offset(1))).toEqual(['Two']);
    });

    it('inside a transaction nothing is read from it nor kept, and the commit is seen', async () => {
      await byAda();
      await db.transaction(async () => {
        await Story.objects.create({ title: 'Two', writer: ada });
        expect((await byAda()).length).toBe(2);
      });
      expect((await byAda()).length).toBe(2);
    });

    it('models without the option cache are refused, and so are related objects', async () => {
      await expect(Loose.objects.cached().count()).rejects.toThrow(/Loose, which has no option cache/);
      await expect(Story.objects.selectRelated('writer').cached()).rejects.toThrow(/without the related ones/);
    });
  });
}

suite('memory', () => new Database({ backend: 'memory' }));
suite('sqlite', () => new Database({ backend: 'sqlite', filename: ':memory:' }));
if (available) suite('postgres', () => new Database({ backend: 'postgres', url }));

describe('query cache', () => {
  it('two databases on one store (processes with a shared cache) see each other writes', async () => {
    const store = new MemoryCache();
    const { Writer, Story } = models();
    const one = new Database({ backend: 'sqlite', filename: ':memory:', name: 'shared', cache: store });
    one.register(Writer, Story);
    await one.connect();
    await one.sync();
    await Writer.objects.using(one).create({ name: 'Ada' });
    const counter = countReads(one);
    expect(await Writer.objects.using(one).cached().count()).toBe(1);
    expect(await Writer.objects.using(one).cached().count()).toBe(1);
    expect(counter.reads).toBe(1);
    // Another process writes (here, another Database of the same name on the same store): the version of Writer
    // changes in the store, and the first reads again.
    const other = new Database({ backend: 'memory', name: 'shared', cache: store });
    other.register(Writer, Story);
    await other.sync();
    await Writer.objects.using(other).create({ name: 'Bo' });
    expect(await Writer.objects.using(one).cached().count()).toBe(1);
    expect(counter.reads).toBe(2);
    await one.close();
  });

  it('a result read while a write lands is not kept', async () => {
    const { Writer, Story } = models();
    const db = new Database({ backend: 'memory' });
    db.register(Writer, Story);
    await db.connect();
    await db.sync();
    await Writer.objects.create({ name: 'Ada' });
    const count = db.backend.count;
    let once = true;
    db.backend.count = async function racing(query) {
      const result = await count.call(this, query);
      if (once) {
        once = false;
        await Writer.objects.create({ name: 'During' });
      }
      return result;
    };
    expect(await Writer.objects.cached().count()).toBe(1);
    expect(await Writer.objects.cached().count()).toBe(2);
    await db.close();
  });

  it('ttl: kept for its time', async () => {
    const { Writer, Story } = models();
    const db = new Database({ backend: 'memory' });
    db.register(Writer, Story);
    await db.connect();
    await db.sync();
    const counter = countReads(db);
    await Writer.objects.cached({ ttl: 30 }).count();
    await Writer.objects.cached({ ttl: 30 }).count();
    expect(counter.reads).toBe(1);
    await wait(50);
    await Writer.objects.cached({ ttl: 30 }).count();
    expect(counter.reads).toBe(2);
    await db.close();
  });
});

describe('cached()', () => {
  it('the same arguments are answered from the cache; other ones call it', async () => {
    let calls = 0;
    const rates = cached(async (currency, { day }) => {
      calls += 1;
      return { currency, day, rate: calls };
    });
    expect(await rates('EUR', { day: '2026-10-05' })).toEqual({ currency: 'EUR', day: '2026-10-05', rate: 1 });
    expect(await rates('EUR', { day: '2026-10-05' })).toEqual({ currency: 'EUR', day: '2026-10-05', rate: 1 });
    expect((await rates('USD', { day: '2026-10-05' })).rate).toBe(2);
    expect(calls).toBe(2);
  });

  it('keys of objects do not depend on the order of their keys, and dates, bytes and bigints are values', async () => {
    let calls = 0;
    const fn = cached(async () => (calls += 1));
    await fn({ a: 1, b: 2 }, new Date(0), Buffer.from('x'), 10n);
    await fn({ b: 2, a: 1 }, new Date(0), Buffer.from('x'), 10n);
    expect(calls).toBe(1);
    await fn({ a: 1, b: 2 }, new Date(1), Buffer.from('x'), 10n);
    await fn({ a: 1, b: 2 }, new Date(0), Buffer.from('y'), 10n);
    await fn({ a: 1, b: 2 }, new Date(0), Buffer.from('x'), 11n);
    expect(calls).toBe(4);
  });

  it('calls made while one runs wait for it, and get copies', async () => {
    let calls = 0;
    const slow = cached(async () => {
      calls += 1;
      await wait(20);
      return { list: [1] };
    });
    const [a, b, c] = await Promise.all([slow(), slow(), slow()]);
    expect(calls).toBe(1);
    expect([a, b, c]).toEqual([{ list: [1] }, { list: [1] }, { list: [1] }]);
    b.list.push(2);
    expect(c.list).toEqual([1]);
  });

  it('errors are not kept, undefined is', async () => {
    let calls = 0;
    const flaky = cached(async (fail) => {
      calls += 1;
      if (fail && calls === 1) throw new Error('down');
      return undefined;
    });
    await expect(flaky(true)).rejects.toThrow('down');
    expect(await flaky(true)).toBe(undefined);
    expect(await flaky(true)).toBe(undefined);
    expect(calls).toBe(2);
  });

  it('ttl, invalidate(), clear(), and key()', async () => {
    let calls = 0;
    const fn = cached(async (user) => (calls += 1), { ttl: 30, key: (user) => user.id });
    await fn({ id: 1, name: 'a' });
    await fn({ id: 1, name: 'b' });
    expect(calls).toBe(1);
    await fn.invalidate({ id: 1 });
    await fn({ id: 1 });
    expect(calls).toBe(2);
    await fn.clear();
    await fn({ id: 1 });
    expect(calls).toBe(3);
    await wait(50);
    await fn({ id: 1 });
    expect(calls).toBe(4);
  });

  it('a cache of yours needs a name, and functions are no keys', async () => {
    expect(() => cached(async () => 1, { cache: new MemoryCache() })).toThrow(/needs a name/);
    const fn = cached(async () => 1);
    await expect(fn(() => 2)).rejects.toThrow(/function cannot be part of the key/);
  });
});

describe.skipIf(!available)('query cache on postgres', () => {
  it('what was read while a transaction ran is not answered after its commit', async () => {
    const { Writer, Story } = models();
    const db = new Database({ backend: 'postgres', url, max: 3 });
    db.register(Writer, Story);
    await db.connect();
    await db.drop().catch(() => {});
    await db.sync();
    try {
      await Writer.objects.create({ name: 'Ada' });
      let release;
      const held = new Promise((resolve) => {
        release = resolve;
      });
      let inside;
      const transaction = db.transaction(async () => {
        await Writer.objects.create({ name: 'Bo' });
        inside();
        await held;
      });
      await new Promise((resolve) => {
        inside = resolve;
      });
      // Read and kept outside it, while it runs: the row of Bo is not committed yet.
      expect(await Writer.objects.cached().count()).toBe(1);
      release();
      await transaction;
      expect(await Writer.objects.cached().count()).toBe(2);
    } finally {
      await db.drop().catch(() => {});
      await db.close();
    }
  });
});
