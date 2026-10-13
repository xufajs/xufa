# Phase 8: reports, fixes, directives — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace what is left of ESLint's linter (lib/eslint/lib/linter: file-report.js, interpolate.js,
rule-fixer.js, source-code-fixer.js, apply-disable-directives.js, file-context.js; lib/eslint/lib/shared:
severity.js, deep-merge-arrays.js, assert.js; lib/eslint/conf/replacements.json and rule-names.json) with @xufa/lint's
own, so that lib/linter.js runs on no copied code (the 60 rules aside, phase 9).

**Architecture:**

- `lib/report/report.js`: `FileReport` — a rule's report (`context.report(node, message)` or `{ node | loc, message |
messageId, data, fix, suggest }`) into a problem: its message (from meta.messages, `{{ data }}` put in), its place
  (1-based columns), its fix (one, or several merged), its suggestions; ESLint's errors for wrong reports. And
  `interpolate`.
- `lib/report/fixer.js`: the fixer rules get (`replaceText`, `insertTextBefore`, `remove`...), and the merging of the
  fixes of one report.
- `lib/report/apply-fixes.js`: the fixes of problems applied to a text (not overlapping; a BOM kept).
- `lib/report/directives.js`: eslint-disable and -enable comments on problems (`suppressions`), and the reports of
  those that disable nothing (with the fix that removes them).
- `lib/rule-context.js`: what `context` is made from (cwd, filename, sourceCode, languageOptions, settings...).
- `lib/util/severity.js`, `lib/util/deep-merge.js`; `lib/data/rule-names.json`, `lib/data/replacements.json`.

## Tasks

### Task 1: The check against ESLint's modules

**Files:** Create `bench/lint-report.js`.

- [x] Run the rules' tests' cases (their rules on, with fixes) and the files of `node bench/lint.js --tests` (the
      recommended rules, linted and fixed); where lib/linter.js reports, applies directives and fixes, ESLint 9.39.5's
      modules (from bench/node_modules) are run on the same input too, and compared: each problem (or error) of each
      report, the problems after directives (suppressions, unused directives with their fixes), each output of fixes.
      And interpolate, the severities, deepMergeArrays and the fixer on made-up inputs.

### Task 2: The modules (and their tests)

### Task 3: Use them, remove the copies, measure

**Files:** Modify lib/linter.js, lib/rules.js, test/rule-tester.js; delete `lib/eslint/lib/linter`,
`lib/eslint/lib/shared`, `lib/eslint/conf`, `lib/eslint/rule-names.json`.

- [x] The tests of @xufa/lint, `bench/lint-report.js`, the earlier checks, `node bench/lint.js` and `--tests`, the
      profile, `bench/results/lint-10.md`, `pnpm lint`, `pnpm format:check`. Not committed: the user reviews first.
