'use strict';

// The scope analysis of @xufa/lint (lib/scope) against eslint-scope 8.4.0, the one ESLint 9.39.5 runs, on what the
// linter analyzes: every file of `node bench/lint.js --tests` (with its config) and every case of ESLint's tests of
// the rules (packages/lint/test/rules, collected by a RuleTester of this file). Where languages/js/index.js asks for
// the analysis of a tree, both analyses run on that tree with the same options, and everything a rule can see of them
// is compared: every scope, variable, definition and reference (their fields, how they point at each other), and of
// every node, its declared variables and the scopes acquire() gives. Exit code 1 on any difference.
//
//   node bench/lint-scope.js [--show 5] [--self]   (--self: eslint-scope against itself, to check the check)

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { watch, replace } = require('./lint-intercept');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const original = require(require.resolve('eslint-scope', { paths: [ESLINT] }));
const self = process.argv.includes('--self');
const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
// Where the linter's language asks for an analysis (below): before it loads.
const SCOPE = path.join(LINT, 'lib/scope/index.js');
watch(SCOPE, ['analyze']);
const ours = self ? original : require(SCOPE);
// The analyses compared, before the modules the linter loads are intercepted (ours is one of them).
const analyzeTheirs = original.analyze;
const analyzeOurs = ours.analyze;
const { KEYS, getKeys } = require(path.join(LINT, 'lib/ast/visitor-keys'));

const counts = { trees: 0, scopes: 0, variables: 0, references: 0 };
const differences = [];
let current = '';

// The nodes of a tree, numbered in the order of a walk.
function numberNodes(ast) {
  const numbers = new Map();
  const walk = (node) => {
    numbers.set(node, numbers.size);
    for (const key of KEYS[node.type] ?? getKeys(node)) {
      const value = node[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') walk(child);
      } else if (value && typeof value.type === 'string') {
        walk(value);
      }
    }
  };
  walk(ast);
  return numbers;
}

const ownKeys = (object) =>
  Object.keys(object)
    .filter((key) => !key.startsWith('__'))
    .sort();
const field = (object, key, map) => (key in object ? map(object[key]) : '<absent>');

// What a rule can see of an analysis, as plain data.
function snapshot(manager, nodes) {
  const node = (value) => (value == null ? value : nodes.has(value) ? nodes.get(value) : `<${value.type}>`);
  const scopes = new Map(manager.scopes.map((scope, i) => [scope, i]));
  const variables = new Map();
  const references = new Map();
  for (const scope of manager.scopes) {
    for (const variable of [...scope.variables, ...(scope.implicit?.variables ?? [])]) {
      if (!variables.has(variable)) variables.set(variable, variables.size);
    }
    for (const reference of [...scope.references, ...scope.through, ...(scope.implicit?.left ?? [])]) {
      if (!references.has(reference)) references.set(reference, references.size);
    }
  }
  const scopeOf = (scope) => (scope == null ? scope : (scopes.get(scope) ?? '<scope>'));
  const variableOf = (variable) => (variable == null ? variable : (variables.get(variable) ?? `<${variable.name}>`));
  const referenceOf = (reference) => references.get(reference) ?? '<reference>';
  const named = (map) => [...map].map(([name, variable]) => [name, variableOf(variable)]);

  const out = { scopes: [], variables: [], references: [], nodes: [] };
  for (const scope of manager.scopes) {
    out.scopes.push({
      keys: ownKeys(scope),
      type: scope.type,
      block: node(scope.block),
      isStrict: scope.isStrict,
      dynamic: scope.dynamic,
      functionExpressionScope: scope.functionExpressionScope,
      directCallToEvalScope: scope.directCallToEvalScope,
      thisFound: scope.thisFound,
      upper: scopeOf(scope.upper),
      variableScope: scopeOf(scope.variableScope),
      childScopes: scope.childScopes.map(scopeOf),
      variables: scope.variables.map(variableOf),
      set: named(scope.set),
      taints: [...scope.taints],
      references: scope.references.map(referenceOf),
      through: scope.through.map(referenceOf),
      implicit: scope.implicit && {
        set: named(scope.implicit.set),
        variables: scope.implicit.variables.map(variableOf),
        left: scope.implicit.left.map(referenceOf),
      },
      isStatic: scope.isStatic(),
      isArgumentsMaterialized: scope.isArgumentsMaterialized(),
      isThisMaterialized: scope.isThisMaterialized(),
    });
  }
  for (const variable of variables.keys()) {
    out.variables.push({
      keys: ownKeys(variable),
      name: variable.name,
      scope: scopeOf(variable.scope),
      identifiers: variable.identifiers.map(node),
      references: variable.references.map(referenceOf),
      defs: variable.defs.map((def) => ({
        keys: ownKeys(def),
        type: def.type,
        name: node(def.name),
        node: node(def.node),
        parent: field(def, 'parent', node),
        index: field(def, 'index', (index) => index),
        kind: field(def, 'kind', (kind) => kind),
        rest: field(def, 'rest', (rest) => rest),
      })),
      tainted: variable.tainted,
      stack: variable.stack,
    });
  }
  for (const reference of references.keys()) {
    const implicit = reference.__maybeImplicitGlobal;
    out.references.push({
      keys: ownKeys(reference),
      identifier: node(reference.identifier),
      from: scopeOf(reference.from),
      tainted: reference.tainted,
      resolved: variableOf(reference.resolved),
      flag: reference.flag,
      writeExpr: field(reference, 'writeExpr', node),
      partial: field(reference, 'partial', (partial) => partial),
      init: field(reference, 'init', (init) => init),
      maybeImplicitGlobal: implicit && { pattern: node(implicit.pattern), node: node(implicit.node) },
      isStatic: reference.isStatic(),
      reads: [reference.isRead(), reference.isWrite(), reference.isReadOnly(), reference.isWriteOnly()],
    });
  }
  for (const [value, number] of nodes) {
    const declared = manager.getDeclaredVariables(value).map(variableOf);
    const outer = scopeOf(manager.acquire(value, false));
    const inner = scopeOf(manager.acquire(value, true));
    if (declared.length || outer !== null || inner !== null) out.nodes.push([number, declared, outer, inner]);
  }
  counts.scopes += out.scopes.length;
  counts.variables += out.variables.length;
  counts.references += out.references.length;
  return out;
}

// The first place two snapshots differ, as a path and both values.
function firstDifference(a, b, at = '') {
  if (isDeepStrictEqual(a, b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const found = firstDifference(a[key], b[key], `${at}.${key}`);
      if (found) return found;
    }
  }
  return { at, theirs: a, ours: b };
}

// Where the linter's language asks for an analysis: both, compared; the linter goes on with ours.
replace(SCOPE, 'analyze', (ast, options) => {
  counts.trees += 1;
  const nodes = numberNodes(ast);
  const theirs = analyzeTheirs(ast, options);
  const mine = analyzeOurs(ast, options);
  const difference = firstDifference(snapshot(theirs, nodes), snapshot(mine, nodes));
  if (difference) differences.push({ source: current, ...difference });
  return mine;
});

async function main() {
  const { Linter } = require(path.join(LINT, 'lib/linter'));
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const linter = new Linter();
  const files = await corpus(true);
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configs = new ConfigArray(config, ROOT);
  for (const file of files) {
    current = path.relative(ROOT, file);
    const own = linterConfig(configs.configFor(file), file);
    linter.verify(fs.readFileSync(file, 'utf8'), { ...own, rules: {} }, { filename: file });
  }
  const cases = require('./lint-cases').cases();
  for (const item of cases) {
    current = `${item.name}: ${JSON.stringify(item.code).slice(0, 200)}`;
    const options = { languageOptions: item.languageOptions, linterOptions: { reportUnusedDisableDirectives: 'off' } };
    linter.verify(item.code, options, item.filename);
  }
  console.log(
    `${files.length} files, ${cases.length} cases of the rules' tests; ${counts.trees} trees, ${counts.scopes} scopes, ` +
      `${counts.variables} variables, ${counts.references} references (each side)`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} trees differ:`);
  for (const { source, at, theirs, ours: mine } of differences.slice(0, show)) {
    console.log(
      `  ${source}\n    at ${at}\n    eslint-scope: ${JSON.stringify(theirs)}\n    ours:         ${JSON.stringify(mine)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
