// The explorer (@xufa/openapi/ui): its page for Swagger UI, Scalar and Redoc, its files from CDNs (names, templates,
// a base URL; one after another; their integrity) or file by file from a folder of yours (and nothing out of it), the
// document as JSON and YAML, what starts it (safe JSON in a script), a CSP of its origins, css, head and page, hooks,
// transformSpecification, and its routes hidden from the document. (ui.browser.test.js: in a browser.)
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xufa = require('@xufa/http');
const yaml = require('yaml');
const openapi = require('../..');
const ui = require('../../lib/ui');

// The files the initializer loads: { styles, scripts } of { urls, integrity }.
async function filesOf(app, prefix = '/documentation') {
  const init = (await app.inject({ url: `${prefix}/initializer.js` })).body;
  return JSON.parse(/var files = (.*);\n/.exec(init)[1]);
}

async function appWith(options = {}, document = { openapi: { info: { title: 'Books <API>', version: '1.0.0' } } }) {
  const app = xufa();
  await app.register(openapi, document);
  await app.register(ui, options);
  app.get('/books', { schema: { response: { 200: { type: 'array', items: { type: 'string' } } } } }, () => []);
  await app.ready();
  return app;
}

describe('explorer', () => {
  it('on a router that ignores trailing slashes, the page at <prefix> and <prefix>/ (one route)', async () => {
    const app = xufa({ routerOptions: { ignoreTrailingSlash: true } });
    await app.register(openapi, { openapi: { info: { title: 'Books', version: '1.0.0' } } });
    await app.register(ui, { routePrefix: '/docs' });
    await app.ready();
    expect((await app.inject({ url: '/docs' })).statusCode).toBe(200);
    expect((await app.inject({ url: '/docs/' })).statusCode).toBe(200);
  });

  it('Swagger UI from the CDNs (jsdelivr, then npmmirror), the document as JSON and YAML, its initializer', async () => {
    const app = await appWith();
    const page = await app.inject({ url: '/documentation' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toContain('<title>Books &lt;API&gt;</title>');
    expect(page.body).toContain('<div id="swagger-ui"></div>\n<script src="/documentation/initializer.js"></script>');
    const version = ui.VERSIONS.swagger;
    const files = await filesOf(app);
    expect(files.scripts[0]).toEqual({
      urls: [
        `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui-bundle.js`,
        `https://registry.npmmirror.com/swagger-ui-dist/${version}/files/swagger-ui-bundle.js`,
      ],
      integrity: expect.stringMatching(/^sha384-[A-Za-z0-9+/]{64}$/),
    });
    expect(files.styles.map((file) => file.urls[0])).toEqual([
      `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${version}/swagger-ui.css`,
    ]);
    expect(files.scripts.map((file) => path.basename(file.urls[0]))).toEqual([
      'swagger-ui-bundle.js',
      'swagger-ui-standalone-preset.js',
    ]);
    expect((await app.inject({ url: '/documentation/' })).body).toBe(page.body);

    const json = await app.inject({ url: '/documentation/json' });
    expect(json.json()).toMatchObject({ openapi: '3.0.3', info: { title: 'Books <API>' } });
    expect(Object.keys(json.json().paths)).toEqual(['/books']);
    const text = await app.inject({ url: '/documentation/yaml' });
    expect(text.headers['content-type']).toBe('application/x-yaml');
    expect(yaml.parse(text.body)).toEqual(json.json());

    const init = await app.inject({ url: '/documentation/initializer.js' });
    expect(init.headers['content-type']).toBe('application/javascript; charset=utf-8');
    expect(init.body).toContain('url: "/documentation/json"');
  });

  it('Scalar and Redoc', async () => {
    const scalar = await appWith({ ui: 'scalar', routePrefix: '/docs', uiConfig: { theme: 'purple' } });
    const page = (await scalar.inject({ url: '/docs' })).body;
    expect((await filesOf(scalar, '/docs')).scripts[0].urls[0]).toBe(
      `https://cdn.jsdelivr.net/npm/@scalar/api-reference@${ui.VERSIONS.scalar}/dist/browser/standalone.js`
    );
    expect(page).toContain('data-url="/docs/json"');
    expect(page).toContain('data-configuration="{&quot;theme&quot;:&quot;purple&quot;}"');
    const redoc = await appWith({ ui: 'redoc', title: 'Reference' });
    const redocPage = (await redoc.inject({ url: '/documentation' })).body;
    expect((await filesOf(redoc)).scripts[0].urls[1]).toBe(
      `https://registry.npmmirror.com/redoc/${ui.VERSIONS.redoc}/files/bundles/redoc.standalone.js`
    );
    expect(redocPage).toContain('<title>Reference</title>');
    expect((await redoc.inject({ url: '/documentation/initializer.js' })).body).toContain(
      'Redoc.init("/documentation/json"'
    );
  });

  it('nothing given can close the script of the initializer', async () => {
    const app = await appWith({
      uiConfig: { docExpansion: '</script><script>alert(1)</script>' },
      initOAuth: { clientId: 'x' },
    });
    const init = (await app.inject({ url: '/documentation/initializer.js' })).body;
    expect(init).not.toContain('</script>');
    expect(init).toContain('\\u003c/script>');
    expect(init).toContain('window.ui.initOAuth({"clientId":"x"})');
  });

  it('a CSP for the page', async () => {
    const app = await appWith({ csp: true });
    const policy = (await app.inject({ url: '/documentation' })).headers['content-security-policy'];
    expect(policy).toContain("script-src 'self' https://cdn.jsdelivr.net https://registry.npmmirror.com;");
    const own = await appWith({ csp: "default-src 'self'" });
    expect((await own.inject({ url: '/documentation' })).headers['content-security-policy']).toBe("default-src 'self'");
  });

  it('the files of a folder of yours, and nothing out of it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-ui-'));
    fs.writeFileSync(path.join(dir, 'swagger-ui.css'), 'body {}');
    fs.writeFileSync(path.join(dir, 'oauth2-redirect.html'), '<p>ok</p>');
    fs.writeFileSync(path.join(path.dirname(dir), `${path.basename(dir)}-secret.txt`), 'secret');
    try {
      const app = await appWith({ assets: dir, csp: true, cdn: 'unpkg' });
      // (File by file: the CSS of the folder, the scripts from the CDN.)
      const files = await filesOf(app);
      expect(files.styles).toEqual([{ urls: ['/documentation/static/swagger-ui.css'] }]);
      expect(files.scripts[0].urls).toEqual([
        `https://unpkg.com/swagger-ui-dist@${ui.VERSIONS.swagger}/swagger-ui-bundle.js`,
      ]);
      const css = await app.inject({ url: '/documentation/static/swagger-ui.css' });
      expect([css.statusCode, css.headers['content-type'], css.body]).toEqual([
        200,
        'text/css; charset=utf-8',
        'body {}',
      ]);
      expect((await app.inject({ url: '/documentation/initializer.js' })).body).toContain('oauth2RedirectUrl');
      expect((await app.inject({ url: '/documentation/static/missing.js' })).statusCode).toBe(404);
      const escape = `/documentation/static/..%2F${path.basename(dir)}-secret.txt`;
      expect((await app.inject({ url: escape })).statusCode).toBe(404);
      expect((await app.inject({ url: '/documentation/static/../../package.json' })).statusCode).toBe(404);
      const policy = (await app.inject({ url: '/documentation' })).headers['content-security-policy'];
      expect(policy).toContain("script-src 'self' https://unpkg.com;");
      // (All of them in the folder: no CDN at all.)
      for (const file of ['swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js']) {
        fs.writeFileSync(path.join(dir, file), '');
      }
      const local = await appWith({ assets: dir, csp: true });
      expect(JSON.stringify(await filesOf(local))).not.toContain('https:');
      const own = (await local.inject({ url: '/documentation' })).headers['content-security-policy'];
      expect(own).toContain("script-src 'self';");
      // (Redoc's and Scalar's files from a folder too, by their paths in their packages.)
      fs.mkdirSync(path.join(dir, 'bundles'));
      fs.writeFileSync(path.join(dir, 'bundles/redoc.standalone.js'), '');
      const redoc = await appWith({ ui: 'redoc', assets: dir });
      expect((await filesOf(redoc)).scripts).toEqual([{ urls: ['/documentation/static/bundles/redoc.standalone.js'] }]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(path.join(path.dirname(dir), `${path.basename(dir)}-secret.txt`), { force: true });
    }
  });

  it('hooks of its routes (to protect them), and transformSpecification', async () => {
    const app = await appWith({
      uiHooks: {
        onRequest: async (request, reply) => {
          if (request.headers['x-staff'] !== 'yes') reply.code(401).send({ error: 'staff only' });
        },
      },
      transformSpecification: (document, request) => ({
        ...document,
        info: { ...document.info, title: `For ${request.headers['x-staff']}` },
      }),
    });
    expect((await app.inject({ url: '/documentation/json' })).statusCode).toBe(401);
    const json = await app.inject({ url: '/documentation/json', headers: { 'x-staff': 'yes' } });
    expect(json.json().info.title).toBe('For yes');
    // The document itself is not changed (it was copied).
    expect(app.swagger().info.title).toBe('Books <API>');
    const text = await app.inject({ url: '/documentation/yaml', headers: { 'x-staff': 'yes' } });
    expect(yaml.parse(text.body).info.title).toBe('For yes');
  });

  it('its routes are not in the document', async () => {
    const app = await appWith();
    expect(Object.keys(app.swagger().paths)).toEqual(['/books']);
  });

  it('needs @xufa/openapi first, and knows its explorers', async () => {
    const alone = xufa();
    alone.register(ui);
    await expect(alone.ready()).rejects.toThrow(/Register @xufa\/openapi before/);
    await expect(appWith({ ui: 'graphiql' })).rejects.toThrow(/Unknown explorer/);
    await expect(appWith({ cdn: 'cdnjs' })).rejects.toThrow(/Unknown CDN cdnjs/);
  });

  it('CDNs by name, template or base URL, in their order; integrity of the pinned versions, given, or none', async () => {
    const app = await appWith({
      cdn: ['unpkg', 'https://mirror.example/npm/', 'https://cdn.example/{name}/{version}/{file}?v=1'],
    });
    const version = ui.VERSIONS.swagger;
    expect((await filesOf(app)).scripts[1].urls).toEqual([
      `https://unpkg.com/swagger-ui-dist@${version}/swagger-ui-standalone-preset.js`,
      `https://mirror.example/npm/swagger-ui-dist@${version}/swagger-ui-standalone-preset.js`,
      `https://cdn.example/swagger-ui-dist/${version}/swagger-ui-standalone-preset.js?v=1`,
    ]);
    expect((await filesOf(await appWith({ integrity: false }))).scripts[0].integrity).toBeUndefined();
    // (Another version: no hashes of its own, unless given.)
    const other = await filesOf(await appWith({ version: '5.0.0', integrity: { 'swagger-ui-bundle.js': 'sha384-mine' } }));
    expect(other.scripts.map((file) => file.integrity)).toEqual(['sha384-mine', undefined]);
    expect(other.scripts[0].urls[0]).toContain('swagger-ui-dist@5.0.0/');
  });

  it("its look: a css of yours after the explorer's, HTML in the head, the page changed by a function", async () => {
    const app = await appWith({
      css: '.topbar { display: none }',
      head: '<link rel="icon" href="/favicon.png">',
      page: (text, request) => text.replace('</body>', `<footer>${request.url}</footer>\n</body>`),
    });
    const page = (await app.inject({ url: '/documentation' })).body;
    expect(page).toContain('<link rel="icon" href="/favicon.png">\n</head>');
    expect(page).toContain('<footer>/documentation</footer>');
    const files = await filesOf(app);
    expect(files.styles.at(-1)).toEqual({ urls: ['/documentation/custom.css'] });
    const css = await app.inject({ url: '/documentation/custom.css' });
    expect([css.headers['content-type'], css.body]).toEqual(['text/css; charset=utf-8', '.topbar { display: none }']);
    expect(Object.keys(app.swagger().paths)).toEqual(['/books']);
  });
});
