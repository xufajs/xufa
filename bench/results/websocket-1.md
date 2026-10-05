| Case | xufa msg/s | ws (JS) msg/s | ws + bufferutil msg/s | xufa / ws (JS) | xufa / ws + bufferutil |
| --- | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 43,948 | 42,832 | 43,314 | 1.03x | 1.01x |
| text 16 KB | 23,602 | 13,037 | 24,058 | 1.81x | 0.98x |
| binary 16 KB | 29,627 | 13,997 | 26,927 | 2.12x | 1.10x |
| binary 1 MB | 435 | 223 | 478 | 1.95x | 0.91x |
| text 16 KB, deflate | 7,139 | 6,964 | 7,088 | 1.03x | 1.01x |
