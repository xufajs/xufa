// The account of the user logged in (with the login of the admin and its reload): its password, an authenticator app
// (set up with a QR code, confirmed by its first code, removed) and its recovery codes, under api/_account. Every
// change asks for the password; a new password logs out the other sessions of the user.

function registerAccount(app, logins, { issuer }) {
  const { account } = logins;
  const answer = (reply, err) => {
    if (!err.statusCode) throw err;
    if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
    return reply.code(err.statusCode).send({ error: err.message, errors: err.errors || {} });
  };
  const bodyOf = (request) => (request.body && typeof request.body === 'object' ? request.body : {});
  const route = (method, url, handler) =>
    app[method](url, async (request, reply) => {
      try {
        return await handler(request, bodyOf(request));
      } catch (err) {
        return answer(reply, err);
      }
    });

  route('get', '/api/_account', async (request) => ({
    name: logins.userOf(request) ? logins.userOf(request).name : null,
    ...(await account.state(request)),
  }));
  route('post', '/api/_account/password', async (request, body) => {
    await account.changePassword(request, body);
    // The other sessions of the user end; this one goes on with a new CSRF token.
    if (typeof request.session.logoutOthers === 'function' && request.session.user !== null) {
      await request.session.logoutOthers();
    }
    return { ok: true, csrf: request.session.csrfToken() };
  });
  route('post', '/api/_account/totp/start', (request, body) => account.startTotp(request, body, issuer));
  route('post', '/api/_account/totp/confirm', (request, body) => account.confirmTotp(request, body));
  route('post', '/api/_account/totp/disable', async (request, body) => {
    await account.disableTotp(request, body);
    return { ok: true };
  });
  route('post', '/api/_account/recovery', (request, body) => account.renewCodes(request, body));
}

export { registerAccount };
