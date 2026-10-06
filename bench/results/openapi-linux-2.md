{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"linux 6.18.40.1-microsoft-standard-WSL2","date":"2026-10-06T18:56:39.650Z","options":{"duration":6,"warmup":2,"rounds":5,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | xufa / fastify |
| --- | ---: | ---: | ---: |
| openapi-get | 75,488 ⚠16% | 66,179 ⚠19% | **1.14x** |
| openapi-list | 71,957 ⚠24% | 61,861 | **1.16x** |
| openapi-list-validated | 55,136 ⚠16% | 45,035 ⚠19% | **1.22x** |
| openapi-post | 44,848 | 44,117 | **1.02x** |
| openapi-post-validated | 44,144 ⚠11% | 43,531 | **1.01x** |
| openapi-invalid | 70,848 ⚠30% | 46,128 ⚠14% | **1.54x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | fastify / xufa |
| --- | ---: | ---: | ---: |
| openapi-get | 13.6 | 15.5 | **1.14x** |
| openapi-list | 14.2 | 16.5 | **1.16x** |
| openapi-list-validated | 18.7 | 23.0 | **1.23x** |
| openapi-post | 23.3 | 23.5 | **1.01x** |
| openapi-post-validated | 23.7 | 23.8 | **1.00x** |
| openapi-invalid | 14.5 | 22.2 | **1.53x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms |
| --- | ---: | ---: |
| openapi-get | 14 / 25 | 15 / 29 |
| openapi-list | 15 / 21 | 18 / 24 |
| openapi-list-validated | 20 / 29 | 24 / 34 |
| openapi-post | 18 / 42 | 18 / 40 |
| openapi-post-validated | 18 / 41 | 19 / 41 |
| openapi-invalid | 16 / 20 | 24 / 31 |
