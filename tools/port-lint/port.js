// Ports from ESLint 9.39.5 (MIT) what @xufa/lint keeps of it as it is: the tests of its 60 recommended rules (all but
// no-unexpected-multiline, which eslint-config-prettier turns off; tests/lib/rules) to packages/lint/test/rules as ES
// modules, each on @xufa/lint's rule (lib/rules/<name>.js) and RuleTester (test/rule-tester.js), and the names of all
// its rules (lib/data/rule-names.json). The rules themselves are @xufa/lint's, written anew (bench/lint-rules.js
// compares them with ESLint's). Also: the globals of environments (lib/globals.json) from the package globals.
// NOTICE.md (by hand) has the licenses.
//
// node tools/port-lint/port.js <eslint>  (a checkout of github.com/eslint/eslint at the tag v9.39.5)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '../..');
const PACKAGE = path.join(ROOT, 'packages/lint');
const PNPM = path.join(ROOT, 'node_modules/.pnpm');

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

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// What a test of ESLint requires, as the ported test imports it (`name` is the name it is given).
const IMPORTS = [
  [
    /^\.\.\/\.\.\/\.\.\/lib\/rules\/([a-z-]+)$/,
    (name, rule) => `import * as ${name} from '../../lib/rules/${rule}.js';`,
  ],
  [/^\.\.\/\.\.\/\.\.\/lib\/rule-tester\/rule-tester$/, (name) => `import ${name} from '../rule-tester.js';`],
  [/^globals$/, (name) => `import ${name} from '../../lib/globals.js';`],
];
// Its declarations of what it requires: `const a = require("..."), b = require("...");` (one or more).
const REQUIRES = /^const \w+ = require\("[^"]+"\)(?:,\s*\n\s*\w+ = require\("[^"]+"\))*;\n/gm;
// Parsers @xufa/lint does not run (typescript-eslint's, the fixtures'): a stand-in whose cases RuleTester skips.
const UNSUPPORTED = "import * as unsupportedParser from '../unsupported-parser.js';";

/** A test of ESLint's (tests/lib/rules/<rule>.js) as an ES module of @xufa/lint's tests. */
export function portTest(text) {
  const imports = [];
  let fixtureParser = null;
  const declarations = [...text.matchAll(REQUIRES)];
  for (const [declaration] of declarations) {
    for (const [, name, specifier] of declaration.matchAll(/(\w+) = require\("([^"]+)"\)/g)) {
      if (specifier === '../../fixtures/fixture-parser') {
        fixtureParser = name;
        continue;
      }
      const found = IMPORTS.find(([pattern]) => pattern.test(specifier));
      if (!found) throw new Error(`A requirement the port does not know: ${specifier}`);
      imports.push(found[1](name, ...specifier.match(found[0]).slice(1)));
    }
  }
  if (!declarations.length) throw new Error('No requirements');
  const at = declarations[0].index;
  let body = text.slice(at).replace(REQUIRES, '');
  body = body.replace(/require\("@typescript-eslint\/parser"\)/g, 'unsupportedParser');
  if (fixtureParser) {
    body = body.replace(new RegExp(`require\\(\\s*${fixtureParser}\\([^)]*\\),?\\s*\\)`, 'g'), 'unsupportedParser');
  }
  if (body.includes('unsupportedParser')) imports.push(UNSUPPORTED);
  if (/\brequire\(/.test(body.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')))
    throw new Error('A require() the port does not know');
  // ES modules are strict: no "use strict".
  const head = text.slice(0, at).replace(/\n*"use strict";\n+/, '\n\n');
  return `${head}${imports.join('\n')}\n${body}`;
}

// The tests of the rules, as test files of @xufa/test: their RuleTester is @xufa/lint's (test/rule-tester.js).
function portTests(eslint) {
  const dir = path.join(PACKAGE, 'test/rules');
  fs.mkdirSync(dir, { recursive: true });
  for (const rule of RULES) {
    const text = portTest(read(path.join(eslint, 'tests/lib/rules', `${rule}.js`)));
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

// The names of ESLint's rules (lib/data/rule-names.json): those not ported are known, so that comments disabling
// them are not errors, and configuring them is one that says so.
function ruleNames(eslint) {
  const names = fs
    .readdirSync(path.join(eslint, 'lib/rules'))
    .filter((file) => file.endsWith('.js') && file !== 'index.js')
    .map((file) => file.slice(0, -3))
    .sort();
  fs.writeFileSync(path.join(PACKAGE, 'lib/data/rule-names.json'), `${JSON.stringify(names, null, 2)}\n`);
  return names.length;
}

if (process.argv[1] === import.meta.filename) {
  const [eslint] = process.argv.slice(2);
  if (!eslint) {
    console.error('Usage: node tools/port-lint/port.js <eslint>');
    process.exit(1);
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(eslint, 'package.json'), 'utf8'));
  if (version !== '9.39.5') console.warn(`ESLint ${version}: the port is of 9.39.5`);
  console.log(
    `port-lint: ${portTests(eslint)} test files, ${ruleNames(eslint)} names of rules, ${portGlobals()} environments`
  );
}
