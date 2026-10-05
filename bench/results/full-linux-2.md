{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"linux 6.18.40.1-microsoft-standard-WSL2","date":"2026-10-05T11:44:50.436Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 115,115 | 102,176 | - | **1.13x** |
| big-json | 18,499 | 11,165 | 18,747 | **1.66x** |
| error | 48,517 | 47,376 | - | **1.02x** |
| headers | 102,613 | 87,413 | - | **1.17x** |
| hello-schema | 123,381 | 103,392 | 116,864 | **1.19x** |
| hello | 118,272 | 106,411 | 114,699 | **1.11x** |
| hooks | 118,165 | 99,648 | - | **1.19x** |
| many-routes | 105,355 | 92,928 | - | **1.13x** |
| not-found | 101,739 | 95,861 | - | **1.06x** |
| params | 113,024 | 97,301 | - | **1.16x** |
| plugins | 109,909 | 101,024 | - | **1.09x** |
| post-json | 49,392 | 42,672 | - | **1.16x** |
| post-validate | 45,739 | 42,144 | - | **1.09x** |
| query | 93,760 | 86,101 | - | **1.09x** |
| text | 126,315 | 110,859 | 119,829 | **1.14x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 8.8 | 9.9 | - | **1.12x** |
| big-json | 56.1 | 92.4 | 54.3 | **1.65x** |
| error | 20.8 | 21.4 | - | **1.03x** |
| headers | 9.9 | 11.6 | - | **1.17x** |
| hello-schema | 8.2 | 9.8 | 8.7 | **1.19x** |
| hello | 8.6 | 9.5 | 8.9 | **1.11x** |
| hooks | 8.5 | 10.2 | - | **1.19x** |
| many-routes | 9.6 | 10.9 | - | **1.14x** |
| not-found | 10.0 | 10.6 | - | **1.07x** |
| params | 8.9 | 10.4 | - | **1.16x** |
| plugins | 9.2 | 10.1 | - | **1.09x** |
| post-json | 20.8 | 24.0 | - | **1.16x** |
| post-validate | 22.5 | 24.3 | - | **1.08x** |
| query | 10.8 | 11.8 | - | **1.09x** |
| text | 8.0 | 9.2 | 8.5 | **1.14x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 9 / 13 | 10 / 14 | - |
| big-json | 51 / 93 | 81 / 460 | 53 / 69 |
| error | 23 / 27 | 24 / 28 | - |
| headers | 10 / 13 | 12 / 16 | - |
| hello-schema | 8 / 11 | 10 / 13 | 9 / 12 |
| hello | 9 / 12 | 10 / 13 | 9 / 12 |
| hooks | 9 / 11 | 11 / 15 | - |
| many-routes | 10 / 13 | 11 / 15 | - |
| not-found | 10 / 14 | 11 / 15 | - |
| params | 9 / 12 | 11 / 14 | - |
| plugins | 9 / 13 | 11 / 14 | - |
| post-json | 16 / 36 | 19 / 42 | - |
| post-validate | 17 / 39 | 19 / 41 | - |
| query | 11 / 15 | 13 / 16 | - |
| text | 8 / 11 | 10 / 12 | 9 / 12 |
