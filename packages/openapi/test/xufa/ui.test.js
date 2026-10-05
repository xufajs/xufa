// The explorer (@xufa/openapi/ui): its page for Swagger UI, Scalar and Redoc from a CDN, the document as JSON and
// YAML, what starts it (safe JSON in a script), a CSP, the files of a folder of yours (and nothing out of it), hooks,
// transformSpecification, and its routes hidden from the document.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xufa = require('@xufa/http');
const yaml = require('yaml');
const openapi = require('../..');
const ui = require('../../lib/ui');

async function appWith(options = {}, document = { openapi: { info: { title: 'Books <API>', version: '1.0.0' } } }) {
  const app = xufa();
  await app.register(openapi, document);
  await app.register(ui, options);
  app.get('/books', { schema: { response: { 200: { type: 'array', items: { type: 'string' } } } } }, () => []);
  await app.ready();
  return app;
}

describe('explorer', () => {
  it('Swagger UI from the CDN, the document as JSON and YAML, and its initializer', async () => {
    const app = await appWith();
    const page = await app.inject({ url: '/documentation' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toContain('<title>Books &lt;API&gt;</title>');
    expect(page.body).toContain(
      `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${ui.VERSIONS.swagger}/swagger-ui-bundle.js`
    );
    expect(page.body).toContain('<script src="/documentation/initializer.js"></script>');
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
    expect(page).toContain(`https://cdn.jsdelivr.net/npm/@scalar/api-reference@${ui.VERSIONS.scalar}`);
    expect(page).toContain('data-url="/docs/json"');
    expect(page).toContain('data-configuration="{&quot;theme&quot;:&quot;purple&quot;}"');
    const redoc = await appWith({ ui: 'redoc', title: 'Reference' });
    const redocPage = (await redoc.inject({ url: '/documentation' })).body;
    expect(redocPage).toContain(`redoc@${ui.VERSIONS.redoc}/bundles/redoc.standalone.js`);
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
    expect(policy).toContain("script-src 'self' https://cdn.jsdelivr.net");
    const own = await appWith({ csp: "default-src 'self'" });
    expect((await own.inject({ url: '/documentation' })).headers['content-security-policy']).toBe("default-src 'self'");
  });

  it('the files of a folder of yours, and nothing out of it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-ui-'));
    fs.writeFileSync(path.join(dir, 'swagger-ui.css'), 'body {}');
    fs.writeFileSync(path.join(dir, 'oauth2-redirect.html'), '<p>ok</p>');
    fs.writeFileSync(path.join(path.dirname(dir), `${path.basename(dir)}-secret.txt`), 'secret');
    try {
      const app = await appWith({ assets: dir, csp: true });
      const page = (await app.inject({ url: '/documentation' })).body;
      expect(page).toContain('href="/documentation/static/swagger-ui.css"');
      expect(page).not.toContain('cdn.jsdelivr.net');
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
      expect(policy).toContain("script-src 'self';");
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
    await expect(appWith({ ui: 'scalar', assets: '.' })).rejects.toThrow(/swagger explorer/);
  });
});
