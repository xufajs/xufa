// AbstractUser: the model of users of django.contrib.auth (its fields, passwords, permissions, createUser and
// createSuperuser), and the accounts of a model (users of it, logins by username, the last login).
import xufa from '@xufa/http';
import { Database, Model, fields } from '@xufa/orm';
import { sessionPlugin, memoryStore } from '@xufa/session';
import * as auth from '../index.js';

const PASSWORDS = { ln: 4 };

class Member extends auth.AbstractUser(Model, fields, { passwordOptions: PASSWORDS, email: { unique: true } }) {
  static fields = { ...super.fields, nickname: fields.string({ null: true }) };

  static options = { table: 'user_test_member' };
}

let db;
beforeAll(async () => {
  db = new Database({ backend: 'memory' }).register(Member);
  await db.sync();
});
afterAll(() => db.close());

describe('AbstractUser', () => {
  it('the fields of Django\'s users, its own fields too, and createUser / createSuperuser', async () => {
    const names = Member.meta.fields.map((field) => field.name);
    expect(names).toEqual(
      expect.arrayContaining(['username', 'email', 'password', 'firstName', 'lastName', 'isStaff', 'isSuperuser', 'isActive', 'dateJoined', 'lastLogin', 'role', 'permissions', 'nickname'])
    );
    expect(Member.userModel).toBe(true);
    const admin = await Member.createSuperuser({ username: 'admin', email: 'admin@example.com', password: 'a long password' });
    expect([String(admin), admin.isStaff, admin.isSuperuser, admin.isActive, admin.password.startsWith('$scrypt$')]).toEqual(['admin', true, true, true, true]);
    expect([await admin.checkPassword('a long password'), await admin.checkPassword('wrong')]).toEqual([true, false]);
    const ada = await Member.createUser({ username: 'ada', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', permissions: ['Book.add'] });
    expect([ada.hasUsablePassword, await ada.checkPassword(''), ada.fullName, ada.shortName]).toEqual([false, false, 'Ada Lovelace', 'Ada']);
    expect([ada.hasPerm('Book.add'), ada.hasPerm('Book.delete'), admin.hasPerm('anything')]).toEqual([true, false, true]);
    ada.isActive = false;
    expect(ada.hasPerm('Book.add')).toBe(false);
    const wrong = await Member.createUser({ username: 'no spaces', email: 'x@example.com' }).catch((err) => err);
    expect(wrong.errors).toEqual({ username: ['Enter a valid username.'] });
    await expect(Member.createUser({ username: 'other', email: 'admin@example.com' })).rejects.toThrow(/email/);
    await expect(admin.setPassword('')).rejects.toThrow('a password');
    expect(() => auth.AbstractUser({}, {})).toThrow('the Model and the fields of @xufa/orm');
  });

  it('log out everywhere: the generation in the row of the user, read with it (not apart in the store at each request)', async () => {
    await Member.createUser({ username: 'linus', email: 'linus@example.com', password: 'kernel-hacker-1991' });
    const memory = memoryStore();
    const userReads = [];
    const store = { ...memory, get: (id) => (id.startsWith('user:') && userReads.push(id), memory.get(id)) };
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more', store });
    app.register(auth.accounts, {
      secret: 'a secret of the accounts, 32 chars or more',
      model: Member,
      loginBy: 'username',
      passwordOptions: PASSWORDS,
      lockout: false,
    });
    app.get('/who', async (request, reply) => {
      await app.accounts.required(request, reply);
      return reply.sent ? undefined : { username: request.account.username };
    });
    await app.ready();
    const cookieOf = (res) => [].concat(res.headers['set-cookie'] || [])[0].split(';')[0];
    const logIn = async () =>
      cookieOf(await app.inject({ method: 'POST', url: '/account/login', payload: { username: 'linus', password: 'kernel-hacker-1991' } }));
    const phone = await logIn();
    const laptop = await logIn();
    userReads.length = 0;
    expect((await app.inject({ url: '/who', headers: { cookie: laptop } })).json()).toEqual({ username: 'linus' });
    expect(userReads).toEqual([]);
    // The phone logs out everywhere: the row's generation is raised, and the laptop is logged out at once.
    const out = await app.inject({ method: 'POST', url: '/account/logout', headers: { cookie: phone }, payload: { everywhere: true } });
    expect(out.statusCode).toBe(200);
    expect((await Member.objects.get({ username: 'linus' })).sessionGeneration).toBe(1);
    expect((await app.inject({ url: '/who', headers: { cookie: laptop } })).statusCode).toBe(401);
    // A login after it is of the new generation.
    const again = await logIn();
    // (a login reads the record of the user in the store: its list of sessions; requests do not)
    userReads.length = 0;
    expect((await app.inject({ url: '/who', headers: { cookie: again } })).statusCode).toBe(200);
    expect(userReads).toEqual([]);
  });

  it('accounts of a model: logins by username, inactive users locked, the last login set', async () => {
    await Member.createUser({ username: 'grace', email: 'grace@example.com', password: 'cobol-forever-1959' });
    await Member.createUser({ username: 'gone', email: 'gone@example.com', password: 'cobol-forever-1959', isActive: false });
    const app = xufa();
    app.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
    app.register(auth.accounts, {
      secret: 'a secret of the accounts, 32 chars or more',
      model: Member,
      loginBy: 'username',
      passwordOptions: PASSWORDS,
      lockout: false,
    });
    await app.ready();
    const login = (payload) => app.inject({ method: 'POST', url: '/account/login', payload });
    const ok = await login({ username: 'grace', password: 'cobol-forever-1959' });
    expect([ok.statusCode, ok.json().user.email]).toEqual([200, 'grace@example.com']);
    expect((await Member.objects.get({ username: 'grace' })).lastLogin).toBeInstanceOf(Date);
    expect((await login({ username: 'gone', password: 'cobol-forever-1959' })).json()).toMatchObject({ statusCode: 403, locked: true });
    expect((await login({ password: 'x' })).json().errors).toEqual({ username: ['A username'], password: [] });
    const wrongApp = xufa();
    wrongApp.register(sessionPlugin, { secret: 'a secret of thirty two characters or more' });
    wrongApp.register(auth.accounts, { secret: 'a secret of the accounts, 32 chars or more', model: Member, loginBy: 'phone' });
    await expect(wrongApp.ready()).rejects.toThrow("loginBy of accounts is 'email' or 'username'");
    await app.close();
  });
});
