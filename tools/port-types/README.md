# port-types

Ports the TypeScript declarations of the libraries xufa replaces, with their type tests, to the packages of xufa:
the files are copied from the installed packages (or from the `../fastify` checkout), with what they call themselves
renamed and their imports of other upstream packages pointed to the xufa ones.

The declarations of Sequelize 6 (for `@xufa/sequelize`) come from the Sequelize that
[`tools/sequelize-compat`](../sequelize-compat) installs, and their type tests from the tests its `fetch-tests.js`
gets: set that folder up first (`npm install` and `node fetch-tests.js` there). They are patched for what the layer
has not (Sequelize's SQL helpers in `Utils`, the transactions of the QueryInterface), for what it takes of Sequelize 7
(`changeColumns`, `showIndexes` and the descriptions of indexes, VIRTUALs computed by SQL, `enableRuntimeAttributes`) and for the packages of types
they use (validator, retry-as-promised, debug), which are written in instead.

```sh
node tools/port-types/port.js [package name filter]   # writes the declarations and type tests
node tools/port-types/wire.js <package> <test command> [declaration files...]   # points package.json to them
```

`packages.js` lists, for every package, the upstream package, the files and the renames. What renames can not do is
in its `patch` functions: what a package has that upstream has not (`match()` of the router, `output` and
`toBuffer` of the serializer...), and what it has not (transports of the logger, ajv plugins, standalone
compilers), whose type tests are left out.

The ported files say so in their first line, and a new port overwrites them. Written for xufa, and kept:

- `packages/http/types/compilers.d.ts` (the default compilers, on @xufa/schema and @xufa/serializer, instead of ajv's);
- the `test/types/xufa.*` type tests of each package;
- `packages/http/test/types/tsconfig.json`;
- `packages/sequelize/types/errors/not-supported-error.d.ts` and `packages/sequelize/test/types/tsconfig.json`.

The ported files are formatted after a port (`npx xufa-format --write packages/<package>`).

The type tests of tsd and tstyche (and expect-type's imports) become those of @xufa/test after a port:
`tools/type-tests/convert.mjs` rewrites them (expectTypeOf, assertType, // @ts-expect-error) and
`tools/type-tests/fix-directives.mjs` puts each // @ts-expect-error on the line of its error. They run with
`xufa-test --typecheck.only`, and those of boot and sequelize with tsc; `pnpm test:types` runs them all. The
ported type tests are not formatted (`format.ignores` of xufa.lint.config.js: packages/*/test/): the formatting their committed files have is not made
again by the command above, so compare a port with what is committed before keeping it.
