// xufa-lint [paths...] [--fix] [--format stylish|json] [--config file] [--max-warnings n] [--quiet]
//   [--concurrency n|auto|off]
//
// Lints the files of the paths (the folder of the config by default) with xufa.lint.config.js, as `eslint` does.
// The exit code is 0 without errors (and no more warnings than --max-warnings), 1 with them, 2 when it cannot run.

import path from 'node:path';
import { loadConfig, findConfigFile } from './config.js';
import { filesOf } from './engine.js';
import { runFiles } from './parallel.js';
import * as formatters from './formatters.js';

const HELP = `Usage: xufa-lint [paths...] [options]

  --fix                Writes what the rules can fix
  --format <name>      stylish (the default) or json
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
    format: 'stylish',
    config: null,
    maxWarnings: -1,
    quiet: false,
    concurrency: 'auto',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const [, inline] = arg.split('=');
      return inline ?? argv[++i];
    };
    if (arg === '--fix') options.fix = true;
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
    const files = filesOf(paths, configs).map((one) => [one, { fix: options.fix }]);
    let results = await runFiles('lint', files, { configFile: file, configs, concurrency: options.concurrency });
    if (options.quiet) {
      results = results.map((result) => ({
        ...result,
        messages: result.messages.filter((message) => message.severity === 2),
        warningCount: 0,
        fixableWarningCount: 0,
      }));
    }
    const formatter = formatters[options.format];
    if (!formatter) throw new Error(`Unknown format: ${options.format} (stylish or json)`);
    const output = formatter(results, { color: options.color ?? Boolean(stdout.isTTY) });
    if (output) stdout.write(output.endsWith('\n') ? output : `${output}\n`);
    const errors = results.reduce((sum, result) => sum + result.errorCount, 0);
    const warnings = results.reduce((sum, result) => sum + result.warningCount, 0);
    if (errors > 0) return 1;
    if (options.maxWarnings >= 0 && warnings > options.maxWarnings) {
      stderr.write(`xufa-lint found too many warnings (maximum: ${options.maxWarnings}).\n`);
      return 1;
    }
    return 0;
  } catch (error) {
    stderr.write(`${error.stack ?? error.message}\n`);
    return 2;
  }
}

export { main, parseArgs };
