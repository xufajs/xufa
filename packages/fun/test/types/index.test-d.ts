import { _, add, clamp, getAtPath, map, pipe, range, reduce, setAtPathMut, subtract, sum, zipObj, type Curried2 } from '@xufa/fun';
import { expectTypeOf } from '@xufa/test';

expectTypeOf(sum([1, 2])).toEqualTypeOf<number>();
expectTypeOf(subtract(_, 1)).toBeFunction();
expectTypeOf(subtract(5, 1)).toBeAny();
expectTypeOf(clamp(1, 5, 7)).toEqualTypeOf<number>();
expectTypeOf(clamp(1)(5, 7)).toEqualTypeOf<number>();
expectTypeOf(getAtPath({ a: 1 }, 'a')).toBeAny();
expectTypeOf(map([1, 2], (n) => n)).toEqualTypeOf<any[]>();
expectTypeOf(reduce([1], (a, b) => a + b, 0)).toBeAny();
expectTypeOf(zipObj(['a'], [1])).toEqualTypeOf<Record<string, any>>();
expectTypeOf(range(3)).toEqualTypeOf<Iterable<number>>();
expectTypeOf(pipe((a: number) => a + 1)).toBeFunction();
expectTypeOf(setAtPathMut({}, 'a.b', 1)).toBeAny();
expectTypeOf(add).toMatchTypeOf<Curried2<any, any, any>>();
// @ts-expect-error
range('3');
