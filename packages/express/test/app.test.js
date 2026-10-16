// The app's own options: @xufa/http's options for its server, plugins of @xufa/http with routes of their own, and the
// app as a function (req, res) of a server of Node's (every layer tried in turn), answering as its own server does.
import http from 'node:http';
import express from '../index.js';

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
const close = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
  });

async function answer(server, url, init) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, init);
  return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
}

function build() {
  const app = express();
  const router = express.Router();
  router.get('/items/:id', (req, res) => res.send({ id: req.params.id, query: req.query }));
  router.post('/items', express.json(), (req, res) => res.status(201).json(req.body));
  app.use('/api', router);
  app.use((req, res) => res.status(404).send('none'));
  // eslint-disable-next-line no-unused-vars -- Express tells error handlers by their four arguments
  app.use((err, req, res, next) => res.status(err.status || 500).send(err.message));
  return app;
}

describe('the app', () => {
  it('as a function (req, res) of a server of Node, the same answers as on its own server', async () => {
    const own = await listen(http.createServer(build()));
    const routed = await new Promise((resolve) => {
      const server = build().listen(0, '127.0.0.1', () => resolve(server));
    });
    try {
      const requests = [
        ['/api/items/7?a=1&a=2'],
        ['/API/items/x%20y/'],
        ['/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"n":1}' }],
        ['/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }],
        ['/nothing'],
      ];
      for (const [url, init] of requests) {
        expect(await answer(own, url, init)).toEqual(await answer(routed, url, init));
      }
    } finally {
      await close(own);
      await close(routed);
    }
  });

  it('plugins of @xufa/http, with routes of their own, before the layers', async () => {
    const app = build();
    app.register(async (instance) => {
      instance.get('/native', async () => ({ native: true }));
    });
    const server = app.server();
    await server.ready();
    expect((await server.inject({ url: '/native' })).json()).toEqual({ native: true });
    expect((await server.inject({ url: '/api/items/1' })).json()).toEqual({ id: '1', query: {} });
    await server.close();
  });

  it("a plugin's route takes an Express route's path (of the app, or of a router mounted), and the app's other routes stay", async () => {
    const app = express();
    app.get('/api/ping', (req, res) => res.send({ by: 'express' }));
    const router = express.Router();
    router.get('/items/:id', (req, res) => res.send({ by: 'router', id: req.params.id }));
    router.get('/kept', (req, res) => res.send({ by: 'router' }));
    app.use('/api', router);
    app.register(async (instance) => {
      instance.get('/api/ping', async () => ({ by: 'native' }));
      instance.get('/api/items/:id', async (request) => ({ by: 'native', id: request.params.id }));
    });
    const server = listen(http.createServer(app));
    const { port } = (await server).address();
    const get = (url) =>
      new Promise((resolve) => {
        http.get({ port, path: url }, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(JSON.parse(body)));
        });
      });
    expect(await get('/api/ping')).toEqual({ by: 'native' });
    expect(await get('/api/items/7')).toEqual({ by: 'native', id: '7' });
    expect(await get('/api/kept')).toEqual({ by: 'router' });
    await close(await server);
  });

  it('an instance that cannot be made is made once and said (Express answers), not made again for each request', async () => {
    const app = express();
    app.get('/a', (req, res) => res.send('a'));
    const warnings = [];
    const onWarning = (warning) => warning.code === 'XUFA_EXPRESS_UNROUTED' && warnings.push(warning.message);
    process.on('warning', onWarning);
    let builds = 0;
    app.register(async () => {
      builds += 1;
      throw new Error('a plugin that fails');
    });
    const server = await listen(http.createServer(app));
    const { port } = server.address();
    const get = () =>
      new Promise((resolve) => {
        http.get({ port, path: '/a' }, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve(body));
        });
      });
    expect([await get(), await get(), await get()]).toEqual(['a', 'a', 'a']);
    expect(builds).toBe(1);
    expect(warnings).toEqual([expect.stringContaining('a plugin that fails')]);
    process.off('warning', onWarning);
    await close(server);
  });

  it('options of @xufa/http for its server (express({ server }), app.server(options))', async () => {
    const app = express({ server: { bodyLimit: 4321 } });
    app.get('/', (req, res) => res.send('ok'));
    const server = app.server({ connectionTimeout: 1234 });
    expect(server.initialConfig.bodyLimit).toBe(4321);
    expect(server.initialConfig.connectionTimeout).toBe(1234);
    // What the layers need stays: paths without case, with or without a trailing slash.
    expect(server.initialConfig.routerOptions).toMatchObject({ caseSensitive: false, ignoreTrailingSlash: true });
    await server.close();
  });
});
