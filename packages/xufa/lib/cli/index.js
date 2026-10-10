// The commands of xufa (bin/xufa.js). An app is a folder with app.js (xufa new makes one): build() gives the app,
// database() its database with the models, jobs(db) its queue, MIGRATIONS the folder of its migrations.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { files } from './templates.js';
import { projectFiles, appFiles, withApp } from './project-templates.js';
import { modelFile, resourceFile, plural, kebab, pascal } from './generate.js';
import { loadProject, projectFile, valueOf } from '../project.js';
import { yamlOf } from '../designer.js';
import { loadFixtureFile, FIXTURE_EXTENSIONS } from '../fixtures.js';
import { createRequire } from 'node:module';
import * as ormModule from '@xufa/orm';

const require = createRequire(import.meta.url);

const HELP = `xufa: the command line of an app of xufa

  xufa new <folder> [--app home]             a new project (xufa.yaml, templates, its first app, seeds, test)
  xufa new <folder> --api                    a new app of an API (app.js, server.js, models, routes, jobs, migrations)
  xufa startapp <name>                       a new app of the project (models, urls.yaml, views, admin, templates)
  xufa generate model <Name> [field:type...] a model (models/<name>.js) and its migration
  xufa generate resource <Name> [fields...]  a model, its migration and its routes (routes/<names>.js)
  xufa makemigrations [name]                 a migration of the changes of the models (with apps: [app...]
                                             [--name n], one for each app that changed)
  xufa migrate [app...]                      applies the migrations not applied yet (with apps: app after app)
  xufa eject                                 the models kept in the database (designer: database) as files again:
                                             models.yaml and the migrations of each app
  xufa showmigrations [app...]               the migrations, applied or not
  xufa routes                                the routes of the app
  xufa shell                                 a REPL with the app, its database and models (await works)
  xufa start [--port p] [--no-migrate]       the server of a project (xufa.yaml), its migrations applied first
  xufa dev                                   the server, restarted when a file changes
  xufa seed [name...]                        runs the seeds (seeds/*.js, and fixtures *.yaml): data for development
  xufa createsuperuser [--username u]        a superuser of the model of users (AbstractUser of @xufa/auth); the
            [--email e] [--noinput]          password is asked (or XUFA_SUPERUSER_PASSWORD with --noinput)
  xufa work [--concurrency 4] [--queues a,b] workers of the queue
  xufa down [--message m] [--retry 60]       the maintenance mode on: 503 for every request (--secret [path]: a
            [--secret] [--allow ip,ip]       path that lets a browser through; --allow: addresses that go through;
            [--everywhere]                   --everywhere: every machine, in the database, not only this one)
  xufa up [--everywhere]                     the maintenance mode off
  xufa health                                the checks of the health of the app (GET /health)
  xufa test [files...] [--runner node|vyntra]  the tests of the app (NODE_ENV=test): vyntra when the app has it,
                                             else node --test

Fields are name:type[:null][:unique][:index]: string, text, integer, bigint, float, decimal, boolean, date,
datetime, json, uuid, email, references (author:references: a foreign key to Author). The database is
DATABASE_URL (sqlite:data/app.db): postgres://..., mongodb://..., sqlite:..., memory:.`;

const print = (...items) => console.log(...items);

// A line typed by the user (hidden: what is typed is not shown, for passwords).
function prompt(question, hidden = false) {
  const readline = require('node:readline'); // eslint-disable-line global-require
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // eslint-disable-next-line no-underscore-dangle
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(question);
      else if (/[\r\n]/.test(text)) process.stdout.write('\n');
    };
  }
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// The options of the arguments: --name value and --flag, and the rest in order.
function parseArgs(args) {
  const rest = [];
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--no-')) options[arg.slice(5)] = false;
    else if (arg.startsWith('--')) {
      const [name, value] = arg.slice(2).split('=');
      if (value !== undefined) options[name] = value;
      else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
        options[name] = args[i + 1];
        i += 1;
      } else options[name] = true;
    } else rest.push(arg);
  }
  return { rest, options };
}

// The app of the folder (or of a folder above it).
function findRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    if (projectFile(dir)) return dir;
    if (fs.existsSync(path.join(dir, 'app.js')) && fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error('no app here (a folder with xufa.yaml, or app.js and package.json): xufa new <folder> makes one');
    dir = parent;
  }
}

// The project of the folder, or the app of its app.js (xufa new --api), imported (each command runs in a process of
// its own: the modules are those of the files as they are).
async function loadApp(root) {
  process.chdir(root);
  // A project of a file (xufa.yaml): its app is put together by xufa.
  if (projectFile(root)) return loadProject(root);
  const project = valueOf(await import(pathToFileURL(path.join(root, 'app.js')).href));
  if (typeof project.build !== 'function' || typeof project.database !== 'function') {
    throw new Error('app.js gives build() and database() (as the app of xufa new)');
  }
  return { ...project, migrations: project.MIGRATIONS || path.join(root, 'migrations') };
}

// The database of the app, connected, with the model of its jobs.
async function openDatabase(project) {
  const db = project.database();
  if (typeof project.jobs === 'function') project.jobs(db);
  await db.connect();
  return db;
}

// The project that runs and its database, connected: with its models in the database (designer: database), that of
// the last version there; else the one given. [project, db].
async function openProject(given) {
  if (typeof given.open !== 'function' || !given.designer || given.designer.mode !== 'database') {
    return [given, await openDatabase(given)];
  }
  const { project, db } = await given.open();
  await db.connect();
  return [project, db];
}

function writeFiles(root, entries, { force = false } = {}) {
  for (const [name, content] of entries) {
    const file = path.join(root, name);
    if (fs.existsSync(file) && !force)
      throw new Error(`${path.relative(process.cwd(), file)} is there already (--force writes over it)`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    print(`  wrote ${path.relative(process.cwd(), file) || name}`);
  }
}

// The name of an app (a folder, and the prefix of its tables).
const APP_NAME = /^[a-z][a-z0-9_]*$/;

// The file of the maintenance mode of this machine (the plugin xufa.maintenance reads it).
const downFile = (root) => path.join(root, '.xufa', 'down.json');

// models/index.js gives every model of the app: the line of a new model file (export * from './book.js').
function addModelExport(root, file) {
  const index = path.join(root, 'models', 'index.js');
  if (!fs.existsSync(index)) return;
  const text = fs.readFileSync(index, 'utf8');
  const line = `export * from './${file}.js';`;
  if (text.includes(line) || /require\(|module\.exports/.test(text)) return;
  fs.writeFileSync(index, `${text.replace(/^export \{\};\r?\n/m, '').trimEnd()}\n${line}\n`);
  print(`  added ${file} to models/index.js`);
}

// The files whose changes start the server again: those of the project, but its packages, its data (SQLite files,
// uploads under data/), and files of editors and of git.
const QUIET = /(^|[\\/])(node_modules|data|\.git|\.xufa|coverage)([\\/]|$)|\.(db|db-wal|db-shm|db-journal|log|swp)$|~$/;
const WATCHED = /\.(js|mjs|cjs|json|ya?ml|html|css)$/;

// The exit of a server that asks to be started again (a newer version of the models): EX_TEMPFAIL.
const RESTART = 75;

// xufa start of a project with its models in the database: the server, in a process of its own, started again each
// time it ends asking for it (with the code RESTART); signals go to it, and its other ends are this process's.
function supervise(root) {
  return new Promise((resolve) => {
    let child = null;
    const start = () => {
      child = spawn(process.execPath, process.argv.slice(1), {
        cwd: root,
        stdio: 'inherit',
        env: { ...process.env, XUFA_SUPERVISED: '1' },
      });
      child.on('exit', (code) => {
        if (code === RESTART) {
          print('xufa: starting the server again with the new models');
          start();
        } else resolve(code || 0);
      });
    };
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        if (child) child.kill(signal);
      });
    }
    start();
  });
}

// xufa dev of a project: the server (xufa start), started again a moment after the files change (several saves at
// once start it once), and stopped with this process.
function devProject(root) {
  const bin = path.join(import.meta.dirname, '..', '..', 'bin', 'xufa.js');
  let child = null;
  let again = false;
  let stopping = false;
  let timer = null;
  let finish;
  const start = () => {
    // (Its server asks to start again itself too: a newer version of the models in the database.)
    child = spawn(process.execPath, [bin, 'start'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, XUFA_SUPERVISED: '1' },
    });
    child.on('exit', (code) => {
      child = null;
      if (again || code === RESTART) {
        again = false;
        start();
      } else if (!stopping && code !== null && code !== 0) {
        print('xufa dev: the server stopped; it starts again when a file changes');
      }
    });
  };
  const restart = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      print(`xufa dev: ${file} changed, starting again`);
      if (child) {
        again = true;
        child.kill();
      } else start();
    }, 200);
  };
  const watcher = fs.watch(root, { recursive: true }, (event, file) => {
    if (!file || QUIET.test(file) || !WATCHED.test(file)) return;
    restart(file);
  });
  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    watcher.close();
    if (child) child.kill();
    finish(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  start();
  return new Promise((resolve) => {
    finish = resolve;
  });
}

const commands = {
  async new([folder], options) {
    if (!folder) throw new Error('xufa new <folder>');
    const root = path.resolve(folder);
    if (fs.existsSync(root) && fs.readdirSync(root).length && !options.force) {
      throw new Error(`${folder} is not empty (--force writes in it)`);
    }
    const name = kebab(path.basename(root)).replace(/[^a-z0-9-]/g, '') || 'app';
    // --api: the layout of an API (app.js, models/, routes/, jobs/).
    if (options.api) {
      print(`A new app in ${folder}:`);
      writeFiles(root, Object.entries(files(name)), options);
      print(
        `\nNext:\n  cd ${folder}\n  npm install\n  npx xufa generate resource Book title:string pages:integer:null\n  npx xufa migrate\n  npm run dev`
      );
      return 0;
    }
    const app = typeof options.app === 'string' ? options.app : 'home';
    if (!APP_NAME.test(app)) throw new Error(`--app: a name of lower case letters, digits and _ (${app})`);
    print(`A new project in ${folder}:`);
    writeFiles(
      root,
      [...Object.entries(projectFiles(name, app)), ...Object.entries(appFiles(app, { home: true }))],
      options
    );
    print(`\nNext:\n  cd ${folder}\n  npm install\n  npx xufa startapp catalog\n  npx xufa migrate\n  npm run dev`);
    return 0;
  },

  // A new app of the project (Django's startapp): its folder, and its name in the apps of xufa.yaml.
  async startapp([name], options) {
    if (!name || !APP_NAME.test(name)) throw new Error('xufa startapp <name>: lower case letters, digits and _');
    const root = findRoot();
    const file = projectFile(root);
    if (!file) throw new Error('xufa startapp: no xufa.yaml here (xufa new <folder> makes a project)');
    if (fs.existsSync(path.join(root, name))) throw new Error(`${name} is there already`);
    writeFiles(root, Object.entries(appFiles(name)), options);
    const text = fs.readFileSync(file, 'utf8');
    const changed = ['.yaml', '.yml'].includes(path.extname(file)) ? withApp(text, name) : null;
    if (changed === null) print(`Add ${name} to the apps of ${path.basename(file)}.`);
    else if (changed !== text) {
      fs.writeFileSync(file, changed);
      print(`  added ${name} to the apps of ${path.basename(file)}`);
    }
    return 0;
  },

  async generate([kind, name, ...fieldSpecs], options) {
    if (!['model', 'resource'].includes(kind) || !name) {
      throw new Error('xufa generate model|resource <Name> [field:type...]');
    }
    const model = pascal(name);
    const root = findRoot();
    const file = kebab(model);
    const entries = [[`models/${file}.js`, modelFile(model, fieldSpecs, { timestamps: options.timestamps !== false })]];
    if (kind === 'resource') entries.push([`routes/${plural(file)}.js`, resourceFile(model, fieldSpecs)]);
    writeFiles(root, entries, options);
    addModelExport(root, file);
    if (options.migration === false) return;
    // (In a project of apps, the migration of each app that changed.)
    const migration = `create_${file.replace(/-/g, '_')}`;
    const made = (await loadApp(root)).APPS
      ? await commands.makemigrations([], { name: migration })
      : await commands.makemigrations([migration], {});
    if (made === 0) print('Then: xufa migrate');
  },

  async makemigrations(args, options = {}) {
    const [project, db] = await openProject(await loadApp(findRoot()));
    try {
      // A project of apps (APPS of app.js, as INSTALLED_APPS): a migration for each app that changed, in its folder.
      if (project.APPS) {
        // (Apps whose migrations are in the database are changed there: a file would come before them.)
        const kept = project.APPS.list.filter((item) => item.stored.length).map((item) => item.label);
        for (const label of kept) {
          print(`  ${label}: its models are kept in the database (the admin's data model page changes them)`);
        }
        let apps = args;
        if (kept.length) {
          // (The others, and the project's own folder: none named is every one.)
          const all = ['project', ...project.APPS.list.map((item) => item.label)];
          apps = (args.length ? args : all).filter((label) => !kept.includes(label));
          if (!apps.length) return 0;
        }
        const made = await project.APPS.makeMigrations(db, { name: options.name, apps });
        if (!made.length) print('No changes in the models.');
        for (const item of made) {
          const count = `${item.operations.length} operation${item.operations.length === 1 ? '' : 's'}`;
          print(`  ${item.app}: wrote ${path.relative(process.cwd(), item.file)} (${count})`);
        }
        return 0;
      }
      const [name] = args;
      const made = await db.makeMigrations({ dir: project.migrations, name });
      if (!made) print('No changes in the models.');
      else
        print(
          `  wrote ${path.relative(process.cwd(), made.file)} (${made.operations.length} operation${made.operations.length === 1 ? '' : 's'})`
        );
      return 0;
    } finally {
      await db.close();
    }
  },

  async migrate(args = []) {
    const [project, db] = await openProject(await loadApp(findRoot()));
    try {
      if (project.APPS) {
        // (The apps of tenants are migrated in each tenant's database, when it is opened.)
        const except = project.tenantApps || [];
        for (const label of except) print(`  ${label}: migrated in each tenant's database when it is opened`);
        const applied = await project.APPS.migrate(db, { apps: args, except });
        if (applied.length === 0) print('Nothing to apply.');
        for (const { app, name } of applied) print(`  applied ${app}.${name}`);
        return 0;
      }
      const done = await db.migrate({ dir: project.migrations });
      if (done.length === 0) print('Nothing to apply.');
      for (const name of done) print(`  applied ${name}`);
      return 0;
    } finally {
      await db.close();
    }
  },

  // The models kept in the database (designer: database) as files: each app's models.yaml and its migrations (with
  // their names, so the database has them applied already); then a version with none, so every server starts again
  // with the files and no migration is in both places.
  async eject() {
    const given = await loadApp(findRoot());
    if (!given.designer || given.designer.mode !== 'database') {
      throw new Error('xufa eject: the models are not kept in the database (designer: database in xufa.yaml)');
    }
    const { project, db, store } = await given.open();
    await db.connect();
    try {
      const last = await store.latest();
      const labels = last ? [...new Set([...Object.keys(last.apps), ...Object.keys(last.migrations)])] : [];
      const stored = (label) => last.migrations[label] || [];
      if (!labels.some((label) => last.apps[label] || stored(label).length)) {
        print('Nothing to eject: the models are those of the files.');
        return 0;
      }
      // (Nothing is written when a migration would write over a file.)
      const writes = [];
      for (const label of labels) {
        const item = project.APPS.get(label);
        const dir = item.migrations || path.join(item.dir, 'migrations');
        for (const migration of stored(label)) {
          const file = path.join(dir, `${migration.name}.js`);
          if (fs.existsSync(file))
            throw new Error(`xufa eject: ${path.relative(process.cwd(), file)} is there already`);
          writes.push({ dir, migration });
        }
      }
      const { migrations } = ormModule;
      for (const label of labels) {
        if (!last.apps[label]) continue;
        const item = project.APPS.get(label);
        fs.writeFileSync(item.design.file, yamlOf(label, last.apps[label]));
        print(`  wrote ${path.relative(process.cwd(), item.design.file)}`);
      }
      for (const { dir, migration } of writes) {
        const file = migrations.writeMigration(dir, migration.name, migration.operations);
        print(`  wrote ${path.relative(process.cwd(), file)}`);
      }
      const version = await store.add({ after: last.version, apps: {}, migrations: {}, note: 'ejected' });
      print(
        `Version ${version}: the models are those of the files now; every server starts again with them. To design them` +
          ' as files, set designer: files in xufa.yaml (or keep database: the admin publishes over the files).'
      );
      return 0;
    } finally {
      await db.close();
    }
  },

  async showmigrations(args = []) {
    const [project, db] = await openProject(await loadApp(findRoot()));
    try {
      if (project.APPS) {
        const except = project.tenantApps || [];
        for (const label of except) print(`${label} (in each tenant's database)`);
        for (const { app, migrations } of await project.APPS.showMigrations(db, { apps: args, except })) {
          print(app);
          if (migrations.length === 0) print(' (no migrations)');
          for (const { name, applied } of migrations) print(`  [${applied ? 'X' : ' '}] ${name}`);
        }
        return 0;
      }
      const list = await db.showMigrations({ dir: project.migrations });
      if (list.length === 0) print('No migrations.');
      for (const { name, applied } of list) print(`  [${applied ? 'X' : ' '}] ${name}`);
      return 0;
    } finally {
      await db.close();
    }
  },

  async routes() {
    const project = await loadApp(findRoot());
    const app = await project.build({ logger: false });
    await app.ready();
    try {
      print(app.printRoutes({ commonPrefix: false }).trimEnd());
      // The routes by name (Django's show_urls), for reverse().
      const names = typeof app.routeNames === 'function' ? Object.entries(app.routeNames()) : [];
      if (names.length) {
        const width = Math.max(...names.map(([name]) => name.length));
        print('\nNamed routes:');
        for (const [name, route] of names.sort(([a], [b]) => a.localeCompare(b))) {
          print(
            `  ${name.padEnd(width)}  ${route.methods
              .filter((method) => method !== 'HEAD')
              .join(',')
              .padEnd(9)} ${route.url}`
          );
        }
      }
    } finally {
      await app.close();
    }
  },

  async shell() {
    const repl = require('node:repl'); // eslint-disable-line global-require
    const project = await loadApp(findRoot());
    const app = await project.build({ logger: false });
    await app.ready();
    const orm = ormModule;
    const context = { app, db: app.db, queue: app.queue, orm, Q: orm.Q, F: orm.F, Count: orm.Count, Sum: orm.Sum };
    for (const [name, model] of app.db.models) context[name] = model;
    print(
      `xufa shell: app, db, queue, ${[...app.db.models.keys()].filter((name) => !name.startsWith('Xufa')).join(', ') || '(no models)'}`
    );
    const server = repl.start({ prompt: 'xufa> ', useGlobal: false });
    Object.assign(server.context, context);
    server.setupHistory(path.join(process.cwd(), '.xufa_history'), () => {});
    await new Promise((resolve) => server.on('exit', resolve));
    await app.close();
  },

  // Listens (Django's runserver; server.js of an app of app.js): server.port and server.host of the project (PORT,
  // HOST), its migrations applied first (--no-migrate: not).
  async start(rest, options) {
    const root = findRoot();
    const project = await loadApp(root);
    if (!project.config)
      throw new Error('xufa start runs a project (xufa.yaml); this app has server.js: node server.js');
    // Models kept in the database: the server runs under this process, which starts it again with a newer version.
    if (project.designer && project.designer.mode === 'database' && !process.env.XUFA_SUPERVISED) {
      return supervise(root);
    }
    let app = null;
    app = await project.build({
      migrate: options.migrate !== false,
      // A newer version of the models: this server ends (its requests answered), and starts again with it.
      onNewModels: async (version) => {
        app.log.info(`The models have a new version (${version}): starting again`);
        await app.close();
        process.exit(RESTART);
      },
    });
    const { port, host } = project.config.server;
    await app.listen({ port: options.port ? Number(options.port) : port, host: options.host || host });
    return new Promise(() => {});
  },

  // The server again at each change: an app of server.js under node --watch (the modules it imports); a project, here
  // (its files of data too, which are read, not imported: xufa.yaml, models.yaml, urls.yaml, admin.yaml).
  async dev() {
    const root = findRoot();
    if (!projectFile(root)) {
      const child = spawn(process.execPath, ['--watch', 'server.js'], { cwd: root, stdio: 'inherit' });
      return new Promise((resolve) => child.on('exit', (code) => resolve(code || 0)));
    }
    return devProject(root);
  },

  // The seeds of the app (seeds/*.js and fixtures seeds/*.yaml, .yml, .json, in order, or those named): a function
  // (db, models) that makes data, with factories or create(), or objects by model (lib/fixtures.js).
  async seed(names) {
    const root = findRoot();
    const project = await loadApp(root);
    const dir = path.join(root, 'seeds');
    const isSeed = (file) => ['.js', '.mjs', '.cjs', ...FIXTURE_EXTENSIONS].includes(path.extname(file));
    const available = fs.existsSync(dir) ? fs.readdirSync(dir).filter(isSeed).sort() : [];
    const chosen = names.length
      ? names.map((name) =>
          isSeed(name) ? name : available.find((file) => file.replace(/\.\w+$/, '') === name) || name
        )
      : available;
    for (const file of chosen) if (!available.includes(file)) throw new Error(`no seed seeds/${file}`);
    if (chosen.length === 0) {
      print(
        'No seeds (seeds/*.js: module.exports = async (db, models) => { ... }; or seeds/*.yaml: objects by model).'
      );
      return 0;
    }
    const db = await openDatabase(project);
    try {
      const models = Object.fromEntries(db.models);
      const modelOf = (name) => {
        if (typeof project.model === 'function') return project.model(name);
        if (!models[name]) throw new Error(`no model ${name}`);
        return models[name];
      };
      for (const file of chosen) {
        if (FIXTURE_EXTENSIONS.includes(path.extname(file))) {
          const { skipped } = await db.transaction(() => loadFixtureFile(path.join(dir, file), { modelOf }));
          print(`  ${skipped ? 'skipped' : 'seeded'} ${file}`);
          continue;
        }
        const seed = valueOf(await import(pathToFileURL(path.join(dir, file)).href));
        const fn = typeof seed === 'function' ? seed : seed.seed;
        if (typeof fn !== 'function') throw new Error(`seeds/${file} gives no function`);
        // (project: its tenants too, project.tenants().run(id, fn), for the data of each.)
        await db.transaction(() => fn(db, models, { project }));
        print(`  seeded ${file}`);
      }
      return 0;
    } finally {
      await db.close();
    }
  },

  // A superuser (Django's createsuperuser), of the model of users of the app (AbstractUser of @xufa/auth: its static
  // userModel): --username, --email, and the password asked twice without showing it; --noinput takes them all from
  // the options and XUFA_SUPERUSER_PASSWORD (as DJANGO_SUPERUSER_PASSWORD).
  async createsuperuser(rest, options) {
    const project = await loadApp(findRoot());
    const db = await openDatabase(project);
    try {
      const model = [...db.models.values()].find(
        (item) => item.userModel === true && typeof item.createSuperuser === 'function'
      );
      if (!model)
        throw new Error('The app has no model of users (class User extends AbstractUser(Model, fields) of @xufa/auth)');
      const interactive = options.noinput !== true && options.input !== false;
      const ask = (question, hidden) => (interactive ? prompt(question, hidden) : Promise.resolve(''));
      const username = String(options.username || (await ask('Username: ')) || '').trim();
      if (!username) throw new Error('A username (--username)');
      if (await model.objects.filter({ username }).exists()) throw new Error(`There is a user ${username} already`);
      const email = String(options.email || (interactive ? await ask('Email address: ') : '') || '').trim() || null;
      let password = process.env.XUFA_SUPERUSER_PASSWORD || '';
      if (!password && interactive) {
        password = await ask('Password: ', true);
        if (password !== (await ask('Password (again): ', true))) throw new Error("The passwords didn't match");
      }
      if (!password) throw new Error('A password (asked, or XUFA_SUPERUSER_PASSWORD with --noinput)');
      const user = await model.createSuperuser({ username, email, password });
      print(`Superuser ${user.username} created.`);
      return 0;
    } finally {
      await db.close();
    }
  },

  async work(rest, options) {
    const project = await loadApp(findRoot());
    const db = project.database();
    // The queue of app.js (jobs(db)), or that of a project (queue: in xufa.yaml).
    const queue = typeof project.jobs === 'function' ? project.jobs(db) : db.queue;
    if (!queue) throw new Error('No queue: app.js gives no jobs(db), and xufa.yaml has no queue:');
    await db.connect();
    const concurrency = Number(options.concurrency || 1);
    const queues = options.queues ? String(options.queues).split(',') : null;
    queue.on('failed', (job, err) => console.error(`job ${job.name} (${job.pk}) failed: ${err && err.message}`));
    queue.work({ concurrency, queues });
    print(`Working: ${concurrency} at once, queues ${queues ? queues.join(', ') : '(all)'} (Ctrl+C stops)`);
    await new Promise((resolve) => {
      process.once('SIGINT', resolve);
      process.once('SIGTERM', resolve);
    });
    await queue.stop();
    await db.close();
  },
};
// The maintenance mode: on (down) and off (up), for this machine (a file) or every machine (--everywhere: the database).
Object.assign(commands, {
  async down(rest, options) {
    const root = findRoot();
    const state = { since: new Date().toISOString() };
    if (options.message) state.message = String(options.message);
    if (options.retry) state.retryAfter = Number(options.retry);
    if (options.secret) {
      state.secret = options.secret === true ? randomBytes(12).toString('base64url') : String(options.secret);
    }
    if (options.allow) {
      state.allow = String(options.allow)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (options.redirect) state.redirect = String(options.redirect);
    if (options.everywhere) {
      const project = await loadApp(root);
      const db = await openDatabase(project);
      try {
        await ormModule.maintenance(db).set(state);
      } finally {
        await db.close();
      }
      print('The app is down on every machine (in its database). xufa up --everywhere brings it back.');
    } else {
      const file = downFile(root);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
      print(`The app is down on this machine (${path.relative(process.cwd(), file)}). xufa up brings it back.`);
    }
    if (state.secret) print(`  Open /${state.secret} in a browser to go through.`);
    return 0;
  },

  async up(rest, options) {
    const root = findRoot();
    let was = false;
    const file = downFile(root);
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      was = true;
      print('The app is up on this machine.');
    }
    if (options.everywhere) {
      const project = await loadApp(root);
      const db = await openDatabase(project);
      try {
        if (await ormModule.maintenance(db).clear()) {
          // eslint-disable-line global-require
          was = true;
          print('The app is up on every machine.');
        }
      } finally {
        await db.close();
      }
    }
    if (!was)
      print(`The app was not down${options.everywhere ? '' : ' on this machine (--everywhere: in the database)'}.`);
    return 0;
  },

  // The report of GET /health of the app (its checks run once): exit code 1 when it is down.
  async health() {
    const project = await loadApp(findRoot());
    const app = await project.build({ logger: false });
    await app.ready();
    try {
      const res = await app.inject('/health');
      if (res.statusCode === 404) {
        print('The app has no health routes: app.register(xufa.health, { checks }).');
        return 1;
      }
      const report = res.json();
      print(`The app is ${report.status}.`);
      for (const [name, check] of Object.entries(report.checks || {})) {
        const extra = check.error ? `: ${check.error}` : '';
        print(
          `  ${check.status.padEnd(8)} ${name} (${check.duration} ms)${check.critical ? '' : ' (not critical)'}${extra}`
        );
      }
      return report.status === 'down' ? 1 : 0;
    } finally {
      await app.close();
    }
  },
});
// The tests of the app, with NODE_ENV=test: by vyntra when the app has it (or --runner), else by node --test; the
// files given, or those the runner finds. Its exit code is theirs.
commands.test = async function test(files, options) {
  const root = findRoot();
  let runner = options.runner;
  let bin = null;
  // vyntra when the app depends on it (one found above the app, as in a repository of many packages, is not its own).
  let ownDeps = {};
  try {
    const own = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    ownDeps = { ...own.dependencies, ...own.devDependencies };
  } catch {
    ownDeps = {};
  }
  if (runner !== 'node' && (runner === 'vyntra' || Object.hasOwn(ownDeps, 'vyntra'))) {
    try {
      const pkgFile = require.resolve('vyntra/package.json', { paths: [root] });
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin && (pkg.bin.vyntra || Object.values(pkg.bin)[0]);
      if (entry) bin = path.join(path.dirname(pkgFile), entry);
    } catch {
      bin = null;
    }
    if (runner === 'vyntra' && !bin) throw new Error('vyntra is not installed in the app (npm install -D vyntra)');
    runner = bin ? 'vyntra' : 'node';
  }
  const args = runner === 'vyntra' ? [bin, ...files] : ['--test', ...files];
  print(`xufa test: ${runner === 'vyntra' ? 'vyntra' : 'node --test'}${files.length ? ` ${files.join(' ')}` : ''}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'test' },
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(signal ? 1 : code));
  });
};
commands.g = commands.generate;

async function run(args) {
  const [name, ...more] = args;
  if (!name || name === 'help' || name === '--help' || name === '-h') {
    print(HELP);
    return 0;
  }
  const command = commands[name];
  if (!command) {
    print(`xufa: no command ${name}\n\n${HELP}`);
    return 1;
  }
  const { rest, options } = parseArgs(more);
  return command(rest, options);
}

export { run, parseArgs, commands };
