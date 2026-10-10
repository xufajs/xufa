// Lockouts and refresh tokens, with their stores of the process and of @xufa/orm.
import { Database, Model, fields, MemoryCache } from '@xufa/orm';
import { Lockout, Locked, RefreshTokens, Unauthorized, modelStore, refreshTokenFields, normalizeIdentifier, skeleton } from '../index.js';

const sleep = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('lockout', () => {
  it('locks a key after too many failures, for a while', async () => {
    const lockout = new Lockout({ maxAttempts: 3, window: '1m', lockFor: '200ms' });
    await lockout.fail('Ada@example.com');
    expect(await lockout.fail('ada@example.com')).toMatchObject({ locked: false, failures: 2 });
    expect(await lockout.fail('ada@example.com')).toMatchObject({ locked: true, retryAfter: 1 });
    const err = await lockout.check('ada@example.com').catch((e) => e);
    expect(err).toBeInstanceOf(Locked);
    expect(err.statusCode).toBe(429);
    expect(err.retryAfter).toBe(1);
    expect((await lockout.check('grace@example.com')).locked).toBe(false);
    await sleep(250);
    expect(await lockout.check('ada@example.com')).toMatchObject({ locked: false, failures: 0 });
  });

  it('forgets failures after a success, or out of the window', async () => {
    const lockout = new Lockout({ maxAttempts: 2, window: '100ms', lockFor: '1m' });
    await lockout.fail('ada');
    await lockout.succeed('ada');
    expect((await lockout.fail('ada')).locked).toBe(false);
    await sleep(150);
    expect((await lockout.fail('ada')).locked).toBe(false);
    expect((await lockout.fail('ada')).locked).toBe(true);
    await lockout.reset('ada');
    expect((await lockout.status('ada')).locked).toBe(false);
  });

  it('keeps the failures in a cache of @xufa/orm', async () => {
    const store = new MemoryCache();
    const lockout = new Lockout({ store, maxAttempts: 1 });
    await lockout.fail('ada');
    expect(store.size).toBe(1);
    // Another Lockout on the same store (as other workers of a cluster with a SharedCache) sees it.
    expect((await new Lockout({ store }).status('ada')).locked).toBe(true);
  });
  it('names a person cannot tell apart are one key: full-width letters, ligatures and case (normalizeIdentifier)', async () => {
    const lockout = new Lockout({ maxAttempts: 3, window: '1m', lockFor: '1m' });
    await lockout.fail('admin');
    await lockout.fail('ＡＤＭＩＮ'); // full-width
    await lockout.fail('Admin');
    await expect(lockout.check('admin')).rejects.toThrow(Locked);
    expect((await lockout.status('ａｄｍｉｎ')).locked).toBe(true);
    expect(normalizeIdentifier('ＡＤＭＩＮ')).toBe('admin');
    expect(normalizeIdentifier('ﬁle@Example.COM')).toBe('file@example.com'); // a ligature
    expect(normalizeIdentifier('ｊｏｈｎ①')).toBe('john1');
    // Other scripts are other names (Cyrillic а is not Latin a).
    expect(normalizeIdentifier('\u0430dmin')).not.toBe('admin');
  });
});

describe('look-alike names (skeleton, UTS #39)', () => {
  const key = (name) => skeleton(normalizeIdentifier(name));

  it('names that look alike across scripts have one skeleton; names that look different do not', () => {
    // Cyrillic letters in Latin names (а, о, р, у, с, ѕ, е).
    expect(key('p\u0430ypal')).toBe(key('paypal'));
    expect(key('\u0440\u0430\u0443\u0440\u0430l')).toBe(key('paypal'));
    expect(key('g\u043e\u043egle')).toBe(key('google'));
    expect(key('\u0455\u0441\u043e\u0440\u0435')).toBe(key('scope'));
    // Within a script, as UTS #39 says: rn and m, and case and width by normalizeIdentifier.
    expect(skeleton('m')).toBe(skeleton('rn'));
    expect(key('ＰａｙＰａｌ')).toBe(key('paypal'));
    // An accent is a difference one sees.
    expect(key('jos\u00e9')).not.toBe(key('jose'));
    expect(key('alice')).not.toBe(key('bob'));
  });

  it('is a key to compare: in NFD, the same for a text in NFC or NFD', () => {
    const nfc = 'jos\u00e9';
    expect(skeleton(nfc)).toBe(skeleton(nfc.normalize('NFD')));
    expect(skeleton(nfc)).toBe(skeleton(nfc).normalize('NFD'));
    expect(skeleton('')).toBe('');
  });
});

function refreshSuite(name, makeStore) {
  describe(`refresh tokens (${name})`, () => {
    let refresh;

    beforeEach(async () => {
      refresh = new RefreshTokens({ store: await makeStore(), ttl: '1h' });
    });

    it('issues tokens and rotates them', async () => {
      const { token, record } = await refresh.issue(42, { sub: '42', role: 'admin' });
      expect(token).toMatch(/^[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/);
      expect(record).toMatchObject({ subject: '42', data: { role: 'admin' }, usedAt: null, revokedAt: null });
      expect(record.hash).not.toContain(token.split('.')[1]);
      const next = await refresh.rotate(token);
      expect(next.record).toMatchObject({ subject: '42', family: record.family, data: { sub: '42', role: 'admin' } });
      expect((await refresh.verify(next.token)).id).toBe(next.record.id);
      const third = await refresh.rotate(next.token, { data: { sub: '42', role: 'user' } });
      expect(third.record.data.role).toBe('user');
    });

    it('revokes the family of a token used twice', async () => {
      const first = await refresh.issue('42');
      const second = await refresh.rotate(first.token);
      const reused = await refresh.rotate(first.token).catch((err) => err);
      expect(reused).toBeInstanceOf(Unauthorized);
      expect(reused.reason).toBe('reused');
      // The thief's copy is spent, and the user's token of the family no longer works either.
      expect((await refresh.verify(second.token).catch((err) => err)).reason).toBe('revoked');
      // Other families of the subject (other devices) still work.
      const other = await refresh.issue('42');
      expect((await refresh.verify(other.token)).subject).toBe('42');
    });

    it('spends a token once when it is rotated twice at once', async () => {
      const { token } = await refresh.issue('42');
      const results = await Promise.allSettled([refresh.rotate(token), refresh.rotate(token)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((result) => result.status === 'rejected').reason.reason).toBe('reused');
    });

    it('lets a spent token be used again within reuseInterval', async () => {
      const lenient = new RefreshTokens({ store: refresh.store, reuseInterval: '200ms' });
      const { token } = await lenient.issue('42');
      const [a, b] = await Promise.all([lenient.rotate(token), lenient.rotate(token)]);
      expect(a.record.family).toBe(b.record.family);
      await sleep(250);
      expect((await lenient.rotate(token).catch((err) => err)).reason).toBe('reused');
      expect((await lenient.verify(a.token).catch((err) => err)).reason).toBe('revoked');
    });

    it('refuses tokens that are unknown, changed, revoked or expired', async () => {
      const { token } = await refresh.issue('42');
      const [id, secret] = token.split('.');
      const reasonOf = (given) => refresh.verify(given).then(() => null, (err) => err.reason);
      expect(await reasonOf('nope')).toBe('malformed');
      expect(await reasonOf(`${id}.${secret.slice(0, -1)}${secret.endsWith('A') ? 'B' : 'A'}`)).toBe('unknown');
      expect(await reasonOf(`${'0'.repeat(32)}.${secret}`)).toBe('unknown');
      expect(await refresh.revoke(token)).toBe(true);
      expect(await reasonOf(token)).toBe('revoked');
      expect(await refresh.revoke('nope')).toBe(false);
      const short = new RefreshTokens({ store: refresh.store, ttl: '50ms' });
      const expiring = await short.issue('7');
      await sleep(80);
      expect(await reasonOf(expiring.token)).toBe('expired');
      await refresh.prune();
      expect(await reasonOf(expiring.token)).toBe('unknown');
    });

    it('revokes every token of a subject', async () => {
      const a = await refresh.issue('42');
      const b = await refresh.issue('42');
      const c = await refresh.issue('7');
      await refresh.revokeSubject(42);
      expect((await refresh.verify(a.token).catch((err) => err)).reason).toBe('revoked');
      expect((await refresh.verify(b.token).catch((err) => err)).reason).toBe('revoked');
      expect((await refresh.verify(c.token)).subject).toBe('7');
    });
  });
}

refreshSuite('memory', () => undefined);

for (const backend of ['memory', 'sqlite']) {
  class RefreshToken extends Model {
    static fields = refreshTokenFields(fields);

    static options = { indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] };
  }
  const db = new Database({ backend, filename: ':memory:' });
  db.register(RefreshToken);
  let ready = null;
  refreshSuite(`@xufa/orm ${backend}`, async () => {
    if (!ready) ready = db.connect().then(() => db.sync());
    await ready;
    await RefreshToken.objects.all().delete();
    return modelStore(RefreshToken);
  });
  afterAll(() => db.close());
}

describe('refresh tokens in a model with a TTL index', () => {
  it('are deleted by db.expire() when they expire', async () => {
    class ExpiringToken extends Model {
      static fields = refreshTokenFields(fields);

      static options = { indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] };
    }
    const db = new Database({ backend: 'sqlite', filename: ':memory:' }).register(ExpiringToken);
    await db.connect();
    await db.sync();
    const refresh = new RefreshTokens({ store: modelStore(ExpiringToken), ttl: '50ms' });
    const { token } = await refresh.issue('42');
    await refresh.issue('7', null);
    expect(await db.expire()).toEqual({ ExpiringToken: 0 });
    await sleep(80);
    expect(await db.expire()).toEqual({ ExpiringToken: 2 });
    expect((await refresh.verify(token).catch((err) => err)).reason).toBe('unknown');
    await db.close();
  });
});
