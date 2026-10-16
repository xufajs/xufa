// xufa.helmet, xufa.etag and xufa.compress against what they bring of Express: the same routes on an app of
// @xufa/http with the three plugins and on one of @xufa/express with helmet() and compression() (Express makes its
// ETags and 304s itself), and the same answers to a matrix of requests: encodings accepted, types, sizes about the
// threshold, copies the client has (If-None-Match), HEAD, Cache-Control: no-transform, a policy with a nonce.
import http from 'node:http';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import xufa from '../../index.js';
import express from '../../../express/index.js';
import helmet from '../../helmet.js';
import compression from '../../compression.js';

const BIG = JSON.stringify({ items: Array.from({ length: 80 }, (_, i) => ({ id: i, name: `item ${i}` })) });
const ROUTES = {
  '/json': ['application/json; charset=utf-8', BIG],
  '/small': ['application/json; charset=utf-8', '{"ok":true}'],
  '/html': ['text/html; charset=utf-8', `<p>${'Hello, world. '.repeat(100)}</p>`],
  '/png': ['image/png', Buffer.alloc(4000, 7)],
  '/no-transform': ['application/json; charset=utf-8', BIG, { 'cache-control': 'no-transform' }],
  '/tagged': ['text/plain; charset=utf-8', 'x'.repeat(2000), { etag: '"mine"' }],
};
const HELMET = { contentSecurityPolicy: { directives: { scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`] } } };
const IGNORED = new Set(['date', 'connection', 'keep-alive', 'content-length', 'transfer-encoding']);

async function listen(app) {
  await app.listen({ port: 0, host: '127.0.0.1' });
  return app.server.address().port;
}

function request(port, { method = 'GET', path, headers = {} }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, host: '127.0.0.1', method, path, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        let body = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        if (encoding === 'gzip') body = zlib.gunzipSync(body);
        else if (encoding === 'br') body = zlib.brotliDecompressSync(body);
        else if (encoding === 'deflate') body = zlib.inflateSync(body);
        const headers = Object.fromEntries(Object.entries(res.headers).filter(([name]) => !IGNORED.has(name)));
        resolve({ status: res.statusCode, headers, body: body.toString('base64') });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('xufa.helmet, xufa.etag and xufa.compress', () => {
  let ours;
  let theirs;
  const servers = [];

  beforeAll(async () => {
    const app = xufa();
    app.addHook('onRequest', (request, reply, next) => {
      reply.raw.locals = { nonce: 'n0nce' };
      next();
    });
    app.register(xufa.helmet, HELMET);
    app.register(xufa.etag);
    app.register(xufa.compress, { threshold: 256 });
    for (const [path, [type, body, headers = {}]] of Object.entries(ROUTES)) {
      app.get(path, (request, reply) => reply.headers(headers).type(type).send(body));
    }
    // A stream (no length known): compressed as it is read.
    app.get('/stream', (request, reply) => reply.type('text/plain; charset=utf-8').send(Readable.from([BIG, BIG])));
    ours = await listen(app);
    servers.push(() => app.close());

    const site = express();
    site.use((req, res, next) => {
      res.locals.nonce = 'n0nce';
      next();
    });
    site.use(helmet(HELMET));
    site.use(compression({ threshold: 256 }));
    for (const [path, [type, body, headers = {}]] of Object.entries(ROUTES)) {
      site.get(path, (req, res) => res.set(headers).type(type).send(body));
    }
    site.get('/stream', (req, res) => {
      res.type('text/plain; charset=utf-8');
      Readable.from([BIG, BIG]).pipe(res);
    });
    const server = site.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    theirs = server.address().port;
    servers.push(() => new Promise((resolve) => server.close(resolve)));
  });

  afterAll(async () => {
    for (const close of servers) await close();
  });

  const ENCODINGS = [undefined, 'gzip', 'gzip, deflate, br', 'deflate', 'identity', 'br;q=0, gzip'];

  it('answer as Express with helmet() and compression() does', async () => {
    const differences = [];
    for (const path of [...Object.keys(ROUTES), '/stream']) {
      for (const method of ['GET', 'HEAD']) {
        for (const encoding of ENCODINGS) {
          const headers = encoding === undefined ? {} : { 'accept-encoding': encoding };
          const asked = { method, path, headers };
          const a = await request(ours, asked);
          const b = await request(theirs, asked);
          if (JSON.stringify(a) !== JSON.stringify(b)) differences.push({ asked, ours: a, theirs: b });
          // The copy the client has: 304 (and with no-cache, not). (Streams have no ETag.)
          if (!b.headers.etag) continue;
          for (const extra of [{ 'if-none-match': b.headers.etag }, { 'if-none-match': b.headers.etag, 'cache-control': 'no-cache' }]) {
            const again = { method, path, headers: { ...headers, ...extra } };
            const c = await request(ours, again);
            const d = await request(theirs, again);
            if (JSON.stringify(c) !== JSON.stringify(d)) differences.push({ asked: again, ours: c, theirs: d });
          }
        }
      }
    }
    expect(differences).toEqual([]);
  });

  it('send the headers of helmet, the nonce of the request and no X-Powered-By, and compress what is worth it', async () => {
    const { headers } = await request(ours, { path: '/json', headers: { 'accept-encoding': 'gzip, deflate, br' } });
    expect(headers['content-security-policy']).toContain("script-src 'self' 'nonce-n0nce'");
    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['content-encoding']).toBe('br');
    expect(headers.etag).toMatch(/^W\/"/);
    const small = await request(ours, { path: '/small', headers: { 'accept-encoding': 'gzip' } });
    expect(small.headers['content-encoding']).toBeUndefined();
    expect(small.headers.vary).toBe('Accept-Encoding');
  });
});
