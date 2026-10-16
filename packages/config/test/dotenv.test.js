// Tests of xufa (not ported) of @xufa/config/dotenv, beyond dotenv's own tests (test/dotenv/upstream): how it is loaded
// (import and require), its log line (what was injected, no tips), and the preload.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import dotenv, { config, parse } from '../dotenv.js';

const require = createRequire(import.meta.url);

describe('@xufa/config/dotenv', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-dotenv-'));
    file = path.join(dir, '.env');
    fs.writeFileSync(file, 'XUFA_DOTENV_A=one\nXUFA_DOTENV_B="two # kept"\n');
  });

  afterEach(() => {
    delete process.env.XUFA_DOTENV_A;
    delete process.env.XUFA_DOTENV_B;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is the same object by import and by require, with its functions named too', () => {
    expect(require('../dotenv.js')).toBe(dotenv);
    expect(config).toBe(dotenv.config);
    expect(parse('A=1')).toEqual({ A: '1' });
  });

  it('says what it injected, in one line without tips; quiet says nothing', () => {
    const lines = [];
    const log = console.log;
    console.log = (line) => lines.push(line);
    try {
      expect(config({ path: file }).parsed).toEqual({ XUFA_DOTENV_A: 'one', XUFA_DOTENV_B: 'two # kept' });
      config({ path: file, quiet: true });
    } finally {
      console.log = log;
    }
    expect(lines).toEqual([`[dotenv] injecting env (2) from ${path.relative(process.cwd(), file)}`]);
    expect(process.env.XUFA_DOTENV_B).toBe('two # kept');
  });

  it('preloads with node -r, quiet unless asked', () => {
    const preload = path.join(import.meta.dirname, '../dotenv-config.js');
    const run = (...args) =>
      spawnSync(process.execPath, ['-r', preload, '-e', 'console.log(process.env.XUFA_DOTENV_A)', ...args], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 10000,
      }).stdout;
    expect(run()).toBe('one\n');
    expect(run('dotenv_config_quiet=false')).toBe('[dotenv] injecting env (2) from .env\none\n');
  });
});
