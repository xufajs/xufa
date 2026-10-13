// Programs (engines with statements: true): statements, variables, loops, functions, with the checks of expressions,
// changes only of plain objects and arrays the globals do not reach, and a limit of steps no catch can stop.
import { Engine, ExpressionError, evaluate } from '../index.js';

// Every test twice: on the closures, and on the function of JavaScript made of a program from its first run.
const MODES = [
  ['closures', { inline: false }],
  ['one function', { inlineAfter: 0 }],
];

for (const [mode, options] of MODES) {
  const engine = new Engine({ statements: true, maxSteps: 10_000, ...options });
  const run = (source, context = {}) => engine.evaluate(source, context);
  const fails = (source, context, code) => {
    try {
      run(source, context);
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect(err.code).toBe(code);
      return err;
    }
    throw new Error(`${source} did not fail`);
  };

  describe(`programs (${mode})`, () => {
    test('the value of a return, else of the last expression statement run', () => {
      expect(run('let a = 2; return a * 3; 99')).toBe(6);
      expect(run('let a = 2\na * 4')).toBe(8);
      expect(run('if (x > 1) { "big" } else { "small" }', { x: 3 })).toBe('big');
      expect(run('let a = 1')).toBeUndefined();
      expect(run('')).toBeUndefined();
      expect(run('return')).toBeUndefined();
    });

    test('a program of one expression is that expression (and becomes one function of JavaScript)', () => {
      const fn = new Engine({ statements: true, inlineAfter: 0 }).compile('items.map((i) => i.price * 2)');
      expect(fn({ items: [{ price: 1 }, { price: 2 }] })).toEqual([2, 4]);
      expect(run('return price * 1.2', { price: 10 })).toBe(12);
    });

    test('variables: let and const in blocks, var in functions, names assigned without declaring them', () => {
      expect(run('let a = 1; { let a = 2; } a')).toBe(1);
      expect(run('if (true) { var v = 5 } v')).toBe(5);
      const context = { x: 5 };
      expect(run('x = x + 1\nx * 2', context)).toBe(12);
      expect(context.x).toBe(5); // (the context is not changed)
      expect(run('total = (total ?? 0) + 1; total')).toBe(1);
      expect(fails('const a = 1; a = 2', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(/a is a constant/);
    });

    test('assignments and updates of every operator', () => {
      expect(run('let a = 10; a += 5; a -= 3; a *= 2; a /= 4; a %= 4; a **= 3; a')).toBe(8);
      expect(run('let b = 6; b <<= 2; b >>= 1; b >>>= 1; b &= 7; b |= 8; b ^= 1; b')).toBe(15);
      expect(run('let a = null; a ??= 3; a ||= 4; a &&= 5; a')).toBe(5);
      expect(run('let i = 0; const r = [i++, ++i, i--, --i]; r')).toEqual([0, 2, 2, 0]);
      expect(run('let n = 10n; n++; n')).toBe(11n);
      expect(run('o.a = 1; o["b"] = 2; o.c ??= 3; o.a += 1; o.n = 0; o.n++; delete o.b; o', { o: {} })).toEqual({
        a: 2,
        c: 3,
        n: 1,
      });
      expect(run('list[1] = 9; list.length = 2; list', { list: [1, 2, 3] })).toEqual([1, 9]);
    });

    test('if, for, for...of, while, do...while, break, continue, switch', () => {
      expect(
        run('let t = 0; for (let i = 1; i <= 5; i++) { if (i === 2) continue; if (i === 5) break; t += i } t')
      ).toBe(8);
      expect(run('let t = 0; for (const x of xs) t += x; t', { xs: [1, 2, 3] })).toBe(6);
      expect(run('let k; for (k of ["a", "b"]) {} k')).toBe('b');
      expect(run('let i = 0; while (i < 4) i += 1; i')).toBe(4);
      expect(run('let s = 0; let i = 0; do { s += i } while (++i < 5); s')).toBe(10);
      const kind = 'switch (k) { case 1: r = "one"; break; case 2: case 3: r = "few"; break; default: r = "many" } r';
      expect([1, 2, 3, 9].map((k) => run(kind, { k }))).toEqual(['one', 'few', 'few', 'many']);
    });

    test('functions: declarations (hoisted, recursive), expressions and arrow functions of statements; closures', () => {
      expect(run('return fact(5); function fact(n) { return n <= 1 ? 1 : n * fact(n - 1) }')).toBe(120);
      expect(run('const sq = (v) => { const r = v * v; return r }; [1, 2, 3].map(sq)')).toEqual([1, 4, 9]);
      expect(run('const add = function (a, b) { return a + b }; add(2, 3)')).toBe(5);
      expect(run('const fs = []; for (let i = 0; i < 3; i++) fs.push(() => i); fs.map((f) => f())')).toEqual([0, 1, 2]);
      expect(run('const fs = []; for (const v of [1, 2, 3]) fs.push(() => v); fs.map((f) => f())')).toEqual([1, 2, 3]);
      // (Loops that make no functions share one scope for their turns: the same values.)
      expect(
        run('const out = []; for (const v of [1, 2]) { for (let i = 0; i < 2; i++) out.push(v * 10 + i) } out')
      ).toEqual([10, 11, 20, 21]);
      expect(run('let n = 0; const inc = () => { n += 1 }; inc(); inc(); n')).toBe(2);
      expect(run('items.forEach((i) => { i.total = i.price * 2 }); items', { items: [{ price: 2 }] })).toEqual([
        { price: 2, total: 4 },
      ]);
    });

    test('throw, try, catch and finally; new of the constructors of the engine', () => {
      expect(run('try { throw new Error("boom") } catch (e) { e.message }')).toBe('boom');
      expect(run('let log = []; try { log.push(1) } finally { log.push(2) } log')).toEqual([1, 2]);
      expect(run('try { missing() } catch { "caught" }')).toBe('caught');
      expect(run('new Date(0).getTime() + new Map([["a", 1]]).get("a") + new Set([1, 1]).size')).toBe(2);
      expect(() => run('throw "no"')).toThrow('no');
      expect(fails('new Function("return 1")', {}, 'XUFA_EXPR_ERR_FORBIDDEN').message).toMatch(/new Function/);
    });

    test('the order and the scopes of the closures: in both ways of running a program alike', () => {
      // (A member of what cannot change: the error before the value is computed.)
      const calls = [];
      expect(() => run('d[k()] = v()', { d: new Date(), k: () => calls.push('k'), v: () => calls.push('v') })).toThrow(
        /cannot be changed/
      );
      expect(calls).toEqual([]);
      expect(run('let o = {}; let i = 0; o[i++] = i; o')).toEqual({ 0: 1 });
      // (Functions made before the statements of their block; a name read before its declaration is undefined.)
      expect(run('const r = twice(2); function twice(n) { return n * 2 } r')).toBe(4);
      expect(run('const before = later; let later = 1; [before, later]')).toEqual([undefined, 1]);
      expect(run('let x = 1; function f(x) { let y = x + 1; { let x = 10; y += x } return y } [f(5), x]')).toEqual([
        16, 1,
      ]);
      // (switch: a binding of its cases; continue in it goes on with the loop; finally has the last word.)
      expect(
        run(
          'let out = []; for (let i = 0; i < 4; i++) { switch (i % 2) { case 0: let h = i * 10; out.push(h); continue; default: out.push(-i) } } out'
        )
      ).toEqual([0, -1, 20, -3]);
      expect(run('function f() { try { return 1 } finally { return 2 } } f()')).toBe(2);
      expect(run('let n = 0; while (true) { try { n++; if (n > 2) break } finally { n += 10 } } n')).toBe(22);
      expect(run('let s = 0, i = 0; do { i++; if (i === 2) continue; s += i } while (i < 4); s')).toBe(8);
      // (The value of a program: its last expression statement run, in loops and branches too.)
      expect(run('for (const x of [1, 2, 3]) { x * 10 }')).toBe(30);
      // (A function of a program called after it ran: its steps counted still.)
      const escaped = new Engine({ statements: true, maxSteps: 100, ...options }).evaluate(
        'const spin = (n) => { while (n-- > 0) {} return 1 }; spin'
      );
      expect(escaped(10)).toBe(1);
      expect(() => escaped(1000)).toThrow(/more than 100 steps/);
      // (Calls nested deeper than maxDepth.)
      const deep = new Engine({ statements: true, maxDepth: 5, ...options });
      expect(() => deep.evaluate('function f(n) { return n ? f(n - 1) : 0 } f(10)')).toThrow(/nested deeper than 5/);
      expect(deep.evaluate('function f(n) { return n ? f(n - 1) : 0 } f(3)')).toBe(0);
      // (Run as one function of JavaScript when inlined.)
      if (options.inlineAfter === 0) expect(engine.compile('let a = 1; a').name).toBe('program');
    });

    test('comments, and statements ended by lines', () => {
      expect(run('// a comment\nlet a = 1 /* another */\nlet b = 2\nreturn a + b')).toBe(3);
      expect(run('let a = 1\nreturn\na')).toBeUndefined();
      expect(fails('let a = 1 let b = 2', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(/Expected ;/);
    });
  });

  describe(`more of JavaScript (${mode})`, () => {
    const person = { name: 'Ada', age: 36, address: { city: 'London' }, tags: ['x', 'y'] };

    // (Both found by the fuzz: test/fuzz.test.js.)
    test('the arguments of a call are evaluated before what is called is checked, as in JavaScript', () => {
      const source =
        'let n = 0; const o = {}; for (const f of [() => o.nope(n++), () => (0, null)(n++), ' +
        '() => o?.nope(n++), () => o.a?.b.c(n++)]) { try { f(); } catch (e) {} } return n';
      expect(run(source)).toBe(3);
      // (Unknown names are undefined, unless strict: their calls evaluate the arguments too.)
      const lenient = new Engine({ statements: true, lenient: true, ...options });
      expect(lenient.evaluate('let n = 0; ({}).nope(n++); missing(n++); return n', {})).toBe(2);
    });

    test('a let or const used before its declaration runs: undefined, and with tdz an error, as in JavaScript', () => {
      const tdz = new Engine({ statements: true, tdz: true, ...options });
      const unset = (source, name) => {
        try {
          tdz.evaluate(source, {});
        } catch (err) {
          expect(err).toBeInstanceOf(ExpressionError);
          expect(err.code).toBe('XUFA_EXPR_ERR_RUNTIME');
          expect(err.message).toMatch(new RegExp(`^${name} is used before its declaration \\(line 1, column \\d+\\)$`));
          return;
        }
        throw new Error(`${source} did not fail`);
      };
      const early = [
        ['x; let x = 1', 'x'],
        ['const f = () => y; f(); const y = 2', 'y'],
        ['x = 5; let x = 1', 'x'],
        ['x += 5; let x = 1', 'x'],
        ['x++; let x = 1', 'x'],
        ['typeof x; let x = 1', 'x'],
        ['new A(); class A {}', 'A'],
        ['class A { static m() { return B; } } A.m(); class B {}', 'B'],
        ['switch (2) { case 1: let z = 1; break; case 2: z = 3; }', 'z'],
        ['for (let i = i; ;) break', 'i'],
        ['for (let i = j, j = 1; ;) break', 'j'],
        ['for (q of [1]) {} let q', 'q'],
        ['function g() { return m; } g(); let m = 1', 'm'],
        ['let [p = q, q = 1] = []', 'q'],
      ];
      for (const [source, name] of early) {
        unset(source, name);
        // (Without tdz: undefined, and on; new of it is not a class.)
        expect(() => run(source)).not.toThrow(/used before/);
      }
      expect(run('for (let i = i; ;) return [i]')).toEqual([undefined]);
      // Used after their declarations: as always; var, functions and parameters are not checked.
      expect(tdz.evaluate('const f = () => y; const y = 2; return f()', {})).toBe(2);
      expect(tdz.evaluate('var w = w; return [w, g()]; function g() { return 1; }', {})).toEqual([undefined, 1]);
      expect(tdz.evaluate('let s = 0; for (let i = 0, j = i + 1; i < 3; i++) { let t = i * j; s += t; } return s', {})).toBe(
        3
      );
      expect(tdz.evaluate('const { a, b = a } = { a: 1 }; class C {} return [a, b, new C() instanceof C]', {})).toEqual([
        1,
        1,
        true,
      ]);
      // A catch takes it: an error of the program.
      expect(tdz.evaluate('try { k; } catch (e) { return e.message; } let k', {})).toMatch(/^k is used before/);
    });

    test('a chain skips the keys and the arguments after a null or undefined', () => {
      const source = 'let n = 0; const a = null; a?.[n++]; a?.f(n++); a?.[n++](n++); a?.b[n++]; ({}).f?.(n++); return n';
      expect(run(source)).toBe(0);
      expect(run('let n = 0; const a = { b: [1] }; return [a?.b[n++], a?.[n++], n]')).toEqual([1, undefined, 2]);
      expect(run('const a = null; return a?.[[].reduce((x) => x)]')).toBeUndefined();
    });

    test('destructuring of declarations: names, defaults, nested, computed keys, rest, holes, iterables', () => {
      expect(run('const { name, age: years, missing = 7 } = p; [name, years, missing]', { p: person })).toEqual([
        'Ada',
        36,
        7,
      ]);
      expect(
        run('const { address: { city }, tags: [first, ...more] } = p; [city, first, more]', { p: person })
      ).toEqual(['London', 'x', ['y']]);
      expect(
        run('const k = "age"; const { [k]: value, ...rest } = p; [value, Object.keys(rest)]', { p: person })
      ).toEqual([36, ['name', 'address', 'tags']]);
      expect(run('const [a, , c = 3, ...d] = [1, 2, undefined, 4, 5]; [a, c, d]')).toEqual([1, 3, [4, 5]]);
      expect(run('const [x, y] = "hi"; const [[k, v]] = new Map([["a", 1]]); [x, y, k, v]')).toEqual([
        'h',
        'i',
        'a',
        1,
      ]);
      expect(run('let { a = 1 } = {}, [b = 2] = []; a + b')).toBe(3);
      // (Errors as JavaScript gives them, on the source destructured.)
      expect(fails('const { a } = nothing', {}, 'XUFA_EXPR_ERR_RUNTIME').message).toMatch(
        /Cannot destructure nothing, which is null or undefined/
      );
      expect(fails('const [a] = 5', {}, 'XUFA_EXPR_ERR_RUNTIME').message).toMatch(/5 is not iterable/);
    });

    test('destructuring of assignments, of parameters, of for...of and of catch', () => {
      expect(run('let a = 1, b = 2; [a, b] = [b, a]; [a, b]')).toEqual([2, 1]);
      expect(run('const o = {}; ({ x: o.x, y: o.y = 5 } = { x: 1 }); o')).toEqual({ x: 1, y: 5 });
      expect(run('let a; const r = ([a] = [9, 8]); [a, r]')).toEqual([9, [9, 8]]);
      expect(
        run('function f({ a, b = 2 }, [c] = [3], ...rest) { return [a, b, c, rest] } f({ a: 1 }, undefined, 4, 5)')
      ).toEqual([1, 2, 3, [4, 5]]);
      expect(run('const f = (a, b = a * 2) => a + b; [f(1), f(1, 1)]')).toEqual([3, 2]);
      expect(run('Object.entries({ a: 1, b: 2 }).map(([k, v]) => k + v)')).toEqual(['a1', 'b2']);
      expect(run('const sum = (...xs) => xs.reduce((s, x) => s + x, 0); sum(1, 2, 3)')).toBe(6);
      expect(run('let t = ""; for (const [k, v] of Object.entries({ a: 1, b: 2 })) t += k + v; t')).toBe('a1b2');
      expect(run('let n = []; for (const { name } of ps) n.push(name); n', { ps: [person, { name: 'Bo' }] })).toEqual([
        'Ada',
        'Bo',
      ]);
      expect(run('let a, b; const out = []; for ([a, b] of [[1, 2], [3, 4]]) out.push(a * b); out')).toEqual([2, 12]);
      expect(run('try { throw new Error("no") } catch ({ message }) { message }')).toBe('no');
      // (Functions made in a turn of a destructuring for...of keep that turn's values.)
      expect(run('const fs = []; for (const [i] of [[1], [2]]) fs.push(() => i); fs.map((f) => f())')).toEqual([1, 2]);
    });

    test('for...in, labels, sequences, void, instanceof, methods of objects', () => {
      expect(run('const keys = []; for (const k in { a: 1, b: 2 }) keys.push(k); keys')).toEqual(['a', 'b']);
      expect(run('let k; let n = 0; for (k in nothing) n++; for (k in [5, 6]) n++; [n, k]')).toEqual([2, '1']);
      expect(
        run(
          'let found; outer: for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) { if (j === 1) continue outer; if (i === 2) { found = [i, j]; break outer } } } found'
        )
      ).toEqual([2, 0]);
      expect(run('let n = 0; block: { n = 1; if (n) break block; n = 2 } n')).toBe(1);
      expect(run('let s = 0; for (let i = 0, j = 4; i < j; i++, j--) s += j - i; s')).toBe(6);
      expect(run('let a = 1; const b = (a++, a++, a); [a, b, void a]')).toEqual([3, 3, undefined]);
      expect(
        run('[new Date() instanceof Date, [] instanceof Array, new Map() instanceof Map, {} instanceof Array]')
      ).toEqual([true, true, true, false]);
      expect(run('try { null.x } catch (e) { e instanceof Error }')).toBe(true);
      expect(fails('1 instanceof something', { something: {} }, 'XUFA_EXPR_ERR_RUNTIME').message).toMatch(
        /something is not a type instanceof takes/
      );
      expect(run('const o = { twice(n) { return n * 2 }, [`t${1}`]: 1 }; [o.twice(2), o.t1]')).toEqual([4, 1]);
    });

    test('tagged templates, and the library of programs', () => {
      expect(run('String.raw`a\\nb${1 + 1}`')).toBe('a\\nb2');
      expect(
        run('const tag = (strings, ...values) => [strings, strings.raw, values, Object.isFrozen(strings)]; tag`x${1}y`')
      ).toEqual([['x', 'y'], ['x', 'y'], [1], true]);
      expect(run('[Array.from({ length: 3 }, (_, i) => i * 2), Array.of(1, 2), new Array(3).fill(0)]')).toEqual([
        [0, 2, 4],
        [1, 2],
        [0, 0, 0],
      ]);
      expect(() => run('new Array(1e9)')).toThrow(/more than 10000000 items/);
      expect(() => run('Array.from({ length: 1e9 })')).toThrow(/more than 10000000 items/);
      expect(
        run('const o = Object.assign({}, { a: 1 }, null, { b: 2 }); Object.freeze(o); [o, Object.isFrozen(o)]')
      ).toEqual([{ a: 1, b: 2 }, true]);
      // (Programs are strict, as JavaScript of modules: a change of what is frozen is an error.)
      expect(() => run('const o = Object.freeze({}); o.c = 3')).toThrow(TypeError);
      expect(run('structuredClone({ a: [1] })')).toEqual({ a: [1] });
      expect(run('BigInt(5) * 2n')).toBe(10n);
      fails('Object.assign(d, { a: 1 })', { d: new Date() }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('Object.assign(Math, { a: 1 })', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('Object.assign({}, JSON.parse(\'{"__proto__": {"polluted": 1}}\'))', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('Object.freeze(Math)', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
    });

    test('what cannot be reached, destructured or copied either', () => {
      fails('const { constructor } = o', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('const { ["con" + "structor"]: c } = o', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('const { __proto__: p } = o', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      expect(
        run('const { ...rest } = JSON.parse(\'{"__proto__": {"x": 1}, "a": 1}\'); [rest.x, Object.keys(rest)]')
      ).toEqual([undefined, ['a']]);
      expect({}.x).toBeUndefined();
    });

    test('callbacks count as steps: nested map, reduce, sort', () => {
      const small = new Engine({ statements: true, maxSteps: 1000, ...options });
      expect(() => small.evaluate('xs.map(() => xs.map(() => xs.map(() => 0)))', { xs: Array(20).fill(0) })).toThrow(
        /more than 1000 steps/
      );
      expect(small.evaluate('xs.map((x) => x * 2).length', { xs: Array(500).fill(1) })).toBe(500);
      // (Expressions too: engines of expressions count the calls of their arrow functions.)
      const expressions = new Engine({ maxSteps: 1000, ...options });
      expect(() =>
        expressions.evaluate('xs.map(() => xs.map(() => xs.map(() => 0)))', { xs: Array(20).fill(0) })
      ).toThrow(/more than 1000 steps/);
    });

    if (options.inlineAfter === 0) {
      test('each of them made one function of JavaScript', () => {
        const fn = engine.compile(
          'const { a, ...r } = o; let s = 0; outer: for (const [k, v] of Object.entries(r)) { for (const x in v) { if (x === "skip") continue outer; s += v[x] } } const f = (y = 1, ...z) => [y, z.length, String.raw`${s}`, a instanceof Array, void 0]; f()'
        );
        expect(fn.name).toBe('program');
        expect(fn({ o: { a: [], b: { c: 1, d: 2 }, e: { skip: 1 } } })).toEqual([1, 0, '3', true, undefined]);
      });
    }
  });

  describe(`classes (${mode})`, () => {
    test('constructors, fields, methods, getters and setters, statics, computed keys', () => {
      const source = `
        class Account {
          balance = 0;
          static count = 0;
          static bank = 'xufa';
          ['kind' + 'Of']() { return 'account' }
          constructor(owner) { this.owner = owner; Account.count++ }
          deposit(amount) { this.balance += amount; return this }
          get rich() { return this.balance > 100 }
          set rich(value) { this.balance = value ? 1000 : 0 }
          static open(owner) { return new Account(owner) }
        }
        const a = Account.open('ada').deposit(50).deposit(70);
        const b = new Account('bo');
        b.rich = true;
        [a.owner, a.balance, a.rich, b.balance, Account.count, Account.bank, a.kindOf(), Object.keys(a), typeof Account]`;
      expect(run(source)).toEqual(['ada', 120, true, 1000, 2, 'xufa', 'account', ['balance', 'owner'], 'function']);
    });

    test('extends: super(), super.method(), fields after super(), default constructors, instanceof, errors and maps', () => {
      const source = `
        class Shape {
          sides = 0;
          constructor(name) { this.name = name }
          describe() { return this.name + ' of ' + this.sides }
          static create(...args) { return new this(...args) }
        }
        class Square extends Shape {
          sides = 4;
          constructor(size) { super('square'); this.size = size }
          describe() { return super.describe() + ' sides, ' + this.size }
          get area() { return this.size ** 2 }
        }
        class Small extends Square {}
        const s = new Small(3);
        class Failure extends Error {
          constructor(code) { super('failed: ' + code); this.code = code }
        }
        class Counter extends Map { add(key) { this.set(key, (this.get(key) ?? 0) + 1); return this } }
        let caught;
        try { throw new Failure(7) } catch (e) { caught = [e instanceof Failure, e instanceof Error, e.message, e.code] }
        [s.describe(), s.area, s instanceof Small, s instanceof Square, s instanceof Shape, s instanceof Map,
         Shape.create('circle').describe(), caught, new Counter().add('a').add('a').get('a')]`;
      expect(run(source)).toEqual([
        'square of 4 sides, 3',
        9,
        true,
        true,
        true,
        false,
        'circle of 0',
        [true, true, 'failed: 7', 7],
        2,
      ]);
    });

    test('class expressions; classes made in loops are each their own; objects with getters, setters and methods', () => {
      expect(run('const A = class { v() { return 1 } }; new A().v()')).toBe(1);
      expect(
        run(
          'const made = []; for (const n of [1, 2]) made.push(class { v() { return n } }); made.map((C) => new C().v())'
        )
      ).toEqual([1, 2]);
      expect(
        run(
          'const o = { n: 2, get twice() { return this.n * 2 }, set twice(v) { this.n = v / 2 }, add(x) { return this.n + x } }; o.twice = 10; [o.n, o.twice, o.add(1)]'
        )
      ).toEqual([5, 10, 6]);
    });

    test('what JavaScript refuses: this before super(), super() twice, a class called without new', () => {
      fails(
        'class A {} class B extends A { constructor() { this.x = 1; super() } } new B()',
        {},
        'XUFA_EXPR_ERR_RUNTIME'
      );
      fails('class A {} class B extends A { constructor() { super(); super() } } new B()', {}, 'XUFA_EXPR_ERR_RUNTIME');
      fails('class A {} class B extends A { constructor() {} } new B()', {}, 'XUFA_EXPR_ERR_RUNTIME');
      expect(fails('class A {} A()', {}, 'XUFA_EXPR_ERR_RUNTIME').message).toMatch(/is called with new/);
      expect(fails('let A = 1; new A()', {}, 'XUFA_EXPR_ERR_RUNTIME').message).toMatch(
        /A is not a class of the program/
      );
    });

    test('what cannot be reached nor changed with classes either', () => {
      fails('class A {} A.prototype', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A {} new A().constructor', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A { m() { return super.constructor } } new A().m()', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A { static m() { return super.constructor } } A.m()', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A extends f {}', { f: function host() {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A extends Array {}', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('class A { ["__pro" + "to__"]() {} }', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      // (this is any value given: a method called on a guarded object cannot change it.)
      fails('const o = { set(v) { this.x = v } }; [1].forEach(o.set, Math)', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      // (Instances of the program can be changed; those of the host cannot.)
      fails('d.x = 1', { d: new (class Host {})() }, 'XUFA_EXPR_ERR_FORBIDDEN');
      expect(run('class A {} const a = new A(); a.x = 1; A.y = 2; [a.x, A.y]')).toEqual([1, 2]);
    });

    test('methods count their steps and depth', () => {
      fails('class A { f() { return this.f() } } new A().f()', {}, 'XUFA_EXPR_ERR_LIMIT');
      fails('class A { get x() { return this.x } } new A().x', {}, 'XUFA_EXPR_ERR_LIMIT');
    });

    if (options.inlineAfter === 0) {
      test('made one function of JavaScript too', () => {
        const fn = engine.compile(
          'class A { x = 1; constructor(y) { this.y = y } get sum() { return this.x + this.y } } class B extends A { constructor() { super(2) } get sum() { return super.sum * 10 } } new B().sum'
        );
        expect(fn.name).toBe('program');
        expect(fn({})).toBe(30);
      });
    }
  });

  describe(`private members (${mode})`, () => {
    test('fields, methods, getters and setters, statics, #x in object, of other objects of the class', () => {
      const source = `
        class Counter {
          #count = 0;
          #step;
          static #made = 0;
          constructor(step = 1) { this.#step = step; Counter.#made++ }
          #bump() { this.#count += this.#step; return this }
          inc() { return this.#bump() }
          get #doubled() { return this.#count * 2 }
          set #reset(value) { this.#count = value }
          zero() { this.#reset = 0; return this }
          report() { return [this.#count, this.#doubled] }
          same(other) { return #count in other && this.#count === other.#count }
          static made() { return Counter.#made }
          update() { this.#count **= 2; this.#count ??= 1; ++this.#count; this.#count--; return this.#count }
        }
        const a = new Counter(2).inc().inc();
        const b = new Counter(4).inc();
        [a.report(), a.same(b), a.same({}), Counter.made(), Object.keys(a), JSON.stringify(a), a.zero().report(),
         new Counter(3).inc().update()]`;
      expect(run(source)).toEqual([[4, 8], true, false, 2, [], '{}', [0, 0], 9]);
    });

    test('nested classes reach the private names of those around; subclasses do not reach those of their parent', () => {
      expect(
        run(
          'class Outer { #secret = 7; read() { const Inner = class { get(o) { return o.#secret } }; return new Inner().get(this) } } new Outer().read()'
        )
      ).toBe(7);
      expect(
        fails('class A { #a = 1 } class B extends A { m() { return this.#a } }', {}, 'XUFA_EXPR_ERR_SYNTAX').message
      ).toMatch(/#a is not declared by a class around/);
      expect(
        fails('class A { #x = 1; m(o) { return o.#x } } new A().m({})', {}, 'XUFA_EXPR_ERR_RUNTIME').message
      ).toMatch(/Cannot read #x of an object whose class did not declare it/);
      fails('class A { #m() {} n() { this.#m = 1 } } new A().n()', {}, 'XUFA_EXPR_ERR_RUNTIME');
      fails('class A { #x = 1; static g(o) { return o.#x } } A.g(Math)', {}, 'XUFA_EXPR_ERR_RUNTIME');
      expect(run('class A { #x; static has(o) { return #x in o } } [A.has(new A()), A.has(Math)]')).toEqual([
        true,
        false,
      ]);
    });

    test('what JavaScript refuses of private names', () => {
      for (const [source, message] of [
        ['({}).#x', /#x is not declared by a class around/],
        ['class A { #x; #x }', /#x is declared once in a class/],
        ['class A { #constructor() {} }', /#constructor cannot be a member/],
        ['class A { #x; m() { return #x } }', /#x is only valid in #x in object/],
        ['class A { #x; m() { delete this.#x } }', /delete takes a member/],
      ]) {
        expect(fails(source, {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(message);
      }
    });

    test('object?.#name and object?.#method(): undefined of null and undefined, the rest of the chain too', () => {
      const source = `
        class Node {
          #value; #next = null;
          constructor(value, next = null) { this.#value = value; this.#next = next }
          #describe() { return 'node ' + this.#value }
          static second(node) { return node?.#next?.#value }
          static say(node) { return node?.#describe() }
          static deep(node) { return node?.#next.#value }
        }
        const list = new Node(1, new Node(2));
        [Node.second(list), Node.second(null), Node.second(new Node(3)), Node.say(list), Node.say(undefined), Node.deep(null)]`;
      expect(run(source)).toEqual([2, undefined, undefined, 'node 1', undefined, undefined]);
    });

    test('static blocks: run once with the class as this, in their order among the static fields', () => {
      const source = `
        const log = [];
        class Config {
          static #defaults = { size: 1 };
          static first = 'a';
          static { log.push('block 1', Config.first); this.ready = true }
          static second = 'b';
          static {
            log.push('block 2', this.second);
            for (const key of Object.keys(Config.#defaults)) this[key] = Config.#defaults[key];
          }
        }
        [log, Config.ready, Config.size]`;
      expect(run(source)).toEqual([['block 1', 'a', 'block 2', 'b'], true, 1]);
      expect(fails('class A { static { await 1 } }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(/await is of async/);
    });

    test('in async methods, with await', async () => {
      const source =
        'class A { #v = 0; async add(p) { this.#v += await p; return this.#v } } const a = new A(); await a.add(later(2)); await a.add(later(3))';
      expect(
        await run(source, { later: (value) => new Promise((resolve) => setTimeout(() => resolve(value), 1)) })
      ).toBe(5);
    });
  });

  describe(`modules (${mode})`, () => {
    const sources = {
      math: 'export function twice(x) { return x * 2 } export const pi = 3.14; export default (x) => x + 1; const hidden = 1',
      shapes:
        'import { pi } from "math"; export class Circle { constructor(r) { this.r = r } area() { return pi * this.r ** 2 } }',
      named: 'const a = 1, b = 2; export { a, b as second }',
      counter: 'let n = 0; export function next() { return ++n }',
      a: 'import { b } from "b"; export const a = 1',
      b: 'import { a } from "a"; export const b = 2',
      waits: 'export const x = await 1',
    };
    const modules = (name) => (name === 'host' ? { rate: 7, add: (x, y) => x + y } : sources[name]);
    const modular = new Engine({ statements: true, modules, maxSteps: 10_000, ...options });

    test('default, named, renamed and namespace imports, of sources and of what the host gives', () => {
      const source = `
        import inc, { twice, pi as p } from 'math';
        import * as all from 'math';
        import { Circle } from 'shapes';
        import { second } from 'named';
        import { rate, add } from 'host';
        [inc(1), twice(2), p, all.twice(5), Object.keys(all), 'hidden' in all, new Circle(1).area(), second, add(rate, 1)]`;
      expect(modular.evaluate(source)).toEqual([2, 4, 3.14, 10, ['twice', 'pi', 'default'], false, 3.14, 2, 8]);
      expect(modular.imports('import x from "math"; import { y } from "host"; 1')).toEqual(['math', 'host']);
    });

    test('a module is run for each import: its state is of that run', () => {
      expect(modular.evaluate('import { next } from "counter"; [next(), next()]')).toEqual([1, 2]);
      expect(modular.evaluate('import { next } from "counter"; next()')).toBe(1);
    });

    test('what modules refuse: cycles, exports they lack, no modules, exports of names they do not declare, await at their top', () => {
      expect(() => modular.evaluate('import { a } from "a"; a')).toThrow(/Modules import each other: a → b → a/);
      expect(() => modular.evaluate('import { nope } from "math"; nope')).toThrow(/does not export nope/);
      expect(() => modular.evaluate('import { x } from "missing"; x')).toThrow(/No module missing/);
      expect(() => engine.evaluate('import { x } from "math"; x')).toThrow(/import needs the modules of the engine/);
      expect(() => modular.evaluate('import { x } from "waits"; x')).toThrow(/A module cannot await at its top/);
      expect(() => run('export { missing }')).toThrow(/missing is exported but not declared/);
      expect(() => run('export const a = 1; return a')).toThrow(/A module .* has no return of its own/);
      expect(() => run('if (true) { import x from "m" }')).toThrow(/import is of the top of a program/);
      expect(() => run('export { a } from "m"')).toThrow(/Exports of other modules/);
    });

    test('a resolver of its own for a compile, over the engine', () => {
      const own = (name) => (name === 'mine' ? { v: 'mine' } : undefined);
      expect(modular.compile('import { v } from "mine"; v', { modules: own })({})).toBe('mine');
      expect(() => modular.evaluate('import { v } from "mine"; v')).toThrow(/No module mine/);
    });
  });

  describe(`generators and for await (${mode})`, () => {
    const later = (value, ms = 1) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

    test('generators: yield, values sent back, return, yield*, methods of classes and objects, spread and for...of', () => {
      const source = `
        function* range(from, to) { for (let i = from; i < to; i++) yield i; return 'end' }
        const echo = function* () { let got = yield 'ready'; while (got !== 'stop') got = yield got * 2 }
        function* all() { const last = yield* range(0, 2); yield last }
        class Tree {
          constructor(...items) { this.items = items }
          *values() { for (const item of this.items) yield item }
        }
        const o = { *pairs() { yield [1, 'a']; yield [2, 'b'] } };
        const e = echo();
        [[...range(1, 4)], [e.next().value, e.next(5).value, e.next(7).value, e.next('stop').done],
         [...all()], Array.from(new Tree('x', 'y').values()), Object.fromEntries(o.pairs()),
         (() => { const out = []; for (const n of range(0, 3)) out.push(n); return out })()]`;
      expect(run(source)).toEqual([
        [1, 2, 3],
        ['ready', 10, 14, true],
        [0, 1, 'end'],
        ['x', 'y'],
        { 1: 'a', 2: 'b' },
        [0, 1, 2],
      ]);
    });

    test('return() and throw() of generators: finally runs, catch takes the error', () => {
      const source = `
        const log = [];
        function* guarded() { try { yield 1; yield 2 } finally { log.push('closed') } }
        const g = guarded();
        g.next();
        const returned = g.return(9);
        function* catching() { while (true) { try { yield 'waiting' } catch (e) { log.push(e) } } }
        const c = catching();
        c.next();
        c.throw('boom');
        for (const v of guarded()) break;
        [returned, log]`;
      expect(run(source)).toEqual([{ value: 9, done: true }, ['closed', 'boom', 'closed']]);
    });

    test('a generator without end, taken a part of; the steps of its turns counted', () => {
      expect(
        run(
          'function* naturals() { let n = 0; while (true) yield n++ } const out = []; for (const n of naturals()) { if (n > 4) break; out.push(n) } out'
        )
      ).toEqual([0, 1, 2, 3, 4]);
      fails('function* naturals() { let n = 0; while (true) yield n++ } [...naturals()]', {}, 'XUFA_EXPR_ERR_LIMIT');
    });

    test('async generators and for await: values awaited, of async iterators and of iterables of promises', async () => {
      const source = `
        async function* ticks(n) { for (let i = 1; i <= n; i++) yield later(i * 10) }
        const log = [];
        async function* closing() { try { yield 1; yield 2 } finally { log.push('closed') } }
        const got = [];
        for await (const t of ticks(3)) got.push(t);
        for await (const v of [later('a'), 'b']) got.push(v);
        for await (const v of closing()) { got.push(v); break }
        let caught;
        try { for await (const v of [Promise.reject(new Error('bad'))]) got.push(v) } catch (e) { caught = e.message }
        class Feed { async *[\`each\`]() { yield* ticks(2) } }
        for await (const t of new Feed().each()) got.push(t);
        [got, log, caught]`;
      expect(await run(source, { later })).toEqual([[10, 20, 30, 'a', 'b', 1, 10, 20], ['closed'], 'bad']);
    });

    test('what generators and for await cannot be', () => {
      expect(fails('const f = () => { yield 1 }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /yield is of generators/
      );
      expect(fails('async function f() { for await (const k in o) {} }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /for await is of for...of/
      );
      expect(fails('class A { *constructor() {} }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /cannot be a generator/
      );
      fails('(function* () {}).constructor', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('(function* () {})().constructor', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
    });

    if (options.inlineAfter === 0) {
      test('made one function of JavaScript too', async () => {
        const sync = engine.compile('function* g() { yield 1; yield 2 } [...g()]');
        expect(sync.name).toBe('program');
        expect(sync({})).toEqual([1, 2]);
        const asynchronous = engine.compile(
          'async function* g() { yield 1 } const out = []; for await (const v of g()) out.push(v); out'
        );
        expect(await asynchronous({})).toEqual([1]);
      });
    }
  });

  describe(`async and await (${mode})`, () => {
    const later = (value, ms = 1) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
    const failing = () => Promise.reject(new Error('down'));

    test('await at the top of a program: a promise of its value (of its return, or of its last statement)', async () => {
      const result = run('const a = await later(2); a * 10', { later });
      expect(result).toBeInstanceOf(Promise);
      expect(await result).toBe(20);
      expect(await run('return await later("x")', { later })).toBe('x');
      expect(run('1 + 1')).toBe(2);
    });

    test('async functions, arrow functions, methods of classes and objects; await everywhere an expression is', async () => {
      const source = `
        async function twice(x) { return (await x) * 2 }
        const add = async (a, b = await later(1)) => a + b;
        const plus = async (n) => n + (await later(1));
        class Store {
          constructor() { this.items = [] }
          async add(item) { this.items.push(await item); return this }
          static async make() { return new Store() }
        }
        const store = await Store.make();
        await store.add(later('a'));
        const o = { async get(key) { return { [await later(key)]: await later(true) } } };
        let total = 0;
        for (const p of [later(1), later(2)]) total += await p;
        let i = 0;
        while (i < (await later(3))) i++;
        let picked;
        switch (await later('b')) { case 'a': picked = 1; break; case await later('b'): picked = 2; break }
        const { x, y = await later(9) } = await later({ x: 1 });
        const skipped = false && (await failing());
        [await twice(later(4)), await add(1), await plus(1), store.items, await o.get('k'), total, i, picked, x, y,
         \`\${await later('t')}!\`, skipped, (await later([1, 2])).length, Math.max(...(await later([3, 7])))]`;
      expect(await run(source, { later, failing })).toEqual([
        8,
        2,
        2,
        ['a'],
        { k: true },
        3,
        3,
        2,
        1,
        9,
        't!',
        false,
        2,
        7,
      ]);
    });

    test('errors: rejected promises go to catch; finally; thenables of the program; Promise.all, race and new Promise', async () => {
      expect(await run('try { await failing() } catch (e) { e.message } finally { }', { failing })).toBe('down');
      await expect(run('await failing()', { failing })).rejects.toThrow('down');
      expect(await run('const t = { then(resolve) { resolve(42) } }; await t')).toBe(42);
      expect(await run('const [a, b] = await Promise.all([later(1), 2]); a + b', { later })).toBe(3);
      expect(await run('await Promise.race([later(1, 20), later(2, 1)])', { later })).toBe(2);
      expect(await run('await new Promise((resolve) => resolve(5))')).toBe(5);
      expect(await run('(await Promise.allSettled([failing()]))[0].status', { failing })).toBe('rejected');
    });

    test('limits: steps across awaits, which no catch stops; concurrent calls are no depth', async () => {
      const small = new Engine({ statements: true, maxSteps: 50, ...options });
      await expect(
        small.evaluate('let n = 0; while (true) { try { await later(1); n++ } catch { } }', { later })
      ).rejects.toThrow(/more than 50 steps/);
      const shallow = new Engine({ statements: true, maxDepth: 10, ...options });
      expect(
        await shallow.evaluate(
          'const f = async (x) => x; (await Promise.all(Array.from({ length: 50 }, (_, i) => f(i)))).length'
        )
      ).toBe(50);
    });

    test('what await cannot be', () => {
      expect(fails('function f() { await 1 }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /await is of async functions/
      );
      expect(fails('const f = () => await 1', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /await is of async functions/
      );
      expect(fails('function f() { for await (const x of xs) {} }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /for await is of async functions/
      );
      expect(fails('class A { async constructor() {} }', {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(
        /cannot be async/
      );
      fails('(async () => 1).constructor', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('(async () => 1)().constructor', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      expect(() => evaluate('await 1', {})).toThrow();
    });

    if (options.inlineAfter === 0) {
      test('made one function of JavaScript too', async () => {
        const fn = engine.compile('const f = async (x) => (await x) + 1; await f(later(1))');
        expect(fn.name).toBe('program');
        expect(await fn({ later })).toBe(2);
      });
    }
  });

  describe(`names and spaces of Unicode (${mode})`, () => {
    test('names of letters of any language (and of ASCII going on with them); spaces and line ends of Unicode', () => {
      expect(run('let año = 2026; let café = año + 1; return café', {})).toBe(2027);
      expect(run('ñu + naïve_1', { ñu: 1, naïve_1: 2 })).toBe(3);
      expect(evaluate('größe\u00a0*\u00a02', { größe: 4 })).toBe(8);
      expect(evaluate('\uFEFFa\u3000+\u3000b', { a: 1, b: 2 })).toBe(3);
      // (A line end of Unicode ends a statement as \n does.)
      expect(run('let a = 1\u2028a = a + 1\u2029a * 10')).toBe(20);
      expect(() => evaluate('a ¶ b', { a: 1, b: 2 })).toThrow(/Unexpected character/);
    });
  });

  describe(`what programs cannot do (${mode})`, () => {
    test('change the globals, what they reach, functions, dates or class instances', () => {
      fails('Math.max = 1', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('JSON.parse = null', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('f.x = 1', { f: () => 1 }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('d.x = 1', { d: new Date() }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('m.size = 1', { m: new Map() }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('delete Math.PI', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('o.a.b = 1', { o: {} }, 'XUFA_EXPR_ERR_RUNTIME');
    });

    test('reach prototypes and constructors, by name or computed', () => {
      fails('o.constructor = 1', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('o.__proto__.polluted = 1', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('o["__pro" + "to__"] = {}', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('let k = "proto"; o["__" + k + "__"].x = 1', { o: {} }, 'XUFA_EXPR_ERR_FORBIDDEN');
      fails('[].map.constructor("return process")()', {}, 'XUFA_EXPR_ERR_FORBIDDEN');
      expect({}.polluted).toBeUndefined();
    });

    test('run without end: the limit of steps, which no catch stops', () => {
      expect(fails('while (true) {}', {}, 'XUFA_EXPR_ERR_LIMIT').message).toMatch(/more than 10000 steps/);
      fails('try { for (;;) {} } catch (e) { 1 }', {}, 'XUFA_EXPR_ERR_LIMIT');
      fails('function f() { return f() } f()', {}, 'XUFA_EXPR_ERR_LIMIT');
      fails('[1, 2].forEach(() => { while (true) {} })', {}, 'XUFA_EXPR_ERR_LIMIT');
      expect(run('let n = 0; for (let i = 0; i < 9000; i++) n++; n')).toBe(9000);
    });

    test('syntax that is not supported', () => {
      for (const [source, message] of [
        ['this.x', /this is of the methods of classes and objects only/],
        ['function f() { return this }', /this is of the methods/],
        ['class A { get *g() {} }', /Expected the name of a member|cannot be a generator/],
        ['function f() { yield 1 }', /yield is of generators/],
        ['class A { m() { super() } }', /super\(\) is of the constructors of classes that extend another/],
        ['class A { constructor() {} constructor() {} }', /A class has one constructor/],
        ['class A { prototype() {} }', /prototype cannot be a member of a class/],
        ['class A { get x(a) {} }', /A getter takes no parameters/],
        ['super.x', /super is of the methods of classes/],
        ['{ a: 1 }', /wrap an object in parentheses/],
        ['break', /break out of a loop/],
        ['a?.b = 1', /Only names and members/],
        ['for (;;) { break nowhere }', /No label nowhere here/],
        ['block: { for (;;) { continue block } }', /No loop of the label block/],
        ['twice: twice: for (;;) {}', /already used/],
        ['let { a = 1 }', /A pattern needs a value/],
        ['const o = { a = 1 }', /is a pattern of an assignment/],
        ['[1, , 2]', /Holes in arrays/],
        ['function f(...a, b) {}', /A rest parameter is the last one/],
        ['function f(a, a) {}', /Duplicate parameter a/],
        ['let [...a, b] = []', /A rest element is the last one/],
        ['[a + 1] = [2]', /Only names and members|Invalid destructuring target/],
      ]) {
        expect(fails(source, {}, 'XUFA_EXPR_ERR_SYNTAX').message).toMatch(message);
      }
    });

    test('engines of expressions stay expressions', () => {
      expect(() => evaluate('a = 1', {})).toThrow(/Assignments are not allowed/);
      expect(() => evaluate('let a = 1', {})).toThrow(/let is not allowed/);
      expect(() => evaluate('a++', { a: 1 })).toThrow(/Unexpected "\+\+"/);
      expect(() => evaluate('1 // two', {})).toThrow(/Comments are not allowed/);
    });
  });

  describe(`trees of other parsers (${mode})`, () => {
    test('compileTree compiles them with the same checks', () => {
      const tree = {
        type: 'Program',
        body: [
          {
            type: 'VariableDeclaration',
            kind: 'let',
            declarations: [{ type: 'VariableDeclarator', id: 'x', init: { type: 'Literal', value: 2 } }],
          },
          {
            type: 'ReturnStatement',
            argument: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'twice' },
              arguments: [{ type: 'Identifier', name: 'x' }],
            },
          },
        ],
      };
      expect(engine.compileTree(tree)({ twice: (v) => v * 2 })).toBe(4);
      const forbidden = {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'o' },
        property: 'constructor',
      };
      expect(() => engine.compileTree(forbidden)).toThrow(/constructor cannot be reached/);
      const assign = {
        type: 'AssignmentExpression',
        operator: '=',
        left: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'Math' },
          property: 'PI',
          computed: false,
        },
        right: { type: 'Literal', value: 3 },
      };
      expect(() => engine.compileTree(assign)({})).toThrow(/Math cannot be changed/);
    });
  });

  describe(`trees made by hand (${mode})`, () => {
    // (What the parser never makes: names that are not strings would be read as keys past the checks of names.)
    const name = (value) => ({ type: 'Identifier', name: value });
    const forbidden = (tree, message) => {
      let error;
      try {
        engine.compileTree(tree)({ o: {}, f: () => 1 });
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(ExpressionError);
      expect([error.code, error.message]).toEqual(['XUFA_EXPR_ERR_FORBIDDEN', expect.stringMatching(message)]);
    };

    test('nodes are plain objects and arrays: nothing of a tree comes from a prototype', () => {
      class Node {}
      const plain = { type: 'MemberExpression', object: name('o'), property: 'a' };
      forbidden(Object.assign(new Node(), plain), /plain objects and arrays/);
      forbidden({ ...plain, object: Object.assign(Object.create({ name: 'o' }), { type: 'Identifier' }) }, /plain/);
      class Items extends Array {}
      forbidden({ type: 'ArrayExpression', elements: Items.from([name('o')]) }, /plain/);
      // (Objects of no prototype are plain too.)
      expect(engine.compileTree(Object.assign(Object.create(null), plain))({ o: { a: 3 } })).toBe(3);
    });

    test('names, properties and keys that are not strings, literals that are objects, and cycles are refused', () => {
      forbidden(name(['constructor']), /A name of a tree must be a string/);
      forbidden({ type: 'MemberExpression', object: name('o'), property: ['constructor'] }, /A property/);
      forbidden(
        { type: 'ObjectExpression', properties: [{ type: 'Property', key: ['__proto__'], value: name('o') }] },
        /A key/
      );
      forbidden({ type: 'Literal', value: Function }, /A literal of a tree is a value/);
      forbidden({ type: 'CallExpression', callee: { type: 'Literal', value: {} }, arguments: [] }, /is a value/);
      forbidden({ type: 'NewExpression', callee: ['Date'], arguments: [] }, /The name of a constructor/);
      forbidden({ type: 'ArrowFunctionExpression', params: [['x']], body: name('x') }, /A parameter/);
      forbidden({ type: 'Filter', name: ['upper'], expression: name('o'), arguments: [] }, /The name of a filter/);
      forbidden({ type: 'TemplateLiteral', quasis: [{}], expressions: [] }, /A text of a template/);
      forbidden({ type: 'Literal', regex: { pattern: ['a'], flags: '' } }, /The pattern/);
      forbidden(
        {
          type: 'Program',
          body: [
            {
              type: 'VariableDeclaration',
              kind: 'let',
              declarations: [{ type: 'VariableDeclarator', id: ['x'], init: null }],
            },
          ],
        },
        /The name of a variable/
      );
      const cycle = { type: 'BinaryExpression', operator: '+', left: name('o') };
      cycle.right = cycle;
      forbidden(cycle, /cannot refer to itself/);
      // (A node used twice, not inside itself: a tree as any other.)
      const shared = name('n');
      expect(
        engine.compileTree({ type: 'BinaryExpression', operator: '*', left: shared, right: shared })({ n: 3 })
      ).toBe(9);
    });
  });

  describe(`bound names (${mode})`, () => {
    test('fixed values over the context, of the engine and of one tree; in closures and in the function made', () => {
      const bound = new Engine({ bound: { rate: 2 }, inlineAfter: 0 });
      expect(bound.evaluate('price * rate', { price: 5, rate: 100 })).toBe(10);
      expect(bound.evaluate('[1, 2].map((rate) => rate * 10)')).toEqual([10, 20]);
      const tree = {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: '$$twice' },
        arguments: [{ type: 'Identifier', name: 'rate' }],
      };
      const fn = bound.compileTree(tree, '', { bound: { $$twice: (v) => v * 2 } });
      expect(fn({ $$twice: () => 0 })).toBe(4);
      expect(() => new Engine({ statements: true, bound: { o: {} } }).evaluate('o.x = 1')).toThrow(/cannot be changed/);
    });
  });

  describe(`regular expressions (${mode})`, () => {
    test('literals where a value starts (a new one each time), division elsewhere', () => {
      expect(evaluate(String.raw`s.split(/\r?\n/)`, { s: 'a\nb' })).toEqual(['a', 'b']);
      expect(evaluate('a / b / c', { a: 8, b: 2, c: 2 })).toBe(2);
      expect(evaluate('[4][0] / (2)')).toBe(2);
      expect(run('return x.replace(/[/]+/g, "-")', { x: 'a//b' })).toBe('a-b');
      expect(run('/a/g.test("a") && /a/g.test("a")')).toBe(true);
      const fast = new Engine({ inlineAfter: 0 }).compile(String.raw`s.match(/\d+/g)`);
      expect([fast({ s: 'a1b22' }), fast({ s: 'c333' })]).toEqual([['1', '22'], ['333']]);
      expect(() => evaluate('/(/')).toThrow(/Unterminated group/);
      expect(() => evaluate('/a')).toThrow(/Unterminated regular expression/);
    });
  });
}
