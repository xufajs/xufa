// A query string, parsed and echoed.
module.exports = {
  description: 'GET /search?q=...&page=2&tags=a&tags=b, echoing the query',
  request: { method: 'GET', path: '/search?q=fast%20framework&page=2&tags=a&tags=b' },
  expect: { status: 200, body: '{"q":"fast framework","page":"2","tags":["a","b"]}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/search', (request, reply) => {
      reply.send(request.query);
    });
    return app;
  },
};
