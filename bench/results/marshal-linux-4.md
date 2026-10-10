Linux (WSL 2, Ubuntu), Node.js v24.21.0, 2026-10-10: `node tools/bench-linux/run.js micro/marshal 5` (best of 5 rounds, a process for each library and case). Tables for arrays of plain objects too, and with values of any kind (rows numbered before their values); Dates and references read without making strings; Maps and Sets known by their prototype first.

| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 519,835 | 284,144 | 581,475 | 2.05x |
| 100 rows (Dates) | 5,947 | 6,784 | 7,622 | 1.12x |
| 1000 rows (Dates) | 603 | 735 | 818 | 1.11x |
| Map, Set, BigInt | n/a | 41,438 | 39,416 | 0.95x |
| 100 class instances | 70,319 | 29,240 | 52,814 | 1.81x |

Before (marshal-linux-1 format, marshal-linux-2 and -3 the steps): rows 0.59x to 0.68x of v8, instances 0.49x, Maps and Sets 0.71x, small objects 1.49x.
