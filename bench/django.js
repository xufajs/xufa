// Django against xufa, on the same app: examples/django-locallibrary (the MDN tutorial) and its port to xufa
// (examples/locallibrary), on the same PostgreSQL and the same data (django/data.mjs), with the same number of
// processes. Django runs as it is deployed at its best (django/site/benchsite/settings.py) in each server that
// serves it well; each scenario compares xufa with the fastest of them.
//
// Linux only (pnpm bench:linux django ...): it needs PostgreSQL (initdb and pg_ctl of /usr/lib/postgresql) and
// python3 with venv. Its data lives in ~/bench-django: the cluster of PostgreSQL (port 55432, its own), the venv.
//
//   node django.js [--rounds 3] [--duration 10] [--warmup 3] [--connections 64] [--clients 4] [--processes 4]
//                  [--servers xufa,gunicorn-sync,...] [--scenarios hello,json,...] [--out results/django-1]
//                  [--semi-space 32] (the young generation of V8 in xufa's workers, MB)
//                  [--heap-log 1] (each xufa worker writes its memory to ~/bench-django/heap-<pid>.json)
//                  [--xufa-flags --max-old-space-size=96,...] (more flags of node for xufa's workers)
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const autocannon = require('autocannon');

const ROOT = path.join(__dirname, '..');
const HOME = path.join(os.homedir(), 'bench-django');
const PG = { port: 55432, data: path.join(HOME, 'pg'), run: path.join(HOME, 'pg-run'), user: os.userInfo().username };
const VENV = path.join(HOME, 'venv');
const SITE = path.join(__dirname, 'django', 'site');
const DJANGO_APP = path.join(ROOT, 'examples', 'django-locallibrary');
const PORT = 18080;
const DATA = path.join(HOME, 'data.json');
const PROGRESS = path.join(HOME, 'progress.log');

// The servers: xufa, and Django in each server that serves it well. N processes each (--processes).
const SERVERS = {
  xufa: (n) => ({
    command: process.execPath,
    args: [path.join(__dirname, 'django', 'xufa-server.mjs'), String(PORT), String(n), dbUrl('bench_xufa')],
    env: { NODE_ENV: 'production' },
  }),
  // The classic: a process for each request at a time.
  'gunicorn-sync': (n) => ({
    command: path.join(VENV, 'bin', 'gunicorn'),
    args: [
      'benchsite.wsgi:application',
      '-w',
      String(n),
      '-k',
      'sync',
      '-b',
      `127.0.0.1:${PORT}`,
      '--log-level',
      'warning',
    ],
  }),
  // Threads in each process: while one waits on the database, another runs.
  'gunicorn-gthread': (n) => ({
    command: path.join(VENV, 'bin', 'gunicorn'),
    args: [
      'benchsite.wsgi:application',
      '-w',
      String(n),
      '-k',
      'gthread',
      '--threads',
      '4',
      '-b',
      `127.0.0.1:${PORT}`,
      '--log-level',
      'warning',
    ],
  }),
  // A server of Rust for WSGI.
  'granian-wsgi': (n) => ({
    command: path.join(VENV, 'bin', 'granian'),
    args: [
      '--interface',
      'wsgi',
      '--workers',
      String(n),
      '--blocking-threads',
      '4',
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--log-level',
      'warning',
      'benchsite.wsgi:application',
    ],
  }),
  // ASGI with uvloop and httptools: Django's pool of connections in each process (its threads would each keep one).
  'uvicorn-asgi': (n) => ({
    env: { BENCH_DB_POOL: '8' },
    command: path.join(VENV, 'bin', 'uvicorn'),
    args: [
      'benchsite.asgi:application',
      '--workers',
      String(n),
      '--host',
      '127.0.0.1',
      '--port',
      String(PORT),
      '--no-access-log',
      '--log-level',
      'warning',
    ],
  }),
};

// The scenarios: what each asks, from what the setup found (sessions, the form of an author, ids).
const SCENARIOS = {
  hello: { title: 'Plain text (the framework alone)', requests: () => [{ path: '/bench/hello' }] },
  json: {
    title: 'A book as JSON (2 queries)',
    requests: (s) => ids(s.firstBook, 10, 97).map((id) => ({ path: `/bench/book/${id}.json` })),
  },
  index: {
    title: 'Home page: 4 counts, the visits in the session (saved), template',
    // Visitors of their own (one row each), as real traffic: not every request on the lock of one row.
    requests: (s) => s.visitors.map((cookie) => ({ path: '/catalog/', headers: { cookie } })),
  },
  books: {
    title: 'Book list: a page of 10 with their authors, paginated, template',
    requests: () => [1, 7, 23, 61, 120, 150, 199].map((page) => ({ path: `/catalog/books/?page=${page}` })),
  },
  book: {
    title: 'Book detail: author, language, genres, copies, template',
    requests: (s) => ids(s.firstBook, 10, 131).map((id) => ({ path: `/catalog/book/${id}` })),
  },
  mybooks: {
    title: 'Loans of the user: logged in, a list with its books',
    requests: (s) => [{ path: '/catalog/mybooks/', headers: { cookie: s.reader } }],
  },
  'author-update': {
    title: 'Edit an author: form POST with CSRF, validation, UPDATE, redirect',
    expect: 302,
    // Authors of their own, as several librarians editing: not every request on the lock of one row.
    requests: (s) =>
      s.authorForms.map((form) => ({
        method: 'POST',
        path: form.path,
        headers: { cookie: s.librarian, 'content-type': 'application/x-www-form-urlencoded' },
        body: form.body,
      })),
  },
};

function ids(first, count, step) {
  return Array.from({ length: count }, (_, i) => first + ((i * step) % 1900));
}

function parseArgs(argv) {
  const args = {
    rounds: 3,
    duration: 10,
    warmup: 3,
    connections: 64,
    clients: 4,
    processes: 4,
    // The young generation of V8 in xufa's workers, MB (@xufa/cluster's default: 32).
    semiSpace: 32,
    // 1: each xufa worker writes its memory (process.memoryUsage, V8's spaces) to ~/bench-django/heap-<pid>.json.
    heapLog: 0,
    // More flags of node for xufa's workers ('--max-old-space-size=96,--optimize-for-size').
    xufaFlags: '',
    servers: Object.keys(SERVERS),
    scenarios: Object.keys(SCENARIOS),
    out: null,
  };
  for (let i = 0; i < argv.length; i += 2) {
    // (--semi-space: semiSpace)
    const name = argv[i].replace(/^--/, '').replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
    const value = argv[i + 1];
    if (name === 'servers' || name === 'scenarios') args[name] = value.split(',');
    else if (name === 'out' || name === 'xufaFlags') args[name] = value;
    else if (name in args) args[name] = Number(value);
    else throw new Error(`Unknown option --${name}`);
  }
  for (const name of args.servers) if (!SERVERS[name]) throw new Error(`No server ${name}`);
  // (Read by django/xufa-server.mjs, which the servers inherit the environment of.)
  process.env.BENCH_SEMI_SPACE = String(args.semiSpace);
  process.env.BENCH_XUFA_FLAGS = args.xufaFlags;
  if (args.heapLog) process.env.BENCH_HEAP_LOG = path.join(os.homedir(), 'bench-django');
  for (const name of args.scenarios) if (!SCENARIOS[name]) throw new Error(`No scenario ${name}`);
  return args;
}

const dbUrl = (name) => `postgres://${PG.user}@127.0.0.1:${PG.port}/${name}`;
// (null when its output goes to the terminal: stdio 'inherit')
const run = (command, args, options = {}) =>
  (execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }) || '').trim();
const djangoEnv = () => ({
  ...process.env,
  PYTHONPATH: [SITE, DJANGO_APP].join(':'),
  DJANGO_SETTINGS_MODULE: 'benchsite.settings',
  BENCH_DB_PORT: String(PG.port),
  BENCH_DB_USER: PG.user,
});

// PostgreSQL: a cluster of its own in ~/bench-django/pg, started when it is not.
function postgres() {
  const base = '/usr/lib/postgresql';
  if (!fs.existsSync(base)) throw new Error('PostgreSQL is not installed: sudo apt install -y postgresql');
  const version = fs
    .readdirSync(base)
    .sort((a, b) => Number(b) - Number(a))
    .find((v) => fs.existsSync(path.join(base, v, 'bin', 'pg_ctl')));
  const bin = (name) => path.join(base, version, 'bin', name);
  fs.mkdirSync(PG.run, { recursive: true });
  if (!fs.existsSync(path.join(PG.data, 'PG_VERSION'))) {
    console.log(`django: a cluster of PostgreSQL ${version} in ${PG.data}`);
    run(bin('initdb'), ['-D', PG.data, '-U', PG.user, '--auth=trust', '-E', 'UTF8', '--locale=C.UTF-8']);
  }
  let running = true;
  try {
    run(bin('pg_ctl'), ['-D', PG.data, 'status']);
  } catch {
    running = false;
  }
  if (!running) {
    const options = [
      `-p ${PG.port}`,
      `-k ${PG.run}`,
      '-c listen_addresses=127.0.0.1',
      '-c max_connections=400',
      '-c shared_buffers=1GB',
    ].join(' ');
    run(bin('pg_ctl'), ['-D', PG.data, '-o', options, '-l', path.join(HOME, 'pg.log'), '-w', 'start']);
  }
  const psql = (sql, db = 'postgres') =>
    run(bin('psql'), ['-h', '127.0.0.1', '-p', String(PG.port), '-U', PG.user, '-d', db, '-tAc', sql]);
  return { version: psql('SHOW server_version'), psql };
}

// The venv of Django and its servers, installed again when requirements.txt changes.
function venv() {
  const requirements = path.join(SITE, 'requirements.txt');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(requirements)).digest('hex');
  const stamp = path.join(VENV, '.requirements');
  if (!fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8') !== hash) {
    console.log('django: installing Django and its servers in a venv');
    fs.rmSync(VENV, { recursive: true, force: true });
    // Without pip (Ubuntu's python3 has no ensurepip unless python3-venv is installed): then PyPA's get-pip.py.
    run('python3', ['-m', 'venv', '--without-pip', VENV]);
    const getPip = path.join(HOME, 'get-pip.py');
    if (!fs.existsSync(getPip)) run('curl', ['-sSfL', '-o', getPip, 'https://bootstrap.pypa.io/get-pip.py']);
    run(path.join(VENV, 'bin', 'python'), [getPip, '-q']);
    run(path.join(VENV, 'bin', 'pip'), ['install', '-q', '-r', requirements], { stdio: 'inherit' });
    fs.writeFileSync(stamp, hash);
  }
  const wanted = ['django', 'gunicorn', 'granian', 'uvicorn', 'uvloop', 'httptools', 'psycopg', 'psycopg-binary'];
  const versions = Object.fromEntries(
    run(path.join(VENV, 'bin', 'pip'), ['freeze'])
      .split('\n')
      .map((line) => line.split('=='))
      .filter(([name]) => wanted.includes(name.toLowerCase()))
      .map(([name, version]) => [name.toLowerCase(), version])
  );
  versions.python = run(path.join(VENV, 'bin', 'python'), ['--version']).replace('Python ', '');
  return versions;
}

// Both databases made again, migrated, and seeded with the same data.
function databases(pg) {
  run(process.execPath, [path.join(__dirname, 'django', 'data.mjs'), DATA]);
  for (const name of ['bench_django', 'bench_xufa']) {
    pg.psql(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    pg.psql(`CREATE DATABASE ${name}`);
  }
  const python = path.join(VENV, 'bin', 'python');
  run(python, [path.join(DJANGO_APP, 'manage.py'), 'migrate', '-v', '0'], { env: djangoEnv(), cwd: SITE });
  const django = run(python, [path.join(SITE, 'seed.py'), DATA], { env: djangoEnv(), cwd: SITE }).split('\n');
  const xufa = run(process.execPath, [path.join(__dirname, 'django', 'xufa-seed.mjs'), dbUrl('bench_xufa'), DATA], {
    env: { ...process.env, NODE_ENV: 'production' },
  }).split('\n');
  console.log(`  ${django[0]}\n  ${xufa[0]}`);
  // Both as a database that runs is (autovacuum has been by): the visibility of their rows known, so index-only scans
  // read no table, and their statistics.
  for (const name of ['bench_django', 'bench_xufa']) pg.psql('VACUUM ANALYZE', name);
  // Experiments: SQL run on a database after it is seeded (BENCH_SQL_XUFA, BENCH_SQL_DJANGO; statements split by ;).
  for (const [name, sql] of [
    ['bench_xufa', process.env.BENCH_SQL_XUFA],
    ['bench_django', process.env.BENCH_SQL_DJANGO],
  ]) {
    for (const statement of (sql || '').split(';').filter((text) => text.trim())) pg.psql(statement, name);
  }
  return { django: JSON.parse(django.at(-1)), xufa: JSON.parse(xufa.at(-1)) };
}

// Nothing may answer on the port before a server starts: a server left by a run that was stopped would be measured
// instead of the new one (which cannot listen there).
async function portFree() {
  try {
    await fetch(`http://127.0.0.1:${PORT}/`);
  } catch {
    return;
  }
  throw new Error(`Something answers on port ${PORT} already (a server of a run that was stopped?): stop it first`);
}

function startServer(name, processes) {
  const spec = SERVERS[name](processes);
  const child = spawn(spec.command, spec.args, {
    cwd: SITE,
    env: { ...djangoEnv(), ...(spec.env || {}) },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true, // a group of its own: stopping it stops its workers
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-4000);
  });
  return { name, child, stderr: () => stderr };
}

async function stopServer(server) {
  try {
    process.kill(-server.child.pid, 'SIGTERM');
  } catch {
    return;
  }
  const exited = new Promise((resolve) => server.child.once('exit', resolve));
  const timeout = new Promise((resolve) => setTimeout(resolve, 8000, 'timeout'));
  if ((await Promise.race([exited, timeout])) === 'timeout') {
    try {
      process.kill(-server.child.pid, 'SIGKILL');
    } catch {
      // (it ended meanwhile)
    }
  }
  // The port free again before the next one.
  for (let i = 0; i < 50; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/bench/hello`);
      await sleep(100);
    } catch {
      return;
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitReady(server) {
  for (let i = 0; i < 300; i += 1) {
    if (server.child.exitCode !== null) throw new Error(`${server.name} exited: ${server.stderr()}`);
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/bench/hello`)).status === 200) return;
    } catch {
      // (not listening yet)
    }
    await sleep(100);
  }
  throw new Error(`${server.name} did not answer in 30 s: ${server.stderr()}`);
}

// Cookies of a browser: what Set-Cookie gave, sent back.
class Jar {
  constructor() {
    this.cookies = new Map();
  }
  take(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  get header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  async fetch(url, options = {}) {
    const response = await fetch(`http://127.0.0.1:${PORT}${url}`, {
      redirect: 'manual',
      ...options,
      headers: { ...(options.headers || {}), cookie: this.header },
    });
    this.take(response);
    return response;
  }
}

const decode = (text) =>
  text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// The fields of the form of a page (with its CSRF token): inputs, textareas, and the chosen option of selects.
function formOf(html, field) {
  const forms = html.match(/<form[\s\S]*?<\/form>/gi) || [];
  const form = forms.find((text) => new RegExp(`name="${field}"`).test(text));
  if (!form) throw new Error(`No form with ${field}`);
  const values = [];
  for (const [input] of form.matchAll(/<input\b[^>]*>/gi)) {
    const name = /\bname="([^"]*)"/.exec(input);
    if (!name) continue;
    const type = (/\btype="([^"]*)"/.exec(input) || [])[1];
    if (type === 'submit' || ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/.test(input))) continue;
    values.push([decode(name[1]), decode((/\bvalue="([^"]*)"/.exec(input) || [])[1] || '')]);
  }
  for (const [, attrs, text] of form.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = /\bname="([^"]*)"/.exec(attrs);
    if (name) values.push([decode(name[1]), decode(text.replace(/^\r?\n/, ''))]);
  }
  for (const [, attrs, options] of form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = /\bname="([^"]*)"/.exec(attrs);
    for (const [option] of options.matchAll(/<option\b[^>]*\bselected\b[^>]*>/gi)) {
      if (name) values.push([decode(name[1]), decode((/\bvalue="([^"]*)"/.exec(option) || [])[1] || '')]);
    }
  }
  return values;
}

async function logIn(username, password) {
  const jar = new Jar();
  const page = await jar.fetch('/accounts/login/');
  const values = formOf(await page.text(), 'username').filter(([name]) => name !== 'username' && name !== 'password');
  const body = new URLSearchParams([...values, ['username', username], ['password', password]]).toString();
  const response = await jar.fetch('/accounts/login/', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (response.status !== 302) throw new Error(`Logging in ${username}: ${response.status} ${await response.text()}`);
  return jar;
}

// What the scenarios need of a server: sessions (anonymous, the reader's, the librarian's) and the form of an author.
async function setUp(name, seeded, password) {
  const ids = name === 'xufa' ? seeded.xufa : seeded.django;
  // 100 visitors, each with the session the home page gave it.
  const visitors = [];
  for (let i = 0; i < 100; i += 1) {
    const jar = new Jar();
    await (await jar.fetch('/catalog/')).text();
    visitors.push(jar.header);
  }
  const reader = await logIn('reader', password);
  const librarian = await logIn('librarian', password);
  // The forms of 50 authors, as the librarian sees them (sent back unchanged).
  const authorForms = [];
  for (let i = 0; i < 50; i += 1) {
    const formPath = `/catalog/author/${ids.firstAuthor + i * 7}/update/`;
    const page = await librarian.fetch(formPath);
    if (page.status !== 200) throw new Error(`${name}: the form of an author answered ${page.status}`);
    const values = formOf(await page.text(), name === 'xufa' ? 'firstName' : 'first_name');
    authorForms.push({ path: formPath, body: new URLSearchParams(values).toString() });
  }
  return { firstBook: ids.firstBook, visitors, reader: reader.header, librarian: librarian.header, authorForms };
}

// Each request of a scenario once: its status, and the size of its answer (both sides should be alike).
async function check(name, scenario, setup) {
  const sizes = [];
  for (const request of SCENARIOS[scenario].requests(setup)) {
    const response = await fetch(`http://127.0.0.1:${PORT}${request.path}`, {
      method: request.method || 'GET',
      headers: request.headers,
      body: request.body,
      redirect: 'manual',
    });
    const text = await response.text();
    const expected = SCENARIOS[scenario].expect || 200;
    if (response.status !== expected) {
      throw new Error(
        `${name} ${scenario} ${request.path}: ${response.status}, not ${expected}: ${text.slice(0, 300)}`
      );
    }
    sizes.push(Buffer.byteLength(text));
  }
  return Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
}

function load(scenario, setup, args, duration) {
  const expected = SCENARIOS[scenario].expect || 200;
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: `http://127.0.0.1:${PORT}`,
        connections: args.connections,
        pipelining: 1,
        // Threads of autocannon: one alone saturates before a fast server does.
        ...(args.clients > 1 ? { workers: args.clients } : {}),
        duration,
        requests: SCENARIOS[scenario].requests(setup).map((request) => ({ method: 'GET', ...request })),
      },
      (err, result) => {
        if (err) return reject(err);
        // By class (what autocannon gives with workers too): 2xx for pages, 3xx for the redirect of a form.
        const classes = ['1xx', '2xx', '3xx', '4xx', '5xx'];
        const statuses = Object.fromEntries(classes.filter((c) => result[c]).map((c) => [c, result[c]]));
        const good = result[`${String(expected)[0]}xx`] || 0;
        const total = classes.reduce((sum, c) => sum + (result[c] || 0), 0);
        resolve({
          rps: result.requests.average,
          p50: result.latency.p50,
          p99: result.latency.p99,
          errors: result.errors + result.timeouts + (total - good),
          statuses,
          total,
        });
      }
    );
  });
}

// The memory of a server, in MB, of every process of its group: rss, the resident size of each added up (the pages
// of files they share, the binary of Node.js or Python and their libraries, counted once by process), and pss, each
// shared page divided among the processes that map it (/proc/<pid>/smaps_rollup): what the server takes of the machine.
function memoryOf(server) {
  try {
    const lines = run('ps', ['-eo', 'pid=,pgid=,rss=']).split('\n');
    const processes = lines
      .map((line) => line.trim().split(/\s+/).map(Number))
      .filter(([, pgid]) => pgid === server.child.pid);
    const rss = processes.reduce((sum, [, , kb]) => sum + kb, 0);
    let pss = 0;
    for (const [pid] of processes) {
      try {
        pss += Number(/^Pss:\s+(\d+)/m.exec(fs.readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))[1]);
      } catch {
        pss = NaN; // (A process that ended meanwhile, or no smaps_rollup: no pss rather than a part of it.)
      }
    }
    return { rss: Math.round(rss / 1024), pss: Number.isNaN(pss) ? null : Math.round(pss / 1024) };
  } catch {
    return null;
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

function report(args, results, meta) {
  const djangoServers = args.servers.filter((name) => name !== 'xufa');
  const rows = args.scenarios.map((scenario) => {
    const of = (name) => {
      const runs = results[name][scenario];
      if (!runs || runs.length === 0) return null;
      return {
        rps: median(runs.map((r) => r.rps)),
        p50: median(runs.map((r) => r.p50)),
        p99: median(runs.map((r) => r.p99)),
        errors: runs.reduce((sum, r) => sum + r.errors, 0),
        spread: (Math.max(...runs.map((r) => r.rps)) / Math.min(...runs.map((r) => r.rps)) - 1) * 100,
        bytes: runs[0].bytes,
      };
    };
    const servers = Object.fromEntries(args.servers.map((name) => [name, of(name)]));
    const best = djangoServers.filter((name) => servers[name]).sort((a, b) => servers[b].rps - servers[a].rps)[0];
    return { scenario, title: SCENARIOS[scenario].title, servers, best };
  });
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const ms = (n) => `${n.toFixed(n < 10 ? 2 : 1)} ms`;
  const lines = [
    `# Django vs xufa: examples/locallibrary`,
    '',
    `${meta.date}. ${meta.cpu}, ${meta.cores} cores, ${meta.os}. ${args.processes} processes for each side, ` +
      `${args.connections} connections (autocannon in ${args.clients} threads, no pipelining), ${args.rounds} rounds of ${args.duration} s ` +
      `(after ${args.warmup} s of warm-up), medians.`,
    '',
    `Node.js ${meta.node}; Python ${meta.versions.python}, Django ${meta.versions.django}, gunicorn ${meta.versions.gunicorn}, ` +
      `granian ${meta.versions.granian}, uvicorn ${meta.versions.uvicorn}, psycopg ${meta.versions.psycopg}; PostgreSQL ${meta.pg}.`,
    '',
    '## xufa against the fastest Django of each scenario',
    '',
    '| Scenario | xufa req/s | Best Django req/s (server) | xufa / Django | p99 xufa | p99 Django | Bytes xufa / Django |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    const x = row.servers.xufa;
    const d = row.best && row.servers[row.best];
    if (!x || !d) continue;
    lines.push(
      `| ${row.scenario}: ${row.title} | ${fmt(x.rps)} | ${fmt(d.rps)} (${row.best}) | **${(x.rps / d.rps).toFixed(2)}x** | ` +
        `${ms(x.p99)} | ${ms(d.p99)} | ${fmt(x.bytes)} / ${fmt(d.bytes)} |`
    );
  }
  lines.push('', '## Every server (req/s, p50 / p99, spread of the rounds)', '');
  lines.push(`| Scenario | ${args.servers.join(' | ')} |`, `| --- |${args.servers.map(() => ' ---: |').join('')}`);
  for (const row of rows) {
    const cells = args.servers.map((name) => {
      const s = row.servers[name];
      if (!s) return '—';
      const warn = s.spread > 10 ? ' ⚠' : '';
      const errors = s.errors ? ` (${s.errors} errors)` : '';
      return `${fmt(s.rps)}<br>${ms(s.p50)} / ${ms(s.p99)}<br>±${s.spread.toFixed(0)}%${warn}${errors}`;
    });
    lines.push(`| ${row.scenario} | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Memory (all processes, MB, after the scenarios)', '');
  lines.push(
    'rss: the resident size of each process added up (the pages of files they share counted once by process); pss: each shared page divided among the processes that map it, what the server takes of the machine.',
    ''
  );
  lines.push(`| | ${args.servers.join(' | ')} |`, `| --- |${args.servers.map(() => ' ---: |').join('')}`);
  const cellsOf = (values) =>
    args.servers.map((name) => (values && values[name] && values[name].length ? median(values[name]) : '—'));
  lines.push(`| rss | ${cellsOf(meta.memory).join(' | ')} |`, `| pss | ${cellsOf(meta.pss).join(' | ')} |`);
  lines.push(
    '',
    '## How',
    '',
    '- The same app: the MDN LocalLibrary tutorial (examples/django-locallibrary) and its port to xufa ' +
      '(examples/locallibrary), with the same data (bench/django/data.mjs) in two databases of the same PostgreSQL.',
    '- Django at its best (bench/django/site/benchsite): DEBUG off (cached templates), psycopg 3 (binary), persistent ' +
      'connections, no static files middleware, no request log; the lists load their relations as the port does ' +
      "(select_related/prefetch_related; the tutorial's views make a query per book).",
    '- xufa as deployed: NODE_ENV=production, no request log, no queue workers in the web processes, no audit log.',
    '- Sessions in the database on both sides. bench/hello and bench/book/<id>.json are pages of the benchmark ' +
      '(bench/django/site/benchsite/urls.py, bench/django/xufa-server.mjs).',
    '- Each round starts each server again, in turns, and runs every scenario; ⚠: the rounds differ by more than 10%.'
  );
  return { text: `${lines.join('\n')}\n`, rows };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (process.platform !== 'linux') throw new Error('django.js runs in Linux: pnpm bench:linux django ...');
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(
    PROGRESS,
    `${new Date().toISOString()} ${process.argv.slice(2).join(' ')}
`
  );
  const versions = venv();
  const pg = postgres();
  console.log(`django: PostgreSQL ${pg.version}, Python ${versions.python}, Django ${versions.django}`);
  const seeded = databases(pg);
  const { PASSWORD } = await import(path.join(__dirname, 'django', 'data.mjs'));

  const results = Object.fromEntries(args.servers.map((name) => [name, {}]));
  const memory = Object.fromEntries(args.servers.map((name) => [name, []]));
  const pss = Object.fromEntries(args.servers.map((name) => [name, []]));
  for (let round = 0; round < args.rounds; round += 1) {
    // Turns: each round starts from another server.
    const order = args.servers.map((_, i) => args.servers[(i + round) % args.servers.length]);
    for (const name of order) {
      await portFree();
      const server = startServer(name, args.processes);
      try {
        await waitReady(server);
        const setup = await setUp(name, seeded, PASSWORD);
        for (const scenario of args.scenarios) {
          const bytes = await check(name, scenario, setup);
          await load(scenario, setup, args, args.warmup);
          const result = await load(scenario, setup, args, args.duration);
          (results[name][scenario] ||= []).push({ ...result, bytes });
          const line =
            `  round ${round + 1} ${name.padEnd(16)} ${scenario.padEnd(14)} ${Math.round(result.rps).toString().padStart(7)} req/s` +
            `  p99 ${result.p99} ms${result.errors ? `  ${result.errors} errors` : ''}`;
          console.log(line);
          // Each result as it is measured, in a file: a long run shows what it has (tail -f ~/bench-django/progress.log).
          fs.appendFileSync(
            PROGRESS,
            `${new Date().toISOString().slice(11, 19)}${line}
`
          );
        }
        const mb = memoryOf(server);
        if (mb) memory[name].push(mb.rss);
        if (mb && mb.pss !== null) pss[name].push(mb.pss);
      } catch (err) {
        console.error(`  ${name}: ${err.message}`);
      } finally {
        await stopServer(server);
      }
    }
  }

  const meta = {
    date: new Date().toISOString().slice(0, 10),
    cpu: os.cpus()[0].model.trim(),
    cores: os.cpus().length,
    os: `${os.type()} ${os.release()}`,
    node: process.version,
    pg: pg.version,
    versions,
    memory,
    pss,
  };
  const { text, rows } = report(args, results, meta);
  console.log(`\n${text}`);
  if (args.out) {
    const file = path.join(__dirname, args.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.md`, text);
    fs.writeFileSync(`${file}.json`, JSON.stringify({ args, meta, results, rows }, null, 2));
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { setUp, check, load, formOf, postgres, dbUrl, SCENARIOS, PORT };
