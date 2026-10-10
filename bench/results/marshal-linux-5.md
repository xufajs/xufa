Linux (WSL 2, Ubuntu), Node.js v24.21.0, 2026-10-10: `node tools/bench-linux/run.js micro/marshal 5` (best of 5 rounds, a process for each library and case). Maps and Sets iterated by Map.prototype.entries and Set.prototype.values when their prototype is that of Map or Set (no call of util.types, which goes into C++): writing the Map/Set case 14.0 -> 10.7 µs.

| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 488,527 | 270,839 | 539,213 | 1.99x |
| 100 rows (Dates) | 5,523 | 6,488 | 7,208 | 1.11x |
| 1000 rows (Dates) | 606 | 731 | 785 | 1.07x |
| Map, Set, BigInt | n/a | 40,815 | 41,013 | 1.00x |
| 100 class instances | 70,540 | 29,168 | 52,697 | 1.81x |
