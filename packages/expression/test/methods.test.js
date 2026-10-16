// The engine's `methods`: functions by name that values have as methods when they have none of that name
// (`prices.sum()` is methods.sum(prices)), in expressions compiled as closures and as JavaScript, in chains, in
// programs and in async code.
import { Engine } from '../index.js';

const methods = {
  sum: (list, ...more) => list.reduce((a, b) => a + b, 0) + more.reduce((a, b) => a + b, 0),
  getAtPath: (value, path) => path.split('.').reduce((x, key) => x?.[key], value),
  twice: (value) => [value, value],
};

const engines = () => [
  ['closures', new Engine({ methods, inline: false })],
  ['javascript', new Engine({ methods, inlineAfter: 0 })],
];

describe('methods', () => {
  it('are called with the value first when it has no method of that name', () => {
    for (const [kind, engine] of engines()) {
      const context = { prices: [1, 2, 3], doc: { a: { b: 5 } }, word: 'abc' };
      const values = [
        engine.evaluate('prices.sum()', context),
        engine.evaluate('prices.sum(10, 20)', context),
        engine.evaluate("doc.getAtPath('a.b')", context),
        engine.evaluate('word.twice()', context),
        engine.evaluate('(7).twice()', context),
        engine.evaluate('prices.map(x => x * 2).sum()', context),
      ];
      expect({ kind, values }).toEqual({ kind, values: [6, 36, 5, ['abc', 'abc'], [7, 7], 12] });
    }
  });

  it("leave a value's own methods first, and do not look up computed names, optional calls nor null values", () => {
    for (const [kind, engine] of engines()) {
      const context = { own: { sum: () => 'own' }, list: [1], key: 'sum', none: null };
      expect({ kind, own: engine.evaluate('own.sum()', context) }).toEqual({ kind, own: 'own' });
      expect(() => engine.evaluate('list[key]()', context)).toThrow('is not a function');
      expect(() => engine.evaluate("list['sum']()", context)).toThrow('is not a function');
      expect(engine.evaluate('list.sum?.()', context)).toBeUndefined();
      expect(() => engine.evaluate('none.sum()', context)).toThrow('null or undefined');
      expect(() => engine.evaluate('list.other()', context)).toThrow('list.other is not a function');
      // (A member that is there and is no function is not replaced.)
      expect(() => engine.evaluate('item.sum()', { item: { sum: 3 } })).toThrow('item.sum is not a function');
    }
  });

  it('are found in chains, in programs and in async code', async () => {
    for (const inline of [false, true]) {
      const engine = new Engine({ methods, statements: true, inline, inlineAfter: 0 });
      expect(engine.evaluate('const doc = { a: { b: [1, 2] } }; doc?.a.b.sum()', {})).toBe(3);
      expect(engine.evaluate('let t = 0; for (const x of [1, 2]) t += [x, 1].sum(); t', {})).toBe(5);
      expect(await engine.evaluate('const v = await Promise.resolve([4, 6]); v.sum()', {})).toBe(10);
      expect(await engine.evaluate('async function f(x) { return x.sum(); } await f([1, 2])', {})).toBe(3);
    }
  });

  it('take the functions of an object or a module, and leave the rest out', () => {
    const engine = new Engine({ methods: { sum: methods.sum, TAG: '@@tag', _: {} } });
    expect(engine.evaluate('[1, 2].sum()', {})).toBe(3);
    expect(() => engine.evaluate('[1].TAG()', {})).toThrow('is not a function');
    expect(() => new Engine({ methods: [] })).toThrow('methods is an object');
    expect(() => new Engine({ methods: 'sum' })).toThrow('methods is an object');
  });

  it('are undefined calls under lenient calls when none is found', () => {
    const engine = new Engine({ methods, lenient: 'calls' });
    expect(engine.evaluate('[1].nothing()', {})).toBeUndefined();
    expect(engine.evaluate('[1, 2].sum()', {})).toBe(3);
  });
});
