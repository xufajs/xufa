import { Sequelize, DataTypes, Op } from '../index.js';
import { defineSuite } from './suite.js';
import { url, available } from '../../pg/test/server.js';

describe.skipIf(!available)('postgres', () => {
  defineSuite('postgres', (options) => new Sequelize(url, { logging: false, pool: { max: 5 }, ...options }));

  it('stores infinite dates, also as defaults and as the deletedAt of paranoid models', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const Period = sequelize.define(
      'Period',
      {
        label: DataTypes.STRING,
        startsOn: { type: DataTypes.DATEONLY, defaultValue: -Infinity },
        endsAt: { type: DataTypes.DATE, defaultValue: Infinity },
        checkedAt: { type: DataTypes.DATE, defaultValue: sequelize.fn('NOW') },
        deletedAt: { type: DataTypes.DATE, defaultValue: Infinity },
      },
      { tableName: 'inf_periods', paranoid: true }
    );
    try {
      await Period.sync({ force: true });
      const open = await Period.create({ label: 'open' });
      expect(open.startsOn).toBe(-Infinity);
      expect(open.endsAt).toBe(Infinity);
      await Period.create({ label: 'closed', endsAt: new Date('2024-01-01T00:00:00Z') });
      // Not deleted: deletedAt is its default (Infinity), as Sequelize finds them.
      expect(await Period.count()).toBe(2);
      expect((await Period.findAll({ where: { endsAt: Infinity } })).map((item) => item.label)).toEqual(['open']);
      expect((await Period.findAll({ order: [['endsAt', 'DESC']] })).map((item) => item.label)).toEqual([
        'open',
        'closed',
      ]);
      await open.destroy();
      expect(await Period.count()).toBe(1);
      const found = await Period.findOne({ where: { label: 'open' }, paranoid: false });
      expect(found.deletedAt).toBeInstanceOf(Date);
      expect(found.startsOn).toBe(-Infinity);
      // Values the database makes (fn) are read back with returning.
      await found.update({ endsAt: '-Infinity', checkedAt: sequelize.fn('NOW') }, { returning: true });
      expect(found.endsAt).toBe(-Infinity);
      expect(found.checkedAt).toBeInstanceOf(Date);
      await Period.drop();
    } finally {
      await sequelize.close();
    }
  });

  it('stores arrays as arrays of PostgreSQL, with their operators', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const Item = sequelize.define(
      'ArrItem',
      {
        tags: DataTypes.ARRAY(DataTypes.STRING),
        sizes: DataTypes.ARRAY(DataTypes.INTEGER),
        moods: DataTypes.ARRAY(DataTypes.ENUM('happy', 'sad')),
      },
      { tableName: 'arr_items', timestamps: false }
    );
    try {
      await Item.sync({ force: true });
      const columns = await sequelize.getQueryInterface().describeTable('arr_items');
      expect([columns.tags.type, columns.sizes.type, columns.moods.type]).toEqual(['ARRAY', 'ARRAY', 'ARRAY']);
      await Item.bulkCreate([
        { tags: ['a', 'b'], sizes: [1, 2], moods: ['happy'] },
        { tags: ['b', 'c'], sizes: [3], moods: ['sad', 'happy'] },
        { tags: [], sizes: null, moods: [] },
      ]);
      const first = await Item.findOne({ where: { tags: ['a', 'b'] } });
      expect([first.tags, first.sizes, first.moods]).toEqual([['a', 'b'], [1, 2], ['happy']]);
      const count = (where) => Item.count({ where });
      expect(await count({ tags: { [Op.contains]: ['b'] } })).toBe(2);
      expect(await count({ tags: { [Op.overlap]: ['a', 'z'] } })).toBe(1);
      expect(await count({ sizes: { [Op.contained]: [1, 2, 3] } })).toBe(2);
      expect(await count({ moods: { [Op.contains]: ['happy'] } })).toBe(2);
      await Item.update({ moods: ['sad'] }, { where: { tags: { [Op.contains]: ['c'] } } });
      expect(await count({ moods: ['sad'] })).toBe(1);
      // An array of enums added to a table.
      await sequelize
        .getQueryInterface()
        .addColumn('arr_items', 'levels', { type: DataTypes.ARRAY(DataTypes.ENUM('low', 'high')) });
      expect((await sequelize.getQueryInterface().describeTable('arr_items')).levels.type).toBe('ARRAY');
      await Item.drop();
      await sequelize.query('DROP TYPE IF EXISTS "enum_arr_items_moods", "enum_arr_items_levels"');
    } finally {
      await sequelize.close();
    }
  });

  it('stores GEOMETRY and GEOGRAPHY values (PostGIS) as GeoJSON', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    try {
      const [rows] = await sequelize.query("SELECT 1 AS ok FROM pg_extension WHERE extname = 'postgis'");
      if (rows.length === 0) return;
      const Pub = sequelize.define(
        'GeoPub',
        {
          name: DataTypes.STRING,
          location: { field: 'coordinates', type: DataTypes.GEOMETRY('POINT', 4326) },
          area: DataTypes.GEOGRAPHY('POLYGON'),
        },
        { tableName: 'geo_pubs', timestamps: false }
      );
      await Pub.sync({ force: true });
      const crs = { type: 'name', properties: { name: 'EPSG:4326' } };
      const point = { type: 'Point', coordinates: [39.807222, -76.984722], crs };
      const area = {
        type: 'Polygon',
        coordinates: [
          [
            [100, 0],
            [101, 0],
            [101, 1],
            [100, 0],
          ],
        ],
      };
      await Pub.create({ name: 'a', location: point, area });
      const found = await Pub.findOne({ where: { name: 'a' } });
      expect(found.location).toEqual(point);
      // A geography without a crs is EPSG:4326 in PostGIS.
      expect(found.area).toEqual({ ...area, crs });
      const [[distance]] = await sequelize.query(
        "SELECT ST_Distance(coordinates, 'SRID=4326;POINT(39.807222 -76.984722)'::geometry) AS d FROM geo_pubs"
      );
      expect(distance.d).toBe(0);
      await expect(
        Pub.create({ name: 'bad', location: { type: 'Point', coordinates: [1, "'); DROP TABLE geo_pubs; --"] } })
      ).rejects.toThrow('must be numbers');
      await Pub.drop();
    } finally {
      await sequelize.close();
    }
  });

  it('stores HSTORE values, compares them as wholes, and adds values to enum types', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    try {
      const [rows] = await sequelize.query("SELECT 1 AS ok FROM pg_extension WHERE extname = 'hstore'");
      if (rows.length === 0) return;
      const Owner = sequelize.define('HsOwner', { name: DataTypes.STRING }, { tableName: 'hs_owners' });
      const Kit = sequelize.define(
        'HsKit',
        {
          belt: DataTypes.HSTORE,
          spares: DataTypes.ARRAY(DataTypes.HSTORE),
          mood: DataTypes.ENUM('happy', 'sad'),
        },
        { tableName: 'hs_kits' }
      );
      Owner.hasMany(Kit, { foreignKey: 'ownerId' });
      await Owner.sync({ force: true });
      await Kit.sync({ force: true });
      const owner = await Owner.create({ name: 'bruce' });
      await Kit.create({ ownerId: owner.id, belt: { hook: 'yes', rope: null }, spares: [{ a: '1' }], mood: 'happy' });
      const kit = await Kit.findOne({ where: { belt: { hook: 'yes', rope: null } } });
      expect(kit.belt).toEqual({ hook: 'yes', rope: null });
      expect(kit.spares).toEqual([{ a: '1' }]);
      expect((await sequelize.getQueryInterface().describeTable('hs_kits')).belt.type).toBe('HSTORE');
      // Includes are properties of the instances too.
      const found = await Owner.findOne({ include: [Kit] });
      expect(Object.prototype.hasOwnProperty.call(found, 'HsKits')).toBe(true);
      expect(found.HsKits[0].belt).toEqual({ hook: 'yes', rope: null });
      // An enum defined again with more values: sync adds them, in their order.
      const Kit2 = sequelize.define(
        'HsKit',
        { belt: DataTypes.HSTORE, mood: DataTypes.ENUM('neutral', 'happy', 'sad', 'joyful') },
        { tableName: 'hs_kits' }
      );
      await Kit2.sync();
      const [enums] = await sequelize.query(
        "SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS labels FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'enum_hs_kits_mood'"
      );
      expect(enums[0].labels).toBe('{neutral,happy,sad,joyful}');
      await Kit2.drop();
      await Owner.drop();
      await sequelize.query('DROP TYPE IF EXISTS "enum_hs_kits_mood"');
    } finally {
      await sequelize.close();
    }
  });

  it('makes tables with a fillfactor, and alters it', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const reloptions = async () => {
      const [rows] = await sequelize.query("SELECT reloptions FROM pg_class WHERE relname = 'fill_counters'");
      return rows[0].reloptions;
    };
    const define = (options) =>
      sequelize.define('Counter', { hits: DataTypes.INTEGER }, { tableName: 'fill_counters', ...options });
    try {
      await define({ fillfactor: 70 }).sync({ force: true });
      expect(await reloptions()).toEqual(['fillfactor=70']);
      await define({ fillfactor: 50 }).sync({ alter: true });
      expect(await reloptions()).toEqual(['fillfactor=50']);
      const Plain = define({});
      await Plain.sync({ alter: true });
      expect(await reloptions()).toBeNull();
      await Plain.drop();
      expect(() => define({ fillfactor: 5 })).toThrow('fillfactor must be an integer from 10 to 100');
    } finally {
      await sequelize.close();
    }
  });

  it('shares named enum types among tables (ENUM({ values, name, schema }), as Sequelize 7)', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const types = async () =>
      (
        await sequelize.query(
          "SELECT n.nspname || '.' || t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname IN ('shared_mood', 'shared_other') ORDER BY 1",
          { type: 'SELECT' }
        )
      ).map((row) => row.name);
    const mood = (values = ['happy', 'sad']) => DataTypes.ENUM({ values, name: 'shared_mood' });
    try {
      expect(() => DataTypes.ENUM({ values: ['a'], name: '' })).toThrow('The name of an ENUM is a text');
      const A = sequelize.define('MoodA', { mood: mood(), moods: DataTypes.ARRAY(mood()) });
      const B = sequelize.define('MoodB', {
        mood: mood(),
        other: DataTypes.ENUM({ values: ['x'], name: 'shared_other', schema: 'shared_enums' }),
      });
      await A.sync({ force: true });
      await B.sync({ force: true });
      await A.create({ mood: 'happy', moods: ['sad', 'happy'] });
      await B.create({ mood: 'sad', other: 'x' });
      expect(await types()).toEqual(['public.shared_mood', 'shared_enums.shared_other']);
      // Another model of the type with more values: they are added to it.
      const C = sequelize.define('MoodC', { mood: mood(['happy', 'sad', 'calm']) });
      await C.sync({ force: true });
      await C.create({ mood: 'calm' });
      // Dropping a table keeps the named types.
      await A.sync({ force: true });
      expect(await types()).toEqual(['public.shared_mood', 'shared_enums.shared_other']);
      expect((await B.findOne()).mood).toBe('sad');
      expect((await sequelize.getQueryInterface().describeTable('MoodBs')).other.special).toEqual(['x']);
      await C.drop();
      await B.drop();
      await A.drop();
    } finally {
      await sequelize.query('DROP TYPE IF EXISTS shared_mood CASCADE');
      await sequelize.query('DROP SCHEMA IF EXISTS shared_enums CASCADE');
      await sequelize.close();
    }
  });

  it('keeps the copies of a model in schemas apart, also before the model is used (schema(), sync({ schema }))', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 4 } });
    const drop = () =>
      Promise.all(['copies_one', 'copies_two'].map((name) => sequelize.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`)));
    try {
      await drop();
      const Shop = sequelize.define('Shop', { name: DataTypes.STRING }, { tableName: 'shops' });
      const Clerk = sequelize.define('Clerk', { name: DataTypes.STRING }, { tableName: 'clerks' });
      Shop.hasMany(Clerk, { foreignKey: 'shop_id', constraints: false });
      // Copies made before the models were used: each one its own table.
      const ShopOne = Shop.schema('copies_one');
      const ShopTwo = Shop.schema('copies_two');
      expect(Shop.schema('copies_one')).toBe(ShopOne);
      expect(ShopOne.schema(null)).toBe(Shop);
      await Promise.all([sequelize.createSchema('copies_one'), sequelize.createSchema('copies_two')]);
      await Promise.all([ShopOne.sync({ force: true }), ShopTwo.sync({ force: true })]);
      await ShopOne.create({ name: 'one' });
      await ShopTwo.create({ name: 'two' });
      expect((await ShopOne.findAll()).map((shop) => shop.name)).toEqual(['one']);
      expect((await ShopTwo.findAll()).map((shop) => shop.name)).toEqual(['two']);
      expect(Shop._schema).toBeNull();
      // Includes of copies read their tables; getters take the schema.
      const ClerkOne = Clerk.schema('copies_one');
      await ClerkOne.sync({ force: true });
      const shop = await ShopOne.findOne();
      await ClerkOne.create({ name: 'ann', shop_id: shop.id });
      const found = await ShopOne.findOne({ include: [{ model: ClerkOne, as: 'Clerks' }] });
      expect(found.Clerks.map((clerk) => clerk.name)).toEqual(['ann']);
      expect((await found.getClerks({ schema: 'copies_one' })).map((clerk) => clerk.name)).toEqual(['ann']);
      // sync({ schema }): the table in the schema, its references to the tables there.
      const Owner = sequelize.define('Owner', { name: DataTypes.STRING });
      const Pet = sequelize.define('Pet', { name: DataTypes.STRING });
      Pet.belongsTo(Owner);
      await Owner.sync({ force: true, schema: 'copies_two' });
      await Pet.sync({ force: true, schema: 'copies_two' });
      const [reference] = await sequelize
        .getQueryInterface()
        .getForeignKeyReferencesForTable({ tableName: 'Pets', schema: 'copies_two' });
      expect([reference.referencedTableSchema, reference.referencedTableName]).toEqual(['copies_two', 'Owners']);
      const owner = await Owner.schema('copies_two').create({ name: 'o' });
      const pet = await Pet.schema('copies_two').create({ name: 'p' });
      await pet.setOwner(owner);
      expect((await pet.getOwner({ schema: 'copies_two' })).name).toBe('o');
    } finally {
      await drop();
      await sequelize.close();
    }
  });

  it('reads on the replicas and writes on the primary (replication)', async () => {
    const server = { host: '127.0.0.1', port: 5432, username: 'xufa', password: 'xufa', database: 'xufa_test' };
    const sequelize = new Sequelize('xufa_test', 'xufa', 'xufa', {
      dialect: 'postgres',
      logging: false,
      replication: { write: server, read: [server, server] },
    });
    const Reading = sequelize.define('Reading', { value: DataTypes.INTEGER }, { tableName: 'replication_readings' });
    const { read, write } = sequelize.connectionManager.pool;
    const replicas = [read.acquire(), read.acquire()];
    const primary = write.acquire();
    const counts = () => {
      const calls = { read: 0, write: 0 };
      const take = (pool, kind) => {
        const query = pool.query.bind(pool);
        const connect = pool.connect.bind(pool);
        pool.query = (...args) => {
          calls[kind] += 1;
          return query(...args);
        };
        pool.connect = () => {
          calls[kind] += 1;
          return connect();
        };
      };
      replicas.forEach((pool) => take(pool, 'read'));
      take(primary, 'write');
      return calls;
    };
    try {
      await Reading.sync({ force: true });
      const calls = counts();
      await Reading.create({ value: 1 });
      expect(calls).toEqual({ read: 0, write: 1 });
      await Reading.findAll();
      await Reading.count();
      await Reading.max('value');
      await sequelize.query('SELECT 1', { type: 'SELECT' });
      expect(calls).toEqual({ read: 4, write: 1 });
      // useMaster, raw queries not of type SELECT, and transactions not read-only: on the primary.
      await Reading.findAll({ useMaster: true });
      await sequelize.query('SELECT 1');
      await sequelize.transaction(async (transaction) => Reading.findAll({ transaction }));
      expect(calls).toEqual({ read: 4, write: 4 });
      await sequelize.transaction({ readOnly: true }, async (transaction) => Reading.findAll({ transaction }));
      expect(calls).toEqual({ read: 5, write: 4 });
      await Reading.drop();
    } finally {
      await sequelize.close();
    }
  });

  it('gives connections of the pool, opened through _connect, and times out acquiring them (pool.acquire)', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 1, acquire: 200 } });
    const cm = sequelize.connectionManager;
    const opened = [];
    const connect = cm._connect.bind(cm);
    cm._connect = (options) => {
      opened.push(options.host);
      return connect(options);
    };
    try {
      const connection = await cm.getConnection();
      expect(typeof connection.processID).toBe('number');
      expect((await connection.query('SELECT 1 AS ok')).rows).toEqual([{ ok: 1 }]);
      expect(opened).toHaveLength(1);
      expect(cm.pool.size).toBe(1);
      expect(cm.validate(connection)).toBe(true);
      // The only connection is taken: what needs another waits pool.acquire, then fails.
      await expect(sequelize.query('SELECT 1')).rejects.toBeInstanceOf(Sequelize.ConnectionAcquireTimeoutError);
      await cm.releaseConnection(connection);
      expect(await sequelize.query('SELECT 1 AS ok', { type: 'SELECT' })).toEqual([{ ok: 1 }]);
      // An error of a connection: it is not valid, and leaves the pool.
      const broken = await cm.getConnection();
      broken.emit('error', new Error('ECONNRESET'));
      expect(cm.validate(broken)).toBe(false);
      const next = await cm.getConnection();
      expect(next.processID).not.toBe(broken.processID);
      await cm.releaseConnection(next);
    } finally {
      await sequelize.close();
    }
  });

  it('closes the connection of a transaction whose COMMIT fails', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    try {
      await sequelize.query('SELECT 1');
      const size = sequelize.connectionManager.pool.size;
      const qi = sequelize.getQueryInterface();
      const commit = qi.commitTransaction;
      qi.commitTransaction = async () => {
        throw new Error('Oh no');
      };
      const transaction = await sequelize.transaction();
      await expect(transaction.commit()).rejects.toThrow('Oh no');
      qi.commitTransaction = commit;
      expect(sequelize.connectionManager.pool.size).toBe(Math.max(0, size - 1));
    } finally {
      await sequelize.close();
    }
  });

  it('fails at once on rows locked by others with noWait (as Sequelize 7)', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 3 } });
    const Slot = sequelize.define('Slot', { n: DataTypes.INTEGER }, { tableName: 'nowait_slots' });
    try {
      await Slot.sync({ force: true });
      await Slot.create({ n: 1 });
      const holder = await sequelize.transaction();
      try {
        await Slot.findAll({ lock: true, transaction: holder });
        const other = await sequelize.transaction();
        try {
          const error = await Slot.findAll({ lock: true, noWait: true, transaction: other }).catch((err) => err);
          expect(error.parent.code).toBe('55P03');
        } finally {
          await other.rollback();
        }
      } finally {
        await holder.rollback();
      }
      await expect(Slot.findAll({ lock: true, skipLocked: true, noWait: true })).rejects.toThrow(
        'both skipLocked and noWait'
      );
      await Slot.drop();
    } finally {
      await sequelize.close();
    }
  });

  it('makes the schemas of the tables when they are not there (sync, as Sequelize 7)', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    try {
      await sequelize.query('DROP SCHEMA IF EXISTS made_by_sync CASCADE');
      const Thing = sequelize.define('Thing', { kind: DataTypes.ENUM('a', 'b') }, { schema: 'made_by_sync' });
      await sequelize.sync();
      await Thing.create({ kind: 'a' });
      expect(await Thing.count()).toBe(1);
      await sequelize.query('DROP SCHEMA made_by_sync CASCADE');
      await Thing.sync();
      expect(await Thing.count()).toBe(0);
    } finally {
      await sequelize.query('DROP SCHEMA IF EXISTS made_by_sync CASCADE');
      await sequelize.close();
    }
  });

  it('describes the method, collations and INCLUDE columns of indexes', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const qi = sequelize.getQueryInterface();
    try {
      await qi.createTable('method_indexes', {
        id: { type: DataTypes.INTEGER, primaryKey: true },
        a: DataTypes.STRING,
        'we,ird': DataTypes.STRING,
        c: DataTypes.JSONB,
      });
      await sequelize.query('CREATE INDEX method_coll ON method_indexes (a COLLATE "C" DESC, "we,ird") INCLUDE (id)');
      await sequelize.query('CREATE INDEX method_gin ON method_indexes USING gin (c)');
      const indexes = await qi.showIndex('method_indexes');
      const byName = Object.fromEntries(indexes.map((index) => [index.name, index]));
      expect(byName.method_coll).toMatchObject({
        method: 'BTREE',
        includes: ['id'],
        fields: [
          { name: 'a', collate: 'C', order: 'DESC' },
          { name: 'we,ird', collate: undefined },
        ],
      });
      expect(byName.method_gin).toMatchObject({ method: 'GIN', includes: [], fields: [{ name: 'c' }] });
      expect(byName.method_indexes_pkey).toMatchObject({ primary: true, method: 'BTREE' });
    } finally {
      await qi.dropTable('method_indexes').catch(() => {});
      await sequelize.close();
    }
  });

  it('changes enum columns, keeping their types', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const qi = sequelize.getQueryInterface();
    const types = async () =>
      (
        await sequelize.query("SELECT typname FROM pg_type WHERE typname LIKE 'enum_enum_changes%' ORDER BY 1", {
          type: 'SELECT',
        })
      ).map((row) => row.typname);
    const describe = async (column) => (await qi.describeTable('enum_changes'))[column];
    try {
      const Thing = sequelize.define(
        'Thing',
        { kind: { type: DataTypes.ENUM('a', 'b', 'c'), defaultValue: 'a' }, note: DataTypes.STRING },
        { tableName: 'enum_changes', timestamps: false }
      );
      await Thing.sync({ force: true });
      await Thing.create({ kind: 'b', note: 'on' });
      // sync({ alter }) leaves an enum column as it is (it made it VARCHAR(255) before).
      await Thing.sync({ alter: true });
      expect(await describe('kind')).toMatchObject({ type: 'USER-DEFINED', special: ['a', 'b', 'c'] });
      // Values added, then one left out: the type is made again, its default kept.
      await qi.changeColumns('enum_changes', { kind: { type: DataTypes.ENUM('a', 'b', 'c', 'd') } });
      expect((await describe('kind')).special).toEqual(['a', 'b', 'c', 'd']);
      await qi.changeColumns('enum_changes', { kind: { type: DataTypes.ENUM('a', 'b', 'd') } });
      expect(await describe('kind')).toMatchObject({ special: ['a', 'b', 'd'], defaultValue: 'a' });
      // A value the rows have cannot be left out: nothing changes.
      await expect(qi.changeColumns('enum_changes', { kind: { type: DataTypes.ENUM('a', 'd') } })).rejects.toThrow();
      expect((await describe('kind')).special).toEqual(['a', 'b', 'd']);
      expect(await types()).toEqual(['enum_enum_changes_kind']);
      // A text column made an enum; and changeColumn (Sequelize 6) keeps the enum type too.
      await qi.changeColumns('enum_changes', { note: { type: DataTypes.ENUM('on', 'off') } });
      expect(await describe('note')).toMatchObject({ type: 'USER-DEFINED', special: ['on', 'off'] });
      await qi.changeColumn('enum_changes', 'kind', { type: DataTypes.ENUM('a', 'b', 'd') });
      expect(await describe('kind')).toMatchObject({ type: 'USER-DEFINED', defaultValue: null });
      // autoIncrement on a column.
      await qi.changeColumns('enum_changes', { id: { autoIncrement: true } });
      await sequelize.query("INSERT INTO enum_changes (kind) VALUES ('a')");
      expect(
        (await sequelize.query('SELECT id FROM enum_changes ORDER BY id', { type: 'SELECT' })).map((row) => row.id)
      ).toEqual([1, 2]);
    } finally {
      await qi.dropTable('enum_changes').catch(() => {});
      for (const type of await types()) await sequelize.query(`DROP TYPE "${type}"`);
      await sequelize.close();
    }
  });

  it('does not make a unique column unique again on each sync({ alter })', async () => {
    const sequelize = new Sequelize(url, { logging: false, pool: { max: 2 } });
    const unique = async () => {
      const [rows] = await sequelize.query(
        "SELECT count(*)::int AS n FROM pg_index WHERE indrelid = 'alter_emails'::regclass AND indisunique AND NOT indisprimary"
      );
      return rows[0].n;
    };
    const Email = sequelize.define(
      'Email',
      { address: { type: DataTypes.STRING, unique: true } },
      { tableName: 'alter_emails' }
    );
    try {
      await Email.sync({ force: true });
      const created = await unique();
      await Email.sync({ alter: true });
      await Email.sync({ alter: true });
      expect(await unique()).toBe(created);
      await Email.drop();
    } finally {
      await sequelize.close();
    }
  });
});
