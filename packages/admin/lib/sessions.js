// The sessions of the users (app.sessions of @xufa/session, with the login of the admin): those of the user logged in
// (api/_account/sessions: every user may see and end its own), and those of another user by its id
// (api/_sessions/:user: with the permissions _sessions.view and _sessions.change). Sessions are named by their handles
// (a hash of their ids): an id would open them.

import { message as msg } from './messages.js';

class SessionsError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SessionsError';
    this.statusCode = statusCode;
  }
}

const rowOf = (item, current) => ({
  handle: item.handle,
  agent: item.agent,
  ip: item.ip,
  since: item.since,
  seen: item.seen,
  expiresAt: item.expiresAt,
  current: item.handle === current,
});

function registerSessions(app) {
  const answer = (reply, err) => {
    if (err instanceof SessionsError) return reply.code(err.statusCode).send({ error: err.message, errors: {} });
    throw err;
  };
  const userOf = (request) => {
    const user = request.session && request.session.user;
    if (user === null || user === undefined) throw new SessionsError(msg('logInFirst'), 401);
    return user;
  };
  const currentOf = (request) => (request.session ? request.session.handle : null);

  app.get('/api/_account/sessions', async (request, reply) => {
    try {
      const sessions = await app.sessions.list(userOf(request));
      return { results: sessions.map((item) => rowOf(item, currentOf(request))) };
    } catch (err) {
      return answer(reply, err);
    }
  });
  // This one is ended by logging out.
  app.post('/api/_account/sessions/:handle/end', async (request, reply) => {
    try {
      const user = userOf(request);
      if (request.params.handle === currentOf(request)) {
        throw new SessionsError(msg('sessionInUse'));
      }
      if (!(await app.sessions.end(user, request.params.handle))) throw new SessionsError(msg('noSession'), 404);
      return { ended: true };
    } catch (err) {
      return answer(reply, err);
    }
  });

  app.get('/api/_sessions/:user', async (request) => {
    const sessions = await app.sessions.list(request.params.user);
    return { user: request.params.user, results: sessions.map((item) => rowOf(item, currentOf(request))) };
  });
  app.post('/api/_sessions/:user/:handle/end', async (request, reply) => {
    try {
      if (!(await app.sessions.end(request.params.user, request.params.handle))) {
        throw new SessionsError(msg('noSession'), 404);
      }
      return { ended: true };
    } catch (err) {
      return answer(reply, err);
    }
  });
  // Every session of a user.
  app.post('/api/_sessions/:user/end', async (request) => {
    await app.sessions.logoutUser(request.params.user);
    return { ended: true };
  });
}

export { registerSessions, SessionsError };
