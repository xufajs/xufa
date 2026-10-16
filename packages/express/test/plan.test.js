// The plans of @xufa/express (lib/plan.js: the layers a router tries for the route @xufa/router found) against
// Express 5 itself: the same app built on both, every request of a list sent to both, the same answers expected. The
// apps are made to trip a plan: routes added in every order, routers and apps mounted on paths with params, all(),
// route(), param(), paths of RegExp, wildcards and optional parts, strict and case-sensitive routers, middlewares that
// change the url or the method, next('route') and next('router'), OPTIONS and HEAD answered by the router.
import http from 'node:http';
import realExpress from 'express';
import express from '../index.js';

const IGNORED = new Set(['date', 'connection', 'keep-alive', 'etag', 'content-length']);

function send(port, { method, url }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: url, agent: false }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        const headers = Object.fromEntries(Object.entries(res.headers).filter(([name]) => !IGNORED.has(name)));
        resolve({ status: res.statusCode, headers, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
const close = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
  });

// Answers what it is: the layer that answered, its params, and the urls.
const answer = (name) => (req, res) =>
  res.json({ name, params: req.params, url: req.url, baseUrl: req.baseUrl, original: req.originalUrl });

function build(lib) {
  const app = lib();
  // (Error pages without stacks: their paths are of each package.)
  app.set('env', 'production');
  app.use((req, res, next) => {
    // A rewrite of the url (as a middleware of rewrites does) and of the method (as method-override does).
    if (req.url === '/old/items') req.url = '/items/moved';
    if (req.query.method) req.method = String(req.query.method).toUpperCase();
    next();
  });

  // Static after a param, and before one.
  app.get('/items/:id', (req, res, next) => (req.params.id === 'skip' ? next() : answer('item by id')(req, res)));
  app.get('/items/new', answer('new item'));
  app.get('/items/skip', answer('skipped to static'));
  app.get('/books/new', answer('new book'));
  app.get('/books/:id', answer('book by id'));
  app.post('/items', answer('post items'));
  app.all('/any/:x', answer('all'));
  app
    .route('/route/:a')
    .get(answer('route get'))
    .put(answer('route put'));
  app.get('/route/:a', answer('after route'));
  app.get('/next', (req, res, next) => next('route'), answer('not me'));
  app.get('/next', answer('next route'));

  // A router with params in its mount path, param(), next('router'), and a router inside it.
  const users = lib.Router({ mergeParams: true });
  users.param('user', (req, res, next, value) => {
    req.user = value.toUpperCase();
    next();
  });
  users.get('/', answer('users root'));
  users.get('/:user', (req, res) => res.json({ name: 'user', user: req.user, params: req.params, baseUrl: req.baseUrl }));
  users.get('/:user/leave', (req, res, next) => next('router'));
  const posts = lib.Router({ mergeParams: true });
  posts.get('/:post', answer('post'));
  users.use('/:user/posts', posts);
  app.use('/orgs/:org/users', users);
  app.get('/orgs/:org/users/:user/leave', answer('after router'));

  // A strict, case-sensitive router.
  const strict = lib.Router({ strict: true, caseSensitive: true });
  strict.get('/exact/', answer('strict with slash'));
  strict.get('/Exact', answer('strict case'));
  app.use('/strict', strict);

  // A mounted app with its own settings.
  const sub = lib();
  sub.set('case sensitive routing', true);
  sub.get('/Hello', answer('sub hello'));
  sub.get('/items/:id', answer('sub item'));
  app.use('/sub', sub);

  // Paths that are more than static parts and params.
  app.get(/^\/re\/(\d+)$/, answer('regexp'));
  app.get('/files/*rest', answer('wildcard'));
  app.get('/opt{/:maybe}', answer('optional'));
  app.get(['/one', '/two/:n'], answer('array'));

  // A middleware mounted on a path, before routes under it.
  app.use('/guarded', (req, res, next) => (req.query.deny ? res.status(403).send('denied') : next()));
  app.get('/guarded/:x', answer('guarded'));
  app.get('/items/moved', answer('moved'));
  app.delete('/items/:id', answer('delete item'));
  return app;
}

const REQUESTS = [
  ['GET', '/items/1'],
  ['GET', '/items/new'],
  ['GET', '/ITEMS/New/'],
  ['GET', '/items/skip'],
  ['GET', '/items/a%20b'],
  ['GET', '/items/%E2%82%AC'],
  ['GET', '/items/%zz'],
  ['GET', '/books/new'],
  ['GET', '/books/9'],
  ['POST', '/items'],
  ['PUT', '/items'],
  ['DELETE', '/items/3'],
  ['DELETE', '/items/3?method=get'],
  ['GET', '/items/3?method=delete'],
  ['HEAD', '/items/1'],
  ['OPTIONS', '/items/1'],
  ['OPTIONS', '/items'],
  ['OPTIONS', '/route/x'],
  ['PATCH', '/any/1'],
  ['GET', '/any/1'],
  ['GET', '/route/x'],
  ['PUT', '/route/x'],
  ['POST', '/route/x'],
  ['GET', '/next'],
  ['GET', '/orgs/acme/users'],
  ['GET', '/orgs/acme/users/'],
  ['GET', '/orgs/acme/users/ada'],
  ['GET', '/orgs/acme/users/ada/leave'],
  ['GET', '/orgs/acme/users/ada/posts/7'],
  ['GET', '/ORGS/acme/USERS/ada/posts/7/'],
  ['GET', '/strict/exact/'],
  ['GET', '/strict/exact'],
  ['GET', '/strict/Exact'],
  ['GET', '/strict/exact?x=1'],
  ['GET', '/sub/Hello'],
  ['GET', '/sub/hello'],
  ['GET', '/SUB/Hello'],
  ['GET', '/sub/items/4'],
  ['GET', '/re/42'],
  ['GET', '/re/x'],
  ['GET', '/files/a/b/c.txt'],
  ['GET', '/files'],
  ['GET', '/opt'],
  ['GET', '/opt/yes'],
  ['GET', '/one'],
  ['GET', '/two/2'],
  ['GET', '/guarded/1'],
  ['GET', '/guarded/1?deny=1'],
  ['GET', '/old/items'],
  ['GET', '/nothing/here'],
  ['GET', '/items'],
  ['GET', '//items/1'],
  ['GET', '/items/1/'],
  ['GET', '/items/1//'],
  // Requests no route of @xufa/http matches (the plan of a miss).
  ['GET', '/missing'],
  ['GET', '/items/1/2'],
  ['GET', '/ITEMS'],
  ['GET', '/books'],
  ['POST', '/books/new'],
  ['PUT', '/any'],
  ['GET', '/strict/exact//'],
  ['GET', '//books/new'],
  ['GET', '/sub/missing'],
  ['GET', '/orgs/acme/users/ada/posts'],
  ['GET', '/orgs/acme/users/ada/posts/7/x'],
  ['GET', '/files/'],
  ['GET', '/re/'],
  ['GET', '/opt/a/b'],
  ['GET', '/guarded'],
  ['GET', '/guarded/1/2?deny=1'],
  ['GET', '/items/a%2Fb'],
  ['GET', '/items/%2F'],
  ['DELETE', '/nothing?method=get'],
  ['OPTIONS', '/missing'],
  ['GET', 'http://localhost/items/1'],
  ['GET', 'http://localhost/missing'],
];

describe('the plans against Express', () => {
  it('every request answered as Express answers it', async () => {
    const servers = await Promise.all([build(realExpress), build(express)].map(listen));
    try {
      for (const [method, url] of REQUESTS) {
        const [expected, actual] = await Promise.all(servers.map((server) => send(server.address().port, { method, url })));
        expect({ method, url, ...actual }).toEqual({ method, url, ...expected });
      }
    } finally {
      await Promise.all(servers.map(close));
    }
  });

  it('the routes @xufa/http can match are its routes, with their plans', async () => {
    const server = build(express).server();
    await server.ready();
    for (const [method, url] of [
      ['GET', '/items/:id'],
      ['HEAD', '/items/:id'],
      ['GET', '/items/new'],
      ['DELETE', '/items/:id'],
      ['PUT', '/route/:a'],
      ['PATCH', '/any/:x'],
      ['GET', '/orgs/:org/users/:user/posts/:post'],
      ['GET', '/sub/items/:id'],
      ['GET', '/two/:n'],
    ]) {
      expect([method, url, server.hasRoute({ method, url: url.replace(/:(\w+)/g, (all, name, at) => `:p${url.slice(0, at).split('/').length - 2}`) })]).toEqual([method, url, true]);
    }
    // Paths it cannot match go through every layer.
    expect(server.hasRoute({ method: 'GET', url: '/files/*' })).toBe(false);
    await server.close();
  });

  it('a route added after the first request is seen', async () => {
    const apps = [realExpress(), express()];
    const servers = await Promise.all(apps.map(listen));
    try {
      const ask = () => Promise.all(servers.map((server) => send(server.address().port, { method: 'GET', url: '/late/1' })));
      let [expected, actual] = await ask();
      expect(actual).toEqual(expected);
      for (const app of apps) app.get('/late/:n', answer('late'));
      [expected, actual] = await ask();
      expect(actual).toEqual(expected);
      expect(JSON.parse(actual.body).name).toBe('late');
    } finally {
      await Promise.all(servers.map(close));
    }
  });
});
