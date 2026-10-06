# xufa

**Documentation: [xufajs.github.io/xufa](https://xufajs.github.io/xufa/)**

A framework for Node.js in the spirit of Django: the parts a web application needs, built to work together, with no
dependencies outside its own packages.

```sh
npm install xufa
```

```js
const xufa = require('xufa');
// or: import xufa from 'xufa'

const app = xufa({ logger: true });
app.get('/', async () => ({ hello: 'world' }));
await app.listen({ port: 3000 });
```

## For now

xufa is its HTTP layer: this package gives [`@xufa/http`](../http) (the API of fastify) as it is, and the rest of
the framework by its paths:

| Path                                  | Package                                                              | What it is                                                     |
| ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `xufa/orm`                            | [`@xufa/orm`](../orm)                                                | The ORM, over SQLite, PostgreSQL, MongoDB, files and memory    |
| `xufa/auth`                           | [`@xufa/auth`](../auth)                                              | Passwords, JWTs, TOTP, lockouts, refresh tokens and its plugin |
| `xufa/schema`                         | [`@xufa/schema`](../schema)                                          | JSON Schemas as code, typed                                    |
| `xufa/config`                         | [`@xufa/config`](../config)                                          | The configuration, by environment, with a schema               |
| `xufa/scheduler`                      | [`@xufa/scheduler`](../scheduler)                                    | Jobs on intervals, cron or once                                |
| `xufa/client`                         | [`@xufa/client`](../client)                                          | A client of HTTP APIs                                          |
| `xufa/faults`, `xufa/faults/register` | [`@xufa/faults`](../faults)                                          | Faults for tests of resilience, cleared after each test        |
| `xufa/openapi`, `xufa/openapi/ui`     | [`@xufa/openapi`](../openapi)                                        | OpenAPI documents of the routes, and their explorer            |
| `xufa/expression`, `xufa/template`    | [`@xufa/expression`](../expression), [`@xufa/template`](../template) | Safe expressions, and templates over them                      |

The packages it is made of can be used alone; [`@xufa/logger`](../logger), [`@xufa/router`](../router),
[`@xufa/serializer`](../serializer), [`@xufa/inject`](../inject), [`@xufa/boot`](../boot) and
[`@xufa/errors`](../errors) are the parts of its HTTP layer.

## License

MIT.
