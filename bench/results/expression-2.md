
Compiled once, then run (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 64.44M | 1.02M | 5.72M | 18.82M | 326.1k | 746.26M |
| member | 67.49M | 2.43M | 17.48M | 16.97M | 350.4k | 720.50M |
| condition | 64.40M | 684.2k | 2.30M | 14.93M | 261.7k | 696.86M |
| method call | 28.24M | – | – | – | 261.0k | 183.57M |
| map and reduce | 2.97M | – | – | – | 46.5k | 51.52M |
| template literal | 14.73M | – | – | – | 192.1k | 714.76M |

Compiled and run each time (runs a second):

| Case | xufa | jexl | expr-eval | filtrex | sandboxjs | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| arithmetic | 703.5k | 67.5k | 638.8k | 99.5k | 3.5k | 1.61M |
| member | 642.2k | 79.5k | 228.7k | 104.7k | 3.6k | 1.55M |
| condition | 385.7k | 54.1k | 333.6k | 45.0k | 3.4k | 1.52M |
| method call | 545.2k | – | – | – | 3.5k | 1.48M |
| map and reduce | 137.1k | – | – | – | 2.6k | 1.23M |
| template literal | 359.6k | – | – | – | 3.5k | 1.48M |
