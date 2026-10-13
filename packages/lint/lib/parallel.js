// Files in parallel: workers (./worker.js, child processes: threads share V8's threads of compiling and collecting, and
// are slower) lint, format or check them (a task of ./worker-tasks.js), each with the config loaded from its file,
// taking a few files at a time, the largest first (so that no worker is left with a large one at the end). The results
// come in the order of the files. With fewer files than workers pay for (each loads the config, the linter and
// TypeScript's parser), or concurrency 'off', the files are done here, one after the other.
//
//   runFiles(task, [[file, options], ...], { configFile, configs, concurrency: 'auto' | 'off' | n })

import fs from 'node:fs';
import os from 'node:os';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WORKER = fileURLToPath(new URL('./worker.js', import.meta.url));
// Files given to a worker at a time.
const BATCH = 4;
// Below this many files for each, a worker costs more than it saves (it starts in about 0.1 s, and its code is slow
// until V8 has compiled it: 0.4 s of a worker's time).
const FILES_PER_WORKER = 24;
// 'auto': the cores but one (the main thread's), at most this many. More are slower: each compiles the code again,
// and they share the memory (on an Apple M4 Max, 14 cores, the repository: 4 workers 1.43 s, 6 1.42 s, 8 1.59 s, 10
// 1.79 s to lint; 2.2, 2.6, 2.9, 3.2 s to format).
const MOST = 4;

/** How many workers for this many files: none means here. */
function workersFor(concurrency, files) {
  if (concurrency === 'off') return 0;
  const wanted = concurrency === 'auto' ? Math.min(os.availableParallelism() - 1, MOST) : Number(concurrency);
  if (!Number.isInteger(wanted) || wanted < 0)
    throw new Error(`--concurrency: a number, "auto" or "off" (${concurrency})`);
  const workers = Math.min(wanted, Math.floor(files / FILES_PER_WORKER));
  return workers > 1 ? workers : 0;
}

/** The results of the task on each [file, options] of items, in their order. */
async function runFiles(task, items, { configFile, configs, concurrency = 'auto' }) {
  const count = workersFor(concurrency, items.length);
  if (count === 0) {
    const { TASKS } = await import('./worker-tasks.js');
    const run = await TASKS[task]();
    const results = [];
    for (const [file, options] of items) results.push(await run(file, configs, options));
    return results;
  }
  const size = (file) => {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  };
  const queue = items.map(([file, options], index) => [index, file, options, size(file)]);
  queue.sort((a, b) => b[3] - a[3]);
  const results = new Array(items.length);
  let left = items.length;
  const workers = [];
  return new Promise((resolve, reject) => {
    const stop = (error) => {
      for (const worker of workers) worker.kill();
      if (error) reject(error);
      else resolve(results);
    };
    const next = (worker) => {
      const batch = queue.splice(0, BATCH).map(([index, file, options]) => [index, file, options]);
      if (batch.length) worker.send(batch);
    };
    for (let i = 0; i < count; i++) {
      const worker = fork(WORKER, [task, configFile], { serialization: 'advanced' });
      workers.push(worker);
      // null: loaded; then the results of a batch: [[index, result], ...].
      worker.on('message', (done) => {
        for (const [index, result] of done ?? []) results[index] = result;
        left -= done?.length ?? 0;
        if (left === 0) stop();
        else next(worker);
      });
      worker.on('error', stop);
      worker.on('exit', (code) => {
        if (left > 0) stop(new Error(`A worker of @xufa/lint stopped (exit code ${code}).`));
      });
    }
  });
}

export { runFiles, workersFor };
