'use strict';

// The commands of xufa (bin/xufa.js). An app is a folder with app.js (xufa new makes one): build() gives the app,
// database() its database with the models, jobs(db) its queue, MIGRATIONS the folder of its migrations.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { files } = require('./templates');
const { modelFile, resourceFile, plural, kebab, pascal } = require('./generate');

const HELP = `xufa: the command line of an app of xufa

  xufa new <folder>                          a new app (app.js, server.js, models, routes, jobs, migrations, test)
  xufa generate model <Name> [field:type...] a model (models/<name>.js) and its migration
  xufa generate resource <Name> [fields...]  a model, its migration and its routes (routes/<names>.js)
  xufa makemigrations [name]                 a migration of the changes of the models
  xufa migrate                               applies the migrations not applied yet
  xufa showmigrations                        the migrations, applied or not
  xufa routes                                the routes of the app
  xufa shell                                 a REPL with the app, its database and models (await works)
  xufa dev                                   the server, restarted when a file changes
  xufa seed [name...]                        runs the seeds (seeds/*.js): data for development
  xufa work [--concurrency 4] [--queues a,b] workers of the queue
  xufa down [--message m] [--retry 60]       the maintenance mode on: 503 for every request (--secret [path]: a
            [--secret] [--allow ip,ip]       path that lets a browser through; --allow: addresses that go through;
            [--everywhere]                   --everywhere: every machine, in the database, not only this one)
  xufa up [--everywhere]                     the maintenance mode off
  xufa health                                the checks of the health of the app (GET /health)

Fields are name:type[:null][:unique][:index]: string, text, integer, bigint, float, decimal, boolean, date,
datetime, json, uuid, email, references (author:references: a foreign key to Author). The database is
DATABASE_URL (sqlite:data/app.db): postgres://..., mongodb://..., sqlite:..., memory:.`;

const print = (...items) => console.log(...items);

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
    if (fs.existsSync(path.join(dir, 'app.js')) && fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir)
      throw new Error('no app here (a folder with app.js and package.json): xufa new <folder> makes one');
    dir = parent;
  }
}

function loadApp(root) {
  process.chdir(root);
  // The modules of the app as they are now (a command after another in one process: models generated since).
  const own = path.join(root, path.sep);
  const modules = path.join(root, 'node_modules', path.sep);
  for (const file of Object.keys(require.cache)) {
    if (file.startsWith(own) && !file.startsWith(modules)) delete require.cache[file];
  }
  const project = require(path.join(root, 'app.js')); // eslint-disable-line global-require
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

// The file of the maintenance mode of this machine (the plugin xufa.maintenance reads it).
const downFile = (root) => path.join(root, '.xufa', 'down.json');

const commands = {
  async new([folder], options) {
    if (!folder) throw new Error('xufa new <folder>');
    const root = path.resolve(folder);
    if (fs.existsSync(root) && fs.readdirSync(root).length && !options.force) {
      throw new Error(`${folder} is not empty (--force writes in it)`);
    }
    const name = kebab(path.basename(root)).replace(/[^a-z0-9-]/g, '') || 'app';
    print(`A new app in ${folder}:`);
    writeFiles(root, Object.entries(files(name)), options);
    print(
      `\nNext:\n  cd ${folder}\n  npm install\n  npx xufa generate resource Book title:string pages:integer:null\n  npx xufa migrate\n  npm run dev`
    );
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
    if (options.migration === false) return;
    const made = await commands.makemigrations([`create_${file.replace(/-/g, '_')}`], {});
    if (made === 0) print('Then: xufa migrate');
  },

  async makemigrations([name]) {
    const project = loadApp(findRoot());
    const db = await openDatabase(project);
    try {
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

  async migrate() {
    const project = loadApp(findRoot());
    const db = await openDatabase(project);
    try {
      const done = await db.migrate({ dir: project.migrations });
      if (done.length === 0) print('Nothing to apply.');
      for (const name of done) print(`  applied ${name}`);
      return 0;
    } finally {
      await db.close();
    }
  },

  async showmigrations() {
    const project = loadApp(findRoot());
    const db = await openDatabase(project);
    try {
      const list = await db.showMigrations({ dir: project.migrations });
      if (list.length === 0) print('No migrations.');
      for (const { name, applied } of list) print(`  [${applied ? 'X' : ' '}] ${name}`);
      return 0;
    } finally {
      await db.close();
    }
  },

  async routes() {
    const project = loadApp(findRoot());
    const app = await project.build({ logger: false });
    await app.ready();
    try {
      print(app.printRoutes({ commonPrefix: false }).trimEnd());
    } finally {
      await app.close();
    }
  },

  async shell() {
    const repl = require('node:repl'); // eslint-disable-line global-require
    const project = loadApp(findRoot());
    const app = await project.build({ logger: false });
    await app.ready();
    const orm = require('@xufa/orm'); // eslint-disable-line global-require
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

  async dev() {
    const root = findRoot();
    const child = spawn(process.execPath, ['--watch', 'server.js'], { cwd: root, stdio: 'inherit' });
    return new Promise((resolve) => child.on('exit', (code) => resolve(code || 0)));
  },

  // The seeds of the app (seeds/*.js, in order, or those named): each a function (db, models) that makes data, with
  // factories or create().
  async seed(names) {
    const root = findRoot();
    const project = loadApp(root);
    const dir = path.join(root, 'seeds');
    const available = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((file) => file.endsWith('.js'))
          .sort()
      : [];
    const chosen = names.length ? names.map((name) => (name.endsWith('.js') ? name : `${name}.js`)) : available;
    for (const file of chosen) if (!available.includes(file)) throw new Error(`no seed seeds/${file}`);
    if (chosen.length === 0) {
      print('No seeds (seeds/*.js: module.exports = async (db, models) => { ... }).');
      return 0;
    }
    const db = await openDatabase(project);
    try {
      const models = Object.fromEntries(db.models);
      for (const file of chosen) {
        const seed = require(path.join(dir, file)); // eslint-disable-line global-require
        const fn = typeof seed === 'function' ? seed : seed.seed;
        if (typeof fn !== 'function') throw new Error(`seeds/${file} gives no function`);
        await db.transaction(() => fn(db, models));
        print(`  seeded ${file}`);
      }
      return 0;
    } finally {
      await db.close();
    }
  },

  async work(rest, options) {
    const project = loadApp(findRoot());
    if (typeof project.jobs !== 'function') throw new Error('app.js gives no jobs(db)');
    const db = project.database();
    const queue = project.jobs(db);
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
      const project = loadApp(root);
      const db = await openDatabase(project);
      try {
        await require('@xufa/orm').maintenance(db).set(state); // eslint-disable-line global-require
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
      const project = loadApp(root);
      const db = await openDatabase(project);
      try {
        if (await require('@xufa/orm').maintenance(db).clear()) {
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
    const project = loadApp(findRoot());
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

module.exports = { run, parseArgs, commands };
