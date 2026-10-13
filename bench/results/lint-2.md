# The linter of @xufa/lint against ESLint 9.39.5 (lint-2)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 1 of packages/lint/design/own-linter.md: escape-string-regexp, esutils, eslint-visitor-keys, @eslint/plugin-kit
and the stubs of levn, debug and ESLint's config replaced by @xufa/lint's own `lib/util/escape-regexp.js`,
`lib/ast/visitor-keys.js` and `lib/source-code/comments.js` (and `steps.js`). `node bench/lint-leaves.js` finds no
difference between them and the originals (23,722 comments, 2,172,908 nodes, 20,033 made-up settings of rules).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,358 |  8,526 |        0 |    3,403 ms |  4,079 ms | 0.83x |    2,905 ms |  3,749 ms | 0.77x |
| With tests (`--tests`) | 2,441 | 14,946 |   36,252 |    5,381 ms |  7,052 ms | 0.76x |    5,023 ms |  6,635 ms | 0.76x |

As in lint-1, within its noise: these pieces were not where the time goes (lint-1.md). There are more files and
problems than in lint-1 because of the tests of the new modules (packages/lint/test/{util,ast,source-code}).

The problems are the same in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`). One more
difference was found and removed on the way: the stand-in of levn read `/* eslint */` settings other than levn does
(`no-alert: 2,`, `[2,]`, `0x2` were errors), so such comments were read differently from ESLint; the new reader of
comments reads levn's grammar.
