'use strict';

// The login of the admin, with @xufa/auth (passwords, lockout, codes of authenticator apps) and @xufa/session (the
// user of the admin kept in the session): a page of its own (GET login), POST login and POST logout under the prefix.
// The options are those of the login of @xufa/auth (findUser, password, totp, lastTotpStep, onTotp, rehash, lockout,
// passwordOptions, totpOptions), and allow(user) (who may use the admin) and name(user) (shown in the page).
//
//   app.register(sessionPlugin, { secret: process.env.SESSION_SECRET, store: ormStore(db) });
//   app.register(admin, { prefix: '/admin', models, login: { findUser: (name) => User.objects.get({ email: name }), allow: (user) => user.isStaff } });
const SESSION_KEY = 'xufa.admin.user';

class LoginError extends Error {
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

function loadAuth() {
  try {
    return require('@xufa/auth'); // eslint-disable-line global-require
  } catch (err) {
    throw new TypeError(`The login of the admin needs @xufa/auth (${err.message})`);
  }
}

// What the login needs, from its options.
function configureLogin(login) {
  if (!login || typeof login.findUser !== 'function') {
    throw new TypeError('login of the admin needs findUser(username, request)');
  }
  const auth = loadAuth();
  const passwordOf = login.password || ((user) => user.password);
  const totpOf = login.totp || (() => null);
  const allow = login.allow || (() => true);
  const nameOf = login.name || ((user, username) => username);
  const idOf = (user) => (user.pk !== undefined ? user.pk : user.id);
  // Failures counted by user (5 in 15 minutes), and by address with a limit of its own (20): guessing many users
  // from one address is locked, without locking out an office behind one address for a few typing errors.
  const lockoutOf = (given, maxAttempts) =>
    given === false
      ? null
      : given instanceof auth.Lockout
        ? given
        : new auth.Lockout({ maxAttempts, window: '15m', lockFor: '15m', ...given });
  const lockout = lockoutOf(login.lockout, 5);
  const ipLockout = lockoutOf(login.ipLockout, 20);
  // A hash to verify when there is no user, so that the answer takes the same time.
  let dummy = null;
  const dummyHash = () => {
    if (!dummy) dummy = auth.hashPassword('xufa-admin-no-user', login.passwordOptions);
    return dummy;
  };
  dummyHash().catch(() => {
    dummy = null;
  });

  // The user of the admin of a request (kept in its session), or null.
  function userOf(request) {
    if (!request.session || typeof request.session.get !== 'function') {
      throw new LoginError('The login of the admin needs @xufa/session (registered before the admin)', 500);
    }
    return request.session.get(SESSION_KEY) || null;
  }

  // Checks a username, a password and a code: the user of the admin to keep, or a LoginError.
  async function check(request, body) {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) throw new LoginError('Write your user and password', 400);
    const counted = [
      [lockout, `user:${auth.normalizeIdentifier(username)}`],
      [ipLockout, `ip:${request.ip}`],
    ].filter(([counter]) => counter);
    for (const [counter, key] of counted) {
      try {
        await counter.check(key);
      } catch (err) {
        if (err.retryAfter)
          throw new LoginError('Too many failed attempts: try again later', 429, { retryAfter: err.retryAfter });
        throw err;
      }
    }
    const failed = async () => {
      for (const [counter, key] of counted) await counter.fail(key);
      return new LoginError('Wrong user or password', 401);
    };
    const user = await login.findUser(username, request);
    const hash = user ? passwordOf(user) : null;
    const valid = await auth.verifyPassword(password, hash || (await dummyHash()));
    if (!user || !hash || !valid || !(await allow(user))) throw await failed();
    const secret = await totpOf(user);
    if (secret) {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      // The password was right: the page asks for the code (and says nothing before).
      if (!code) throw new LoginError('The code of your authenticator app', 401, { code: true });
      const after = login.lastTotpStep ? await login.lastTotpStep(user) : undefined;
      const step = auth.verifyTotp(code, secret, { ...login.totpOptions, after });
      if (step === null) throw Object.assign(await failed(), { code: true, message: 'Wrong code' });
      if (login.onTotp) await login.onTotp(user, step);
    }
    // A success forgets the failures of the user (not those of the address: an account of one's own does not open
    // the guessing of others).
    if (lockout) await lockout.succeed(`user:${auth.normalizeIdentifier(username)}`);
    if (login.rehash && auth.needsRehash(hash, login.passwordOptions)) {
      await login.rehash(user, await auth.hashPassword(password, login.passwordOptions));
    }
    return { id: idOf(user), name: String((await nameOf(user, username)) || username) };
  }

  return { userOf, check, SESSION_KEY };
}

module.exports = { configureLogin, LoginError, SESSION_KEY };
