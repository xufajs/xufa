| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 438,616 | 234,336 | 568,171 | 2.42x |
| 100 rows (Dates) | 4,930 | 6,022 | 7,153 | 1.19x |
| 1000 rows (Dates) | 346 | 451 | 733 | 1.63x |
| Map, Set, BigInt | n/a | 42,181 | 38,652 | 0.92x |
| 100 class instances | 69,151 | 26,554 | 51,998 | 1.96x |
