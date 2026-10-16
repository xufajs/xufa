'use strict';

// The code path analysis of @xufa/lint (lib/code-path) against ESLint 9.39.5's, on every file of
// `node bench/lint.js --tests`, every case of ESLint's tests of the rules, and texts written for each construct: both
// analyzers on the same walk of the same tree; compared: every event (its name, its code path and segments by id,
// its node) and, when a code path ends, its fields and its segments (their links by id, reachable, used, looped) and
// traverseSegments (all of them, with skip, with break, from a segment, to a segment). Exit code 1 on any difference.
//
//   node bench/lint-code-path.js [--show 5]

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const TheirAnalyzer = require(path.join(ESLINT, 'lib/linter/code-path-analysis/code-path-analyzer.js'));
const { CodePathAnalyzer: OurAnalyzer } = require(path.join(LINT, 'lib/code-path/analyzer'));
const language = require(path.join(LINT, 'lib/source-code/language'));
const { defaultParser } = require(path.join(LINT, 'lib/parser'));
const { traverse } = require(path.join(LINT, 'lib/ast/traverse'));

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
const counts = { trees: 0, events: 0, codePaths: 0, segments: 0 };
const differences = [];

// Texts for each construct: loops with break, continue and labels; switches; try/catch/finally; chains; defaults.
const WRITTEN = [
  'while (a) { if (b) break; if (c) continue; d(); }',
  'while (true) { a(); }',
  'do { if (a) continue; b(); } while (c);',
  'do { a(); } while (true);',
  'for (let i = 0; i < n; i++) { if (a) break; b(); }',
  'for (;;) { if (a) break; }',
  'for (;;) {}',
  'for (; a;) { b(); }',
  'for (a; ; b) { c(); continue; }',
  'for (const x of y) { if (x) continue; z(); }',
  'for (const k in o) { if (k) break; }',
  'outer: for (;;) { inner: while (a) { if (b) continue outer; if (c) break inner; break outer; } }',
  'label: { if (a) break label; b(); }',
  'switch (a) { case 1: b(); case 2: c(); break; default: d(); }',
  'switch (a) { default: b(); case 1: c(); }',
  'switch (a) { case 1: default: case 2: b(); break; }',
  'switch (a) { case 1: return; case 2: throw e; }',
  'switch (a) {}',
  'switch (a) { default: }',
  'function f() { try { a(); } catch (e) { return 1; } finally { b(); } return 2; }',
  'function f() { try { return a(); } finally { b(); } }',
  'function f() { try { throw a; } catch { return; } }',
  'function f() { try { a(); } catch (e) { throw e; } finally { return 1; } }',
  'function f() { try { try { a(); } finally { b(); } } catch (e) { c(); } }',
  'function f() { for (;;) { try { break; } finally { continue; } } }',
  'function f(a = b, { c = d } = {}, [e = f] = []) { return a ?? c; }',
  'a?.b.c?.(d)?.[e]; f?.(); g?.h();',
  'a &&= b; c ||= d; e ??= f;',
  'x = a && b || c ?? d;',
  'if (a && b) c(); else if (c || d) e(); else f();',
  'const v = a ? b && c : d || e;',
  'class A { x = a && b; static y = c ? d : e; static { if (f) g(); } m() { return 1; } }',
  'async function* f() { yield a; await b; for await (const c of d) e(); }',
  'function f() { return; a(); }',
  'function f() { throw a; b(); }',
  'function f() { if (a) { return 1; } else { return 2; } c(); }',
  'while (a) { function g() { return b; } break; }',
  '(() => a)(); (function () { if (a) return; })();',
  'new A(b); import(c); d[e]; f.g;',
];

const ref = (value, numbers) => {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => ref(item, numbers));
  if (typeof value.nextSegments === 'object' && 'reachable' in value) return `seg:${value.id}`;
  if (typeof value.childCodePaths === 'object') return `cp:${value.id}`;
  if (numbers.has(value)) return numbers.get(value);
  return typeof value;
};

// A code path at its end: its fields, its segments, and traverseSegments' orders.
function snapshot(codePath) {
  const segments = new Map();
  const add = (segment) => {
    if (!segment || segments.has(segment.id)) return;
    segments.set(segment.id, segment);
    for (const next of [
      ...segment.allNextSegments,
      ...segment.allPrevSegments,
      ...segment.nextSegments,
      ...segment.prevSegments,
    ])
      add(next);
  };
  add(codePath.initialSegment);
  for (const segment of [...codePath.finalSegments, ...codePath.returnedSegments, ...codePath.thrownSegments])
    add(segment);
  counts.codePaths += 1;
  counts.segments += segments.size;
  const ids = (list) => list.map((segment) => segment.id);
  const order = (options) => {
    const seen = [];
    let n = 0;
    codePath.traverseSegments(options, (segment, controller) => {
      seen.push(segment.id);
      n += 1;
      if (options?.skipEvery && n % options.skipEvery === 0) controller.skip();
      if (options?.breakAt && n === options.breakAt) controller.break();
    });
    return seen;
  };
  const all = [...segments.values()];
  return {
    id: codePath.id,
    origin: codePath.origin,
    upper: codePath.upper?.id ?? null,
    children: codePath.childCodePaths.map((child) => child.id),
    initial: codePath.initialSegment.id,
    final: ids(codePath.finalSegments),
    returned: ids(codePath.returnedSegments),
    thrown: ids(codePath.thrownSegments),
    segments: all
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((segment) => ({
        id: segment.id,
        next: ids(segment.nextSegments),
        prev: ids(segment.prevSegments),
        allNext: ids(segment.allNextSegments),
        allPrev: ids(segment.allPrevSegments),
        reachable: segment.reachable,
        used: segment.internal.used,
        looped: ids(segment.internal.loopedPrevSegments),
        keys: Object.keys(segment).sort(),
      })),
    orders: [
      order(),
      order({ skipEvery: 2 }),
      order({ breakAt: 3 }),
      all[1] ? order({ first: all[1] }) : null,
      all[2] ? order({ last: all[2] }) : null,
    ],
    keys: Object.keys(codePath).sort(),
  };
}

function run(Analyzer, ast, numbers) {
  const events = [];
  const analyzer = new Analyzer({
    enterNode: (node) => events.push(['enter', numbers.get(node)]),
    leaveNode: (node) => events.push(['leave', numbers.get(node)]),
    emit: (name, args) => {
      events.push([name, ...ref(args, numbers)]);
      if (name === 'onCodePathEnd') events.push(['snapshot', snapshot(args[0])]);
    },
  });
  try {
    traverse(ast, {
      enter(node, parent) {
        node.parent = parent;
        analyzer.enterNode(node);
      },
      leave(node) {
        analyzer.leaveNode(node);
      },
    });
  } catch (error) {
    events.push(['throws', error.message]);
  }
  return events;
}

function check(label, text, given = {}) {
  const languageOptions = language.normalizeLanguageOptions({
    ecmaVersion: 'latest',
    sourceType: 'module',
    ...given,
    parser: defaultParser,
    parserOptions: { ...given.parserOptions },
  });
  const parsed = language.parse({ body: text.replace(/^\uFEFF/, ''), path: 'file.js' }, { languageOptions });
  if (!parsed.ok) return;
  counts.trees += 1;
  const numbers = new Map();
  traverse(parsed.ast, { enter: (node) => numbers.set(node, numbers.size) });
  const theirs = run(TheirAnalyzer, parsed.ast, numbers);
  const ours = run(OurAnalyzer, parsed.ast, numbers);
  counts.events += theirs.length;
  if (!isDeepStrictEqual(theirs, ours)) {
    const at = theirs.findIndex((event, i) => !isDeepStrictEqual(event, ours[i]));
    differences.push({ label, at, theirs: theirs[at], ours: ours[at] });
  }
}

async function main() {
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configs = new ConfigArray(config, ROOT);
  const files = await corpus(true);
  for (const text of WRITTEN) {
    check(`written: ${text}`, text);
    check(`written (function): ${text}`, `function wrap() { ${text} }`, { sourceType: 'script' });
  }
  for (const file of files) {
    const own = linterConfig(configs.configFor(file), file);
    check(path.relative(ROOT, file), fs.readFileSync(file, 'utf8'), own.languageOptions);
  }
  for (const item of cases())
    check(`${item.name}: ${JSON.stringify(item.code).slice(0, 100)}`, item.code, item.languageOptions);
  console.log(
    `${counts.trees} trees (${files.length} files, the rules' cases, ${WRITTEN.length * 2} written); ` +
      `${counts.events} events, ${counts.codePaths} code paths, ${counts.segments} segments compared`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} trees differ:`);
  for (const { label, at, theirs, ours } of differences.slice(0, show)) {
    console.log(
      `  ${label}\n    at event ${at}\n    ESLint: ${JSON.stringify(theirs)?.slice(0, 500)}\n    ours:   ${JSON.stringify(ours)?.slice(0, 500)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
