# Phase 5: eslint-utils — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace @eslint-community/eslint-utils 4.10.1 with @xufa/lint's own modules, for what the linter uses of
it: `getStaticValue`, `getStringIfConstant` (for-direction, no-misleading-character-class, no-useless-backreference),
`findVariable` (no-import-assign), `isParenthesized` (no-extra-boolean-cast), `ReferenceTracker` with `CALL` and
`CONSTRUCT` (no-obj-calls, no-misleading-character-class, no-useless-backreference) and `isCommentToken`
(SourceCode, its token store).

**Architecture:**

- `lib/ast/static-value.js`: the value of an expression when it can be known without running the code: literals,
  operators, templates, arrays and objects of known values, `const` (and effectively constant) variables whose objects
  are not mutated, the builtin globals, and calls of the builtin functions known to have no side effects (eslint-utils'
  list: Math but random, String's methods, Number's, Object.keys...), getters of Map, Set and RegExp. Also
  `getStringIfConstant`, `getPropertyName`, `findVariable`.
- `lib/ast/reference-tracker.js`: `ReferenceTracker(globalScope).iterateGlobalReferences(traceMap)`: the reads, calls
  and constructions of globals and their properties (through `globalThis.`, `window.`..., aliases, destructuring,
  `a || b`, `a, b`, `a ? b : c`), as eslint-utils finds them; and `iteratePropertyReferences`.
- `lib/ast/tokens.js`: `isCommentToken`, the predicates of punctuators, `isParenthesized(times?, node, sourceCode)`
  (the parentheses a call, `if`, `while`, `switch`, `with`, `import()` need are not the node's).

Not kept: what the linter does not use (the references of CommonJS and ES modules, `hasSideEffect`,
`PatternMatcher`, `getFunctionNameWithKind`, `getFunctionHeadLocation`), and the nodes of TypeScript (the linter
lints JavaScript).

## Tasks

### Task 1: The check against eslint-utils

**Files:** Create `bench/lint-utils.js`.

- [x] On every file of `node bench/lint.js --tests` and every case of the rules' tests, linted: for every node,
      `getStaticValue` and `getStringIfConstant` with the node's scope (the same value, `optional` too, or both
      none), `getPropertyName` of members and properties, `isParenthesized` once and twice, `findVariable` of each
      identifier; and `ReferenceTracker#iterateGlobalReferences` with the trace maps of the rules (what it yields:
      node, path, type, info), all compared with eslint-utils 4.10.1's.

### Task 2: static-value, reference-tracker, tokens (with their tests)

### Task 3: Use them, remove the copy, measure

**Files:** Modify the six rules, source-code.js and token-store/index.js (their requires); delete
`lib/vendor/@eslint-community` (the last of lib/vendor); NOTICE.md (eslint-utils stays: these are made from it).

- [x] The tests of @xufa/lint, `bench/lint-utils.js`, `node bench/lint.js` and `--tests`, the profile,
      `bench/results/lint-6.md`, `pnpm lint`, `pnpm format:check`. Not committed: the user reviews first.
