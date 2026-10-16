# @xufa/lint

A linter with ESLint's recommended rules and a formatter with prettier's output, on TypeScript's parser (its own copy:
TypeScript need not be installed): the linter is @xufa/lint's own code, reporting what ESLint 9.39.5 reports, and the
formatter is prettier 3.9.9's, ported. The rules pass ESLint's tests of them; the formatter writes what prettier writes.
Configs are ESLint's flat configs, in `xufa.lint.config.js`. A project without one is linted with its ESLint config, in
each folder from the working one up: `eslint.config.js` (`.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`) as it is, or the config
of before ESLint 9 (`.eslintrc.js`, `.cjs`, `.yaml`, `.yml`, `.json`, `.eslintrc`, `eslintConfig` of `package.json`)
made a flat one: `env`, `globals`, `parserOptions`, `extends` (`eslint:recommended`, `plugin:...`, shareable configs and
paths), `plugins`, `overrides`, `ignorePatterns`, `.eslintignore`, the folders above up to `root: true`, and the
eslintrc of folders below, each for the files of its folder. Rules of
ESLint that @xufa/lint does not have are reported as missing; parsers are not used (TypeScript's parses every file).

```sh
npm install --save-dev @xufa/lint
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
  with their options, messages, fixes and suggestions. ESLint's 5,249 tests of them pass (32 more need another parser),
  and `bench/lint-rules.js` finds them reporting what ESLint's rules report on every file of this repository.
- **Parser:** TypeScript's, into the ESTree espree makes: the same tree, tokens and comments for every file of this
  repository and every test of the rules. Scope analysis, code paths, selectors and reports are @xufa/lint's, each
  checked against ESLint's (`bench/lint-*.js`).
- **Configs:** `files`, `ignores`, `languageOptions` (`ecmaVersion`, `sourceType`, `globals`, `parserOptions`),
  `linterOptions`, `rules`, `settings`, merged as ESLint merges them. `globals` has the environments of the package
  globals (`node`, `browser`, `commonjs`, `jest`, `vitest`, the ES versions...).
- **Comments:** `eslint-disable`, `-enable`, `-line`, `-next-line` (with `-- reasons`), `/* global */`,
  `/* exported */` and `/* eslint rule: setting */`. Disabling ESLint's other rules is not an error.
- **Output:** ESLint's `stylish` and `json`; exit code 1 with errors, 2 when it cannot run. `--max-warnings`,
  `--quiet`.

Files are linted in parallel, by up to 4 worker processes (`--concurrency n|auto|off`). On this repository's 2,559
files (ported tests included), it reports the same 36,571 problems ESLint reports; `xufa-lint` takes 1.4 s where
`eslint` takes 3.8 s, and `eslint --concurrency auto` 1.8 s (bench/results/commands-1.md).

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
1.15 to 1.45 times on one file (bench/results/format-3.md).
Not formatted: CSS, HTML, YAML and other languages, and embedded languages of JavaScript.

## Both at once

`npx xufa-check` is `xufa-lint` and `xufa-format --check` in one command: each file is read and parsed once (the
formatter takes the linter's TypeScript tree), the problems are written as `xufa-lint` writes them, then the files that
are not formatted. `--fix` writes what rules fix, `--write` what the formatter writes; the other options are
`xufa-lint`'s. It takes what the two commands take (bench/results/check-1.md): parsing is little of the work.

Not there: ESLint's other rules, plugins (but rules defined with `defineRule`), processors, caching and linting
TypeScript files.

Docs: [docs/lint](../../docs/lint/index.html). Licenses of what it is made from: [NOTICE.md](NOTICE.md).

## License

MIT
