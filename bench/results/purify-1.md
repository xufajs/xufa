| Case | DOMPurify 3.3.3 + jsdom 27.4.0 | @xufa/purify | @xufa/purify / DOMPurify 3.3.3 + jsdom 27.4.0 |
| --- | ---: | ---: | ---: |
| the first call: loaded and one text sanitized (ms) | 1,022 | 68.14 | 15.01x |
| an error text (60 characters) (calls/s) | 871 | 77,361 | 88.83x |
| a message of 1 KB (calls/s) | 562 | 6,332 | 11.28x |
| a message of 10 KB (calls/s) | 36.45 | 484 | 13.27x |
