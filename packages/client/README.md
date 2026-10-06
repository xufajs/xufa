# @xufa/client

A client of HTTP APIs on the `fetch` of Node.js, with no dependencies: base URLs, query strings and JSON, answers
parsed, timeouts, retries with backoff that wait what `Retry-After` says, errors by status, hooks and logs. Bound to a
request of [@xufa/http](../http), a call is cancelled when the client of that request goes away, logs with
`request.log` and sends its id on.

```js
const { createClient } = require('@xufa/client');

const books = createClient({ baseUrl: 'https://api.example.com/v1', headers: { authorization: `Bearer ${token}` } });

const list = await books.get('/books', { query: { author: 'ada', tags: ['sf', 'classic'] } });
const created = await books.post('/books', { json: { title: 'Dune' } });

app.get('/shelf', async (request) => books.for(request).get('/books')); // cancelled if the browser leaves
```

## Calls

`get`, `head`, `options`, `post`, `put`, `patch`, `delete` (and `request(method, path, options)`) give the body of the
answer: JSON when its content-type says so, text otherwise, nothing for 204 and HEAD. Options, for the client
(`createClient`) or a call (merged: headers, retry and hooks add to those of the client):

- `baseUrl`: paths are joined to it, its path kept (`/v1` + `/books` is `/v1/books`); absolute URLs are used as they
  are.
- `headers`, `query` (arrays repeat the key, dates are ISO, `undefined` and `null` are left out), `json` (a body with
  `content-type: application/json`) or `body` (as `fetch` takes it).
- `timeout`: ms for each attempt (30000).
- `responseType`: `auto`, `json`, `text`, `buffer`, `stream` or `response` (the `Response` of fetch);
  `resolveBodyOnly: false` gives `{ status, headers, body, url }`.
- `throwHttpErrors: false`: error statuses are answers.
- `retry`: `{ attempts, methods, statuses, delay, factor, maxDelay, jitter, maxRetryAfter }`, a number of attempts,
  or `false`. 3 attempts by default, for the idempotent methods (GET, HEAD, OPTIONS, PUT, DELETE, TRACE) and the
  statuses that may pass (408, 413, 429, 500, 502, 503, 504, 521, 522, 524), timeouts and failed connections; the
  waits grow (100 ms, 200 ms...) with jitter, or are what `Retry-After` asks (up to `maxRetryAfter`, 60 s). Bodies
  that are streams are not sent again.
- `hooks`: `beforeRequest(call)` (it can change `call.headers`, `call.url`, `call.body`) and
  `afterResponse(response, call)`.
- `log`: a logger (`request.log` of the bound request by default): `outgoing request`, `incoming response` (with its
  status and ms) and `retrying`, at debug, without headers.
- `signal`: an AbortSignal that stops the call and its retries.
- `dispatcher`: a dispatcher of undici (proxies, pools of connections), given to fetch. On Node.js 24,
  `NODE_USE_ENV_PROXY=1` makes fetch use `HTTP_PROXY` and `HTTPS_PROXY`.

`client.extend(options)` makes a client with more options (as `got.extend`). `client.for(request)` binds it to a
request of @xufa/http (or fastify): `request.signal` cancels it (the API called sees its connection closed),
`request.log` logs it, and `request.id` goes in `x-request-id` (`requestIdHeader`).

Errors: `HTTPError` (an error status: `status`, `headers`, `body` parsed), `TimeoutError`, `RequestError` (the request
could not be made: `cause`), all with `method` and `url`; a call cancelled throws the reason of its signal.

## Faults (tests of resilience)

`client.faults` (of [@xufa/faults](../faults)) makes calls fail, wait, hang or get a status of your choice without
reaching the API, to see what the app does when the API it calls is down, slow or busy. The clients made by
`extend()` and `for()` share the faults of theirs.

```js
payments.faults.fail({ operations: 'write', paths: '/charges', rate: 0.2 }); // as a refused connection
payments.faults.respond({ status: 503, headers: { 'retry-after': '1' }, json: { error: 'busy' }, times: 2 });
payments.faults.delay({ ms: 2000, paths: [/^/refunds/] });
payments.faults.hang({ operations: 'read' }); // the timeout of the call ends it: a TimeoutError
payments.faults.down(); // until payments.faults.up()
```

- Operations: `get`, `head`, `options`, `post`, `put`, `patch`, `delete` (`read` and `write`); filters
  `urls` (the whole URL) and `paths` (its path): prefixes or regular expressions.
- `fail` and `down` are failed connections (a `RequestError` whose cause has the code `ECONNREFUSED`), retried as
  such. `respond({ status, headers, json | body })` answers without the call: a 503 with `Retry-After` is retried
  after it, a 404 is an `HTTPError`.
- Each attempt goes through the faults: `times: 2` with 3 attempts fails twice, and the third reaches the API.

## retry()

`retry(fn, { attempts, until, retryOn, delay, factor, maxDelay, jitter, wait, signal, onRetry })` calls `fn(attempt)`
until it gives a result `until` accepts (a `RetryError` with the last `result` after the last attempt), or fails with
an error `retryOn` does not retry (the last error after the last attempt):

```js
const job = await retry(() => api.get(`/jobs/${id}`), {
  until: (job) => job.state === 'done',
  attempts: 20,
  delay: 500,
});
```

## License

MIT.
