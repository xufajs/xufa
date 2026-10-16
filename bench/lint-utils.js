'use strict';

// What @xufa/lint has of eslint-utils (lib/ast/static-value.js, reference-tracker.js, tokens.js) against
// @eslint-community/eslint-utils 4.10.1, the one ESLint 9.39.5 runs, on every file of `node bench/lint.js --tests`
// and every case of ESLint's tests of the rules, linted: for every node, getStaticValue and getStringIfConstant with
// its scope, getPropertyName of members and properties, isParenthesized once and twice, findVariable of identifiers;
// and the references ReferenceTracker finds for the trace maps of the rules and a wider one. Exit code 1 on any
// difference.
//
//   node bench/lint-utils.js [--show 5]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const theirs = require(require.resolve('@eslint-community/eslint-utils', { paths: [ESLINT] }));
const staticValue = require(path.join(LINT, 'lib/ast/static-value'));
const tokens = require(path.join(LINT, 'lib/ast/tokens'));
const tracker = require(path.join(LINT, 'lib/ast/reference-tracker'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
const counts = { trees: 0, nodes: 0, values: 0, references: 0 };
const differences = [];

// The trace maps of the rules (no-obj-calls; the rules of regular expressions), and one with reads, paths and aliases.
const traceMaps = ({ READ, CALL, CONSTRUCT }) => [
  Object.fromEntries(
    ['Atomics', 'JSON', 'Math', 'Reflect', 'Intl'].map((name) => [name, { [CALL]: true, [CONSTRUCT]: true }])
  ),
  { RegExp: { [CALL]: true, [CONSTRUCT]: true } },
  {
    Math: { [READ]: 1, max: { [CALL]: 2 }, PI: { [READ]: 3 } },
    RegExp: { [READ]: 4, [CALL]: 5, [CONSTRUCT]: 6, prototype: { exec: { [CALL]: 7 } } },
    JSON: { parse: { [CALL]: 8 }, stringify: { [READ]: 9 } },
    Object: { keys: { [CALL]: 10 }, freeze: { [CALL]: 11 }, assign: { [READ]: 12 } },
    process: { env: { [READ]: 13 }, exit: { [CALL]: 14 } },
    console: { log: { [CALL]: 15 } },
    require: { [CALL]: 16 },
    Promise: { [CONSTRUCT]: 17, all: { [CALL]: 18 }, resolve: { [READ]: 19 } },
  },
];
const OURS_MAPS = traceMaps(tracker);
const THEIRS_MAPS = traceMaps(theirs);

// A value to compare, its dates (anywhere in it) as whether they are valid: a date made now differs from one made a
// moment later, and node's deep equality does not see two invalid dates as equal.
function plain(value, seen = new Map()) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'an invalid Date' : 'a Date';
  if (value === null || typeof value !== 'object' || value instanceof RegExp) return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Map) {
    const out = new Map();
    seen.set(value, out);
    for (const [key, item] of value) out.set(plain(key, seen), plain(item, seen));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set();
    seen.set(value, out);
    for (const item of value) out.add(plain(item, seen));
    return out;
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) return value;
  const out = Array.isArray(value) ? new Array(value.length) : {};
  seen.set(value, out);
  for (const key of Object.keys(value)) out[key] = plain(value[key], seen);
  return out;
}
const outcome = (run) => {
  try {
    return run();
  } catch (error) {
    return `throws ${error.message}`;
  }
};

// Texts of the same moment (`String(new Date())`, a call apart, may be a second apart).
const sameMoment = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && Math.abs(Date.parse(a) - Date.parse(b)) < 2000;

function compare(kind, label, a, b) {
  counts.values += 1;
  if (!isDeepStrictEqual(a, b) && !sameMoment(a, b)) differences.push({ kind, label, theirs: a, ours: b });
}

function check(label, sourceCode) {
  counts.trees += 1;
  const numbers = new Map();
  traverse(sourceCode.ast, { enter: (node) => numbers.set(node, numbers.size) });
  const at = (node) => `${label} @${node.type} ${node.range}`;
  for (const node of numbers.keys()) {
    counts.nodes += 1;
    const scope = sourceCode.getScope(node);
    compare(
      'getStaticValue',
      at(node),
      plain(outcome(() => theirs.getStaticValue(node, scope))),
      plain(outcome(() => staticValue.getStaticValue(node, scope)))
    );
    compare(
      'getStringIfConstant',
      at(node),
      outcome(() => theirs.getStringIfConstant(node, scope)),
      outcome(() => staticValue.getStringIfConstant(node, scope))
    );
    if (['MemberExpression', 'Property', 'MethodDefinition', 'PropertyDefinition'].includes(node.type)) {
      compare(
        'getPropertyName',
        at(node),
        outcome(() => theirs.getPropertyName(node, scope)),
        outcome(() => staticValue.getPropertyName(node, scope))
      );
    }
    if (node.type !== 'Program') {
      compare(
        'isParenthesized',
        at(node),
        theirs.isParenthesized(node, sourceCode),
        tokens.isParenthesized(node, sourceCode)
      );
      compare(
        'isParenthesized(2)',
        at(node),
        theirs.isParenthesized(2, node, sourceCode),
        tokens.isParenthesized(2, node, sourceCode)
      );
    }
    if (node.type === 'Identifier') {
      compare('findVariable', at(node), theirs.findVariable(scope, node), staticValue.findVariable(scope, node));
      compare(
        'findVariable(name)',
        at(node),
        theirs.findVariable(scope, node.name),
        staticValue.findVariable(scope, node.name)
      );
    }
  }
  for (const token of [...sourceCode.ast.tokens, ...sourceCode.ast.comments]) {
    compare('isCommentToken', `${label} ${token.type}`, theirs.isCommentToken(token), tokens.isCommentToken(token));
  }
  const globalScope = sourceCode.scopeManager.globalScope;
  const kind = (type, library) =>
    ({ [library.READ]: 'read', [library.CALL]: 'call', [library.CONSTRUCT]: 'construct' })[type];
  OURS_MAPS.forEach((map, i) => {
    const list = (library, Tracker, traceMap) =>
      outcome(() =>
        [...new Tracker(globalScope).iterateGlobalReferences(traceMap)].map(({ node, path: keys, type, info }) => [
          numbers.get(node),
          keys,
          kind(type, library),
          info,
        ])
      );
    const a = list(theirs, theirs.ReferenceTracker, THEIRS_MAPS[i]);
    const b = list(tracker, tracker.ReferenceTracker, map);
    counts.references += Array.isArray(a) ? a.length : 0;
    compare(`ReferenceTracker ${i}`, label, a, b);
  });
}

async function main() {
  const { Linter } = require(path.join(LINT, 'lib/linter'));
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configs = new ConfigArray(config, ROOT);
  const linter = new Linter();
  const files = await corpus(true);
  for (const file of files) {
    const own = linterConfig(configs.configFor(file), file);
    linter.verify(fs.readFileSync(file, 'utf8'), { ...own, rules: {} }, { filename: file });
    if (linter.getSourceCode()) check(path.relative(ROOT, file), linter.getSourceCode());
  }
  for (const item of cases()) {
    linter.verify(
      item.code,
      { languageOptions: item.languageOptions, linterOptions: { reportUnusedDisableDirectives: 'off' } },
      item.filename
    );
    if (linter.getSourceCode())
      check(`${item.name}: ${JSON.stringify(item.code).slice(0, 100)}`, linter.getSourceCode());
  }
  console.log(
    `${counts.trees} trees, ${counts.nodes} nodes; ${counts.values} results compared (${counts.references} references of globals)`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences:`);
  for (const { kind, label, theirs: a, ours: b } of differences.slice(0, show)) {
    const text = (value) => {
      try {
        return JSON.stringify(value)?.slice(0, 300);
      } catch {
        return String(value);
      }
    };
    console.log(`  ${kind}: ${label}\n    eslint-utils: ${text(a)}\n    ours:         ${text(b)}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
