# @xufa/bundle

Modules as one script for browsers: ES modules, JSX, TypeScript and the CommonJS packages they import, with their
stylesheets. Syntax goes through TypeScript's transpiler (the one dependency, as a peer: the project's); resolution,
tree shaking, minifying and the module registry are its own. The page of `@xufa/admin` (React and React Flow) is built
with it.

```sh
npm install --save-dev @xufa/bundle typescript
```

```js
import fs from 'node:fs';
import { bundle } from '@xufa/bundle';

const { js, css } = bundle('client/src/main.jsx', {
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
});
fs.writeFileSync('dist/app.js', js);
fs.writeFileSync('dist/app.css', css);
```

- **Resolution:** relative files (extensions, index files, `.js` written for `.ts`), packages by `exports` with the
  `browser`, `import`/`require` and `module` conditions, then `browser`, `module` and `main`; `"browser": false` modules
  are empty.
- **Syntax:** ES modules, JSX (automatic or classic) and TypeScript become CommonJS through `ts.transpileModule`;
  `define` puts values in and leaves out the branches they decide (`if`, `?:`, `&&`, `||`), as for
  `process.env.NODE_ENV`.
- **Tree shaking:** the top-level statements of ES modules that nothing uses are left out, and so are unused modules
  of packages with `"sideEffects": false`. Statements with side effects always stay.
- **Stylesheets:** imported `.css` files (and their `@import`s) are one stylesheet, in the order the modules run.
- **Minifying:** comments and white space out, and local names made short by their scopes (nothing is renamed where a
  direct `eval` or `with` could reach it). Semicolons are written where statements relied on line breaks.
- **Legal comments:** `/*! ... */` and `@license` comments are kept at the end, as esbuild writes them.
- **Node.js modules:** given by `shims` (CommonJS source by name), or an error that says which one is missing.
- **For Node.js:** `platform: 'node'` leaves Node's modules (and `external` ones) to Node, and the bundle is a module
  of CommonJS; with `format: 'esm'` it is one ES module, by scope hoisting: the code of every module in one scope (the
  names that would clash renamed), each import a reference to what it imports, so that engines read imports as they
  read their own variables (`@xufa/lint`'s formatter is built so). `liveBindings: false` makes re-exports of the
  CommonJS form values.

`transform(source, options)` makes one module CommonJS (`{ code, imports, requires, legal }`); `minifyJs` and
`minifyCss` minify code; `resolve(request, from)` finds where an import goes.

Not there: code splitting, source maps, a watch mode, decorators beyond TypeScript's, and CSS modules.

Docs: [docs/bundle](../../docs/bundle/index.html).

## License

MIT
