| Case | JSON.stringify ops/s | fast-json-stringify ops/s | @xufa/serializer ops/s | xufa vs fjs | xufa vs JSON.stringify |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello world | 8.08M | 10.87M | 10.53M | 0.97x | 1.30x |
| object, 6 props | 1.61M | 1.50M | 2.54M | 1.69x | 1.58x |
| array of 100 objects | 20.1K | 10.2K | 24.2K | 2.39x | 1.21x |
| required + nullable + date | 617.6K | 1.03M | 1.05M | 1.02x | 1.69x |
| long string with escapes | 228.3K | 210.6K | 208.2K | 0.99x | 0.91x |
| anyOf | 4.25M | 4.35M | 9.65M | 2.22x | 2.27x |
| recursive $ref tree | 2.46M | 2.85M | 3.62M | 1.27x | 1.47x |
