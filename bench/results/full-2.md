{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-02T17:00:27.644Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 16,793 ⚠40% | 15,521 ⚠20% | - | **1.08x** |
| big-json | 4,376 | 4,424 | 5,802 | **0.99x** |
| error | 17,928 ⚠65% | 8,000 ⚠155% | - | **2.24x** |
| headers | 41,072 | 40,101 | - | **1.02x** |
| hello-schema | 43,115 ⚠11% | 43,301 ⚠11% | 43,339 | **1.00x** |
| hello | 47,381 | 46,731 | 48,336 | **1.01x** |
| hooks | 48,405 | 48,368 | - | **1.00x** |
| many-routes | 48,155 | 48,176 | - | **1.00x** |
| not-found | 46,816 | 46,763 | - | **1.00x** |
| params | 48,581 | 48,197 | - | **1.01x** |
| plugins | 48,459 | 48,053 | - | **1.01x** |
| post-json | 35,328 | 34,811 | - | **1.01x** |
| post-validate | 35,616 | 35,301 | - | **1.01x** |
| query | 45,979 | 46,085 | - | **1.00x** |
| text | 48,832 | 48,661 | 49,979 | **1.00x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 42.9 | 43.3 | - | **1.01x** |
| big-json | 164.5 | 170.2 | 124.8 | **1.03x** |
| error | 57.2 | 98.3 | - | **1.72x** |
| headers | 24.3 | 25.4 | - | **1.05x** |
| hello-schema | 22.8 | 22.9 | 23.6 | **1.00x** |
| hello | 21.1 | 21.3 | 20.6 | **1.01x** |
| hooks | 20.9 | 20.6 | - | **0.99x** |
| many-routes | 20.8 | 20.8 | - | **1.00x** |
| not-found | 21.2 | 21.6 | - | **1.02x** |
| params | 20.7 | 20.9 | - | **1.01x** |
| plugins | 20.7 | 21.2 | - | **1.02x** |
| post-json | 28.8 | 28.7 | - | **1.00x** |
| post-validate | 28.3 | 29.0 | - | **1.02x** |
| query | 21.7 | 21.6 | - | **0.99x** |
| text | 20.3 | 20.5 | 20.5 | **1.01x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 50 / 307 | 56 / 308 | - |
| big-json | 223 / 540 | 214 / 529 | 161 / 664 |
| error | 51 / 324 | 116 / 268 | - |
| headers | 23 / 118 | 23 / 107 | - |
| hello-schema | 22 / 110 | 22 / 82 | 21 / 106 |
| hello | 18 / 112 | 19 / 105 | 19 / 97 |
| hooks | 17 / 125 | 18 / 116 | - |
| many-routes | 18 / 114 | 19 / 109 | - |
| not-found | 19 / 114 | 20 / 96 | - |
| params | 18 / 107 | 17 / 126 | - |
| plugins | 17 / 124 | 17 / 122 | - |
| post-json | 27 / 62 | 27 / 64 | - |
| post-validate | 27 / 85 | 27 / 94 | - |
| query | 20 / 98 | 20 / 96 | - |
| text | 18 / 110 | 18 / 103 | 18 / 95 |
