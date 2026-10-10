// What a worker of the Django benchmark (django.js) holds at rest: the modules it loaded, by package, with the size of
// their source, and its memory after a full collection, once built and again after some requests of every page (its
// code compiled, its caches filled). The memory of the workers under load starts there: this is what each of them
// carries whatever the requests do.
//
// Linux only, as django.js (pnpm bench:linux django-footprint ...), on the database the benchmark seeded:
//   node django-footprint.js [--requests 500] [--top 40]
const { fork } = require('node:child_process');
const Module = require('node:module');
const { fileURLToPath } = require('node:url');
const v8 = require('node:v8');
const vm = require('node:vm');
const { setUp, postgres, dbUrl, SCENARIOS, PORT } = require('./django.js');

// Full collections on demand, without node --expose-gc.
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc');

function parseArgs(argv) {
  const args = { requests: 500, top: 40 };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    args[name] = Number(argv[i + 1]);
  }
  return args;
}

// The modules loaded, by the URL of each (ES modules and CommonJS alike), with the size of their source.
const loaded = new Map();
Module.registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (url.startsWith('file:') && !loaded.has(url)) {
      const { source } = result;
      loaded.set(url, source ? source.length : 0);
    }
    return result;
  },
});

// The package of a file: @scope/name or name of node_modules, packages/<name> of the repository, or its folder.
function packageOf(url) {
  const file = fileURLToPath(url).replace(/\\/g, '/');
  const inModules = file.split('/node_modules/').pop();
  if (inModules !== file) {
    const parts = inModules.split('/');
    return parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  }
  const match = /\/(packages|examples|bench)\/([^/]+)\//.exec(file);
  return match ? `${match[1]}/${match[2]}` : file;
}

function send(requests, amount) {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, ['--child'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    child.once('message', resolve);
    child.once('error', reject);
    child.send({ requests, amount });
  });
}

function child() {
  const autocannon = require('autocannon');
  process.once('message', ({ requests, amount }) => {
    autocannon({ url: `http://127.0.0.1:${PORT}`, connections: 16, amount, requests }, (err, result) => {
      if (err) throw err;
      process.send({ errors: result.errors }, () => process.exit(0));
    });
  });
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);

function memory(title) {
  gc();
  gc();
  const usage = process.memoryUsage();
  const spaces = v8
    .getHeapSpaceStatistics()
    .filter((space) => space.space_size > 0)
    .map((space) => `${space.space_name.replace(/_space$/, '')} ${mb(space.space_used_size)}/${mb(space.space_size)}`);
  console.log(
    `\n## ${title}\n\nrss ${mb(usage.rss)} MB, heap used ${mb(usage.heapUsed)} of ${mb(usage.heapTotal)} MB, ` +
      `external ${mb(usage.external)} MB (array buffers ${mb(usage.arrayBuffers)} MB), outside the heap ` +
      `${mb(usage.rss - usage.heapTotal)} MB\nspaces (used/size MB): ${spaces.join(', ')}\n${linuxStatus()}`
  );
}

// Of the resident memory, what is the process's own (anonymous) and what is of files it maps (the binary of Node.js,
// its libraries: shared with the other processes), and its threads.
function linuxStatus() {
  let status;
  try {
    status = require('node:fs').readFileSync('/proc/self/status', 'utf8');
  } catch {
    return '';
  }
  const value = (name) => (new RegExp(`^${name}:\\s+(\\d+)`, 'm').exec(status) || [])[1];
  const kb = (name) => `${(Number(value(name)) / 1024).toFixed(1)} MB`;
  return `own ${kb('RssAnon')}, of files ${kb('RssFile')}, shared memory ${kb('RssShmem')}; threads ${value('Threads')}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  memory('node itself (this script and django.js)');
  postgres();
  const { buildApp, addBenchRoutes } = await import('./django/xufa-app.mjs');
  const { PASSWORD } = await import('./django/data.mjs');
  process.env.NODE_ENV = 'production';
  const { app, project } = await buildApp({ databaseUrl: dbUrl('bench_xufa') });
  addBenchRoutes(app, project);
  await app.listen({ port: PORT, host: '127.0.0.1' });
  memory('the app built');

  const packages = new Map();
  for (const [url, size] of loaded) {
    const name = packageOf(url);
    const entry = packages.get(name) || { files: 0, bytes: 0 };
    entry.files += 1;
    entry.bytes += size;
    packages.set(name, entry);
  }
  const total = [...loaded.values()].reduce((sum, size) => sum + size, 0);
  console.log(`\n## Modules loaded: ${loaded.size} files, ${mb(total)} MB of source\n`);
  for (const [name, { files, bytes }] of [...packages].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, args.top)) {
    console.log(`${(bytes / 1024).toFixed(0).padStart(7)} KB ${String(files).padStart(4)} files  ${name}`);
  }

  const firstBook = (await project.model('Book').objects.orderBy('pk').first()).pk;
  const firstAuthor = (await project.model('Author').objects.orderBy('pk').first()).pk;
  const setup = await setUp('xufa', { xufa: { firstBook, firstAuthor } }, PASSWORD);
  const before = loaded.size;
  for (const scenario of Object.keys(SCENARIOS)) {
    const requests = SCENARIOS[scenario].requests(setup).map((request) => ({ method: 'GET', ...request }));
    await send(requests, args.requests);
  }
  memory(`after ${args.requests} requests of every page`);
  const late = [...loaded.keys()].slice(before);
  if (late.length) console.log(`\nLoaded by the requests: ${late.map((url) => packageOf(url)).join(', ')}`);
  await app.close();
  process.exit(0);
}

if (process.argv[2] === '--child') child();
else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
