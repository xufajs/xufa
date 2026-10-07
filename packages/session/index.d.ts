import type { Database, ModelClass, Model } from '@xufa/orm';

/** Where sessions are kept: get(id), set(id, data, expiresAt), delete(id). */
export interface SessionStore {
  get(id: string): Promise<{ data: Record<string, unknown>; expiresAt: Date } | null>;
  set(id: string, data: Record<string, unknown>, expiresAt: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

/** Sessions in memory: one process (tests, development). */
export declare function memoryStore(options?: {
  now?: () => number;
}): SessionStore & { sessions: Map<string, unknown> };

/**
 * Sessions as objects of a model of @xufa/orm (any backend: shared by every process and machine with the database),
 * deleted when they expire by a TTL index (db.expire()). Its model (table xufa_sessions) is registered in db.
 */
export declare function ormStore(
  db: Database,
  options?: { table?: string; model?: string }
): SessionStore & { model: ModelClass<Model> };

/** The session of a request (request.session). */
export declare class Session {
  /** Its id (in the cookie, signed). */
  readonly id: string;
  /** Made by this request (no cookie, or one of a session that is not there). */
  readonly fresh: boolean;
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): this;
  has(key: string): boolean;
  delete(key: string): this;
  /** Every value. */
  all(): Record<string, unknown>;
  clear(): this;
  /** A new id, the values kept: after a login, so an id known before it is worth nothing. */
  regenerate(): this;
  /** Ends the session: its values go, and its cookie is cleared. */
  destroy(): this;
  /** A value for the next request only. */
  flash(key: string, value: unknown): this;
  /** The value the last request left (once). */
  flash<T = unknown>(key: string): T | undefined;
  /** The token forms send back (x-csrf-token, or _csrf in the body). */
  csrfToken(): string;
  checkCsrf(token: unknown): boolean;
}

/** The options of the plugin. */
export interface SessionOptions {
  /** 32 characters or more; [new, old] to rotate them (the first signs, all are checked). */
  secret: string | string[];
  /** In memory by default: ormStore(db) for every process. */
  store?: SessionStore;
  /** The name of the cookie ('sid'). */
  cookieName?: string;
  /** How long a session lasts without requests ('14d'). */
  maxAge?: number | string;
  /** Each request makes it last maxAge again (true). */
  rolling?: boolean;
  /** Writes (POST, PUT, PATCH, DELETE) of a session need its token (false). Routes leave it with config: { csrf: false }. */
  csrf?: boolean;
  /** The cookie: path ('/'), domain, sameSite ('lax'), secure (when the request is HTTPS), httpOnly (true), partitioned. */
  cookie?: {
    path?: string;
    domain?: string;
    sameSite?: 'lax' | 'strict' | 'none';
    secure?: boolean;
    httpOnly?: boolean;
    partitioned?: boolean;
  };
}

/** The plugin of @xufa/http: request.session, loaded from its cookie and saved when the reply is sent. */
export declare function sessionPlugin(app: any, options: SessionOptions, done: (err?: Error) => void): void;
export { sessionPlugin as plugin };

/** An error of the session: its options (500), or a CSRF token missing or wrong (403, XUFA_SESSION_CSRF). */
export declare class SessionError extends Error {
  code: 'XUFA_SESSION_ERR' | 'XUFA_SESSION_CSRF';
  statusCode: number;
}

export declare function parseCookies(header: string | undefined): Record<string, string>;
export declare function serializeCookie(
  name: string,
  value: string,
  options?: {
    maxAge?: number;
    expires?: Date;
    domain?: string;
    path?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    partitioned?: boolean;
  }
): string;
export declare function sign(value: string, secret: string): string;
export declare function unsign(signed: string, secrets: string[]): string | null;

declare module '@xufa/http' {
  interface XufaRequest {
    session: Session;
  }
}
