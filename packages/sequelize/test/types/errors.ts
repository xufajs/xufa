// Ported from sequelize (test/types/errors.ts, MIT License) by tools/port-types/port.js: do not edit, change the tool.
import { expectTypeOf } from 'expect-type';
import {
  BaseError,
  EmptyResultError,
  Error as AliasedBaseError,
  UniqueConstraintError,
  OptimisticLockError,
} from 'sequelize';

expectTypeOf<AliasedBaseError>().toEqualTypeOf<BaseError>();
expectTypeOf<UniqueConstraintError>().toHaveProperty('sql').toBeString();
expectTypeOf<EmptyResultError>().toMatchTypeOf<BaseError>();
expectTypeOf<UniqueConstraintError>().toMatchTypeOf<BaseError>();
expectTypeOf<OptimisticLockError>().toMatchTypeOf<BaseError>();
