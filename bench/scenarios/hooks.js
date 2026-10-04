// Application hooks and decorators on every request.
module.exports = {
  description: 'onRequest + async preHandler + onSend hooks, decorators',
  request: { method: 'GET', path: '/' },
  expect: { status: 200, body: '{"user":"anonymous","time":true}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.decorateRequest('user', null);
    app.decorateReply('time', false);
    app.addHook('onRequest', (request, reply, done) => {
      request.user = 'anonymous';
      done();
    });
    app.addHook('preHandler', async (request, reply) => {
      reply.time = true;
    });
    app.addHook('onSend', (request, reply, payload, done) => {
      reply.header('x-powered-by', 'bench');
      done(null, payload);
    });
    app.get('/', (request, reply) => {
      reply.send({ user: request.user, time: reply.time });
    });
    return app;
  },
};
