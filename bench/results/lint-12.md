# The linter of @xufa/lint against ESLint 9.39.5 (lint-12)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 10 of packages/lint/design/own-linter.md: nothing of ESLint's code is left in @xufa/lint but the port of its
tests of the rules (lib/stubs/espree.js went into lib/parser.js as the default parser of configs; tools/port-lint
ports the tests only), and the package is ES modules (`"type": "module"`, by tools/esm/convert.mjs; no `'use strict'`).
index.mjs is gone: index.js is the entry for import and require(). What a config needs is imported; the linter, the
formatter and the parser are loaded when first used, and each rule when a config turns it on, with require() of their
ES modules. The checks against the originals (bench/lint-\*.js) watch the linter through module hooks
(bench/lint-intercept.js, bench/lint-cases.js), and find no difference.

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,466 |  9,107 |        0 |    4,121 ms |  3,302 ms | 1.25x |    3,463 ms |  2,900 ms | 1.19x |
| With tests (`--tests`) | 2,558 | 15,579 |   36,571 |    6,410 ms |  5,480 ms | 1.17x |    5,731 ms |  4,828 ms | 1.19x |

Within the noise of lint-11 (1.29x and 1.23x; 1.18x and 1.14x), measured with a check running on another core (ESLint
took 4,121 ms cold, 3,913 ms in lint-11). Loading xufa takes 80 ms (78 ms). The problems are the same in every file but
the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
