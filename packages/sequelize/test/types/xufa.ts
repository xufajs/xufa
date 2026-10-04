// Type tests of what @xufa/sequelize declares differently from Sequelize 6 (written for it, not ported). The package
// is imported by its path, so its package.json (types, exports) is tested too.
import { expectTypeOf } from 'expect-type';
import {
  BaseError,
  type CreationOptional,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  Model,
  NotSupportedError,
  NUMBER,
  QueryInterface,
  RetryOptions,
  Sequelize,
  Validator,
} from '../..';

// The error of what Sequelize does that @xufa/sequelize does not.
expectTypeOf(new NotSupportedError('Schemas')).toMatchTypeOf<BaseError>();

// retry: what retry-as-promised takes in Sequelize, without its types.
const retry: RetryOptions = { max: 3, match: ['SQLITE_BUSY', /deadlock/, NotSupportedError] };
const sequelize = new Sequelize('sqlite::memory:', { retry, logging: false });
expectTypeOf(sequelize.query('SELECT 1', { retry: { max: 2 } })).toMatchTypeOf<Promise<unknown>>();

// Validator: the validators of validator.js that the layer has, those of Sequelize, and extend().
expectTypeOf(Validator.isEmail('a@b.c')).toEqualTypeOf<boolean>();
expectTypeOf(Validator.len('abc', 1, 5)).toEqualTypeOf<boolean>();
expectTypeOf(Validator.extend('isEven', (value: string) => Number(value) % 2 === 0)).toEqualTypeOf(Validator);
// @ts-expect-error not one of the validators of the layer
Validator.isMobilePhone('600000000');

// The numeric types are NUMBER types.
expectTypeOf(DataTypes.NUMBER).toEqualTypeOf(NUMBER);

class User extends Model {
  declare id: number;
  declare visits: number;
}

async function queryInterface(qi: QueryInterface) {
  // increment and decrement as Sequelize runs them: (model, table, where, amounts, extra, options).
  await qi.increment(User, 'Users', { id: 1 }, { visits: 1 }, { updatedAt: new Date() });
  await qi.decrement(null, 'Users', { id: 1 }, { visits: 1 });
  // changeColumns (Sequelize 7): only what is given changes.
  await qi.changeColumns('Users', {
    visits: { allowNull: false },
    name: DataTypes.TEXT,
    role: { dropDefaultValue: true },
  });
  // @ts-expect-error not a definition
  await qi.changeColumns('Users', { visits: 3 });
  // showIndex: the indexes (method and includes in PostgreSQL, as Sequelize 7).
  const [index] = await qi.showIndex('Users');
  expectTypeOf(index.fields[0].name).toEqualTypeOf<string>();
  expectTypeOf(index.includes).toEqualTypeOf<string[] | undefined>();
  // showIndexes: as Sequelize 7 (the order of every field).
  const [info] = await qi.showIndexes('Users');
  expectTypeOf(info.fields[0].order).toEqualTypeOf<'ASC' | 'DESC'>();
  // The transactions are not begun by the QueryInterface.
  // @ts-expect-error not in @xufa/sequelize
  await qi.startTransaction(await sequelize.transaction());
}
void queryInterface;

// Sequelize 7: VIRTUALs computed by SQL (include as), and runtime attributes.
async function sequelize7() {
  const Counted = sequelize.define(
    'Counted',
    {
      posts: DataTypes.VIRTUAL(DataTypes.INTEGER, (as) => [
        sequelize.literal(`(SELECT 1 FROM t WHERE t.id = ${as}.id)`),
        'posts',
      ]),
      loud: DataTypes.VIRTUAL(DataTypes.STRING, (as) => sequelize.fn('upper', sequelize.col(`${as}.name`))),
    },
    { enableRuntimeAttributes: true }
  );
  await Counted.findAll({ attributes: ['posts', [sequelize.literal('7'), 'seven']], enableRuntimeAttributes: true });
  // @ts-expect-error not SQL
  DataTypes.VIRTUAL(DataTypes.INTEGER, (as: string) => as);
}
void sequelize7;

// How BIGINT values are given.
void new Sequelize('sqlite::memory:', { bigint: 'string' });
// @ts-expect-error not a mode
void new Sequelize('sqlite::memory:', { bigint: 'text' });

// The features of Sequelize 7.
class Hit extends Model<InferAttributes<Hit>, InferCreationAttributes<Hit>> {
  declare id: CreationOptional<number>;
  declare page: string;
  declare count: CreationOptional<number>;
  declare total: CreationOptional<number>;
}

async function features() {
  Hit.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV7 },
      page: DataTypes.ENUM({ values: ['home', 'about'], name: 'page_type', schema: 'shared' }),
      count: DataTypes.INTEGER,
      total: { type: DataTypes.INTEGER, generatedAs: sequelize.literal('count * 2'), generatedColumn: 'VIRTUAL' },
    },
    { sequelize, strict: true }
  );
  expectTypeOf(await Hit.findByPks([1, 2])).toEqualTypeOf<Hit[]>();
  await Hit.findAll({ lock: true, noWait: true });
  await Hit.bulkCreate([{ page: 'home' }], {
    updateOnDuplicate: ['page', ['count', sequelize.literal('count + 1')]],
    onConflictUpdateWhere: { count: 1 },
  });
  await Hit.upsert({ page: 'home' }, { updateValues: { count: sequelize.literal('count + 1') } });
  await Hit.update({ count: 1 }, { where: {}, include: [{ model: Hit, as: 'other', where: { page: 'home' } }] });
  void new Sequelize('sqlite::memory:', { indexForeignKeys: true });
  Hit.belongsTo(Hit, { as: 'parent', foreignKey: { name: 'parentId', index: { unique: true } } });
}
void features;
