MongoDB drivers: @xufa/mongo against mongodb 7.7.0
mongodb://127.0.0.1:27017/xufa_bench, 5 rounds, scale 1, maxPoolSize 10, Node.js v22.21.1
round 1/5 done
round 2/5 done
round 3/5 done
round 4/5 done
round 5/5 done

| Workload | @xufa/mongo | mongodb | xufa / mongodb |
| --- | ---: | ---: | ---: |
| bson serialize | 585,524 docs/s | 686,699 docs/s | 0.85x ⚠ |
| bson deserialize | 339,183 docs/s | 495,704 docs/s | 0.68x |
| insertOne (serial) | 7,683 ops/s | 4,570 ops/s | 1.68x ⚠ |
| findOne by _id (serial) | 7,906 ops/s | 5,237 ops/s | 1.51x ⚠ |
| findOne by _id (64 concurrent) | 42,496 ops/s | 5,902 ops/s | 7.20x ⚠ |
| insertMany (1000 per batch) | 184,904 docs/s | 172,941 docs/s | 1.07x ⚠ |
| find toArray (all docs) | 152,646 docs/s | 187,060 docs/s | 0.82x ⚠ |
| aggregate $group | 93 ops/s | 95 ops/s | 0.97x ⚠ |
| updateMany $inc | 13 ops/s | 12 ops/s | 1.12x ⚠ |

Medians of the rounds.
⚠: the rounds of a driver are more than 10% apart (noise).
