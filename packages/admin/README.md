# @xufa/admin

The admin of the models of [@xufa/orm](../orm), as Django's: a page with the list of each model (search, filters,
order, pages) and its forms (from its fields, with the errors of its validation), for every backend of the ORM, as a
plugin of [@xufa/http](../http). No dependencies, and no build: the page is one document with its script.

Its documentation is in [docs/admin/](../../docs/admin/index.html). This file is the summary.

```sh
npm install @xufa/admin
```

```js
const { admin } = require('@xufa/admin');

app.register(admin, {
  prefix: '/admin',
  models: [Book, [Author, { list: ['name', 'country'], search: ['name'] }]],
  authorize: (request) => request.user?.role === 'staff', // or login (its own login page); 'development' too
  title: 'Bookshop',
  pipelines, // optional: the runs of a Pipelines of @xufa/queue
});
```

- Lists: the columns of `list` (the first six fields by default), a search in `search` (the string fields), filters
  of `filters` (booleans, choices and foreign keys), an order by any column, and pages.
- Forms: an input for each field (text, numbers, checkboxes, dates, choices, a select of the objects of a foreign
  key, JSON), the required ones marked; the keys, automatic dates and `readOnly` fields shown, not changed. The
  errors of the model (its fields, its rules, unique values) are shown by field.
- Labels: an object is shown by its `toString()` (as Django's `__str__`), or its first string field.
- Deletes are those of the model: with `softDelete`, the object is kept with its date. `readOnlyModel: true` only
  shows a model.
- Pipeline runs and health: with `pipelines` (a `Pipelines` of [@xufa/queue](../queue)), the runs of their pipelines:
  a list by status and pipeline, and each run with the graph of its steps (colored by status), the step chosen (times,
  attempts, `pausedUntil`, output, error), and Retry, Cancel and Resume (with an output). With `xufa.health` of
  [@xufa/http](../http) registered, the first page shows the health of the app and its checks.
- Login: with `login` (`findUser`, `allow`, and the options of the login of [@xufa/auth](../auth): `totp`,
  `rehash`, `lockout`...), a login page of its own (`GET login`, `POST login`, `POST logout`), the user kept in
  [@xufa/session](../session) (registered before the admin): scrypt passwords in constant time, the same answer for
  every wrong user or password, lockouts by user (5) and by address (20), codes of authenticator apps, a new session id
  at the login, and the CSRF token of the session sent by the page.
- Security: every request is asked to `authorize(request, reply)`; writes need the header the page sends
  (`x-xufa-admin: 1`), which a form of another site cannot send, so they need no CSRF token.

## License

MIT
