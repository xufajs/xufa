# The linter of @xufa/lint against ESLint 9.39.5 (lint-10)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 8 of packages/lint/design/own-linter.md: what was left of ESLint's linter (file-report.js, interpolate.js,
rule-fixer.js, source-code-fixer.js, apply-disable-directives.js, file-context.js) and shared code (severity.js,
deep-merge-arrays.js, assert.js) replaced by @xufa/lint's own `lib/report` (report.js, fixer.js, apply-fixes.js,
directives.js), `lib/rule-context.js`, `lib/util/severity.js` and `lib/util/deep-merge.js`; ESLint's rule names and
replacements are data of lib/data. lib/linter.js runs on no copied code now; lib/eslint is the 60 rules.

`node bench/lint-report.js` finds no difference with ESLint's modules on what the linter gives them — every case of
the rules' tests with its rule and every file of `--tests` with the recommended rules, each linted and fixed with
unused directives reported or not, and texts written for every order of directive comments: 161,703 reports, 31,953
applications of directives, 16,541 of fixes (and 512 made up: a byte order mark, overlaps, filters), errors of the
linter, interpolate, severities, options.

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,401 |  8,878 |        0 |    3,564 ms |  3,182 ms | 1.12x |    3,090 ms |  2,823 ms | 1.09x |
| With tests (`--tests`) | 2,493 | 15,339 |   36,571 |    5,912 ms |  5,491 ms | 1.08x |    5,291 ms |  4,947 ms | 1.07x |

Within the noise of lint-9 (1.15x and 1.13x; 1.04x and 1.05x): reports, directives and fixes take 47 ms of the
profile's 10.9 s. The problems are the same in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
