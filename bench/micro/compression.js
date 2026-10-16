// @xufa/http/compression against compression 1.8.2: the work of the middleware for one response, on a ServerResponse
// whose socket drops what it is given (no network): a JSON answer of 3 KB compressed with brotli and with gzip (zlib is
// most of it), one under the threshold (256 bytes) and one for a request that accepts no encoding, in responses a
// second.
// node bench/micro/compression.js [rounds]
const http = require('node:http');
const { Duplex } = require('node:stream');
const { versus, rate } = require('../lib/versus.js');

const JSON_BODY = JSON.stringify(
  Array.from({ length: 60 }, (_, i) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'], price: i * 1.5 }))
);
const SMALL = JSON.stringify({ ok: true });

class Sink extends Duplex {
  _write(chunk, encoding, callback) {
    callback();
  }

  _read() {}
}

function respond(middleware, acceptEncoding, body) {
  return new Promise((resolve) => {
    const socket = new Sink();
    const req = new http.IncomingMessage(socket);
    req.method = 'GET';
    req.url = '/';
    req.headers = acceptEncoding ? { 'accept-encoding': acceptEncoding } : {};
    const res = new http.ServerResponse(req);
    res.assignSocket(socket);
    res.on('finish', resolve);
    middleware(req, res, () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(body);
    });
  });
}

const CASES = {
  'JSON of 3 KB, brotli': ['gzip, deflate, br', JSON_BODY],
  'JSON of 3 KB, gzip': ['gzip, deflate', JSON_BODY],
  'JSON under the threshold': ['gzip, deflate, br', SMALL],
  'JSON, no encoding accepted': ['', JSON_BODY],
};

versus({
  file: __filename,
  theirs: 'compression 1.8.2',
  ours: '@xufa/http/compression',
  unit: 'responses/s',
  cases: Object.fromEntries(Object.keys(CASES).map((name) => [name, {}])),
  measure(library, caseName) {
    const compression = library === 'theirs' ? require('compression') : require('@xufa/http/compression');
    const middleware = compression({ threshold: 256 });
    const [accept, body] = CASES[caseName];
    return rate(() => respond(middleware, accept, body), { ms: 1500, batch: 50, warm: 500 });
  },
});
