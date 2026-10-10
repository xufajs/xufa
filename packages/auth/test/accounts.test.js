// The accounts of an app with sessions (accounts): sign up (the password policy, emails taken, look-alikes too), log
// in (the same answer for wrong emails and passwords, lockouts, codes of authenticator apps, rehashes), the user of a
// request and the hook of routes that need one, log out of one session or every one, reset the password with a link
// sent by email (the same answer for every email; the link works once, and ends every session), change it (the other
// sessions end), and verify the email.
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { sessionPlugin } from '@xufa/session';
import { Mailer, mailFields } from '@xufa/mail';
import * as auth from '../index.js';

const FAST = { ln: 4 };
const SECRET = 'a secret of the accounts, 32 chars or more';

class Email extends Model {
  static fields = mailFields(fields);
}
class Member extends Model {
  static fields = {
    email: fields.string({ unique: true }),
    emailSkeleton: fields.string({ null: true }),
    name: fields.string({ null: true }),
    password: fields.string(),
    emailVerifiedAt: fields.datetime({ null: true }),
    totpSecret: fields.string({ null: true }),
    recoveryCodes: fields.json({ default: () => [] }),
  };
}

let mail;
let db;
beforeAll(async () => {
  mail = new Database({ backend: 'memory-mail', from: 'App <app@example.com>' }).register(Email);
  db = new Database({ backend: 'memory' }).register(Member);
  await mail.connect();
  await db.sync();
});
afterAll(async () => {
  await mail.close();
  await db.close();
});
beforeEach(async () => {
  await Email.objects.delete();
  await Member.objects.delete();
});

async function makeApp(options = {}) {
  const app = xufa();
  app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', ...options.session });
  app.register(auth.accounts, {
    secret: SECRET,
    users: {
      findByEmail: (email) => Member.objects.filter({ email }).first(),
      findBySkeleton: (key) => Member.objects.filter({ emailSkeleton: key }).first(),
      findById: (id) => Member.objects.filter({ pk: id }).first(),
      create: (values) => Member.objects.create(values),
      setPassword: (user, hash) => Member.objects.filter({ pk: user.pk }).update({ password: hash }),
      markVerified: (user) => Member.objects.filter({ pk: user.pk }).update({ emailVerifiedAt: new Date() }),
      setTotp: (user, secret) => Member.objects.filter({ pk: user.pk }).update({ totpSecret: secret }),
      setRecoveryCodes: (user, hashes) => Member.objects.filter({ pk: user.pk }).update({ recoveryCodes: hashes }),
    },
    recoveryCodes: (user) => user.recoveryCodes,
    signup: { fields: ['name'] },
    totp: (user) => user.totpSecret,
    passwordOptions: FAST,
    lockout: { maxAttempts: 3 },
    mailer: new Mailer({ model: Email, layout: false }),
    links: {
      reset: (token) => `https://app.example/reset?token=${token}`,
      verify: (token) => `https://app.example/verify?token=${token}`,
    },
    app: { name: 'App' },
    ...options.accounts,
  });
  app.get('/dashboard', { preHandler: (request, reply) => app.accounts.required(request, reply) }, (request) => ({
    hello: request.account.name,
  }));
  await app.ready();
  return app;
}

// A browser: its cookie kept.
function browserOf(app) {
  let cookie = null;
  return async (request) => {
    const res = await app.inject({ ...request, headers: { ...(cookie ? { cookie } : {}), ...request.headers } });
    const set = res.headers['set-cookie'];
    if (set) {
      const value = [].concat(set)[0].split(';')[0];
      cookie = value.endsWith('=') ? null : value;
    }
    return res;
  };
}

const tokenOf = (email) => /token=([\w.-]+)/.exec(email.text)[1];
const signUp = (send, payload) => send({ method: 'POST', url: '/account/signup', payload });

describe('accounts', () => {
  it('sign up: logged in, a link to verify the email; the password policy; emails taken, also as look-alikes', async () => {
    const app = await makeApp();
    const send = browserOf(app);
    const res = await signUp(send, {
      email: '  Ada@Example.com ',
      password: 'right-horse-battery',
      name: 'Ada',
      role: 'admin',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ email: 'ada@example.com', verified: false });
    const ada = await Member.objects.get({ email: 'ada@example.com' });
    expect([ada.name, ada.role, ada.password.startsWith('$scrypt$')]).toEqual(['Ada', undefined, true]);
    expect(ada.emailSkeleton).toBeTruthy();
    expect((await send({ url: '/dashboard' })).json()).toEqual({ hello: 'Ada' });
    const [verify] = await Email.objects.all();
    expect([verify.to, verify.subject]).toEqual(['ada@example.com', 'Verify your email for App']);
    // Taken: the same email, and one that looks the same (a Cyrillic а).
    const other = browserOf(app);
    expect((await signUp(other, { email: 'ADA@example.com', password: 'another-long-one' })).json().errors).toEqual({
      email: ['There is an account with this email already'],
    });
    expect((await signUp(other, { email: 'аda@example.com', password: 'another-long-one' })).statusCode).toBe(400);
    // The policy.
    expect((await signUp(other, { email: 'bob@example.com', password: 'short' })).json().errors).toEqual({
      password: ['At least 8 characters'],
    });
    expect(
      (await signUp(other, { email: 'bobby@example.com', password: 'my-bobby-pass' })).json().errors.password
    ).toEqual(['It cannot have your email in it']);
    expect((await signUp(other, { email: 'not an email', password: 'whatever-long' })).json().errors.email).toEqual([
      'An email',
    ]);
    await app.close();
  });

  it('log in: the same answer for wrong emails and passwords, locked after failures, codes of authenticator apps', async () => {
    const app = await makeApp();
    await signUp(browserOf(app), { email: 'ada@example.com', password: 'right-horse-battery' });
    const send = browserOf(app);
    const login = (payload) => send({ method: 'POST', url: '/account/login', payload });
    const wrongPassword = await login({ email: 'ada@example.com', password: 'wrong-wrong' });
    const noUser = await login({ email: 'nobody@example.com', password: 'wrong-wrong' });
    expect([wrongPassword.statusCode, noUser.statusCode]).toEqual([401, 401]);
    expect(wrongPassword.json().error).toBe(noUser.json().error);
    expect((await send({ url: '/account/me' })).statusCode).toBe(401);
    const ok = await login({ email: 'ADA@example.com', password: 'right-horse-battery' });
    expect(ok.json().user.email).toBe('ada@example.com');
    expect((await send({ url: '/account/me' })).json().user.email).toBe('ada@example.com');
    // Three failures lock the email (the right password too, for a while).
    const locked = browserOf(app);
    for (let i = 0; i < 3; i += 1)
      await locked({
        method: 'POST',
        url: '/account/login',
        payload: { email: 'ada@example.com', password: 'nope-nope' },
      });
    const refused = await locked({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect([refused.statusCode, Number(refused.headers['retry-after']) > 0]).toEqual([429, true]);

    // An authenticator app: the code once the password is right.
    const secret = auth.generateSecret();
    await Member.objects.filter({ email: 'ada@example.com' }).update({ totpSecret: secret });
    const fresh = await makeApp({ accounts: { lockout: false } });
    const phone = browserOf(fresh);
    const first = await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect([first.statusCode, first.json().code]).toEqual([401, true]);
    const second = await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery', code: auth.totp(secret) },
    });
    expect(second.statusCode).toBe(200);
    await app.close();
    await fresh.close();
  });

  it('the email of a reset given as data (as in a file of configuration): its templates have link, email, user', async () => {
    const app = await makeApp({
      accounts: {
        mails: { reset: { subject: 'Reset on Library', text: 'For {{ email }} ({{ user.name }}): {{ link }}' } },
      },
    });
    await signUp(browserOf(app), { email: 'ada@example.com', password: 'right-horse-battery', name: 'Ada' });
    await Email.objects.delete();
    await browserOf(app)({ method: 'POST', url: '/account/password/forgot', payload: { email: 'ada@example.com' } });
    const [email] = await Email.objects.all();
    expect(email.subject).toBe('Reset on Library');
    expect(email.text).toMatch(/^For ada@example\.com \(Ada\): https:\/\/app\.example\/reset\?token=[\w.-]+$/);
    await app.close();
  });

  it('a password reset: the same answer for every email; the link works once and ends every session', async () => {
    const app = await makeApp();
    const laptop = browserOf(app);
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    await Email.objects.delete();
    const forgot = (email) => browserOf(app)({ method: 'POST', url: '/account/password/forgot', payload: { email } });
    const known = await forgot('ada@example.com');
    const unknown = await forgot('nobody@example.com');
    expect([known.statusCode, unknown.statusCode]).toEqual([202, 202]);
    expect(known.json()).toEqual(unknown.json());
    const emails = await Email.objects.all();
    expect(emails.map((email) => email.to)).toEqual(['ada@example.com']);
    expect(emails[0].subject).toBe('Reset your password of App');
    const token = tokenOf(emails[0]);
    const phone = browserOf(app);
    // Pages check the token before they show their form (validlink).
    expect((await app.accounts.checkResetToken(token)).email).toBe('ada@example.com');
    expect(await app.accounts.checkResetToken(`${token}x`)).toBe(null);
    expect(await app.accounts.checkResetToken(undefined)).toBe(null);
    await expect(app.accounts.resetPassword(token, 'short')).rejects.toMatchObject({
      statusCode: 400,
      errors: { password: ['At least 8 characters'] },
    });
    const reset = (payload) => phone({ method: 'POST', url: '/account/password/reset', payload });
    expect((await reset({ token, password: 'short' })).json().errors).toEqual({ password: ['At least 8 characters'] });
    expect((await reset({ token: `${token}x`, password: 'a-brand-new-password' })).statusCode).toBe(400);
    expect((await reset({ token, password: 'a-brand-new-password' })).json()).toEqual({ ok: true });
    // Once only: the password it replaced is gone.
    expect((await reset({ token, password: 'yet-another-password' })).statusCode).toBe(400);
    expect(await app.accounts.checkResetToken(token)).toBe(null);
    await expect(app.accounts.resetPassword(token, 'yet-another-password')).rejects.toMatchObject({
      errors: { token: ['Expired or used'] },
    });
    // Every session of the user ended; the new password logs in.
    expect((await laptop({ url: '/account/me' })).statusCode).toBe(401);
    const login = await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'a-brand-new-password' },
    });
    expect(login.statusCode).toBe(200);
    // A link of a token signed with another secret, or expired, is nothing.
    const other = await makeApp({ accounts: { secret: 'another secret of 32 characters or more!!', resetTtl: 1 } });
    const user = await Member.objects.get({ email: 'ada@example.com' });
    expect(
      (
        await browserOf(other)({
          method: 'POST',
          url: '/account/password/reset',
          payload: { token: app.accounts.resetLink(user).split('token=')[1], password: 'z-z-z-z-z-z-z-z' },
        })
      ).statusCode
    ).toBe(400);
    await app.close();
    await other.close();
  });

  it('a password change: the one now, then the other sessions end and this one goes on', async () => {
    const app = await makeApp();
    const laptop = browserOf(app);
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    const phone = browserOf(app);
    await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    const change = (payload) => laptop({ method: 'POST', url: '/account/password/change', payload });
    expect((await change({ current: 'wrong', password: 'a-new-password!' })).json().errors).toEqual({
      current: ['Not your password'],
    });
    expect((await change({ current: 'right-horse-battery', password: 'right-horse-battery' })).json().errors).toEqual({
      password: ['The same as before'],
    });
    expect((await change({ current: 'right-horse-battery', password: 'a-new-password!' })).json().ok).toBe(true);
    expect((await laptop({ url: '/account/me' })).statusCode).toBe(200);
    expect((await phone({ url: '/account/me' })).statusCode).toBe(401);
    expect((await browserOf(app)({ method: 'POST', url: '/account/password/change', payload: {} })).statusCode).toBe(
      401
    );
    await app.close();
  });

  it('an authenticator app: a QR code, confirmed by its first code; recovery codes at the login; removed', async () => {
    const app = await makeApp();
    const laptop = browserOf(app);
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    const post = (url, payload) => laptop({ method: 'POST', url: `/account${url}`, payload });
    expect((await laptop({ url: '/account/security' })).json()).toEqual({
      password: true,
      totp: { can: true, enabled: false },
      recovery: { left: 0 },
    });
    expect((await post('/totp/start', { password: 'nope' })).json().errors).toEqual({
      password: ['Not your password'],
    });
    const started = (await post('/totp/start', { password: 'right-horse-battery' })).json();
    expect(started.uri).toMatch(/^otpauth:\/\/totp\/App:ada%40example\.com\?secret=/);
    expect(started.svg).toMatch(/^<svg/);
    expect((await post('/totp/confirm', { code: '000000' })).json().errors).toEqual({ code: ['Wrong code'] });
    const { recoveryCodes } = (await post('/totp/confirm', { code: auth.totp(started.secret) })).json();
    expect(recoveryCodes).toHaveLength(10);
    expect((await laptop({ url: '/account/security' })).json().totp.enabled).toBe(true);

    // The login asks for the code, and says a recovery code works too; each recovery code once.
    const phone = browserOf(app);
    const login = (code) =>
      phone({
        method: 'POST',
        url: '/account/login',
        payload: { email: 'ada@example.com', password: 'right-horse-battery', code },
      });
    expect((await login()).json()).toMatchObject({ code: true, recovery: true });
    expect((await login(recoveryCodes[0])).statusCode).toBe(200);
    expect(
      (
        await browserOf(app)({
          method: 'POST',
          url: '/account/login',
          payload: { email: 'ada@example.com', password: 'right-horse-battery', code: recoveryCodes[0] },
        })
      ).statusCode
    ).toBe(401);
    expect((await laptop({ url: '/account/security' })).json().recovery).toEqual({ left: 9 });
    const renewed = (await post('/recovery-codes', { password: 'right-horse-battery' })).json().recoveryCodes;
    expect(renewed).toHaveLength(10);
    expect((await post('/totp/disable', { password: 'right-horse-battery' })).json()).toEqual({ ok: true });
    expect((await laptop({ url: '/account/security' })).json()).toMatchObject({
      totp: { enabled: false },
      recovery: { left: 0 },
    });
    expect((await post('/recovery-codes', { password: 'right-horse-battery' })).statusCode).toBe(400);
    // Logged out: 401.
    expect((await browserOf(app)({ method: 'POST', url: '/account/totp/start', payload: {} })).statusCode).toBe(401);
    await app.close();
  });

  it('the sessions of the user: its browsers listed (this one marked), another ended, not this one', async () => {
    const app = await makeApp();
    const laptop = browserOf(app);
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    const phone = browserOf(app);
    await phone({
      method: 'POST',
      url: '/account/login',
      headers: { 'user-agent': 'Phone/1.0' },
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    const { sessions } = (await laptop({ url: '/account/sessions' })).json();
    expect(sessions.map((item) => [item.agent, item.current]).sort()).toEqual([
      ['Phone/1.0', false],
      ['lightMyRequest', true],
    ]);
    const mine = sessions.find((item) => item.current);
    const theirs = sessions.find((item) => !item.current);
    expect((await laptop({ method: 'POST', url: `/account/sessions/${mine.handle}/end` })).statusCode).toBe(400);
    expect((await laptop({ method: 'POST', url: `/account/sessions/${theirs.handle}/end` })).json()).toEqual({
      ended: true,
    });
    expect((await phone({ url: '/account/me' })).statusCode).toBe(401);
    expect((await laptop({ method: 'POST', url: `/account/sessions/${theirs.handle}/end` })).statusCode).toBe(404);
    expect((await browserOf(app)({ url: '/account/sessions' })).statusCode).toBe(401);
    await app.close();
  });

  it('verifying the email: the link of the email it was sent to; another link; requireVerified', async () => {
    const app = await makeApp({ accounts: { requireVerified: true } });
    const send = browserOf(app);
    await signUp(send, { email: 'ada@example.com', password: 'right-horse-battery', name: 'Ada' });
    expect((await send({ url: '/dashboard' })).json()).toMatchObject({ verify: true });
    expect((await send({ method: 'POST', url: '/account/email/resend' })).statusCode).toBe(202);
    const emails = await Email.objects.all();
    expect(emails.length).toBe(2);
    const token = tokenOf(emails[1]);
    // A token of the email before (it changed): nothing.
    await Member.objects.filter({ email: 'ada@example.com' }).update({ email: 'ada@new.example' });
    expect((await send({ method: 'POST', url: '/account/email/verify', payload: { token } })).statusCode).toBe(400);
    await Member.objects.filter({ email: 'ada@new.example' }).update({ email: 'ada@example.com' });
    expect((await send({ method: 'POST', url: '/account/email/verify', payload: { token } })).json()).toEqual({
      ok: true,
    });
    expect((await send({ url: '/dashboard' })).json()).toEqual({ hello: 'Ada' });
    expect((await send({ url: '/account/me' })).json().user.verified).toBe(true);
    await app.close();
  });

  it('log out of this session, or of every one; with CSRF tokens of the session', async () => {
    const app = await makeApp({ session: { csrf: true } });
    const laptop = browserOf(app);
    const phone = browserOf(app);
    // A fresh session needs no token (there is nothing to forge yet).
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect((await phone({ url: '/account/me' })).statusCode).toBe(200);
    // Without the token of its session: refused.
    expect((await phone({ method: 'POST', url: '/account/logout', payload: { everywhere: true } })).statusCode).toBe(
      403
    );
    await app.close();

    const plain = await makeApp();
    const a = browserOf(plain);
    const b = browserOf(plain);
    await signUp(a, { email: 'bob@example.com', password: 'right-horse-battery' });
    await b({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'bob@example.com', password: 'right-horse-battery' },
    });
    await a({ method: 'POST', url: '/account/logout', payload: {} });
    expect([(await a({ url: '/account/me' })).statusCode, (await b({ url: '/account/me' })).statusCode]).toEqual([
      401, 200,
    ]);
    await a({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'bob@example.com', password: 'right-horse-battery' },
    });
    await a({ method: 'POST', url: '/account/logout', payload: { everywhere: true } });
    expect([(await a({ url: '/account/me' })).statusCode, (await b({ url: '/account/me' })).statusCode]).toEqual([
      401, 401,
    ]);
    await plain.close();
  });

  it('a locked account: no login, its sessions end at their next request; endSessions() ends them at once', async () => {
    const locked = new Set();
    const app = await makeApp({ accounts: { active: (user) => !locked.has(user.email) } });
    const laptop = browserOf(app);
    await signUp(laptop, { email: 'ada@example.com', password: 'right-horse-battery' });
    const phone = browserOf(app);
    await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    locked.add('ada@example.com');
    expect((await laptop({ url: '/account/me' })).statusCode).toBe(401);
    expect((await phone({ url: '/dashboard' })).statusCode).toBe(401);
    const refused = await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    expect([refused.statusCode, refused.json().locked]).toEqual([403, true]);
    // A wrong password says nothing of the lock.
    const wrong = await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'wrong-wrong' },
    });
    expect([wrong.statusCode, wrong.json().locked]).toEqual([401, undefined]);
    // Active again: it logs in again (the sessions forgot it).
    locked.delete('ada@example.com');
    expect((await laptop({ url: '/account/me' })).statusCode).toBe(401);
    await laptop({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    await phone({
      method: 'POST',
      url: '/account/login',
      payload: { email: 'ada@example.com', password: 'right-horse-battery' },
    });
    // endSessions(): every session at once (an admin locking it).
    await app.accounts.endSessions(await Member.objects.get({ email: 'ada@example.com' }));
    expect([
      (await laptop({ url: '/account/me' })).statusCode,
      (await phone({ url: '/account/me' })).statusCode,
    ]).toEqual([401, 401]);
    await app.close();
  });

  it('needs a secret, users.findByEmail and findById, and @xufa/session', async () => {
    await expect(makeApp({ accounts: { secret: 'short' } })).rejects.toThrow('a secret of 32 characters');
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
    app.register(auth.accounts, { secret: SECRET, users: { findByEmail: () => null } });
    await expect(app.ready()).rejects.toThrow('users.findById');
  });
});
