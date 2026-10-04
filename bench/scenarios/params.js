// Route parameters among other routes.
module.exports = {
  description: 'GET /users/:id/posts/:postId with two parameters',
  request: { method: 'GET', path: '/users/42/posts/hello-world' },
  expect: { status: 200, body: '{"id":"42","postId":"hello-world"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/users', async () => []);
    app.get('/users/:id', async (request) => ({ id: request.params.id }));
    app.get('/users/:id/posts', async () => []);
    app.get('/users/:id/posts/:postId', async (request) => ({ id: request.params.id, postId: request.params.postId }));
    app.get('/posts/:postId', async (request) => ({ postId: request.params.postId }));
    return app;
  },
};
