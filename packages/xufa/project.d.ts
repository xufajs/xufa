// xufa/project: a project from its file (xufa.yaml, .yml, .json or .js), as Django's settings.py and urls.py.
import type { Apps, AppOptions, App } from './apps.js';

/** The file of a project (xufa.yaml): names and values; the environment goes over them. */
export interface ProjectConfig {
  /** Its name: in the titles of the admin and the emails (the name of its folder). */
  name?: string;
  /**
   * Its apps (INSTALLED_APPS): names of folders (models.js, urls.yaml with the views of views.js, admin.js, templates/,
   * static/), those others depend on first.
   */
  apps?: Array<string | (Partial<AppOptions> & { name: string }) | App>;
  /** DEBUG (true unless NODE_ENV is production): the pages of xufa.devErrors. */
  debug?: boolean;
  /** SECRET_KEY: signs sessions and links (needed without debug). */
  secretKey?: string;
  /** SITE_URL: the address of the site, in the links of emails. */
  siteUrl?: string;
  /** PORT (8000) and HOST (127.0.0.1) of xufa start. */
  server?: { port?: number; host?: string };
  /** DATABASE_URL (sqlite:data/app.db, in the folder of the project), and options of Database.fromUrl (audit...). */
  database?: { url?: string; [option: string]: unknown };
  /** Options of the sessions of @xufa/session (false: none). */
  sessions?: false | Record<string, unknown>;
  /** Options of the templates of @xufa/template (templates/ of the project and of its apps). */
  templates?: Record<string, unknown>;
  /** Options of xufa.staticFiles (static/ of the project and of its apps, at /static/; false: none). */
  static?: false | Record<string, unknown>;
  /** The emails: EMAIL_URL (console:), from, and options of the Mailer of @xufa/mail. */
  mail?: { url?: string; from?: string; [option: string]: unknown };
  /**
   * Accounts of @xufa/auth: user (the model of users, app.Model), pages (the prefix of django.contrib.auth.urls), and
   * any option of accounts (loginBy, messages, mails as data...).
   */
  auth?: { user?: string; pages?: string | { prefix: string; [option: string]: unknown }; [option: string]: unknown };
  /** An Rbac of @xufa/auth: groups (the model of the groups of the database), roles and its other options. */
  rbac?: { groups?: string; roles?: Record<string, unknown>; [option: string]: unknown };
  /** The admin (true, or its options: prefix /admin, title "<name> administration"...). */
  admin?: boolean | Record<string, unknown>;
  /**
   * The designer of the models (the admin's data model page): files (models.yaml and migration files; the default in
   * development), database (versions in the project's database, in production too), or false.
   */
  designer?: 'files' | 'database' | false | { store?: 'files' | 'database' | false; poll?: number | string };
  /**
   * The defaults of the views of @xufa/views (app.viewDefaults): baseTemplate (the template their built-in ones
   * extend, 'base') and paginateBy; false: no built-in templates either.
   */
  views?: false | { baseTemplate?: string; paginateBy?: number | null };
  /**
   * Jobs of @xufa/queue in the database (db.queue, app.queue, in the admin): true, or the options of the Queue, and
   * work (its workers in this process: true by default, false, or their options). The jobs are the exports of the
   * jobs.js of each app: functions, or { run, ...options of define }.
   */
  queue?: boolean | { work?: boolean | Record<string, unknown>; [option: string]: unknown };
  /**
   * The Pipelines of the queue (db.pipelines, app.pipelines, their runs in the admin): true, or their options. Blocks:
   * the exports of the blocks.js of each app; pipelines: those of its pipelines.yaml (a list of definitions).
   */
  pipelines?: boolean | Record<string, unknown>;
  /**
   * A database for each tenant, with the models of some apps (the Tenants of the ORM; the tenant to choose in the
   * admin): apps; database (its options, {id} in them that of the tenant: sqlite:data/tenants/{id}.db by default);
   * list (the tenants: names, or a model of the project and its field); labels; resolve (the tenant of a request:
   * subdomain, or user.<field>).
   */
  tenants?: {
    apps: string[];
    database?: { url?: string; [option: string]: unknown };
    list?: string[] | { model: string; field?: string; label?: string };
    labels?: Record<string, string>;
    resolve?: 'subdomain' | `user.${string}`;
  };
  /** Error pages (the templates 400.html, 403.html, 404.html, 500.html found), or false. */
  errorPages?: false | Record<string, unknown>;
  /** Permanent redirects: { '/': 'index' } (a named route or an address). */
  redirects?: Record<string, string>;
  [key: string]: unknown;
}

export interface BuildOptions {
  /** Another database (the tests: sqlite::memory:). */
  databaseUrl?: string;
  /** The database of every tenant ({id} in it the tenant's), over tenants.database. */
  tenantsUrl?: string;
  /** With designer: database, called when a newer version of the models is published (xufa start starts again). */
  onNewModels?: (version: number) => unknown;
  logger?: boolean | Record<string, unknown>;
  /** Apply the migrations when it starts. */
  migrate?: boolean;
  /** Options of scrypt (lighter in tests). */
  passwordOptions?: Record<string, unknown>;
  /** Where console: writes the emails. */
  mailLog?: (text: string) => void;
  /** The workers of the queue in this process (over queue.work of the file; useTestApp: false). */
  work?: boolean | Record<string, unknown>;
}

export interface Project {
  readonly config: ProjectConfig & { server: { port: number; host: string }; database: { url: string } };
  readonly root: string;
  readonly name: string;
  readonly debug: boolean;
  readonly APPS: Apps;
  /** The folder of the migrations of the models of no app (migrations/). */
  readonly MIGRATIONS: string;
  /** Its database, with the models of its apps. */
  database(url?: string): any;
  /** Its app (of @xufa/http), not listening. */
  build(options?: BuildOptions): Promise<any>;
  /** A model of its apps by name, or app.Model. */
  model(ref: string): any;
  /** Its Rbac (of the option rbac), or null. */
  rbac(): any;
  /** Its Tenants (of the option tenants, with list() and label(id)), or null. */
  tenants(): any;
  /** The project that runs and its database (models registered): with designer: database, of the last version. */
  open(databaseUrl?: string): Promise<{ project: Project; db: any; store?: any }>;
  /** The version of the models kept in the database it runs (0: those of the files). */
  readonly version: number;
  /** How its models are designed: files, database, or none (null); poll in ms. */
  readonly designer: { mode: 'files' | 'database' | null; poll: number };
}

/**
 * The project of a folder: its xufa.yaml (or .yml, .json, .js); overrides go over the file and the environment. The
 * modules of its apps (models.js, views.js, admin.js...) are imported first.
 */
export declare function loadProject(
  root?: string,
  options?: {
    overrides?: Record<string, unknown>;
    env?: string;
    environment?: Record<string, string | undefined>;
    /** Specs in place of the models.yaml of some apps ({ app: { Model: { fields } } }). */
    modelSpecs?: Record<string, Record<string, unknown>>;
  }
): Promise<Project>;

/** A project of a configuration already read. */
export declare function createProject(config: ProjectConfig, options?: { root?: string }): Project;

/** The file of the project of a folder, or null. */
export declare function projectFile(root: string): string | null;

/** The address of a named route of the app built last (Django's reverse()). */
export declare function reverse(name: string, ...params: unknown[]): string;

/** The entries of the admin of an app's admin.yaml: its models by name, each alone or with its options. */
export declare function adminOf(
  spec: Record<string, Record<string, unknown> | null> | null,
  models: unknown[] | Record<string, unknown>,
  where: string
): unknown[];

export declare const FILES: string[];
