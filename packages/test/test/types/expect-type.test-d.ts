// The checks of expectTypeOf: each passes where it should, and fails where it should (// @ts-expect-error: tsc
// reports that line when it is no error).
import { expectTypeOf, assertType, describe, test, expect, vi, type Mock } from '@xufa/test';

test('toEqualTypeOf: exactly the same type', () => {
  expectTypeOf('a').toEqualTypeOf<string>();
  expectTypeOf({ a: 1 }).toEqualTypeOf<{ a: number }>();
  expectTypeOf<string | number>().toEqualTypeOf<number | string>();
  expectTypeOf(1).toEqualTypeOf(2);
  // @ts-expect-error a narrower type is not the same
  expectTypeOf<string>().toEqualTypeOf<'a'>();
  // @ts-expect-error a wider type is not the same
  expectTypeOf<'a'>().toEqualTypeOf<string>();
  // @ts-expect-error any is only any
  expectTypeOf<any>().toEqualTypeOf<string>();
  // @ts-expect-error neither is never
  expectTypeOf<never>().toEqualTypeOf<string>();
  // @ts-expect-error given as a value
  expectTypeOf(1).toEqualTypeOf('a');
  expectTypeOf<string>().not.toEqualTypeOf<'a'>();
  // @ts-expect-error not: the same type fails
  expectTypeOf<string>().not.toEqualTypeOf<string>();
});

test('toMatchTypeOf: assignable', () => {
  expectTypeOf<'a'>().toMatchTypeOf<string>();
  expectTypeOf({ a: 1, b: 2 }).toMatchTypeOf<{ a: number }>();
  expectTypeOf<never>().toMatchTypeOf<never>();
  // @ts-expect-error a string is not every 'a'
  expectTypeOf<string>().toMatchTypeOf<'a'>();
  // @ts-expect-error never is only assignable to never, for this check
  expectTypeOf<never>().toMatchTypeOf<string>();
  expectTypeOf<string>().not.toMatchTypeOf<number>();
  // @ts-expect-error not: assignable fails
  expectTypeOf<'a'>().not.toMatchTypeOf<string>();
});

test('the kinds of types, properties, functions', () => {
  expectTypeOf<any>().toBeAny();
  expectTypeOf<unknown>().toBeUnknown();
  expectTypeOf<never>().toBeNever();
  // @ts-expect-error unknown is not any
  expectTypeOf<unknown>().toBeAny();
  // @ts-expect-error any is not unknown
  expectTypeOf<any>().toBeUnknown();
  expectTypeOf('x').toBeString();
  expectTypeOf<string | null>().toBeNullable();
  // @ts-expect-error a string is not nullable
  expectTypeOf<string>().toBeNullable();
  expectTypeOf({ a: 1 }).toHaveProperty('a').toEqualTypeOf<number>();
  // @ts-expect-error no such property
  expectTypeOf({ a: 1 }).toHaveProperty('b');
  expectTypeOf({ a: 1 }).not.toHaveProperty('b');
  const add = (a: number, b: number) => `${a + b}`;
  expectTypeOf(add).toBeFunction();
  expectTypeOf(add).toBeCallableWith(1, 2);
  // @ts-expect-error wrong arguments
  expectTypeOf(add).toBeCallableWith('1', 2);
  expectTypeOf(add).parameters.toEqualTypeOf<[a: number, b: number]>();
  expectTypeOf(add).parameter(0).toEqualTypeOf<number>();
  expectTypeOf(add).returns.toEqualTypeOf<string>();
  expectTypeOf(Promise.resolve(1)).resolves.toEqualTypeOf<number>();
  expectTypeOf([1, 2]).items.toEqualTypeOf<number>();
  expectTypeOf(Date).instance.toEqualTypeOf<Date>();
  expectTypeOf<'a' | 1>().exclude<string>().toEqualTypeOf<1>();
  assertType<string>('a');
  // @ts-expect-error not a string
  assertType<string>(1);
});

describe('the API of tests', () => {
  test.each([
    [1, 'a'],
    [2, 'b'],
  ])('rows of arrays spread', (n, s) => {
    expectTypeOf(n).toEqualTypeOf<number>();
    expectTypeOf(s).toEqualTypeOf<string>();
  });
  test.each([{ a: 1 }, { a: 2 }])('rows of objects', (row) => {
    expectTypeOf(row.a).toEqualTypeOf<number>();
  });
  const withDb = test.extend<{ db: { query(sql: string): number } }>({
    db: async ({}, use) => {
      await use({ query: () => 1 });
    },
  });
  withDb('fixtures in the context', ({ db, task }) => {
    expectTypeOf(db.query('x')).toEqualTypeOf<number>();
    expectTypeOf(task.name).toEqualTypeOf<string>();
  });
  test('expect and vi', async () => {
    expect(1).toBe(1);
    await expect(Promise.resolve(1)).resolves.toBe(1);
    expect({ a: 1 }).toEqual(expect.objectContaining({ a: expect.any(Number) }));
    const fn = vi.fn((x: number) => x * 2);
    expectTypeOf(fn).toMatchTypeOf<Mock<(x: number) => number>>();
    expectTypeOf(fn(1)).toEqualTypeOf<number>();
    fn.mockReturnValue(3);
    // @ts-expect-error the implementation returns numbers
    fn.mockReturnValue('3');
    const spy = vi.spyOn(Math, 'max');
    expectTypeOf(spy.mock.calls).toEqualTypeOf<number[][]>();
  });
  test('the done callback of Jest', (done) => {
    setTimeout(done, 1);
  });
});

test('toEqualTypeOf: the same type, however written', () => {
  interface Point {
    x: number;
    y: number;
  }
  expectTypeOf<Point>().toEqualTypeOf<{ x: number; y: number }>();
  expectTypeOf<{ x: number } & { y: number }>().toEqualTypeOf<{ x: number; y: number }>();
  expectTypeOf<[options: Point]>().toEqualTypeOf<[options: { x: number; y: number }]>();
  // @ts-expect-error an optional member is not a required one
  expectTypeOf<{ x?: number }>().toEqualTypeOf<{ x: number | undefined }>();
  // @ts-expect-error a readonly member is not a writable one
  expectTypeOf<{ readonly x: number }>().toEqualTypeOf<{ x: number }>();
  // @ts-expect-error a member more
  expectTypeOf<Point>().toEqualTypeOf<{ x: number }>();
  // @ts-expect-error any inside is not number
  expectTypeOf<{ x: any }>().toEqualTypeOf<{ x: number }>();
  // @ts-expect-error a readonly array is not an array
  expectTypeOf<readonly number[]>().toEqualTypeOf<number[]>();
  // @ts-expect-error functions of other parameters
  expectTypeOf<(a: string) => void>().toEqualTypeOf<(a: number) => void>();
});
