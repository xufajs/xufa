// Makes the generated pages of docs/ again (docs/ is not formatted by prettier: the generators write it as it is):
// - the page of every package (pages/*.page.html, with the site's header, sidebar and footer);
// - the index of the packages (packages.html: its sidebar and cards);
// - the sections of benchmarks.html made from bench/results;
// - in those pages and in the hand-written pages with charts (HAND_WRITTEN), how xufa fares in each chart, for its
//   colors (lib/outcomes.js).
//
// node tools/docs/build.js           writes the pages that changed
// node tools/docs/build.js --check   writes nothing; lists the pages that differ from what would be made, and fails
const fs = require('node:fs');
const path = require('node:path');
const { buildPages } = require('./lib/pages');
const { buildPackagesIndex } = require('./lib/packages-index');
const { buildBenchmarks } = require('./lib/benchmarks');
const { markOutcomes } = require('./lib/outcomes');

const DOCS = path.join(__dirname, '../../docs');
// Pages written by hand whose charts are marked (the rest of them is left as it is).
const HAND_WRITTEN = ['sequelize.html'];

function main() {
  const check = process.argv.includes('--check');
  const read = (file) => fs.readFileSync(path.join(DOCS, file), 'utf8');
  const outputs = [
    ...buildPages(),
    { file: 'packages.html', html: buildPackagesIndex(read('packages.html')) },
    { file: 'benchmarks.html', html: buildBenchmarks(read('benchmarks.html')) },
    ...HAND_WRITTEN.map((file) => ({ file, html: read(file) })),
  ].map(({ file, html }) => ({ file, html: markOutcomes(html) }));
  const changed = [];
  for (const { file, html } of outputs) {
    const target = path.join(DOCS, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (html === current) continue;
    changed.push(file);
    if (!check) fs.writeFileSync(target, html);
  }
  if (changed.length === 0) {
    console.log(`docs: ${outputs.length} pages up to date`);
  } else if (check) {
    console.log(`docs: differ from their sources (node tools/docs/build.js makes them again): ${changed.join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log(`docs: wrote ${changed.join(', ')}`);
  }
}

main();
