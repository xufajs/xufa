PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 13,397 ops/s | 10,368 ops/s | 1.29x ⚠ |
| select by id (serial) | 12,396 ops/s | 7,548 ops/s | 1.64x ⚠ |
| insert one row (serial) | 6,916 ops/s | 5,107 ops/s | 1.35x ⚠ |
| select by id (64 concurrent) | 101,752 ops/s | 14,435 ops/s | 7.05x ⚠ |
| insert 1000 rows per statement | 123,046 rows/s | 54,027 rows/s | 2.28x ⚠ |
| select all rows (50k) | 159,721 rows/s | 143,443 rows/s | 1.11x ⚠ |
| aggregate group by | 268 ops/s | 248 ops/s | 1.08x ⚠ |
| update many | 58 ops/s | 61 ops/s | 0.95x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
