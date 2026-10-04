# node-test-to-vyntra

A codemod: rewrites test suites written with `node:test` as [vyntra](https://www.npmjs.com/package/vyntra) suites,
the way the tests of fastify (and of pino, find-my-way, fast-json-stringify, light-my-request and avvio) are ported
to xufa.

```sh
node tools/node-test-to-vyntra/cli.js <file or directory> <output directory> [--prettier]
```

It prints the TODOs it leaves, where a person has to look.

## What it rewrites

- **Assertions**: `t.assert.*` (and `assert.*` of `node:assert`) become `expect()`; `assert.throws`/`rejects` with a
  validator function become a check of the error. Regular expressions are matched as node:test does: against
  `String(error)` (`^Error: ` is dropped from them).
- **Plans**: `t.plan(n)` becomes `expect.assertions(n)`. A synchronous test with a plan becomes asynchronous, and
  waits a turn of the event loop at its end, as node:test waits for the planned assertions.
- **Hooks**: `t.after()` becomes `onTestFinished()` (or `afterAll()` in a suite); hooks of the file registered inside
  a test become `onTestFinished()`.
- **Subtests**: a test with subtests becomes a `describe()`. What it runs is kept in order: the statements before
  the first `await` run while the suite is collected, the ones after it in `beforeAll()` (the variables they set are
  declared before), the ones between subtests in a test `(setup)`, the ones after the last subtest in `afterAll()`.
- **Listening servers**: `server.listen(opts, (err, address) => { test(...) })` becomes a `describe('listening')`
  that listens in `beforeAll()`.
- **Contexts**: `t` is renamed where vyntra needs it (vyntra gives the context to a first parameter named `ctx`,
  `context` or `task`; any other single parameter is a `done` callback).

## Porting fastify

`port-fastify.js` converts fastify's tests and renames what fastify calls itself (error codes, the package, its
modules of `lib/`, its plugin metadata), then makes the changes of single files that vyntra needs. It overwrites the
files it writes; the tests of xufa itself are in `packages/http/test/xufa/`.

```sh
node tools/node-test-to-vyntra/port-fastify.js ../fastify/test packages/http/test [file filter regexp]
```

The tests of what xufa does not have (ajv plugins, keywords and async validation; fastify's documentation files) are
marked skipped, with the reason, in `SKIPPED_TESTS`.
