| Case | jsonwebtoken ops/s | @xufa/jwt ops/s | xufa / jsonwebtoken |
| --- | ---: | ---: | ---: |
| HS256 sign | 34,210 | 151,409 | 4.43x |
| HS256 verify | 26,734 | 122,015 | 4.56x |
| HS256 decode | 287,588 | 275,999 | 0.96x |
| RS256 sign | 1,067 | 1,824 | 1.71x |
| RS256 verify | 18,306 | 35,556 | 1.94x |
| RS256 verify, KeyObject | 35,303 | 35,399 | 1.00x |
| ES256 sign | 10,629 | 30,374 | 2.86x |
| ES256 verify | 8,153 | 13,292 | 1.63x |
| EdDSA sign | n/a | 24,655 | n/a |
| EdDSA verify | n/a | 9,644 | n/a |
