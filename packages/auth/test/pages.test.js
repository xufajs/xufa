// The pages of the accounts (Django's django.contrib.auth.urls): log in (by username, to next), log out, change the
// password, and reset it with a link by email; pages of their own, or the app's templates (registration/*).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import xufa from '@xufa/http';
import * as template from '@xufa/template';
import { sessionPlugin } from '@xufa/session';
import * as auth from '../index.js';

const PASSWORDS = { ln: 4 };

async function makeApp({ views = null, pages = {} } = {}) {
  const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
  const users = [{ id: 1, username: 'ada', email: 'ada@example.com', password: hash }];
  const sent = [];
  const app = xufa();
  app.register(xufa.formBody);
  app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', csrf: true });
  app.register(auth.accounts, {
    secret: 'a secret of the accounts, 32 chars or more',
    loginBy: 'username',
    users: {
      findByUsername: (username) => users.find((user) => user.username === username) || null,
      findByEmail: (email) => users.find((user) => user.email === email) || null,
      findById: (id) => users.find((user) => String(user.id) === String(id)) || null,
      setPassword: (user, password) => {
        users.find((item) => item.id === user.id).password = password;
      },
    },
    passwordOptions: PASSWORDS,
    lockout: false,
    loginUrl: '/accounts/login/',
    mailer: { send: (mail) => sent.push(mail) },
  });
  if (views) app.register(template.plugin, { root: views });
  app.register(auth.pages, { prefix: '/accounts', views: views ? 'registration' : null, ...pages });
  app.get('/mine', { preHandler: (request, reply) => app.accounts.loginRequired(request, reply) }, async () => 'mine');
  await app.ready();
  // A browser: its cookie, and the CSRF token of the last page.
  const browser = () => {
    let cookie = '';
    let csrf = '';
    const send = async (options) => {
      const res = await app.inject({ ...options, headers: { ...(cookie ? { cookie } : {}), ...options.headers } });
      if (res.headers['set-cookie']) cookie = [].concat(res.headers['set-cookie'])[0].split(';')[0];
      const token = /name="_csrf" value="([^"]+)"/.exec(res.body);
      if (token) csrf = token[1];
      return res;
    };
    send.post = (url, payload) => send({ method: 'POST', url, payload: { _csrf: csrf, ...payload } });
    return send;
  };
  return { app, users, sent, browser };
}

describe('auth.pages', () => {
  it('log in by username: the form, its errors, then to next (a path of this site only)', async () => {
    const { app, browser } = await makeApp();
    const ada = browser();
    const page = await ada({ url: '/accounts/login/?next=/mine' });
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.body).toContain('<label for="id_username">Username:</label>');
    expect(page.body).toContain('name="next" value="/mine"');
    expect(page.body).not.toContain('id_code');
    const wrong = await ada.post('/accounts/login/', { username: 'ada', password: 'wrong-one', next: '/mine' });
    expect([wrong.statusCode, wrong.body]).toEqual([200, expect.stringContaining('Wrong user or password')]);
    const empty = await ada.post('/accounts/login/', { username: '', password: '' });
    expect(empty.body).toContain('This field is required.');
    const res = await ada.post('/accounts/login/', { username: 'ada', password: 'right-horse-battery', next: '/mine' });
    expect([res.statusCode, res.headers.location]).toEqual([302, '/mine']);
    expect((await ada({ url: '/mine' })).body).toBe('mine');
    // Another site is not a next.
    const other = browser();
    await other({ url: '/accounts/login/' });
    const away = await other.post('/accounts/login/', {
      username: 'ada',
      password: 'right-horse-battery',
      next: '//evil.example/',
    });
    expect(away.headers.location).toBe('/');
    await app.close();
  });

  it('log out: POST only, then the page that says so (or logoutRedirectUrl)', async () => {
    const { app, browser } = await makeApp();
    const ada = browser();
    await ada({ url: '/accounts/login/' });
    await ada.post('/accounts/login/', { username: 'ada', password: 'right-horse-battery' });
    expect((await ada({ url: '/accounts/logout/' })).statusCode).toBe(404);
    // A page of the logged-in user (its form of logout carries the token, which the login renewed).
    await ada({ url: '/accounts/password_change/' });
    const out = await ada.post('/accounts/logout/', {});
    expect(out.body).toContain('Logged out');
    expect((await ada({ url: '/mine' })).statusCode).toBe(302);
    await app.close();
    const other = await makeApp({ pages: { logoutRedirectUrl: '/bye' } });
    const bob = other.browser();
    await bob({ url: '/accounts/login/' });
    expect((await bob.post('/accounts/logout/', {})).headers.location).toBe('/bye');
    await other.app.close();
  });

  it('change the password: a user only; the old one, the new one twice', async () => {
    const { app, browser } = await makeApp();
    expect((await app.inject('/accounts/password_change/')).headers.location).toBe(
      '/accounts/login/?next=%2Faccounts%2Fpassword_change%2F'
    );
    const ada = browser();
    await ada({ url: '/accounts/login/' });
    await ada.post('/accounts/login/', { username: 'ada', password: 'right-horse-battery' });
    await ada({ url: '/accounts/password_change/' });
    const differ = await ada.post('/accounts/password_change/', {
      oldPassword: 'right-horse-battery',
      newPassword1: 'a-new-password',
      newPassword2: 'another-one',
    });
    expect(differ.body).toContain("The two password fields didn&#39;t match.");
    const wrong = await ada.post('/accounts/password_change/', {
      oldPassword: 'nope',
      newPassword1: 'a-new-password',
      newPassword2: 'a-new-password',
    });
    expect(wrong.body).toContain('Not your password');
    const res = await ada.post('/accounts/password_change/', {
      oldPassword: 'right-horse-battery',
      newPassword1: 'a-new-password',
      newPassword2: 'a-new-password',
    });
    expect(res.headers.location).toBe('/accounts/password_change/done/');
    expect((await ada({ url: '/accounts/password_change/done/' })).body).toContain('Your password was changed.');
    await app.close();
  });

  it('reset the password: the same answer for every email, a link to the confirm page, once', async () => {
    const { app, browser, sent } = await makeApp({ pages: { siteUrl: 'https://library.example/' } });
    const visitor = browser();
    await visitor({ url: '/accounts/password_reset/' });
    const nobody = await visitor.post('/accounts/password_reset/', { email: 'nobody@example.com' });
    expect(nobody.headers.location).toBe('/accounts/password_reset/done/');
    expect(sent).toHaveLength(0);
    await visitor.post('/accounts/password_reset/', { email: 'ada@example.com' });
    expect(sent).toHaveLength(1);
    const link = sent[0].with.url;
    expect(link).toMatch(/^https:\/\/library\.example\/accounts\/reset\/[^/]+\/$/);
    const confirm = new URL(link).pathname;
    expect((await visitor({ url: confirm })).body).toContain('Please enter your new password twice');
    const weak = await visitor.post(confirm, { newPassword1: 'short', newPassword2: 'short' });
    expect(weak.body).toContain('At least 8 characters');
    const res = await visitor.post(confirm, { newPassword1: 'a-new-password', newPassword2: 'a-new-password' });
    expect(res.headers.location).toBe('/accounts/reset/done/');
    expect((await visitor({ url: '/accounts/reset/done/' })).body).toContain('Your password has been set.');
    expect((await visitor({ url: confirm })).body).toContain('Password reset unsuccessful');
    expect((await visitor({ url: '/accounts/reset/nonsense/' })).body).toContain('Password reset unsuccessful');
    await app.close();
  });

  it("the app's templates (views), with Django's names and context; named routes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xufa-auth-pages-'));
    try {
      fs.mkdirSync(path.join(root, 'registration'));
      fs.writeFileSync(
        path.join(root, 'registration', 'login.html'),
        '<h1>Library login</h1><form method="post"><input type="hidden" name="_csrf" value="{{ csrfToken }}">{{{ form.asP() }}}<input type="hidden" name="next" value="{{ next }}"></form>{{ url("password_reset") }}'
      );
      const { app, browser } = await makeApp({ views: root });
      const ada = browser();
      const page = await ada({ url: '/accounts/login/?next=/mine' });
      expect(page.body).toContain('<h1>Library login</h1>');
      expect(page.body).toContain('/accounts/password_reset/');
      const res = await ada.post('/accounts/login/', { username: 'ada', password: 'right-horse-battery', next: '/mine' });
      expect(res.headers.location).toBe('/mine');
      expect(app.reverse('password_reset_confirm', ['abc'])).toBe('/accounts/reset/abc/');
      await app.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('needs the accounts first', async () => {
    const app = xufa();
    app.register(auth.pages);
    await expect(app.ready()).rejects.toThrow('auth.pages needs auth.accounts, registered before it');
  });
});
