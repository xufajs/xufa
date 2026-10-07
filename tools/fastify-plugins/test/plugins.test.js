/* global FormData, Blob */
// The main plugins of fastify on @xufa/http: each one registered as its README shows, and its requests made with
// inject(). They are installed here (npm install in this folder), not in the packages, which have no dependencies.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const xufa = require('../../../packages/http');

test('@fastify/cors: the headers of CORS, and preflights', async () => {
  const app = xufa();
  await app.register(require('@fastify/cors'), { origin: 'https://app.example', credentials: true });
  app.get('/', async () => ({ ok: true }));
  const simple = await app.inject({ url: '/', headers: { origin: 'https://app.example' } });
  assert.equal(simple.statusCode, 200);
  assert.equal(simple.headers['access-control-allow-origin'], 'https://app.example');
  assert.equal(simple.headers['access-control-allow-credentials'], 'true');
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/',
    headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' },
  });
  assert.equal(preflight.statusCode, 204);
  assert.match(preflight.headers['access-control-allow-methods'], /POST/);
});

test('@fastify/helmet: security headers on every reply', async () => {
  const app = xufa();
  await app.register(require('@fastify/helmet'));
  app.get('/', async () => 'hi');
  const res = await app.inject('/');
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
});

test('@fastify/rate-limit: 429 after the maximum', async () => {
  const app = xufa();
  await app.register(require('@fastify/rate-limit'), { max: 2, timeWindow: 60000 });
  app.get('/', async () => 'hi');
  const statuses = [];
  for (let i = 0; i < 3; i += 1) statuses.push((await app.inject('/')).statusCode);
  assert.deepEqual(statuses, [200, 200, 429]);
  const res = await app.inject('/');
  assert.equal(res.headers['x-ratelimit-limit'], '2');
  assert.equal(res.headers['x-ratelimit-remaining'], '0');
  assert.match(res.json().message, /Rate limit exceeded/);
  await app.close();
});

test('@fastify/cookie: cookies set, read and signed', async () => {
  const app = xufa();
  await app.register(require('@fastify/cookie'), { secret: 'a-secret-for-cookies' });
  app.get('/set', async (request, reply) => {
    reply.setCookie('theme', 'dark', { path: '/' }).setCookie('user', '42', { signed: true, httpOnly: true });
    return 'set';
  });
  app.get('/get', async (request) => ({
    theme: request.cookies.theme,
    user: request.unsignCookie(request.cookies.user),
  }));
  const set = await app.inject('/set');
  const cookies = Object.fromEntries(set.cookies.map((cookie) => [cookie.name, cookie.value]));
  assert.equal(cookies.theme, 'dark');
  assert.equal(set.cookies.find((cookie) => cookie.name === 'user').httpOnly, true);
  const got = await app.inject({ url: '/get', cookies });
  assert.deepEqual(got.json(), { theme: 'dark', user: { valid: true, renew: false, value: '42' } });
});

test('@fastify/formbody: application/x-www-form-urlencoded bodies', async () => {
  const app = xufa();
  await app.register(require('@fastify/formbody'));
  app.post('/', async (request) => request.body);
  const res = await app.inject({
    method: 'POST',
    url: '/',
    payload: 'name=Ada&langs=en&langs=es',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  assert.deepEqual(res.json(), { name: 'Ada', langs: ['en', 'es'] });
});

test('@fastify/sensible: httpErrors, reply helpers, request helpers', async () => {
  const app = xufa();
  await app.register(require('@fastify/sensible'));
  app.get('/missing', async (request, reply) => reply.notFound('No such book'));
  app.get('/teapot', async () => {
    throw app.httpErrors.imateapot();
  });
  app.get('/assert', async (request) => {
    app.assert(request.query.id, 400, 'id is required');
    return 'ok';
  });
  app.get('/vary', async (request, reply) => {
    reply.vary('accept');
    return { to: await app.to(Promise.resolve(1)) };
  });
  assert.deepEqual((await app.inject('/missing')).json(), {
    statusCode: 404,
    error: 'Not Found',
    message: 'No such book',
  });
  assert.equal((await app.inject('/teapot')).statusCode, 418);
  assert.equal((await app.inject('/assert')).statusCode, 400);
  assert.equal((await app.inject('/assert?id=1')).statusCode, 200);
  const vary = await app.inject('/vary');
  assert.equal(vary.headers.vary, 'accept');
  assert.deepEqual(vary.json(), { to: [null, 1] });
});

test('@fastify/static: files of a folder, with their types and 404', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-static-'));
  fs.writeFileSync(path.join(dir, 'hello.txt'), 'hello from a file');
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>home</h1>');
  try {
    const app = xufa();
    await app.register(require('@fastify/static'), { root: dir, prefix: '/files/' });
    app.get('/download', (request, reply) => reply.download('hello.txt'));
    const file = await app.inject('/files/hello.txt');
    assert.equal(file.statusCode, 200);
    assert.equal(file.body, 'hello from a file');
    assert.match(file.headers['content-type'], /^text\/plain/);
    assert.ok(file.headers.etag);
    const index = await app.inject('/files/');
    assert.equal(index.body, '<h1>home</h1>');
    const notModified = await app.inject({ url: '/files/hello.txt', headers: { 'if-none-match': file.headers.etag } });
    assert.equal(notModified.statusCode, 304);
    assert.equal((await app.inject('/files/nope.txt')).statusCode, 404);
    const download = await app.inject('/download');
    assert.equal(download.headers['content-disposition'], 'attachment; filename="hello.txt"');
    await app.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('@fastify/multipart: files and fields of multipart/form-data', async () => {
  const app = xufa();
  await app.register(require('@fastify/multipart'));
  app.post('/upload', async (request) => {
    const parts = [];
    for await (const part of request.parts()) {
      if (part.type === 'file')
        parts.push({ file: part.filename, type: part.mimetype, text: (await part.toBuffer()).toString() });
      else parts.push({ field: part.fieldname, value: part.value });
    }
    return parts;
  });
  const form = new FormData();
  form.append('title', 'Notes');
  form.append('doc', new Blob(['the text of the file'], { type: 'text/plain' }), 'notes.txt');
  const res = await app.inject({ method: 'POST', url: '/upload', body: form });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), [
    { field: 'title', value: 'Notes' },
    { file: 'notes.txt', type: 'text/plain', text: 'the text of the file' },
  ]);
});

test('@fastify/jwt: tokens signed and verified', async () => {
  const app = xufa();
  await app.register(require('@fastify/jwt'), { secret: 'a-secret-of-the-jwt-plugin' });
  app.post('/login', async () => ({ token: app.jwt.sign({ sub: 'ada', role: 'admin' }) }));
  app.get('/me', { onRequest: [async (request) => request.jwtVerify()] }, async (request) => request.user);
  const { token } = (await app.inject({ method: 'POST', url: '/login' })).json();
  const me = await app.inject({ url: '/me', headers: { authorization: `Bearer ${token}` } });
  assert.equal(me.statusCode, 200);
  assert.equal(me.json().sub, 'ada');
  assert.equal(me.json().role, 'admin');
  const anonymous = await app.inject('/me');
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.json().code, 'FST_JWT_NO_AUTHORIZATION_IN_HEADER');
});

test('@fastify/etag: ETags, and 304 when they match', async () => {
  const app = xufa();
  await app.register(require('@fastify/etag'));
  app.get('/', async () => ({ hello: 'world' }));
  const first = await app.inject('/');
  assert.ok(first.headers.etag);
  const second = await app.inject({ url: '/', headers: { 'if-none-match': first.headers.etag } });
  assert.equal(second.statusCode, 304);
  assert.equal(second.body, '');
});

test('@fastify/compress: replies compressed by accept-encoding', async () => {
  const app = xufa();
  await app.register(require('@fastify/compress'), { threshold: 0 });
  const big = { items: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `item ${i}` })) };
  app.get('/', async () => big);
  app.get('/stream', (request, reply) => {
    reply.type('text/plain').send(require('node:stream').Readable.from(['a stream ', 'of text']));
  });
  const gzip = await app.inject({ url: '/', headers: { 'accept-encoding': 'gzip' } });
  assert.equal(gzip.headers['content-encoding'], 'gzip');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(gzip.rawPayload).toString()), big);
  const brotli = await app.inject({ url: '/stream', headers: { 'accept-encoding': 'br' } });
  assert.equal(brotli.headers['content-encoding'], 'br');
  assert.equal(zlib.brotliDecompressSync(brotli.rawPayload).toString(), 'a stream of text');
  const plain = await app.inject('/');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.deepEqual(plain.json(), big);
});

test('@fastify/accepts: content negotiation', async () => {
  const app = xufa();
  await app.register(require('@fastify/accepts'));
  app.get('/', async (request) => ({
    type: request.accepts().type(['json', 'html']),
    lang: request.language(['en', 'es']),
  }));
  const res = await app.inject({ url: '/', headers: { accept: 'text/html', 'accept-language': 'es' } });
  assert.deepEqual(res.json(), { type: 'html', lang: 'es' });
});

test('@fastify/auth: strategies combined', async () => {
  const app = xufa();
  app.decorate('byKey', async (request) => {
    if (request.headers['x-key'] !== 'k') throw new Error('no key');
  });
  app.decorate('byAdmin', async (request) => {
    if (request.headers['x-admin'] !== 'yes') throw new Error('no admin');
  });
  await app.register(require('@fastify/auth'));
  app.get('/any', { onRequest: app.auth([app.byKey, app.byAdmin]) }, async () => 'in');
  app.get('/all', { onRequest: app.auth([app.byKey, app.byAdmin], { relation: 'and' }) }, async () => 'in');
  assert.equal((await app.inject({ url: '/any', headers: { 'x-admin': 'yes' } })).statusCode, 200);
  assert.equal((await app.inject({ url: '/all', headers: { 'x-admin': 'yes' } })).statusCode, 401);
  assert.equal((await app.inject({ url: '/all', headers: { 'x-admin': 'yes', 'x-key': 'k' } })).statusCode, 200);
});

test('@fastify/request-context: values of a request, across hooks and awaits', async () => {
  const { fastifyRequestContext, requestContext } = require('@fastify/request-context');
  const app = xufa();
  await app.register(fastifyRequestContext, { defaultStoreValues: { user: 'nobody' } });
  app.addHook('onRequest', async (request) => {
    if (request.headers['x-user']) request.requestContext.set('user', request.headers['x-user']);
  });
  const whoIsIt = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return requestContext.get('user');
  };
  app.get('/', async () => ({ user: await whoIsIt() }));
  const [ada, anonymous] = await Promise.all([app.inject({ url: '/', headers: { 'x-user': 'ada' } }), app.inject('/')]);
  assert.deepEqual(ada.json(), { user: 'ada' });
  assert.deepEqual(anonymous.json(), { user: 'nobody' });
});

test('@fastify/session: a session kept by its cookie', async () => {
  const app = xufa();
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/session'), {
    secret: 'a secret with minimum length of 32 characters',
    cookie: { secure: false },
  });
  app.post('/visit', async (request) => {
    request.session.set('visits', (request.session.get('visits') || 0) + 1);
    return { visits: request.session.get('visits') };
  });
  const first = await app.inject({ method: 'POST', url: '/visit' });
  assert.deepEqual(first.json(), { visits: 1 });
  const cookie = first.cookies.find((item) => item.name === 'sessionId');
  assert.ok(cookie);
  const second = await app.inject({ method: 'POST', url: '/visit', cookies: { sessionId: cookie.value } });
  assert.deepEqual(second.json(), { visits: 2 });
});

test('@fastify/under-pressure: the status route and the load decorators', async () => {
  const app = xufa();
  await app.register(require('@fastify/under-pressure'), { maxEventLoopDelay: 5000, exposeStatusRoute: true });
  await app.ready();
  const res = await app.inject('/status');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: 'ok' });
  assert.equal(typeof app.memoryUsage().heapUsed, 'number');
  assert.equal(app.isUnderPressure(), false);
  await app.close();
});

test('@fastify/autoload: plugins and routes from folders', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-autoload-'));
  try {
    fs.mkdirSync(path.join(dir, 'plugins'));
    fs.mkdirSync(path.join(dir, 'routes', 'books'), { recursive: true });
    const fp = require.resolve('fastify-plugin');
    fs.writeFileSync(
      path.join(dir, 'plugins', 'store.js'),
      `module.exports = require(${JSON.stringify(fp)})(async (app) => { app.decorate('store', ['Dune']); });`
    );
    fs.writeFileSync(
      path.join(dir, 'routes', 'books', 'index.js'),
      "module.exports = async (app) => { app.get('/', async () => app.store); };"
    );
    const app = xufa();
    const autoload = require('@fastify/autoload');
    await app.register(autoload, { dir: path.join(dir, 'plugins') });
    await app.register(autoload, { dir: path.join(dir, 'routes') });
    const res = await app.inject('/books');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), ['Dune']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('@fastify/csrf-protection: tokens checked on writes', async () => {
  const app = xufa();
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/csrf-protection'));
  app.get('/form', async (request, reply) => ({ token: reply.generateCsrf() }));
  app.post('/save', { onRequest: app.csrfProtection }, async () => 'saved');
  const form = await app.inject('/form');
  const cookies = Object.fromEntries(form.cookies.map((cookie) => [cookie.name, cookie.value]));
  const { token } = form.json();
  const refused = await app.inject({ method: 'POST', url: '/save', cookies });
  assert.equal(refused.statusCode, 403);
  const saved = await app.inject({ method: 'POST', url: '/save', cookies, headers: { 'x-csrf-token': token } });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body, 'saved');
});

test('@fastify/http-proxy: requests sent to another server', async () => {
  const upstream = xufa();
  upstream.get('/hello', async (request) => ({ from: 'upstream', q: request.query.q }));
  upstream.post('/echo', async (request) => request.body);
  await upstream.listen({ port: 0, host: '127.0.0.1' });
  const app = xufa();
  try {
    await app.register(require('@fastify/http-proxy'), {
      upstream: `http://127.0.0.1:${upstream.server.address().port}`,
      prefix: '/api',
    });
    const res = await app.inject('/api/hello?q=1');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { from: 'upstream', q: '1' });
    const echo = await app.inject({ method: 'POST', url: '/api/echo', payload: { a: 1 } });
    assert.deepEqual(echo.json(), { a: 1 });
  } finally {
    await app.close();
    await upstream.close();
  }
});

test('@fastify/env: configuration checked by a schema', async () => {
  const app = xufa();
  await app.register(require('@fastify/env'), {
    schema: {
      type: 'object',
      required: ['PORT'],
      properties: { PORT: { type: 'integer' }, MODE: { type: 'string', default: 'dev' } },
    },
    data: { PORT: '8080' },
  });
  assert.deepEqual({ ...app.config }, { PORT: 8080, MODE: 'dev' });
  const failing = xufa();
  failing.register(require('@fastify/env'), { schema: { type: 'object', required: ['PORT'] }, data: {} });
  await assert.rejects(failing.ready(), /must have required property 'PORT'/);
});

test('@fastify/caching: cache-control and etags', async () => {
  const app = xufa();
  await app.register(require('@fastify/caching'), { privacy: 'private', expiresIn: 300 });
  app.get('/', async (request, reply) => {
    reply.etag('v1');
    return 'cached';
  });
  const res = await app.inject('/');
  assert.equal(res.headers['cache-control'], 'private, max-age=300');
  assert.equal(res.headers.etag, 'v1');
  const again = await app.inject({ url: '/', headers: { 'if-none-match': 'v1' } });
  assert.equal(again.statusCode, 304);
});
