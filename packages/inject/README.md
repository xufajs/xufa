# @xufa/inject

Fake HTTP requests to a Node.js request handler, without a socket, with the API of
[light-my-request](https://github.com/fastify/light-my-request), and no dependencies. It is `inject()` of
[xufa](../xufa), and works with any `(req, res)` handler.

```js
const inject = require('@xufa/inject');

const handler = (req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end(`${req.method} ${req.url}`);
};

const res = await inject(handler, { method: 'POST', url: '/items?x=1', payload: { a: 1 } });
res.statusCode; // 200
res.payload; // 'POST /items?x=1'
res.json(); // parses the payload
```

## Same as light-my-request

The options (`url` as a string or an object, `method`, `headers`, `query`, `payload` as a string, Buffer, object or
stream, `cookies`, `remoteAddress`, `authority`, `signal`, `simulate`, `validate`, `server`...), the response
(`statusCode`, `headers`, `payload`, `rawPayload`, `body`, `json()`, `stream()`, `cookies`, `trailers`), the chained
API (`inject(handler).get('/').headers({...}).end()`) and `isInjection()`. It passes light-my-request's test suite.

## TypeScript

light-my-request's declarations.

## License

MIT. The declarations are ported from light-my-request (MIT).
