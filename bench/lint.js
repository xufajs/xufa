'use strict';

// The linter of @xufa/lint against ESLint 9.39.5 (and @eslint/js's recommended rules), on the files of this
// repository that xufa-lint lints, with the config of the repository (xufa.lint.config.js): ESLint gets the same
// config, with @eslint/js's recommended rules for ours (no-unexpected-multiline off: the formatter's concern) and
// without the formatter's keys. Each linter runs in a process of its own, measured as a command is: the time to load
// it, its first pass over the files (cold: what `xufa-lint` takes) and the median of warm passes. The problems of
// every file are compared (rule, severity, message, place, fix, suggestions).
//
// --tests lints the tests of the packages too (the config ignores them): ESLint's tests of the rules and the other
// ported tests have problems, which the code of the repository does not.
//
//   node bench/lint.js [--rounds 5] [--tests] [--show 5]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const TEST_IGNORES = new Set(['packages/*/test/**', 'tools/sequelize-compat/test/**']);

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// The config of the repository, as its file exports it; with tests, without the ignores of tests.
async function repositoryConfig(tests) {
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  if (!tests) return config;
  return config.map((entry) =>
    entry.ignores && Object.keys(entry).length === 1
      ? { ignores: entry.ignores.filter((pattern) => !TEST_IGNORES.has(pattern)) }
      : entry
  );
}

// The same config for ESLint: @eslint/js's recommended rules for ours, no keys of the formatter.
function eslintConfig(config) {
  const { configs } = require(path.join(ROOT, 'packages/lint'));
  const js = require(require.resolve('@eslint/js', { paths: [__dirname] }));
  return config.map((entry) => {
    if (entry === configs.recommended) {
      return {
        ...js.configs.recommended,
        rules: { ...js.configs.recommended.rules, 'no-unexpected-multiline': 'off' },
      };
    }
    const { format, ...rest } = entry;
    return format && Object.keys(rest).length === 0 ? {} : rest;
  });
}

// The files xufa-lint lints here.
async function corpus(tests) {
  const { ConfigArray } = require(path.join(ROOT, 'packages/lint'));
  const { filesOf } = require(path.join(ROOT, 'packages/lint/lib/engine'));
  const configs = new ConfigArray(await repositoryConfig(tests), ROOT);
  return filesOf([ROOT], configs);
}

// A problem, as both linters write it, to compare.
const problemOf = (message) =>
  JSON.stringify([
    message.ruleId,
    message.severity,
    message.message,
    message.line,
    message.column,
    message.endLine,
    message.endColumn,
    message.fix ?? null,
    (message.suggestions ?? []).map((suggestion) => [suggestion.desc, suggestion.fix]),
  ]);

// In a child: load one linter, then lint the files `rounds` times.
async function child() {
  const [, , , which, listFile, rounds, tests] = process.argv;
  const files = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const texts = files.map((file) => fs.readFileSync(file, 'utf8'));
  const config = await repositoryConfig(tests === 'true');
  let start = performance.now();
  let lint;
  if (which === 'eslint') {
    const { ESLint } = require(require.resolve('eslint', { paths: [__dirname] }));
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: eslintConfig(config) });
    lint = async (text, file) => (await eslint.lintText(text, { filePath: file }))[0]?.messages ?? [];
  } else {
    const { ConfigArray } = require(path.join(ROOT, 'packages/lint'));
    const { lintText } = require(path.join(ROOT, 'packages/lint/lib/engine'));
    const configs = new ConfigArray(config, ROOT);
    lint = async (text, file) => lintText(text, configs.configFor(file), file).messages;
  }
  const load = performance.now() - start;
  const times = [];
  let outputs;
  for (let round = 0; round < Number(rounds); round++) {
    start = performance.now();
    const out = [];
    for (let i = 0; i < files.length; i++) out.push((await lint(texts[i], files[i])).map(problemOf));
    times.push(performance.now() - start);
    outputs ??= out;
  }
  const memory = process.memoryUsage().rss;
  process.stdout.write(JSON.stringify({ load, times, memory, outputs }));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const rounds = Number(argument('rounds', 5));
  const tests = process.argv.includes('--tests');
  const show = Number(argument('show', 5));
  const files = await corpus(tests);
  const listFile = path.join(os.tmpdir(), `xufa-bench-lint-${tests ? 'tests' : 'code'}.json`);
  fs.writeFileSync(listFile, JSON.stringify(files));
  const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const run = (which) =>
    JSON.parse(
      execFileSync(process.execPath, [__filename, '--child', which, listFile, String(rounds + 1), String(tests)], {
        maxBuffer: 2e9,
      }).toString()
    );
  const eslint = run('eslint');
  const xufa = run('xufa');
  const count = (result) => result.outputs.reduce((sum, problems) => sum + problems.length, 0);
  const differ = [];
  files.forEach((file, i) => {
    const theirs = new Set(eslint.outputs[i]);
    const ours = new Set(xufa.outputs[i]);
    const missing = [...theirs].filter((problem) => !ours.has(problem));
    const extra = [...ours].filter((problem) => !theirs.has(problem));
    if (missing.length || extra.length) differ.push({ file: path.relative(ROOT, file), missing, extra });
  });
  const stats = (result) => ({
    load: result.load,
    cold: result.times[0],
    warm: median(result.times.slice(1)),
    memory: result.memory,
  });
  const e = stats(eslint);
  const x = stats(xufa);
  const ms = (value) => `${value.toFixed(0)} ms`;
  const mb = (value) => `${(value / 1024 / 1024).toFixed(0)} MB`;
  const ratio = (a, b) => `${(a / b).toFixed(2)}x`;
  console.log(
    `${files.length} files, ${Math.round(bytes / 1024)} KB${tests ? ' (with tests)' : ''}; problems: ESLint ${count(eslint)}, xufa ${count(xufa)}`
  );
  console.log('          |   load |   cold |   warm |    rss');
  console.log(
    `ESLint    | ${ms(e.load).padStart(6)} | ${ms(e.cold).padStart(6)} | ${ms(e.warm).padStart(6)} | ${mb(e.memory).padStart(6)}`
  );
  console.log(
    `xufa      | ${ms(x.load).padStart(6)} | ${ms(x.cold).padStart(6)} | ${ms(x.warm).padStart(6)} | ${mb(x.memory).padStart(6)}`
  );
  console.log(
    `speed     | ${ratio(e.load, x.load).padStart(6)} | ${ratio(e.cold, x.cold).padStart(6)} | ${ratio(e.warm, x.warm).padStart(6)} |`
  );
  if (!differ.length) {
    console.log('same problems in every file');
    return;
  }
  console.log(`${differ.length} files differ:`);
  for (const { file, missing, extra } of differ.slice(0, show)) {
    console.log(`  ${file}`);
    for (const problem of missing) console.log(`    - ${problem}`);
    for (const problem of extra) console.log(`    + ${problem}`);
  }
  process.exitCode = 1;
}

module.exports = { corpus, repositoryConfig, eslintConfig };

if (require.main !== module) {
  // Required by the checks of pieces of the linter against the originals (bench/lint-*.js): their files.
} else if (process.argv[2] === '--child') {
  child().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
