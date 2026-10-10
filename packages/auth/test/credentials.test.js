import * as auth from '../index.js';

const { Credentials, CredentialError } = auth;
const PASSWORDS = { ln: 4 };

// A session as @xufa/session gives it: get, set, delete.
function sessionOf() {
  const values = new Map();
  return { get: (key) => values.get(key), set: (key, value) => values.set(key, value), delete: (key) => values.delete(key) };
}

async function setUp(options = {}) {
  const hash = await auth.hashPassword('right-horse-battery', PASSWORDS);
  const users = [
    { id: 1, email: 'ada@example.com', password: hash, totpSecret: null, recovery: [], active: true, staff: true },
    { id: 2, email: 'bob@example.com', password: hash, totpSecret: null, recovery: [], active: true, staff: false },
  ];
  const find = (email) => users.find((user) => user.email === email) || null;
  const credentials = new Credentials({
    findUser: find,
    totp: (user) => user.totpSecret,
    setPassword: (user, password) => Object.assign(user, { password }),
    setTotp: (user, totpSecret) => Object.assign(user, { totpSecret }),
    recoveryCodes: (user) => user.recovery,
    setRecoveryCodes: (user, recovery) => Object.assign(user, { recovery }),
    active: (user) => user.active,
    passwordOptions: PASSWORDS,
    lockout: { maxAttempts: 3 },
    ...options,
  });
  return { credentials, users, find };
}

const reasonOf = (promise) =>
  promise.then(
    () => 'ok',
    (err) => {
      if (!(err instanceof CredentialError)) throw err;
      return err.reason;
    }
  );

describe('Credentials', () => {
  it('a login: the user, the same answer for wrong users and passwords, nothing counted without a password', async () => {
    const { credentials, find } = await setUp();
    expect(await credentials.login({ identifier: ' ada@example.com ', password: 'right-horse-battery' })).toBe(
      find('ada@example.com')
    );
    expect(await reasonOf(credentials.login({ identifier: 'ada@example.com', password: 'nope' }))).toBe('invalid');
    expect(await reasonOf(credentials.login({ identifier: 'who@example.com', password: 'nope' }))).toBe('invalid');
    expect(await reasonOf(credentials.login({ identifier: 'ada@example.com' }))).toBe('missing');
    // The third failure of the user (the one without a password is not one) locks it, the right password too.
    expect(await reasonOf(credentials.login({ identifier: 'ada@example.com', password: 'nope' }))).toBe('invalid');
    expect(await reasonOf(credentials.login({ identifier: 'ADA@example.com', password: 'nope' }))).toBe('invalid');
    const locked = await credentials.login({ identifier: 'ada@example.com', password: 'right-horse-battery' }).catch((err) => err);
    expect([locked.reason, locked.statusCode, locked.retryAfter > 0]).toEqual(['throttled', 429, true]);
  });

  it('allow() refuses as a wrong password; active() says the account is locked, once the password is right', async () => {
    const { credentials, find } = await setUp({ allow: (user) => user.staff, lockout: false });
    expect(await reasonOf(credentials.login({ identifier: 'bob@example.com', password: 'right-horse-battery' }))).toBe(
      'invalid'
    );
    find('ada@example.com').active = false;
    const err = await credentials.login({ identifier: 'ada@example.com', password: 'right-horse-battery' }).catch((e) => e);
    expect([err.reason, err.statusCode, err.message]).toEqual(['locked', 403, 'This account is locked']);
    expect(await reasonOf(credentials.login({ identifier: 'ada@example.com', password: 'wrong' }))).toBe('invalid');
  });

  it('failures by address, with a limit of their own', async () => {
    const { credentials } = await setUp({ lockout: false, ipLockout: { maxAttempts: 2 } });
    const from = (ip, identifier) => reasonOf(credentials.login({ identifier, password: 'nope', ip }));
    expect([await from('10.0.0.1', 'ada@example.com'), await from('10.0.0.1', 'bob@example.com')]).toEqual([
      'invalid',
      'invalid',
    ]);
    expect(await from('10.0.0.1', 'eve@example.com')).toBe('throttled');
    expect(await from('10.0.0.2', 'eve@example.com')).toBe('invalid');
  });

  it('an authenticator app set up with its QR code, its codes once, recovery codes once', async () => {
    const steps = {};
    const { credentials, find } = await setUp({
      lastTotpStep: (user) => steps[user.id],
      onTotp: (user, step) => {
        steps[user.id] = step;
      },
    });
    const ada = find('ada@example.com');
    const session = sessionOf();
    expect(await reasonOf(credentials.startTotp(ada, { password: 'nope', label: ada.email, session }))).toBe(
      'wrongPassword'
    );
    const started = await credentials.startTotp(ada, {
      password: 'right-horse-battery',
      label: ada.email,
      issuer: 'Library',
      session,
    });
    expect(started.uri).toBe(`otpauth://totp/Library:ada%40example.com?secret=${started.secret}&issuer=Library`);
    expect(started.svg).toMatch(/^<svg/);
    expect(ada.totpSecret).toBe(null);
    // Another user cannot confirm it; a wrong code says so by field.
    expect(await reasonOf(credentials.confirmTotp(find('bob@example.com'), { code: '1', session }))).toBe('pending');
    const wrong = await credentials.confirmTotp(ada, { code: '000000', session }).catch((err) => err);
    expect(wrong.errors).toEqual({ code: ['Wrong code'] });
    const { recoveryCodes } = await credentials.confirmTotp(ada, { code: auth.totp(started.secret), session });
    expect([ada.totpSecret, recoveryCodes.length, ada.recovery.length]).toEqual([started.secret, 10, 10]);
    expect(ada.recovery).not.toContain(recoveryCodes[0]);
    expect(await credentials.state(ada)).toEqual({
      password: true,
      totp: { can: true, enabled: true },
      recovery: { left: 10 },
    });

    // The login asks for the code (a recovery code works too), each code once.
    const login = (code) => credentials.login({ identifier: 'ada@example.com', password: 'right-horse-battery', code });
    const asked = await login().catch((err) => err);
    expect([asked.reason, asked.needsCode, asked.recovery]).toEqual(['code', true, true]);
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(await reasonOf(login(recoveryCodes[0]))).toBe('ok');
    expect(await reasonOf(login(recoveryCodes[0]))).toBe('wrongCode');
    expect(ada.recovery).toHaveLength(9);

    const renewed = await credentials.renewRecoveryCodes(ada, { password: 'right-horse-battery' });
    expect(await reasonOf(login(recoveryCodes[1]))).toBe('wrongCode');
    expect(await reasonOf(login(renewed.recoveryCodes[1]))).toBe('ok');
    await credentials.disableTotp(ada, { password: 'right-horse-battery' });
    expect([ada.totpSecret, ada.recovery]).toEqual([null, []]);
    expect(await reasonOf(login())).toBe('ok');
    expect(await reasonOf(credentials.renewRecoveryCodes(ada, { password: 'right-horse-battery' }))).toBe('noTotp');
  });

  it('a new password: the one now (its failures locked out), its rules; rehashed at a login with other options', async () => {
    const { credentials, find } = await setUp({ checkPassword: (password) => (password.includes('1234') ? 'Too easy' : null) });
    const ada = find('ada@example.com');
    const change = (current, password) => credentials.changePassword(ada, { current, password, email: ada.email });
    const errorsOf = (promise) => promise.then(() => null, (err) => err.errors);
    expect(await errorsOf(change('nope', 'a-new-long-one'))).toEqual({ current: ['Not your password'] });
    expect(await errorsOf(change('right-horse-battery', 'short'))).toEqual({ password: ['At least 8 characters'] });
    expect(await errorsOf(change('right-horse-battery', 'right-horse-battery'))).toEqual({ password: ['The same as before'] });
    // The local part of the email (4 characters or more) is not in it.
    const withEmail = credentials.changePassword(ada, {
      current: 'right-horse-battery',
      password: 'my-lovelace-pass',
      email: 'lovelace@example.com',
    });
    expect(await errorsOf(withEmail)).toEqual({
      password: ['It cannot have your email in it'],
    });
    expect(await errorsOf(change('right-horse-battery', 'password-1234'))).toEqual({ password: ['Too easy'] });
    await change('right-horse-battery', 'a-new-long-one');
    expect(await auth.verifyPassword('a-new-long-one', ada.password)).toBe(true);
    // Three wrong passwords (the right one cleared those before) lock the changes of the account.
    for (let i = 0; i < 3; i += 1) await errorsOf(change('nope', 'whatever-else'));
    expect(await reasonOf(change('a-new-long-one', 'yet-another-one'))).toBe('throttled');

    // A hash made with other options is made again at the login.
    const stronger = new Credentials({
      findUser: () => ada,
      setPassword: (user, password) => Object.assign(user, { password }),
      passwordOptions: { ln: 5 },
    });
    const before = ada.password;
    await stronger.login({ identifier: 'ada@example.com', password: 'a-new-long-one' });
    expect(ada.password).not.toBe(before);
    expect(auth.needsRehash(ada.password, { ln: 5 })).toBe(false);
  });

  it('messages of its own; wrong options; what cannot be done here', async () => {
    const { credentials } = await setUp({ messages: { invalid: 'Wrong email or password' }, setTotp: undefined });
    const err = await credentials.login({ identifier: 'ada@example.com', password: 'nope' }).catch((e) => e);
    expect(err.message).toBe('Wrong email or password');
    expect(await reasonOf(credentials.startTotp({ id: 1 }, {}))).toBe('noApps');
    expect(() => new Credentials({ findUser: 'nope' })).toThrow('findUser of the credentials is a function');
    expect(() => new Credentials({ findUser: () => null, recoveryCodes: () => [] })).toThrow('together');
    await expect(new Credentials({}).login({ identifier: 'a', password: 'b' })).rejects.toThrow('findUser');
  });
});
