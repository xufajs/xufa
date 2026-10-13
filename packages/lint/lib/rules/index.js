// The rules: the 60 of ESLint's recommended set, each in its file here (reporting what ESLint 9.39.5's does), loaded
// when first used. The other names of ESLint's rules are known: comments may disable them, and configuring one is an
// error that says it is not in @xufa/lint.

import NAMES from '../data/rule-names.json' with { type: 'json' };
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const RULES = new Set([
  'constructor-super',
  'for-direction',
  'getter-return',
  'no-async-promise-executor',
  'no-case-declarations',
  'no-class-assign',
  'no-compare-neg-zero',
  'no-cond-assign',
  'no-const-assign',
  'no-constant-binary-expression',
  'no-constant-condition',
  'no-control-regex',
  'no-debugger',
  'no-delete-var',
  'no-dupe-args',
  'no-dupe-class-members',
  'no-dupe-else-if',
  'no-dupe-keys',
  'no-duplicate-case',
  'no-empty',
  'no-empty-character-class',
  'no-empty-pattern',
  'no-empty-static-block',
  'no-ex-assign',
  'no-extra-boolean-cast',
  'no-fallthrough',
  'no-func-assign',
  'no-global-assign',
  'no-import-assign',
  'no-invalid-regexp',
  'no-irregular-whitespace',
  'no-loss-of-precision',
  'no-misleading-character-class',
  'no-new-native-nonconstructor',
  'no-nonoctal-decimal-escape',
  'no-obj-calls',
  'no-octal',
  'no-prototype-builtins',
  'no-redeclare',
  'no-regex-spaces',
  'no-self-assign',
  'no-setter-return',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-this-before-super',
  'no-undef',
  'no-unreachable',
  'no-unsafe-finally',
  'no-unsafe-negation',
  'no-unsafe-optional-chaining',
  'no-unused-labels',
  'no-unused-private-class-members',
  'no-unused-vars',
  'no-useless-backreference',
  'no-useless-catch',
  'no-useless-escape',
  'no-with',
  'require-yield',
  'use-isnan',
  'valid-typeof',
]);

const KNOWN = new Set(NAMES);
const loaded = new Map();
const custom = new Map();

/** The definition of a rule (null for a name that is not a rule here). */
function getRule(id) {
  if (custom.has(id)) return custom.get(id);
  if (!RULES.has(id)) return null;
  if (!loaded.has(id)) loaded.set(id, require(`./${id}.js`)); // eslint-disable-line global-require
  return loaded.get(id);
}

/** Whether `id` names a rule of ESLint (ported or not), or one defined here. */
const isKnownRule = (id) => KNOWN.has(id) || custom.has(id);

/** Adds a rule of the project ({ meta, create }, as ESLint's). */
function defineRule(id, rule) {
  custom.set(id, rule);
}

export { getRule, isKnownRule, defineRule, RULES };
