# The formatter of @xufa/lint against prettier 3.9.9 (format-3)

2026-10-12, 22:55, Windows 11, Intel Core i7-13700H, Node.js 24.21. `node bench/format.js --rounds 9`, as format-2,
after one change: the formatter parses with its own copy of TypeScript's parser (lib/prettier/parse/typescript.cjs,
built by scripts/build-typescript.mjs from TypeScript 6.0.3): what the parser needs of typescript.js, 973 KB of 8.9 MB.
It loads in 8 ms with Node's compile cache, against 45 ms for TypeScript, and the formatter needs no TypeScript
installed. Every output the same as prettier's.

The machine was busy (prettier's JavaScript took 10 s warm, against 6.3 s in format-1's run, and its TypeScript 0.7
to 1.2 s between runs): read the ratios as ranges.

| Language | Files | KB | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed | prettier RSS | xufa RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 1,326 | 8,327 | 10,171 ms | 7,436 ms | 1.37x | 10,039 ms | 5,632 ms | 1.78x | 496 MB | 493 MB |
| TypeScript | 144 | 1,088 | 1,170 ms | 798 ms | 1.47x | 704 ms | 376 ms | 1.87x | 375 MB | 366 MB |
| JSON | 67 | 497 | 180 ms | 93 ms | 1.93x | 69 ms | 21 ms | 3.37x | 235 MB | 127 MB |
| markdown | 59 | 569 | 1,344 ms | 1,004 ms | 1.34x | 1,335 ms | 591 ms | 2.26x | 404 MB | 357 MB |

## Commands

`xufa-format --check <file>` against `prettier --check <file>` with the same options, three rounds of 8 runs each,
alternating:

| File | prettier | xufa | speed | before (format-2) |
| --- | ---: | ---: | ---: | ---: |
| packages/lint/lib/linter.js (280 lines) | 211, 217, 218 ms | 185, 188, 180 ms | 1.17x | 0.95x |
| packages/lint/lib/engine.js | 199, 182, 167 ms | 157, 152, 143 ms | 1.18x | |
| packages/lint/index.d.ts (TypeScript) | 184, 182, 195 ms | 139, 143, 152 ms | 1.29x | |
| README.md (code blocks of JavaScript) | 221, 217, 226 ms | 194, 187, 191 ms | 1.16x | 1.04x |
| package.json | 129, 124, 142 ms | 88, 92, 93 ms | 1.44x | 1.54x |

The whole repository (1,594 files), `--check`:

| Run | prettier | xufa | speed |
| --- | ---: | ---: | ---: |
| 1 | 20,513 ms | 10,702 ms | 1.92x |
| 2 | 21,909 ms | 11,104 ms | 1.97x |

## Where the time of one file went

`xufa-format --check packages/lint/lib/linter.js`, in the process (performance.now()):

| Phase | before | now |
| --- | ---: | ---: |
| Node.js until the command runs | 20 ms | 20 ms |
| @xufa/lint and the formatter (one ES module) | 19 ms | 21 ms |
| the config | 4 ms | 4 ms |
| TypeScript | 45 ms | 8 ms (in the first format) |
| the first format (its code compiled as it runs) | 62 ms | 73 ms |

What TypeScript's parser needs: 670 of typescript.js's 5,374 top-level statements, from what the formatter's parser
uses (createSourceFile, forEachChild, SyntaxKind...). Nodes get their methods (getStart, getText...) from the classes
of TypeScript's services, set without those of symbols, types and signatures, whose methods would keep most of the
services; of its ~3,000 messages of errors, the 152 the parser uses.
