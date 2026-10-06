// The faults of a client (client.faults): calls that the network refuses (retried as such), replies of a status
// (respond: a 503 and its Retry-After), delays and hangs (its timeout ends them), by method and path; shared by the
// clients made from it.
const http = require('node:http');
const { createClient, RequestError, HTTPError, TimeoutError } = require('..');

describe('client.faults', () => {
  let server;
  let base;
  let calls = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      calls += 1;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ path: req.url }));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  beforeEach(() => {
    calls = 0;
  });

  const client = (options = {}) => createClient({ baseUrl: base, retry: { attempts: 3, delay: 1, jitter: 0 }, ...options });

  it('fail: as a network that refuses the call (a RequestError), retried as one', async () => {
    const api = client();
    const rule = api.faults.fail({ times: 2 });
    expect(await api.get('/books')).toEqual({ path: '/books' });
    expect([rule.hits, calls]).toEqual([2, 1]);
    api.faults.fail();
    const err = await api.get('/books').catch((e) => e);
    expect(err).toBeInstanceOf(RequestError);
    expect(err.cause.cause.code).toBe('ECONNREFUSED');
    expect(calls).toBe(1); // no call reached the server
  });

  it('respond: a status without the call (a 503 with Retry-After is retried after it)', async () => {
    const api = client();
    api.faults.respond({ status: 503, headers: { 'retry-after': '0' }, json: { error: 'busy' }, times: 1 });
    expect(await api.get('/x')).toEqual({ path: '/x' });
    api.faults.respond({ status: 404, json: { error: 'not here' }, paths: '/missing' });
    const err = await api.get('/missing/1').catch((e) => e);
    expect([err instanceof HTTPError, err.status, err.body]).toEqual([true, 404, { error: 'not here' }]);
    expect(await api.get('/other')).toEqual({ path: '/other' });
    expect(() => api.faults.respond({ status: 99 })).toThrow(/from 200 to 599/);
  });

  it('delay, and hang (the timeout of the client ends it: a TimeoutError)', async () => {
    const api = client({ timeout: 60, retry: false });
    api.faults.delay({ ms: 30 });
    const started = Date.now();
    await api.get('/slow');
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    api.faults.clear();
    api.faults.hang({ operations: 'read' });
    const err = await api.get('/hung').catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(calls).toBe(1);
    // A write is not a read: not held.
    expect(await api.post('/write', { json: {} })).toEqual({ path: '/write' });
  });

  it('by method and path; down and up; shared with extend() and for()', async () => {
    const api = client({ retry: false });
    api.faults.fail({ operations: 'write', paths: [/^\/orders/] });
    expect(await api.get('/orders')).toEqual({ path: '/orders' });
    expect(await api.post('/books', { json: {} })).toEqual({ path: '/books' });
    expect(await api.post('/orders/1', { json: {} }).catch((e) => e)).toBeInstanceOf(RequestError);
    api.faults.clear();
    const child = api.extend({ headers: { 'x-a': '1' } });
    const bound = api.for({ id: 'r1', log: null, signal: undefined });
    api.faults.down();
    expect(await child.get('/a').catch((e) => e)).toBeInstanceOf(RequestError);
    expect(await bound.get('/a').catch((e) => e)).toBeInstanceOf(RequestError);
    expect(child.faults).toBe(api.faults);
    api.faults.up();
    expect(await child.get('/a')).toEqual({ path: '/a' });
  });
});
