// The client against a server made here: URLs, query strings, JSON, answers parsed, errors by status, timeouts,
// retries (idempotent methods only, Retry-After), hooks, extend(), and a client bound to a request of @xufa/http
// (cancelled when the client of that request goes away, its id sent on). And retry().
const http = require('node:http');
const xufa = require('@xufa/http');
const { createClient, retry, HTTPError, TimeoutError, RequestError, RetryError } = require('..');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('client', () => {
  let server;
  let base;
  const calls = new Map();
  const seen = { closed: 0 };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://x');
      const count = (calls.get(url.pathname) || 0) + 1;
      calls.set(url.pathname, count);
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const json = (status, value, headers = {}) => {
          res.writeHead(status, { 'content-type': 'application/json', ...headers });
          res.end(JSON.stringify(value));
        };
        switch (url.pathname) {
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
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}/v1`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => calls.clear());

  const fast = () => createClient({ baseUrl: base, retry: { delay: 1, maxDelay: 5 } });

  it('the base URL with its path, query strings, headers and JSON bodies', async () => {
    const api = createClient({ baseUrl: base, headers: { 'X-App': 'books' } });
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
    const slowBackoff = createClient({ baseUrl: base, retry: { delay: 5000, jitter: false } });
    const started = Date.now();
    expect(await slowBackoff.get('/busy')).toEqual({ ok: true });
    expect(calls.get('/v1/busy')).toBe(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('timeouts, and requests that cannot be made', async () => {
    const api = createClient({ baseUrl: base, timeout: 50, retry: false });
    await expect(api.get('/slow')).rejects.toBeInstanceOf(TimeoutError);
    const nowhere = createClient({ baseUrl: 'http://127.0.0.1:1', retry: false });
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
    const api = createClient({ baseUrl: base });
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

  it('paths need a base URL unless absolute', async () => {
    await expect(createClient().get('/books')).rejects.toThrow(/no baseUrl/);
    expect((await createClient().get(`${base}/echo`)).path).toBe('/v1/echo');
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
