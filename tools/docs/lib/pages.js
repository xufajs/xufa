// The pages of the packages of docs/, from the content files of pages/ (*.page.html): each starts with a comment of
// JSON { file, name, title, description, groups: [[group, [[id, label], ...]], ...] } and has the content of its
// <article>. The header, the sidebar (its sections, then every package) and the footer are the site's. A comment
// <!--generated: name--> in a content file is replaced by what the generator of that name makes.
const fs = require('node:fs');
const path = require('node:path');
const { routerPerformance } = require('./router-performance');
const { loggerPerformance } = require('./logger-performance');

const PAGES = path.join(__dirname, '../pages');
const GENERATED = { 'router-performance': routerPerformance, 'logger-performance': loggerPerformance };
const ORDER = [
  // [file, name, group]
  ['websocket.html', '@xufa/websocket', 'The framework'],
  ['openapi.html', '@xufa/openapi', 'The framework'],
  ['client.html', '@xufa/client', 'The framework'],
  ['pg.html', '@xufa/pg', 'Drivers'],
  ['mongo.html', '@xufa/mongo', 'Drivers'],
  ['expression.html', '@xufa/expression', 'Expressions and templates'],
  ['template.html', '@xufa/template', 'Expressions and templates'],
  ['cluster.html', '@xufa/cluster', 'Running'],
  ['discovery.html', '@xufa/discovery', 'Running'],
  ['netcache.html', '@xufa/netcache', 'Running'],
  ['marshal.html', '@xufa/marshal', 'Running'],
  ['yaml.html', '@xufa/yaml', 'Running'],
  ['jwt.html', '@xufa/jwt', 'Security'],
  ['logger.html', '@xufa/logger', 'The parts of @xufa/http'],
  ['router.html', '@xufa/router', 'The parts of @xufa/http'],
  ['serializer.html', '@xufa/serializer', 'The parts of @xufa/http'],
  ['inject.html', '@xufa/inject', 'The parts of @xufa/http'],
  ['boot.html', '@xufa/boot', 'The parts of @xufa/http'],
  ['errors.html', '@xufa/errors', 'The parts of @xufa/http'],
];

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23d9502b'/%3E%3Ctext x='16' y='22.5' font-family='monospace' font-size='18' font-weight='700' fill='white' text-anchor='middle'%3Ex%3C/text%3E%3C/svg%3E";

function page(meta, body) {
  const groups = meta.groups
    .map(
      ([group, items]) =>
        `        <h4>${esc(group)}</h4>\n        <ul>\n${items
          .map(([id, label]) => `          <li><a href="#${id}">${label}</a></li>`)
          .join('\n')}\n        </ul>`
    )
    .join('\n');
  const others = `        <h4>Packages</h4>\n        <ul>\n${ORDER.map(
    ([file, name]) =>
      `          <li><a href="${file}"${file === meta.file ? ' aria-current="page"' : ''}>${name}</a></li>`
  ).join('\n')}\n          <li><a href="packages.html">All the packages</a></li>\n        </ul>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(meta.title)} · xufa</title>
    <meta
      name="description"
      content="${esc(meta.description)}"
    />
    <link
      rel="icon"
      href="${ICON}"
    />
    <link rel="stylesheet" href="style.css?v=0.1.0" />
    <script src="main.js?v=0.1.0"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" defer></script>
  </head>
  <body>
    <header class="header">
      <div class="header-inner">
        <a class="logo" href="./"><span class="logo-mark">x</span>xufa</a>
        <nav class="nav">
          <a href="guide.html">Guide</a>
          <a href="http.html">HTTP</a>
          <a href="orm.html">ORM</a>
          <a class="hide-small" href="auth.html">Auth</a>
          <a class="hide-small" href="sequelize.html">Sequelize</a>
          <a class="hide-small" href="packages.html" aria-current="page">Packages</a>
          <a class="hide-small" href="benchmarks.html">Benchmarks</a>
          <a href="https://github.com/xufajs/xufa">GitHub</a>
          <button class="theme-toggle" type="button" aria-label="Switch between light and dark theme">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
            </svg>
          </button>
        </nav>
      </div>
    </header>

    <div class="docs">
      <button class="menu-toggle" type="button" aria-expanded="false">☰ Contents</button>
      <aside class="sidebar">
${groups}
${others}
      </aside>

      <article class="content">
${body.trim()}
      </article>
    </div>

    <footer class="footer">
      <div class="container">
        <span>xufa is MIT licensed. &copy; Jes&uacute;s Seijas</span>
        <span>
          <a href="guide.html">Guide</a> &middot; <a href="http.html">HTTP</a> &middot; <a href="orm.html">ORM</a> &middot; <a href="auth.html">Auth</a> &middot;
          <a href="sequelize.html">Sequelize</a> &middot; <a href="packages.html">Packages</a> &middot;
          <a href="benchmarks.html">Benchmarks</a> &middot; <a href="https://github.com/xufajs/xufa">GitHub</a>
        </span>
      </div>
    </footer>
  </body>
</html>
`;
}

// [{ file, html }] of every page.
function buildPages() {
  const pages = [];
  for (const name of fs.readdirSync(PAGES).filter((file) => file.endsWith('.page.html'))) {
    const text = fs.readFileSync(path.join(PAGES, name), 'utf8');
    const match = /^<!--([\s\S]*?)-->\n/.exec(text);
    if (!match) throw new Error(`${name}: no header`);
    const meta = JSON.parse(match[1]);
    const body = text.slice(match[0].length).replace(/<!--generated: ([a-z-]+)-->\n/g, (_, generator) => {
      if (!GENERATED[generator]) throw new Error(`${name}: no generator ${generator}`);
      return GENERATED[generator]();
    });
    // Every id of the sidebar is in the page.
    meta.groups.forEach(([, items]) =>
      items.forEach(([id]) => {
        if (!body.includes(`id="${id}"`)) throw new Error(`${meta.file}: no element with id ${id}`);
      })
    );
    pages.push({ file: meta.file, html: page(meta, body) });
  }
  return pages;
}

module.exports = { buildPages, ORDER };
