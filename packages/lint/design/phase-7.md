# Phase 7: code paths — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ESLint's code path analysis (lib/eslint/lib/linter/code-path-analysis: the analyzer, the state of a
code path, fork contexts, segments, ids, its debug helpers) with @xufa/lint's own `lib/code-path`: the same code paths
and segments (ids, links, reachability, loops) and the same events, in the same order, for the rules that listen to
them (constructor-super, getter-return, no-fallthrough, no-unreachable, no-useless-catch, no-unsafe-finally,
no-unreachable-loop... and any rule of `defineRule`).

**Architecture:** `lib/code-path/`:

- `segment.js`: segments (`id`, `nextSegments`, `prevSegments`, `allNextSegments`, `allPrevSegments`, `reachable`,
  the hidden `internal` of `used` and looped previous segments): made after others (merging the unused), unreachable,
  disconnected; linked when used.
- `fork-context.js`: the parallel paths a construct leaves open (a finally's normal and leaving paths), as lists of
  segments.
- `state.js`: the state of a code path while its tree is walked: the contexts of choices (if, ?:, &&, ||, ??, their
  assignments), optional chains, switches, tries, loops, breaks; and what return, throw, break and continue do.
- `code-path.js`: `CodePath` (`id`, `origin`, `upper`, `childCodePaths`, `initialSegment`, `finalSegments`,
  `returnedSegments`, `thrownSegments`, `traverseSegments`).
- `analyzer.js`: `CodePathAnalyzer` — given the walk (enterNode, leaveNode), it updates the state before and after each
  node and emits `onCodePathStart`/`End`, `onCodePathSegmentStart`/`End`, `onUnreachableCodePathSegmentStart`/`End`,
  `onCodePathSegmentLoop`.

What is ESLint's is kept to the letter where rules or ids can see it (the ids of segments made and discarded when a
try ends: they shift the ids after them). Its debug helpers (no output in the linter) are not kept.

## Tasks

### Task 1: The check against ESLint's analysis

**Files:** Create `bench/lint-code-path.js`.

- [x] On every file of `node bench/lint.js --tests`, every case of the rules' tests and texts written for every
      construct (each kind of loop with break, continue and labels, switch with default anywhere and fallthrough,
      try/catch/finally with return and throw in each part, optional chains, logical assignments, defaults of
      parameters, class fields and static blocks): ESLint 9.39.5's CodePathAnalyzer (from bench/node_modules) and
      ours on the same walk; compared: the events (name, segments and code paths by id, node), and at the end of each
      code path its fields and every segment of it (links by id, reachable, used, looped), and traverseSegments
      (all, from a segment, to a segment, with skip and break).

### Task 2: segment, fork-context, state, code-path, analyzer (and their tests)

### Task 3: Use it, remove the copy, measure

**Files:** Modify lib/source-code/source-code.js (its require); delete
`lib/eslint/lib/linter/code-path-analysis`, `lib/eslint/lib/shared/assert.js` if nothing else uses it.

- [x] The tests of @xufa/lint, `bench/lint-code-path.js`, `bench/lint-source-code.js` (its steps), `node bench/lint.js`
      and `--tests`, the profile, `bench/results/lint-8.md`, `pnpm lint`, `pnpm format:check`. Not committed: the user
      reviews first.
