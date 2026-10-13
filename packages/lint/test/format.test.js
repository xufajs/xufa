'use strict';

// The formatter: prettier's output for JavaScript (with Babel's parentheses), TypeScript, JSX, JSON and markdown (its
// code blocks too), the options of configs, and xufa-format. (Against prettier itself it was checked on every file of
// this repository: tools/port-format.)

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { format, ConfigArray } = require('..');
const { main } = require('../lib/format/cli');

const OPTIONS = { singleQuote: true, trailingComma: 'es5', printWidth: 120 };

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-format-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

describe('format()', () => {
  it('JavaScript as prettier writes it, and its options', async () => {
    const text = 'const a={b:1,"c":[1,2,3]}\nfunction f(x,y){return x+y}\nexport default f';
    expect(await format(text, { filepath: 'a.js' })).toBe(
      'const a = { b: 1, c: [1, 2, 3] };\nfunction f(x, y) {\n  return x + y;\n}\nexport default f;\n'
    );
    expect(await format("const s = \"it's\";", { ...OPTIONS, filepath: 'a.js' })).toBe('const s = "it\'s";\n');
    expect(await format("f('a')", { filepath: 'a.js', semi: false })).toBe('f("a")\n');
  });

  it('long lines break as prettier breaks them; comments stay', async () => {
    const text = `const result = await someFunction(firstArgument, secondArgument, { option: true, other: 'value' }, thirdArgument); // why\n`;
    expect(await format(text, { ...OPTIONS, printWidth: 80, filepath: 'a.mjs' })).toBe(
      "const result = await someFunction(\n  firstArgument,\n  secondArgument,\n  { option: true, other: 'value' },\n  thirdArgument\n); // why\n"
    );
  });

  it('the parentheses of JSDoc type casts in JavaScript (as Babel has them), and numbers as keys', async () => {
    expect(await format('const a = /** @type {number} */ (b);\nconst c = { "1": 1 };', { filepath: 'a.js' })).toBe(
      'const a = /** @type {number} */ (b);\nconst c = { 1: 1 };\n'
    );
    expect(await format('const c = { "1": 1 };', { filepath: 'a.ts' })).toBe('const c = { "1": 1 };\n');
  });

  it('TypeScript and JSX', async () => {
    expect(await format('interface A{b:string;c?:number}\ntype F=(a:A)=>void', { filepath: 'a.ts' })).toBe(
      'interface A {\n  b: string;\n  c?: number;\n}\ntype F = (a: A) => void;\n'
    );
    expect(await format('const a = <div className="x">{y}</div>', { filepath: 'a.jsx' })).toBe(
      'const a = <div className="x">{y}</div>;\n'
    );
  });

  it('JSON (comments kept), and package.json as JSON.stringify writes it', async () => {
    expect(await format('{"a":1,\n// b\n"c":[1,2]}', { filepath: 'a.json' })).toBe('{\n  "a": 1,\n  // b\n  "c": [1, 2]\n}\n');
    expect(await format('{"name":"x","files":["a"]}', { filepath: 'package.json' })).toBe(
      '{\n  "name": "x",\n  "files": [\n    "a"\n  ]\n}\n'
    );
  });

  it('markdown: lists, tables, emphasis, and the code blocks it can format', async () => {
    const text = '# T\n\n* a\n* b\n\n|a|b|\n|-|-|\n|1|22|\n\n*x* __y__\n\n```js\nconst x = {a:1}\n```\n\n```sh\nls   -la\n```\n';
    expect(await format(text, { filepath: 'a.md' })).toBe(
      '# T\n\n- a\n- b\n\n| a   | b   |\n| --- | --- |\n| 1   | 22  |\n\n_x_ **y**\n\n```js\nconst x = { a: 1 };\n```\n\n```sh\nls   -la\n```\n'
    );
  });

  it('a BOM and CRLF are kept; an error of syntax says so', async () => {
    expect(await format('﻿a=1\r\n', { filepath: 'a.js', endOfLine: 'auto' })).toBe('﻿a = 1;\r\n');
    await expect(format('const = 1', { filepath: 'a.js' })).rejects.toThrow();
    await expect(format('a', { filepath: 'a.css' })).rejects.toThrow(/No formatter/);
  });
});

describe('the format of configs, and xufa-format', () => {
  it('format options merged by file; format.ignores and the ignores of all are not formatted', () => {
    const array = new ConfigArray(
      [
        { ignores: ['dist/**'] },
        { format: { singleQuote: true, printWidth: 100, ignores: ['vendor/**'] } },
        { files: ['legacy/**'], format: { printWidth: 80 } },
      ],
      '/p'
    );
    expect(array.configFor('/p/legacy/a.js').format).toMatchObject({ singleQuote: true, printWidth: 80 });
    expect(array.isFormatted('/p/src/a.ts')).toBe(true);
    expect(array.isFormatted('/p/README.md')).toBe(true);
    expect(array.isFormatted('/p/vendor/a.js')).toBe(false);
    expect(array.isFormatted('/p/dist/a.js')).toBe(false);
    expect(array.isFormatted('/p/a.css')).toBe(false);
  });

  const run = async (dir, args) => {
    let out = '';
    let err = '';
    const code = await main(args, {
      stdout: { write: (text) => (out += text) },
      stderr: { write: (text) => (err += text) },
      cwd: dir,
    });
    return { code, out, err };
  };

  it('--check lists what is not formatted (exit 1); --write formats it', async () => {
    const dir = project({
      'xufa.lint.config.cjs': "module.exports = [{ format: { singleQuote: true, ignores: ['kept/**'] } }];\n",
      'a.js': "const a = 'x';\n",
      'b.js': 'const b = "y"\n',
      'kept/c.js': 'const c="z"\n',
    });
    const check = await run(dir, ['--check']);
    expect(check.code).toBe(1);
    expect(check.out).toContain('[warn] b.js');
    expect(check.out).not.toContain('a.js');
    expect(check.out).not.toContain('c.js');
    const write = await run(dir, ['--write']);
    expect(write.code).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'b.js'), 'utf8')).toBe("const b = 'y';\n");
    expect(fs.readFileSync(path.join(dir, 'kept/c.js'), 'utf8')).toBe('const c="z"\n');
    expect((await run(dir, [])).out).toContain('All matched files are formatted.');
  });

  it('a file that does not parse: exit 2, saying where', async () => {
    const dir = project({ 'xufa.lint.config.cjs': 'module.exports = [];\n', 'a.js': 'const = 1;\n' });
    const { code, err } = await run(dir, ['--check']);
    expect(code).toBe(2);
    expect(err).toContain('[error] a.js');
  });
});
