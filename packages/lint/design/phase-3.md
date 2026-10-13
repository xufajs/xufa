# Phase 3: traversal and selectors — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace esquery 1.7.0 and ESLint's traversal (shared/traverser.js, linter/esquery.js,
linter/source-code-visitor.js, linter/source-code-traverser.js) with @xufa/lint's own: the walk of a tree, the
selectors of listeners (parsed, analyzed, matched as esquery and ESLint do) and the running of listeners over the
steps of a traversal, in ESLint's order.

**Architecture:**

- `lib/ast/traverse.js`: `traverse(root, { enter, leave })`, with `this.skip()` and `this.break()` (what SourceCode
  uses of shared/traverser: its steps, getNodeByRangeIndex).
- `lib/ast/selectors.js`: `parse(source)` → `{ source, isExit, root, nodeTypes, attributeCount, identifierCount,
compare, test }`. The parser reads esquery's grammar (a hand-written recursive descent in the order of its PEG
  rules, with the PEG's record of the furthest failure, so an invalid selector gets esquery's message and position);
  its trees are esquery's; `nodeTypes`, the counts and `compare` are ESLint's (linter/esquery.js); `test(node, stack,
top)` is the selector compiled to closures. Ancestors are a stack (`stack[top - 1]` the parent) instead of esquery's
  arrays, which ESLint grows with `unshift` and esquery copies with `slice` for every combinator.
- `lib/ast/listeners.js`: `Listeners` (`add`, `get`, `forEachName`, `callSync`, `run(steps)`): the listeners of rules
  by selector, run over SourceCode's steps; for each node, the selectors of its type and those of any type, merged by
  specificity (as ESLint merges them, the merged list kept per type), each tested, then the listeners of those that
  match, in that order. A selector that is a type alone (`CallExpression`, `Identifier:exit`: most) is not tested.

**What esquery does that is kept:** type names compared without case; attributes by dotted paths (`=`/`!=` as text,
regular expressions, `type(...)`; `<`, `<=`, `>`, `>=` as values); fields (`.a.b`: the node is that path from an
ancestor); `:not`, `:matches`/`:is`, `:has` (relative selectors, `:has(> X)`; the walk includes the node itself),
`:first-child`, `:last-child`, `:nth-child(n)`, `:nth-last-child(n)` (by the arrays of the parent's keys), siblings
`~` and adjacents `+` (with esquery's subject `!` rules), classes (`:statement`, `:declaration`, `:pattern`,
`:expression`, `:function`, as ESLint's JavaScript language matches them; another is an error when tested).

## Tasks

### Task 1: The checks against esquery and ESLint

**Files:** Create `bench/lint-selectors.js`.

- [x] Parsing: esquery's `parse` and ours on every selector of the 60 rules, on selectors made up from the grammar's
      pieces (valid and not), compared: the same tree (regular expressions by source and flags), or the same error
      (message and position).
- [x] Matching: on every file of `node bench/lint.js --tests`, for a set of selectors covering every kind, the
      nodes esquery matches (with ESLint's options) and the nodes ours matches, at enter and exit.
- [x] Running: on the same files and the cases of the rules' tests, the calls of listeners (selector, node) of a
      visitor of every rule's listeners plus the selectors above, ESLint's SourceCodeTraverser against ours.

### Task 2: traverse

**Files:** Create `lib/ast/traverse.js`, `test/ast/traverse.test.js`; modify source-code.js (its two walks); delete
`lib/eslint/lib/shared/traverser.js`.

### Task 3: selectors

**Files:** Create `lib/ast/selectors.js`, `test/ast/selectors.test.js`.

### Task 4: listeners

**Files:** Create `lib/ast/listeners.js`, `test/ast/listeners.test.js`; modify `lib/linter.js`; delete
`lib/eslint/lib/linter/{esquery,source-code-visitor,source-code-traverser}.js` and `lib/vendor/esquery`.

### Task 5: Measure

- [x] The tests of @xufa/lint, `bench/lint-selectors.js`, `bench/lint-scope.js` (still), `node bench/lint.js` and
      `--tests`, the profile; NOTICE.md (esquery stays: lib/ast/selectors.js is made from it);
      `bench/results/lint-4.md`; `pnpm lint`, `pnpm format:check`. Not committed: the user reviews first.
