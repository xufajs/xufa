/* eslint-disable no-console */
// Compile speed of @xufa/schema: schemas compiled per second, for every schema of the benchmarks (the payloads and the
// order schema), in its three modes, each measured in processes of its own (the median of BENCH_RUNS, 5 by default).
// Quick enough (about a minute) to run after every change of the compiler.
//
//   node schema/compile.js                       # @xufa/schema of the repository
//   node schema/compile.js --src ../schiva/src   # another copy of its code (a folder with its index.js), to compare
//   node schema/compile.js --json out.json       # the results as JSON too
//   node schema/compile.js --vs <folder>         # against the code before a change, alternating (the ratio)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { cases, compileCase } = require('./lib/cases');

const RUNS = Number(process.env.BENCH_RUNS) || 5;
const TIME = Number(process.env.BENCH_TIME) || 1000;

// The schemas: the order schema, and those of the payloads (once each).
const SCHEMAS = [[compileCase.name, compileCase.schema]];
for (const c of cases) {
  const name = c.name.replace(/ · (valid|invalid)$/, '');
  if (!SCHEMAS.some(([n]) => n === name)) SCHEMAS.push([name, c.schema]);
}
const MODES = [
  ['first error', { allErrors: false }],
  ['all errors', {}],
  ['boolean', { errors: false }],
];

function load(src) {
  return src ? require(path.resolve(src)) : require('@xufa/schema'); // eslint-disable-line global-require
}

// Child: compiles per second, of one schema in one mode.
function child(src, schemaIndex, modeIndex) {
  const { compileJsonSchema } = load(src);
  const schema = SCHEMAS[schemaIndex][1];
  const options = MODES[modeIndex][1];
  const fn = () => compileJsonSchema(schema, options);
  const now = () => Number(process.hrtime.bigint()) / 1e6;
  const warmupEnd = now() + Math.max(200, TIME / 3);
  while (now() < warmupEnd) fn();
  let count = 0;
  const start = now();
  let end;
  do {
    fn();
    count += 1;
    end = now();
  } while (end - start < TIME);
  console.log((count * 1000) / (end - start));
}

// --vs <folder>: the code of the repository against another copy (the code before a change), their processes
// alternating schema by schema, so a machine that gets slower or faster weighs on both alike. Gives the ratio of each.
function versus(base) {
  const run = (src, si, mi) =>
    Number(
      execFileSync(process.execPath, ['--no-deprecation', __filename, '--child', src || '', String(si), String(mi)], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
    );
  const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];
  const rows = [];
  for (let si = 0; si < SCHEMAS.length; si += 1) {
    for (let mi = 0; mi < MODES.length; mi += 1) {
      const ours = [];
      const theirs = [];
      try {
        for (let r = 0; r < RUNS; r += 1) {
          theirs.push(run(base, si, mi));
          ours.push(run(null, si, mi));
        }
      } catch {
        continue;
      }
      const now = median(ours);
      const before = median(theirs);
      rows.push({
        schema: SCHEMAS[si][0],
        mode: MODES[mi][0],
        before: Math.round(before),
        now: Math.round(now),
        ratio: +(now / before).toFixed(3),
      });
    }
  }
  console.log(`@xufa/schema against ${path.resolve(base)} (medians of ${RUNS} alternating processes)`);
  console.table(rows);
  const geo = (list) => Math.exp(list.reduce((sum, v) => sum + Math.log(v), 0) / list.length);
  for (const [mode] of MODES) {
    const ratios = rows.filter((r) => r.mode === mode).map((r) => r.ratio);
    console.log(`${mode.padEnd(12)} now / before: ${geo(ratios).toFixed(3)}`);
  }
  console.log(`all          now / before: ${geo(rows.map((r) => r.ratio)).toFixed(3)}`);
}

function main(args) {
  if (args.includes('--vs')) {
    versus(args[args.indexOf('--vs') + 1]);
    return;
  }
  const src = args.includes('--src') ? args[args.indexOf('--src') + 1] : null;
  const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
  const rows = [];
  for (let si = 0; si < SCHEMAS.length; si += 1) {
    for (let mi = 0; mi < MODES.length; mi += 1) {
      let values;
      try {
        values = Array.from({ length: RUNS }, () =>
          Number(
            execFileSync(
              process.execPath,
              ['--no-deprecation', __filename, '--child', src || '', String(si), String(mi)],
              {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
              }
            ).trim()
          )
        ).sort((a, b) => a - b);
      } catch {
        // A version that cannot compile this schema (older code, keywords it did not have).
        rows.push({ schema: SCHEMAS[si][0], mode: MODES[mi][0], 'compiles/sec': null, 'spread %': 'fails' });
        continue;
      }
      const median = values[Math.floor(values.length / 2)];
      const spread = (100 * (values[values.length - 1] - values[0])) / median;
      rows.push({
        schema: SCHEMAS[si][0],
        mode: MODES[mi][0],
        'compiles/sec': Math.round(median),
        'spread %': spread.toFixed(1),
      });
    }
  }
  console.log(`Compiling with ${src ? path.resolve(src) : '@xufa/schema'} (median of ${RUNS} processes)`);
  console.table(rows);
  const geo = (list) => Math.exp(list.reduce((sum, v) => sum + Math.log(v), 0) / list.length);
  for (const [mode] of MODES) {
    const done = rows.filter((r) => r.mode === mode && r['compiles/sec'] !== null).map((r) => r['compiles/sec']);
    console.log(`${mode.padEnd(12)} geometric mean of ${done.length} schemas: ${Math.round(geo(done))}`);
  }
  if (jsonOut) fs.writeFileSync(jsonOut, `${JSON.stringify(rows, null, 2)}\n`);
}

const argv = process.argv.slice(2);
if (argv[0] === '--child') child(argv[1] || null, Number(argv[2]), Number(argv[3]));
else main(argv);
