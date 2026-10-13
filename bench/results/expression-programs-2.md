Compiled once, then run (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 41.87M | 109.6k | 42.84M | 50.13M |
| switch | 136.32M | 152.9k | 147.83M | 382.02M |
| for...of (4 turns) | 69.20M | 33.2k | 17.88M | 119.62M |
| for (100 turns) | 8.09M | 3.9k | 16.44M | 17.45M |
| function and while | 41.57M | 32.2k | 63.57M | 86.56M |
| object built | 4.28M | 30.8k | 5.45M | 7.19M |
| try / throw | 229.3k | 42.6k | 235.2k | 188.2k |

Compiled and run each time (runs a second):

| Case | xufa | sandboxjs | node:vm (no sandbox) | new Function (no sandbox) |
| --- | ---: | ---: | ---: | ---: |
| if / else if | 98.1k | 2.5k | 715.3k | 1.10M |
| switch | 131.5k | 3.1k | 743.3k | 1.17M |
| for...of (4 turns) | 123.7k | 2.8k | 605.3k | 1.25M |
| for (100 turns) | 89.7k | 1.6k | 488.0k | 1.22M |
| function and while | 97.2k | 2.6k | 598.7k | 1.16M |
| object built | 106.5k | 2.7k | 496.7k | 1.05M |
| try / throw | 70.4k | 2.7k | 220.2k | 158.2k |
