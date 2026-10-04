// A handler throwing an error with a status code, through the default error handler.
module.exports = {
  description: 'handler throwing an error with statusCode 400',
  request: { method: 'GET', path: '/error' },
  expect: { status: 400, body: '{"statusCode":400,"error":"Bad Request","message":"invalid input"}' },
  build(Framework) {
    const app = Framework({ logger: false });
    app.get('/error', async () => {
      const err = new Error('invalid input');
      err.statusCode = 400;
      throw err;
    });
    return app;
  },
};
