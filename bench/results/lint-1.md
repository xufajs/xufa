# The linter of @xufa/lint against ESLint 9.39.5 (lint-1)

2026-10-13, macOS 15.7, Apple M4 Max, Node.js 22.22. `node bench/lint.js` (rounds 5): the files of this repository
that `xufa-lint` lints, with its config (`xufa.lint.config.js`; ESLint with @eslint/js's recommended rules,
no-unexpected-multiline off), each linter in a process of its own; cold is the first pass over them, warm the median
of the next 5. `--tests` lints the tests of the packages too. Before any of the linter's copied code is replaced: the
measure of the phases of packages/lint/design/own-linter.md.

| Files                 | Files | KB     | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| --------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code              | 1,356 |  8,508 |        0 |    3,422 ms |  4,331 ms | 0.79x |    3,876 ms |  3,923 ms | 0.99x |
| With tests (`--tests`) | 2,436 | 14,922 |   36,197 |    5,812 ms |  8,143 ms | 0.71x |    6,507 ms |  8,141 ms | 0.80x |

A run of 2 rounds just before: the code 0.85x cold, 0.76x warm (ESLint 2,999 ms warm); with tests 0.77x cold, 0.74x
warm (ESLint 5,277 ms, xufa 7,173 ms). The machine is noisy (ESLint's warm pass of the code took 3.0 s and 3.9 s),
but every run says the same: @xufa/lint takes 1.25 to 1.4 times what ESLint takes. Loading: 84 ms against 96 ms. RSS:
426 to 457 MB against 350 to 385 MB.

The problems are the same in every file but one: `packages/http/test/hooks.test.js:3132` turns
`prefer-promise-reject-errors` on in a comment, a rule of ESLint that is not in @xufa/lint, which reports that it is
not there (36,198 problems against 36,197).

## Where the time goes

`node --cpu-prof bench/lint.js --child xufa <files> 2 true` (two passes, with tests): 15.1 s.

| Where                                                    | Self time |
| -------------------------------------------------------- | --------: |
| lib/parser.js (TypeScript's tree to ESTree, tokens)       |   3,116 ms |
| TypeScript's scanner and parser                          |   2,548 ms |
| esrecurse (for eslint-scope)                             |   2,271 ms |
| garbage collection                                       |   1,887 ms |
| lib/eslint/lib/linter (traversal, selectors, code paths) |   1,450 ms |
| lib/eslint/lib/rules                                     |     861 ms |
| eslint-scope                                             |     569 ms |
| lib/eslint/lib/languages (SourceCode, token store)        |     542 ms |
| lib/linter.js                                            |     394 ms |
| esquery                                                  |     264 ms |

Of esrecurse's 2.3 s, 2.1 s is its constructor: eslint-scope makes a visitor for each pattern it meets (each
parameter, each declared name), and each copies the table of visitor keys (`Object.assign({}, estraverse.VisitorKeys,
options.childVisitorKeys)`). Phase 2 (scope analysis) removes it.
