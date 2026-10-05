'use strict';

// The explorer of the document of @xufa/openapi (app.swagger()): Swagger UI (the default), Scalar or Redoc, loaded from
// a CDN at pinned versions (no package to install), or Swagger UI from a folder of yours (`assets`: the folder of
// swagger-ui-dist, for apps without access to a CDN or with OAuth logins from the explorer). Its routes, hidden from
// the document:
//
//   GET <routePrefix>                 the page (and <routePrefix>/)
//   GET <routePrefix>/json            the document (transformSpecification(document, request, reply) may change it)
//   GET <routePrefix>/yaml            the same, as YAML
//   GET <routePrefix>/initializer.js  what starts the explorer (a file, not inline: strict CSPs allow it)
//   GET <routePrefix>/static/*        the files of `assets`, when given
//
//   app.register(require('@xufa/openapi'), { openapi: { info: { title: 'Books', version: '1.0.0' } } });
//   app.register(require('@xufa/openapi/ui'), { routePrefix: '/docs', ui: 'scalar' });
const fs = require('node:fs');
const path = require('node:path');
const clone = require('./xufa/clone');
const yaml = require('./xufa/yaml');

const VERSIONS = { swagger: '5.33.1', scalar: '1.73.0', redoc: '2.5.4' };
const TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

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

function explorer(app, opts, next) {
  const {
    routePrefix = '/documentation',
    ui = 'swagger',
    cdn = 'https://cdn.jsdelivr.net/npm',
    version = VERSIONS[ui],
    assets = null,
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
  if (assets && ui !== 'swagger')
    return next(new Error('assets is a folder of swagger-ui-dist: for the swagger explorer'));
  const prefix = routePrefix.replace(/\/+$/, '');
  const base = assets ? `${prefix}/static` : null;
  const hooks = {};
  if (uiHooks.onRequest) hooks.onRequest = uiHooks.onRequest;
  if (uiHooks.preHandler) hooks.preHandler = uiHooks.preHandler;
  const route = (url, handler) => app.route({ method: 'GET', url, schema: { hide: true }, ...hooks, handler });

  const pageTitle = () => {
    if (title) return title;
    const document = app.swagger();
    return (document && document.info && document.info.title) || 'API documentation';
  };

  // The page of each explorer.
  function page() {
    const name = html(pageTitle());
    const head = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${name}</title>\n`;
    if (ui === 'scalar') {
      const src = `${cdn}/@scalar/api-reference@${version}`;
      return `${head}</head>\n<body>\n<script id="api-reference" data-url="${html(`${prefix}/json`)}" data-configuration="${html(JSON.stringify(uiConfig))}"></script>\n<script src="${html(src)}"></script>\n</body>\n</html>\n`;
    }
    if (ui === 'redoc') {
      const src = `${cdn}/redoc@${version}/bundles/redoc.standalone.js`;
      return `${head}</head>\n<body>\n<div id="redoc"></div>\n<script src="${html(src)}"></script>\n<script src="${html(`${prefix}/initializer.js`)}"></script>\n</body>\n</html>\n`;
    }
    const from = base || `${cdn}/swagger-ui-dist@${version}`;
    return (
      `${head}<link rel="stylesheet" href="${html(`${from}/swagger-ui.css`)}">\n</head>\n<body>\n<div id="swagger-ui"></div>\n` +
      `<script src="${html(`${from}/swagger-ui-bundle.js`)}"></script>\n` +
      `<script src="${html(`${from}/swagger-ui-standalone-preset.js`)}"></script>\n` +
      `<script src="${html(`${prefix}/initializer.js`)}"></script>\n</body>\n</html>\n`
    );
  }

  // What starts it: the configuration as JSON (functions of uiConfig cannot be sent to the browser).
  function initializer() {
    if (ui === 'redoc') {
      return `Redoc.init(${script(`${prefix}/json`)}, ${script(uiConfig)}, document.getElementById('redoc'));\n`;
    }
    return (
      `window.ui = SwaggerUIBundle(Object.assign({\n` +
      `  url: ${script(`${prefix}/json`)},\n  dom_id: '#swagger-ui',\n  deepLinking: true,\n` +
      `  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],\n  layout: 'StandaloneLayout',\n` +
      (base
        ? `  oauth2RedirectUrl: new URL(${script(`${base}/oauth2-redirect.html`)}, window.location.href).href,\n`
        : '') +
      `}, ${script(uiConfig)}));\n` +
      (initOAuth ? `window.ui.initOAuth(${script(initOAuth)});\n` : '')
    );
  }

  // The Content-Security-Policy of the page (csp: true, or a policy of yours).
  function policy() {
    if (!csp) return null;
    if (typeof csp === 'string') return csp;
    const origin = assets ? '' : ` ${new URL(cdn).origin}`;
    return [
      "default-src 'self'",
      `script-src 'self'${origin}`,
      `style-src 'self' 'unsafe-inline'${origin}`,
      `font-src 'self' data:${origin}`,
      "img-src 'self' data: https:",
      "connect-src 'self'",
    ].join('; ');
  }

  function documentOf(request, reply) {
    if (!transformSpecification) return app.swagger();
    const document = transformSpecificationClone ? clone(app.swagger()) : app.swagger();
    return transformSpecification(document, request, reply);
  }

  const sendPage = (request, reply) => {
    const header = policy();
    if (header) reply.header('content-security-policy', header);
    reply.type('text/html; charset=utf-8').send(page());
  };
  route(prefix || '/', sendPage);
  if (prefix) route(`${prefix}/`, sendPage);
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

  if (assets) {
    const root = path.resolve(assets);
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
