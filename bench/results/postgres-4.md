PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 15,932 ops/s | 10,349 ops/s | 1.54x ⚠ |
| select by id (serial) | 14,431 ops/s | 7,313 ops/s | 1.97x ⚠ |
| insert one row (serial) | 7,417 ops/s | 5,329 ops/s | 1.39x ⚠ |
| select by id (64 concurrent) | 111,816 ops/s | 21,491 ops/s | 5.20x ⚠ |
| insert 1000 rows per statement | 146,475 rows/s | 60,020 rows/s | 2.44x ⚠ |
| select all rows (50k) | 332,505 rows/s | 154,472 rows/s | 2.15x ⚠ |
| aggregate group by | 294 ops/s | 266 ops/s | 1.11x ⚠ |
| update many | 66 ops/s | 67 ops/s | 0.99x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
