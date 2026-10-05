| Case | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| --- | ---: | ---: | ---: |
| HS256 sign | 47,409 | 181,517 | 3.83x |
| HS256 verify | 39,582 | 142,638 | 3.60x |
| HS256 decode | 313,485 | 299,589 | 0.96x |
| RS256 sign | 1,039 | 1,670 | 1.61x |
| RS256 verify | 20,637 | 35,132 | 1.70x |
| RS256 verify, KeyObject | 35,651 | 34,949 | 0.98x |
| ES256 sign | 12,874 | 33,531 | 2.60x |
| ES256 verify | 9,014 | 13,092 | 1.45x |
| EdDSA sign | n/a | 27,363 | n/a |
| EdDSA verify | n/a | 10,113 | n/a |
