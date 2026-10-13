'use strict';

// The rules of @xufa/lint against ESLint 9.39.5's: for each rule (or those of --rule a,b), the texts of every case of
// all the rules' tests (with their language options) and one in --sample of the files of `node bench/lint.js --tests`,
// each linted with @xufa/lint's rule and with ESLint's (from bench/node_modules, running on @xufa/lint's SourceCode)
// with each set of options the rule's tests use (and none). Both rules run in the same lint of a text, each under its
// own name; compared: their problems (message, messageId, place, node type, fix, suggestions), in order, or the error
// each throws. Exit code 1 on any difference.
//
//   node bench/lint-rules.js [--rule no-unused-vars,no-empty] [--sample 10] [--show 5]

const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { corpus } = require('./lint');
const { cases } = require('./lint-cases');

const ROOT = path.join(__dirname, '..');
const LINT = path.join(ROOT, 'packages/lint');
const ESLINT = path.dirname(require.resolve('eslint/package.json', { paths: [__dirname] }));
const { Linter } = require(path.join(LINT, 'lib/linter'));
const { getRule, defineRule, RULES: OWN } = require(path.join(LINT, 'lib/rules'));

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const show = Number(argument('show', 5));
const sampleEvery = Number(argument('sample', 10));
const only = argument('rule', '');
const RULES = only ? only.split(',') : [...OWN];
const counts = { texts: 0, lints: 0, problems: 0 };
const differences = [];

for (const name of RULES) {
  if (!OWN.has(name)) throw new Error(`Not a rule of @xufa/lint: ${name}`);
  defineRule(`ours/${name}`, getRule(name));
  defineRule(`theirs/${name}`, require(path.join(ESLINT, 'lib/rules', `${name}.js`)));
}

// The sets of options of each rule: none, and those of its tests.
const all = cases();
const optionSets = new Map(RULES.map((name) => [name, [[]]]));
for (const item of all) {
  const sets = optionSets.get(item.name);
  if (sets && item.options?.length && !sets.some((set) => isDeepStrictEqual(set, item.options)))
    sets.push(item.options);
}

// A problem without its rule's name (ours/x and theirs/x are the same rule).
const plain = ({ ruleId, ...problem }) => problem;

function lintBoth(linter, label, text, languageOptions, settings, filename) {
  counts.texts += 1;
  const rounds = Math.max(...RULES.map((name) => optionSets.get(name).length));
  for (let round = 0; round < rounds; round++) {
    const names = RULES.filter((name) => round < optionSets.get(name).length);
    const rules = {};
    for (const name of names) {
      const options = optionSets.get(name)[round];
      rules[`ours/${name}`] = ['error', ...options];
      rules[`theirs/${name}`] = ['error', ...options];
    }
    const config = { languageOptions, settings, rules, linterOptions: { reportUnusedDisableDirectives: 'off' } };
    let problems;
    try {
      counts.lints += 1;
      problems = linter.verify(text, config, filename);
    } catch {
      // A rule throws: each pair alone, to compare their errors.
      for (const name of names) {
        const outcome = (side) => {
          try {
            const single = { ...config, rules: { [`${side}/${name}`]: rules[`${side}/${name}`] } };
            return linter
              .verify(text, single, filename)
              .filter((problem) => problem.ruleId === `${side}/${name}`)
              .map(plain);
          } catch (error) {
            return `throws ${error.message.split('\n')[0]}`;
          }
        };
        const theirs = outcome('theirs');
        const ours = outcome('ours');
        if (!isDeepStrictEqual(theirs, ours)) differences.push({ rule: name, round, label, theirs, ours });
      }
      continue;
    }
    if (problems.some((problem) => problem.fatal)) return;
    for (const name of names) {
      const theirs = problems.filter((problem) => problem.ruleId === `theirs/${name}`).map(plain);
      const ours = problems.filter((problem) => problem.ruleId === `ours/${name}`).map(plain);
      counts.problems += theirs.length;
      if (!isDeepStrictEqual(theirs, ours)) {
        const at = theirs.findIndex((problem, i) => !isDeepStrictEqual(problem, ours[i]));
        differences.push({
          rule: name,
          round,
          label,
          theirs: theirs[at] ?? theirs.length,
          ours: ours[at] ?? ours.length,
        });
      }
    }
  }
}

async function main() {
  const { ConfigArray } = require(LINT);
  const { linterConfig } = require(path.join(LINT, 'lib/engine'));
  const { default: config } = await import(path.join(ROOT, 'xufa.lint.config.js'));
  const configs = new ConfigArray(config, ROOT);
  const linter = new Linter();
  for (const item of all) {
    lintBoth(
      linter,
      `${item.name}: ${JSON.stringify(item.code).slice(0, 120)}`,
      item.code,
      item.languageOptions,
      item.settings,
      item.filename
    );
  }
  const files = (await corpus(true)).filter((file, i) => i % sampleEvery === 0);
  for (const file of files) {
    const own = linterConfig(configs.configFor(file), file);
    lintBoth(linter, path.relative(ROOT, file), fs.readFileSync(file, 'utf8'), own.languageOptions, own.settings, file);
  }
  console.log(
    `${RULES.length} rules; ${counts.texts} texts (${all.length} cases, ${files.length} files), ${counts.lints} lints, ${counts.problems} problems of ESLint's rules compared`
  );
  if (!differences.length) {
    console.log('no difference');
    return;
  }
  const byRule = {};
  for (const { rule } of differences) byRule[rule] = (byRule[rule] ?? 0) + 1;
  console.log(`${differences.length} differences:`, byRule);
  for (const { rule, round, label, theirs, ours } of differences.slice(0, show)) {
    console.log(`  ${rule} (options ${JSON.stringify(optionSets.get(rule)[round])}): ${label}`);
    console.log(
      `    ESLint: ${JSON.stringify(theirs)?.slice(0, 500)}\n    ours:   ${JSON.stringify(ours)?.slice(0, 500)}`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
