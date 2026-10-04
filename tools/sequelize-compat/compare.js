// The failures of a run against the results of real Sequelize on the same tests (a run with SEQ_REAL=1):
//   node compare.js <report> <real report>
// A test that fails on both is a problem of the test or of the environment, not of @xufa/sequelize.
const read = require('./report');

const ours = read(process.argv[2]);
const real = read(process.argv[3]);

const file = (test) => (test.file || '').replace(/.*integration[\\/]/, '');
const key = (test) => `${file(test)}::${test.fullTitle}`;
const realState = new Map();
['passes', 'failures', 'pending'].forEach((kind) => real[kind].forEach((test) => realState.set(key(test), kind)));
const realFailure = new Map(real.failures.map((test) => [key(test), (test.err && test.err.message) || '']));

const groups = { failures: [], passes: [], pending: [], missing: [] };
ours.failures.forEach((test) => groups[realState.get(key(test)) || 'missing'].push(test));
const line = (test, extra = '') =>
  `   ${file(test).replace('.test.js', '').padEnd(36)} ${test.title.slice(0, 64).padEnd(64)} ${extra}`;
console.log(`Failures: ${ours.failures.length}`);
console.log(`\nAlso fail on real Sequelize: ${groups.failures.length}`);
groups.failures.forEach((test) =>
  console.log(line(test, (realFailure.get(key(test)) || '').replace(/\s+/g, ' ').slice(0, 80)))
);
console.log(`\nNot run by real Sequelize (missing or pending): ${groups.missing.length + groups.pending.length}`);
[...groups.missing, ...groups.pending].forEach((test) => console.log(line(test)));
console.log(`\nPass on real Sequelize (to fix, or different by design): ${groups.passes.length}`);
groups.passes.forEach((test) =>
  console.log(line(test, ((test.err && test.err.message) || '').replace(/\s+/g, ' ').slice(0, 80)))
);
console.log(
  `\nReal Sequelize: ${real.stats.passes} passed, ${real.stats.failures} failed, crashed: ${(real.crashed || []).length}`
);
