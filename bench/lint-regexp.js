'use strict';

// The regular expressions of @xufa/lint (lib/regexp) against @eslint-community/regexpp 4.12.2, the one ESLint 9.39.5
// runs, on every regular expression literal and every string given to RegExp() in the files of
// `node bench/lint.js --tests` and the cases of ESLint's tests of the rules, and on patterns made up from the pieces
// of the grammar. For each pattern, in each mode (editions from ES5 to ES2025, strict or not, without flags, with u,
// with v, with both), and each literal with its flags:
// - the validator: the calls of its callbacks with their arguments, in order, and how it ends (fine, or the same
//   message at the same index);
// - the parser: the tree, every node with all its fields (nodes they point at by their place in the tree);
// - the visitor: the calls of its handlers on the trees.
// Exit code 1 on any difference.
//
//   node bench/lint-regexp.js [--show 5] [--made-up 30000]

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const theirs = require(require.resolve('@eslint-community/regexpp', { paths: [ESLINT] }));
const ours = require(path.join(LINT, 'lib/regexp'));
const { CALLBACKS } = require(path.join(LINT, 'lib/regexp/validator'));
const { parse } = require(path.join(LINT, 'lib/parser'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const show = argument('show', 5);
const counts = { patterns: 0, validations: 0, trees: 0, literals: 0 };
const differences = [];

const EDITIONS = [5, 2015, 2018, 2020, 2022, 2024, 2025, undefined];
const FLAGS = [undefined, true, { unicode: true }, { unicodeSets: true }, { unicode: true, unicodeSets: true }];

// What a value is, to compare: numbers as text (Infinity), nodes by their place in the tree.
const plainValue = (value) => (typeof value === 'number' && !Number.isFinite(value) ? String(value) : value);

// The calls of the validator's callbacks, and how it ended.
function validate(library, source, start, end, options, flags, literal) {
  const calls = [];
  const callbacks = {};
  for (const name of [...CALLBACKS, 'onRegExpFlags', 'onFlags']) {
    callbacks[name] = (...args) =>
      calls.push([name, ...args.map((arg) => (arg && typeof arg === 'object' ? { ...arg } : plainValue(arg)))]);
  }
  const validator = new library.RegExpValidator({ ...options, ...callbacks });
  try {
    if (literal) validator.validateLiteral(source, start, end);
    else validator.validatePattern(source, start, end, flags);
    calls.push(['ok']);
  } catch (error) {
    calls.push(['error', error.message, error.index, error.constructor.name]);
  }
  return calls;
}

// A tree as plain data: each node's fields, nodes they point at by their number in a walk of the tree.
function plainTree(root) {
  const numbers = new Map();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string' || numbers.has(node)) return;
    numbers.set(node, numbers.size);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else walk(value);
    }
  };
  walk(root);
  const ref = (value) => {
    if (Array.isArray(value)) return value.map(ref);
    if (value && typeof value === 'object' && typeof value.type === 'string') return `#${numbers.get(value) ?? '?'}`;
    return plainValue(value);
  };
  return [...numbers.keys()].map((node) =>
    Object.fromEntries(
      Object.keys(node)
        .sort()
        .map((key) => [key, key === 'parent' ? ref(node.parent) : ref(node[key])])
    )
  );
}

function parseTree(library, kind, source, options, flags) {
  try {
    const parser = new library.RegExpParser(options);
    const tree =
      kind === 'literal' ? parser.parseLiteral(source) : parser.parsePattern(source, 0, source.length, flags);
    const visits = [];
    const handlers = new Proxy(
      {},
      { get: (target, name) => (node) => visits.push(`${String(name)}@${node.start}`), has: () => true }
    );
    library.visitRegExpAST(tree, handlers);
    return { tree: plainTree(tree), visits };
  } catch (error) {
    return { error: error.message, index: error.index };
  }
}

function differ(kind, input, a, b) {
  if (isDeepStrictEqual(a, b)) return;
  differences.push({ kind, input, theirs: a, ours: b });
}

function checkPattern(source, editions = EDITIONS) {
  counts.patterns += 1;
  for (const ecmaVersion of editions) {
    for (const strict of [false, true]) {
      const options = { ecmaVersion, strict };
      for (const flags of FLAGS) {
        const label = `${JSON.stringify(source)} ${JSON.stringify({ ecmaVersion, strict, flags })}`;
        counts.validations += 1;
        differ(
          'validate',
          label,
          validate(theirs, source, 0, source.length, options, flags),
          validate(ours, source, 0, source.length, options, flags)
        );
        counts.trees += 1;
        differ(
          'parse',
          label,
          parseTree(theirs, 'pattern', source, options, flags),
          parseTree(ours, 'pattern', source, options, flags)
        );
      }
    }
  }
}

function checkLiteral(raw) {
  counts.literals += 1;
  for (const ecmaVersion of [2015, 2025, undefined]) {
    const options = { ecmaVersion };
    const label = `${raw} ${JSON.stringify(options)}`;
    differ(
      'validateLiteral',
      label,
      validate(theirs, raw, 0, raw.length, options, undefined, true),
      validate(ours, raw, 0, raw.length, options, undefined, true)
    );
    differ('parseLiteral', label, parseTree(theirs, 'literal', raw, options), parseTree(ours, 'literal', raw, options));
  }
}

// The patterns of a text: its regular expression literals, and the strings given to RegExp().
function patternsOf(text, sourceType, jsx, found) {
  let ast;
  try {
    ast = parse(text, { sourceType, jsx });
  } catch {
    return;
  }
  traverse(ast, {
    enter(node) {
      if (node.type === 'Literal' && node.regex) {
        found.patterns.add(node.regex.pattern);
        found.literals.add(node.raw);
      }
      if ((node.type === 'NewExpression' || node.type === 'CallExpression') && node.callee.name === 'RegExp') {
        const [pattern] = node.arguments;
        if (pattern?.type === 'Literal' && typeof pattern.value === 'string') found.patterns.add(pattern.value);
      }
    },
  });
}

// Patterns made up from the pieces of the grammar (seeded: the same each run), most of them not valid.
function madeUp(count) {
  let seed = 13;
  const random = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const PIECES = [
    'a',
    'b',
    'z',
    '0',
    '9',
    ' ',
    '-',
    '_',
    '\\d',
    '\\D',
    '\\w',
    '\\s',
    '.',
    '^',
    '$',
    '\\b',
    '\\B',
    '(',
    ')',
    '(?:',
    '(?=',
    '(?!',
    '(?<=',
    '(?<!',
    '(?<n>',
    '(?<n>',
    '(?<m1>',
    '(?<$_>',
    '(?<\\u0061>',
    '(?<a\\u{62}>',
    '(?<😀>',
    '\\k<n>',
    '\\k<x>',
    '\\k',
    '\\1',
    '\\2',
    '\\10',
    '[',
    ']',
    '[^',
    '|',
    '|',
    '*',
    '+',
    '?',
    '*?',
    '{2}',
    '{1,}',
    '{1,3}',
    '{3,1}',
    '{',
    '}',
    '{,1}',
    '\\u0041',
    '\\u{1F600}',
    '\\u{110000}',
    '\\ud83d\\ude00',
    '\\ud83d',
    '\\x41',
    '\\x4',
    '\\0',
    '\\07',
    '\\377',
    '\\8',
    '\\c',
    '\\cA',
    '\\c1',
    '\\c_',
    '\\p{L}',
    '\\p{Lu}',
    '\\p{Script=Greek}',
    '\\p{sc=Kawi}',
    '\\P{Lu}',
    '\\p{RGI_Emoji}',
    '\\p{ASCII}',
    '\\p{Foo}',
    '\\p{gc=}',
    '\\q{abc|d}',
    '\\q{',
    '&&',
    '--',
    '[a-z]',
    '[z-a]',
    '[\\d-x]',
    '[a-\\d]',
    '\\',
    '/',
    '😀',
    '\\ud83d',
    '(?i:',
    '(?-i:',
    '(?im-s:',
    '(?ii:',
    '(?i-i:',
    '(?-:',
    '(?',
    '\\-',
    '\\/',
    '\\.',
    '\\$',
    '\\e',
    '\\k<n',
    '[[a]]',
    '[\\q{x}]',
    '[&&]',
    '[a&&b]',
    '[a--b]',
    '[!!]',
    '\\t',
    '\\n',
    '\\v',
    '\\f',
    '\\r',
    '\u2028',
  ];
  return Array.from({ length: count }, () =>
    Array.from({ length: 1 + random(8) }, () => PIECES[random(PIECES.length)]).join('')
  );
}

async function main() {
  const found = { patterns: new Set(), literals: new Set() };
  for (const file of await corpus(true)) {
    patternsOf(
      fs.readFileSync(file, 'utf8'),
      /\.(cjs|js)$/.test(file) ? 'commonjs' : 'module',
      /\.jsx$/.test(file),
      found
    );
  }
  for (const item of cases()) {
    const sourceType = item.languageOptions?.sourceType === 'script' ? 'script' : 'module';
    patternsOf(item.code, sourceType, Boolean(item.languageOptions?.parserOptions?.ecmaFeatures?.jsx), found);
  }
  for (const pattern of found.patterns) checkPattern(pattern);
  for (const literal of found.literals) checkLiteral(literal);
  const made = [...new Set(madeUp(argument('made-up', 30000)))];
  for (const pattern of made) checkPattern(pattern, [2018, 2024, undefined]);
  for (const pattern of made.slice(0, 5000))
    checkLiteral(`/${pattern.replace(/\//g, '\\/')}/${['', 'u', 'v', 'gi', 'uv', 'gg', 'x'][pattern.length % 7]}`);
  console.log(
    `${found.patterns.size} patterns of the code and tests, ${found.literals.size} literals, ${made.length} made up; ` +
      `${counts.validations} validations, ${counts.trees} parses, ${counts.literals} literals compared`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences:`);
  for (const { kind, input, theirs: a, ours: b } of differences.slice(0, show)) {
    const at = Array.isArray(a) && Array.isArray(b) ? a.findIndex((item, i) => !isDeepStrictEqual(item, b[i])) : -1;
    console.log(`  ${kind}: ${input}`);
    console.log(`    regexpp: ${JSON.stringify(at >= 0 ? a[at] : a).slice(0, 600)}`);
    console.log(`    ours:    ${JSON.stringify(at >= 0 ? b[at] : b).slice(0, 600)}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
