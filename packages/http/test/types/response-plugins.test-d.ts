// (test/ is a package of its own, with no name: the types of @xufa/http by its path.)
import xufa = require('../..');

const app = xufa();
app.register(xufa.helmet, { contentSecurityPolicy: { directives: { scriptSrc: ["'self'"] } }, hsts: false });
app.register(xufa.compress, { threshold: '1kb', level: 6, filter: (request, reply) => request.method !== 'HEAD' && !reply.getHeader('x-raw') });
app.register(xufa.etag, { weak: false });
// @ts-expect-error
app.register(xufa.compress, { threshold: true });
// @ts-expect-error
app.register(xufa.etag, { weak: 'yes' });
