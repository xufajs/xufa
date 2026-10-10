// The context of the views of requests: functions of the plugin (context) and of other plugins (app.viewContext), and
// the builtins (request, url of the named routes, staticUrl, csrfToken and messages of the session).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { sessionPlugin } from '@xufa/session';
import { plugin } from '../index.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-context-'));
fs.writeFileSync(path.join(root, 'page.html'), '{{ user }}|{{ theme }}|{{ request.path }}|{{ url("book", 7) }}|{{ title }}');
fs.writeFileSync(path.join(root, 'form.html'), '{{ csrfToken.length > 10 }}|{{ messages.map((m) => m.level + ":" + m.text).join(",") }}');
fs.writeFileSync(path.join(root, 'plain.html'), '{{ typeof request }}|{{ typeof csrfToken }}');
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('the context of views', () => {
  it('context functions (async too), app.viewContext, reply.locals and the data, in that order', async () => {
    const app = xufa();
    app.register(plugin, {
      root,
      context: [async (request) => ({ user: request.headers['x-user'] || 'guest', theme: 'light' })],
    });
    app.register(async (child) => {
      child.viewContext((request, reply) => ({ theme: 'dark', title: reply.locals?.title ?? 'none' }));
    });
    app.get('/books/:id', { name: 'book' }, async (request, reply) => {
      reply.locals = { title: 'from locals' };
      return reply.view('page', { title: 'from data' });
    });
    app.get('/viewasync', async (request, reply) => reply.viewAsync('page'));
    const res = await app.inject({ url: '/books/1?x=1', headers: { 'x-user': 'ada' } });
    expect(res.body).toBe('ada|dark|/books/1|/books/7|from data');
    expect((await app.inject('/viewasync')).body).toBe('guest|dark|/viewasync|/books/7|none');
    // app.view() has no request: no context of requests.
    expect(await app.view('plain')).toBe('undefined|undefined');
  });

  it('builtins: the CSRF token and the messages of the session (once, after a redirect too); builtins: false', async () => {
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(plugin, { root });
    app.get('/form', async (request, reply) => {
      request.session.message('Saved', 'success');
      return reply.view('form');
    });
    app.get('/later', async (request, reply) => {
      request.session.message('Welcome back');
      return reply.redirect('/show');
    });
    app.get('/show', async (request, reply) => reply.view('form'));
    expect((await app.inject('/form')).body).toBe('true|success:Saved');
    const later = await app.inject('/later');
    const cookie = later.headers['set-cookie'].split(';')[0];
    expect((await app.inject({ url: '/show', headers: { cookie } })).body).toBe('true|info:Welcome back');
    expect((await app.inject({ url: '/show', headers: { cookie } })).body).toBe('true|');
    const bare = xufa();
    bare.register(plugin, { root, builtins: false });
    bare.get('/', async (request, reply) => reply.view('plain'));
    expect((await bare.inject('/')).body).toBe('undefined|undefined');
    await expect(xufa().register(plugin, { root, context: 'nope' }).ready()).rejects.toThrow('context of the templates');
  });

  it('the CSRF token is made only by a page that writes it (no cookie for the others), with a layout too', async () => {
    fs.writeFileSync(path.join(root, 'layout.html'), '<main>{{ body }}</main>');
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
    app.register(plugin, { root });
    app.get('/page', async (request, reply) => reply.view('page'));
    app.get('/framed', async (request, reply) => reply.view('page', {}, { layout: 'layout' }));
    app.get('/form', async (request, reply) => reply.view('form', {}, { layout: 'layout' }));
    expect((await app.inject('/page')).headers['set-cookie']).toBeUndefined();
    expect((await app.inject('/framed')).headers['set-cookie']).toBeUndefined();
    const form = await app.inject('/form');
    expect(form.body).toBe('<main>true|</main>');
    expect(form.headers['set-cookie']).toMatch(/^sid_csrf=/);
  });
});
