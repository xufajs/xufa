// The accounts of a site with pages: loginRequired (to the login page with ?next=, 401 for JSON clients),
// permissionRequired (403), the permissions of users (roles of an Rbac and their own), and the user and its permissions
// in every template.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import { sessionPlugin } from '@xufa/session';
import * as template from '@xufa/template';
import * as auth from '../index.js';

const views = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-accounts-views-'));
fs.writeFileSync(path.join(views, 'home.html'), '{{ user ? user.email : "anonymous" }}|{{ perms.has("Book.add") }}|{{ perms.has("Book.delete") }}');
afterAll(() => fs.rmSync(views, { recursive: true, force: true }));

const PASSWORDS = { ln: 4 };

async function makeApp() {
  const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
  const users = [
    { id: 1, email: 'ada@example.com', password: hash, role: 'librarian', permissions: [] },
    { id: 2, email: 'bob@example.com', password: hash, role: null, permissions: ['Book.add'] },
  ];
  const app = xufa();
  app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
  // The accounts before the templates: the user still reaches them.
  app.register(auth.accounts, {
    secret: 'a secret of the accounts, 32 chars or more',
    users: {
      findByEmail: (email) => users.find((user) => user.email === email) || null,
      findById: (id) => users.find((user) => String(user.id) === String(id)) || null,
    },
    passwordOptions: PASSWORDS,
    lockout: false,
    loginUrl: '/accounts/login/',
    rbac: { roles: { librarian: ['Book.*'] } },
  });
  app.register(template.plugin, { root: views });
  app.get('/home', async (request, reply) => reply.view('home'));
  app.get('/mine', { preHandler: (request, reply) => app.accounts.loginRequired(request, reply) }, async () => 'mine');
  app.register(async (books) => {
    books.get('/books/new', { preHandler: books.accounts.permissionRequired('Book.add') }, async () => 'new');
    books.get('/books/delete', { preHandler: books.accounts.permissionRequired('Book.add', 'Book.delete') }, async () => 'gone');
  });
  await app.ready();
  // A browser: its cookie kept.
  const browser = () => {
    let cookie = '';
    const send = async (options) => {
      const res = await app.inject({ ...options, headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
      if (res.headers['set-cookie']) cookie = [].concat(res.headers['set-cookie'])[0].split(';')[0];
      return res;
    };
    send.login = (email) => send({ method: 'POST', url: '/account/login', payload: { email, password: 'right-horse-battery' } });
    return send;
  };
  return { app, users, browser };
}

const HTML = { accept: 'text/html,application/xhtml+xml' };

describe('accounts of pages', () => {
  it('loginRequired: a page goes to the login with ?next=, a JSON client gets 401, a user goes on', async () => {
    const { browser } = await makeApp();
    const anonymous = browser();
    const page = await anonymous({ url: '/mine?x=1', headers: HTML });
    expect([page.statusCode, page.headers.location]).toEqual([302, '/accounts/login/?next=%2Fmine%3Fx%3D1']);
    expect((await anonymous({ url: '/mine', headers: { accept: 'application/json' } })).statusCode).toBe(401);
    // No Accept: a page (Django's login_required).
    expect((await anonymous({ url: '/mine' })).statusCode).toBe(302);
    const ada = browser();
    await ada.login('ada@example.com');
    expect((await ada({ url: '/mine', headers: HTML })).body).toBe('mine');
  });

  it('permissionRequired: the permissions of the roles and of the user; 403 without them', async () => {
    const { browser } = await makeApp();
    expect((await browser()({ url: '/books/new', headers: HTML })).statusCode).toBe(302);
    const ada = browser();
    await ada.login('ada@example.com');
    expect((await ada({ url: '/books/new' })).body).toBe('new');
    expect((await ada({ url: '/books/delete' })).body).toBe('gone');
    const bob = browser();
    await bob.login('bob@example.com');
    expect((await bob({ url: '/books/new' })).body).toBe('new');
    const refused = await bob({ url: '/books/delete' });
    expect([refused.statusCode, refused.json().message]).toEqual([403, 'You cannot do this (Book.delete)']);
  });

  it('the user and its permissions in every template; can() and perms()', async () => {
    const { app, users, browser } = await makeApp();
    expect((await browser()({ url: '/home' })).body).toBe('anonymous|false|false');
    const ada = browser();
    await ada.login('ada@example.com');
    expect((await ada({ url: '/home' })).body).toBe('ada@example.com|true|true');
    const bob = browser();
    await bob.login('bob@example.com');
    expect((await bob({ url: '/home' })).body).toBe('bob@example.com|true|false');
    expect([await app.accounts.can(users[1], 'Book.add'), await app.accounts.can(users[1], 'Book.delete')]).toEqual([true, false]);
    expect(() => app.accounts.permissionRequired()).toThrow('names of permissions');
  });
});
