// Type tests of what @xufa/sequelize declares differently from Sequelize 6 (written for it, not ported). The package
// is imported by its path, so its package.json (types, exports) is tested too.
import { expectTypeOf } from 'expect-type';
import {
  BaseError,
  DataTypes,
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
  // The transactions are not begun by the QueryInterface.
  // @ts-expect-error not in @xufa/sequelize
  await qi.startTransaction(await sequelize.transaction());
}
void queryInterface;
