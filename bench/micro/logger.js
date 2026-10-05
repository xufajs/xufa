// @xufa/logger against pino, writing to a stream that drops the lines: only the cost of the loggers is measured.
// Each logger and case runs in a process of its own, so that no case inherits the type feedback of another (in one
// process, the call sites of the harness see every logger and case, and the last cases pay for it).
// node bench/micro/logger.js [rounds]
const { execFileSync } = require('node:child_process');

const err = new Error('something failed');
const deep = { user: { id: 1, name: 'Ada', roles: ['admin', 'author'] }, items: [1, 2, 3], flag: true };

const cases = {
  message: (log) => log.info('hello world'),
  // request.log of a server is a child logger
  'message, child': (log) => log.info('hello world'),
  'object + message': (log) => log.info({ a: 1, b: 'two', c: true }, 'hello world'),
  printf: (log) => log.info('user %s did %d things', 'ada', 42),
  'deep object': (log) => log.info(deep),
  error: (log) => log.error(err),
  'child + message': (log) => log.child({ reqId: 'req-1' }).info('incoming request'),
  'disabled level': (log) => log.debug({ a: 1 }, 'not written'),
  'disabled level, child': (log) => log.debug({ a: 1 }, 'not written'),
};

const devNull = { write() {} };
const loggers = {
  pino: () => require('pino')({}, devNull),
  xufa: () => require('@xufa/logger')({}, devNull),
};

// Calls a second: batches until a quarter of a second has gone, after a warm-up.
function child(loggerName, caseName) {
  const fn = cases[caseName];
  let log = loggers[loggerName]();
  if (caseName.endsWith(', child')) log = log.child({ reqId: 'req-1' });
  const batch = 20000;
  for (let i = 0; i < batch * 10; i += 1) fn(log);
  let calls = 0;
  const start = process.hrtime.bigint();
  let ns = 0;
  while (ns < 250e6) {
    for (let i = 0; i < batch; i += 1) fn(log);
    calls += batch;
    ns = Number(process.hrtime.bigint() - start);
  }
  process.stdout.write(String((calls / ns) * 1e9));
}

function main() {
  const rounds = Number(process.argv[2]) || 5;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  process.stdout.write('| Case | pino ops/s | @xufa/logger ops/s | xufa / pino |\n| --- | ---: | ---: | ---: |\n');
  for (const caseName of Object.keys(cases)) {
    const ops = {};
    // The loggers take turns; the best round of each is kept.
    for (let round = 0; round < rounds; round += 1) {
      for (const name of Object.keys(loggers)) {
        const out = execFileSync(process.execPath, [__filename, '--child', name, caseName], { cwd: __dirname });
        ops[name] = Math.max(ops[name] || 0, Number(out));
      }
    }
    process.stdout.write(
      `| ${caseName} | ${fmt(ops.pino)} | ${fmt(ops.xufa)} | ${(ops.xufa / ops.pino).toFixed(2)}x |\n`
    );
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4]);
else main();
