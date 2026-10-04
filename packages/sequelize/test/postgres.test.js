const { Sequelize, DataTypes, Op } = require('..');
const { defineSuite } = require('./suite');
const { url, available } = require('../../pg/test/server');

describe.skipIf(!available)('postgres', () => {
  defineSuite('postgres', () => new Sequelize(url, { logging: false, pool: { max: 5 } }));

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
});
