// @xufa/expression against the evaluators of expressions people use (jexl, expr-eval, filtrex, SandboxJS) and against
// JavaScript itself (new Function: no sandbox, the bound of what can be done). Each engine and case runs in a process
// of its own, for a time, and the median of the rounds is shown. Two measures: an expression compiled once and run
// (`run`), and compiled and run each time (`once`: what a one-off expression costs).
// node bench/micro/expression.js [ms per measure] [rounds]
const { execFileSync } = require('node:child_process');

// Four contexts of different values, taken in turn: V8 cannot fold an expression on values that do not change (it does
// for JavaScript itself, which would then be measured doing next to nothing).
const NAMES = ['ada', 'grace', 'hedy', 'joan'];
const CITIES = ['London', 'New York', 'Vienna', 'Paris'];
const context = (i = 0) => ({
  a: 3 + i,
  b: 4 - (i % 2),
  user: { name: NAMES[i], tags: ['x', 'y', 'z'], address: { city: CITIES[i] } },
  items: [
    { price: 2 + i, quantity: 10 },
    { price: 20, quantity: 1 + i },
    { price: 35, quantity: 2 },
    { price: 7, quantity: 3 },
  ],
});

// The source of each case in the syntax of each engine (none: the engine cannot say it).
const cases = {
  arithmetic: {
    js: 'a + b * 2',
    jexl: 'a + b * 2',
    'expr-eval': 'a + b * 2',
    filtrex: 'a + b * 2',
  },
  member: {
    js: 'user.address.city',
    jexl: 'user.address.city',
    'expr-eval': 'user.address.city',
    filtrex: 'city of address of user',
  },
  condition: {
    js: "a > 2 && b == 4 ? 'big' : 'small'",
    jexl: "a > 2 && b == 4 ? 'big' : 'small'",
    'expr-eval': "a > 2 and b == 4 ? 'big' : 'small'",
    filtrex: 'if a > 2 and b == 4 then "big" else "small"',
  },
  'method call': { js: 'user.name.toUpperCase()' },
  'map and reduce': { js: 'items.map(i => i.price * i.quantity).reduce((sum, v) => sum + v, 0)' },
  'template literal': { js: '`${user.name} lives in ${user.address.city}`' },
};

// Each engine: compile(source) gives run(context).
const engines = {
  xufa: {
    syntax: 'js',
    compile: () => {
      const { Engine } = require('@xufa/expression');
      const engine = new Engine({ cacheSize: 0 });
      return (source) => engine.compile(source);
    },
  },
  jexl: {
    syntax: 'jexl',
    compile: () => {
      const jexl = require('jexl');
      return (source) => {
        const expression = jexl.compile(source);
        return (ctx) => expression.evalSync(ctx);
      };
    },
  },
  'expr-eval': {
    syntax: 'expr-eval',
    compile: () => {
      const { Parser } = require('expr-eval');
      const parser = new Parser();
      return (source) => {
        const expression = parser.parse(source);
        return (ctx) => expression.evaluate(ctx);
      };
    },
  },
  filtrex: {
    syntax: 'filtrex',
    compile: () => {
      const { compileExpression } = require('filtrex');
      return (source) => compileExpression(source);
    },
  },
  sandboxjs: {
    syntax: 'js',
    compile: () => {
      const Sandbox = require('@nyariv/sandboxjs').default;
      const sandbox = new Sandbox();
      return (source) => {
        const run = sandbox.compile(`return ${source}`);
        return (ctx) => run(ctx).run();
      };
    },
  },
  'new Function (no sandbox)': {
    syntax: 'js',
    compile: () => (source) => {
      const names = Object.keys(context());
      // eslint-disable-next-line no-new-func
      const fn = new Function(...names, `return (${source});`);
      return (ctx) => fn(ctx.a, ctx.b, ctx.user, ctx.items);
    },
  },
};

const sourceOf = (engine, caseName) => cases[caseName][engines[engine].syntax];

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
  const compile = engines[engineName].compile();
  const source = sourceOf(engineName, caseName);
  const ctxs = [0, 1, 2, 3].map((i) => context(i));
  // Checked against JavaScript first, on each context.
  const native = engines['new Function (no sandbox)'].compile();
  ctxs.forEach((ctx) => {
    const expected = native(sourceOf('new Function (no sandbox)', caseName))(ctx);
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
          if (!sourceOf(name, caseName)) continue;
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
