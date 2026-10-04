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
export type KeyEntry = KeyInput | { key: KeyInput; algorithm?: Algorithm };

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

/** A check of a route: an authenticated user, a role, roles (any of them) or a function of the user. */
export type AuthRule<User = any> =
  true | string | string[] | ((user: User, request: any) => boolean | Promise<boolean>);

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
  /** The keys of the tokens, or a function of the request that gives them (a KeySet per tenant). */
  keys: Keys | ((request: any) => Keys | Promise<Keys>);
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
  /** The refresh tokens of the login routes: RefreshTokens, its options, or false (none). */
  refresh?: RefreshTokens | RefreshTokensOptions | false;
  /** Keep the refresh token in a cookie (HttpOnly, Secure, SameSite=Strict, the path of prefix), not in the body. */
  refreshCookie?: boolean | ({ name?: string } & Omit<CookieOptions, 'maxAge'>);
}

/** What the plugin decorates the app with, as app.auth. */
export interface AuthApi<User = any> {
  /** An access token of claims (the request gives the keys when they are a function of it). */
  sign(claims: Claims, request?: any, options?: SignOptions): Promise<string>;
  verify(token: string, request?: any): Promise<Claims>;
  authenticate(request: any, reply: any): Promise<void>;
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
 * requests with user, auth (the claims) and authError. To type them:
 *
 *   declare module '@xufa/http' {
 *     interface XufaInstance { auth: AuthApi<User>; authenticate: AuthApi['authenticate']; authorize: AuthApi['authorize'] }
 *     interface XufaRequest { user: User | null; auth: Claims | null }
 *     interface XufaContextConfig { auth?: AuthRule<User> }
 *   }
 */
export function plugin(app: any, options: PluginOptions): Promise<void>;
