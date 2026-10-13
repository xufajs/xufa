// Random programs of @xufa/expression, of a seed: the same seed, the same program. Made of a grammar of what programs
// have (declarations, assignments of every operator, if, loops with labels, switch, try with finally, functions and
// arrow functions, closures, destructuring, classes with fields, getters, statics and private members, generators,
// optional chains, templates, spread, async and await), always valid, and short of the limits: loops run a few turns.
// They end returning what their names hold. The fuzz runs each on the closures and on the function of JavaScript, and
// compares what they give (canon: values as text) and the errors they throw.

// A generator of numbers of a seed (mulberry32).
function random(seed) {
  let state = seed >>> 0; // eslint-disable-line no-bitwise
  return () => {
    /* eslint-disable no-bitwise */
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    /* eslint-enable no-bitwise */
  };
}

class ProgramMaker {
  constructor(seed, { async = false, early = false } = {}) {
    this.next = random(seed);
    this.async = async;
    // (early: names usable as soon as they are made, even before their declaration runs: for engines with tdz.)
    this.early = early;
    this.count = 0;
    // The names of each scope (innermost last), and whether each is a function (its calls), a class, a generator.
    this.scopes = [[]];
    this.depth = 0;
    this.loops = [];
    this.labels = [];
    this.later = [];
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  chance(p) {
    return this.next() < p;
  }

  name(prefix = 'v') {
    this.count += 1;
    return `${prefix}${this.count}`;
  }

  // (Declared when its statement ends: no name is read before its declaration, as JavaScript would refuse.)
  declare(name, kind = 'value') {
    if (this.early) this.scopes[this.scopes.length - 1].push({ name, kind });
    else this.later.push({ name, kind });
  }

  // The names of a kind in the scopes around.
  names(kind = 'value') {
    return this.scopes.flat().filter((item) => item.kind === kind).map((item) => item.name);
  }

  // A value: literals, names, operations of them, arrays, objects, calls, members, templates...
  value(depth = 0) {
    const names = this.names();
    const leaf = () => {
      const roll = this.int(10);
      if (roll < 3 && names.length) return this.pick(names);
      if (roll < 6) return this.pick(['0', '1', '2', '3', '(-1)', '7', '10', '0.5', '2.5', '100']);
      if (roll < 7) return this.pick(['"a"', '"b"', '""', '"xy"', "'q'"]);
      if (roll < 8) return this.pick(['true', 'false', 'null', 'undefined']);
      if (roll < 9) return this.pick(['NaN', 'Infinity', '(-0)', '"10"']);
      return names.length ? this.pick(names) : '1';
    };
    if (depth > 2) return leaf();
    const roll = this.int(30);
    const sub = () => this.value(depth + 1);
    if (roll < 8) return leaf();
    if (roll < 12) return `(${sub()} ${this.pick(['+', '-', '*', '/', '%', '**', '==', '===', '!=', '<', '>=', '&&', '||', '??', '&', '|', '^', '<<', '>>'])} ${sub()})`;
    if (roll < 13) return `(${this.pick(['!', '-', '+', 'typeof', 'void', '~'])} ${sub()})`;
    if (roll < 14) return `(${sub()} ? ${sub()} : ${sub()})`;
    if (roll < 16) return `[${Array.from({ length: this.int(4) }, sub).join(', ')}]`;
    if (roll < 18) {
      const keys = ['a', 'b', 'c', '"d e"', '1'];
      return `({ ${Array.from({ length: this.int(3) + 1 }, () => `${this.pick(keys)}: ${sub()}`).join(', ')} })`;
    }
    if (roll < 19) return `\`t\${${sub()}}-\${${sub()}}\``;
    if (roll < 20 && names.length) return `${this.pick(names)}?.${this.pick(['a', 'b', 'length', 'x'])}`;
    if (roll < 21 && names.length) return `${this.pick(names)}?.[${sub()}]`;
    if (roll < 22) return `[${sub()}, ${sub()}].map((x) => x ${this.pick(['+', '*', '??'])} ${sub()})`;
    if (roll < 23) return `[${sub()}, ${sub()}, ${sub()}].filter((x) => x).length`;
    if (roll < 24) return `[1, 2, 3].reduce((s, x) => s + x * ${sub()}, 0)`;
    if (roll < 25) return `[...[${sub()}], ...${this.pick(['"ab"', '[1, 2]', '[]'])}]`;
    if (roll < 26) return `({ ...{ a: ${sub()} }, b: ${sub()} })`;
    if (roll < 27) {
      const fns = this.names('function');
      if (fns.length) return `${this.pick(fns)}(${sub()})`;
      return leaf();
    }
    if (roll < 28) {
      // What a chain skips: a key or arguments that throw when they are evaluated.
      if (this.chance(0.7)) return `String(${sub()}).length`;
      const object = this.pick(['null', 'undefined', 'null', 'undefined', '({ a: 1 })', '[]']);
      const fails = '[].reduce((a) => a)';
      return this.pick([`${object}?.[${fails}]`, `${object}?.f(${fails})`, `${object}?.a.b?.(${fails})`]);
    }
    if (roll < 29) return `Math.${this.pick(['max', 'min'])}(${sub()}, ${sub()})`;
    return `JSON.stringify(${sub()})`;
  }

  // A target of an assignment: a name of the program declared with let (or a member of an object).
  target() {
    const lets = this.names('let');
    return lets.length ? this.pick(lets) : null;
  }

  statement(depth = 0) {
    const saved = this.later;
    this.later = [];
    const text = this.make(depth);
    this.scopes[this.scopes.length - 1].push(...this.later);
    this.later = saved;
    return text;
  }

  make(depth) {
    const roll = this.int(depth > 2 ? 8 : 28);
    const block = () => this.block(depth + 1);
    switch (roll) {
      case 0:
      case 1: {
        const name = this.name();
        const kind = this.chance(0.5) ? 'let' : 'const';
        const value = this.value();
        this.declare(name, 'value');
        if (kind === 'let') this.declare(name, 'let');
        return `${kind} ${name} = ${value};`;
      }
      case 2:
      case 3: {
        const target = this.target();
        if (!target) return `${this.value()};`;
        const operator = this.pick(['=', '+=', '-=', '*=', '??=', '||=', '&&=', '**=', '%=']);
        return `${target} ${operator} ${this.value()};`;
      }
      case 4: {
        const target = this.target();
        if (!target) return `${this.value()};`;
        return `${target}${this.pick(['++', '--'])};`;
      }
      case 5:
        return `if (${this.value()}) ${block()} else ${block()}`;
      case 6:
        return `${this.value()};`;
      case 7: {
        // A destructuring.
        const a = this.name();
        const b = this.name();
        const statement = this.chance(0.5)
          ? `let { a: ${a}, b: ${b} = ${this.value()}, ...${this.name('r')} } = { a: ${this.value()}, c: 1 };`
          : `let [${a}, , ${b} = ${this.value()}] = [${this.value()}, 2, ${this.pick(['undefined', '3', 'null'])}];`;
        this.declare(a);
        this.declare(b);
        return statement;
      }
      case 8:
      case 9: {
        // A loop of a few turns (a label, break and continue in it).
        const i = this.name('i');
        const label = this.chance(0.3) ? this.name('L') : null;
        this.scopes.push([{ name: i, kind: 'value' }]);
        this.loops.push(label);
        const body = this.loopBody(depth + 1, label);
        this.loops.pop();
        this.scopes.pop();
        const head =
          roll === 8
            ? `for (let ${i} = 0; ${i} < ${this.int(4) + 1}; ${i}++)`
            : `for (const ${i} of [${this.value()}, ${this.value()}])`;
        return `${label ? `${label}: ` : ''}${head} ${body}`;
      }
      case 10: {
        const n = this.name('w');
        this.declare(n);
        this.scopes.push([]);
        const body = this.block(depth + 1);
        this.scopes.pop();
        return `let ${n} = 0; while (${n} < ${this.int(3) + 1}) { ${n}++; ${body.slice(1, -1)} }`;
      }
      case 11: {
        const head = `switch (${this.value()}) { case ${this.value()}: `;
        // (Each case a block: a case jumped to does not read the declarations of the cases before it.)
        const kase = () => this.block(depth + 1);
        return `${head}${kase()} break; case 1: ${kase()} default: ${kase()} }`;
      }
      case 12: {
        const e = this.name('e');
        this.scopes.push([{ name: e, kind: 'value' }]);
        const handler = this.block(depth + 1);
        this.scopes.pop();
        const thrower = this.chance(0.5) ? `throw ${this.pick(['new Error("boom")', this.value(), '"x"'])};` : '';
        return `try { ${thrower} ${block().slice(1, -1)} } catch (${e}) { ${handler.slice(1, -1)} } finally { ${block().slice(1, -1)} }`;
      }
      case 13:
      case 14: {
        // A function (a closure of what is around), declared or as an arrow function.
        const name = this.name('f');
        const param = this.name('p');
        this.scopes.push([{ name: param, kind: 'value' }]);
        this.depth += 1;
        const savedLoops = this.loops;
        this.loops = [];
        const body = `{ ${this.statement(depth + 1)} return ${this.value()} ${this.pick(['+', '??', '||'])} ${param}; }`;
        this.loops = savedLoops;
        this.depth -= 1;
        this.scopes.pop();
        this.declare(name, 'function');
        if (roll === 13) return `function ${name}(${param} = ${this.value()}) ${body}`;
        return `const ${name} = (${param}, ...${this.name('rest')}) => ${body};`;
      }
      case 15: {
        // A class: a field, a private field, a getter, a method, a static.
        const name = this.name('C');
        const instance = this.name('o');
        this.declare(instance);
        const extendsError = this.chance(0.2);
        return (
          `class ${name}${extendsError ? ' extends Error' : ''} { #p = ${this.value()}; f = ${this.value()}; static s = ${this.value()};` +
          ` constructor(x) { ${extendsError ? 'super(String(x));' : ''} this.x = x; }` +
          ` get g() { return this.#p ?? this.f; } m(y) { this.#p = y; return [this.#p, this.x]; } static make() { return new ${name}(${this.value()}); }` +
          ` static has(o) { return #p in o; } }` +
          ` const ${instance} = [${name}.make().m(${this.value()}), new ${name}(1).g, ${name}.s, ${name}.has(new ${name}(2)), ${name}.has({})];`
        );
      }
      case 16: {
        // A generator, spread.
        const name = this.name('g');
        const out = this.name();
        this.declare(out);
        return `function* ${name}(n) { for (let k = 0; k < n; k++) { const sent = yield k * ${this.value()}; if (sent) return sent; } } const ${out} = [...${name}(${this.int(4)})];`;
      }
      case 17: {
        // A labeled block.
        const label = this.name('B');
        this.scopes.push([]);
        const body = `${this.statement(depth + 1)} if (${this.value()}) break ${label}; ${this.statement(depth + 1)}`;
        this.scopes.pop();
        return `${label}: { ${body} }`;
      }
      case 18: {
        const name = this.name();
        this.declare(name);
        if (this.chance(0.3)) {
          // Bigints (of their own: mixed with numbers they only throw).
          return `const ${name} = String(${this.pick(['2n ** 70n', '-7n / 2n', '5n % -3n', '1n << 65n', 'BigInt(12) * 3n', '~5n'])} ${this.pick(['+', '-', '*'])} ${this.pick(['1n', '0n', '-3n'])});`;
        }
        return `const ${name} = (${this.value()}, ${this.value()});`;
      }
      case 19: {
        // Objects changed: members, delete, Object.assign.
        const name = this.name('obj');
        this.declare(name);
        return `const ${name} = { a: ${this.value()} }; ${name}.b = ${this.value()}; ${name}["c"] ??= ${this.value()}; delete ${name}.a; Object.assign(${name}, { d: ${this.value()} });`;
      }
      case 24: {
        // Closures made in a loop: each turn its own binding of the variable of the loop.
        const name = this.name('fns');
        const out = this.name();
        this.declare(out);
        return `const ${name} = []; for (let k = 0; k < 3; k++) { ${name}.push(() => k * ${this.value()}); } const ${out} = ${name}.map((f) => f());`;
      }
      case 25: {
        // A return replaced in finally; a loop left by return through finally.
        const name = this.name('f');
        const out = this.name();
        this.declare(out);
        return (
          `function ${name}(c) { const log = []; try { for (const k of [1, 2, 3]) { try { if (k === c) return [k, log]; } finally { log.push(k); } } ` +
          `if (c > 3) throw new Error("e" + c); } catch (e) { log.push(e.message); } finally { if (c === 0) return "zero"; } return log; }` +
          ` const ${out} = [${name}(0), ${name}(2), ${name}(5), ${name}(${this.value()})];`
        );
      }
      case 26: {
        // A setter, a static getter, inheritance of a class of the program.
        const name = this.name('C');
        const sub = this.name('D');
        const out = this.name();
        this.declare(out);
        return (
          `class ${name} { #v = 0; set v(x) { this.#v = x ?? -1; } get v() { return this.#v; } static get kind() { return "c"; } twice() { return this.v * 2; } }` +
          ` class ${sub} extends ${name} { twice() { return super.twice() + 1; } static get kind() { return super.kind + "d"; } }` +
          ` const ${out} = (() => { const o = new ${sub}(); o.v = ${this.value()}; return [o.v, o.twice(), ${sub}.kind, o instanceof ${name}]; })();`
        );
      }
      case 27: {
        // A generator left early: return() and its finally; a labeled continue.
        const name = this.name('g');
        const out = this.name();
        this.declare(out);
        return (
          `const ${out} = []; function* ${name}() { try { yield 1; yield 2; yield 3; } finally { ${out}.push("closed"); } }` +
          ` outer: for (const a of ${name}()) { for (const b of [1, 2]) { if (b === a) continue outer; if (a > ${this.int(3) + 1}) break outer; ${out}.push([a, b]); } }`
        );
      }
      case 20: {
        // for...in, instanceof.
        const name = this.name('keys');
        this.declare(name);
        return `const ${name} = []; for (const k in { x: 1, y: ${this.value()} }) ${name}.push(k, [] instanceof Array);`;
      }
      case 21:
        if (this.async && this.depth === 0) {
          const name = this.name();
          this.declare(name);
          return `const ${name} = await Promise.resolve(${this.value()});`;
        }
        return `${this.value()};`;
      case 22:
        if (this.async && this.depth === 0) {
          const name = this.name();
          this.declare(name);
          return `const ${name} = []; for await (const x of [Promise.resolve(${this.value()}), ${this.value()}]) ${name}.push(x);`;
        }
        return `${this.value()};`;
      default: {
        if (this.async && this.depth === 0) {
          const name = this.name('af');
          const out = this.name();
          this.declare(out);
          return `const ${name} = async (x) => (await x) ${this.pick(['+', '??'])} ${this.value()}; const ${out} = await ${name}(${this.value()});`;
        }
        return `${this.value()};`;
      }
    }
  }

  block(depth) {
    this.scopes.push([]);
    const count = this.int(3) + 1;
    const body = Array.from({ length: count }, () => this.statement(depth)).join(' ');
    this.scopes.pop();
    return `{ ${body} }`;
  }

  // The body of a loop: statements, and a break or continue (of this loop, or of a label around).
  loopBody(depth, label) {
    this.scopes.push([]);
    const count = this.int(2) + 1;
    const jump = this.chance(0.4) ? this.int(count + 1) : -1;
    const parts = [];
    for (let i = 0; i <= count; i += 1) {
      if (i === jump) {
        const labels = this.loops.filter(Boolean);
        const target = labels.length && this.chance(0.5) ? ` ${this.pick(labels)}` : '';
        parts.push(`if (${this.value()}) ${this.pick(['break', 'continue'])}${target};`);
      }
      if (i < count) parts.push(this.statement(depth));
    }
    this.scopes.pop();
    void label;
    return `{ ${parts.join(' ')} }`;
  }

  // A statement that fails: errors of the engine (their codes, messages and places compared) and of JavaScript, the
  // limits of steps and of depth, and errors thrown in functions, in loops or past a finally.
  failing() {
    const v = this.value();
    return this.pick([
      `null.x;`,
      `const n0 = undefined; n0[${v}];`,
      `({ a: 1 }).nope(${v});`,
      `(${v}, undefined)(1);`,
      `throw new RangeError("r" + ${v});`,
      `throw ${v};`,
      `[].reduce((a, b) => a + b);`,
      `1n + ${this.pick(['1', '"a"', 'null'])};`,
      `while (true) {}`,
      `function deep(n) { return deep(n + 1) + 1; } deep(0);`,
      `for (const k of [1, 2]) { try { if (k === 2) throw new TypeError(String(${v})); } finally { ${v}; } }`,
      `class P { #x = 1; static read(o) { return o.#x; } } P.read({});`,
      `const fz = Object.freeze({ a: 1 }); fz.a = ${v};`,
      `JSON.parse("{" + ${v});`,
      `new Map(${v});`,
      `[1, 2].map((x) => x.y.z);`,
    ]);
  }

  program() {
    const count = this.int(8) + 3;
    const failing = this.chance(0.25) ? this.int(count + 1) : -1;
    const statements = [];
    for (let i = 0; i <= count; i += 1) {
      if (i === failing) statements.push(this.failing());
      if (i < count) statements.push(this.statement(0));
    }
    const names = this.names();
    return `${statements.join('\n')}\nreturn [${names.join(', ')}];`;
  }
}

// A program of a seed (async: with await at its top, and async functions).
function programOf(seed, options) {
  return new ProgramMaker(seed, options).program();
}

// A value as text, the same for what is the same: numbers (NaN, -0), bigints, undefined, functions, dates, maps,
// sets, errors, objects (their own enumerable keys, in order; of a class, its name), and cycles.
function canon(value, seen = new Set()) {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return `function ${value.name}`;
  if (typeof value === 'symbol') return 'symbol';
  if (seen.has(value)) return 'cycle';
  seen.add(value);
  try {
    if (value instanceof Date) return `Date(${value.getTime()})`;
    if (value instanceof Error) return `${value.name}(${JSON.stringify(value.message)})`;
    if (value instanceof Map) return `Map(${[...value].map(([k, v]) => `${canon(k, seen)}=>${canon(v, seen)}`).join(',')})`;
    if (value instanceof Set) return `Set(${[...value].map((v) => canon(v, seen)).join(',')})`;
    if (Array.isArray(value)) return `[${value.map((v) => canon(v, seen)).join(',')}]`;
    const name = Object.getPrototypeOf(value)?.constructor?.name ?? 'null';
    return `${name}{${Object.keys(value)
      .map((key) => `${JSON.stringify(key)}:${canon(value[key], seen)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

// What a run gives: { value } as text, or { error } (its code and message).
async function outcome(fn) {
  try {
    const value = await fn();
    return { value: canon(value) };
  } catch (err) {
    return { error: `${err?.code ?? err?.name ?? typeof err}: ${err?.message ?? canon(err)}` };
  }
}

const AsyncFunction = (async () => {}).constructor;

// The program of a seed run three ways: on the closures, on the function of JavaScript (engines given by the caller,
// as `closures` and `generated`), and as JavaScript itself. `differs`: what the two engines give is not the same (a
// bug); `unlikeJs`: both ran, JavaScript too, and their values are not the same (a bug of both, or a difference of
// the language: they are told in the README). With `tdz` (engines with that option): programs that use names before
// their declarations, and each engine fails with its error where JavaScript fails with its own (and only there).
async function check(seed, { closures, generated, tdz = false }) {
  const source = programOf(seed, { async: seed % 4 === 0, early: tdz });
  const one = await outcome(() => closures.compile(source)({}));
  const other = await outcome(() => generated.compile(source)({}));
  const differs = one.value !== other.value || one.error !== other.error;
  let js = null;
  let unlikeJs = false;
  const ours = Boolean(one.error?.includes('is used before its declaration'));
  // (JavaScript runs only what ends: what the engines ran, or stopped at a name used before its declaration; not
  // what they stopped at their limits, as while (true) {}.)
  if (tdz && !differs && (!one.error || ours)) {
    js = await outcome(() => new AsyncFunction(`"use strict";\n${source}`)());
    const theirs = Boolean(js.error?.startsWith('ReferenceError: Cannot access'));
    unlikeJs = ours !== theirs || (!one.error && !js.error && js.value !== one.value);
  } else if (!differs && !one.error) {
    js = await outcome(() => new AsyncFunction(`"use strict";\n${source}`)());
    unlikeJs = !js.error && js.value !== one.value;
  }
  return { seed, source, closures: one, generated: other, js, differs, unlikeJs };
}

export { programOf, canon, outcome, random, check };
