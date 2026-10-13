# The commands of @xufa/lint against eslint and prettier, as they are run (commands-1)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, 14 cores, Node.js 22.22), `node bench/commands.js`
(the median of 3 runs, after one that fills the compile caches), after step A1 of packages/lint/design/refactor.md:
`xufa-lint`, `xufa-format` and `xufa-check` give the files to workers (lib/parallel.js: up to 4 child processes, each
loading the config from its file; `--concurrency n|auto|off`), the largest first, a few at a time, the results in the
order of the files. ESLint 9.39.5 with the repository's config (as bench/lint.js makes it), prettier 3.9.9 with its
format options, on the files xufa-format formats (1,727).

| Command                                 |      ms | the original's command is |
| --------------------------------------- | ------: | ------------------------- |
| `eslint`                                |   3,837 |                           |
| `eslint --concurrency auto`             |   1,776 |                           |
| `xufa-lint --concurrency off`           |   3,300 |                           |
| `xufa-lint`                             | **1,412** | 2.72x (`eslint`), 1.26x (`--concurrency auto`) |
| `prettier --check`                      |   7,052 |                           |
| `xufa-format --check --concurrency off` |   4,133 |                           |
| `xufa-format --check`                   | **2,291** | 3.08x                     |
| `xufa-check --concurrency off`          |   7,041 |                           |
| `xufa-check`                            | **3,465** | 3.14x (`eslint` + `prettier --check`, 10,889 ms) |

Workers are child processes: threads share V8's threads of compiling and collecting, and each of 4 threads took 1.71
s for its quarter of the files to lint, against 1.30 s for processes. More than 4 are slower here: each compiles the
code again (0.4 s of a worker's time, 1.7 s each when 8 compete), and they share the memory (4 workers 1.43 s, 6
1.42, 8 1.59, 10 1.79 to lint; 2.2, 2.6, 2.9 and 3.2 s to format). A worker starts in about 0.1 s: below 24 files for
each, the files are linted in the command's process.
