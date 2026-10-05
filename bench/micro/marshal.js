// @xufa/marshal (stringify + parse) against JSON (which loses Dates, Maps, classes...: the bound), v8.serialize and
// deserialize (the structured clone of Node, binary: what the IPC of node:cluster uses) and, when a copy of it is
// given, the serializer of Agentic. Each library and case runs in a process of its own; best of the rounds.
// node bench/micro/marshal.js [rounds] [path of the lib folder of Agentic]
const { execFileSync } = require('node:child_process');

class Point {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    title: `Book ${i}`,
    price: 10 + (i % 7),
    published: new Date(1700000000000 + i * 86400000),
    tags: ['a', 'b'],
    author: { id: i % 10, name: `Author ${i % 10}` },
  }));
const cases = {
  'small object': () => ({ id: 1, name: 'Ada', admin: true, roles: ['a', 'b'], at: new Date(0) }),
  '100 rows (Dates)': () => rows(100),
  '1000 rows (Dates)': () => rows(1000),
  'Map, Set, BigInt': () => ({
    map: new Map(Array.from({ length: 50 }, (_, i) => [`k${i}`, new Set([i, i + 1])])),
    big: 2n ** 70n,
  }),
  '100 class instances': () => Array.from({ length: 100 }, (_, i) => new Point(i, i * 2)),
};

const libraries = {
  JSON: () => ({ write: JSON.stringify, read: JSON.parse }),
  v8: () => {
    const v8 = require('node:v8');
    return { write: v8.serialize, read: v8.deserialize };
  },
  marshal: () => {
    const { stringify, parse, registry } = require('@xufa/marshal');
    registry.register(Point);
    return { write: stringify, read: parse };
  },
  agentic: (dir) => {
    const { serialize } = require(`${dir}/serialize`);
    const { deserialize } = require(`${dir}/deserialize`);
    require(`${dir}/container`).ioc.register(Point);
    return { write: (v) => JSON.stringify(serialize(v)), read: (t) => deserialize(JSON.parse(t)) };
  },
};

function child(name, caseName, dir) {
  const { write, read } = libraries[name](dir);
  const value = cases[caseName]();
  const fn = () => read(write(value));
  // A library that cannot write the value (JSON and BigInt): n/a.
  try {
    fn();
  } catch {
    process.stdout.write('NaN');
    return;
  }
  for (let i = 0; i < 2000; i += 1) fn();
  let calls = 0;
  const start = process.hrtime.bigint();
  let ns = 0;
  while (ns < 400e6) {
    for (let i = 0; i < 50; i += 1) fn();
    calls += 50;
    ns = Number(process.hrtime.bigint() - start);
  }
  process.stdout.write(String((calls / ns) * 1e9));
}

function main() {
  const rounds = Number(process.argv[2]) || 3;
  const dir = process.argv[3];
  const names = Object.keys(libraries).filter((name) => name !== 'agentic' || dir);
  const fmt = (n) => (Number.isNaN(n) ? 'n/a' : Math.round(n).toLocaleString('en-US'));
  process.stdout.write(
    `| Case | ${names.map((n) => `${n} ops/s`).join(' | ')} | marshal / v8 |\n| --- |${names.map(() => ' ---: |').join('')} ---: |\n`
  );
  for (const caseName of Object.keys(cases)) {
    const ops = {};
    for (let round = 0; round < rounds; round += 1) {
      for (const name of names) {
        const args = [__filename, '--child', name, caseName, dir || ''];
        const out = execFileSync(process.execPath, args, { cwd: __dirname });
        ops[name] = Number.isNaN(Number(out)) ? NaN : Math.max(ops[name] || 0, Number(out));
      }
    }
    process.stdout.write(
      `| ${caseName} | ${names.map((n) => fmt(ops[n])).join(' | ')} | ${(ops.marshal / ops.v8).toFixed(2)}x |\n`
    );
  }
}

if (process.argv[2] === '--child') child(process.argv[3], process.argv[4], process.argv[5]);
else main();
