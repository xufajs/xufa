MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v24.21.0

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 1,221,242 docs/s | 671,890 docs/s | 1.82x |
| bson deserialize | 1,200,957 docs/s | 526,476 docs/s | 2.28x |
| insertOne (serial) | 9,583 ops/s | 5,721 ops/s | 1.68x ⚠ |
| findOne by _id (serial) | 9,438 ops/s | 5,293 ops/s | 1.78x ⚠ |
| findOne by _id (64 concurrent) | 51,877 ops/s | 12,794 ops/s | 4.05x |
| insertMany (1000 per batch) | 225,780 docs/s | 179,204 docs/s | 1.26x ⚠ |
| insertMany (50k in one call, ordered) | 214,502 docs/s | 141,729 docs/s | 1.51x ⚠ |
| insertMany (50k in one call, unordered) | 524,144 docs/s | 143,933 docs/s | 3.64x |
| find toArray (all docs) | 550,008 docs/s | 263,292 docs/s | 2.09x ⚠ |
| aggregate $group | 106 ops/s | 109 ops/s | 0.97x ⚠ |
| updateMany $inc | 15 ops/s | 15 ops/s | 0.99x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
