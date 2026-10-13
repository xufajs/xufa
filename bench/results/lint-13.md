# The linter of @xufa/lint against ESLint 9.39.5 (lint-13)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), after step A2 of
packages/lint/design/refactor.md: the linter's parser (lib/parser.js) makes less for each file.

- **Locations when read.** Nodes and tokens are made by a class (`Located`) whose `loc` is made the first time it is
  read, from the range and the file's line starts (kept in a private field), then kept: most locations were never
  read, and each was three objects and two searches. Made so and given their properties (Object.assign), nodes are
  also made faster than by an object literal with a spread.
- **Tokens by one scan.** The tokens were TypeScript's tokens of the tree, by `getChildren()` of every node, which
  scans the children of each again and makes a node of each token. They are one scan of the text now, which the tree
  tells (in the walk that sets the parents) where a `/` starts a regular expression, where a `}` goes on with a
  template, and which words are identifiers (`a.if`: Identifier, as espree has it). Files with JSX keep the tokens of
  the tree (their tokens need more of it).
- Tried and left out: the start of a node kept by position (as nested nodes share it): not faster.

`node bench/lint-parse.js`: the 13,070 texts of `--tests` and the rules' cases parse in 1,499 ms (3,244 before), the
same trees (`--check`, keys sorted, loc included); the tokens are those of before on them and on the 2,407 files of
JavaScript of bench/corpus.js (18,041 parses). Every check against the originals finds no difference
(bench/lint-\*.js, `lint-source-code.js --sample 30`), and bench/lint-corpus.js and bench/format-corpus.js nothing
new.

| `node bench/lint.js`   | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed | rss (ESLint, xufa) |
| ---------------------- | ----------: | --------: | ----: | ----------: | --------: | ----: | ------------------ |
| The code               |    3,645 ms |  2,230 ms | 1.63x |    3,197 ms |  1,833 ms | 1.74x | 349 MB, 348 MB     |
| With tests (`--tests`) |    6,010 ms |  3,520 ms | 1.71x |    5,307 ms |  3,234 ms | 1.64x | 497 MB, 425 MB     |

(lint-12: 1.25x and 1.19x; 1.17x and 1.19x.) The profile of `--tests` (two passes): 7.4 s, 10.5 before; TypeScript's
parser 1.7 s, garbage collection 1.1 s, lib/parser.js 1.0 s (3.3 before), the traversal 0.7 s, the rules 0.6 s.

The commands (`node bench/commands.js`): `xufa-lint` 1,298 ms (`eslint` 4,121, `eslint --concurrency auto` 2,066),
`--concurrency off` 2,627 ms (3,300 in commands-1); `xufa-check` 3,054 ms (`eslint` + `prettier --check` 11,993).
With workers the gain is smaller: each worker's time is mostly V8 compiling the code it runs.
