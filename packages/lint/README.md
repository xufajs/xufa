# @xufa/lint

A linter with ESLint's recommended rules and a formatter with prettier's output: ESLint 9.39.5's own code for the
rules and prettier 3.9.9's for formatting, ported as they are, run on TypeScript's parser. The rules pass ESLint's tests
of them; the formatter writes what prettier writes. Configs are ESLint's flat configs, in `xufa.lint.config.js`.

```sh
npm install --save-dev @xufa/lint typescript
```

```js
// xufa.lint.config.js
import { configs, globals } from '@xufa/lint';

export default [
  { ignores: ['dist/**'] },
  configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
];
```

```sh
npx xufa-lint            # the folder of the config
npx xufa-lint src --fix  # writes what rules fix
```

- **Rules:** the 60 of `@eslint/js`'s recommended set (all but `no-unexpected-multiline`, the formatter's concern),
  with their options, messages, fixes and suggestions. ESLint's 5,249 tests of them pass (32 more need another parser).
- **Parser:** TypeScript's, into the ESTree espree makes: the same tree, tokens and comments for every file of this
  repository and every test of the rules. Scope analysis, code paths, selectors and reports are ESLint's own.
- **Configs:** `files`, `ignores`, `languageOptions` (`ecmaVersion`, `sourceType`, `globals`, `parserOptions`),
  `linterOptions`, `rules`, `settings`, merged as ESLint merges them. `globals` has the environments of the package
  globals (`node`, `browser`, `commonjs`, `jest`, `vitest`, the ES versions...).
- **Comments:** `eslint-disable`, `-enable`, `-line`, `-next-line` (with `-- reasons`), `/* global */`,
  `/* exported */` and `/* eslint rule: setting */`. Disabling ESLint's other rules is not an error.
- **Output:** ESLint's `stylish` and `json`; exit code 1 with errors, 2 when it cannot run. `--max-warnings`,
  `--quiet`.

On this repository's 2,425 files with problems (ported tests included), it reports the same 40,779 problems ESLint
reports, in about two thirds of the time.

## Formatting

`npx xufa-format` lists the files that are not formatted; `npx xufa-format --write` formats them. JavaScript,
TypeScript, JSX, JSON and markdown (and its code blocks in those languages) are written as prettier 3.9.9 writes them:
its printers, ported as they are (`lib/prettier`), with its options in the `format` key of configs:

```js
{ format: { singleQuote: true, trailingComma: 'es5', printWidth: 120, ignores: ['vendor/**'] } }
```

On this repository it writes what prettier writes for its 3,222 files of JavaScript, TypeScript, JSON and markdown;
JSON5 and JSON with comments are formatted as prettier does too. It is faster than prettier in each language, on one
file as on many: `xufa-format --check` on the whole repository is about twice as fast as `prettier --check`, and
1.15 to 1.45 times on one file (bench/results/format-3.md). The formatter needs no TypeScript installed: it has its own
copy of TypeScript's parser (the linter reads with the project's TypeScript).
Not formatted: CSS, HTML, YAML and other languages, and embedded languages of JavaScript.

Not there: ESLint's other rules, plugins (but rules defined with `defineRule`), processors, caching and linting
TypeScript files.

Docs: [docs/lint](../../docs/lint/index.html). Licenses of the ported code: [NOTICE.md](NOTICE.md).

## License

MIT
