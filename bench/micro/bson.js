// BSON of @xufa/mongo against bson (of the official driver), deserialize and serialize. Each library and case runs in
// a process of its own, the libraries taking turns. node bench/micro/bson.js [iterations] [rounds] [--only name]
const { execFileSync } = require('node:child_process');

const user = (i) => ({
  i,
  name: `user ${i}`,
  email: `user${i}@example.com`,
  active: i % 2 === 0,
  score: i * 1.5,
  createdAt: new Date(1700000000000 + i * 1000),
  tags: ['a', 'b', `t${i % 10}`],
  address: { street: `${i} Main St`, city: 'Springfield', zip: String(10000 + (i % 1000)) },
});

// Each case is a function of the library giving the document (ObjectIds are of the library).
const cases = {
  'user document': (lib) => ({ _id: new lib.ObjectId(), ...user(42) }),
  'flat numbers': () => Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`field${i}`, i * 3.25])),
  'long strings': () => ({ title: 'x'.repeat(2000), body: 'Lorem ipsum dolor sit amet. '.repeat(200) }),
  'non-ascii strings': () => ({ name: 'José Müller', city: 'Zürich', note: '日本語のテキスト', emoji: 'ok 👍' }),
  'reply of 1000 docs': (lib) => ({
    cursor: { firstBatch: Array.from({ length: 1000 }, (_, i) => ({ _id: new lib.ObjectId(), ...user(i) })), id: 0 },
    ok: 1,
  }),
};

function load(name) {
  if (name === 'xufa') return require('@xufa/mongo');
  const { BSON } = require('mongodb');
  return BSON;
}

function child(name, caseName, operation, iterations) {
  const lib = load(name);
  const doc = cases[caseName](lib);
  const encoded = Buffer.from(lib.serialize(doc));
  const scale = caseName === 'reply of 1000 docs' ? 1000 : 1;
  const count = Math.max(10, Math.round(iterations / scale));
  const fn = operation === 'deserialize' ? () => lib.deserialize(encoded) : () => lib.serialize(doc);
  for (let i = 0; i < Math.min(count, 20000); i += 1) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < count; i += 1) fn();
  const ns = Number(process.hrtime.bigint() - start) / count;
  process.stdout.write(String(ns));
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--child') {
    child(args[1], args[2], args[3], Number(args[4]));
    return;
  }
  const onlyIndex = args.indexOf('--only');
  const only = onlyIndex === -1 ? null : args.splice(onlyIndex, 2)[1];
  const iterations = Number(args[0] || 200000);
  const rounds = Number(args[1] || 3);
  console.log(
    `BSON: @xufa/mongo against the bson of mongodb ${require('mongodb/package.json').version}, ${rounds} rounds`
  );
  console.log('\n| Case | Operation | @xufa/mongo | bson | speed of xufa (bson time / xufa time) |');
  console.log('| --- | --- | ---: | ---: | ---: |');
  for (const operation of ['deserialize', 'serialize']) {
    for (const caseName of Object.keys(cases)) {
      if (only && !caseName.includes(only) && only !== operation) continue;
      const times = { xufa: [], bson: [] };
      for (let round = 0; round < rounds; round += 1) {
        const order = round % 2 ? ['bson', 'xufa'] : ['xufa', 'bson'];
        for (const name of order) {
          const out = execFileSync(process.execPath, [__filename, '--child', name, caseName, operation, iterations]);
          times[name].push(Number(out));
        }
      }
      const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
      const xufa = median(times.xufa);
      const bson = median(times.bson);
      const format = (ns) => (ns >= 10000 ? `${(ns / 1000).toFixed(1)} µs` : `${Math.round(ns)} ns`);
      console.log(`| ${caseName} | ${operation} | ${format(xufa)} | ${format(bson)} | ${(bson / xufa).toFixed(2)}x |`);
    }
  }
}

main();
