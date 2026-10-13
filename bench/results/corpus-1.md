# @xufa/lint against prettier and ESLint on code written by others (corpus-1)

2026-10-13, step C2 of packages/lint/design/refactor.md: bench/corpus.js takes, of each of the 732 packages installed
for the repository (node_modules/.pnpm), at most 8 files of each kind (not minified, 200 bytes to 200 KB, each text
once): 2,407 of JavaScript, 192 of TypeScript, 931 declarations, 942 of markdown, 833 of JSON (5,305 files).

**The formatter** (`node bench/format-corpus.js`), against prettier 3.9.9, with the repository's options and with
prettier's defaults (10,610 outputs): 10,545 the same. It found three faults, fixed:

- JSON with comments in an object (tsconfig.json, 14 outputs) threw `Missing visitor keys for 'ObjectProperty'`: the
  visitor keys of the formatter had no nodes of Babel's tree, which parse/json.js makes, through which comments are
  attached (lib/prettier/src/language-js/traverse/visitor-keys.evaluate.js).
- package.json was `JSON.stringify(JSON.parse(text))`: `15.0` became `15`, `"\/"` became `"/"`, a key given twice
  once, and single quotes, `+1`, `.5`, `0x10`, keys without quotes threw. It is prettier's json-stringify now: the tree
  of parse/json.js, written in JSON.stringify's layout, numbers and double-quoted strings as they are
  (lib/prettier/format.js: stringifyJson).
- Code blocks of markdown in markdown were left as they are; prettier formats them, and so does @xufa/lint now
  (lib/prettier/embedded.js).

The 65 outputs left differ by design, and are the baseline (bench/corpus-baseline.json): code blocks of HTML (45) and
YAML (3) and front matter of YAML (3), which prettier formats and @xufa/lint does not; and 14 of JavaScript in markdown
that prettier's Babel parser does not take (TypeScript's annotations tagged `js`, which Babel reads as Flow or rejects;
placeholders such as `<func>`; `for (async of [])`), where it leaves the block as it is, and @xufa/lint, on
TypeScript's parser, formats it.

**The linter** (`node bench/lint-corpus.js`), against ESLint 9.39.5, with the recommended rules, Node's globals and the
source type of each file (by its extension or its package's "type"; the other when neither parses it): 2,401 of the
2,407 files have the same problems (5,441 of ESLint's), all files parse. The 6 left are the baseline: comments that
turn on rules that are not in @xufa/lint (`no-param-reassign`, `no-invalid-this`, `complexity`, `consistent-return`,
`operator-linebreak`).

Both scripts exit 1 on an output or a file not in the baseline; `--save` writes what differs as the new baseline.
