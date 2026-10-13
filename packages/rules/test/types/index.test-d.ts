import { assertType, expectTypeOf } from '@xufa/test';
import {
  RuleBook,
  readXlsx,
  writeXlsx,
  RulesError,
  normalize,
  toValue,
  Fun,
  type TableJson,
  type TraceNode,
  type CellRef,
} from '../../index.js';

const book = RuleBook.fromXlsx(new Uint8Array(), {
  dialect: 'auto',
  tdz: true,
  onError: (err, info) => void [err.message, info.table],
});
expectTypeOf(RuleBook.fromSheets([{ name: 'S', rows: [['Rules A(String x)', null]] }])).toEqualTypeOf<RuleBook>();
expectTypeOf(book.table('A')?.dialect).toEqualTypeOf<'openl' | 'js' | undefined>();
expectTypeOf(RuleBook.fromJSON([{ className: 'RulesTable', name: 'A' }])).toEqualTypeOf<RuleBook>();
expectTypeOf(book.call<number>('Premium', 'basic', 30)).toEqualTypeOf<number>();
expectTypeOf(book.fn<string>('Region')).toEqualTypeOf<(...args: unknown[]) => string>();
expectTypeOf(book.test({ checks: { Codes: async (values) => values.map(String) } })).toEqualTypeOf<Promise<string[]>>();
expectTypeOf(book.toXlsx()).toEqualTypeOf<Buffer>();
expectTypeOf(book.toJSON()).toEqualTypeOf<Array<TableJson | (string | number | boolean | Date | null)[][]>>();
expectTypeOf(book.names).toEqualTypeOf<string[]>();
expectTypeOf(writeXlsx({ sheets: [{ name: 'A', rows: [[{ value: 'Title', style: 'title' }, 1, new Date()]], widths: [20] }] })).toEqualTypeOf<Buffer>();
expectTypeOf(readXlsx(new Uint8Array()).sheets[0].name).toEqualTypeOf<string>();
expectTypeOf(normalize('é')).toEqualTypeOf<string>();
expectTypeOf(toValue('Integer', '1')).toEqualTypeOf<unknown>();
expectTypeOf(Fun.mean([1, 2])).toEqualTypeOf<any>();
// @ts-expect-error
writeXlsx({ sheets: [{ name: 'A', rows: [[{ value: 'x', style: 'bold' }]] }] });
// @ts-expect-error
RuleBook.fromXlsx(new Uint8Array(), { trusted: true });
const error = new RulesError('x');
expectTypeOf(error.code).toEqualTypeOf<RulesError['code']>();

// OpenL Tablets: runtime contexts of versions, traces, gaps and overlaps, the rows of tests.
{
  const book = RuleBook.fromSheets([
    { name: 'S', rows: [['SimpleRules Double Rate(String plan)'], ['Plan', 'Rate'], ['basic', 1]] },
  ]);
  expectTypeOf(book.withContext({ usState: 'NY', currentDate: '2026-06-01' }).call<number>('Rate', 'basic')).toEqualTypeOf<number>();
  const trace = book.trace('Rate', ['basic'], { lob: 'auto' });
  expectTypeOf(trace).toEqualTypeOf<TraceNode | undefined>();
  if (trace) expectTypeOf(trace.children[0].cells).toEqualTypeOf<CellRef[]>();
  const [report] = book.analyze('Rate');
  expectTypeOf(report.axes[0].dimensions).toEqualTypeOf<string[]>();
  expectTypeOf(report.axes[0].shadowed).toEqualTypeOf<number[]>();
  expectTypeOf(book.testResults()[0].rows[0].passed).toEqualTypeOf<boolean>();
  const written = book.testCase('Rate', ['basic'], { context: { usState: 'NY' } });
  expectTypeOf(written.names).toEqualTypeOf<string[]>();
  expectTypeOf(written.error).toEqualTypeOf<string | null>();
  expectTypeOf(book.lint()[0].message).toEqualTypeOf<string>();
  expectTypeOf(book.coverage().tables[0].tested).toEqualTypeOf<boolean>();
}

// The language of the formulas.
expectTypeOf(RuleBook.fromSheets([], { dialect: 'openl' }).dialect).toEqualTypeOf<'openl' | 'js'>();

// (A store's options: tdz of every book.)
assertType<import('../../index.js').RuleStoreOptions>({ tdz: true, checkImporters: true });
// @ts-expect-error
assertType<import('../../index.js').RuleStoreOptions>({ tdz: 'yes' });
