import { expectType, expectError } from 'tsd';
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
expectType<CompiledExpression<number>>(total);
expectType<number>(total({ items: [] }));
expectType<string>(total.source);
expectType<unknown>(evaluate('a + 1', { a: 1 }));
expectType<string>(evaluate<string>('s', { s: 'x' }));
expectType<ExpressionNode>(parse('a + 1'));

const engine = new Engine({
  globals: { tax: (value: number) => value * 1.21 },
  builtins: true,
  filters: { upper: (value: string) => value.toUpperCase() },
  lenient: true,
  strict: false,
  maxLength: 500,
  cacheSize: 10,
});
expectType<boolean>(engine.evaluate<boolean>('a > 1', { a: 2 }));
expectError(new Engine({ lenient: 'yes' }));
expectError(compile(1));

const error = new ExpressionError('bad', { code: 'XUFA_EXPR_ERR_SYNTAX', source: 'a +', position: 2 });
expectType<ExpressionErrorCode>(error.code);
expectType<number | undefined>(error.line);
expectType<Readonly<Record<string, unknown>>>(GLOBALS);
expectType<boolean>(FORBIDDEN.has('constructor'));
expectType<{ line: number; column: number }>(locate('a\nb', 2));
