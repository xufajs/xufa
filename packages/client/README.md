# @xufa/client

A client of HTTP APIs over `node:http` (or the `fetch` of Node.js: `transport: 'fetch'`), with no dependencies: base
URLs, query strings and JSON, answers parsed, timeouts, retries with backoff that wait what `Retry-After` says, errors
by status, hooks and logs. Bound to a request of [@xufa/http](../http), a call is cancelled when the client of that
request goes away, logs with `request.log` and sends its id on.

```js
import { createClient } from '@xufa/client';

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
  `content-type: application/json`) or `body`: a text, a Buffer, a stream of Node or of the web (sent as it comes), or
  what else `fetch` takes, with the type and length fetch gives it: `URLSearchParams`
  (`application/x-www-form-urlencoded;charset=UTF-8`), `FormData` (`multipart/form-data`, its files streamed, its
  length known before), `Blob` and `File` (their type and size), `ArrayBuffer`, typed arrays and `DataView`. A
  `content-type` you give is kept. A body that is a stream is sent once: it is not retried, and a redirect that needs
  it again (a 307 or a 308) is an error, as with fetch; forms and blobs are encoded again for each attempt.
- `timeout`: ms for each attempt (30000).
- `responseType`: `auto`, `json`, `text`, `buffer`, `stream` (a web `ReadableStream` of the body, read as it comes and
  decompressed; the timeout and the signal still cut it) or `response` (the `Response` of fetch);
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
- `transport`: `'http'` (the default) or `'fetch'`. `'http'` makes the calls over `node:http` and `node:https`, with
  connections kept for the next ones: about 35-40% more calls a second than the same client on fetch, and more than
  fetch alone (small JSON answers, on one machine). It does what fetch does: it asks for compressed answers
  (`accept-encoding: gzip, deflate, br`, unless you give one) and decompresses them, and follows redirects as fetch
  follows them (a GET after 303, credentials kept to their origin). Only these go through fetch: answers of
  `responseType: 'response'` (a `Response` of fetch), and calls with a `dispatcher`.
  `client.close()` closes the connections it keeps (those of the clients made from it with `extend()` and `for()`
  too); a call after it opens new ones.
- `proxy` (the http transport): a URL (`'http://proxy:3128'`, or `https:`; `http://user:password@proxy:3128` logs
  in with `Proxy-Authorization`), `'env'` (`HTTP_PROXY` for http: servers, `HTTPS_PROXY` for https: ones, unless
  `NO_PROXY` names the host: `*`, domains with their subdomains, `host:port`, addresses), or `false`. By default, the
  proxy of the environment when `NODE_USE_ENV_PROXY` is set, as Node.js decides for its own fetch (on Node.js 22,
  without it, fetch uses no proxy). https: servers are reached through a tunnel (`CONNECT`) with TLS to the server
  inside it, kept alive and reused as the connections without a proxy; requests to http: servers go to the proxy
  with the whole URL. A tunnel the proxy refuses is a `RequestError` whose `cause` has `code: 'XUFA_CLIENT_PROXY'` and
  the status (407: a login). The proxy is asked again after each redirect (another host may have none).
- `tls` (the http transport): options of TLS of its connections to https: servers and proxies: `ca` (a CA of your
  own), `cert` and `key` (a certificate of the client), `rejectUnauthorized`, `servername`...

A `proxy` or `tls` of your own needs the http transport: with `transport: 'fetch'` it is an error, and so is a call
that goes through fetch (`responseType: 'response'`...), rather than a call made without them. fetch takes them in a `dispatcher` of
undici.

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
