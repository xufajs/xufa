# @xufa/session

Sessions of browsers for [@xufa/http](../http), as those of Django and Laravel: values kept between the requests of a
browser by a signed cookie, in memory or in a database of [@xufa/orm](../orm) (any backend, deleted when they expire
by a TTL index), with flash messages and CSRF tokens. No dependencies.

Its documentation is in [docs/session/](../../docs/session/index.html). This file is the summary.

```sh
npm install @xufa/session
```

```js
const { sessionPlugin, ormStore } = require('@xufa/session');

app.register(sessionPlugin, {
  secret: process.env.SESSION_SECRET, // 32 characters or more; [new, old] to rotate them
  store: ormStore(db), // memoryStore() by default: one process
  csrf: true, // writes of a session need its token
});

app.post('/login', async (request, reply) => {
  const user = await checkPassword(request.body);
  request.session.regenerate().set('userId', user.pk); // a new id after a login
  request.session.flash('notice', 'Welcome back'); // for the next request only
  return reply.redirect('/');
});

app.get('/', async (request) => ({
  userId: request.session.get('userId'),
  notice: request.session.flash('notice'),
  csrf: request.session.csrfToken(), // forms send it back: _csrf, or the header x-csrf-token
}));
```

- The cookie (`sid`) carries the id of the session signed with HMAC-SHA256: `HttpOnly`, `SameSite=Lax`, `Secure` on
  HTTPS, for `maxAge` (14 days, made again by each request: `rolling`). A cookie that is not signed by a secret, or of
  a session that is not there, starts a new one.
- A session is saved when the reply is sent, if it changed; a request that does not use it makes none.
- `regenerate()` gives it a new id (the old one is deleted), `destroy()` ends it and clears the cookie, and
  `flash(key, value)` keeps a value for the next request only.
- With `csrf: true`, POST, PUT, PATCH and DELETE of a session need its token (`csrfToken()`), as a header
  (`x-csrf-token`) or a field of the body (`_csrf`): a 403 otherwise. Requests without a session, and routes with
  `config: { csrf: false }` (webhooks), do not.
- `ormStore(db)` registers its model (table `xufa_sessions`) in the database: `db.sync()` or a migration makes it, and
  `db.expire()` (or the `expire` option of the plugin of the ORM) deletes the sessions that expired.

## License

MIT
