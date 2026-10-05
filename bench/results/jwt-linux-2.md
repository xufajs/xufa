| Case | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| --- | ---: | ---: | ---: |
| HS256 sign | 50,333 | 190,018 | 3.78x |
| HS256 verify | 42,095 | 173,407 | 4.12x |
| HS256 decode | 329,705 | 440,447 | 1.34x |
| RS256 sign | 1,095 | 1,788 | 1.63x |
| RS256 verify | 22,211 | 38,025 | 1.71x |
| RS256 verify, KeyObject | 36,709 | 37,537 | 1.02x |
| ES256 sign | 13,049 | 33,934 | 2.60x |
| ES256 verify | 9,028 | 13,077 | 1.45x |
| EdDSA sign | n/a | 27,347 | n/a |
| EdDSA verify | n/a | 10,098 | n/a |
