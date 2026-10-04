// Summarizes a report of run-all.js: totals, by file, and the failures grouped by their first line of error.
//   node summarize.js <report> [top] [--files]
const read = require('./report');

const [name, top = 40] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const report = read(name);
const { stats } = report;
if (report.crashed && report.crashed.length) {
  console.log(`crashed files (${report.crashed.length}):`);
  report.crashed.forEach((item) => console.log(`  ${item.file}: ${item.reason}`));
}
console.log(`tests ${stats.tests}, passes ${stats.passes}, failures ${stats.failures}, pending ${stats.pending}`);
console.log(`pass rate (of run): ${((100 * stats.passes) / (stats.passes + stats.failures)).toFixed(1)}%`);

const byFile = new Map();
const add = (test, key) => {
  const file = test.file || '?';
  if (!byFile.has(file)) byFile.set(file, { passes: 0, failures: 0 });
  byFile.get(file)[key] += 1;
};
report.passes.forEach((test) => add(test, 'passes'));
report.failures.forEach((test) => add(test, 'failures'));

const reasons = new Map();
report.failures.forEach((test) => {
  const message = String((test.err && test.err.message) || '?')
    .split('\n')[0]
    .replace(/\d+/g, 'N')
    .slice(0, 140);
  reasons.set(message, (reasons.get(message) || 0) + 1);
});
console.log('\nTop failure reasons:');
[...reasons]
  .sort((a, b) => b[1] - a[1])
  .slice(0, Number(top))
  .forEach(([message, count]) => console.log(`${String(count).padStart(5)}  ${message}`));
if (process.argv.includes('--files')) {
  console.log('\nBy file (failures/total):');
  [...byFile]
    .sort((a, b) => b[1].failures - a[1].failures)
    .forEach(([file, { passes, failures }]) =>
      console.log(`${String(failures).padStart(4)}/${String(passes + failures).padEnd(4)} ${file}`)
    );
}
