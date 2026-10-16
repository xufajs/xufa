// xufa.etag: ETags and 304s on the routes of @xufa/http, as Express answers them: the ETag of each body of a string
// or Buffer (weak, by default, as Express's; `weak: false` for strong ones), unless the route set one; and for a GET or
// HEAD of a 2xx or 304 whose client has it (If-None-Match, If-Modified-Since against Last-Modified, as fresh decides),
// 304 without a body, its Content-Type, Content-Length or Transfer-Encoding.
//
//   app.register(xufa.etag);
import { entityTag, fresh } from './fresh.js';

function etag(app, options, done) {
  const weak = !options || options.weak !== false;
  app.addHook('onSend', (request, reply, payload, next) => {
    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
      next(null, payload);
      return;
    }
    if (!reply.getHeader('etag')) reply.header('etag', entityTag(payload, weak));
    const { method } = request;
    const status = reply.statusCode;
    if (
      (method === 'GET' || method === 'HEAD') &&
      ((status >= 200 && status < 300) || status === 304) &&
      fresh(request.headers, reply.getHeader('etag'), reply.getHeader('last-modified'))
    ) {
      reply.code(304);
      for (const name of ['content-type', 'content-length', 'transfer-encoding']) reply.removeHeader(name);
      next(null, '');
      return;
    }
    next(null, payload);
  });
  done();
}

etag[Symbol.for('skip-override')] = true;
etag[Symbol.for('fastify.display-name')] = 'etag';
etag[Symbol.for('plugin-meta')] = { name: 'etag' };

export { etag };
