// The smallest JSON route: GET / answering {"hello":"world"}, no schema.
module.exports = {
  description: 'GET / returning a small object, no schema',
  request: { method: 'GET', path: '/' },
  expect: { status: 200, body: '{"hello":"world"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/', (request, reply) => {
      reply.send({ hello: 'world' });
    });
    return app;
  },
  node(http) {
    return http.createServer((req, res) => {
      const body = JSON.stringify({ hello: 'world' });
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    });
  },
};
