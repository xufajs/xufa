| Case | JSON ops/s | v8 ops/s | marshal ops/s | agentic ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: | ---: |
| small object | 367,974 | 204,618 | 347,820 | 183,088 | 1.70x |
| 100 rows (Dates) | 4,399 | 4,729 | 3,892 | 1,737 | 0.82x |
| 1000 rows (Dates) | 436 | 508 | 363 | 171 | 0.71x |
| Map, Set, BigInt | n/a | 36,081 | 27,365 | n/a | 0.76x |
| 100 class instances | 53,961 | 22,438 | 12,292 | 6,078 | 0.55x |
