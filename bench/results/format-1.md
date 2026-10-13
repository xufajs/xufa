# The formatter of @xufa/lint against prettier 3.9.9 (format-1)

2026-10-12, Windows 11, Intel Core i7-13700H, Node.js 24.21. `node bench/format.js --rounds 9`: the files of this
repository that `xufa-format` formats (1,594), each formatter in a process of its own; cold is the first pass over
them, warm the median of the next 9. Every output the same as prettier's. Options: singleQuote, trailingComma es5,
printWidth 120.

| Language | Files | KB | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 1,324 | 8,298 | 10,063 ms | 5,930 ms | 1.70x | 6,304 ms | 4,304 ms | 1.46x |
| TypeScript | 144 | 1,088 | 1,297 ms | 989 ms | 1.31x | 1,500 ms | 441 ms | 3.40x |
| JSON | 67 | 496 | 187 ms | 267 ms | 0.70x | 77 ms | 30 ms | 2.59x |
| markdown | 59 | 569 | 1,343 ms | 1,142 ms | 1.18x | 1,320 ms | 941 ms | 1.40x |

A run of 5 rounds just before, on the same machine (it was busy: prettier's JavaScript took 9.8 s warm):

| Language | cold speed | warm speed |
| --- | ---: | ---: |
| JavaScript | 1.95x | 1.32x |
| TypeScript | 1.31x | 2.84x |
| JSON | 0.71x | 2.06x |
| markdown | 1.18x | 1.74x |

JSON's cold pass loses: it is mostly loading TypeScript (the parser of JSON files too), which prettier does not load
for JSON.

## Commands

`xufa-format --check .` against `prettier --check` on the same 1,594 files and options:

| Run | prettier | xufa | speed |
| --- | ---: | ---: | ---: |
| 1 | 20,686 ms | 11,073 ms | 1.87x |
| 2 | 14,587 ms | 9,434 ms | 1.55x |

One file (`--check`, mean of 8 runs of the command):

| File | prettier | xufa |
| --- | ---: | ---: |
| package.json | 124 ms | 128 ms |
| README.md | 214 ms | 215 ms |
| packages/lint/lib/linter.js | 190 ms | 202 ms |

## What made it faster (2026-10-12)

Against the bundle before these changes, warm JavaScript went from 4,742 to 4,041 ms (best rounds, 1.17x):

- the formatter as one ES module by scope hoisting (@xufa/bundle `format: 'esm'`): imports read as variables;
- parents of TypeScript's nodes set in the walk that finds parentheses (TypeScript's own pass took twice as long);
- comments found in one pass over the characters, not by TypeScript's scanner token by token;
- modifiers checked only on nodes that have them; a linear strip of comments (it was quadratic);
- assignments' layout: the cheap checks before printing a call's member chain, whose doc is then used once;
- the doc printer: its stack as three arrays (no object per command), `fits()` the same, no closure per group,
  `willBreak()` as one loop, type checks of docs and nodes as comparisons;
- markdown: the regular expression that splits words at CJK characters made once, not for every word (and ASCII
  words not split).
