# sequelize-compat

Runs the integration tests of Sequelize 6 against [`@xufa/sequelize`](../../packages/sequelize), and the same tests
against Sequelize 6.37.8 itself, to tell the failures of the tests and of the environment from those of the package.

The tests are Sequelize's, unchanged: its v6 branch at commit `c8ba82b2`
([c8ba82b28d1ecf181ee889a8d53dec43949f69d9](https://github.com/sequelize/sequelize/tree/c8ba82b28d1ecf181ee889a8d53dec43949f69d9)).
They are not in this repository: `fetch-tests.js` gets them. This folder is not part of the pnpm workspace: it has
the test tools of Sequelize (mocha 7, chai, sinon, sqlite3, pg...) and Sequelize itself, installed with npm.

## Setup

```sh
pnpm install                  # at the root of the repository: @xufa/sequelize and its packages
cd tools/sequelize-compat
npm install                   # the test tools, and Sequelize 6 as real-sequelize
node fetch-tests.js           # test/ and .mocharc.jsonc of the pinned commit, from GitHub
                              # (or: node fetch-tests.js <a local clone of sequelize>)
```

The TypeScript declarations of `@xufa/sequelize` are ported from this setup too: from the Sequelize installed here,
with the type tests of `test/types` (see [`tools/port-types`](../port-types)).

## Runs

```sh
node run-all.js sqlite                      # results/sqlite.json
node summarize.js sqlite 40 --files         # totals, the most common failures, and failures by file
SEQ_REAL=1 node run-all.js sqlite           # results/real-sqlite.json: the same tests on Sequelize 6
node compare.js sqlite real-sqlite          # the failures that also fail on Sequelize, and the ones that do not
```

`run-all.js <dialect> [name] [timeout] [filter]` runs each test file in a mocha process of its own (a crash loses that
file only) and writes the merged report to `results/<name>.json`; `filter` runs only the files whose path includes it.
A whole run takes a few minutes on SQLite, more on PostgreSQL.

PostgreSQL runs need the test database in the environment. **The tests drop every table, schema and enum type of
that database**: give them one of their own.

```sh
SEQ_PG_DB=xufa_test SEQ_PG_USER=xufa SEQ_PG_PW=xufa SEQ_PG_PORT=5432 node run-all.js postgres
```

The tests of PostGIS, hstore and exclusion constraints need the extensions `postgis`, `hstore` and `btree_gist` in it.
Don't run other tests against the same database at the same time (the tests of `packages/*`).

To work on one file, run mocha alone:

```sh
DIALECT=sqlite node node_modules/mocha/bin/mocha -r ./resolve.js --file test/integration/support.js test/integration/model/create.test.js
```

## How it works

- `resolve.js` (loaded by mocha with `-r`) resolves `sequelize` to `shim/sequelize`, which gives `@xufa/sequelize`,
  and the modules of `sequelize/lib/*` the tests require: the ones the shim does not have (dialect internals of other
  databases) come from the real package, so the test files that require them load. With `SEQ_REAL=1`, `sequelize` is
  the real package.
- `layer.js`: the `@xufa/sequelize` of the shim is `packages/sequelize`, or with `SEQ_LAYER=snapshot`, the copy that
  `node snapshot.js` makes in `.snapshot/` (to run the whole suite on a fixed version while the package changes).
- `lib/`: the tests read `../lib/data-types` and list `../lib/dialects`, which are in the repository of Sequelize.
- `--file test/integration/support.js`: its hooks clear the database around every test. Upstream runs every file in
  one mocha process, where they apply to all of them; here they are given to every process.
