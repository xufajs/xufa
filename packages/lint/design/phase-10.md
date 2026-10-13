# Phase 10: the rest of the port, and ES modules — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nothing of ESLint's code is left in @xufa/lint but the port of its rules' tests, and the package is ES
modules, as the other packages of the repository are since the move of 2026-10 (no `'use strict'`: modules are
strict).

**Architecture:** lib/stubs/espree.js is the last stand-in: what of it the linter uses (parse with espree's options,
the latest ecmaVersion) moves to lib/parser.js. The package becomes `"type": "module"` with `tools/esm/convert.mjs`
(the codemod of the move, then hoist.mjs and named-imports.mjs where they apply). Rules stay loaded when first used:
each is an ES module, read with `require()` of ES modules (Node >= 22.12, synchronous) from lib/rules/index.js, so
that linting a file loads only the rules its config turns on — or imported at the top if that costs nothing in
`bench/lint.js` (load). index.mjs goes: index.js is the entry for import, and require() of it gives the same
(`'module.exports'`, as the convert tool does for entries).

## Tasks

### Task 1: espree's stand-in

- [x] `parse(text, options)` and `LATEST_ECMA_VERSION` of lib/stubs/espree.js where they belong (lib/parser.js,
      lib/data/ecma-globals.js); its users (lib/linter.js, lib/source-code/language.js, the test of SourceCode,
      bench/lint-code-path.js, bench/lint-source-code.js) on them; `rm -r lib/stubs`.

### Task 2: the port tool keeps only the tests

- [x] tools/port-lint/port.js: no more lib/eslint, lib/vendor, lib/stubs; it ports the rules' tests (their require of
      the rule as `../../lib/rules/<name>`) and rule-names.json (lib/data). Its header says so.
- [x] xufa.lint.config.js: the ignores of lib/eslint and lib/vendor out (lint and format).
- [x] NOTICE.md (ESLint's license for the rules, which report what ESLint's do, and the tests), README (what the
      package is: no "ported"), package.json description, tools/docs/pages/lint.page.html (no lib/eslint).

### Task 3: ES modules

- [x] `node tools/esm/convert.mjs packages/lint/index.js packages/lint/bin packages/lint/lib packages/lint/test`
      (not lib/prettier: it is ES modules already), then what it reports by hand; package.json: `"type": "module"`,
      exports without index.mjs, files.
- [ ] The rules loaded when first used (above), measured against importing them all. (Kept as they were, loaded
      when first used; not measured yet.)
- [x] The bench checks (CommonJS, bench/package.json) require lib's ES modules: their named exports; a module of one
      value (escape-regexp) through `.default` where they use it.
- [ ] The tests (`pnpm --filter @xufa/lint test`, which does not run yet: `Running the tests now`; the node:test run
      of it), every check, both bin/ commands on the repository, `pnpm lint`, `pnpm format:check`;
      `grep -r "use strict" packages/lint` finds only strings of the rules' tests and of TypeScript's build
      (lib/prettier/dist, generated).

### Task 4: measure

- [x] `node bench/lint.js` and `--tests`; `bench/results/lint-12.md` (the profile: not taken again). Not committed:
      the user reviews first.

Done but for the above: the node:test run passes (5,352 tests, 32 skipped), the checks find no difference, the
repository lints and formats clean with the ES modules. tools/esm/convert.mjs broke the rules (`module.exports = {
meta, create(context) {...} }` into `export const create = (context) {`) and imported dist/format.mjs as a default:
fixed by hand. Rules export `meta` and `create`.
