// What xufa allocates for each page of the Django benchmark (django.js), and where: the app runs in this process on
// the database the benchmark seeded (run django.js once before), a process of its own sends the requests of each
// scenario, and V8's sampling heap profiler counts what is allocated meanwhile, collected or not. Fewer bytes a
// request: fewer collections, less memory of the workers under load (garbage promoted to the old generation).
//
// Linux only, as django.js (pnpm bench:linux django-alloc ...):
//   node django-alloc.js [--scenarios index,books] [--requests 2000] [--top 25] [--interval 4096] [--cpu 1]
// --cpu 1: where the processor time goes instead (V8's CPU profiler, the time of each function itself).
// --queries 1: the SQL of one request of each scenario (of every database of the project: the app's, sessions...).
// --survivors 1: only what outlived a collection of the young generation (what a request keeps while it waits on the
// database): what makes V8 grow the young generation and fills the old one, the memory of the workers under load.
const { fork } = require('node:child_process');
const inspector = require('node:inspector/promises');
const { setUp, postgres, dbUrl, SCENARIOS, PORT } = require('./django.js');

function parseArgs(argv) {
  const args = {
    scenarios: Object.keys(SCENARIOS),
    requests: 2000,
    top: 25,
    interval: 4096,
    cpu: 0,
    queries: 0,
    survivors: 0,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (name === 'scenarios') args.scenarios = argv[i + 1].split(',');
    else if (name in args) args[name] = Number(argv[i + 1]);
    else throw new Error(`Unknown option --${name}`);
  }
  return args;
}

// The load: autocannon in a process of its own (its allocations are not this process's), a number of requests.
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
      process.send({ errors: result.errors, non2xx: result.non2xx }, () => process.exit(0));
    });
  });
}

// The functions that allocate the most, by their own allocations (sampled), with their file.
function sitesOf(profile) {
  const sites = new Map();
  let total = 0;
  const walk = (node) => {
    const self = node.selfSize;
    if (self) {
      const { functionName, url, lineNumber } = node.callFrame;
      const file = url
        ? url
            .replace(/^file:\/\//, '')
            .split('/node_modules/')
            .pop()
            .split('/xufa/')
            .pop()
        : '(native)';
      const key = `${functionName || '(anonymous)'} ${file}:${lineNumber + 1}`;
      sites.set(key, (sites.get(key) || 0) + self);
      total += self;
    }
    for (const childNode of node.children) walk(childNode);
  };
  walk(profile.head);
  return { total, sites: [...sites].sort((a, b) => b[1] - a[1]) };
}

// The functions that take the most processor time by themselves, with their file.
function timesOf(profile) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const times = new Map();
  let total = 0;
  profile.samples.forEach((id, i) => {
    const delta = profile.timeDeltas[i] || 0;
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    if (functionName === '(idle)' || functionName === '(program)') return;
    const file = url
      ? url
          .replace(/^file:\/\//, '')
          .split('/node_modules/')
          .pop()
          .split('/xufa/')
          .pop()
      : '(native)';
    const key = `${functionName || '(anonymous)'} ${file}:${lineNumber + 1}`;
    times.set(key, (times.get(key) || 0) + delta);
    total += delta;
  });
  return { total, sites: [...times].sort((a, b) => b[1] - a[1]) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  postgres();
  const { buildApp, addBenchRoutes } = await import('./django/xufa-app.mjs');
  const { PASSWORD } = await import('./django/data.mjs');
  process.env.NODE_ENV = 'production';
  const { app, project } = await buildApp({ databaseUrl: dbUrl('bench_xufa') });
  addBenchRoutes(app, project);
  await app.listen({ port: PORT, host: '127.0.0.1' });
  const firstBook = (await project.model('Book').objects.orderBy('pk').first()).pk;
  const firstAuthor = (await project.model('Author').objects.orderBy('pk').first()).pk;
  const setup = await setUp('xufa', { xufa: { firstBook, firstAuthor } }, PASSWORD);

  if (args.queries) {
    const seen = new Set();
    for (const db of [app.db, project.db].filter(Boolean)) {
      if (seen.has(db.backend)) continue;
      seen.add(db.backend);
      for (const method of ['query', 'execute']) {
        const original = db.backend[method];
        if (typeof original !== 'function') continue;
        db.backend[method] = function logged(sql, ...rest) {
          if (process.env.BENCH_LOG_SQL)
            console.log(`    ${method}: ${String(sql).replace(/\s+/g, ' ').slice(0, 160)}`);
          return original.call(this, sql, ...rest);
        };
      }
    }
    for (const scenario of args.scenarios) {
      const [request] = SCENARIOS[scenario].requests(setup);
      console.log(`
## ${scenario}: ${request.method || 'GET'} ${request.path}`);
      process.env.BENCH_LOG_SQL = '1';
      const response = await fetch(`http://127.0.0.1:${PORT}${request.path}`, {
        method: request.method || 'GET',
        headers: request.headers,
        body: request.body,
        redirect: 'manual',
      });
      await response.text();
      delete process.env.BENCH_LOG_SQL;
    }
    await app.close();
    process.exit(0);
  }

  const session = new inspector.Session();
  session.connect();
  const kb = (bytes) => (bytes / 1024).toFixed(1);
  for (const scenario of args.scenarios) {
    const requests = SCENARIOS[scenario].requests(setup).map((request) => ({ method: 'GET', ...request }));
    await send(requests, Math.min(2000, args.requests)); // warm up
    if (args.cpu) {
      await session.post('Profiler.enable');
      await session.post('Profiler.setSamplingInterval', { interval: 50 });
      await session.post('Profiler.start');
      await send(requests, args.requests);
      const { profile } = await session.post('Profiler.stop');
      const { total, sites } = timesOf(profile);
      console.log(`
## ${scenario}: ${(total / args.requests).toFixed(0)} µs of processor a request (busy)
`);
      for (const [site, us] of sites.slice(0, args.top)) {
        console.log(
          `${(us / args.requests).toFixed(1).padStart(6)} µs ${((100 * us) / total).toFixed(1).padStart(5)}%  ${site}`
        );
      }
      continue;
    }
    await session.post('HeapProfiler.startSampling', {
      samplingInterval: args.interval,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: !args.survivors,
    });
    const result = await send(requests, args.requests);
    const { profile } = await session.post('HeapProfiler.stopSampling');
    const { total, sites } = sitesOf(profile);
    console.log(
      `\n## ${scenario}: ${kb(total / args.requests)} KB a request${args.survivors ? ' outlived a young collection' : ''}` +
        `${result.errors || result.non2xx ? ` (${result.errors} errors, ${result.non2xx} not 2xx)` : ''}\n`
    );
    for (const [site, bytes] of sites.slice(0, args.top)) {
      console.log(
        `${kb(bytes / args.requests).padStart(7)} KB ${((100 * bytes) / total).toFixed(1).padStart(5)}%  ${site}`
      );
    }
  }
  session.disconnect();
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
