/* eslint-disable no-console */
// The speed of validating the payloads of the benchmarks (lib/cases.js), A against B, in processes of their own that
// alternate (A, B, A, B...) so a machine that gets faster or slower weighs on both alike; the median of each and B / A.
// Differences under about 4% are noise on a laptop: run it twice, or against an unchanged copy (--vs) to see it.
//
//   node schema/validate.js --vs ../old-copy             # B: another copy of @xufa/schema (a folder with its index.js)
//   node schema/validate.js --options '{"foldMessages":true}'   # B: the same code with these options
//   node schema/validate.js --vs ../old-copy --invalid   # only the invalid payloads
//
// BENCH_RUNS (5) processes of each, BENCH_TIME (700) ms measured in each.
const path = require('path');
const { execFileSync } = require('child_process');
const { cases } = require('./lib/cases');

const RUNS = Number(process.env.BENCH_RUNS) || 5;
const TIME = Number(process.env.BENCH_TIME) || 700;
const MODES = [
  ['first error', { allErrors: false }],
  ['all errors', {}],
];

// Child: validations per second of one payload, in one mode.
function child(src, caseIndex, modeIndex, extra) {
  const { compileJsonSchema } = src ? require(path.resolve(src)) : require('@xufa/schema'); // eslint-disable-line global-require
  const c = cases[caseIndex];
  const validate = compileJsonSchema(c.schema, { ...MODES[modeIndex][1], ...extra });
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  let errors = 0;
  const run = () => {
    errors += validate(c.data).length;
  };
  const warmupEnd = now() + 300;
  while (now() < warmupEnd) run();
  let count = 0;
  const start = now();
  let end;
  do {
    for (let i = 0; i < 100; i += 1) run();
    count += 100;
    end = now();
  } while (end - start < TIME);
  if (errors < 0) throw new Error('unreachable'); // keeps the results used
  console.log((count * 1000) / (end - start));
}

function main(args) {
  const vs = args.includes('--vs') ? args[args.indexOf('--vs') + 1] : '';
  const options = args.includes('--options') ? args[args.indexOf('--options') + 1] : '{}';
  if (!vs && options === '{}') {
    console.error('Give B: --vs <folder> (another copy) or --options <json> (the same code with options)');
    process.exitCode = 1;
    return;
  }
  const onlyInvalid = args.includes('--invalid');
  const measure = (src, ci, mi, extra) =>
    Number(
      execFileSync(process.execPath, ['--no-deprecation', __filename, '--child', src, String(ci), String(mi), extra], {
        encoding: 'utf8',
      })
    );
  const median = (list) => [...list].sort((x, y) => x - y)[Math.floor(list.length / 2)];
  const rows = [];
  cases.forEach((c, ci) => {
    if (onlyInvalid && c.expect) return;
    MODES.forEach(([mode], mi) => {
      const a = [];
      const b = [];
      for (let r = 0; r < RUNS; r += 1) {
        a.push(measure('', ci, mi, '{}'));
        b.push(measure(vs ? path.resolve(vs) : '', ci, mi, options));
      }
      rows.push({
        payload: c.name,
        mode,
        A: Math.round(median(a)),
        B: Math.round(median(b)),
        'B / A': Number((median(b) / median(a)).toFixed(3)),
      });
    });
  });
  console.log(
    `A: @xufa/schema; B: ${vs ? path.resolve(vs) : '@xufa/schema'}${options === '{}' ? '' : ` with ${options}`} (median of ${RUNS} processes each, validations a second)`
  );
  console.table(rows);
  const geometric = Math.exp(rows.reduce((sum, row) => sum + Math.log(row['B / A']), 0) / rows.length);
  console.log(`B / A, geometric mean: ${geometric.toFixed(3)}`);
}

if (process.argv[2] === '--child') {
  const [, , , src, ci, mi, extra] = process.argv;
  child(src || null, Number(ci), Number(mi), JSON.parse(extra));
} else {
  main(process.argv.slice(2));
}
