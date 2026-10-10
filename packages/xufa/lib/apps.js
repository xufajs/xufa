// Apps, as Django's INSTALLED_APPS: a project is made of apps, each a folder with its models (their tables named by
// the app: catalog_book), its routes, its templates, its static files, its migrations and its models in the admin.
//
//   // catalog/app.js (Django's apps.py and the app's part of settings.py)
//   import * as models from './models.js';
//   import views from './views.js';
//   import admin from './admin.js';
//
//   export default defineApp({
//     name: 'catalog',
//     dir: import.meta.dirname,
//     models,                                    // a list or an object of models (or a function that gives them)
//     routes: views,                             // a plugin of @xufa/http (urls.py), under `prefix`
//     admin: admin.models,                       // its entries in the admin (admin.py)
//   });
//
//   // app.js: the project
//   import accounts from './accounts/app.js';
//   import catalog from './catalog/app.js';
//   const apps = new Apps([accounts, catalog]);
//   const db = apps.register(new Database({ url })); // their models
//   app.register(template.plugin, { root: ['templates', ...apps.templates] });
//   app.register(xufa.staticFiles, { root: apps.static, prefix: '/static/' });
//   app.register(apps.plugin);                       // their routes, and ready()
//   await apps.migrate(db);                          // their migrations, app after app
import fs from 'node:fs';
import path from 'node:path';

const NAME = /^[a-z][a-z0-9_]*$/;

// A folder of an app: the one given (relative to the app), or the default when it is there; null otherwise.
function folderOf(dir, given, fallback) {
  if (given === false || given === null) return null;
  if (given) return path.resolve(dir, given);
  const folder = path.join(dir, fallback);
  return fs.existsSync(folder) ? folder : null;
}

class App {
  // name: its label (lower case: catalog); dir: its folder. models: a list or an object of models, or a function
  // that gives them. routes: a plugin of @xufa/http, under prefix (''). admin: its entries in the admin (or a
  // function). templates, static, migrations: its folders (templates, static and migrations of dir by default; false
  // for none). tables: its tables named <name>_<model> (true, as Django's), unless a model gives its own. ready(app):
  // once the app (of @xufa/http) is ready to start (Django's AppConfig.ready).
  constructor(options = {}) {
    const { name, dir } = options;
    if (typeof name !== 'string' || !NAME.test(name)) {
      throw new TypeError(`An app has a name of lower case letters, digits and _ (as catalog): ${name}`);
    }
    if (typeof dir !== 'string' || !dir) throw new TypeError(`The app ${name} has its folder (dir: __dirname)`);
    this.name = name;
    this.label = options.label || name;
    this.dir = path.resolve(dir);
    this.verboseName = options.verboseName || name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
    this.givenModels = options.models || [];
    this.routes = options.routes || null;
    this.prefix = options.prefix || '';
    this.givenAdmin = options.admin || [];
    this.templates = folderOf(this.dir, options.templates, 'templates');
    this.static = folderOf(this.dir, options.static, 'static');
    this.migrations = options.migrations === false ? null : path.resolve(this.dir, options.migrations || 'migrations');
    // Migrations kept in the database ([{ name, operations }]: of the models of the designer, designer: database),
    // after those of the folder.
    this.stored = [];
    this.tables = options.tables !== false;
    this.ready = options.ready || null;
    if (this.routes !== null && typeof this.routes !== 'function') {
      throw new TypeError(`The routes of the app ${name} are a plugin of @xufa/http`);
    }
  }

  // Its models (read once).
  get models() {
    if (!this.loadedModels) {
      const given = typeof this.givenModels === 'function' ? this.givenModels() : this.givenModels;
      const list = Array.isArray(given) ? given : Object.values(given || {});
      this.loadedModels = list.filter(
        (item) => typeof item === 'function' && item.prototype && 'save' in item.prototype
      );
    }
    return this.loadedModels;
  }

  // Its entries in the admin.
  get admin() {
    const given = typeof this.givenAdmin === 'function' ? this.givenAdmin() : this.givenAdmin;
    return [].concat(given || []);
  }

  // The table of a model of it, as Django's db_table: <label>_<model in lower case> (catalog_bookinstance), unless
  // the model gives one.
  tableOf(model) {
    const own = Object.hasOwn(model, 'options') && model.options ? model.options.table : undefined;
    return own || `${this.label}_${model.name.toLowerCase()}`;
  }
}

// A database that has the models (to find their migrations): the one given when it has them all, else one in memory
// with them (models of tenants, which the project's database has not).
function databaseWith(db, models) {
  if (models.every((model) => db.models.get(model.name) === model)) return db;
  const { Database } = db.orm;
  return new Database({ backend: 'memory' }).register(...models);
}

function defineApp(options) {
  return new App(options);
}

class Apps {
  // apps: the apps of the project, those others depend on first (they are migrated in this order). migrations: the
  // folder of the migrations of the models of the database that are of no app (the sessions of @xufa/session, the
  // jobs of @xufa/queue: Django's contrib apps), migrated first, by their names alone (as a project without apps).
  constructor(apps = [], { migrations = null } = {}) {
    this.list = apps.map((item) => (item instanceof App ? item : defineApp(item)));
    this.migrations = migrations ? path.resolve(migrations) : null;
    const names = new Set();
    for (const item of this.list) {
      if (names.has(item.label)) throw new TypeError(`Two apps are named ${item.label}`);
      names.add(item.label);
    }
    const self = this;
    // The plugin of @xufa/http: the routes of each app (under its prefix), and their ready() once the app is ready.
    this.plugin = async function appsPlugin(app) {
      for (const item of self.list) {
        if (item.routes) app.register(item.routes, item.prefix ? { prefix: item.prefix } : {});
      }
      app.addHook('onReady', async function readyApps() {
        for (const item of self.list) if (item.ready) await item.ready(app);
      });
    };
    this.plugin[Symbol.for('skip-override')] = true;
    this.plugin[Symbol.for('fastify.display-name')] = 'apps';
  }

  // An app by its label.
  get(label) {
    const found = this.list.find((item) => item.label === label);
    if (!found) throw new Error(`No app ${label} (${this.list.map((item) => item.label).join(', ')})`);
    return found;
  }

  get models() {
    return this.list.flatMap((item) => item.models);
  }

  // The folders of templates and static files of the apps, in their order.
  get templates() {
    return this.list.map((item) => item.templates).filter(Boolean);
  }

  get static() {
    return this.list.map((item) => item.static).filter(Boolean);
  }

  // The entries of the apps in the admin.
  get admin() {
    return this.list.flatMap((item) => item.admin);
  }

  // The app of a model, or null.
  appOf(model) {
    return this.list.find((item) => item.models.includes(model)) || null;
  }

  // Names the tables of the models of every app by their apps (catalog_book), unless a model gives its own: before
  // they are registered anywhere (the database of the project, or those of tenants).
  nameTables() {
    for (const item of this.list) {
      for (const model of item.models) {
        if (!item.tables) continue;
        const options = Object.hasOwn(model, 'options') && model.options ? model.options : {};
        if (!options.table && !options.abstract) {
          const table = item.tableOf(model);
          Object.defineProperty(model, 'options', {
            value: { ...options, table },
            writable: true,
            configurable: true,
            enumerable: true,
          });
          // Its meta read before (an Rbac of its model made at the load of a module): its table too.
          const { meta } = model;
          if (meta.table !== table) {
            meta.table = table;
            meta.key = meta.schema ? `${meta.schema}.${table}` : table;
          }
        }
      }
    }
  }

  // Registers the models of the apps in a database (their tables named by their apps), but those of the apps of
  // except (the apps of tenants, in their own databases): the database.
  register(db, { except = [] } = {}) {
    this.nameTables();
    db.register(...this.list.filter((item) => !except.includes(item.label)).flatMap((item) => item.models));
    return db;
  }

  // The models of a database of no app (nor tables of the many-to-many of their models).
  othersOf(db) {
    const own = new Set();
    for (const model of this.models) {
      own.add(model);
      for (const field of model.meta.manyToMany || []) if (field.through) own.add(field.through);
    }
    return [...db.models.values()].filter((model) => !own.has(model));
  }

  // What is migrated, in order: { app, dir, label, models(db), extra } (the project's folder first; extra: the
  // migrations of the app kept in the database). except: apps left out (those of tenants, for the project's database).
  steps(labels, except = []) {
    const steps = [];
    if (this.migrations && (!labels || !labels.length || [].concat(labels).includes('project'))) {
      steps.push({
        app: 'project',
        dir: this.migrations,
        label: undefined,
        models: (db) => this.othersOf(db),
        extra: [],
      });
    }
    for (const item of this.selected(labels)) {
      if (except.includes(item.label)) continue;
      if (item.migrations)
        steps.push({
          app: item.label,
          dir: item.migrations,
          label: item.label,
          models: () => item.models,
          extra: item.stored,
        });
    }
    return steps;
  }

  // Django's makemigrations: a migration of the changes of the models of each app (or of those named), in its folder.
  // [{ app, name, file, operations }] of those made.
  async makeMigrations(db, { name, apps } = {}) {
    const made = [];
    for (const step of this.steps(apps)) {
      const models = step.models(db);
      // (Models of an app the database has not, those of tenants: found in a database of their own, in memory.)
      const target = databaseWith(db, models);
      const result = await target.makeMigrations({ dir: step.dir, name, models, extra: step.extra });
      if (result) made.push({ app: step.app, ...result });
    }
    return made;
  }

  // Django's migrate: the migrations of the apps not applied yet, app after app: [{ app, name }] of those applied.
  async migrate(db, { apps, except } = {}) {
    const applied = [];
    for (const step of this.steps(apps, except)) {
      for (const name of await db.migrate({ dir: step.dir, label: step.label, extra: step.extra })) {
        applied.push({ app: step.app, name });
      }
    }
    return applied;
  }

  // Django's showmigrations: [{ app, migrations: [{ name, applied }] }].
  async showMigrations(db, { apps, except } = {}) {
    const shown = [];
    for (const step of this.steps(apps, except)) {
      shown.push({
        app: step.app,
        migrations: await db.showMigrations({ dir: step.dir, label: step.label, extra: step.extra }),
      });
    }
    return shown;
  }

  selected(labels) {
    if (!labels || !labels.length) return this.list;
    return []
      .concat(labels)
      .filter((label) => label !== 'project' || !this.migrations)
      .map((label) => this.get(label));
  }
}

export { App, Apps, defineApp, databaseWith };
