# Schema validation: `schema/`

Compares `compileJsonSchema` of [@xufa/schema](../../packages/schema) with ajv and the other validators of
[json-schema-benchmark](https://github.com/ebdrup/json-schema-benchmark). The validators it compares are dev
dependencies of `bench/`, not of the package.

```sh
pnpm install                                      # at the root of the repository
cd bench
pnpm run schema:all                               # all below, for the pages of the docs (about 15 minutes)
pnpm run schema                                   # the test suite and the payloads, isolated
pnpm run schema:suite                             # the JSON-Schema-Test-Suite only
pnpm run schema:object                            # the payloads only
pnpm run schema:features                          # the features of @xufa/schema and ajv
pnpm run schema:legacy                            # draft-04 and draft-06: the tests passed by @xufa/schema and ajv
node schema/machine.js                            # the machine of the run, for the pages
pnpm run schema:quick                             # every validator in one process (about a minute)
pnpm run schema:conformance draft2020-12          # @xufa/schema and ajv on one draft, file by file
pnpm run schema:conformance draft2020-12 --standalone   # with standalone code, without code generation
pnpm run schema:conformance draft2020-12 --formats      # the optional tests of format
```

To measure a change of @xufa/schema itself, A against B in processes that alternate (a machine that drifts weighs on
both alike), the median of 5 of each and the ratio:

```sh
pnpm run schema:compile -- --vs ../old-copy             # compiling: the repository against a copy (a folder with its index.js)
pnpm run schema:validate -- --vs ../old-copy            # validating the payloads, the same way
pnpm run schema:validate -- --options '{"foldMessages":true}' --invalid   # the same code with an option, invalid payloads
```

On a laptop, differences under about 4% are noise: run it twice, or against an unchanged copy, to see how much.

The results are written to `bench/results/schema/` (`suite.json`, `suite-draft2019-09.json`,
`suite-draft2020-12.json`, `object.json`, `features.json`, `legacy.json`, `machine.json`; the quick mode writes
`*-quick.json`). `pnpm docs` (at the root) makes from them the page of the benchmarks of @xufa/schema
(`docs/schema/benchmarks.html`) and its section of `docs/benchmarks.html`, with `schema/report.js`.

`SCHEMA_RESULTS` writes them to another folder (relative to `bench/`). The run on Linux goes to
`bench/results/schema-linux/`, and the page shows its summary in a part of its own ("On Linux"), checked against its
results the same way:

```sh
SCHEMA_RESULTS=results/schema-linux pnpm run schema:all
```

On Windows, run it in WSL from a copy of the repository in the Linux file system (`~/xufa`, with its own
`pnpm install`), not from the Windows checkout (`/mnt/c/...`). It works from there too, but every measurement starts
a new process that loads its libraries through WSL's bridge to the Windows disk. The run then takes over an hour
instead of about 20 minutes (the numbers are the same: loading is not timed).

## Modes

- **Isolated (default, `isolated.js`)**: every measurement runs in a fresh process with a single validator, the way a
  service uses a validator, so validators cannot slow each other down through the JIT state they would share in one
  process. Each measurement is repeated in 3 processes and the median is reported, with the spread between the
  lowest and highest run. `BENCH_RUNS` and `BENCH_TIME` (ms per run, default 1000) change that.
- **Quick (`suite-bench.js`, `object-bench.js`)**: every validator in the same process, measured with tinybench. It
  is faster to run and also shows how the validators behave when many run side by side, but it compresses the
  differences between them and depends on the order they run in. Use it while developing, and the isolated mode for
  the numbers to compare.

## Benchmarks

- **Suite**: runs the draft-07 [JSON-Schema-Test-Suite](https://github.com/json-schema-org/JSON-Schema-Test-Suite),
  pinned to a commit in `package.json`. It reports how many tests each validator gets right, wrong, or rejects at
  compile time ("unsupported"), and the groups it fully passes. Speed is measured over the test groups that every
  validator passes, so all of them do the same work.
- **Payloads** (`lib/cases.js`): validates the same schema with every validator.
  - **moltar**: the flat object from typescript-runtime-type-benchmarks, with no extra keys allowed.
  - **order**: a business-style object with 20 order lines, using `pattern`, `enum`, `const`, number ranges,
    `anyOf`, nullable types and `uniqueItems`; also in draft 2020-12 with `$ref`, `allOf` and
    `unevaluatedProperties`.
  - **payment** (2020-12): `oneOf` variants with `unevaluatedProperties`.
  - **shapes**: 8 variants picked by an OpenAPI `discriminator` (ajv with its option `discriminator: true`, the
    validators without it through `oneOf`).

  Each payload is run valid and invalid. It also measures compile cost (schema to validator). A validator that
  fails to compile a schema, or gives the wrong answer for it, is skipped for that case.

`validators.js` holds one adapter per library; add a library there to include it in every benchmark. `lib/` holds
what both modes share: the payloads, and loading the suite with its remote documents.

## Reading the numbers

- Validators with several modes have one row per mode; only compare rows that do the same work:
  - **(boolean)** only tells whether the data is valid: `compileJsonSchema(schema, { errors: false })`, schemasafe's
    default.
  - **(first error)** stops at the first failing check and builds its error: `{ allErrors: false }`, ajv's default,
    schemasafe with `includeErrors`.
  - **(all errors)** builds every error: @xufa/schema's default, ajv and schemasafe with `allErrors`.

  Libraries with a single row (jsen, is-my-json-valid, djv...) run in their default mode.

- About 40% of the suite tests have invalid data, so building errors weighs a lot in the suite speed.
- @xufa/schema compiles the schema to generated code for the check and the error messages (see `packages/schema/lib/compile.js`).
- Every validator gets the documents the tests reference through `$ref`: the suite's `remotes/` folder (under
  `http://localhost:1234/`, as the suite's own runner serves it) and the draft-07 meta-schema, registered with each
  library's own API (`schemas` options, `addSchema`, `setRemoteReference`...). @xufa/schema takes them with
  `compileJsonSchema(schema, { schemas })`.
