After the SQL cache (queries compiled once per shape), objects made from the driver rows, and Dates sent as they are to @xufa/pg.

ORMs: @xufa/orm against sequelize 6.37.8

### postgres

| Workload | xufa | sequelize | sequelize-xufa-pg | xufa / sequelize | sequelize-xufa-pg / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 5,149 ops/s | 2,031 ops/s | 2,304 ops/s | 2.53x | 1.13x |
| findByPk (serial) | 13,501 ops/s | 4,716 ops/s | 4,176 ops/s | 2.86x ⚠ | 0.89x ⚠ |
| findByPk (64 concurrent) | 80,767 ops/s | 9,187 ops/s | 9,121 ops/s | 8.79x ⚠ | 0.99x ⚠ |
| findAll where/order/limit 100 | 695 ops/s | 539 ops/s | 589 ops/s | 1.29x ⚠ | 1.09x ⚠ |
| findAll 10k rows | 573,385 rows/s | 218,398 rows/s | 283,132 rows/s | 2.63x ⚠ | 1.30x ⚠ |
| findAll with author (join), 1k rows | 467,761 rows/s | 117,992 rows/s | 147,388 rows/s | 3.96x ⚠ | 1.25x ⚠ |
| bulkCreate 1000 per call | 71,855 rows/s | 28,864 rows/s | 32,417 rows/s | 2.49x ⚠ | 1.12x ⚠ |
| update where | 19 ops/s | 20 ops/s | 20 ops/s | 0.97x | 1.01x |
| count where | 1,421 ops/s | 1,236 ops/s | 1,196 ops/s | 1.15x ⚠ | 0.97x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 44,271 ops/s | 3,883 ops/s | 11.40x ⚠ |
| findByPk (serial) | 51,445 ops/s | 4,198 ops/s | 12.25x |
| findByPk (64 concurrent) | 68,704 ops/s | 7,605 ops/s | 9.03x |
| findAll where/order/limit 100 | 332 ops/s | 241 ops/s | 1.38x |
| findAll 10k rows | 376,817 rows/s | 121,218 rows/s | 3.11x ⚠ |
| findAll with author (join), 1k rows | 287,028 rows/s | 74,945 rows/s | 3.83x |
| bulkCreate 1000 per call | 193,620 rows/s | 80,729 rows/s | 2.40x |
| update where | 631 ops/s | 489 ops/s | 1.29x |
| count where | 3,384 ops/s | 2,011 ops/s | 1.68x |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
