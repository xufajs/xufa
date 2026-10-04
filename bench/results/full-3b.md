{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-02T19:37:50.350Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| error | 19,395 | 20,853 ⚠10% | - | **0.93x** |
| plugins | 16,763 ⚠197% | 42,716 ⚠71% | - | **0.39x** |
| post-json | 9,881 | 8,586 ⚠11% | - | **1.15x** |
| post-validate | 33,261 ⚠74% | 23,936 ⚠97% | - | **1.39x** |
| query | 14,657 ⚠65% | 19,907 ⚠136% | - | **0.74x** |
| text | 45,008 | 44,603 ⚠21% | 46,699 | **1.01x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| error | 51.2 | 49.0 | - | **0.96x** |
| plugins | 49.6 | 23.1 | - | **0.47x** |
| post-json | 75.6 | 82.6 | - | **1.09x** |
| post-validate | 30.4 | 38.7 | - | **1.27x** |
| query | 49.7 | 37.8 | - | **0.76x** |
| text | 22.4 | 21.7 | 21.7 | **0.97x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| error | 44 / 298 | 43 / 264 | - |
| plugins | 47 / 351 | 18 / 133 | - |
| post-json | 90 / 166 | 113 / 186 | - |
| post-validate | 28 / 132 | 30 / 139 | - |
| query | 55 / 338 | 34 / 127 | - |
| text | 20 / 129 | 19 / 125 | 18 / 129 |
