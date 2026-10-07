import type { ModelClass } from '@xufa/orm';

/** The options of a model in the admin: its list, what it searches and filters by, its fields only read. */
export interface AdminModelOptions {
  /** The name shown (the name of the model). */
  label?: string;
  /** The columns of its list (the first six fields that are not text nor json). */
  list?: string[];
  /** The fields its search looks in (its string fields). */
  search?: string[];
  /** The fields it filters by (booleans, choices and foreign keys). */
  filters?: string[];
  /** Fields shown but not changed in its forms (besides keys, automatic dates and given fields). */
  readOnly?: string[];
  /** Its default order (that of the model). */
  ordering?: string[];
  /** Only read: no creates, updates nor deletes. */
  readOnlyModel?: boolean;
}

/** The options of the admin besides who may use it: its models, its title, its pipelines. */
export interface AdminBaseOptions {
  /** The models, or [model, options] pairs. */
  models: Array<ModelClass<any> | [ModelClass<any>, AdminModelOptions]>;
  /** Options of the models by name (for those given alone). */
  modelOptions?: Record<string, AdminModelOptions>;
  /** The title of the page ('Admin'). */
  title?: string;
  /** Objects in a page of a list (25). */
  pageSize?: number;
  /**
   * The runs of these pipelines of @xufa/queue (a Pipelines): their list, the graph of each with its steps, and retry,
   * cancel and resume (api/_runs).
   */
  pipelines?: {
    get(runId: unknown): Promise<unknown>;
    retry(runId: unknown): Promise<boolean>;
    cancel(runId: unknown): Promise<boolean>;
    resume(runId: unknown, stepId: string, output?: unknown): Promise<unknown>;
  };
  /** The report of xufa.health of the app on the first page (true: when the app has it). */
  health?: boolean;
}

/**
 * Who may use it: a function of the request (a promise too), or 'development': every request while NODE_ENV is not
 * production.
 */
export type AdminAuthorize = ((request: any, reply: any) => boolean | Promise<boolean>) | 'development';

/**
 * The options of the admin: authorize, or login (its own login page, GET login, POST login, POST logout, with
 * @xufa/auth and @xufa/session registered before the admin), or both (authorize asked after the login, with
 * request.adminUser).
 */
export type AdminOptions = AdminBaseOptions &
  ({ authorize: AdminAuthorize; login?: AdminLogin } | { login: AdminLogin; authorize?: AdminAuthorize });

/** What the admin knows of a field. */
export interface AdminField {
  name: string;
  attname: string;
  type: string;
  input: 'text' | 'textarea' | 'number' | 'decimal' | 'checkbox' | 'date' | 'datetime' | 'json' | 'select' | 'choices';
  required: boolean;
  null: boolean;
  readOnly: boolean;
  primaryKey: boolean;
  choices: unknown[] | null;
  maxLength: number | null;
  scale: number | null;
  target: string | null;
  default: unknown;
}

/** What the admin knows of a model. */
export interface AdminModel {
  name: string;
  label: string;
  pk: string | null;
  fields: AdminField[];
  list: string[];
  search: string[];
  filters: string[];
  ordering: string[];
  softDelete: string | null;
  readOnlyModel: boolean;
}

/**
 * The admin of models, as Django's: a page with the list of each model (search, filters, order, pages) and its forms
 * (from its fields, with the errors of its validation), over an API of its own. A plugin of @xufa/http: register it
 * with a prefix.
 */
export declare function admin(app: any, options: AdminOptions): Promise<void>;
export { admin as adminPlugin, admin as plugin };

/** What the admin knows of a model, with its options. */
export declare function describeModel(model: ModelClass<any>, options?: AdminModelOptions): AdminModel;

/** The label of an object: its toString() (as Django's __str__), or its first string field. */
export declare function labelOf(model: ModelClass<any>, object: unknown): string;

/** An error of the admin: wrong options, or a request it refuses. */
export declare class AdminError extends Error {
  statusCode: number;
}

/** The login of the admin: the options of the login of @xufa/auth, and who may use the admin. */
export interface AdminLogin<User = any> {
  /** The user of a username (an email...), or null. */
  findUser(username: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** Its hash of @xufa/auth (user.password). */
  password?: (user: User) => string | null | undefined;
  /** Who may use the admin (everyone found). Others get the answer of a wrong password. */
  allow?: (user: User) => boolean | Promise<boolean>;
  /** The name shown in the page (the username). */
  name?: (user: User, username: string) => string | Promise<string>;
  /** The secret of the authenticator app of the user: its code is asked for after the password. */
  totp?: (user: User) => string | null | undefined | Promise<string | null | undefined>;
  lastTotpStep?: (user: User) => number | null | undefined | Promise<number | null | undefined>;
  onTotp?: (user: User, step: number) => unknown;
  /** A new hash of the password (made with passwordOptions) when the one kept was made with others. */
  rehash?: (user: User, hash: string) => unknown;
  /** Failures by user: 5 in 15 minutes lock it for 15 (false: none; or a Lockout of @xufa/auth). */
  lockout?:
    false | { maxAttempts?: number; window?: number | string; lockFor?: number | string; store?: unknown } | object;
  /** Failures by address: 20 in 15 minutes. */
  ipLockout?:
    false | { maxAttempts?: number; window?: number | string; lockFor?: number | string; store?: unknown } | object;
  passwordOptions?: { ln?: number; r?: number; p?: number };
  totpOptions?: { window?: number; digits?: number; period?: number; algorithm?: string };
}
