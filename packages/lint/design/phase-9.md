# Phase 9: the rules — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 60 rules ported from ESLint 9.39.5 (lib/eslint/lib/rules, ~11,000 lines) and what they share
(rules/utils: ast-utils.js, char-source.js, regular-expressions.js, unicode/) with @xufa/lint's own `lib/rules`: each
rule written anew in the style of the repository, on @xufa/lint's modules (lib/ast, lib/regexp, lib/scope...),
reporting what ESLint's rule reports (messages, places, fixes, suggestions) for every option of it. Then lib/eslint is
gone.

**Architecture:**

- `lib/rules/index.js` (was lib/rules.js): the rules by name, loaded when first used; `lib/rules/<name>.js`: a rule.
- `lib/rules/utils/`: what rules share — `ast.js` (what ast-utils gives the rules that use it, ~35 of its ~90
  functions: isFunction, getStaticPropertyName, isSpecificMemberAccess, skipChainExpression, getPrecedence,
  isConstant...), `char-source.js` (the characters of string literals and templates with their places),
  `regular-expressions.js`, `unicode.js` (combining marks, emoji modifiers, regional indicators, surrogate pairs).
- The rules' tests (test/rules, ESLint's) stay as they are, but for their requires.

## Tasks

### Task 1: The check of the rules against ESLint's

**Files:** Create `bench/lint-rules.js`.

- [x] For each rule (or those of `--rule a,b`): the texts of every case of all the rules' tests (with their language
      options) and the files of `node bench/lint.js --tests` (one in --sample), each linted with the rule and with
      ESLint 9.39.5's rule (bench/node_modules, running on @xufa/lint's SourceCode) under the same name, with each set of
      options the rule's tests use (and none); compared: the problems (message, messageId, place, node type, fix,
      suggestions with theirs), or the same error. Both rules run in one lint of a text (one parse).

### Task 2: utils (checked against ast-utils on every node, as bench/lint-utils.js does)

**Files:** Create `lib/rules/utils/*.js`, `bench/lint-rule-utils.js`; the copied rules require them (one at a time,
`bench/lint-rules.js` after each).

- [x] 78,754,318 results compared on 2,499 files and the rules' cases: no difference. canTokensBeAdjacent tokenizes
      pieces of code: where espree and @xufa/lint's tokenizer disagree on a text (42 results: a regular expression after
      a `}` at the top, which acorn tells from a division by its context; JSX text, which espree without `jsx` rejects),
      the check counts the difference apart. No rule gives such texts: `bench/lint-rules.js` finds no difference.
- [x] The copies require lib/rules/utils; lib/eslint/lib/rules/utils removed.

### Task 3: The rules, ten at a time

- [x] no-empty by hand, the model of the others (a planted bug: 158 differences in `bench/lint-rules.js`).
- [x] Each rule rewritten (`lib/rules/<name>.js`), its test's require changed, until its tests pass and
      `bench/lint-rules.js --rule <name>` finds no difference; the copy removed.

### Task 4: Remove lib/eslint, measure

- [x] lib/rules.js → lib/rules/index.js; `rm -r lib/eslint`; the tests, every check, `node bench/lint.js` and
      `--tests`, the profile, `bench/results/lint-11.md`, `pnpm lint`, `pnpm format:check`. Not committed: the user
      reviews first.

Done: 60 rules, 12,078 lines → 5,594; every check finds no difference; `bench/results/lint-11.md` (1.29x cold, 1.23x
warm on the code; 1.18x and 1.14x with the tests).
