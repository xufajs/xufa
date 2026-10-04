MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 1,208,548 docs/s | 630,979 docs/s | 1.92x ⚠ |
| bson deserialize | 1,064,190 docs/s | 452,513 docs/s | 2.35x ⚠ |
| insertOne (serial) | 8,156 ops/s | 3,982 ops/s | 2.05x ⚠ |
| findOne by _id (serial) | 8,672 ops/s | 4,480 ops/s | 1.94x ⚠ |
| findOne by _id (64 concurrent) | 50,483 ops/s | 11,735 ops/s | 4.30x ⚠ |
| insertMany (1000 per batch) | 193,908 docs/s | 167,400 docs/s | 1.16x ⚠ |
| insertMany (50k in one call, ordered) | 202,117 docs/s | 135,052 docs/s | 1.50x ⚠ |
| insertMany (50k in one call, unordered) | 534,804 docs/s | 136,775 docs/s | 3.91x ⚠ |
| find toArray (all docs) | 350,276 docs/s | 171,309 docs/s | 2.04x ⚠ |
| aggregate $group | 92 ops/s | 93 ops/s | 0.98x ⚠ |
| updateMany $inc | 12 ops/s | 13 ops/s | 0.89x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
