# The linter of @xufa/lint against ESLint 9.39.5 (lint-9)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
a pass over the code written in phases 1 to 7 for what is simpler and faster at once:

- `isNode` is `typeof value?.type === 'string'`, once (lib/ast/visitor-keys.js) instead of three longer copies;
- the listeners of a node type are found with their selectors' tests (lib/ast/listeners.js): no lookup by selector
  and no spread of arguments for each match; listeners are called as functions, one argument as one argument;
- a rule's listeners are not wrapped in a function each (lib/linter.js): the rule's id goes with the listener, and
  an error of it gets it where listeners are called;
- a file's config is merged once for the files the same config objects apply to (lib/config.js), and the globals of
  a config (its edition's, CommonJS's, its own) once a config (lib/source-code/globals.js), not for each file;
- the names of the handlers of the visitor of regular expressions are made once a type, not for each node.

Every check against the originals finds no difference (bench/lint-leaves.js, lint-scope.js, lint-selectors.js,
lint-regexp.js, lint-utils.js, lint-source-code.js, lint-code-path.js), and the tests of @xufa/lint pass.

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,393 |  8,843 |        0 |    3,496 ms |  3,049 ms | 1.15x |    3,019 ms |  2,676 ms | 1.13x |
| With tests (`--tests`) | 2,484 | 15,299 |   36,540 |    5,563 ms |  5,328 ms | 1.04x |    5,008 ms |  4,767 ms | 1.05x |

Against lint-8 (1.06x and 1.04x; 1.04x and 1.01x). The profile (two passes, with tests) takes 10.8 s (11.2 s): the
running of listeners 207 ms and 79 ms for their calls (358 ms and 98 ms), lib/linter.js 212 ms (394 ms), the globals
of configs no longer in it. The RSS of `--tests` in this run, 700 MB, is the noise of when the collector runs: three
runs after it, 519 to 536 MB, as before.
