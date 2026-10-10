// Strategies of Passport, unchanged, in the plugin (passport()): on every request (passport-http-bearer,
// passport-headerapikey, passport-http, passport-jwt) and as routes of login (passport-local, and passport-oauth2
// against a provider made here, with its state in a cookie: oauthState()). No Passport, no sessions: a login gives the
// tokens of the plugin.
import crypto from 'node:crypto';
import http from 'node:http';
import xufa from '@xufa/http';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { BasicStrategy } from 'passport-http';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import { Strategy as LocalStrategy } from 'passport-local';
import OAuth2Strategy from 'passport-oauth2';
import * as auth from '../index.js';

const KEY = 'a secret of at least thirty-two bytes!';
const USERS = [
  { id: 1, username: 'ada', password: 'analytical', role: 'admin' },
  { id: 2, username: 'grace', password: 'cobol', role: 'user' },
];
const byName = (name) => USERS.find((user) => user.username === name);

// The cookies of Set-Cookie headers, for the next request.
function cookiesOf(res) {
  const list = [].concat(res.headers['set-cookie'] || []);
  return list.map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('passport', () => {
  describe('on every request', () => {
    let app;

    beforeEach(async () => {
      app = xufa();
      app.register(auth.plugin, {
        keys: KEY,
        strategies: [
          'jwt',
          auth.passport(
            new BearerStrategy((token, done) => done(null, token === 'opaque-ada' ? byName('ada') : false))
          ),
          auth.passport(
            new HeaderAPIKeyStrategy({ header: 'X-Api-Key', prefix: '' }, false, (key, done) =>
              done(null, key === 'key-of-grace' ? byName('grace') : false)
            )
          ),
          auth.passport(
            new BasicStrategy((username, password, done) => {
              const user = byName(username);
              done(null, user && user.password === password ? user : false);
            })
          ),
          auth.passport(
            new JwtStrategy(
              { jwtFromRequest: ExtractJwt.fromUrlQueryParameter('jwt'), secretOrKey: KEY },
              (claims, done) => done(null, { id: Number(claims.sub), via: 'passport-jwt' })
            ),
            { name: 'passport-jwt' }
          ),
        ],
      });
      app.get('/whoami', (request) => ({ id: request.user && request.user.id, strategy: request.authStrategy }));
      app.get('/me', { config: { auth: true } }, (request) => ({ id: request.user.id || Number(request.user.sub) }));
      app.get('/basic-only', { config: { auth: { strategy: 'basic' } } }, (request) => ({ id: request.user.id }));
      await app.ready();
    });

    it('each strategy identifies its users', async () => {
      const basic = `Basic ${Buffer.from('grace:cobol').toString('base64')}`;
      const signed = await app.auth.sign({ sub: '2' });
      const cases = [
        [{ headers: { authorization: 'Bearer opaque-ada' } }, { id: 1, strategy: 'bearer' }],
        [{ headers: { 'x-api-key': 'key-of-grace' } }, { id: 2, strategy: 'headerapikey' }],
        [{ headers: { authorization: basic } }, { id: 2, strategy: 'basic' }],
        [{ query: { jwt: signed } }, { id: 2, strategy: 'passport-jwt' }],
      ];
      for (const [request, expected] of cases) {
        const res = await app.inject({ url: '/whoami', ...request });
        expect(res.json()).toEqual(expected);
      }
    });

    it('a token of the plugin is taken by its strategy first (jwt), then the others are tried', async () => {
      const token = await app.auth.sign({ sub: '1' });
      const res = await app.inject({ url: '/whoami', headers: { authorization: `Bearer ${token}` } });
      expect(res.json()).toEqual({ id: undefined, strategy: 'jwt' });
      // An opaque token is not a JWT: jwt fails it, and bearer of Passport takes it.
      const opaque = await app.inject({ url: '/me', headers: { authorization: 'Bearer opaque-ada' } });
      expect(opaque.json()).toEqual({ id: 1 });
    });

    it('failures are 401 with the challenges of the strategies', async () => {
      const res = await app.inject({ url: '/me', headers: { authorization: 'Bearer nobody' } });
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Bearer realm="Users", error="invalid_token"');
      const none = await app.inject({ url: '/basic-only' });
      expect(none.statusCode).toBe(401);
      expect(none.headers['www-authenticate']).toBe('Basic realm="Users"');
    });

    it('a route of one strategy', async () => {
      const basic = `Basic ${Buffer.from('ada:analytical').toString('base64')}`;
      expect((await app.inject({ url: '/basic-only', headers: { authorization: basic } })).json()).toEqual({ id: 1 });
      const bearer = await app.inject({ url: '/basic-only', headers: { authorization: 'Bearer opaque-ada' } });
      expect(bearer.statusCode).toBe(401);
    });

    it('the errors of a strategy are errors of the request', async () => {
      const failing = xufa();
      failing.register(auth.plugin, {
        strategies: [auth.passport(new BearerStrategy((token, done) => done(new Error('the store is down'))))],
      });
      failing.get('/me', { config: { auth: true } }, () => ({}));
      const res = await failing.inject({ url: '/me', headers: { authorization: 'Bearer x' } });
      expect(res.statusCode).toBe(500);
    });

    it('a strategy with passReqToCallback sees the request', async () => {
      const seen = [];
      const strict = xufa();
      strict.register(auth.plugin, {
        strategies: [
          auth.passport(
            new BearerStrategy({ passReqToCallback: true }, (req, token, done) => {
              seen.push({ url: req.url, tenant: req.headers['x-tenant'], method: req.method });
              done(null, { id: 3 });
            })
          ),
        ],
      });
      strict.get('/me', { config: { auth: true } }, (request) => request.user);
      await strict.inject({ url: '/me?a=1', headers: { authorization: 'Bearer t', 'x-tenant': 'acme' } });
      expect(seen).toEqual([{ url: '/me?a=1', tenant: 'acme', method: 'GET' }]);
    });

    it('things that are not strategies of Passport are refused', () => {
      expect(() => auth.passport({})).toThrow(/strategy of Passport/);
      expect(() => auth.passport({ authenticate() {} })).toThrow(/no name/);
    });
  });

  describe('logins', () => {
    it('passport-local: a form that gives the tokens of the plugin', async () => {
      const local = auth.passport(
        new LocalStrategy((username, password, done) => {
          const user = byName(username);
          if (!user || user.password !== password) return done(null, false, { message: 'Wrong username or password' });
          return done(null, user);
        })
      );
      const app = xufa();
      app.register(auth.plugin, { keys: KEY, refresh: { ttl: '1d' } });
      app.post('/login', local.login({ claims: (user) => ({ sub: String(user.id), role: user.role }) }));
      app.get('/me', { config: { auth: ['admin'] } }, (request) => request.user);
      const res = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'ada', password: 'analytical' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(typeof body.refreshToken).toBe('string');
      const me = await app.inject({ url: '/me', headers: { authorization: `Bearer ${body.accessToken}` } });
      expect(me.json()).toMatchObject({ sub: '1', role: 'admin' });
      // Refresh tokens work as those of the routes of login.
      const refreshed = await app.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refreshToken: body.refreshToken },
      });
      expect(refreshed.statusCode).toBe(200);

      const wrong = await app.inject({ method: 'POST', url: '/login', payload: { username: 'ada', password: 'x' } });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().message).toBe('Wrong username or password');
      // The status the strategy gives (400: credentials missing).
      const missing = await app.inject({ method: 'POST', url: '/login', payload: {} });
      expect(missing.statusCode).toBe(400);
    });

    it('onLogin and onFailure answer instead', async () => {
      const local = auth.passport(
        new LocalStrategy((username, password, done) => done(null, byName(username) || false))
      );
      const app = xufa();
      app.register(auth.plugin, { keys: KEY });
      app.post(
        '/login',
        local.login({
          onLogin: (user, info, request, reply) => reply.redirect(`/welcome/${user.id}?by=${request.authStrategy}`),
          onFailure: (failure, request, reply) => reply.code(303).header('location', '/login?failed=1').send(),
        })
      );
      const ok = await app.inject({ method: 'POST', url: '/login', payload: { username: 'grace', password: 'any' } });
      expect([ok.statusCode, ok.headers.location]).toEqual([302, '/welcome/2?by=local']);
      const failed = await app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'nobody', password: 'x' },
      });
      expect([failed.statusCode, failed.headers.location]).toEqual([303, '/login?failed=1']);
    });
  });

  describe('OAuth 2.0 (passport-oauth2) with the state in a cookie', () => {
    let provider;
    let providerUrl;
    const challenges = new Map();
    const exchanged = [];

    beforeAll(async () => {
      // A provider: its token endpoint gives an access token for a code (and checks the verifier of PKCE).
      provider = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          exchanged.push(Object.fromEntries(params));
          const code = params.get('code');
          const challenge = challenges.get(code);
          const verifier = params.get('code_verifier');
          if (
            challenge &&
            crypto
              .createHash('sha256')
              .update(verifier || '')
              .digest('base64url') !== challenge
          ) {
            res.writeHead(400, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ access_token: `at-${code}`, token_type: 'bearer' }));
        });
      });
      await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
      providerUrl = `http://127.0.0.1:${provider.address().port}`;
    });

    afterAll(() => new Promise((resolve) => provider.close(resolve)));

    async function oauthApp({ pkce = false, secret = 'a secret for the state cookies' } = {}) {
      const strategy = auth.passport(
        new OAuth2Strategy(
          {
            authorizationURL: `${providerUrl}/authorize`,
            tokenURL: `${providerUrl}/token`,
            clientID: 'client',
            clientSecret: 'shh',
            callbackURL: '/auth/provider/callback',
            pkce,
            store: auth.oauthState({ secret }),
          },
          (accessToken, refreshToken, profile, done) => done(null, { id: `user-of-${accessToken}` })
        )
      );
      const app = xufa();
      app.register(auth.plugin, { keys: KEY });
      app.get('/auth/provider', strategy.login({ scope: ['email'] }));
      app.get('/auth/provider/callback', strategy.login());
      app.get('/me', { config: { auth: true } }, (request) => request.user);
      await app.ready();
      return app;
    }

    // The redirect to the provider: its state (and challenge of PKCE), and the cookie that keeps it.
    async function start(app) {
      const res = await app.inject({ url: '/auth/provider' });
      expect(res.statusCode).toBe(302);
      const location = new URL(res.headers.location);
      expect(`${location.origin}${location.pathname}`).toBe(`${providerUrl}/authorize`);
      return { location, cookie: cookiesOf(res), setCookie: [].concat(res.headers['set-cookie'])[0] };
    }

    it('the redirect, the callback, and the tokens of the plugin', async () => {
      const app = await oauthApp();
      const { location, cookie, setCookie } = await start(app);
      expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:80/auth/provider/callback');
      expect(location.searchParams.get('scope')).toBe('email');
      expect(setCookie).toMatch(/^xufa_oauth_state=.+; Path=\/; Max-Age=600; HttpOnly; Secure; SameSite=Lax$/);
      // The cookie holds no readable state: it is sealed.
      expect(decodeURIComponent(cookie)).not.toContain(location.searchParams.get('state'));
      const state = location.searchParams.get('state');
      const callback = await app.inject({
        url: `/auth/provider/callback?code=c1&state=${encodeURIComponent(state)}`,
        headers: { cookie },
      });
      expect(callback.statusCode).toBe(200);
      // The cookie of the state is removed.
      expect([].concat(callback.headers['set-cookie'])[0]).toMatch(/^xufa_oauth_state=; .*Max-Age=0/);
      const me = await app.inject({ url: '/me', headers: { authorization: `Bearer ${callback.json().accessToken}` } });
      expect(me.json()).toMatchObject({ sub: 'user-of-at-c1' });
      expect(exchanged.at(-1)).toMatchObject({ code: 'c1', grant_type: 'authorization_code', client_id: 'client' });
    });

    it('with PKCE: the verifier kept in the cookie reaches the provider', async () => {
      const app = await oauthApp({ pkce: true });
      const { location, cookie } = await start(app);
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      challenges.set('c2', location.searchParams.get('code_challenge'));
      const state = encodeURIComponent(location.searchParams.get('state'));
      const callback = await app.inject({ url: `/auth/provider/callback?code=c2&state=${state}`, headers: { cookie } });
      expect(callback.statusCode).toBe(200);
      expect(exchanged.at(-1).code_verifier).toMatch(/^[\w-]{43,}$/);
    });

    it('a callback without the cookie, of another state, or with a forged cookie is refused', async () => {
      // 403: what passport-oauth2 answers for a state it cannot verify.
      const app = await oauthApp();
      const { location, cookie } = await start(app);
      const state = encodeURIComponent(location.searchParams.get('state'));
      const calls = exchanged.length;
      const noCookie = await app.inject({ url: `/auth/provider/callback?code=c3&state=${state}` });
      expect(noCookie.statusCode).toBe(403);
      const otherState = await app.inject({ url: '/auth/provider/callback?code=c3&state=other', headers: { cookie } });
      expect(otherState.statusCode).toBe(403);
      const forged = cookie.replace(/=(.)/, (all, first) => `=${first === 'A' ? 'B' : 'A'}`);
      const forgedCookie = await app.inject({
        url: `/auth/provider/callback?code=c3&state=${state}`,
        headers: { cookie: forged },
      });
      expect(forgedCookie.statusCode).toBe(403);
      // The cookie of another app (another secret) is not taken either.
      const other = await oauthApp({ secret: 'the secret of another app' });
      const elsewhere = await other.inject({
        url: `/auth/provider/callback?code=c3&state=${state}`,
        headers: { cookie },
      });
      expect(elsewhere.statusCode).toBe(403);
      // No code was exchanged for any of them.
      expect(exchanged.length).toBe(calls);
    });

    it('a state cookie that expired is refused', async () => {
      const store = auth.oauthState({ secret: 'a secret for the state cookies', maxAge: -1 });
      const strategy = auth.passport(
        new OAuth2Strategy(
          {
            authorizationURL: `${providerUrl}/authorize`,
            tokenURL: `${providerUrl}/token`,
            clientID: 'client',
            clientSecret: 'shh',
            callbackURL: '/cb',
            store,
          },
          (accessToken, refreshToken, profile, done) => done(null, { id: 1 })
        )
      );
      const app = xufa();
      app.register(auth.plugin, { keys: KEY });
      app.get('/go', strategy.login());
      app.get('/cb', strategy.login());
      const res = await app.inject({ url: '/go' });
      const state = encodeURIComponent(new URL(res.headers.location).searchParams.get('state'));
      const callback = await app.inject({ url: `/cb?code=c4&state=${state}`, headers: { cookie: cookiesOf(res) } });
      expect(callback.statusCode).toBe(403);
    });

    it('oauthState needs a secret, and passport() to run it', () => {
      expect(() => auth.oauthState({})).toThrow(/secret/);
      const store = auth.oauthState({ secret: 'a secret for the state cookies' });
      let error;
      store.store({ headers: {} }, undefined, undefined, {}, (err) => {
        error = err;
      });
      expect(error.message).toMatch(/passport\(\)/);
    });
  });
});
