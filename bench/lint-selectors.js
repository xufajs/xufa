'use strict';

// The selectors and the running of listeners of @xufa/lint (lib/ast/selectors.js, lib/ast/listeners.js) against
// esquery 1.7.0 and ESLint 9.39.5's SourceCodeTraverser, the ones ESLint runs:
// - parsing: every selector of the 60 rules, selectors written to cover the grammar, and selectors made up from its
//   pieces (valid and not): the same tree, or the same error (message, position);
// - matching: on a sample of the files of `node bench/lint.js --tests`, the nodes each selector matches (and the
//   errors), esquery with ESLint's options against ours;
// - running: on the same files and on the cases of ESLint's tests of the rules, the calls of the listeners of every
//   rule's selectors and of the written ones (with the events of code paths), in order: ESLint's traverser against
//   ours, on the same steps.
// Exit code 1 on any difference.
//
//   node bench/lint-selectors.js [--show 5] [--sample 4]

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const esquery = require(require.resolve('esquery', { paths: [ESLINT] }));
const { SourceCodeTraverser } = require(path.join(ESLINT, 'lib/linter/source-code-traverser.js'));
const { SourceCodeVisitor } = require(path.join(ESLINT, 'lib/linter/source-code-visitor.js'));
const jslang = require(path.join(ESLINT, 'lib/languages/js'));
const { parseSelector, parse } = require(path.join(LINT, 'lib/ast/selectors'));
const { Listeners } = require(path.join(LINT, 'lib/ast/listeners'));
const { KEYS, getKeys } = require(path.join(LINT, 'lib/ast/visitor-keys'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
const sampleEvery = Number(process.argv[process.argv.indexOf('--sample') + 1]) || 4;
const counts = { parsed: 0, matched: 0, runs: 0, calls: 0 };
const differences = [];
const differ = (kind, input, theirs, ours) => differences.push({ kind, input, theirs, ours });

// Selectors that cover the grammar: every kind of atom, combinator, value and class.
const WRITTEN = [
  '*',
  'Identifier',
  'identifier',
  '#Identifier',
  'CallExpression > MemberExpression.callee',
  'CallExpression MemberExpression',
  'VariableDeclaration ~ ExpressionStatement',
  'VariableDeclaration + ExpressionStatement',
  '!VariableDeclaration ~ ExpressionStatement',
  'VariableDeclaration + !ExpressionStatement',
  '[name]',
  '[name="foo"]',
  "[name='a\\'b']",
  '[name!="foo"]',
  '[name=/^[a-z]+$/i]',
  '[name!=/x/]',
  '[value=1]',
  '[value>1]',
  '[value>=1.5]',
  '[value<.5]',
  '[value<=2]',
  '[value=type(number)]',
  '[value!=type(string)]',
  '[callee.name="require"]',
  '[callee.object.name=foo]',
  '[computed=false]',
  '[operator="==="]',
  '[regex.flags=/u/]',
  'MemberExpression.object',
  '.body.body',
  '.declarations.init',
  'IfStatement > .test',
  ':not(Identifier)',
  ':not(Identifier, Literal)',
  ':matches(Identifier, Literal)',
  ':is(FunctionDeclaration, ClassDeclaration)',
  'FunctionDeclaration:has(ReturnStatement)',
  'FunctionDeclaration:has(> BlockStatement > ReturnStatement)',
  ':has(Identifier[name="x"], ThisExpression)',
  'BlockStatement > :first-child',
  'BlockStatement > :last-child',
  'Program > :nth-child(2)',
  'Program > :nth-last-child(2)',
  ':nth-child(1)',
  ':statement',
  ':declaration',
  ':pattern',
  ':expression',
  ':function',
  ':Function',
  ':expression > Identifier',
  'MetaProperty > :expression',
  'ArrowFunctionExpression[body.type!="BlockStatement"]',
  'Property[kind="get"] > FunctionExpression',
  'ClassBody > MethodDefinition[static=true][kind="method"]',
  'ImportDeclaration[source.value=/^node:/] ImportSpecifier',
  ':matches(ForStatement, WhileStatement) > BlockStatement:exit',
  'CallExpression:exit',
  ':function:exit',
  'Program:exit',
  '*:exit',
  'TemplateLiteral > TemplateElement:last-child',
  'SwitchCase ~ SwitchCase',
  'ExpressionStatement > CallExpression > MemberExpression > Identifier.property[name=/^(log|warn)$/]',
  ':unknownclass',
];

// Selectors made up from the pieces of the grammar (seeded: the same each run); with `junk`, many of them not valid.
function madeUp(count, junk) {
  let seed = junk ? 7 : 11;
  // mulberry32: a small generator of 32-bit numbers, exact in JavaScript's arithmetic.
  const random = (n) => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
  const pick = (items) => items[random(items.length)];
  const TYPES = ['Identifier', 'Literal', 'CallExpression', 'BlockStatement', 'Program', 'ExpressionStatement', '*'];
  const VALID_VALUES = ['"a"', "'b\\n'", '1', '2.5', '.5', 'foo', '"x"', '"CallExpression"', 'true', '0'];
  const EQUAL_VALUES = ['/x+/', '/[/]/u', '/^[A-Z]/i', 'type(string)', 'type(boolean)'];
  const VALUES = junk ? [...VALID_VALUES, ...EQUAL_VALUES, '/a/z', '"x', '1.', ''] : VALID_VALUES;
  const OPS = junk ? ['=', '!=', '>', '<', '>=', '<=', '=~', ''] : ['=', '!=', '>', '<', '>=', '<='];
  const NAMES = junk
    ? ['name', 'value', 'callee.name', 'a.b.c', 'type', '']
    : ['name', 'value', 'callee.name', 'type', 'computed', 'operator', 'kind'];
  const atom = (depth) => {
    switch (random(depth > 2 ? 6 : 12)) {
      case 0:
      case 1:
      case 11:
        return pick(TYPES);
      case 2:
        if (random(4) === 0) return `[${pick(NAMES)}]`;
        if (random(3) === 0) return `[${pick(NAMES)}${pick(['=', '!='])}${pick(EQUAL_VALUES)}]`;
        return `[${pick(NAMES)}${pick(OPS)}${pick(VALUES)}]`;
      case 3:
        return `.${pick(junk ? ['body', 'callee', 'a.b', ''] : ['body', 'callee', 'object', 'expression', 'declarations.id'])}`;
      case 4:
        return pick([
          ':first-child',
          ':last-child',
          ':nth-child(2)',
          ':nth-last-child( 1 )',
          ':statement',
          ':function',
          ':expression',
          junk ? ':nth-child(x)' : ':pattern',
        ]);
      case 5:
        // Now and then, something that is not valid.
        return !junk || random(4) ? pick(TYPES) : pick(['', '!', '#', ' ', ',', ')', '(', ':', '[', ']']);
      case 6:
        return `:not(${selector(depth + 1)})`;
      case 7:
        return `:matches(${selector(depth + 1)}, ${selector(depth + 1)})`;
      case 8:
        return `:is(${selector(depth + 1)})`;
      case 9:
        return `:has(${pick(['', '> ', '~ ', '+ '])}${selector(depth + 1)})`;
      default:
        return `${pick(['', '!'])}${pick(TYPES)}`;
    }
  };
  const compound = (depth) => Array.from({ length: 1 + random(3) }, () => atom(depth)).join('');
  const selector = (depth) =>
    Array.from({ length: 1 + random(3) }, () => compound(depth)).join(
      pick([' ', ' > ', '>', ' ~ ', ' + ', '+', ', ', ','])
    );
  return Array.from({ length: count }, () => `${pick(['', ' '])}${selector(0)}${pick(['', ' ', ':exit'])}`);
}

// A selector's tree with its regular expressions as text, to compare.
const plain = (tree) =>
  JSON.parse(
    JSON.stringify(tree ?? null, (key, value) => (value instanceof RegExp ? `/${value.source}/${value.flags}` : value))
  );

function parseBoth(source) {
  let theirs;
  let ours;
  try {
    theirs = { tree: plain(esquery.parse(source)) };
  } catch (error) {
    const offset = error.location?.start?.offset;
    theirs = {
      error:
        typeof offset === 'number'
          ? `Syntax error in selector "${source}" at position ${offset}: ${error.message}`
          : error.message,
    };
  }
  try {
    ours = { tree: plain(parseSelector(source)) };
  } catch (error) {
    ours = { error: error.message };
  }
  counts.parsed += 1;
  if (!isDeepStrictEqual(theirs, ours)) differ('parse', source, theirs, ours);
  // Valid: a tree (only spaces parse to none, which ESLint cannot use either).
  return theirs.tree != null && !theirs.error;
}

// The selectors the rules listen to, as they add them (the linter runs every rule on a file).
function ruleSelectors(Linter, configs) {
  const names = new Set();
  // Where the linter adds them: lib/ast/listeners.js.
  const { add } = Listeners.prototype;
  Listeners.prototype.add = function capture(name, ...rest) {
    names.add(name);
    return add.call(this, name, ...rest);
  };
  const linter = new Linter();
  const recommended = require(LINT).configs.recommended;
  linter.verify('a; function f() { return 1; } class C {} /a/u; for (;;) {}', { ...recommended }, 'x.js');
  Listeners.prototype.add = add;
  void configs;
  return [...names];
}

// Every node of a tree with its ancestors: nearest first, as esquery is given them, and as our stack.
function* withAncestry(ast) {
  const stack = [];
  const nodes = [];
  traverse(ast, {
    enter(node) {
      nodes.push([node, [...stack].reverse(), [...stack]]);
      stack.push(node);
    },
    leave() {
      stack.pop();
    },
  });
  yield* nodes;
}

const OPTIONS = { visitorKeys: KEYS, fallback: getKeys, matchClass: jslang.matchesSelectorClass };

function matchBoth(file, ast, sources) {
  const selectors = sources.map((source) => {
    const clean = source.replace(/:exit$/u, '');
    let tree;
    try {
      tree = esquery.parse(clean);
    } catch {
      return null;
    }
    return { source, tree, ours: parse(source) };
  });
  for (const [node, ancestry, stack] of withAncestry(ast)) {
    for (const selector of selectors) {
      if (!selector) continue;
      const result = (run) => {
        try {
          return run();
        } catch (error) {
          return `throws ${error.message}`;
        }
      };
      // Matched or not (esquery answers some with undefined: what counts is whether it is true).
      const theirs = result(() => Boolean(esquery.matches(node, selector.tree, ancestry, OPTIONS)));
      const ours = result(() => Boolean(selector.ours.test(node, stack, stack.length)));
      counts.matched += 1;
      if (theirs !== ours)
        differ('match', `${file}: ${selector.source} on ${node.type} at ${node.range}`, theirs, ours);
    }
  }
}

// The calls of listeners over the steps of a file: ESLint's traverser and ours.
function runBoth(label, sourceCode, sources) {
  const steps = sourceCode.traverse();
  const numbers = new Map();
  traverse(sourceCode.ast, { enter: (node) => numbers.set(node, numbers.size) });
  const record =
    (calls, name) =>
    (...args) => {
      calls.push(
        `${name}(${args.map((arg) => (numbers.has(arg) ? numbers.get(arg) : (arg?.id ?? typeof arg))).join(',')})`
      );
    };
  const theirs = [];
  const ours = [];
  const visitor = new SourceCodeVisitor();
  const listeners = new Listeners();
  for (const name of sources) {
    visitor.add(name, record(theirs, name));
    listeners.add(name, record(ours, name));
  }
  const outcome = (run) => {
    try {
      run();
      return 'ok';
    } catch (error) {
      return `throws ${error.message} at ${numbers.get(error.currentNode)}`;
    }
  };
  const theirEnd = outcome(() =>
    SourceCodeTraverser.getInstance(jslang).traverseSync({ visitorKeys: KEYS }, visitor, { steps })
  );
  const ourEnd = outcome(() => listeners.run(steps));
  counts.runs += 1;
  counts.calls += theirs.length;
  if (theirEnd !== ourEnd || !isDeepStrictEqual(theirs, ours)) {
    const at = theirs.findIndex((call, i) => call !== ours[i]);
    differ(
      'run',
      label,
      { end: theirEnd, calls: theirs.length, at, call: theirs[at] },
      { end: ourEnd, calls: ours.length, call: ours[at] }
    );
  }
}

async function main() {
  const { Linter } = require(path.join(LINT, 'lib/linter'));
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(path.join(ROOT, 'xufa.lint.config.js'));
  const configs = new ConfigArray(config, ROOT);

  const rules = ruleSelectors(Linter, configs);
  const valid = [...new Set([...rules, ...WRITTEN])].filter((source) => parseBoth(source.replace(/:exit$/u, '')));
  const fuzz = [...madeUp(20000, true), ...madeUp(20000, false)];
  const fuzzValid = [...new Set(fuzz.filter((source) => parseBoth(source.replace(/:exit$/u, ''))))];
  console.log(
    `selectors: ${rules.length} of the rules, ${WRITTEN.length} written, ${fuzz.length} made up (${fuzzValid.length} valid)`
  );

  const linter = new Linter();
  const files = (await corpus(true)).filter((file, i) => i % sampleEvery === 0);
  // Runs end at the first error: the selectors of runs are those that match without one.
  const forRuns = [...new Set([...rules, ...valid])].filter((source) => !source.includes(':unknownclass'));
  files.forEach((file, i) => {
    const own = linterConfig(configs.configFor(file), file);
    linter.verify(fs.readFileSync(file, 'utf8'), { ...own, rules: {} }, { filename: file });
    const sourceCode = linter.getSourceCode();
    if (!sourceCode) return;
    const label = path.relative(ROOT, file);
    matchBoth(label, sourceCode.ast, i % 10 === 0 ? [...valid, ...fuzzValid.slice(0, 400)] : valid);
    runBoth(label, sourceCode, i % 10 === 0 ? [...forRuns, ...fuzzValid.slice(0, 400)] : forRuns);
  });

  // The cases of ESLint's tests of the rules: their code, run.
  const { cases } = require('./lint-cases');
  for (const item of cases()) {
    linter.verify(
      item.code,
      { languageOptions: item.languageOptions, linterOptions: { reportUnusedDisableDirectives: 'off' } },
      item.filename
    );
    const sourceCode = linter.getSourceCode();
    if (sourceCode) runBoth(`${item.name}: ${JSON.stringify(item.code).slice(0, 120)}`, sourceCode, forRuns);
  }

  console.log(
    `${files.length} files; ${counts.parsed} parses, ${counts.matched} matches compared, ${counts.runs} runs (${counts.calls} calls)`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences:`);
  for (const { kind, input, theirs, ours } of differences.slice(0, show)) {
    console.log(`  ${kind}: ${input}\n    original: ${JSON.stringify(theirs)}\n    ours:     ${JSON.stringify(ours)}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
