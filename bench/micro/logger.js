// @xufa/logger against pino, writing to a stream that drops the lines: only the cost of the loggers is measured.
// node bench/micro/logger.js [iterations]
const pino = require('pino');
const xufaLogger = require('@xufa/logger');

const iterations = Number(process.argv[2]) || 300000;
const devNull = { write() {} };
const err = new Error('something failed');
const deep = { user: { id: 1, name: 'Ada', roles: ['admin', 'author'] }, items: [1, 2, 3], flag: true };

const cases = {
  message: (log) => log.info('hello world'),
  'object + message': (log) => log.info({ a: 1, b: 'two', c: true }, 'hello world'),
  printf: (log) => log.info('user %s did %d things', 'ada', 42),
  'deep object': (log) => log.info(deep),
  error: (log) => log.error(err),
  'child + message': (log) => log.child({ reqId: 'req-1' }).info('incoming request'),
  'disabled level': (log) => log.debug({ a: 1 }, 'not written'),
};

const loggers = {
  pino: () => pino({}, devNull),
  xufa: () => xufaLogger({}, devNull),
};

function measure(fn, log) {
  for (let i = 0; i < 20000; i += 1) fn(log);
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn(log);
  const ns = Number(process.hrtime.bigint() - start);
  return (iterations / ns) * 1e9;
}

const rows = [];
for (const [name, fn] of Object.entries(cases)) {
  const ops = {};
  // Alternate a few times and keep the best of each.
  for (let round = 0; round < 3; round += 1) {
    for (const [loggerName, create] of Object.entries(loggers)) {
      const value = measure(fn, create());
      ops[loggerName] = Math.max(ops[loggerName] || 0, value);
    }
  }
  rows.push({ case: name, ...ops, ratio: ops.xufa / ops.pino });
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');
process.stdout.write('| Case | pino ops/s | @xufa/logger ops/s | xufa / pino |\n| --- | ---: | ---: | ---: |\n');
for (const row of rows) {
  process.stdout.write(`| ${row.case} | ${fmt(row.pino)} | ${fmt(row.xufa)} | ${row.ratio.toFixed(2)}x |\n`);
}
