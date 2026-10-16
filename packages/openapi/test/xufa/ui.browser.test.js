// The explorer in a browser (Chrome or Edge, driven by @xufa/browser; skipped without one): its files from the first
// CDN that gives them right. A CDN that does not answer and one whose bytes are not those of the integrity are passed
// over, under the page's CSP; then it starts, with the css of yours after the explorer's. (The files are stand-ins of
// Swagger UI's, served by a CDN of the test: no network.)
const crypto = require('node:crypto');
const http = require('node:http');
const xufa = require('@xufa/http');
const { chromium, findBrowser } = require('@xufa/browser');
const openapi = require('../..');
const ui = require('../../lib/ui');

const CHROME = findBrowser();

const FILES = {
  'swagger-ui.css': '#swagger-ui { color: rgb(1, 2, 3); }',
  'swagger-ui-bundle.js':
    "window.SwaggerUIBundle = function (config) { document.getElementById('swagger-ui').textContent = 'loaded ' + " +
    'config.url + (window.tampered ? " tampered" : ""); return {}; };\nwindow.SwaggerUIBundle.presets = { apis: 1 };',
  'swagger-ui-standalone-preset.js': 'window.SwaggerUIStandalonePreset = 2;',
};
const hashOf = (text) => `sha384-${crypto.createHash('sha384').update(text).digest('base64')}`;

describe.skipIf(!CHROME)('the explorer in a browser', () => {
  let browser;
  let cdn;
  let app;
  const hits = [];

  beforeAll(async () => {
    // A CDN of two mirrors: /tampered/ changes the bundle, /good/ gives the files.
    cdn = http.createServer((req, res) => {
      hits.push(req.url);
      const [, mirror, , file] = /^\/(\w+)\/([^/]+@[^/]+)\/(.+)$/.exec(req.url) || [];
      let body = FILES[file];
      if (mirror === 'tampered' && file === 'swagger-ui-bundle.js') body = `window.tampered = true;\n${body}`;
      if (body === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'content-type': file.endsWith('.css') ? 'text/css' : 'application/javascript',
        'access-control-allow-origin': '*',
      });
      res.end(body);
    });
    await new Promise((resolve) => {
      cdn.listen(0, '127.0.0.1', resolve);
    });
    const base = `http://127.0.0.1:${cdn.address().port}`;
    app = xufa();
    await app.register(openapi, { openapi: { info: { title: 'Books', version: '1.0.0' } } });
    await app.register(ui, {
      routePrefix: '/docs',
      version: '9.9.9',
      cdn: ['http://127.0.0.1:1/{name}@{version}/{file}', `${base}/tampered/{name}@{version}/{file}`, `${base}/good/{name}@{version}/{file}`],
      integrity: Object.fromEntries(Object.entries(FILES).map(([file, text]) => [file, hashOf(text)])),
      css: '#swagger-ui { background-color: rgb(4, 5, 6); }',
      csp: true,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    browser = await chromium.launch({ executablePath: CHROME });
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (app) await app.close();
    if (cdn) await new Promise((resolve) => cdn.close(resolve));
  });

  it('loads each file from the first CDN that answers with the right bytes, and starts', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${app.server.address().port}/docs`);
    await page.waitForFunction(() => document.getElementById('swagger-ui').textContent.startsWith('loaded'));
    expect(await page.textContent('#swagger-ui')).toBe('loaded /docs/json');
    expect(
      await page.evaluate(() => {
        const style = getComputedStyle(document.getElementById('swagger-ui'));
        return [style.color, style.backgroundColor];
      })
    ).toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)']);
    // (The tampered bundle was asked for and refused; the good one used.)
    expect(hits).toContain(`/tampered/swagger-ui-dist@9.9.9/swagger-ui-bundle.js`);
    expect(hits).toContain(`/good/swagger-ui-dist@9.9.9/swagger-ui-bundle.js`);
    expect(problems.some((text) => /integrity/i.test(text))).toBe(true);
    await context.close();
  }, 60000);
});
