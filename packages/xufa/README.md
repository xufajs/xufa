# xufa

**Documentation: [xufajs.github.io/xufa](https://xufajs.github.io/xufa/)**

A framework for Node.js in the spirit of Django: the parts a web application needs, built to work together, with no
dependencies outside its own packages.

```sh
npm install xufa
```

```js
import xufa from 'xufa';
// or: import xufa from 'xufa'

const app = xufa({ logger: true });
app.get('/', async () => ({ hello: 'world' }));
await app.listen({ port: 3000 });
```

## The command line

`xufa` is also a command, as `rails`, `artisan` and Django's `manage.py`:

```sh
npx xufa new shop                       # a project: xufa.yaml, templates/, its first app (home/), seeds/, test/
npx xufa startapp catalog               # an app: models.js, urls.yaml, views.js, admin.yaml, templates/ (added to apps)
npx xufa new api --api                  # an API instead: app.js, server.js, models/, routes/, jobs/, migrations/, test/
npx xufa generate resource Book title:string pages:integer:null author:references   # model, routes, migration
npx xufa migrate                        # makemigrations, showmigrations too
npx xufa routes                         # the routes of the app
npx xufa seed                           # the seeds of seeds/ (data for development, with factories)
npx xufa createsuperuser                # a superuser of the model of users (AbstractUser of @xufa/auth)
npx xufa shell                          # a REPL with app, db, queue and the models
npx xufa dev                            # the server, restarted on changes; xufa work: workers of the queue
npx xufa health                         # the checks of GET /health: database, queue
npx xufa test                           # the tests (NODE_ENV=test), each in a transaction rolled back
npx xufa down --message "Back at noon" --retry 600 --secret   # maintenance mode (--everywhere: every machine)
npx xufa up
```

An app of an API is a folder with `app.js`, which gives `build()` (the app), `database()` (its database, from `DATABASE_URL`,
with its models) and `jobs(db)` (its queue): `xufa new --api` writes one, and the commands load it, as they load a
project of `xufa.yaml`.

## Projects

A project is one file at its root, `xufa.yaml` (or `.yml`, `.json`, `.js`): Django's `settings.py` and `urls.py` as
names and values. xufa puts the app together from it: sessions, form bodies, templates, static files, emails, accounts
and their pages, roles, the admin, error pages, redirects. `xufa start` serves it and every command finds it.

```yaml
name: LocalLibrary
apps: [accounts, catalog] # folders: models.js, urls.yaml, views.js, admin.yaml, templates/, static/, migrations/
database: { url: sqlite:data/locallibrary.db }
auth: { user: accounts.User, loginBy: username, pages: /accounts }
rbac: { groups: accounts.Group, roles: { librarian: ['*.view', Book.*] } }
admin: { title: LocalLibrary administration }
views: { baseTemplate: base_generic, paginateBy: 10 }
redirects: { /: index }
```

The environment goes over it (`DATABASE_URL`, `SECRET_KEY`, `DEBUG`, `PORT`, `SITE_URL`, `EMAIL_URL`,
`APP__<KEY>__<KEY>`). An app's `urls.yaml` is its `urls.py`: routes to the views `views.js` exports (functions or views
of classes), `template:` and `redirect:` routes, and `crud: Book`, the five pages of a model with the built-in
templates of [@xufa/views](../views) when the app has none of its own. A model with a `<model>-detail` route gets
`absoluteUrl`. In code: `await loadProject(dir)`, `project.build()`, and `reverse(name, ...params)` of `xufa/project`.

Jobs, pipelines and tenants are keys of the file, and the admin shows them:

```yaml
queue: { work: { concurrency: 2 } } # the jobs of each app's jobs.js (functions, or { run, attempts... })
pipelines: true # the blocks of its blocks.js, the pipelines of its pipelines.yaml
tenants:
  apps: [catalog] # a database for each tenant, with the models of these apps
  database: { url: 'sqlite:data/tenants/{id}.db' }
  list: [central, north] # or { model: accounts.Branch, field: slug, label: name }
  resolve: subdomain # the tenant of a request, or user.<field>; without it, only the admin chooses one
```

Its tests: `const app = useTestApp({ fixtures: ['library'] })` of `xufa/testing` (Django's `TestCase`) builds the app
for a file of tests (SQLite in memory, migrated, light password hashes), rolls back each test, loads the fixtures
before each, and gives `app.client()`, `app.createUser(login, password)` and `app.mails`. Fixtures are YAML (or JSON)
objects by model: `$key` names one, relations point to it (`author: $leguin`), dates take `+14d`, users get their
passwords hashed, `$unless` runs a file once; `xufa seed` runs those of `seeds/`.
[examples/locallibrary](../../examples/locallibrary) is a whole project.

## Apps

`xufa/apps` is Django's `INSTALLED_APPS`: `defineApp({ name, dir, models, routes, prefix, admin, ready })` is an app
(a folder with its models, routes, `templates/`, `static/` and `migrations/`; its tables named `catalog_book`), and
`new Apps([accounts, catalog], { migrations })` the project: `APPS.register(db)`, `APPS.templates`, `APPS.static`,
`APPS.admin`, `APPS.plugin` (their routes and `ready()`), and `APPS.makeMigrations/migrate/showMigrations(db)`. With
`APPS` in `app.js`, `xufa makemigrations [app...]`, `xufa migrate` and `xufa showmigrations` work app by app.

Its other modules are those of the framework: `xufa/orm`, `xufa/auth`, `xufa/forms`, `xufa/views`, `xufa/template`,
`xufa/session`, `xufa/admin`, `xufa/mail`, `xufa/queue`, `xufa/scheduler`, `xufa/config`, `xufa/i18n`...

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
