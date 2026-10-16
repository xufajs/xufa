{"node":"v24.21.0","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-14T13:34:37.657Z","options":{"duration":10,"warmup":3,"rounds":5,"connections":100,"pipelining":10,"workers":4}}

| Scenario | xufa req/s | fastify req/s | xufa / fastify |
| --- | ---: | ---: | ---: |
| plugins | 48,474 | 47,341 | **1.02x** |
| error | 20,418 | 20,261 ⚠13% | **1.01x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | fastify / xufa |
| --- | ---: | ---: | ---: |
| plugins | 20.2 | 20.9 | **1.04x** |
| error | 48.9 | 48.8 | **1.00x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms |
| --- | ---: | ---: |
| plugins | 17 / 123 | 17 / 128 |
| error | 43 / 293 | 44 / 298 |
