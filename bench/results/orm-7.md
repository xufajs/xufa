@xufa/orm, Sequelize 6 (pg, sqlite3), and the same Sequelize code on @xufa/sequelize. 5 rounds (after composite keys, polymorphic keys, schemas and limitPer).

ORMs: @xufa/orm against sequelize 6.37.8
5 rounds, scale 1, pool 10, Node.js v22.21.1

### postgres

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 4,523 ops/s | 1,895 ops/s | 4,586 ops/s | 2.39x ⚠ | 2.42x ⚠ |
| findByPk (serial) | 12,254 ops/s | 4,522 ops/s | 11,622 ops/s | 2.71x ⚠ | 2.57x ⚠ |
| findByPk (64 concurrent) | 78,651 ops/s | 8,977 ops/s | 70,350 ops/s | 8.76x ⚠ | 7.84x ⚠ |
| findAll where/order/limit 100 | 681 ops/s | 527 ops/s | 668 ops/s | 1.29x | 1.27x |
| findAll 10k rows | 528,698 rows/s | 212,331 rows/s | 590,538 rows/s | 2.49x ⚠ | 2.78x ⚠ |
| findAll with author (join), 1k rows | 451,572 rows/s | 119,138 rows/s | 420,684 rows/s | 3.79x ⚠ | 3.53x ⚠ |
| bulkCreate 1000 per call | 70,115 rows/s | 31,115 rows/s | 70,243 rows/s | 2.25x ⚠ | 2.26x ⚠ |
| update where | 19 ops/s | 20 ops/s | 19 ops/s | 0.93x ⚠ | 0.94x ⚠ |
| count where | 1,295 ops/s | 1,227 ops/s | 1,427 ops/s | 1.06x ⚠ | 1.16x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 42,037 ops/s | 3,878 ops/s | 34,634 ops/s | 10.84x | 8.93x |
| findByPk (serial) | 48,802 ops/s | 3,936 ops/s | 63,639 ops/s | 12.40x ⚠ | 16.17x ⚠ |
| findByPk (64 concurrent) | 70,054 ops/s | 7,487 ops/s | 132,376 ops/s | 9.36x ⚠ | 17.68x ⚠ |
| findAll where/order/limit 100 | 333 ops/s | 238 ops/s | 328 ops/s | 1.40x | 1.38x |
| findAll 10k rows | 351,481 rows/s | 122,580 rows/s | 392,687 rows/s | 2.87x ⚠ | 3.20x ⚠ |
| findAll with author (join), 1k rows | 283,767 rows/s | 75,852 rows/s | 275,608 rows/s | 3.74x | 3.63x |
| bulkCreate 1000 per call | 189,890 rows/s | 81,680 rows/s | 192,082 rows/s | 2.32x ⚠ | 2.35x ⚠ |
| update where | 626 ops/s | 478 ops/s | 569 ops/s | 1.31x ⚠ | 1.19x ⚠ |
| count where | 3,379 ops/s | 1,917 ops/s | 3,195 ops/s | 1.76x | 1.67x |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
