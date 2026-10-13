# The linter of @xufa/lint against ESLint 9.39.5 (lint-4)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 3 of packages/lint/design/own-linter.md: esquery 1.7.0 and ESLint's traversal (shared/traverser.js,
linter/esquery.js, linter/source-code-visitor.js, linter/source-code-traverser.js) replaced by @xufa/lint's own
`lib/ast/traverse.js`, `lib/ast/selectors.js` and `lib/ast/listeners.js`. `node bench/lint-selectors.js` finds no
difference with esquery and ESLint's traverser: 40,147 selectors parsed (84 of the rules, 65 written, 40,000 made up
from the grammar, 15,911 of them valid; the others with the same error and position), 110,835,160 matches of a node
by a selector, and 6,366,839 calls of listeners in the same order (on 614 files and 5,244 cases of the rules' tests).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,369 |  8,611 |        2 |    3,509 ms |  3,174 ms | 1.11x |    2,796 ms |  2,741 ms | 1.02x |
| With tests (`--tests`) | 2,456 | 15,047 |   36,387 |    5,429 ms |  5,677 ms | 0.96x |    4,880 ms |  5,111 ms | 0.95x |

Within the noise of lint-3 (1.06x and 1.00x, 0.99x and 0.96x): the traversal and selectors were not where the time
went. In the profile (11.9 s, two passes with tests), what they took — lib/eslint/lib/linter's traversal and selectors,
shared/traverser and esquery: about 1.9 s in lint-3 — is now lib/ast (1.1 s) and the code paths left in
lib/eslint/lib/linter (0.56 s): about 0.3 s less. lib/ast/listeners.js's `run` takes 0.38 s and the walk that makes the
steps 0.28 s. The 2 problems of the code were in lib/ast/selectors.js when this was measured (`no-control-regex` on its
escapes of control characters, as esquery writes them); it has none now, and both linters reported the same 2.

The problems are the same in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
