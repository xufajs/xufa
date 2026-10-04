// @xufa/router against find-my-way: find() (same API, query string parsed) and match() (the path xufa uses).
// Each router and case runs in a process of its own, so that no case inherits the type feedback of another.
// node bench/micro/router.js [iterations] [rounds]
const { execFileSync } = require('node:child_process');

const resources = [
  'users',
  'posts',
  'comments',
  'orders',
  'products',
  'carts',
  'invoices',
  'teams',
  'projects',
  'tasks',
];

const cases = {
  'static /': ['GET', '/'],
  'static deep': ['GET', '/api/tasks/search/recent'],
  'one param': ['GET', '/api/users/42'],
  'two params': ['GET', '/api/tasks/123/comments/456'],
  wildcard: ['GET', '/files/projects/a/b/c.txt'],
  'multi param': ['GET', '/img/logo.png'],
  'regex param': ['GET', '/num/12345'],
  'with query': ['GET', '/api/users/42?fields=name,email&page=2'],
  'encoded param': ['GET', '/api/users/caf%C3%A9'],
  'not found': ['GET', '/api/nothing/here'],
};

function register(router) {
  const noop = () => {};
  router.on('GET', '/', noop);
  router.on('GET', '/health', noop);
  for (const r of resources) {
    router.on('GET', `/api/${r}`, noop);
    router.on('POST', `/api/${r}`, noop);
    router.on('GET', `/api/${r}/:id`, noop);
    router.on('PUT', `/api/${r}/:id`, noop);
    router.on('GET', `/api/${r}/:id/comments/:commentId`, noop);
    router.on('GET', `/api/${r}/search/recent`, noop);
    router.on('GET', `/files/${r}/*`, noop);
  }
  router.on('GET', '/img/:name.:ext', noop);
  router.on('GET', '/num/:id(^\\d+$)', noop);
  return router;
}

const routers = {
  'find-my-way find': () => {
    const r = register(require('find-my-way')());
    return (m, p) => r.find(m, p);
  },
  'xufa find': () => {
    const r = register(require('@xufa/router')());
    return (m, p) => r.find(m, p);
  },
  'xufa match': () => {
    const r = register(require('@xufa/router')());
    return (m, p) => r.match(m, p);
  },
};

// The handler and the parameters found are kept, as a server would use them.
function child(routerName, caseName, iterations) {
  const fn = routers[routerName]();
  const [method, path] = cases[caseName];
  const sink = { handler: null, params: null };
  const run = (n) => {
    for (let i = 0; i < n; i += 1) {
      const found = fn(method, path);
      if (found !== null) {
        sink.handler = found.handler;
        sink.params = found.params;
      }
    }
  };
  run(200000);
  const start = process.hrtime.bigint();
  run(iterations);
  const ops = (iterations / Number(process.hrtime.bigint() - start)) * 1e9;
  process.stdout.write(String(ops));
}

function main() {
  const iterations = Number(process.argv[2]) || 2000000;
  const rounds = Number(process.argv[3]) || 3;
  const names = Object.keys(routers);
  const fmt = (n) => `${(n / 1e6).toFixed(2)}M`;
  process.stdout.write(`| Case | ${names.map((n) => `${n} ops/s`).join(' | ')} | find vs fmw | match vs fmw |\n`);
  process.stdout.write(`| --- | ${names.map(() => '---:').join(' | ')} | ---: | ---: |\n`);
  for (const caseName of Object.keys(cases)) {
    const ops = {};
    for (let round = 0; round < rounds; round += 1) {
      for (const name of names) {
        const out = execFileSync(process.execPath, [__filename, '--child', name, caseName, String(iterations)]);
        ops[name] = Math.max(ops[name] || 0, Number(out));
      }
    }
    const base = ops['find-my-way find'];
    process.stdout.write(
      `| ${caseName} | ${names.map((n) => fmt(ops[n])).join(' | ')} | ${(ops['xufa find'] / base).toFixed(2)}x | ` +
        `${(ops['xufa match'] / base).toFixed(2)}x |\n`
    );
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], Number(process.argv[5]));
else main();
