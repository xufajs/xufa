
| Case | Operation | @xufa/mongo | bson | speed of xufa (bson time / xufa time) |
| --- | --- | ---: | ---: | ---: |
| user document | deserialize | 1038 ns | 2138 ns | 2.06x |
| flat numbers | deserialize | 812 ns | 2507 ns | 3.09x |
| long strings | deserialize | 812 ns | 10.9 µs | 13.43x |
| non-ascii strings | deserialize | 594 ns | 1237 ns | 2.08x |
| reply of 1000 docs | deserialize | 1079.8 µs | 2114.9 µs | 1.96x |
| user document | serialize | 1817 ns | 1473 ns | 0.81x |
| flat numbers | serialize | 1777 ns | 1499 ns | 0.84x |
| long strings | serialize | 3744 ns | 2925 ns | 0.78x |
| non-ascii strings | serialize | 852 ns | 857 ns | 1.01x |
| reply of 1000 docs | serialize | 1945.9 µs | 1427.4 µs | 0.73x |
