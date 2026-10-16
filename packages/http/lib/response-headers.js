// xufa.helmet: the security headers of helmet (@xufa/http/helmet) on the routes of @xufa/http, with helmet's options.
// Headers known when it is registered (most policies) are set on each request at once; a policy with values computed
// per request (a nonce) runs helmet's middleware on the request. X-Powered-By is removed before the answer is sent.
//
//   app.register(xufa.helmet, { contentSecurityPolicy: { directives: { scriptSrc: ["'self'"] } } });
import { helmet as makeHelmet, staticHeaders } from './helmet.js';

function helmet(app, options, done) {
  const settings = { ...options };
  // (Options of register() itself are not helmet's.)
  delete settings.prefix;
  let fixed;
  let middleware;
  try {
    fixed = staticHeaders(settings);
    if (!fixed) middleware = makeHelmet(settings);
  } catch (err) {
    done(err);
    return;
  }
  if (fixed) {
    const { set, removed } = fixed;
    app.addHook('onRequest', (request, reply, next) => {
      reply.headers(set);
      next();
    });
    if (removed.length) {
      app.addHook('onSend', (request, reply, payload, next) => {
        for (const name of removed) reply.removeHeader(name);
        next(null, payload);
      });
    }
  } else {
    // The middleware of helmet on the request: its headers go to the reply (its functions get request.raw, and a
    // response whose headers are the reply's, with res.locals of the raw response).
    app.addHook('onRequest', (request, reply, next) => {
      const res = Object.create(reply.raw, {
        setHeader: { value: (name, value) => reply.header(name, value) },
        removeHeader: { value: (name) => reply.removeHeader(name) },
        getHeader: { value: (name) => reply.getHeader(name) },
      });
      middleware(request.raw, res, (err) => next(err));
    });
    app.addHook('onSend', (request, reply, payload, next) => {
      reply.removeHeader('X-Powered-By');
      next(null, payload);
    });
  }
  done();
}

helmet[Symbol.for('skip-override')] = true;
helmet[Symbol.for('fastify.display-name')] = 'helmet';
helmet[Symbol.for('plugin-meta')] = { name: 'helmet' };

export { helmet };
