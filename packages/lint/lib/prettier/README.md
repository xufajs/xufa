# The formatter of @xufa/lint

prettier 3.9.9's way of formatting, as @xufa/lint's own code (ES modules): it writes what prettier writes, and is
checked against prettier itself (below). It was ported from prettier's sources and the packages they used, and is
edited here since: nothing is copied from those projects any more.

- `format.js`: the driver (options, the parser of each language, doc to text), and `embedded.js` (code blocks of
  markdown formatted by it).
- `src/`: prettier's printers of JavaScript, TypeScript, JSON and markdown, its comments, its docs and their printer.
  Development checks (prettier's builds define them away) are out of it; `utilities/` has what were small packages
  (string width and its Unicode data, docblocks, newlines).
- `parse/json.js`: JSON, JSON5 and JSON with comments, into the tree prettier's json parsers have from Babel (its
  check too): formatting JSON loads no TypeScript.
- `parse/typescript.cjs`: TypeScript's parser, what it needs of typescript.js (TypeScript 6.0.3, 973 KB of 8.9 MB),
  built by `scripts/build-typescript.mjs` (`--check` says whether it is the build of the installed TypeScript). It
  loads in a fifth of TypeScript's time, and the formatter needs no TypeScript installed.
- `parse/typescript-estree/`: TypeScript's tree as ESTree (typescript-estree 8.70.0's converter, made ES modules,
  without its programs and projects). JavaScript gets Babel's parentheses (prettier formats it with Babel), and
  locations are made only when asked for.
- `src/language-markdown/parser/`: micromark and mdast-util-from-markdown with the extensions prettier uses (GFM,
  math, wiki links), what parsing takes of them: their HTML output, katex and markdown writing are left out.

Not formatted: CSS, HTML, YAML and other languages, and the embedded languages of JavaScript (` css`...` `).

## Checked against prettier

`node bench/format.js` formats the files of this repository that `xufa-format` formats with this formatter and with
prettier 3.9.9 (a dev dependency of bench/), compares every output, and measures both (load, a cold pass, warm
passes). On this repository (1,594 files): the same output for every file; faster than prettier in each language,
warm (1.3 to 1.8 times on JavaScript, 1.9 to 3.4 on TypeScript, 3.4 to 3.6 on JSON, 1.35 to 2.3 on markdown) and on
the first pass; `xufa-format --check` on all of it about twice as fast as `prettier --check`, and 1.15 to 1.45 times
on one file. bench/results/format-1.md to format-4.md have the numbers and what made it faster.

## What @xufa/lint loads

`dist/format.mjs`, built by `scripts/build-format.mjs` (`--check` says whether it is up to date): this folder as one
ES module, by @xufa/bundle's scope hoisting (`format: 'esm'`). Loading one file instead of some 260 halves what a
command on a few files takes, and modules reading what they import as their own variables keeps it as fast as the
modules themselves (a bundle of CommonJS modules was a third slower: its imports were reads of properties).

The licenses of what it comes from are in [NOTICE.md](../../NOTICE.md).
