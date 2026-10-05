
Compiled once, then run (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 111.57M | 973.8k | 5.65M | 17.43M | 322.6k | 741.96M |
| member | 65.67M | 2.41M | 17.40M | 16.49M | 349.1k | 709.00M |
| condition | 110.32M | 673.3k | 2.31M | 14.78M | 260.4k | 718.13M |
| method call | 24.37M | – | – | – | 259.9k | 187.72M |
| map and reduce | 30.53M | – | – | – | 46.3k | 49.67M |
| template literal | 41.52M | – | – | – | 181.0k | 702.09M |

Compiled and run each time (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 687.2k | 66.6k | 634.0k | 98.4k | 3.6k | 1.61M |
| member | 646.9k | 77.1k | 230.1k | 109.0k | 3.6k | 1.59M |
| condition | 374.8k | 53.9k | 315.1k | 44.2k | 3.3k | 1.49M |
| method call | 542.9k | – | – | – | 3.5k | 1.48M |
| map and reduce | 142.3k | – | – | – | 2.6k | 1.25M |
| template literal | 354.0k | – | – | – | 3.4k | 1.49M |
