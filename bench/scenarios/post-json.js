// A JSON body parsed and echoed, without schemas.
const body = JSON.stringify({ name: 'xufa', version: 1, tags: ['fast', 'web'], nested: { a: 1, b: [1, 2, 3] } });

module.exports = {
  description: 'POST a small JSON body, echoed back',
  request: { method: 'POST', path: '/echo', headers: { 'content-type': 'application/json' }, body },
  expect: { status: 200, body },
  build(Framework) {
    const app = Framework({ logger: false });
    app.post('/echo', (request, reply) => {
      reply.send(request.body);
    });
    return app;
  },
};
