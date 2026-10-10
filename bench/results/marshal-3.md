| Case | JSON ops/s | v8 ops/s | marshal ops/s | marshal / v8 |
| --- | ---: | ---: | ---: | ---: |
| small object | 408,491 | 202,991 | 534,958 | 2.64x |
| 100 rows (Dates) | 4,947 | 5,759 | 5,136 | 0.89x |
| 1000 rows (Dates) | 357 | 431 | 420 | 0.97x |
| Map, Set, BigInt | n/a | 40,057 | 37,192 | 0.93x |
| 100 class instances | 64,275 | 24,874 | 44,422 | 1.79x |
