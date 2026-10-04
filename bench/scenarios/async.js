// An async handler returning the payload.
module.exports = {
  description: 'async handler returning an object',
  request: { method: 'GET', path: '/' },
  expect: { status: 200, body: '{"hello":"world"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/', async () => ({ hello: 'world' }));
    return app;
  },
};
