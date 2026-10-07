// The pages of the packages of docs/, from the content files of pages/ (*.page.html): each starts with a comment of
// JSON { file, name, title, description, groups: [[group, [[id, label], ...]], ...] } and has the content of its
// <article>. A package with several pages (SECTIONS) has tabs above each of them; the pages after its first one say
// whose they are with `package` (the file of its first page). `layout: 'tool'` is a page without sidebar, in all the
// width (a playground), `layout: 'home'` a page of full-width sections (as the home page), and `scripts` are the
// scripts it loads; `fullTitle` is the title as it is (not '<title> · xufa'). `nav` is the link of the header the page is
// (guide, playground, http, orm, auth, sequelize, or home: none of them; Packages without it), `og` its { title,
// description } of Open Graph (for links shared), and `packages: false` leaves the list of the packages out of its
// sidebar (the pages of the header). An item of the sidebar is an id of the page, or a page of the site
// (benchmarks.html#http). The header, the sidebar (its sections, then every package) and the footer are the site's. A comment
// <!--generated: name--> in a content file is replaced by what the generator of that name makes.
const fs = require('node:fs');
const { pathOf, fileOf, rewriteLinks } = require('./paths');
const path = require('node:path');
const { routerPerformance } = require('./router-performance');
const { loggerPerformance } = require('./logger-performance');
const { referenceOf, REFERENCE_PACKAGES } = require('./reference');

const PAGES = path.join(__dirname, '../pages');
const GENERATED = {
  'router-performance': routerPerformance,
  'logger-performance': loggerPerformance,
  // The benchmarks of @xufa/schema, from bench/results/schema.
  'schema-benchmarks': () => require('../../../bench/schema/report').article(), // eslint-disable-line global-require
  // The table of the packages of the home page: kept as it is, for buildHomeTable() (lib/packages-index.js), which
  // fills it after the page is made (see build.js).
  'packages-table': () => '<!--generated: packages-table-->\n',
  // The HTTP benchmarks of benchmarks.html, with their scenarios explained.
  'http-benchmarks': () => require('./benchmarks').httpSection({ scenarios: true }), // eslint-disable-line global-require
  // The error codes of @xufa/http, from its errorCodes.
  'http-error-codes': () => httpErrorCodes(),
  // The ORM against Sequelize: the section of benchmarks.html (written there, from bench/results/orm-*.md).
  'orm-benchmarks': () => ormBenchmarks(),
};

// The section "ORM and Sequelize" of benchmarks.html, for the page of benchmarks of the ORM.
function ormBenchmarks() {
  const page = fs.readFileSync(path.join(__dirname, '../../../docs/benchmarks.html'), 'utf8');
  const start = page.indexOf('        <h2 id="orm">');
  const end = page.indexOf('        <h2 id=', start + 1);
  if (start < 0 || end < 0) throw new Error('benchmarks.html: no section "orm"');
  return page
    .slice(start, end)
    .replace('<h2 id="orm">ORM and Sequelize</h2>', '<h2 id="sequelize">Against Sequelize</h2>');
}

// A table of the error codes of @xufa/http: code, status and message (… where the error puts the values it is made
// with).
function httpErrorCodes() {
  const { errorCodes } = require('../../../packages/http'); // eslint-disable-line global-require
  const rows = Object.entries(errorCodes).map(([code, ErrorClass]) => {
    const error = new ErrorClass();
    const message = esc(String(error.message).replace(/%[sdifjoO]/g, '…'));
    return `              <tr><td><code>${code}</code></td><td>${error.statusCode || ''}</td><td>${message}</td></tr>`;
  });
  return [
    '        <div class="table-wrap">',
    '          <table>',
    '            <thead><tr><th>Code</th><th>Status</th><th>Message</th></tr></thead>',
    '            <tbody>',
    ...rows,
    '            </tbody>',
    '          </table>',
    '        </div>',
    '',
  ].join('\n');
}
const ORDER = [
  // [file, name, group]
  ['websocket.html', '@xufa/websocket', 'The framework'],
  ['admin.html', '@xufa/admin', 'The framework'],
  ['session.html', '@xufa/session', 'The framework'],
  ['openapi.html', '@xufa/openapi', 'The framework'],
  ['client.html', '@xufa/client', 'The framework'],
  ['schema.html', '@xufa/schema', 'The framework'],
  ['pg.html', '@xufa/pg', 'Drivers'],
  ['mongo.html', '@xufa/mongo', 'Drivers'],
  ['expression.html', '@xufa/expression', 'Expressions and templates'],
  ['template.html', '@xufa/template', 'Expressions and templates'],
  ['cluster.html', '@xufa/cluster', 'Running'],
  ['scheduler.html', '@xufa/scheduler', 'Running'],
  ['queue.html', '@xufa/queue', 'Running'],
  ['config.html', '@xufa/config', 'Running'],
  ['discovery.html', '@xufa/discovery', 'Running'],
  ['netcache.html', '@xufa/netcache', 'Running'],
  ['faults.html', '@xufa/faults', 'Running'],
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

// The pages of the packages that have several: [file, label] of each, in the order of their tabs.
const SECTIONS = {
  'auth.html': [
    ['auth.html', 'Overview'],
    ['auth-guide.html', 'Guide'],
    ['auth-reference.html', 'Reference'],
  ],
  'sequelize.html': [
    ['sequelize.html', 'Overview'],
    ['sequelize-guide.html', 'Guide'],
    ['sequelize-benchmarks.html', 'Benchmarks'],
  ],
  'orm.html': [
    ['orm.html', 'Overview'],
    ['orm-guide.html', 'Guide'],
    ['orm-reference.html', 'Reference'],
    ['orm-django.html', 'From Django'],
    ['orm-benchmarks.html', 'Benchmarks'],
  ],
  'http.html': [
    ['http.html', 'Overview'],
    ['http-guide.html', 'Guide'],
    ['http-api.html', 'API'],
    ['playground.html#http', 'Playground'],
    ['http-fastify.html', 'From fastify'],
    ['http-benchmarks.html', 'Benchmarks'],
  ],
  'schema.html': [
    ['schema.html', 'Overview'],
    ['schema-guide.html', 'Guide'],
    ['schema-api.html', 'API'],
    ['schema-playground.html', 'Playground'],
    ['schema-infer.html', 'Schema from JSON'],
    ['schema-ajv.html', 'From ajv'],
    ['schema-benchmarks.html', 'Benchmarks'],
  ],
};

// The packages the playground of the site has a tool for (playground.html#<tool>): a tab of their pages.
const PLAYGROUND_TOOLS = ['expression', 'template', 'yaml', 'marshal', 'router', 'serializer'];

// Every package with a reference made from its declarations (lib/reference.js) has tabs: its page, the reference,
// and the playground when it has a tool there.
for (const name of REFERENCE_PACKAGES) {
  if (SECTIONS[`${name}.html`]) continue;
  SECTIONS[`${name}.html`] = [
    [`${name}.html`, 'Overview'],
    [`${name}-reference.html`, 'Reference'],
    ...(PLAYGROUND_TOOLS.includes(name) ? [[`playground.html#${name}`, 'Playground']] : []),
  ];
}

// The page of reference of a package: its meta (as its page's: nav, packages) and body.
function referencePage(name, overview) {
  const { intro, kinds, body } = referenceOf(name);
  const meta = {
    file: `${name}-reference.html`,
    name: `@xufa/${name}`,
    package: `${name}.html`,
    title: `@xufa/${name}: Reference`,
    description: `The reference of @xufa/${name}: every function, class, interface and type it declares, made from its TypeScript declarations.`,
    groups: [['Reference', kinds.map(([id, heading, count]) => [id, `${heading} (${count})`])]],
  };
  if (overview.nav) meta.nav = overview.nav;
  if (overview.packages === false) meta.packages = false;
  const article = `        <h1>Reference</h1>
        <p class="intro">
          ${esc(intro.replace(/\.?$/, '.'))} Every declaration of its TypeScript declarations
          (<code>packages/${name}/index.d.ts</code>), as they are written, with their comments: made from them each time
          the docs are built. How to use them is in <a href="${name}.html">the overview</a>.
        </p>

${body}
`;
  return { meta, body: article };
}

// A page of the site in the sidebar (not an id of the page).
const isPage = (id) => /\.html(?:#|$)/.test(id);

// The content of an article as it is written, its first line indented as the others (no blank lines around it).
const content = (body) => body.replace(/^(?:[ \t]*\n)+/, '').trimEnd();

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23d9502b'/%3E%3Ctext x='16' y='22.5' font-family='monospace' font-size='18' font-weight='700' fill='white' text-anchor='middle'%3Ex%3C/text%3E%3C/svg%3E";

function tabsOf(meta) {
  const sections = SECTIONS[meta.package || meta.file];
  if (!sections) return '';
  const links = sections
    .map(([file, label]) => `<a href="${file}"${file === meta.file ? ' aria-current="page"' : ''}>${esc(label)}</a>`)
    .join('\n          ');
  return `        <nav class="package-tabs" aria-label="${esc(meta.name)}">\n          ${links}\n        </nav>\n`;
}

function page(meta, body) {
  const tool = meta.layout === 'tool';
  const home = meta.layout === 'home';
  const scripts = (meta.scripts || []).map((src) => `\n    <script src="${src}?v=0.1.0" defer></script>`).join('');
  const groups = meta.groups
    .map(
      ([group, items]) =>
        `        <h4>${esc(group)}</h4>\n        <ul>\n${items
          .map(([id, label]) => `          <li><a href="${isPage(id) ? id : `#${id}`}">${label}</a></li>`)
          .join('\n')}\n        </ul>`
    )
    .join('\n');
  const current = (nav) => (meta.nav === nav ? ' aria-current="page"' : '');
  const others =
    meta.packages === false
      ? ''
      : `        <h4>Packages</h4>\n        <ul>\n${ORDER.map(
          ([file, name]) =>
            `          <li><a href="${file}"${file === meta.file || file === meta.package ? ' aria-current="page"' : ''}>${name}</a></li>`
        ).join('\n')}\n          <li><a href="packages.html">All the packages</a></li>\n        </ul>`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${meta.fullTitle ? esc(meta.fullTitle) : `${esc(meta.title)} · xufa`}</title>
    <meta
      name="description"
      content="${esc(meta.description)}"
    />${
      meta.og
        ? `
    <meta property="og:title" content="${esc(meta.og.title)}" />
    <meta
      property="og:description"
      content="${esc(meta.og.description)}"
    />`
        : ''
    }
    <link
      rel="icon"
      href="${ICON}"
    />
    <link rel="stylesheet" href="style.css?v=0.1.0" />
    <script src="main.js?v=0.1.0"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js" defer></script>${scripts}
  </head>
  <body>
    <header class="header">
      <div class="header-inner">
        <a class="logo" href="./"><span class="logo-mark">x</span>xufa</a>
        <nav class="nav">
          <a href="guide.html"${current('guide')}>Guide</a>
          <a href="playground.html"${current('playground')}>Playground</a>
          <a href="http.html"${current('http')}>HTTP</a>
          <a href="orm.html"${current('orm')}>ORM</a>
          <a class="hide-small" href="auth.html"${current('auth')}>Auth</a>
          <a class="hide-small" href="sequelize.html"${current('sequelize')}>Sequelize</a>
          <a class="hide-small" href="packages.html"${meta.nav ? '' : ' aria-current="page"'}>Packages</a>
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

${
  home
    ? `    <main>
${tabsOf(meta) ? `      <div class="container package-home-tabs">\n${tabsOf(meta)}      </div>\n` : ''}${body.replace(/\s+$/, '')}
    </main>
`
    : tool
      ? `    <main class="pg">
${tabsOf(meta)}${body.trim()}
    </main>
`
      : `    <div class="docs">
      <button class="menu-toggle" type="button" aria-expanded="false">☰ Contents</button>
      <aside class="sidebar">
${[groups, others].filter(Boolean).join('\n')}
      </aside>

      <article class="content">
${tabsOf(meta)}${content(body)}
      </article>
    </div>
`
}
    <footer class="footer">
      <div class="container">
        <span>xufa is MIT licensed. &copy; Jes&uacute;s Seijas</span>
        <span>
          <a href="guide.html">Guide</a> &middot; <a href="playground.html">Playground</a> &middot; <a href="http.html">HTTP</a> &middot; <a href="orm.html">ORM</a> &middot; <a href="auth.html">Auth</a> &middot;
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
  const sources = fs
    .readdirSync(PAGES)
    .filter((file) => file.endsWith('.page.html'))
    .map((name) => {
      const text = fs.readFileSync(path.join(PAGES, name), 'utf8');
      const match = /^<!--([\s\S]*?)-->\n/.exec(text);
      if (!match) throw new Error(`${name}: no header`);
      const meta = JSON.parse(match[1]);
      const body = text.slice(match[0].length).replace(/<!--generated: ([a-z-]+)-->\n/g, (_, generator) => {
        if (!GENERATED[generator]) throw new Error(`${name}: no generator ${generator}`);
        return GENERATED[generator]();
      });
      return { meta, body };
    });
  // The pages of reference, made from the declarations of the packages.
  for (const name of REFERENCE_PACKAGES) {
    const overview = sources.find((source) => source.meta.file === `${name}.html`);
    if (!overview) throw new Error(`${name}: a reference, but no page ${name}.html`);
    sources.push(referencePage(name, overview.meta));
  }
  for (const { meta, body } of sources) {
    // Every id of the sidebar is in the page.
    meta.groups.forEach(([, items]) =>
      items.forEach(([id]) => {
        if (!isPage(id) && !body.includes(`id="${id}"`)) throw new Error(`${meta.file}: no element with id ${id}`);
      })
    );
    // In the folder of its package (yaml.html is yaml/index.html, schema-guide.html schema/guide.html), with its
    // links written from there.
    const target = pathOf(meta.file);
    const file = target === undefined ? meta.file : fileOf(target);
    pages.push({ file, html: rewriteLinks(page(meta, body), file) });
  }
  return pages;
}

module.exports = { buildPages, ORDER, SECTIONS };
