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
  options?: {
    table?: string;
    model?: string;
    /** PostgreSQL: writes do not wait for the disk (a crash of the server may lose its last fraction of a second of them). */
    asyncCommit?: boolean;
  }
): SessionStore & { model: ModelClass<Model> };

/** The session of a request (request.session). */
export declare class Session {
  /** Its id (in the cookie, signed). */
  readonly id: string;
  /** Made by this request (no cookie, or one of a session that is not there). */
  readonly fresh: boolean;
  /** What names it among the sessions of its user (app.sessions.list(), end()): a hash of its id, not its id. */
  readonly handle: string;
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
  /** The id of the user of the session (login()), or null. */
  readonly user: string | null;
  /** This request emptied the session: its user had logged out everywhere since it was made. */
  readonly endedEverywhere?: boolean;
  /** Ties the session to a user, with a new id (after a login). */
  login(userId: string | number): Promise<this>;
  /** Ends the session (as destroy()). */
  logout(): this;
  /** Ends every session of its user (in every browser, process and machine with the store), this one too. */
  logoutEverywhere(): Promise<this>;
  /** Ends every other session of its user; this one goes on with a new id. */
  logoutOthers(): Promise<this>;
  /** A value for the next request only. */
  flash(key: string, value: unknown): this;
  /** The value the last request left (once). */
  flash<T = unknown>(key: string): T | undefined;
  /** A message for the user, for the page shown next (Django's messages). */
  message(text: string, level?: 'debug' | 'info' | 'success' | 'warning' | 'error' | string): this;
  /** The messages waiting (of the last request and this one), once. */
  messages(): { text: string; level: string }[];
  /** The token forms send back (x-csrf-token, or _csrf in the body): in the session, or in a cookie of its own while the session keeps nothing. */
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
  /** Its requests make it last maxAge again (true): written when touchAfter has passed since it was, not at each one. */
  rolling?: boolean;
  /** How long after a session was written a request pushes its expiry back (1 hour, or half of maxAge when shorter; 0: every request). */
  touchAfter?: number | string;
  /** Writes (POST, PUT, PATCH, DELETE) of a session need its token (false). Routes leave it with config: { csrf: false }. */
  csrf?: boolean;
  /** The cookie of the CSRF token of a visitor whose session keeps nothing (`<cookieName>_csrf`). */
  csrfCookieName?: string;
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

/** What the plugin decorates the app with, as app.sessions. */
export interface SessionsApi {
  store: SessionStore;
  /** A session made out of a request (fn fills it: login(), set()), kept: its Cookie (name=value) and id. */
  open(fn?: (session: Session) => unknown): Promise<{ id: string; cookie: string }>;
  /** The CSRF token of the session of a Cookie header (made when it has none), or of its CSRF cookie, for a test client; null without either. */
  csrfTokenOf(cookieHeader: string | undefined): Promise<string | null>;
  /** Ends every session of a user (an admin ending those of another). */
  logoutUser(userId: string | number): Promise<void>;
  /** The generation of a user: raised by each logout everywhere. */
  generationOf(userId: string | number): Promise<number>;
  /**
   * Where the generations of "log out everywhere" are read and written besides the store (@xufa/auth keeps them in the
   * row of the user, read with it): read() gives undefined when it does not know (the store's is used).
   */
  useGenerations(source: {
    read(userId: string, request?: unknown): Promise<number | undefined> | number | undefined;
    write(userId: string, generation: number): Promise<unknown> | unknown;
  }): void;
  /** The sessions of a user still there, last seen first. */
  list(userId: string | number): Promise<UserSession[]>;
  /** Ends a session of a user by its handle: whether it was there. */
  end(userId: string | number, handle: string): Promise<boolean>;
}

/** A session of a user: its device, as its last requests came. */
export interface UserSession {
  handle: string;
  /** Its user agent (300 characters at most). */
  agent: string | null;
  ip: string | null;
  /** Its login. */
  since: Date | null;
  /** Its last request (written with the session, or touchAfter after it was last written: an hour by default). */
  seen: Date | null;
  expiresAt: Date;
}

declare module '@xufa/http' {
  interface XufaRequest {
    session: Session;
  }
  interface XufaInstance {
    sessions: SessionsApi;
  }
}
