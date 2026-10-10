Linux (WSL 2, Ubuntu), Node.js v24.21.0, 2026-10-10: `node tools/bench-linux/run.js micro/marshal 5` (best of 5 rounds, a process for each library and case).

| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 509,090 | 273,944 | 567,454 | 2.07x |
| 100 rows (Dates) | 5,921 | 6,743 | 5,751 | 0.85x |
| 1000 rows (Dates) | 586 | 738 | 597 | 0.81x |
| Map, Set, BigInt | n/a | 41,750 | 40,953 | 0.98x |
| 100 class instances | 70,227 | 29,931 | 21,662 | 0.72x |

The format before (marshal-1: a flat list of nodes) against this one, in the same run on the same Linux:

| Case | JSON ops/s | v8 ops/s | before ops/s | marshal ops/s | marshal / v8 | before / v8 | marshal / before |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| small object | 522,233 | 284,455 | 424,029 | 582,081 | 2.05x | 1.49x | 1.37x |
| 100 rows (Dates) | 5,899 | 6,740 | 4,592 | 5,790 | 0.86x | 0.68x | 1.26x |
| 1000 rows (Dates) | 587 | 738 | 434 | 587 | 0.79x | 0.59x | 1.35x |
| Map, Set, BigInt | n/a | 39,475 | 28,054 | 39,593 | 1.00x | 0.71x | 1.41x |
| 100 class instances | 68,327 | 29,204 | 14,267 | 21,327 | 0.73x | 0.49x | 1.49x |
