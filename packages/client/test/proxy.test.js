// The http transport through a proxy: tunnels (CONNECT) to https: servers, kept and reused; requests to http: servers
// sent to the proxy (the whole URL as the path); a proxy that asks for a login (Proxy-Authorization from the user and
// password of its URL); the proxy of the environment (HTTP_PROXY, HTTPS_PROXY, NO_PROXY; by default only with
// NODE_USE_ENV_PROXY, as Node.js); and the option tls (the CA of a server). The certificates of test/fixtures are of a
// CA made for these tests (localhost and 127.0.0.1, valid until 2126).
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { createClient, RequestError, HTTPError } from '../index.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fixture = (name) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name));
const ca = fixture('ca.pem');

const listen = (server) =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
const close = (server) =>
  new Promise((resolve) => {
    if (server.closeAllConnections) server.closeAllConnections();
    server.close(resolve);
  });

// A proxy: tunnels for CONNECT, and requests with a whole URL made for the client. `login` asks for that
// Proxy-Authorization (407 otherwise).
function makeProxy(secure = false) {
  const seen = { tunnels: [], forwards: [], login: null };
  const allowed = (req) => !seen.login || req.headers['proxy-authorization'] === seen.login;
  const handler = (req, res) => {
    if (!allowed(req)) {
      res.writeHead(407, { 'proxy-authenticate': 'Basic' }).end();
      return;
    }
    seen.forwards.push({ url: req.url, host: req.headers.host });
    const target = new URL(req.url);
    const headers = { ...req.headers };
    delete headers['proxy-authorization'];
    const upstream = http.request(target, { method: req.method, headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
  };
  // Reached over http:, or over https: (its certificate of the CA of the tests).
  const server = secure
    ? https.createServer({ key: fixture('key.pem'), cert: fixture('cert.pem') }, handler)
    : http.createServer(handler);
  server.on('connect', (req, socket, head) => {
    if (!allowed(req)) {
      socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\n\r\n');
      return;
    }
    seen.tunnels.push(req.url);
    const [host, port] = [
      req.url.slice(0, req.url.lastIndexOf(':')),
      Number(req.url.slice(req.url.lastIndexOf(':') + 1)),
    ];
    const upstream = net.connect(port, host, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  return { server, seen };
}

describe('the http transport, through a proxy and with tls', () => {
  let secure;
  let plain;
  let proxy;
  let secureBase;
  let plainBase;
  let proxyUrl;
  const saved = {};

  beforeAll(async () => {
    const answer = (protocol) => (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ protocol, path: req.url, host: req.headers.host }));
    };
    secure = https.createServer({ key: fixture('key.pem'), cert: fixture('cert.pem') }, answer('https'));
    plain = http.createServer(answer('http'));
    proxy = makeProxy();
    secureBase = `https://localhost:${await listen(secure)}`;
    plainBase = `http://127.0.0.1:${await listen(plain)}`;
    proxyUrl = `http://127.0.0.1:${await listen(proxy.server)}`;
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY']) saved[name] = process.env[name];
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await Promise.all([close(secure), close(plain), close(proxy.server)]);
  });

  beforeEach(() => {
    proxy.seen.tunnels.length = 0;
    proxy.seen.forwards.length = 0;
    proxy.seen.login = null;
    for (const name of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_USE_ENV_PROXY']) delete process.env[name];
  });

  it('tls: the CA of a server; without it, its certificate is refused', async () => {
    const api = createClient({ baseUrl: secureBase, tls: { ca }, retry: false });
    expect(await api.get('/x')).toEqual({ protocol: 'https', path: '/x', host: secureBase.slice(8) });
    api.close();
    const strict = createClient({ baseUrl: secureBase, retry: false });
    const err = await strict.get('/x').catch((error) => error);
    expect(err).toBeInstanceOf(RequestError);
    expect(err.cause.code).toMatch(/CERT|SELF_SIGNED|UNABLE/);
    strict.close();
  });

  it('https: through a tunnel, one for many calls (kept alive), with TLS to the server inside it', async () => {
    const api = createClient({ baseUrl: secureBase, tls: { ca }, proxy: proxyUrl, retry: false });
    for (let i = 0; i < 5; i += 1) expect((await api.get(`/n${i}`)).path).toBe(`/n${i}`);
    // A stream too (made by the http transport: fetch would have no proxy).
    const stream = await api.get('/streamed', { responseType: 'stream' });
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(JSON.parse(Buffer.concat(chunks)).path).toBe('/streamed');
    // And a body that is a stream.
    const { Readable } = require('node:stream'); // eslint-disable-line global-require
    expect((await api.post('/upload', { body: Readable.from(['some ', 'bytes']) })).path).toBe('/upload');
    // And forms and blobs (encoded by the http transport: fetch would have no proxy).
    const form = new FormData();
    form.append('file', new File(['bytes'], 'a.txt'));
    expect((await api.post('/form', { body: form })).path).toBe('/form');
    expect((await api.post('/blob', { body: new Blob(['b']) })).path).toBe('/blob');
    expect(proxy.seen.tunnels).toEqual([secureBase.slice(8)]);
    api.close();
  });

  it('http: each request to the proxy, with the whole URL, and the host of the server', async () => {
    const api = createClient({ baseUrl: plainBase, proxy: proxyUrl, retry: false });
    expect(await api.get('/books?page=2')).toEqual({
      protocol: 'http',
      path: '/books?page=2',
      host: plainBase.slice(7),
    });
    expect(proxy.seen.forwards).toEqual([{ url: `${plainBase}/books?page=2`, host: plainBase.slice(7) }]);
    api.close();
  });

  it('a proxy that asks for a login: the user and password of its URL; refused without them', async () => {
    proxy.seen.login = `Basic ${Buffer.from('ada:se cret').toString('base64')}`;
    const withLogin = proxyUrl.replace('http://', 'http://ada:se%20cret@');
    const api = createClient({ baseUrl: secureBase, tls: { ca }, proxy: withLogin, retry: false });
    expect((await api.get('/in')).path).toBe('/in');
    const plainApi = createClient({ baseUrl: plainBase, proxy: withLogin, retry: false });
    expect((await plainApi.get('/in')).path).toBe('/in');

    const refused = createClient({ baseUrl: secureBase, tls: { ca }, proxy: proxyUrl, retry: false });
    const err = await refused.get('/out').catch((error) => error);
    expect(err).toBeInstanceOf(RequestError);
    expect([err.cause.code, err.cause.statusCode]).toEqual(['XUFA_CLIENT_PROXY', 407]);
    const plainRefused = createClient({ baseUrl: plainBase, proxy: proxyUrl, retry: false });
    const answer = await plainRefused.get('/out').catch((error) => error);
    expect([answer instanceof HTTPError, answer.status]).toEqual([true, 407]);
    for (const client of [api, plainApi, refused, plainRefused]) client.close();
  });

  it("the proxy of the environment: with proxy: 'env', or by default with NODE_USE_ENV_PROXY; NO_PROXY", async () => {
    process.env.HTTPS_PROXY = proxyUrl;
    process.env.HTTP_PROXY = proxyUrl;
    const byDefault = createClient({ baseUrl: secureBase, tls: { ca }, retry: false });
    await byDefault.get('/a');
    expect(proxy.seen.tunnels).toHaveLength(0); // as Node.js: no NODE_USE_ENV_PROXY, no proxy
    process.env.NODE_USE_ENV_PROXY = '1';
    await byDefault.get('/b');
    expect(proxy.seen.tunnels).toHaveLength(1);
    delete process.env.NODE_USE_ENV_PROXY;

    const fromEnv = createClient({ baseUrl: plainBase, proxy: 'env', retry: false });
    await fromEnv.get('/c');
    expect(proxy.seen.forwards).toHaveLength(1);
    process.env.NO_PROXY = 'localhost, 127.0.0.1';
    await fromEnv.get('/d');
    expect(proxy.seen.forwards).toHaveLength(1);
    const off = createClient({ baseUrl: plainBase, proxy: false, retry: false });
    delete process.env.NO_PROXY;
    await off.get('/e');
    expect(proxy.seen.forwards).toHaveLength(1);
    for (const client of [byDefault, fromEnv, off]) client.close();
  });

  it('a proxy reached over https: (its certificate checked with tls), for https: and http: servers', async () => {
    const tlsProxy = makeProxy(true);
    const port = await listen(tlsProxy.server);
    const over = `https://localhost:${port}`;
    const api = createClient({ baseUrl: secureBase, tls: { ca }, proxy: over, retry: false });
    const plainApi = createClient({ baseUrl: plainBase, tls: { ca }, proxy: over, retry: false });
    expect((await api.get('/s')).protocol).toBe('https');
    expect((await plainApi.get('/p')).protocol).toBe('http');
    expect([tlsProxy.seen.tunnels.length, tlsProxy.seen.forwards.length]).toEqual([1, 1]);
    api.close();
    plainApi.close();
    await close(tlsProxy.server);
  });

  it('proxy and tls are of the http transport: errors where fetch would make the call without them', async () => {
    expect(() => createClient({ transport: 'fetch', proxy: proxyUrl })).toThrow(/transport: 'http'/);
    expect(() => createClient({ proxy: 'socks5://127.0.0.1:1080' })).toThrow(/http: or https:/);
    const api = createClient({ baseUrl: plainBase, proxy: proxyUrl, retry: false });
    await expect(api.get('/response', { responseType: 'response' })).rejects.toThrow(/need the http transport/);
    api.close();
  });
});
