const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Database, Model, fields, setEncryptionKeys, generateEncryptionKey } = require('..');
const { defineSuite } = require('./suite');
const { url, available } = require('../../pg/test/server');

describe.skipIf(!available)('postgres', () => {
  defineSuite('postgres', () => new Database({ backend: 'postgres', url, max: 5 }));

  it('creates tables with a fillfactor', async () => {
    class Counter extends Model {
      static fields = { hits: fields.integer({ default: 0 }) };

      static options = { fillfactor: 70 };
    }
    const db = new Database({ backend: 'postgres', url }).register(Counter);
    await db.connect();
    await db.drop();
    await db.sync();
    const [row] = await db.backend.raw("SELECT reloptions FROM pg_class WHERE relname = 'counter'");
    expect(row.reloptions).toEqual(['fillfactor=70']);
    await db.drop();
    await db.close();
  });

  it('keeps tables in other schemas, and names with dots', async () => {
    class Shelf extends Model {
      static fields = { name: fields.string() };

      static options = { table: 'shelves', schema: 'xufa_schema' };
    }
    // A name with a dot is a name (not a schema and a table).
    class Item extends Model {
      static fields = { name: fields.string(), shelf: fields.foreignKey(Shelf) };

      static options = { table: 'shop.items', schema: 'xufa_schema' };
    }
    class Note extends Model {
      static fields = { text: fields.string(), item: fields.foreignKey(Item) };

      static options = { table: 'xufa.notes' };
    }
    const db = new Database({ backend: 'postgres', url }).register(Shelf, Item, Note);
    await db.connect();
    await db.backend.raw('DROP SCHEMA IF EXISTS xufa_schema CASCADE');
    await db.backend.raw('CREATE SCHEMA xufa_schema');
    await db.sync();
    const shelf = await Shelf.objects.create({ name: 'top' });
    await Item.objects.bulkCreate([
      { name: 'a', shelf },
      { name: 'b', shelf },
    ]);
    expect(await Item.objects.filter({ shelf__name: 'top' }).count()).toBe(2);
    expect((await Item.objects.selectRelated('shelf').first()).shelf.name).toBe('top');
    const [row] = await db.backend.raw("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'xufa_schema'");
    expect(row.n).toBe(2);
    const item = await Item.objects.get({ name: 'a' });
    await Note.objects.bulkCreate(Array.from({ length: 600 }, (_, i) => ({ text: `n${i}`, item })));
    expect(await Note.objects.filter({ item__shelf__name: 'top' }).count()).toBe(600);
    const [dotted] = await db.backend.raw("SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'xufa.notes'");
    expect(dotted.n).toBe(1);
    await db.drop();
    await db.backend.raw('DROP SCHEMA xufa_schema CASCADE');
    await db.close();
  });

  it('migrates tables in other schemas, with dots in their names', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-schema-migrations-'));
    const models = (extra) => {
      class Box extends Model {
        static fields = { name: fields.string(), ...(extra ? { size: fields.integer({ default: 1 }) } : {}) };

        static options = { table: 'store.boxes', schema: 'xufa_mig_schema' };
      }
      class Tag extends Model {
        static fields = { label: fields.string(), box: fields.foreignKey(Box) };

        static options = { table: 'tags', schema: 'xufa_mig_schema' };
      }
      return [Box, Tag];
    };
    const open = async (extra) => {
      const db = new Database({ backend: 'postgres', url, max: 2 }).register(...models(extra));
      await db.connect();
      return db;
    };
    let db = await open(false);
    await db.backend.raw('DROP SCHEMA IF EXISTS xufa_mig_schema CASCADE');
    await db.backend.raw('DROP TABLE IF EXISTS xufa_migrations');
    await db.backend.raw('CREATE SCHEMA xufa_mig_schema');
    await db.makeMigrations({ dir });
    expect(await db.migrate({ dir })).toEqual(['0001_initial']);
    await db.close();
    db = await open(true);
    expect(await db.makeMigrations({ dir })).not.toBeNull();
    expect(await db.migrate({ dir })).toEqual(['0002_auto']);
    const [Box] = db.models.values();
    await Box.objects.create({ name: 'a' });
    expect((await Box.objects.get({ name: 'a' })).size).toBe(1);
    await db.backend.raw('DROP SCHEMA xufa_mig_schema CASCADE');
    await db.backend.raw('DROP TABLE IF EXISTS xufa_migrations');
    await db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rejects fillfactors out of range', () => {
    class Wrong extends Model {
      static fields = { n: fields.integer() };

      static options = { fillfactor: 5 };
    }
    expect(() => Wrong.meta).toThrow('fillfactor must be an integer from 10 to 100');
  });

  it('encrypts the values of large inserts (COPY)', async () => {
    setEncryptionKeys({ keys: { k1: generateEncryptionKey() } });
    class Vault extends Model {
      static fields = {
        label: fields.integer(),
        secret: fields.encrypted(fields.string()),
        code: fields.encrypted(fields.integer(), { deterministic: true }),
      };

      static options = { table: 'enc_vault' };
    }
    const db = new Database({ backend: 'postgres', url }).register(Vault);
    await db.connect();
    await db.drop();
    await db.sync();
    await Vault.objects.bulkCreate(Array.from({ length: 600 }, (_, i) => ({ label: i, secret: `s${i}`, code: i })));
    const [row] = await db.backend.raw('SELECT secret FROM enc_vault WHERE label = 7');
    expect(row.secret.startsWith('$xenc$1$k1$')).toBe(true);
    expect((await Vault.objects.get({ code: 7 })).secret).toBe('s7');
    await db.drop();
    await db.close();
    setEncryptionKeys(null);
  });
});
