{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-05T09:27:10.195Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 19,047 | 20,152 ⚠155% | - | **0.95x** |
| big-json | 14,808 | 10,629 | 13,479 | **1.39x** |
| error | 21,275 | 19,336 ⚠11% | - | **1.10x** |
| headers | 45,829 | 44,891 | - | **1.02x** |
| hello-schema | 49,893 | 48,949 | 50,389 | **1.02x** |
| hello | 48,805 | 48,325 | 49,787 | **1.01x** |
| hooks | 50,352 | 50,336 | - | **1.00x** |
| many-routes | 48,453 | 48,267 | - | **1.00x** |
| not-found | 47,456 | 46,992 | - | **1.01x** |
| params | 49,392 | 48,379 | - | **1.02x** |
| plugins | 48,021 | 48,288 ⚠62% | - | **0.99x** |
| post-json | 33,151 ⚠26% | 34,020 | - | **0.97x** |
| post-validate | 35,659 | 34,731 | - | **1.03x** |
| query | 45,957 | 45,696 | - | **1.01x** |
| text | 48,731 | 48,421 | 49,664 | **1.01x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 41.6 | 40.4 | - | **0.97x** |
| big-json | 69.0 | 94.1 | 74.1 | **1.36x** |
| error | 47.3 | 51.7 | - | **1.09x** |
| headers | 21.9 | 22.1 | - | **1.01x** |
| hello-schema | 20.2 | 20.4 | 20.1 | **1.01x** |
| hello | 20.8 | 20.6 | 20.0 | **0.99x** |
| hooks | 20.0 | 19.8 | - | **0.99x** |
| many-routes | 20.6 | 20.3 | - | **0.99x** |
| not-found | 21.0 | 21.8 | - | **1.04x** |
| params | 19.9 | 20.5 | - | **1.03x** |
| plugins | 20.7 | 20.4 | - | **0.99x** |
| post-json | 30.2 | 29.5 | - | **0.97x** |
| post-validate | 28.1 | 29.1 | - | **1.04x** |
| query | 21.8 | 21.9 | - | **1.00x** |
| text | 20.4 | 20.2 | 20.1 | **0.99x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 36 / 305 | 39 / 269 | - |
| big-json | 50 / 455 | 78 / 666 | 57 / 538 |
| error | 43 / 255 | 44 / 325 | - |
| headers | 16 / 108 | 16 / 116 | - |
| hello-schema | 15 / 87 | 15 / 95 | 15 / 95 |
| hello | 15 / 105 | 15 / 106 | 14 / 102 |
| hooks | 15 / 97 | 14 / 95 | - |
| many-routes | 15 / 93 | 15 / 96 | - |
| not-found | 15 / 120 | 15 / 117 | - |
| params | 15 / 97 | 15 / 105 | - |
| plugins | 15 / 97 | 15 / 105 | - |
| post-json | 26 / 159 | 27 / 139 | - |
| post-validate | 25 / 151 | 26 / 140 | - |
| query | 16 / 127 | 16 / 130 | - |
| text | 15 / 104 | 15 / 102 | 14 / 96 |
