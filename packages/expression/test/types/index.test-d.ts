import { assertType, expectTypeOf } from '@xufa/test';
import {
  compile,
  evaluate,
  parse,
  Engine,
  ExpressionError,
  CompiledExpression,
  ExpressionNode,
  GLOBALS,
  FORBIDDEN,
  locate,
  ExpressionErrorCode,
} from '../..';

const total = compile<number>('items.reduce((sum, i) => sum + i.price, 0)');
expectTypeOf(total).toEqualTypeOf<CompiledExpression<number>>();
expectTypeOf(total({ items: [] })).toEqualTypeOf<number>();
expectTypeOf(total.source).toEqualTypeOf<string>();
expectTypeOf(evaluate('a + 1', { a: 1 })).toEqualTypeOf<unknown>();
expectTypeOf(evaluate<string>('s', { s: 'x' })).toEqualTypeOf<string>();
expectTypeOf(parse('a + 1')).toEqualTypeOf<ExpressionNode>();

const engine = new Engine({
  globals: { tax: (value: number) => value * 1.21 },
  builtins: true,
  filters: { upper: (value: string) => value.toUpperCase() },
  lenient: true,
  strict: false,
  tdz: true,
  maxLength: 500,
  cacheSize: 10,
});
expectTypeOf(engine.evaluate<boolean>('a > 1', { a: 2 })).toEqualTypeOf<boolean>();
// @ts-expect-error
new Engine({ lenient: 'yes' });
// @ts-expect-error
compile(1);

const error = new ExpressionError('bad', { code: 'XUFA_EXPR_ERR_SYNTAX', source: 'a +', position: 2 });
expectTypeOf(error.code).toEqualTypeOf<ExpressionErrorCode>();
expectTypeOf(error.line).toEqualTypeOf<number | undefined>();
expectTypeOf(GLOBALS).toEqualTypeOf<Readonly<Record<string, unknown>>>();
expectTypeOf(FORBIDDEN.has('constructor')).toEqualTypeOf<boolean>();
expectTypeOf(locate('a\nb', 2)).toEqualTypeOf<{ line: number; column: number }>();

// Programs.
const programs = new Engine({ statements: true, maxSteps: 1000, maxDepth: 50, constructors: { URL } });
expectTypeOf(programs.evaluate<number>('let a = 1; a += 1; a')).toEqualTypeOf<number>();
expectTypeOf(programs.compileTree<number>({ type: 'Literal', value: 1 })()).toEqualTypeOf<number>();
assertType<ExpressionErrorCode>('XUFA_EXPR_ERR_LIMIT');
