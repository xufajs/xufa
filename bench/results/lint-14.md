# The linter of @xufa/lint against ESLint 9.39.5 (lint-14)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), after step A3 of
packages/lint/design/refactor.md: less made to be collected. `node bench/alloc.js lint` (V8's sampling heap profiler,
the objects collected counted too) on the 2,573 files of `--tests`, one warm pass: 6,560 MB allocated before, 5,316 MB
after.

- **Comments** (557 MB): the text between each two tokens was copied to look for a `/` in it; now the next `/` is
  found going forward once through the text (lib/parser.js).
- **The steps of the traversal** (two for each node): a visit is an object of two fields (`target`, `phase`), its
  `type` and `kind` on its prototype and its `args` (`[node]`, as ESLint's) made when read, which the linter does not:
  it calls the listeners with the node (lib/source-code/steps.js, lib/ast/listeners.js). The arguments of the events
  of code paths are given as they are, not spread into a new array.
- **Code paths**: a function made for each node entered (`startCodePath`, a closure) is one function of the module
  (lib/code-path/analyzer.js).
- **Globals**: the names of the config's globals and of comments were put in an array and a set for each file; they
  are read where they are (lib/source-code/globals.js).

What is left is mostly what the linter keeps: tokens (509 MB), the steps (390 MB), scopes, code paths. Every check
against the originals finds no difference (bench/lint-\*.js, `lint-source-code.js --sample 60`); bench/lint-corpus.js
and bench/format-corpus.js, nothing new; the trees are those of before (bench/lint-parse.js).

| `node bench/lint.js`   | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed | rss (ESLint, xufa) |
| ---------------------- | ----------: | --------: | ----: | ----------: | --------: | ----: | ------------------ |
| The code               |    3,860 ms |  2,225 ms | 1.73x |    3,316 ms |  1,784 ms | 1.86x | 396 MB, 392 MB     |
| With tests (`--tests`) |    6,117 ms |  3,374 ms | 1.81x |    5,614 ms |  2,923 ms | 1.92x | 488 MB, 452 MB     |

(lint-13: 1.63x and 1.74x; 1.71x and 1.64x.) The commands (`node bench/commands.js`): `xufa-lint` 1,160 ms against
`eslint` 3,887 ms (3.35x) and `eslint --concurrency auto` 1,931 ms (1.66x); `xufa-check` 3,173 ms.

The formatter (`node bench/alloc.js format`: 2,733 MB for the repository's JavaScript) allocates in prettier's
algorithms, none above 7% (the conversion to ESTree 202 MB, printDocToString 163 MB, fits 131 MB): step A4.
