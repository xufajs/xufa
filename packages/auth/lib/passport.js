// The strategies of Passport (passport-local, passport-http-bearer, passport-oauth2, passport-google-oauth20...) in
// @xufa/auth, without Passport: a strategy is an object whose authenticate(req, options) answers by calling
// this.success(user, info), this.fail(challenge, status), this.redirect(url, status), this.pass() or this.error(err),
// which passport(strategy) gives it. There are no sessions: a login issues the tokens of the plugin.
//
//   // On every request, as the strategies of the plugin (credentials in each request):
//   app.register(auth.plugin, { strategies: [auth.passport(new BearerStrategy(verify))] });
//
//   // Logins (a form, or the redirect to a provider and its callback), as handlers of routes:
//   const github = auth.passport(new GitHubStrategy({ ..., store: auth.oauthState({ secret }) }, verify));
//   app.get('/auth/github', github.login({ scope: ['user:email'] }));
//   app.get('/auth/github/callback', github.login({ onLogin: (user, info, request, reply) => ... }));
//
// The request a strategy sees is the one of xufa (headers, query, body, url, originalUrl, params, session when a
// plugin gives one) with what Express has that strategies read: connection and socket (the callback URL of OAuth),
// and res.
const crypto = require('node:crypto');
const { parseCookies, serializeCookie } = require('./cookies');
const { Unauthorized } = require('./errors');

const kReply = Symbol('xufa.auth.reply');

function passportRequest(request, reply) {
  const req = Object.create(request);
  const socket = request.raw && request.raw.socket;
  Object.defineProperties(req, {
    connection: { value: socket, writable: true, configurable: true },
    socket: { value: socket, writable: true, configurable: true },
    res: { value: reply && reply.raw, writable: true, configurable: true },
    [kReply]: { value: reply },
  });
  return req;
}

// What the strategy did: { type: 'success', user, info } | { type: 'fail', challenge, status } | { type: 'redirect',
// url, status } | { type: 'pass' }; rejected with what it gave to error().
function run(strategy, req, options) {
  return new Promise((resolve, reject) => {
    const self = Object.create(strategy);
    let done = false;
    const finish = (action) => {
      if (done) return;
      done = true;
      resolve(action);
    };
    self.success = (user, info) => finish({ type: 'success', user, info });
    self.fail = (challenge, status) => {
      if (typeof challenge === 'number') finish({ type: 'fail', challenge: undefined, status: challenge });
      else finish({ type: 'fail', challenge, status });
    };
    self.redirect = (url, status = 302) => finish({ type: 'redirect', url, status });
    self.pass = () => finish({ type: 'pass' });
    self.error = (err) => {
      if (done) return;
      done = true;
      reject(err);
    };
    try {
      strategy.authenticate.call(self, req, options || {});
    } catch (err) {
      self.error(err);
    }
  });
}

// A failure of Passport ({ challenge, status }) as one of the plugin ({ challenge, message, status }).
function failureOf({ challenge, status }) {
  if (typeof challenge === 'string') return { challenge, status };
  return { message: challenge && challenge.message, status };
}

const defaultClaims = (user) => {
  const id = user.id !== undefined ? user.id : user.pk !== undefined ? user.pk : user.username;
  return { sub: String(id) };
};

/**
 * A strategy of Passport, for the plugin. `name`: the name of the strategy in the plugin (strategy.name by default);
 * `options`: the options of its authenticate() on every request.
 */
// The security scheme of OpenAPI of a strategy of Passport (for @xufa/openapi), by what it is: OAuth 2.0 (passport-oauth2
// and those made on it), bearer tokens, API keys in a header, HTTP Basic and Digest. Logins of forms (local) have none.
function openapiOf(strategy, name) {
  const oauth2 = strategy._oauth2;
  if (oauth2 && oauth2._authorizeUrl && oauth2._accessTokenUrl) {
    return {
      type: 'oauth2',
      flows: {
        authorizationCode: { authorizationUrl: oauth2._authorizeUrl, tokenUrl: oauth2._accessTokenUrl, scopes: {} },
      },
    };
  }
  switch (strategy.name || name) {
    case 'bearer':
      return { type: 'http', scheme: 'bearer' };
    case 'jwt':
      return { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' };
    case 'basic':
      return { type: 'http', scheme: 'basic' };
    case 'digest':
      return { type: 'http', scheme: 'digest' };
    case 'headerapikey':
      return strategy.apiKeyHeader && strategy.apiKeyHeader.header
        ? { type: 'apiKey', in: 'header', name: strategy.apiKeyHeader.header }
        : undefined;
    default:
      return undefined;
  }
}

function passport(strategy, { name = strategy && strategy.name, options: requestOptions = {}, openapi } = {}) {
  if (!strategy || typeof strategy.authenticate !== 'function') {
    throw new TypeError('passport() needs a strategy of Passport (an object with authenticate(req, options))');
  }
  if (!name) throw new TypeError('The strategy has no name: give one, passport(strategy, { name })');

  return {
    name,
    strategy,
    openapi: openapi === undefined ? openapiOf(strategy, name) : openapi || undefined,

    // On every request: a user, a failure, or nothing (pass). A strategy that redirects is one for login().
    async authenticate(request, reply) {
      const action = await run(strategy, passportRequest(request, reply), requestOptions);
      if (action.type === 'success') return action.user ? { user: action.user, info: action.info } : null;
      if (action.type === 'fail') return { fail: failureOf(action) };
      if (action.type === 'pass') return null;
      throw new TypeError(`The strategy ${name} redirects: use it in a route, with ${name}.login()`);
    },

    /**
     * The handler of a route of login with the strategy: its redirects are sent, its failures answered 401, and its
     * user given to onLogin(user, info, request, reply), whose result is the answer (the tokens of the plugin by
     * default, of claims(user): { sub: user.id }). The other options are those of its authenticate() (scope...).
     */
    login(loginOptions = {}) {
      const { onLogin, onFailure, claims = defaultClaims, ...authOptions } = loginOptions;
      return async function passportLogin(request, reply) {
        const action = await run(strategy, passportRequest(request, reply), { ...requestOptions, ...authOptions });
        if (action.type === 'redirect') return reply.redirect(action.url, action.status);
        if (action.type === 'success' && action.user) {
          request.user = action.user;
          request.auth = action.info === undefined ? null : action.info;
          request.authStrategy = name;
          if (onLogin) return onLogin(action.user, action.info, request, reply);
          return request.server.auth.issue(await claims(action.user, request), request, reply);
        }
        const failure = action.type === 'fail' ? failureOf(action) : {};
        if (onFailure) return onFailure(failure, request, reply);
        if (failure.challenge) reply.header('www-authenticate', failure.challenge);
        const err = new Unauthorized(failure.message || 'Authentication failed');
        if (failure.status && failure.status !== 401) err.statusCode = failure.status;
        throw err;
      };
    },
  };
}

/**
 * The state of OAuth 2.0 logins (passport-oauth2 and the strategies made on it) in a cookie, as there is no session:
 * the `store` option of the strategy. The state sent to the provider is a random handle; the cookie holds it, with
 * the code verifier of PKCE, encrypted and authenticated (AES-256-GCM with a key of `secret`), for `maxAge` seconds.
 * The callback must come back to the same site (SameSite=Lax lets the redirect of the provider carry the cookie).
 */
function oauthState(options = {}) {
  const { secret, name = 'xufa_oauth_state', maxAge = 600, path = '/', secure = true, sameSite = 'Lax' } = options;
  if (!secret || String(secret).length < 16) throw new TypeError('oauthState needs a secret of 16 characters or more');
  const key = crypto.createHash('sha256').update(`xufa-oauth-state:${secret}`).digest();
  const cookieOptions = { path, secure, sameSite, httpOnly: true };

  const seal = (data) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  };
  const open = (text) => {
    try {
      const raw = Buffer.from(text, 'base64url');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    } catch {
      return null;
    }
  };
  const replyOf = (req) => {
    const reply = req[kReply];
    if (!reply) throw new Error('oauthState works with strategies run by passport() of @xufa/auth');
    return reply;
  };
  const invalid = { message: 'Unable to verify authorization request state.' };

  return {
    // Called with four arguments (or five, with the code verifier of PKCE): passport-oauth2 looks at their number.
    store(req, verifier, state, meta, callback) {
      try {
        const handle = crypto.randomBytes(24).toString('base64url');
        const value = seal({
          h: handle,
          v: verifier || null,
          s: state === undefined ? null : state,
          e: Date.now() + maxAge * 1000,
        });
        replyOf(req).header('set-cookie', serializeCookie(name, value, { ...cookieOptions, maxAge }));
        callback(null, handle);
      } catch (err) {
        callback(err);
      }
    },
    verify(req, providedState, meta, callback) {
      let data;
      try {
        const cookie = parseCookies(req.headers.cookie)[name];
        // Used once: removed whatever the result.
        replyOf(req).header('set-cookie', serializeCookie(name, '', { ...cookieOptions, maxAge: 0 }));
        data = cookie ? open(cookie) : null;
      } catch (err) {
        callback(err);
        return;
      }
      if (!data || typeof data.h !== 'string' || !(data.e > Date.now()) || typeof providedState !== 'string') {
        callback(null, false, invalid);
        return;
      }
      const given = Buffer.from(providedState);
      const kept = Buffer.from(data.h);
      if (given.length !== kept.length || !crypto.timingSafeEqual(given, kept)) {
        callback(null, false, invalid);
        return;
      }
      callback(null, data.v || true, data.s === null ? undefined : data.s);
    },
  };
}

module.exports = { passport, oauthState, passportRequest, run };
