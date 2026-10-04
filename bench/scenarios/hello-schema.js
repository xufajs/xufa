// Fastify's own benchmark: a response schema, so the reply is written by a compiled serializer.
module.exports = {
  description: 'GET / with a response schema (compiled serializer)',
  request: { method: 'GET', path: '/' },
  expect: { status: 200, body: '{"hello":"world"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    const schema = { response: { 200: { type: 'object', properties: { hello: { type: 'string' } } } } };
    app.get('/', { schema }, (request, reply) => {
      reply.send({ hello: 'world' });
    });
    return app;
  },
  node(http) {
    return http.createServer((req, res) => {
      const body = `{"hello":${JSON.stringify('world')}}`;
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
    });
  },
};
