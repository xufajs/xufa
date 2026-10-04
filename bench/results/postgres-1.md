PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 7,485 ops/s | 5,522 ops/s | 1.36x ⚠ |
| select by id (serial) | 7,049 ops/s | 3,415 ops/s | 2.06x ⚠ |
| insert one row (serial) | 1,112 ops/s | 888 ops/s | 1.25x ⚠ |
| select by id (64 concurrent) | 43,093 ops/s | 6,077 ops/s | 7.09x ⚠ |
| insert 1000 rows per statement | 25,178 rows/s | 16,362 rows/s | 1.54x ⚠ |
| select all rows (50k) | 172,876 rows/s | 90,600 rows/s | 1.91x ⚠ |
| aggregate group by | 165 ops/s | 157 ops/s | 1.05x ⚠ |
| update many | 22 ops/s | 18 ops/s | 1.23x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
