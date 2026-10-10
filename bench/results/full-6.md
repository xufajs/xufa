{"node":"v24.21.0","xufa":"0.1.0","fastify":"5.12.5","autocannon":"8.0.0","cpu":"13th Gen Intel(R) Core(TM) i7-13700H","cores":20,"platform":"win32 10.0.26200","date":"2026-10-10T12:55:23.135Z","options":{"duration":6,"warmup":2,"rounds":3,"connections":100,"pipelining":10,"workers":0}}

| Scenario | xufa req/s | fastify req/s | node req/s | xufa / fastify |
| --- | ---: | ---: | ---: | ---: |
| async | 44,347 | 43,312 | - | **1.02x** |
| big-json | 13,647 | 10,640 | 13,841 | **1.28x** |
| error | 19,608 ⚠12% | 19,843 ⚠13% | - | **0.99x** |
| headers | 50,069 | 47,765 | - | **1.05x** |
| hello-schema | 53,259 | 50,763 | 51,280 | **1.05x** |
| hello | 53,024 | 50,896 | 50,944 | **1.04x** |
| hooks | 50,304 | 50,512 | - | **1.00x** |
| many-routes | 51,765 | 51,397 | - | **1.01x** |
| not-found | 50,085 | 48,960 | - | **1.02x** |
| openapi-get | 49,483 | 50,752 | - | **0.97x** |
| openapi-invalid | 46,069 | 24,581 | - | **1.87x** |
| openapi-list-validated | 41,307 | 39,424 | - | **1.05x** |
| openapi-list | 46,811 | 45,163 | - | **1.04x** |
| openapi-post-validated | 36,869 | 35,968 | - | **1.03x** |
| openapi-post | 36,693 | 36,805 | - | **1.00x** |
| params | 50,811 | 49,792 | - | **1.02x** |
| plugins | 50,624 | 51,291 | - | **0.99x** |
| post-json | 37,856 | 35,568 | - | **1.06x** |
| post-validate | 36,704 | 33,879 | - | **1.08x** |
| query | 49,360 | 47,861 | - | **1.03x** |
| text | 53,445 | 52,080 | 50,928 | **1.03x** |

⚠ marks rounds spread more than 10% apart: the machine was busy, run again.

Server processor time per request (lower is better):

| Scenario | xufa µs/req | fastify µs/req | node µs/req | fastify / xufa |
| --- | ---: | ---: | ---: | ---: |
| async | 23.2 | 22.9 | - | **0.99x** |
| big-json | 76.7 | 96.2 | 73.2 | **1.25x** |
| error | 50.9 | 51.4 | - | **1.01x** |
| headers | 19.9 | 20.7 | - | **1.04x** |
| hello-schema | 18.9 | 19.6 | 19.5 | **1.04x** |
| hello | 18.9 | 19.4 | 19.7 | **1.03x** |
| hooks | 20.0 | 20.1 | - | **1.00x** |
| many-routes | 19.0 | 19.9 | - | **1.05x** |
| not-found | 20.1 | 20.3 | - | **1.01x** |
| openapi-get | 20.4 | 19.7 | - | **0.96x** |
| openapi-invalid | 22.0 | 40.8 | - | **1.85x** |
| openapi-list-validated | 24.3 | 25.4 | - | **1.05x** |
| openapi-list | 21.4 | 22.3 | - | **1.04x** |
| openapi-post-validated | 27.0 | 28.0 | - | **1.04x** |
| openapi-post | 27.3 | 27.2 | - | **1.00x** |
| params | 19.9 | 20.2 | - | **1.01x** |
| plugins | 19.8 | 19.2 | - | **0.97x** |
| post-json | 26.9 | 28.3 | - | **1.05x** |
| post-validate | 27.8 | 29.4 | - | **1.06x** |
| query | 19.9 | 20.6 | - | **1.03x** |
| text | 18.7 | 19.5 | 19.8 | **1.04x** |

| Scenario | xufa p50 / p99 ms | fastify p50 / p99 ms | node p50 / p99 ms |
| --- | ---: | ---: | ---: |
| async | 19 / 107 | 18 / 127 | - |
| big-json | 48 / 530 | 73 / 714 | 54 / 542 |
| error | 45 / 268 | 45 / 281 | - |
| headers | 17 / 79 | 16 / 114 | - |
| hello-schema | 16 / 74 | 14 / 93 | 15 / 89 |
| hello | 15 / 80 | 14 / 85 | 15 / 102 |
| hooks | 17 / 82 | 15 / 96 | - |
| many-routes | 15 / 82 | 14 / 97 | - |
| not-found | 15 / 107 | 16 / 120 | - |
| openapi-get | 14 / 102 | 14 / 95 | - |
| openapi-invalid | 18 / 137 | 39 / 134 | - |
| openapi-list-validated | 22 / 130 | 24 / 140 | - |
| openapi-list | 16 / 125 | 19 / 128 | - |
| openapi-post-validated | 25 / 118 | 26 / 78 | - |
| openapi-post | 26 / 123 | 26 / 109 | - |
| params | 15 / 94 | 15 / 100 | - |
| plugins | 16 / 91 | 15 / 91 | - |
| post-json | 24 / 127 | 27 / 87 | - |
| post-validate | 26 / 112 | 28 / 97 | - |
| query | 16 / 117 | 16 / 126 | - |
| text | 16 / 75 | 15 / 82 | 15 / 97 |
