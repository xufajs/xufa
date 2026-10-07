# @xufa/openapi

OpenAPI documents of the routes of an app of [@xufa/http](../http) (and fastify), and an explorer to read and try
them, with no dependencies but [@xufa/yaml](../yaml). The code is the one of
[@fastify/swagger](https://github.com/fastify/fastify-swagger) 9.9.1 (MIT, `LICENSE.fastify-swagger`) with its test
suite: `require('@fastify/swagger')` can be replaced by `require('@xufa/openapi')`, and its documentation applies.

```js
const xufa = require('xufa');
const openapi = require('@xufa/openapi');

const app = xufa();
await app.register(openapi, { openapi: { info: { title: 'Books', version: '1.0.0' } } });
await app.register(require('@xufa/openapi/ui'), { routePrefix: '/docs' });

app.get('/books/:id', { schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } }, handler);

await app.ready();
app.swagger(); // the document; app.swagger({ yaml: true }) as YAML
```

Register it (awaited) before the routes it documents: it sees them as they are added. Each route is described by its
schema (params, querystring, headers, body, response) and by `tags`, `summary`, `description`, `operationId`,
`deprecated`, `security` and `hide` in it. Shared schemas (`app.addSchema({ $id })`) become `components.schemas`.

- `openapi` (an OpenAPI 3 document to start from: `info`, `servers`, `components`, `security`, `tags`...) or `swagger`
  (Swagger 2).
- `transform({ schema, url, route })` and `transformObject({ openapiObject })` change what is written; a route's
  `config.swaggerTransform` replaces `transform` for it.
- `hideUntagged`, `hiddenTag`, `exposeHeadRoutes`, `stripBasePath`, `refResolver`, `decorator`.
- `mode: 'static'` with `specification: { path, baseDir }` (a JSON or YAML file) or `{ document }` serves a document
  of yours instead (`postProcessor` changes it).

## What xufa adds

In OpenAPI 3 documents (`xufa: false` leaves it out):

- **Resources of @xufa/orm** are documented: `orm.resource(Book, ...)` gives each of its routes its tags, summary and
  operationId (`listBook`, `getBook`, `createBook`, `updateBook`, `partialUpdateBook`, `deleteBook`), its parameters
  (the filters, ordering, search and page of the list), its body (the writable fields, from `Book.schema()`: null is
  `nullable: true` in OpenAPI 3.0 and a type in 3.1; the other fields of the object marked `readOnly`, never
  required, their description saying what the resource does with them: ignored, or with `strict` refused unless an
  update gives the value the object has) and its responses (the object as it is answered, its read-only fields marked
  too; the page of a list, the errors). The object is in `components/schemas` once, and the operations refer to it:
  @fastify/swagger names components `def-0`, `def-1`... (their `title` is their `$id`); to name them by their `$id`
  (`Book`), give `refResolver: { buildLocalReference: (json, baseUri, fragment, i) => json.$id || `def-${i}` }`. The option `openapi` of the resource names the tag (`{ tag: 'Library' }`) or
  leaves it out (`false`).
- **Any route** can be documented by its `config.openapi`: a schema that only describes it, under its own schema
  (which wins). It is never used to validate or serialize: documenting a route does not change what it accepts or
  answers. That is how the resources are documented.
- **The strategies of @xufa/auth** become `components.securitySchemes` (the access tokens: `http` `bearer` JWT; API
  keys: `apiKey` in their header or query; HTTP Basic; the strategies of Passport: OAuth 2.0 with their URLs, bearer,
  API keys), and a route with `config.auth` gets the `security` of its strategies (those of the rule, or any of
  them). Schemes and security of your own win.

Route schemas written for @fastify/swagger can have the keywords of OpenAPI (`style`, `explode`, `example`, `x-`
extensions...): @xufa/http accepts them as annotations, as fastify does, and still refuses other unknown keywords.

## From a document (design first)

`openapi.operations` makes the routes of an OpenAPI 3 document you wrote first: each operation is a route, with the
schemas of its parameters, body and responses (validated and serialized by @xufa/http), and the handler of its
`operationId`. Operations without a handler answer 501, so the API can be served (and tried in the explorer) before it
is written.

```js
await app.register(openapi, { mode: 'static', specification: { path: './openapi.yaml' } }); // served as it is
await app.register(require('@xufa/openapi/ui'));
await app.register(openapi.operations, {
  path: './openapi.yaml', // or document: { openapi: '3.1.0', ... }
  handlers: {
    listBooks: async (request) => Book.objects.all(),
    getBook: {
      preHandler: app.auth.authorize('reader'),
      handler: async (request) => Book.objects.get({ pk: request.params.id }),
    },
  },
  prefix: '/api',
});
```

- `components.schemas` become shared schemas (`schemaPrefix` before their names) and the `$ref`s to them follow:
  recursive schemas work. In requests, `readOnly` properties are not required; in responses, `writeOnly` ones
  (passwords) are left out of what is answered.
- Parameters in path, query and headers are validated (cookies are not); `/books/{id}` is `/books/:id`.
- The JSON body (`application/json`, or a `+json` type) is validated; an optional one (`required` not true) may be
  left out, and the handler gets `null`.
- Responses with JSON are serialized by their schemas: properties not in them are not answered.
- Security (of the operation, or of the document) is the `config.auth` of the route for @xufa/auth: the strategies
  of its schemes (`security: { bearer: 'jwt' }` maps scheme names to strategy names); `security: []` makes an operation
  public. With operations that need security and no @xufa/auth, the app does not start.
- `handlers` by `operationId` (or `'GET /path'`): a handler, or the options of its route. A handler of no operation
  is an error, and `missing: 'throw'` makes every operation need one.
- The formats of OpenAPI (`int32`, `int64`, `float`, `double`, `byte`, `binary`, `password`) are known to
  @xufa/http; `byte` is checked (base64), the others are not.
- `validateResponses: true` (or `validateResponse` of a handler) checks what each handler answers against the schema
  of its status (the code, its class `2xx`, or `default`): a response out of its contract is a 500
  (`ResponseValidationError`, with the errors), instead of reaching the client. `request.operation` has the `id` of
  the operation, `validateResponse(payload, status)` and `validateRequest()` (which throws the error of the validation of
  the request, with `attachValidation: true`): validation by hand.
- `missingStatus`: what operations without a handler answer (501, or 404); `requestIdHeader`: the header the id of
  each request is answered in (`x-request-id`).
- Documents split in files are read whole: `$ref`s to other files are followed (relative to the document, or to
  `baseDir` for a document given; to URLs only with `remote: true`). Schemas of other files become schemas of the
  document (recursive ones too); the rest is written where it was referred to. `openapi.bundle(path)` gives that
  document, to serve it as well. Swagger 2.0 documents are read as OpenAPI 3 (`openapi.fromSwagger2(document)`):
  definitions, body and formData parameters, consumes and produces, collectionFormat, securityDefinitions.

## The explorer

`@xufa/openapi/ui` serves the document and an explorer, by default at `/documentation`: the page, `/json`, `/yaml`,
and `/initializer.js` (what starts it: a file, not inline, so strict Content Security Policies allow it). Its routes
are not in the document.

- `ui`: `'swagger'` (Swagger UI, the default), `'scalar'` or `'redoc'`, loaded from a CDN (`cdn`:
  `https://cdn.jsdelivr.net/npm`) at pinned versions (`version`, `ui.VERSIONS`).
- `assets`: a folder of [swagger-ui-dist](https://www.npmjs.com/package/swagger-ui-dist), served at
  `<routePrefix>/static` instead of the CDN (with OAuth logins from the explorer, whose redirect page must be of the
  same origin).
- `routePrefix`, `title`, `uiConfig` (the configuration of the explorer, as JSON), `initOAuth`.
- `transformSpecification(document, request, reply)` changes the document of `/json` and `/yaml` for a request (on a
  copy, unless `transformSpecificationClone: false`).
- `uiHooks: { onRequest, preHandler }`: hooks of its routes, to protect them.
- `csp: true` (or a policy of yours): a Content-Security-Policy for the page.

## Tests

`test/` is the suite of @fastify/swagger (290 tests, OpenAPI 3 and Swagger 2, static and dynamic), ported to vyntra by
`tools/port-swagger` from a checkout of its repository, whose documents are checked by swagger-parser; `test/xufa`
tests what xufa adds and the explorer. The library is kept as @fastify/swagger has it (`lib/`, but `lib/xufa` and
`lib/ui.js`), so it can be ported again: json-schema-resolver, rfdc and yaml are replaced by `lib/xufa`.

## TypeScript

The declarations of @fastify/swagger (on @xufa/http, with the types of
[openapi-types](https://www.npmjs.com/package/openapi-types) written in), ported by `tools/port-types` with what xufa
adds (`config.openapi`, `xufa`), and `ui.d.ts`.

## License

MIT. @fastify/swagger: MIT (`LICENSE.fastify-swagger`); json-schema-resolver: MIT, Manuel Spigolon; openapi-types: MIT.
