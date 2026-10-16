| Case | pino ops/s | @xufa/logger ops/s | xufa / pino |
| --- | ---: | ---: | ---: |
| message | 3,108,283 | 13,026,005 | 4.19x |
| message, child | 7,404,031 | 12,920,190 | 1.75x |
| object + message | 1,687,966 | 3,727,480 | 2.21x |
| printf | 1,589,512 | 3,076,285 | 1.94x |
| deep object | 1,194,227 | 1,691,416 | 1.42x |
| error | 610,382 | 768,287 | 1.26x |
| child + message | 3,590,384 | 5,042,725 | 1.40x |
| disabled level | 213,581,119 | 3,051,394,839 | 14.29x |
| disabled level, child | 3,081,260,280 | 3,078,648,575 | 1.00x |
