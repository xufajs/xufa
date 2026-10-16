'use strict';

// One parse for linting and formatting (xufa-check): the formatter takes the SourceFile the linter made of the same
// text (lib/typescript). On every file of `node bench/lint.js --tests` that the formatter formats: the problems and
// the output of linting then formatting it, the SourceFile shared, against those of each alone. Counted: the files
// whose SourceFile was shared. Exit code 1 on any difference.
//
//   node bench/lint-shared-parse.js [--show 5]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { watch, replace } = require('./lint-intercept');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const TYPESCRIPT = path.join(LINT, 'lib/typescript/index.js');
watch(TYPESCRIPT, ['takeSourceFile']);
const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;

async function main() {
  let shared = 0;
  const take = replace(TYPESCRIPT, 'takeSourceFile', (...args) => {
    const source = take(...args);
    if (source) shared += 1;
    return source;
  });
  const { ConfigArray, Linter, format } = require(LINT);
  const { parse } = require(path.join(LINT, 'lib/parser'));
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configs = new ConfigArray(config, ROOT);
  const linter = new Linter();
  const files = (await corpus(true)).filter((file) => configs.isFormatted(file));
  const differences = [];
  const outcome = async (run) => {
    try {
      return await run();
    } catch (error) {
      return `throws ${error.message}`;
    }
  };
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lintConfig = linterConfig(configs.configFor(file), file);
    const { ignores, ...options } = configs.configFor(file).format || {};
    const lint = () => outcome(() => linter.verify(text, lintConfig, file));
    const formatted = () => outcome(() => format(text, { ...options, filepath: file }));
    // Each alone: another text parsed in between.
    const lintAlone = await lint();
    parse('');
    const formatAlone = await formatted();
    // One parse: the linter, then the formatter.
    const lintShared = await lint();
    const formatShared = await formatted();
    if (!isDeepStrictEqual(lintAlone, lintShared)) differences.push({ file, kind: 'problems' });
    if (formatAlone !== formatShared) differences.push({ file, kind: 'output' });
  }
  console.log(`${files.length} files linted and formatted; the SourceFile shared for ${shared}`);
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences`);
  for (const { file, kind } of differences.slice(0, show)) console.log(`  ${path.relative(ROOT, file)}: ${kind}`);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
