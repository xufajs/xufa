// @xufa/template against the template engines people use: Handlebars, Mustache, Nunjucks (whose expressions are
// sandboxed, as ours), and Eta and EJS (templates of JavaScript, which run any code they hold). Every engine escapes
// HTML, and each output is checked against ours before it is measured. Each engine and case runs in a process of its
// own, for a time, on four contexts in turn, and the median of the rounds is shown: templates compiled once and rendered (`render`), and
// compiled and rendered each time (`once`).
// node bench/micro/template.js [ms per measure] [rounds]
const { execFileSync } = require('node:child_process');

// Four contexts of different values, taken in turn: no engine renders the same values again and again (V8 could fold
// what does not change, and caches would hide the work).
const NAMES = ['Ada', 'Grace', 'Hedy', 'Joan'];
const context = (n = 0) => ({
  title: `Products & prices ${n}`,
  user: { name: NAMES[n] },
  count: 7 + n,
  items: Array.from({ length: 20 }, (_, i) => ({
    name: `Item <${i + n}> & co`,
    price: i * 3 + 1 + n,
    sale: (i + n) % 3 === 0,
  })),
});

const cases = {
  'one line': {
    xufa: 'Hello {{ user.name }}, you have {{ count }} new messages.',
    handlebars: 'Hello {{user.name}}, you have {{count}} new messages.',
    mustache: 'Hello {{user.name}}, you have {{count}} new messages.',
    nunjucks: 'Hello {{ user.name }}, you have {{ count }} new messages.',
    eta: 'Hello <%= it.user.name %>, you have <%= it.count %> new messages.',
    ejs: 'Hello <%= user.name %>, you have <%= count %> new messages.',
  },
  'list of 20 (each, if)': {
    xufa: '<h1>{{ title }}</h1><ul>{{#each items as item}}<li>{{ item.name }}: {{ item.price }}{{#if item.sale}} (sale){{/if}}</li>{{/each}}</ul>',
    handlebars:
      '<h1>{{title}}</h1><ul>{{#each items}}<li>{{name}}: {{price}}{{#if sale}} (sale){{/if}}</li>{{/each}}</ul>',
    mustache: '<h1>{{title}}</h1><ul>{{#items}}<li>{{name}}: {{price}}{{#sale}} (sale){{/sale}}</li>{{/items}}</ul>',
    nunjucks:
      '<h1>{{ title }}</h1><ul>{% for item in items %}<li>{{ item.name }}: {{ item.price }}{% if item.sale %} (sale){% endif %}</li>{% endfor %}</ul>',
    eta: '<h1><%= it.title %></h1><ul><% it.items.forEach(function (item) { %><li><%= item.name %>: <%= item.price %><% if (item.sale) { %> (sale)<% } %></li><% }) %></ul>',
    ejs: '<h1><%= title %></h1><ul><% items.forEach(function (item) { %><li><%= item.name %>: <%= item.price %><% if (item.sale) { %> (sale)<% } %></li><% }) %></ul>',
  },
};

// Each engine: compile(source) gives render(context).
const engines = {
  xufa: () => {
    const { TemplateEngine } = require('@xufa/template');
    const engine = new TemplateEngine({ cacheSize: 0 });
    return (source) => engine.compile(source);
  },
  handlebars: () => {
    const Handlebars = require('handlebars');
    return (source) => Handlebars.compile(source);
  },
  mustache: () => {
    const Mustache = require('mustache');
    // Mustache keeps what it parses: its cache is emptied to compile each time.
    return (source, once) => {
      if (once) Mustache.clearCache();
      return (ctx) => Mustache.render(source, ctx);
    };
  },
  nunjucks: () => {
    const nunjucks = require('nunjucks');
    const env = new nunjucks.Environment(null, { autoescape: true });
    return (source) => {
      const template = nunjucks.compile(source, env);
      return (ctx) => template.render(ctx);
    };
  },
  eta: () => {
    const { Eta } = require('eta');
    const eta = new Eta({ autoEscape: true, cache: false });
    return (source) => {
      const fn = eta.compile(source);
      return (ctx) => eta.render(fn, ctx);
    };
  },
  ejs: () => {
    const ejs = require('ejs');
    return (source) => ejs.compile(source);
  },
};

// The engines escape ' and = and / their own way; what is written here has none of them.
const normalize = (text) => text;

// fn(i): a render on the context i (0 to 3).
function measure(fn, ms) {
  let sink = '';
  for (let i = 0; i < 500; i += 1) sink = fn(i & 3); // eslint-disable-line no-bitwise
  let n = 0;
  const start = process.hrtime.bigint();
  const end = start + BigInt(ms) * 1000000n;
  while (process.hrtime.bigint() < end) {
    for (let i = 0; i < 16; i += 1) sink = fn(i & 3); // eslint-disable-line no-bitwise
    n += 16;
  }
  if (sink === null) throw new Error('unreachable');
  return n / (Number(process.hrtime.bigint() - start) / 1e9);
}

function child(engineName, caseName, mode, ms) {
  const compile = engines[engineName]();
  const source = cases[caseName][engineName];
  const ctxs = [0, 1, 2, 3].map((n) => context(n));
  // Checked against ours first, on each context.
  const ours = engines.xufa()(cases[caseName].xufa);
  ctxs.forEach((ctx) => {
    const expected = ours(ctx);
    const got = compile(source)(ctx);
    if (normalize(got) !== normalize(expected)) {
      throw new Error(`${engineName} ${caseName}:\n${got}\n(expected)\n${expected}`);
    }
  });
  let ops;
  if (mode === 'render') {
    const render = compile(source);
    ops = measure((i) => render(ctxs[i]), ms);
  } else ops = measure((i) => compile(source, true)(ctxs[i]), ms);
  process.stdout.write(String(ops));
}

function format(ops) {
  if (ops >= 1e6) return `${(ops / 1e6).toFixed(2)}M`;
  if (ops >= 1e3) return `${(ops / 1e3).toFixed(1)}k`;
  return ops.toFixed(0);
}

const median = (values) => [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)];

function main() {
  const ms = Number(process.argv[2]) || 1000;
  const rounds = Number(process.argv[3]) || 3;
  const names = Object.keys(engines);
  for (const mode of ['render', 'once']) {
    process.stdout.write(
      mode === 'render'
        ? '\nCompiled once, then rendered (renders a second):\n\n'
        : '\nCompiled and rendered each time (renders a second):\n\n'
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
      process.stdout.write(`| ${caseName} | ${names.map((name) => format(median(results[name]))).join(' | ')} |\n`);
    }
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]));
else main();
