// xufa/apps: the apps of a project, as Django's INSTALLED_APPS.

/** The options of an app (Django's AppConfig, and its folders). */
export interface AppOptions {
  /** Its label: lower case letters, digits and _ (catalog). Its tables are <name>_<model>. */
  name: string;
  /** Its folder (__dirname of its app.js). */
  dir: string;
  /** Another label (the name by default). */
  label?: string;
  /** Its name for people (Catalog). */
  verboseName?: string;
  /** Its models: a list, an object of them (a module), or a function that gives them. */
  models?: unknown[] | Record<string, unknown> | (() => unknown[] | Record<string, unknown>);
  /** Its routes: a plugin of @xufa/http (urls.py), under prefix. */
  routes?: ((app: any, options: any) => unknown) | null;
  /** Where its routes go (''). */
  prefix?: string;
  /** Its entries in the admin (admin.py), or a function that gives them. */
  admin?: unknown[] | (() => unknown[]);
  /** Its folders of templates, static files and migrations (templates, static, migrations; false for none). */
  templates?: string | false;
  static?: string | false;
  migrations?: string | false;
  /** Its tables named <name>_<model> (true), unless a model gives its own table. */
  tables?: boolean;
  /** Once the app of @xufa/http is ready (Django's AppConfig.ready). */
  ready?: (app: any) => unknown;
}

export declare class App {
  constructor(options: AppOptions);
  readonly name: string;
  readonly label: string;
  readonly dir: string;
  readonly verboseName: string;
  readonly prefix: string;
  readonly templates: string | null;
  readonly static: string | null;
  readonly migrations: string | null;
  readonly models: any[];
  readonly admin: unknown[];
  /** The table of a model of it: <label>_<model in lower case>, unless the model gives one. */
  tableOf(model: { name: string }): string;
}

/** An app of a project (Django's apps.py). */
export declare function defineApp(options: AppOptions): App;

/** The apps of a project (Django's INSTALLED_APPS), those others depend on first. */
export declare class Apps {
  /**
   * migrations: the folder of the migrations of the models of no app (sessions, jobs: Django's contrib apps),
   * migrated first, by their names alone.
   */
  constructor(apps: Array<App | AppOptions>, options?: { migrations?: string | null });
  readonly migrations: string | null;
  readonly list: App[];
  get(label: string): App;
  appOf(model: unknown): App | null;
  /** Their models, templates folders, static folders and admin entries, in their order. */
  readonly models: any[];
  readonly templates: string[];
  readonly static: string[];
  readonly admin: unknown[];
  /** Registers their models in a database (their tables named by their apps). */
  register<D extends { register(...models: any[]): unknown }>(db: D): D;
  /** The plugin of @xufa/http: their routes (under their prefixes), and their ready(). */
  readonly plugin: (app: any) => Promise<void>;
  makeMigrations(
    db: any,
    options?: { name?: string; apps?: string | string[] }
  ): Promise<Array<{ app: string; name: string; file: string; operations: unknown[] }>>;
  migrate(db: any, options?: { apps?: string | string[] }): Promise<Array<{ app: string; name: string }>>;
  showMigrations(
    db: any,
    options?: { apps?: string | string[] }
  ): Promise<Array<{ app: string; migrations: Array<{ name: string; applied: boolean }> }>>;
}
