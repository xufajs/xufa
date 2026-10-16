'use strict';

// The explorer of the document of @xufa/openapi (app.swagger()): Swagger UI (the default), Scalar or Redoc. Its files
// come from CDNs at pinned versions (no package to install), each file from the first that answers (jsdelivr, then
// npmmirror, reachable from China; or the CDNs, mirrors and templates given), checked by its integrity (sha384: the
// same bytes on all of them, so a mirror that changes them is passed over); or from a folder of yours (`assets`),
// file by file: what is in it is served from it (a copy of swagger-ui-dist, a CSS of your own), the rest from the
// CDNs. `css`, `head` and `page` change its look without copying it. Its routes, hidden from the document:
//
//   GET <routePrefix>                 the page (and <routePrefix>/)
//   GET <routePrefix>/json            the document (transformSpecification(document, request, reply) may change it)
//   GET <routePrefix>/yaml            the same, as YAML
//   GET <routePrefix>/initializer.js  what loads its files (a CDN after another) and starts it (a file, not inline:
//                                     strict CSPs allow it)
//   GET <routePrefix>/custom.css      the css given
//   GET <routePrefix>/static/*        the files of `assets`, when given
//
//   app.register(require('@xufa/openapi'), { openapi: { info: { title: 'Books', version: '1.0.0' } } });
//   app.register(require('@xufa/openapi/ui'), { routePrefix: '/docs', ui: 'scalar' });
const fs = require('node:fs');
const path = require('node:path');
const clone = require('./xufa/clone');
const yaml = require('./xufa/yaml');

const VERSIONS = { swagger: '5.33.1', scalar: '1.73.0', redoc: '2.5.4' };
// The package of each explorer and its files: styles and scripts, in the order they load.
const PACKAGES = {
  swagger: {
    name: 'swagger-ui-dist',
    styles: ['swagger-ui.css'],
    scripts: ['swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js'],
  },
  scalar: { name: '@scalar/api-reference', styles: [], scripts: ['dist/browser/standalone.js'] },
  redoc: { name: 'redoc', styles: [], scripts: ['bundles/redoc.standalone.js'] },
};
// The sha384 of the files of the pinned versions (the same on jsdelivr, unpkg and npmmirror).
const INTEGRITY = {
  'swagger-ui-dist@5.33.1': {
    'swagger-ui.css': 'sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW',
    'swagger-ui-bundle.js': 'sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw',
    'swagger-ui-standalone-preset.js': 'sha384-My2aDM4r2Mbm3ybHcubKm9O9U8FEjvF/O5nGvE9YK5dzqOTbWEKa79RPJ1krdMaF',
  },
  '@scalar/api-reference@1.73.0': {
    'dist/browser/standalone.js': 'sha384-OKyMdsDX84ypSZEhVun8YElXk5c2GQaH3EXPOc6ItmVcLDUAvKHYwvDLvAgsqVtB',
  },
  'redoc@2.5.4': {
    'bundles/redoc.standalone.js': 'sha384-w447zOpYfw/1Tv/5AK9NfHTlQIqE3RVR6KY62jCyy9zNDgO64cMwGGP1Fj0zJVf5',
  },
};
// CDNs by name: templates of {name}, {version} and {file}.
const CDNS = {
  jsdelivr: 'https://cdn.jsdelivr.net/npm/{name}@{version}/{file}',
  unpkg: 'https://unpkg.com/{name}@{version}/{file}',
  npmmirror: 'https://registry.npmmirror.com/{name}/{version}/files/{file}',
};
const DEFAULT_CDNS = ['jsdelivr', 'npmmirror'];
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

// A CDN given as a name, a template or a base URL (jsdelivr's way: <base>/<name>@<version>/<file>).
function templateOf(cdn) {
  if (CDNS[cdn]) return CDNS[cdn];
  if (typeof cdn !== 'string' || !/^https?:\/\//.test(cdn)) {
    throw new Error(`Unknown CDN ${cdn} (${Object.keys(CDNS).join(', ')}, a template or a URL)`);
  }
  return cdn.includes('{file}') ? cdn : `${cdn.replace(/\/+$/, '')}/{name}@{version}/{file}`;
}

const html = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// JSON written into a script: nothing in it can close the script.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const script = (value) =>
  JSON.stringify(value === undefined ? null : value)
    .replace(/</g, '\\u003c')
    .split(LS)
    .join('\\u2028')
    .split(PS)
    .join('\\u2029');

// What loads the files in the browser: each from its first source that loads (the next on an error), the scripts one
// after the other, then start().
const LOADER = `function load(tag, file, done) {
    var i = 0;
    (function next() {
      if (i === file.urls.length) return done(new Error('Could not load ' + file.urls.join(', ')));
      var url = file.urls[i++];
      var el = document.createElement(tag);
      if (tag === 'link') { el.rel = 'stylesheet'; el.href = url; } else { el.src = url; el.async = false; }
      if (file.integrity && url.indexOf('/') !== 0) { el.integrity = file.integrity; el.crossOrigin = 'anonymous'; }
      el.onload = function () { done(null); };
      el.onerror = function () { el.parentNode.removeChild(el); next(); };
      document.head.appendChild(el);
    })();
  }
  files.styles.forEach(function (file) { load('link', file, function (err) { if (err) console.error(err); }); });
  (function scripts(i) {
    if (i === files.scripts.length) return start();
    load('script', files.scripts[i], function (err) {
      if (err) { console.error(err); return; }
      scripts(i + 1);
    });
  })(0);`;

function explorer(app, opts, next) {
  const {
    routePrefix = '/documentation',
    ui = 'swagger',
    cdn = DEFAULT_CDNS,
    version = VERSIONS[ui],
    assets = null,
    integrity = true,
    css = null,
    head = '',
    page: pageHook = null,
    title,
    uiConfig = {},
    initOAuth = null,
    transformSpecification = null,
    transformSpecificationClone = true,
    uiHooks = {},
    csp = false,
  } = opts;
  if (!VERSIONS[ui]) return next(new Error(`Unknown explorer ${ui} (swagger, scalar, redoc)`));
  if (!app.hasDecorator('swagger')) {
    return next(new Error('Register @xufa/openapi before its explorer: app.swagger() makes the document'));
  }
  let templates;
  try {
    templates = [].concat(cdn).map(templateOf);
  } catch (err) {
    return next(err);
  }
  const prefix = routePrefix.replace(/\/+$/, '');
  const root = assets ? path.resolve(assets) : null;
  const base = `${prefix}/static`;
  const hooks = {};
  if (uiHooks.onRequest) hooks.onRequest = uiHooks.onRequest;
  if (uiHooks.preHandler) hooks.preHandler = uiHooks.preHandler;
  const route = (url, handler) => app.route({ method: 'GET', url, schema: { hide: true }, ...hooks, handler });

  // Where each file comes from: the folder of assets when it is in it, else the CDNs, in their order (with its
  // integrity, for the pinned versions).
  const pkg = PACKAGES[ui];
  // (integrity: true, the hashes of the pinned versions; false, none; or file -> hash, over them.)
  const pinned = INTEGRITY[`${pkg.name}@${version}`] || {};
  const hashes = integrity === false ? {} : typeof integrity === 'object' ? { ...pinned, ...integrity } : pinned;
  const has = (file) => Boolean(root) && fs.existsSync(path.join(root, file));
  const sourceOf = (file) => {
    if (has(file)) return { urls: [`${base}/${file}`] };
    const urls = templates.map((template) =>
      template.replaceAll('{name}', pkg.name).replaceAll('{version}', version).replaceAll('{file}', file)
    );
    return hashes[file] ? { urls, integrity: hashes[file] } : { urls };
  };
  const files = { styles: pkg.styles.map(sourceOf), scripts: pkg.scripts.map(sourceOf) };
  if (css !== null) files.styles.push({ urls: [`${prefix}/custom.css`] });
  // (An OAuth login from Swagger UI comes back to a page of the same origin: the folder's.)
  const oauthRedirect = ui === 'swagger' && has('oauth2-redirect.html');
  const origins = [
    ...new Set(
      [...files.styles, ...files.scripts].flatMap((file) =>
        file.urls.filter((url) => !url.startsWith('/')).map((url) => new URL(url).origin)
      )
    ),
  ];

  const pageTitle = () => {
    if (title) return title;
    const document = app.swagger();
    return (document && document.info && document.info.title) || 'API documentation';
  };

  // The page of each explorer: its place, and the initializer that loads the rest.
  function page() {
    const name = html(pageTitle());
    const top = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${name}</title>\n${head ? `${head}\n` : ''}</head>\n<body>\n`;
    const init = `<script src="${html(`${prefix}/initializer.js`)}"></script>\n</body>\n</html>\n`;
    if (ui === 'scalar') {
      return `${top}<script id="api-reference" data-url="${html(`${prefix}/json`)}" data-configuration="${html(JSON.stringify(uiConfig))}"></script>\n${init}`;
    }
    if (ui === 'redoc') return `${top}<div id="redoc"></div>\n${init}`;
    return `${top}<div id="swagger-ui"></div>\n${init}`;
  }

  // What starts the explorer once its files are loaded: the configuration as JSON (functions of uiConfig cannot be
  // sent to the browser).
  function start() {
    if (ui === 'scalar') return '';
    if (ui === 'redoc') {
      return `Redoc.init(${script(`${prefix}/json`)}, ${script(uiConfig)}, document.getElementById('redoc'));`;
    }
    return (
      `window.ui = SwaggerUIBundle(Object.assign({\n` +
      `      url: ${script(`${prefix}/json`)},\n      dom_id: '#swagger-ui',\n      deepLinking: true,\n` +
      `      presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],\n      layout: 'StandaloneLayout',\n` +
      (oauthRedirect
        ? `      oauth2RedirectUrl: new URL(${script(`${base}/oauth2-redirect.html`)}, window.location.href).href,\n`
        : '') +
      `    }, ${script(uiConfig)}));` +
      (initOAuth ? `\n    window.ui.initOAuth(${script(initOAuth)});` : '')
    );
  }

  function initializer() {
    return `(function () {\n  var files = ${script(files)};\n  function start() {\n    ${start()}\n  }\n  ${LOADER}\n})();\n`;
  }

  // The Content-Security-Policy of the page (csp: true, or a policy of yours): its own origin and the CDNs'.
  function policy() {
    if (!csp) return null;
    if (typeof csp === 'string') return csp;
    const cdns = origins.map((origin) => ` ${origin}`).join('');
    return [
      "default-src 'self'",
      `script-src 'self'${cdns}`,
      `style-src 'self' 'unsafe-inline'${cdns}`,
      `font-src 'self' data:${cdns}`,
      "img-src 'self' data: https:",
      "connect-src 'self'",
    ].join('; ');
  }

  function documentOf(request, reply) {
    if (!transformSpecification) return app.swagger();
    const document = transformSpecificationClone ? clone(app.swagger()) : app.swagger();
    return transformSpecification(document, request, reply);
  }

  const sendPage = async (request, reply) => {
    const header = policy();
    if (header) reply.header('content-security-policy', header);
    const body = pageHook ? await pageHook(page(), request, reply) : page();
    reply.type('text/html; charset=utf-8').send(body);
  };
  route(prefix || '/', sendPage);
  // (A router that ignores trailing slashes has '<prefix>/' in '<prefix>' already.)
  const config = app.initialConfig || {};
  const ignoresTrailingSlash = Boolean(config.routerOptions?.ignoreTrailingSlash ?? config.ignoreTrailingSlash);
  if (prefix && !ignoresTrailingSlash) route(`${prefix}/`, sendPage);
  route(`${prefix}/initializer.js`, (request, reply) => {
    reply.type('application/javascript; charset=utf-8').send(initializer());
  });
  route(`${prefix}/json`, async (request, reply) => documentOf(request, reply));
  route(`${prefix}/yaml`, async (request, reply) => {
    const document = transformSpecification
      ? yaml.stringify(await documentOf(request, reply))
      : app.swagger({ yaml: true });
    reply.type('application/x-yaml').send(document);
  });
  if (css !== null) {
    route(`${prefix}/custom.css`, (request, reply) => {
      reply.type('text/css; charset=utf-8').send(css);
    });
  }

  if (root) {
    route(`${prefix}/static/*`, async (request, reply) => {
      const file = path.resolve(root, `.${path.sep}${request.params['*']}`);
      // Nothing out of the folder.
      if (file !== root && !file.startsWith(root + path.sep)) return reply.code(404).send();
      let content;
      try {
        content = await fs.promises.readFile(file);
      } catch {
        return reply.code(404).send();
      }
      return reply.type(TYPES[path.extname(file)] || 'application/octet-stream').send(content);
    });
  }
  next();
}

explorer[Symbol.for('fastify.display-name')] = '@xufa/openapi/ui';
explorer[Symbol.for('plugin-meta')] = { name: '@xufa/openapi/ui' };

module.exports = explorer;
module.exports.VERSIONS = VERSIONS;
module.exports.CDNS = CDNS;
