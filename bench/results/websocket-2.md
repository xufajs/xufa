| Case | xufa (JS) msg/s | xufa + bufferutil msg/s | ws (JS) msg/s | ws + bufferutil msg/s | JS: xufa / ws | bufferutil: xufa / ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 40,902 | 42,863 | 39,363 | 40,577 | 1.04x | 1.06x |
| text 16 KB | 25,167 | 25,648 | 14,284 | 26,627 | 1.76x | 0.96x |
| binary 16 KB | 33,191 | 29,225 | 15,341 | 29,420 | 2.16x | 0.99x |
| binary 1 MB | 468 | 521 | 232 | 521 | 2.02x | 1.00x |
| text 16 KB, deflate | 7,835 | 7,774 | 7,622 | 7,567 | 1.03x | 1.03x |
