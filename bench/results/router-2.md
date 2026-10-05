| Case | find-my-way find ops/s | xufa find ops/s | xufa match ops/s | find vs fmw | match vs fmw |
| --- | ---: | ---: | ---: | ---: | ---: |
| static / | 52.11M | 108.12M | 57.84M | 2.07x | 1.11x |
| static deep | 6.66M | 14.40M | 15.76M | 2.16x | 2.36x |
| one param | 7.85M | 10.84M | 10.64M | 1.38x | 1.36x |
| two params | 4.47M | 7.15M | 7.48M | 1.60x | 1.67x |
| wildcard | 7.10M | 9.74M | 9.74M | 1.37x | 1.37x |
| multi param | 5.89M | 6.39M | 6.75M | 1.09x | 1.15x |
| regex param | 8.01M | 9.19M | 10.03M | 1.15x | 1.25x |
| with query | 2.36M | 2.49M | 6.50M | 1.06x | 2.76x |
| encoded param | 1.84M | 1.95M | 1.93M | 1.06x | 1.05x |
| not found | 17.39M | 18.71M | 19.26M | 1.08x | 1.11x |
