'use strict';

// The linter of @xufa/lint against ESLint 9.39.5 on code written by others (bench/corpus.js: the JavaScript of the
// installed packages), with the recommended rules (@eslint/js's for ESLint, but no-unexpected-multiline), Node's
// globals, and the source type of each file (.cjs CommonJS, .mjs a module, .js its package's "type"). Each file is
// one of: the same problems, both cannot parse it (their messages differ: espree's and TypeScript's), only one cannot,
// or different problems. What differs is compared with bench/corpus-baseline.json: exit code 1 on what is not there;
// --save writes what differs now.
//
//   node bench/lint-corpus.js [--show 5] [--save]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { corpus } = require('./corpus');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'node_modules/.pnpm');
const BASELINE = path.join(__dirname, 'corpus-baseline.json');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};

// The source type of a file: by its extension, else by the "type" of the nearest package.json.
function sourceTypeOf(file) {
  if (file.endsWith('.cjs')) return 'commonjs';
  if (file.endsWith('.mjs')) return 'module';
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try {
        return JSON.parse(fs.readFileSync(manifest, 'utf8')).type === 'module' ? 'module' : 'commonjs';
      } catch {
        return 'commonjs';
      }
    }
  }
  return 'commonjs';
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

async function main() {
  // (/* eslint-env */ comments: ESLint warns of each.)
  process.removeAllListeners('warning');
  const show = Number(argument('show', 5));
  const { Linter: TheirLinter } = require(ESLINT);
  const js = require(require.resolve('@eslint/js', { paths: [__dirname] }));
  const { Linter, configs, globals } = await import(pathToFileURL(path.join(ROOT, 'packages/lint/index.js')).href);
  const theirLinter = new TheirLinter({ configType: 'flat', cwd: ROOT });
  const ourLinter = new Linter();
  const theirRules = { ...js.configs.recommended.rules, 'no-unexpected-multiline': 'off' };
  const files = corpus().js;
  const counts = {
    same: 0,
    'both cannot parse': 0,
    'only ours cannot parse': 0,
    'only ESLint cannot parse': 0,
    differs: 0,
  };
  const found = [];
  let problems = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const languageOptions = { ecmaVersion: 'latest', sourceType: sourceTypeOf(file), globals: globals.node };
    // (ESLint ignores what is under node_modules and outside its folder: both are given a path in the repository made
    // of the file's in the store, which no rule reads.)
    const filename = path.join(
      ROOT,
      'corpus',
      path.relative(STORE, file).replaceAll(`${path.sep}node_modules${path.sep}`, path.sep)
    );
    const run = (linter, rules) => {
      const messages = linter.verify(text, { languageOptions, rules }, filename);
      return { fatal: messages.some((message) => message.fatal), problems: messages.map(problemOf) };
    };
    let theirs = run(theirLinter, theirRules);
    let ours = run(ourLinter, configs.recommended.rules);
    // ES modules in a package of CommonJS (or the other way): the other source type, when neither parses it.
    if (theirs.fatal && ours.fatal) {
      languageOptions.sourceType = languageOptions.sourceType === 'module' ? 'commonjs' : 'module';
      theirs = run(theirLinter, theirRules);
      ours = run(ourLinter, configs.recommended.rules);
    }
    let kind;
    if (theirs.fatal && ours.fatal) kind = 'both cannot parse';
    else if (ours.fatal) kind = 'only ours cannot parse';
    else if (theirs.fatal) kind = 'only ESLint cannot parse';
    else kind = JSON.stringify(theirs.problems) === JSON.stringify(ours.problems) ? 'same' : 'differs';
    counts[kind] += 1;
    problems += theirs.fatal ? 0 : theirs.problems.length;
    if (kind === 'same' || kind === 'both cannot parse') continue;
    // What one has and the other has not.
    const missing = theirs.problems.filter((problem) => !ours.problems.includes(problem));
    const extra = ours.problems.filter((problem) => !theirs.problems.includes(problem));
    found.push({ key: `lint ${path.relative(STORE, file).split(path.sep).join('/')}`, kind, missing, extra });
  }
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const known = new Set(Object.keys(baseline).filter((key) => key.startsWith('lint ')));
  const fresh = found.filter(({ key }) => !known.has(key));
  console.log(`${files.length} files, ${problems} problems of ESLint's:`, counts);
  console.log(`${found.length} not the same (${found.length - fresh.length} known, ${fresh.length} new)`);
  for (const { key, kind, missing, extra } of fresh.slice(0, show)) {
    console.log(`  ${kind}: ${key}`);
    for (const problem of missing.slice(0, 3)) console.log(`    - ${problem.slice(0, 300)}`);
    for (const problem of extra.slice(0, 3)) console.log(`    + ${problem.slice(0, 300)}`);
  }
  if (process.argv.includes('--save')) {
    const kept = Object.fromEntries(Object.entries(baseline).filter(([key]) => !key.startsWith('lint ')));
    for (const { key, kind } of found) kept[key] = kind;
    fs.writeFileSync(BASELINE, `${JSON.stringify(kept, null, 2)}\n`);
    console.log(`bench/corpus-baseline.json: ${found.length} differences of the linter`);
  } else if (fresh.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
