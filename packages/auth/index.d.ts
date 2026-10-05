// The declarations of @xufa/auth (written for it).
import { KeyObject } from 'node:crypto';
import { XufaErrorConstructor } from '@xufa/errors';

/** A duration: seconds, or text as '30s', '15m', '12h', '7d', '2w' (and sums: '1h30m'). */
export type Duration = number | string;

// Passwords

export interface PasswordOptions {
  /** log2 of the cost N of scrypt (17: N = 131072, 128 MiB). */
  ln?: number;
  /** The block size (8). */
  r?: number;
  /** The parallelization (1). */
  p?: number;
  /** Bytes of salt (16). */
  saltLength?: number;
  /** Bytes of hash (32). */
  keyLength?: number;
}

/** The hash of a password as a PHC string: `$scrypt$ln=17,r=8,p=1$<salt>$<hash>`. */
export function hashPassword(password: string, options?: PasswordOptions): Promise<string>;
/** Whether a password is the one of a hash (false for what is no hash of scrypt). */
export function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean>;
/** Whether a hash was made with other parameters than these: it should be made again. */
export function needsRehash(hash: string, options?: PasswordOptions): boolean;
export const PASSWORD_DEFAULTS: Required<PasswordOptions>;

// JSON Web Tokens

export type Algorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'EdDSA';

/** A key: a secret (HMAC), a PEM or a KeyObject (the private key signs, its public key verifies). */
export type KeyInput = string | Buffer | KeyObject;
/** A key, with its algorithm; an encrypted private key in PEM with its passphrase. */
export type KeyEntry = KeyInput | { key: KeyInput; algorithm?: Algorithm; passphrase?: string | Buffer };

export interface KeySetOptions {
  /** The id of the key that signs (the first one by default). */
  current?: string;
  /** The keys by their ids (the kid of the tokens). */
  keys: Record<string, KeyEntry>;
}

export interface Key {
  id: string;
  algorithm: Algorithm;
  secret?: Buffer;
  privateKey?: KeyObject | null;
  publicKey?: KeyObject;
}

/** The keys of JWTs: one signs, all verify (by kid), so keys can be rotated. */
export class KeySet {
  constructor(options: KeyEntry | KeySetOptions);
  current: string;
  readonly signing: Key;
  readonly algorithms: Algorithm[];
  get(id: string): Key | undefined;
  /** The public keys as a JWKS (secrets are left out). */
  toJWKS(): { keys: Array<Record<string, unknown> & { kid: string; alg: Algorithm; use: 'sig' }> };
}

export type Keys = KeySet | KeyEntry | KeySetOptions;

/** What a KeyVault keeps of a tenant: its keys (private keys encrypted), and the version of the record. */
export interface VaultRecord {
  version: number;
  keys: Array<{
    id: string;
    algorithm: Algorithm;
    createdAt: number;
    activeAt: number;
    retiredAt: number | null;
    secret?: string;
    privateKey?: string;
    publicKey?: string;
  }>;
}

/** Where a KeyVault keeps the records: put() writes only when the record has that version (null: when none). */
export interface VaultStore {
  get(tenant: string): Promise<VaultRecord | null>;
  put(tenant: string, record: VaultRecord, version: number | null): Promise<boolean>;
  delete(tenant: string): Promise<void>;
}

export interface KeyVaultOptions {
  /** 32 bytes or more: the private keys of the store are encrypted with keys derived from it. */
  secret: string | Buffer;
  /** A MemoryKeyStore by default; vaultModelStore(Model) for @xufa/orm. */
  store?: VaultStore;
  /** Of the keys made ('ES256'). */
  algorithm?: Algorithm;
  /** How long a KeySet is kept in memory, and how long a new key waits to sign ('5m'). */
  ttl?: number | string;
  /** How long a key verifies after it stops signing ('1d'). */
  keep?: number | string;
  /** Keys older are rotated when their tenant is used (none). */
  rotateAfter?: number | string;
  /** Tenants kept in memory (1000). */
  max?: number;
  /** keys() of a tenant without keys makes them (false). */
  autoCreate?: boolean;
}

/** The keys of the JWTs of each tenant, encrypted in a store, rotated without failures. */
export class KeyVault {
  constructor(options: KeyVaultOptions);
  /** The KeySet of a tenant (kept ttl in memory). */
  keys(tenant: string): Promise<KeySet>;
  /** The public keys of a tenant as a JWKS. */
  jwks(tenant: string): Promise<ReturnType<KeySet['toJWKS']>>;
  /** The first key of a tenant. */
  create(tenant: string, options?: { algorithm?: Algorithm }): Promise<KeySet>;
  /** A new key: it verifies at once and signs after ttl (immediate: at once). */
  rotate(tenant: string, options?: { algorithm?: Algorithm; immediate?: boolean }): Promise<KeySet>;
  /** Removes a key at once (not the one that signs). */
  revoke(tenant: string, keyId: string): Promise<void>;
  /** Removes every key of a tenant. */
  remove(tenant: string): Promise<void>;
  /** Forgets the KeySet of a tenant (or of every tenant) in this process. */
  invalidate(tenant?: string): void;
}

export class MemoryKeyStore implements VaultStore {
  get(tenant: string): Promise<VaultRecord | null>;
  put(tenant: string, record: VaultRecord, version: number | null): Promise<boolean>;
  delete(tenant: string): Promise<void>;
}

/** A store on a model of @xufa/orm with the fields of vaultFields(fields). */
export function vaultModelStore(Model: any): VaultStore;
/** The fields of a model of the keys of the tenants, made with the fields of @xufa/orm. */
export function vaultFields(fields: any): Record<string, unknown>;

export class VaultError extends Error {
  code:
    | 'XUFA_AUTH_VAULT_SECRET'
    | 'XUFA_AUTH_VAULT_ALGORITHM'
    | 'XUFA_AUTH_VAULT_OPTIONS'
    | 'XUFA_AUTH_VAULT_NO_KEYS'
    | 'XUFA_AUTH_VAULT_EXISTS'
    | 'XUFA_AUTH_VAULT_CURRENT'
    | 'XUFA_AUTH_VAULT_CONFLICT'
    | 'XUFA_AUTH_VAULT_TENANT';
}

export interface Claims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [claim: string]: unknown;
}

export interface SignOptions {
  expiresIn?: Duration;
  notBefore?: Duration;
  issuer?: string;
  audience?: string | string[];
  subject?: string | number;
  /** The jti: a value, or true for a random UUID. */
  jwtId?: string | true;
  /** More fields of the header (alg, typ and kid are set). */
  header?: Record<string, unknown>;
  /** false: no iat. */
  timestamp?: boolean;
  /** The time of the token, in seconds since the epoch (now by default). */
  now?: number;
}

export interface VerifyOptions {
  /** The algorithms taken (all those of the keys by default). */
  algorithms?: Algorithm[];
  issuer?: string | RegExp | Array<string | RegExp>;
  audience?: string | RegExp | Array<string | RegExp>;
  subject?: string;
  /** The oldest iat taken. */
  maxAge?: Duration;
  /** Leeway of exp, nbf and maxAge. */
  clockTolerance?: Duration;
  /** The time, in seconds since the epoch (now by default). */
  now?: number;
}

export function signJwt(payload: Record<string, unknown>, keys: Keys, options?: SignOptions): string;
/** The claims of a token, or a TokenError (401) whose reason says why not. */
export function verifyJwt<T extends Claims = Claims>(token: string, keys: Keys, options?: VerifyOptions): T;
/** signJwt() as a Promise: RSA keys sign in libuv's thread pool, so the event loop does not wait (about 0.5 ms). */
export function signJwtAsync(payload: Record<string, unknown>, keys: Keys, options?: SignOptions): Promise<string>;
/** verifyJwt() as a Promise (done on the event loop: 20 to 90 µs); it rejects with the same TokenError. */
export function verifyJwtAsync<T extends Claims = Claims>(
  token: string,
  keys: Keys,
  options?: VerifyOptions
): Promise<T>;
/** The parts of a token, without verifying it (null when it is no JWT). */
export function decodeJwt(
  token: string
): { header: Record<string, unknown>; payload: Claims; signature: string } | null;

// One-time codes

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpOptions {
  /** 6 to 10 (6). */
  digits?: number;
  /** Seconds of each code (30). */
  period?: number;
  algorithm?: TotpAlgorithm;
}

export function base32Encode(bytes: Buffer | Uint8Array): string;
export function base32Decode(text: string): Buffer;
/** A random secret in base32 (20 bytes by default). */
export function generateSecret(bytes?: number): string;
export function hotp(secret: string | Buffer, counter: number | bigint, options?: TotpOptions): string;
export function totp(secret: string | Buffer, options?: TotpOptions & { time?: number }): string;
/**
 * The time step of a code that is valid now (or null): keep it and give it as `after` next time, so each code is
 * used once.
 */
export function verifyTotp(
  code: string | number,
  secret: string | Buffer,
  options?: TotpOptions & { window?: number; after?: number | null; time?: number }
): number | null;
/** The otpauth:// URI of a secret, for the QR code of authenticator apps. */
export function totpUri(options: TotpOptions & { secret: string; label: string; issuer?: string }): string;
export function generateRecoveryCodes(count?: number): string[];
export function hashRecoveryCode(code: string): string;

// Lockout

/** A store of values with a time to live in ms: a MemoryCache, SharedCache or LocalCache of @xufa/orm. */
export interface ExpiringStore {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemoryStore implements ExpiringStore {
  get(key: string): Promise<any>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface LockoutOptions {
  store?: ExpiringStore;
  /** Failures within the window that lock (5). */
  maxAttempts?: number;
  /** '15m' */
  window?: Duration;
  /** '15m' */
  lockFor?: Duration;
  prefix?: string;
}

export interface LockoutStatus {
  locked: boolean;
  /** Seconds until it is unlocked. */
  retryAfter: number;
  failures: number;
}

export class Lockout {
  constructor(options?: LockoutOptions);
  status(key: string): Promise<LockoutStatus>;
  /** Throws Locked (429, retryAfter) while the key is locked. */
  check(key: string): Promise<LockoutStatus>;
  fail(key: string): Promise<LockoutStatus>;
  succeed(key: string): Promise<void>;
  reset(key: string): Promise<void>;
}

// Refresh tokens

export interface RefreshTokenRecord<Data = any> {
  id: string;
  family: string;
  subject: string;
  data: Data;
  hash: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
  revokedAt: number | null;
}

export interface TokenStore {
  get(id: string): Promise<RefreshTokenRecord | null>;
  create(record: RefreshTokenRecord): Promise<void>;
  /** Marks a token used when it was not: whether it was. */
  spend(id: string, time: number): Promise<boolean>;
  updateMany(where: { family?: string; subject?: string }, changes: Partial<RefreshTokenRecord>): Promise<void>;
  deleteExpired(before: number): Promise<void>;
}

export class MemoryTokenStore implements TokenStore {
  get(id: string): Promise<RefreshTokenRecord | null>;
  create(record: RefreshTokenRecord): Promise<void>;
  spend(id: string, time: number): Promise<boolean>;
  updateMany(where: { family?: string; subject?: string }, changes: Partial<RefreshTokenRecord>): Promise<void>;
  deleteExpired(before: number): Promise<void>;
}

/** A store on a model of @xufa/orm with the fields of refreshTokenFields(). */
export function modelStore(Model: any): TokenStore;
/** The fields of a model of refresh tokens, made with the `fields` of @xufa/orm. */
export function refreshTokenFields<F extends Record<string, (...args: any[]) => any>>(fields: F): Record<string, any>;

export interface RefreshTokensOptions {
  store?: TokenStore;
  /** How long a token lives ('30d'). */
  ttl?: Duration;
  /** For how long a spent token may be used again without revoking its family (0). */
  reuseInterval?: Duration;
}

export interface IssuedToken<Data = any> {
  token: string;
  record: RefreshTokenRecord<Data>;
}

export class RefreshTokens<Data = any> {
  constructor(options?: RefreshTokensOptions);
  store: TokenStore;
  /** ms */
  ttl: number;
  issue(subject: string | number, data?: Data, options?: { family?: string }): Promise<IssuedToken<Data>>;
  /** The record of a usable token, or an Unauthorized (401) with its reason. */
  verify(token: string, options?: { spend?: boolean }): Promise<RefreshTokenRecord<Data>>;
  /** A new token of the family for a token, which is spent. */
  rotate(token: string, options?: { data?: Data }): Promise<IssuedToken<Data>>;
  /** Revokes the family of a token: whether it was one. */
  revoke(token: string): Promise<boolean>;
  revokeSubject(subject: string | number): Promise<void>;
  prune(): Promise<void>;
}

// Cookies

export interface CookieOptions {
  path?: string;
  domain?: string;
  /** Seconds (0 deletes it). */
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | false;
}

export function parseCookies(header: string | undefined): Record<string, string>;
export function serializeCookie(name: string, value: string, options?: CookieOptions): string;

// Errors

/** Why a token was refused: 'malformed', 'algorithm', 'signature', 'expired', 'notBefore', 'issuer'... */
export const TokenError: XufaErrorConstructor<
  { code: 'XUFA_AUTH_INVALID_TOKEN'; statusCode: 401; reason?: string },
  [string]
>;
/** reason: why a refresh token was refused ('malformed', 'unknown', 'revoked', 'expired', 'reused'). */
export const Unauthorized: XufaErrorConstructor<
  { code: 'XUFA_AUTH_UNAUTHORIZED'; statusCode: 401; reason?: string },
  [string]
>;
export const TotpRequired: XufaErrorConstructor<{ code: 'XUFA_AUTH_TOTP_REQUIRED'; statusCode: 401 }, [string]>;
export const Forbidden: XufaErrorConstructor<{ code: 'XUFA_AUTH_FORBIDDEN'; statusCode: 403 }, [string]>;
/** retryAfter: seconds until the key is unlocked. */
export const Locked: XufaErrorConstructor<{ code: 'XUFA_AUTH_LOCKED'; statusCode: 429; retryAfter?: number }, [string]>;

// The plugin of @xufa/http

/** A check of a route: an authenticated user, a role, roles (any of them), a function of the user, or which
 * strategies may identify the user (with roles or a check). */
export type AuthRule<User = any> =
  true | string | string[] | ((user: User, request: any) => boolean | Promise<boolean>) | AuthRuleOf<User>;

type AuthCheck<User> = (user: User, request: any) => boolean | Promise<boolean>;

/** Which strategies may identify the user (by name: the others are refused), and any of some roles or a check. One
 * of them at least. */
export type AuthRuleOf<User = any> =
  | { strategy: string | string[]; roles?: string | string[]; check?: AuthCheck<User> }
  | { strategy?: string | string[]; roles: string | string[]; check?: AuthCheck<User> }
  | { strategy?: string | string[]; roles?: string | string[]; check: AuthCheck<User> };

// Strategies: ways a request says who it is.

/** What a strategy finds in a request: a user, credentials that are not valid, or none of its kind (null). */
export type StrategyResult<User = any> =
  | { user: User; info?: unknown }
  | { fail: { challenge?: string; message?: string; status?: number; error?: Error } }
  | null;

export interface Strategy<User = any> {
  readonly name: string;
  /** The WWW-Authenticate challenge of a 401 when there were no credentials. */
  readonly challenge?: string;
  /** Its security scheme of OpenAPI (for @xufa/openapi): { type: 'http', scheme: 'bearer' }... */
  readonly openapi?: Record<string, unknown>;
  authenticate(request: any, reply: any): Promise<StrategyResult<User>>;
}

export interface ApiKeyRecord {
  /** The hash of the secret of the key (hashApiKey). */
  hash: string;
  expiresAt?: Date | number | string | null;
  revokedAt?: Date | number | string | null;
  [field: string]: any;
}

export interface ApiKeyOptions<User = any, R extends ApiKeyRecord = ApiKeyRecord> {
  /** Its security scheme of OpenAPI (from where the key is read by default). */
  openapi?: Record<string, unknown>;
  /** 'apiKey' */
  name?: string;
  /** The header of the key ('x-api-key'; null: none). */
  header?: string | null;
  /** The scheme of the key in the Authorization header ('ApiKey': Authorization: ApiKey <key>). */
  scheme?: string | null;
  /** A query parameter of the key (none by default: URLs end in logs). */
  query?: string | null;
  /** The record of the id of a key, or null. */
  find(id: string, request: any): R | null | undefined | Promise<R | null | undefined>;
  /** The user of a record (record.user, or the record). */
  user?(record: R, request: any): User | null | undefined | Promise<User | null | undefined>;
}

/** The strategy of API keys ('<id>.<secret>' of generateApiKey). request.auth is { apiKey: id }. */
export function apiKey<User = any, R extends ApiKeyRecord = ApiKeyRecord>(
  options: ApiKeyOptions<User, R>
): Strategy<User>;

/** A new API key: give `key` to its owner once; keep `id` and `hash` (the key cannot be made from them). */
export function generateApiKey(options?: { prefix?: string }): { key: string; id: string; hash: string };
export function hashApiKey(secret: string): string;
export function parseApiKey(key: string): { id: string; secret: string } | null;
/** Whether a secret is the one of a hash, in constant time. */
export function verifyApiKey(secret: string, hash: string): boolean;
/** The fields of a model of API keys, made with the fields of @xufa/orm. */
export function apiKeyFields(
  fields: any
): Record<'id' | 'hash' | 'subject' | 'name' | 'scopes' | 'createdAt' | 'expiresAt' | 'revokedAt', any>;

export interface BasicOptions<User = any> {
  /** Its security scheme of OpenAPI ({ type: 'http', scheme: 'basic' }). */
  openapi?: Record<string, unknown>;
  /** 'basic' */
  name?: string;
  /** 'api' */
  realm?: string;
  findUser(username: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** The hash of the password of a user (user.password). */
  password?(user: User): string | null | undefined;
  passwordOptions?: PasswordOptions;
  /** A Lockout, its options, or false (no lockout). */
  lockout?: Lockout | LockoutOptions | false;
  /** How long a checked password is remembered, so requests do not pay scrypt each time ('5m'; 0: never). */
  cache?: Duration;
  /** Passwords remembered at most (10000). */
  maxCached?: number;
}

/** The strategy of HTTP Basic, against the scrypt hashes of the users. request.auth is { username }. */
export function basic<User = any>(options: BasicOptions<User>): Strategy<User>;

/** A strategy of Passport: an object with authenticate(req, options), and its name. */
export interface PassportStrategy {
  name?: string;
  authenticate(this: any, req: any, options?: any): any;
}

export interface PassportFailure {
  challenge?: string;
  message?: string;
  status?: number;
}

export interface PassportLoginOptions<User = any> {
  /** The answer of a login (the tokens of the plugin by default, of claims). */
  onLogin?(user: User, info: unknown, request: any, reply: any): unknown;
  /** The answer of a failure (401, or the status the strategy gives, by default). */
  onFailure?(failure: PassportFailure, request: any, reply: any): unknown;
  /** The claims of the tokens of a user ({ sub: String(user.id) }). */
  claims?(user: User, request: any): Claims | Promise<Claims>;
  /** Options of the authenticate() of the strategy (scope...). */
  [option: string]: unknown;
}

export interface PassportAdapter<User = any> extends Strategy<User> {
  readonly strategy: PassportStrategy;
  /** The handler of a route of login: redirects (OAuth), failures, and the user given to onLogin. */
  login(options?: PassportLoginOptions<User>): (request: any, reply: any) => Promise<unknown>;
}

/** A strategy of Passport for the plugin (in `strategies`) or for routes of login (login()). */
export function passport<User = any>(
  strategy: PassportStrategy,
  options?: {
    name?: string;
    options?: Record<string, unknown>;
    /** Its security scheme of OpenAPI (guessed from the strategy: OAuth 2.0, bearer, API keys, Basic), or false. */
    openapi?: Record<string, unknown> | false;
  }
): PassportAdapter<User>;

export interface OAuthStateOptions {
  /** The key of the cookies (16 characters or more). */
  secret: string;
  /** 'xufa_oauth_state' */
  name?: string;
  /** Seconds (600). */
  maxAge?: number;
  path?: string;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
}

export interface OAuthStateStore {
  store(
    req: any,
    verifier: string | undefined,
    state: unknown,
    meta: unknown,
    callback: (err: Error | null, handle?: string) => void
  ): void;
  verify(
    req: any,
    providedState: string,
    meta: unknown,
    callback: (err: Error | null, ok?: string | boolean, state?: unknown) => void
  ): void;
}

/** The state of OAuth 2.0 logins in a sealed cookie (the store option of passport-oauth2 strategies), with PKCE. */
export function oauthState(options: OAuthStateOptions): OAuthStateStore;

export interface LoginOptions<User = any> {
  /** The user of a username (an email...), or null. */
  findUser(username: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** The hash of the password of a user (user.password). */
  password?(user: User): string | null | undefined;
  /** The secret of TOTP of a user, when they have one (then a code is needed). */
  totp?(user: User): string | null | undefined | Promise<string | null | undefined>;
  /** The last step of TOTP used by the user (codes of it and before are refused). */
  lastTotpStep?(user: User): number | null | undefined | Promise<number | null | undefined>;
  /** Called with the step of the code of a login, to keep it. */
  onTotp?(user: User, step: number): void | Promise<void>;
  totpOptions?: TotpOptions & { window?: number };
  /** The claims of the access tokens of a user ({ sub: String(user.id) }). */
  claims?(user: User): Claims | Promise<Claims>;
  /** The claims of a refresh (from the user again), or null when the user can no longer log in. */
  reload?(subject: string, data: Claims, request: any): Claims | null | Promise<Claims | null>;
  /** Called with a new hash when the one of the user was made with other parameters. */
  rehash?(user: User, hash: string): void | Promise<void>;
  passwordOptions?: PasswordOptions;
  /** A Lockout, its options, or false (no lockout). */
  lockout?: Lockout | LockoutOptions | false;
  /** The names of the fields of the body (username, password, code). */
  fields?: { username?: string; password?: string; code?: string };
}

export interface PluginOptions<User = any> {
  /** The keys of the tokens, or a function of the request that gives them (a KeySet per tenant). Needed by the
   * strategy 'jwt', logins and refresh tokens. */
  keys?: Keys | ((request: any) => Keys | Promise<Keys>);
  /** The strategies tried on every request, in order (['jwt'] when keys are given): 'jwt' (the access tokens of the
   * plugin), apiKey(), basic(), passport(strategy), or your own. */
  strategies?: Array<'jwt' | Strategy<User>>;
  accessToken?: {
    /** '15m' */
    expiresIn?: Duration;
    issuer?: string;
    audience?: string | string[];
    algorithms?: Algorithm[];
    clockTolerance?: Duration;
  };
  /** Where tokens are read from, after the Authorization header (header: false to not read it). */
  token?: { header?: boolean; cookie?: string | null; query?: string | null };
  /** The user of the claims of a valid token (the claims by default); null refuses it. */
  user?(claims: Claims, request: any): User | null | Promise<User | null>;
  /** The hook that verifies the token of every request ('onRequest'), or false (only routes with auth do). */
  hook?: 'onRequest' | 'preParsing' | 'preValidation' | 'preHandler' | false;
  /** The routes of login, refresh and logout, under prefix ('/auth'). */
  login?: LoginOptions<User>;
  prefix?: string;
  /** The refresh tokens of logins (on with login; given, for the logins of Passport): RefreshTokens, its options, true,
   * or false (none). With them, the routes of refresh and logout. */
  refresh?: RefreshTokens | RefreshTokensOptions | boolean;
  /** The claims of a refresh when there is no login (login.reload otherwise), or null when the user can no longer. */
  reload?(subject: string, data: Claims, request: any): Claims | null | Promise<Claims | null>;
  /** Keep the refresh token in a cookie (HttpOnly, Secure, SameSite=Strict, the path of prefix), not in the body. */
  refreshCookie?: boolean | ({ name?: string } & Omit<CookieOptions, 'maxAge'>);
}

/** What the plugin decorates the app with, as app.auth. */
export interface AuthApi<User = any> {
  /** An access token of claims (the request gives the keys when they are a function of it). */
  sign(claims: Claims, request?: any, options?: SignOptions): Promise<string>;
  verify(token: string, request?: any): Promise<Claims>;
  authenticate(request: any, reply: any): Promise<void>;
  /** The hook of routes that need a user identified by one of some strategies (by name). */
  authenticateWith(...names: Array<string | string[]>): (request: any, reply: any) => Promise<void>;
  /** The tokens of a login: the access token, and the refresh token when there are refresh tokens. */
  issue(
    claims: Claims,
    request: any,
    reply: any,
    previous?: string
  ): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresIn: number; refreshToken?: string }>;
  /** The strategies by name. */
  strategies: Map<string, Strategy<User>>;
  refresh: RefreshTokens | null;
  authorize(
    ...rules: Array<string | string[] | ((user: User, request: any) => boolean | Promise<boolean>)>
  ): (request: any, reply: any) => Promise<void>;
  /** The keys (null when they are a function of the request). */
  keys: KeySet | null;
  hashPassword: typeof hashPassword;
  verifyPassword: typeof verifyPassword;
  tokenOf(request: any): string | null;
}

/**
 * The plugin for @xufa/http (and fastify). It decorates the app with auth, authenticate and authorize, and the
 * requests with user, auth (the claims of a JWT, or what the strategy knows), authStrategy and authError. To type
 * them:
 *
 *   declare module '@xufa/http' {
 *     interface XufaInstance { auth: AuthApi<User>; authenticate: AuthApi['authenticate']; authorize: AuthApi['authorize'] }
 *     interface XufaRequest { user: User | null; auth: Claims | null; authStrategy: string | null }
 *     interface XufaContextConfig { auth?: AuthRule<User> }
 *   }
 */
export function plugin(app: any, options: PluginOptions): Promise<void>;
