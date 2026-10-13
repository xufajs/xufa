'use strict';

// xufa-format [paths...] [--check | --write] [--config file]
//
// Formats the files of the paths (the folder of the config by default) as prettier 3.9.9 does, with the format
// options of xufa.lint.config.js. --check (the default) lists the files that are not formatted (exit 1 when any is);
// --write formats them. The exit code is 2 when it cannot run or a file cannot be parsed.

const path = require('node:path');
const { loadConfig, findConfigFile } = require('../config');
const { formatFiles } = require('./index');

const HELP = `Usage: xufa-format [paths...] [options]

  --check          Lists the files that are not formatted (the default)
  --write          Formats them
  --config <file>  The config (xufa.lint.config.js, found from the working folder up)
  -h, --help       This help
`;

function parseArgs(argv) {
  const options = { paths: [], write: false, config: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--write' || arg === '-w') options.write = true;
    else if (arg === '--check' || arg === '-c') options.write = false;
    else if (arg.startsWith('--config')) options.config = arg.includes('=') ? arg.split('=')[1] : argv[++i];
    else if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else options.paths.push(arg);
  }
  return options;
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
    const shown = (result) => path.relative(cwd, result.filePath).split(path.sep).join('/');
    if (!options.write) stdout.write('Checking formatting...\n');
    const results = await formatFiles(paths, configs, { write: options.write });
    const failed = results.filter((result) => result.error);
    for (const result of failed) stderr.write(`[error] ${shown(result)}: ${result.error.message.split('\n')[0]}\n`);
    const changed = results.filter((result) => result.changed);
    if (options.write) {
      for (const result of changed) stdout.write(`${shown(result)}\n`);
      stdout.write(`${changed.length} of ${results.length} files formatted.\n`);
      return failed.length ? 2 : 0;
    }
    for (const result of changed) stdout.write(`[warn] ${shown(result)}\n`);
    if (changed.length) {
      stdout.write(
        `[warn] Code style issues found in ${changed.length === 1 ? 'the above file' : `${changed.length} files`}. Run xufa-format --write to fix.\n`
      );
    } else if (!failed.length) {
      stdout.write('All matched files are formatted.\n');
    }
    if (failed.length) return 2;
    return changed.length ? 1 : 0;
  } catch (error) {
    stderr.write(`${error.stack ?? error.message}\n`);
    return 2;
  }
}

module.exports = { main, parseArgs };
