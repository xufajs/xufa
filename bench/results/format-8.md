# The formatter of @xufa/lint against prettier 3.9.9 (format-8)

2026-10-13, Windows 11, Intel Core i7-13700H, Node.js 24.21, `node bench/format.js --rounds 9`, after the second pass
of A4 (propagateBreaks() pushes no strings). Every output the same as prettier's, in every run.

On this machine a run varies by 10 to 20% from one to the next, more for the first pass (one pass, not a median):
Windows puts processes started from a background shell partly on the E-cores (twice the time; format-7's first pass of
JavaScript, 1.12x, was one of those), and pinning them to the P-cores (`start /affinity FFF`) does not remove the rest
(prettier's first pass of JavaScript took 7.5 s in one pinned run, 14.4 s in the next). So the numbers here are the
median of three runs for each cell: format-7 (21:30, not pinned) and two pinned runs (22:37, 22:40).

| Language | Files | KB | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 1,426 | 8,884 | 7,498 ms | 5,485 ms | 1.37x | 6,401 ms | 4,223 ms | 1.52x |
| TypeScript | 144 | 1,088 | 1,300 ms | 960 ms | 1.35x | 820 ms | 469 ms | 1.75x |
| JSON | 69 | 510 | 187 ms | 105 ms | 1.78x | 82 ms | 23 ms | 3.57x |
| markdown | 72 | 663 | 1,608 ms | 1,116 ms | 1.44x | 1,046 ms | 690 ms | 1.52x |

The runs (prettier cold / xufa cold / prettier warm / xufa warm, ms):

| Language | format-7 | pinned 1 | pinned 2 |
| --- | --- | --- | --- |
| JavaScript | 7,122 / 6,338 / 6,251 / 3,924 | 7,498 / 5,485 / 6,401 / 4,442 | 14,378 / 5,496 / 6,564 / 4,223 |
| TypeScript | 1,201 / 807 / 725 / 342 | 1,376 / 960 / 820 / 479 | 1,300 / 1,173 / 872 / 469 |
| JSON | 179 / 101 / 70 / 24 | 202 / 110 / 82 / 23 | 187 / 105 / 82 / 23 |
| markdown | 1,470 / 1,114 / 1,004 / 666 | 1,660 / 1,347 / 1,046 / 796 | 1,608 / 1,116 / 1,048 / 690 |

Memory (pinned runs): JavaScript 506–525 MB prettier, 508–520 xufa; TypeScript 363–386 / 360–379; JSON 237–252 /
157–162; markdown 385–386 / 355–359.
