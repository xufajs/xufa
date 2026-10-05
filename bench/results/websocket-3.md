| Case | xufa (JS) msg/s | xufa + bufferutil msg/s | ws (JS) msg/s | ws + bufferutil msg/s | JS: xufa / ws | bufferutil: xufa / ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 45,639 | 46,318 | 45,792 | 45,056 | 1.00x | 1.03x |
| text 16 KB | 29,371 | 32,509 | 14,067 | 26,964 | 2.09x | 1.21x |
| binary 16 KB | 37,360 | 40,739 | 15,191 | 31,397 | 2.46x | 1.30x |
| binary 1 MB | 518 | 544 | 236 | 557 | 2.19x | 0.98x |
| text 16 KB, deflate | 7,402 | 7,478 | 7,303 | 7,187 | 1.01x | 1.04x |
