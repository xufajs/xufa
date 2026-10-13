// A worker of lib/parallel.js (a child process, run as `worker.js <task> <config file>`): loads the config and the
// task, says so (null), then does each batch of [index, file, options] it is given and gives back
// [[index, result], ...]. Errors of files are results ({ message, stack }: an error crosses processes as those).

import { enableCompileCache } from 'node:module';

// Compiled code is kept on disk between runs, in each worker too.
enableCompileCache?.();

const [task, configFile] = process.argv.slice(2);
// One after the other: a config may require() @xufa/lint, which must not be loading (by import) at the same time.
const { loadConfig } = await import('./config.js');
const configs = await loadConfig(configFile);
const { TASKS } = await import('./worker-tasks.js');
const run = await TASKS[task]();

// A result with its error as a plain object: formatFile's ({ error }) or checkFile's ({ formatted: { error } }).
const plainError = (error) => error && { message: error.message, stack: error.stack };
function plain(result) {
  if (result?.error) return { ...result, error: plainError(result.error) };
  if (result?.formatted?.error)
    return { ...result, formatted: { ...result.formatted, error: plainError(result.formatted.error) } };
  return result;
}

process.on('message', async (batch) => {
  const done = [];
  for (const [index, file, options] of batch) done.push([index, plain(await run(file, configs, options))]);
  process.send(done);
});
process.send(null);
