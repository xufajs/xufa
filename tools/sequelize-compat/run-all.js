// Runs every integration test file in a mocha process of its own (a crash loses that file only) and writes the
// merged report to results/: node run-all.js <dialect> [name] [timeout] [filter]
//   dialect   sqlite or postgres
//   name      of the report, results/<name>.json (default: <dialect>, or real-<dialect> with SEQ_REAL=1)
//   timeout   of each test in ms (default 10000)
//   filter    only the files whose path includes it
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const real = process.env.SEQ_REAL === '1';
const [dialect = 'sqlite', name = `${real ? 'real-' : ''}${dialect}`, timeout = '10000', filter = ''] =
  process.argv.slice(2);
const integration = path.join(__dirname, 'test', 'integration');
if (!fs.existsSync(integration)) {
  console.error('No tests: run `node fetch-tests.js` first.');
  process.exit(1);
}
const files = [];
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.test.js') && full.includes(filter)) files.push(full);
  });
walk(integration);
const merged = {
  stats: { tests: 0, passes: 0, failures: 0, pending: 0 },
  passes: [],
  failures: [],
  pending: [],
  crashed: [],
};
files.sort().forEach((file, i) => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(__dirname, 'node_modules', 'mocha', 'bin', 'mocha'),
      '-r',
      './resolve.js',
      // test/integration/support.js holds the hooks that clear the database around every test: upstream runs every
      // file in one mocha process, where they apply to all of them (also the files that require test/support.js only).
      '--file',
      path.join(integration, 'support.js'),
      '--timeout',
      timeout,
      '--reporter',
      'json',
      file,
    ],
    {
      cwd: __dirname,
      env: { ...process.env, DIALECT: dialect },
      encoding: 'utf8',
      maxBuffer: 1 << 28,
      timeout: 15 * 60 * 1000,
    }
  );
  const text = result.stdout || '';
  // The JSON reporter of mocha 7 writes to stdout, after whatever the tests logged.
  const start = text.indexOf('{\n  "stats"');
  let report = null;
  if (start !== -1) {
    try {
      report = JSON.parse(text.slice(start));
    } catch {
      report = null;
    }
  }
  const relative = path.relative(integration, file);
  if (!report) {
    const reason =
      `${result.stderr || ''}${text}`.split('\n').find((line) => /Error|error/.test(line)) || `exit ${result.status}`;
    merged.crashed.push({ file: relative, reason: reason.trim().slice(0, 200) });
    process.stdout.write(`${i + 1}/${files.length} ${relative}: CRASHED\n`);
    return;
  }
  ['passes', 'failures', 'pending'].forEach((key) => {
    report[key].forEach((test) => merged[key].push({ ...test, file: relative }));
    merged.stats[key] += report[key].length;
  });
  merged.stats.tests += report.stats.tests;
  process.stdout.write(
    `${i + 1}/${files.length} ${relative}: ${report.stats.passes} passed, ${report.stats.failures} failed\n`
  );
});
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
const out = path.join(__dirname, 'results', `${name}.json`);
fs.writeFileSync(out, JSON.stringify(merged));
console.log(merged.stats, `crashed files: ${merged.crashed.length}`);
console.log(`report: ${path.relative(process.cwd(), out)}`);
