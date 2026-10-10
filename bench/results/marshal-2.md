| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 390,274 | 198,384 | 521,939 | 2.63x |
| 100 rows (Dates) | 4,679 | 5,467 | 5,165 | 0.94x |
| 1000 rows (Dates) | 345 | 436 | 403 | 0.93x |
| Map, Set, BigInt | n/a | 42,592 | 40,360 | 0.95x |
| 100 class instances | 69,537 | 26,276 | 21,846 | 0.83x |
