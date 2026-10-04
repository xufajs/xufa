| Scenario | xufa req/s | xufa µs/req | fastify req/s | fastify µs/req | node req/s | node µs/req | xufa / fastify |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hello | 356,651 | 2.69 ⚠33% | 414,996 | 2.36 | 478,531 | 2.10 | **0.86x** |
| hello-schema | 432,525 | 2.33 | 426,992 | 2.35 | 487,137 | 2.03 | **1.01x** |
| post-validate | 193,746 | 5.20 | 174,615 | 5.76 | - | - | **1.11x** |
| error | 44,888 | 21.72 | 45,407 | 21.54 | - | - | **0.99x** |

⚠ marks rounds more than 10% apart: the machine was busy, run again.
