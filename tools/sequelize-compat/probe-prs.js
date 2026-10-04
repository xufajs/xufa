// Scenarios of open pull requests of Sequelize, run on @xufa/sequelize and on Sequelize 6 (SQLite in memory): what
// each gives, side by side. node probe-prs.js [name filter]
const path = require('node:path');

const layer = require(path.join(__dirname, '..', '..', 'packages', 'sequelize'));
const real = require('real-sequelize');

const scenarios = {
  // #13153: hasOne set() with a target that fails to save: the old one is kept?
  async hasOneSetFailure({ Sequelize, DataTypes }, sequelize) {
    const User = sequelize.define('User', { name: DataTypes.STRING });
    const Profile = sequelize.define('Profile', { bio: { type: DataTypes.STRING, validate: { len: [3, 10] } } });
    User.hasOne(Profile);
    await sequelize.sync({ force: true });
    const user = await User.create({ name: 'a' });
    await user.setProfile(await Profile.create({ bio: 'valid' }));
    const bad = Profile.build({ bio: 'x' });
    const error = await user.setProfile(bad).then(
      () => null,
      (err) => err.name
    );
    const kept = await user.getProfile();
    return { error, kept: kept && kept.bio };
  },
  // #14120: update({ returning, individualHooks }): previous values in afterUpdate.
  async previousInAfterUpdate({ DataTypes }, sequelize) {
    const seen = [];
    const User = sequelize.define(
      'User',
      { name: DataTypes.STRING },
      {
        hooks: { afterUpdate: (user) => seen.push([user.name, user.previous('name')]) },
      }
    );
    await sequelize.sync({ force: true });
    await User.create({ name: 'old' });
    await User.update({ name: 'new' }, { where: {}, individualHooks: true, returning: true });
    return seen;
  },
  // #14469: create with ignoreDuplicates when the row exists.
  async createIgnoreDuplicates({ DataTypes }, sequelize) {
    const Tag = sequelize.define('Tag', { name: { type: DataTypes.STRING, unique: true } });
    await sequelize.sync({ force: true });
    await Tag.create({ name: 'a' });
    const result = await Tag.create({ name: 'a' }, { ignoreDuplicates: true }).then(
      (tag) => ({ id: tag.id, isNew: tag.isNewRecord }),
      (err) => err.name
    );
    return { result, count: await Tag.count() };
  },
  // #15338: values given as an instance of a class with getters.
  async classInstanceValues({ DataTypes }, sequelize) {
    const User = sequelize.define('User', { name: DataTypes.STRING, age: DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    class Input {
      get name() {
        return 'ada';
      }

      get age() {
        return 36;
      }
    }
    const created = await User.create(new Input()).then(
      (user) => [user.name, user.age],
      (err) => err.message
    );
    return created;
  },
  // #15586: Model.update of an attribute whose setter reads another (getDataValue).
  async bulkUpdateSetter({ DataTypes }, sequelize) {
    const Item = sequelize.define('Item', {
      price: DataTypes.INTEGER,
      total: {
        type: DataTypes.INTEGER,
        set(value) {
          this.setDataValue('total', value * (this.getDataValue('price') || 1));
        },
      },
    });
    await sequelize.sync({ force: true });
    await Item.create({ price: 2, total: 3 });
    const result = await Item.update({ total: 5 }, { where: {} }).then(
      (r) => r,
      (err) => err.message
    );
    return { result, rows: (await Item.findAll({ raw: true })).map((row) => row.total) };
  },
  // #17379: createdAt in updateOnDuplicate.
  async createdAtOnDuplicate({ DataTypes }, sequelize) {
    const Tag = sequelize.define('Tag', { name: { type: DataTypes.STRING, unique: true }, n: DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    await Tag.create({ name: 'a', n: 1, createdAt: new Date('2000-01-01') });
    const r = await Tag.bulkCreate([{ name: 'a', n: 2, createdAt: new Date('2010-01-01') }], {
      updateOnDuplicate: ['n', 'createdAt'],
    }).then(
      () => 'ok',
      (err) => err.message
    );
    const tag = await Tag.findOne();
    return { r, n: tag.n, createdAt: tag.createdAt.toISOString().slice(0, 10) };
  },
  // #16327, #18219, #18017: changes of beforeUpsert reach the query.
  async beforeUpsertChanges({ DataTypes }, sequelize) {
    const args = [];
    const User = sequelize.define(
      'User',
      { name: { type: DataTypes.STRING, unique: true }, role: DataTypes.STRING },
      {
        hooks: {
          beforeUpsert(values) {
            args.push(values && values.constructor && values.constructor.name);
            values.role = 'hooked';
          },
        },
      }
    );
    await sequelize.sync({ force: true });
    await User.upsert({ name: 'a', role: 'given' });
    return { argument: args[0], role: (await User.findOne()).role };
  },
  // #16913: the order of keys with getters and virtual attributes.
  async keyOrder({ DataTypes }, sequelize) {
    const User = sequelize.define('User', {
      first: DataTypes.STRING,
      full: {
        type: DataTypes.VIRTUAL,
        get() {
          return `${this.first}!`;
        },
      },
      last: {
        type: DataTypes.STRING,
        get() {
          return this.getDataValue('last').toUpperCase();
        },
      },
    });
    await sequelize.sync({ force: true });
    await User.create({ first: 'a', last: 'b' });
    return Object.keys((await User.findOne()).toJSON());
  },
  // #17404: describeTable with a functional index.
  async describeFunctionalIndex({ DataTypes }, sequelize) {
    const T = sequelize.define('T', { a: DataTypes.INTEGER, b: DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    await sequelize.query('CREATE INDEX t_coalesce ON "Ts" (COALESCE(a, b))');
    return sequelize
      .getQueryInterface()
      .describeTable('Ts')
      .then(
        (d) => Object.keys(d),
        (err) => err.message
      );
  },
  // #17436: order by [Association, 'attribute', 'ASC'] with a field of another name.
  async orderByIncludeField({ DataTypes }, sequelize) {
    const A = sequelize.define('A', { name: DataTypes.STRING });
    const B = sequelize.define('B', { label: { type: DataTypes.STRING, field: 'label_col' } });
    A.belongsTo(B);
    await sequelize.sync({ force: true });
    const b1 = await B.create({ label: 'z' });
    const b2 = await B.create({ label: 'a' });
    await A.create({ name: 'one', BId: b1.id });
    await A.create({ name: 'two', BId: b2.id });
    return A.findAll({ include: [B], order: [[B, 'label', 'ASC']] }).then(
      (rows) => rows.map((row) => row.name),
      (err) => err.message
    );
  },
  // #13647, #17583: SQLite tables made again keep unique keys of several columns and composite primary keys.
  async sqliteRebuildKeys({ DataTypes }, sequelize) {
    const qi = sequelize.getQueryInterface();
    await qi.createTable('pairs', {
      a: { type: DataTypes.INTEGER, primaryKey: true },
      b: { type: DataTypes.INTEGER, primaryKey: true },
      c: DataTypes.INTEGER,
      d: DataTypes.INTEGER,
    });
    await qi.addIndex('pairs', ['c', 'd'], { unique: true });
    await qi.changeColumn('pairs', 'c', { type: DataTypes.INTEGER, allowNull: true });
    await qi.bulkInsert('pairs', [
      { a: 1, b: 1, c: 1, d: 1 },
      { a: 1, b: 2, c: 1, d: 2 },
    ]);
    const okSameC = 'inserted';
    const dupPk = await qi.bulkInsert('pairs', [{ a: 1, b: 3, c: 9, d: 9 }]).then(
      () => 'a=1 again: ok',
      (err) => err.name
    );
    return {
      okSameC,
      dupPk,
      indexes: (await qi.showIndex('pairs')).map(
        (i) => `${i.unique ? 'U' : ''}(${i.fields.map((f) => f.attribute).join(',')})`
      ),
    };
  },
  // #17726: findOne with a hasMany include and a where on the key.
  async findOneIncludeMany({ DataTypes }, sequelize) {
    const User = sequelize.define('User', { name: DataTypes.STRING });
    const Task = sequelize.define('Task', { title: DataTypes.STRING });
    User.hasMany(Task);
    await sequelize.sync({ force: true });
    const user = await User.create({ name: 'a' });
    await Task.bulkCreate([
      { title: 't1', UserId: user.id },
      { title: 't2', UserId: user.id },
    ]);
    const found = await User.findOne({ where: { id: user.id }, include: [Task] });
    return found.Tasks.length;
  },
  // #17992: findOrCreate when a null value of where meets a unique violation.
  async findOrCreateNull({ DataTypes }, sequelize) {
    const T = sequelize.define('T', { code: { type: DataTypes.STRING, unique: true }, note: DataTypes.STRING });
    await sequelize.sync({ force: true });
    await T.create({ code: 'x', note: null });
    return T.findOrCreate({ where: { code: 'x', note: null } }).then(
      ([t, created]) => [t.code, created],
      (err) => err.name
    );
  },
  // #18173: build() of a saved object's JSON keeps its timestamps.
  async buildKeepsTimestamps({ DataTypes }, sequelize) {
    const User = sequelize.define('User', { name: DataTypes.STRING });
    await sequelize.sync({ force: true });
    const user = await User.create({ name: 'a' });
    const rebuilt = User.build(user.toJSON(), { isNewRecord: false });
    return [Boolean(rebuilt.createdAt), Boolean(rebuilt.updatedAt)];
  },
  // #18214: the order of a query and the order of a scope.
  async scopeOrder({ DataTypes }, sequelize) {
    const User = sequelize.define(
      'User',
      { name: DataTypes.STRING, age: DataTypes.INTEGER },
      {
        defaultScope: { order: [['age', 'DESC']] },
      }
    );
    await sequelize.sync({ force: true });
    await User.bulkCreate([
      { name: 'a', age: 1 },
      { name: 'b', age: 2 },
      { name: 'c', age: 2 },
    ]);
    return (await User.findAll({ order: [['name', 'DESC']] })).map((u) => u.name);
  },
  // #18235: an ENUM with a value containing REFERENCES.
  async enumReferences({ DataTypes }, sequelize) {
    const T = sequelize.define('T', { kind: DataTypes.ENUM('PREFERENCES', 'OTHER') });
    return sequelize.sync({ force: true }).then(
      async () => {
        await T.create({ kind: 'PREFERENCES' });
        return (await T.findOne()).kind;
      },
      (err) => err.message
    );
  },
  // #18243: a named replacement followed by /.
  async replacementSlash(_, sequelize) {
    return sequelize.query('SELECT :n/2 AS half', { replacements: { n: 10 }, type: 'SELECT' }).then(
      (rows) => rows[0].half,
      (err) => err.message
    );
  },
  // #18251: VIRTUAL attributes of included models.
  async virtualInInclude({ DataTypes }, sequelize) {
    const User = sequelize.define('User', { name: DataTypes.STRING });
    const File = sequelize.define('File', {
      path: DataTypes.STRING,
      url: {
        type: DataTypes.VIRTUAL(DataTypes.STRING, ['path']),
        get() {
          return `/files/${this.get('path')}`;
        },
      },
    });
    User.belongsTo(File, { as: 'avatar' });
    await sequelize.sync({ force: true });
    const file = await File.create({ path: 'a.png' });
    await User.create({ name: 'a', avatarId: file.id });
    const user = await User.findOne({ include: ['avatar'] });
    return user.toJSON().avatar.url;
  },
  // #18299, #18257: belongsToMany with sourceKey and targetKey other than the keys.
  async btmCustomKeys({ DataTypes }, sequelize) {
    const User = sequelize.define('User', { code: { type: DataTypes.STRING, unique: true }, name: DataTypes.STRING });
    const Group = sequelize.define('Group', { slug: { type: DataTypes.STRING, unique: true } });
    User.belongsToMany(Group, { through: 'UserGroups', sourceKey: 'code', targetKey: 'slug' });
    Group.belongsToMany(User, { through: 'UserGroups', sourceKey: 'slug', targetKey: 'code' });
    await sequelize.sync({ force: true });
    const user = await User.create({ code: 'u1', name: 'a' });
    const group = await Group.create({ slug: 'g1' });
    await user.addGroup(group);
    const joined = await sequelize.query('SELECT * FROM "UserGroups"', { type: 'SELECT' });
    const found = await User.findAll({ include: [{ model: Group, where: { slug: 'g1' } }], limit: 1 });
    return { joined, groups: found.map((u) => u.Groups.map((g) => g.slug)) };
  },
  // #18274: sync({ alter }) keeps AUTOINCREMENT (SQLite).
  async sqliteAutoincrement({ DataTypes }, sequelize) {
    const T = sequelize.define('T', { name: DataTypes.STRING });
    await sequelize.sync({ force: true });
    T.rawAttributes.extra = { type: DataTypes.STRING, field: 'extra', fieldName: 'extra' };
    T.refreshAttributes();
    await sequelize.sync({ alter: true });
    const [row] = await sequelize.query("SELECT sql FROM sqlite_master WHERE name = 'Ts'", { type: 'SELECT' });
    return /AUTOINCREMENT/i.test(row.sql);
  },
  // #18288: a column name with the quote of identifiers in renameColumn and changeColumn.
  async quotedColumnNames({ DataTypes }, sequelize) {
    const qi = sequelize.getQueryInterface();
    await qi.createTable('things', { id: { type: DataTypes.INTEGER, primaryKey: true }, 'we"ird': DataTypes.STRING });
    const renamed = await qi.renameColumn('things', 'we"ird', 'o"k').then(
      () => 'ok',
      (err) => err.message.slice(0, 60)
    );
    return { renamed, columns: Object.keys(await qi.describeTable('things')) };
  },
  // #18324: empty and null-bearing sets of Op.in / Op.notIn, and their negation.
  async emptyInSets({ DataTypes, Op }, sequelize) {
    const T = sequelize.define('T', { a: DataTypes.INTEGER });
    await sequelize.sync({ force: true });
    await T.bulkCreate([{ a: 1 }, { a: 2 }, { a: null }]);
    const count = (where) => T.count({ where }).catch((err) => err.message.slice(0, 40));
    return {
      inEmpty: await count({ a: { [Op.in]: [] } }),
      notInEmpty: await count({ a: { [Op.notIn]: [] } }),
      notOfInEmpty: await count({ [Op.not]: { a: { [Op.in]: [] } } }),
      inWithNull: await count({ a: { [Op.in]: [1, null] } }),
      notInWithNull: await count({ a: { [Op.notIn]: [1, null] } }),
    };
  },
};

async function run(lib, name, fn) {
  const sequelize = new lib.Sequelize('sqlite::memory:', { logging: false });
  try {
    return await fn(lib, sequelize);
  } catch (err) {
    return `THROWS ${err.name}: ${String(err.message).slice(0, 80)}`;
  } finally {
    await sequelize.close().catch(() => {});
  }
}

(async () => {
  const filter = process.argv[2] || '';
  for (const [name, fn] of Object.entries(scenarios)) {
    if (!name.includes(filter)) continue;
    const ours = JSON.stringify(await run(layer, name, fn));
    const theirs = JSON.stringify(await run(real, name, fn));
    console.log(`${ours === theirs ? 'same' : 'DIFF'}  ${name}\n  xufa:   ${ours}\n  seq 6:  ${theirs}`);
  }
})();
