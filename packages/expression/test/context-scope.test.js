// Programs whose top-level scope is the context (scope: 'context'), and onError for their top-level statements: the
// names a program declares or assigns at its top level are the context's properties, an error of a statement is given
// to onError and the next statement runs.
import { Engine, ExpressionError } from '../index.js';

// Every test twice: on the closures, and on the function of JavaScript made of a program from its first run.
const MODES = [
  ['closures', { inline: false }],
  ['one function', { inlineAfter: 0 }],
];

for (const [mode, options] of MODES) {
  describe(`scope: 'context' (${mode})`, () => {
    const engine = new Engine({ statements: true, scope: 'context', maxSteps: 10_000, ...options });
    const run = (source, context = {}) => engine.evaluate(source, context);

    test('assignments at the top level write the context', () => {
      const context = { price: 10 };
      expect(run('total = price * 2; total + 1', context)).toBe(21);
      expect(context.total).toBe(20);
    });

    test('var, let, const and functions of the top level are the context’s', () => {
      const context = {};
      run('var a = 1; let b = 2; const c = 3; function twice(v) { return v * 2 }', context);
      expect(context).toMatchObject({ a: 1, b: 2, c: 3 });
      expect(context.twice(4)).toBe(8);
    });

    test('compound assignments and ++ read and write the context', () => {
      const context = { score: 1, n: 5 };
      expect(run('score += 2; score = score * 10; n++; score + n', context)).toBe(36);
      expect(context).toMatchObject({ score: 30, n: 6 });
    });

    test('names of blocks and functions stay theirs', () => {
      const context = {};
      expect(run('{ let inner = 1; outer = inner + 1 } const f = (v) => { const w = v + 1; return w }; f(outer)', context)).toBe(3);
      expect(context.outer).toBe(2);
      expect('inner' in context).toBe(false);
      expect('w' in context).toBe(false);
    });

    test('a declaration as the last statement gives undefined', () => {
      const context = {};
      expect(run('var y = 3', context)).toBeUndefined();
      expect(run('x = 1; let z = 2', context)).toBeUndefined();
      expect(context).toMatchObject({ y: 3, x: 1, z: 2 });
    });

    test('this of the top level, and of its arrow functions, is context.this', () => {
      expect(run('this.a + 1', { this: { a: 4 } })).toBe(5);
      expect(run('[1, 2].map((v) => v * this.k)', { this: { k: 3 } })).toEqual([3, 6]);
      expect(run('this', {})).toBeUndefined();
    });

    test('reading names works as without the option', () => {
      expect(run('a + b', { a: 1, b: 2 })).toBe(3);
      expect(run('Math.max(a, 3)', { a: 1 })).toBe(3);
      expect(Number.isNaN(run('missing + 1'))).toBe(true);
    });

    test('the keys no program reaches cannot be written', () => {
      expect(() => run('__proto__ = 1')).toThrow(ExpressionError);
      expect(() => run('constructor = 1')).toThrow(ExpressionError);
    });

    test('a context that is not a plain object is not changed', () => {
      expect(() => run('x = 1', new Map())).toThrow(/only a plain object/);
      const frozenFree = Object.create(null);
      run('x = 1', frozenFree);
      expect(frozenFree.x).toBe(1);
    });

    test('a program that only reads runs on any context', () => {
      expect(run('a * 2', Object.freeze({ a: 4 }))).toBe(8);
    });

    test('without onError, errors throw', () => {
      expect(() => run('a.b.c; 7', { a: {} })).toThrow(ExpressionError);
    });

    test('a program that awaits at its top level is refused', () => {
      const asyncEngine = new Engine({ statements: true, scope: 'context', ...options });
      expect(() => asyncEngine.compile('await x')).toThrow(/cannot await/);
    });
  });

  describe(`onError (${mode})`, () => {
    const seen = [];
    const onError = (error, { source, statement, context }) => {
      seen.push({ message: error.message, source, statement });
      (context.errors ??= []).push(source);
    };
    const engine = new Engine({ statements: true, scope: 'context', onError, maxSteps: 1_000, ...options });
    const run = (source, context = {}) => engine.evaluate(source, context);
    beforeEach(() => {
      seen.length = 0;
    });

    test('a failing statement gives undefined and the next ones run', () => {
      const context = { a: {} };
      expect(run('x = 1; a.b.c; y = 2; x + y', context)).toBe(3);
      expect(context).toMatchObject({ x: 1, y: 2, errors: ['a.b.c'] });
      expect(seen).toEqual([{ message: expect.stringContaining('Cannot read c'), source: 'a.b.c', statement: 1 }]);
    });

    test('the last statement failing makes the value undefined', () => {
      expect(run('x = 1; a.b.c', { a: {} })).toBeUndefined();
    });

    test('a program of one expression goes to onError too', () => {
      expect(run('a.b.c', { a: {} })).toBeUndefined();
      expect(seen[0].source).toBe('a.b.c');
    });

    test('errors of the functions it calls go to onError', () => {
      const fail = () => {
        throw new RangeError('out of range');
      };
      expect(run('fail(); 5', { fail })).toBe(5);
      expect(seen[0].message).toBe('out of range');
    });

    test('limits still end the run', () => {
      expect(() => run('while (true) {}; 1')).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_LIMIT' }));
    });

    test('syntax errors still throw at compile time', () => {
      expect(() => engine.compile('x = ;')).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_SYNTAX' }));
    });
  });
}

describe('lenient for members or calls only', () => {
  for (const [mode, options] of MODES) {
    test(`'calls': a call of what is not a function is undefined, a member of undefined an error (${mode})`, () => {
      const engine = new Engine({ statements: true, lenient: 'calls', ...options });
      expect(engine.evaluate('list.include("a") || list.missing()', { list: ['a'] })).toBeUndefined();
      expect(() => engine.evaluate('a.b.c', { a: {} })).toThrow(ExpressionError);
    });

    test(`'members': a member of undefined is undefined, a call of what is not a function an error (${mode})`, () => {
      const engine = new Engine({ statements: true, lenient: 'members', ...options });
      expect(engine.evaluate('a.b.c', { a: {} })).toBeUndefined();
      expect(() => engine.evaluate('a.b()', { a: { b: 1 } })).toThrow(ExpressionError);
    });
  }

  test('runtime errors say why: notFunction, nullMember', () => {
    const engine = new Engine();
    const reasonOf = (source, context) => {
      try {
        engine.evaluate(source, context);
      } catch (error) {
        return error.reason;
      }
      return null;
    };
    expect(reasonOf('a.b()', { a: { b: 1 } })).toBe('notFunction');
    expect(reasonOf('a.b.c', { a: {} })).toBe('nullMember');
    expect(reasonOf('a +', {})).toBeUndefined();
  });

  test('other values are refused', () => {
    expect(() => new Engine({ lenient: 'all' })).toThrow(TypeError);
  });
});

describe('the options', () => {
  test('scope is program or context, and context is of programs', () => {
    expect(() => new Engine({ statements: true, scope: 'global' })).toThrow(TypeError);
    expect(() => new Engine({ scope: 'context' })).toThrow(/statements: true/);
  });

  test('onError is a function', () => {
    expect(() => new Engine({ statements: true, onError: 'log' })).toThrow(TypeError);
  });

  test('by default the program’s names stay its own', () => {
    const context = {};
    expect(new Engine({ statements: true }).evaluate('x = 2; x * 10', context)).toBe(20);
    expect('x' in context).toBe(false);
  });

  test('onError works with the program’s own scope too', () => {
    const errors = [];
    const engine = new Engine({ statements: true, onError: (error, { source }) => errors.push(source) });
    expect(engine.evaluate('let x = 1; a.b; x + 1', { a: null })).toBe(2);
    expect(errors).toEqual(['a.b']);
  });
});
