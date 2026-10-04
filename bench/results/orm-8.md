@xufa/orm, Sequelize 6 (pg, sqlite3), and the same Sequelize code on @xufa/sequelize. 5 rounds (after the create warm-up fix: no awaits without hooks/validators, cached single-row INSERTs).

ORMs: @xufa/orm against sequelize 6.37.8
5 rounds, scale 1, pool 10, Node.js v22.21.1

### postgres

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 5,010 ops/s | 1,931 ops/s | 4,863 ops/s | 2.59x ⚠ | 2.52x ⚠ |
| findByPk (serial) | 12,368 ops/s | 4,291 ops/s | 10,591 ops/s | 2.88x ⚠ | 2.47x ⚠ |
| findByPk (64 concurrent) | 76,651 ops/s | 8,948 ops/s | 71,194 ops/s | 8.57x ⚠ | 7.96x ⚠ |
| findAll where/order/limit 100 | 691 ops/s | 519 ops/s | 676 ops/s | 1.33x ⚠ | 1.30x ⚠ |
| findAll 10k rows | 504,875 rows/s | 213,691 rows/s | 591,527 rows/s | 2.36x ⚠ | 2.77x ⚠ |
| findAll with author (join), 1k rows | 479,744 rows/s | 118,834 rows/s | 421,445 rows/s | 4.04x ⚠ | 3.55x ⚠ |
| bulkCreate 1000 per call | 70,835 rows/s | 32,063 rows/s | 71,370 rows/s | 2.21x ⚠ | 2.23x ⚠ |
| update where | 20 ops/s | 20 ops/s | 21 ops/s | 0.99x ⚠ | 1.04x ⚠ |
| count where | 1,342 ops/s | 1,215 ops/s | 1,407 ops/s | 1.10x ⚠ | 1.16x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 49,153 ops/s | 3,886 ops/s | 41,788 ops/s | 12.65x | 10.75x |
| findByPk (serial) | 49,174 ops/s | 4,011 ops/s | 63,627 ops/s | 12.26x ⚠ | 15.87x ⚠ |
| findByPk (64 concurrent) | 70,381 ops/s | 7,357 ops/s | 133,556 ops/s | 9.57x ⚠ | 18.15x ⚠ |
| findAll where/order/limit 100 | 333 ops/s | 239 ops/s | 331 ops/s | 1.39x | 1.38x |
| findAll 10k rows | 363,264 rows/s | 124,006 rows/s | 386,479 rows/s | 2.93x ⚠ | 3.12x ⚠ |
| findAll with author (join), 1k rows | 286,177 rows/s | 74,475 rows/s | 288,235 rows/s | 3.84x ⚠ | 3.87x ⚠ |
| bulkCreate 1000 per call | 188,382 rows/s | 82,957 rows/s | 189,316 rows/s | 2.27x | 2.28x |
| update where | 628 ops/s | 481 ops/s | 566 ops/s | 1.30x | 1.18x |
| count where | 3,351 ops/s | 1,966 ops/s | 3,281 ops/s | 1.70x ⚠ | 1.67x ⚠ |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
