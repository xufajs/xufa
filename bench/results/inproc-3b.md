| Scenario | xufa req/s | xufa µs/req | fastify req/s | fastify µs/req | node req/s | node µs/req | xufa / fastify |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| async | 439,567 | 2.30 | 412,841 | 2.43 | - | - | **1.06x** |
| big-json | 19,802 | 52.00 | 13,437 | 74.22 | 16,423 | 61.00 | **1.47x** |
| error | 45,154 | 21.60 | 46,412 | 20.99 | - | - | **0.97x** |
| headers | 316,599 | 3.16 | 303,351 | 3.28 | - | - | **1.04x** |
| hello-schema | 439,913 | 2.28 | 417,089 | 2.39 | 221,916 | 4.18 ⚠100% | **1.05x** |
| hello | 396,255 | 2.51 ⚠56% | 162,966 | 5.82 ⚠92% | 201,569 | 4.63 ⚠92% | **2.43x** |
| post-validate | 88,595 | 10.64 ⚠67% | 164,379 | 6.07 | - | - | **0.54x** |

⚠ marks rounds more than 10% apart: the machine was busy, run again.
