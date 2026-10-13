'use strict';

// The formatter of @xufa/lint against prettier 3.9.9, on the files of this repository that xufa-format formats:
// JavaScript, TypeScript, JSON and markdown. Each formatter runs in a process of its own, measured as a command is:
// the time to load it, its first pass over the files (cold: what `xufa-format --check` takes), and the median of
// warm passes. Their outputs are compared too.
//
//   node bench/format.js [--rounds 5] [--only js|ts|json|md]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OPTIONS = { singleQuote: true, trailingComma: 'es5', printWidth: 120 };
const LANGUAGES = {
  js: /\.(?:[cm]?js|jsx)$/,
  ts: /\.(?:[cm]?ts|tsx)$/,
  json: /\.json$/,
  md: /\.(?:md|markdown)$/,
};

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// The files xufa-format formats here, by language.
async function corpus() {
  const { loadConfig } = require(path.join(ROOT, 'packages/lint'));
  const { formattedFiles } = require(path.join(ROOT, 'packages/lint/lib/format'));
  const configs = await loadConfig(path.join(ROOT, 'xufa.lint.config.js'));
  const files = formattedFiles([ROOT], configs);
  const byLanguage = {};
  for (const file of files) {
    const language = Object.keys(LANGUAGES).find((name) => LANGUAGES[name].test(file));
    (byLanguage[language] ??= []).push(file);
  }
  return byLanguage;
}

// In a child: load one formatter, then format the files `rounds` times.
async function child() {
  const [, , , which, listFile, rounds] = process.argv;
  const files = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  const texts = files.map((file) => fs.readFileSync(file, 'utf8'));
  let start = performance.now();
  const format =
    which === 'prettier'
      ? (() => {
          const prettier = require(require.resolve('prettier', { paths: [__dirname] }));
          return (text, filepath) => prettier.format(text, { ...OPTIONS, filepath });
        })()
      : (() => {
          const lint = require(path.join(ROOT, 'packages/lint'));
          return (text, filepath) => lint.format(text, { ...OPTIONS, filepath });
        })();
  const load = performance.now() - start;
  const times = [];
  let outputs;
  for (let round = 0; round < Number(rounds); round++) {
    start = performance.now();
    const out = [];
    for (let i = 0; i < files.length; i++) out.push(await format(texts[i], files[i]));
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
  const only = argument('only');
  const byLanguage = await corpus();
  const rows = [];
  for (const [language, files] of Object.entries(byLanguage)) {
    if (only && language !== only) continue;
    const listFile = path.join(require('node:os').tmpdir(), `xufa-bench-format-${language}.json`);
    fs.writeFileSync(listFile, JSON.stringify(files));
    const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    const run = (which) =>
      JSON.parse(
        execFileSync(process.execPath, [__filename, '--child', which, listFile, String(rounds + 1)], {
          maxBuffer: 1e9,
        }).toString()
      );
    const prettier = run('prettier');
    const xufa = run('xufa');
    const differ = files.filter((file, i) => prettier.outputs[i] !== xufa.outputs[i]);
    const stats = (result) => ({
      load: result.load,
      cold: result.times[0],
      warm: median(result.times.slice(1)),
      memory: result.memory,
    });
    rows.push({ language, files: files.length, bytes, prettier: stats(prettier), xufa: stats(xufa), differ });
  }
  const ms = (value) => `${value.toFixed(0)} ms`;
  const mb = (value) => `${(value / 1024 / 1024).toFixed(0)} MB`;
  const ratio = (a, b) => `${(a / b).toFixed(2)}x`;
  console.log(
    'language  files     KB | load: prettier  xufa | cold: prettier   xufa  speed | warm: prettier   xufa  speed | rss: prettier  xufa | same output'
  );
  for (const row of rows) {
    const p = row.prettier;
    const x = row.xufa;
    console.log(
      [
        row.language.padEnd(8),
        String(row.files).padStart(6),
        String(Math.round(row.bytes / 1024)).padStart(6),
        '|',
        ms(p.load).padStart(14),
        ms(x.load).padStart(7),
        '|',
        ms(p.cold).padStart(14),
        ms(x.cold).padStart(7),
        ratio(p.cold, x.cold).padStart(6),
        '|',
        ms(p.warm).padStart(14),
        ms(x.warm).padStart(7),
        ratio(p.warm, x.warm).padStart(6),
        '|',
        mb(p.memory).padStart(13),
        mb(x.memory).padStart(6),
        '|',
        row.differ.length ? `${row.differ.length} differ: ${row.differ.slice(0, 3).join(', ')}` : 'all',
      ].join(' ')
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
