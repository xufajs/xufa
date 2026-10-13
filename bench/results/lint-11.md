# The linter of @xufa/lint against ESLint 9.39.5 (lint-11)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 9 of packages/lint/design/own-linter.md: the 60 rules ported from ESLint (lib/eslint/lib/rules, 12,078 lines)
and what they shared (rules/utils: ast-utils.js, char-source.js, regular-expressions.js, unicode/) replaced by
@xufa/lint's own `lib/rules/<name>.js` (5,594 lines) and `lib/rules/utils`. lib/eslint is gone; lib/rules.js is
lib/rules/index.js.

`node bench/lint-rules.js` runs each rule of @xufa/lint and ESLint's (from bench/node_modules) in the same lint, on
every case of the rules' tests and one in ten of the files of `--tests`, with every set of options the tests use and
none: 291,713 lints, 162,613 problems of ESLint's rules, no difference (message, messageId, place, node type, fix,
suggestions, or the same error). `node bench/lint-rule-utils.js` finds no difference between lib/rules/utils and
ESLint's ast-utils on every node and token of 2,559 files and the cases: 79,563,872 results (42 of
canTokensBeAdjacent, on pieces of code espree and @xufa/lint tokenize differently, apart: JSX text, a regular
expression after a `}` at the top; no rule gives them such texts).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,467 |  9,118 |        0 |    3,913 ms |  3,039 ms | 1.29x |    3,318 ms |  2,706 ms | 1.23x |
| With tests (`--tests`) | 2,559 | 15,579 |   36,571 |    6,243 ms |  5,274 ms | 1.18x |    5,623 ms |  4,920 ms | 1.14x |

From lint-10 (1.12x and 1.09x; 1.08x and 1.07x). The profile of `--tests` (two passes, 11.0 s): the rules take
647 ms (837 ms in phase 7's), and lib/ast 745 ms (1,123 ms): the rules listen to types of nodes, where ESLint's
listened to selectors (`Literal[regex]`, `ForStatement > .test`, `:function`) matched on every node; parsing (lib/parser.js and
TypeScript, 5.8 s) and garbage collection (1.5 s) are the rest. The problems are the same in every file but the one of
lint-1 (`packages/http/test/hooks.test.js:3132`).
