'use strict';

// The leaves of @xufa/lint's linter against the packages they replace, on the files of `node bench/lint.js --tests`:
// - lib/source-code/comments.js against @eslint/plugin-kit's ConfigCommentParser: every comment of every file, as a
//   directive; and the value of each directive, as SourceCode reads it (lists of rules, names with values, settings
//   of rules);
// - lib/ast/visitor-keys.js against eslint-visitor-keys: the tables, type by type, and getKeys on every node.
// The originals are ESLint 9.39.5's (dev dependencies of bench/, through eslint). Exit code 1 on any difference.
//
//   node bench/lint-leaves.js [--show 10]

const path = require('node:path');
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const original = (name) => require(require.resolve(name, { paths: [ESLINT] }));

const { ConfigCommentParser } = original('@eslint/plugin-kit');
const visitorKeys = original('eslint-visitor-keys');
const comments = require(path.join(LINT, 'lib/source-code/comments'));
const keys = require(path.join(LINT, 'lib/ast/visitor-keys'));
const { parse } = require(path.join(LINT, 'lib/parser'));

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 10;
const parser = new ConfigCommentParser();
const checks = {};
const differences = [];

function compare(name, input, theirs, ours) {
  checks[name] = (checks[name] ?? 0) + 1;
  // What plugin-kit gives is of its classes; what ours gives, plain objects: their fields are compared.
  const plain = (value) => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value);
  if (!isDeepStrictEqual(plain(theirs), plain(ours))) differences.push({ name, input, theirs, ours });
}

// The value of a directive, through the function SourceCode reads it with.
const VALUES = {
  'eslint-disable': ['parseListConfig', 'parseList'],
  'eslint-enable': ['parseListConfig', 'parseList'],
  'eslint-disable-line': ['parseListConfig', 'parseList'],
  'eslint-disable-next-line': ['parseListConfig', 'parseList'],
  exported: ['parseStringConfig', 'parseNames'],
  global: ['parseStringConfig', 'parseNames'],
  globals: ['parseStringConfig', 'parseNames'],
  eslint: ['parseJSONLikeConfig', 'parseRules'],
};

function checkComment(text) {
  const theirs = parser.parseDirective(text);
  compare('parseDirective', text, theirs, comments.parseDirective(text));
  const reader = theirs && Object.hasOwn(VALUES, theirs.label) && VALUES[theirs.label];
  if (reader) compare(reader[1], theirs.value, parser[reader[0]](theirs.value), comments[reader[1]](theirs.value));
}

function* nodes(node) {
  yield node;
  for (const key of keys.KEYS[node.type] ?? keys.getKeys(node)) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child && typeof child.type === 'string') yield* nodes(child);
    } else if (value && typeof value.type === 'string') {
      yield* nodes(value);
    }
  }
}

async function main() {
  const types = new Set([...Object.keys(visitorKeys.KEYS), ...Object.keys(keys.KEYS)]);
  for (const type of types) compare('KEYS', type, visitorKeys.KEYS[type], keys.KEYS[type]);

  const files = await corpus(true);
  let unparsed = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    let ast;
    for (const sourceType of ['module', 'commonjs', 'script']) {
      try {
        ast = parse(text, { sourceType, jsx: /\.jsx$/.test(file), filePath: file });
        break;
      } catch {
        // Another source type.
      }
    }
    if (!ast) {
      unparsed += 1;
      continue;
    }
    for (const comment of ast.comments) checkComment(comment.value);
    for (const node of nodes(ast)) compare('getKeys', node.type, visitorKeys.getKeys(node), keys.getKeys(node));
  }

  // Values a repository does not have: the edges of each reader.
  for (const text of [
    'eslint no-alert: 2 no-console: 2',
    'eslint "no-alert": 2 "no-console": 1',
    "eslint quotes: [2, 'single'], eqeqeq: off",
    'eslint no-alert: [2',
    'eslint no-alert: 2,',
    'eslint {"no-alert": "error"}',
    'eslint no-alert: true',
    'eslint no-alert:2',
    'eslint no-alert: "error",',
    'eslint max-len: [2, {code: 80, ignoreUrls: true}]',
    "eslint max-len: [2, {code: 80, ignorePattern: '^import'}]",
    'eslint no-restricted-syntax: [2, "WithStatement", ForInStatement]',
    'eslint quotes: [error, double, {avoidEscape: true}], semi: [warn, never]',
    'eslint no-alert: [2,], no-console: 1,',
    "eslint quotes: [2, 'it\\'s']",
    'eslint no-alert: 2 , no-console : 1',
    'eslint camelcase: [2, {allow: ["^UNSAFE_", "a_b"]}]',
    'eslint no-magic-numbers: [2, {ignore: [0, -1, 1.5]}]',
    'eslint no-alert: 0x2',
    'eslint id-match: [2, "^[a-z]+$"]',
    'eslint no-alert: off no-console: warn',
    'global a, b:writable  c : readonly,,d',
    'globals  a ,b',
    'exported a b,c',
    'eslint-disable "no-alert", \'no-console\', ,',
    'eslint-disable-line a -- b -- c',
    'eslint-disable a--b',
    'eslint-disable -- only a reason',
    ' * @param {string} a',
    'Eslint-disable',
    'eslint-disable\n  no-alert,\n  no-console\n',
  ]) {
    checkComment(text);
  }

  // Settings of rules made up from the pieces levn reads (seeded: the same ones each run).
  let seed = 1;
  // mulberry32: a small generator of 32-bit numbers, exact in JavaScript's arithmetic.
  const random = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const WORDS = [
    '2',
    'off',
    'warn',
    '"error"',
    "'error'",
    '0x1',
    '1e0',
    'true',
    'null',
    'NaN',
    'a b',
    '-1',
    '""',
    '#1#',
  ];
  const KEYS_ = ['no-alert', '"no-console"', "'eqeqeq'", 'max-len', 'a/b', '@x/y'];
  const SPACES = ['', ' ', '  ', '\n'];
  const space = () => SPACES[random(SPACES.length)];
  const value = (depth) => {
    const kind = depth > 2 ? 0 : random(5);
    if (kind === 3)
      return `[${space()}${Array.from({ length: random(4) }, () => value(depth + 1)).join(`,${space()}`)}${random(3) ? '' : ','}]`;
    if (kind === 4) return `{${fields(depth + 1)}}`;
    return WORDS[random(WORDS.length)];
  };
  const fields = (depth) =>
    Array.from({ length: 1 + random(3) }, () => `${KEYS_[random(KEYS_.length)]}:${space()}${value(depth)}`).join(
      random(4) ? `,${space()}` : ' '
    ) + (random(4) ? '' : ',');
  for (let i = 0; i < 20000; i++) {
    const text = random(5) ? fields(0) : `{${fields(0)}}`;
    const ours = comments.parseRules(text);
    compare('parseRules', text, parser.parseJSONLikeConfig(text), ours);
    if (ours.ok) checks['parseRules (read)'] = (checks['parseRules (read)'] ?? 0) + 1;
  }

  const counts = Object.entries(checks).map(([name, count]) => `${name} ${count}`);
  console.log(`${files.length} files (${unparsed} not parsed); compared: ${counts.join(', ')}`);
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences:`);
  for (const { name, input, theirs, ours } of differences.slice(0, show)) {
    console.log(
      `  ${name}(${JSON.stringify(input)})\n    original: ${JSON.stringify(theirs)}\n    ours:     ${JSON.stringify(ours)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
