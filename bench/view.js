// Large pages through reply.view (@xufa/template's plugin) on a real server, the view rendered whole (string) and sent in
// chunks (stream): the time to the first byte, the time of the whole page and the peak of the memory of the server
// while it sends them. Each mode and size runs in a server of its own (a process), the requests are taken over the
// loopback by the parent, and the median of the requests is shown.
//
// node bench/view.js [--rows 10000,50000,200000] [--requests 7] [--modes string,stream]
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

function parseArgs(argv) {
  const args = { rows: [10000, 50000, 200000], requests: 7, modes: ['string', 'stream'] };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i].replace(/^--/, '');
    if (!(name in args)) throw new Error(`Unknown option --${name}`);
    if (name === 'requests') args.requests = Number(argv[i + 1]);
    else if (name === 'rows') args.rows = argv[i + 1].split(',').map(Number);
    else args.modes = argv[i + 1].split(',');
  }
  return args;
}

// The server: a table of `rows` customers in a layout, rendered whole or streamed. It sends its port, then the peak of
// its memory (rss over the start) when asked.
async function server(rows, mode) {
  const xufa = require('@xufa/http'); // eslint-disable-line global-require
  const template = require('@xufa/template'); // eslint-disable-line global-require
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-bench-view-'));
  fs.writeFileSync(
    path.join(root, 'layout.html'),
    '<!doctype html><html><head><title>{{ title }}</title></head><body>{{ body }}</body></html>'
  );
  fs.writeFileSync(
    path.join(root, 'table.html'),
    '<h1>{{ title }}</h1><table>{{#each items as item}}<tr><td>{{ item.id }}</td><td>{{ item.name }}</td>' +
      '<td>{{ item.email }}</td><td>{{ item.total }}</td></tr>{{/each}}</table>'
  );
  const items = Array.from({ length: rows }, (_, i) => ({
    id: i,
    name: `Customer <${i}>`,
    email: `c${i}@example.com`,
    total: i * 3.5,
  }));
  const app = xufa();
  app.register(template.plugin, { root, layout: 'layout', cache: true });
  app.get('/', (request, reply) => reply.view('table', { title: 'Customers', items }, { stream: mode === 'stream' }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  let base = 0;
  let peak = 0;
  let timer = null;
  process.on('message', (message) => {
    if (message === 'start') {
      global.gc();
      base = process.memoryUsage().rss;
      peak = base;
      timer = setInterval(() => {
        peak = Math.max(peak, process.memoryUsage().rss);
      }, 1);
      process.send({ started: true });
    } else if (message === 'gc') {
      global.gc();
      process.send({ collected: true });
    } else if (message === 'stop') {
      clearInterval(timer);
      process.send({ peak: peak - base });
      app.close().then(() => {
        fs.rmSync(root, { recursive: true, force: true });
        process.exit(0);
      });
    }
  });
  process.send({ port: app.server.address().port });
}

function get(port) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    let first = null;
    let size = 0;
    http
      .get({ host: '127.0.0.1', port, path: '/' }, (res) => {
        res.on('data', (chunk) => {
          if (first === null) first = Number(process.hrtime.bigint() - start) / 1e6;
          size += chunk.length;
        });
        res.on('end', () => resolve({ first, total: Number(process.hrtime.bigint() - start) / 1e6, size }));
      })
      .on('error', reject);
  });
}

function ask(child, message, key) {
  return new Promise((resolve) => {
    const listener = (reply) => {
      if (key in reply) {
        child.off('message', listener);
        resolve(reply[key]);
      }
    };
    child.on('message', listener);
    child.send(message);
  });
}

async function measure(rows, mode, requests) {
  const child = fork(__filename, ['--server', String(rows), mode], { execArgv: ['--expose-gc'] });
  const port = await new Promise((resolve) => {
    child.once('message', (message) => resolve(message.port));
  });
  for (let i = 0; i < 3; i += 1) await get(port); // warm
  await ask(child, 'start', 'started');
  const runs = [];
  for (let i = 0; i < requests; i += 1) {
    await ask(child, 'gc', 'collected');
    runs.push(await get(port));
  }
  const peak = await ask(child, 'stop', 'peak');
  const median = (key) => [...runs].map((run) => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  return { first: median('first'), total: median('total'), size: runs[0].size, peak };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write('| Rows | Size | Mode | First byte (ms) | Whole page (ms) | Memory peak of the server |\n');
  process.stdout.write('| ---: | ---: | --- | ---: | ---: | ---: |\n');
  for (const rows of args.rows) {
    for (const mode of args.modes) {
      const result = await measure(rows, mode, args.requests);
      process.stdout.write(
        `| ${rows.toLocaleString('en-US')} | ${(result.size / 1e6).toFixed(1)} MB | ${mode} | ` +
          `${result.first.toFixed(1)} | ${result.total.toFixed(1)} | +${(result.peak / 1e6).toFixed(0)} MB |\n`
      );
    }
  }
}

if (process.argv[2] === '--server') server(Number(process.argv[3]), process.argv[4]);
else main();
