import { assertType, expectTypeOf } from '@xufa/test';
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
import * as auth from '../..';

// Passwords
expectTypeOf(hashPassword('secret', { ln: 16 })).toEqualTypeOf<Promise<string>>();
expectTypeOf(verifyPassword('secret', '$scrypt$...')).toEqualTypeOf<Promise<boolean>>();
expectTypeOf(needsRehash('$scrypt$...')).toEqualTypeOf<boolean>();
// @ts-expect-error
hashPassword('secret', { cost: 2 });

// JWTs
const keys = new KeySet({
  current: 'v2',
  keys: { v2: 'a secret of thirty-two bytes or more', v1: { key: 'old', algorithm: 'HS512' } },
});
const { privateKey } = generateKeyPairSync('ed25519');
new KeySet({ keys: { ed: privateKey } });
const token = signJwt({ sub: '1', role: 'admin' }, keys, { expiresIn: '15m', audience: ['api'], jwtId: true });
expectTypeOf(token).toEqualTypeOf<string>();
const claims = verifyJwt<Claims & { role: string }>(token, keys, { issuer: /app/, clockTolerance: 5 });
expectTypeOf(claims.role).toEqualTypeOf<string>();
expectTypeOf(claims.sub).toEqualTypeOf<string | undefined>();
expectTypeOf(decodeJwt(token)?.payload).toEqualTypeOf<Claims | undefined>();
// @ts-expect-error
signJwt({}, keys, { expiresIn: true });
// @ts-expect-error
new KeySet({ keys: { a: { key: 'x', algorithm: 'HS999' } } });

// One-time codes
const secret = generateSecret();
expectTypeOf(totp(secret, { digits: 8, algorithm: 'SHA256' })).toEqualTypeOf<string>();
expectTypeOf(verifyTotp('123456', secret, { window: 1, after: 10 })).toEqualTypeOf<number | null>();
expectTypeOf(totpUri({ secret, label: 'ada@example.com', issuer: 'App' })).toEqualTypeOf<string>();
// @ts-expect-error
totp(secret, { algorithm: 'MD5' });

// Lockout and refresh tokens
const lockout = new Lockout({ maxAttempts: 5, window: '15m', lockFor: 900 });
expectTypeOf(lockout.fail('ada')).toEqualTypeOf<Promise<{ locked: boolean; retryAfter: number; failures: number }>>();
const refresh = new RefreshTokens<{ role: string }>({ ttl: '30d', reuseInterval: '2s' });
(async () => {
  const issued = await refresh.issue(42, { role: 'admin' });
  expectTypeOf(issued.token).toEqualTypeOf<string>();
  expectTypeOf((await refresh.rotate(issued.token)).record).toEqualTypeOf<RefreshTokenRecord<{ role: string }>>();
  expectTypeOf(await refresh.revoke(issued.token)).toEqualTypeOf<boolean>();
})();

// Errors
const err = new TokenError('expired');
expectTypeOf(err.code).toEqualTypeOf<'XUFA_AUTH_INVALID_TOKEN'>();
expectTypeOf(err.statusCode).toEqualTypeOf<401>();
expectTypeOf(err.reason).toEqualTypeOf<string | undefined>();
expectTypeOf(new Locked('locked').retryAfter).toEqualTypeOf<number | undefined>();

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
  expectTypeOf(request.user).toEqualTypeOf<User | null>();
  return request.user;
});
app.get('/admin', { config: { auth: ['admin'] } }, async () => 'ok');
app.get('/own', { config: { auth: (user: User) => user.role === 'admin' } }, async () => 'ok');
app.get('/check', { preHandler: app.authorize('admin', 'staff') }, async () => 'ok');
// @ts-expect-error
app.get('/bad', { config: { auth: 42 } }, async () => 'ok');

// The async versions of signJwt and verifyJwt.
expectTypeOf(signJwtAsync({ sub: '1' }, keys, { expiresIn: '15m' })).toEqualTypeOf<Promise<string>>();
expectTypeOf(verifyJwtAsync<{ sub: string }>('token', keys)).toEqualTypeOf<Promise<{ sub: string }>>();

// The KeyVault, and encrypted keys in a KeySet.
const vault = new KeyVault({ secret: 'a secret of 32 bytes or more, at least!', algorithm: 'EdDSA', keep: '7d' });
expectTypeOf(vault.keys('acme')).toEqualTypeOf<Promise<KeySet>>();
expectTypeOf(vault.rotate('acme', { immediate: true })).toEqualTypeOf<Promise<KeySet>>();
expectTypeOf(vault.revoke('acme', 'k1')).toEqualTypeOf<Promise<void>>();
new KeySet({ keys: { k: { key: '-----BEGIN ENCRYPTED PRIVATE KEY-----', passphrase: 'pw' } } });
// @ts-expect-error
new KeyVault({});

// Strategies: API keys, HTTP Basic, Passport, and routes that ask for some of them.
const { key, id, hash } = generateApiKey({ prefix: 'live_' });
expectTypeOf(key).toEqualTypeOf<string>();
expectTypeOf(verifyApiKey('secret', hash)).toEqualTypeOf<boolean>();
expectTypeOf(parseApiKey(key)).toEqualTypeOf<{ id: string; secret: string } | null>();
const keyStrategy = apiKey<User>({
  header: 'x-api-key',
  find: async (given) => (given === id ? { hash, subject: '1' } : null),
  user: (record) => ({ id: Number(record.subject), email: 'a@b.c', password: '', role: 'user' }),
});
assertType<Strategy<User>>(keyStrategy);
// @ts-expect-error
apiKey({ header: 'x-api-key' });
const basicStrategy = basic<User>({ findUser: async () => null, cache: '1m', lockout: false });

// A strategy of Passport (structurally: what passport-http-bearer and the others are).
class FakeStrategy {
  name = 'fake';
  authenticate(this: any, req: any) {
    this.success({ id: 1, role: 'user' });
  }
}
const fake = passport<User>(new FakeStrategy());
expectTypeOf(fake).toEqualTypeOf<PassportAdapter<User>>();
// @ts-expect-error
passport({ name: 'x' });
const github = passport(new FakeStrategy(), { name: 'github' });
const login = github.login({
  scope: ['user:email'],
  claims: (user) => ({ sub: '1' }),
  onFailure: (failure, request, reply) => expectTypeOf(failure.message).toEqualTypeOf<string | undefined>(),
});
expectTypeOf(login).toEqualTypeOf<(request: any, reply: any) => Promise<unknown>>();
const state = oauthState({ secret: 'a secret for the state', maxAge: 300, sameSite: 'Lax' });
// @ts-expect-error
oauthState({});

const withStrategies = xufa();
withStrategies.register(plugin, { strategies: [keyStrategy, basicStrategy, fake] });
withStrategies.register(plugin, { keys: 'secret', strategies: ['jwt', keyStrategy], refresh: true });
// @ts-expect-error
withStrategies.register(plugin, { strategies: ['session'] });
withStrategies.get('/keys', { config: { auth: { strategy: 'apiKey' } } }, async () => 'ok');
withStrategies.get(
  '/admins',
  { config: { auth: { strategy: ['apiKey', 'basic'], roles: 'admin' } } },
  async () => 'ok'
);
withStrategies.get('/mine', { config: { auth: { check: (user: User) => user.id === 1 } } }, async () => 'ok');
// @ts-expect-error
withStrategies.get('/none', { config: { auth: {} } }, async () => 'ok');
withStrategies.get('/github/callback', login);
withStrategies.get(
  '/either',
  { preHandler: withStrategies.auth.authenticateWith('apiKey', 'basic') },
  async () => 'ok'
);
withStrategies.get('/token', async (request, reply) => {
  const tokens = await withStrategies.auth.issue({ sub: '1' }, request, reply);
  expectTypeOf(tokens.accessToken).toEqualTypeOf<string>();
  expectTypeOf(tokens.refreshToken).toEqualTypeOf<string | undefined>();
  return tokens;
});

// Security schemes of OpenAPI of the strategies.
expectTypeOf(keyStrategy.openapi).toEqualTypeOf<Record<string, unknown> | undefined>();
apiKey({ find: () => null, openapi: { type: 'apiKey', in: 'header', name: 'x-key' } });
passport(new FakeStrategy(), { openapi: false });
// @ts-expect-error
passport(new FakeStrategy(), { openapi: 'bearer' });

// Tenants.
expectTypeOf(tenantsOf({ tenants: ['a'] })).toEqualTypeOf<string[]>();
expectTypeOf(ALL_TENANTS).toEqualTypeOf<'*'>();
const tenantRules: AuthRule[] = [
  { tenant: true },
  { tenant: '*', roles: 'admin' },
  { strategy: 'apiKey', tenant: true },
];
// @ts-expect-error
assertType<AuthRule>({ tenant: 'acme' });
declare const tenantApi: AuthApi;
expectTypeOf(tenantApi.canUseTenant({}, 'acme', {})).toEqualTypeOf<Promise<boolean>>();
const withTenants: AuthPluginOptions = {
  keys: 'k'.repeat(32),
  tenants: { of: (request) => request.params.tenant, claim: (user) => user.orgs },
};

// Roles and permissions by tenant.
{
  const rbac = new auth.Rbac<{ id: number; admin?: boolean }>({
    roles: {
      viewer: ['*.view'],
      editor: { inherits: 'viewer', permissions: ['Book.add', 'Book.change'] },
      owner: ['*'],
    },
    grants: async (user) => (user.id === 1 ? { acme: 'editor', '*': ['viewer'] } : [{ role: 'owner', tenant: 'acme' }]),
    superuser: (user) => user.admin === true,
  });
  expectTypeOf(rbac.can({ id: 1 }, 'Book.change', { tenant: 'acme' })).toEqualTypeOf<Promise<boolean>>();
  rbac.access({ id: 1 }).then((access) => {
    expectTypeOf(access.superuser).toEqualTypeOf<boolean>();
    expectTypeOf(access.grants[0].tenant).toEqualTypeOf<string>();
    expectTypeOf(rbac.allows(access, ['Book.view', 'Book.add'], 'acme')).toEqualTypeOf<boolean>();
    expectTypeOf(rbac.tenantsIn(access)).toEqualTypeOf<string[]>();
    expectTypeOf(rbac.permissionsIn(access, 'acme')).toEqualTypeOf<string[]>();
  });
  // @ts-expect-error
  new auth.Rbac({ roles: { viewer: 'Book.view' } });
  new auth.Rbac({ roles: {}, superuser: false });
  const rule: auth.AuthRule = { can: ['Book.view', 'Book.add'], tenant: true };
  const ruleOfCan: auth.AuthRule = { can: 'Book.delete' };
  assertType<auth.AuthRule>(rule);
  assertType<auth.AuthRule>(ruleOfCan);
  const options: auth.PluginOptions = { keys: 'secret', rbac: { roles: { viewer: ['*.view'] } } };
  expectTypeOf(options).toEqualTypeOf<auth.PluginOptions>();
  const api = {} as auth.AuthApi;
  expectTypeOf(api.can({}, 'Book.view')).toEqualTypeOf<Promise<boolean>>();
  expectTypeOf(api.access({})).toEqualTypeOf<Promise<auth.Access>>();
}

// The accounts of an app with sessions.
{
  interface Member {
    pk: number;
    email: string;
    password: string;
  }
  const app = xufa();
  app.register(auth.accounts, {
    secret: 'a secret of the accounts, 32 chars or more',
    users: {
      findByEmail: async (email: string) => ({ pk: 1, email, password: 'x' }) as Member,
      findById: async () => null,
      create: async (values) => ({ pk: 2, ...values }) as unknown as Member,
      setPassword: async () => {},
    },
    links: { reset: (token) => `https://app.example/reset?token=${token}` },
    signup: { fields: ['name'] },
    lockout: { maxAttempts: 3 },
  });
  const api = {} as auth.AccountsApi<Member>;
  api.user({}).then((user) => expectTypeOf(user).toEqualTypeOf<Member | null>());
  expectTypeOf(api.permissionRequired('Book.add', 'Book.change')).toEqualTypeOf<(request: any, reply: any) => Promise<unknown>>();
  api.can({} as Member, 'Book.add').then((yes) => expectTypeOf(yes).toEqualTypeOf<boolean>());
  api.perms({}).then((perms) => expectTypeOf(perms.has('Book.add')).toEqualTypeOf<boolean>());
  // @ts-expect-error
  api.permissionRequired(7);
  expectTypeOf(auth.emailOf(' Ada@Example.com ')).toEqualTypeOf<string | null>();
  // @ts-expect-error
  app.register(auth.accounts, { users: {} });
  api.checkResetToken('t').then((user) => expectTypeOf(user).toEqualTypeOf<Member | null>());
  api.authenticate({ username: 'ada', password: 'x' }).then((user) => expectTypeOf(user).toEqualTypeOf<Member>());
  expectTypeOf(api.requestReset('ada@example.com', {}, { link: (token) => `/reset/${token}/` })).toEqualTypeOf<Promise<void>>();
  app.register(auth.pages, { prefix: '/accounts', views: 'registration', siteUrl: 'https://library.example' });
  // @ts-expect-error
  app.register(auth.pages, { views: 7 });
}

// Credentials: the logins and accounts of @xufa/auth and @xufa/admin.
{
  interface Member {
    email: string;
    password: string;
    totpSecret: string | null;
    codes: string[];
  }
  const credentials = new auth.Credentials<Member>({
    findUser: async (email) => ({ email, password: 'x', totpSecret: null, codes: [] }),
    totp: (user) => user.totpSecret,
    setTotp: (user, secret) => (secret === null ? 0 : secret.length),
    recoveryCodes: (user) => user.codes,
    setRecoveryCodes: async (user, hashes) => hashes.length,
    lockout: { maxAttempts: 3 },
    messages: { invalid: 'Wrong email or password' },
  });
  expectTypeOf(credentials.login({ identifier: 'ada@example.com', password: 'p', ip: '10.0.0.1' })).toEqualTypeOf<Promise<Member>>();
  expectTypeOf(credentials.validatePassword('short')).toEqualTypeOf<string | null>();
  const session = { get: (key: string) => key, set: () => undefined, delete: () => true };
  expectTypeOf(credentials.startTotp({ email: 'a', password: 'x', totpSecret: null, codes: [] }, { password: 'p', label: 'a', session })).toEqualTypeOf<Promise<{ secret: string; uri: string; svg: string }>>();
  const err = new Error() as auth.CredentialError;
  expectTypeOf(err.reason).toEqualTypeOf<auth.CredentialReason>();
  // @ts-expect-error a reason of its own is not a reason
  const wrong: auth.CredentialReason = 'nope';
}

// AbstractUser.
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const orm = require('@xufa/orm');
  class Member extends auth.AbstractUser(orm.Model as abstract new (...args: any[]) => { pk: unknown }, orm.fields) {}
  Member.createSuperuser({ username: 'admin', password: 'secret' }).then((user) => {
    expectTypeOf(user.isSuperuser).toEqualTypeOf<boolean>();
    expectTypeOf(user.hasPerm('Book.add')).toEqualTypeOf<boolean>();
    user.checkPassword('x').then((ok) => expectTypeOf(ok).toEqualTypeOf<boolean>());
  });
  expectTypeOf(Member.userModel).toEqualTypeOf<true>();
}

// Groups in the database (Django's Group), roles of an Rbac.
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const orm = require('@xufa/orm');
  class Group extends auth.AbstractGroup(orm.Model as abstract new (...args: any[]) => { pk: unknown }, orm.fields) {}
  const rbac = new auth.Rbac({ model: Group, refresh: 30000 });
  rbac.fresh().then((loaded) => expectTypeOf(loaded).toEqualTypeOf<auth.Rbac>());
  expectTypeOf(new Group().permissions).toEqualTypeOf<string[]>();
  class Member extends auth.AbstractUser(orm.Model as abstract new (...args: any[]) => { pk: unknown }, orm.fields, {
    groups: () => Group,
  }) {}
  expectTypeOf(new Member().username).toEqualTypeOf<string>();
}

// Rules of objects (where).
{
  const rbac = new auth.Rbac({
    roles: { editor: { permissions: ['Book.change'], where: { 'Book.change': (user) => ({ ownerId: user.id }) } } },
  });
  expectTypeOf(rbac.scopeOf({ superuser: false, grants: [] }, { id: 1 }, 'Book.change')).toEqualTypeOf<auth.Scope>();
  // @ts-expect-error
  new auth.Rbac({ roles: { editor: { where: { 'Book.change': 7 } } } });
}
