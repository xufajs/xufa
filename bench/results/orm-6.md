@xufa/orm, Sequelize 6 (pg, sqlite3), and the same Sequelize code on @xufa/sequelize. 5 rounds.

ORMs: @xufa/orm against sequelize 6.37.8

### postgres

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 5,138 ops/s | 1,965 ops/s | 5,027 ops/s | 2.62x ⚠ | 2.56x ⚠ |
| findByPk (serial) | 12,814 ops/s | 4,675 ops/s | 12,546 ops/s | 2.74x ⚠ | 2.68x ⚠ |
| findByPk (64 concurrent) | 78,864 ops/s | 9,182 ops/s | 77,035 ops/s | 8.59x ⚠ | 8.39x ⚠ |
| findAll where/order/limit 100 | 675 ops/s | 533 ops/s | 664 ops/s | 1.27x ⚠ | 1.25x ⚠ |
| findAll 10k rows | 543,009 rows/s | 210,394 rows/s | 554,142 rows/s | 2.58x ⚠ | 2.63x ⚠ |
| findAll with author (join), 1k rows | 442,463 rows/s | 118,961 rows/s | 424,645 rows/s | 3.72x ⚠ | 3.57x ⚠ |
| bulkCreate 1000 per call | 71,489 rows/s | 31,614 rows/s | 74,342 rows/s | 2.26x ⚠ | 2.35x ⚠ |
| update where | 19 ops/s | 21 ops/s | 20 ops/s | 0.91x ⚠ | 0.96x ⚠ |
| count where | 1,460 ops/s | 1,257 ops/s | 1,301 ops/s | 1.16x ⚠ | 1.03x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa-sequelize | xufa / sequelize | xufa-sequelize / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 44,287 ops/s | 3,971 ops/s | 42,519 ops/s | 11.15x | 10.71x |
| findByPk (serial) | 51,028 ops/s | 4,156 ops/s | 73,820 ops/s | 12.28x ⚠ | 17.76x ⚠ |
| findByPk (64 concurrent) | 71,464 ops/s | 7,524 ops/s | 150,076 ops/s | 9.50x | 19.95x |
| findAll where/order/limit 100 | 330 ops/s | 239 ops/s | 331 ops/s | 1.38x | 1.39x |
| findAll 10k rows | 367,666 rows/s | 121,276 rows/s | 391,655 rows/s | 3.03x ⚠ | 3.23x ⚠ |
| findAll with author (join), 1k rows | 288,789 rows/s | 75,683 rows/s | 280,911 rows/s | 3.82x | 3.71x |
| bulkCreate 1000 per call | 193,425 rows/s | 81,882 rows/s | 214,942 rows/s | 2.36x ⚠ | 2.63x ⚠ |
| update where | 628 ops/s | 486 ops/s | 629 ops/s | 1.29x | 1.29x |
| count where | 3,384 ops/s | 1,994 ops/s | 3,258 ops/s | 1.70x | 1.63x |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
