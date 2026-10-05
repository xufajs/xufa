| Case | xufa (JS) msg/s | xufa + bufferutil msg/s | ws (JS) msg/s | ws + bufferutil msg/s | JS: xufa / ws | bufferutil: xufa / ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 46,590 | 46,483 | 45,957 | 45,760 | 1.01x | 1.02x |
| text 16 KB | 33,428 | 36,256 | 14,713 | 27,330 | 2.27x | 1.33x |
| binary 16 KB | 37,439 | 39,177 | 14,655 | 28,787 | 2.55x | 1.36x |
| binary 1 MB | 499 | 535 | 233 | 527 | 2.15x | 1.01x |
| text 16 KB, deflate | 7,659 | 7,687 | 7,624 | 7,661 | 1.00x | 1.00x |
| binary 1 MB, fragments | 456 | 500 | 223 | 482 | 2.05x | 1.04x |
| binary 256 KB, deflate | 149 | 149 | 142 | 151 | 1.05x | 0.99x |
