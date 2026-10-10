/** The declarations of @xufa/auth (written for it). */
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

/** The error correction of a QR code: L (7%), M (15%), Q (25%), H (30%). */
export type QrLevel = 'L' | 'M' | 'Q' | 'H';
/** The matrix of the QR code of a text (UTF-8): modules[y][x], true is dark; the smallest version that holds it. */
export function qrCode(
  text: string,
  options?: { level?: QrLevel; minVersion?: number }
): {
  version: number;
  size: number;
  modules: boolean[][];
};
/** The SVG of the QR code of a text (totpUri() for an authenticator app), with a quiet zone of border modules. */
export function qrSvg(
  text: string,
  options?: { level?: QrLevel; border?: number; dark?: string; light?: string; size?: number }
): string;
export class QrError extends Error {}
export function hashRecoveryCode(code: string): string;

// Lockout

/**
 * A name that identifies someone (a user name, an email) as one key: Unicode NFKC and lower case ("ＡＤＭＩＮ" and
 * "Admin" are "admin"). The lockout counts failures by it; store and find users by it too.
 */
export function normalizeIdentifier(value: string): string;

/**
 * The skeleton of a text (UTS #39): texts that look alike, also across scripts, have the same one ("pаypal" with a
 * Cyrillic а is "paypal"). A key to compare, not a text to show: skeleton(normalizeIdentifier(name)), unique per user.
 */
export function skeleton(value: string): string;

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

/** The tenant of a route: true, a user of the tenant of the request; '*', a user of every tenant. */
export type TenantRule = true | '*';

interface AuthRuleParts<User> {
  strategy?: string | string[];
  roles?: string | string[];
  check?: AuthCheck<User>;
  tenant?: TenantRule;
  /** A permission (or all those of a list) in the tenant of the request: needs the option rbac of the plugin. */
  can?: string | string[];
}

/** Which strategies may identify the user (by name: the others are refused), any of some roles or a check, the
 * tenant the user must be of, and the permissions it needs (rbac). One of them at least. */
export type AuthRuleOf<User = any> =
  | (AuthRuleParts<User> & { strategy: string | string[] })
  | (AuthRuleParts<User> & { roles: string | string[] })
  | (AuthRuleParts<User> & { check: AuthCheck<User> })
  | (AuthRuleParts<User> & { tenant: TenantRule })
  | (AuthRuleParts<User> & { can: string | string[] });

// Roles and permissions by tenant (RBAC).

/** A role: its permissions ('Book.change', 'Book.*', '*.view', '*'), or those and the roles whose permissions it
 * takes too. */
export type RoleSpec =
  | string[]
  | {
      permissions?: string[];
      inherits?: string | string[];
      /**
       * The objects each permission of the role is for, by patterns of permissions (Django's get_queryset and
       * has_change_permission(obj)): conditions of the ORM of the user ({ ownerId: user.id }), true (all), false (none).
       */
      where?: Record<
        string,
        (
          user: any,
          context: { tenant: string | number | null; permission: string }
        ) => Record<string, unknown> | boolean | null | undefined
      >;
    };

/** The objects of a permission: null (all), false (none), or conditions of the ORM (any of them). */
export type Scope = null | false | Array<Record<string, unknown>>;

/** A role of a user in a tenant, or in every tenant ('*', the default). */
export interface Grant {
  role: string;
  tenant?: string | number | null;
}

/** The grants of a user: a list of them, or a map { tenant: role | roles }. */
export type Grants = Grant[] | Record<string, string | string[]>;

export interface RbacOptions<User = any> {
  roles?: Record<string, RoleSpec>;
  /**
   * A model of roles in the database (Django's Group: AbstractGroup): its rows are roles too, next to those in code (a
   * group named as a role in code adds to it), read again after its saves and deletes, and every refresh ms (60000).
   */
  model?: any;
  refresh?: number;
  /** The grants of a user (by default user.grants, or its roles in its tenants, or in every tenant). */
  grants?(user: User): Grants | null | undefined | Promise<Grants | null | undefined>;
  /** Whether a user may do everything in every tenant (by default user.superuser or user.isSuperuser), or false. */
  superuser?: ((user: User) => boolean | Promise<boolean>) | false;
}

/** What a user may, as plain data (for a session or the claims of a token). */
export interface Access {
  superuser: boolean;
  grants: Array<{ role: string; tenant: string }>;
}

/** Roles and their permissions, granted to users in tenants (or in every tenant), and superusers. */
export class Rbac<User = any> {
  constructor(options: RbacOptions<User>);
  /** What a user may: { superuser, grants }. */
  access(user: User | null | undefined): Promise<Access>;
  /** Whether an access has a permission (or all those of a list) in a tenant (without one: its grants of every tenant). */
  allows(access: Access | null | undefined, permission: string | string[], tenant?: string | number | null): boolean;
  /** Whether a user has a permission (or all those of a list) in a tenant. */
  can(
    user: User | null | undefined,
    permission: string | string[],
    options?: { tenant?: string | number | null }
  ): Promise<boolean>;
  /** The roles of an access in a tenant (and those of every tenant). */
  rolesIn(access: Access | null | undefined, tenant?: string | number | null): string[];
  /** The patterns of the permissions of an access in a tenant (['*'] for a superuser). */
  permissionsIn(access: Access | null | undefined, tenant?: string | number | null): string[];
  /** The tenants an access may use: ['*'] (every one) or their ids. */
  tenantsIn(access: Access | null | undefined): string[];
  /** Whether an access may use a tenant. */
  inTenant(access: Access | null | undefined, tenant: string | number | null | undefined): boolean;
  /** The objects of a permission for a user (the where of its roles): null for all, false for none, or conditions. */
  scopeOf(
    access: Access | null | undefined,
    user: User | null | undefined,
    permission: string,
    tenant?: string | number | null
  ): Scope;
  /** The roles of the model, read now. */
  load(): Promise<this>;
  /** The roles of the model, read again when they may have changed (access() calls it). */
  fresh(): Promise<this>;
}

export class RbacError extends TypeError {
  code: 'XUFA_AUTH_ERR_RBAC';
}

/** Every tenant, in the tenants of a user ('*'). */
export const ALL_TENANTS: '*';
/** The tenants of a user: user.tenants (a list) or user.tenant, as texts. */
export function tenantsOf(user: any): string[];
/** The roles of a user: user.roles (a list) or user.role. */
export function rolesOf(user: any): string[];

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
  /** Tenants: of(request), the tenant of a request (request.tenant, which the plugin of @xufa/orm sets); claim(user),
   * the tenants a user may use (tenantsOf: its claims tenants or tenant; '*' is every tenant). */
  tenants?: {
    of?(request: any): string | number | null | undefined | Promise<string | number | null | undefined>;
    claim?(user: User): string[] | Promise<string[]>;
  };
  /** Keep the refresh token in a cookie (HttpOnly, Secure, SameSite=Strict, the path of prefix), not in the body. */
  refreshCookie?: boolean | ({ name?: string } & Omit<CookieOptions, 'maxAge'>);
  /** Roles and permissions by tenant: rules { can }, app.auth.can() and request.can(); the tenants of a user are
   * those of its grants. */
  rbac?: Rbac<User> | RbacOptions<User>;
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
  /** Whether the user of a request may use a tenant (a 401 is thrown without a user): the authorize of the tenants of
   * @xufa/orm, (request, id, reply) => app.auth.canUseTenant(request, id, reply). */
  canUseTenant(request: any, tenant: string, reply?: any): Promise<boolean>;
  /** The tenants a user may use (the claim of the options). */
  tenantsOf(user: User): Promise<string[]> | string[];
  /** Whether the user of a request has a permission (or all those of a list) in a tenant (that of the request by
   * default); needs rbac. With rbac, requests have can(permission, tenant?) too. */
  can(request: any, permission: string | string[], tenant?: string | number | null): Promise<boolean>;
  /** The objects of a permission for the user of a request (the where of its roles): null, false or conditions. */
  scopeOf(request: any, permission: string, tenant?: string | number | null): Promise<Scope>;
  /** The rbac of the plugin (null without it). */
  rbac: Rbac<User> | null;
  /** What a user may (needs rbac). */
  access(user: User | null | undefined): Promise<Access>;
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

// The accounts of an app with sessions (as Laravel Breeze).

/** The users of the app, as the accounts ask for them and change them. */
export interface AccountUsers<User = any> {
  findByEmail(email: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  findById(id: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** Another account with the same skeleton (look-alike characters) is taken too. */
  findBySkeleton?(skeleton: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** Sign up: { email, emailSkeleton, password (its hash), and the fields of signup.fields }. Without it, no signup. */
  create?(values: Record<string, unknown>, request: any): User | Promise<User>;
  /** A new hash of the password (resets, changes, rehashes). */
  setPassword?(user: User, hash: string, request: any): unknown;
  /** The email of the user was verified. */
  markVerified?(user: User, request: any): unknown;
  /** The user of a username (loginBy: username). */
  findByUsername?(username: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** The secret of an authenticator app the user set up (its first code checked), or null to remove it. */
  setTotp?(user: User, secret: string | null, request: any): unknown;
  /** The hashes of the recovery codes to keep (fewer after one is used, new ones, [] with the app removed). */
  setRecoveryCodes?(user: User, hashes: string[], request: any): unknown;
}

/** An email of accounts given as data: its subject, and its text or html (templates of @xufa/template). */
export interface AccountMail {
  subject: string;
  text?: string;
  html?: string;
  with?: Record<string, unknown>;
}

export interface AccountsOptions<User = any> {
  /** 32 characters or more: signs the links of resets and verifications. */
  secret: string;
  /** The users (findByEmail, findById...); with model, only those to change. */
  users?: Partial<AccountUsers<User>>;
  /** A model of users (AbstractUser): its users found and changed, isActive, and lastLogin set at each login. */
  model?: any;
  /** What users log in with: their email (default) or their username (users.findByUsername). */
  loginBy?: 'email' | 'username';
  /** After each login (a model sets its lastLogin). */
  onLogin?: ((user: User, request: any) => unknown) | null;
  /** Where the routes are ('/account'). */
  prefix?: string;
  /** A Mailer of @xufa/mail: the emails of the links. */
  mailer?: { send(mail: any, overrides?: any): Promise<unknown> } | null;
  /** The addresses of the pages that take the tokens of the links. */
  links?: { reset?: (token: string) => string; verify?: (token: string) => string };
  /**
   * The emails of the links, of your own: a function that gives a Mailable or a plain email, or a plain email (as in
   * a file of configuration) whose templates have url (and link), email and user.
   */
  mails?: {
    reset?: ((user: User, url: string) => unknown) | AccountMail;
    verify?: ((user: User, url: string) => unknown) | AccountMail;
  };
  /** The name of the app, in the subjects of the emails. */
  app?: { name?: string };
  /** The fields of the user: its key, email, password hash and whether its email is verified. */
  id?: (user: User) => string | number;
  email?: (user: User) => string;
  password?: (user: User) => string | null | undefined;
  verified?: (user: User) => boolean;
  /** Whether an account may be used (not locked nor disabled): a login is refused (403), and its sessions end at their next request. */
  active?: (user: User) => boolean | Promise<boolean>;
  /** What the routes answer of a user ({ id, email, verified }). */
  profile?: (user: User) => unknown;
  /** Codes of authenticator apps: the secret of a user (none: no code), its last step, and the one used. */
  totp?: (user: User) => string | null | undefined | Promise<string | null | undefined>;
  lastTotpStep?: (user: User) => number | null | undefined | Promise<number | null | undefined>;
  onTotp?: (user: User, step: number) => unknown;
  totpOptions?: { window?: number; digits?: number; period?: number; algorithm?: string };
  /** The hashes of the recovery codes of a user (with users.setRecoveryCodes): each logs in once in place of a code. */
  recoveryCodes?: (user: User) => string[] | null | undefined | Promise<string[] | null | undefined>;
  /** Messages of your own, by reason of the Credentials (invalid, throttled...). */
  messages?: Partial<Record<CredentialReason | 'notYours' | 'sameAsBefore', string>>;
  passwordOptions?: PasswordOptions;
  /** The policy of passwords: 8 to 256 characters, not the email in it, and checkPassword (a message, or nothing). */
  minPassword?: number;
  maxPassword?: number;
  checkPassword?: (password: string, values: { email?: string | null }) => string | null | undefined;
  /** signup.fields: the other fields a signup takes (name...); login: false (not logged in after it). */
  signup?: { fields?: string[]; login?: boolean };
  /** The routes of required need a verified email. */
  requireVerified?: boolean;
  /** Lockouts: by email (5 in 15 min), by address (20), links asked by email (5); a Lockout, its options, or false. */
  lockout?: Lockout | LockoutOptions | false;
  ipLockout?: Lockout | LockoutOptions | false;
  linkLockout?: Lockout | LockoutOptions | false;
  /** Where loginRequired sends pages of users who did not log in (with ?next=): an address, or a function of the request. */
  loginUrl?: string | ((request: any) => string) | null;
  /** The roles and their permissions, for permissionRequired: an Rbac or its options. */
  rbac?: Rbac | RbacOptions | null;
  /** The permissions of each user besides those of its roles (user.permissions by default, as Django's user_permissions). */
  userPermissions?: (user: User) => string[] | null | undefined | Promise<string[] | null | undefined>;
  /** How long the links work ('1h' and '2d'). */
  resetTtl?: number | string;
  verifyTtl?: number | string;
}

/** What accounts decorates the app with, as app.accounts. */
export interface AccountsApi<User = any> {
  /** The user of a request (its session), or null. */
  user(request: any): Promise<User | null>;
  /** The hook of the routes that need a user (and a verified email, with requireVerified): 401, or 403. */
  required(request: any, reply: any): Promise<unknown>;
  /** Logs a user in, in the session of the request. */
  logIn(request: any, user: User): Promise<void>;
  /** Sends a link to verify the email of a user. */
  sendVerification(user: User): Promise<unknown>;
  /** A link to reset the password of a user. */
  resetLink(user: User): string;
  /** The user of the token of a reset link while it is good (not expired, not used), else null: Django's validlink. */
  checkResetToken(token: string, request?: any): Promise<User | null>;
  /**
   * A new password with the token of a reset link: the sessions of the user end. AccountError (400) with errors.token
   * (a link not good) or errors.password (a weak one).
   */
  resetPassword(token: string, password: string, request?: any): Promise<User>;
  /** Django's authenticate(): the user of { email or username, password, code }, or a CredentialError. */
  authenticate(
    given: { email?: string; username?: string; password?: string; code?: string },
    request?: any
  ): Promise<User>;
  /** Out of this session, or of every session of the user. */
  logOut(request: any, options?: { everywhere?: boolean }): Promise<void>;
  /** A reset link by email (the same whatever the email); link(token): its address (links.reset by default). */
  requestReset(email: string, request?: any, options?: { link?: (token: string) => string }): Promise<void>;
  /** A new password for the user of a request, with the one now; its other sessions end. */
  changePassword(request: any, given: { current: string; password: string }): Promise<void>;
  /** What users log in with. */
  loginBy: 'email' | 'username';
  /** Ends every session of a user now (locked, disabled...): every browser, process and machine with the store. */
  endSessions(user: User): Promise<void>;
  /** login_required: pages go to loginUrl with ?next=, other clients get 401. */
  loginRequired(request: any, reply: any): Promise<unknown>;
  /** permission_required: the login without a user, 403 without every permission given. */
  permissionRequired(...permissions: string[]): (request: any, reply: any) => Promise<unknown>;
  /** The permissions of the user of a request, once a request. */
  perms(request: any): Promise<{ has(permission: string): boolean; all: string[]; superuser?: boolean }>;
  /** Whether a user has a permission (its roles, or its own). */
  can(user: User, permission: string): Promise<boolean>;
  /** The Rbac of the option rbac, or null. */
  readonly rbac: Rbac | null;
}

/**
 * The accounts of the users of an app with sessions (@xufa/session registered before): POST <prefix>/signup, /login,
 * /logout ({ everywhere }), /password/forgot, /password/reset, /password/change, /email/verify, /email/resend, and
 * GET /me, /sessions, /security; with users.setTotp, POST /totp/start, /totp/confirm, /totp/disable, and with
 * recovery codes /recovery-codes. app.accounts, and request.account (the user of a request, once app.accounts.user() read it).
 */
export function accounts(app: any, options: AccountsOptions, done: (err?: Error) => void): void;

export interface PagesOptions {
  /** Where the pages are ('/accounts'). */
  prefix?: string;
  /** A folder of views of @xufa/template with Django's templates (login, logged_out, password_change_form...), or null for pages of its own. */
  views?: string | null;
  /** Where a login goes without next ('/'). */
  loginRedirectUrl?: string;
  /** Where a logout goes (null: the page that says so). */
  logoutRedirectUrl?: string | null;
  /** The site of the links of the emails (else the host of the request). */
  siteUrl?: string | null;
  /** Django's names for the routes (true). */
  names?: boolean;
}

/** Pages of the accounts as Django's django.contrib.auth.urls (after accounts): app.accountPages.urls and its forms. */
export function pages(app: any, options: PagesOptions, done: (err?: Error) => void): void;

/** An error of the accounts: its status, and the errors by field. */
export declare class AccountError extends Error {
  statusCode: number;
  errors?: Record<string, string[]>;
}

/** An email as the accounts keep it (trimmed, NFKC, lower case), or null when it is not one. */
export function emailOf(value: unknown): string | null;

// The credentials of the users: the logins and accounts of @xufa/auth and of @xufa/admin.

/** Why a CredentialError refused. */
export type CredentialReason =
  | 'missing'
  | 'invalid'
  | 'code'
  | 'wrongCode'
  | 'locked'
  | 'throttled'
  | 'wrongPassword'
  | 'weak'
  | 'pending'
  | 'noTotp'
  | 'noPasswords'
  | 'noApps'
  | 'noRecovery';

export interface CredentialsOptions<User = any> {
  /** The user of an identifier (an email, a user name), or null: for login(). */
  findUser?: (identifier: string, request: any) => User | null | undefined | Promise<User | null | undefined>;
  /** Its hash (user.password). */
  password?: (user: User) => string | null | undefined;
  /** The secret of its authenticator app (none: no code), its last step, and the step of a code used. */
  totp?: (user: User) => string | null | undefined | Promise<string | null | undefined>;
  lastTotpStep?: (user: User) => number | null | undefined | Promise<number | null | undefined>;
  onTotp?: (user: User, step: number) => unknown;
  /** A new hash of the password made with passwordOptions (setPassword when not given). */
  rehash?: (user: User, hash: string, request: any) => unknown;
  /** Users it refuses get the answer of a wrong password. */
  allow?: (user: User) => boolean | Promise<boolean>;
  /** Users it refuses are told the account is locked (403), once their password is right. */
  active?: (user: User) => boolean | Promise<boolean>;
  setPassword?: (user: User, hash: string, request: any) => unknown;
  setTotp?: (user: User, secret: string | null, request: any) => unknown;
  /** Recovery codes: the hashes kept, and new ones to keep (both, or neither). */
  recoveryCodes?: (user: User) => string[] | null | undefined | Promise<string[] | null | undefined>;
  setRecoveryCodes?: (user: User, hashes: string[], request: any) => unknown;
  /** Failures by identifier (5 in 15 minutes) and by address (20): a Lockout, its options, or false. */
  lockout?: Lockout | LockoutOptions | false;
  ipLockout?: Lockout | LockoutOptions | false;
  passwordOptions?: PasswordOptions;
  totpOptions?: { window?: number; digits?: number; period?: number; algorithm?: string };
  /** The policy of new passwords: 8 to 256 characters, not the email in it, and checkPassword (a message, or nothing). */
  minPassword?: number;
  maxPassword?: number;
  checkPassword?: (password: string, values: { email?: string | null }) => string | null | undefined;
  id?: (user: User) => string | number;
  messages?: Partial<Record<CredentialReason | 'notYours' | 'sameAsBefore', string>>;
}

/** A session as @xufa/session gives it: where an app being set up waits for its first code. */
export interface CredentialSession {
  get(key: string): any;
  set(key: string, value: unknown): unknown;
  delete(key: string): unknown;
}

/**
 * The credentials of the users of an app: logins (password, then the code of an authenticator app or a recovery
 * code; lockouts by identifier and by address; the same answer and time for every wrong user or password; rehashes),
 * and the account of a user (a new password, an app set up with a QR code, recovery codes). Refusals are
 * CredentialErrors.
 */
export declare class Credentials<User = any> {
  constructor(options?: CredentialsOptions<User>);
  readonly lockout: Lockout | null;
  readonly ipLockout: Lockout | null;
  /** Whether recovery codes are kept. */
  readonly recovery: boolean;
  login(input: { identifier: unknown; password: unknown; code?: unknown; ip?: string; request?: any }): Promise<User>;
  /** What is wrong with a new password, or null. */
  validatePassword(password: unknown, values?: { email?: string | null }): string | null;
  /** The password of a user asked again (failures locked out by account). */
  confirmPassword(user: User, password: unknown, field?: string): Promise<void>;
  state(
    user: User
  ): Promise<{ password: boolean; totp: { can: boolean; enabled: boolean }; recovery: { left: number } | null }>;
  changePassword(
    user: User,
    input: { current?: unknown; password?: unknown; email?: string },
    request?: any
  ): Promise<void>;
  /** A password set without the one before (a reset): checked, hashed, kept. */
  setPassword(user: User, password: unknown, request?: any, values?: { email?: string | null }): Promise<void>;
  startTotp(
    user: User,
    input: { password: unknown; label: string; issuer?: string; session: CredentialSession }
  ): Promise<{ secret: string; uri: string; svg: string }>;
  confirmTotp(
    user: User,
    input: { code: unknown; session: CredentialSession; request?: any }
  ): Promise<{ recoveryCodes: string[] | null }>;
  disableTotp(user: User, input: { password: unknown; request?: any }): Promise<void>;
  renewRecoveryCodes(user: User, input: { password: unknown; request?: any }): Promise<{ recoveryCodes: string[] }>;
  newRecoveryCodes(user: User, request?: any): Promise<string[] | null>;
}

/** A refusal of the Credentials: its reason, status, errors by field, and whether a code is asked for. */
export declare class CredentialError extends Error {
  reason: CredentialReason;
  statusCode: number;
  errors: Record<string, string[]>;
  /** The code of an authenticator app is asked for (and, with recovery, a recovery code works too). */
  needsCode: boolean;
  recovery: boolean;
  /** Seconds until a lockout ends (throttled). */
  retryAfter?: number;
}

/** The messages users read (logins, passwords, authenticator apps, accounts and their emails), by key, in English. */
export const AUTH_MESSAGES: Readonly<Record<string, string>>;
/** The message of a key with its parameters, translated (auth.<key>) when a translator is set. */
export function authMessage(key: string, params?: Record<string, unknown>): string;
/** The translator of the messages (as i18n.translateAuth(auth) of @xufa/i18n sets), or null. */
export function setTranslator(
  fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null
): void;

// The model of users (django.contrib.auth's AbstractUser).

/** The fields and methods of the users of AbstractUser. */
export interface AbstractUserFields {
  username: string;
  email: string | null;
  password: string;
  firstName: string;
  lastName: string;
  isStaff: boolean;
  isSuperuser: boolean;
  isActive: boolean;
  dateJoined: Date;
  lastLogin: Date | null;
  /** Raised by each "log out everywhere": sessions logged in with a lower one are over (read with the user). */
  sessionGeneration: number;
  /** The role of the user in an Rbac (Django's groups). */
  role: string | null;
  /** Its own permissions (Django's user_permissions). */
  permissions: string[];
  /** Hashes a password (scrypt) into password. */
  setPassword(raw: string, options?: PasswordOptions): Promise<this>;
  /** A password that never matches (a user who logs in elsewhere). */
  setUnusablePassword(): this;
  readonly hasUsablePassword: boolean;
  checkPassword(raw: string): Promise<boolean>;
  /** Its own permissions, and every one for an active superuser. */
  hasPerm(permission: string): boolean;
  readonly fullName: string;
  readonly shortName: string;
  readonly isAuthenticated: true;
}

export interface AbstractUserOptions {
  /** The options of hashPassword (lighter in tests). */
  passwordOptions?: PasswordOptions;
  /** Options of the fields email and username over their defaults ({ unique: true }...). */
  email?: Record<string, unknown>;
  username?: Record<string, unknown>;
  /** The model of the groups (AbstractGroup): a many-to-many groups, as Django's user.groups. */
  groups?: () => any;
}

/** The fields of a group. */
export interface AbstractGroupFields {
  name: string;
  /** Its permissions: Model.action, with * for any (Book.*, *.view). */
  permissions: string[];
  /** The roles whose permissions it has too. */
  inherits: string[];
}

/** An abstract model of groups, as Django's Group: roles of an Rbac in the database (its option model). */
export declare function AbstractGroup<M extends abstract new (...args: any[]) => any>(
  Model: M,
  fields: any
): M & { new (...args: any[]): InstanceType<M> & AbstractGroupFields };

/**
 * An abstract model of users, as Django's AbstractUser, of the Model and fields of @xufa/orm (which @xufa/auth does
 * not depend on): class User extends AbstractUser(Model, fields) {}. User.createUser(), User.createSuperuser().
 */
export declare function AbstractUser<M extends abstract new (...args: any[]) => any>(
  Model: M,
  fields: any,
  options?: AbstractUserOptions
): M & {
  new (...args: any[]): InstanceType<M> & AbstractUserFields;
  readonly userModel: true;
  createUser(
    values: Record<string, unknown> & { password?: string | null }
  ): Promise<InstanceType<M> & AbstractUserFields>;
  createSuperuser(
    values: Record<string, unknown> & { password?: string | null }
  ): Promise<InstanceType<M> & AbstractUserFields>;
};

/** The password of setUnusablePassword(). */
export const UNUSABLE_PASSWORD: '!';
