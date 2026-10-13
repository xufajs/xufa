# Phase 4: regular expressions — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace @eslint-community/regexpp 4.12.2 with @xufa/lint's own `lib/regexp/`: the validator of ECMAScript's
regular expressions (ES5 to ES2025, Annex B, the `u` and `v` modes, named groups and their ES2025 duplicates,
modifiers, Unicode properties by edition), its parser into regexpp's trees, and their visitor, for the seven rules
that use them (no-control-regex, no-empty-character-class, no-invalid-regexp, no-misleading-character-class,
no-regex-spaces, no-useless-backreference, no-useless-escape) and rules/utils/regular-expressions.js.

**Architecture:**

- `lib/regexp/unicode.js`: the names of Unicode properties ECMAScript accepts, by edition (General_Category and
  Script values, binary properties, properties of strings), and the ranges of ID_Start and ID_Continue for group names
  — data, kept as regexpp has it (its compressed ranges) — with the tests on them.
- `lib/regexp/reader.js`: the pattern as code units or code points (with `u`/`v`), with three of lookahead.
- `lib/regexp/validator.js`: `RegExpValidator` — the grammar of the specification's productions, in its order, with
  regexpp's messages, and its callbacks (`onCharacter`, `onPatternEnter`... as methods of the options object, which
  no-control-regex is), including the second pass Annex B makes when a pattern without `u` has named groups.
- `lib/regexp/parser.js`: `RegExpParser` (`parseLiteral`, `parsePattern`, `parseFlags`): the tree, built from the
  validator's callbacks (Pattern, Alternative, Group, CapturingGroup, Quantifier, Assertion, Character,
  CharacterSet, CharacterClass, CharacterClassRange, ExpressionCharacterClass, ClassIntersection, ClassSubtraction,
  ClassStringDisjunction, StringAlternative, Backreference with its resolved groups, Modifiers, ModifierFlags, Flags,
  RegExpLiteral), with `parent`, `start`, `end`, `raw`.
- `lib/regexp/visitor.js`: `visitRegExpAST(node, handlers)` (`on<Type>Enter`/`Leave`).

## Tasks

### Task 1: The check against regexpp

**Files:** Create `bench/lint-regexp.js`.

- [x] Patterns: every regular expression literal of the files of `node bench/lint.js --tests` and of the cases of the
      rules' tests, every string given to `RegExp(...)` there, and patterns made up from the grammar's pieces (valid
      and not). For each, with each set of flags (none, `u`, `v`, and as a literal with its own) and editions (5,
      2015, 2018, 2020, 2022, 2024, 2025; strict or not): `validatePattern` (fine, or the same message and index),
      the calls of every callback with their arguments, in order, and `parsePattern`'s tree (every node's fields,
      `parent` by reference); `parseLiteral` and `validateFlags` on literals; `visitRegExpAST`'s calls on the trees.

### Task 2: unicode, reader

### Task 3: validator

### Task 4: parser, visitor

### Task 5: Use it, measure

**Files:** Modify the seven rules and rules/utils/regular-expressions.js (their requires); delete
`lib/vendor/@eslint-community/regexpp`; NOTICE.md (regexpp stays: lib/regexp is made from it, its data kept).

- [x] The tests of @xufa/lint, `bench/lint-regexp.js`, `node bench/lint.js` and `--tests`, the profile,
      `bench/results/lint-5.md`, `pnpm lint`, `pnpm format:check`. Not committed: the user reviews first.
