// @xufa/lint beyond the rules (whose tests are ESLint's, in test/rules): the parser's tree and tokens, globs, configs
// and how they merge, comments that disable and configure, fixes, and the command line.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Linter, ConfigArray, parse, tokenize, configs, globals } from '../index.js';
import { matches, ignored } from '../lib/glob.js';
import { main } from '../lib/cli.js';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-lint-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

describe('parse()', () => {
  it('ESTree as espree makes it: nodes, ranges, locations, tokens and comments', () => {
    const ast = parse('// a\nconst { b = 1, ...c } = d?.e;\nexport default class F { static #g = `h${1}i`; }\n');
    expect(ast.type).toBe('Program');
    expect(ast.range).toEqual([5, 83]);
    const [declaration, exported] = ast.body;
    expect(declaration.declarations[0].id.properties.map((property) => property.type)).toEqual([
      'Property',
      'RestElement',
    ]);
    expect(declaration.declarations[0].id.properties[0].value.type).toBe('AssignmentPattern');
    expect(declaration.declarations[0].init.type).toBe('ChainExpression');
    expect(exported.declaration.body.body[0]).toMatchObject({
      type: 'PropertyDefinition',
      static: true,
      key: { type: 'PrivateIdentifier', name: 'g' },
      value: { type: 'TemplateLiteral' },
    });
    expect(ast.comments).toMatchObject([{ type: 'Line', value: ' a', range: [0, 4] }]);
    expect(ast.tokens.slice(0, 3).map((token) => `${token.type}:${token.value}`)).toEqual([
      'Keyword:const',
      'Punctuator:{',
      'Identifier:b',
    ]);
    expect(ast.tokens[1].loc).toEqual({ start: { line: 2, column: 6 }, end: { line: 2, column: 7 } });
  });

  it('JSX, directives, regular expressions and bigints; import and export only in modules', () => {
    const jsx = parse('const a = <b c="&amp;">{d}<>e</></b>;', { jsx: true });
    const element = jsx.body[0].declarations[0].init;
    expect(element.type).toBe('JSXElement');
    expect(element.openingElement.attributes[0].value.value).toBe('&');
    const ast = parse("'use strict';\n/a+/gu; 10n;", { sourceType: 'script' });
    expect(ast.body[0].directive).toBe('use strict');
    expect(ast.body[1].expression.regex).toEqual({ pattern: 'a+', flags: 'gu' });
    expect(ast.body[2].expression.bigint).toBe('10');
    expect(() => parse('import a from "b";', { sourceType: 'script' })).toThrow(/sourceType: module/);
    expect(parse('var a = 010;', { sourceType: 'script' }).body[0].declarations[0].init.value).toBe(8);
    expect(() => parse('var a = 010;')).toThrow(/Octal literals/);
  });

  it('tokenize(): pieces of code that need not parse', () => {
    const tokens = tokenize('a >>> /re/g /* c */');
    expect(tokens.map((token) => token.type)).toEqual(['Identifier', 'Punctuator', 'RegularExpression']);
    expect(tokens.comments.map((comment) => comment.type)).toEqual(['Block']);
  });
});

describe('Linter', () => {
  const linter = new Linter();
  const config = { ...configs.recommended, languageOptions: { globals: { ...globals.node } } };

  it('the problems of the recommended rules, with their positions', () => {
    const messages = linter.verify('let unused = 1;\nif (x = 1) { debugger; }\n', config, 'a.js');
    expect(messages.map((message) => `${message.line}:${message.column} ${message.ruleId}`)).toEqual([
      '1:5 no-unused-vars',
      '2:5 no-cond-assign',
      '2:5 no-constant-condition',
      '2:5 no-undef',
      '2:14 no-debugger',
    ]);
  });

  it('comments that disable (kept apart), and those that configure rules and globals', () => {
    const messages = linter.verify(
      '/* global x */\n/* eslint no-debugger: off */\nx(); debugger; // eslint-disable-line no-unused-vars\ny(); // eslint-disable-line no-undef\n',
      config,
      'a.js'
    );
    expect(messages.map((message) => message.message)).toEqual([
      "Unused eslint-disable directive (no problems were reported from 'no-unused-vars').",
    ]);
    expect(linter.getSuppressedMessages().map((message) => message.ruleId)).toEqual(['no-undef']);
    const unknown = linter.verify('// eslint-disable-next-line some-plugin/rule\nlet a;\na;\n', config, 'a.js');
    expect(unknown[0].message).toBe("Definition for rule 'some-plugin/rule' was not found.");
  });

  it('fixes, again until nothing changes; a parsing error is fatal', () => {
    const result = linter.verifyAndFix('if (!!(!!a)) b();', config, 'a.js');
    expect(result.output).toBe('if (a) b();');
    expect(result.fixed).toBe(true);
    const [fatal] = linter.verify('let = ;', config, 'a.js');
    expect(fatal).toMatchObject({ fatal: true, severity: 2, ruleId: null, line: 1 });
    expect(fatal.message).toMatch(/^Parsing error: /);
  });

  it('CommonJS: module, require and a return at the top', () => {
    const cjs = { ...config, languageOptions: { sourceType: 'commonjs', globals: {} } };
    expect(linter.verify('const a = require("a");\nmodule.exports = a;\nreturn;\n', cjs, 'a.cjs')).toEqual([]);
  });
});

describe('globs and configs', () => {
  it('**, *, ?, {a,b}, [abc], folders and ! in ignores', () => {
    expect(matches('**/*.js', 'a/b/c.js')).toBe(true);
    expect(matches('**/*.js', 'c.js')).toBe(true);
    expect(matches('src/*.{js,jsx}', 'src/a.jsx')).toBe(true);
    expect(matches('src/*.{js,jsx}', 'src/a/b.js')).toBe(false);
    expect(matches('packages/*/test/**', 'packages/http/test/a/b.js')).toBe(true);
    expect(matches('file?.[jt]s', 'file1.ts')).toBe(true);
    expect(matches('build/', 'build/a/b.js')).toBe(true);
    expect(ignored(['dist/**', '!dist/keep.js'], 'dist/keep.js')).toBe(false);
    expect(ignored(['dist/**', '!dist/keep.js'], 'dist/other.js')).toBe(true);
  });

  it('the objects that apply to a file, merged: rules keep their options when given a severity', () => {
    const base = '/project';
    const array = new ConfigArray(
      [
        { ignores: ['dist/**'] },
        { rules: { 'no-unused-vars': ['error', { args: 'none' }], 'no-undef': 'error' } },
        { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { a: 'readonly' } } },
        { files: ['test/**'], rules: { 'no-unused-vars': 'warn', 'no-undef': 'off' } },
        { files: ['**/*.jsx'] },
      ],
      base
    );
    expect(array.isLinted('/project/src/a.js')).toBe(true);
    expect(array.isLinted('/project/src/a.jsx')).toBe(true);
    expect(array.isLinted('/project/src/a.ts')).toBe(false);
    expect(array.isLinted('/project/dist/a.js')).toBe(false);
    expect(array.isLinted('/project/node_modules/x/a.js')).toBe(false);
    expect(array.configFor('/project/test/a.cjs')).toMatchObject({
      languageOptions: { sourceType: 'commonjs', globals: { a: 'readonly' } },
      rules: { 'no-unused-vars': ['warn', { args: 'none' }], 'no-undef': 'off' },
    });
  });
});

describe('xufa-lint', () => {
  const run = async (dir, args) => {
    let out = '';
    let err = '';
    const stdout = { write: (text) => (out += text) };
    const stderr = { write: (text) => (err += text) };
    const code = await main(args, { stdout, stderr, cwd: dir });
    return { code, out, err };
  };
  const CONFIG = `module.exports = [
  { ignores: ['vendor/**'] },
  require(${JSON.stringify(path.join(import.meta.dirname, '..'))}).configs.recommended,
];
`;

  it('the problems of a project, as ESLint writes them, and the exit code', async () => {
    const dir = project({
      'xufa.lint.config.cjs': CONFIG,
      'src/a.js': 'let unused = 1;\n',
      'src/b.js': 'export const b = 1;\n',
      'vendor/c.js': 'let ignored = 1;\n',
    });
    const { code, out } = await run(dir, ['--no-color']);
    expect(code).toBe(1);
    expect(out).toContain(`${path.join(dir, 'src', 'a.js')}\n  1:5  error  'unused' is assigned a value but never used  no-unused-vars`);
    expect(out).toContain('1 problem (1 error, 0 warnings)');
    expect(out).not.toContain('c.js');
    const json = JSON.parse((await run(dir, ['--format', 'json', 'src'])).out);
    expect(json.map((result) => [path.basename(result.filePath), result.errorCount])).toEqual([
      ['a.js', 1],
      ['b.js', 0],
    ]);
  });

  it('--fix writes what the rules fix; no problems is exit 0', async () => {
    const dir = project({ 'xufa.lint.config.cjs': CONFIG, 'a.js': 'export const f = (a) => !!a ? 1 : 2;\n' });
    const { code } = await run(dir, ['--fix']);
    expect(code).toBe(0);
    expect(fs.readFileSync(path.join(dir, 'a.js'), 'utf8')).toBe('export const f = (a) => a ? 1 : 2;\n');
  });

  it('without a config: exit 2, saying so', async () => {
    const dir = project({ 'a.js': '' });
    const { code, err } = await run(dir, []);
    expect(code).toBe(2);
    expect(err).toContain('No xufa.lint.config.js was found');
  });
});
