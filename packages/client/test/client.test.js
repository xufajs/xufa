// The client against a server made here: URLs, query strings, JSON, answers parsed, errors by status, timeouts,
// retries (idempotent methods only, Retry-After), hooks, extend(), and a client bound to a request of @xufa/http
// (cancelled when the client of that request goes away, its id sent on). And retry().
import http from 'node:http';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import xufa from '@xufa/http';
import { createClient, retry, HTTPError, TimeoutError, RequestError, RetryError } from '../index.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Each test on both transports: fetch, and node:http.
describe.each(['fetch', 'http'])('client (%s)', (transport) => {
  const make = (options) => createClient({ transport, ...options });
  let server;
  let base;
  const calls = new Map();
  const seen = { closed: 0, connections: 0 };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const count = (calls.get(url.pathname) || 0) + 1;
      calls.set(url.pathname, count);
      let body = '';
      const raw = [];
      req.on('data', (chunk) => {
        body += chunk;
        raw.push(chunk);
      });
      req.on('end', () => {
        const json = (status, value, headers = {}) => {
          res.writeHead(status, { 'content-type': 'application/json', ...headers });
          res.end(JSON.stringify(value));
        };
        switch (url.pathname) {
          // The answer compressed as ?enc= says (deflate-raw: deflate without zlib's wrapper), with ?status=.
          case '/v1/compressed': {
            const enc = url.searchParams.get('enc');
            const text = JSON.stringify({ compressed: enc, words: Array(200).fill('again').join(' ') });
            const encoders = {
              gzip: zlib.gzipSync,
              deflate: zlib.deflateSync,
              'deflate-raw': zlib.deflateRawSync,
              br: zlib.brotliCompressSync,
            };
            res.writeHead(Number(url.searchParams.get('status')) || 200, {
              'content-type': 'application/json',
              'content-encoding': enc === 'deflate-raw' ? 'deflate' : enc,
            });
            return res.end(encoders[enc](text));
          }
          case '/v1/echo':
            return json(200, {
              method: req.method,
              path: url.pathname,
              query: [...url.searchParams],
              headers: req.headers,
              body: body ? JSON.parse(body) : null,
            });
          case '/v1/text':
            res.writeHead(200, { 'content-type': 'text/plain' });
            return res.end('plain');
          case '/v1/empty':
            res.writeHead(204);
            return res.end();
          case '/v1/missing':
            return json(404, { message: 'no book' });
          case '/v1/flaky':
            return count < 3 ? json(503, { try: count }) : json(200, { ok: count });
          case '/v1/busy':
            return count < 2 ? json(429, {}, { 'retry-after': '0' }) : json(200, { ok: true });
          case '/v1/broken':
            return json(500, { fail: count });
          // The head at once, the body 300 ms later.
          case '/v1/slow-body':
            res.writeHead(200, { 'content-type': 'application/json' });
            res.write('{"slow": ');
            setTimeout(() => {
              if (!res.destroyed) res.end('true}');
            }, 300);
            return undefined;
          // The bytes of the body, and how they came (chunked, or with a length).
          case '/v1/count':
            return json(200, {
              bytes: Buffer.byteLength(body),
              chunked: req.headers['transfer-encoding'] === 'chunked',
              length: req.headers['content-length'] ?? null,
            });
          // The body as it came: its bytes (base64), type and length.
          case '/v1/raw':
            return json(200, {
              type: req.headers['content-type'] ?? null,
              length: req.headers['content-length'] ?? null,
              chunked: req.headers['transfer-encoding'] === 'chunked',
              base64: Buffer.concat(raw).toString('base64'),
            });
          // A redirect that keeps the method and the body.
          case '/v1/temporary':
            res.writeHead(307, { location: '/v1/count' });
            return res.end();
          // A body cut: a part, then the connection closed.
          case '/v1/cut':
            res.writeHead(200, { 'content-type': 'text/plain', 'content-length': '100' });
            res.write('only a part');
            setTimeout(() => res.destroy(), 50);
            return undefined;
          // Three pieces, 150 ms apart: a stream is read as they come.
          case '/v1/pieces':
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.write('one ');
            setTimeout(() => !res.destroyed && res.write('two '), 150);
            setTimeout(() => !res.destroyed && res.end('three'), 300);
            return undefined;
          case '/v1/moved':
            res.writeHead(302, { location: '/v1/echo?from=moved' });
            return res.end();
          case '/v1/see-other':
            res.writeHead(303, { location: `http://localhost:${server.address().port}/v1/echo` });
            return res.end();
          case '/v1/slow':
            res.on('close', () => {
              seen.closed += 1;
            });
            setTimeout(() => {
              if (!res.destroyed) json(200, { slow: true });
            }, 300);
            return undefined;
          default:
            return json(404, {});
        }
      });
    });
    server.on('connection', () => {
      seen.connections += 1;
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/v1`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => calls.clear());

  const fast = () => make({ baseUrl: base, retry: { delay: 1, maxDelay: 5 } });

  it('the base URL with its path, query strings, headers and JSON bodies', async () => {
    const api = make({ baseUrl: base, headers: { 'X-App': 'books' } });
    const echo = await api.post('/echo', {
      query: { tags: ['a', 'b'], page: 2, skip: undefined, since: new Date(0) },
      headers: { 'x-call': '1' },
      json: { title: 'Dune' },
    });
    expect(echo.method).toBe('POST');
    expect(echo.path).toBe('/v1/echo');
    expect(echo.query).toEqual([
      ['tags', 'a'],
      ['tags', 'b'],
      ['page', '2'],
      ['since', '1970-01-01T00:00:00.000Z'],
    ]);
    expect(echo.headers).toMatchObject({ 'x-app': 'books', 'x-call': '1', 'content-type': 'application/json' });
    expect(echo.body).toEqual({ title: 'Dune' });
  });

  it('answers parsed by their type, or as asked; 204 and HEAD have no body', async () => {
    const api = fast();
    expect(await api.get('/text')).toBe('plain');
    expect(await api.get('/empty')).toBe(undefined);
    expect(await api.head('/echo')).toBe(undefined);
    expect(Buffer.isBuffer(await api.get('/text', { responseType: 'buffer' }))).toBe(true);
    const full = await api.get('/echo', { resolveBodyOnly: false });
    expect([full.status, full.headers['content-type'], full.body.method]).toEqual([200, 'application/json', 'GET']);
    const response = await api.get('/text', { responseType: 'response' });
    expect(await response.text()).toBe('plain');
  });

  it('error statuses are HTTPErrors with their body; throwHttpErrors: false gives them', async () => {
    const api = fast();
    const err = await api.get('/missing').catch((error) => error);
    expect(err).toBeInstanceOf(HTTPError);
    expect([err.status, err.body, err.method, err.code]).toEqual([
      404,
      { message: 'no book' },
      'GET',
      'XUFA_CLIENT_HTTP_ERROR',
    ]);
    expect(await api.get('/missing', { throwHttpErrors: false })).toEqual({ message: 'no book' });
  });

  it('idempotent methods are retried on statuses that may pass, with backoff', async () => {
    const api = fast();
    expect(await api.get('/flaky')).toEqual({ ok: 3 });
    expect(calls.get('/v1/flaky')).toBe(3);
    // POST is not retried (by default).
    calls.clear();
    await expect(api.post('/flaky')).rejects.toBeInstanceOf(HTTPError);
    expect(calls.get('/v1/flaky')).toBe(1);
    // Unless asked; and attempts are counted.
    calls.clear();
    await expect(api.get('/broken', { retry: 2 })).rejects.toMatchObject({ status: 500, body: { fail: 2 } });
    expect(calls.get('/v1/broken')).toBe(2);
    calls.clear();
    await expect(api.get('/broken', { retry: false })).rejects.toMatchObject({ body: { fail: 1 } });
  });

  it('Retry-After is waited instead of the backoff', async () => {
    // A backoff of 5 s: the retry comes at once only because Retry-After says 0.
    const slowBackoff = make({ baseUrl: base, retry: { delay: 5000, jitter: false } });
    const started = Date.now();
    expect(await slowBackoff.get('/busy')).toEqual({ ok: true });
    expect(calls.get('/v1/busy')).toBe(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('timeouts, and requests that cannot be made', async () => {
    const api = make({ baseUrl: base, timeout: 50, retry: false });
    await expect(api.get('/slow')).rejects.toBeInstanceOf(TimeoutError);
    // The timeout covers the body too: one that comes too slowly is cut.
    const cut = await api.get('/slow-body').catch((error) => error);
    expect(cut.name).toBe('TimeoutError');
    // An answer in time leaves no timer behind (it would abort nothing, but keep the process for its time).
    const timers = () => process.getActiveResourcesInfo().filter((name) => name === 'Timeout').length;
    const before = timers();
    await make({ baseUrl: base, timeout: 60000, retry: false }).get('/text');
    expect(timers()).toBe(before);
    // A port nobody listens on: that of a server closed.
    const closed = http.createServer();
    await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address();
    await new Promise((resolve) => closed.close(resolve));
    const nowhere = make({ baseUrl: `http://127.0.0.1:${port}`, retry: false });
    const err = await nowhere.get('/x').catch((error) => error);
    expect(err).toBeInstanceOf(RequestError);
    expect(err.cause).toBeTruthy();
  });

  it('hooks and extend()', async () => {
    const log = [];
    const api = fast().extend({
      headers: { authorization: 'Bearer t' },
      hooks: {
        beforeRequest: (call) => {
          call.headers['x-signed'] = 'yes';
          log.push(`before ${call.method}`);
        },
        afterResponse: (response) => log.push(`after ${response.status}`),
      },
    });
    const echo = await api.get('/echo');
    expect(echo.headers).toMatchObject({ authorization: 'Bearer t', 'x-signed': 'yes' });
    expect(log).toEqual(['before GET', 'after 200']);
    // The first client is as it was.
    expect((await fast().get('/echo')).headers.authorization).toBe(undefined);
  });

  it('a signal stops it, and its retries', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('stop')), 30);
    await expect(fast().get('/slow', { signal: controller.signal })).rejects.toThrow('stop');
  });

  it('bound to a request of @xufa/http: its id sent on, its log, and cancelled when its client goes away', async () => {
    const lines = [];
    const api = make({ baseUrl: base });
    const app = xufa({ logger: { level: 'debug', stream: { write: (line) => lines.push(JSON.parse(line)) } } });
    let outcome;
    app.get('/proxy', async (request) => {
      try {
        outcome = await api.for(request).get('/slow');
      } catch (err) {
        outcome = err.name;
      }
      return outcome;
    });
    app.get('/echo-id', async (request) => api.for(request).get('/echo'));
    await app.listen({ port: 0, host: '127.0.0.1' });
    try {
      const port = app.server.address().port;
      const echo = await fetch(`http://127.0.0.1:${port}/echo-id`).then((res) => res.json());
      expect(echo.headers['x-request-id']).toMatch(/^req-/);
      expect(lines.some((line) => line.msg === 'outgoing request' && line.client.url === `${base}/echo`)).toBe(true);
      // The browser leaves: the call to the API is cancelled (the API sees its connection closed).
      const closedBefore = seen.closed;
      const controller = new AbortController();
      const leaving = fetch(`http://127.0.0.1:${port}/proxy`, { signal: controller.signal }).catch(() => null);
      await wait(80);
      controller.abort();
      await leaving;
      await wait(100);
      expect(outcome).toBe('AbortError');
      expect(seen.closed).toBe(closedBefore + 1);
    } finally {
      await app.close();
    }
  });

  it('redirects are followed (a GET after 303, credentials kept to their origin), or not with redirect: manual', async () => {
    const api = make({ baseUrl: base, headers: { authorization: 'Bearer t' } });
    const moved = await api.get('/moved', { resolveBodyOnly: false });
    expect(moved.body.query).toEqual([['from', 'moved']]);
    expect(moved.body.headers.authorization).toBe('Bearer t');
    expect(moved.url).toBe(`${base}/echo?from=moved`);
    const other = await api.post('/see-other', { json: { a: 1 } });
    expect(other.method).toBe('GET');
    expect(other.body).toBe(null);
    expect(other.headers.authorization).toBeUndefined();
    const manual = await api.get('/moved', { redirect: 'manual', throwHttpErrors: false, resolveBodyOnly: false });
    expect(manual.status).toBe(302);
  });

  // (Not HEAD here: node's server closes the connection after a HEAD answer without a content-length.)
  it('answers without a body (204) give their connection back, for the next call', async () => {
    const api = make({ baseUrl: base });
    await api.get('/empty');
    const before = seen.connections;
    for (let i = 0; i < 50; i += 1) await api.get('/empty');
    expect(seen.connections - before).toBeLessThanOrEqual(1); // 50 when they are not given back
    api.close();
  });

  it('close(): the connections kept closed; a call after it opens new ones', async () => {
    const api = make({ baseUrl: base });
    expect(await api.get('/text')).toBe('plain');
    api.close();
    expect(await api.get('/text')).toBe('plain');
    api.close();
  });

  it("responseType: 'stream': a web ReadableStream, read as it comes, decompressed, cut by the timeout", async () => {
    const api = make({ baseUrl: base, retry: false });
    const text = async (stream) => {
      const chunks = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks).toString('utf8');
    };
    const plain = await api.get('/text', { responseType: 'stream' });
    expect(plain).toBeInstanceOf(ReadableStream);
    expect(await text(plain)).toBe('plain');

    // The first piece before the server has sent the rest.
    const started = performance.now();
    const reader = (await api.get('/pieces', { responseType: 'stream' })).getReader();
    const first = await reader.read();
    expect(Buffer.from(first.value).toString()).toBe('one ');
    expect(performance.now() - started).toBeLessThan(140);
    let rest = '';
    for (let part = await reader.read(); !part.done; part = await reader.read()) rest += Buffer.from(part.value);
    expect(rest).toBe('two three');

    for (const enc of ['gzip', 'deflate', 'deflate-raw', 'br']) {
      const stream = await api.get('/compressed', { query: { enc }, responseType: 'stream' });
      expect(JSON.parse(await text(stream)).compressed).toBe(enc);
    }

    // Cancelled by the reader: it ends there, and the client goes on.
    const cancelled = (await api.get('/pieces', { responseType: 'stream' })).getReader();
    await cancelled.read();
    await cancelled.cancel();
    expect(await api.get('/text')).toBe('plain');
    // Cut by the server: the stream fails (it does not wait for ever).
    const cut = await text(await api.get('/cut', { responseType: 'stream' })).catch((error) => error);
    expect(cut).toBeInstanceOf(Error);

    // The timeout covers the body: one that comes too slowly fails the stream.
    const slow = await make({ baseUrl: base, retry: false, timeout: 100 }).get('/slow-body', {
      responseType: 'stream',
    });
    const err = await text(slow).catch((error) => error);
    expect(err.name).toBe('TimeoutError');
  });

  it('bodies that are streams (of Node or of the web): sent as they come, chunked; not sent again for a 307', async () => {
    const api = make({ baseUrl: base, retry: false, headers: { 'content-type': 'application/json' } });
    const node = await api.post('/echo', { body: Readable.from(['{"a":', '1}']) });
    expect(node.body).toEqual({ a: 1 });
    const web = await api.post('/echo', { body: Readable.toWeb(Readable.from([Buffer.from('{"b":2}')])) });
    expect(web.body).toEqual({ b: 2 });

    const megabyte = Readable.from(
      (function* pieces() {
        for (let i = 0; i < 64; i += 1) yield Buffer.alloc(16384, 'x');
      })()
    );
    expect(await api.post('/count', { body: megabyte })).toEqual({ bytes: 1048576, chunked: true, length: null });
    // With its length given, not chunked.
    const sized = await api.post('/count', { body: Readable.from(['12345']), headers: { 'content-length': '5' } });
    expect(sized).toEqual({ bytes: 5, chunked: false, length: '5' });

    // A stream that fails: the call fails.
    const failing = new Readable({
      read() {
        this.destroy(new Error('the disk went away'));
      },
    });
    await expect(api.post('/count', { body: failing })).rejects.toBeInstanceOf(RequestError);

    // 307 sends the same body again, which a stream cannot be: an error, as fetch makes it. 303 is a GET without it.
    const again = await api.post('/temporary', { body: Readable.from(['{}']) }).catch((error) => error);
    expect(again).toBeInstanceOf(RequestError);
    expect(await api.post('/see-other', { body: Readable.from(['{}']) })).toMatchObject({ method: 'GET', body: null });
  });

  it('forms (URLSearchParams, FormData), blobs and ArrayBuffers: with the type and length fetch gives them', async () => {
    const api = make({ baseUrl: base, retry: false });
    const bytes = (answer) => Buffer.from(answer.base64, 'base64');

    const urlencoded = await api.post('/raw', { body: new URLSearchParams({ a: '1', b: 'x y' }) });
    expect([urlencoded.type, bytes(urlencoded).toString()]).toEqual([
      'application/x-www-form-urlencoded;charset=UTF-8',
      'a=1&b=x+y',
    ]);

    const blob = await api.post('/raw', { body: new Blob(['hello'], { type: 'text/plain' }) });
    expect([blob.type, blob.length, bytes(blob).toString()]).toEqual(['text/plain', '5', 'hello']);

    const buffer = await api.post('/raw', { body: new TextEncoder().encode('ab').buffer });
    expect([buffer.length, bytes(buffer).toString()]).toEqual(['2', 'ab']);
    const view = await api.post('/raw', { body: new DataView(new Uint8Array([1, 2, 3, 4]).buffer, 1, 2) });
    expect([...bytes(view)]).toEqual([2, 3]);
    const wide = await api.post('/raw', { body: new Uint16Array([0x6261]) });
    expect(bytes(wide).toString()).toBe('ab');

    const form = new FormData();
    form.append('title', 'Dune\nby Herbert');
    form.append('file', new File(['the bytes'], 'résumé.txt', { type: 'text/plain' }));
    form.append('data', new Blob([new Uint8Array([0, 255, 128])]));
    const sent = await api.post('/raw', { body: form });
    expect(sent.type).toMatch(/^multipart\/form-data; boundary=/);
    if (transport === 'http') expect([sent.chunked, Number(sent.length)]).toEqual([false, bytes(sent).length]);
    const parsed = await new Response(bytes(sent), { headers: { 'content-type': sent.type } }).formData();
    expect(parsed.get('title')).toBe('Dune\r\nby Herbert');
    const file = parsed.get('file');
    expect([file.name, file.type, await file.text()]).toEqual(['résumé.txt', 'text/plain', 'the bytes']);
    const data = parsed.get('data');
    expect([data.name, data.type, [...new Uint8Array(await data.arrayBuffer())]]).toEqual([
      'blob',
      'application/octet-stream',
      [0, 255, 128],
    ]);

    // Large forms one after another on the same client: a streamed body answered before its 'finish' does not leave
    // its connection to the next call (Node.js gave it back to the pool twice, and the next call waited for ever).
    const quick = make({ baseUrl: base, retry: false, timeout: 5000 });
    for (let i = 0; i < 5; i += 1) {
      const big = new FormData();
      big.append('file', new Blob([Buffer.alloc(1 << 20, 'z')]));
      expect((await quick.post('/count', { body: big })).bytes).toBeGreaterThan(1 << 20);
    }

    // Encoded again for each attempt: retried as other bodies are (a PUT, on 503s).
    const retried = make({ baseUrl: base, retry: { delay: 1, maxDelay: 5 } });
    const again = new FormData();
    again.append('file', new File(['x'.repeat(1000)], 'a.txt'));
    expect(await retried.put('/flaky', { body: again })).toEqual({ ok: 3 });

    // A content-type of the caller is kept.
    const typed = await api.post('/raw', {
      body: new URLSearchParams({ a: '1' }),
      headers: { 'content-type': 'text/x-form' },
    });
    expect(typed.type).toBe('text/x-form');
  });

  it('compressed answers (gzip, deflate with or without its wrapper, br), as fetch asks for and reads them', async () => {
    const api = make({ baseUrl: base, retry: false });
    for (const enc of ['gzip', 'deflate', 'deflate-raw', 'br']) {
      const body = await api.get('/compressed', { query: { enc } });
      expect([body.compressed, body.words.length]).toEqual([enc, 1199]);
    }
    expect((await api.get('/echo')).headers['accept-encoding']).toMatch(/gzip/);
    const identity = await api.get('/echo', { headers: { 'accept-encoding': 'identity' } });
    expect(identity.headers['accept-encoding']).toBe('identity');
    const err = await api.get('/compressed', { query: { enc: 'gzip', status: 503 } }).catch((error) => error);
    expect([err.status, err.body.compressed]).toEqual([503, 'gzip']);
  });

  it('paths need a base URL unless absolute', async () => {
    await expect(make().get('/books')).rejects.toThrow(/no baseUrl/);
    expect((await make().get(`${base}/echo`)).path).toBe('/v1/echo');
  });
});

describe('retry()', () => {
  it('until a value is accepted, or RetryError with the last one', async () => {
    let n = 0;
    expect(await retry(() => (n += 1), { until: (value) => value === 3, delay: 1 })).toBe(3);
    const err = await retry(() => 'pending', { until: (value) => value === 'done', attempts: 4, delay: 1 }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(RetryError);
    expect([err.attempts, err.result]).toEqual([4, 'pending']);
  });

  it('errors are retried unless retryOn says no; the last one is thrown', async () => {
    let n = 0;
    const flaky = () => {
      n += 1;
      if (n < 3) throw new Error(`fail ${n}`);
      return 'ok';
    };
    expect(await retry(flaky, { delay: 1 })).toBe('ok');
    n = 0;
    await expect(retry(flaky, { delay: 1, attempts: 2 })).rejects.toThrow('fail 2');
    n = 0;
    await expect(retry(flaky, { delay: 1, retryOn: () => false })).rejects.toThrow('fail 1');
  });

  it('waits with backoff, and a signal stops the wait', async () => {
    const started = Date.now();
    let n = 0;
    await retry(() => (n += 1), { until: (value) => value === 3, delay: 40, factor: 1, jitter: false });
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('stopped')), 20);
    await expect(retry(() => 'no', { until: () => false, delay: 1000, signal: controller.signal })).rejects.toThrow(
      'stopped'
    );
    await expect(retry(() => 1, { attempts: 0 })).rejects.toThrow(/attempts/);
  });
});
