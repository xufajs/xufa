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

The ported files are formatted with prettier after a port (`npx prettier --write packages/<package>`).

The type tests run with the tool each upstream package uses: tstyche (http, router, serializer), tsd (logger,
inject, errors) and tsc (boot, sequelize). `pnpm test:types` runs them all.
