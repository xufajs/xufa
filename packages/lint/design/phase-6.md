# Phase 6: SourceCode — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ESLint's JavaScript language (lib/eslint/lib/languages/js: index.js, validate-language-options.js,
source-code/source-code.js and the 13 files of its token store) and what only it uses (shared/ast-utils.js,
shared/directives.js, conf/globals.js, conf/ecma-version.js) with @xufa/lint's own: `sourceCode` as rules see it
(every method and field of ESLint 9.39.5's), its token store, the globals of each edition, and the language object
the linter parses and analyzes with.

**Architecture:**

- `lib/source-code/token-store.js`: `TokenStore` — the 20 methods of tokens and comments (`getFirstToken`,
  `getTokenBefore`, `getTokensBetween`, `getCommentsInside`...), with their options (`includeComments`, `filter`,
  `skip`, `count`, padding). The index from offsets to tokens is ESLint's (its answers for offsets that are not at a
  token's edge are kept), in an `Int32Array` instead of an object with a key per edge; the cursors (a chain of objects
  of 9 classes per call) become loops.
- `lib/source-code/source-code.js`: `SourceCode` — text and lines, locations and indexes, scopes
  (`getScope`, `getDeclaredVariables`, `markVariableAsUsed`, `isGlobalReference`), ancestors, JSDoc comments, spaces
  between tokens, directive comments (`getInlineConfigNodes`, `getDisableDirectives`, `applyInlineConfig`), globals
  (`applyLanguageOptions`, `finalize`), and `traverse()` (the steps, with code paths).
- `lib/source-code/globals.js`: the globals of a config and of `/* global */` comments into the global scope, the
  variables of `/* exported */` comments; `lib/data/ecma-globals.js`: ESLint's globals of each edition (data).
- `lib/source-code/language.js`: the language (`normalizeLanguageOptions`, `parse`, `createSourceCode`,
  `lineStart`, `columnStart`...), as lib/linter.js and the reports use it. `validateLanguageOptions` is not kept: the
  linter does not call it (lib/config.js validates).
- `lib/util/text.js`: line breaks and the shebang (shared/ast-utils.js), for SourceCode and the copied code that still
  uses them (code paths, ast-utils, no-fallthrough).

## Tasks

### Task 1: The check against ESLint's SourceCode

**Files:** Create `bench/lint-source-code.js`.

- [x] On every file of `node bench/lint.js --tests` and every case of the rules' tests: ESLint 9.39.5's
      SourceCode (from bench/node_modules) and ours on the same tree and scopes (each its own analysis where they
      change them). Compared: every method of tokens for every node (and pairs of neighbors for the "between" ones)
      with a set of options (none, numbers, skip, count, filter, includeComments, their mix, and invalid ones: the
      same errors); getTokenByRangeStart of every offset; the fields (text, lines, lineStartIndices,
      tokensAndComments, hasBOM, isESTree); getText, getLocFromIndex and getIndexFromLoc of every offset,
      getNodeByRangeIndex, getJSDocComment, getScope, getAncestors, isGlobalReference, isSpaceBetween(Tokens),
      getInlineConfigNodes, getDisableDirectives, applyInlineConfig, then the global scope after applyLanguageOptions
      and finalize (its variables, their eslint* fields, through, implicit), markVariableAsUsed, and traverse()'s steps.

### Task 2: text, ecma-globals, token-store (and their tests)

### Task 3: globals, source-code, language

### Task 4: Use them, remove the copies, measure

**Files:** Modify lib/linter.js, the copied code that requires shared/ast-utils; delete
`lib/eslint/lib/languages`, `shared/ast-utils.js`, `shared/directives.js`, `shared/assert.js` when nothing uses it,
`conf/globals.js`, `conf/ecma-version.js`.

- [x] The tests of @xufa/lint, `bench/lint-source-code.js` (and the earlier checks, which use SourceCode),
      `node bench/lint.js` and `--tests`, the profile, `bench/results/lint-7.md`, `pnpm lint`, `pnpm format:check`.
      Not committed: the user reviews first.
