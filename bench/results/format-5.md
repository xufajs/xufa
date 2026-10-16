# The formatter of @xufa/lint: what the parsers never make, out (format-5, refactor step C1)

2026-10-13, Windows 11, Intel Core i7-13700H, Node.js 24.21. Step C1 of packages/lint/design/refactor.md: the code of
the formatter for syntax its parsers can never produce, out. Reachable are the node types of typescript-estree's
converter (parse/typescript-estree/node-types.js), those of the JSON parser (Babel's StringLiteral, NumericLiteral,
BooleanLiteral, NullLiteral, BigIntLiteral, ObjectProperty, CommentBlock, CommentLine; JsonRoot) and
ParenthesizedExpression; the parsers format() runs are babel, typescript, json, json5, jsonc, json-stringify and
markdown. Every removal is code no input can reach, by those two lists; coverage only pointed at candidates.

| | before | after |
| --- | ---: | ---: |
| lib/prettier/src, lines | 44,023 | 40,244 |
| lib/prettier/parse, lines | 5,141 | 4,948 |
| modules of lib/prettier/src | 392 | 369 |
| dist/format.mjs | 1,284 KB | 1,199 KB |
| lib/typescript/typescript.cjs | 976 KB | 976 KB (the parsers still use what they used) |

3,972 lines out (8%).

## What went, in order

1. The printers and helpers of Flow, of Hermes' match, components and hooks, of Angular and of Vue and HTML
   bindings (print/flow.js, match.js, component.js, hook.js, opaque-type.js, angular.js, html-binding.js,
   js-doc-type.js, utilities/is-flow-keyword-type.js, vue-event-binding.js, has-node.js), massage-ast (both: prettier's
   check of its own output, which nothing here calls) and the cleaning of front matter for it.
2. A codemod: case labels of switches on a node's type, and names in lists of types (createTypeCheckFunction(),
   Sets), of unreachable types: 106 labels and 101 names in 22 files. A case whose labels were all unreachable went
   whole only when the case before it cannot fall into it.
3. A simplifier: `X.type === 'Unreachable'` is false (!== true), so are options.parser compared with a parser never
   run (mdx, Vue's, Angular's) and calls of checks of unreachable types only, of functions that return false, and of
   path.match() with a predicate that is always false; then what those constants make of their conditions, as
   JavaScript evaluates them (`false && e` is false; `e && false` is false only when e is a pure check;
   `e || false` is e only where a value is a condition). About 400 edits; the 172 mentions of unreachable types left
   after step 2 went to 0.
4. What lint then showed unused, and the exports nothing imports, until none was left: the Flow printers left in
   enum.js and mapped-type.js, the regular expressions of YAML, GraphQL, HTML and markdown pragmas, prettier's
   options and common options, the tokens of typescript-estree's converter (nothing asks for them), debug.js.
5. Markdown's legacy printing (MDX only): markAlignedListLegacy, printListLegacy, printWordLegacy,
   splitTextIntoSentencesLegacy, restoreUnescapedCharacter, validateImportExport...
6. The walk of prettier's postprocessing: the converter always lists the nodes it changes (format-4), so the walk
   was never taken (postprocess/visit-node.js).

## Checks (each step, and at the end)

- The repository against prettier 3.9.9 (`node bench/format.js`): the same output in all four languages.
- The corpus of third-party files (`node bench/format-corpus.js`, 5,888 files with two sets of options): 65 known
  differences, 0 new. (`node bench/lint-corpus.js`: 6 known, 0 new.)
- The format and check tests: 18 of 18; @xufa/lint's tests: 5,364 passed, 32 skipped; `pnpm check` and
  `pnpm build:check` clean.

Speed, against the bundle before C1 (alternating processes, best and median of the warm rounds): JavaScript 1.00x and
1.03x, TypeScript 0.96x and 1.08x, markdown 1.02x and 1.00x: the same, as expected of code that never ran.

## Also fixed on Windows

The checks of the linter and the formatter imported paths (`import(path.join(...))`), which Node.js refuses on
Windows: they import file URLs now (13 files of bench/). The keys of bench/format-corpus.js and lint-corpus.js use /
on every system, as the baseline does. The baseline knows yargs-parser@20.2.9's README too: it is byte for byte the one
of yargs-parser@22.0.0 the baseline had, installed here in both versions.
