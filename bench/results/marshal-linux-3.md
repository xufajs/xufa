Linux (WSL 2, Ubuntu), Node.js v24.21.0, 2026-10-10: `node tools/bench-linux/run.js micro/marshal 5` (best of 5 rounds, a process for each library and case). Arrays of instances of one class are now tables (`["¤Table", "Point", ["x", "y"], 1, 2, 3, 4]`); marshal-linux-2 had 21,662 ops/s (0.72x of v8) on 100 class instances.

| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 468,693 | 258,506 | 532,672 | 2.06x |
| 100 rows (Dates) | 5,755 | 6,448 | 5,608 | 0.87x |
| 1000 rows (Dates) | 582 | 740 | 605 | 0.82x |
| Map, Set, BigInt | n/a | 40,595 | 39,767 | 0.98x |
| 100 class instances | 69,034 | 28,980 | 47,149 | 1.63x |
