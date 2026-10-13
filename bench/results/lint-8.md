# The linter of @xufa/lint against ESLint 9.39.5 (lint-8)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/lint.js` (rounds 5), after
phase 7 of packages/lint/design/own-linter.md: ESLint's code path analysis (linter/code-path-analysis: 7 files)
replaced by @xufa/lint's own `lib/code-path` (segment.js, fork-context.js, state.js, code-path.js, analyzer.js), and
shared/assert.js's last use but one gone. `node bench/lint-code-path.js` finds no difference with ESLint's analysis
on 7,792 trees (every file of `--tests`, every case of the rules' tests, 78 written for each construct): 5,136,628
events (name, code path, segments, node), and at the end of each of the 114,752 code paths its fields and its 425,412
segments (links, reachable, used, looped) and the orders of traverseSegments (all, with skip, break, first, last).

| Files                  | Files |     KB | Problems | ESLint cold | xufa cold | speed | ESLint warm | xufa warm | speed |
| ---------------------- | ----: | -----: | -------: | ----------: | --------: | ----: | ----------: | --------: | ----: |
| The code               | 1,393 |  8,840 |        0 |    3,457 ms |  3,256 ms | 1.06x |    2,982 ms |  2,878 ms | 1.04x |
| With tests (`--tests`) | 2,484 | 15,297 |   36,540 |    5,680 ms |  5,486 ms | 1.04x |    5,168 ms |  5,104 ms | 1.01x |

As lint-7, within its noise: the analysis does what ESLint's does, and takes about what it took (lib/code-path 429 ms
of the profile's 11.2 s). The problems are the same in every file but the one of lint-1
(`packages/http/test/hooks.test.js:3132`).
