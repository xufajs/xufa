'use strict';

// xufa-check (lint and check the formatting, each file parsed once) against the two commands it replaces,
// `xufa-lint` and `xufa-format --check`, and against `eslint` and `prettier --check`, on this repository: the files
// xufa-lint lints and those xufa-format formats, with the config of the repository (prettier with its format options,
// ESLint as bench/lint.js gives it the config). Each tool runs in a process of its own, measured as a command is: the
// time to load it, its first pass over the files (cold) and the median of warm passes; two commands are two processes
// (their loads and passes added).
//
//   node bench/check.js [--rounds 5]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { corpus, repositoryConfig, eslintConfig } = require('./lint');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const OPTIONS = { singleQuote: true, trailingComma: 'es5', printWidth: 120 };

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// What a tool does with a file: lint it, format it, or both (xufa-check).
async function toolOf(which) {
  const config = await repositoryConfig(false);
  if (which === 'eslint') {
    const { ESLint } = require(require.resolve('eslint', { paths: [__dirname] }));
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: eslintConfig(config) });
    return { lint: async (text, file) => (await eslint.lintText(text, { filePath: file }))[0]?.messages.length };
  }
  if (which === 'prettier') {
    const prettier = require(require.resolve('prettier', { paths: [__dirname] }));
    return { format: async (text, file) => (await prettier.format(text, { ...OPTIONS, filepath: file })) !== text };
  }
  const { ConfigArray, format } = require(LINT);
  const { lintText } = require(path.join(LINT, 'lib/engine'));
  const configs = new ConfigArray(config, ROOT);
  const lint = async (text, file) => lintText(text, configs.configFor(file), file).messages.length;
  const formatted = async (text, file) => (await format(text, { ...OPTIONS, filepath: file })) !== text;
  if (which === 'xufa-lint') return { lint };
  if (which === 'xufa-format') return { format: formatted };
  return { lint, format: formatted };
}

// In a child: load one tool, then run it on the files `rounds` times.
async function child() {
  const [, , , which, listFile, rounds] = process.argv;
  const { lint: lintFiles, format: formatFiles } = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  let start = performance.now();
  const tool = await toolOf(which);
  const load = performance.now() - start;
  const lints = new Set(tool.lint ? lintFiles : []);
  const formats = new Set(tool.format ? formatFiles : []);
  const files = [...lints, ...[...formats].filter((file) => !lints.has(file))];
  const times = [];
  let problems = 0;
  let unformatted = 0;
  for (let round = 0; round < Number(rounds); round++) {
    start = performance.now();
    problems = 0;
    unformatted = 0;
    for (const file of files) {
      // Read in the pass, as a command reads them.
      const text = fs.readFileSync(file, 'utf8');
      if (lints.has(file)) problems += await tool.lint(text, file);
      if (formats.has(file) && (await tool.format(text, file))) unformatted += 1;
    }
    times.push(performance.now() - start);
  }
  process.stdout.write(JSON.stringify({ load, times, problems, unformatted, memory: process.memoryUsage().rss }));
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function main() {
  const rounds = Number(argument('rounds', 5));
  const { formattedFiles } = require(path.join(LINT, 'lib/format'));
  const { loadConfig } = require(LINT);
  const lint = await corpus(false);
  const format = formattedFiles([ROOT], await loadConfig(path.join(ROOT, 'xufa.lint.config.js')));
  const listFile = path.join(os.tmpdir(), 'xufa-bench-check.json');
  fs.writeFileSync(listFile, JSON.stringify({ lint, format }));
  const run = (which) => {
    const result = JSON.parse(
      execFileSync(process.execPath, [__filename, '--child', which, listFile, String(rounds + 1)], {
        maxBuffer: 1e8,
      }).toString()
    );
    return { ...result, cold: result.load + result.times[0], warm: median(result.times.slice(1)) };
  };
  const sum = (...results) => ({
    cold: results.reduce((total, result) => total + result.cold, 0),
    warm: results.reduce((total, result) => total + result.warm, 0),
    problems: results.reduce((total, result) => total + result.problems, 0),
    unformatted: results.reduce((total, result) => total + result.unformatted, 0),
  });
  const rows = [
    ['eslint + prettier --check', sum(run('eslint'), run('prettier'))],
    ['xufa-lint + xufa-format --check', sum(run('xufa-lint'), run('xufa-format'))],
    ['xufa-check', run('check')],
  ];
  const all = new Set([...lint, ...format]);
  console.log(`${lint.length} files linted, ${format.length} formatted (${all.size} files)`);
  const check = rows.at(-1)[1];
  console.log('                                |    cold |    warm | problems | not formatted | xufa-check is');
  for (const [name, result] of rows) {
    const faster = `${(result.cold / check.cold).toFixed(2)}x, ${(result.warm / check.warm).toFixed(2)}x`;
    console.log(
      `${name.padEnd(31)} | ${result.cold.toFixed(0).padStart(4)} ms | ${result.warm.toFixed(0).padStart(4)} ms | ${String(result.problems).padStart(8)} | ${String(result.unformatted).padStart(13)} | ${faster}`
    );
  }
}

if (process.argv[2] === '--child') {
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
