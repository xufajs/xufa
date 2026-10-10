<!-- The frame pool of @xufa/websocket on Node.js 24.21.0 (Windows), where Buffer.poolSize is 64 KB, so
Buffer.allocUnsafe takes buffers up to 32 KB from the pool of Node.js. Three copies of @xufa/websocket, without
bufferutil: its frame pool from 4 KB as it is, Node's pool up to 32 KB (the frame pool above), and no frame pool;
and ws (JS). Messages echoed over the loopback, 64 in flight; best of 5 rounds of 2 s (the harness of
bench/micro/websocket.js with these libraries and sizes). Kept as it is: Node's pool loses 15% at 16 KB and 7% at
30 KB, and is even below 4 KB and above 32 KB. -->

| Case | pool from 4 KB (now) msg/s | Node pool to 32 KB msg/s | no frame pool msg/s | ws (JS) msg/s | Node pool to 32 KB / now | no pool / now | now / ws |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| text 64 B | 44,282 | 43,688 | 44,317 | 43,392 | 0.99x | 1.00x | 1.02x |
| binary 6 KB | 38,851 | 39,524 | 36,768 | 26,480 | 1.02x | 0.95x | 1.47x |
| text 16 KB | 27,454 | 22,930 | 22,382 | 12,171 | 0.84x | 0.82x | 2.26x |
| binary 16 KB | 34,563 | 29,342 | 29,214 | 14,069 | 0.85x | 0.85x | 2.46x |
| binary 30 KB | 17,450 | 16,280 | 16,229 | 7,442 | 0.93x | 0.93x | 2.34x |
| binary 64 KB | 8,106 | 8,322 | 6,915 | 3,072 | 1.03x | 0.85x | 2.64x |
| binary 1 MB | 392 | 390 | 375 | 190 | 0.99x | 0.96x | 2.07x |
