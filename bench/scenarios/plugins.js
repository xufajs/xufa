// Routes inside nested, encapsulated plugins with prefixes and their own hooks.
module.exports = {
  description: 'route in nested encapsulated plugins (prefixes, scoped hook)',
  request: { method: 'GET', path: '/api/v1/items/7' },
  expect: { status: 200, body: '{"id":"7","scope":"v1"}' },
  async build(Framework) {
    const app = Framework({ logger: false });
    app.register(
      async (api) => {
        api.decorateRequest('scope', '');
        api.register(
          async (v1) => {
            v1.addHook('onRequest', async (request) => {
              request.scope = 'v1';
            });
            v1.get('/items/:id', async (request) => ({ id: request.params.id, scope: request.scope }));
            v1.get('/items', async () => []);
          },
          { prefix: '/v1' }
        );
        api.register(
          async (v2) => {
            v2.get('/items/:id', async (request) => ({ id: request.params.id, scope: 'v2' }));
          },
          { prefix: '/v2' }
        );
      },
      { prefix: '/api' }
    );
    await app.ready();
    return app;
  },
};
