
| Case | Operation | @xufa/mongo | bson | speed of xufa (bson time / xufa time) |
| --- | --- | ---: | ---: | ---: |
| user document | deserialize | 860 ns | 2072 ns | 2.41x |
| flat numbers | deserialize | 638 ns | 2348 ns | 3.68x |
| long strings | deserialize | 772 ns | 10.3 µs | 13.37x |
| non-ascii strings | deserialize | 516 ns | 1111 ns | 2.15x |
| reply of 1000 docs | deserialize | 851.8 µs | 2006.8 µs | 2.36x |
| user document | serialize | 705 ns | 1394 ns | 1.98x |
| flat numbers | serialize | 728 ns | 1397 ns | 1.92x |
| long strings | serialize | 2384 ns | 2787 ns | 1.17x |
| non-ascii strings | serialize | 428 ns | 869 ns | 2.03x |
| reply of 1000 docs | serialize | 696.0 µs | 1397.7 µs | 2.01x |
