MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 980,710 docs/s | 626,756 docs/s | 1.56x |
| bson deserialize | 1,050,038 docs/s | 446,767 docs/s | 2.35x |
| insertOne (serial) | 8,414 ops/s | 4,147 ops/s | 2.03x |
| findOne by _id (serial) | 8,209 ops/s | 4,535 ops/s | 1.81x ⚠ |
| findOne by _id (64 concurrent) | 50,784 ops/s | 11,907 ops/s | 4.27x ⚠ |
| insertMany (1000 per batch) | 218,459 docs/s | 170,012 docs/s | 1.28x ⚠ |
| find toArray (all docs) | 393,544 docs/s | 202,182 docs/s | 1.95x ⚠ |
| aggregate $group | 108 ops/s | 96 ops/s | 1.12x ⚠ |
| updateMany $inc | 13 ops/s | 14 ops/s | 0.96x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
