| Case | pino ops/s | @xufa/logger ops/s | xufa / pino |
| --- | ---: | ---: | ---: |
| message | 2,893,906 | 6,528,935 | 2.26x |
| object + message | 1,653,259 | 2,384,580 | 1.44x |
| printf | 1,791,915 | 2,449,070 | 1.37x |
| deep object | 726,242 | 892,120 | 1.23x |
| error | 237,072 | 286,782 | 1.21x |
| child + message | 1,099,668 | 1,470,664 | 1.34x |
| disabled level | 82,630,970 | 51,367,224 | 0.62x |
