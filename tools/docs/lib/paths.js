// Where each page and file of the site is: every package in a folder of its own (docs/<package>/index.html, its other
// pages beside it: docs/schema/guide.html...), and the pages of the site at its root (index.html, guide.html,
// packages.html, benchmarks.html, django-benchmarks.html, playground.html, with style.css, main.js and xufa.js).
//
// The sources of the pages (pages/*.page.html) and the generators name every page by its old flat name
// (`schema-guide.html`, `http.html#routes`, `style.css`); rewriteLinks() turns those names into paths relative to the
// page they are in. The old names of the packages stay as small pages that send to their folders (redirects()).
import path from 'node:path';

// The pages of the packages, by their old flat names: [flat name, path from the root].
const PACKAGE_PAGES = [
  // The pages of the header.
  ['http', 'http/'],
  ['orm', 'orm/'],
  ['auth', 'auth/'],
  ['sequelize', 'sequelize/'],
  // Made from pages/*.page.html.
  ...[
    'websocket',
    'admin',
    'session',
    'forms',
    'views',
    'mail',
    'i18n',
    'openapi',
    'client',
    'schema',
    'pg',
    'mongo',
    'expression',
    'template',
    'jwt',
    'cluster',
    'scheduler',
    'queue',
    'config',
    'discovery',
    'netcache',
    'faults',
    'marshal',
    'yaml',
    'logger',
    'router',
    'serializer',
    'inject',
    'boot',
    'errors',
  ].map((name) => [name, `${name}/`]),
];

// The other pages of a package, and their scripts: flat name -> path from the root.
const PACKAGE_FILES = {
  'auth-guide.html': 'auth/guide.html',
  'sequelize-guide.html': 'sequelize/guide.html',
  'sequelize-benchmarks.html': 'sequelize/benchmarks.html',
  'orm-guide.html': 'orm/guide.html',
  'orm-django.html': 'orm/django.html',
  'orm-benchmarks.html': 'orm/benchmarks.html',
  'http-guide.html': 'http/guide.html',
  'http-api.html': 'http/api.html',
  'http-fastify.html': 'http/fastify.html',
  'http-benchmarks.html': 'http/benchmarks.html',
  'schema-guide.html': 'schema/guide.html',
  'schema-api.html': 'schema/api.html',
  'schema-playground.html': 'schema/playground.html',
  'schema-infer.html': 'schema/infer.html',
  'schema-ajv.html': 'schema/ajv.html',
  'schema-benchmarks.html': 'schema/benchmarks.html',
  'schema.js': 'schema/schema.js',
  'schema-playground.js': 'schema/playground.js',
  'schema-playground-examples.js': 'schema/playground-examples.js',
  'schema-infer.js': 'schema/infer.js',
};

// The files of the root.
const ROOT_FILES = [
  'index.html',
  'guide.html',
  'packages.html',
  'benchmarks.html',
  'django-benchmarks.html',
  'playground.html',
  'style.css',
  'main.js',
  'xufa.js',
  'xufa-http.js',
  'playground.js',
];

const MAP = new Map([
  ...PACKAGE_PAGES.map(([name, dir]) => [`${name}.html`, dir]),
  // The references made from the declarations of the packages (lib/reference.js).
  ...PACKAGE_PAGES.map(([name, dir]) => [`${name}-reference.html`, `${dir}reference.html`]),
  ...Object.entries(PACKAGE_FILES),
  ...ROOT_FILES.map((file) => [file, file]),
  ['./', './'],
]);

// The path from the root of a page (or file) by its flat name; undefined when it is not one of the site.
const pathOf = (flat) => MAP.get(flat);

// The file a path is written to: a folder is its index.html.
const fileOf = (target) => (target.endsWith('/') ? `${target}index.html` : target);

// A path from the root, as seen from a file of the site. A folder is named by its index.html, so the pages open
// wherever the site is: on a server, or as files on a disk (where a folder would show its list of files).
function relative(fromFile, target) {
  const fromDir = path.posix.dirname(fromFile);
  return path.posix.relative(fromDir, target === './' ? 'index.html' : fileOf(target));
}

// The links (href, src) of a page by flat names, as paths from where the page is (`file`, from the root). Links that
// are not flat names of the site (anchors, addresses, paths already relative to the page) are left as they are.
function rewriteLinks(html, file) {
  return html.replace(/\b(href|src)="([^"]*)"/g, (all, attribute, value) => {
    if (/^(?:[a-z]+:|#|\/\/|data:)/i.test(value)) return all;
    const cut = value.search(/[?#]/);
    const name = cut < 0 ? value : value.slice(0, cut);
    const rest = cut < 0 ? '' : value.slice(cut);
    const target = MAP.get(name);
    if (target === undefined) return all;
    return `${attribute}="${relative(file, target)}${rest}"`;
  });
}

// The old addresses of the packages (http.html...): pages that send to their folders.
function redirects() {
  return PACKAGE_PAGES.map(([name, dir]) => ({
    file: `${name}.html`,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>@xufa/${name} · xufa</title>
    <meta http-equiv="refresh" content="0; url=${dir}index.html" />
    <link rel="canonical" href="${dir}index.html" />
  </head>
  <body>
    <p>The page of @xufa/${name} is now <a href="${dir}index.html">${dir}</a>.</p>
  </body>
</html>
`,
  }));
}

export { pathOf, fileOf, relative, rewriteLinks, redirects, PACKAGE_PAGES, PACKAGE_FILES, MAP };
