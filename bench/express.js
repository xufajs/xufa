// Express 5 against @xufa/express (its own implementation of Express's API), on the same app (express/app.js): each
// scenario loaded with autocannon on one and the other in turn, the order changing every round (a machine drifts
// between runs: alternating keeps the comparison fair), medians of the rounds.
//
//   node express.js [--rounds 5] [--duration 5] [--warmup 1] [--connections 50] [--scenarios hello,json,...]
//                   [--out results/express-1] [--profile <scenario>] (@xufa/express with --cpu-prof, that scenario)
//                   [--same 1] (Express in both places: how far apart the same code reads, the noise of the machine)
//
// On Windows the servers run on logical CPUs 0-3 and this driver on 4-7 (P-cores of a hybrid laptop: the E-cores
// are half as fast); elsewhere they are not pinned.
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const autocannon = require('autocannon');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1]] : null))
    .filter(Boolean)
);
const ROUNDS = Number(args.rounds ?? 5);
const DURATION = Number(args.duration ?? 5);
const WARMUP = Number(args.warmup ?? 1);
const CONNECTIONS = Number(args.connections ?? 50);
const PROFILE = args.profile;

const BODY = JSON.stringify({
  title: 'A book',
  authors: ['Ada', 'Grace'],
  pages: 320,
  chapters: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, title: `Chapter ${i + 1}`, words: 4000 + i })),
});
const SCENARIOS = {
  hello: { path: '/hello' },
  json: { path: '/json' },
  params: { path: '/users/42/books/7' },
  query: { path: '/search?q=express&page=2&tags=a&tags=b' },
  body: { method: 'POST', path: '/echo', body: BODY, headers: { 'content-type': 'application/json' } },
  middleware: { path: '/mw/end' },
  'large-first': { path: '/api/r0/items' },
  'large-last': { path: '/api/r39/items/123' },
  nested: { path: '/libraries/central/shelves/3' },
  'big-json': { path: '/books' },
  static: { path: '/static/site.css' },
  'not-found': { path: '/missing' },
  error: { path: '/fail' },
};
const NAMES = args.scenarios ? args.scenarios.split(',') : Object.keys(SCENARIOS);
const IMPLEMENTATIONS = PROFILE ? ['xufa'] : ['express', 'xufa'];
const LABELS = { express: 'Express 5', xufa: '@xufa/express' };
const PORTS = { express: 18101, xufa: 18102 };

function pin(pid, mask) {
  if (process.platform !== 'win32') return;
  execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).ProcessorAffinity = ${mask}`]);
}

function start(name) {
  const flags = PROFILE ? ['--cpu-prof', `--cpu-prof-dir=${path.join(__dirname, 'results', 'profiles')}`] : [];
  const child = spawn(
    process.execPath,
    [...flags, path.join(__dirname, 'express', 'server.js'), name, String(PORTS[name])],
    {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: args.same ? { ...process.env, BENCH_SAME: '1' } : process.env,
    }
  );
  pin(child.pid, 0xf);
  return new Promise((resolve, reject) => {
    child.stdout.once('data', () => resolve(child));
    child.once('exit', (code) => reject(new Error(`${name} exited (${code})`)));
  });
}

function load(name, scenario, duration) {
  const { method = 'GET', path: url, body, headers } = SCENARIOS[scenario];
  return new Promise((resolve, reject) => {
    autocannon(
      { url: `http://127.0.0.1:${PORTS[name]}${url}`, method, body, headers, connections: CONNECTIONS, duration },
      (error, result) => (error ? reject(error) : resolve(result))
    );
  });
}

async function check(scenario) {
  const { method = 'GET', path: url, body, headers } = SCENARIOS[scenario];
  const answers = await Promise.all(
    IMPLEMENTATIONS.map(async (name) => {
      const response = await fetch(`http://127.0.0.1:${PORTS[name]}${url}`, { method, body, headers });
      return { status: response.status, body: await response.text() };
    })
  );
  if (answers.some((answer) => answer.status !== answers[0].status || answer.body !== answers[0].body)) {
    throw new Error(`${scenario}: the answers differ: ${JSON.stringify(answers).slice(0, 300)}`);
  }
  return answers[0].status;
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function main() {
  pin(process.pid, 0xf0);
  const servers = {};
  for (const name of IMPLEMENTATIONS) servers[name] = await start(name);
  const runs = Object.fromEntries(NAMES.map((scenario) => [scenario, { express: [], xufa: [] }]));
  try {
    for (const scenario of NAMES) {
      const status = await check(scenario);
      process.stdout.write(`${scenario}: ${status}, the same answer\n`);
    }
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const scenario of NAMES) {
        const order = round % 2 === 0 ? IMPLEMENTATIONS : [...IMPLEMENTATIONS].reverse();
        for (const name of order) {
          if (WARMUP > 0) await load(name, scenario, WARMUP);
          const result = await load(name, scenario, DURATION);
          if (
            result.errors ||
            result.non2xx !== (scenario === 'not-found' || scenario === 'error' ? result.requests.total : 0)
          ) {
            process.stdout.write(`  (${name} ${scenario}: ${result.errors} errors, ${result.non2xx} non 2xx)\n`);
          }
          runs[scenario][name].push({ rps: result.requests.average, p99: result.latency.p99 });
        }
      }
      process.stdout.write(`round ${round + 1} of ${ROUNDS} done\n`);
    }
  } finally {
    for (const child of Object.values(servers)) child.stdin.end();
  }

  const rows = NAMES.map((scenario) => {
    const row = { scenario };
    for (const name of IMPLEMENTATIONS) {
      row[LABELS[name]] = Math.round(median(runs[scenario][name].map((run) => run.rps)));
      row[`${LABELS[name]} p99`] = median(runs[scenario][name].map((run) => run.p99));
    }
    // (The ratio of each round's pair, adjacent in time, then their median: what drifts between rounds cancels.)
    if (!PROFILE) {
      const pairs = runs[scenario].xufa.map((run, i) => run.rps / runs[scenario].express[i].rps);
      row.ratio = Number(median(pairs).toFixed(2));
      row.spread = `${Math.min(...pairs).toFixed(2)}-${Math.max(...pairs).toFixed(2)}`;
    }
    return row;
  });
  console.table(rows);
  if (args.out) {
    const file = path.join(__dirname, `${args.out}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const settings = { rounds: ROUNDS, duration: DURATION, warmup: WARMUP, connections: CONNECTIONS };
    fs.writeFileSync(file, `${JSON.stringify({ date: new Date().toISOString(), settings, rows, runs }, null, 2)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
