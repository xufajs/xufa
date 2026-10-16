| Case | JSON.stringify ops/s | fast-json-stringify ops/s | @xufa/serializer ops/s | xufa vs fjs | xufa vs JSON.stringify |
| --- | ---: | ---: | ---: | ---: | ---: |
| hello world | 6.98M | 5.73M | 5.50M | 0.96x | 0.79x |
| object, 6 props | 1.80M | 1.35M | 2.03M | 1.50x | 1.13x |
| array of 100 objects | 24.9K | 17.0K | 24.4K | 1.43x | 0.98x |
| required + nullable + date | 652.6K | 985.5K | 1.02M | 1.03x | 1.56x |
| long string with escapes | 345.9K | 335.7K | 334.6K | 1.00x | 0.97x |
| anyOf | 5.49M | 3.18M | 5.91M | 1.86x | 1.08x |
| recursive $ref tree | 2.86M | 2.53M | 3.43M | 1.35x | 1.20x |
