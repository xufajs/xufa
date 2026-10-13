// xufa-check: xufa-lint and xufa-format --check in one pass (each file parsed once).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../lib/check.js';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-check-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

const run = async (dir, args) => {
  let out = '';
  let err = '';
  const stdout = { write: (text) => (out += text) };
  const stderr = { write: (text) => (err += text) };
  const code = await main(args, { stdout, stderr, cwd: dir });
  return { code, out, err };
};

const CONFIG = `module.exports = [
  { ignores: ['vendor/**', 'xufa.lint.config.cjs'] },
  require(${JSON.stringify(path.join(import.meta.dirname, '..'))}).configs.recommended,
  { format: { singleQuote: true } },
];
`;
const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');

describe('xufa-check', () => {
  it('the problems, then the files not formatted; exit 1 for either', async () => {
    const dir = project({
      'xufa.lint.config.cjs': CONFIG,
      'src/a.js': 'let unused = 1;\n',
      'src/b.js': 'export const b = "b";\n',
      'src/c.json': '{"c":1}\n',
      'vendor/d.js': 'let ignored = 1;\n',
    });
    const { code, out } = await run(dir, ['--no-color']);
    expect(code).toBe(1);
    expect(out).toContain(`${path.join(dir, 'src', 'a.js')}\n  1:5  error  'unused' is assigned a value but never used  no-unused-vars`);
    expect(out).toContain('1 problem (1 error, 0 warnings)');
    expect(out).toContain('[warn] src/b.js\n[warn] src/c.json\n[warn] Code style issues found in 2 files.');
    expect(out.indexOf('no-unused-vars')).toBeLessThan(out.indexOf('[warn]'));
    expect(out).not.toContain('d.js');
  });

  it('exit 0 when there are no errors and every file is formatted', async () => {
    const dir = project({ 'xufa.lint.config.cjs': CONFIG, 'a.js': "export const a = 'a';\n" });
    const { code, out } = await run(dir, []);
    expect(code).toBe(0);
    expect(out).toBe('');
  });

  it('only a formatting issue is exit 1; --format json keeps stdout JSON', async () => {
    const dir = project({ 'xufa.lint.config.cjs': CONFIG, 'a.js': 'export const a = "a";\n' });
    const { code, out, err } = await run(dir, ['--format', 'json']);
    expect(code).toBe(1);
    expect(JSON.parse(out).map((result) => result.errorCount)).toEqual([0]);
    expect(err).toContain('[warn] a.js');
  });

  it('--fix writes what the rules fix, --write what the formatter writes of it', async () => {
    const dir = project({ 'xufa.lint.config.cjs': CONFIG, 'a.js': 'export const f = (a) => !!a ? "x" : "y";\n' });
    expect((await run(dir, ['--fix'])).code).toBe(1);
    expect(read(dir, 'a.js')).toBe('export const f = (a) => a ? "x" : "y";\n');
    const { code } = await run(dir, ['--fix', '--write']);
    expect(code).toBe(0);
    expect(read(dir, 'a.js')).toBe("export const f = (a) => (a ? 'x' : 'y');\n");
  });

  it('a file the formatter cannot parse is exit 2, the linter reporting it too', async () => {
    const dir = project({ 'xufa.lint.config.cjs': CONFIG, 'a.js': 'let = ;\n' });
    const { code, out, err } = await run(dir, ['--no-color']);
    expect(code).toBe(2);
    expect(out).toContain('Parsing error');
    expect(err).toContain('[error] a.js');
  });

  it('without a config: exit 2, saying so', async () => {
    const dir = project({ 'a.js': '' });
    const { code, err } = await run(dir, []);
    expect(code).toBe(2);
    expect(err).toContain('No xufa.lint.config.js was found');
  });
});
