# Phase 11: one parse for formatting and linting — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `xufa-check` lints and checks the formatting of a project in one process, parsing each file once; and
@xufa/lint has one copy of TypeScript's parser.

**Where it starts:** the linter (lib/parser.js) parses with the TypeScript installed in the project (or with
@xufa/lint, a peer dependency), into espree's ESTree; the formatter (lib/prettier/parse/typescript-estree) with its own
build of TypeScript's parser (lib/prettier/parse/typescript.cjs, 1 MB, scripts/build-typescript.mjs), bundled into
lib/prettier/dist/format.mjs, into typescript-estree's tree. Both make TypeScript's SourceFile with the same options
(the latest target, no JSDoc): a SourceFile the one makes, the other can convert. In the profile of `--tests` (11.0 s),
TypeScript's parser takes 2.5 s and lib/parser.js's conversion 3.2 s.

**Architecture:**

- `lib/typescript/`: TypeScript's parser as @xufa/lint has it (the build of scripts/build-typescript.mjs, with what the
  linter uses too: createScanner, LanguageVariant, TokenFlags, flattenDiagnosticMessageText), and
  `sourceFileOf(text, options)`: the SourceFile of the text, kept for the next call with the same text and kind (one
  file at a time: the linter makes it, the formatter is given it). Parents are set once, the formatter's way (the
  faster). format.mjs imports it (not bundled), lib/parser.js too.
- `xufa-check [paths] [--fix] [--write]` (lib/check.js, bin/xufa-check.js): the files of the config, each read once;
  linted (when the linter lints it), then formatted (when the formatter formats it), the formatter given the
  SourceFile of the linter. The problems as `xufa-lint` writes them, then the files not formatted as
  `xufa-format --check` lists them; exit code 1 for either. `--fix` writes what rules fix, `--write` the formatter's
  output (after the fixes).
- The one converter of the design (one tree for both) waits for the numbers of this phase: what is left of the
  conversions once TypeScript parses once.

## Tasks

### Task 1: one copy of TypeScript's parser

- [x] scripts/build-typescript.mjs keeps what lib/parser.js uses; its output moves to lib/typescript/typescript.cjs;
      scripts/build-format.mjs leaves it out of format.mjs (an import of it); lib/parser.js and the formatter import
      it; lib/typescript.js (the project's TypeScript) goes, and the peer dependency.
- [x] The same trees: every check (bench/lint-\*.js), the tests, `xufa-format --check` and `xufa-lint` on the
      repository; `bench/lint.js` (load, cold) and `bench/format.js`.

### Task 2: the SourceFile made once

- [x] `sourceFileOf()`; lib/parser.js and typescript-estree's parse() take their SourceFile from it.
- [x] A check: linting then formatting each file of the repository with the SourceFile shared gives the problems and
      the output of each alone.

### Task 3: xufa-check

- [x] lib/check.js and bin/xufa-check.js (package.json bin, README, docs page); tests (test/check.test.js: problems,
      files not formatted, exit codes, --fix, --write).
- [x] The root package.json: `check` (xufa-check).

### Task 4: measure

- [x] bench/check.js: `xufa-check` against `xufa-format --check` then `xufa-lint` (two processes), and against
      `prettier --check` then `eslint`, on the repository; bench/results/check-1.md; the profile of xufa-check; what
      the one converter would save. Not committed: the user reviews first.

## What it gave (bench/results/check-1.md)

- One copy of TypeScript's parser: the linter loads in 33 ms (80), TypeScript need not be installed; the trees are
  the same (13,062 texts against the installed TypeScript's). Parents set by a walk of the linter's own (TypeScript's
  way: 571 ms against 484 on the files of `--tests`).
- The SourceFile shared (keepSourceFile/takeSourceFile, not one sourceFileOf: the linter keeps the last it made, the
  formatter takes it once; bench/lint-shared-parse.js): 5% less in one process, which xufa-check gives back. xufa-check
  takes what `xufa-lint` and `xufa-format --check` take (1.00x and 0.98x; a run before 1.05x and 1.02x), 1.28x and
  1.36x less than `eslint` and `prettier --check`.
- The estimate of the design (20 to 30% less) was wrong: TypeScript's parser is little of the work. The one converter
  would save at most one of the two conversions, about 1 s of 7.5: not done. What would make both faster is the files
  in parallel (worker threads), which neither command does.
