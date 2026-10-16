// @xufa/express against Express 5 itself: the same app built on both, the same requests sent to both, the same
// answers (status, headers, body) expected.
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import compression from '@xufa/http/compression';
import helmet from '@xufa/http/helmet';
import realExpress from 'express';
import * as xufaExpress from '../index.js';

const IGNORED_HEADERS = new Set(['date', 'x-powered-by', 'connection', 'keep-alive']);

function request(port, { method = 'GET', url, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const sent = body === undefined ? headers : { 'Content-Length': Buffer.byteLength(body), ...headers };
    const req = http.request({ host: '127.0.0.1', port, method, path: url, headers: sent, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const kept = Object.fromEntries(Object.entries(res.headers).filter(([name]) => !IGNORED_HEADERS.has(name)));
        resolve({ status: res.statusCode, headers: kept, body: Buffer.concat(chunks).toString('latin1') });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });

// Each item given to fn, one after the other.
const inTurn = (items, fn) => items.reduce((previous, item) => previous.then(() => fn(item)), Promise.resolve());

// Builds the app on both, and gives a function sending a request to both and expecting the same answer.
async function both(build) {
  const servers = await Promise.all(
    [realExpress, xufaExpress.express].map((express) => {
      const app = express();
      build(app, express);
      return listen(app);
    })
  );
  const send = async (options) => {
    const [expected, actual] = await Promise.all(servers.map((server) => request(server.address().port, options)));
    expect({ ...actual, url: options.url }).toEqual({ ...expected, url: options.url });
    return actual;
  };
  send.close = () =>
    Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.close(resolve);
          })
      )
    );
  return send;
}

describe('the HTTP layer against Express', () => {
  let send;
  afterEach(async () => {
    await send?.close();
    send = null;
  });

  test('send and json: strings, objects, buffers, null, numbers, statuses, ETags, HEAD', async () => {
    expect.hasAssertions();
    send = await both((app) => {
      app.get('/text', (req, res) => res.status(201).send('hello <b>world</b>'));
      app.get('/long', (req, res) => res.send('é'.repeat(3000)));
      app.get('/object', (req, res) => res.send({ a: 1, b: [true, null] }));
      app.get('/json', (req, res) => res.json([1, 'two']));
      app.get('/undefined', (req, res) => res.json(undefined));
      app.get('/buffer', (req, res) => res.send(Buffer.from([1, 2, 3])));
      app.get('/null', (req, res) => res.send(null));
      app.get('/number', (req, res) => res.send(42));
      app.get('/empty', (req, res) => res.status(204).send('gone'));
      app.get('/end', (req, res) => res.status(200).end());
      app.get('/status', (req, res) => res.sendStatus(418));
      app.get('/typed', (req, res) => res.status(200).contentType('image/png').send(Buffer.from('png')));
      app.get('/csv', (req, res) =>
        res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; f=a.csv' }).send('a,b')
      );
      app.get('/header', (req, res) => res.status(401).header('X-2FA-Configured', true).send('Invalid credentials'));
      app.get('/raw', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(JSON.stringify({ raw: true }));
      });
      app.get('/get', (req, res) => {
        res.set('X-A', 'b');
        res.send({ got: res.get('x-a'), agent: req.get('User-Agent'), path: req.path, query: req.query });
      });
    });
    await inTurn(['/text', '/long', '/object', '/json', '/undefined', '/buffer', '/null', '/number', '/empty'], (url) =>
      send({ url })
    );
    await inTurn(['/end', '/status', '/typed', '/csv', '/header', '/raw', '/get?a=1&a=2&b=%20x+y&c'], (url) =>
      send({ url })
    );
    const { headers } = await send({ url: '/object' });
    await send({ url: '/object', headers: { 'If-None-Match': headers.etag } });
    await send({ url: '/object', headers: { 'If-None-Match': headers.etag, 'Cache-Control': 'no-cache' } });
    await send({ url: '/object', method: 'HEAD' });
  });

  test('routing: params, case, trailing slashes, order, duplicates, next("route"), OPTIONS', async () => {
    expect.hasAssertions();
    send = await both((app, express) => {
      const router = express.Router();
      router.get('/items/structure', (req, res) => res.send('structure'));
      router.get('/items/:itemId', (req, res, next) => (req.params.itemId === 'skip' ? next() : res.send(req.params)));
      router.get('/items/:id', (req, res) => res.send({ second: req.params }));
      router.get('/items/:itemId/locale/:locale', (req, res) => res.send(req.params));
      router.get('/first/:id', (req, res) => res.send({ param: req.params.id }));
      router.get('/first/static', (req, res) => res.send('static'));
      router.get(
        '/next',
        (req, res, next) => next('route'),
        (req, res) => res.send('not me')
      );
      router.get('/next', (req, res) => res.send('next route'));
      router.options('/items', (req, res) => res.status(200).send('options'));
      const other = express.Router();
      other.get('/items/:itemId', (req, res) => res.send('other router'));
      app.use('/api', router);
      app.use('/api', other);
      app.use((req, res) => res.status(404).send('Nothing to see here'));
    });
    await inTurn(
      ['/api/items/structure', '/api/items/a%20b', '/api/ITEMS/X/', '/api/items/skip', '/api/items/1/locale/es'],
      (url) => send({ url })
    );
    await inTurn(['/api/first/static', '/api/first/9', '/api/next', '/api/nothing', '/apiitems/1', '/'], (url) =>
      send({ url })
    );
    await send({ url: '/api/items', method: 'OPTIONS' });
    await send({ url: '/api/items/1', method: 'POST' });
    await send({ url: `/api/items/${'x'.repeat(300)}` });
  });

  test('errors: next(err), throws, rejections, error handlers, the final handler', async () => {
    expect.hasAssertions();
    const errorHandler = (err, req, res, next) => {
      if (err && err.message) return res.status(err.status || 500).send(err.message);
      return next();
    };
    send = await both((app, express) => {
      const router = express.Router();
      router.get('/next', (req, res, next) => next(Object.assign(new Error('forbidden'), { status: 403 })));
      router.get('/throw', () => {
        throw new Error('thrown');
      });
      router.get('/reject', async () => {
        throw new Error('rejected');
      });
      router.get('/no-message', (req, res, next) => next({ status: 400 }));
      router.get(
        '/route-handler',
        (req, res, next) => next(new Error('to the route')),
        // eslint-disable-next-line no-unused-vars -- Express tells error handlers by their four arguments
        (err, req, res, next) => res.status(409).send(`route: ${err.message}`)
      );
      app.use('/api', router);
      app.use(errorHandler);
      app.use((req, res) => res.status(404).send('Nothing to see here'));
    });
    await inTurn(['/api/next', '/api/throw', '/api/reject', '/api/no-message', '/api/route-handler', '/x'], (url) =>
      send({ url })
    );
  });

  test('the final handler of a bare app', async () => {
    expect.hasAssertions();
    send = await both((app) => {
      app.get('/fail', (req, res, next) => next(Object.assign(new Error('teapot'), { status: 418, stack: 'stack' })));
    });
    await send({ url: '/nothing?x=<b>' });
    await send({ url: '/nothing', method: 'DELETE' });
    await send({ url: '/fail' });
  });

  test('bodies: JSON, urlencoded, limits, errors, other types left for multer', async () => {
    expect.hasAssertions();
    const limit = '1kb';
    send = await both((app, express) => {
      app.use(express.urlencoded({ extended: false, limit }));
      app.use(express.json({ limit }));
      app.use((req, res, next) => {
        if (!req.body) req.body = {};
        next();
      });
      ['post', 'put', 'patch', 'delete', 'get'].forEach((method) => {
        app[method]('/echo', (req, res) => res.send({ body: req.body, type: typeof req.body }));
      });
      app.post('/upload', multer().single('file'), (req, res) =>
        res.send({ body: req.body, file: { name: req.file.originalname, size: req.file.size } })
      );
      // eslint-disable-next-line no-unused-vars -- Express tells error handlers by their four arguments
      app.use((err, req, res, next) => res.status(err.status || 500).send(`${err.type}: ${err.message}`));
    });
    const jsonHeaders = { 'Content-Type': 'application/json' };
    await inTurn(['{"a":1}', '[1,2]', '', '  ', '{"a":', '"text"', 'true', ' 7', '{"__proto__":{"x":1}}'], (body) =>
      send({ url: '/echo', method: 'POST', headers: jsonHeaders, body })
    );
    await send({
      url: '/echo',
      method: 'PATCH',
      headers: { 'Content-Type': 'Application/JSON; charset=UTF-8' },
      body: '{"b":2}',
    });
    await send({ url: '/echo', method: 'DELETE', headers: jsonHeaders, body: '{"c":3}' });
    await send({ url: '/echo', method: 'GET', headers: jsonHeaders, body: '{"d":4}' });
    await send({
      url: '/echo',
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=latin1' },
      body: '{}',
    });
    await send({ url: '/echo', method: 'POST', headers: jsonHeaders, body: `{"a":"${'x'.repeat(2000)}"}` });
    await send({ url: '/echo', method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'plain' });
    await send({ url: '/echo', method: 'POST', body: 'no type' });
    await send({ url: '/echo', method: 'POST' });
    const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
    await send({ url: '/echo', method: 'POST', headers: form, body: 'a=1&b=x+y&a=2&c=%E2%82%AC' });
    await send({ url: '/echo', method: 'POST', headers: form, body: 'a[b]=1' });
    const boundary = 'xufa-boundary';
    const multipart = [
      `--${boundary}\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n`,
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\n`,
      `hello file\r\n--${boundary}--\r\n`,
    ].join('');
    await send({
      url: '/upload',
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipart,
    });
  });

  test('mounted middlewares see the rest of the url; helmet and compression work on the requests', async () => {
    expect.hasAssertions();
    send = await both((app) => {
      app.use(helmet());
      app.use(compression({ threshold: 256 }));
      app.use('/docs', (req, res, next) => (req.url === '/' ? res.send({ url: req.url, base: req.baseUrl }) : next()));
      app.use('/docs', (req, res) => res.send({ url: req.url, base: req.baseUrl, original: req.originalUrl }));
      app.get('/big', (req, res) => res.send({ text: 'x'.repeat(5000) }));
      app.get(/(.*)/, (req, res) => res.send({ catchAll: req.params[0] }));
    });
    await inTurn(['/docs', '/docs/', '/docs/a/b?c=1', '/DOCS/x', '/docsx', '/other/path'], (url) => send({ url }));
    await send({ url: '/big', headers: { 'Accept-Encoding': 'gzip' } });
    await send({ url: '/big', headers: { 'Accept-Encoding': 'br' } });
  });

  test('a router of @xufa/express mounted on an Express app works as one of Express', async () => {
    expect.hasAssertions();
    const servers = await Promise.all(
      [realExpress.Router, xufaExpress.Router].map((Router) => {
        const app = realExpress();
        const router = Router();
        router.get('/items/:id', (req, res, next) =>
          req.params.id === 'skip' ? next() : res.send({ id: req.params.id, url: req.url })
        );
        router.post('/items', (req, res) => res.status(201).send('created'));
        app.use('/api', router);
        app.use((req, res) => res.status(404).send(`not found ${req.url}`));
        return listen(app);
      })
    );
    send = async (options) => {
      const [expected, actual] = await Promise.all(servers.map((server) => request(server.address().port, options)));
      expect(actual).toEqual(expected);
    };
    send.close = () =>
      Promise.all(
        servers.map(
          (server) =>
            new Promise((resolve) => {
              server.close(resolve);
            })
        )
      );
    await inTurn(['/api/items/1', '/api/ITEMS/2/', '/api/items/skip', '/api/other'], (url) => send({ url }));
    await send({ url: '/api/items', method: 'POST' });
  });

  test('files: sendFile, static, missing files to the error handler', async () => {
    expect.hasAssertions();
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-express-'));
    fs.writeFileSync(path.join(folder, 'index.html'), '<p>index</p>');
    fs.writeFileSync(path.join(folder, 'data.json'), '{"a":1}');
    fs.writeFileSync(path.join(folder, '.env'), 'SECRET=1');
    const stat = fs.statSync(path.join(folder, 'index.html'));
    send = await both((app, express) => {
      app.use(express.static(folder));
      app.get('/file', (req, res) => res.sendFile('index.html', { root: folder }));
      app.get('/missing', (req, res) => res.sendFile('missing.html', { root: folder }));
      // eslint-disable-next-line no-unused-vars -- Express tells error handlers by their four arguments
      app.use((err, req, res, next) => res.status(err.status || 500).send(err.message.replace(folder, '<folder>')));
    });
    await inTurn(['/file', '/missing', '/data.json', '/index.html', '/', '/nothing.txt', '/.env', '/%2Eenv'], (url) =>
      send({ url })
    );
    await send({ url: '/file', headers: { 'If-Modified-Since': new Date(stat.mtimeMs + 1000).toUTCString() } });
    await send({ url: '/file', method: 'HEAD' });
    fs.rmSync(folder, { recursive: true, force: true });
  });
});
