# @xufa/http

The HTTP framework of [xufa](../xufa): a fast web framework for Node.js with the API of
[fastify](https://fastify.dev), and no dependencies outside the packages of xufa. The package `xufa` gives it too.

Its documentation is in `docs/http/`: an [overview](../../docs/http/index.html), a
[guide](../../docs/http/guide.html) (routes, validation, plugins, hooks, errors, tests, TypeScript, production), the
[API](../../docs/http/api.html) (every option and method, the error codes), [From fastify](../../docs/http/fastify.html)
and the [benchmarks](../../docs/http/benchmarks.html). This file is the summary. The
[playground](../../docs/playground.html#http) runs an app of it in the browser, with the requests you write.

```sh
npm install @xufa/http
```

```js
const xufa = require('@xufa/http');
// or: import xufa from '@xufa/http'  /  import { xufa } from '@xufa/http'

const app = xufa({ logger: true });

app.register(
  async (users) => {
    users.decorate('db', new Map([[1, { id: 1, name: 'Ada' }]]));

    users.get(
      '/:id',
      {
        schema: {
          params: { type: 'object', properties: { id: { type: 'integer' } } },
          response: { 200: { type: 'object', properties: { id: { type: 'integer' }, name: { type: 'string' } } } },
        },
      },
      async (request, reply) => users.db.get(request.params.id) ?? reply.code(404).send()
    );
  },
  { prefix: '/users' }
);

await app.listen({ port: 3000 });
```

## The API is fastify's

Read [fastify's documentation](https://fastify.dev/docs/latest/): server options, routes, hooks, plugins and
encapsulation, decorators, validation and serialization, content type parsers, `reply`, `request`, the logger,
`inject()`, the type providers of TypeScript. xufa runs fastify's test suite (main branch, 6.0.0-alpha.4), ported to
vyntra; the TypeScript declarations are fastify's, ported with their type tests.

What fastify takes from other packages, xufa has in its own:

| fastify uses          | xufa uses                           |
| --------------------- | ----------------------------------- |
| `pino`                | [`@xufa/logger`](../logger)         |
| `find-my-way`         | [`@xufa/router`](../router)         |
| `fast-json-stringify` | [`@xufa/serializer`](../serializer) |
| `light-my-request`    | [`@xufa/inject`](../inject)         |
| `avvio`               | [`@xufa/boot`](../boot)             |
| `@fastify/error`      | [`@xufa/errors`](../errors)         |
| `fastify-plugin`      | `xufa.plugin`                       |
| `ajv`                 | [`@xufa/schema`](../schema)         |

## What is different

### Validation: @xufa/schema

The default validator compiles schemas with [@xufa/schema](../schema) (loaded when a route first has a schema) and reports errors as ajv does (`instancePath`, `keyword`,
`params`, `message`), so that `attachValidation`, `schemaErrorFormatter` and error handlers work unchanged. By
default it converts types (`coerceTypes: 'array'`), applies defaults and removes additional properties, as fastify
configures ajv.

The ajv options that the validator shares are read from `ajv.customOptions`: `coerceTypes`, `useDefaults`,
`removeAdditional`, `allErrors`, `strict` (and `strictSchema`), `formats`, `keywords`. Options of the validator itself go in
`validation` (or `ajv.validatorOptions`): `xufa({ validation: { foldMessages: true } })` builds the errors of invalid
requests faster, for compiling the routes about 4% slower (see [@xufa/schema](../schema)).

Not supported, because they are ajv's: ajv plugins (`ajv.plugins` only accepts `[]`), ajv-errors messages and `$async`
schemas. A `validatorCompiler` of your own can use ajv for them. The `$merge` and `$patch` keywords of ajv-merge-patch
need no plugin: @xufa/schema has them.

### Names

- Error codes are `XUFA_ERR_*` (fastify's `FST_ERR_*`), with the same suffixes: `XUFA_ERR_NOT_FOUND`,
  `XUFA_ERR_VALIDATION`... They are in `xufa.errorCodes`. Warnings are `XUFAWRN*` and `XUFASEC*`, errors of plugin
  loading `BOOT_ERR_*` (avvio's `AVV_ERR_*`).
- The class of the errors is `XufaError`; the root of the plugin names is `xufa`; the diagnostics channels are
  `tracing:xufa.request.handler` and `xufa.initialization`.

### The page of errors in development

`app.register(xufa.devErrors)`: a request of a browser that fails gets a page with the error, its causes, the stack
with the lines of the source, the request (credentials hidden) and the routes, as Laravel's Ignition and Django's debug
page; other clients get the usual JSON. It is off when `NODE_ENV` is `production`, unless `enabled: true`.

### Health and maintenance

```js
app.register(xufa.health, {
  checks: {
    database: db.health(), // critical: down takes the app down (503)
    queue: queue.health({ maxLag: '5m' }), // not critical: down or degraded only degrades the app
    disk: () => freeSpace() > 1e9 || 'the disk is full', // yours: up, or false, a text, an error, its timeout (2 s)
  },
  interval: '10s', // in the background, as a status checker (or when asked, cached for 1 s)
  onChange: (status, previous) => alert(`The app is ${status}`),
});
app.register(xufa.maintenance, { store: maintenance(db) }); // xufa down / xufa up
```

- The packages give their checks: `db.health()` (@xufa/orm), `queue.health()` (@xufa/queue), `pool.health()`
  (@xufa/cluster) and `netcache.health()` (@xufa/netcache).
- `GET /health/live` (the process answers), `GET /health/ready` (503 when a critical check is down, or the app
  closes) and `GET /health` (every check: status, time, error, details). `heal: { after, run }` in a check runs a
  cure when it has been down that long.
- The maintenance mode (as Laravel's `artisan down`): a 503 with `Retry-After` for every request (a page for
  browsers), but the health routes, routes with `config: { maintenance: false }`, the addresses allowed and the
  browsers that opened its secret path. It is on while `.xufa/down.json` is there (this machine) or a `store` says so
  (`maintenance(db)` of @xufa/orm: every machine).

### Plugins

`xufa.plugin()` is fastify-plugin:

```js
const { plugin } = require('@xufa/http');

module.exports = plugin(
  async (app, options) => {
    app.decorate('db', await connect(options.url));
  },
  { name: 'db', xufa: '0.x' }
);
```

The range of versions a plugin needs is `xufa` in its metadata. Plugins written for fastify (with fastify-plugin)
load: their `fastify` range is not checked, since it is a range of fastify versions, and `decorators.fastify` counts
as `decorators.xufa`. The main plugins of fastify (cors, helmet, rate-limit, cookie, session, jwt, multipart,
static, compress...) run on it in the tests of [`tools/fastify-plugins`](../../tools/fastify-plugins).

### Logger

`logger: true` or logger options create an [`@xufa/logger`](../logger): pino's options and API, without transports.
Give it a stream (`logger: { stream }`), or a logger of your own as `loggerInstance` (pino works).

### Responses as bytes

Routes with a response schema whose output can be large (arrays, maps, recursive schemas) write their JSON as UTF-8
bytes and send that Buffer, without making a string first. When the route has `onSend` hooks, they get a string, as in
fastify.

### The head of responses

For most responses, xufa writes the status line and the headers itself, as one string, instead of calling
`res.writeHead()` (where Node checks and assembles every header: most of what a small response costs). They are the
same bytes: a self-test compares them with those of Node when the first route is made, and turns this off for good if
they differ; names and values are checked as Node checks them. It covers HTTP/1.1 responses kept alive with any status
from 200, with a body of known length or none (`HEAD`, 204, 304, empty replies), and headers set on `reply.raw` too,
merged as `writeHead()` merges them. Node writes the others: streams, trailers, HTTP/1.0 and connections that close.

- `reply.raw.getHeaders()` gives what it gives after `writeHead()`: the headers set on `reply.raw`, and those of the
  reply too when there were some. Code that wraps Node's `res.writeHead()` (some tracing tools do) does not see these
  responses go through it.
- `xufa({ fastHead: false })` leaves every head to Node.

## TypeScript

The declarations are fastify's with the names of xufa: `XufaInstance`, `XufaRequest`, `XufaReply`,
`XufaPluginAsync`, `XufaSchema`, the type providers... `import xufa, { type XufaInstance } from '@xufa/http'`.

## License

MIT. The declarations in `index.d.ts` and `types/` are ported from fastify (MIT).
