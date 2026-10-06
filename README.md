# xufa

**Documentation: [xufajs.github.io/xufa](https://xufajs.github.io/xufa/)**

A framework for Node.js in the spirit of Django: the parts a web application needs, built to work together, written
from scratch with **no runtime dependencies** outside this repository. It starts with its HTTP layer,
[`@xufa/http`](packages/http): a fast web framework with the API of [fastify](https://fastify.dev). Its ORM,
[`@xufa/orm`](packages/orm), runs the same Django-like models and queries on SQL and NoSQL databases (SQLite,
PostgreSQL and MongoDB), and [`@xufa/sequelize`](packages/sequelize) runs code written for Sequelize 6 on it.
[`@xufa/auth`](packages/auth) logs users in: passwords, JSON Web Tokens, codes of authenticator apps, lockouts and
refresh tokens.

```js
const xufa = require('xufa'); // for now, @xufa/http

const app = xufa({ logger: true });

app.get(
  '/users/:id',
  {
    schema: {
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      response: { 200: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } },
    },
  },
  async (request) => ({ id: request.params.id, name: 'Ada' })
);

app.listen({ port: 3000 });
```

Code written for fastify runs on `@xufa/http`: routes, hooks, plugins and encapsulation, decorators, schemas, the
content type parsers, `inject()`, the logger options, the errors and the TypeScript types. fastify's own test suite is
its test suite (see [Tests](#tests)).

## Packages

[`xufa`](packages/xufa) is the framework: it gives `@xufa/http`, and its parts by their paths (`xufa/orm`, `xufa/auth`,
`xufa/config`, `xufa/schema`...: see [its README](packages/xufa)). Each part is a package of its own, usable alone,
with no dependencies outside xufa, and every library fastify depends on is replaced by one.

### The framework

| Package                                 | Replaces                                  | What it is                                                                             |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| [`xufa`](packages/xufa)                 |                                           | The framework: `@xufa/http`, and its parts by their paths (`xufa/orm`, `xufa/auth`...) |
| [`@xufa/http`](packages/http)           | `fastify`                                 | The HTTP framework, with the API of fastify                                            |
| [`@xufa/websocket`](packages/websocket) | `ws`, `@fastify/websocket`                | WebSockets: client, server, routes and rooms                                           |
| [`@xufa/openapi`](packages/openapi)     | `@fastify/swagger`, `@fastify/swagger-ui` | OpenAPI documents of the routes, and an explorer                                       |
| [`@xufa/client`](packages/client)       | `got`, `axios`                            | A client of HTTP APIs on fetch                                                         |
| [`@xufa/schema`](packages/schema)       | `ajv`, `@sinclair/typebox`                | Schemas as code or JSON Schema, compiled into fast validators                          |
| [`@xufa/orm`](packages/orm)             | the Django ORM                            | ORM for SQL and NoSQL databases, files and stores of objects                           |
| [`@xufa/auth`](packages/auth)           | `otplib`                                  | Passwords, JWTs, TOTP, refresh tokens, as a plugin                                     |
| [`@xufa/sequelize`](packages/sequelize) | `sequelize`                               | The API of Sequelize 6 over `@xufa/orm`                                                |

### Drivers

| Package                         | Replaces  | What it is                        |
| ------------------------------- | --------- | --------------------------------- |
| [`@xufa/pg`](packages/pg)       | `pg`      | PostgreSQL driver                 |
| [`@xufa/mongo`](packages/mongo) | `mongodb` | MongoDB driver, with its own BSON |

### Expressions and templates

| Package                                   | Replaces                 | What it is                                        |
| ----------------------------------------- | ------------------------ | ------------------------------------------------- |
| [`@xufa/expression`](packages/expression) | `expr-eval`, `jexl`      | Safe JavaScript expressions, compiled once        |
| [`@xufa/template`](packages/template)     | `handlebars`, `mustache` | Templates of text and HTML over those expressions |

### Security

| Package                     | Replaces       | What it is                                              |
| --------------------------- | -------------- | ------------------------------------------------------- |
| [`@xufa/jwt`](packages/jwt) | `jsonwebtoken` | JSON Web Tokens, with the API and tests of jsonwebtoken |

### Running

| Package                                 | Replaces                | What it is                                                            |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| [`@xufa/cluster`](packages/cluster)     | `node:cluster`          | Apps in clusters of processes, with a message bus                     |
| [`@xufa/config`](packages/config)       | `node-config`, `dotenv` | Configuration by environment, Consul and Vault, with a schema         |
| [`@xufa/scheduler`](packages/scheduler) | `node-cron`             | Jobs on intervals, cron or once                                       |
| [`@xufa/discovery`](packages/discovery) |                         | The nodes of a service found on the network (UDP)                     |
| [`@xufa/netcache`](packages/netcache)   | Redis, as a cache       | A cache shared by the machines of a service                           |
| [`@xufa/faults`](packages/faults)       | Toxiproxy, `nock`       | Faults by rules for tests of resilience: database, caches, calls, bus |
| [`@xufa/marshal`](packages/marshal)     | `devalue`, `superjson`  | JSON that keeps classes, references, dates, maps...                   |
| [`@xufa/yaml`](packages/yaml)           | `js-yaml`               | YAML 1.2, with the API and tests of js-yaml                           |

### The parts of `@xufa/http`

| Package                                   | Replaces              | What it is                                 |
| ----------------------------------------- | --------------------- | ------------------------------------------ |
| [`@xufa/logger`](packages/logger)         | `pino`, `sonic-boom`  | JSON logger                                |
| [`@xufa/router`](packages/router)         | `find-my-way`         | HTTP router                                |
| [`@xufa/serializer`](packages/serializer) | `fast-json-stringify` | JSON serializers compiled from JSON Schema |
| [`@xufa/inject`](packages/inject)         | `light-my-request`    | Fake HTTP requests for tests               |
| [`@xufa/boot`](packages/boot)             | `avvio`               | Plugin loading                             |
| [`@xufa/errors`](packages/errors)         | `@fastify/error`      | Errors with codes                          |

Validation uses [`@xufa/schema`](packages/schema) instead of ajv, a dependency of
`@xufa/http` (loaded when a route first has a schema).

## Differences of `@xufa/http` from fastify

- **Validation is @xufa/schema.** The ajv options it shares are read from `ajv.customOptions` (`coerceTypes`,
  `useDefaults`, `removeAdditional`, `allErrors`, `strict`, `formats`, `keywords`), and validation errors have ajv's
  shape. What only ajv has does not work: ajv plugins (`ajv.plugins` only accepts `[]`), ajv-errors messages, `$async`
  schemas, `$merge`/`$patch`. A `validatorCompiler` of your own can still use ajv.
- **Error codes** are `XUFA_ERR_*` (fastify: `FST_ERR_*`), warnings `XUFAWRN*`/`XUFASEC*`, and the error class is
  `XufaError`.
- **Plugins** declare the range of xufa versions they need as `xufa` in their metadata; `xufa.plugin()` is
  fastify-plugin. Plugins written for fastify work: their `fastify` range is accepted and not checked.
- **The logger** is `@xufa/logger`: pino's API without transports (give it a stream).

## Performance

Some of what xufa does differently to be faster: the router matches static paths with one map lookup and leaves the
query string unparsed until `request.query` is read; serializers write large responses as UTF-8 bytes, sent to the
socket as they are; validation is compiled by @xufa/schema. See [bench/](bench) for the harnesses and how to read their
numbers: they depend on the machine, so run them on yours.

## Development

```sh
pnpm install
pnpm test          # the tests of every package (vyntra)
pnpm test:types    # the TypeScript declarations (tstyche, tsd, tsc)
pnpm lint
pnpm bench         # HTTP benchmark of xufa, fastify and node:http (see bench/README.md)
```

Node.js 22 or later.

The tests of the databases run against local servers, and are skipped when they cannot connect:

- PostgreSQL: `XUFA_PG_URL` (default `postgres://xufa:xufa@127.0.0.1:5432/xufa_test`, `off` to skip). The tests of
  geometries and hstore also need the extensions `postgis` and `hstore` in that database (they skip without them).
- MongoDB: `XUFA_MONGO_URL` (default `mongodb://127.0.0.1:27017/xufa_test`), and `XUFA_MONGO_RS_URL` for a replica
  set (transactions).
- SQLite is `node:sqlite`, always there.

### Tests

The tests of fastify and of the libraries it uses are ported, not rewritten:

- [`tools/node-test-to-vyntra`](tools/node-test-to-vyntra) converts their `node:test` suites to
  [vyntra](https://www.npmjs.com/package/vyntra), and `port-fastify.js` renames what fastify calls itself
  (`node tools/node-test-to-vyntra/port-fastify.js ../fastify/test packages/http/test`). The port follows fastify's
  main branch (6.0.0-alpha.4, commit 19d5be0d); tests of ajv-only features are marked skipped.
- [`tools/port-types`](tools/port-types) ports the TypeScript declarations and their type tests the same way
  (`node tools/port-types/port.js`).

The integration tests of Sequelize 6 run as they are: [`tools/sequelize-compat`](tools/sequelize-compat) runs them
against `@xufa/sequelize`, and against Sequelize itself to compare (see its README).

Tests of what xufa does differently are written for it, apart from the ported ones (which a new port overwrites):
`packages/http/test/xufa/`, `packages/serializer/test/output.test.js`, and `test/types/xufa.*` in the packages
with declarations.

### Work done at startup

What a process does before it serves its first request can make every request after it slower, for as long as it
runs. V8 shares the shapes of the objects made as `{}`: each property name added first to such an object, anywhere in
the process, is a branch of one shared tree. When thousands of names are added before traffic (as a first compile of
ajv does, with its meta-schema), the request path is optimized worse: on fastify, a third fewer requests per second
on every route, and a seventh on `@xufa/http`, with or without the code that did it running again. The same work done
after the first requests costs nothing. So, in the packages:

- Lookup tables keyed by data that are built at startup and kept (registries of schemas, models, routes or keywords,
  indexes, caches) are `Map`s or `Object.create(null)`, not `{}`. What is handed to users (rows, bodies, headers,
  results) stays a plain object: what they expect, and it is made after traffic starts.
- What is only needed to serve (validators of a compiler of others, caches, lookup tables) is made on first use, not
  in `onReady` or when a plugin is registered. What checks that an app is right (the schemas of its routes, its
  models) is still done at startup, as fastify does: it is bounded, and measured harmless.
- A change to what runs at startup is measured under load, against the same app with that work moved after the
  first request. A process reaches one state or the other, so compare the medians of several runs, each in a
  process of its own. V8's profiler (`--cpu-prof`) and its trace flags put every process in the slow state: they
  cannot show this.

## License

MIT. The ported declarations and tests keep the MIT license of the projects they come from (fastify, pino,
find-my-way, fast-json-stringify, light-my-request, avvio, @fastify/error, fastify-plugin, sequelize).
