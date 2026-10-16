# The formatter of @xufa/lint against prettier 3.9.9 (format-7)

2026-10-13, 21:30, Windows 11, Intel Core i7-13700H, Node.js 24.21. `node bench/format.js --rounds 9` after the
linter's own code (PR #1), C1 (format-5: the code for syntax the parsers never make, out) and the first pass of A4
(format-6). Every output the same as prettier's. Not pinned to the P-cores: the first passes were partly on the
E-cores (see format-8, the median of this run and two pinned ones, which the docs show). The repository has more JavaScript than in format-1 to format-4 (the linter's own code).

| Language | Files | KB | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed | prettier RSS | xufa RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 1,426 | 8,884 | 7,122 ms | 6,338 ms | 1.12x | 6,251 ms | 3,924 ms | 1.59x | 511 MB | 494 MB |
| TypeScript | 144 | 1,088 | 1,201 ms | 807 ms | 1.49x | 725 ms | 342 ms | 2.12x | 371 MB | 359 MB |
| JSON | 69 | 510 | 179 ms | 101 ms | 1.77x | 70 ms | 24 ms | 2.94x | 237 MB | 155 MB |
| markdown | 72 | 662 | 1,470 ms | 1,114 ms | 1.32x | 1,004 ms | 666 ms | 1.51x | 379 MB | 364 MB |

One run: its first pass of JavaScript (1.12x) is low, from the E-cores; format-8 has the median of three runs.
