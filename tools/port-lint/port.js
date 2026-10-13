// Ports ESLint 9.39.5 (MIT) to @xufa/lint: its 60 recommended rules (all but no-unexpected-multiline, which
// eslint-config-prettier turns off) with what they require of ESLint (lib/ and conf/, kept in their tree under
// packages/lint/lib/eslint so their requires stay as they are), and the rules' tests (tests/lib/rules) to
// packages/lint/test/rules. The packages ESLint gets them from are copied to packages/lint/lib/vendor from their
// installed copies (node_modules, the versions below), and a few are stand-ins of @xufa/lint (lib/stubs): debug (no
// logs), levn, espree (whose tokenizer is @xufa/lint's parser) and ESLint's config (the severity of a rule). Files are
// not otherwise changed; NOTICE.md lists them with their licenses.
//
// node tools/port-lint/port.js <eslint>  (a checkout of github.com/eslint/eslint at the tag v9.39.5)
import fs from 'node:fs';
import path from 'node:path';

const [eslint] = process.argv.slice(2);
if (!eslint) {
  console.error('Usage: node tools/port-lint/port.js <eslint>');
  process.exit(1);
}
const ROOT = path.join(import.meta.dirname, '../..');
const PACKAGE = path.join(ROOT, 'packages/lint');
const OUT = path.join(PACKAGE, 'lib/eslint');
const VENDOR = path.join(PACKAGE, 'lib/vendor');
const version = JSON.parse(fs.readFileSync(path.join(eslint, 'package.json'), 'utf8')).version;
if (version !== '9.39.5') console.warn(`ESLint ${version}: the port is of 9.39.5`);

export const RULES = [
  'constructor-super',
  'for-direction',
  'getter-return',
  'no-async-promise-executor',
  'no-case-declarations',
  'no-class-assign',
  'no-compare-neg-zero',
  'no-cond-assign',
  'no-const-assign',
  'no-constant-binary-expression',
  'no-constant-condition',
  'no-control-regex',
  'no-debugger',
  'no-delete-var',
  'no-dupe-args',
  'no-dupe-class-members',
  'no-dupe-else-if',
  'no-dupe-keys',
  'no-duplicate-case',
  'no-empty',
  'no-empty-character-class',
  'no-empty-pattern',
  'no-empty-static-block',
  'no-ex-assign',
  'no-extra-boolean-cast',
  'no-fallthrough',
  'no-func-assign',
  'no-global-assign',
  'no-import-assign',
  'no-invalid-regexp',
  'no-irregular-whitespace',
  'no-loss-of-precision',
  'no-misleading-character-class',
  'no-new-native-nonconstructor',
  'no-nonoctal-decimal-escape',
  'no-obj-calls',
  'no-octal',
  'no-prototype-builtins',
  'no-redeclare',
  'no-regex-spaces',
  'no-self-assign',
  'no-setter-return',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-this-before-super',
  'no-undef',
  'no-unreachable',
  'no-unsafe-finally',
  'no-unsafe-negation',
  'no-unsafe-optional-chaining',
  'no-unused-labels',
  'no-unused-private-class-members',
  'no-unused-vars',
  'no-useless-backreference',
  'no-useless-catch',
  'no-useless-escape',
  'no-with',
  'require-yield',
  'use-isnan',
  'valid-typeof',
];

// What else of ESLint the linter of @xufa/lint uses (its own linter runs the rules with them).
const ENTRIES = [
  'lib/languages/js/source-code/source-code.js',
  'lib/linter/code-path-analysis/code-path-analyzer.js',
  'lib/linter/apply-disable-directives.js',
  'lib/linter/source-code-fixer.js',
  'lib/linter/interpolate.js',
  'lib/linter/file-report.js',
  'lib/linter/file-context.js',
  'lib/linter/source-code-traverser.js',
  'lib/linter/source-code-visitor.js',
  'lib/languages/js/index.js',
  'lib/shared/deep-merge-arrays.js',
  'lib/shared/severity.js',
  'conf/globals.js',
  'conf/ecma-version.js',
];

// The packages ESLint requires: their installed files ({ name: [package folder, main file, files to copy] }).
const PNPM = path.join(ROOT, 'node_modules/.pnpm');
const VENDORED = {
  '@eslint-community/regexpp': ['@eslint-community+regexpp@4.12.2', 'index.js', ['index.js', 'LICENSE']],
  '@eslint-community/eslint-utils': [
    '@eslint-community+eslint-utils@4.10.1_eslint@9.39.5',
    'index.js',
    ['index.js', 'LICENSE'],
  ],
  'eslint-scope': ['eslint-scope@8.4.0', 'dist/eslint-scope.cjs', ['dist/eslint-scope.cjs', 'LICENSE']],
  esrecurse: ['esrecurse@4.3.0', 'esrecurse.js', ['esrecurse.js', 'package.json', 'README.md']],
  estraverse: ['estraverse@5.3.0', 'estraverse.js', ['estraverse.js', 'package.json', 'LICENSE.BSD']],
  'eslint-visitor-keys': [
    'eslint-visitor-keys@4.2.1',
    'dist/eslint-visitor-keys.cjs',
    ['dist/eslint-visitor-keys.cjs', 'LICENSE'],
  ],
  esutils: [
    'esutils@2.0.3',
    'lib/utils.js',
    ['lib/utils.js', 'lib/ast.js', 'lib/code.js', 'lib/keyword.js', 'LICENSE.BSD'],
  ],
  'escape-string-regexp': ['escape-string-regexp@4.0.0', 'index.js', ['index.js', 'license']],
  '@eslint/plugin-kit': ['@eslint+plugin-kit@0.4.1', 'dist/cjs/index.cjs', ['dist/cjs/index.cjs', 'LICENSE']],
  esquery: ['esquery@1.7.0', 'dist/esquery.js', ['dist/esquery.js', 'license.txt']],
};
// Stand-ins of @xufa/lint (lib/stubs/<name>.js).
const STUBS = { debug: 'debug', levn: 'levn', espree: 'espree', '../config/config.js': 'config' };

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const folderOf = (name) => {
  const [folder] = VENDORED[name];
  return path.join(PNPM, folder, 'node_modules', name);
};

// A require of a package from a file at `from` (absolute): the relative path to its copy or stand-in.
function target(request, from) {
  const relative = (to) => {
    let out = path.relative(path.dirname(from), to).split(path.sep).join('/');
    if (!out.startsWith('.')) out = `./${out}`;
    return out;
  };
  if (STUBS[request]) return relative(path.join(PACKAGE, 'lib/stubs', `${STUBS[request]}.js`));
  if (VENDORED[request]) return relative(path.join(VENDOR, request, VENDORED[request][1]));
  return null;
}

function rewrite(text, file) {
  return text.replace(/require\(\s*(["'])([^"']+)\1\s*\)/g, (all, quote, request) => {
    const to = target(request, file);
    return to ? `require(${quote}${to}${quote})` : all;
  });
}

// ESLint's files: from the entries, through their relative requires.
function portEslint() {
  const seen = new Set();
  const queue = [...RULES.map((rule) => `lib/rules/${rule}.js`), ...ENTRIES];
  while (queue.length) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    const text = read(path.join(eslint, rel));
    for (const [, , request] of text.matchAll(/require\(\s*(["'])([^"']+)\1\s*\)/g)) {
      if (!request.startsWith('.') || STUBS[request]) continue;
      let next = path.posix.join(path.posix.dirname(rel), request);
      if (!/\.(js|json)$/.test(next)) {
        next = fs.existsSync(path.join(eslint, `${next}.js`)) ? `${next}.js` : `${next}/index.js`;
      }
      queue.push(next);
    }
    const to = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.writeFileSync(to, rel.endsWith('.js') ? rewrite(text, to) : text);
  }
  return seen.size;
}

function portVendor() {
  let count = 0;
  for (const [name, [, , files]] of Object.entries(VENDORED)) {
    for (const file of files) {
      const from = path.join(folderOf(name), file);
      const to = path.join(VENDOR, name, file);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const text = read(from);
      fs.writeFileSync(to, /\.(c?js)$/.test(file) ? rewrite(text, to) : text);
      count += 1;
    }
  }
  return count;
}

// The tests of the rules, as test files of @xufa/test: their RuleTester is @xufa/lint's (test/rule-tester.js).
function portTests() {
  const dir = path.join(PACKAGE, 'test/rules');
  fs.mkdirSync(dir, { recursive: true });
  for (const rule of RULES) {
    let text = read(path.join(eslint, 'tests/lib/rules', `${rule}.js`));
    text = text
      .replace(/require\(\s*"\.\.\/\.\.\/\.\.\/lib\/rules\/([^"]+)"\s*\)/g, 'require("../../lib/eslint/lib/rules/$1")')
      .replace(/require\(\s*"\.\.\/\.\.\/\.\.\/lib\/rule-tester\/rule-tester"\s*\)/g, 'require("../rule-tester")')
      .replace(/require\(\s*"globals"\s*\)/g, 'require("../../lib/globals")')
      // Other parsers: a stand-in that makes their cases skipped.
      .replace(/require\(\s*"@typescript-eslint\/parser"\s*\)/g, 'require("../unsupported-parser")')
      .replace(
        /require\(\s*"\.\.\/\.\.\/fixtures\/fixture-parser"\s*\)/g,
        '() => require.resolve("../unsupported-parser")'
      );
    fs.writeFileSync(path.join(dir, `${rule}.test.js`), text);
  }
  return RULES.length;
}

// The globals of environments (lib/globals.json), from the package globals (MIT), which ESLint's configs use:
// languageOptions: { globals: globals.node }.
const GLOBALS = ['globals@17.13.0', 'globals'];
const ENVIRONMENTS = [
  'builtin',
  'es5',
  'es2015',
  'es2016',
  'es2017',
  'es2018',
  'es2019',
  'es2020',
  'es2021',
  'es2022',
  'es2023',
  'es2024',
  'es2025',
  'es2026',
  'browser',
  'worker',
  'serviceworker',
  'sharedWorker',
  'node',
  'nodeBuiltin',
  'commonjs',
  'shared-node-browser',
  'jest',
  'vitest',
  'mocha',
];
function portGlobals() {
  const folder = path.join(PNPM, GLOBALS[0], 'node_modules', GLOBALS[1]);
  const all = JSON.parse(read(path.join(folder, 'globals.json')));
  const picked = Object.fromEntries(ENVIRONMENTS.map((name) => [name, all[name]]));
  fs.writeFileSync(path.join(PACKAGE, 'lib/globals.json'), `${JSON.stringify(picked, null, 2)}\n`);
  return ENVIRONMENTS.length;
}

// The names of ESLint's rules (lib/eslint/rule-names.json): those not ported are known, so that comments disabling
// them are not errors, and configuring them is one that says so.
function ruleNames() {
  const names = fs
    .readdirSync(path.join(eslint, 'lib/rules'))
    .filter((file) => file.endsWith('.js') && file !== 'index.js')
    .map((file) => file.slice(0, -3))
    .sort();
  fs.writeFileSync(path.join(OUT, 'rule-names.json'), `${JSON.stringify(names, null, 2)}\n`);
  return names.length;
}

// NOTICE.md: what is ported, from where, and the licenses.
function notice() {
  const licenseOf = (name) => {
    const files = VENDORED[name][2].filter((file) => /^licen[cs]e/i.test(path.basename(file)));
    return files.length ? read(path.join(folderOf(name), files[0])).trim() : '(BSD-2-Clause, as its package.json says)';
  };
  const parts = [
    '# Notices',
    '',
    `@xufa/lint runs code ported from ESLint ${version} (lib/eslint: its recommended rules and what they use) and`,
    'the packages ESLint uses for them (lib/vendor), as they are, but for their requires. Their licenses:',
    '',
    `## ESLint ${version}`,
    '',
    '```',
    read(path.join(eslint, 'LICENSE')).trim(),
    '```',
  ];
  for (const name of Object.keys(VENDORED)) {
    const pkg = JSON.parse(read(path.join(folderOf(name), 'package.json')));
    parts.push('', `## ${name} ${pkg.version} (${pkg.license})`, '', '```', licenseOf(name), '```');
  }
  fs.writeFileSync(path.join(PACKAGE, 'NOTICE.md'), `${parts.join('\n')}\n`);
}

if (process.argv[1] === import.meta.filename) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.rmSync(VENDOR, { recursive: true, force: true });
  console.log(`port-lint: ${portEslint()} files of ESLint, ${portVendor()} of its packages, ${portTests()} test files`);
  ruleNames();
  portGlobals();
  notice();
}
