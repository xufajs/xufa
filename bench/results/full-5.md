{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-05T12:06:35.855Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 49,045 | 49,323 | - | **0.99x** |
| big-json | 14,797 | 10,609 | 13,280 | **1.39x** |
| error | 18,467 | 20,045 | - | **0.92x** |
| headers | 46,731 | 44,469 | - | **1.05x** |
| hello-schema | 49,163 | 48,059 | 48,949 | **1.02x** |
| hello | 48,587 | 47,541 | 49,088 | **1.02x** |
| hooks | 47,445 | 48,720 | - | **0.97x** |
| many-routes | 47,664 | 48,699 | - | **0.98x** |
| not-found | 48,021 | 46,549 | - | **1.03x** |
| params | 48,501 | 47,461 | - | **1.02x** |
| plugins | 47,813 | 47,520 | - | **1.01x** |
| post-json | 33,711 | 33,663 | - | **1.00x** |
| post-validate | 25,491 ⚠49% | 12,446 ⚠163% | - | **2.05x** |
| query | 35,431 ⚠59% | 44,464 ⚠62% | - | **0.80x** |
| text | 47,920 ⚠61% | 47,317 ⚠62% | 46,832 ⚠42% | **1.01x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 20.2 | 20.3 | - | **1.01x** |
| big-json | 70.2 | 93.9 | 75.5 | **1.34x** |
| error | 54.2 | 50.5 | - | **0.93x** |
| headers | 21.2 | 22.3 | - | **1.05x** |
| hello-schema | 20.3 | 21.1 | 20.4 | **1.04x** |
| hello | 20.3 | 21.0 | 20.2 | **1.03x** |
| hooks | 20.6 | 20.0 | - | **0.97x** |
| many-routes | 21.2 | 20.4 | - | **0.96x** |
| not-found | 21.0 | 21.4 | - | **1.02x** |
| params | 20.9 | 21.0 | - | **1.01x** |
| plugins | 20.7 | 20.6 | - | **1.00x** |
| post-json | 29.3 | 29.9 | - | **1.02x** |
| post-validate | 35.7 | 71.6 | - | **2.01x** |
| query | 26.1 | 22.3 | - | **0.86x** |
| text | 20.5 | 21.4 | 21.1 | **1.04x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 17 / 88 | 15 / 84 | - |
| big-json | 50 / 481 | 75 / 733 | 58 / 522 |
| error | 46 / 363 | 45 / 314 | - |
| headers | 16 / 92 | 16 / 122 | - |
| hello-schema | 15 / 100 | 15 / 94 | 15 / 96 |
| hello | 15 / 106 | 15 / 107 | 15 / 105 |
| hooks | 16 / 102 | 15 / 103 | - |
| many-routes | 15 / 105 | 15 / 104 | - |
| not-found | 15 / 105 | 16 / 120 | - |
| params | 15 / 104 | 15 / 114 | - |
| plugins | 15 / 103 | 14 / 108 | - |
| post-json | 26 / 164 | 27 / 154 | - |
| post-validate | 27 / 183 | 77 / 152 | - |
| query | 18 / 162 | 17 / 131 | - |
| text | 17 / 90 | 15 / 104 | 17 / 104 |
