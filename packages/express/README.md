# @xufa/express

Express 5's API on [@xufa/http](../http), implemented anew with no dependencies: the code is @xufa/express's own (`lib/`),
written to Express 5.2.1's behaviour and checked by Express's own tests; @xufa/router finds the route of each request.
An app of Express runs as it is; change the import:

```js
import express from '@xufa/express'; // or const express = require('@xufa/express');

const app = express();
const router = express.Router();

router.get('/books/:id', async (req, res) => {
  const book = await books.find(req.params.id);
  if (!book) return res.status(404).send('Not found');
  return res.json(book);
});

app.use(express.json({ limit: '1mb' }));
app.use('/api', router);
app.use((err, req, res, next) => res.status(err.status || 500).send(err.message));
app.listen(3000);
```

All of Express's API is there: routers and `app.route()`, `app.all()`, `router.param()`, paths of path-to-regexp 8
(`*splat`, `{/:optional}`), sub-apps, settings (`trust proxy`, `etag`, `query parser`, `strict routing`...), views
(`app.engine`, `res.render`), `res.redirect`, `cookie`, `download`, `format`, `jsonp`, `sendFile`, `req.ip`,
`hostname`, `accepts`, `is`, `range`, `express.json/raw/text/urlencoded/static`. Its types (`index.d.cts`) are
Express's API (route params typed from their paths: `'/books/:id'` gives `req.params.id`).

`lib/`, each part with what Express used for it:

| File                                 | What                                                                          | Express used                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `express.js`, `application.js`       | `express()`, settings, mounting, views, the final handler                     | express, finalhandler                                                    |
| `router.js`, `path.js`               | Router, Route, layers; the paths of routes                                    | router, path-to-regexp                                                   |
| `plan.js`, `server.js`               | the layers a route may meet, found with @xufa/router; @xufa/http with plugins | (ours)                                                                   |
| `request.js`, `response.js`          | `req` and `res`                                                               | express                                                                  |
| `body.js`, `charset.js`, `query.js`  | `express.json/raw/text/urlencoded`, nested query strings                      | body-parser, raw-body, iconv-lite, qs                                    |
| `send.js`, `static.js`               | `res.sendFile`, `express.static`                                              | send, serve-static                                                       |
| `headers.js`, `negotiate.js`         | media types, freshness, ranges, Vary, cookies, Content-Disposition            | type-is, fresh, etag, range-parser, vary, cookie, accepts, negotiator... |
| `errors.js`, `finished.js`, `url.js` | errors of HTTP, the end of a message, urls                                    | http-errors, on-finished, parseurl                                       |

The addresses of proxies (`trust proxy`) and the simple query parser are @xufa/http's.

## Checked

- **Express's own tests**: its 1,238 tests (`test/upstream`, ported from mocha by `tools/port-express/port.js` with the
  examples the acceptance tests run) pass, every request routed by @xufa/router (they serve the app with
  `supertest(app)`: @xufa/test/supertest, with the paths of supertest 6 that Express tests with, through
  `test/support/supertest.cjs`; `test/support/after.cjs` is after's). `test/supertest.test.js` sends the same requests
  through it to Express 5, @xufa/express, fastify and @xufa/http.
- **Against Express**: `test/plan.test.js` builds the same apps on Express 5.2.1 and on @xufa/express and sends both the
  same requests (routes in every order, routers mounted on paths with params, sub-apps, `all()`, `route()`, `param()`,
  paths of RegExp, wildcards and optional parts, strict and case-sensitive routers, middlewares that change the url or
  the method, `next('route')`, `next('router')`, OPTIONS and HEAD), expecting the same status, headers and body;
  `test/express.test.js` the same for bodies, files, errors, helmet, compression and multer.

## How it routes

The app as the handler of a server (`app.listen()`, `http.createServer(app)`, `supertest(app)`) finds the request's
route with @xufa/router first. Every route of the app's routers (and of the routers and apps mounted on them) whose path
@xufa/router can match (static parts and `:params`) is one of its routes, with a plan made once: for each router on
the way, the layers that can meet the route's urls, in their order. Each router then tries only those (a mounted router
none of whose layers can is left out). The rest goes through every layer, as in Express: not found (only the layers
that can meet any url), paths of wildcards and RegExp, and the rest of a request once a layer changes `req.url` or
`req.method`. The plans are made at the first request, and again at the first request after a router changed
(`app.get()` after `listen` works). With plugins of @xufa/http (`app.register()`), an instance of @xufa/http routes the
requests: the plugins' routes are its own, the app's routes and the rest go to the app.

`bench/express.js` measures it against Express 5.2.1 on the same app (`bench/express/app.js`), each scenario on one and
the other in turn, the median of five rounds' pairs (run `express-6`, Windows): 1.32–1.49x the requests a second on
small routes (text, JSON, params, query, a JSON body, ten middlewares, a nested router, a thrown error), 1.85x on a
static file (a small file whose stat has not changed is sent from memory), 1.15x on 200 objects as JSON (the time of
`JSON.stringify`), 1.14x on not found, and 4.2x on the last router of a large app (40 routers of 10 routes mounted on
`/api`), where Express tries every layer before. The same code on both sides reads 0.92–1.07 there (the noise of the
machine). Over the loopback on Windows, writing the response to the socket is half of a small request's time and
Node.js's HTTP most of the rest; @xufa/express's own code is 2–4 µs of it. What keeps it small: requests and responses
created of classes whose prototypes are the app's (no change of prototype per request), params as objects V8 keeps fast
(not `Object.create(null)`, a dictionary), the types `res.type()` and `res.set()` compute and the ETag of the last
text sent kept, `req.fresh` reading no response header for a request without `If-None-Match` nor
`If-Modified-Since`, and a request no route matches trying only the layers that can meet it.

## What @xufa/express adds

- `express({ server })`: options of @xufa/http for its instance (`connectionTimeout`, `bodyLimit`...).
- `app.server(options)`: that instance, not listening (`await server.ready()`, `server.inject()`).
- `app.register(plugin, options)`: a plugin of @xufa/http with routes of its own (the explorer of
  [@xufa/openapi](../openapi), health checks), registered before the app's routes.

## What differs from Express

- **Charsets of bodies**: those of the WHATWG Encoding standard (Node's `TextDecoder`), latin-1 and utf-16 (its
  endianness from its byte order mark or its first characters, as iconv-lite reads it). iconv-lite's others (utf-32,
  cp437...) are `415 unsupported charset`.
- **Silent**: no `DEBUG` traces nor deprecation warnings.
- **`req.query`** is parsed once for each url (Express parses it at each read): the same object until `req.url` changes.
- **Prototypes**: requests and responses of other classes (@xufa/http's `inject`, another server's) keep their
  prototype, with Express's members on one between (Express replaces it, losing what the class does); those of the
  app's own server are created with the app's prototypes (no change per request).

## Tests and tools

`tools/port-express/port.js` ports Express's tests from a checkout of it (mocha's hooks and context made @xufa/test's,
requires of Express's files pointing at the package's, those of supertest and after at `test/support`) to
`test/upstream`; `tools/port-express/mime.js` writes
`lib/mime-db.js` (mime-types' answers, from mime-db: `LICENSE.express`).
