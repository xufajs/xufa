# The formatter of @xufa/lint against prettier 3.9.9 (format-4)

2026-10-13, Windows 11, Intel Core i7-13700H, Node.js 24.21. After three changes to what the formatter does before
printing; every output still the same as prettier's (3,226 files, and when first printed at 40 columns).

- The converter lists, as it makes them, the nodes prettier's postprocessing changes (the end of statements before
  their semicolon, template parts, unions of one type, casts, && and || chains leaning right), and postprocessing
  changes those only, instead of walking the whole tree again. The trees are the same as after the walk: compared on
  the 1,470 files of JavaScript and TypeScript of this repository and on cases of each change.
- The start of a node is TypeScript's skipTrivia() from its position, as node.getStart() computes it without its
  checks (JSDoc is not parsed, and missing nodes and JSX text still go through it).
- Markdown: the preprocessing passes of prettier make one stack of parents for all the children of a node, not one
  for each child.

Measured against the bundle before them, the same process alternating (`node ab.mjs`, best and median of the warm
rounds of 5 pairs of processes):

| Language | before | after | speed |
| --- | ---: | ---: | ---: |
| JavaScript (best / median) | 4,068 / 4,242 ms | 3,872 / 3,989 ms | 1.05x / 1.06x |
| markdown (best / median) | 592 / 659 ms | 577 / 615 ms | 1.03x / 1.07x |
| TypeScript | 374 / 402 ms | 375 / 408 ms | the same |

`node bench/format.js --rounds 9` on a busy machine (prettier's JavaScript took 9.9 s warm, against 6.3 s on a quiet
run): the gains are within what runs differ by, and the ratios against prettier within those of format-3.

| Language | prettier cold | xufa cold | speed | prettier warm | xufa warm | speed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| JavaScript | 9,523 ms | 6,742 ms | 1.41x | 9,883 ms | 7,073 ms | 1.40x |
| TypeScript | 1,190 ms | 862 ms | 1.38x | 1,271 ms | 442 ms | 2.88x |
| JSON | 173 ms | 91 ms | 1.89x | 72 ms | 20 ms | 3.57x |
| markdown | 1,319 ms | 1,008 ms | 1.31x | 1,355 ms | 887 ms | 1.53x |

## micromark, profiled

The parse of markdown is micromark's (with mdast-util-from-markdown), and its time is spread over its design: a
state machine called once per character, an event list, and paragraphs tokenized again as inline text
(subtokenize). No function of it takes more than 7% of the parse; its known quadratic case (the splices of
subtokenize) is fixed in the version here. The most specific cost is GFM's e-mail autolinks: tried at the start of
every word, which they read whole before failing where no @ follows (about 5% of the parse). Making it much faster
would take a parser of markdown of our own.
