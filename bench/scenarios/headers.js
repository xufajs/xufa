// Reading request headers and setting several response headers.
module.exports = {
  description: 'reads request headers, sets 4 response headers and a status',
  request: { method: 'GET', path: '/headers', headers: { 'x-request-id': 'abc', authorization: 'Bearer token' } },
  expect: { status: 202, body: '{"id":"abc","auth":true}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/headers', (request, reply) => {
      reply
        .code(202)
        .header('x-request-id', request.headers['x-request-id'])
        .header('cache-control', 'no-store')
        .header('x-frame-options', 'DENY')
        .headers({ 'x-content-type-options': 'nosniff' })
        .send({ id: request.headers['x-request-id'], auth: request.headers.authorization !== undefined });
    });
    return app;
  },
};
