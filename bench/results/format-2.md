# The formatter of @xufa/lint against prettier 3.9.9 (format-2)

2026-10-12, 22:36, Windows 11, Intel Core i7-13700H, Node.js 24.21. `node bench/format.js --rounds 9`, as format-1,
after two changes: TypeScript is loaded only when a file is parsed with it, and JSON has a parser of its own (the
tree prettier's Babel-based json parsers make), so formatting JSON, package.json or markdown without code blocks
loads no TypeScript. Every output the same as prettier's.

The machine was busier than for format-1 (prettier's JavaScript took 9.8 s warm, against 6.3 s then): ratios of
JavaScript, TypeScript and markdown, whose code did not change, move with the load (format-1: 1.46x, 3.40x and 1.40x
warm).

| Language | Files | KB | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed | prettier RSS | xufa RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 1,325 | 8,317 | 10,014 ms | 7,867 ms | 1.27x | 9,821 ms | 7,419 ms | 1.32x | 483 MB | 555 MB |
| TypeScript | 144 | 1,088 | 1,226 ms | 980 ms | 1.25x | 1,206 ms | 448 ms | 2.69x | 381 MB | 417 MB |
| JSON | 67 | 496 | 184 ms | 87 ms | 2.11x | 72 ms | 21 ms | 3.41x | 250 MB | 124 MB |
| markdown | 59 | 569 | 1,454 ms | 1,168 ms | 1.25x | 1,362 ms | 1,009 ms | 1.35x | 388 MB | 313 MB |

A run just before: JSON 2.19x cold and 3.62x warm.

JSON before these changes (format-1): 0.70x cold (loading TypeScript was most of it) and 2.59x warm.

## Commands

`xufa-format --check .` against `prettier --check` on the same 1,594 files and options:

| Run | prettier | xufa | speed |
| --- | ---: | ---: | ---: |
| 1 | 22,669 ms | 11,535 ms | 1.97x |
| 2 | 21,631 ms | 11,862 ms | 1.82x |

One file (`--check`, mean of 8 runs of the command):

| File | prettier | xufa | before (format-1) |
| --- | ---: | ---: | ---: |
| package.json | 134 ms | 87 ms | 124 against 128 ms |
| README.md (with JavaScript code blocks) | 227 ms | 218 ms | 214 against 215 ms |
| packages/lint/lib/linter.js | 195 ms | 205 ms | 190 against 202 ms |

A file of JavaScript (or markdown with code blocks of it) still loads TypeScript, about 135 ms, against prettier's
Babel plugin: that is the 5% left on one JavaScript file.

## JSON as prettier has it

The json parsers of prettier are Babel's parseExpression() and a check of the tree. Before, @xufa/lint read JSON with
TypeScript's JSON mode, which refuses what prettier formats: keys that are names or numbers, single quotes, +1,
Infinity and NaN, holes, templates; and .json5 and .jsonc files were not formatted. 27 cases (those, comments,
blank lines, long lines, errors) in .json, tsconfig.json, .json5, .jsonc and .babelrc files, with three sets of
options: 405 of 405 the same as prettier (before: 38 of 81 with the default options).
