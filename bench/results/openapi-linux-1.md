{"node":"v22.21.1","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"linux 6.18.40.1-microsoft-standard-WSL2","date":"2026-10-06T18:47:28.995Z","options":{"duration":6,"warmup":2,"rounds":5,"connections":100,"pipelining":10}}

| Scenario | xufa req/s | fastify req/s | xufa / fastify |
| --- | ---: | ---: | ---: |
| openapi-get | 81,408 ⚠24% | 83,179 ⚠17% | **0.98x** |
| openapi-list | 71,317 | 61,429 | **1.16x** |
| openapi-list-validated | 57,392 | 50,171 | **1.14x** |
| openapi-post | 45,643 | 45,365 | **1.01x** |
| openapi-post-validated | 47,200 | 42,752 | **1.10x** |
| openapi-invalid | 70,429 | 45,003 | **1.57x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | fastify / xufa |
| --- | ---: | ---: | ---: |
| openapi-get | 12.5 | 12.3 | **0.98x** |
| openapi-list | 14.4 | 16.7 | **1.16x** |
| openapi-list-validated | 17.8 | 20.4 | **1.14x** |
| openapi-post | 22.8 | 22.9 | **1.00x** |
| openapi-post-validated | 22.0 | 24.3 | **1.10x** |
| openapi-invalid | 14.6 | 22.7 | **1.56x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms |
| --- | ---: | ---: |
| openapi-get | 13 / 17 | 13 / 18 |
| openapi-list | 15 / 19 | 18 / 23 |
| openapi-list-validated | 20 / 24 | 23 / 28 |
| openapi-post | 17 / 40 | 17 / 38 |
| openapi-post-validated | 17 / 39 | 19 / 42 |
| openapi-invalid | 15 / 20 | 25 / 37 |
