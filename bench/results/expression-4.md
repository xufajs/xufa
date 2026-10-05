
Compiled once, then run (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 131.10M | 1.04M | 5.75M | 18.58M | 306.9k | 379.19M |
| member | 130.00M | 2.47M | 16.77M | 15.52M | 347.0k | 394.42M |
| condition | 123.61M | 650.6k | 2.23M | 14.43M | 252.5k | 385.40M |
| method call | 24.77M | – | – | – | 251.8k | 26.69M |
| map and reduce | 32.88M | – | – | – | 45.7k | 46.91M |
| template literal | 43.23M | – | – | – | 191.7k | 58.05M |

Compiled and run each time (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 725.2k | 68.2k | 644.4k | 102.2k | 3.6k | 1.63M |
| member | 603.3k | 77.8k | 224.3k | 105.0k | 3.5k | 1.54M |
| condition | 384.3k | 54.1k | 326.0k | 44.7k | 3.3k | 1.48M |
| method call | 540.9k | – | – | – | 3.5k | 1.41M |
| map and reduce | 139.9k | – | – | – | 2.6k | 1.18M |
| template literal | 341.8k | – | – | – | 3.4k | 1.45M |
