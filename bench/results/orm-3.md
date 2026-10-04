After the ORM fixes (cached require of queryset, compiled row decoders and fromRow) and @xufa/pg preparing texts the second time they run.

ORMs: @xufa/orm against sequelize 6.37.8

### postgres

| Workload | xufa | sequelize | sequelize-xufa-pg | xufa / sequelize | sequelize-xufa-pg / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 5,017 ops/s | 1,971 ops/s | 2,238 ops/s | 2.55x | 1.14x |
| findByPk (serial) | 12,134 ops/s | 4,617 ops/s | 4,221 ops/s | 2.63x | 0.91x |
| findByPk (64 concurrent) | 66,219 ops/s | 9,310 ops/s | 9,022 ops/s | 7.11x | 0.97x |
| findAll where/order/limit 100 | 685 ops/s | 536 ops/s | 573 ops/s | 1.28x | 1.07x |
| findAll 10k rows | 546,795 rows/s | 216,743 rows/s | 287,636 rows/s | 2.52x ⚠ | 1.33x ⚠ |
| findAll with author (join), 1k rows | 476,669 rows/s | 117,287 rows/s | 145,814 rows/s | 4.06x | 1.24x |
| bulkCreate 1000 per call | 72,479 rows/s | 30,739 rows/s | 33,797 rows/s | 2.36x ⚠ | 1.10x ⚠ |
| update where | 20 ops/s | 20 ops/s | 21 ops/s | 0.97x ⚠ | 1.02x ⚠ |
| count where | 1,383 ops/s | 1,228 ops/s | 1,285 ops/s | 1.13x ⚠ | 1.05x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 44,558 ops/s | 4,005 ops/s | 11.13x |
| findByPk (serial) | 42,172 ops/s | 4,235 ops/s | 9.96x |
| findByPk (64 concurrent) | 61,656 ops/s | 7,609 ops/s | 8.10x |
| findAll where/order/limit 100 | 337 ops/s | 244 ops/s | 1.38x |
| findAll 10k rows | 392,085 rows/s | 122,098 rows/s | 3.21x |
| findAll with author (join), 1k rows | 302,716 rows/s | 76,139 rows/s | 3.98x |
| bulkCreate 1000 per call | 194,773 rows/s | 80,838 rows/s | 2.41x |
| update where | 642 ops/s | 480 ops/s | 1.34x |
| count where | 3,427 ops/s | 2,076 ops/s | 1.65x |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
