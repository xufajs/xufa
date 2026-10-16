// The rules: the 60 of ESLint's recommended set, each in its file here (reporting what ESLint 9.39.5's does), and 100
// more ported from ESLint 9.39.5's code (PORTED), loaded when first used. The other names of ESLint's rules are known: comments may disable them, and configuring one is an
// error that says it is not in @xufa/lint.

import NAMES from '../data/rule-names.json' with { type: 'json' };
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ESLint's recommended set (configs.recommended).
const RECOMMENDED = new Set([
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

// ESLint 9.39.5's rules ported from its code (each file says so), with ast-utils and the helpers they use.
const PORTED = [
  'array-callback-return',
  'block-scoped-var',
  'camelcase',
  'class-methods-use-this',
  'consistent-return',
  'curly',
  'default-case',
  'default-case-last',
  'default-param-last',
  'dot-notation',
  'eqeqeq',
  'func-names',
  'global-require',
  'grouped-accessor-pairs',
  'guard-for-in',
  'lines-around-directive',
  'lines-between-class-members',
  'max-classes-per-file',
  'new-cap',
  'no-alert',
  'no-array-constructor',
  'no-await-in-loop',
  'no-bitwise',
  'no-buffer-constructor',
  'no-caller',
  'no-console',
  'no-constructor-return',
  'no-continue',
  'no-div-regex',
  'no-else-return',
  'no-empty-function',
  'no-eval',
  'no-extend-native',
  'no-extra-bind',
  'no-extra-label',
  'no-implied-eval',
  'no-inner-declarations',
  'no-iterator',
  'no-label-var',
  'no-labels',
  'no-lone-blocks',
  'no-lonely-if',
  'no-loop-func',
  'no-multi-assign',
  'no-multi-str',
  'no-new',
  'no-new-func',
  'no-new-object',
  'no-new-require',
  'no-new-symbol',
  'no-new-wrappers',
  'no-octal-escape',
  'no-path-concat',
  'no-plusplus',
  'no-promise-executor-return',
  'no-proto',
  'no-restricted-exports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
  'no-return-assign',
  'no-return-await',
  'no-script-url',
  'no-self-compare',
  'no-sequences',
  'no-shadow',
  'no-template-curly-in-string',
  'no-throw-literal',
  'no-undef-init',
  'no-underscore-dangle',
  'no-unneeded-ternary',
  'no-unreachable-loop',
  'no-unused-expressions',
  'no-use-before-define',
  'no-useless-computed-key',
  'no-useless-concat',
  'no-useless-constructor',
  'no-useless-rename',
  'no-useless-return',
  'no-var',
  'no-void',
  'object-shorthand',
  'one-var',
  'operator-assignment',
  'prefer-const',
  'prefer-destructuring',
  'prefer-exponentiation-operator',
  'prefer-numeric-literals',
  'prefer-object-spread',
  'prefer-promise-reject-errors',
  'prefer-regex-literals',
  'prefer-rest-params',
  'prefer-spread',
  'prefer-template',
  'radix',
  'spaced-comment',
  'symbol-description',
  'unicode-bom',
  'vars-on-top',
  'yoda',
];
const RULES = new Set([...RECOMMENDED, ...PORTED]);

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

export { getRule, isKnownRule, defineRule, RULES, RECOMMENDED };
