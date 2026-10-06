import { expectType, expectError, expectAssignable } from 'tsd';
import { generateKeyPairSync } from 'node:crypto';
import xufa, { type XufaInstance } from '@xufa/http';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  KeySet,
  KeyVault,
  signJwt,
  signJwtAsync,
  verifyJwt,
  verifyJwtAsync,
  decodeJwt,
  Claims,
  generateSecret,
  totp,
  verifyTotp,
  totpUri,
  Lockout,
  RefreshTokens,
  RefreshTokenRecord,
  TokenError,
  Locked,
  plugin,
  AuthApi,
  AuthRule,
  PluginOptions as AuthPluginOptions,
  tenantsOf,
  ALL_TENANTS,
  Strategy,
  apiKey,
  basic,
  generateApiKey,
  verifyApiKey,
  parseApiKey,
  passport,
  oauthState,
  PassportAdapter,
} from '../..';

// Passwords
expectType<Promise<string>>(hashPassword('secret', { ln: 16 }));
expectType<Promise<boolean>>(verifyPassword('secret', '$scrypt$...'));
expectType<boolean>(needsRehash('$scrypt$...'));
expectError(hashPassword('secret', { cost: 2 }));

// JWTs
const keys = new KeySet({
  current: 'v2',
  keys: { v2: 'a secret of thirty-two bytes or more', v1: { key: 'old', algorithm: 'HS512' } },
});
const { privateKey } = generateKeyPairSync('ed25519');
new KeySet({ keys: { ed: privateKey } });
const token = signJwt({ sub: '1', role: 'admin' }, keys, { expiresIn: '15m', audience: ['api'], jwtId: true });
expectType<string>(token);
const claims = verifyJwt<Claims & { role: string }>(token, keys, { issuer: /app/, clockTolerance: 5 });
expectType<string>(claims.role);
expectType<string | undefined>(claims.sub);
expectType<Claims | undefined>(decodeJwt(token)?.payload);
expectError(signJwt({}, keys, { expiresIn: true }));
expectError(new KeySet({ keys: { a: { key: 'x', algorithm: 'HS999' } } }));

// One-time codes
const secret = generateSecret();
expectType<string>(totp(secret, { digits: 8, algorithm: 'SHA256' }));
expectType<number | null>(verifyTotp('123456', secret, { window: 1, after: 10 }));
expectType<string>(totpUri({ secret, label: 'ada@example.com', issuer: 'App' }));
expectError(totp(secret, { algorithm: 'MD5' }));

// Lockout and refresh tokens
const lockout = new Lockout({ maxAttempts: 5, window: '15m', lockFor: 900 });
expectType<Promise<{ locked: boolean; retryAfter: number; failures: number }>>(lockout.fail('ada'));
const refresh = new RefreshTokens<{ role: string }>({ ttl: '30d', reuseInterval: '2s' });
(async () => {
  const issued = await refresh.issue(42, { role: 'admin' });
  expectType<string>(issued.token);
  expectType<RefreshTokenRecord<{ role: string }>>((await refresh.rotate(issued.token)).record);
  expectType<boolean>(await refresh.revoke(issued.token));
})();

// Errors
const err = new TokenError('expired');
expectType<'XUFA_AUTH_INVALID_TOKEN'>(err.code);
expectType<401>(err.statusCode);
expectType<string | undefined>(err.reason);
expectType<number | undefined>(new Locked('locked').retryAfter);

// The plugin, with its decorations typed by the app.
interface User {
  id: number;
  email: string;
  password: string;
  role: string;
}

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

const app: XufaInstance = xufa();
app.register(plugin, {
  keys: (request: any) => keys,
  accessToken: { expiresIn: '15m', issuer: 'app' },
  token: { cookie: 'access' },
  login: {
    findUser: async (email: string): Promise<User | null> => null,
    claims: (user: User) => ({ sub: String(user.id), role: user.role }),
    lockout: { maxAttempts: 3 },
  },
  refreshCookie: { sameSite: 'Lax' },
});
app.get('/me', { onRequest: app.authenticate }, async (request) => {
  expectType<User | null>(request.user);
  return request.user;
});
app.get('/admin', { config: { auth: ['admin'] } }, async () => 'ok');
app.get('/own', { config: { auth: (user: User) => user.role === 'admin' } }, async () => 'ok');
app.get('/check', { preHandler: app.authorize('admin', 'staff') }, async () => 'ok');
expectError(app.get('/bad', { config: { auth: 42 } }, async () => 'ok'));

// The async versions of signJwt and verifyJwt.
expectType<Promise<string>>(signJwtAsync({ sub: '1' }, keys, { expiresIn: '15m' }));
expectType<Promise<{ sub: string }>>(verifyJwtAsync<{ sub: string }>('token', keys));

// The KeyVault, and encrypted keys in a KeySet.
const vault = new KeyVault({ secret: 'a secret of 32 bytes or more, at least!', algorithm: 'EdDSA', keep: '7d' });
expectType<Promise<KeySet>>(vault.keys('acme'));
expectType<Promise<KeySet>>(vault.rotate('acme', { immediate: true }));
expectType<Promise<void>>(vault.revoke('acme', 'k1'));
new KeySet({ keys: { k: { key: '-----BEGIN ENCRYPTED PRIVATE KEY-----', passphrase: 'pw' } } });
expectError(new KeyVault({}));

// Strategies: API keys, HTTP Basic, Passport, and routes that ask for some of them.
const { key, id, hash } = generateApiKey({ prefix: 'live_' });
expectType<string>(key);
expectType<boolean>(verifyApiKey('secret', hash));
expectType<{ id: string; secret: string } | null>(parseApiKey(key));
const keyStrategy = apiKey<User>({
  header: 'x-api-key',
  find: async (given) => (given === id ? { hash, subject: '1' } : null),
  user: (record) => ({ id: Number(record.subject), email: 'a@b.c', password: '', role: 'user' }),
});
expectAssignable<Strategy<User>>(keyStrategy);
expectError(apiKey({ header: 'x-api-key' }));
const basicStrategy = basic<User>({ findUser: async () => null, cache: '1m', lockout: false });

// A strategy of Passport (structurally: what passport-http-bearer and the others are).
class FakeStrategy {
  name = 'fake';
  authenticate(this: any, req: any) {
    this.success({ id: 1, role: 'user' });
  }
}
const fake = passport<User>(new FakeStrategy());
expectType<PassportAdapter<User>>(fake);
expectError(passport({ name: 'x' }));
const github = passport(new FakeStrategy(), { name: 'github' });
const login = github.login({
  scope: ['user:email'],
  claims: (user) => ({ sub: '1' }),
  onFailure: (failure, request, reply) => expectType<string | undefined>(failure.message),
});
expectType<(request: any, reply: any) => Promise<unknown>>(login);
const state = oauthState({ secret: 'a secret for the state', maxAge: 300, sameSite: 'Lax' });
expectError(oauthState({}));

const withStrategies = xufa();
withStrategies.register(plugin, { strategies: [keyStrategy, basicStrategy, fake] });
withStrategies.register(plugin, { keys: 'secret', strategies: ['jwt', keyStrategy], refresh: true });
expectError(withStrategies.register(plugin, { strategies: ['session'] }));
withStrategies.get('/keys', { config: { auth: { strategy: 'apiKey' } } }, async () => 'ok');
withStrategies.get(
  '/admins',
  { config: { auth: { strategy: ['apiKey', 'basic'], roles: 'admin' } } },
  async () => 'ok'
);
withStrategies.get('/mine', { config: { auth: { check: (user: User) => user.id === 1 } } }, async () => 'ok');
expectError(withStrategies.get('/none', { config: { auth: {} } }, async () => 'ok'));
withStrategies.get('/github/callback', login);
withStrategies.get(
  '/either',
  { preHandler: withStrategies.auth.authenticateWith('apiKey', 'basic') },
  async () => 'ok'
);
withStrategies.get('/token', async (request, reply) => {
  const tokens = await withStrategies.auth.issue({ sub: '1' }, request, reply);
  expectType<string>(tokens.accessToken);
  expectType<string | undefined>(tokens.refreshToken);
  return tokens;
});

// Security schemes of OpenAPI of the strategies.
expectType<Record<string, unknown> | undefined>(keyStrategy.openapi);
apiKey({ find: () => null, openapi: { type: 'apiKey', in: 'header', name: 'x-key' } });
passport(new FakeStrategy(), { openapi: false });
expectError(passport(new FakeStrategy(), { openapi: 'bearer' }));

// Tenants.
expectType<string[]>(tenantsOf({ tenants: ['a'] }));
expectType<'*'>(ALL_TENANTS);
const tenantRules: AuthRule[] = [{ tenant: true }, { tenant: '*', roles: 'admin' }, { strategy: 'apiKey', tenant: true }];
expectError<AuthRule>({ tenant: 'acme' });
declare const tenantApi: AuthApi;
expectType<Promise<boolean>>(tenantApi.canUseTenant({}, 'acme', {}));
const withTenants: AuthPluginOptions = { keys: 'k'.repeat(32), tenants: { of: (request) => request.params.tenant, claim: (user) => user.orgs } };
