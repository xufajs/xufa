// The files of a new app (xufa new): its layout, as the apps of Rails, Laravel and Django have one, so the command
// line and the next developer find everything where they look for it.
//
//   app.js          build(): the app, its database, models, routes and jobs (not listening)
//   server.js       listens (node server.js; xufa dev restarts it on changes)
//   models/         a model in each file; models/index.js gives them all (xufa generate model adds its line)
//   routes/         a plugin in each file, at the path of its name (routes/books.js: /books; index.js: /)
//   jobs/           functions of jobs of the queue, by name
//   migrations/     made by xufa makemigrations, applied by xufa migrate
//   seeds/          data for development (xufa seed)
//   test/           tests of node:test, calling the app with inject()

const files = (name) => ({
  'package.json': `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'xufa dev',
        start: 'node server.js',
        test: 'xufa test',
        migrate: 'xufa migrate',
        makemigrations: 'xufa makemigrations',
        routes: 'xufa routes',
        shell: 'xufa shell',
        work: 'xufa work',
      },
      dependencies: { xufa: '*' },
      engines: { node: '^22.22.3 || ^24.15.0 || >=25.7.0' },
    },
    null,
    2
  )}\n`,
  'app.js': `// The app: its database, models, routes and jobs. build() gives it, not listening: server.js listens, the tests call
// it with inject(), and the command xufa (migrations, routes, shell, work) loads it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import xufa from 'xufa';
import * as orm from 'xufa/orm';
import { Queue, queuePlugin } from 'xufa/queue';
import * as models from './models/index.js';

// The files of the folders routes/ and jobs/ are loaded by their names, with require() (it loads ES modules too).
const require = createRequire(import.meta.url);

// Files of a folder of the app, by name (without .js).
function filesOf(folder) {
  const dir = path.join(import.meta.dirname, folder);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => ({ name: file.slice(0, -3), file: path.join(dir, file) }));
}

export const MIGRATIONS = path.join(import.meta.dirname, 'migrations');

// The database of DATABASE_URL (sqlite:data/app.db by default), with the models of the app.
export function database(url = process.env.DATABASE_URL || 'sqlite:data/app.db') {
  if (url.startsWith('sqlite:') && !url.includes(':memory:')) {
    fs.mkdirSync(path.dirname(url.replace(/^sqlite:(\\/\\/)?/, '')), { recursive: true });
  }
  const db = orm.Database.fromUrl(url);
  db.register(...Object.values(models));
  // The maintenance mode of every machine (xufa down --everywhere): its table, with the migrations.
  orm.maintenance(db);
  return db;
}

// The queue of the app in a database (its jobs are a model of it), with the jobs of the folder jobs/: the functions
// each file exports, by name.
export function jobs(db) {
  const queue = new Queue(db);
  for (const { file } of filesOf('jobs')) {
    for (const [name, handler] of Object.entries(require(file))) {
      if (typeof handler === 'function') queue.define(name, handler);
    }
  }
  return queue;
}

// The app. migrate: apply the migrations when it starts (xufa migrate does it apart); work: run the workers of the
// queue in this process.
export async function build({ databaseUrl, logger = true, work = false, migrate = false } = {}) {
  const db = database(databaseUrl);
  const queue = jobs(db);
  const app = xufa({ logger });
  app.register(xufa.devErrors);
  // xufa down: a 503 for every request (but /health), on this machine (the file) or every one (the database).
  app.register(xufa.maintenance, {
    file: path.join(import.meta.dirname, '.xufa', 'down.json'),
    store: orm.maintenance(db),
  });
  // GET /health/live, /health/ready and /health (xufa health shows it).
  app.register(xufa.health, {
    // The database is critical (503 without it); the queue degrades the app when its jobs wait more than 5 minutes.
    checks: { database: db.health(), queue: queue.health({ maxLag: '5m' }) }, // scheduler.health() too, with one
  });
  app.register(orm.plugin, { database: db, migrate: migrate ? { dir: MIGRATIONS } : undefined });
  app.register(queuePlugin, { queue, work });
  // Each file of routes/ is a plugin (its default export) at the path of its name.
  for (const { name, file } of filesOf('routes')) {
    app.register(require(file).default, { prefix: name === 'index' ? '' : \`/\${name}\` });
  }
  return app;
}
`,
  'server.js': `// Listens: PORT (3000) on HOST (127.0.0.1; 0.0.0.0 in a container). The workers of the queue run here too, unless
// WORKERS=0 (run them apart with xufa work).
import { build } from './app.js';

const app = await build({ work: process.env.WORKERS !== '0' });
await app.listen({ port: Number(process.env.PORT || 3000), host: process.env.HOST || '127.0.0.1' });
`,
  'models/index.js': `// Every model of the app, a file each: xufa generate model Book writes models/book.js and its line here.
export {};
`,
  'routes/index.js': `// The routes at /: each file of this folder is a plugin at the path of its name (routes/books.js at /books).
export default async function routes(app) {
  app.get('/', async () => ({ hello: 'world' }));
}
`,
  'jobs/index.js': `// Jobs of the queue, by name: app.queue.enqueue('hello', { name: 'Ada' }) runs hello in a worker.
export async function hello({ name }) {
  return \`Hello, \${name}!\`;
}
`,
  'migrations/.gitkeep': '',
  'seeds/README.md': [
    'Seeds: data for development, made by `xufa seed` (every file, in order) or `xufa seed <name>`. Each file gives a',
    'function of the database and its models, run in a transaction:',
    '',
    '```js',
    '// seeds/01-books.js',
    "import { factory } from 'xufa/orm';",
    '',
    'export default async (db, { Book }) => {',
    '  await factory(Book, { title: (n) => `Book ${n}` }).createMany(20);',
    '};',
    '```',
    '',
  ].join('\n'),
  'test/app.test.js': `// The tests of the app (npm test: xufa test). One app for them all; each test runs in a transaction rolled back at
// its end (rollbackEach), so each starts with the data made in before() and leaves nothing.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rollbackEach } from 'xufa/orm';
import { build } from '../app.js';

let app;
before(async () => {
  app = await build({ databaseUrl: 'sqlite::memory:', logger: false, migrate: true });
});
after(() => app.close());
rollbackEach(() => app.db, { beforeEach, afterEach });

test('GET / answers', async () => {
  const res = await app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { hello: 'world' });
});
`,
  '.env.example': `# The database: postgres://user:password@host:5432/name, mongodb://host/name, sqlite:data/app.db, memory:
DATABASE_URL=sqlite:data/app.db
PORT=3000
`,
  '.gitignore': `node_modules
data
.env
.xufa
`,
  'README.md': `# ${name}

An app of [xufa](https://github.com/xufajs/xufa).

\`\`\`sh
npm install
npx xufa migrate            # the tables of the models
npm run dev                 # http://127.0.0.1:3000, restarted on changes
npm test
\`\`\`

- \`npx xufa generate resource Book title:string pages:integer\`: a model and its routes (/books).
- \`npx xufa makemigrations\`, then \`npx xufa migrate\`, when models change.
- \`npx xufa shell\`: a REPL with the models (\`await Book.objects.count()\`).
- \`npx xufa routes\`: the routes of the app.
`,
});

export { files };
