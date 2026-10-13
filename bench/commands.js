'use strict';

// The commands, as they are run: `xufa-lint`, `xufa-format --check` and `xufa-check` (with workers, and with
// --concurrency off) against `eslint` (with --concurrency off and auto) and `prettier --check`, on this repository with
// its config (ESLint's from it, as bench/lint.js makes it; prettier with its format options, on the files xufa-format
// formats). The median of the times of --runs runs of each (the first, which fills the compile caches, not counted).
//
//   node bench/commands.js [--runs 3]

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const PRETTIER = path.dirname(require.resolve('prettier/package.json', { paths: [__dirname] }));

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// The milliseconds of a command (its exit code: 0 or 1, problems or files not formatted, else an error).
function time(args) {
  const start = performance.now();
  const result = spawnSync(process.execPath, args, { cwd: ROOT, maxBuffer: 1e9 });
  const ms = performance.now() - start;
  if (result.status > 1) throw new Error(`${args.join(' ')}: ${result.stderr.toString().slice(0, 500)}`);
  return ms;
}

async function main() {
  const runs = Number(argument('runs', 3));
  const { loadConfig } = require(LINT);
  const { formattedFiles } = require(path.join(LINT, 'lib/format'));
  const formatted = formattedFiles([ROOT], await loadConfig(path.join(ROOT, 'xufa.lint.config.js')));
  // ESLint's config, from the repository's (bench/lint.js).
  const config = path.join(__dirname, '.eslint.config.mjs');
  fs.writeFileSync(
    config,
    "import lint from './lint.js';\nexport default lint.eslintConfig(await lint.repositoryConfig(false));\n"
  );
  const eslint = path.join(ESLINT, 'bin/eslint.js');
  const prettier = path.join(PRETTIER, 'bin/prettier.cjs');
  const bin = (name) => path.join(LINT, 'bin', `${name}.js`);
  const commands = [
    ['eslint', [eslint, '--config', config, '--concurrency', 'off', '.']],
    ['eslint --concurrency auto', [eslint, '--config', config, '--concurrency', 'auto', '.']],
    ['xufa-lint --concurrency off', [bin('xufa-lint'), '--concurrency', 'off']],
    ['xufa-lint', [bin('xufa-lint')]],
    [
      'prettier --check',
      [prettier, '--check', '--single-quote', '--trailing-comma', 'es5', '--print-width', '120', ...formatted],
    ],
    ['xufa-format --check --concurrency off', [bin('xufa-format'), '--check', '--concurrency', 'off']],
    ['xufa-format --check', [bin('xufa-format'), '--check']],
    ['xufa-check --concurrency off', [bin('xufa-check'), '--concurrency', 'off']],
    ['xufa-check', [bin('xufa-check')]],
  ];
  try {
    console.log(`${formatted.length} files formatted; the median of ${runs} runs`);
    for (const [name, args] of commands) {
      time(args);
      const times = Array.from({ length: runs }, () => time(args)).sort((a, b) => a - b);
      console.log(`${name.padEnd(38)} ${times[Math.floor(runs / 2)].toFixed(0).padStart(6)} ms`);
    }
  } finally {
    fs.rmSync(config, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
