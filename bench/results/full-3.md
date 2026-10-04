{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-02T19:10:35.657Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 47,045 | 47,275 | - | **1.00x** |
| big-json | 15,061 | 10,625 | 13,369 | **1.42x** |
| error | 19,264 ⚠15% | 21,413 | - | **0.90x** |
| headers | 44,133 | 43,152 | - | **1.02x** |
| hello-schema | 46,640 | 45,648 | 47,349 | **1.02x** |
| hello | 45,808 | 45,051 | 45,888 | **1.02x** |
| hooks | 45,456 | 45,675 | - | **1.00x** |
| many-routes | 45,275 | 45,067 | - | **1.00x** |
| not-found | 44,037 | 43,435 | - | **1.01x** |
| params | 44,987 | 44,144 | - | **1.02x** |
| plugins | 39,600 ⚠45% | 41,568 ⚠63% | - | **0.95x** |
| post-json | 23,381 ⚠91% | 30,213 ⚠68% | - | **0.77x** |
| post-validate | 9,824 ⚠68% | 9,197 | - | **1.07x** |
| query | 22,291 ⚠141% | 12,975 ⚠255% | - | **1.72x** |
| text | 48,373 ⚠73% | 48,800 ⚠79% | 17,735 ⚠90% | **0.99x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 21.5 | 21.2 | - | **0.98x** |
| big-json | 68.8 | 98.1 | 76.2 | **1.43x** |
| error | 52.5 | 47.1 | - | **0.90x** |
| headers | 23.0 | 22.9 | - | **1.00x** |
| hello-schema | 21.6 | 21.7 | 21.3 | **1.00x** |
| hello | 22.4 | 22.4 | 21.9 | **1.00x** |
| hooks | 22.0 | 21.8 | - | **0.99x** |
| many-routes | 22.4 | 22.5 | - | **1.01x** |
| not-found | 23.1 | 23.2 | - | **1.00x** |
| params | 22.5 | 22.8 | - | **1.01x** |
| plugins | 25.3 | 24.0 | - | **0.95x** |
| post-json | 42.0 | 35.5 | - | **0.85x** |
| post-validate | 67.9 | 83.4 | - | **1.23x** |
| query | 33.8 | 51.0 | - | **1.51x** |
| text | 20.9 | 20.7 | 40.1 | **0.99x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 18 / 122 | 18 / 116 | - |
| big-json | 62 / 172 | 89 / 307 | 72 / 93 |
| error | 48 / 254 | 41 / 236 | - |
| headers | 20 / 123 | 21 / 112 | - |
| hello-schema | 19 / 100 | 19 / 120 | 19 / 101 |
| hello | 20 / 100 | 21 / 96 | 20 / 103 |
| hooks | 20 / 110 | 20 / 94 | - |
| many-routes | 20 / 115 | 20 / 114 | - |
| not-found | 21 / 90 | 21 / 89 | - |
| params | 20 / 108 | 21 / 117 | - |
| plugins | 20 / 148 | 21 / 122 | - |
| post-json | 33 / 163 | 31 / 128 | - |
| post-validate | 96 / 188 | 109 / 272 | - |
| query | 21 / 244 | 78 / 310 | - |
| text | 19 / 105 | 19 / 112 | 41 / 307 |
