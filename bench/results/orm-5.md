Full stacks: @xufa/orm on @xufa/pg against Sequelize on pg (the default), 7 rounds.

ORMs: @xufa/orm against sequelize 6.37.8

### postgres

| Workload | xufa | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 5,027 ops/s | 2,079 ops/s | 2.42x |
| findByPk (serial) | 13,647 ops/s | 4,823 ops/s | 2.83x ⚠ |
| findByPk (64 concurrent) | 82,366 ops/s | 9,591 ops/s | 8.59x |
| findAll where/order/limit 100 | 718 ops/s | 554 ops/s | 1.30x ⚠ |
| findAll 10k rows | 592,143 rows/s | 227,619 rows/s | 2.60x ⚠ |
| findAll with author (join), 1k rows | 498,403 rows/s | 125,140 rows/s | 3.98x ⚠ |
| bulkCreate 1000 per call | 78,395 rows/s | 33,421 rows/s | 2.35x ⚠ |
| update where | 20 ops/s | 22 ops/s | 0.90x ⚠ |
| count where | 1,487 ops/s | 1,226 ops/s | 1.21x ⚠ |

Medians of the rounds. ⚠: the rounds of a stack are more than 10% apart (noise).
