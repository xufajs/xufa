// @xufa/http/helmet against helmet 8.3.0: the middleware on a response (node:http's ServerResponse, no network): its
// defaults, a policy of its own (default-src, script-src, object-src, base-uri, as an API sets), and a policy with a
// nonce made for each request (a function), in responses a second.
// node bench/micro/helmet.js [rounds]
const http = require('node:http');
const crypto = require('node:crypto');
const { versus, rate } = require('../lib/versus.js');

const CASES = {
  'the defaults': {},
  'a policy of 4 directives': {
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], baseUri: ["'self'"] },
    },
  },
  'a nonce for each request': {
    contentSecurityPolicy: {
      directives: { scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`] },
    },
  },
};

versus({
  file: __filename,
  theirs: 'helmet 8.3.0',
  ours: '@xufa/http/helmet',
  unit: 'responses/s',
  cases: Object.fromEntries(Object.keys(CASES).map((name) => [name, {}])),
  measure(library, caseName) {
    const helmet = library === 'theirs' ? require('helmet') : require('@xufa/http/helmet');
    const middleware = helmet(CASES[caseName]);
    const req = new http.IncomingMessage(null);
    const res = new http.ServerResponse(req);
    res.locals = {};
    const next = () => {};
    const call = caseName.startsWith('a nonce')
      ? () => {
          res.locals.nonce = crypto.randomBytes(8).toString('hex');
          middleware(req, res, next);
        }
      : () => middleware(req, res, next);
    return rate(call, { ms: 1500, batch: 1000, warm: 20000 });
  },
});
