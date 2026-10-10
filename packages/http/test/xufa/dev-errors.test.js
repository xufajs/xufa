// Tests of xufa (not ported from fastify): devErrors, the page of the errors for development. Browsers get the page
// (the error, its causes, the lines of the source, the request with its credentials hidden, the routes); other
// clients the JSON they get without it; off in production unless enabled.
import xufa from '../../index.js';
import { framesOf } from '../../lib/dev-errors.js';

const HTML = { accept: 'text/html,application/xhtml+xml' };

function makeApp(options) {
  const app = xufa();
  app.register(xufa.devErrors, options);
  app.get('/boom/:id', async () => {
    const err = new Error('Something <broke>', { cause: new TypeError('a deeper cause') });
    err.code = 'APP_BOOM';
    throw err;
  });
  app.post('/books', { schema: { body: { type: 'object', required: ['title'] } } }, async () => 'ok');
  return app;
}

describe('devErrors', () => {
  it('a browser gets the page: the error escaped, its code and cause, the source around the throw, the request', async () => {
    const app = makeApp({ enabled: true });
    const res = await app.inject({ url: '/boom/7?q=1', headers: { ...HTML, authorization: 'Bearer token-123', cookie: 'sid=abc' } });
    expect(res.statusCode).toBe(500);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.body).toContain('Something &lt;broke&gt;');
    expect(res.body).not.toContain('Something <broke>');
    expect(res.body).toContain('APP_BOOM');
    expect(res.body).toContain('Caused by <span class="name">TypeError</span>');
    expect(res.body).toContain('dev-errors.test.js');
    expect(res.body).toMatch(/<span class="here"><b>\d+<\/b>\s+const err = new Error\(/);
    expect(res.body).toContain('/boom/:id');
    expect(res.body).not.toContain('token-123');
    expect(res.body).not.toContain('sid=abc');
    expect(res.body).toContain('(hidden)');
  });

  it('other clients get the JSON of every app; validation errors and missing routes too', async () => {
    const app = makeApp({ enabled: true });
    expect((await app.inject('/boom/7')).json()).toEqual({
      statusCode: 500,
      code: 'APP_BOOM',
      error: 'Internal Server Error',
      message: 'Something <broke>',
    });
    expect((await app.inject('/nope')).json()).toEqual({ message: 'Route GET:/nope not found', error: 'Not Found', statusCode: 404 });
    const page = await app.inject({ method: 'POST', url: '/books', payload: {}, headers: HTML });
    expect([page.statusCode, page.body.includes('must have required property &#39;title&#39;')]).toEqual([400, true]);
    const missing = await app.inject({ url: '/nope', headers: HTML });
    expect([missing.statusCode, missing.body.includes('No route for GET /nope'), missing.body.includes('books (POST)')]).toEqual([404, true, true]);
  });

  it("with the app's own error handlers: they answer as they do, and browsers get the page with their status", async () => {
    const app = makeApp({ enabled: true });
    app.setErrorHandler((err, request, reply) => reply.code(503).send({ mine: err.message }));
    expect((await app.inject('/boom/1')).json()).toEqual({ mine: 'Something <broke>' });
    const page = await app.inject({ url: '/boom/1', headers: HTML });
    expect([page.statusCode, page.headers['content-type'], page.body.includes('503 Service Unavailable')]).toEqual([
      503,
      'text/html; charset=utf-8',
      true,
    ]);
    expect((await app.inject({ url: '/', headers: HTML })).statusCode).toBe(404);
  });

  it('off in production (unless enabled); notFound: false leaves the 404 to the app', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = makeApp();
      const res = await app.inject({ url: '/boom/1', headers: HTML });
      expect(res.headers['content-type']).toMatch(/^application\/json/);
    } finally {
      process.env.NODE_ENV = previous;
    }
    const app = makeApp({ enabled: true, notFound: false });
    app.setNotFoundHandler((request, reply) => reply.code(404).send('mine'));
    expect((await app.inject({ url: '/nope', headers: HTML })).body).toBe('mine');
  });

  it('the calls of a stack: functions, files (file:// too), the app apart from node_modules and Node', () => {
    const frames = framesOf(
      [
        'Error: x',
        '    at handler (/srv/app/routes/books.js:10:5)',
        '    at /srv/app/node_modules/lib/index.js:1:2',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)',
        '    at load (file:///srv/app/esm.mjs:3:4)',
      ].join('\n')
    );
    expect(frames.map((frame) => [frame.fn, frame.file, frame.line, frame.app])).toEqual([
      ['handler', '/srv/app/routes/books.js', 10, true],
      ['(anonymous)', '/srv/app/node_modules/lib/index.js', 1, false],
      ['process.processTicksAndRejections', 'node:internal/process/task_queues', 105, false],
      ['load', '/srv/app/esm.mjs', 3, true],
    ]);
  });
});
