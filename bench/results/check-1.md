# xufa-check against xufa-lint and xufa-format --check, and against eslint and prettier --check (check-1)

2026-10-13, the machine of lint-1 (macOS 15.7, Apple M4 Max, Node.js 22.22), `node bench/check.js` (rounds 5), after
phase 11 of packages/lint/design/own-linter.md: @xufa/lint has one copy of TypeScript's parser (lib/typescript, which
the formatter's bundle imports and the linter reads code with), and `xufa-check` lints and formats each file in one
process, the formatter taking the SourceFile the linter made of the same text (lib/typescript/index.js;
`node bench/lint-shared-parse.js`: 1,324 of the 1,437 files formatted and linted share it, with the problems and the
output of each alone). Each tool runs in a process of its own; two commands are two processes, their loads and
passes added. 1,470 files linted, 1,722 formatted (1,752 files); no problems, every file formatted.

| Commands                          |  Cold |  Warm | xufa-check is |
| --------------------------------- | ----: | ----: | ------------- |
| `eslint` + `prettier --check`     | 9,682 | 8,258 | 1.28x, 1.36x  |
| `xufa-lint` + `xufa-format --check` | 7,517 | 5,989 | 1.00x, 0.98x  |
| `xufa-check`                      | 7,548 | 6,093 |               |

(milliseconds; a run before gave 1.39x and 1.37x, and 1.05x and 1.02x)

One parse is not what the design expected (20 to 30% less): in one process, linting then formatting the 1,441 files
of JavaScript both read takes 5,186 ms a pass with the SourceFile shared and 5,474 ms without (5% less), and two
commands in one process give that back. TypeScript's parser is little of the work (0.42 s for the 2,558 files of
`--tests`); the profile of xufa-check (8.2 s): the formatter 3.4 s (its converter and its printing), garbage
collection 1.1 s, TypeScript's parser 1.1 s, the linter's converter 1.0 s, the rest of the linter 1.2 s. One converter
for both would save at most one of the two conversions (about 1 s of 7.5 s, less what both trees need of it).

The linter alone, with the parents of TypeScript's tree set by a walk of its own (TypeScript's way: 571 ms against 484
ms on those files) and the copy of TypeScript's parser (loaded in 33 ms, 80 before): `node bench/lint.js` 1.22x cold
and 1.24x warm, 396 MB against ESLint's 437; `--tests` 1.18x and 1.19x.
