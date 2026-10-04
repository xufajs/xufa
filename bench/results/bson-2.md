
| Case | Operation | @xufa/mongo | bson | speed of xufa (bson time / xufa time) |
| --- | --- | ---: | ---: | ---: |
| user document | deserialize | 1017 ns | 2123 ns | 2.09x |
| flat numbers | deserialize | 786 ns | 2410 ns | 3.07x |
| long strings | deserialize | 787 ns | 10.5 µs | 13.39x |
| non-ascii strings | deserialize | 557 ns | 1153 ns | 2.07x |
| reply of 1000 docs | deserialize | 1035.0 µs | 2054.0 µs | 1.98x |
| user document | serialize | 914 ns | 1406 ns | 1.54x |
| flat numbers | serialize | 1022 ns | 1444 ns | 1.41x |
| long strings | serialize | 2672 ns | 2864 ns | 1.07x |
| non-ascii strings | serialize | 536 ns | 807 ns | 1.51x |
| reply of 1000 docs | serialize | 878.3 µs | 1364.2 µs | 1.55x |
