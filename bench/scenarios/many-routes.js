// A router with a few hundred routes, static and parametric; the request hits a parametric one.
const resources = [
  'users',
  'posts',
  'comments',
  'likes',
  'tags',
  'categories',
  'orders',
  'products',
  'carts',
  'payments',
  'invoices',
  'shipments',
  'reviews',
  'images',
  'videos',
  'files',
  'folders',
  'teams',
  'projects',
  'tasks',
];

module.exports = {
  description: '300 routes (static and parametric), hitting /api/tasks/:id/comments/:commentId',
  request: { method: 'GET', path: '/api/tasks/123/comments/456' },
  expect: { status: 200, body: '{"resource":"tasks","id":"123","commentId":"456"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    for (const resource of resources) {
      app.get(`/api/${resource}`, async () => ({ resource }));
      app.post(`/api/${resource}`, async () => ({ resource }));
      app.get(`/api/${resource}/:id`, async (request) => ({ resource, id: request.params.id }));
      app.put(`/api/${resource}/:id`, async (request) => ({ resource, id: request.params.id }));
      app.delete(`/api/${resource}/:id`, async (request) => ({ resource, id: request.params.id }));
      app.get(`/api/${resource}/:id/comments`, async () => ({ resource }));
      app.get(`/api/${resource}/:id/comments/:commentId`, async (request) => ({
        resource,
        id: request.params.id,
        commentId: request.params.commentId,
      }));
      app.get(`/api/${resource}/search/recent`, async () => ({ resource }));
      app.get(`/api/${resource}/stats/daily`, async () => ({ resource }));
      app.get(`/static/${resource}/*`, async () => ({ resource }));
      for (let i = 0; i < 5; i += 1) app.get(`/v${i}/${resource}/list`, async () => ({ resource }));
    }
    return app;
  },
};
