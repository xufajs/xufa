// Type tests of what @xufa/serializer has that fast-json-stringify has not (not ported: kept by tools/port-types).
import { expectTypeOf } from '@xufa/test';
import build from '../..';

const list = build({ type: 'array', items: { type: 'string' } }, { output: 'bytes' });
expectTypeOf(list(['a'])).toEqualTypeOf<string>();
expectTypeOf(list.toBuffer).toEqualTypeOf<((doc: any) => Buffer) | undefined>();
// @ts-expect-error
build({ type: 'string' }, { output: 'buffer' });
// @ts-expect-error
build({ type: 'string' }, { mode: 'standalone' });
