import { expectType, expectError } from 'tsd';
import { generateKeyPairSync } from 'node:crypto';
import xufa, { type XufaInstance } from '@xufa/http';
import {
  hashPassword,
  verifyPassword,
  needsRehash,
  KeySet,
  signJwt,
  verifyJwt,
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
} from '../..';

// Passwords
expectType<Promise<string>>(hashPassword('secret', { ln: 16 }));
expectType<Promise<boolean>>(verifyPassword('secret', '$scrypt$...'));
expectType<boolean>(needsRehash('$scrypt$...'));
expectError(hashPassword('secret', { cost: 2 }));

// JWTs
const keys = new KeySet({ current: 'v2', keys: { v2: 'a secret of thirty-two bytes or more', v1: { key: 'old', algorithm: 'HS512' } } });
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
