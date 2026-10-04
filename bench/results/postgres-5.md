PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 14,045 ops/s | 11,971 ops/s | 1.17x ⚠ |
| select by id (serial) | 13,298 ops/s | 7,884 ops/s | 1.69x ⚠ |
| insert one row (serial) | 7,047 ops/s | 5,855 ops/s | 1.20x ⚠ |
| select by id (64 concurrent) | 113,820 ops/s | 19,668 ops/s | 5.79x ⚠ |
| insert 1000 rows per statement | 147,663 rows/s | 58,853 rows/s | 2.51x ⚠ |
| copy rows (50k) | 250,525 rows/s | 114,637 rows/s | 2.19x ⚠ |
| select all rows (50k) | 206,107 rows/s | 147,923 rows/s | 1.39x ⚠ |
| aggregate group by | 288 ops/s | 283 ops/s | 1.02x ⚠ |
| update many | 65 ops/s | 71 ops/s | 0.91x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
