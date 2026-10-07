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

## The command line

`xufa` is also a command, as `rails`, `artisan` and Django's `manage.py`:

```sh
npx xufa new shop                       # app.js, server.js, models/, routes/, jobs/, migrations/, test/
npx xufa generate resource Book title:string pages:integer:null author:references   # model, routes, migration
npx xufa migrate                        # makemigrations, showmigrations too
npx xufa routes                         # the routes of the app
npx xufa seed                           # the seeds of seeds/ (data for development, with factories)
npx xufa shell                          # a REPL with app, db, queue and the models
npx xufa dev                            # the server, restarted on changes; xufa work: workers of the queue
npx xufa health                         # the checks of GET /health: database, queue
npx xufa down --message "Back at noon" --retry 600 --secret   # maintenance mode (--everywhere: every machine)
npx xufa up
```

An app is a folder with `app.js`, which gives `build()` (the app), `database()` (its database, from `DATABASE_URL`,
with its models) and `jobs(db)` (its queue): `xufa new` writes one, and the commands load it.

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
| `xufa/admin`                          | [`@xufa/admin`](../admin)                                            | The admin of the models, as Django's                           |
| `xufa/session`                        | [`@xufa/session`](../session)                                        | Sessions of browsers: signed cookies, flash messages, CSRF     |
| `xufa/queue`                          | [`@xufa/queue`](../queue)                                            | Jobs in the background, kept in a database of the ORM          |
| `xufa/client`                         | [`@xufa/client`](../client)                                          | A client of HTTP APIs                                          |
| `xufa/faults`, `xufa/faults/register` | [`@xufa/faults`](../faults)                                          | Faults for tests of resilience, cleared after each test        |
| `xufa/openapi`, `xufa/openapi/ui`     | [`@xufa/openapi`](../openapi)                                        | OpenAPI documents of the routes, and their explorer            |
| `xufa/expression`, `xufa/template`    | [`@xufa/expression`](../expression), [`@xufa/template`](../template) | Safe expressions, and templates over them                      |

The packages it is made of can be used alone; [`@xufa/logger`](../logger), [`@xufa/router`](../router),
[`@xufa/serializer`](../serializer), [`@xufa/inject`](../inject), [`@xufa/boot`](../boot) and
[`@xufa/errors`](../errors) are the parts of its HTTP layer.

## License

MIT.
