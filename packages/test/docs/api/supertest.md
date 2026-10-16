# supertest

`@xufa/test/supertest` is supertest 7's API, written anew: suites that use supertest switch by changing the `require` (or the import), and the package leaves their dependencies. It sends to an app of Express (or any request handler), a server of `node:http`, an instance of fastify or @xufa/http (made ready, its `app.server` served), or a URL.

```text
const request = require('@xufa/test/supertest');

await request(app).post('/users').send({ name: 'ada' }).expect(201).expect('Content-Type', /json/);
await request(app).post('/upload').field('title', 'photo').attach('file', 'test/photo.jpg').expect(200);
```

| Member | What it does |
| --- | --- |
| `request(app, options?)[method](path)` | A request: every method of `node:http`, and `del`. A handler gets a server of its own, closed after the request (`test._server`). `options.legacyPaths`: paths sent as supertest 6 sent them (dot segments kept) |
| `.set(field, value)`, `.unset`, `.type`, `.accept`, `.auth(user, password)`, `.query(object \| string)` | Headers, basic authorization, the query string (objects as superagent writes them) |
| `.send(data)`, `.write(chunk)` | Objects as JSON (or a form, with `.type('form')`), strings as a form unless typed, Buffers as they are; `.write` streams the body |
| `.field(name, value \| object)`, `.attach(field, path \| Buffer, filename \| options)` | multipart/form-data, as form-data writes it (the type of a file from its path, or from the filename) |
| `.agent(httpAgent)`, `.redirects(n)`, `.timeout(ms)`, `.responseType(type)`, `.parse(fn)` | Connections of an agent (keep-alive); redirects followed (none by default); a deadline; the body as a Buffer; a parser of your own |
| `.expect(status[, body])`, `.expect(field, value)`, `.expect(body)`, `.expect(fn)` | Checks, run when the request ends, with supertest's messages; a callback last ends the request |
| `.end(fn)`, `await` | Sends it: `fn(err, res)`, or the response (rejected when a check fails) |
| The response | `status`, `ok`, `error`, `redirect`..., `headers`, `type`, `charset`, `links`, `text`, `body` (JSON and forms parsed, binary types a Buffer) |
| `request.agent(app)` | Requests that keep the cookies they are given, and what is set on the agent |
