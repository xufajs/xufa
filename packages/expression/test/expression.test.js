const { compile, evaluate, parse, Engine, ExpressionError, GLOBALS } = require('..');

const context = () => ({
  a: 3,
  b: 4,
  s: 'Hello',
  n: null,
  u: undefined,
  zero: 0,
  big: 10n,
  user: { name: 'ada', tags: ['x', 'y', 'z'], address: { city: 'London' }, greet: (who) => `hi ${who}` },
  items: [
    { name: 'pen', price: 2, quantity: 10 },
    { name: 'book', price: 20, quantity: 1 },
    { name: 'lamp', price: 35, quantity: 2 },
  ],
  map: new Map([['k', 1]]),
  date: new Date('2026-01-02T03:04:05Z'),
});

// The same in JavaScript: the expression as a function of the names of the context.
function native(source, ctx) {
  const names = Object.keys(ctx);
  // eslint-disable-next-line no-new-func
  return new Function(...names, `return (${source});`)(...names.map((name) => ctx[name]));
}

// The same on the closures and on the JavaScript made for expressions run often (made at once here).
for (const [label, options] of [
  ['closures', { inline: false }],
  ['generated JavaScript', { inlineAfter: 0 }],
]) {
  const engine = new Engine(options);
  // eslint-disable-next-line no-shadow
  const evaluate = (source, ctx) => engine.evaluate(source, ctx);

  describe(label, () => {
describe('expressions as JavaScript computes them', () => {
  const cases = [
    // literals
    '1',
    '1.5e3',
    '.5',
    '0x1f',
    '0o17',
    '0b101',
    '1_000_000',
    '12n',
    '"double \\" quote"',
    "'single \\n line'",
    "'\\u{1F600} \\x41 \\u0042'",
    'true',
    'false',
    'null',
    'undefined',
    '`plain`',
    '`${a} and ${b}!`',
    '`nested ${`inner ${a + 1}`} end`',
    '`${user.name}${s}`',
    // arithmetic and precedence
    'a + b * 2',
    '(a + b) * 2',
    '2 ** 3 ** 2',
    '(2 ** 3) ** 2',
    '-a ** 2 === undefined ? 0 : 1'.replace('-a ** 2', '(-a) ** 2'),
    'a % 2',
    'b / 0',
    'big * 3n',
    's + a',
    'a - -b',
    '+"42"',
    '~a',
    'a << 2 | 1',
    'a & b ^ 1',
    '-16 >> 2',
    '-16 >>> 28',
    // comparisons and logic
    'a < b && b <= 4 && a !== b',
    'a == "3"',
    'a != "3"',
    'n == undefined',
    'n === undefined',
    'zero || "fallback"',
    'zero ?? "fallback"',
    'n ?? u ?? "both"',
    'a && b',
    'zero && b',
    '!a',
    '!!s',
    'typeof s',
    'typeof missingName',
    'typeof user.greet',
    '"name" in user',
    '1 in user.tags',
    'a > b ? "more" : a === b ? "same" : "less"',
    '(a ?? b) || zero',
    // members, calls, chains
    'user.name',
    'user["name"]',
    'user.tags[1]',
    'user.tags.length',
    'user.address.city.toUpperCase()',
    's.slice(1, 3)',
    'user.greet("you")',
    'user?.address?.city',
    'user?.missing?.city',
    'user.missing?.city.deeper',
    'n?.x',
    'n?.[0]',
    'user.greet?.("x")',
    'user.missing?.()',
    'map.get("k")',
    'date.getUTCFullYear()',
    // arrays and objects
    '[a, b, ...user.tags]',
    '[...s]',
    '({ a, b: b * 2, [user.name]: 1, "quoted": 2, 3: "three" })',
    '({ ...user.address, a })',
    '({ ...n, ...u, x: 1 })',
    // arrow functions
    'items.map(item => item.price * item.quantity)',
    'items.filter(i => i.price > a).map(i => i.name)',
    'items.reduce((sum, i) => sum + i.price * i.quantity, 0)',
    'items.some(i => i.name === "book")',
    'items.find(i => i.price > 100)',
    'items.map((i, index) => index + i.name)',
    'items.map(i => items.filter(j => j.price < i.price).length)',
    '[1, 2, 3].map(x => [4, 5].map(y => x * y))',
    '(() => a)()',
    '((x, y) => x + y)(a, b)',
    'items.map(i => ({ n: i.name }))',
    'user.tags.join("-")',
    'Object.keys(user)',
    // globals
    'Math.max(...items.map(i => i.price))',
    'Math.round(2.5)',
    'JSON.stringify({ a })',
    'JSON.parse("[1,2]")',
    'Number("12.5") + 1',
    'Number.isInteger(a)',
    'String(a) + String(null)',
    'Boolean(s)',
    'parseInt("42px")',
    'Array.isArray(user.tags)',
    'Object.entries({ x: 1 })',
    'encodeURIComponent("a b&c")',
    'isNaN("x")',
    'Infinity > 1e308',
  ];

  it.each(cases)('%s', (source) => {
    const ctx = context();
    expect(evaluate(source, ctx)).toEqual(native(source, ctx));
  });

  it('keeps the line ends of template literals as JavaScript reads them', () => {
    expect(evaluate('`a\r\nb\rc`')).toBe('a\nb\nc');
  });
});

describe('what expressions cannot do', () => {
  const forbidden = [
    ['constructor', 'user.constructor'],
    ['computed constructor', 'user["constr" + "uctor"]'],
    ['prototype', 'user.greet.prototype'],
    ['__proto__', 'user.__proto__'],
    ['computed __proto__', 'user[["__pro", "to__"].join("")]'],
    ['an object made to be read as __proto__', 'user[{ toString: () => "__proto__" }]'],
    ['the constructor of a function', '(() => 1).constructor'],
    ['the constructor of a method', 's.slice.constructor'],
    ['__defineGetter__', 'user.__defineGetter__'],
    ['__lookupGetter__', 'user["__lookupGetter__"]'],
    ['caller', 'user.greet.caller'],
    ['a name constructor', 'constructor'],
    ['__proto__ as a key', '({ __proto__: 1 })'],
    ['__proto__ as a computed key', '({ ["__proto__"]: 1 })'],
  ];
  it.each(forbidden)('cannot reach %s', (title, source) => {
    expect(() => evaluate(source, context())).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_FORBIDDEN' }));
  });

  const syntax = [
    ['assignments', 'a = 1'],
    ['compound assignments', 'a += 1'],
    ['updates', 'a++'],
    ['new', 'new Date()'],
    ['this', 'this'],
    ['functions', 'function () {}'],
    ['delete', 'delete user.name'],
    ['void', 'void 0'],
    ['instanceof', 'a instanceof Object'],
    ['statements', 'if (a) b'],
    ['sequences', 'a, b'],
    ['semicolons', 'a; b'],
    ['comments', 'a // b'],
    ['tagged templates', 'user.greet`x`'],
    ['arrow bodies of statements', 'items.map(i => { return i; })'],
    ['holes', '[1, , 2]'],
    ['methods', '({ f() { return 1; } })'],
    ['?? mixed with ||', 'a ?? b || zero'],
    ['unary before **', '-a ** 2'],
    ['octal escapes', "'\\1'"],
    ['numbers touching names', '3in user'],
    ['empty sources', '   '],
    ['unclosed strings', '"abc'],
    ['unclosed templates', '`abc ${a'],
    ['unexpected tokens', 'a b'],
  ];
  it.each(syntax)('refuses %s', (title, source) => {
    expect(() => evaluate(source, context())).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_SYNTAX' }));
  });

  it('does not reach the process, require, Function or the global object', () => {
    for (const name of ['process', 'require', 'Function', 'globalThis', 'global', 'module', 'eval', 'setTimeout']) {
      expect(evaluate(name, {})).toBe(undefined);
    }
    expect(() => evaluate('process.exit()', {})).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_RUNTIME' }));
    // The globals are of their own: Object has no assign nor getPrototypeOf, Array no from.
    expect(evaluate('Object.assign')).toBe(undefined);
    expect(evaluate('Object.getPrototypeOf')).toBe(undefined);
    expect(evaluate('Array.from')).toBe(undefined);
  });

  it('cannot change the prototypes of the process', () => {
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    for (const source of [
      '({ ...JSON.parse(\'{"__proto__": {"polluted": 1}}\') })',
      'JSON.parse(\'{"__proto__": {"polluted": 1}}\')',
      'Object.fromEntries([["__proto__", { polluted: 1 }]])',
    ]) {
      const value = evaluate(source);
      expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
    }
    expect({}.polluted).toBe(undefined);
    expect(Object.getOwnPropertyNames(Object.prototype)).toHaveLength(before);
  });

  it('gives the arrow functions it makes to who calls it, and they run only the expression', () => {
    const double = evaluate('x => x * 2');
    expect(double(21)).toBe(42);
    expect(double.constructor).toBe(Function); // in JavaScript, not in expressions
    expect(() => evaluate('f.constructor', { f: double })).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_FORBIDDEN' }));
  });
});

describe('errors', () => {
  it('says where the syntax fails', () => {
    try {
      evaluate('user.name +\n  * 2');
      throw new Error('no error');
    } catch (err) {
      expect(err).toBeInstanceOf(ExpressionError);
      expect(err).toMatchObject({ code: 'XUFA_EXPR_ERR_SYNTAX', line: 2, column: 3 });
    }
  });

  it('says what is null when a member of it is read, and what is not a function', () => {
    expect(() => evaluate('user.missing.city', context())).toThrow(
      'Cannot read city of user.missing, which is null or undefined'
    );
    expect(() => evaluate('user.name()', context())).toThrow('user.name is not a function');
    expect(() => evaluate('nothing(1)', context())).toThrow('nothing is not a function');
  });

  it('lets the errors of the functions called go through', () => {
    const fail = () => {
      throw new RangeError('own error');
    };
    expect(() => evaluate('fail()', { fail })).toThrow(RangeError);
  });
});

  });
}

describe('Engine options', () => {
  it('is lenient with null members and calls when asked', () => {
    const engine = new Engine({ lenient: true });
    expect(engine.evaluate('user.missing.city', context())).toBe(undefined);
    expect(engine.evaluate('user.name()', context())).toBe(undefined);
  });

  it('is strict with names not given when asked', () => {
    const engine = new Engine({ strict: true });
    expect(() => engine.evaluate('missing + 1', {})).toThrow('missing is not defined');
    expect(engine.evaluate('Math.abs(-1) + u', { u: 1 })).toBe(2);
  });

  it('takes globals of its own, over the default ones or without them', () => {
    const engine = new Engine({ globals: { tax: (value) => value * 1.21 } });
    expect(engine.evaluate('Math.round(tax(100))')).toBe(121);
    const bare = new Engine({ builtins: false, globals: { pi: 3 } });
    expect(bare.evaluate('pi')).toBe(3);
    expect(bare.evaluate('Math')).toBe(undefined);
    // The context goes over the globals.
    expect(engine.evaluate('tax', { tax: 'given' })).toBe('given');
    expect(Object.isFrozen(GLOBALS)).toBe(true);
  });

  it('separates filters with | when it has filters', () => {
    const engine = new Engine({ filters: { upper: (v) => v.toUpperCase(), cut: (v, n) => v.slice(0, n) } });
    expect(engine.evaluate('s | upper | cut(3)', { s: 'hello' })).toBe('HEL');
    expect(engine.evaluate('(a || b) | cut(2)', { a: '', b: 'xyz' })).toBe('xy');
    expect(() => engine.evaluate('s | nope', { s: 'x' })).toThrow('Unknown filter nope');
    // Without filters, | is the bitwise or.
    expect(evaluate('5 | 2')).toBe(7);
  });

  it('keeps what it compiles, up to cacheSize, and refuses sources longer than maxLength', () => {
    const engine = new Engine({ cacheSize: 2, maxLength: 20 });
    const first = engine.compile('a + 1');
    expect(engine.compile('a + 1')).toBe(first);
    engine.compile('a + 2');
    engine.compile('a + 3');
    expect(engine.compile('a + 1')).not.toBe(first);
    expect(() => engine.compile('a'.repeat(21))).toThrow(expect.objectContaining({ code: 'XUFA_EXPR_ERR_LENGTH' }));
  });

  it('compiles once and runs on many contexts', () => {
    const total = compile('items.reduce((sum, i) => sum + i.price, 0)');
    expect(total({ items: [{ price: 1 }, { price: 2 }] })).toBe(3);
    expect(total({ items: [] })).toBe(0);
    expect(total.source).toBe('items.reduce((sum, i) => sum + i.price, 0)');
    expect(compile('a')(null)).toBe(undefined);
  });

  it('reads paths fast, and as every expression where they meet null or names not given', () => {
    const ctx = { user: { address: { city: 'London' } }, empty: null };
    expect(evaluate('user.address.city', ctx)).toBe('London');
    expect(evaluate('Math.PI')).toBe(Math.PI);
    expect(evaluate('user?.missing?.city', ctx)).toBe(undefined);
    expect(() => evaluate('nobody.at.all', {})).toThrow('Cannot read at of nobody');
    expect(evaluate('nobody?.at.all', {})).toBe(undefined);
    expect(() => evaluate('user.missing.city', ctx)).toThrow('Cannot read city of user.missing');
    expect(() => evaluate('empty.x', ctx)).toThrow('Cannot read x of empty');
    expect(new Engine({ lenient: true }).evaluate('empty.x.y', ctx)).toBe(undefined);
    expect(() => new Engine({ strict: true }).evaluate('nobody.x', {})).toThrow('nobody is not defined');
    expect(evaluate('s.length', { s: 'abc' })).toBe(3);
  });

  it('makes expressions run often one function of JavaScript, after inlineAfter runs', () => {
    const source = 'items.map(i => i.price * i.quantity).reduce((sum, v) => sum + v, 0)';
    const ctx = { items: [{ price: 2, quantity: 3 }] };
    // At once: the function made (it is named expression; the closures are not).
    expect(new Engine({ inlineAfter: 0 }).compile(source).name).toBe('expression');
    // After 3 runs: the same results before and after.
    const engine = new Engine({ inlineAfter: 3 });
    const fn = engine.compile(source);
    for (let i = 0; i < 10; i += 1) expect(fn(ctx)).toBe(6);
    // Never with inline: false; and with code generation off, the closures go on.
    const closures = new Engine({ inline: false, inlineAfter: 0 }).compile(source);
    expect(closures.name).not.toBe('expression');
    const { execFileSync } = require('node:child_process'); // eslint-disable-line global-require
    const script = `const { Engine } = require(${JSON.stringify(require.resolve('..'))});
const fn = new Engine({ inlineAfter: 0 }).compile(${JSON.stringify(source)});
process.stdout.write(String(fn(${JSON.stringify(ctx)})));`;
    const output = execFileSync(process.execPath, ['--disallow-code-generation-from-strings', '-e', script]);
    expect(String(output)).toBe('6');
  });

  it('gives the tree of an expression', () => {
    expect(parse('a + 1')).toMatchObject({
      type: 'BinaryExpression',
      operator: '+',
      left: { type: 'Identifier', name: 'a' },
      right: { type: 'Literal', value: 1 },
    });
    expect(parse('a?.b')).toMatchObject({ type: 'ChainExpression' });
  });
});
