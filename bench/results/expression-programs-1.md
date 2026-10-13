Compiled once, then run (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 9.78M | 92.6k | 39.33M | 44.95M |
| switch | 17.89M | 112.4k | 124.49M | 340.72M |
| for...of (4 turns) | 4.87M | 26.2k | 14.97M | 107.38M |
| for (100 turns) | 388.7k | 3.4k | 15.22M | 16.04M |
| function and while | 2.11M | 29.9k | 57.84M | 76.86M |
| object built | 2.26M | 27.0k | 5.19M | 6.68M |
| try / throw | 153.9k | 38.1k | 229.9k | 174.3k |

Compiled and run each time (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 96.1k | 2.5k | 698.3k | 1.09M |
| switch | 118.9k | 2.9k | 705.0k | 1.11M |
| for...of (4 turns) | 116.6k | 2.5k | 577.8k | 1.21M |
| for (100 turns) | 84.1k | 1.6k | 440.5k | 1.15M |
| function and while | 90.3k | 2.5k | 569.6k | 1.11M |
| object built | 100.7k | 2.5k | 461.2k | 966.1k |
| try / throw | 64.8k | 2.5k | 208.7k | 149.8k |
