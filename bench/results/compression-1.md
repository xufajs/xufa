| Case | compression 1.8.2 | @xufa/http/compression | @xufa/http/compression / compression 1.8.2 |
| --- | ---: | ---: | ---: |
| JSON of 3 KB, brotli (responses/s) | 6,208 | 6,246 | 1.01x |
| JSON of 3 KB, gzip (responses/s) | 6,818 | 7,935 | 1.16x |
| JSON under the threshold (responses/s) | 272,494 | 302,354 | 1.11x |
| JSON, no encoding accepted (responses/s) | 130,199 | 134,735 | 1.03x |
