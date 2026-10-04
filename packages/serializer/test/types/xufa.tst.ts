// Type tests of what @xufa/serializer has that fast-json-stringify has not (not ported: kept by tools/port-types).
import { expect } from 'tstyche';
import build from '../..';

const list = build({ type: 'array', items: { type: 'string' } }, { output: 'bytes' });
expect(list(['a'])).type.toBe<string>();
expect(list.toBuffer).type.toBe<((doc: any) => Buffer) | undefined>();
expect(build).type.not.toBeCallableWith({ type: 'string' }, { output: 'buffer' });
expect(build).type.not.toBeCallableWith({ type: 'string' }, { mode: 'standalone' });
