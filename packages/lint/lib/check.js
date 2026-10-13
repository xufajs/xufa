// xufa-check [paths...] [--fix] [--write] [--format stylish|json] [--config file] [--max-warnings n] [--quiet]
//   [--concurrency n|auto|off]
//
// xufa-lint and xufa-format --check in one: each file of the paths (the folder of the config by default) is read once
// and parsed once, linted and then formatted (the formatter takes the SourceFile the linter made: lib/typescript).
// The problems as xufa-lint writes them, then the files that are not formatted as xufa-format --check lists them (on
// stderr with --format json). --fix writes what rules fix, --write what the formatter writes (of the fixed text).
// The exit code is 0 with no errors and every file formatted, 1 otherwise, 2 when it cannot run or the formatter
// cannot parse a file.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, findConfigFile } from './config.js';
import { filesOf, lintText } from './engine.js';
import { format, formattedFiles } from './format/index.js';
import * as formatters from './formatters.js';
import { runFiles } from './parallel.js';

const HELP = `Usage: xufa-check [paths...] [options]

  --fix                Writes what the rules can fix
  --write              Writes what the formatter writes
  --format <name>      stylish (the default) or json, for the problems
  --config <file>      The config (xufa.lint.config.js, found from the working folder up)
  --max-warnings <n>   Fails with more warnings than n
  --quiet              Errors only
  --concurrency <n>    Workers: a number, auto (the default: up to 4) or off
  --no-color           Without colors
  -h, --help           This help
`;

function parseArgs(argv) {
  const options = {
    paths: [],
    fix: false,
    write: false,
    format: 'stylish',
    config: null,
    maxWarnings: -1,
    concurrency: 'auto',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const [, inline] = arg.split('=');
      return inline ?? argv[++i];
    };
    if (arg === '--fix') options.fix = true;
    else if (arg === '--write' || arg === '-w') options.write = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--no-color') options.color = false;
    else if (arg === '--color') options.color = true;
    else if (arg.startsWith('--format') || arg === '-f') options.format = value();
    else if (arg.startsWith('--config') || arg === '-c') options.config = value();
    else if (arg.startsWith('--max-warnings')) options.maxWarnings = Number(value());
    else if (arg.startsWith('--concurrency')) options.concurrency = value();
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else options.paths.push(arg);
  }
  return options;
}

/**
 * Lints (with lint) and formats (with format) a file: { result (as lintText gives it), formatted: { filePath, changed,
 * error } }. fix and write write it. The formatter takes the linter's SourceFile (the text, unless fixed, is the same).
 */
async function checkFile(file, configs, { lint = true, format: formats = true, fix = false, write = false } = {}) {
  const text = fs.readFileSync(file, 'utf8');
  let current = text;
  let result;
  let formatted;
  if (lint) {
    result = lintText(text, configs.configFor(file), file, { fix });
    if (fix && result.output !== undefined) current = result.output;
  }
  if (formats) {
    const { ignores, ...options } = configs.configFor(file).format || {};
    try {
      const output = await format(current, { ...options, filepath: file });
      // (Written, a file is formatted.)
      formatted = { filePath: file, changed: !write && output !== current };
      if (write) current = output;
    } catch (error) {
      formatted = { filePath: file, changed: false, error };
    }
  }
  if (current !== text) fs.writeFileSync(file, current);
  return { result, formatted };
}

/**
 * Lints and formats the files of `paths`: { results (as lintFiles gives them), formatted: [{ filePath, changed,
 * error }] }, in the orders of xufa-lint and xufa-format. fix and write write the files. run(items) checks the items
 * ([file, options]: here, or in workers: lib/parallel.js).
 */
async function checkFiles(paths, configs, { fix = false, write = false, run } = {}) {
  const linted = new Set(filesOf(paths, configs));
  const formattable = formattedFiles(paths, configs);
  const order = new Map(formattable.map((file, i) => [file, i]));
  const files = [...linted, ...formattable.filter((file) => !linted.has(file))];
  const items = files.map((file) => [file, { lint: linted.has(file), format: order.has(file), fix, write }]);
  let checked = [];
  if (run) checked = await run(items);
  // One after the other: the formatter of a file takes the SourceFile its linter made.
  else for (const [file, options] of items) checked.push(await checkFile(file, configs, options));
  const results = checked.flatMap(({ result }) => (result ? [result] : []));
  const formatted = checked.flatMap(({ formatted: one }) => (one ? [one] : []));
  formatted.sort((a, b) => order.get(a.filePath) - order.get(b.filePath));
  return { results, formatted };
}

async function main(
  argv = process.argv.slice(2),
  { stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}
) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    stderr.write(`${error.message}\n\n${HELP}`);
    return 2;
  }
  if (options.help) {
    stdout.write(HELP);
    return 0;
  }
  try {
    const file = options.config ? path.resolve(cwd, options.config) : findConfigFile(cwd);
    if (!file) throw new Error('No xufa.lint.config.js was found (from the working folder up).');
    const configs = await loadConfig(file);
    const paths = options.paths.length
      ? options.paths.map((given) => path.resolve(cwd, given))
      : [path.dirname(path.resolve(file))];
    const formatter = formatters[options.format];
    if (!formatter) throw new Error(`Unknown format: ${options.format} (stylish or json)`);
    const run = (items) => runFiles('check', items, { configFile: file, configs, concurrency: options.concurrency });
    let { results, formatted } = await checkFiles(paths, configs, { ...options, run });
    if (options.quiet) {
      results = results.map((result) => ({
        ...result,
        messages: result.messages.filter((message) => message.severity === 2),
        warningCount: 0,
        fixableWarningCount: 0,
      }));
    }

    // The problems.
    const output = formatter(results, { color: options.color ?? Boolean(stdout.isTTY) });
    if (output) stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
    const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
    const tooManyWarnings = options.maxWarnings >= 0 && warnings > options.maxWarnings;
    if (tooManyWarnings) stderr.write(`xufa-check found too many warnings (maximum: ${options.maxWarnings}).\n`);

    // The files not formatted (and those the formatter cannot parse).
    const out = options.format === 'json' ? stderr : stdout;
    const shown = (result) => path.relative(cwd, result.filePath).split(path.sep).join('/');
    const failed = formatted.filter((result) => result.error);
    for (const result of failed) stderr.write(`[error] ${shown(result)}: ${result.error.message.split('\n')[0]}\n`);
    const changed = formatted.filter((result) => result.changed);
    for (const result of changed) out.write(`[warn] ${shown(result)}\n`);
    if (changed.length) {
      const which = changed.length === 1 ? 'the above file' : `${changed.length} files`;
      out.write(`[warn] Code style issues found in ${which}. Run xufa-check --write to fix.\n`);
    }

    if (failed.length) return 2;
    return errors > 0 || tooManyWarnings || changed.length ? 1 : 0;
  } catch (error) {
    stderr.write(`${error.stack ?? error.message}\n`);
    return 2;
  }
}

export { main, parseArgs, checkFiles, checkFile };
