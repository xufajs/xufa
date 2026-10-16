| Case | xufa (JS) msg/s | xufa + bufferutil msg/s | ws (JS) msg/s | ws + bufferutil msg/s | JS: xufa / ws | bufferutil: xufa / ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 46,276 | 45,852 | 45,601 | 45,574 | 1.01x | 1.01x |
| text 16 KB | 26,377 | 27,676 | 12,653 | 21,501 | 2.08x | 1.29x |
| binary 16 KB | 32,325 | 34,145 | 14,307 | 30,295 | 2.26x | 1.13x |
| binary 1 MB | 390 | 421 | 204 | 405 | 1.91x | 1.04x |
| text 16 KB, deflate | 7,422 | 7,373 | 7,408 | 7,307 | 1.00x | 1.01x |
| binary 1 MB, fragments | 339 | 361 | 182 | 352 | 1.86x | 1.03x |
| binary 256 KB, deflate | 161 | 159 | 150 | 160 | 1.07x | 0.99x |
