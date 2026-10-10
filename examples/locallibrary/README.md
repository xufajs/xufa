# LocalLibrary, from Django to xufa

The LocalLibrary of the [MDN Django tutorial](https://developer.mozilla.org/en-US/docs/Learn/Server-side/Django/Tutorial_local_library_website),
ported to xufa. The Django project is next to it, as it is, in [`../django-locallibrary`](../django-locallibrary)
(CC0): read them side by side.

A catalog of books, authors, genres, languages and copies of books that users borrow: pages of every model in lists
of pages and details, forms to create, update and delete them (for librarians), the copies a user borrowed and every
copy on loan, the renewal of a copy, logins and password resets by email, permissions by role and by user, a counter
of visits in the session, the admin, and the tests. And what the tutorial has not: a job in the background (the
report of overdue loans, `catalog/jobs.js`), run by the queue of `xufa.yaml` and shown in the admin (Work).

## Run it

From the root of the repository (`pnpm install` links the workspace):

```sh
cd examples/locallibrary
npm run migrate   # xufa migrate: the tables, in data/locallibrary.db (SQLite)
npm run seed      # xufa seed: seeds/library.yaml, users, genres, languages, authors, books and copies
npx xufa createsuperuser   # another superuser (asks its password)
npm start         # xufa start: http://127.0.0.1:8000/
npm test          # xufa test: the tests of Django, ported, and more
```

The users of the seed (password `xufa-library`): `admin` (superuser: the admin at `/admin` and everything),
`librarian` (staff with the role librarian: the forms, every copy on loan, renewals) and `reader` (who borrowed some
books: My borrowed). Password resets send their email to the console.

Settings (`xufa.yaml`): the environment goes over it, `DATABASE_URL` (`sqlite:data/locallibrary.db`; `postgres://`,
`mongodb://` or `memory:` work too), `SECRET_KEY`, `PORT` (8000), `HOST`, `SITE_URL`, `EMAIL_URL` (`console:`, or
`smtp://`), `DEBUG`, and `APP__<KEY>__<KEY>` for any other; in `.env` too.

## From Django to xufa

| Django                                        | Here                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `locallibrary/settings.py`                    | `xufa.yaml` (the project: apps, database, mail, auth, roles, admin, views); the environment goes over it   |
| `locallibrary/urls.py`, `catalog/urls.py`     | `redirects:` of `xufa.yaml`, `catalog/urls.yaml` (`crud:` the five pages of a model), `auth.pages`         |
| `catalog/models.py`                           | `catalog/models.js` (@xufa/orm), `accounts/models.js` (the user)                                           |
| `catalog/views.py` (generic views)            | `crud:` of `catalog/urls.yaml`, and `catalog/views.js` for the views with logic of their own (@xufa/views) |
| `catalog/forms.py`                            | `catalog/forms.js` (@xufa/forms: `Form`, `ModelForm`); bodies by `xufa.formBody`                           |
| `catalog/admin.py`                            | `catalog/admin.js` (@xufa/admin)                                                                           |
| templates (`{% extends %}`, `{% block %}`)    | `catalog/templates/` (@xufa/template); the forms and deletes are the built-in templates of @xufa/views     |
| `django.contrib.auth` (login, password reset) | `auth.accounts` and `auth.pages` of @xufa/auth (`templates/registration/*`), @xufa/session                 |
| permissions, groups                           | `rbac:` of `xufa.yaml` (roles, and `Group` rows edited in the admin), and the permissions of each user     |
| `EMAIL_BACKEND` console                       | `mail:` of `xufa.yaml` (@xufa/mail on the console-mail backend: `EMAIL_URL=console:`)                      |
| `catalog/apps.py`, `catalog/migrations/`      | the folder `catalog/` (an app by its files), `catalog/migrations/` (`xufa makemigrations`, by app)         |
| `catalog/tests/`, fixtures                    | `test/` (`useTestApp()` of `xufa/testing`: SQLite in memory, each test rolled back), `seeds/library.yaml`  |
| `manage.py runserver`, `migrate`, `test`      | `npm start`, `npm run migrate`, `npm test` (the xufa command)                                              |

Differences that are not gaps:

- Views load what their templates show (`selectRelated`, `prefetchRelated`: then `book.bookInstanceSet` is read in
  the template, as Django's `book.bookinstance_set.all`): the templates of xufa read values, they do not query.
- Labels, help texts and choices with labels are options of the fields (`label`, `help`, `choices: [['o', 'On loan']]`),
  and `copy.display('status')` is `get_status_display()`.
- `objects.create()` validates (choices, lengths, required fields): a test of Django that made copies with a status
  that is no choice (`'m'`) uses `'d'`.
- Writes of forms carry the CSRF token of the session (`_csrf`), as `{% csrf_token %}`.

## The gaps

What xufa did not have for this port was written where it was missed (`GAP (backlog E…)` in the code), made small
here, then built in the framework and taken out of the example: forms (@xufa/forms), generic views (@xufa/views),
template inheritance, named routes, static files, pagination, choices and labels, constraints, the user model,
the pages of the accounts (`auth.pages`), error pages, the test client, the admin's many-to-many fields, columns,
fieldsets and inlines edited in rows, apps (`xufa/apps`), and groups in the database (Django's groups: `Group` of
`accounts/models.js`, roles of the Rbac, edited in the admin). None is left.
