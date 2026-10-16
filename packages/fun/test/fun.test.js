// The functions of @xufa/fun: currying and placeholders, values of every kind (lists, strings, objects, iterables, one
// item), paths, operators with classes taking part, statistics and composition.
import * as F from '../index.js';

const { _ } = F;

describe('curried functions', () => {
  it('take their arguments at once, a few at a time, or with places held by _', () => {
    expect(F.subtract(5, 1)).toBe(4);
    expect(F.subtract(5)(1)).toBe(4);
    expect(F.subtract(_, 1)(5)).toBe(4);
    expect(F.subtract(_)(5, 1)).toBe(4);
    expect(F.clamp(1, 5, 9)).toBe(5);
    expect(F.clamp(1)(5)(-3)).toBe(1);
    expect(F.clamp(_, 5)(1, 3)).toBe(3);
    const four = F.curry((a, b, c, d) => [a, b, c, d]);
    expect(four(1)(2)(3)(4)).toEqual([1, 2, 3, 4]);
    expect(four(1, _, 3)(2, 4)).toEqual([1, 2, 3, 4]);
    expect(F.curryN(2, (a, b) => a - b)(10)(3)).toBe(7);
    expect(F.isPlaceholder(_)).toBe(true);
    expect([F.inc(4), F.dec(4)]).toEqual([5, 3]);
  });

  it('a curried function of three without its last argument waits for it (reduce without an initial value)', () => {
    expect(typeof F.reduce([1, 2], (a, b) => a + b)).toBe('function');
    expect(F.reduce([1, 2], (a, b) => a + b, 10)).toBe(13);
  });
});

describe('walking values of every kind', () => {
  const collect = (fn, x) => {
    const seen = [];
    fn(x, (value, key) => seen.push([value, key]));
    return seen;
  };

  it('forEach: lists and strings by index, iterables in order, objects by key, one item, none', () => {
    expect(collect(F.forEach, [5, 6])).toEqual([
      [5, 0],
      [6, 1],
    ]);
    expect(collect(F.forEach, 'ab')).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(collect(F.forEach, new Set(['x']))).toEqual([['x', 0]]);
    expect(collect(F.forEach, { a: 1 })).toEqual([[1, 'a']]);
    expect(collect(F.forEach, 7)).toEqual([[7, 0]]);
    expect(collect(F.forEach, null)).toEqual([]);
    expect(collect(F.forEachRight, [5, 6])).toEqual([
      [6, 1],
      [5, 0],
    ]);
    const stopped = [];
    F.forWhile([1, 2, 3], (value) => {
      stopped.push(value);
      return value < 2;
    });
    expect(stopped).toEqual([1, 2]);
  });

  it('map, filter and reduce give arrays; their *Src forms give what the source is', () => {
    expect(F.map({ a: 1, b: 2 }, (n) => n * 10)).toEqual([10, 20]);
    expect(F.mapRight([1, 2], (n) => n)).toEqual([2, 1]);
    expect(F.mapSrc({ a: 1 }, (n) => n + 1)).toEqual({ a: 2 });
    expect(F.mapSrc('ab', (c) => c.toUpperCase())).toBe('AB');
    expect(F.mapSrc(Uint8Array.from([1, 2]), (n) => n * 2)).toEqual(Uint8Array.from([2, 4]));
    expect(F.mapRightSrc('ab', (c) => c)).toBe('ba');
    expect(F.filter([1, 2, 3], (n) => n > 1)).toEqual([2, 3]);
    expect(F.filterSrc({ a: 1, b: 2 }, (n) => n > 1)).toEqual({ b: 2 });
    expect(F.filterSrc('abc', (c) => c !== 'b')).toBe('ac');
    expect(F.filterSrc(5, (n) => n > 9)).toBeUndefined();
    expect(F.reduce({ a: 1, b: 2 }, (acc, n, key) => `${acc}${key}${n}`, '')).toBe('a1b2');
    expect(F.reduceRight([1, 2], (acc, n) => acc.concat(n), [])).toEqual([2, 1]);
  });

  it('every, some and none (nothing: every false, some false, none true)', () => {
    expect([F.every([2, 4], (n) => n % 2 === 0), F.every([2, 3], (n) => n % 2 === 0), F.every(null, () => true)]).toEqual([
      true,
      false,
      false,
    ]);
    expect([F.some([1, 3], (n) => n > 2), F.some(undefined, () => true)]).toEqual([true, false]);
    expect([F.none([1, 3], (n) => n > 5), F.none(null, () => true)]).toEqual([true, true]);
  });

  it('indexes allowed or denied, concat, pairs and zips', () => {
    expect(F.allowIndexes(['a', 'b', 'c'], [0, 2])).toEqual(['a', 'c']);
    expect(F.denyIndexes(['a', 'b', 'c'], [0, 2])).toEqual(['b']);
    expect(F.allowIndexesSrc({ a: 1, b: 2 }, ['a'])).toEqual({ a: 1 });
    expect(F.denyIndexesSrc('abc', [1])).toBe('ac');
    expect(F.concat([1], 'ab', [2], new Set([3]))).toEqual([1, 'a', 'b', 2, 3]);
    expect(F.fromPairs([['a', 1], ['b', 2]])).toEqual({ a: 1, b: 2 });
    expect(F.zip([1, 2, 3], 'ab')).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
    expect(F.zipObj(['a', 'b'], [1, 2, 3])).toEqual({ a: 1, b: 2 });
    expect(F.zipWith([1, 2], [10, 20], (a, b) => a + b)).toEqual([11, 22]);
  });

  it('len, range, kinds of values', () => {
    expect([F.len([1, 2]), F.len({ a: 1 }), F.len('abc'), F.len(new Set([1])), F.len(0), F.len(true), F.len(123)]).toEqual([
      2, 1, 3, 1, 0, 1, 3,
    ]);
    expect([...F.range(3)]).toEqual([0, 1, 2]);
    expect([...F.range(2, 9, 3)]).toEqual([2, 5, 8]);
    expect(F.len(F.range(4))).toBe(4);
    expect(F.isArrayLike({ length: 1, 0: 'a' })).toBe(true);
    expect([F.isObject({}), F.isObject([]), F.isString('a'), F.isFunction(async () => {}), F.isNull(null)]).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
    expect([F.isPromise(Promise.resolve()), F.isIterable(new Map()), F.has({ a: 1 }, 'a'), F.identity(4)]).toEqual([
      true,
      true,
      true,
      4,
    ]);
    expect(F.boolDict(['a', 'b'])).toEqual({ a: true, b: true });
    expect(F.atPath('a.b[0].c')).toEqual(['a', 'b', '[0]', 'c']);
    expect([F.atIndex(3, -1), F.atIndex(3, 5)]).toEqual([2, -1]);
    expect(F.asArrayLike({ a: 1 })).toEqual([1]);
  });
});

describe('paths', () => {
  const doc = { a: { b: [10, 20, { c: 'x' }] } };

  it('getAt and getAtPath read lists, strings, iterables and objects; a missing step is undefined', () => {
    expect(F.getAt([1, 2, 3], -1)).toBe(3);
    expect(F.getAt('abc', 1)).toBe('b');
    expect(F.getAt(new Set(['p', 'q']), 1)).toBe('q');
    expect(() => F.getAt(null, 0)).toThrow('Cannot perform getAt on null');
    expect(F.getAtPath(doc, 'a.b[1]')).toBe(20);
    expect(F.getAtPath(doc, 'a.b[2].c')).toBe('x');
    expect(F.getAtPath(doc, ['a', 'b', '[0]'])).toBe(10);
    expect(F.getAtPath(doc, 'a.x.y')).toBeUndefined();
    expect(F.getAtPath(doc, 'a.b.length')).toBeUndefined();
    expect(F.getAtPath(5, 'a')).toBeUndefined();
  });

  it('setAt and setAtPath copy; setAtPathMut changes the object, making the steps', () => {
    const list = [1, 2, 3];
    expect(F.setAt(list, -1, 9)).toEqual([1, 2, 9]);
    expect(list).toEqual([1, 2, 3]);
    expect(F.setAt('abc', 1, null)).toBe('ac');
    expect(F.setAt({ a: 1, b: 2 }, 'a', undefined)).toEqual({ b: 2 });
    const copy = F.setAtPath(doc, 'a.b[0]', 1);
    expect([copy.a.b[0], doc.a.b[0]]).toEqual([1, 10]);
    const target = {};
    expect(F.setAtPathMut(target, 'x[0].y', 2)).toBe(target);
    expect(target).toEqual({ x: [{ y: 2 }] });
    // (As the code it follows, which was not strict: a number takes no property.)
    expect(F.setAtPathMut(0, 'a', 1)).toBe(0);
  });
});

describe('operators', () => {
  it('add merges objects, adds lists item by item, numbers and strings; the others take numbers', () => {
    expect(F.add(1, 2, 3)).toBe(6);
    expect(F.add('a', 'b')).toBe('ab');
    expect(F.add('1', 2)).toBe(3);
    expect(F.add([1, 2], [10, 20])).toEqual([11, 22]);
    expect(F.add({ a: { b: 1 } }, { a: { c: 2 } })).toEqual({ a: { b: 1, c: 2 } });
    expect([F.subtract(10, 1, 2), F.mult('2', 3), F.div(9, 3), F.mod(7, 3), F.pow(2, 10)]).toEqual([7, 6, 3, 1, 1024]);
    expect([F.negate(3), F.not(0), F.and(1, 'a', true), F.and(1, 0), F.or(0, '', 'x'), F.or(0, false)]).toEqual([
      -3,
      true,
      true,
      false,
      true,
      false,
    ]);
    expect([F.gt(2, 1), F.gte(1, 1), F.lt(1, 2), F.lte(3, 2)]).toEqual([true, true, true, false]);
  });

  it('classes take part with static methods named by the tags', () => {
    class Money {
      constructor(n) {
        this.n = n;
      }

      static [F.ADD_TAG](a, b) {
        return new Money(a.n + (b.n ?? b));
      }

      static [F.NEGATE_TAG](a) {
        return new Money(-a.n);
      }

      static [F.MULT_TAG](a, b) {
        return new Money((a.n ?? a) * (b.n ?? b));
      }

      static [F.APPROVE_TAG](a) {
        return `approved ${a.n}`;
      }
    }
    expect(F.add(new Money(2), 3)).toEqual(new Money(5));
    // (Without a subtract of its own: its negation added.)
    expect(F.subtract(new Money(5), new Money(2))).toEqual(new Money(3));
    expect(F.mult(2, new Money(4))).toEqual(new Money(8));
    expect(F.negate(new Money(1))).toEqual(new Money(-1));
    expect(F.approve(new Money(1))).toBe('approved 1');
    expect(F.approve({ a: [1] })).toEqual({ a: [1] });
  });

  it('andFn and orFn of functions (or values), for the same arguments', () => {
    const between = F.andFn((x) => x > 1, (x) => x < 5);
    expect([between(3), between(7)]).toEqual([true, false]);
    expect(F.orFn(false, (x) => x === 0)(0)).toBe(true);
  });
});

describe('numbers and composition', () => {
  it('sum, mean, median, max and min', () => {
    expect([F.sum([1, 2, 3]), F.sum(1, 2), F.sum({ a: '4', b: 1 })]).toEqual([6, 3, 5]);
    expect([F.mean([2, 4]), F.mean(1, 2, 3), Number.isNaN(F.mean([]))]).toEqual([3, 2, true]);
    expect([F.median([3, 1, 2]), F.median([4, 1, 2, 3])]).toEqual([2, 2.5]);
    expect([F.max(1, 9, '3'), F.min(4, '2')]).toEqual([9, 2]);
    expect(() => F.clamp(5, 1, 3)).toThrow();
  });

  it('pipe, always and merge (a copy of the first)', () => {
    expect(F.pipe((a, b) => a + b, (x) => x * 10)(1, 2)).toBe(30);
    expect(F.pipe()(7)).toBe(7);
    expect(F.always(3)()).toBe(3);
    const first = { a: { b: 1 } };
    expect(F.merge(first, { a: { c: 2 } }, { d: 3 })).toEqual({ a: { b: 1, c: 2 }, d: 3 });
    expect(first).toEqual({ a: { b: 1 } });
  });
});
