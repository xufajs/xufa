// Programs of @xufa/expression (an engine with statements: true: loops, branches, functions, assignments) against
// what runs code of statements: SandboxJS (a sandbox too), node:vm (a function compiled in another context: no
// sandbox, vm is not a security boundary) and JavaScript itself (new Function: no sandbox, the bound of what can be
// done). Each engine and case runs in a process of its own, for a time, and the median of the rounds is shown. Two
// measures: a program compiled once and run (`run`), and compiled and run each time (`once`).
// node bench/micro/expression-programs.js [ms per measure] [rounds]
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

// Four contexts of different values, taken in turn: V8 cannot fold a program on values that do not change.
const NAMES = ['ada', 'grace', 'hedy', 'joan'];
const context = (i = 0) => ({
  a: 3 + i,
  b: 4 - (i % 2),
  user: { name: NAMES[i], tags: ['x', 'y', 'z'] },
  items: [
    { price: 2 + i, quantity: 10 },
    { price: 20, quantity: 1 + i },
    { price: 35, quantity: 2 },
    { price: 7, quantity: 3 },
  ],
});
const NAMES_OF_CONTEXT = Object.keys(context());

// Each case: a program, the same source for every engine.
const cases = {
  'if / else if': `
    let tier;
    if (a > 5) tier = 'gold';
    else if (a > 3) tier = 'silver';
    else tier = 'basic';
    return tier + '-' + b;`,
  switch: `
    switch (user.name) {
      case 'ada': return 1;
      case 'grace': return 2;
      case 'hedy': return 3;
      default: return 0;
    }`,
  'for...of (4 turns)': `
    let total = 0;
    for (const item of items) total += item.price * item.quantity;
    return total;`,
  'for (100 turns)': `
    let sum = 0;
    for (let i = 0; i < 100; i++) sum += i * a;
    return sum;`,
  'function and while': `
    function factorial(n) {
      let result = 1;
      while (n > 1) {
        result *= n;
        n--;
      }
      return result;
    }
    return factorial(a + 5);`,
  'object built': `
    const out = {};
    for (const tag of user.tags) out[tag] = tag.toUpperCase() + a;
    return out;`,
  'try / throw': `
    try {
      if (a > 4) throw new Error('big ' + a);
      return 'small';
    } catch (err) {
      return err.message;
    }`,
};

// Each engine: compile(source) gives run(context).
const engines = {
  xufa: () => {
    const { Engine } = require('@xufa/expression');
    const engine = new Engine({ statements: true, cacheSize: 0 });
    return (source) => engine.compile(source);
  },
  sandboxjs: () => {
    const Sandbox = require('@nyariv/sandboxjs').default;
    const sandbox = new Sandbox();
    // (Its let and const of the top of a program go into the scope given, the context: a second run on it fails. In a
    // function they are of each run.)
    return (source) => {
      const run = sandbox.compile(`function program() {${source}\n}\nreturn program();`);
      return (ctx) => run(ctx).run();
    };
  },
  'node:vm (no sandbox)': () => {
    const parsingContext = vm.createContext({});
    return (source) => {
      const fn = vm.compileFunction(source, NAMES_OF_CONTEXT, { parsingContext });
      return (ctx) => fn(ctx.a, ctx.b, ctx.user, ctx.items);
    };
  },
  'new Function (no sandbox)': () => (source) => {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...NAMES_OF_CONTEXT, source);
    return (ctx) => fn(ctx.a, ctx.b, ctx.user, ctx.items);
  },
};

// fn(i): a run on the context i (0 to 3).
function measure(fn, ms) {
  const sink = [];
  for (let i = 0; i < 2000; i += 1) sink[i & 7] = fn(i & 3); // eslint-disable-line no-bitwise
  let n = 0;
  const start = process.hrtime.bigint();
  const end = start + BigInt(ms) * 1000000n;
  while (process.hrtime.bigint() < end) {
    for (let i = 0; i < 64; i += 1) sink[i & 7] = fn(i & 3); // eslint-disable-line no-bitwise
    n += 64;
  }
  return n / (Number(process.hrtime.bigint() - start) / 1e9);
}

function child(engineName, caseName, mode, ms) {
  const compile = engines[engineName]();
  const source = cases[caseName];
  const ctxs = [0, 1, 2, 3].map((i) => context(i));
  // Checked against JavaScript first, on each context.
  const native = engines['new Function (no sandbox)']()(source);
  ctxs.forEach((ctx) => {
    const expected = native(ctx);
    const got = compile(source)(ctx);
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      throw new Error(`${engineName} ${caseName}: ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
    }
  });
  let ops;
  if (mode === 'run') {
    const run = compile(source);
    ops = measure((i) => run(ctxs[i]), ms);
  } else ops = measure((i) => compile(source)(ctxs[i]), ms);
  process.stdout.write(String(ops));
}

function format(ops) {
  if (ops === undefined) return '–';
  if (ops >= 1e6) return `${(ops / 1e6).toFixed(2)}M`;
  if (ops >= 1e3) return `${(ops / 1e3).toFixed(1)}k`;
  return ops.toFixed(0);
}

const median = (values) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];

function main() {
  const ms = Number(process.argv[2]) || 1000;
  const rounds = Number(process.argv[3]) || 3;
  const names = Object.keys(engines);
  for (const mode of ['run', 'once']) {
    process.stdout.write(
      mode === 'run'
        ? '\nCompiled once, then run (runs a second):\n\n'
        : '\nCompiled and run each time (runs a second):\n\n'
    );
    process.stdout.write(`| Case | ${names.join(' | ')} |\n| --- | ${names.map(() => '---:').join(' | ')} |\n`);
    for (const caseName of Object.keys(cases)) {
      const results = {};
      for (let round = 0; round < rounds; round += 1) {
        for (const name of names) {
          const out = execFileSync(process.execPath, [__filename, '--child', name, caseName, mode, String(ms)], {
            stdio: ['ignore', 'pipe', 'inherit'],
          });
          (results[name] = results[name] || []).push(Number(out));
        }
      }
      const row = names.map((name) => format(results[name] && median(results[name])));
      process.stdout.write(`| ${caseName} | ${row.join(' | ')} |\n`);
    }
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]));
else main();
