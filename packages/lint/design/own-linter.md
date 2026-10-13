# @xufa/lint without copied code: design

The linter of @xufa/lint runs ESLint 9.39.5's code as it is: its 60 recommended rules and what they need of ESLint
(`lib/eslint`, 111 files, ~26,000 lines) and the packages ESLint takes them from (`lib/vendor`, 9 packages, ~17,000
lines), copied by `tools/port-lint` and changed only in their requires. The formatter went this way already: prettier's
code was ported and is @xufa/lint's own since (`lib/prettier/README.md`). This is the same for the linter: when it is
done, `lib/eslint`, `lib/vendor` and `lib/stubs` are gone, and every line of the linter is code of this repository,
written in its style, linted and formatted by it.

## What must not change

- **What rules see.** Rules are ESLint rules: `meta`, `create(context)` and listeners of selectors and code path
  events. `defineRule` takes rules written for ESLint, so the API they use is kept as ESLint documents it: `context`
  (`report`, `options`, `sourceCode`, `settings`, `languageOptions`, `filename`...), `SourceCode` (text, tokens and
  comments, `getScope`, `getDeclaredVariables`, `markVariableAsUsed`, `isSpaceBetween`...), scopes, variables and
  references as eslint-scope makes them, code paths and their segments, selectors as esquery reads them, fixers.
  What is behind it is free: classes, files, algorithms, data structures.
- **What it reports.** The same problems as ESLint 9.39.5 (rule, message, location, fix, suggestions) on every file:
  ESLint's 5,271 tests of the rules that pass now keep passing (32 more need another parser and stay skipped), and
  `bench/lint.js` finds no difference with ESLint on the files of this repository.
- **Its speed.** No step makes it slower. `bench/lint.js` measures ESLint and @xufa/lint on the same files (load, a
  first pass, warm passes), and each phase writes its numbers to `bench/results/lint-N.md`.

## How each piece is replaced

From the leaves up, a piece at a time: what a piece gives the rest is kept, and the rest moves to it when it is
there. Each piece is written anew from what it does (its documentation, its tests, ESLint's tests of the rules, the
original's code read for its behavior), not copied: in the style of the repository (its comments, its names, short
modules with one concern), as the files of `lib/` around it are. Then:

1. Its own tests (`test/<area>/*.test.js`), on what it does, without the original.
2. A check against the original (`bench/lint-<piece>.js`): the original's npm package (a dev dependency of bench/,
   as prettier is) and the new piece run on the same inputs, every file of this repository and every case of the
   rules' tests, and their results are compared (the scopes and variables of each file, the tree of each regular
   expression, the nodes each selector matches...). It runs until they agree on all of them.
3. The rules' tests, `bench/lint.js` (same problems as ESLint, the time), then the copy is removed.

`tools/port-lint` copies all of ESLint's code and the packages again: it is not run any more (it would undo this),
and phase 10 keeps only its port of ESLint's tests of the rules.

ESLint's code that is derived from stays MIT: NOTICE.md keeps ESLint's license and those of the packages, as it does
for prettier's.

## Where the code goes

```
lib/
  linter.js            Linter: verify, verifyAndFix (stays; takes what is now lib/eslint/lib/linter)
  engine.js cli.js config.js formatters.js glob.js globals.js parser.js typescript.js   (stay)
  rules/
    index.js           the rules, by name, loaded when first used (was lib/rules.js)
    <rule>.js          the 60 rules
  ast/
    visitor-keys.js    the child keys of each node type (eslint-visitor-keys)
    traverse.js        walking a tree (estraverse, esrecurse, shared/traverser)
    selectors.js       selectors, parsed and compiled to matchers by node type (esquery, linter/esquery)
    utils.js           what rules ask of nodes and tokens (rules/utils/ast-utils, esutils, eslint-utils' predicates)
    static-value.js    values of expressions known without running them, references to globals (eslint-utils)
  scope/               scope analysis: scopes, variables, references (eslint-scope)
  code-path/           code paths and their segments (linter/code-path-analysis)
  source-code/
    source-code.js     SourceCode (languages/js/source-code)
    tokens.js          tokens and comments by position (source-code/token-store)
    comments.js        directive and configuration comments (plugin-kit, levn, shared/directives)
  report/
    report.js          problems of rules: messages, data, fixes, suggestions (file-report, interpolate, rule-fixer)
    fix.js             applying fixes to a text (source-code-fixer)
    directives.js      eslint-disable and friends on problems (apply-disable-directives)
  regexp/              regular expressions: parser, validator, visitor of their trees (regexpp)
  util/                small helpers (escape-string-regexp, Unicode checks of rules/utils/unicode, char-source)
  data/                ESLint's data: rule names, replacements, ECMAScript versions, globals of the versions (conf/)
```

## Phases

Each phase is a plan of its own (`design/phase-N.md`), written when the one before is done, and ends with the tests,
the checks against the original and `bench/lint.js` as above.

| Phase | Replaces                                                                                                                                           | Lines   |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1     | The measure (`bench/lint.js`), and the leaves: escape-string-regexp, esutils, eslint-visitor-keys, plugin-kit, levn, the stubs of debug and config | ~1,600  |
| 2     | Scope analysis: eslint-scope, and esrecurse and estraverse, which only it uses                                                                     | ~3,300  |
| 3     | Traversal and selectors: esquery, shared/traverser, linter/esquery, source-code-traverser, source-code-visitor                                     | ~5,000  |
| 4     | Regular expressions: @eslint-community/regexpp                                                                                                     | ~3,000  |
| 5     | eslint-utils: static values, reference tracking, predicates of tokens                                                                              | ~2,600  |
| 6     | SourceCode and its token store, languages/js                                                                                                       | ~2,900  |
| 7     | Code path analysis                                                                                                                                 | ~4,200  |
| 8     | Reports, fixes, directives; lib/linter.js on them alone                                                                                            | ~1,700  |
| 9     | The 60 rules and ast-utils, ten at a time                                                                                                          | ~14,000 |
| 10    | Removing lib/eslint, lib/vendor, lib/stubs and the port tool; NOTICE, README, the lint config                                                      | —       |
| 11    | One parse for the formatter and the linter: one converter of TypeScript's tree to ESTree, and `xufa-check` (below)                                 | —       |

Scope analysis comes first of the big pieces: it is where the copied code spends the most (below).

The copied files are ignored by `xufa.lint.config.js` (lint and format); the new ones are not, and are linted and
formatted as the rest.

## Phase 11: one parse for formatting and linting

Formatting and linting parse each file, each with a converter of its own from TypeScript's tree to ESTree:
lib/parser.js (the installed TypeScript; the tree, tokens, comments and locations espree makes) and
lib/prettier/parse/typescript-estree (the formatter's copy of TypeScript's parser; Babel's parentheses for
JavaScript, locations only when asked). `pnpm lint` and `pnpm format:check` are two processes, each loading
TypeScript and parsing every file.

The formatter's output is printed from a doc, not edited from the tree: it has no tree, and what it changes
(parentheses, semicolons, commas, quotes, numbers) changes tokens and every location after them. Translating the tree
to the output is as much work as parsing it and less sure; but when a file is formatted already (the output is its
text, as in CI), the tree of the formatter is the tree of the file, and the linter can have it.

- One converter with the options both need (the tokens and locations of espree for the linter, Babel's parentheses
  for the formatter), on one copy of TypeScript's parser: the two of today go.
- `xufa-check` (and `xufa-lint --format`): for each file, one parse; the linter first (the formatter attaches comments
  to the tree), then the formatter, whose output is compared with the text. A file the formatter changes is parsed
  again only to lint what `--write` wrote.
- Measured by a bench of its own: `xufa-check` against `xufa-format --check` then `xufa-lint`, and against prettier
  then ESLint. Parsing is about 37% of linting (below): an estimate of 20 to 30% less for the two together, to be
  measured.

## Where the time goes now

`node bench/lint.js --tests` (bench/results/lint-1.md): on 2,436 files (14.9 MB, 36,197 problems), @xufa/lint takes
1.35 times what ESLint takes (7.2 s warm against 5.3 s). Its profile (`node --cpu-prof`, two passes, 15.1 s):

| Where                                         | Time  |                                                                 |
| --------------------------------------------- | ----- | --------------------------------------------------------------- |
| lib/parser.js and TypeScript's scanner/parser | 5.7 s | ours, not copied: a track of its own, after or between phases   |
| esrecurse (for eslint-scope)                  | 2.3 s | 2.1 s in its constructor: each pattern copies the table of keys |
| garbage collection                            | 1.9 s |                                                                 |
| lib/eslint/lib/linter (traversal, code paths) | 1.5 s |                                                                 |
| the rules                                     | 0.9 s |                                                                 |
| eslint-scope                                  | 0.6 s |                                                                 |
| SourceCode, token store                       | 0.5 s |                                                                 |
| esquery                                       | 0.3 s |                                                                 |

## Where it can be faster

To measure in each phase (`node --cpu-prof` on `bench/lint.js`), not to assume:

- **Selectors** (phase 3): esquery tests each selector on each node. Compiled by node type (most selectors name one),
  a node is tested only by the selectors that can match it.
- **Traversal** (phase 3): ESLint walks the tree into a list of steps, then runs the list. One walk, with the keys of
  each type known in advance, may do.
- **Regular expressions** (phase 4): seven rules parse the same literals; parsed once per file, they are shared.
- **Scopes** (phase 2): eslint-scope makes a visitor of esrecurse for each pattern, and each copies the table of
  keys (2.1 s of 15.1 s above); a switch over node types, nothing copied per node.
- **Tokens** (phase 6): the token store chains cursor objects for each query; arrays of tokens and comments with
  binary search answer most queries without them.
- **Code paths** (phase 7): built for every file; when no rule listens to their events, they need not be.
- **The parser** (not copied, but the most time): lib/parser.js converts TypeScript's tree to ESTree (`make`,
  `visit`, `tokenOf`: 2 s), after TypeScript's own parse.

## Running the tests now

`pnpm test` does not run on a fresh clone: the `coverage` line of `.gitignore` also ignores
`packages/test/src/coverage/`, so the runner's coverage modules are not in the repository. Until they are, the tests
of @xufa/lint run on `node:test` with the globals the runner gives (a file outside the repository that sets
`describe`, `it` and `expect` from `packages/test/src/expect`): 5,303 tests, 5,271 pass, 32 skipped.
