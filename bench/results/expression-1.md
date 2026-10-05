
Compiled once, then run (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 65.61M | 1.03M | 6.00M | 17.90M | 330.4k | 770.69M |
| member | 37.65M | 2.49M | 18.12M | 17.22M | 371.3k | 753.15M |
| condition | 66.84M | 686.0k | 2.28M | 15.30M | 267.1k | 738.76M |
| method call | 28.66M | – | – | – | 270.1k | 196.50M |
| map and reduce | 2.92M | – | – | – | 45.4k | 50.02M |
| template literal | 14.76M | – | – | – | 192.2k | 723.22M |

Compiled and run each time (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 741.2k | 70.2k | 663.8k | 104.3k | 3.6k | 1.66M |
| member | 781.3k | 81.9k | 238.4k | 109.9k | 3.7k | 1.60M |
| condition | 391.7k | 53.9k | 332.5k | 44.7k | 3.3k | 1.54M |
| method call | 573.7k | – | – | – | 3.6k | 1.47M |
| map and reduce | 147.1k | – | – | – | 2.7k | 1.30M |
| template literal | 377.3k | – | – | – | 3.7k | 1.56M |
