'use strict';

// The heads of responses written by xufa (lib/fast-head.js) against those of Node's writeHead(): the same bytes on
// the wire (the Date apart), for the cases it writes and those it leaves to Node.
const net = require('node:net');
const http = require('node:http');
const Xufa = require('..');
const { fastHeadWorks, writeFastHead } = require('../lib/fast-head');

function build(options) {
  const app = Xufa({ logger: false, ...options });
  app.get('/json', () => ({ hello: 'world' }));
  app.get('/text', (request, reply) => reply.header('x-custom', 'value').send('plain'));
  app.post('/created', (request, reply) => reply.code(201).send({ id: 1 }));
  app.get('/cookies', (request, reply) => reply.header('set-cookie', ['a=1', 'b=2']).send('ok'));
  app.get('/raw-header', (request, reply) => {
    reply.raw.setHeader('x-raw', 'yes');
    reply.send({ raw: true });
  });
  app.get('/empty', (request, reply) => reply.code(204).send());
  app.get('/not-modified', (request, reply) => reply.code(304).send());
  app.get('/missing', (request, reply) => reply.code(404).send({ missing: true }));
  app.get('/error', () => {
    throw new Error('boom');
  });
  app.get('/bad-header', (request, reply) => reply.header('x-bad', 'a\r\nInjected: 1').send('no'));
  app.get('/buffer', (request, reply) => reply.type('application/octet-stream').send(Buffer.from('bytes')));
  app.get('/nothing', (request, reply) => reply.send());
  app.get('/reset', (request, reply) => reply.code(205).send());
  app.get('/override', (request, reply) => {
    reply.raw.setHeader('X-Who', 'raw');
    reply.raw.setHeader('x-only-raw', ['1', '2']);
    reply.header('x-who', 'reply').send('both');
  });
  app.get('/gone', (request, reply) => reply.code(404).send());
  app.get('/fraction', (request, reply) => reply.code(404.5).send('rounded'));
  return app;
}

// What the server writes for a raw request (one or several, pipelined), with the Date of each response blanked.
function exchange(port, raw, responses) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    let text = '';
    const done = () => {
      socket.destroy();
      resolve(text.replace(/\r\nDate: [^\r]*/gi, '\r\nDate: -'));
    };
    socket.on('data', (chunk) => {
      text += chunk;
      const ends = text.split('HTTP/1.').length - 1;
      if (ends >= responses && /\r\n\r\n/.test(text)) setTimeout(done, 30);
    });
    socket.on('end', done);
    socket.on('error', reject);
    socket.write(raw);
  });
}

const request = (path, method = 'GET', version = '1.1') =>
  `${method} ${path} HTTP/${version}\r\nHost: localhost\r\n${method === 'POST' ? 'Content-Length: 0\r\n' : ''}\r\n`;

describe('fast head', () => {
  let fast;
  let node;
  let fastPort;
  let nodePort;

  beforeAll(async () => {
    fast = build({});
    node = build({ fastHead: false });
    await fast.listen({ port: 0, host: '127.0.0.1' });
    await node.listen({ port: 0, host: '127.0.0.1' });
    fastPort = fast.server.address().port;
    nodePort = node.server.address().port;
  });

  afterAll(async () => {
    await fast.close();
    await node.close();
  });

  test('passes its self-test on this version of Node', () => {
    expect(fastHeadWorks()).toBe(true);
  });

  const cases = [
    ['a JSON body', request('/json')],
    ['a text body with a header', request('/text')],
    ['201', request('/created', 'POST')],
    ['a header of several values', request('/cookies')],
    ['a header set on the response of Node', request('/raw-header')],
    ['204', request('/empty')],
    ['304', request('/not-modified')],
    ['404 with a body', request('/missing')],
    ['an error', request('/error')],
    ['a header value with CR LF', request('/bad-header')],
    ['a Buffer', request('/buffer')],
    ['HEAD', request('/json', 'HEAD')],
    ['HTTP/1.0', request('/json', 'GET', '1.0')],
    ['a route not found', request('/nowhere')],
    ['no payload', request('/nothing')],
    ['205', request('/reset')],
    ['a header of the reply over one set on the response of Node', request('/override')],
    ['HEAD of a route that sets a header on the response of Node', request('/raw-header', 'HEAD')],
    ['HEAD with headers of both', request('/override', 'HEAD')],
    ['404 without a payload', request('/gone')],
    ['a status that is not an integer', request('/fraction')],
  ];

  for (const [name, raw] of cases) {
    test(`writes what Node writes: ${name}`, async () => {
      const [ours, theirs] = await Promise.all([exchange(fastPort, raw, 1), exchange(nodePort, raw, 1)]);
      expect(ours).toBe(theirs);
      expect(ours).toMatch(/^HTTP\/1\.[01] \d{3} /);
    });
  }

  test('writes what Node writes for pipelined requests', async () => {
    const raw = request('/json') + request('/text') + request('/created', 'POST');
    const [ours, theirs] = await Promise.all([exchange(fastPort, raw, 3), exchange(nodePort, raw, 3)]);
    expect(ours).toBe(theirs);
    expect(ours.split('HTTP/1.1 ').length - 1).toBe(3);
  });

  test('closes as Node does on the last request a connection may make', async () => {
    const limited = build({ maxRequestsPerSocket: 2 });
    const plain = build({ maxRequestsPerSocket: 2, fastHead: false });
    await limited.listen({ port: 0, host: '127.0.0.1' });
    await plain.listen({ port: 0, host: '127.0.0.1' });
    try {
      const raw = request('/json') + request('/json');
      const [ours, theirs] = await Promise.all([
        exchange(limited.server.address().port, raw, 2),
        exchange(plain.server.address().port, raw, 2),
      ]);
      expect(ours).toBe(theirs);
      expect(ours).toContain('Connection: close');
      expect(ours).toContain('Keep-Alive: timeout=72, max=2');
    } finally {
      await limited.close();
      await plain.close();
    }
  });

  test('leaves to Node the heads it does not write', () => {
    const req = new http.IncomingMessage(new net.Socket());
    Object.assign(req, { method: 'GET', httpVersionMajor: 1, httpVersionMinor: 1, headers: {} });
    const res = new http.ServerResponse(req);
    expect(writeFastHead(res, req, 200, { 'x-ok': 'fine' }, 1)).toMatch(/^HTTP\/1\.1 200 OK\r\nx-ok: fine\r\n/);
    expect(writeFastHead(res, req, 200, { 'x-bad': 'a\nb' }, 1)).toBe(null);
    expect(writeFastHead(res, req, 200, { 'bad name': 'x' }, 1)).toBe(null);
    expect(writeFastHead(res, req, 200, { 'transfer-encoding': 'chunked' }, 1)).toBe(null);
    expect(writeFastHead(res, req, 200, { 'x-object': { a: 1 } }, 1)).toBe(null);
    expect(writeFastHead(res, { method: 'GET', httpVersionMajor: 1, httpVersionMinor: 0 }, 200, {}, 1)).toBe(null);
    // A body without a length is framed by Node (chunks).
    expect(writeFastHead(res, req, 200, {}, null)).toBe(null);
    // HEAD with a length, and headers set on Node's response: written, the reply's taking the place of the raw one.
    expect(writeFastHead(res, { method: 'HEAD', httpVersionMajor: 1, httpVersionMinor: 1 }, 200, {}, 5)).toMatch(
      /content-length: 5\r\n/
    );
    res.setHeader('X-Raw', '1');
    res.setHeader('x-other', '2');
    expect(writeFastHead(res, req, 200, { 'x-raw': 'reply' }, 1)).toMatch(
      /^HTTP\/1\.1 200 OK\r\nx-raw: reply\r\nx-other: 2\r\ncontent-length: 1\r\n/
    );
    // Headers that decide the connection, set on Node's response: left to Node.
    res.setHeader('Connection', 'close');
    expect(writeFastHead(res, req, 200, {}, 1)).toBe(null);
    res.removeHeader('Connection');
    res.shouldKeepAlive = false;
    expect(writeFastHead(res, req, 200, {}, 1)).toBe(null);
  });
});
