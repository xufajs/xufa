Compiled once, then run (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 44.45M | 106.9k | 44.04M | 51.47M |
| switch | 133.93M | 144.4k | 145.57M | 373.06M |
| for...of (4 turns) | 65.52M | 30.3k | 16.25M | 112.70M |
| for (100 turns) | 7.95M | 3.8k | 16.08M | 17.29M |
| function and while | 42.29M | 34.8k | 67.54M | 87.73M |
| object built | 4.36M | 31.2k | 5.67M | 7.26M |
| try / throw | 234.2k | 43.5k | 232.5k | 198.0k |

Compiled and run each time (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 120.2k | 2.8k | 736.8k | 1.16M |
| switch | 142.3k | 3.1k | 751.9k | 1.18M |
| for...of (4 turns) | 136.6k | 2.7k | 600.8k | 1.25M |
| for (100 turns) | 97.5k | 1.7k | 490.8k | 1.23M |
| function and while | 98.3k | 2.6k | 587.0k | 1.15M |
| object built | 125.9k | 2.7k | 490.9k | 1.03M |
| try / throw | 76.3k | 2.7k | 218.5k | 168.2k |
