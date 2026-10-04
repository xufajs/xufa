// A plain text reply.
module.exports = {
  description: 'GET returning a string (text/plain)',
  request: { method: 'GET', path: '/text' },
  expect: { status: 200, body: 'Hello, World!' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/text', (request, reply) => {
      reply.send('Hello, World!');
    });
    return app;
  },
  node(http) {
    return http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': 13 });
      res.end('Hello, World!');
    });
  },
};
