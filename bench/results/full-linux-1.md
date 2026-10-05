{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"linux 6.18.40.1-microsoft-standard-WSL2","date":"2026-10-05T10:42:45.091Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 104,608 | 104,949 | - | **1.00x** |
| big-json | 18,560 | 11,547 | 18,640 | **1.61x** |
| error | 50,523 | 48,853 | - | **1.03x** |
| headers | 89,493 | 87,435 | - | **1.02x** |
| hello-schema | 108,139 | 105,248 | 113,387 | **1.03x** |
| hello | 107,968 | 102,613 | 115,456 | **1.05x** |
| hooks | 104,501 | 100,597 | - | **1.04x** |
| many-routes | 98,261 | 95,456 | - | **1.03x** |
| not-found | 95,573 | 93,461 | - | **1.02x** |
| params | 102,645 | 97,056 | - | **1.06x** |
| plugins | 101,675 | 95,499 | - | **1.06x** |
| post-json | 46,571 | 43,285 | - | **1.08x** |
| post-validate | 42,715 | 42,363 | - | **1.01x** |
| query | 87,360 | 86,347 | - | **1.01x** |
| text | 114,315 | 108,533 | 127,797 | **1.05x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 9.7 | 9.7 | - | **0.99x** |
| big-json | 55.8 | 89.5 | 54.5 | **1.60x** |
| error | 20.0 | 20.7 | - | **1.04x** |
| headers | 11.3 | 11.6 | - | **1.02x** |
| hello-schema | 9.4 | 9.7 | 9.0 | **1.03x** |
| hello | 9.4 | 9.9 | 8.8 | **1.05x** |
| hooks | 9.7 | 10.1 | - | **1.04x** |
| many-routes | 10.3 | 10.6 | - | **1.03x** |
| not-found | 10.6 | 10.9 | - | **1.02x** |
| params | 9.9 | 10.4 | - | **1.06x** |
| plugins | 10.0 | 10.6 | - | **1.06x** |
| post-json | 21.9 | 24.0 | - | **1.09x** |
| post-validate | 24.0 | 24.2 | - | **1.01x** |
| query | 11.6 | 11.7 | - | **1.01x** |
| text | 8.9 | 9.4 | 7.9 | **1.05x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 10 / 14 | 10 / 13 | - |
| big-json | 50 / 82 | 81 / 376 | 51 / 73 |
| error | 23 / 27 | 24 / 27 | - |
| headers | 12 / 15 | 12 / 15 | - |
| hello-schema | 10 / 13 | 10 / 13 | 9 / 12 |
| hello | 10 / 13 | 10 / 14 | 9 / 13 |
| hooks | 10 / 13 | 11 / 14 | - |
| many-routes | 11 / 14 | 11 / 14 | - |
| not-found | 11 / 14 | 12 / 15 | - |
| params | 10 / 13 | 11 / 14 | - |
| plugins | 10 / 13 | 11 / 14 | - |
| post-json | 17 / 39 | 19 / 43 | - |
| post-validate | 19 / 43 | 19 / 42 | - |
| query | 12 / 16 | 13 / 16 | - |
| text | 9 / 12 | 10 / 13 | 8 / 11 |
