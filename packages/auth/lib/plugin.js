// The plugin of @xufa/auth for @xufa/http (and fastify): access tokens (JWTs) read from the requests, routes that
// need them, and the routes of logging in, refreshing and logging out when `login` is given.
//
//   app.register(auth.plugin, { keys: process.env.JWT_KEY, accessToken: { expiresIn: '15m' } });
//   app.get('/me', { onRequest: app.authenticate }, (request) => request.user);
//   app.delete('/users/:id', { config: { auth: ['admin'] } }, handler);   // authenticated, with the role admin
//
// The token is read from the Authorization header (Bearer), then from the cookie `token.cookie` and the query
// parameter `token.query`, when they are given. A route without auth works with or without a token (request.user is
// null without a valid one); one with auth answers 401 without a valid token, and 403 without the roles it needs.
const { KeySet } = require('./keys');
const { signJwt, verifyJwt } = require('./jwt');
const { seconds } = require('./duration');
const { parseCookies, serializeCookie } = require('./cookies');
const { hashPassword, verifyPassword, needsRehash } = require('./password');
const { verifyTotp } = require('./totp');
const { Lockout } = require('./lockout');
const { RefreshTokens } = require('./refresh');
const { TokenError, Unauthorized, Forbidden, TotpRequired, Locked } = require('./errors');

const VERIFIED = Symbol('xufa.auth.verified');

const keySetOf = (keys) => (keys instanceof KeySet ? keys : new KeySet(keys));

// The roles of a user: user.roles (a list) or user.role.
function rolesOf(user) {
  if (!user) return [];
  if (Array.isArray(user.roles)) return user.roles;
  return user.role === undefined || user.role === null ? [] : [user.role];
}

async function authPlugin(app, options = {}) {
  const { keys, accessToken = {}, token = {}, user: userOf, prefix = '/auth', hook = 'onRequest' } = options;
  if (!keys) throw new TypeError('The auth plugin needs keys (a secret, a KeySet, or a function of the request)');
  // The keys of a request: the same for every one, or a function of it (a KeySet per tenant).
  const fixed = typeof keys === 'function' ? null : keySetOf(keys);
  const keysOf = fixed ? () => fixed : async (request) => keySetOf(await keys(request));
  const expiresIn = seconds(accessToken.expiresIn === undefined ? '15m' : accessToken.expiresIn, 'expiresIn');
  const signOptions = { issuer: accessToken.issuer, audience: accessToken.audience };
  const verifyOptions = {
    issuer: accessToken.issuer,
    audience: accessToken.audience,
    algorithms: accessToken.algorithms,
    clockTolerance: accessToken.clockTolerance,
  };
  const { header = true, cookie: cookieName = null, query: queryName = null } = token;

  // The token of a request, or null.
  function tokenOf(request) {
    if (header) {
      const authorization = request.headers.authorization;
      if (authorization) {
        const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization);
        return match ? match[1] : null;
      }
    }
    if (cookieName) {
      const cookies = parseCookies(request.headers.cookie);
      if (cookies[cookieName]) return cookies[cookieName];
    }
    if (queryName && request.query && typeof request.query[queryName] === 'string') return request.query[queryName];
    return null;
  }

  // Verifies the token of a request once: request.user and request.auth (its claims), or request.authError.
  async function verifyRequest(request) {
    if (request[VERIFIED]) return;
    request[VERIFIED] = true;
    const given = tokenOf(request);
    if (!given) return;
    try {
      const claims = verifyJwt(given, await keysOf(request), verifyOptions);
      request.auth = claims;
      request.user = userOf ? await userOf(claims, request) : claims;
      if (!request.user) request.authError = new Unauthorized('The user of the token is not valid');
    } catch (err) {
      if (!(err instanceof TokenError)) throw err;
      request.auth = null;
      request.user = null;
      request.authError = err;
    }
  }

  function unauthorized(request, reply) {
    const err = request.authError || new Unauthorized('Authentication is required');
    const description = err.reason ? `, error="invalid_token", error_description="${err.message}"` : '';
    reply.header('www-authenticate', `Bearer realm="api"${description}`);
    return err;
  }

  // The hook of routes that need an authenticated user.
  async function authenticate(request, reply) {
    await verifyRequest(request);
    if (!request.user) throw unauthorized(request, reply);
  }

  // The hook of routes that need roles ('admin', or any of a list) or a check of the user (a function of the user
  // and the request that returns whether it may, or a promise of it).
  function authorize(...checks) {
    const check = checks.length === 1 && typeof checks[0] === 'function' ? checks[0] : null;
    const roles = check ? [] : checks.flat();
    return async function authorizeRequest(request, reply) {
      await authenticate(request, reply);
      const allowed = check
        ? await check(request.user, request)
        : roles.length === 0 || rolesOf(request.user).some((role) => roles.includes(role));
      if (!allowed) throw new Forbidden('You cannot do this');
    };
  }

  // An access token of claims (for the keys of a request, when they are a function of it).
  async function sign(claims, request, extra = {}) {
    const set = await keysOf(request);
    return signJwt(claims, set, { ...signOptions, expiresIn, ...extra });
  }

  async function verify(given, request) {
    return verifyJwt(given, await keysOf(request), verifyOptions);
  }

  const api = { sign, verify, authenticate, authorize, keys: fixed, hashPassword, verifyPassword, tokenOf };
  app.decorate('auth', api);
  app.decorate('authenticate', authenticate);
  app.decorate('authorize', authorize);
  app.decorateRequest('user', null);
  app.decorateRequest('auth', null);
  app.decorateRequest('authError', null);

  // Every request is verified (request.user), so routes without auth know the user too.
  if (hook) app.addHook(hook, async (request) => verifyRequest(request));

  // config: { auth: true | 'role' | ['roles'] | (user, request) => boolean } on a route: checked before its handler
  // (by a hook of every route, so routes declared before the plugin is loaded have it too).
  const checks = new Map();
  const checkOf = (rule) => {
    if (!checks.has(rule)) checks.set(rule, rule === true ? authenticate : authorize(rule));
    return checks.get(rule);
  };
  app.addHook('preHandler', async (request, reply) => {
    const config = request.routeOptions && request.routeOptions.config;
    const rule = config && config.auth;
    if (rule === undefined || rule === false || rule === null) return;
    await checkOf(rule)(request, reply);
  });

  if (options.login) loginRoutes(app, api, { ...options, prefix, expiresIn });
}

// The routes of logging in (POST <prefix>/login), refreshing the access token (POST <prefix>/refresh) and logging out
// (POST <prefix>/logout).
function loginRoutes(app, api, options) {
  const { login, prefix, expiresIn } = options;
  if (typeof login.findUser !== 'function') throw new TypeError('login needs findUser(username, request)');
  const fields = { username: 'username', password: 'password', code: 'code', ...login.fields };
  const passwordOf = login.password || ((user) => user.password);
  const totpOf = login.totp || (() => null);
  const claimsOf = login.claims || ((user) => ({ sub: String(user.id === undefined ? user.pk : user.id) }));
  const lockout =
    login.lockout === false ? null : login.lockout instanceof Lockout ? login.lockout : new Lockout(login.lockout);
  const refresh =
    options.refresh === false
      ? null
      : options.refresh instanceof RefreshTokens
        ? options.refresh
        : new RefreshTokens(options.refresh);
  const cookie = options.refreshCookie
    ? { name: 'refresh_token', path: prefix, ...(options.refreshCookie === true ? {} : options.refreshCookie) }
    : null;
  const passwordSettings = login.passwordOptions;
  // A hash to verify when there is no user, so that the answer takes the same time (made now, not at the first login
  // of a user that does not exist).
  let dummy = hashPassword('xufa-no-user', passwordSettings);
  dummy.catch(() => {
    dummy = null;
  });
  const dummyHash = async () => {
    if (!dummy) dummy = hashPassword('xufa-no-user', passwordSettings);
    return dummy;
  };

  async function tokensFor(claims, request, reply, previous) {
    const accessToken = await api.sign(claims, request);
    const body = { accessToken, tokenType: 'Bearer', expiresIn };
    if (refresh) {
      const issued = previous
        ? await refresh.rotate(previous, { data: claims })
        : await refresh.issue(claims.sub, claims);
      if (cookie) {
        reply.header(
          'set-cookie',
          serializeCookie(cookie.name, issued.token, { ...cookie, maxAge: refresh.ttl / 1000 })
        );
      } else body.refreshToken = issued.token;
    }
    return body;
  }

  function refreshTokenOf(request) {
    if (cookie) {
      const cookies = parseCookies(request.headers.cookie);
      if (cookies[cookie.name]) return cookies[cookie.name];
    }
    return request.body && typeof request.body.refreshToken === 'string' ? request.body.refreshToken : null;
  }

  app.post(`${prefix}/login`, async (request, reply) => {
    const body = request.body || {};
    const username = body[fields.username];
    const password = body[fields.password];
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
      throw new Unauthorized('Invalid credentials');
    }
    if (lockout) {
      try {
        await lockout.check(username);
      } catch (err) {
        if (err instanceof Locked) reply.header('retry-after', String(err.retryAfter));
        throw err;
      }
    }
    const user = await login.findUser(username, request);
    const hash = user ? passwordOf(user) : null;
    const valid = await verifyPassword(password, hash || (await dummyHash()));
    if (!user || !hash || !valid) {
      if (lockout) await lockout.fail(username);
      throw new Unauthorized('Invalid credentials');
    }
    const secret = await totpOf(user);
    if (secret) {
      const code = body[fields.code];
      if (code === undefined || code === null || code === '') {
        throw new TotpRequired('The code of the authenticator app is needed');
      }
      const after = login.lastTotpStep ? await login.lastTotpStep(user) : undefined;
      const step = verifyTotp(code, secret, { ...login.totpOptions, after });
      if (step === null) {
        if (lockout) await lockout.fail(username);
        throw new Unauthorized('Invalid credentials');
      }
      if (login.onTotp) await login.onTotp(user, step);
    }
    if (lockout) await lockout.succeed(username);
    if (login.rehash && needsRehash(hash, passwordSettings)) {
      await login.rehash(user, await hashPassword(password, passwordSettings));
    }
    return tokensFor(await claimsOf(user), request, reply);
  });

  if (refresh) {
    app.post(`${prefix}/refresh`, async (request, reply) => {
      const given = refreshTokenOf(request);
      if (!given) throw new Unauthorized('A refresh token is needed');
      const record = await refresh.verify(given, { spend: true });
      // The claims of the new access token: those kept with the token, or the user's again (null: no longer valid).
      let claims = record.data;
      if (login.reload) {
        claims = await login.reload(record.subject, record.data, request);
        if (!claims) {
          await refresh.revoke(given);
          throw new Unauthorized('The user is no longer valid');
        }
      }
      return tokensFor(claims, request, reply, given);
    });

    app.post(`${prefix}/logout`, async (request, reply) => {
      const given = refreshTokenOf(request);
      if (given) await refresh.revoke(given);
      if (cookie) reply.header('set-cookie', serializeCookie(cookie.name, '', { ...cookie, maxAge: 0 }));
      reply.code(204).send();
    });
  }
}

// As fastify-plugin does: the plugin decorates the app it is registered in (not an encapsulated child).
authPlugin[Symbol.for('skip-override')] = true;
authPlugin[Symbol.for('fastify.display-name')] = '@xufa/auth';
authPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/auth' };

module.exports = { authPlugin, rolesOf };
