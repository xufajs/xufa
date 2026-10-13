# The linter of @xufa/lint against ESLint 9.39.5 (lint-6)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 5 of packages/lint/design/own-linter.md: @eslint-community/eslint-utils 4.10.1 replaced by @xufa/lint's own
`lib/ast/static-value.js`, `reference-tracker.js` and `tokens.js`; with it, lib/vendor is gone. `node bench/lint-utils.js`
finds no difference with eslint-utils on 7,699 trees (every file of `--tests` and every case of the rules' tests):
for each of their 2,253,178 nodes getStaticValue and getStringIfConstant with its scope, getPropertyName,
isParenthesized once and twice, findVariable; and the 10,214 references to globals ReferenceTracker finds for the
trace maps of the rules and a wider one (14,022,927 results).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,380 |  8,728 |        0 |    3,311 ms |  3,174 ms | 1.04x |    2,867 ms |  2,821 ms | 1.02x |
| With tests (`--tests`) | 2,469 | 15,177 |   36,475 |    5,583 ms |  5,568 ms | 1.00x |    4,970 ms |  5,058 ms | 0.98x |

As lint-5, within its noise: what the rules ask of eslint-utils is a small part of the time. The problems are the same
in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
