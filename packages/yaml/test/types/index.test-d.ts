import { expectTypeOf } from '@xufa/test';
import { load, loadAll, dump, Schema, Type, YAMLException, JSON_SCHEMA, DEFAULT_SCHEMA, types } from '../..';

expectTypeOf(load('a: 1')).toEqualTypeOf<unknown>();
expectTypeOf(load('a: 1', { schema: JSON_SCHEMA, filename: 'a.yml', json: true })).toEqualTypeOf<unknown>();
expectTypeOf(loadAll('--- 1\n--- 2')).toEqualTypeOf<unknown[]>();
expectTypeOf(loadAll('--- 1', (doc) => expectTypeOf(doc).toEqualTypeOf<unknown>())).toEqualTypeOf<void>();
expectTypeOf(dump({ a: 1 }, { indent: 4, noRefs: true, sortKeys: true, lineWidth: -1 })).toEqualTypeOf<string>();
// @ts-expect-error
dump({ a: 1 }, { indent: '4' });

const Point = new Type('!point', { kind: 'sequence', construct: (data: number[]) => ({ x: data[0], y: data[1] }) });
expectTypeOf(DEFAULT_SCHEMA.extend([Point])).toEqualTypeOf<Schema>();
try {
  load(': bad');
} catch (err) {
  if (err instanceof YAMLException) expectTypeOf(err.mark.line).toEqualTypeOf<number>();
}
expectTypeOf(types.timestamp).toEqualTypeOf<Type>();
