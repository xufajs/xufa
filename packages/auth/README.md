# @xufa/auth

The authentication of [xufa](../xufa), with no dependencies (everything is `node:crypto`):

- **Passwords** hashed with scrypt (the parameters OWASP recommends), as PHC strings, with `needsRehash()` to move
  old hashes to new parameters.
- **JSON Web Tokens**: HS256/384/512, RS, PS, ES256/384/512 and EdDSA, keys by id that rotate, and the JWKS of the
  public ones.
- **One-time codes** of authenticator apps (TOTP), their QR codes (otpauth:// URIs), each code taken once, and
  recovery codes.
- **Lockout** of logins after too many failures, shared by the workers of a cluster with a `SharedCache` of
  [@xufa/orm](../orm).
- **Refresh tokens** that rotate: kept hashed, spent when used, and a token used twice (stolen) revokes its family.
- **The plugin** of [@xufa/http](../http) that puts them together: `request.user`, routes that need a user or a role,
  and the routes of logging in, refreshing and logging out.

```js
const xufa = require('xufa');
const { Database, Model, fields, plugin: orm } = require('xufa/orm');
const auth = require('xufa/auth'); // or require('@xufa/auth')

class User extends Model {
  static fields = {
    email: fields.string({ unique: true }),
    password: fields.string(),
    role: fields.string({ default: 'user' }),
    totpSecret: fields.encrypted(fields.string(), { null: true }), // keys: XUFA_ENCRYPTION_KEYS
    totpStep: fields.integer({ null: true }),
  };
}

class RefreshToken extends Model {
  static fields = auth.refreshTokenFields(fields);

  static options = { indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] }; // deleted when they expire
}

const db = new Database({ backend: 'sqlite', filename: 'app.db' });
db.register(User, RefreshToken);

const app = xufa();
app.register(orm, { database: db, sync: true, expire: true });
app.register(auth.plugin, {
  keys: process.env.JWT_KEY,
  accessToken: { expiresIn: '15m' },
  login: {
    findUser: (email) => User.objects.filter({ email: email.toLowerCase() }).first(),
    claims: (user) => ({ sub: String(user.id), role: user.role }),
    totp: (user) => user.totpSecret, // users with a secret need the code of their app
    lastTotpStep: (user) => user.totpStep,
    onTotp: (user, step) => User.objects.filter({ id: user.id }).update({ totpStep: step }),
    rehash: (user, hash) => User.objects.filter({ id: user.id }).update({ password: hash }),
  },
  refresh: { store: auth.modelStore(RefreshToken), ttl: '30d' },
});

app.get('/me', { config: { auth: true } }, (request) => request.user);
app.delete('/users/:id', { config: { auth: ['admin'] } }, async (request) => {
  await User.objects.filter({ id: request.params.id }).delete();
  return { deleted: true };
});
```

```sh
POST /auth/login    { "username": "ada@example.com", "password": "...", "code": "123456" }
  -> { "accessToken": "eyJ...", "tokenType": "Bearer", "expiresIn": 900, "refreshToken": "..." }
GET  /me            Authorization: Bearer eyJ...
POST /auth/refresh  { "refreshToken": "..." }   -> new tokens (the old refresh token is spent)
POST /auth/logout   { "refreshToken": "..." }   -> 204
```

## Passwords

`hashPassword(password, options)` gives `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`: scrypt with N = 2^17, r = 8, p = 1
(128 MiB, as OWASP recommends), 16 bytes of salt and 32 of hash; the password is normalized (NFKC) first.
`verifyPassword(password, hash)` reads the parameters from the hash, so hashes made with older ones still verify, and
compares in constant time. `needsRehash(hash, options)` says when a hash was made with other parameters: the plugin
gives the new hash to `login.rehash` after a login, when the password is at hand.

## JSON Web Tokens

```js
const keys = new auth.KeySet({ current: '2026-10', keys: { '2026-10': process.env.JWT_KEY, '2026-07': oldKey } });
const token = auth.signJwt({ sub: '42', role: 'admin' }, keys, { expiresIn: '15m', issuer: 'app' });
const claims = auth.verifyJwt(token, keys, { issuer: 'app' }); // or a TokenError (401) with its reason
```

A `KeySet` has keys by id: the current one signs (its id is the `kid` of the tokens), and all of them verify, so a
new key can sign while the tokens of the old one are still taken. A key is a secret (a string or Buffer of 32 bytes or
more, for HS256; `{ key, algorithm: 'HS512' }` for others) or a PEM or KeyObject of `node:crypto`: RSA (RS256, or
`{ key, algorithm: 'PS256' }`), EC (ES256, ES384 or ES512, by its curve) or Ed25519 (EdDSA). A private key signs, and
its public key verifies; a set of public keys only verifies (as another service would). `keys.toJWKS()` gives the
public keys as a JWKS, to publish them.

`signJwt(payload, keys, options)`: `expiresIn` and `notBefore` (seconds, or `'15m'`, `'12h'`, `'7d'`), `issuer`,
`audience`, `subject`, `jwtId` (`true` for a random one), `header`. `iat` is set unless `timestamp: false`.

`verifyJwt(token, keys, options)` takes only the algorithms of its keys (a token cannot choose `none`, nor HMAC with a
public key), and checks `exp` and `nbf` (with `clockTolerance` seconds of leeway) and, when they are given, `issuer`
and `audience` (values or lists, strings or RegExps), `subject` and `maxAge`. The `reason` of its TokenError is
`malformed`, `algorithm`, `signature`, `expired`, `notBefore`, `issuer`, `audience`, `subject` or `maxAge`.
`decodeJwt(token)` gives the header and claims without verifying. `signJwtAsync()` and `verifyJwtAsync()` are the same
as Promises: RSA keys (RS, PS) sign in libuv's thread pool, so the event loop does not wait for their half a
millisecond; the other signatures and every verification take 20 to 90 µs, about what the hand-off to the pool costs,
and are done on the loop. The plugin uses them.

The tokens are signed and verified by [@xufa/jwt](../jwt) (the checks and tests of jsonwebtoken, jws and jwa): RSA
keys under 2048 bits do not sign, and tokens with critical extensions (`crit`) are refused.

## Keys per tenant

A `KeyVault` keeps the keys of each tenant in a store, the private keys encrypted with keys derived from its secret,
the tenant and the key (a copy of the store is no key, and keys cannot be moved between tenants):

```js
const { KeyVault, vaultModelStore, vaultFields } = require('@xufa/auth');

class TenantKeys extends Model {
  static fields = vaultFields(fields);
}
const vault = new KeyVault({ secret: process.env.VAULT_SECRET, store: vaultModelStore(TenantKeys) });
await vault.create('acme'); // its first key (ES256 by default; HS, RS, PS, ES or EdDSA)

app.register(auth.plugin, { keys: (request) => vault.keys(tenantOf(request)), login });
app.get('/.well-known/jwks.json', (request) => vault.jwks(tenantOf(request)));
await vault.rotate('acme'); // verifies at once, signs after ttl; the old key verifies `keep` more
```

`keys(tenant)` is kept `ttl` (5 minutes) in memory; a rotated key signs only after `ttl`, when every process has
loaded it, so no process meets a token of a key it does not know (`rotate(tenant, { immediate: true })` for a key that
leaked, then `revoke(tenant, keyId)`). Records change by compare-and-swap on their version: processes that rotate at
once lose no key. `rotateAfter` rotates old keys when they are used; `autoCreate` (false) makes the keys of unknown
tenants, which is unwise when tenants come from what clients send. A `KeySet` takes an encrypted private key as
`{ key, passphrase }`.

## One-time codes (TOTP)

```js
// Enrolling: the app scans the QR code of the URI, and the user types a code to confirm it.
const secret = auth.generateSecret();
const uri = auth.totpUri({ secret, issuer: 'Acme', label: 'ada@example.com' });
const step = auth.verifyTotp(code, secret); // null, or the time step to keep with the user
```

`verifyTotp(code, secret, { window, after })` takes the codes of `window` steps before and after now (1: 30 seconds of
clock difference) and returns the step of the code; a code of the step `after` or before is refused, so keeping the
step of each login (`login.onTotp`, `login.lastTotpStep`) makes each code work once. `totp()` and `hotp()` give codes
(RFC 6238 and RFC 4226: SHA1, SHA256 or SHA512, 6 to 10 digits, any period); `base32Encode()` and `base32Decode()`
convert secrets. `generateRecoveryCodes(n)` gives codes to log in without the app (keep `hashRecoveryCode(code)` of
each, and compare the hash of the one given).

The secrets of TOTP are as sensitive as passwords that never change: keep them encrypted, in a field
`fields.encrypted(fields.string())` of [@xufa/orm](../orm#encrypted-fields) (as in the example).

## Lockout

```js
const lockout = new auth.Lockout({ maxAttempts: 5, window: '15m', lockFor: '15m' });
await lockout.check(email); // throws Locked (429, retryAfter) while it is locked
ok ? await lockout.succeed(email) : await lockout.fail(email);
```

`maxAttempts` failures of a key (an account, an IP) within `window` lock it for `lockFor`; a success forgets them.
They are kept in a store with `get`, `set(key, value, ttl)` and `delete`: one of the process by default, or a cache of
@xufa/orm given as `store` (`SharedCache` keeps them in the primary of a cluster, so every worker counts the same
failures). Counting is not atomic across processes: failures at the same time in two workers may count once.

Keys are counted by `normalizeIdentifier(key)`: Unicode NFKC and lower case, so names a person cannot tell apart are
one key (`'ＡＤＭＩＮ'`, full-width, and `'Admin'` are `'admin'`; a ligature `'ﬁ'` is `'fi'`) and have one count of
failures. Store and find users by it too, so a name and its look-alike are one account. Letters of other scripts that
look the same (Cyrillic `а`) are other letters and are not changed.

`skeleton(value)` covers those: the skeleton of Unicode's security mechanisms (UTS #39, its `confusables.txt`), the
same for texts that look alike across scripts (`"pаypal"` with a Cyrillic `а`, and `"paypal"`; `"rn"` and `"m"`). Keep
`skeleton(normalizeIdentifier(name))` with each user, unique, and refuse a new name whose skeleton is taken: no one can
sign up as a look-alike of another. It is a key to compare, not a text to show. The data (6,712 characters, 60 KB) is
read the first time it is used; `scripts/generate-confusables.js` writes it again from a new `confusables.txt`.

## Refresh tokens

```js
const refresh = new auth.RefreshTokens({ store: auth.modelStore(RefreshToken), ttl: '30d' });
const { token } = await refresh.issue(user.id, claims);
const next = await refresh.rotate(token); // { token, record }: the old one is spent
await refresh.revoke(next.token); // logout (its family)
await refresh.revokeSubject(user.id); // logout everywhere (a changed password)
```

A token is `<id>.<secret>`: the store keeps its id, the SHA-256 of its secret (a stolen store gives no usable token),
its subject, data (the claims of the access tokens it gives) and dates. Each use spends it and gives a new one of its
family; a token used twice means that two parties have it, so its whole family is revoked: the thief's token and the
user's stop working (the user logs in again). `reuseInterval` lets a spent token be used again for a while, for
clients that refresh twice at once. Spending is atomic (an update of the row where it is not spent).

Stores: `MemoryTokenStore` (the default: one process, tests) and `modelStore(Model)`, for a model of @xufa/orm with
the fields of `refreshTokenFields(fields)`. A [TTL index](../orm#ttl-indexes) on `expiresAt` (with the plugin's
`expire`, as in the example) deletes the tokens that expired; without one, call `refresh.prune()` now and then.

## The plugin

`app.register(auth.plugin, options)`:

- `keys`: a secret, a `KeySet` (or its options), or a function of the request that gives them (a `KeySet` per tenant:
  `(request) => keysOf(request.tenant)`). Needed by the strategy `'jwt'`, logins and refresh tokens.
- `strategies`: how requests say who they are, tried in order on every request (`['jwt']` when `keys` are given): see
  [Strategies](#strategies).
- `accessToken`: `expiresIn` (`'15m'`), `issuer`, `audience`, `algorithms`, `clockTolerance`.
- `token`: where tokens are read from: the Authorization header (`Bearer`; `header: false` to not read it), then the
  cookie `cookie` and the query parameter `query`, when they are given.
- `user(claims, request)`: the user of a valid token (its claims by default; null refuses it).
- `hook`: the hook that verifies the token of every request (`'onRequest'`), or `false`: only the routes with auth do.
- `tenants`: `of(request)`, the tenant of a request (`request.tenant`, which the plugin of the ORM sets), and
  `claim(user)`, the tenants a user may use (its claims `tenants` or `tenant`): see [Tenants](#tenants).

Every request gets `request.user` (null without a valid token), `request.auth` (the claims) and `request.authError`.
Routes that need a user say so with `config: { auth: true }`, a role (`'admin'`), roles (`['admin', 'staff']`: any of
them, from `user.roles` or `user.role`) or a function (`(user, request) => boolean`); or with the hooks
`app.authenticate` and `app.authorize(...roles)`. Without a valid token they answer 401 (with `WWW-Authenticate`), and
403 without the role. `app.auth` has `sign(claims, request)`, `verify(token, request)`, the keys and the passwords.

With `login`, the plugin adds `POST <prefix>/login`, `/refresh` and `/logout` (`prefix`: `'/auth'`):

- `findUser(username, request)`: the user, or null. `password(user)` gives its hash (`user.password`).
- `claims(user)`: the claims of its tokens (`{ sub: String(user.id) }`).
- `totp(user)`: its secret of TOTP, when it has one: then the login needs `code` (without it, 401 with the code
  `XUFA_AUTH_TOTP_REQUIRED`, for the client to ask for it). `lastTotpStep(user)` and `onTotp(user, step)` keep the step
  of each login, so codes are used once.
- `lockout`: a `Lockout` or its options (5 failures in 15 minutes lock for 15 minutes), or `false`. A locked login is
  answered with 429 and `Retry-After`.
- `rehash(user, hash)`: the new hash of a password whose hash had other parameters.
- `reload(subject, data, request)`: the claims of a refresh, read from the user again (null: it can no longer log in).
  Without it, the claims of the login are kept.
- `fields`: the names of the fields of the body (`username`, `password`, `code`).

`refresh`: `RefreshTokens` or its options (`false`: no refresh tokens; given without `login`, for the logins of
Passport, it adds `/refresh` and `/logout`, with `reload` as an option of the plugin). `refreshCookie: true` (or its options) keeps
the refresh token in an HttpOnly, Secure, SameSite=Strict cookie of the path of the prefix, instead of the body.

A login answers the same `Invalid credentials` (401) for a user that does not exist and a wrong password, and verifies
a password in both cases, so neither the answer nor its time tells which.

## Tenants

A user may use the tenants of its claims: `tenants` (a list) or `tenant`; `'*'` is every tenant (the admins of the
whole service). Put them in the claims of its tokens: `claims: (user) => ({ sub: String(user.id), tenants: user.tenants })`.

- `config: { auth: { tenant: true } }`: a user of the tenant of the request; 403 for the others, 401 without a user.
- `config: { auth: { tenant: '*' } }`: a user of every tenant.
- With `roles`, `check` or `strategy`, all of them: `{ tenant: true, roles: 'admin' }` is an admin of that tenant.

The tenant of a request is `request.tenant` (set by the plugin of [@xufa/orm](../orm) from the header, the host...), or
`tenants.of(request)` of the options (`(request) => request.params.tenant`). Rules are checked when routes are
added: a wrong one (`tenant: 'acme'`) stops the app from starting.

The tenants of the ORM run each request in the database of its tenant: check the user before it is entered, so a
request of a tenant that is not the user's does not even open its database:

```js
app.register(auth.plugin, { keys, login });
app.register(orm.plugin, {
  tenants: {
    tenants,
    resolve: (request) => request.headers['x-tenant'],
    authorize: (request, id, reply) => app.auth.canUseTenant(request, id, reply), // 401, 403, or the tenant
  },
});
```

`app.auth.canUseTenant(request, id)` throws a 401 without a user, and says whether it may use the tenant;
`auth.tenantsOf(user)` gives the tenants of claims.

## Strategies

Each request is tried with the strategies of `strategies`, in order, until one identifies its user: `request.user`,
`request.auth` (what the strategy knows: the claims of a JWT, `{ apiKey: id }`, `{ username }`) and
`request.authStrategy` (its name). Credentials that are not valid make `request.authError`, and a route that needs a
user answers 401 with the `WWW-Authenticate` challenges of the strategies.

```js
const { ApiKey } = require('./models'); // static fields = auth.apiKeyFields(fields)

app.register(auth.plugin, {
  keys: process.env.JWT_KEY,
  strategies: [
    'jwt',
    auth.apiKey({
      find: (id) => ApiKey.objects.filter({ id }).first(),
      user: (key) => User.objects.get({ id: key.subject }),
    }),
    auth.basic({ findUser: (email) => User.objects.filter({ email }).first() }),
  ],
});

app.get('/reports', { config: { auth: { strategy: 'apiKey' } } }, handler); // only API keys
app.get('/admin', { config: { auth: { strategy: ['jwt', 'basic'], roles: 'admin' } } }, handler);
```

- `auth.apiKey({ find, user, header, scheme, query, name })`: keys from `x-api-key` (`header`), `Authorization:
<scheme> <key>` (`scheme`) or a query parameter (`query`, off by default: URLs end in logs). A key is
  `<id>.<secret>`: `find(id, request)` gives its record (`{ hash }` and what you keep), refused when its
  `expiresAt` passed or it has a `revokedAt`; `user(record, request)` gives its user (`record.user`, or the record).
- `auth.generateApiKey({ prefix: 'xk_' })`: `{ key, id, hash }`. Give `key` once and keep `id` and `hash`: only a
  SHA-256 of the 32 random bytes of the secret is kept (enough for a random secret, and fast on every request), and it
  is compared in constant time. `auth.apiKeyFields(fields)`: the fields of a model of keys (`id`, `hash`,
  `subject`, `name`, `scopes`, `createdAt`, `expiresAt`, `revokedAt`).
- `auth.basic({ findUser, password, lockout, cache, realm, name })`: HTTP Basic against the scrypt hashes of the users,
  with the answer of unknown users taking as long, and a `Lockout` (`false`: none). A checked password is remembered
  for `cache` (`'5m'`; `0`: never), so requests do not pay scrypt each time; another password, or a changed hash, is
  checked again.
- Your own: `{ name, challenge, authenticate(request, reply) }`, whose promise is `{ user, info }`, `{ fail: { message,
challenge } }` or `null` (no credentials of its kind).

A route says which strategies may identify its user with `config: { auth: { strategy, roles, check } }`, or the hook
`app.auth.authenticateWith('apiKey', 'basic')`. Each strategy runs once per request. With
[@xufa/openapi](../openapi), the strategies are the security schemes of the document (each has its `openapi`:
bearer JWT, API keys, Basic, OAuth 2.0 of Passport; give `openapi` to a strategy to change it), and routes with
`config.auth` get their security.

## Passport

The strategies of [Passport](https://www.passportjs.org/) work unchanged, without Passport: `auth.passport(strategy)`
gives them what Passport would (`success`, `fail`, `redirect`, `pass`, `error`, and a request with what Express
has that they read). Tested with passport-local, passport-http, passport-http-bearer, passport-headerapikey,
passport-jwt and passport-oauth2.

```js
const { Strategy: BearerStrategy } = require('passport-http-bearer');
const { Strategy: GitHubStrategy } = require('passport-github2');

// Credentials in every request: one more strategy.
app.register(auth.plugin, {
  keys: process.env.JWT_KEY,
  refresh: true,
  strategies: [
    'jwt',
    auth.passport(new BearerStrategy((token, done) => findByToken(token).then((user) => done(null, user || false)))),
  ],
});

// Logins: the redirect to the provider and its callback, in routes.
const github = auth.passport(
  new GitHubStrategy(
    {
      clientID,
      clientSecret,
      callbackURL: '/auth/github/callback',
      store: auth.oauthState({ secret: process.env.STATE_KEY }),
    },
    (accessToken, refreshToken, profile, done) => findOrCreateUser(profile).then((user) => done(null, user))
  )
);
app.get('/auth/github', github.login({ scope: ['user:email'] }));
app.get('/auth/github/callback', github.login());
```

There are no sessions: `login({ onLogin, onFailure, claims, ...options })` answers a login with the tokens of the
plugin (`app.auth.issue(claims(user))`: the access token, and a refresh token when there are refresh tokens), or with
what `onLogin(user, info, request, reply)` returns (a redirect to the app, a cookie...). Failures are 401 (or the
status the strategy gives) unless `onFailure(failure, request, reply)` answers. The options of the strategy's
authenticate() (`scope`...) go with them.

`auth.oauthState({ secret })` is the `store` of OAuth 2.0 strategies (passport-oauth2 and those made on it): the state
sent to the provider is a random handle, and a cookie keeps it, with the code verifier of PKCE (`pkce: true`), sealed
with AES-256-GCM, for 10 minutes (`maxAge`), used once. HttpOnly, Secure and SameSite=Lax (the redirect of the provider
carries it). A strategy that keeps other things in `req.session` needs a plugin that gives requests a session.

## Errors

XufaErrors (of [@xufa/errors](../errors)) with their status codes: `TokenError` (401, `XUFA_AUTH_INVALID_TOKEN`, with
its `reason`), `Unauthorized` (401), `TotpRequired` (401), `Forbidden` (403) and `Locked` (429, with `retryAfter`).

## TypeScript

The declarations are in the package. The plugin decorates the app and the requests; to type them:

```ts
import type { AuthApi, AuthRule, Claims } from '@xufa/auth';

declare module '@xufa/http' {
  interface XufaInstance {
    auth: AuthApi<User>;
    authenticate: AuthApi['authenticate'];
    authorize: AuthApi['authorize'];
  }
  interface XufaRequest {
    user: User | null;
    auth: Claims | null;
  }
  interface XufaContextConfig {
    auth?: AuthRule<User>;
  }
}
```

## License

MIT.
