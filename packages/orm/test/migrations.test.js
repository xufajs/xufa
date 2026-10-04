// Migrations on every backend: a schema in three versions, migrated with the data kept.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database, Model, fields, ModelError } = require('..');
const { MemoryBackend } = require('../lib/backends/memory');
const pg = require('../../pg/test/server');
const mongo = require('../../mongo/test/server');

function version(number) {
  class Author extends Model {
    static fields = {
      name: fields.string(number >= 2 ? { maxLength: 50, unique: true } : {}),
      ...(number >= 2 ? { email: fields.string({ null: true }), active: fields.boolean({ default: true }) } : {}),
    };

    static options = { table: 'mig_author' };
  }

  class Book extends Model {
    static fields = {
      title: fields.string(),
      author: fields.foreignKey(Author, { relatedName: 'books' }),
      ...(number === 2 ? { pages: fields.integer({ default: 0 }) } : {}),
      ...(number >= 3 ? { stamp: fields.datetime({ autoNowAdd: true }) } : {}),
    };

    static options = { table: 'mig_book', ...(number >= 2 ? { fillfactor: 80 } : {}) };
  }

  return { Author, Book };
}

const backends = [
  ['memory', true],
  ['sqlite', true],
  ['postgres', pg.available],
  ['mongodb', mongo.available],
];

describe.each(backends)('migrations on %s', (kind, available) => {
  let dir;
  let memory;
  let sqliteFile;

  const open = async (number) => {
    const models = version(number);
    let options;
    if (kind === 'memory') options = { backend: memory };
    else if (kind === 'sqlite') options = { backend: 'sqlite', filename: sqliteFile };
    else if (kind === 'postgres') options = { backend: 'postgres', url: pg.url, max: 2 };
    else options = { backend: 'mongodb', url: mongo.url };
    const db = new Database(options).register(models.Author, models.Book);
    await db.connect();
    return { db, ...models };
  };

  const cleanUp = async () => {
    if (kind === 'postgres') {
      const { db } = await open(1);
      await db.backend.raw('DROP TABLE IF EXISTS mig_book, mig_author, xufa_migrations CASCADE');
      await db.close();
    } else if (kind === 'mongodb') {
      const { db } = await open(1);
      for (const name of ['mig_book', 'mig_author', 'xufa_migrations']) await db.backend.db.collection(name).drop();
      await db.close();
    }
  };

  beforeAll(async () => {
    if (!available) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `xufa-migrations-${kind}-`));
    memory = new MemoryBackend();
    sqliteFile = path.join(dir, 'test.db');
    await cleanUp();
  });

  afterAll(async () => {
    if (!available) return;
    await cleanUp();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.skipIf(!available)('makes and applies migrations, keeping the data', async () => {
    const migrations = path.join(dir, 'migrations');

    // Version 1: the tables are created.
    let current = await open(1);
    const first = await current.db.makeMigrations({ dir: migrations });
    expect(first.name).toBe('0001_initial');
    expect(first.operations.map((op) => op.op)).toEqual(['createTable', 'createTable']);
    expect(await current.db.migrate({ dir: migrations })).toEqual(['0001_initial']);
    expect(await current.db.makeMigrations({ dir: migrations })).toBeNull();
    const ada = await current.Author.objects.create({ name: 'Ada' });
    await current.Book.objects.create({ title: 'Notes', author: ada });
    await current.db.close();

    // Version 2: fields added (with defaults for the rows there), altered and unique, and a fillfactor.
    current = await open(2);
    const second = await current.db.makeMigrations({ dir: migrations });
    expect(second.name).toBe('0002_auto');
    const ops = second.operations.map((op) => `${op.op}:${op.column || op.index?.name || op.table}`);
    expect(ops).toEqual(
      expect.arrayContaining([
        'alterColumn:name',
        'addColumn:email',
        'addColumn:active',
        'addColumn:pages',
        'setOptions:mig_book',
        'createIndex:mig_author_name_uniq',
      ])
    );
    expect(await current.db.migrate({ dir: migrations })).toEqual(['0002_auto']);
    const author = await current.Author.objects.get({ name: 'Ada' });
    expect(author.active).toBe(true);
    expect(author.email).toBeNull();
    expect((await current.Book.objects.get({ title: 'Notes' })).pages).toBe(0);
    await current.Author.objects.create({ name: 'Grace', email: 'grace@example.com' });
    if (kind !== 'memory') await expect(current.Author.objects.create({ name: 'Grace' })).rejects.toThrow();
    await current.db.close();

    // Version 3: a field dropped and one added with autoNowAdd; then a migration written by hand.
    current = await open(3);
    const third = await current.db.makeMigrations({ dir: migrations });
    expect(third.operations.map((op) => `${op.op}:${op.column}`)).toEqual(
      expect.arrayContaining(['addColumn:stamp', 'dropColumn:pages'])
    );
    fs.writeFileSync(
      path.join(migrations, '0004_rename.js'),
      `module.exports = {
        operations: [
          { op: 'renameColumn', table: 'mig_book', from: 'title', to: 'name' },
          { op: 'renameColumn', table: 'mig_book', from: 'name', to: 'title' },
          { op: 'run', fn: async (db) => { await db.model('Author').objects.filter({ name: 'Grace' }).update({ active: false }); } },
        ],
      };`
    );
    expect(await current.db.migrate({ dir: migrations })).toEqual(['0003_auto', '0004_rename']);
    const book = await current.Book.objects.selectRelated('author').get({ title: 'Notes' });
    expect(book.author.name).toBe('Ada');
    expect(book.stamp).toBeInstanceOf(Date);
    expect((await current.Author.objects.get({ name: 'Grace' })).active).toBe(false);
    expect(await current.db.makeMigrations({ dir: migrations })).toBeNull();
    expect(await current.db.showMigrations({ dir: migrations })).toEqual([
      { name: '0001_initial', applied: true },
      { name: '0002_auto', applied: true },
      { name: '0003_auto', applied: true },
      { name: '0004_rename', applied: true },
    ]);
    expect(await current.db.migrate({ dir: migrations })).toEqual([]);
    await current.db.close();
  });

  it.skipIf(!available)('refuses fields added without null or a default', async () => {
    class Thing extends Model {
      static fields = { name: fields.string() };

      static options = { table: 'mig_thing' };
    }
    const migrations = path.join(dir, 'refused');
    const db = new Database({ backend: 'memory' }).register(Thing);
    await db.makeMigrations({ dir: migrations });
    class Thing2 extends Model {
      static fields = { name: fields.string(), size: fields.integer() };

      static options = { table: 'mig_thing' };
    }
    const next = new Database({ backend: 'memory' }).register(Thing2);
    await expect(next.makeMigrations({ dir: migrations })).rejects.toThrow(ModelError);
    await expect(next.makeMigrations({ dir: migrations })).rejects.toThrow('needs null: true or a default');
  });
});
