| Case | pino ops/s | @xufa/logger ops/s | xufa / pino |
| --- | ---: | ---: | ---: |
| message | 3,255,817 | 7,782,840 | 2.39x |
| message, child | 8,037,961 | 8,019,186 | 1.00x |
| object + message | 1,781,519 | 2,880,909 | 1.62x |
| printf | 1,927,450 | 2,992,759 | 1.55x |
| deep object | 1,108,763 | 1,548,118 | 1.40x |
| error | 411,804 | 445,349 | 1.08x |
| child + message | 3,601,977 | 3,767,226 | 1.05x |
| disabled level | 263,259,255 | 2,326,039,062 | 8.84x |
| disabled level, child | 2,328,412,010 | 2,350,757,686 | 1.01x |
