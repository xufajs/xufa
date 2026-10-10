// A project of xufa from one file at its root, xufa.yaml (or .yml, .json, .js): what Django's settings.py and the
// project's urls.py say, as names and values; the app is put together here (sessions, bodies of forms, templates,
// static files, emails, accounts and their pages, roles, the admin, error pages), so the project has only its apps.
//
//   # xufa.yaml
//   name: LocalLibrary
//   apps: [accounts, catalog]                    # folders: models.js, views.js, admin.js, templates/, static/
//   database: { url: "{{ env.DATABASE_URL ?? 'sqlite:data/library.db' }}" }
//   auth: { user: accounts.User, loginBy: username, pages: /accounts }
//   rbac: { groups: accounts.Group, roles: { librarian: ['Book.*'] } }
//   admin: { title: LocalLibrary administration }
//   views: { baseTemplate: base_generic, paginateBy: 10 }   # the defaults of the views of @xufa/views
//   redirects: { /: index }
//   queue: { work: { concurrency: 2 } }          # jobs of @xufa/queue: those of <app>/jobs.js, in the admin
//   pipelines: true                              # blocks of <app>/blocks.js, pipelines of <app>/pipelines.yaml
//   tenants:                                     # a database for each tenant: the models of these apps
//     apps: [catalog]
//     database: { url: 'sqlite:data/tenants/{id}.db' }
//     list: [central, north]                     # or { model: accounts.Branch, field: slug, label: name }
//     resolve: subdomain                         # the tenant of a request: subdomain, or user.<field>
//
//   import { loadProject } from 'xufa/project';
//   const project = await loadProject(import.meta.dirname); // { config, APPS, MIGRATIONS, database(), build(), model() }
//   const app = await project.build({ migrate: true });
//
// The command xufa (start, migrate, seed, shell, test...) loads it by itself: a folder with xufa.yaml is a project.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '@xufa/config';
import { Apps, App, defineApp } from './apps.js';
import { urlsFile, urlsPlugin } from './urls.js';
import { designerOf } from './designer.js';
import { schemaStore } from './schema-store.js';
import { createRequire } from 'node:module';
import * as configModule from '@xufa/config';
import * as ormModule from '@xufa/orm';
import * as sessionModule from '@xufa/session';
import * as authModule from '@xufa/auth';
import * as mailModule from '@xufa/mail';
import httpModule from '@xufa/http';
import * as templateModule from '@xufa/template';
import * as viewsModule from '@xufa/views';
import * as adminModule from '@xufa/admin';
import * as queueModule from '@xufa/queue';

const require = createRequire(import.meta.url);

const FILES = ['xufa.yaml', 'xufa.yml', 'xufa.json', 'xufa.js', 'xufa.cjs'];
const DEV_SECRET = 'xufa-insecure-only-for-development-change-it-in-production';

// What the environment gives (DATABASE_URL, SECRET_KEY, PORT...), as Django's settings read them, and APP__A__B for
// any other key.
const SCHEMA = {
  debug: { type: 'boolean', env: 'DEBUG', default: () => process.env.NODE_ENV !== 'production' },
  secretKey: { type: 'string', env: 'SECRET_KEY', sensitive: true },
  siteUrl: { type: 'string', env: 'SITE_URL' },
  server: {
    port: { type: 'port', env: 'PORT', default: 8000 },
    host: { type: 'string', env: 'HOST', default: '127.0.0.1' },
  },
  database: { url: { type: 'string', env: 'DATABASE_URL', default: 'sqlite:data/app.db' } },
  mail: { url: { type: 'string', env: 'EMAIL_URL', default: 'console:' } },
};

// The file of the project in a folder, or null.
function projectFile(root) {
  return FILES.map((name) => path.join(root, name)).find((file) => fs.existsSync(file)) || null;
}

// The project of a folder (its xufa.yaml...): overrides go over the file and the environment. Async: the files of its
// apps are imported (import(), so a test runner that gives each test file its own copy of the modules gives them the
// same ones as the app's own imports), then the project is put together.
// modelSpecs: { app: spec } in place of the models.yaml of those apps (the designer of the admin tries a draft).
async function loadProject(root = process.cwd(), { overrides, env, environment, modelSpecs } = {}) {
  const dir = path.resolve(root);
  const file = projectFile(dir);
  if (!file) throw new Error(`No project in ${dir} (${FILES.join(', ')})`);
  const config = loadConfig({
    cwd: dir,
    file: path.basename(file),
    envPrefix: 'APP',
    schema: SCHEMA,
    // Texts that are templates of emails and messages, not of the configuration.
    verbatim: ['auth.mails', 'auth.messages', 'mail.templates'],
    overrides,
    env,
    environment,
  });
  await importApps(dir, config.apps || []);
  return createProject(config, { root: dir, modelSpecs });
}

// What a module gives: its default export when it has nothing else (export default defineApp(...)), else its exports
// (export class Book...); a CommonJS module, its module.exports. require() of an ES module adds __esModule to them.
function valueOf(exported) {
  if (exported === null || typeof exported !== 'object' || exported[Symbol.toStringTag] !== 'Module') return exported;
  if (Object.hasOwn(exported, 'module.exports')) return exported['module.exports'];
  const names = Object.keys(exported).filter((key) => key !== '__esModule');
  if (names.length === 1 && names[0] === 'default') return exported.default;
  return Object.fromEntries(names.map((name) => [name, exported[name]]));
}

// The file of a module of a folder (name.js, name.mjs, name.cjs, or a folder name/index.js), or undefined.
function moduleFile(dir, name) {
  return [`${name}.js`, `${name}.mjs`, `${name}.cjs`, path.join(name, 'index.js')]
    .map((candidate) => path.join(dir, candidate))
    .find((file) => fs.existsSync(file));
}

// The modules loadProject() imported, by file.
const imported = new Map();

// The modules of the apps (app, models, views, routes, admin), imported.
async function importApps(root, apps) {
  for (const entry of apps) {
    if (entry instanceof App) continue;
    const dir = path.resolve(root, typeof entry === 'string' ? entry : entry.dir || entry.name);
    for (const name of APP_MODULES) {
      const file = moduleFile(dir, name);
      if (file) imported.set(file, valueOf(await import(pathToFileURL(file).href)));
    }
  }
}

// The module of a file of a folder, or undefined: imported by loadProject(), or required (createProject() of a
// configuration; require() loads ES modules too, without top-level await).
function moduleOf(dir, name) {
  const file = moduleFile(dir, name);
  if (!file) return undefined;
  return imported.has(file) ? imported.get(file) : valueOf(require(file));
}

const exists = (file) => fs.existsSync(file);

const APP_MODULES = ['app', 'models', 'views', 'routes', 'admin', 'jobs', 'blocks'];

const ADMIN_FILES = ['admin.yaml', 'admin.yml', 'admin.json'];
const MODEL_FILES = ['models.yaml', 'models.yml', 'models.json'];

// The models of a module (export class Book..., a list, or { models }).
function modelsIn(found) {
  if (!found) return [];
  if (Array.isArray(found)) return found;
  const values = found.models && typeof found.models === 'object' ? Object.values(found.models) : Object.values(found);
  return values.filter((value) => typeof value === 'function' && value.prototype && 'meta' in value);
}
const PIPELINE_FILES = ['pipelines.yaml', 'pipelines.yml', 'pipelines.json'];

// What an app gives by name ({ name: value }): the exports of its jobs.js or blocks.js, or of an object of them.
function namedOf(found) {
  if (!found || typeof found !== 'object') return {};
  return Object.fromEntries(Object.entries(found).filter(([name]) => name !== 'default'));
}

// A text of options with {id}: that of a tenant ('sqlite:data/tenants/{id}.db').
function withId(value, id) {
  if (typeof value === 'string') return value.split('{id}').join(id);
  if (Array.isArray(value)) return value.map((item) => withId(item, id));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, withId(item, id)]));
  }
  return value;
}

// The entries of the admin of an app's admin.yaml (Django's admin.py as data): its models by name, in order, each with
// the options of @xufa/admin (list, filters, search, fields, fieldsets, inlines, editable...), or none.
//
//   Genre:
//   Author:
//     list: [lastName, firstName]
//     inlines: [{ relation: bookSet, fields: [title, isbn] }]
function adminOf(spec, models, where) {
  if (spec === null || spec === undefined) return [];
  if (typeof spec !== 'object' || Array.isArray(spec))
    throw new TypeError(`${where}: models by name, with their options`);
  const list = Array.isArray(models) ? models : Object.values(models);
  return Object.entries(spec).map(([name, options]) => {
    const model = list.find((item) => typeof item === 'function' && item.name === name);
    if (!model) throw new TypeError(`${where}: the app has no model ${name}`);
    if (options === null || options === undefined) return model;
    if (typeof options !== 'object' || Array.isArray(options)) throw new TypeError(`${where}: ${name} takes options`);
    return Object.keys(options).length ? [model, options] : model;
  });
}

// An app of the project by the name of its folder: its app.js when it has one (defineApp), else its files by
// convention: models.js and models.yaml (models as data, @xufa/orm's modelsFromSpec: their relations name models of
// the app, or of others as app.Model; lookup finds those), urls.yaml (its routes, of the views views.js exports) or views.js (or routes.js) as a plugin
// of @xufa/http, admin.yaml (its models in the admin, by name) or admin.js (a list, or { models }).
function appOf(root, entry, lookup, specs = {}) {
  if (entry instanceof App) return entry;
  const given = typeof entry === 'string' ? { name: entry } : { ...entry };
  const dir = path.resolve(root, given.dir || given.name);
  if (!exists(dir)) throw new Error(`No folder of the app ${given.name}: ${dir}`);
  const own = moduleOf(dir, 'app');
  if (own instanceof App) return own;
  const routesOf = () => {
    const urls = urlsFile(dir);
    if (urls) {
      const { readConfigFile } = configModule;
      return urlsPlugin(readConfigFile(urls), {
        views: moduleOf(dir, 'views') || {},
        label: given.label || given.name,
        where: urls,
      });
    }
    const found = moduleOf(dir, 'views') ?? moduleOf(dir, 'routes');
    if (found === undefined) return null;
    const plugin = typeof found === 'function' ? found : found && (found.routes || found.plugin);
    if (typeof plugin !== 'function') throw new Error(`${dir}: views.js gives a plugin of @xufa/http`);
    return plugin;
  };
  // The models of models.js and models.yaml (or the spec given for the app): made once. Those of the spec are the
  // designer's (design: its file, spec and models).
  const label = given.label || given.name;
  const found = MODEL_FILES.map((name) => path.join(dir, name)).find(exists);
  const design = { file: found || path.join(dir, 'models.yaml'), spec: {}, models: [] };
  let models;
  const modelsOf = () => {
    if (models) return models;
    const coded = modelsIn(moduleOf(dir, 'models'));
    const draft = Object.hasOwn(specs, label) ? specs[label] || {} : undefined;
    if (!found && draft === undefined) {
      models = moduleOf(dir, 'models') || [];
      return models;
    }
    const { readConfigFile } = configModule;
    const { modelsFromSpec } = ormModule;
    design.spec = draft !== undefined ? draft : readConfigFile(found) || {};
    const resolve = (ref) => coded.find((model) => model.name === ref) || (lookup ? lookup(ref) : undefined);
    design.models = modelsFromSpec(design.spec, {
      Model: ormModule.Model,
      resolve,
      where: path.relative(root, design.file).split(path.sep).join('/'),
    });
    models = [...coded, ...design.models];
    return models;
  };
  const made = defineApp({
    ...given,
    dir,
    models: modelsOf,
    routes: given.routes !== undefined ? given.routes : routesOf(),
    admin: () => {
      const found = moduleOf(dir, 'admin');
      if (found !== undefined) return Array.isArray(found) ? found : (found && found.models) || [];
      const file = ADMIN_FILES.map((name) => path.join(dir, name)).find(exists);
      if (!file) return [];
      const { readConfigFile } = configModule;
      return adminOf(readConfigFile(file), modelsOf(), file);
    },
  });
  // What the designer of the admin edits (read once the models are): the file of the app's models as data, its spec
  // and the models made of it.
  made.design = {
    file: design.file,
    get spec() {
      modelsOf();
      return design.spec;
    },
    get models() {
      modelsOf();
      return design.models;
    },
  };
  return made;
}

let current = null;

// The address of a named route of the app built last (Django's reverse(), for the code that has not the app at hand:
// the absoluteUrl of models).
function reverse(name, ...params) {
  if (!current) throw new Error(`reverse(${name}): no app built yet`);
  return current.reverse(name, params.length === 1 && typeof params[0] === 'object' ? params[0] : params);
}

// Models whose page is a named route <model>-detail (that of crud) get absoluteUrl, when they have none of their own
// (Django's get_absolute_url, without writing it).
const LINKED = Symbol('xufa.absoluteUrl');
function linkModels(app, models) {
  const names = app.routeNames();
  for (const model of models) {
    const name = `${model.name.toLowerCase()}-detail`;
    if (!Object.hasOwn(names, name)) continue;
    const own = Object.getOwnPropertyDescriptor(model.prototype, 'absoluteUrl');
    if (own && !own.get?.[LINKED]) continue;
    if (!own && ('absoluteUrl' in model.prototype || 'getAbsoluteUrl' in model.prototype)) continue;
    const get = function absoluteUrl() {
      return reverse(name, { pk: this.pk });
    };
    get[LINKED] = true;
    Object.defineProperty(model.prototype, 'absoluteUrl', { configurable: true, enumerable: false, get });
  }
}

// The designer of the models (designer in xufa.yaml): 'files' (models.yaml and migration files; the default in
// development), 'database' (versions in the project's database, in production too; poll: how often a process looks
// for a newer one, 5s) or false. { mode, poll } (ms).
function designerOptions(given, debug) {
  const value = given && typeof given === 'object' ? given : { store: given };
  const mode = value.store === undefined ? (debug ? 'files' : null) : value.store || null;
  if (mode !== null && mode !== 'files' && mode !== 'database') {
    throw new Error(`designer: files, database or false (not ${mode})`);
  }
  const poll = value.poll === undefined ? 5000 : durationMs(value.poll);
  return { mode, poll };
}

// Milliseconds of a number or of a text as 500ms, 5s, 2m.
function durationMs(value) {
  if (typeof value === 'number') return value;
  const found = /^(\d+(?:\.\d+)?)\s*(ms|s|m)?$/.exec(String(value).trim());
  if (!found) throw new Error(`A duration as 5s or 500ms (not ${value})`);
  return Number(found[1]) * { ms: 1, s: 1000, m: 60000 }[found[2] || 'ms'];
}

// version: the version of the models kept in the database that the project runs ({ version, apps, migrations }), or
// null (those of the files).
function createProject(config, { root = process.cwd(), modelSpecs = {}, version = null } = {}) {
  const dir = path.resolve(root);
  const MIGRATIONS = path.join(dir, 'migrations');
  const APPS = new Apps(
    (config.apps || []).map((entry) =>
      appOf(
        dir,
        entry,
        (ref) => {
          // (A model of another app, as accounts.User or by its name alone; none: the spec says so.)
          try {
            return model(ref);
          } catch {
            return undefined;
          }
        },
        modelSpecs
      )
    ),
    { migrations: MIGRATIONS }
  );
  // The migrations of the version kept in the database, after those of each app's folder.
  if (version) for (const item of APPS.list) item.stored = (version.migrations || {})[item.label] || [];
  const name = config.name || path.basename(dir);
  const debug = config.debug !== undefined ? config.debug : process.env.NODE_ENV !== 'production';
  const designing = designerOptions(config.designer, debug);
  // The apps of tenants: their tables are in each tenant's database, not in the project's.
  const tenantApps = config.tenants && Array.isArray(config.tenants.apps) ? config.tenants.apps.map(String) : [];

  // A model by its name, or app.Model (accounts.User).
  function model(ref) {
    if (typeof ref === 'function') return ref;
    const [label, modelName] = ref.includes('.') ? ref.split('.') : [null, ref];
    const pool = label ? APPS.get(label).models : APPS.models;
    const found = pool.find((item) => item.name === modelName);
    if (!found) throw new Error(`No model ${ref} in the apps of the project`);
    return found;
  }

  const secretKey = () => {
    if (config.secretKey) return config.secretKey;
    if (debug) return DEV_SECRET;
    throw new Error('The project needs secretKey (SECRET_KEY) when debug is off');
  };

  // The database of database.url (SQLite in the folder of the project wherever the process starts), with the models
  // of the apps, and the sessions.
  const urlOf = (given) => {
    if (!given.startsWith('sqlite:') || given.includes(':memory:')) return given;
    const file = path.resolve(dir, given.replace(/^sqlite:(\/\/)?/, ''));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    return `sqlite:${file}`;
  };

  // The database of database.url (SQLite in the folder of the project wherever the process starts), with the models
  // of the apps, the sessions, and the queue (db.queue) and pipelines (db.pipelines) of the project.
  function database(url, given) {
    const orm = ormModule;
    const { url: configured, ...options } = config.database || {};
    const db = given || orm.Database.fromUrl(urlOf(url || configured), options);
    APPS.register(db, { except: tenantApps });
    // sessions: { asyncCommit: true }: their writes do not wait for the disk (PostgreSQL; see @xufa/session's ormStore).
    if (config.sessions !== false) {
      const { asyncCommit = false } = config.sessions || {};
      db.sessions = sessionModule.ormStore(db, { asyncCommit });
    }
    if (config.queue || config.pipelines) workOf(db);
    return db;
  }

  // queue: true or the options of the Queue of @xufa/queue (and work: its workers in this process, true by default,
  // or their options); the jobs of the apps are the exports of their jobs.js: functions, or { run, ...options of
  // define } (attempts, timeout, backoff...). pipelines: the Pipelines of the queue, with the blocks of the apps
  // (blocks.js: functions, or { run, ...options of block }) and their pipelines (pipelines.yaml: a list of them).
  function workOf(db) {
    const { Queue, Pipelines } = queueModule;
    const { work, ...options } = config.queue && config.queue !== true ? config.queue : {};
    const queue = new Queue(db, options);
    for (const item of APPS.list) {
      for (const [jobName, job] of Object.entries(namedOf(moduleOf(item.dir, 'jobs')))) {
        if (typeof job === 'function') queue.define(jobName, job);
        else if (job && typeof job.run === 'function') {
          const { run, ...jobOptions } = job;
          queue.define(jobName, run, jobOptions);
        } else throw new Error(`${item.dir}: jobs.js gives functions, or { run, ...options } (${jobName})`);
      }
    }
    db.queue = queue;
    if (config.pipelines) {
      const pipelines = new Pipelines(queue, config.pipelines === true ? {} : config.pipelines);
      for (const item of APPS.list) {
        for (const [blockName, block] of Object.entries(namedOf(moduleOf(item.dir, 'blocks')))) {
          pipelines.block(blockName, block);
        }
      }
      for (const item of APPS.list) {
        const file = PIPELINE_FILES.map((one) => path.join(item.dir, one)).find(exists);
        if (!file) continue;
        const { readConfigFile } = configModule;
        const read = readConfigFile(file);
        const list = Array.isArray(read) ? read : (read && read.pipelines) || [];
        for (const definition of list) pipelines.define(definition);
      }
      db.pipelines = pipelines;
    }
    return db;
  }

  // tenants: a database for each tenant (the Tenants of the ORM), with the models of its apps; database: its
  // options, {id} in them the tenant's; list: the tenants (names, or { model, field, label } of a model of the
  // project); labels: { id: label }. Each tenant's database is made the first time it is used, with the migrations of
  // its apps (or synced, when they have none).
  let tenants;
  // The url of every tenant's database instead of tenants.database (build's tenantsUrl; the tests: sqlite::memory:).
  let tenantsUrl;
  function tenantsOf() {
    if (tenants !== undefined) return tenants;
    if (!config.tenants) {
      tenants = null;
      return tenants;
    }
    const orm = ormModule;
    const { apps: labels, database: options = { url: 'sqlite:data/tenants/{id}.db' }, list } = config.tenants;
    if (!labels || !labels.length) throw new Error('tenants.apps: the apps whose models each tenant has');
    const chosen = APPS.selected(labels);
    // (Migrations of files, or kept in the database: those of the designer.)
    const migrated = chosen.some((item) => (item.migrations && exists(item.migrations)) || item.stored.length > 0);
    const ids = async () => {
      if (Array.isArray(list)) return list.map(String);
      if (list && list.model) {
        return (await model(list.model).objects.valuesList(list.field || 'pk', { flat: true })).map(String);
      }
      return [];
    };
    // (Their tables named as the project's are, though the project's database does not register them.)
    APPS.nameTables();
    tenants = new orm.Tenants({
      models: chosen.flatMap((item) => item.models),
      config: async (id) => {
        if (list && !(await ids()).includes(String(id))) return null;
        const { url, ...rest } = tenantsUrl ? { url: tenantsUrl } : withId(options, id);
        return url ? { ...orm.Database.optionsFromUrl(urlOf(url)), ...rest } : rest;
      },
      setup: (tenantDb) => (migrated ? APPS.migrate(tenantDb, { apps: labels }) : tenantDb.sync()),
    });
    tenants.list = ids;
    tenants.label = async (id) => {
      if (config.tenants.labels && config.tenants.labels[id]) return config.tenants.labels[id];
      if (list && list.model && list.label) {
        const found = await model(list.model)
          .objects.filter({ [list.field || 'pk']: id })
          .first();
        return found ? String(found[list.label]) : id;
      }
      return id;
    };
    return tenants;
  }

  // The tenant of a request: subdomain (acme.example.com), or user.<field> (that of its user).
  function resolverOf(resolve) {
    if (resolve === 'subdomain') {
      return (request) => {
        const host = String(request.hostname || '').split(':')[0];
        const parts = host.split('.');
        return parts.length > 2 || (parts.length === 2 && parts[1] === 'localhost') ? parts[0] : undefined;
      };
    }
    const field = /^user\.(\w+)$/.exec(resolve || '');
    if (field) return (request) => (request.user ? request.user[field[1]] : undefined);
    throw new Error(`tenants.resolve: subdomain or user.<field> (not ${resolve})`);
  }

  // The roles (an Rbac of @xufa/auth): groups is the model of the groups of the database.
  let rbac;
  function rbacOf() {
    if (rbac === undefined) {
      if (!config.rbac) rbac = null;
      else {
        const { Rbac } = authModule;
        const { groups, ...options } = config.rbac;
        rbac = new Rbac({ ...options, ...(groups ? { model: model(groups) } : {}) });
      }
    }
    return rbac;
  }

  // The emails (mail.url: console: writes them; smtp://... sends them). write: where console: writes them.
  function mailerOf(write) {
    const orm = ormModule;
    const { Mailer, mailFields } = mailModule;
    const { url, from, ...options } = config.mail || {};
    class Email extends orm.Model {
      static fields = mailFields(orm.fields);
    }
    const db = orm.Database.fromUrl(url, { ...(from ? { from } : {}), ...(write ? { write } : {}) });
    db.register(Email);
    const mailer = new Mailer({ model: Email, app: { name, url: config.siteUrl }, ...options });
    return Object.assign(mailer, { Email, database: db });
  }

  // Folders of the project and of its apps.
  const own = (folder) => (exists(path.join(dir, folder)) ? [path.join(dir, folder)] : []);

  // The project that runs and its database, its models registered (not connected): this one, or, with designer:
  // database, that of the last version of the models there (the command line migrates with it). { project, db }.
  async function open(databaseUrl) {
    if (designing.mode !== 'database') return { project, db: database(databaseUrl) };
    const orm = ormModule;
    const { url: configured, ...dbOptions } = config.database || {};
    const bare = orm.Database.fromUrl(urlOf(databaseUrl || configured), dbOptions);
    const store = schemaStore(bare);
    await bare.connect();
    await store.sync();
    const last = await store.latest();
    const target = last ? createProject(config, { root: dir, modelSpecs: last.apps, version: last }) : project;
    return { project: target, db: target.database(databaseUrl, bare), store };
  }

  // The app (of @xufa/http), not listening. databaseUrl: another database (the tests: sqlite::memory:); migrate:
  // apply the migrations when it starts; passwordOptions: of scrypt (lighter in tests); mailLog: where console:
  // writes the emails; logger; work: the workers of the queue in this process (over queue.work; useTestApp: false);
  // tenantsUrl: the database of every tenant ({id} in it the tenant's), over tenants.database. onNewModels(version):
  // with designer: database, called when a newer version of the models is published (xufa start ends the process,
  // and starts it again with them); by default it is logged.
  //
  // With designer: database, the models are those of the last version in the database: the project is made again
  // with them before the app (its models are never registered twice).
  async function build(options = {}) {
    const {
      databaseUrl,
      logger = true,
      migrate = false,
      passwordOptions,
      mailLog,
      work,
      tenantsUrl: given,
      onNewModels,
      $db,
      $store,
    } = options;
    const xufa = httpModule;
    const orm = ormModule;
    if (designing.mode === 'database' && !$store) {
      const opened = await open(databaseUrl);
      // (Its database, with the models of the version registered, is given as it is.)
      return opened.project.build({ ...options, $db: opened.db, $store: opened.store });
    }
    if (given !== undefined) tenantsUrl = given;
    // (Given by open(): the models of the version registered there already.)
    const db = $db || database(databaseUrl);
    const app = xufa({ logger });
    current = app;
    app.decorate('project', project);
    if (debug) app.register(xufa.devErrors);
    app.register(xufa.formBody);
    const projectTenants = tenantsOf();
    // (Opened again if the tenants are used after.)
    if (projectTenants) app.addHook('onClose', () => projectTenants.close());
    app.register(orm.plugin, {
      database: db,
      migrate: migrate ? (given) => APPS.migrate(given, { except: tenantApps }) : undefined,
      // The tenant of each request, when the project says how (resolve); else only the admin chooses one.
      ...(projectTenants && config.tenants.resolve
        ? {
            tenants: {
              tenants: projectTenants,
              resolve: resolverOf(config.tenants.resolve),
              required: false,
              authorize: false,
            },
          }
        : {}),
    });
    if (db.queue) {
      const { queuePlugin } = queueModule;
      const configured = config.queue && config.queue !== true ? config.queue.work : undefined;
      const workers = work !== undefined ? work : configured !== undefined ? configured : true;
      app.register(queuePlugin, { queue: db.queue, ...(workers ? { work: workers } : {}) });
      if (db.pipelines) app.decorate('pipelines', db.pipelines);
    }
    if (config.sessions !== false) {
      const { sessionPlugin } = sessionModule;
      const { asyncCommit, ...sessionOptions } = config.sessions || {};
      app.register(sessionPlugin, { secret: secretKey(), store: db.sessions, csrf: true, ...sessionOptions });
    }
    const templates = [...own('templates'), ...APPS.templates];
    if (templates.length) {
      const template = templateModule;
      // The built-in templates of the views go last: an app's own of the same name wins.
      const builtIn = config.views === false ? [] : [viewsModule.templates];
      app.register(template.plugin, { root: [...templates, ...builtIn], ...(config.templates || {}) });
    }
    if (config.views !== false) {
      const views = viewsModule;
      app.register(views.plugin, config.views || {});
    }

    const auth = config.auth ? authModule : null;
    let mailer = null;
    if (config.mail || auth) {
      mailer = mailerOf(mailLog);
      app.decorate('mailer', mailer);
      app.addHook('onClose', () => mailer.database.close());
    }
    const { user, pages, ...accounts } = config.auth || {};
    const pagesPrefix = typeof pages === 'string' ? pages : pages && pages.prefix;
    if (auth) {
      app.register(auth.accounts, {
        secret: secretKey(),
        ...(user ? { model: model(user) } : {}),
        passwordOptions,
        mailer,
        app: { name },
        ...(pagesPrefix ? { loginUrl: `${pagesPrefix}/login/` } : {}),
        ...(rbacOf() ? { rbac: rbacOf() } : {}),
        ...accounts,
      });
    }

    const statics = [...own('static'), ...APPS.static];
    if (statics.length && config.static !== false) {
      app.register(xufa.staticFiles, { root: statics, prefix: '/static/', ...(config.static || {}) });
    }
    app.register(APPS.plugin);
    app.addHook('onReady', async () => linkModels(app, APPS.models));
    if (auth && pages) {
      const { prefix, ...options } = typeof pages === 'string' ? { prefix: pages } : pages;
      // The templates of registration/ (login.html...) when the project has them; else the pages of @xufa/auth.
      const views = templates.some((folder) => exists(path.join(folder, 'registration'))) ? 'registration' : undefined;
      app.register(auth.pages, { prefix, ...(views ? { views } : {}), siteUrl: config.siteUrl, ...options });
    }
    // handler404, 403, 500: the templates 404.html, 403.html, 500.html the project has (or errorPages: { views }).
    if (config.errorPages !== false) {
      const views =
        config.errorPages && config.errorPages.views
          ? config.errorPages.views
          : Object.fromEntries(
              ['400', '403', '404', '500']
                .filter((status) => templates.some((folder) => exists(path.join(folder, `${status}.html`))))
                .map((status) => [status, status])
            );
      if (Object.keys(views).length) app.register(xufa.errorPages, { ...(config.errorPages || {}), views });
    }
    // Redirects: { '/': 'index' } (a named route, or an address), permanent.
    for (const [from, to] of Object.entries(config.redirects || {})) {
      app.get(from, async (request, reply) => reply.redirect(to.startsWith('/') ? to : app.reverse(to), 301));
    }
    // The designer of the models (the admin's data model page edits them), and, with versions in the database, a look
    // for a newer one every designer.poll.
    const designer = designing.mode ? designerOf(project, { db: $store ? db : null, store: $store || null }) : null;
    if ($store) {
      const timer = setInterval(async () => {
        let latest;
        try {
          latest = await $store.version();
        } catch {
          return;
        }
        if (latest <= project.version) return;
        clearInterval(timer);
        designer.notice(latest);
        if (onNewModels) await onNewModels(latest);
        else app.log.warn(`The models have a new version (${latest}): start the server again to run it`);
      }, designing.poll);
      timer.unref();
      app.addHook('onClose', async () => clearInterval(timer));
    }
    if (config.admin) {
      const { admin } = adminModule;
      app.register(admin, {
        prefix: '/admin',
        title: `${name} administration`,
        models: APPS.admin,
        // The data model page: the app of each model; in development, its designer (the models of models.yaml).
        appOf: (one) => {
          const found = APPS.appOf(one);
          return found ? found.label : null;
        },
        // (Every model of the apps: those the admin does not list too.)
        schema: { models: () => APPS.models },
        ...(designer ? { designer } : {}),
        ...(user ? { login: { model: model(user), passwordOptions } } : {}),
        ...(rbacOf() ? { rbac: rbacOf() } : {}),
        ...(db.queue ? { queue: db.queue } : {}),
        ...(db.pipelines ? { pipelines: db.pipelines } : {}),
        ...(projectTenants
          ? { tenants: { tenants: projectTenants, list: projectTenants.list, label: projectTenants.label } }
          : {}),
        ...(config.admin === true ? {} : config.admin),
      });
    }
    return app;
  }

  const project = {
    config,
    root: dir,
    name,
    debug,
    APPS,
    MIGRATIONS,
    database,
    open,
    build,
    model,
    rbac: rbacOf,
    tenants: tenantsOf,
    // The version of the models kept in the database it runs (0: those of the files), and how they are designed.
    version: version ? version.version : 0,
    // The apps of tenants (in each tenant's database, not in the project's).
    tenantApps,
    designer: designing,
  };
  return project;
}

export { loadProject, createProject, projectFile, reverse, adminOf, valueOf, FILES };
