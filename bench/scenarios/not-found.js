// A request that matches no route.
module.exports = {
  description: 'unknown route, default 404 handler',
  request: { method: 'GET', path: '/does/not/exist' },
  expect: { status: 404 },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/', async () => ({ hello: 'world' }));
    app.get('/users/:id', async () => ({}));
    return app;
  },
};
