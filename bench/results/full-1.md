{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-02T16:11:26.803Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 48,869 | 48,459 | - | **1.01x** |
| big-json | 10,129 | 10,483 | 12,505 | **0.97x** |
| error | 18,405 | 21,123 | - | **0.87x** |
| headers | 44,272 | 42,608 | - | **1.04x** |
| hello-schema | 48,757 | 47,413 | 49,509 | **1.03x** |
| hello | 48,213 | 46,715 | 49,035 | **1.03x** |
| hooks | 46,741 | 46,619 | - | **1.00x** |
| many-routes | 47,573 | 47,771 | - | **1.00x** |
| not-found | 46,341 | 45,173 | - | **1.03x** |
| params | 15,886 | 17,481 | - | **0.91x** |
| plugins | 47,387 | 47,557 | - | **1.00x** |
| post-json | 9,667 | 9,508 | - | **1.02x** |
| post-validate | 34,763 | 34,507 | - | **1.01x** |
| query | 42,901 | 44,411 | - | **0.97x** |
| text | 47,349 | 47,147 | 48,144 | **1.00x** |

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 20.7 | 20.9 | - | **1.01x** |
| big-json | 101.7 | 101.8 | 81.2 | **1.00x** |
| error | 54.6 | 47.7 | - | **0.87x** |
| headers | 23.2 | 23.6 | - | **1.02x** |
| hello-schema | 20.8 | 21.1 | 20.5 | **1.02x** |
| hello | 20.9 | 21.5 | 20.6 | **1.03x** |
| hooks | 21.7 | 21.1 | - | **0.97x** |
| many-routes | 21.2 | 20.9 | - | **0.99x** |
| not-found | 21.7 | 22.0 | - | **1.01x** |
| params | 44.0 | 48.0 | - | **1.09x** |
| plugins | 21.0 | 21.3 | - | **1.01x** |
| post-json | 83.5 | 81.4 | - | **0.97x** |
| post-validate | 29.0 | 29.4 | - | **1.01x** |
| query | 23.6 | 22.4 | - | **0.95x** |
| text | 21.2 | 21.6 | 21.0 | **1.02x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 17 / 116 | 18 / 115 | - |
| big-json | 94 / 211 | 92 / 271 | 76 / 243 |
| error | 47 / 291 | 42 / 286 | - |
| headers | 21 / 130 | 21 / 116 | - |
| hello-schema | 18 / 106 | 19 / 100 | 18 / 103 |
| hello | 19 / 103 | 19 / 105 | 19 / 106 |
| hooks | 18 / 120 | 18 / 122 | - |
| many-routes | 18 / 120 | 18 / 118 | - |
| not-found | 20 / 106 | 20 / 114 | - |
| params | 56 / 407 | 50 / 240 | - |
| plugins | 18 / 123 | 19 / 117 | - |
| post-json | 97 / 172 | 99 / 566 | - |
| post-validate | 27 / 90 | 27 / 76 | - |
| query | 22 / 98 | 21 / 99 | - |
| text | 19 / 112 | 19 / 101 | 19 / 90 |
