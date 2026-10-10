# @xufa/admin

The admin of the models of [@xufa/orm](../orm), as Django's: a page with the list of each model (search, filters,
order, pages) and its forms (from its fields, with the errors of its validation), for every backend of the ORM, as a
plugin of [@xufa/http](../http). The page is made with React and comes built in the package: installing the admin
installs nothing else, and the app builds nothing.

Its documentation is in [docs/admin/](../../docs/admin/index.html). This file is the summary.

```sh
npm install @xufa/admin
```

```js
import { admin } from '@xufa/admin';

app.register(admin, {
  prefix: '/admin',
  models: [Book, [Author, { list: ['name', 'country'], search: ['name'] }]],
  authorize: (request) => request.user?.role === 'staff', // or login (its own login page); 'development' too
  title: 'Bookshop',
  pipelines, // optional: the runs of a Pipelines of @xufa/queue
});
```

- In a project of `xufa`, each app's `admin.yaml` lists its models by name with these options (`Author: { list:
[name, country], search: [name] }`; `Book:` alone for none).
- The page: a sidebar with the models, jobs and runs; a header with where you are, the tenant and your account; a
  dashboard (models, jobs and runs by status, the jobs due and the wait of the oldest, health); light and dark themes; phones (the sidebar is a drawer). The search, filters, order and page of a list are
  in the address. Forms save as Django's (Save, Save and keep editing with Ctrl+S, Save and add another), check
  required fields, choose foreign keys in a combobox that searches, and ask before leaving with changes. Its files are
  served under `assets/` with their hash (cached for good) and compressed. Its sources are in `client/src` (React):
  `npm run build` makes `lib/client/dist` again.
- Searches: each word in one of the fields of `search` (`"quoted words"` are one); paths across relations
  (`author__name`, and back: `bookSet__title`), `^name` (the start) and `=code` (exactly).
- Lists: the columns of `list` (the first six fields by default; also paths across foreign keys as
  `author__name`, methods and getters of the model as `displayGenre`, many-to-many fields, and
  `{ name, label, value(object) }`, as Django's `list_display`), a search in `search` (the string fields), filters of
  `filters` (booleans, choices and foreign keys), an order by any field or path, and pages. `editable` (Django's
  `list_editable`) changes booleans and choices in the rows, each saved as it changes; _Columns_ hides and shows the
  columns, kept by the browser for each model.
- Forms: an input for each field (text, numbers, checkboxes, dates, choices, a select of the objects of a foreign
  key, the objects of a many-to-many, JSON), the required ones marked; the keys, automatic dates and `readOnly` fields
  shown, not changed. `fields` (some on one line) and `fieldsets` (titles, descriptions, collapse) give their order
  and groups, as Django's. The errors of the model (its fields, its rules, unique values) are shown by field.
- Labels: an object is shown by its `toString()` (as Django's `__str__`), or its first string field.
- Rules of objects: the `where` of the roles of `rbac` (an editor changes its own books) limit lists, objects,
  counts, changes, deletes, actions and inlines, and the page knows what it may do with each object.
- History: with the audit log of the database (`audit: true` of @xufa/orm), each object has its history (who changed
  what, from what to what) and the dashboard the recent actions, as Django's; the writes of the admin are recorded with
  their user.
- Actions: `actions: { markPublished: (books) => books.update({ published: true }) }` (or `{ run, label,
permission, confirm, danger }`) are buttons of the bar of the objects selected in a list; run gets a QuerySet of
  them and answers the message shown (or a count). They need `<Model>.change` unless `permission` says another.
- Your account: with the login and `reload`, a page to change the password (`setPassword`: the other sessions end),
  set up an authenticator app with a QR code (`setTotp`) and get recovery codes (`recoveryCodes`,
  `setRecoveryCodes`), shown once; each logs in once in place of a code. Changes ask for the password.
- Languages: the errors of the API that the page shows are keys of `ADMIN_MESSAGES` (and those of the login of
  `AUTH_MESSAGES` of @xufa/auth): `i18n.translateAuth(auth).translateAdmin(admin)` of [@xufa/i18n](../i18n).
- Users of a model: `login: { model: User }` with an AbstractUser of @xufa/auth (log in by username, the active
  staff, passwords, authenticator apps and recovery codes when the model has their fields, lastLogin).
- Sessions: with the login and @xufa/session, _Your sessions_ (menu of the account) lists the browsers logged in as
  you (device, address, since, last seen) and ends any other; with `_sessions.view`/`.change`, those of another user.
- Related lists: below the form of an object, the objects of other models of the admin that point to it (an author's
  books), in pages, with _Add Book_ (its author given) and _In their list_; foreign keys are links to their objects.
  `inlines: [{ relation: 'bookSet', fields, extra }]` edits them in rows instead (Django's `TabularInline`): checked
  row by row, saved at once in a transaction; a new object is saved with its rows.
  `inlines: ['bookSet']` chooses them, `inlines: false` hides them.
- Deletes are those of the model: with `softDelete`, the object is kept with its date. `readOnlyModel: true` only
  shows a model.
- Pipeline runs and health: with `pipelines` (a `Pipelines` of [@xufa/queue](../queue)), the runs of their pipelines:
  a list by status and pipeline, and each run with the graph of its steps (colored by status, ordered to cross the
  fewest arrows; a step that runs another pipeline shows how far that run is; it pans and zooms, with React Flow in the
  bundle), the step chosen (times,
  attempts, `pausedUntil`, output, error), and Retry, Cancel and Resume (with an output). _Start a run_ (with
  `_runs.change`): the pipeline (with the graph of its steps), its input as JSON, now or later (`10m`, or a date), its priority and a key.
  With `scheduler` (of @xufa/scheduler), Schedules in Work: each job's next and last run, the runs of those that start
  pipelines (`pipelines.schedule()`), and Run now. With `xufa.health` of
  [@xufa/http](../http) registered, the first page shows the health of the app and its checks.
- Jobs: with `queue` (a `Queue` of [@xufa/queue](../queue)), its jobs by status, name and queue, each with its
  payload, result and error; Retry a failed one or all failed ones (of a name), and Delete one that does not run.
- Work: with `queue` and `pipelines`, the jobs of the app and the runs of the pipelines in one list, newest first, by
  status (`GET api/_work`), with a switch to each; runs that start later are shown as scheduled.
- Login: with `login` (`findUser`, `allow`, and the options of the login of [@xufa/auth](../auth): `totp`,
  `rehash`, `lockout`...), a login page of its own (`GET login`, `POST login`, `POST logout`), the user kept in
  [@xufa/session](../session) (registered before the admin): scrypt passwords in constant time, the same answer for
  every wrong user or password, lockouts by user (5) and by address (20), codes of authenticator apps, a new session id
  at the login, and the CSRF token of the session sent by the page. The menu of the account logs out of the other
  sessions of the user, or everywhere (every browser, process and machine with the store of the sessions). With `reload(id, request)`, every request loads
  the user again: one deleted, or that `allow` refuses now, is logged out at once.
- Security: every request is asked to `authorize(request, reply)`; writes need the header the page sends
  (`x-xufa-admin: 1`), which a form of another site cannot send, so they need no CSRF token.
- Roles and tenants: with `rbac` (an `Rbac` of [@xufa/auth](../auth), or its options), each user sees the models it
  may view and the buttons of what it may do (`<Model>.view`, `.add`, `.change`, `.delete`; `_jobs.*`, `_runs.*`,
  `_health.view` in every tenant). With `tenants` (`{ tenants, list, label }`: the `Tenants` of the ORM), the page
  chooses a tenant among those of the user (`x-xufa-tenant`), and the models and permissions are those of that tenant:

  ```js
  app.register(admin, {
    models: [Book, Author],
    login: { findUser, reload },
    rbac: { roles: { viewer: ['*.view'], editor: { inherits: 'viewer', permissions: ['Book.*'] } }, grants },
    tenants: { tenants, list: () => Organization.objects.valuesList('slug', { flat: true }) },
  });
  ```

- Languages: the page speaks Spanish, French, German, Portuguese or Italian (English otherwise): the option
  `language` (fixed), else the one chosen in its menu (the cookie `xufa-admin-language`), else `request.locale` (of
  [@xufa/i18n](../i18n)), else the `Accept-Language` of the browser.
  `uiMessages: { es: { Save: 'Grabar' }, ca: { ... } }` changes texts (by their English) or adds languages.

## License

MIT
