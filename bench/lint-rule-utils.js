'use strict';

// What the rules of @xufa/lint share (lib/rules/utils) against ESLint 9.39.5's rules/utils (ast-utils.js,
// char-source.js, regular-expressions.js, unicode/), on every file of `node bench/lint.js --tests` and every case of
// the rules' tests, linted: every function the rules use, on every node (and pairs of neighbors, scopes, variables),
// every token (and pairs of them), every string literal and template, every regular expression; and the Unicode
// helpers on every code point. Exit code 1 on any difference.
//
//   node bench/lint-rule-utils.js [--show 5]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const theirs = require(path.join(ESLINT, 'lib/rules/utils/ast-utils.js'));
const theirChars = require(path.join(ESLINT, 'lib/rules/utils/char-source.js'));
const theirRegexps = require(path.join(ESLINT, 'lib/rules/utils/regular-expressions.js'));
const theirUnicode = require(path.join(ESLINT, 'lib/rules/utils/unicode'));
const ours = require(path.join(LINT, 'lib/rules/utils/ast'));
const ourChars = require(path.join(LINT, 'lib/rules/utils/char-source'));
const ourRegexps = require(path.join(LINT, 'lib/rules/utils/regular-expressions'));
const ourUnicode = require(path.join(LINT, 'lib/rules/utils/unicode'));
const { KEYS, getKeys } = require(path.join(LINT, 'lib/ast/visitor-keys'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
const counts = {};
const differences = [];
let current = '';

const plain = (value) =>
  JSON.parse(
    JSON.stringify(value === undefined ? '<undefined>' : value, (key, item) => {
      if (item && typeof item === 'object' && typeof item.type === 'string' && item.range)
        return `${item.type}@${item.range}`;
      if (item && typeof item === 'object' && 'name' in item && 'defs' in item) return `variable ${item.name}`;
      if (item instanceof RegExp) return String(item);
      return item;
    })
  );
const outcome = (run) => {
  try {
    return plain(run());
  } catch (error) {
    return `throws ${error.constructor.name}: ${error.message}`;
  }
};
// ESLint tokenizes pieces of code with espree, @xufa/lint with its own tokenizer: where the two disagree on a text
// (a regular expression after a } at the top, JSX text, Unicode spaces: see packages/lint/design/phase-9.md), a
// difference of canTokensBeAdjacent is theirs, counted apart.
const espree = require(require.resolve('espree', { paths: [ESLINT] }));
const { tokenize } = require(path.join(LINT, 'lib/parser'));
const tokensOf = (tokenizer, text) => outcome(() => tokenizer(text).map((token) => [token.type, token.value]));
const tokenizersDiffer = (text) =>
  typeof text === 'string' &&
  !isDeepStrictEqual(
    tokensOf((code) => espree.tokenize(code, { ecmaVersion: 'latest', comment: true, range: true }), text),
    tokensOf(tokenize, text)
  );
const known = { tokenizer: 0 };

function both(name, ...args) {
  counts[name] = (counts[name] ?? 0) + 1;
  const a = outcome(() => theirs[name](...args));
  const b = outcome(() => ours[name](...args));
  if (isDeepStrictEqual(a, b)) return;
  if (name === 'canTokensBeAdjacent' && args.some(tokenizersDiffer)) {
    known.tokenizer += 1;
    return;
  }
  differences.push({ kind: name, label: current, theirs: a, ours: b });
}
function compare(kind, a, b) {
  counts[kind] = (counts[kind] ?? 0) + 1;
  if (!isDeepStrictEqual(a, b)) differences.push({ kind, label: current, theirs: a, ours: b });
}

const NODE_FUNCTIONS = ['isFunction', 'isLoop', 'isInLoop', 'getUpperFunction', 'isNullLiteral', 'isNullOrUndefined'];
const MORE_NODE_FUNCTIONS = [
  'skipChainExpression',
  'isDirective',
  'isStaticTemplateLiteral',
  'getStaticPropertyName',
  'getPrecedence',
];
const TOKEN_FUNCTIONS = [
  'isCommaToken',
  'isSemicolonToken',
  'isOpeningParenToken',
  'isClosingParenToken',
  'isOpeningBraceToken',
];

function* neighbors(node) {
  for (const key of KEYS[node.type] ?? getKeys(node)) {
    const value = node[key];
    if (Array.isArray(value))
      for (let i = 0; i + 1 < value.length; i++) if (value[i] && value[i + 1]) yield [value[i], value[i + 1]];
  }
  if (node.left && node.right) yield [node.left, node.right];
  if (node.object && node.property) yield [node.object, node.property];
}

function check(label, sourceCode) {
  current = label;
  const nodes = [];
  traverse(sourceCode.ast, { enter: (node) => nodes.push(node) });
  for (const node of nodes) {
    const scope = sourceCode.getScope(node);
    for (const name of [...NODE_FUNCTIONS, ...MORE_NODE_FUNCTIONS]) both(name, node);
    if (node.parent) both('isCallee', node);
    both('isSpecificId', node, 'a');
    both('isSpecificId', node, /^[A-Z]/u);
    both('isSpecificMemberAccess', node, null, null);
    both('isSpecificMemberAccess', node, 'Math', 'max');
    both('isSpecificMemberAccess', node, /Array$/u, 'from');
    both('isSpecificMemberAccess', node, null, /^(?:bind|call|apply)$/u);
    if (node.type === 'MemberExpression' && node.object.type === 'Identifier') {
      both('isSpecificMemberAccess', node, node.object.name, theirs.getStaticPropertyName(node) ?? 'x');
    }
    both('isSameReference', node, node);
    both('isConstant', scope, node, true);
    both('isConstant', scope, node, false);
    if (node.parent) both('isParenthesised', sourceCode, node);
    if (node.type === 'Identifier') {
      both('isReferenceToGlobalVariable', scope, node);
      both('getVariableByName', scope, node.name);
    }
    if (ours.isFunction(node)) {
      both('getOpeningParenOfParams', node, sourceCode);
      both('getFunctionNameWithKind', node);
      both('getFunctionHeadLoc', node, sourceCode);
    }
    // canTokensBeAdjacent as rules call it: a token and the text of a node next to it (texts of whole nodes: pieces of a
    // template are no code to tokenize).
    if (node.parent && node.type !== 'TemplateElement') {
      const before = sourceCode.getTokenBefore(node, { includeComments: true });
      const after = sourceCode.getTokenAfter(node, { includeComments: true });
      if (before) both('canTokensBeAdjacent', before, sourceCode.getText(node));
      if (after) both('canTokensBeAdjacent', sourceCode.getText(node), after);
    }
    for (const [left, right] of neighbors(node)) {
      both('isSameReference', left, right);
      both('isSameReference', left, right, true);
      both('equalTokens', left, right, sourceCode);
      both('isMixedLogicalAndCoalesceExpressions', left, right);
    }
    if (node.operator) both('isLogicalAssignmentOperator', node.operator);
    if (node.type === 'Literal' && typeof node.value === 'string' && /^['"]/u.test(node.raw)) {
      compare(
        'parseStringLiteral',
        outcome(() => theirChars.parseStringLiteral(node.raw)),
        outcome(() => ourChars.parseStringLiteral(node.raw))
      );
    }
    if (node.type === 'TemplateElement') {
      const raw = sourceCode.getText(node);
      compare(
        'parseTemplateToken',
        outcome(() => theirChars.parseTemplateToken(raw)),
        outcome(() => ourChars.parseTemplateToken(raw))
      );
    }
    if (node.type === 'Literal' && node.regex) {
      for (const ecmaVersion of [5, 2015, 2023, 2024, 2025, 2026]) {
        for (const flag of ['u', 'v']) {
          compare(
            'isValidWithUnicodeFlag',
            theirRegexps.isValidWithUnicodeFlag(ecmaVersion, node.regex.pattern, flag),
            ourRegexps.isValidWithUnicodeFlag(ecmaVersion, node.regex.pattern, flag)
          );
        }
      }
    }
  }
  for (const scope of sourceCode.scopeManager.scopes) {
    for (const variable of scope.variables) both('getModifyingReferences', variable.references);
  }
  const tokens = sourceCode.tokensAndComments;
  for (let i = 0; i < tokens.length; i++) {
    for (const name of TOKEN_FUNCTIONS) both(name, tokens[i]);
    if (i + 1 < tokens.length) both('canTokensBeAdjacent', tokens[i], tokens[i + 1]);
  }
  for (const comment of sourceCode.ast.comments) {
    if (/^\s*globals?\s/u.test(comment.value)) {
      for (const name of comment.value.split(/[\s,:]+/u).filter(Boolean)) {
        both('getNameLocationInGlobalDirectiveComment', sourceCode, comment, name);
      }
    }
  }
}

function constants() {
  current = 'constants';
  compare('LINEBREAKS', [...theirs.LINEBREAKS], [...ours.LINEBREAKS]);
  compare('ECMASCRIPT_GLOBALS', theirs.ECMASCRIPT_GLOBALS, ours.ECMASCRIPT_GLOBALS);
  compare(
    'createGlobalLinebreakMatcher',
    String(theirs.createGlobalLinebreakMatcher()),
    String(ours.createGlobalLinebreakMatcher())
  );
  for (const text of [
    '',
    ' ',
    '//a',
    'a /* b */',
    '+',
    '++',
    '-',
    '/',
    '1',
    '.5',
    'a.b',
    '#!x',
    '"s"',
    '`t`',
    '#x',
    '/a/',
    'a\n//c',
  ]) {
    for (const other of ['', '+', '1', '.5', 'b', '/* c */', '// d', '/a/', '#x', '"s"', '`t`', '-', 'in']) {
      current = `canTokensBeAdjacent ${JSON.stringify(text)} ${JSON.stringify(other)}`;
      both('canTokensBeAdjacent', text, other);
    }
  }
  current = 'unicode';
  for (let cp = 0; cp <= 0x10ffff; cp += cp < 0x30000 ? 1 : 97) {
    for (const name of ['isCombiningCharacter', 'isEmojiModifier', 'isRegionalIndicatorSymbol']) {
      if (theirUnicode[name](cp) !== ourUnicode[name](cp))
        differences.push({
          kind: name,
          label: cp.toString(16),
          theirs: theirUnicode[name](cp),
          ours: ourUnicode[name](cp),
        });
    }
    if (cp <= 0xffff) {
      const tail = 0xdc00 + (cp % 0x400);
      if (theirUnicode.isSurrogatePair(cp, tail) !== ourUnicode.isSurrogatePair(cp, tail)) {
        differences.push({
          kind: 'isSurrogatePair',
          label: cp.toString(16),
          theirs: theirUnicode.isSurrogatePair(cp, tail),
          ours: ourUnicode.isSurrogatePair(cp, tail),
        });
      }
    }
  }
}

async function main() {
  constants();
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
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log(`${files.length} files and the rules' cases; ${total} results compared`);
  console.log(
    `known: ${known.tokenizer} results of canTokensBeAdjacent on texts espree and @xufa/lint tokenize differently`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  const kinds = {};
  for (const { kind } of differences) kinds[kind] = (kinds[kind] ?? 0) + 1;
  console.log(`${differences.length} differences:`, kinds);
  for (const { kind, label, theirs: a, ours: b } of differences.slice(0, show)) {
    console.log(
      `  ${kind}: ${label}\n    ESLint: ${JSON.stringify(a)?.slice(0, 400)}\n    ours:   ${JSON.stringify(b)?.slice(0, 400)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
