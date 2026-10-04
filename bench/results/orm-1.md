ORMs: @xufa/orm against sequelize 6.37.8
5 rounds, scale 1, pool 10, Node.js v22.21.1

### postgres

| Workload | @xufa/orm | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 3,249 ops/s | 1,966 ops/s | 1.65x |
| findByPk (serial) | 5,949 ops/s | 4,440 ops/s | 1.34x |
| findByPk (64 concurrent) | 17,734 ops/s | 8,897 ops/s | 1.99x |
| findAll where/order/limit 100 | 597 ops/s | 521 ops/s | 1.15x ⚠ |
| findAll 10k rows | 325,596 rows/s | 211,562 rows/s | 1.54x ⚠ |
| findAll with author (join), 1k rows | 255,507 rows/s | 115,772 rows/s | 2.21x ⚠ |
| bulkCreate 1000 per call | 60,038 rows/s | 32,915 rows/s | 1.82x ⚠ |
| update where | 19 ops/s | 36 ops/s | 0.52x |
| count where | 1,343 ops/s | 1,254 ops/s | 1.07x ⚠ |


### sqlite

| Workload | @xufa/orm | sequelize | xufa / sequelize |
| --- | ---: | ---: | ---: |
| create (serial) | 13,186 ops/s | 3,787 ops/s | 3.48x ⚠ |
| findByPk (serial) | 14,279 ops/s | 3,902 ops/s | 3.66x ⚠ |
| findByPk (64 concurrent) | 20,630 ops/s | 3,533 ops/s | 5.84x ⚠ |
| findAll where/order/limit 100 | 296 ops/s | 171 ops/s | 1.73x ⚠ |
| findAll 10k rows | 189,226 rows/s | 68,454 rows/s | 2.76x ⚠ |
| findAll with author (join), 1k rows | 137,136 rows/s | 44,786 rows/s | 3.06x ⚠ |
| bulkCreate 1000 per call | 119,738 rows/s | 45,670 rows/s | 2.62x ⚠ |
| update where | 408 ops/s | 350 ops/s | 1.16x ⚠ |
| count where | 1,747 ops/s | 1,385 ops/s | 1.26x ⚠ |

Medians of the rounds. ⚠: the rounds of an ORM are more than 10% apart (noise).
