# @xufa/session

Sessions of browsers for [@xufa/http](../http), as those of Django and Laravel: values kept between the requests of a
browser by a signed cookie, in memory or in a database of [@xufa/orm](../orm) (any backend, deleted when they expire
by a TTL index), with flash messages and CSRF tokens. No dependencies.

Its documentation is in [docs/session/](../../docs/session/index.html). This file is the summary.

```sh
npm install @xufa/session
```

```js
import { sessionPlugin, ormStore } from '@xufa/session';

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
  HTTPS, for `maxAge` (14 days, made again by its requests: `rolling`). A cookie that is not signed by a secret, or of
  a session that is not there, starts a new one.
- A session is saved when the reply is sent, if it changed; a request that does not use it makes none. `rolling`
  pushes its expiry back when `touchAfter` has passed since it was last written (1 hour, or half of `maxAge` when that
  is shorter; `0`: every request), so reading a session does not write it at every request.
- `regenerate()` gives it a new id (the old one is deleted), `destroy()` ends it and clears the cookie, and
  `flash(key, value)` keeps a value for the next request only; `message(text, level)` and `messages()` are messages for
  the user, as Django's (shown once, by the next page).
- With `csrf: true`, POST, PUT, PATCH and DELETE of a session need its token (`csrfToken()`), as a header
  (`x-csrf-token`) or a field of the body (`_csrf`): a 403 otherwise. Requests without a session, and routes with
  `config: { csrf: false }` (webhooks), do not. While a session keeps nothing, its token goes in a signed cookie of its
  own (`sid_csrf`, as Django's `csrftoken`) instead of the store: a visitor who only sees pages with forms makes no
  session, and the writes of a browser with that cookie are checked against it (a login form). A session that starts
  keeping something keeps that token; a login makes a new one.
- `await request.session.login(userId)` ties a session to its user (`request.session.user`), and
  `await request.session.logoutEverywhere()` ends every session of that user in every browser, process and machine
  with the store (`logoutOthers()`: all but this one; `app.sessions.logoutUser(id)`: those of another user). The
  store keeps a generation of each user (`user:<id>`), raised by them: sessions of an older one are emptied at their
  next request.
- `app.sessions.list(userId)`: the sessions of a user with their devices (`{ handle, agent, ip, since, seen,
expiresAt }`, last seen first), and `app.sessions.end(userId, handle)` ends one; handles are hashes of the ids
  (`request.session.handle` is that of a request), so a list never gives a session away.
- `ormStore(db)` registers its model (table `xufa_sessions`) in the database: `db.sync()` or a migration makes it, and
  `db.expire()` (or the `expire` option of the plugin of the ORM) deletes the sessions that expired.

## License

MIT
