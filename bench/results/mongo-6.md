MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 1,277,423 docs/s | 626,405 docs/s | 2.04x |
| bson deserialize | 1,108,566 docs/s | 442,476 docs/s | 2.51x |
| insertOne (serial) | 8,292 ops/s | 4,233 ops/s | 1.96x ⚠ |
| findOne by _id (serial) | 8,278 ops/s | 4,962 ops/s | 1.67x ⚠ |
| findOne by _id (64 concurrent) | 49,943 ops/s | 11,852 ops/s | 4.21x ⚠ |
| insertMany (1000 per batch) | 223,797 docs/s | 176,614 docs/s | 1.27x ⚠ |
| find toArray (all docs) | 469,957 docs/s | 200,595 docs/s | 2.34x ⚠ |
| aggregate $group | 110 ops/s | 97 ops/s | 1.14x ⚠ |
| updateMany $inc | 15 ops/s | 13 ops/s | 1.21x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
