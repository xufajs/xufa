// In-process benchmark: the requests of every scenario are given to the request handler of the server directly, with
// node's own IncomingMessage and ServerResponse over sockets that discard what is written. There is no network and no
// HTTP parsing, so what is measured is the framework (and the response writing of node), not the operating system.
//
// node inproc.js [--scenarios a,b] [--frameworks xufa,fastify,node] [--duration 3] [--warmup 1] [--rounds 3]
//                [--concurrency 32] [--out results/name]
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCENARIO_DIR = path.join(__dirname, 'scenarios');

function parseArgs(argv) {
  const args = {
    scenarios: null,
    frameworks: ['xufa', 'fastify', 'node'],
    duration: 3,
    warmup: 1,
    rounds: 3,
    concurrency: 32,
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

// ---- Child: measures one framework on one scenario ----

async function child(framework, scenarioName, options) {
  const http = require('node:http');
  const { Duplex } = require('node:stream');
  const scenario = require(path.join(SCENARIO_DIR, `${scenarioName}.js`));

  let server;
  if (framework === 'node') {
    server = scenario.node(http);
  } else {
    const Framework = framework === 'xufa' ? require('@xufa/http') : require('fastify');
    const app = await scenario.build(Framework, framework);
    await app.ready();
    server = app.server;
  }
  const [handler] = server.listeners('request');

  // A socket keeping what is written of the response it carries (only to check it).
  class NullSocket extends Duplex {
    constructor() {
      super();
      this.remoteAddress = '127.0.0.1';
      this.remotePort = 54321;
      this.localAddress = '127.0.0.1';
      this.localPort = 3000;
      this.encrypted = false;
      this.chunks = null;
      this.server = server;
    }

    _read() {}

    _write(chunk, encoding, callback) {
      if (this.chunks !== null) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      callback();
    }

    setTimeout() {
      return this;
    }

    setNoDelay() {
      return this;
    }

    setKeepAlive() {
      return this;
    }

    address() {
      return { address: '127.0.0.1', family: 'IPv4', port: 3000 };
    }
  }

  const { request } = scenario;
  const rawHeaders = [];
  const headers = { host: 'localhost:3000', ...request.headers };
  const body = request.body === undefined ? null : Buffer.from(request.body);
  if (body !== null) headers['content-length'] = String(body.length);
  for (const name of Object.keys(headers)) rawHeaders.push(name, headers[name]);

  function send(socket) {
    return new Promise((resolve, reject) => {
      const req = new http.IncomingMessage(socket);
      req.method = request.method;
      req.url = request.path;
      req.httpVersion = '1.1';
      req.httpVersionMajor = 1;
      req.httpVersionMinor = 1;
      req.headers = { ...headers };
      req.rawHeaders = rawHeaders;
      if (body !== null) req.push(body);
      req.push(null);
      req.complete = true;
      const res = new http.ServerResponse(req);
      res.shouldKeepAlive = true;
      res.assignSocket(socket);
      res.once('finish', () => {
        res.detachSocket(socket);
        resolve(res.statusCode);
      });
      res.once('error', reject);
      handler.call(server, req, res);
    });
  }

  // The response is checked once.
  const probe = new NullSocket();
  probe.chunks = [];
  const status = await send(probe);
  const raw = Buffer.concat(probe.chunks).toString();
  const sent = raw.slice(raw.indexOf('\r\n\r\n') + 4);
  // A chunked body is decoded for the comparison.
  const chunked = /transfer-encoding: chunked/i.test(raw);
  const payload = chunked ? decodeChunked(sent) : sent;
  if (status !== scenario.expect.status) return { failed: `status ${status}, expected ${scenario.expect.status}` };
  if (scenario.expect.body !== undefined && payload !== scenario.expect.body) {
    return { failed: `body ${payload.slice(0, 200)}, expected ${scenario.expect.body.slice(0, 200)}` };
  }

  const sockets = Array.from({ length: options.concurrency }, () => new NullSocket());
  async function runFor(ms) {
    let count = 0;
    const end = performance.now() + ms;
    await Promise.all(
      sockets.map(async (socket) => {
        while (performance.now() < end) {
          await send(socket);
          count += 1;
        }
      })
    );
    return count;
  }

  await runFor(options.warmup * 1000);
  const rounds = [];
  for (let i = 0; i < options.rounds; i += 1) {
    const cpuStart = process.cpuUsage();
    const start = performance.now();
    const count = await runFor(options.duration * 1000);
    const elapsed = performance.now() - start;
    const cpu = process.cpuUsage(cpuStart);
    rounds.push({ rps: (count * 1000) / elapsed, cpuPerReq: (cpu.user + cpu.system) / count });
  }
  return { rounds };
}

function decodeChunked(text) {
  let out = '';
  let rest = text;
  for (;;) {
    const lineEnd = rest.indexOf('\r\n');
    const size = parseInt(rest.slice(0, lineEnd), 16);
    if (!size) return out;
    out += rest.slice(lineEnd + 2, lineEnd + 2 + size);
    rest = rest.slice(lineEnd + 4 + size);
  }
}

// ---- Parent ----

function measure(framework, scenario, args) {
  return new Promise((resolve, reject) => {
    const proc = fork(__filename, ['--child', framework, scenario, JSON.stringify(args)], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      execArgv: [],
    });
    proc.once('message', resolve);
    proc.once('exit', (code) => reject(new Error(`${framework} on ${scenario} exited with ${code}`)));
  });
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const fmt = (n) => Math.round(n).toLocaleString('en-US');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(
    `Node ${process.version}, ${os.cpus()[0].model}, in process: ${args.concurrency} requests in flight, ` +
      `${args.rounds} rounds of ${args.duration} s (+${args.warmup} s warmup), the frameworks taking turns (a round ` +
      `each in a process of its own), median shown\n\n`
  );
  const lines = [
    `| Scenario | ${args.frameworks.map((fw) => `${fw} req/s | ${fw} µs/req`).join(' | ')} | xufa / fastify |`,
    `| --- | ${args.frameworks.map(() => '---: | ---:').join(' | ')} | ---: |`,
  ];
  const results = [];
  for (const name of args.scenarios) {
    const scenario = require(path.join(SCENARIO_DIR, `${name}.js`));
    const summary = {};
    const frameworks = args.frameworks.filter((fw) => fw !== 'node' || scenario.node);
    const rounds = Object.fromEntries(frameworks.map((fw) => [fw, []]));
    // The frameworks take turns, a round each in a process of its own: a moment the machine is busy falls on one round
    // of one of them, not on all the rounds of one.
    for (let round = 0; round < args.rounds; round += 1) {
      for (const fw of frameworks) {
        if (summary[fw] && summary[fw].failed) continue;
        const result = await measure(fw, name, {
          ...args,
          rounds: 1,
          warmup: round === 0 ? args.warmup : args.warmup / 2,
        });
        if (result.failed) {
          summary[fw] = { failed: result.failed };
          process.stdout.write(`  ${name} ${fw}: FAILED ${result.failed}\n`);
          continue;
        }
        rounds[fw].push(result.rounds[0]);
      }
    }
    for (const fw of frameworks) {
      if (summary[fw]) continue;
      summary[fw] = {
        rps: median(rounds[fw].map((r) => r.rps)),
        cpuPerReq: median(rounds[fw].map((r) => r.cpuPerReq)),
        rounds: rounds[fw],
      };
      process.stdout.write(
        `  ${name} ${fw}: ${fmt(summary[fw].rps)} req/s, ${summary[fw].cpuPerReq.toFixed(2)} µs/req\n`
      );
    }
    results.push({ name, summary });
    const cells = args.frameworks.map((fw) => {
      const s = summary[fw];
      if (!s) return '- | -';
      if (s.failed) return 'FAILED | -';
      // Rounds further apart than 10% (of the fastest): the machine was busy.
      const times = s.rounds.map((r) => r.cpuPerReq);
      const spread = (Math.max(...times) - Math.min(...times)) / Math.min(...times);
      const note = spread > 0.1 ? ` ⚠${Math.round(spread * 100)}%` : '';
      return `${fmt(s.rps)} | ${s.cpuPerReq.toFixed(2)}${note}`;
    });
    const x = summary.xufa;
    const f = summary.fastify;
    const ratio = x && f && !x.failed && !f.failed ? `**${(x.rps / f.rps).toFixed(2)}x**` : '-';
    lines.push(`| ${name} | ${cells.join(' | ')} | ${ratio} |`);
  }
  lines.push('', '⚠ marks rounds more than 10% apart: the machine was busy, run again.');
  const markdown = lines.join('\n');
  process.stdout.write(`\n${markdown}\n`);
  if (args.out) {
    const out = path.resolve(__dirname, args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(`${out}.json`, JSON.stringify({ node: process.version, args, results }, null, 2));
    fs.writeFileSync(`${out}.md`, `${markdown}\n`);
  }
}

if (process.argv[2] === '--child') {
  const [, , , framework, scenario, options] = process.argv;
  child(framework, scenario, JSON.parse(options))
    .then((result) =>
      process.send ? process.send(result, () => process.exit(0)) : console.log(JSON.stringify(result))
    )
    .catch((err) => {
      process.stderr.write(`${err.stack}\n`);
      process.exit(1);
    });
} else {
  main().catch((err) => {
    process.stderr.write(`${err.stack}\n`);
    process.exit(1);
  });
}
