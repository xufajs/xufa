Baseline: three stacks, before the ORM fixes and before @xufa/pg prepared texts on their second run.

ORMs: @xufa/orm against sequelize 6.37.8

### postgres

| Workload | xufa | sequelize | sequelize-xufa-pg | xufa / sequelize | sequelize-xufa-pg / sequelize |
| --- | ---: | ---: | ---: | ---: | ---: |
| create (serial) | 3,013 ops/s | 1,921 ops/s | 2,077 ops/s | 1.57x ⚠ | 1.08x ⚠ |
| findByPk (serial) | 5,823 ops/s | 4,736 ops/s | 3,999 ops/s | 1.23x ⚠ | 0.84x ⚠ |
| findByPk (64 concurrent) | 17,541 ops/s | 9,284 ops/s | 8,626 ops/s | 1.89x ⚠ | 0.93x ⚠ |
| findAll where/order/limit 100 | 566 ops/s | 538 ops/s | 560 ops/s | 1.05x ⚠ | 1.04x ⚠ |
| findAll 10k rows | 334,619 rows/s | 208,382 rows/s | 272,690 rows/s | 1.61x ⚠ | 1.31x ⚠ |
| findAll with author (join), 1k rows | 249,788 rows/s | 111,847 rows/s | 146,307 rows/s | 2.23x ⚠ | 1.31x ⚠ |
| bulkCreate 1000 per call | 57,111 rows/s | 30,019 rows/s | 30,888 rows/s | 1.90x ⚠ | 1.03x ⚠ |
| update where | 18 ops/s | 21 ops/s | 20 ops/s | 0.85x ⚠ | 0.95x ⚠ |
| count where | 1,184 ops/s | 1,248 ops/s | 1,223 ops/s | 0.95x ⚠ | 0.98x ⚠ |


### sqlite

| Workload | xufa | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 13,288 ops/s | 3,740 ops/s | 3.55x ⚠ |
| findByPk (serial) | 13,686 ops/s | 3,930 ops/s | 3.48x ⚠ |
| findByPk (64 concurrent) | 20,546 ops/s | 6,688 ops/s | 3.07x ⚠ |
| findAll where/order/limit 100 | 317 ops/s | 235 ops/s | 1.35x ⚠ |
| findAll 10k rows | 303,504 rows/s | 119,600 rows/s | 2.54x ⚠ |
| findAll with author (join), 1k rows | 237,979 rows/s | 71,722 rows/s | 3.32x ⚠ |
| bulkCreate 1000 per call | 184,558 rows/s | 78,780 rows/s | 2.34x ⚠ |
| update where | 575 ops/s | 479 ops/s | 1.20x ⚠ |
| count where | 2,702 ops/s | 2,051 ops/s | 1.32x ⚠ |

