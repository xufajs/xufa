const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  Database,
  Databases,
  Model,
  fields,
  MemoryCache,
  SharedCache,
  LocalCache,
  NotFoundError,
  QueryError,
} = require('..');
const { Bus } = require('@xufa/cluster');

describe('MemoryCache', () => {
  it('evicts the least used keys and expires values', async () => {
    const cache = new MemoryCache({ max: 2 });
    await cache.set('a', { n: 1 });
    await cache.set('b', 2);
    await cache.get('a');
    await cache.set('c', 3);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('a')).toEqual({ n: 1 });
    // Values are copies.
    (await cache.get('a')).n = 99;
    expect(await cache.get('a')).toEqual({ n: 1 });
    await cache.set('short', 1, 1);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await cache.get('short')).toBeUndefined();
    await cache.set('x:1', 1);
    await cache.set('x:2', 2);
    await cache.clear('x:');
    expect(cache.size).toBe(0);
  });
});

function makeModels() {
  class User extends Model {
    static fields = {
      email: fields.string({ unique: true }),
      name: fields.string(),
      data: fields.json({ default: () => ({}) }),
    };

    static options = { cache: { indexes: ['email'] } };
  }

  class Note extends Model {
    static fields = { user: fields.foreignKey(User, { relatedName: 'notes' }), text: fields.string() };
  }
  return { User, Note };
}

describe('the cache of models', () => {
  let db;
  let User;
  let Note;
  let selects;

  beforeEach(async () => {
    ({ User, Note } = makeModels());
    db = new Database({ backend: 'sqlite' }).register(User, Note);
    await db.connect();
    await db.sync();
    selects = 0;
    // Reads of the database: rows and objects.
    const { select, selectObjects } = db.backend;
    db.backend.select = (...args) => {
      selects += 1;
      return select.apply(db.backend, args);
    };
    db.backend.selectObjects = (...args) => {
      selects += 1;
      return selectObjects.apply(db.backend, args);
    };
  });

  afterEach(async () => {
    await db.close();
  });

  it('answers get() by key and by index from the cache', async () => {
    const ada = await User.objects.create({ email: 'ada@x.com', name: 'Ada', data: { n: 1 } });
    const first = await User.objects.get({ pk: ada.pk });
    const second = await User.objects.get({ id: ada.pk });
    expect(selects).toBe(1);
    expect(second).not.toBe(first);
    expect(second.data).toEqual({ n: 1 });
    second.data.n = 2;
    expect((await User.objects.get({ pk: ada.pk })).data).toEqual({ n: 1 });
    // The read by key keeps the indexes too.
    await User.objects.get({ email: 'ada@x.com' });
    await User.objects.get({ email__exact: 'ada@x.com' });
    expect(selects).toBe(1);
    // Other queries go to the database.
    await User.objects.filter({ name: 'Ada' }).get({ pk: ada.pk });
    await User.objects.get({ name: 'Ada' });
    expect(selects).toBe(3);
    await expect(User.objects.get({ pk: 999 })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forgets objects saved, deleted, updated and in transactions', async () => {
    const ada = await User.objects.create({ email: 'ada@x.com', name: 'Ada' });
    await User.objects.get({ pk: ada.pk });
    ada.name = 'Ada L.';
    ada.email = 'ada@lovelace.com';
    await ada.save();
    expect((await User.objects.get({ pk: ada.pk })).name).toBe('Ada L.');
    // The index of the old email is not taken.
    await expect(User.objects.get({ email: 'ada@x.com' })).rejects.toBeInstanceOf(NotFoundError);
    expect((await User.objects.get({ email: 'ada@lovelace.com' })).pk).toBe(ada.pk);
    await User.objects.filter({ pk: ada.pk }).update({ name: 'Updated' });
    expect((await User.objects.get({ pk: ada.pk })).name).toBe('Updated');
    await db
      .transaction(async () => {
        await User.objects.filter({ pk: ada.pk }).update({ name: 'In transaction' });
        expect((await User.objects.get({ pk: ada.pk })).name).toBe('In transaction');
        throw new Error('rollback');
      })
      .catch(() => {});
    expect((await User.objects.get({ pk: ada.pk })).name).toBe('Updated');
    await Note.objects.create({ user: ada, text: 'x' });
    await (await User.objects.get({ pk: ada.pk })).delete();
    await expect(User.objects.get({ pk: ada.pk })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('Databases', () => {
  it('routes models to databases, and follows relations across them with more queries', async () => {
    class Account extends Model {
      static fields = { name: fields.string() };
    }
    class Event extends Model {
      static fields = { account: fields.foreignKey(Account, { relatedName: 'events' }), kind: fields.string() };

      static options = { database: 'events' };
    }
    const dbs = new Databases({ default: { backend: 'sqlite' }, events: { backend: 'memory' } });
    dbs.register(Account, Event);
    await dbs.connect();
    await dbs.sync();
    expect(Account.db).toBe(dbs.get());
    expect(Event.db).toBe(dbs.get('events'));
    const ada = await Account.objects.create({ name: 'Ada' });
    await Event.objects.bulkCreate([
      { account: ada, kind: 'login' },
      { account: ada, kind: 'logout' },
    ]);
    expect(await ada.events.count()).toBe(2);
    const [event] = await Event.objects.prefetchRelated('account').orderBy('kind');
    expect(event.account.name).toBe('Ada');
    expect((await event.load('account')).name).toBe('Ada');
    expect(() => Event.objects.selectRelated('account').toQuery()).toThrow(QueryError);
    expect(() => Event.objects.filter({ account__name: 'Ada' }).toQuery()).toThrow('different databases');
    expect(() => Account.objects.filter({ events__kind: 'login' }).toQuery()).toThrow('different databases');
    await ada.delete();
    expect(await Event.objects.count()).toBe(0);
    await dbs.close();
  });
});

describe('caches of clusters in one process', () => {
  it('share values through the bus', async () => {
    const bus = new Bus();
    const shared = new SharedCache({ bus });
    await shared.set('a', { n: 1 });
    expect(await shared.get('a')).toEqual({ n: 1 });
    await shared.delete('a');
    expect(await shared.get('a')).toBeUndefined();
    const local = new LocalCache({ bus, name: 'local' });
    await local.set('b', 2);
    expect(await local.get('b')).toBe(2);
    await local.clear();
    expect(await local.get('b')).toBeUndefined();
  });

  it('keep the values of the primary in the store given (such as a NetCache)', async () => {
    const calls = [];
    const store = new MemoryCache();
    const recorded = {
      get: (key) => (calls.push(['get', key]), store.get(key)),
      set: (key, value, ttl) => (calls.push(['set', key, ttl]), store.set(key, value, ttl)),
      delete: (keys) => (calls.push(['delete', keys]), store.delete(keys)),
      clear: (prefix) => (calls.push(['clear', prefix]), store.clear(prefix)),
    };
    const shared = new SharedCache({ bus: new Bus(), name: 'stored', store: recorded });
    await shared.set('a', { n: 1 }, 1000);
    expect(await shared.get('a')).toEqual({ n: 1 });
    await shared.delete('a');
    await shared.clear('x:');
    expect(calls).toEqual([
      ['set', 'a', 1000],
      ['get', 'a'],
      ['delete', 'a'],
      ['clear', 'x:'],
    ]);
  });

  it('in one process, the SharedCache of the worker asks the one of the primary (and its store)', async () => {
    const bus = new Bus();
    const store = new MemoryCache();
    const primary = new SharedCache({ bus, store, name: 'one-process' });
    const worker = new SharedCache({ bus, name: 'one-process' });
    await store.set('from-the-network', 1);
    expect(await worker.get('from-the-network')).toBe(1);
    await worker.set('from-the-worker', 2);
    expect(await store.get('from-the-worker')).toBe(2);
    expect(await primary.get('from-the-worker')).toBe(2);
  });
});

describe('caches of clusters', () => {
  it('share the objects of models between workers, and invalidate them in every worker', () => {
    const fixture = path.join(__dirname, 'fixtures', 'cluster-cache.js');
    const result = spawnSync(process.execPath, [fixture], { timeout: 60000 });
    const lines = result.stdout
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(result.status).toBe(0);
    expect(lines).toContainEqual({ shared: 'Ada', fromCacheOfOtherWorker: true });
    expect(lines).toContainEqual({ local: 'Ada L.', invalidated: true });
  }, 60000);
});
