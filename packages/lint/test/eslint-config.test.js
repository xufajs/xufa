// ESLint's configs, where a project has no xufa.lint.config.js (lib/eslint-config.js): its flat config as it is, and its
// eslintrc (JSON with comments, YAML, JavaScript, package.json) made flat: env, extends, plugins, overrides, ignores,
// the folders above up to root: true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findConfigFile, loadConfig } from '../lib/config.js';
import { main } from '../lib/cli.js';

function project(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-lint-eslint-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return dir;
}

async function lint(dir) {
  let out = '';
  const code = await main(['--format', 'json'], {
    cwd: dir,
    stdout: { write: (text) => (out += text) },
    stderr: { write: (text) => (out += text) },
  });
  const results = JSON.parse(out);
  return {
    code,
    byFile: Object.fromEntries(
      results.map((result) => [
        path.relative(dir, result.filePath).split(path.sep).join('/'),
        result.messages.map((message) => message.ruleId),
      ])
    ),
  };
}

const PLUGIN = `module.exports = {
  rules: {
    'no-foo': {
      meta: { type: 'problem', messages: { foo: 'No foo.' } },
      create: (context) => ({ Identifier(node) { if (node.name === 'foo') context.report({ node, messageId: 'foo' }); } }),
    },
  },
  configs: { recommended: { plugins: ['demo'], rules: { 'demo/no-foo': 'error' } } },
};
`;

describe('ESLint configs', () => {
  it('finds xufa.lint.config.js first, then eslint.config.js, then an eslintrc, in each folder up', () => {
    const dir = project({
      'a/eslint.config.js': 'export default [];\n',
      'a/.eslintrc.json': '{}',
      'a/b/.eslintrc.yml': 'rules: {}\n',
      'a/c/package.json': '{ "name": "c" }',
      'a/d/package.json': '{ "eslintConfig": { "rules": {} } }',
      'a/e/xufa.lint.config.js': 'export default [];\n',
      'a/e/eslint.config.js': 'export default [];\n',
    });
    const found = (sub) => path.relative(dir, findConfigFile(path.join(dir, sub))).split(path.sep).join('/');
    expect(found('a')).toBe('a/eslint.config.js');
    expect(found('a/b')).toBe('a/b/.eslintrc.yml');
    expect(found('a/c')).toBe('a/eslint.config.js');
    expect(found('a/d')).toBe('a/d/package.json');
    expect(found('a/e')).toBe('a/e/xufa.lint.config.js');
  });

  it('lints with a flat config of ESLint, its extends (of defineConfig) in place', async () => {
    const dir = project({
      'package.json': '{ "type": "module" }',
      'eslint.config.js': `export default [
  { ignores: ['dist/**'] },
  { files: ['**/*.js'], extends: [{ rules: { 'no-debugger': 'error' } }], rules: { 'no-var': 'error' } },
];
`,
      'a.js': 'var a = 1;\ndebugger;\nexport default a;\n',
      'dist/b.js': 'debugger;\n',
    });
    const { byFile } = await lint(dir);
    expect(byFile).toEqual({ 'a.js': ['no-var', 'no-debugger'], 'eslint.config.js': [] });
  });

  it('makes an eslintrc flat: env, globals, extends, plugins, overrides, ignorePatterns and .eslintignore', async () => {
    const dir = project({
      'node_modules/eslint-plugin-demo/package.json': '{ "name": "eslint-plugin-demo", "main": "index.js" }',
      'node_modules/eslint-plugin-demo/index.js': PLUGIN,
      'node_modules/eslint-config-shared/package.json': '{ "name": "eslint-config-shared", "main": "index.js" }',
      'node_modules/eslint-config-shared/index.js': "module.exports = { rules: { 'no-var': 'error' } };\n",
      '.eslintrc.json': `{
  // Comments, as ESLint reads them.
  "root": true,
  "env": { "node": true, "es2022": true },
  "globals": { "app": "readonly" },
  "extends": ["eslint:recommended", "shared", "plugin:demo/recommended"],
  "rules": { "no-console": "error" },
  "overrides": [{ "files": ["*.test.js"], "excludedFiles": ["skip.test.js"], "rules": { "no-console": "off" } }],
  "ignorePatterns": ["build/"]
}
`,
      '.eslintignore': '# generated\ngenerated.js\n',
      'a.js': 'var foo = process.env.A;\nconsole.log(foo, app, undefinedName);\n',
      'sub/a.test.js': 'console.log(1);\n',
      'sub/skip.test.js': 'console.log(1);\n',
      'build/x.js': 'debugger;\n',
      'sub/generated.js': 'debugger;\n',
    });
    const { byFile } = await lint(dir);
    expect(byFile).toEqual({
      'a.js': ['no-var', 'demo/no-foo', 'no-console', 'demo/no-foo', 'no-undef'],
      'sub/a.test.js': [],
      'sub/skip.test.js': ['no-console'],
    });
  });

  it('merges the eslintrc of the folders above up to root: true, YAML and package.json too', async () => {
    const dir = project({
      '.eslintrc.yml': 'root: true\nrules:\n  no-debugger: error\n',
      'pkg/package.json': JSON.stringify({ eslintConfig: { rules: { 'no-var': 'error' } } }),
      'pkg/a.js': 'var a = 1;\ndebugger;\nexport default a;\n',
    });
    const configs = await loadConfig(findConfigFile(path.join(dir, 'pkg')));
    expect(configs.configFor(path.join(dir, 'pkg/a.js')).rules).toEqual({ 'no-debugger': 'error', 'no-var': 'error' });
  });

  it('applies the eslintrc of a folder below to its files, over the configs above; root: true leaves them out', async () => {
    const dir = project({
      '.eslintrc.json': '{ "root": true, "rules": { "no-debugger": "error", "no-var": "error" } }',
      'a.js': `var a = 1;
debugger;
export default a;
`,
      'legacy/.eslintrc.yml': `rules:
  no-var: "off"
  no-console: error
`,
      'legacy/b.js': `var b = 1;
console.log(b);
debugger;
`,
      'own/.eslintrc.json': '{ "root": true, "rules": { "no-console": "error" } }',
      'own/c.js': `var c = 1;
console.log(c);
debugger;
`,
      'own/.eslintignore': `skipped.js
`,
      'own/skipped.js': `debugger;
`,
    });
    const { byFile } = await lint(dir);
    expect(byFile).toEqual({
      'a.js': ['no-var', 'no-debugger'],
      'legacy/b.js': ['no-console', 'no-debugger'],
      'own/c.js': ['no-console'],
    });
  });
});
