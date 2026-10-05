// The plugin of @xufa/auth for @xufa/http (and fastify): who each request is (by its strategies: the access tokens of
// the plugin, API keys, HTTP Basic, strategies of Passport), routes that need a user, and the routes of logging in,
// refreshing and logging out when `login` is given.
//
//   app.register(auth.plugin, { keys: process.env.JWT_KEY, accessToken: { expiresIn: '15m' } });
//   app.get('/me', { onRequest: app.authenticate }, (request) => request.user);
//   app.delete('/users/:id', { config: { auth: ['admin'] } }, handler);   // authenticated, with the role admin
//   app.get('/reports', { config: { auth: { strategy: 'apiKey' } } }, handler);
//
// The access token is read from the Authorization header (Bearer), then from the cookie `token.cookie` and the query
// parameter `token.query`, when they are given. A route without auth works with or without credentials (request.user
// is null without valid ones); one with auth answers 401 without them, and 403 without the roles it needs.
const { KeySet } = require('./keys');
const { signJwtAsync, verifyJwtAsync } = require('./jwt-keyset');
const { seconds } = require('./duration');
const { parseCookies, serializeCookie } = require('./cookies');
const { hashPassword, verifyPassword, needsRehash } = require('./password');
const { verifyTotp } = require('./totp');
const { Lockout } = require('./lockout');
const { RefreshTokens } = require('./refresh');
const { TokenError, Unauthorized, Forbidden, TotpRequired, Locked } = require('./errors');

const VERIFIED = Symbol('xufa.auth.verified');
const RESULTS = Symbol('xufa.auth.results');
const FAILURES = Symbol('xufa.auth.failures');
const BEARER = 'Bearer realm="api"';

const keySetOf = (keys) => (keys instanceof KeySet ? keys : new KeySet(keys));

// The roles of a user: user.roles (a list) or user.role.
function rolesOf(user) {
  if (!user) return [];
  if (Array.isArray(user.roles)) return user.roles;
  return user.role === undefined || user.role === null ? [] : [user.role];
}

async function authPlugin(app, options = {}) {
  const { keys, accessToken = {}, token = {}, user: userOf, prefix = '/auth', hook = 'onRequest' } = options;
  const given = options.strategies || (keys ? ['jwt'] : []);
  if (!keys && (given.includes('jwt') || options.login || options.refresh)) {
    throw new TypeError('The auth plugin needs keys (a secret, a KeySet, or a function of the request)');
  }
  if (given.length === 0) throw new TypeError('The auth plugin needs keys or strategies');
  // The keys of a request: the same for every one, or a function of it (a KeySet per tenant).
  const fixed = keys && typeof keys !== 'function' ? keySetOf(keys) : null;
  const keysOf = async (request) => {
    if (fixed) return fixed;
    if (!keys) throw new TypeError('The auth plugin has no keys to sign or verify tokens');
    return keySetOf(await keys(request));
  };
  const expiresIn = seconds(accessToken.expiresIn === undefined ? '15m' : accessToken.expiresIn, 'expiresIn');
  const signOptions = { issuer: accessToken.issuer, audience: accessToken.audience };
  const verifyOptions = {
    issuer: accessToken.issuer,
    audience: accessToken.audience,
    algorithms: accessToken.algorithms,
    clockTolerance: accessToken.clockTolerance,
  };
  const { header = true, cookie: cookieName = null, query: queryName = null } = token;

  // The access token of a request, or null (an Authorization header of another scheme is left to other strategies).
  function tokenOf(request) {
    if (header) {
      const authorization = request.headers.authorization;
      if (authorization && /^Bearer(\s|$)/i.test(authorization)) {
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

  // The access tokens of the plugin (JWTs) as a strategy: request.auth is their claims.
  const jwtStrategy = {
    name: 'jwt',
    challenge: BEARER,
    openapi: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    async authenticate(request) {
      const found = tokenOf(request);
      if (!found) return null;
      try {
        const claims = await verifyJwtAsync(found, await keysOf(request), verifyOptions);
        const user = userOf ? await userOf(claims, request) : claims;
        if (!user)
          return { fail: { error: new Unauthorized('The user of the token is not valid'), challenge: BEARER } };
        return { user, info: claims };
      } catch (err) {
        if (!(err instanceof TokenError)) throw err;
        return {
          fail: { error: err, challenge: `${BEARER}, error="invalid_token", error_description="${err.message}"` },
        };
      }
    },
  };

  // The strategies by name, and those tried on every request (in order).
  const strategies = new Map();
  const defaults = given.map((strategy) => {
    const resolved = strategy === 'jwt' ? jwtStrategy : strategy;
    if (!resolved || typeof resolved.authenticate !== 'function' || !resolved.name) {
      throw new TypeError(
        "A strategy is 'jwt' or { name, authenticate(request, reply) } (passport(strategy): Passport)"
      );
    }
    if (strategies.has(resolved.name)) throw new TypeError(`Two strategies are named ${resolved.name}`);
    strategies.set(resolved.name, resolved);
    return resolved;
  });
  const strategiesOf = (names) =>
    names.map((name) => {
      const strategy = strategies.get(name) || (name === 'jwt' && keys ? jwtStrategy : null);
      if (!strategy) throw new TypeError(`The auth plugin has no strategy ${name}`);
      return strategy;
    });

  // The result of a strategy for a request: once per request (routes that ask for it again get the same).
  function resultOf(request, reply, strategy) {
    let results = request[RESULTS];
    if (!results) {
      results = new Map();
      request[RESULTS] = results;
    }
    if (!results.has(strategy.name)) results.set(strategy.name, strategy.authenticate(request, reply));
    return results.get(strategy.name);
  }

  // The user of a request by the first of `list` that identifies it: request.user, request.auth (what the strategy
  // knows: the claims of a JWT) and request.authStrategy, or request.authError when credentials were not valid.
  async function identify(request, reply, list) {
    const failures = [];
    for (const strategy of list) {
      const result = await resultOf(request, reply, strategy);
      if (result && result.user) {
        request.user = result.user;
        request.auth = result.info === undefined ? null : result.info;
        request.authStrategy = strategy.name;
        request.authError = null;
        request[FAILURES] = null;
        return;
      }
      if (result && result.fail) failures.push({ ...result.fail, strategy });
    }
    request.user = null;
    request.auth = null;
    request.authStrategy = null;
    request[FAILURES] = failures;
    const first = failures[0];
    request.authError = first
      ? first.error || new Unauthorized(first.message || 'The credentials are not valid')
      : null;
  }

  // Identifies a request once, with the strategies tried on every request.
  async function verifyRequest(request, reply) {
    if (request[VERIFIED]) return;
    request[VERIFIED] = true;
    await identify(request, reply, defaults);
  }

  // The error of a request that needs a user, with the challenges (WWW-Authenticate) of the credentials that failed,
  // or of every strategy of `list` when none were given.
  function unauthorized(request, reply, list) {
    const failures = request[FAILURES] || [];
    const failed = failures.map((failure) => failure.challenge).filter(Boolean);
    const challenges = failed.length ? failed : list.map((strategy) => strategy.challenge).filter(Boolean);
    if (challenges.length) reply.header('www-authenticate', [...new Set(challenges)].join(', '));
    return request.authError || new Unauthorized('Authentication is required');
  }

  // The hook of routes that need an authenticated user.
  async function authenticate(request, reply) {
    await verifyRequest(request, reply);
    if (!request.user) throw unauthorized(request, reply, defaults);
  }

  // The hook of routes that need a user identified by one of some strategies (by name).
  function authenticateWith(...names) {
    const list = strategiesOf(names.flat());
    return async function authenticateWithStrategies(request, reply) {
      await verifyRequest(request, reply);
      if (request.user && list.some((strategy) => strategy.name === request.authStrategy)) return;
      await identify(request, reply, list);
      if (!request.user) throw unauthorized(request, reply, list);
    };
  }

  // Whether the user of a request may: by a check of the user and the request, or roles (any of them).
  async function allows(request, roles, check) {
    if (check) return check(request.user, request);
    return roles.length === 0 || rolesOf(request.user).some((role) => roles.includes(role));
  }

  // The hook of routes that need roles ('admin', or any of a list) or a check of the user (a function of the user
  // and the request that returns whether it may, or a promise of it).
  function authorize(...checks) {
    const check = checks.length === 1 && typeof checks[0] === 'function' ? checks[0] : null;
    const roles = check ? [] : checks.flat();
    return async function authorizeRequest(request, reply) {
      await authenticate(request, reply);
      if (!(await allows(request, roles, check))) throw new Forbidden('You cannot do this');
    };
  }

  // An access token of claims (for the keys of a request, when they are a function of it).
  async function sign(claims, request, extra = {}) {
    const set = await keysOf(request);
    return signJwtAsync(claims, set, { ...signOptions, expiresIn, ...extra });
  }

  async function verify(found, request) {
    return verifyJwtAsync(found, await keysOf(request), verifyOptions);
  }

  // Refresh tokens: with the routes of login, or when the option refresh is given (logins of Passport).
  let refresh = null;
  if (options.refresh instanceof RefreshTokens) refresh = options.refresh;
  else if (options.refresh !== false && (options.login || options.refresh)) {
    refresh = new RefreshTokens(options.refresh === true ? undefined : options.refresh);
  }
  const refreshCookie = options.refreshCookie
    ? { name: 'refresh_token', path: prefix, ...(options.refreshCookie === true ? {} : options.refreshCookie) }
    : null;

  // The tokens of a login: { accessToken, tokenType, expiresIn }, and a refresh token (in the body, or the cookie of
  // refreshCookie) when there are refresh tokens. `previous`: the refresh token that is rotated.
  async function issue(claims, request, reply, previous) {
    const body = { accessToken: await sign(claims, request), tokenType: 'Bearer', expiresIn };
    if (refresh) {
      const issued = previous
        ? await refresh.rotate(previous, { data: claims })
        : await refresh.issue(claims.sub, claims);
      if (refreshCookie) {
        reply.header(
          'set-cookie',
          serializeCookie(refreshCookie.name, issued.token, { ...refreshCookie, maxAge: refresh.ttl / 1000 })
        );
      } else body.refreshToken = issued.token;
    }
    return body;
  }

  const api = {
    sign,
    verify,
    issue,
    authenticate,
    authenticateWith,
    authorize,
    keys: fixed,
    refresh,
    strategies,
    hashPassword,
    verifyPassword,
    tokenOf,
  };
  app.decorate('auth', api);
  app.decorate('authenticate', authenticate);
  app.decorate('authorize', authorize);
  app.decorateRequest('user', null);
  app.decorateRequest('auth', null);
  app.decorateRequest('authError', null);
  app.decorateRequest('authStrategy', null);

  // Every request is identified (request.user), so routes without auth know the user too.
  if (hook) app.addHook(hook, async (request, reply) => verifyRequest(request, reply));

  // config: { auth: true | 'role' | ['roles'] | (user, request) => boolean | { strategy, roles, check } } on a route:
  // checked before its handler (by a hook of every route, so routes declared before the plugin is loaded have it
  // too).
  const checks = new Map();
  const checkOf = (rule) => {
    if (!checks.has(rule)) {
      if (rule === true) checks.set(rule, authenticate);
      else if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
        const identifyWith = rule.strategy === undefined ? authenticate : authenticateWith([].concat(rule.strategy));
        const roles = rule.roles === undefined ? [] : [].concat(rule.roles);
        const check = typeof rule.check === 'function' ? rule.check : null;
        checks.set(rule, async (request, reply) => {
          await identifyWith(request, reply);
          if (!(await allows(request, roles, check))) throw new Forbidden('You cannot do this');
        });
      } else checks.set(rule, authorize(rule));
    }
    return checks.get(rule);
  };
  app.addHook('preHandler', async (request, reply) => {
    const config = request.routeOptions && request.routeOptions.config;
    const rule = config && config.auth;
    if (rule === undefined || rule === false || rule === null) return;
    await checkOf(rule)(request, reply);
  });

  if (options.login) loginRoute(app, api, { ...options, prefix });
  if (refresh) refreshRoutes(app, api, { ...options, prefix, refreshCookie });
}

// The route of logging in (POST <prefix>/login): a username and a password, and the code of an authenticator app.
function loginRoute(app, api, options) {
  const { login, prefix } = options;
  if (typeof login.findUser !== 'function') throw new TypeError('login needs findUser(username, request)');
  const fields = { username: 'username', password: 'password', code: 'code', ...login.fields };
  const passwordOf = login.password || ((user) => user.password);
  const totpOf = login.totp || (() => null);
  const claimsOf = login.claims || ((user) => ({ sub: String(user.id === undefined ? user.pk : user.id) }));
  const lockout =
    login.lockout === false ? null : login.lockout instanceof Lockout ? login.lockout : new Lockout(login.lockout);
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
    return api.issue(await claimsOf(user), request, reply);
  });
}

// The routes of refreshing the access token (POST <prefix>/refresh) and logging out (POST <prefix>/logout).
function refreshRoutes(app, api, options) {
  const { prefix, refreshCookie } = options;
  const { refresh } = api;
  const reload = (options.login && options.login.reload) || options.reload;

  function refreshTokenOf(request) {
    if (refreshCookie) {
      const cookies = parseCookies(request.headers.cookie);
      if (cookies[refreshCookie.name]) return cookies[refreshCookie.name];
    }
    return request.body && typeof request.body.refreshToken === 'string' ? request.body.refreshToken : null;
  }

  app.post(`${prefix}/refresh`, async (request, reply) => {
    const found = refreshTokenOf(request);
    if (!found) throw new Unauthorized('A refresh token is needed');
    const record = await refresh.verify(found, { spend: true });
    // The claims of the new access token: those kept with the token, or the user's again (null: no longer valid).
    let claims = record.data;
    if (reload) {
      claims = await reload(record.subject, record.data, request);
      if (!claims) {
        await refresh.revoke(found);
        throw new Unauthorized('The user is no longer valid');
      }
    }
    return api.issue(claims, request, reply, found);
  });

  app.post(`${prefix}/logout`, async (request, reply) => {
    const found = refreshTokenOf(request);
    if (found) await refresh.revoke(found);
    if (refreshCookie) {
      reply.header('set-cookie', serializeCookie(refreshCookie.name, '', { ...refreshCookie, maxAge: 0 }));
    }
    reply.code(204).send();
  });
}

// As fastify-plugin does: the plugin decorates the app it is registered in (not an encapsulated child).
authPlugin[Symbol.for('skip-override')] = true;
authPlugin[Symbol.for('fastify.display-name')] = '@xufa/auth';
authPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/auth' };

module.exports = { authPlugin, rolesOf };
