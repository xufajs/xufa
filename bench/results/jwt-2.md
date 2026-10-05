| Case | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| --- | ---: | ---: | ---: |
| HS256 sign | 36,108 | 163,734 | 4.53x |
| HS256 verify | 29,784 | 148,351 | 4.98x |
| HS256 decode | 286,184 | 398,189 | 1.39x |
| RS256 sign | 1,029 | 1,766 | 1.72x |
| RS256 verify | 17,478 | 35,945 | 2.06x |
| RS256 verify, KeyObject | 35,549 | 36,278 | 1.02x |
| ES256 sign | 10,911 | 31,912 | 2.92x |
| ES256 verify | 8,478 | 13,442 | 1.59x |
| EdDSA sign | n/a | 25,127 | n/a |
| EdDSA verify | n/a | 10,123 | n/a |
