// Files in parallel (lib/parallel.js): the workers give what the files give one after the other, in their order.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runFiles, workersFor } from '../lib/parallel.js';
import { loadConfig } from '../lib/config.js';
import { main as check } from '../lib/check.js';

const CONFIG = `module.exports = [
  { ignores: ['xufa.lint.config.cjs'] },
  require(${JSON.stringify(path.join(import.meta.dirname, '..'))}).configs.recommended,
  { format: { singleQuote: true } },
];
`;

// A project of `count` files: some with problems, some not formatted.
function project(count) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-parallel-'));
  fs.writeFileSync(path.join(dir, 'xufa.lint.config.cjs'), CONFIG);
  for (let i = 0; i < count; i++) {
    const text = i % 3 === 0 ? `let unused${i} = "${i}";\n` : `export const a${i} = '${i}';\n`;
    fs.writeFileSync(path.join(dir, `file-${String(i).padStart(3, '0')}.js`), text.repeat(1 + (i % 7)));
  }
  return dir;
}

const run = async (dir, args) => {
  let out = '';
  let err = '';
  const code = await check(args, {
    stdout: { write: (text) => (out += text) },
    stderr: { write: (text) => (err += text) },
    cwd: dir,
  });
  return { code, out, err };
};

describe('parallel', () => {
  it('workers only when there are files enough for each', () => {
    expect(workersFor('off', 1000)).toBe(0);
    expect(workersFor(4, 1000)).toBe(4);
    expect(workersFor(4, 60)).toBe(2);
    expect(workersFor(4, 30)).toBe(0);
    expect(workersFor('auto', 10)).toBe(0);
    expect(workersFor('auto', 1000)).toBeGreaterThanOrEqual(Math.min(os.availableParallelism() - 1, 2));
    expect(() => workersFor('many', 1000)).toThrow('--concurrency');
  });

  it('the results of workers are those of one after the other, in the order of the files', async () => {
    const dir = project(80);
    const configFile = path.join(dir, 'xufa.lint.config.cjs');
    const configs = await loadConfig(configFile);
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.js'))
      .map((name) => [path.join(dir, name), {}]);
    for (const task of ['lint', 'format', 'check']) {
      const here = await runFiles(task, files, { configFile, configs, concurrency: 'off' });
      const workers = await runFiles(task, files, { configFile, configs, concurrency: 3 });
      expect(workers).toEqual(here);
    }
  });

  it('xufa-check writes the same with workers as without', async () => {
    const dir = project(80);
    const alone = await run(dir, ['--no-color', '--concurrency', 'off']);
    const workers = await run(dir, ['--no-color', '--concurrency', '3']);
    expect(alone.code).toBe(1);
    expect(workers).toEqual(alone);
  });

  it('a worker that stops is an error', async () => {
    const dir = project(60);
    const configFile = path.join(dir, 'xufa.lint.config.cjs');
    const configs = await loadConfig(configFile);
    const files = Array.from({ length: 60 }, (_, i) => [path.join(dir, `missing-${i}.js`), {}]);
    await expect(runFiles('lint', files, { configFile, configs, concurrency: 2 })).rejects.toThrow('stopped');
  });
});
