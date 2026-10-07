// Makes the generated pages of docs/ again (docs/ is not formatted by prettier: the generators write it as it is). Every
// package has a folder (docs/<package>/index.html, its other pages beside it): see lib/paths.js.
// - the page of every package (pages/*.page.html, with the site's header, sidebar and footer), those of the header
//   (http, orm, auth, sequelize) too;
// - the index of the packages (packages.html: its sidebar and cards), and the table of them in index.html;
// - the sections of benchmarks.html made from bench/results;
// - schema.js, xufa.js and xufa-http.js, packages for browsers (the playgrounds);
// - in those pages, how xufa fares in each chart, for its colors (lib/outcomes.js).
//
// node tools/docs/build.js           writes the pages that changed
// node tools/docs/build.js --check   writes nothing; lists the pages that differ from what would be made, and fails
const fs = require('node:fs');
const path = require('node:path');
const { buildPages } = require('./lib/pages');
const { buildPackagesIndex, buildHomeTable } = require('./lib/packages-index');
const { buildBenchmarks } = require('./lib/benchmarks');
const { markOutcomes } = require('./lib/outcomes');
const { schemaBundle, xufaBundle, httpBundle } = require('./lib/browser-bundle');
const { rewriteLinks, redirects } = require('./lib/paths');

const DOCS = path.join(__dirname, '../../docs');

function main() {
  const check = process.argv.includes('--check');
  const read = (file) => fs.readFileSync(path.join(DOCS, file), 'utf8');
  const outputs = [
    // The home page (pages/index.page.html) with the table of the packages made into it.
    ...buildPages().map(({ file, html }) =>
      file === 'index.html' ? { file, html: rewriteLinks(buildHomeTable(html), 'index.html') } : { file, html }
    ),
    // Pages of the root: their links to the packages as the paths of their folders.
    { file: 'packages.html', html: rewriteLinks(buildPackagesIndex(read('packages.html')), 'packages.html') },
    { file: 'benchmarks.html', html: rewriteLinks(buildBenchmarks(read('benchmarks.html')), 'benchmarks.html') },
  ]
    .map(({ file, html }) => ({ file, html: markOutcomes(html) }))
    // The scripts made from the packages (not pages: nothing to mark).
    .concat([
      { file: 'schema/schema.js', html: schemaBundle() },
      { file: 'xufa.js', html: xufaBundle() },
      { file: 'xufa-http.js', html: httpBundle() },
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
