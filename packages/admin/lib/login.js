// The login of the admin, with @xufa/auth (its Credentials: passwords, lockouts, codes of authenticator apps and
// recovery codes, as the accounts of @xufa/auth) and @xufa/session (the user of the admin kept in the session): a page
// of its own (GET login), POST login and POST logout under the prefix. The options are those of the Credentials
// (findUser, password, totp, lastTotpStep, onTotp, rehash, lockout, ipLockout, passwordOptions, totpOptions), and
// allow(user) (who may use the admin), name(user) (shown in the page) and reload(id, request) (the user again in every
// request: one deleted, or not allowed any more, is logged out at once). With the rbac of the admin, the session keeps
// what the user may (its access: grants and superuser), made at the login (and again in every request with reload);
// allow is then by default a user with a grant (or a superuser).
// The account of the user (with reload): setPassword(user, hash, request) lets it change its password
// (minPasswordLength, 10), setTotp(user, secret | null, request) set up an authenticator app (a QR code) or remove it,
// and recoveryCodes(user) with setRecoveryCodes(user, hashes, request) gives it codes to log in once without the app.
//
//   app.register(sessionPlugin, { secret: process.env.SESSION_SECRET, store: ormStore(db) });
//   app.register(admin, { prefix: '/admin', models, login: { findUser: (name) => User.objects.get({ email: name }), allow: (user) => user.isStaff } });
const SESSION_KEY = 'xufa.admin.user';
import { message as msg } from './messages.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

class LoginError extends Error {
  constructor(message, statusCode, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

function loadAuth() {
  try {
    return require('@xufa/auth');
  } catch (err) {
    throw new TypeError(`The login of the admin needs @xufa/auth (${err.message})`);
  }
}

// The login of a model of users (AbstractUser of @xufa/auth, or one with its fields: username, password, isActive,
// isStaff, isSuperuser; totpSecret and recoveryCodes for the authenticator apps, lastLogin): its functions.
function loginOfModel(model) {
  const has = (name) => model.meta.fields.some((field) => field.name === name);
  const update = (user, values) => model.objects.filter({ pk: user.pk }).update(values);
  return {
    findUser: (username) => model.objects.filter({ username }).first(),
    reload: (id) => model.objects.filter({ pk: id }).first(),
    // The staff (and superusers), active.
    allow: (user) => user.isActive !== false && Boolean(user.isStaff || user.isSuperuser),
    name: (user) => user.username,
    setPassword: (user, hash) => update(user, { password: hash }),
    ...(has('totpSecret')
      ? { totp: (user) => user.totpSecret, setTotp: (user, secret) => update(user, { totpSecret: secret }) }
      : {}),
    ...(has('totpStep')
      ? { lastTotpStep: (user) => user.totpStep, onTotp: (user, step) => update(user, { totpStep: step }) }
      : {}),
    ...(has('recoveryCodes')
      ? {
          recoveryCodes: (user) => user.recoveryCodes,
          setRecoveryCodes: (user, hashes) => update(user, { recoveryCodes: hashes }),
        }
      : {}),
    ...(has('lastLogin') ? { onLogin: (user) => update(user, { lastLogin: new Date() }) } : {}),
  };
}

// What the login needs, from its options.
function configureLogin(given, rbac = null) {
  // model: the functions of a model of users, under those given.
  const login = given && given.model ? { ...loginOfModel(given.model), ...given } : given;
  if (!login || typeof login.findUser !== 'function') {
    throw new TypeError('login of the admin needs findUser(username, request)');
  }
  const auth = loadAuth();
  const allow =
    login.allow ||
    (rbac
      ? async (user) => {
          const access = await rbac.access(user);
          return access.superuser || rbac.tenantsIn(access).length > 0;
        }
      : () => true);
  // What the user may, kept with it in the session (with rbac).
  const withAccess = async (kept, user) => (rbac ? { ...kept, access: await rbac.access(user) } : kept);
  const nameOf = login.name || ((user, username) => username);
  let credentials;
  try {
    credentials = new auth.Credentials({
      ...login,
      // A user that allow() refuses gets the answer of a wrong password.
      allow,
      minPassword: login.minPasswordLength || 10,
      maxPassword: 1024,
    });
  } catch (err) {
    throw new TypeError(`The login of the admin: ${err.message}`);
  }
  const idOf = credentials.idOf;

  // The user of the admin of a request (kept in its session), or null.
  function userOf(request) {
    if (!request.session || typeof request.session.get !== 'function') {
      throw new LoginError('The login of the admin needs @xufa/session (registered before the admin)', 500);
    }
    return request.session.get(SESSION_KEY) || null;
  }

  // The user logged in now: that of the session, and with reload, the user again (null when it is not there, or
  // allow() refuses it now: the session forgets it, so it logs in again even if it comes back).
  async function current(request) {
    const kept = userOf(request);
    // A user kept before the admin had rbac has no access: it logs in again.
    if (kept && rbac && !kept.access) {
      request.session.delete(SESSION_KEY);
      return null;
    }
    if (!kept || typeof login.reload !== 'function') return kept;
    const user = await login.reload(kept.id, request);
    if (!user || !(await allow(user))) {
      request.session.delete(SESSION_KEY);
      return null;
    }
    return withAccess({ id: kept.id, name: String((await nameOf(user, kept.name)) || kept.name) }, user);
  }

  // Checks a username, a password and a code (or a recovery code): the user of the admin to keep, or a LoginError
  // (code: the page asks for the code; recovery: a recovery code works too).
  async function check(request, body) {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    let user;
    try {
      user = await credentials.login({
        identifier: username,
        password: body.password,
        code: body.code,
        ip: request.ip,
        request,
      });
    } catch (err) {
      if (!(err instanceof auth.CredentialError)) throw err;
      throw new LoginError(err.message, err.statusCode, {
        code: err.needsCode,
        recovery: err.recovery,
        ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}),
      });
    }
    if (typeof login.onLogin === 'function') await login.onLogin(user, request);
    return withAccess({ id: idOf(user), name: String((await nameOf(user, username)) || username) }, user);
  }

  // The account of the user logged in: its password, its authenticator app and its recovery codes (the Credentials).
  // Each change asks for the password, its failures counted as those of the login.
  const account = {
    async state(request) {
      return credentials.state(await account.user(request));
    },
    // The user of the request, again (reload).
    async user(request) {
      const kept = userOf(request);
      const user = kept && typeof login.reload === 'function' ? await login.reload(kept.id, request) : null;
      if (!user) throw new LoginError(msg('logInFirst'), 401);
      return user;
    },
    async changePassword(request, body) {
      await credentials.changePassword(await account.user(request), body, request);
    },
    async startTotp(request, body, issuer) {
      return credentials.startTotp(await account.user(request), {
        password: body.password,
        label: userOf(request).name,
        issuer,
        session: request.session,
      });
    },
    async confirmTotp(request, body) {
      return credentials.confirmTotp(await account.user(request), {
        code: body.code,
        session: request.session,
        request,
      });
    },
    async disableTotp(request, body) {
      await credentials.disableTotp(await account.user(request), { password: body.password, request });
    },
    async renewCodes(request, body) {
      return credentials.renewRecoveryCodes(await account.user(request), { password: body.password, request });
    },
  };

  // Whether the user is read again in each request (reload): the page of its account needs it.
  return { userOf, current, check, account, SESSION_KEY, reloads: typeof login.reload === 'function' };
}

export { configureLogin, LoginError, SESSION_KEY };
