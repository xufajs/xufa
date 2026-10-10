// The accounts of the users of an app with sessions (as Laravel Breeze): routes to sign up, log in and out (also of
// every browser), ask for a link to reset the password and use it, change the password, and verify the email; the
// user of a request; and a hook for the routes that need one. Built on the passwords, lockouts and codes of
// authenticator apps of @xufa/auth, and @xufa/session (registered before); the emails of the links are sent by a
// Mailer of @xufa/mail. The app keeps its users: the plugin asks for them and for their changes (users).
//
//   app.register(sessionPlugin, { secret, store: ormStore(db), csrf: true });
//   app.register(auth.accounts, {
//     secret: process.env.ACCOUNTS_SECRET,
//     users: {
//       findByEmail: (email) => User.objects.filter({ email }).first(),
//       findById: (id) => User.objects.filter({ pk: id }).first(),
//       create: (values) => User.objects.create(values),
//       setPassword: (user, hash) => User.objects.filter({ pk: user.pk }).update({ password: hash }),
//       markVerified: (user) => User.objects.filter({ pk: user.pk }).update({ emailVerifiedAt: new Date() }),
//     },
//     mailer,
//     links: { reset: (token) => `${url}/reset-password?token=${token}`, verify: (token) => `${url}/verify?token=${token}` },
//   });
//   app.get('/dashboard', { preHandler: app.accounts.required }, (request) => ({ user: request.account }));
//
// Links of resets and verifications are signed tokens (HMAC of the secret), with no table: a reset link carries the
// hash of the password it replaces, so it works once and dies when the password changes; a verification link carries
// the email it verifies. A reset or a change of the password ends the other sessions of the user. An
// account that is not active (active(user): locked, disabled) cannot log in, and its sessions end at their next request
// (app.accounts.endSessions(user) ends them at once, in every browser and machine).
import crypto from 'node:crypto';
import { hashPassword } from './password.js';
import { Lockout } from './lockout.js';
import { Credentials, CredentialError } from './credentials.js';
import { message } from './messages.js';
import { Rbac } from './rbac.js';
import { normalizeIdentifier } from './identifier.js';
import { skeleton } from './confusables.js';
import { seconds } from './duration.js';

const SESSION_KEY = 'xufa.account';

class AccountError extends Error {
  constructor(message, statusCode = 400, extra = {}) {
    super(message);
    this.name = 'AccountError';
    this.statusCode = statusCode;
    Object.assign(this, extra);
  }
}

const invalid = (errors, text = message('notValid')) => new AccountError(text, 400, { errors });

// An email as the plugin keeps it: trimmed, NFKC and lower case (the local part too: most servers do not tell them
// apart, and two accounts that differ only in case are a trap).
function emailOf(value) {
  const email = normalizeIdentifier(typeof value === 'string' ? value.trim() : '');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

const b64 = (buffer) => Buffer.from(buffer).toString('base64url');

// Signed tokens of a purpose: base64url(JSON) "." HMAC(purpose, payload, bound). `bound`: what the token is only good
// with (the hash of the password a reset replaces, the email a verification verifies).
function signer(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError(
      'accounts needs a secret of 32 characters or more (it signs the links of resets and verifications)'
    );
  }
  const keyOf = (purpose) => Buffer.from(crypto.hkdfSync('sha256', secret, 'xufa-accounts', purpose, 32));
  const macOf = (purpose, payload, bound) =>
    crypto
      .createHmac('sha256', keyOf(purpose))
      .update(`${payload}\0${bound || ''}`)
      .digest();
  return {
    sign(purpose, data, ttl, bound) {
      const payload = b64(JSON.stringify({ ...data, x: Math.floor(Date.now() / 1000) + ttl }));
      return `${payload}.${b64(macOf(purpose, payload, bound))}`;
    },
    // The data of a token, if its signature is good with `bound` and it has not expired; else null.
    read(purpose, token) {
      if (typeof token !== 'string' || token.length > 2048) return null;
      const [payload, mac] = token.split('.');
      if (!payload || !mac) return null;
      let data;
      try {
        data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      if (!data || typeof data !== 'object' || !Number.isInteger(data.x) || data.x < Date.now() / 1000) return null;
      return {
        data,
        check: (bound) => {
          const expected = macOf(purpose, payload, bound);
          const given = Buffer.from(mac, 'base64url');
          return given.length === expected.length && crypto.timingSafeEqual(given, expected);
        },
      };
    },
  };
}

function accountsPlugin(app, options, done) {
  try {
    setUp(app, options || {});
    done();
  } catch (err) {
    done(err);
  }
}

// The functions of the users of a model of users (AbstractUser of @xufa/auth, or one with its fields): found by email,
// username and key, created, their password and last login set.
function usersOfModel(model) {
  const one = (where) => model.objects.filter(where).first();
  return {
    findByEmail: (email) => one({ email }),
    findByUsername: (username) => one({ username }),
    findById: (id) => one({ pk: id }),
    create: (values) => model.objects.create(values),
    setPassword: (user, hash) => model.objects.filter({ pk: user.pk }).update({ password: hash }),
    markVerified: model.meta.fields.some((field) => field.name === 'emailVerifiedAt')
      ? (user) => model.objects.filter({ pk: user.pk }).update({ emailVerifiedAt: new Date() })
      : undefined,
  };
}

function setUp(app, options) {
  const model = options.model || null;
  if (model && (typeof model !== 'function' || !model.objects))
    throw new TypeError('model of accounts is a model of @xufa/orm');
  const hasField = (name) => Boolean(model) && model.meta.fields.some((field) => field.name === name);
  const {
    prefix = '/account',
    users: givenUsers = {},
    // What users log in with: their email (the default), or their username (users.findByUsername).
    loginBy = 'email',
    // After each login: the user and the request (with a model, its lastLogin is set).
    onLogin = hasField('lastLogin')
      ? (user) => model.objects.filter({ pk: user.pk }).update({ lastLogin: new Date() })
      : null,
    mailer = null,
    links = {},
    mails = {},
    passwordOptions,
    minPassword = 8,
    maxPassword = 256,
    checkPassword = null,
    signup = {},
    requireVerified = false,
    // Pages: where loginRequired sends who did not log in (with ?next=), and the permissions of permissionRequired
    // (an Rbac or its options; and the permissions of each user, as Django's user_permissions).
    loginUrl = null,
    rbac: rbacOption = null,
    userPermissions = (user) => (Array.isArray(user.permissions) ? user.permissions : []),
    profile = (user) => ({ id: String(idOf(user)), email: emailField(user), verified: verifiedOf(user) }),
    app: appInfo = {},
  } = options;
  // The users: those of the option users, over those of the model.
  const users = { ...(model ? usersOfModel(model) : {}), ...givenUsers };
  for (const name of Object.keys(users)) if (users[name] === undefined) delete users[name];
  if (loginBy !== 'email' && loginBy !== 'username')
    throw new TypeError("loginBy of accounts is 'email' or 'username'");
  if (loginBy === 'username' && typeof users.findByUsername !== 'function') {
    throw new TypeError('accounts with loginBy username needs users.findByUsername() (or a model)');
  }
  const tokens = signer(options.secret);
  for (const name of ['findByEmail', 'findById']) {
    if (typeof users[name] !== 'function') throw new TypeError(`accounts needs users.${name}()`);
  }
  const idOf = options.id || ((user) => (user.pk !== undefined ? user.pk : user.id));
  const emailField = options.email || ((user) => user.email);
  const passwordOf = options.password || ((user) => user.password);
  const verifiedOf =
    options.verified ||
    ((user) => Boolean(user.emailVerifiedAt || user.verifiedAt || user.emailVerified || user.verified));
  const totpOf = options.totp || (() => null);
  // Whether an account may be used (not locked nor disabled): every request asks.
  const activeOf = options.active || (hasField('isActive') ? (user) => user.isActive !== false : () => true);
  const resetTtl = seconds(options.resetTtl || '1h');
  const verifyTtl = seconds(options.verifyTtl || '2d');
  const lockoutOf = (given, maxAttempts) =>
    given === false
      ? null
      : given instanceof Lockout
        ? given
        : new Lockout({ maxAttempts, window: '15m', lockFor: '15m', ...given });
  // Links asked for by address: so many in an hour (a reset or a verification each).
  const linkLockout = lockoutOf(options.linkLockout, 5);
  // The logins, passwords, authenticator apps and recovery codes (the Credentials of @xufa/auth, as the admin's):
  // failures locked out by email (5) and by address (20).
  const credentials = new Credentials({
    findUser: (identifier, request) =>
      loginBy === 'username' ? users.findByUsername(identifier, request) : users.findByEmail(identifier, request),
    password: passwordOf,
    totp: totpOf,
    lastTotpStep: options.lastTotpStep,
    onTotp: options.onTotp,
    active: options.active || (hasField('isActive') ? activeOf : undefined),
    setPassword: users.setPassword,
    setTotp: users.setTotp,
    recoveryCodes: options.recoveryCodes,
    setRecoveryCodes: users.setRecoveryCodes,
    lockout: options.lockout,
    ipLockout: options.ipLockout,
    passwordOptions,
    totpOptions: options.totpOptions,
    minPassword,
    maxPassword,
    checkPassword,
    id: idOf,
    // Wrong email or password; with usernames, wrong user or password.
    messages: { ...(loginBy === 'username' ? {} : { invalid: 'auth.invalidEmail' }), ...options.messages },
  });
  const { lockout, ipLockout } = credentials;

  app.decorateRequest('account', null);
  app.decorateRequest('accountPerms', null);

  // The user of a request (its session), loaded once a request; null when there is none (or not any more).
  async function userOf(request) {
    // A session of an older generation (logged out everywhere since): no user, even one read to know it.
    if (request.session && request.session.endedEverywhere) {
      request.account = null;
      return null;
    }
    if (request.account) return request.account;
    const session = request.session;
    if (!session || typeof session.get !== 'function') {
      throw new AccountError('accounts needs @xufa/session (registered before)', 500);
    }
    const kept = session.get(SESSION_KEY);
    if (!kept) return null;
    const user = await users.findById(kept.id, request);
    // Gone, or locked since: logged out (the session forgets it, and it logs in again once it is active).
    if (!user || !(await activeOf(user))) {
      session.delete(SESSION_KEY);
      return null;
    }
    request.account = user;
    return user;
  }

  // The generations of "log out everywhere" in the rows of the users (sessionGeneration), when the model has them:
  // the session reads its user's with the user the request loads anyway, not apart in the store at each request.
  if (hasField('sessionGeneration') && app.sessions && typeof app.sessions.useGenerations === 'function') {
    app.sessions.useGenerations({
      async read(id, request) {
        if (request && request.session) {
          const user = await userOf(request);
          if (user && String(idOf(user)) === String(id)) return user.sessionGeneration || 0;
        }
        const found = await model.objects.filter({ pk: id }).first();
        return found ? found.sessionGeneration || 0 : undefined;
      },
      async write(id, generation) {
        await model.objects.filter({ pk: id }).update({ sessionGeneration: generation });
      },
    });
  }

  // The hook of the routes that need a user (and a verified email, with requireVerified).
  async function required(request, reply) {
    const user = await userOf(request);
    if (!user) return reply.code(401).send({ error: message('logInFirst'), statusCode: 401 });
    if (requireVerified && !verifiedOf(user)) {
      return reply.code(403).send({ error: message('verifyFirst'), statusCode: 403, verify: true });
    }
    return undefined;
  }

  async function logIn(request, user) {
    const session = request.session;
    if (!session || typeof session.login !== 'function') {
      throw new AccountError('accounts needs @xufa/session (registered before)', 500);
    }
    await session.login(idOf(user));
    session.set(SESSION_KEY, { id: idOf(user) });
    request.account = user;
    // As Django's login(): the last login of the user (onLogin).
    if (onLogin) await onLogin(user, request);
  }

  const validatePassword = (password, values) => credentials.validatePassword(password, values);

  async function guard(counters) {
    for (const [counter, key] of counters) {
      try {
        await counter.check(key);
      } catch (err) {
        if (err.retryAfter) {
          throw new AccountError(message('throttled'), 429, { retryAfter: err.retryAfter });
        }
        throw err;
      }
    }
  }

  async function sendMail(kind, user, url) {
    if (!mailer) throw new AccountError(`The ${kind} links need a mailer (of @xufa/mail)`, 500);
    const to = emailField(user);
    const custom = mails[kind];
    // A function of the user and the link, or a mail of a configuration ({ subject, text|html }): its templates have
    // url (and link), email and user.
    const mail = custom
      ? typeof custom === 'function'
        ? await custom(user, url)
        : { ...custom, with: { url, link: url, email: to, user, ...(custom.with || {}) } }
      : kind === 'reset'
        ? {
            subject: message('resetSubject', { app: appInfo.name ? message('ofApp', { name: appInfo.name }) : '' }),
            html: '<p>{{ body }}</p>{{> button ({ url: url, text: button }) }}<p>{{ foot }}</p>',
            with: {
              url,
              body: message('resetBody'),
              button: message('resetButton'),
              foot: message('resetFoot', { minutes: Math.round(resetTtl / 60) }),
            },
          }
        : {
            subject: message('verifySubject', { app: appInfo.name ? message('forApp', { name: appInfo.name }) : '' }),
            html: '<p>{{ body }}</p>{{> button ({ url: url, text: button }) }}',
            with: { url, body: message('verifyBody'), button: message('verifyButton') },
          };
    return mailer.send(mail, { to });
  }

  async function sendVerification(user) {
    if (!links.verify) throw new AccountError('Verifications need links.verify(token)', 500);
    const token = tokens.sign('verify', { u: String(idOf(user)) }, verifyTtl, emailField(user));
    return sendMail('verify', user, links.verify(token));
  }

  const answer = (reply, err) => {
    if (!(err instanceof AccountError) && !(err instanceof CredentialError)) throw err;
    if (err.retryAfter) reply.header('retry-after', String(err.retryAfter));
    const body = { error: err.message, statusCode: err.statusCode };
    if (err.errors && Object.keys(err.errors).length) body.errors = err.errors;
    // The code of an authenticator app is asked for (and a recovery code works too).
    if (err.code || err.needsCode) body.code = true;
    if (err.recovery) body.recovery = true;
    if (err.locked || err.reason === 'locked') body.locked = true;
    return reply.code(err.statusCode).send(body);
  };
  const bodyOf = (request) => (request.body && typeof request.body === 'object' ? request.body : {});
  const config = { auth: false };

  // The permissions of the users: those of their roles (Rbac) and their own.
  const rbac = rbacOption ? (rbacOption instanceof Rbac ? rbacOption : new Rbac(rbacOption)) : null;
  async function permsOfUser(user) {
    if (!user) return { has: () => false, all: [] };
    const access = rbac ? await rbac.access(user) : null;
    const own = new Set((await userPermissions(user)) || []);
    return {
      has: (permission) => own.has(permission) || Boolean(access && rbac.allows(access, permission)),
      all: [...own],
      superuser: Boolean(access && access.superuser),
    };
  }
  // The permissions of the user of a request, once a request ({ has(permission) }).
  async function perms(request) {
    if (!request.accountPerms) request.accountPerms = await permsOfUser(await userOf(request));
    return request.accountPerms;
  }
  // A page goes to the login page (as Django's login_required); a client that asks for JSON (and not HTML) gets 401.
  const wantsPage = (request) => {
    if (!loginUrl) return false;
    const accept = request.headers.accept || '';
    return /text\/html/.test(accept) || !/application\/json|\+json/.test(accept);
  };
  function toLogin(request, reply) {
    if (wantsPage(request)) {
      const url = typeof loginUrl === 'function' ? loginUrl(request) : loginUrl;
      return reply.redirect(`${url}${url.includes('?') ? '&' : '?'}next=${encodeURIComponent(request.url)}`);
    }
    return reply.code(401).send({ error: message('logInFirst'), statusCode: 401 });
  }
  // login_required: the routes of users who logged in.
  // The user of a login (Django's authenticate()): { email or username (loginBy), password, code (of an app) }. The
  // password, then (with an app) its code or a recovery code; a locked account says so once the password is right (a
  // wrong one says nothing). AccountError (400) with errors by field for what is missing, CredentialError otherwise.
  async function authenticate(given = {}, request = undefined) {
    const password = typeof given.password === 'string' ? given.password : '';
    const identifier =
      loginBy === 'username' ? (typeof given.username === 'string' ? given.username.trim() : '') : emailOf(given.email);
    if (!identifier || !password) {
      const field = loginBy === 'username' ? 'username' : 'email';
      throw invalid({
        [field]: identifier ? [] : [message(loginBy === 'username' ? 'aUsername' : 'anEmail')],
        password: password ? [] : [message('aPassword')],
      });
    }
    return credentials.login({ identifier, password, code: given.code, ip: request && request.ip, request });
  }
  // Out of this session, or of every session of the user (everywhere).
  async function logOut(request, { everywhere = false } = {}) {
    const session = request.session;
    if (!session) return;
    if (everywhere && session.user !== null && typeof session.logoutEverywhere === 'function') {
      await session.logoutEverywhere();
    } else session.destroy();
    request.account = null;
  }
  // A link to reset the password, by email (the same whether there is such an account or not): link(token) gives its
  // address (links.reset by default). Throttled by address and by IP.
  async function requestReset(given, request, { link = links.reset } = {}) {
    if (typeof link !== 'function') throw new AccountError('Resets need links.reset(token)', 500);
    const email = emailOf(given);
    if (!email) throw invalid({ email: [message('anEmail')] });
    await guard(
      [
        [linkLockout, `reset:${email}`],
        [ipLockout, `reset-ip:${request && request.ip}`],
      ].filter(([counter]) => counter)
    );
    if (linkLockout) await linkLockout.fail(`reset:${email}`);
    const user = await users.findByEmail(email, request);
    if (user && passwordOf(user)) {
      const token = tokens.sign('reset', { u: String(idOf(user)) }, resetTtl, passwordOf(user));
      await sendMail('reset', user, link(token));
    }
  }
  // A new password for the user of a request, with the one now (its failures locked out as logins): the other
  // sessions of the user end, this one goes on. CredentialError with errors.current or errors.password.
  async function changePassword(request, { current, password } = {}) {
    const user = request.account || (await userOf(request));
    if (!user) throw new AccountError(message('logInFirst'), 401);
    await credentials.changePassword(user, { current, password, email: emailField(user) }, request);
    if (request.session && typeof request.session.logoutOthers === 'function' && request.session.user !== null) {
      await request.session.logoutOthers();
    }
  }
  // The user of the token of a reset link, while it is good (not expired, the password not changed since), else null:
  // pages of the app check it before they show their form (Django's validlink).
  async function checkResetToken(token, request) {
    const read = typeof token === 'string' && token ? tokens.read('reset', token) : null;
    const user = read ? await users.findById(read.data.u, request) : null;
    return user && read.check(passwordOf(user)) ? user : null;
  }
  // A new password with the token of a reset link: every session of the user ends (it logs in again), and its failed
  // logins are forgotten. AccountError (400) with errors.token for a link not good, errors.password for a weak one.
  async function resetPassword(token, password, request) {
    if (typeof users.setPassword !== 'function') throw new AccountError('Resets need users.setPassword', 500);
    const user = await checkResetToken(token, request);
    if (!user) throw new AccountError(message('linkExpired'), 400, { errors: { token: [message('expiredOrUsed')] } });
    await credentials.setPassword(user, password, request, { email: emailField(user) });
    if (app.sessions && typeof app.sessions.logoutUser === 'function') await app.sessions.logoutUser(idOf(user));
    if (lockout) await lockout.succeed(`login:${emailOf(emailField(user))}`);
    return user;
  }
  async function loginRequired(request, reply) {
    if (!(await userOf(request))) return toLogin(request, reply);
    return undefined;
  }
  // permission_required: the routes of users with a permission (to the login without a user, 403 without it: an
  // error of status 403, which the error handler of the app shows).
  function permissionRequired(...permissions) {
    if (!permissions.length || permissions.some((item) => typeof item !== 'string')) {
      throw new TypeError('permissionRequired(...permissions): names of permissions');
    }
    return async function hasPermission(request, reply) {
      if (!(await userOf(request))) return toLogin(request, reply);
      const own = await perms(request);
      const missing = permissions.find((permission) => !own.has(permission));
      if (missing) throw new AccountError(message('forbidden', { permission: missing }), 403, { permission: missing });
      return undefined;
    };
  }
  // The user and its permissions in every template of a request (@xufa/template), whatever the order of the plugins.
  app.addHook('onReady', function addViewContext(done) {
    if (typeof app.viewContext === 'function') {
      app.viewContext(async (request) => ({ user: await userOf(request), perms: await perms(request) }));
    }
    done();
  });

  app.decorate('accounts', {
    user: userOf,
    required,
    loginRequired,
    permissionRequired,
    perms,
    // Whether a user has a permission (its roles, or its own).
    async can(user, permission) {
      return (await permsOfUser(user)).has(permission);
    },
    rbac,
    logIn,
    sendVerification,
    // A link to reset the password of a user (for an admin to send by hand).
    // Ends every session of a user now (locked, disabled, or anything else): every browser, process and machine with
    // the store of the sessions.
    async endSessions(user) {
      if (!app.sessions || typeof app.sessions.logoutUser !== 'function') {
        throw new AccountError('endSessions() needs @xufa/session', 500);
      }
      await app.sessions.logoutUser(idOf(user));
    },
    resetLink(user) {
      if (!links.reset) throw new AccountError('Resets need links.reset(token)', 500);
      return links.reset(tokens.sign('reset', { u: String(idOf(user)) }, resetTtl, passwordOf(user)));
    },
    checkResetToken,
    resetPassword,
    authenticate,
    logOut,
    requestReset,
    changePassword,
    loginBy,
    loginUrl,
    SESSION_KEY,
  });

  // Sign up: an email and a password (and the fields of signup.fields); logged in, and a link to verify the email.
  if (typeof users.create === 'function') {
    app.post(`${prefix}/signup`, { config }, async (request, reply) => {
      try {
        const body = bodyOf(request);
        const email = emailOf(body.email);
        const errors = {};
        if (!email) errors.email = [message('anEmail')];
        const problem = validatePassword(body.password, { email });
        if (problem) errors.password = [problem];
        if (Object.keys(errors).length) throw invalid(errors);
        await guard([[ipLockout, `signup:${request.ip}`]].filter(([counter]) => counter));
        const key = skeleton(email);
        const taken =
          (await users.findByEmail(email, request)) ||
          (typeof users.findBySkeleton === 'function' ? await users.findBySkeleton(key, request) : null);
        if (taken) throw invalid({ email: [message('emailTakenField')] }, message('emailTaken'));
        const extra = {};
        for (const name of signup.fields || []) if (body[name] !== undefined) extra[name] = body[name];
        const user = await users.create(
          { ...extra, email, emailSkeleton: key, password: await hashPassword(body.password, passwordOptions) },
          request
        );
        if (signup.login !== false) await logIn(request, user);
        if (links.verify && mailer && !verifiedOf(user)) await sendVerification(user);
        reply.code(201);
        return { user: await profile(user) };
      } catch (err) {
        return answer(reply, err);
      }
    });
  }

  // Log in: the same answer for every wrong email or password; the code of an authenticator app once the password is
  // right; failures locked out by email and by address.
  app.post(`${prefix}/login`, { config }, async (request, reply) => {
    try {
      const body = bodyOf(request);
      const user = await authenticate(body, request);
      await logIn(request, user);
      return { user: await profile(user) };
    } catch (err) {
      return answer(reply, err);
    }
  });

  // Log out: of this session, or of every session of the user ({ everywhere: true }).
  app.post(`${prefix}/logout`, { config }, async (request) => {
    await logOut(request, { everywhere: Boolean(bodyOf(request).everywhere) });
    return { ok: true };
  });

  app.get(`${prefix}/me`, { config }, async (request, reply) => {
    const user = await userOf(request);
    if (!user) return reply.code(401).send({ error: message('logInFirst'), statusCode: 401 });
    return { user: await profile(user) };
  });

  // The sessions of the user (each a browser: its device, address, login and last request; this one marked), and one
  // of the others ended (this one ends by logging out). With @xufa/session, which keeps them.
  const listed = () => app.sessions && typeof app.sessions.list === 'function';
  app.get(`${prefix}/sessions`, { config, preHandler: required }, async (request, reply) => {
    if (!listed()) return reply.code(501).send({ error: 'The sessions of a user need @xufa/session', statusCode: 501 });
    const sessions = await app.sessions.list(idOf(request.account));
    return { sessions: sessions.map((item) => ({ ...item, current: item.handle === request.session.handle })) };
  });
  app.post(`${prefix}/sessions/:handle/end`, { config, preHandler: required }, async (request, reply) => {
    if (!listed()) return reply.code(501).send({ error: 'The sessions of a user need @xufa/session', statusCode: 501 });
    if (request.params.handle === request.session.handle) {
      return reply.code(400).send({ error: message('sessionInUse'), statusCode: 400 });
    }
    if (!(await app.sessions.end(idOf(request.account), request.params.handle))) {
      return reply.code(404).send({ error: message('noSession'), statusCode: 404 });
    }
    return { ended: true };
  });

  // A link to reset the password, by email: the same answer whether there is such an account or not.
  if (links.reset) {
    app.post(`${prefix}/password/forgot`, { config }, async (request, reply) => {
      try {
        await requestReset(bodyOf(request).email, request);
        reply.code(202);
        return {
          ok: true,
          message: message('resetSent'),
        };
      } catch (err) {
        return answer(reply, err);
      }
    });

    // A new password, with the token of a link: every session of the user ends (it logs in again).
    app.post(`${prefix}/password/reset`, { config }, async (request, reply) => {
      try {
        const body = bodyOf(request);
        await resetPassword(body.token, body.password, request);
        return { ok: true };
      } catch (err) {
        return answer(reply, err);
      }
    });
  }

  // A new password, with the one now: the other sessions of the user end, this one goes on.
  if (typeof users.setPassword === 'function') {
    app.post(`${prefix}/password/change`, { config, preHandler: required }, async (request, reply) => {
      try {
        const body = bodyOf(request);
        await changePassword(request, { current: body.current, password: body.password });
        return { ok: true, csrf: typeof request.session.csrfToken === 'function' ? request.session.csrfToken() : null };
      } catch (err) {
        return answer(reply, err);
      }
    });
  }

  // The security of the account: what it has (an authenticator app, recovery codes left) and may change.
  app.get(`${prefix}/security`, { config, preHandler: required }, async (request) =>
    credentials.state(request.account)
  );

  // An authenticator app (users.setTotp): the password, then a QR code (and its key) to scan; the first code of the
  // app turns it on and gives the recovery codes (with recoveryCodes and users.setRecoveryCodes), shown once. Removed
  // with the password, and its recovery codes with it.
  if (typeof users.setTotp === 'function') {
    const route = (url, handler) =>
      app.post(`${prefix}${url}`, { config, preHandler: required }, async (request, reply) => {
        try {
          return await handler(request, bodyOf(request));
        } catch (err) {
          return answer(reply, err);
        }
      });
    route('/totp/start', (request, body) =>
      credentials.startTotp(request.account, {
        password: body.password,
        label: emailField(request.account),
        issuer: appInfo.name,
        session: request.session,
      })
    );
    route('/totp/confirm', (request, body) =>
      credentials.confirmTotp(request.account, { code: body.code, session: request.session, request })
    );
    route('/totp/disable', async (request, body) => {
      await credentials.disableTotp(request.account, { password: body.password, request });
      return { ok: true };
    });
    if (credentials.recovery) {
      route('/recovery-codes', (request, body) =>
        credentials.renewRecoveryCodes(request.account, { password: body.password, request })
      );
    }
  }

  // Verifying the email: the token of the link (good for the email it was sent to), and another link.
  if (links.verify && typeof users.markVerified === 'function') {
    app.post(`${prefix}/email/verify`, { config }, async (request, reply) => {
      try {
        const read = tokens.read('verify', bodyOf(request).token);
        const user = read ? await users.findById(read.data.u, request) : null;
        if (!user || !read.check(emailField(user))) {
          throw new AccountError(message('linkExpired'), 400, { errors: { token: [message('expired')] } });
        }
        if (!verifiedOf(user)) await users.markVerified(user, request);
        return { ok: true };
      } catch (err) {
        return answer(reply, err);
      }
    });
    app.post(
      `${prefix}/email/resend`,
      {
        config,
        preHandler: async (request, reply) => {
          const user = await userOf(request);
          if (!user) return reply.code(401).send({ error: message('logInFirst'), statusCode: 401 });
          return undefined;
        },
      },
      async (request, reply) => {
        try {
          const user = request.account;
          if (verifiedOf(user)) return { ok: true, verified: true };
          await guard([[linkLockout, `verify:${String(idOf(user))}`]].filter(([counter]) => counter));
          if (linkLockout) await linkLockout.fail(`verify:${String(idOf(user))}`);
          await sendVerification(user);
          reply.code(202);
          return { ok: true };
        } catch (err) {
          return answer(reply, err);
        }
      }
    );
  }
}

accountsPlugin[Symbol.for('skip-override')] = true;
accountsPlugin[Symbol.for('fastify.display-name')] = '@xufa/auth/accounts';
accountsPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/auth/accounts', decorators: { request: ['session'] } };

export { accountsPlugin, AccountError, emailOf, SESSION_KEY as ACCOUNT_SESSION_KEY };
