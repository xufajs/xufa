import { expectType, expectError } from 'tsd';
import { load, loadAll, dump, Schema, Type, YAMLException, JSON_SCHEMA, DEFAULT_SCHEMA, types } from '../..';

expectType<unknown>(load('a: 1'));
expectType<unknown>(load('a: 1', { schema: JSON_SCHEMA, filename: 'a.yml', json: true }));
expectType<unknown[]>(loadAll('--- 1\n--- 2'));
expectType<void>(loadAll('--- 1', (doc) => expectType<unknown>(doc)));
expectType<string>(dump({ a: 1 }, { indent: 4, noRefs: true, sortKeys: true, lineWidth: -1 }));
expectError(dump({ a: 1 }, { indent: '4' }));

const Point = new Type('!point', { kind: 'sequence', construct: (data: number[]) => ({ x: data[0], y: data[1] }) });
expectType<Schema>(DEFAULT_SCHEMA.extend([Point]));
try {
  load(': bad');
} catch (err) {
  if (err instanceof YAMLException) expectType<number>(err.mark.line);
}
expectType<Type>(types.timestamp);
