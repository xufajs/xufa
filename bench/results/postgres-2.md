PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 7,589 ops/s | 4,835 ops/s | 1.57x ⚠ |
| select by id (serial) | 6,574 ops/s | 2,797 ops/s | 2.35x ⚠ |
| insert one row (serial) | 1,713 ops/s | 1,287 ops/s | 1.33x ⚠ |
| select by id (64 concurrent) | 33,604 ops/s | 4,855 ops/s | 6.92x ⚠ |
| insert 1000 rows per statement | 28,947 rows/s | 18,429 rows/s | 1.57x ⚠ |
| select all rows (50k) | 144,296 rows/s | 91,695 rows/s | 1.57x ⚠ |
| aggregate group by | 146 ops/s | 140 ops/s | 1.04x ⚠ |
| update many | 21 ops/s | 22 ops/s | 0.97x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
