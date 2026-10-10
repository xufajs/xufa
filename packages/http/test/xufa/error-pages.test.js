// Error handlers added over those of a context (addErrorHandler: setErrorHandler stays free, and goes first), and the
// error pages of browsers (errorPages: Django's handler404 and handler500 with templates); other clients get JSON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '../../index.js';
import * as template from '@xufa/template';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-error-pages-'));
fs.writeFileSync(path.join(root, '404.html'), '<h1>Not here</h1>{{ message }}');
fs.writeFileSync(path.join(root, '403.html'), '<h1>No</h1>{{ permission }}');
fs.writeFileSync(path.join(root, '500.html'), '<h1>Oops</h1>{{ statusCode }} {{ message }} {{ error }}');
fs.writeFileSync(path.join(root, 'broken.html'), '{{ nope( }}');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const HTML = { accept: 'text/html,application/xhtml+xml' };
const fail = (statusCode, message, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });

function makeApp(options = {}, register = () => {}) {
  const app = xufa({ logger: false });
  app.register(template.plugin, { root });
  register(app);
  app.register(xufa.errorPages, { views: { 404: '404', 403: '403', 500: '500' }, ...options });
  app.get('/forbidden', async () => {
    throw fail(403, 'Forbidden', { permission: 'Book.add' });
  });
  app.get('/boom', async () => {
    throw new Error('the database is gone');
  });
  app.get('/gone', async () => {
    throw fail(410, 'Gone');
  });
  app.get('/unavailable', async () => {
    throw fail(503, 'Down');
  });
  return app;
}

describe('addErrorHandler', () => {
  it('handlers over those of the context: the last added first, passing errors down by throwing them', async () => {
    const app = xufa();
    app.addErrorHandler((err, request, reply) => reply.code(418).send({ under: err.message }));
    app.addErrorHandler((err) => {
      if (err.message === 'mine') return { over: true };
      throw err;
    });
    app.get('/mine', async () => {
      throw new Error('mine');
    });
    app.get('/other', async () => {
      throw new Error('other');
    });
    expect((await app.inject('/mine')).json()).toEqual({ over: true });
    const other = await app.inject('/other');
    expect([other.statusCode, other.json()]).toEqual([418, { under: 'other' }]);
  });

  it('setErrorHandler is still free, and goes first', async () => {
    const app = xufa();
    app.addErrorHandler((err, request, reply) => reply.code(409).send({ added: err.message }));
    app.setErrorHandler((err) => {
      if (err.message === 'set') return { set: true };
      throw err;
    });
    app.get('/set', async () => {
      throw new Error('set');
    });
    app.get('/added', async () => {
      throw new Error('added');
    });
    expect((await app.inject('/set')).json()).toEqual({ set: true });
    expect((await app.inject('/added')).json()).toEqual({ added: 'added' });
    expect(() => app.addErrorHandler('nope')).toThrow();
  });
});

describe('errorPages', () => {
  it('browsers get the view of the status; other clients the JSON of the handlers under it', async () => {
    const app = makeApp();
    const page = await app.inject({ url: '/forbidden', headers: HTML });
    expect([page.statusCode, page.headers['content-type'], page.body]).toEqual([
      403,
      'text/html; charset=utf-8',
      '<h1>No</h1>Book.add',
    ]);
    const json = await app.inject('/forbidden');
    expect([json.statusCode, json.json().message]).toEqual([403, 'Forbidden']);
    // A status without a view goes on.
    expect((await app.inject({ url: '/gone', headers: HTML })).headers['content-type']).toMatch(/json/);
  });

  it('500: the message of the status, not that of the error; other 5xx take its view', async () => {
    const app = makeApp();
    const boom = await app.inject({ url: '/boom', headers: HTML });
    expect([boom.statusCode, boom.body]).toEqual([500, '<h1>Oops</h1>500 Internal Server Error ']);
    const down = await app.inject({ url: '/unavailable', headers: HTML });
    expect([down.statusCode, down.body]).toEqual([503, '<h1>Oops</h1>503 Service Unavailable ']);
  });

  it('routes that are not there (notFound), and not with notFound: false', async () => {
    const app = makeApp();
    const page = await app.inject({ url: '/nowhere', headers: HTML });
    expect([page.statusCode, page.body]).toEqual([404, '<h1>Not here</h1>Route GET:/nowhere not found']);
    const json = await app.inject('/nowhere');
    expect([json.statusCode, json.json().message]).toEqual([404, 'Route GET:/nowhere not found']);
    const plain = makeApp({ notFound: false });
    const fastifys = await plain.inject({ url: '/nowhere', headers: HTML });
    expect([fastifys.statusCode, fastifys.headers['content-type']]).toEqual([404, 'application/json; charset=utf-8']);
  });

  it('with the error handler of a plugin under it (as the ORM adds), and a view that fails', async () => {
    const app = makeApp({ views: { 400: 'broken', 403: '403' } }, (target) => {
      target.addErrorHandler((err, request, reply) => {
        if (err.code === 'INVALID') return reply.code(400).send({ errors: err.errors });
        throw err;
      });
    });
    app.get('/invalid', async () => {
      throw fail(400, 'Invalid', { code: 'INVALID', errors: { name: ['Required'] } });
    });
    // The view of 400 fails: the error goes on to the handler under it.
    const res = await app.inject({ url: '/invalid', headers: HTML });
    expect([res.statusCode, res.json()]).toEqual([400, { errors: { name: ['Required'] } }]);
  });

  it('views of a folder, and a context of the app', async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-error-folder-'));
    try {
      fs.mkdirSync(path.join(folder, 'errors'));
      fs.writeFileSync(path.join(folder, 'errors', '404.html'), '{{ site }}: {{ title }}');
      const app = xufa({ logger: false });
      app.register(template.plugin, { root: folder });
      app.register(xufa.errorPages, { views: 'errors', context: () => ({ site: 'Library' }) });
      expect((await app.inject({ url: '/x', headers: HTML })).body).toBe('Library: Not Found');
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });
});
