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
| select $1 (serial) | 15,862 ops/s | 12,031 ops/s | 1.32x ⚠ |
| select by id (serial) | 15,731 ops/s | 8,416 ops/s | 1.87x ⚠ |
| insert one row (serial) | 8,135 ops/s | 5,744 ops/s | 1.42x ⚠ |
| select $1 (64 concurrent) | 157,316 ops/s | 33,435 ops/s | 4.71x ⚠ |
| select by id (64 concurrent) | 127,549 ops/s | 24,925 ops/s | 5.12x ⚠ |
| encode 64 params of 8 types (serial) | 13,401 ops/s | 5,199 ops/s | 2.58x ⚠ |
| decode 1000 rows of 8 types (serial) | 582,579 rows/s | 298,221 rows/s | 1.95x ⚠ |
| text of 1 MB, sent and read (serial) | 161 ops/s | 198 ops/s | 0.81x ⚠ |
| bytea of 1 MB, sent and read (serial) | 190 ops/s | 107 ops/s | 1.78x ⚠ |
| insert 1000 rows per statement | 147,285 rows/s | 69,922 rows/s | 2.11x ⚠ |
| copy rows (50k) | 213,291 rows/s | 132,681 rows/s | 1.61x ⚠ |
| select all rows (50k) | 533,782 rows/s | 286,910 rows/s | 1.86x ⚠ |

### Server-bound: PostgreSQL does most of the work; the drivers can only show they do not slow it down

| Workload | @xufa/pg | pg | xufa / pg |
| --- | ---: | ---: | ---: |
| aggregate group by | 362 ops/s | 317 ops/s | 1.14x |
| update many | 75 ops/s | 74 ops/s | 1.02x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
