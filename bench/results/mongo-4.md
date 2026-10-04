MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 1,031,697 docs/s | 633,047 docs/s | 1.63x |
| bson deserialize | 979,783 docs/s | 448,396 docs/s | 2.19x |
| insertOne (serial) | 7,991 ops/s | 4,059 ops/s | 1.97x ⚠ |
| findOne by _id (serial) | 8,577 ops/s | 4,611 ops/s | 1.86x ⚠ |
| findOne by _id (64 concurrent) | 46,503 ops/s | 11,833 ops/s | 3.93x ⚠ |
| insertMany (1000 per batch) | 224,804 docs/s | 165,607 docs/s | 1.36x ⚠ |
| find toArray (all docs) | 339,289 docs/s | 192,861 docs/s | 1.76x ⚠ |
| aggregate $group | 107 ops/s | 94 ops/s | 1.13x ⚠ |
| updateMany $inc | 13 ops/s | 13 ops/s | 0.95x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
