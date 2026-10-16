'use strict';

// The SourceCode of @xufa/lint (lib/source-code) against ESLint 9.39.5's, on the files of `node bench/lint.js --tests`
// (one in --sample of them; nodes and offsets of big files sampled) and every case of ESLint's tests of the rules: both on the same tree, each with
// its own scope analysis (finalize() and markVariableAsUsed() change scopes). Compared: the methods of tokens on every
// node and pair of neighbors with a set of options (and invalid ones: the same errors), getTokenByRangeStart,
// getLocFromIndex and getNodeByRangeIndex of every offset, getIndexFromLoc, getText, the fields, getJSDocComment,
// getScope, getAncestors, isSpaceBetween(Tokens), the comments that speak to the linter, the global scope after
// applyLanguageOptions, applyInlineConfig and finalize, isGlobalReference, markVariableAsUsed, and traverse()'s steps.
// Exit code 1 on any difference.
//
//   node bench/lint-source-code.js [--show 5] [--sample 3]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const { SourceCode: TheirSourceCode } = require(path.join(ESLINT, 'lib/languages/js/source-code'));
const { SourceCode: OurSourceCode } = require(path.join(LINT, 'lib/source-code/source-code'));
const language = require(path.join(LINT, 'lib/source-code/language'));
const { defaultParser } = require(path.join(LINT, 'lib/parser'));
const { analyze } = require(path.join(LINT, 'lib/scope'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));
const { KEYS, getKeys } = require(path.join(LINT, 'lib/ast/visitor-keys'));

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const show = argument('show', 5);
const sampleEvery = argument('sample', 3);
const counts = { trees: 0, nodes: 0, results: 0 };
const differences = [];

const isPunctuator = (token) => token.type === 'Punctuator';
const notPunctuator = (token) => token.type !== 'Punctuator';
// Options of the methods of tokens: none, numbers, skip, count, filters, comments, their mix, and invalid ones.
const OPTIONS = [
  undefined,
  0,
  1,
  2,
  -1,
  { includeComments: true },
  { skip: 1 },
  { includeComments: true, skip: 2 },
  { count: 2 },
  { count: 0 },
  { includeComments: true, count: 3 },
  isPunctuator,
  { filter: isPunctuator },
  { includeComments: true, filter: notPunctuator, skip: 1, count: 1 },
  { filter: 'x' },
];
const ONE = ['getFirstToken', 'getLastToken', 'getTokenBefore', 'getTokenAfter'];
const MANY = ['getFirstTokens', 'getLastTokens', 'getTokensBefore', 'getTokensAfter'];
const ONE_BETWEEN = ['getFirstTokenBetween', 'getLastTokenBetween'];
const MANY_BETWEEN = ['getFirstTokensBetween', 'getLastTokensBetween'];
const PADDINGS = [
  [undefined, undefined],
  [1, undefined],
  [undefined, 2],
  [1, 1],
  [0, 3],
];

// A result to compare: tokens and nodes as their type and range; errors as their messages.
function plain(value) {
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object' && typeof value.type === 'string' && value.range)
    return `${value.type}@${value.range}`;
  return value;
}
const outcome = (run) => {
  try {
    return plain(run());
  } catch (error) {
    return `throws ${error.constructor.name}: ${error.message}`;
  }
};

function compare(kind, label, theirs, ours) {
  counts.results += 1;
  if (!isDeepStrictEqual(theirs, ours)) differences.push({ kind, label, theirs, ours });
}

// Both: a method called with the same arguments on each.
function both(kind, label, theirs, ours, method, ...args) {
  compare(
    kind,
    label,
    outcome(() => theirs[method](...args)),
    outcome(() => ours[method](...args))
  );
}

// The language options of a config, as lib/linter.js makes them.
function languageOptionsOf(given = {}) {
  const options = { ecmaVersion: 'latest', sourceType: 'module', ...given, parser: defaultParser };
  options.parserOptions = { ...given.parserOptions };
  options.globals = { ...given.globals };
  if (options.sourceType === 'commonjs') {
    options.parserOptions.ecmaFeatures = { ...options.parserOptions.ecmaFeatures, globalReturn: true };
  }
  return language.normalizeLanguageOptions(options);
}

const scopeOptions = (languageOptions) => ({
  ignoreEval: true,
  nodejsScope: languageOptions.parserOptions.ecmaFeatures?.globalReturn,
  impliedStrict: languageOptions.parserOptions.ecmaFeatures?.impliedStrict,
  ecmaVersion: languageOptions.ecmaVersion,
  sourceType: languageOptions.sourceType,
});

// Pairs of neighbors: items next to each other in a node's lists, and the two sides of operators.
function* neighbors(node) {
  for (const key of KEYS[node.type] ?? getKeys(node)) {
    const value = node[key];
    if (!Array.isArray(value)) continue;
    for (let i = 0; i + 1 < value.length; i++) if (value[i] && value[i + 1]) yield [value[i], value[i + 1]];
  }
  if (node.left && node.right) yield [node.left, node.right];
}

function check(label, text, given) {
  const languageOptions = languageOptionsOf(given);
  const hasBOM = text.startsWith('\uFEFF');
  const body = hasBOM ? text.slice(1) : text;
  const parsed = language.parse({ body, path: 'file.js' }, { languageOptions });
  if (!parsed.ok) return;
  counts.trees += 1;
  const { ast, parserServices, visitorKeys } = parsed;
  const theirScopes = analyze(ast, scopeOptions(languageOptions));
  const ourScopes = analyze(ast, scopeOptions(languageOptions));
  const theirs = new TheirSourceCode({
    text: body,
    ast,
    hasBOM,
    parserServices,
    scopeManager: theirScopes,
    visitorKeys,
  });
  const ours = new OurSourceCode({ text: body, ast, hasBOM, parserServices, scopeManager: ourScopes, visitorKeys });

  // The steps: by kind, phase, node, and the events with their arguments (code paths and segments by id).
  const numbers = new Map();
  traverse(ast, { enter: (node) => numbers.set(node, numbers.size) });
  const argumentOf = (arg) => (numbers.has(arg) ? numbers.get(arg) : (arg?.id ?? typeof arg));
  const stepsOf = (sourceCode) =>
    sourceCode
      .traverse()
      .map((step) => [
        step.kind,
        step.phase ?? null,
        step.kind === 1 ? numbers.get(step.target) : step.target,
        (step.args ?? []).map(argumentOf),
      ]);
  compare('traverse', label, stepsOf(theirs), stepsOf(ours));

  for (const field of ['text', 'hasBOM', 'isESTree', 'lineStartIndices', 'parserServices']) {
    compare(field, label, theirs[field], ours[field]);
  }
  compare('lines', label, [...theirs.lines], [...ours.lines]);
  compare('tokensAndComments', label, plain(theirs.tokensAndComments), plain(ours.tokensAndComments));
  compare('frozen', label, Object.isFrozen(theirs), Object.isFrozen(ours));
  compare('splitLines', label, TheirSourceCode.splitLines(body), OurSourceCode.splitLines(body));
  both('getText', label, theirs, ours, 'getText');

  const nodes = [];
  traverse(ast, { enter: (node) => nodes.push(node) });
  const scopeIndex = (manager) => (scope) => manager.scopes.indexOf(scope);
  // Every node of a small tree; of a big one, 3,000 spread over it (getTokensBefore(node) and the like read all the
  // file's tokens on either side, for each node).
  const nodeStep = Math.max(1, Math.ceil(nodes.length / 3000));
  for (const node of nodes.filter((item, i) => i % nodeStep === 0)) {
    counts.nodes += 1;
    const at = `${label} @${node.type} ${node.range}`;
    for (const options of OPTIONS) {
      for (const method of [...ONE, ...MANY])
        both(method, `${at} ${String(options?.name ?? JSON.stringify(options))}`, theirs, ours, method, node, options);
      both('getTokens', at, theirs, ours, 'getTokens', node, options);
    }
    for (const [before, after] of PADDINGS)
      both('getTokens', `${at} ${before},${after}`, theirs, ours, 'getTokens', node, before, after);
    for (const skip of [undefined, 0, 1, 2]) {
      both('getTokenOrCommentBefore', at, theirs, ours, 'getTokenOrCommentBefore', node, skip);
      both('getTokenOrCommentAfter', at, theirs, ours, 'getTokenOrCommentAfter', node, skip);
    }
    for (const method of [
      'getCommentsBefore',
      'getCommentsAfter',
      'getCommentsInside',
      'getAncestors',
      'getJSDocComment',
      'getLoc',
      'getRange',
    ]) {
      both(method, at, theirs, ours, method, node);
    }
    for (const [before, after] of [
      [0, 0],
      [1, 2],
      [5, undefined],
    ])
      both('getText', at, theirs, ours, 'getText', node, before, after);
    compare('getScope', at, scopeIndex(theirScopes)(theirs.getScope(node)), scopeIndex(ourScopes)(ours.getScope(node)));
    for (const [left, right] of neighbors(node)) {
      const pair = `${at} between ${left.type} and ${right.type}`;
      for (const options of OPTIONS) {
        for (const method of [...ONE_BETWEEN, ...MANY_BETWEEN])
          both(method, pair, theirs, ours, method, left, right, options);
      }
      for (const padding of [undefined, 0, 1, { includeComments: true }])
        both('getTokensBetween', pair, theirs, ours, 'getTokensBetween', left, right, padding);
      for (const method of ['commentsExistBetween', 'isSpaceBetween', 'isSpaceBetweenTokens'])
        both(method, pair, theirs, ours, method, left, right);
    }
  }
  for (const token of ast.tokens) {
    both('isSpaceBetweenTokens', `${label} ${token.range}`, theirs, ours, 'isSpaceBetween', ast.tokens[0], token);
    for (const loc of [token.loc.start, token.loc.end])
      both('getIndexFromLoc', label, theirs, ours, 'getIndexFromLoc', loc);
  }
  for (const loc of [
    { line: 0, column: 0 },
    { line: 1, column: -1 },
    { line: 1e6, column: 0 },
    { line: 1, column: 1e6 },
    null,
    { line: '1' },
  ]) {
    both('getIndexFromLoc', label, theirs, ours, 'getIndexFromLoc', loc);
  }
  // Every offset of a short text; of a longer one, one in a step (getNodeByRangeIndex walks the tree each time).
  const step = Math.max(1, Math.floor(body.length / 2000));
  {
    for (let offset = -1; offset <= body.length + 1; offset += offset < 0 || offset >= body.length ? 1 : step) {
      both('getTokenByRangeStart', label, theirs, ours, 'getTokenByRangeStart', offset);
      both('getTokenByRangeStart', label, theirs, ours, 'getTokenByRangeStart', offset, { includeComments: true });
      both('getLocFromIndex', label, theirs, ours, 'getLocFromIndex', offset);
      both('getNodeByRangeIndex', label, theirs, ours, 'getNodeByRangeIndex', offset);
    }
  }
  both('getLocFromIndex', label, theirs, ours, 'getLocFromIndex', 'x');

  // The comments that speak to the linter, the globals, the variables used.
  both('getInlineConfigNodes', label, theirs, ours, 'getInlineConfigNodes');
  const directives = (sourceCode) => {
    const { problems, directives: list } = sourceCode.getDisableDirectives();
    return {
      problems,
      directives: list.map(({ type, node, value, justification }) => ({
        type,
        node: plain(node),
        value,
        justification,
      })),
    };
  };
  compare('getDisableDirectives', label, directives(theirs), directives(ours));
  theirs.applyLanguageOptions(languageOptions);
  ours.applyLanguageOptions(languageOptions);
  compare(
    'applyInlineConfig',
    label,
    outcome(() => theirs.applyInlineConfig()),
    outcome(() => ours.applyInlineConfig())
  );
  for (const node of nodes) {
    if (node.type === 'Identifier') {
      compare(
        'markVariableAsUsed',
        `${label} ${node.name}`,
        theirs.markVariableAsUsed(node.name, node),
        ours.markVariableAsUsed(node.name, node)
      );
    }
  }
  compare(
    'finalize',
    label,
    outcome(() => theirs.finalize()),
    outcome(() => ours.finalize())
  );
  const globalState = (manager) => {
    const scope = manager.scopes[0];
    const variable = (v) => ({
      name: v.name,
      defs: v.defs.length,
      references: v.references.map((ref) => plain(ref.identifier)),
      eslintImplicitGlobalSetting: v.eslintImplicitGlobalSetting,
      eslintExplicitGlobal: v.eslintExplicitGlobal,
      eslintExplicitGlobalComments: plain(v.eslintExplicitGlobalComments),
      writeable: v.writeable,
      eslintUsed: v.eslintUsed,
      eslintExported: v.eslintExported,
    });
    return {
      variables: scope.variables.map(variable),
      set: [...scope.set.keys()],
      through: scope.through.map((ref) => plain(ref.identifier)),
      implicit: {
        variables: scope.implicit.variables.map((v) => v.name),
        set: [...scope.implicit.set.keys()],
        left: scope.implicit.left.map((ref) => plain(ref.identifier)),
      },
      used: manager.scopes.flatMap((s) =>
        s.variables.filter((v) => v.eslintUsed).map((v) => `${manager.scopes.indexOf(s)}:${v.name}`)
      ),
    };
  };
  compare('global scope', label, globalState(theirScopes), globalState(ourScopes));
  for (const node of nodes) {
    if (node.type === 'Identifier')
      both('isGlobalReference', `${label} ${node.name}`, theirs, ours, 'isGlobalReference', node);
  }
}

async function main() {
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configs = new ConfigArray(config, ROOT);
  const files = (await corpus(true)).filter((file, i) => i % sampleEvery === 0);
  for (const file of files) {
    const own = linterConfig(configs.configFor(file), file);
    check(path.relative(ROOT, file), fs.readFileSync(file, 'utf8'), own.languageOptions);
  }
  // Texts written for what the files and cases have little of: JSDoc comments at each distance and place, exports,
  // class expressions, functions as arguments, a shebang, a BOM, every line break, every directive comment.
  const WRITTEN = [
    '/** a */\nfunction f() {}',
    '/** a */\n\nfunction f() {}',
    '/** a */\n\n\nfunction f() {}',
    '/* a */\nfunction f() {}',
    '/** a */\nexport function f() {}',
    '/** a */\nexport default class A {}',
    '/** a */\nconst A = class {};',
    '/** a */\nconst f = () => {};',
    '/** a */\nconst f = function () {};',
    'g(/** a */ function () {});',
    'const o = {\n  /** a */\n  m() {},\n  /** b */\n  p: () => 1,\n};',
    'class A {\n  /** a */\n  m() {}\n}',
    '#!/usr/bin/env node\n/** a */\nfunction f() {}',
    '\uFEFFa;\r\nb;\rc;\u2028d;\u2029e;',
    '/* eslint-disable */\n/* eslint-enable no-undef, eqeqeq -- x */\n// eslint-disable-next-line\na; /* eslint-disable-line\n */\n// eslint-disable a',
    '/* global a, b:writable, c:off, d:bad */\n/* globals e */\n/* exported f, g */\nvar f; a = e;',
    '/* eslint eqeqeq: [2, smart], no-alert: 0 */\n/* eslint bad-json: [ */\n/* eslint-env node */',
  ];
  for (const text of WRITTEN) {
    for (const sourceType of ['module', 'script', 'commonjs'])
      check(`written: ${JSON.stringify(text)} ${sourceType}`, text, { sourceType });
  }
  for (const item of cases())
    check(`${item.name}: ${JSON.stringify(item.code).slice(0, 100)}`, item.code, item.languageOptions);
  console.log(
    `${files.length} files and the rules' cases; ${counts.trees} trees, ${counts.nodes} nodes, ${counts.results} results compared`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  const kinds = {};
  for (const { kind } of differences) kinds[kind] = (kinds[kind] ?? 0) + 1;
  console.log(`${differences.length} differences:`, kinds);
  const text = (value) => {
    try {
      return JSON.stringify(value)?.slice(0, 400);
    } catch {
      return String(value);
    }
  };
  for (const { kind, label, theirs, ours } of differences.slice(0, show)) {
    console.log(`  ${kind}: ${label}\n    ESLint: ${text(theirs)}\n    ours:   ${text(ours)}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
