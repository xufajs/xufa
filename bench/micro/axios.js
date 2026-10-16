// @xufa/client/axios against axios 1.14.0: the work of the library alone (an instance with a base URL, a header, a
// request and a response interceptor, and an adapter that answers at once: config, headers, transforms, settle), GETs
// over the loopback to a server of the same process (keep-alive, 8 at a time, a JSON answer of 2 KB), and loading it
// (ms, less is better).
// node bench/micro/axios.js [rounds]
const http = require('node:http');
const { versus, rate } = require('../lib/versus.js');

const BODY = JSON.stringify({
  items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'] })),
});

const load = (library) => (library === 'theirs' ? require('axios') : require('@xufa/client/axios'));

async function measure(library, caseName) {
  if (caseName === 'loaded') {
    const start = process.hrtime.bigint();
    load(library);
    return Number(process.hrtime.bigint() - start) / 1e6;
  }
  const axios = load(library);
  if (caseName.startsWith('a GET over')) {
    const server = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(BODY);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const api = axios.create({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 8 }),
    });
    const eight = () => Promise.all(Array.from({ length: 8 }, () => api.get('/items', { params: { page: 2 } })));
    const perSecond = (await rate(eight, { ms: 2000, warm: 50 })) * 8;
    server.close();
    return perSecond;
  }
  const adapter = (config) =>
    Promise.resolve({
      data: BODY,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      config,
      request: {},
    });
  const api = axios.create({ baseURL: 'http://example.com/api', headers: { 'X-App': '1' } });
  api.interceptors.request.use((config) => {
    config.headers.set('X-Request', '1');
    return config;
  });
  api.interceptors.response.use((response) => response);
  const call = caseName.startsWith('a GET')
    ? () => api.get('/items', { params: { page: 2, q: 'x y' }, adapter })
    : () => api.post('/items', { name: 'n', list: [1, 2, 3], nested: { a: 1 } }, { adapter });
  return rate(call, { ms: 1500, batch: 100, warm: 2000 });
}

versus({
  file: __filename,
  theirs: 'axios 1.14.0',
  ours: '@xufa/client/axios',
  unit: 'calls/s',
  cases: {
    'a GET, the work of the library': {},
    'a POST of JSON, the work of the library': {},
    'a GET over the loopback': { unit: 'requests/s' },
    loaded: { lower: true, unit: 'ms' },
  },
  measure,
});
