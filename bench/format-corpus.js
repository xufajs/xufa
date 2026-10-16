'use strict';

// The formatter of @xufa/lint against prettier 3.9.9 on code written by others (bench/corpus.js: JavaScript,
// TypeScript, declarations, markdown, JSON of the installed packages), with the repository's options and with
// prettier's defaults. Each file is one of: the same output, both reject it, only prettier formats it (ours rejects),
// only ours formats it, or a different output. What differs is compared with bench/corpus-baseline.json (the
// differences known): exit code 1 on one that is not there. --save writes what differs now as the baseline.
//
//   node bench/format-corpus.js [--only js|ts|dts|md|json] [--show 5] [--save]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { corpus } = require('./corpus');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'node_modules/.pnpm');
const BASELINE = path.join(__dirname, 'corpus-baseline.json');
const OPTION_SETS = { repository: { singleQuote: true, trailingComma: 'es5', printWidth: 120 }, defaults: {} };

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

async function outcome(run) {
  try {
    return { output: await run() };
  } catch (error) {
    return { error: String(error.message).split('\n')[0] };
  }
}

async function main() {
  const only = argument('only', null);
  const show = Number(argument('show', 5));
  const prettier = require(require.resolve('prettier', { paths: [__dirname] }));
  const { format } = await import(pathToFileURL(path.join(ROOT, 'packages/lint/index.js')).href);
  const files = Object.entries(corpus())
    .filter(([kind]) => !only || kind === only)
    .flatMap(([, list]) => list);
  const counts = { same: 0, 'both reject': 0, 'ours rejects': 0, 'only ours formats': 0, differs: 0 };
  const found = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [set, options] of Object.entries(OPTION_SETS)) {
      const theirs = await outcome(() => prettier.format(text, { ...options, filepath: file }));
      const ours = await outcome(() => format(text, { ...options, filepath: file }));
      let kind;
      if (theirs.error !== undefined && ours.error !== undefined) kind = 'both reject';
      else if (ours.error !== undefined) kind = 'ours rejects';
      else if (theirs.error !== undefined) kind = 'only ours formats';
      else kind = ours.output === theirs.output ? 'same' : 'differs';
      counts[kind] += 1;
      if (kind !== 'same' && kind !== 'both reject') {
        found.push({
          key: `format ${set} ${path.relative(STORE, file).split(path.sep).join('/')}`,
          kind,
          error: ours.error ?? theirs.error,
        });
      }
    }
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const known = new Set(Object.keys(baseline).filter((key) => key.startsWith('format ')));
  const fresh = found.filter(({ key }) => !known.has(key));
  console.log(`${files.length} files, ${Object.keys(OPTION_SETS).length} sets of options:`, counts);
  console.log(`${found.length} not the same (${found.length - fresh.length} known, ${fresh.length} new)`);
  const byKind = {};
  for (const item of fresh) (byKind[item.kind] ??= []).push(item);
  for (const [kind, items] of Object.entries(byKind)) {
    console.log(`  ${kind}: ${items.length}`);
    for (const { key, error } of items.slice(0, show))
      console.log(`    ${key}${error ? `: ${error.slice(0, 150)}` : ''}`);
  }
  if (process.argv.includes('--save')) {
    const kept = Object.fromEntries(Object.entries(baseline).filter(([key]) => !key.startsWith('format ')));
    for (const { key, kind } of found) kept[key] = kind;
    fs.writeFileSync(BASELINE, `${JSON.stringify(kept, null, 2)}\n`);
    console.log(`bench/corpus-baseline.json: ${found.length} differences of the formatter`);
  } else if (fresh.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
