PostgreSQL drivers: @xufa/pg against pg 8.23.1
postgres://xufa:***@127.0.0.1:5432/xufa_test, 5 rounds, scale 1, pool 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

### Driver-bound: the work of the driver (encoding, decoding, messages, the pool) decides the result

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| select $1 (serial) | 13,895 ops/s | 10,837 ops/s | 1.28x ⚠ |
| select by id (serial) | 13,042 ops/s | 7,702 ops/s | 1.69x ⚠ |
| insert one row (serial) | 6,612 ops/s | 5,039 ops/s | 1.31x ⚠ |
| select $1 (64 concurrent) | 151,905 ops/s | 29,847 ops/s | 5.09x ⚠ |
| select by id (64 concurrent) | 116,172 ops/s | 24,623 ops/s | 4.72x ⚠ |
| encode 64 params of 8 types (serial) | 11,885 ops/s | 5,100 ops/s | 2.33x ⚠ |
| decode 1000 rows of 8 types (serial) | 563,294 rows/s | 285,982 rows/s | 1.97x ⚠ |
| text of 1 MB, sent and read (serial) | 230 ops/s | 156 ops/s | 1.47x ⚠ |
| bytea of 1 MB, sent and read (serial) | 215 ops/s | 95 ops/s | 2.27x ⚠ |
| insert 1000 rows per statement | 122,182 rows/s | 62,787 rows/s | 1.95x ⚠ |
| copy rows (50k) | 216,846 rows/s | 112,657 rows/s | 1.92x ⚠ |
| select all rows (50k) | 512,305 rows/s | 249,052 rows/s | 2.06x ⚠ |

### Server-bound: PostgreSQL does most of the work; the drivers can only show they do not slow it down

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| aggregate group by | 340 ops/s | 289 ops/s | 1.17x ⚠ |
| update many | 72 ops/s | 66 ops/s | 1.08x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
