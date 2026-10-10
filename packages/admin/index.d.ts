import type { ModelClass } from '@xufa/orm';

/** The options of a model in the admin: its list, what it searches and filters by, its fields only read. */
export interface AdminModelOptions {
  /** Its name as a collection (the sidebar, its list): its meta.labelPlural with a capital ('Book instances'). */
  label?: string;
  /** Its name for one object ('Add book instance'): its meta.label. */
  singular?: string;
  /**
   * The columns of its list (the first six fields that are not text nor json), as Django's list_display: fields,
   * paths across foreign keys ('book__title', ordered by it), methods or getters of the model ('displayGenre', async
   * too; its header: the label of the function), many-to-many fields, or columns of their own.
   */
  list?: Array<string | AdminColumn>;
  /** Fields of its list changed in its rows, booleans and choices, each saved as it changes (Django's list_editable). */
  editable?: string[];
  /** The fields of its form and their order (Django's fields): names, or lists of names on one line. */
  fields?: Array<string | string[]>;
  /** The fields of its form in groups (Django's fieldsets): [title or null, { fields, description, collapse }]. */
  fieldsets?: Array<
    [string | null, { fields: Array<string | string[]>; description?: string; collapse?: boolean; classes?: string[] }]
  >;
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
  /** Its related lists (the objects of other models of the admin that point to it), by relation name (bookSet): all
   * by default, none with false. { relation, fields, extra } edits them in rows (Django's TabularInline). */
  inlines?: Array<string | AdminInline> | false;
  /** Its actions on the objects selected in its list (as Django's), by name: run, or { run, label, permission,
   * confirm, danger }. */
  actions?: Record<string, AdminActionRun | AdminAction>;
}

/** A related list edited in rows (Django's TabularInline): its fields (those that can be), and the empty rows to add (1). */
export interface AdminInline {
  relation: string;
  fields?: string[];
  extra?: number;
}

/** A column of a list of its own: its value of each object (async too). */
export interface AdminColumn {
  name: string;
  label?: string;
  value?: (object: any) => unknown;
}

/** What an action gets besides the objects selected. */
export interface AdminActionContext {
  request: unknown;
  /** The user of the admin (its login, else request.user). */
  user: unknown;
  /** The tenant chosen (with tenants). */
  tenant: string | null;
  /** The keys selected (some may be gone: the QuerySet has those that are there). */
  pks: Array<string | number>;
  model: ModelClass<any>;
}

/** Runs an action on a QuerySet of the objects selected: a message, a number of objects changed, or nothing. */
export type AdminActionRun = (
  objects: any,
  context: AdminActionContext
) => string | number | { message: string } | void | Promise<string | number | { message: string } | void>;

export interface AdminAction {
  run: AdminActionRun;
  /** Its button (its name in words: markPublished is Mark published). */
  label?: string;
  /** The permission it needs (<Model>.change). */
  permission?: string;
  /** Asked before it runs: true, or the question. */
  confirm?: boolean | string;
  /** Its button and question in red. */
  danger?: boolean;
}

/** An action as the page knows it. */
export interface AdminActionInfo {
  name: string;
  label: string;
  permission: string;
  confirm: boolean | string | null;
  danger: boolean;
}

/** A related list of a model: the objects of another model that point to it through one of its foreign keys. */
export interface AdminRelated {
  /** The name of the relation (the relatedName of the foreign key, else bookSet). */
  name: string;
  model: string;
  label: string;
  /** The foreign key of the other model. */
  field: string;
  attname: string;
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
  /**
   * The jobs of this queue of @xufa/queue (a Queue): their list by status, name and queue, each with its payload,
   * result and error; retry a failed one or every failed one, and delete one that does not run (api/_jobs).
   */
  queue?: { jobs: unknown; counts(): Promise<Record<string, number>>; retry(ids?: unknown[]): Promise<number> };
  /**
   * The schedules of a Scheduler of @xufa/scheduler in Work: each job's next run and last runs, those that start runs of
   * the pipelines (pipelines.schedule()) with their runs, and Run now (_runs.view, _runs.change).
   */
  scheduler?: { jobs(): unknown[]; runNow(name: string): Promise<unknown> };
  /** The report of xufa.health of the app on the first page (true: when the app has it). */
  health?: boolean;
  /**
   * Roles and permissions (an Rbac of @xufa/auth, or its options): the user sees the models it may view
   * (<Model>.view) and adds, changes and deletes them with <Model>.add, .change and .delete, in the tenant chosen; the
   * jobs, runs and health with _jobs.*, _runs.* and _health.view, in every tenant.
   */
  rbac?:
    | AdminRbac
    | {
        roles: Record<string, string[] | { permissions?: string[]; inherits?: string | string[] }>;
        [option: string]: unknown;
      };
  /**
   * The tenants of the models (the Tenants of @xufa/orm): the page chooses one among those of the user (list(): the
   * ids of every tenant, for superusers and grants in every tenant), and the models are those of the tenant chosen.
   */
  tenants?: {
    tenants: { enter(id: string): Promise<unknown> };
    list(request: any): Array<string | number> | Promise<Array<string | number>>;
    /** The name shown of a tenant (its id). */
    label?(id: string, request: any): string | Promise<string>;
  };
  /**
   * The language of the page for every request (null: request.locale of @xufa/i18n, else the Accept-Language). It has
   * es, fr, de, pt and it; English otherwise.
   */
  language?: string | null;
  /**
   * Texts of the page by language and by their English: they go over those of the admin, or add a language
   * ({ ca: { Save: 'Desa' } }).
   */
  uiMessages?: Record<string, Record<string, string>>;
}

/** What the admin asks of an Rbac of @xufa/auth. */
export interface AdminRbac {
  access(user: any): Promise<{ superuser: boolean; grants: Array<{ role: string; tenant: string }> }>;
  allows(access: any, permission: string | string[], tenant?: string | null): boolean;
  tenantsIn(access: any): string[];
  inTenant(access: any, tenant: string): boolean;
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
  /** Its related lists (in /api/models: of the models the user may view). */
  related: AdminRelated[];
  /** Its actions (in /api/models: those the user may run). */
  actions: AdminActionInfo[];
  /** What the user may do with it (in /api/models: with rbac, by its permissions). */
  can?: { add: boolean; change: boolean; delete: boolean };
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

/** The messages of the API that users read, by key, in English (those of logins are of @xufa/auth). */
export declare const ADMIN_MESSAGES: Readonly<Record<string, string>>;
/** The message of a key with its parameters, translated (admin.<key>) when a translator is set. */
export declare function adminMessage(key: string, params?: Record<string, unknown>): string;
/** The translator of the messages (as i18n.translateAdmin(admin) of @xufa/i18n sets), or null. */
export declare function setTranslator(
  fn: ((key: string, params: Record<string, unknown>, english: string) => string) | null
): void;

/** An error of the admin: wrong options, or a request it refuses. */
export declare class AdminError extends Error {
  statusCode: number;
}

/** The login of the admin: the options of the login of @xufa/auth, and who may use the admin. */
export interface AdminLogin<User = any> {
  /**
   * A model of users (AbstractUser of @xufa/auth): found by username, read again, the active staff allowed, passwords,
   * authenticator apps and recovery codes (when it has totpSecret and recoveryCodes) and lastLogin; the options given
   * go over those.
   */
  model?: any;
  /** The user of a username (an email...), or null. */
  findUser?(username: string, request: any): User | null | undefined | Promise<User | null | undefined>;
  /** After each login (a model sets its lastLogin). */
  onLogin?: (user: User, request: any) => unknown;
  /** Its hash of @xufa/auth (user.password). */
  password?: (user: User) => string | null | undefined;
  /** Who may use the admin (everyone found). Others get the answer of a wrong password. */
  allow?: (user: User) => boolean | Promise<boolean>;
  /**
   * The user of an id again, in every request (its id as kept at the login: user.pk). One that is not there (null), or
   * that allow() refuses now, is logged out at once. Without it, the user logged in stays so until it logs out or its
   * session ends.
   */
  reload?: (id: any, request: any) => User | null | undefined | Promise<User | null | undefined>;
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
  /**
   * The account page (with reload): a new password (its hash, made with passwordOptions) to keep. The current one is
   * asked for; the other sessions of the user end.
   */
  setPassword?: (user: User, hash: string, request: any) => unknown;
  /** The shortest new password (10). */
  minPasswordLength?: number;
  /** The account page: the secret of an authenticator app the user set up (its first code checked), or null to remove it. */
  setTotp?: (user: User, secret: string | null, request: any) => unknown;
  /** The hashes of the recovery codes of the user (each logs in once in place of a code of the app). */
  recoveryCodes?: (user: User) => string[] | null | undefined | Promise<string[] | null | undefined>;
  /** The hashes to keep (fewer after one is used, new ones, or [] when the app is removed). With recoveryCodes. */
  setRecoveryCodes?: (user: User, hashes: string[], request: any) => unknown;
}
