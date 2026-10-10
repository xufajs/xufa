// The client of tests (Django's test Client): cookies kept, forms posted with the CSRF token of the session, logins
// (login, forceLogin), redirects followed, and the views rendered with their context.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '../../index.js';
import * as template from '@xufa/template';
import { sessionPlugin } from '@xufa/session';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-test-client-'));
fs.writeFileSync(path.join(root, 'base.html'), '<title>{{#block title}}Library{{/block}}</title>{{#block content}}{{/block}}');
fs.writeFileSync(
  path.join(root, 'books.html'),
  "{{extends 'base'}}{{#block content}}<ul>{{#each books as book}}<li>{{ book }} &amp; co</li>{{/each}}</ul><script>x()</script>{{/block}}"
);
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

const USERS = [{ id: 7, username: 'ada', password: 'right-horse-battery' }];

async function makeApp() {
  const app = xufa({ logger: false });
  app.register(xufa.formBody);
  app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
  app.register(template.plugin, { root });
  // The parts of the accounts of @xufa/auth the client uses.
  app.decorate('accounts', {
    authenticate: async ({ username, password }) => {
      const user = USERS.find((item) => item.username === username && item.password === password);
      if (!user) throw Object.assign(new Error('Wrong user or password'), { statusCode: 401 });
      return user;
    },
    logIn: async (request, user) => {
      await request.session.login(user.id);
      request.session.set('user', user.id);
    },
  });
  app.get('/books', async (request, reply) => reply.view('books', { books: ['Dune', 'Emma'], page: request.query.page }));
  app.get('/visits', async (request) => {
    const visits = (request.session.get('visits') || 0) + 1;
    request.session.set('visits', visits);
    return { visits };
  });
  app.get('/me', async (request) => ({ user: request.session.get('user') ?? null }));
  app.post('/notes', async (request, reply) => reply.redirect(`/notes/${encodeURIComponent(request.body.title)}`));
  app.get('/notes/:title', async (request) => ({ title: request.params.title, tags: request.query.tag ?? null }));
  app.post('/api', async (request) => ({ got: request.body }));
  await app.ready();
  return app;
}

describe('TestClient', () => {
  it('keeps the cookies of its session; another client has its own', async () => {
    const app = await makeApp();
    const one = new xufa.TestClient(app);
    const other = new xufa.TestClient(app);
    await one.get('/visits');
    expect((await one.get('/visits')).json()).toEqual({ visits: 2 });
    expect((await other.get('/visits')).json()).toEqual({ visits: 1 });
    one.logout();
    expect((await one.get('/visits')).json()).toEqual({ visits: 1 });
    await app.close();
  });

  it('the views a response rendered, their context, and the text a reader sees', async () => {
    const app = await makeApp();
    const client = new xufa.TestClient(app);
    const res = await client.get('/books', { page: 2 });
    expect(res.templates).toEqual(['books']);
    expect(res.context.books).toEqual(['Dune', 'Emma']);
    expect(res.context.page).toBe('2');
    expect(res.textContent).toBe('Library Dune & co Emma & co');
    expect((await client.get('/visits')).templates).toEqual([]);
    await app.close();
  });

  it('writes carry the CSRF token of the session (unless enforceCsrfChecks); redirects followed', async () => {
    const app = await makeApp();
    const client = new xufa.TestClient(app);
    await client.get('/visits'); // a session
    const res = await client.post('/notes', { title: 'a b', tag: ['x'] }, { follow: true });
    expect(res.json()).toEqual({ title: 'a b', tags: null });
    expect(res.redirectChain).toEqual([['/notes/a%20b', 302]]);
    const strict = new xufa.TestClient(app, { enforceCsrfChecks: true });
    await strict.get('/visits');
    expect((await strict.post('/notes', { title: 'x' })).statusCode).toBe(403);
    // JSON bodies.
    expect((await client.post('/api', { a: [1, 2] }, { json: true })).json()).toEqual({ got: { a: [1, 2] } });
    await app.close();
  });

  it('login(credentials) and forceLogin(user), with the accounts of the app', async () => {
    const app = await makeApp();
    const client = new xufa.TestClient(app);
    expect(await client.login({ username: 'ada', password: 'wrong' })).toBe(false);
    expect((await client.get('/me')).json()).toEqual({ user: null });
    expect(await client.login({ username: 'ada', password: 'right-horse-battery' })).toBe(true);
    expect((await client.get('/me')).json()).toEqual({ user: 7 });
    // A write right after the login: its token is that of the new session.
    expect((await client.post('/notes', { title: 'n' })).statusCode).toBe(302);
    const forced = new xufa.TestClient(app);
    await forced.forceLogin(USERS[0]);
    expect((await forced.get('/me')).json()).toEqual({ user: 7 });
    await app.close();
    await expect(new xufa.TestClient(xufa()).forceLogin({})).rejects.toThrow('forceLogin needs the accounts');
  });
});
