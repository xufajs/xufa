MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 694,432 docs/s | 796,685 docs/s | 0.87x |
| bson deserialize | 397,316 docs/s | 555,584 docs/s | 0.72x ⚠ |
| insertOne (serial) | 8,970 ops/s | 4,654 ops/s | 1.93x |
| findOne by _id (serial) | 9,068 ops/s | 5,265 ops/s | 1.72x ⚠ |
| findOne by _id (64 concurrent) | 46,068 ops/s | 14,281 ops/s | 3.23x ⚠ |
| insertMany (1000 per batch) | 195,066 docs/s | 187,749 docs/s | 1.04x ⚠ |
| find toArray (all docs) | 16,096 docs/s | 244,785 docs/s | 0.07x ⚠ |
| aggregate $group | 124 ops/s | 125 ops/s | 0.99x ⚠ |
| updateMany $inc | 15 ops/s | 16 ops/s | 0.90x ⚠ |

⚠: the rounds of a driver are more than 10% apart (noise); medians of the rounds.
