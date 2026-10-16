// One library against the one it replaces, as bench/micro/jwt.js measures: each library and case in a process of its
// own (no case inherits the type feedback of another), the libraries taking turns, the best of the rounds kept, and a
// table of Markdown on stdout. A case gives a number: by default operations a second (more is better); with
// `lower: true`, a time (less is better).
//
//   versus({ file: __filename, theirs: 'multer 2.1.1', ours: '@xufa/http/multer', unit: 'uploads/s',
//            cases: { 'upload 1 KB': { lower: false } }, measure: async (library, caseName) => number })
const { execFileSync } = require('node:child_process');

const fmt = (n) =>
  Number.isNaN(n)
    ? 'n/a'
    : n >= 100
      ? Math.round(n).toLocaleString('en-US')
      : n.toLocaleString('en-US', { maximumFractionDigits: 2 });

// Calls of fn a second: batches until `ms` have gone, after a warm-up of `warm` calls.
async function rate(fn, { ms = 500, batch = 1, warm = 20 } = {}) {
  for (let i = 0; i < warm; i += 1) await fn();
  let calls = 0;
  const start = process.hrtime.bigint();
  let ns = 0;
  while (ns < ms * 1e6) {
    for (let i = 0; i < batch; i += 1) await fn();
    calls += batch;
    ns = Number(process.hrtime.bigint() - start);
  }
  return (calls / ns) * 1e9;
}

function versus({ file, theirs, ours, unit, cases, measure, rounds: defaultRounds = 5 }) {
  if (process.argv[2] === '--child') {
    const [, , , library, caseName] = process.argv;
    Promise.resolve(measure(library, caseName)).then(
      (value) => {
        process.stdout.write(String(value));
        process.exit(0);
      },
      (err) => {
        console.error(err);
        process.exit(1);
      }
    );
    return;
  }
  const rounds = Number(process.argv[2]) || defaultRounds;
  process.stdout.write(`| Case | ${theirs} | ${ours} | ${ours} / ${theirs} |\n| --- | ---: | ---: | ---: |\n`);
  for (const [caseName, spec] of Object.entries(cases)) {
    const lower = Boolean(spec && spec.lower);
    const best = {};
    for (let round = 0; round < rounds; round += 1) {
      const order = round % 2 ? ['ours', 'theirs'] : ['theirs', 'ours'];
      for (const library of order) {
        const value = Number(execFileSync(process.execPath, ['--expose-gc', file, '--child', library, caseName]));
        if (best[library] === undefined) best[library] = value;
        else best[library] = lower ? Math.min(best[library], value) : Math.max(best[library], value);
      }
    }
    const times = lower ? best.theirs / best.ours : best.ours / best.theirs;
    const caseUnit = (spec && spec.unit) || unit;
    process.stdout.write(
      `| ${caseName} (${caseUnit}) | ${fmt(best.theirs)} | ${fmt(best.ours)} | ${times.toFixed(2)}x |\n`
    );
  }
}

module.exports = { versus, rate };
