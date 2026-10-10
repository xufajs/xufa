// The credentials of the users of an app, in one place for every login of @xufa/auth (its JWT login route, the
// accounts plugin) and of @xufa/admin: checking a login (password, authenticator app or recovery code, lockouts by
// user and by address, the same answer and time for every wrong user or password, rehashing), and the account of a
// user logged in (a new password, an authenticator app set up with a QR code and removed, recovery codes). The app
// keeps its users: Credentials asks for them and for their changes.
//
//   const credentials = new Credentials({
//     findUser: (email) => User.objects.filter({ email }).first(),
//     totp: (user) => user.totpSecret,
//     setPassword: (user, hash) => User.objects.filter({ pk: user.pk }).update({ password: hash }),
//   });
//   const user = await credentials.login({ identifier: body.email, password: body.password, code: body.code, ip });
//
// Every refusal is a CredentialError: its reason (missing, invalid, code, wrongCode, locked, throttled,
// wrongPassword, weak, pending, unsupported, noTotp), statusCode, message (options.messages changes them), errors by
// field, needsCode and recovery (the code of an app is asked for, and a recovery code works too), and retryAfter.
import { hashPassword, verifyPassword, needsRehash } from './password.js';
import { generateSecret, verifyTotp, totpUri, generateRecoveryCodes, hashRecoveryCode } from './totp.js';
import { Lockout } from './lockout.js';
import { qrSvg } from './qr.js';
import { message, custom } from './messages.js';

// A recovery code: xxxx-xxxx (base32), the dash optional.
const RECOVERY = /^[a-z2-7]{4}-?[a-z2-7]{4}$/i;
// The secret of an app being set up, kept in the session until its first code confirms it, and for how long.
const PENDING_KEY = 'xufa.totp.pending';
const PENDING_LIFE = 10 * 60 * 1000;

class CredentialError extends Error {
  constructor(reason, message, statusCode, extra = {}) {
    super(message);
    this.name = 'CredentialError';
    this.reason = reason;
    this.statusCode = statusCode;
    this.errors = extra.errors || {};
    this.needsCode = Boolean(extra.needsCode);
    this.recovery = Boolean(extra.recovery);
    if (extra.retryAfter) this.retryAfter = extra.retryAfter;
  }
}

const lockoutOf = (given, maxAttempts) =>
  given === false || given === null
    ? null
    : given instanceof Lockout
      ? given
      : new Lockout({ maxAttempts, window: '15m', lockFor: '15m', ...given });

class Credentials {
  constructor(options = {}) {
    for (const name of [
      'findUser',
      'password',
      'totp',
      'lastTotpStep',
      'onTotp',
      'rehash',
      'allow',
      'active',
      'setPassword',
      'setTotp',
      'recoveryCodes',
      'setRecoveryCodes',
      'checkPassword',
      'id',
    ]) {
      if (options[name] !== undefined && options[name] !== null && typeof options[name] !== 'function') {
        throw new TypeError(`${name} of the credentials is a function`);
      }
    }
    if (Boolean(options.recoveryCodes) !== Boolean(options.setRecoveryCodes)) {
      throw new TypeError('Recovery codes need recoveryCodes(user) and setRecoveryCodes(user, hashes) together');
    }
    this.options = options;
    // Messages of the app by reason: texts, keys of its catalogs, or auth.<key> (one of @xufa/auth).
    this.messages = { ...options.messages };
    this.passwordOf = options.password || ((user) => user.password);
    this.totpOf = options.totp || (() => null);
    this.idOf = options.id || ((user) => (user.pk !== undefined ? user.pk : user.id));
    this.minPassword = options.minPassword || 8;
    this.maxPassword = options.maxPassword || 256;
    // Failures counted by user (5 in 15 minutes), and by address with a limit of its own (20): guessing many users
    // from one address is locked, without locking out an office behind one address for a few typing errors.
    this.lockout = lockoutOf(options.lockout, 5);
    this.ipLockout = lockoutOf(options.ipLockout, 20);
    // A hash to verify when there is no user, so that the answer takes the same time (made now, not at the first
    // login of a user that does not exist).
    this.dummy = null;
    this.dummyHash().catch(() => {
      this.dummy = null;
    });
  }

  dummyHash() {
    if (!this.dummy) this.dummy = hashPassword('xufa-no-user', this.options.passwordOptions);
    return this.dummy;
  }

  fail(reason, statusCode, extra = {}) {
    return new CredentialError(reason, extra.message || this.text(reason), statusCode, extra);
  }

  // The message of a reason (or of another key of @xufa/auth): the app's, or that of @xufa/auth, translated.
  text(key, params = {}) {
    return this.messages[key] ? custom(this.messages[key], params) : message(key, params);
  }

  // Whether users may set a password, an app, recovery codes.
  get recovery() {
    return Boolean(this.options.recoveryCodes);
  }

  // Throws throttled while one of the counters is locked.
  async guard(counted) {
    for (const [counter, key] of counted) {
      try {
        await counter.check(key);
      } catch (err) {
        if (err.retryAfter) throw this.fail('throttled', 429, { retryAfter: err.retryAfter });
        throw err;
      }
    }
  }

  // A login: { identifier, password, code, ip, request } -> the user, or a CredentialError. The same answer (invalid)
  // for a user that is not there, a wrong password and a user that allow() refuses; a user that active() refuses is
  // told it is locked, once its password is right.
  async login({ identifier, password, code, ip, request } = {}) {
    if (typeof this.options.findUser !== 'function') throw new TypeError('A login needs findUser(identifier)');
    const name = typeof identifier === 'string' ? identifier.trim() : '';
    if (!name || typeof password !== 'string' || !password) throw this.fail('missing', 400);
    const counted = [
      [this.lockout, `login:${name}`],
      [this.ipLockout, ip ? `ip:${ip}` : null],
    ].filter(([counter, key]) => counter && key);
    await this.guard(counted);
    const failed = async (reason = 'invalid', extra = {}) => {
      for (const [counter, key] of counted) await counter.fail(key);
      return this.fail(reason, 401, extra);
    };
    const { options } = this;
    const user = await options.findUser(name, request);
    const hash = user ? this.passwordOf(user) : null;
    const valid = await verifyPassword(password, hash || (await this.dummyHash()));
    if (!user || !hash || !valid || (options.allow && !(await options.allow(user)))) throw await failed();
    if (options.active && !(await options.active(user))) throw this.fail('locked', 403);
    const secret = await this.totpOf(user);
    if (secret) {
      const recovery = this.recovery;
      const given = typeof code === 'string' ? code.trim() : typeof code === 'number' ? String(code) : '';
      // The password was right: the code is asked for (and nothing is said before).
      if (!given) throw this.fail('code', 401, { needsCode: true, recovery });
      if (recovery && RECOVERY.test(given)) {
        // A recovery code (the app lost): good once.
        const hashes = (await options.recoveryCodes(user)) || [];
        const used = hashRecoveryCode(given);
        if (!hashes.includes(used)) throw await failed('wrongCode', { needsCode: true, recovery });
        await options.setRecoveryCodes(
          user,
          hashes.filter((item) => item !== used),
          request
        );
      } else {
        const after = options.lastTotpStep ? await options.lastTotpStep(user) : undefined;
        const step = verifyTotp(given, secret, { ...options.totpOptions, after });
        if (step === null) throw await failed('wrongCode', { needsCode: true, recovery });
        if (options.onTotp) await options.onTotp(user, step);
      }
    }
    // A success forgets the failures of the user (not those of the address: an account of one's own does not open
    // the guessing of others).
    if (this.lockout) await this.lockout.succeed(`login:${name}`);
    const rehash = options.rehash || options.setPassword;
    if (rehash && needsRehash(hash, options.passwordOptions)) {
      await rehash(user, await hashPassword(password, options.passwordOptions), request);
    }
    return user;
  }

  // What is wrong with a new password (or null): its length, the email in it, and checkPassword(password, values).
  validatePassword(password, values = {}) {
    if (typeof password !== 'string' || password.length < this.minPassword) {
      return this.text('tooShort', { min: this.minPassword });
    }
    if (password.length > this.maxPassword) return this.text('tooLong', { max: this.maxPassword });
    const local = typeof values.email === 'string' ? values.email.split('@')[0].toLowerCase() : null;
    if (local && local.length >= 4 && password.toLowerCase().includes(local)) return this.text('emailInPassword');
    return this.options.checkPassword ? this.options.checkPassword(password, values) || null : null;
  }

  // The password of a user logged in, asked again before a change (failures locked out as those of logins).
  async confirmPassword(user, password, field = 'current') {
    const key = `account:${this.idOf(user)}`;
    if (this.lockout) await this.guard([[this.lockout, key]]);
    const hash = this.passwordOf(user);
    const valid = await verifyPassword(typeof password === 'string' ? password : '', hash || (await this.dummyHash()));
    if (!hash || !valid) {
      if (this.lockout) await this.lockout.fail(key);
      throw this.fail('wrongPassword', 400, { errors: { [field]: [this.text('notYours')] } });
    }
    if (this.lockout) await this.lockout.succeed(key);
  }

  // What a user may change, and what it has.
  async state(user) {
    const { options } = this;
    return {
      password: Boolean(options.setPassword),
      totp: { can: Boolean(options.setTotp), enabled: Boolean(await this.totpOf(user)) },
      recovery: this.recovery ? { left: ((await options.recoveryCodes(user)) || []).length } : null,
    };
  }

  // A new password: { current, password, email } (email: kept out of the password).
  async changePassword(user, { current, password, email } = {}, request = undefined) {
    if (!this.options.setPassword) throw this.fail('noPasswords', 404);
    await this.confirmPassword(user, current, 'current');
    const problem = password === current ? this.text('sameAsBefore') : this.validatePassword(password, { email });
    if (problem) throw this.fail('weak', 400, { message: problem, errors: { password: [problem] } });
    await this.setPassword(user, password, request);
  }

  // A password set without the one before (a reset by a link): checked, hashed and kept.
  async setPassword(user, password, request = undefined, values = {}) {
    if (!this.options.setPassword) throw this.fail('noPasswords', 404);
    const problem = this.validatePassword(password, values);
    if (problem) throw this.fail('weak', 400, { message: problem, errors: { password: [problem] } });
    await this.options.setPassword(user, await hashPassword(password, this.options.passwordOptions), request);
  }

  // An authenticator app, step 1: the password, then a new secret kept in the session until a code of the app
  // confirms it (10 minutes): its key, otpauth:// URI and QR code (SVG).
  async startTotp(user, { password, label, issuer, session } = {}) {
    if (!this.options.setTotp) throw this.fail('noApps', 404);
    await this.confirmPassword(user, password, 'password');
    const secret = generateSecret();
    session.set(PENDING_KEY, { secret, at: Date.now(), user: String(this.idOf(user)) });
    const uri = totpUri({ secret, issuer, label: String(label), ...this.options.totpOptions });
    return { secret, uri, svg: qrSvg(uri) };
  }

  // Step 2: the first code of the app; the secret is the user's, with new recovery codes (to show once).
  async confirmTotp(user, { code, session, request } = {}) {
    if (!this.options.setTotp) throw this.fail('noApps', 404);
    const pending = session.get(PENDING_KEY);
    if (!pending || pending.user !== String(this.idOf(user)) || Date.now() - pending.at > PENDING_LIFE) {
      throw this.fail('pending', 400);
    }
    const given = typeof code === 'string' ? code.trim() : '';
    const step = verifyTotp(given, pending.secret, this.options.totpOptions);
    if (step === null) throw this.fail('wrongCode', 400, { errors: { code: [this.text('wrongCode')] } });
    await this.options.setTotp(user, pending.secret, request);
    if (this.options.onTotp) await this.options.onTotp(user, step);
    session.delete(PENDING_KEY);
    return { recoveryCodes: await this.newRecoveryCodes(user, request) };
  }

  // The app removed (with its recovery codes), with the password.
  async disableTotp(user, { password, request } = {}) {
    if (!this.options.setTotp) throw this.fail('noApps', 404);
    await this.confirmPassword(user, password, 'password');
    await this.options.setTotp(user, null, request);
    if (this.recovery) await this.options.setRecoveryCodes(user, [], request);
  }

  // New recovery codes in place of the old ones, with the password (and an app set up).
  async renewRecoveryCodes(user, { password, request } = {}) {
    if (!this.recovery) throw this.fail('noRecovery', 404);
    await this.confirmPassword(user, password, 'password');
    if (!(await this.totpOf(user))) throw this.fail('noTotp', 400);
    return { recoveryCodes: await this.newRecoveryCodes(user, request) };
  }

  // Ten codes to give the user once: kept as hashes (null without recovery codes).
  async newRecoveryCodes(user, request = undefined) {
    if (!this.recovery) return null;
    const codes = generateRecoveryCodes(10);
    await this.options.setRecoveryCodes(
      user,
      codes.map((code) => hashRecoveryCode(code)),
      request
    );
    return codes;
  }
}

export { Credentials, CredentialError };
