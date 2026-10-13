# The linter of @xufa/lint against ESLint 9.39.5 (lint-5)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 4 of packages/lint/design/own-linter.md: @eslint-community/regexpp 4.12.2 replaced by @xufa/lint's own
`lib/regexp` (its Unicode data kept). `node bench/lint-regexp.js` finds no difference with regexpp: 1,224 patterns of
the code and tests, 1,164 literals and 25,714 made up from the grammar, in 7 editions (and the latest), strict or not,
with each set of flags: 869,340 validations (every callback with its arguments, in order; the same errors at the same
index), as many trees (every field of every node), 6,164 literals and their flags, and the calls of the visitor.

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,376 |  8,694 |        1 |    3,308 ms |  3,253 ms | 1.02x |    2,814 ms |  2,803 ms | 1.00x |
| With tests (`--tests`) | 2,464 | 15,136 |   36,434 |    5,583 ms |  5,495 ms | 1.02x |    4,944 ms |  4,994 ms | 0.99x |

As lint-4, within its noise (the seven rules of regular expressions take 0.19 s of the profile's 11.4 s). The problem
of the code was an unused constant of lib/regexp/validator.js when this was measured (both linters reported it); it
has none now. The problems are the same in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
