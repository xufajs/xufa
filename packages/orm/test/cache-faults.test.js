// Caches that fail (cache.faults of MemoryCache, SharedCache, LocalCache): reads and writes that fail are misses
// (the database answers; onCacheError, or a warning once, is told), and deletes that fail are errors (what the cache
// keeps would be old).
const { Database, Model, fields, MemoryCache, SharedCache, LocalCache, FaultError, cached, Faults } = require('..');

function makeModel() {
  class User extends Model {
    static fields = { name: fields.string() };

    static options = { cache: true };
  }
  return User;
}

async function open(options = {}) {
  const User = makeModel();
  const cache = new MemoryCache();
  const errors = [];
  const db = new Database({
    backend: 'memory',
    cache,
    onCacheError: (err, { operation }) => errors.push(`${operation}: ${err.message}`),
    ...options,
  }).register(User);
  await db.connect();
  await db.sync();
  return { db, cache, User, errors };
}

describe('caches that fail', () => {
  it('a cache down: get() reads the database, and onCacheError is told', async () => {
    const { cache, User, errors } = await open();
    const ada = await User.objects.create({ name: 'ada' });
    await User.objects.get({ pk: ada.pk }); // kept
    cache.faults.down();
    expect((await User.objects.get({ pk: ada.pk })).name).toBe('ada');
    expect(errors).toEqual(['get: The cache is down (a fault injected)', 'set: The cache is down (a fault injected)']);
    cache.faults.up();
    expect(cache.faults).toBeInstanceOf(Faults);
  });

  it('reads that fail now and then (rate) are misses; the answers are the same', async () => {
    const { cache, User } = await open();
    const users = [];
    for (const name of ['a', 'b', 'c']) users.push(await User.objects.create({ name }));
    let draw = 0;
    cache.faults.random = () => [0.1, 0.9][(draw += 1) % 2];
    const rule = cache.faults.fail({ operations: 'read', rate: 0.5 });
    for (let i = 0; i < 6; i += 1) {
      for (const user of users) expect((await User.objects.get({ pk: user.pk })).name).toBe(user.name);
    }
    expect(rule.hits).toBeGreaterThan(0);
  });

  it('cached querysets and cached() functions: the query runs (or the function) when the cache fails to read', async () => {
    const { cache, User, errors } = await open();
    await User.objects.create({ name: 'ada' });
    expect(await User.objects.all().cached().count()).toBe(1);
    cache.faults.fail({ operations: 'get' });
    await User.objects.create({ name: 'grace' });
    expect(await User.objects.all().cached().count()).toBe(2);
    expect(errors.some((line) => line.startsWith('get:'))).toBe(true);
    const store = new MemoryCache();
    const fnErrors = [];
    let runs = 0;
    const double = cached(async (n) => { runs += 1; return n * 2; }, { cache: store, name: 'double', onCacheError: (err, { operation }) => fnErrors.push(operation) });
    expect(await double(2)).toBe(4);
    store.faults.fail({ operations: 'read' });
    expect(await double(2)).toBe(4);
    expect([runs, fnErrors]).toEqual([2, ['get']]);
  });

  it('a delete that fails is an error: save() of an object kept says so', async () => {
    const { cache, User } = await open();
    const ada = await User.objects.create({ name: 'ada' });
    await User.objects.get({ pk: ada.pk });
    cache.faults.fail({ operations: 'delete' });
    ada.name = 'Ada Lovelace';
    const err = await ada.save().catch((e) => e);
    expect(err).toBeInstanceOf(FaultError);
    expect(err.message).toMatch(/A fault of the cache \(injected\): delete of /);
  });

  it('without onCacheError: a warning, once for a database', async () => {
    const User = makeModel();
    const cache = new MemoryCache();
    const db = new Database({ backend: 'memory', cache }).register(User);
    await db.connect();
    await db.sync();
    const ada = await User.objects.create({ name: 'ada' });
    const warnings = [];
    const listener = (warning) => {
      if (warning.code === 'XUFA_ORM_CACHE') warnings.push(warning.message);
    };
    process.on('warning', listener);
    try {
      cache.faults.down();
      await User.objects.get({ pk: ada.pk });
      await User.objects.get({ pk: ada.pk });
      await new Promise((resolve) => setImmediate(resolve));
      expect(warnings).toEqual(['A cache failed to get; the database answers (The cache is down (a fault injected))']);
    } finally {
      process.off('warning', listener);
    }
  });

  it('LocalCache and SharedCache have faults too', async () => {
    const { bus } = { bus: { on() {}, send() {}, request: async () => undefined, broadcast() {} } };
    expect(new LocalCache({ bus }).faults).toBeInstanceOf(Faults);
    expect(new SharedCache({ bus }).faults).toBeInstanceOf(Faults);
  });
});
