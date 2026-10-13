Compiled once, then run (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 138.38M | 1.09M | 5.49M | 18.28M | 235.7k | 391.67M |
| member | 140.03M | 2.65M | 16.71M | 15.37M | 263.5k | 502.06M |
| condition | 131.47M | 752.0k | 2.20M | 14.18M | 204.7k | 413.90M |
| method call | 25.91M | – | – | – | 208.5k | 29.33M |
| map and reduce | 37.39M | – | – | – | 43.8k | 52.35M |
| template literal | 49.79M | – | – | – | 156.4k | 60.60M |

Compiled and run each time (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 706.4k | 84.1k | 656.5k | 105.6k | 4.6k | 1.58M |
| member | 734.3k | 94.7k | 251.6k | 112.5k | 4.5k | 1.48M |
| condition | 372.3k | 63.4k | 345.2k | 48.1k | 4.3k | 1.47M |
| method call | 671.2k | – | – | – | 4.5k | 1.41M |
| map and reduce | 178.7k | – | – | – | 3.1k | 1.22M |
| template literal | 432.9k | – | – | – | 4.5k | 1.42M |
