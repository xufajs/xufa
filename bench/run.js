// Benchmark harness: every framework serves every scenario in a process of its own, autocannon loads it from this
// process, and the frameworks take turns round after round so that drifts of the machine hit all of them alike.
//
// node run.js [--scenarios a,b] [--frameworks xufa,fastify,node] [--duration 10] [--warmup 3] [--rounds 3]
//             [--connections 100] [--pipelining 10] [--workers 0] [--out results/name]
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const autocannon = require('autocannon');

const SCENARIO_DIR = path.join(__dirname, 'scenarios');

function parseArgs(argv) {
  const args = {
    scenarios: null,
    frameworks: ['xufa', 'fastify', 'node'],
    duration: 10,
    warmup: 3,
    rounds: 3,
    connections: 100,
    pipelining: 10,
    workers: 0,
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const name = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    i += 1;
    if (name === 'scenarios' || name === 'frameworks') args[name] = value.split(',');
    else if (name === 'out') args.out = value;
    else if (name in args) args[name] = Number(value);
    else throw new Error(`Unknown option --${name}`);
  }
  if (!args.scenarios) {
    args.scenarios = fs
      .readdirSync(SCENARIO_DIR)
      .filter((file) => file.endsWith('.js'))
      .map((file) => file.slice(0, -3));
  }
  return args;
}

function startServer(framework, scenario) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(__dirname, 'server.js'), [framework, scenario], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      // Flags for the servers (V8 experiments): BENCH_SERVER_FLAGS='--no-turbo-inlining'.
      execArgv: process.env.BENCH_SERVER_FLAGS ? process.env.BENCH_SERVER_FLAGS.split(' ') : [],
    });
    child.once('message', (message) => resolve({ child, port: message.port }));
    child.once('exit', (code) => reject(new Error(`${framework} server for ${scenario} exited with ${code}`)));
  });
}

// The processor time (µs) the server spends while fn runs.
async function measureCpu(server, fn) {
  server.child.send('cpu-start');
  const result = await fn();
  const cpu = await new Promise((resolve) => {
    const onMessage = (message) => {
      if (message && message.cpu !== undefined) {
        server.child.off('message', onMessage);
        resolve(message.cpu);
      }
    };
    server.child.on('message', onMessage);
    server.child.send('cpu-stop');
  });
  return { result, cpu };
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (server.child.exitCode !== null) {
      resolve();
      return;
    }
    server.child.removeAllListeners('exit');
    server.child.once('exit', resolve);
    server.child.kill('SIGKILL');
  });
}

async function check(port, scenario) {
  const { request, expect } = scenario;
  const response = await fetch(`http://127.0.0.1:${port}${request.path}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });
  const body = await response.text();
  if (response.status !== expect.status) {
    return `status ${response.status}, expected ${expect.status} (body: ${body.slice(0, 200)})`;
  }
  if (expect.body !== undefined && body !== expect.body) {
    return `body ${body.slice(0, 200)}, expected ${expect.body.slice(0, 200)}`;
  }
  return null;
}

function load(port, scenario, duration, args) {
  const { request } = scenario;
  return new Promise((resolve, reject) => {
    const options = {
      url: `http://127.0.0.1:${port}${request.path}`,
      method: request.method,
      headers: request.headers,
      body: request.body,
      connections: args.connections,
      pipelining: args.pipelining,
      duration,
    };
    if (args.workers > 0) options.workers = args.workers;
    autocannon(options, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const fmt = (n) => Math.round(n).toLocaleString('en-US');

async function runScenario(name, args) {
  const scenario = require(path.join(SCENARIO_DIR, `${name}.js`));
  const frameworks = args.frameworks.filter((fw) => fw !== 'node' || scenario.node);
  const runs = Object.fromEntries(frameworks.map((fw) => [fw, []]));
  const failed = {};
  for (let round = 0; round < args.rounds; round += 1) {
    // Rotate the order every round.
    const order = frameworks.map((_, i) => frameworks[(i + round) % frameworks.length]);
    for (const fw of order) {
      if (failed[fw]) continue;
      const server = await startServer(fw, name);
      try {
        const problem = await check(server.port, scenario);
        if (problem) {
          failed[fw] = problem;
          continue;
        }
        if (args.warmup > 0) await load(server.port, scenario, args.warmup, args);
        const { result, cpu } = await measureCpu(server, () => load(server.port, scenario, args.duration, args));
        const bad = result.errors + result.timeouts + (scenario.expect.status < 400 ? result.non2xx : 0);
        runs[fw].push({
          rps: result.requests.average,
          p50: result.latency.p50,
          p99: result.latency.p99,
          throughput: result.throughput.average,
          // Microseconds of server processor time per request: what the framework costs, even when the network
          // (and not the server) limits the requests per second.
          cpuPerReq: cpu / result.requests.total,
          bad,
        });
        process.stdout.write(
          `  ${name} round ${round + 1} ${fw}: ${fmt(result.requests.average)} req/s, ` +
            `${(cpu / result.requests.total).toFixed(1)} µs cpu/req\n`
        );
      } finally {
        await stopServer(server);
      }
    }
  }
  const summary = {};
  for (const fw of frameworks) {
    if (failed[fw]) {
      summary[fw] = { failed: failed[fw] };
      continue;
    }
    const list = runs[fw];
    summary[fw] = {
      rps: median(list.map((r) => r.rps)),
      min: Math.min(...list.map((r) => r.rps)),
      max: Math.max(...list.map((r) => r.rps)),
      p50: median(list.map((r) => r.p50)),
      p99: median(list.map((r) => r.p99)),
      throughput: median(list.map((r) => r.throughput)),
      cpuPerReq: median(list.map((r) => r.cpuPerReq)),
      bad: list.reduce((sum, r) => sum + r.bad, 0),
      runs: list,
    };
  }
  return { name, description: scenario.description, summary };
}

// Rounds of a framework further apart than this (relative to their median) are not to be trusted.
const NOISY_SPREAD = 0.1;

function spreadNote(s) {
  const spread = (s.max - s.min) / s.rps;
  return spread > NOISY_SPREAD ? ` ⚠${Math.round(spread * 100)}%` : '';
}

function table(results, frameworks) {
  const lines = [];
  const header = ['Scenario', ...frameworks.map((fw) => `${fw} req/s`), 'xufa / fastify'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const { name, summary } of results) {
    const cells = frameworks.map((fw) => {
      const s = summary[fw];
      if (!s) return '-';
      if (s.failed) return 'FAILED';
      return `${fmt(s.rps)}${spreadNote(s)}${s.bad ? ` (${s.bad} bad)` : ''}`;
    });
    const x = summary.xufa;
    const f = summary.fastify;
    const ratio = x && f && !x.failed && !f.failed ? `**${(x.rps / f.rps).toFixed(2)}x**` : '-';
    lines.push(`| ${name} | ${cells.join(' | ')} | ${ratio} |`);
  }
  lines.push('', `⚠ marks rounds spread more than ${NOISY_SPREAD * 100}% apart: the machine was busy, run again.`);
  return lines.join('\n');
}

function cpuTable(results, frameworks) {
  const lines = [];
  const header = ['Scenario', ...frameworks.map((fw) => `${fw} µs/req`), 'fastify / xufa'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const { name, summary } of results) {
    const cells = frameworks.map((fw) => {
      const s = summary[fw];
      if (!s || s.failed) return '-';
      return s.cpuPerReq.toFixed(1);
    });
    const x = summary.xufa;
    const f = summary.fastify;
    const ratio = x && f && !x.failed && !f.failed ? `**${(f.cpuPerReq / x.cpuPerReq).toFixed(2)}x**` : '-';
    lines.push(`| ${name} | ${cells.join(' | ')} | ${ratio} |`);
  }
  return lines.join('\n');
}

function latencyTable(results, frameworks) {
  const lines = [];
  const header = ['Scenario', ...frameworks.map((fw) => `${fw} p50 / p99 ms`)];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map((_, i) => (i === 0 ? '---' : '---:')).join(' | ')} |`);
  for (const { name, summary } of results) {
    const cells = frameworks.map((fw) => {
      const s = summary[fw];
      if (!s || s.failed) return '-';
      return `${s.p50} / ${s.p99}`;
    });
    lines.push(`| ${name} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

function versions() {
  const read = (name) => {
    try {
      return require(`${name}/package.json`).version;
    } catch {
      return null;
    }
  };
  return { node: process.version, xufa: read('@xufa/http'), fastify: read('fastify'), autocannon: read('autocannon') };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = {
    ...versions(),
    cpu: os.cpus()[0].model,
    cores: os.cpus().length,
    platform: `${os.platform()} ${os.release()}`,
    date: new Date().toISOString(),
    options: {
      duration: args.duration,
      warmup: args.warmup,
      rounds: args.rounds,
      connections: args.connections,
      pipelining: args.pipelining,
      workers: args.workers,
    },
  };
  process.stdout.write(
    `Node ${env.node}, xufa ${env.xufa}, fastify ${env.fastify}, ${env.cpu}\n` +
      `${args.connections} connections, pipelining ${args.pipelining}, ${args.duration} s (+${args.warmup} s warmup), ` +
      `${args.rounds} rounds, median shown\n\n`
  );
  const results = [];
  for (const name of args.scenarios) {
    results.push(await runScenario(name, args));
  }
  const frameworks = args.frameworks;
  const failures = results.flatMap(({ name, summary }) =>
    Object.entries(summary)
      .filter(([, s]) => s.failed)
      .map(([fw, s]) => `- ${name} / ${fw}: ${s.failed}`)
  );
  const markdown =
    `${table(results, frameworks)}\n\nServer processor time per request (lower is better):\n\n` +
    `${cpuTable(results, frameworks)}\n\n${latencyTable(results, frameworks)}\n` +
    `${failures.length ? `\nFailed checks:\n${failures.join('\n')}\n` : ''}`;
  process.stdout.write(`\n${markdown}`);
  if (args.out) {
    const out = path.resolve(__dirname, args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(`${out}.json`, JSON.stringify({ env, results }, null, 2));
    fs.writeFileSync(`${out}.md`, `${JSON.stringify(env)}\n\n${markdown}`);
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`);
  process.exit(1);
});
