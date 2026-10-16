# @xufa/lint: a refactor for speed, then readability, then less code

What @xufa/lint is after phase 11 (own-linter.md): a linter of its own code (lib/, 15,000 lines: the 60 rules 6,000,
lib/parser.js 1,400, regexp 2,000, ast 1,850, code-path 1,400, source-code 1,200, scope 850) and a formatter ported
from prettier 3.9.9 (lib/prettier: src 44,000 lines, parse 5,100, built into one file, dist/format.mjs), on one copy of
TypeScript's parser (lib/typescript). Against the originals, on this repository: `xufa-lint` 1.22x ESLint's speed
(1.18x with the tests), `xufa-format --check` about 2x prettier's, `xufa-check` 1.36x `eslint` + `prettier --check`.

The goals, in this order: faster, easier to read, less code. Every step keeps what the checks keep today: the same
problems as ESLint (bench/lint.js, bench/lint-\*.js), the same output as prettier (bench/format.js), the tests.

## What was measured (2026-10-13)

- **The linter** (`--tests`, two passes, 11.0 s): TypeScript's parser 2.5 s, lib/parser.js's conversion 3.2 s
  (`make` 0.7, `tokenOf` 0.7, `visit` 0.6, `tokenFor` 0.3: tokens and locations for every node and every file),
  garbage collection 1.5 s, traversal 0.75 s, rules 0.65 s, code paths 0.5 s, scopes 0.46 s.
- **The formatter** (`xufa-format --check`, 4.7 s): spread over prettier's algorithms, none above 6%: garbage
  collection 0.43 s, printDocToString 0.27, the conversion to ESTree 0.28, `fits` 0.14, `propagateBreaks` 0.08;
  reading the files 0.19 s.
- **Both run on one core.** `xufa-lint` uses 196% of a CPU (the second is the garbage collector), on a machine with
  more than ten.
- **Code that never runs** (V8's coverage, formatting the repository's 1,722 files from lib/prettier/src; linting it
  and the tests): the linter runs 95% of its code; the formatter 73 to 77% (markdown 111 KB not run, JavaScript 90 KB,
  the converter 29 KB). Much of what does not run is reachable by other projects' code; what is not:
  - the JavaScript printer handles 108 kinds of nodes that the parser (TypeScript's, into typescript-estree's tree)
    never makes: Flow's types, components, hooks, `match`, enums and declarations; Babel's literals
    (`StringLiteral`, `NumericLiteral`...), `ClassProperty`, `OptionalMemberExpression`, `TypeCastExpression`; Babel's
    proposals (`DoExpression`, `BindExpression`, `ModuleExpression`, `TopicReference`, records, tuples). Whole files
    are those: print/flow.js (332 lines, 25% run), print/match.js (221), print/component.js (69), and branches of
    print/estree.js, print/type-annotation.js, parentheses/needs-parentheses.js (903 lines, 62% run),
    comments/handle-comments.js (968, 66%), massage-ast/ (18%);
  - embeds of languages the formatter does not format (print/angular.js, 87 lines), options it never has (the cursor,
    ranges), prettier's plugin and option machinery for one fixed set of printers.

## Phase A: faster

1. **Files in parallel.** Done (bench/results/commands-1.md): child processes, not threads (4 threads take 1.3 times
   what 4 processes take: they share V8's compiling and collecting), at most 4 (more are slower here). `xufa-lint`
   1.41 s (3.30 alone; eslint 3.84, `--concurrency auto` 1.78), `xufa-format --check` 2.29 s (4.13; prettier 7.05),
   `xufa-check` 3.47 s (7.04). As planned: `xufa-lint`, `xufa-format` and `xufa-check` give files to worker threads (one per core but
   one, at most 8), each loading the config from its file; above a number of files (where starting a worker, about
   0.1 s with the compile cache, pays), else one thread as today. Results come back in the order of the files;
   `--fix`/`--write` write in the workers. `--concurrency n|off` (ESLint's flag). Measured: bench/lint.js and
   bench/check.js run the commands, not loops in one process, for this. Expected: the largest gain of the refactor
   (several times on this repository).
2. **The linter's tree: less made per file.** Done (bench/results/lint-13.md): locations made when read (a class,
   `Located`), tokens by one scan with what the tree tells (not for JSX); parsing 2.2 times as fast (1.5 s for the
   texts of `--tests`, 3.2 before), the linter 1.63x/1.74x ESLint's speed on the code (1.22x/1.24x), `xufa-lint` 1.3
   s. A start kept by position: not faster, left out. As planned: Tokens and comments as two arrays of plain objects made in one scan
   (today: a token object per token from a second pass over TypeScript's scanner), locations of nodes made when read
   (a lazily computed `loc` on the nodes' prototype, from the ranges and one index of line starts), fewer objects for
   ranges. Each change measured on its own (bench/lint.js, the profile) and kept only if faster; rules see the same
   tree (bench/lint-\*.js; the tests of the parser).
3. **Garbage collection.** Done for the linter (bench/results/lint-14.md, bench/alloc.js): 6.6 GB allocated in a
   pass of `--tests`, 5.3 GB after (comments, the steps of the traversal, a closure of code paths, globals); the
   linter 1.73x/1.86x ESLint's speed on the code, `xufa-lint` 1.16 s. The formatter's go with A4. As planned: The arrays and objects made per node in traversal, scope analysis and code paths
   (listeners' arrays, `[...stack]`, ranges copied): by the profile's allocations (`--heap-prof`), the largest first.
4. **The formatter.** `printDocToString`, `fits` and `propagateBreaks` (the doc printer) and the conversion to ESTree:
   what the profile shows, measured against bench/format.js. A smaller gain than 1 to 3: prettier's algorithms are
   already what it spends on. **First pass** (bench/results/format-6.md, on a busy machine): 1% (fits() looks up the
   printed length of fills on fills only); three other changes were not faster or not exact. Left: break propagation
   while docs are built, widths of flat groups kept between fits() calls, getOrInsertComputed()'s caches as fields.
   **Second pass** (bench/results/format-8.md): the timings of the first pass were partly taken on the E-cores
   (Windows moves a process started from a background shell there: twice the time); pinned to the P-cores (`start
/affinity FFF`) the noise of a run is ±0.5%, and phases timed apart (parse 30%, AST to doc 48%, doc to string 20%
   of JavaScript) show what end to end cannot. Kept: propagateBreaks() pushes no strings (the doc phase 4% faster).
   Not kept: printing a template literal's `${}` without printDocToString() when it is flat text (0.2%). What is
   left is prettier's algorithms spread over hundreds of functions, none above 1–2% on its own: the cache helpers,
   the dispatch of printEstree and the frames of each node print were looked at and are not the cost the profile's
   self time suggests (it counts what V8 inlined into them). Larger gains need B2 (one conversion for linting and
   formatting) or fewer docs made per node, not tuning.
5. **A cache, opt-in** (`--cache`, ESLint's flag and file): a file whose text and config are as at the last run is not
   linted or formatted again. Last of A: it is a feature as much as speed.

## Phase B: easier to read

1. **lib/parser.js in three:** the conversion of TypeScript's nodes, the tokens and comments (with A2), and the
   locations; its 1,400 lines in one class today.
2. **One converter for the formatter and the linter** (own-linter.md's phase 11, not done then: it saves about 1 s of
   7.5 in xufa-check). With A2 done and the unreachable code of C gone, the linter's tree as typescript-estree's tree
   adjusted (what espree makes differently: tokens, `Literal` values, `range`/`loc`, parentheses) against
   lib/parser.js: kept if it is not slower for linting, and `xufa-check` converts each file once. It goes before C2
   only if it removes more than it adds.
3. **The formatter's large modules,** after C1 (smaller then): comments/handle-comments.js, needs-parentheses.js and
   print/estree.js as tables by node type where they are chains of conditions; names and comments where prettier's
   are unclear.

## Phase C: less code

1. **What the parser never makes, out of the formatter:** the printers, parentheses, comments and checks of the 108
   kinds of nodes above; Flow's and Babel's options (`__isVueForBindingLeft`, `__isInHtmlAttribute`...); the embeds of
   Angular, Vue, HTML and CSS; massage-ast (prettier's check of its own output, which nothing calls here); what the
   coverage then shows unused of utilities/. Each removal is code no input can reach (a kind of node the converter
   cannot make, an option the formatter does not take): proved by the converter's list of kinds
   (parse/typescript-estree/node-types.js) and by a run of the coverage, not by "the repository does not use it".
   Expected: 4,000 to 6,000 lines. **Done** (bench/results/format-5.md): 3,972 lines out (lib/prettier/src 44,023 to
   40,244, parse 5,141 to 4,948; 23 modules), dist/format.mjs 1,284 to 1,199 KB, the same speed. In order: the
   printers of Flow, Hermes, Angular, Vue and HTML bindings and massage-ast; a codemod of case labels and lists of
   types; a simplifier of the conditions those types and parsers never run make constant; what lint then showed
   unused and the exports nothing imports, until none; markdown's MDX-only printing; the walk of postprocessing. The
   repository's output is still prettier's in all four languages, the corpus has 0 new differences. The coverage
   (repository and corpus, both sets of options) left 119 named functions that never ran: the rest of them are
   reachable (decorators, Jest's each tables, insertPragma, JSON5 templates, HTML in markdown...) and stay.
2. **A wider corpus for the checks before C1.** Done (bench/results/corpus-1.md): bench/corpus.js (5,305 files of the
   installed packages), bench/format-corpus.js (10,545 of 10,610 outputs as prettier's; three faults found and fixed:
   JSON with comments in objects, package.json, markdown in markdown), bench/lint-corpus.js (2,401 of 2,407 files with
   ESLint's problems); what differs by design is bench/corpus-baseline.json. As planned: the formatter against prettier and the linter against ESLint on the
   JavaScript, TypeScript and markdown of bench/node_modules (thousands of files written by others), so that what
   the repository does not have is checked too.
3. **The linter:** what coverage shows unused of lib/ (2 to 3% of it: branches of selectors, static values, the token
   store), and the modules used by few rules (static-value: 4, reference-tracker: 3, ast/tokens: 1) folded where they
   are used, if that is less code.
4. **lib/typescript/typescript.cjs** (976 KB, generated): half of it never runs here; what the build keeps follows
   what the parsers use, so it shrinks with C1 by itself. (It did not: after C1 the converter and the linter's parser
   still use all that they used, 673 statements of 5,374.)

## Order and measures

A1 first (the largest gain, and it changes how the commands run); then C2 (the wider corpus), which protects C1 and
B; then A2–A4, C1, B1–B3, C3, A5. Each step ends with the tests, every check, the repository linted and formatted, and
bench/lint.js, bench/format.js and bench/check.js; results in bench/results (lint-13..., format-..., check-2...). Not
committed: the user reviews each phase.
