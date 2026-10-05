| Case | find-my-way find ops/s | xufa find ops/s | xufa match ops/s | find vs fmw | match vs fmw |
| --- | ---: | ---: | ---: | ---: | ---: |
| static / | 50.08M | 38.55M | 47.69M | 0.77x | 0.95x |
| static deep | 5.88M | 13.86M | 15.23M | 2.36x | 2.59x |
| one param | 7.67M | 6.96M | 6.83M | 0.91x | 0.89x |
| two params | 4.14M | 3.94M | 4.01M | 0.95x | 0.97x |
| wildcard | 6.35M | 5.90M | 5.84M | 0.93x | 0.92x |
| multi param | 5.55M | 4.86M | 4.95M | 0.88x | 0.89x |
| regex param | 7.51M | 6.29M | 7.14M | 0.84x | 0.95x |
| with query | 2.17M | 1.63M | 4.72M | 0.75x | 2.17x |
| encoded param | 1.66M | 1.61M | 1.61M | 0.97x | 0.97x |
| not found | 16.77M | 15.79M | 15.53M | 0.94x | 0.93x |
