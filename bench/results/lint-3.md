# The linter of @xufa/lint against ESLint 9.39.5 (lint-3)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 2 of packages/lint/design/own-linter.md: eslint-scope 8.4.0, esrecurse and estraverse replaced by @xufa/lint's
own scope analysis (`lib/scope`). `node bench/lint-scope.js` finds no difference between it and eslint-scope on 7,679
trees (every file of `--tests` and every case of ESLint's tests of the rules: 172,074 scopes, 274,806 variables,
848,920 references, compared field by field, with the declared variables and scopes of every node).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,364 |  8,565 |        0 |    3,431 ms |  3,242 ms | 1.06x |    2,883 ms |  2,891 ms | 1.00x |
| With tests (`--tests`) | 2,448 | 14,993 |   36,329 |    5,572 ms |  5,608 ms | 0.99x |    4,984 ms |  5,205 ms | 0.96x |

Against lint-2 (0.83x and 0.77x on the code, 0.76x and 0.76x with tests): @xufa/lint's warm pass with tests went from
6,635 ms to 5,205 ms (22% less), and it lints in about the time ESLint takes. The problems are the same in every file
but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).

## Where the time goes

`node --cpu-prof bench/lint.js --child xufa <files> 2 true` (two passes, with tests): 11.7 s (15.1 s in lint-1).

| Where                                                    | lint-1 | lint-3 |
| -------------------------------------------------------- | -----: | -----: |
| lib/parser.js                                            | 3,116 ms | 3,189 ms |
| TypeScript's scanner and parser                          | 2,548 ms | 2,293 ms |
| Scope analysis (esrecurse + eslint-scope; lib/scope)     | 2,840 ms |   427 ms |
| garbage collection                                       | 1,887 ms | 1,524 ms |
| lib/eslint/lib/linter (traversal, selectors, code paths) | 1,450 ms | 1,302 ms |
| lib/eslint/lib/rules                                     |   861 ms |   819 ms |
| lib/eslint/lib/languages (SourceCode, token store)        |   542 ms |   520 ms |
| esquery                                                  |   264 ms |   248 ms |

Scope analysis takes a sixth of what it took: one walk with a switch over the types of nodes, patterns walked without
a visitor (and the table of keys no longer copied for each). The parser (ours, not copied) is now half of the time.
