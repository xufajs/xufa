# The linter of @xufa/lint against ESLint 9.39.5 (lint-7)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 6 of packages/lint/design/own-linter.md: ESLint's JavaScript language (languages/js: SourceCode, its token
store of 13 files, the language object) and what only it used (shared/ast-utils.js, shared/directives.js,
conf/globals.js, conf/ecma-version.js) replaced by @xufa/lint's own `lib/source-code` (source-code.js,
token-store.js, globals.js, language.js), `lib/data/ecma-globals.js` and `lib/util/text.js`.
`node bench/lint-source-code.js --sample 10` finds no difference with ESLint's SourceCode: 5,496 trees (248 files,
every case of the rules' tests, and texts written for JSDoc comments, line breaks and directive comments), 235,704
nodes, 44,158,010 results (every method of tokens with 15 sets of options, locations and indexes of every offset,
scopes, ancestors, JSDoc comments, directive comments, the global scope after finalize, traverse()'s steps).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,387 |  8,784 |        0 |    3,539 ms |  3,359 ms | 1.05x |    3,002 ms |  2,954 ms | 1.02x |
| With tests (`--tests`) | 2,477 | 15,238 |   36,525 |    5,832 ms |  5,597 ms | 1.04x |    5,168 ms |  5,089 ms | 1.02x |

@xufa/lint is faster than ESLint in each now, with tests too (lint-6: 1.00x and 0.98x). In the profile (two passes,
with tests: 11.2 s, 11.4 s in lint-5), SourceCode and its token store take 490 ms (631 ms in lint-5's
lib/eslint/lib/languages): the index of the token store is an Int32Array, not an object with a key per edge of each
token, and a query is a loop, not a chain of cursor objects. Of what is left there, 82 ms is the globals of the
config made for each file (configGlobalsOf), which could be kept per config.

The problems are the same in every file but the one of lint-1 (`packages/http/test/hooks.test.js:3132`).
