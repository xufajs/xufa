// Makes the generated pages of docs/ again (docs/ is not formatted by prettier: the generators write it as it is). Every
// package has a folder (docs/<package>/index.html, its other pages beside it): see lib/paths.js.
// - the page of every package (pages/*.page.html, with the site's header, sidebar and footer);
// - the index of the packages (packages.html: its sidebar and cards), and the table of them in index.html;
// - the sections of benchmarks.html made from bench/results;
// - schema.js and xufa.js, packages for browsers (the playgrounds);
// - in those pages and in the hand-written pages with charts (HAND_WRITTEN), how xufa fares in each chart, for its
//   colors (lib/outcomes.js).
//
// node tools/docs/build.js           writes the pages that changed
// node tools/docs/build.js --check   writes nothing; lists the pages that differ from what would be made, and fails
const fs = require('node:fs');
const path = require('node:path');
const { buildPages } = require('./lib/pages');
const { buildPackagesIndex, buildHomeTable } = require('./lib/packages-index');
const { buildBenchmarks } = require('./lib/benchmarks');
const { markOutcomes } = require('./lib/outcomes');
const { schemaBundle, xufaBundle } = require('./lib/browser-bundle');
const { rewriteLinks, redirects } = require('./lib/paths');

const DOCS = path.join(__dirname, '../../docs');
// Pages written by hand whose charts are marked (the rest of them is left as it is).
const HAND_WRITTEN = ['sequelize/index.html'];

function main() {
  const check = process.argv.includes('--check');
  const read = (file) => fs.readFileSync(path.join(DOCS, file), 'utf8');
  const outputs = [
    ...buildPages(),
    // Pages of the root: their links to the packages as the paths of their folders.
    { file: 'packages.html', html: rewriteLinks(buildPackagesIndex(read('packages.html')), 'packages.html') },
    { file: 'index.html', html: rewriteLinks(buildHomeTable(read('index.html')), 'index.html') },
    { file: 'benchmarks.html', html: rewriteLinks(buildBenchmarks(read('benchmarks.html')), 'benchmarks.html') },
    ...HAND_WRITTEN.map((file) => ({ file, html: read(file) })),
  ]
    .map(({ file, html }) => ({ file, html: markOutcomes(html) }))
    // The scripts made from the packages (not pages: nothing to mark).
    .concat([
      { file: 'schema/schema.js', html: schemaBundle() },
      { file: 'xufa.js', html: xufaBundle() },
    ])
    // The old addresses of the packages (http.html...), which send to their folders.
    .concat(redirects());
  const changed = [];
  for (const { file, html } of outputs) {
    const target = path.join(DOCS, file);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (html === current) continue;
    changed.push(file);
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, html);
    }
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
