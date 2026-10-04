MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 515,230 docs/s | 637,309 docs/s | 0.81x ⚠ |
| bson deserialize | 954,159 docs/s | 453,401 docs/s | 2.10x |
| insertOne (serial) | 8,143 ops/s | 4,094 ops/s | 1.99x ⚠ |
| findOne by _id (serial) | 8,130 ops/s | 4,505 ops/s | 1.80x ⚠ |
| findOne by _id (64 concurrent) | 45,128 ops/s | 11,698 ops/s | 3.86x |
| insertMany (1000 per batch) | 177,093 docs/s | 158,367 docs/s | 1.12x ⚠ |
| find toArray (all docs) | 410,067 docs/s | 169,181 docs/s | 2.42x ⚠ |
| aggregate $group | 105 ops/s | 105 ops/s | 0.99x ⚠ |
| updateMany $inc | 12 ops/s | 13 ops/s | 0.96x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
