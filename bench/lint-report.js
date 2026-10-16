'use strict';

// The reports, directives and fixes of @xufa/lint (lib/report, lib/util) against ESLint 9.39.5's (file-report.js,
// apply-disable-directives.js, source-code-fixer.js, interpolate.js, shared/), on what the linter gives them: every
// case of ESLint's tests of the rules (its rule on, with its options) and every file of `node bench/lint.js --tests`
// (the recommended rules), each linted with unused directives reported and fixed. Where lib/linter.js makes a problem,
// applies directives or fixes, ESLint's module runs on the same input, and the results are compared (an error by its
// message). And interpolate, the severities and deepMergeArrays on made-up inputs. Exit code 1 on any difference.
//
//   node bench/lint-report.js [--show 5] [--sample 1]   (one file in --sample; every case). TRACE=1: each case.

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');
const { watch, replace } = require('./lint-intercept');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const theirs = (file) => require(path.join(ESLINT, 'lib', file));
const { FileReport: TheirFileReport } = theirs('linter/file-report.js');
const theirDirectives = theirs('linter/apply-disable-directives.js');
const TheirFixer = theirs('linter/source-code-fixer.js');
const { interpolate: theirInterpolate } = theirs('linter/interpolate.js');
const { normalizeSeverityToNumber: theirSeverity } = theirs('shared/severity.js');
const { deepMergeArrays: theirMerge } = theirs('shared/deep-merge-arrays.js');
const ours = (file) => require(path.join(LINT, 'lib', file));
// What the linter is given in their place (below): before it loads.
const REPORT = path.join(LINT, 'lib/report/report.js');
const DIRECTIVES = path.join(LINT, 'lib/report/directives.js');
const FIXES = path.join(LINT, 'lib/report/apply-fixes.js');
watch(REPORT, ['FileReport']);
watch(DIRECTIVES, ['applyDisableDirectives']);
watch(FIXES, ['applyFixes']);
const report = require(REPORT);
const { normalizeSeverityToNumber: ourSeverity } = ours('util/severity');
const { deepMergeArrays: ourMerge } = ours('util/deep-merge');

const show = Number(process.argv[process.argv.indexOf('--show') + 1]) || 5;
const sampleEvery = Number(process.argv[process.argv.indexOf('--sample') + 1]) || 1;
const counts = {};
const differences = [];
let current = '';

// A result to compare: nodes as their type and range; errors as their message.
const plain = (value) =>
  JSON.parse(
    JSON.stringify(value ?? null, (key, item) => {
      if (key === 'node' && item && typeof item === 'object') return `${item.type}@${item.range}`;
      if (key === 'parent' || key === 'parentDirective' || key === 'unprocessedDirective') return undefined;
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
function compare(kind, a, b) {
  counts[kind] = (counts[kind] ?? 0) + 1;
  if (!isDeepStrictEqual(a, b)) differences.push({ kind, label: current, theirs: a, ours: b });
}

// Where lib/linter.js reports, applies directives and fixes: ESLint's module too, on the same input.
const OurFileReport = report.FileReport;
class CheckedFileReport extends OurFileReport {
  #twin;

  constructor(options) {
    super(options);
    this.#twin = new TheirFileReport(options);
  }

  addRuleMessage(...args) {
    const a = outcome(() => this.#twin.addRuleMessage(...args));
    try {
      const result = super.addRuleMessage(...args);
      compare('addRuleMessage', a, plain(result));
      return result;
    } catch (error) {
      compare('addRuleMessage', a, `throws ${error.constructor.name}: ${error.message}`);
      throw error;
    }
  }
}
// Errors and fatals: compared by making them with both, on a report of the same language.
for (const method of ['addError', 'addFatal', 'addWarning']) {
  CheckedFileReport.prototype[method] = function checked(descriptor) {
    const language = { lineStart: 1, columnStart: 0 };
    const a = outcome(() => new TheirFileReport({ language, ruleMapper: () => null })[method](descriptor));
    const b = outcome(() => new OurFileReport({ language, ruleMapper: () => null })[method](descriptor));
    compare(method, a, b);
    return OurFileReport.prototype[method].call(this, descriptor);
  };
}
replace(REPORT, 'FileReport', CheckedFileReport);

const ourDirectives = replace(DIRECTIVES, 'applyDisableDirectives', (options) => {
  // Each mutates the problems (their suppressions): each gets its own copies.
  const copy = () => ({ ...options, problems: options.problems.map((problem) => ({ ...problem })) });
  const a = outcome(() => theirDirectives(copy()));
  const result = ourDirectives(options);
  compare('applyDisableDirectives', a, plain(result));
  return result;
});

const ourFixes = replace(FIXES, 'applyFixes', (text, messages, shouldFix) => {
  compare(
    'applyFixes',
    outcome(() => TheirFixer.applyFixes(text, messages, shouldFix)),
    outcome(() => ourFixes(text, messages, shouldFix))
  );
  return ourFixes(text, messages, shouldFix);
});

// Made-up inputs of the small ones.
function smallOnes() {
  const severities = [
    0,
    1,
    2,
    3,
    -0,
    '0',
    '1',
    '2',
    'off',
    'warn',
    'error',
    'Error',
    '',
    null,
    undefined,
    true,
    [2],
    {},
  ];
  for (const severity of severities) {
    current = `severity ${String(severity)}`;
    compare(
      'severity',
      outcome(() => theirSeverity(severity)),
      outcome(() => ourSeverity(severity))
    );
  }
  const texts = ['a {{b}} c', '{{ b }}', '{{b}}{{c}}', '{{}}', '{{ {b} }}', '{b}', '{{b', '{{x}} {{b}}', ''];
  const datas = [
    undefined,
    null,
    {},
    { b: 1 },
    { b: '{{c}}', c: 'x' },
    { ' b ': 2, b: undefined },
    Object.create({ b: 'proto' }),
  ];
  for (const text of texts) {
    for (const data of datas) {
      current = `interpolate ${text}`;
      compare(
        'interpolate',
        outcome(() => theirInterpolate(text, data)),
        outcome(() => report.interpolate(text, data))
      );
    }
  }
  const lists = [
    undefined,
    null,
    [],
    [1],
    [{ a: 1, b: { c: 2 } }],
    [{ a: [1] }, 'x'],
    [null, { a: 1 }],
    [{ a: 1 }, { b: 2 }, 3],
  ];
  for (const first of lists) {
    for (const second of lists) {
      current = `deepMergeArrays ${JSON.stringify(first)} ${JSON.stringify(second)}`;
      compare(
        'deepMergeArrays',
        outcome(() => theirMerge(first, second)),
        outcome(() => ourMerge(first, second))
      );
    }
  }
}

// Fixes made up for what files and cases do not have: a byte order mark, fixes before it, overlapping, out of order,
// empty ranges, a filter.
function madeUpFixes() {
  const texts = ['abcdef', '\uFEFFabcdef', '', '\uFEFF'];
  const fixSets = [
    [[0, 1, 'X']],
    [[0, 0, '\uFEFF']],
    [[0, 1, '\uFEFFX']],
    [[-1, 0, 'Y']],
    [[-1, 2, '']],
    [
      [2, 4, 'Z'],
      [1, 3, 'W'],
      [5, 6, ''],
    ],
    [
      [3, 3, 'a'],
      [3, 3, 'b'],
      [4, 2, 'bad'],
    ],
    [
      [1, 2, 'p'],
      [0, 6, 'all'],
    ],
  ];
  const filters = [undefined, true, false, (problem) => problem.fix.text !== 'Z'];
  for (const text of texts) {
    for (const set of fixSets) {
      for (const filter of filters) {
        current = `applyFixes ${JSON.stringify(text)} ${JSON.stringify(set)} ${String(filter)}`;
        const problems = () => [
          ...set.map(([start, end, fixText], i) => ({
            line: 1,
            column: i + 1,
            fix: { range: [start, end], text: fixText },
          })),
          { line: 1, column: 9, message: 'no fix' },
        ];
        compare(
          'applyFixes',
          outcome(() => TheirFixer.applyFixes(text, problems(), filter)),
          outcome(() => ourFixes(text, problems(), filter))
        );
      }
    }
  }
}

// Directive comments written in every order: disables and enables of all rules and of some, lines, next lines.
const DIRECTIVE_TEXTS = [
  '/* eslint-enable */\n/* eslint-disable no-debugger */\ndebugger;\n/* eslint-enable no-debugger */',
  '/* eslint-disable */\n/* eslint-enable no-empty */\n{}\n/* eslint-disable no-empty */\n{}\n/* eslint-enable */',
  '/* eslint-enable no-debugger */\n/* eslint-enable */\n/* eslint-disable no-debugger, no-empty */\ndebugger;',
  '/* eslint-disable no-debugger */\n/* eslint-enable */\n/* eslint-enable no-debugger */\ndebugger;',
  'debugger; // eslint-disable-line\n{} // eslint-disable-line no-debugger, no-empty\n// eslint-disable-next-line no-empty\n{}',
  '/* eslint-disable no-debugger -- a */\n/* eslint-disable no-debugger -- b */\ndebugger;\n/* eslint-enable no-debugger, no-empty, "no-alert" */',
  "// eslint-disable-next-line no-debugger, 'no-empty', no-alert\ndebugger;",
];

async function main() {
  smallOnes();
  madeUpFixes();
  // lib/linter.js loads now: it gets the checked modules.
  const { Linter } = require(path.join(LINT, 'lib/linter'));
  const { configs } = require(LINT);
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(pathToFileURL(path.join(ROOT, 'xufa.lint.config.js')).href);
  const configArray = new ConfigArray(config, ROOT);
  const linter = new Linter();
  const lint = (text, own, filename) => {
    for (const reportUnusedDisableDirectives of ['off', 'warn']) {
      const options = { ...own, linterOptions: { ...own.linterOptions, reportUnusedDisableDirectives } };
      try {
        linter.verify(text, options, filename);
        linter.verifyAndFix(text, options, { filename });
      } catch {
        // A rule that throws on purpose (a test of a wrong report): what it reported was compared.
      }
    }
  };
  const all = cases();
  const limit = Number(process.env.LIMIT) || all.length;
  let done = 0;
  const started = Date.now();
  for (const item of all.slice(0, limit)) {
    if (++done && process.env.TRACE)
      process.stderr.write(
        `${done} cases, ${Date.now() - started} ms ${item.name}: ${JSON.stringify(item.code).slice(0, 80)}\n`
      );
    current = `${item.name}: ${JSON.stringify(item.code).slice(0, 100)}`;
    const own = {
      languageOptions: item.languageOptions,
      settings: item.settings,
      rules: { [item.name]: ['error', ...(item.options ?? [])] },
    };
    lint(item.code, own, item.filename);
  }
  for (const text of DIRECTIVE_TEXTS) {
    current = `directives: ${JSON.stringify(text)}`;
    lint(text, { rules: { 'no-debugger': 'error', 'no-empty': 'warn', 'no-alert': 'off' } }, 'file.js');
  }
  const files = (await corpus(true)).filter((file, i) => i % sampleEvery === 0);
  for (const file of files) {
    current = path.relative(ROOT, file);
    const own = linterConfig(configArray.configFor(file), file);
    lint(fs.readFileSync(file, 'utf8'), { ...own, rules: { ...configs.recommended.rules, ...own.rules } }, file);
  }
  console.log(`${files.length} files and the rules' cases; compared:`, counts);
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  console.log(`${differences.length} differences:`);
  for (const { kind, label, theirs: a, ours: b } of differences.slice(0, show)) {
    console.log(
      `  ${kind}: ${label}\n    ESLint: ${JSON.stringify(a)?.slice(0, 500)}\n    ours:   ${JSON.stringify(b)?.slice(0, 500)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
