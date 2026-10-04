// Refresh tokens: opaque tokens that give new access tokens (JWTs) without the password, kept in a store by their id
// with the hash of their secret (a stolen store gives no usable token). Each use rotates the token: the used one is
// spent and a new one of the same family is given. Using a spent token again means it was stolen (one of the two
// parties has a copy): the whole family is revoked, so the thief's and the user's tokens stop working.
//
//   const refresh = new RefreshTokens({ ttl: '30d' });          // or { store: modelStore(RefreshToken) }
//   const { token } = await refresh.issue('42', { role: 'admin' });
//   const { token: next, record } = await refresh.rotate(token);  // record.subject, record.data
//   await refresh.revoke(next);                                   // logout
//   await refresh.revokeSubject('42');                            // logout everywhere
//
// A token is '<id>.<secret>' (base64url). Records: { id, family, subject, data, hash, createdAt, expiresAt, usedAt,
// revokedAt }, dates as milliseconds since the epoch.
const crypto = require('node:crypto');
const { seconds } = require('./duration');
const { Unauthorized } = require('./errors');

const hashOf = (secret) => crypto.createHash('sha256').update(secret).digest('base64url');

// The tokens in the process (for tests and one-process apps): records by id. A store has get(id), create(record),
// spend(id, time), updateMany(where, changes) and deleteExpired(time).
class MemoryTokenStore {
  constructor() {
    this.records = new Map();
  }

  async get(id) {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async create(record) {
    this.records.set(record.id, { ...record });
  }

  // Marks a token used, when it was not: whether it was marked (only one of two uses at once is).
  async spend(id, time) {
    const record = this.records.get(id);
    if (!record || record.usedAt) return false;
    record.usedAt = time;
    return true;
  }

  // Changes the records of a family or of a subject ({ family } or { subject }) that are not revoked.
  async updateMany(where, changes) {
    for (const record of this.records.values()) {
      if (record.revokedAt) continue;
      if (Object.entries(where).every(([key, value]) => record[key] === value)) Object.assign(record, changes);
    }
  }

  // Deletes the records that expired before a time.
  async deleteExpired(before) {
    for (const [id, record] of this.records) if (record.expiresAt <= before) this.records.delete(id);
  }
}

// A store on a model of @xufa/orm with the fields of the records (see refreshTokenFields): the tokens are rows.
function modelStore(Model) {
  const plain = (row) =>
    row && {
      id: row.id,
      family: row.family,
      subject: row.subject,
      data: row.data,
      hash: row.hash,
      createdAt: Number(row.createdAt),
      expiresAt: Number(row.expiresAt),
      usedAt: row.usedAt === null || row.usedAt === undefined ? null : Number(row.usedAt),
      revokedAt: row.revokedAt === null || row.revokedAt === undefined ? null : Number(row.revokedAt),
    };
  return {
    async get(id) {
      return plain(await Model.objects.filter({ id }).first());
    },
    async create(record) {
      await Model.objects.create(record);
    },
    async spend(id, time) {
      return (await Model.objects.filter({ id, usedAt: null }).update({ usedAt: time })) > 0;
    },
    async updateMany(where, changes) {
      await Model.objects.filter({ ...where, revokedAt: null }).update(changes);
    },
    async deleteExpired(before) {
      await Model.objects.filter({ expiresAt__lte: before }).delete();
    },
  };
}

// The fields of a model of refresh tokens for modelStore, made with the fields of @xufa/orm. A TTL index on expiresAt
// deletes the tokens that expired (instead of refresh.prune()):
//
//   class RefreshToken extends Model {
//     static fields = refreshTokenFields(fields);
//     static options = { indexes: [{ fields: ['expiresAt'], expireAfter: 0 }] };
//   }
function refreshTokenFields(fields) {
  return {
    id: fields.string({ primaryKey: true, maxLength: 32 }),
    family: fields.string({ maxLength: 32, index: true }),
    subject: fields.string({ maxLength: 255, index: true }),
    data: fields.json({ null: true }),
    hash: fields.string({ maxLength: 64 }),
    createdAt: fields.datetime(),
    expiresAt: fields.datetime(),
    usedAt: fields.datetime({ null: true }),
    revokedAt: fields.datetime({ null: true }),
  };
}

function invalid(message, reason) {
  const err = new Unauthorized(message);
  err.reason = reason;
  return err;
}

class RefreshTokens {
  // ttl: how long a token lives (30 days by default); reuseInterval: for how long (seconds) a spent token may be
  // used again without revoking its family (0 by default), for clients that send two refreshes at once.
  constructor({ store = new MemoryTokenStore(), ttl = '30d', reuseInterval = 0 } = {}) {
    this.store = store;
    this.ttl = seconds(ttl, 'ttl') * 1000;
    this.reuseInterval = seconds(reuseInterval, 'reuseInterval') * 1000;
  }

  // A new token (of a new family, or of `family`) for a subject (the id of the user), with data kept with it (the
  // claims of the access tokens it gives, a tenant...). Returns { token, record }.
  async issue(subject, data = null, { family } = {}) {
    if (subject === undefined || subject === null || subject === '') {
      throw new TypeError('A refresh token needs a subject');
    }
    const id = crypto.randomBytes(16).toString('hex');
    const secret = crypto.randomBytes(32).toString('base64url');
    const createdAt = Date.now();
    const record = {
      id,
      family: family || crypto.randomBytes(16).toString('hex'),
      subject: String(subject),
      data,
      hash: hashOf(secret),
      createdAt,
      expiresAt: createdAt + this.ttl,
      usedAt: null,
      revokedAt: null,
    };
    await this.store.create(record);
    return { token: `${id}.${secret}`, record };
  }

  // The record of a token that can be used, or an Unauthorized (401) whose reason is 'malformed', 'unknown',
  // 'revoked', 'expired' or 'reused' (a spent token: its family is revoked then).
  async verify(token, { spend = false } = {}) {
    const match = typeof token === 'string' && /^([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/.exec(token);
    if (!match) throw invalid('The refresh token is not valid', 'malformed');
    const [, id, secret] = match;
    const record = await this.store.get(id);
    const expected = record && Buffer.from(record.hash);
    const given = Buffer.from(hashOf(secret));
    if (!record || expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
      throw invalid('The refresh token is not valid', 'unknown');
    }
    const time = Date.now();
    if (record.revokedAt) throw invalid('The refresh token was revoked', 'revoked');
    if (record.expiresAt <= time) throw invalid('The refresh token expired', 'expired');
    if (record.usedAt && !(spend && this.withinReuse(record.usedAt, time))) {
      await this.store.updateMany({ family: record.family }, { revokedAt: time });
      throw invalid('The refresh token was used already: its family is revoked', 'reused');
    }
    return record;
  }

  // Whether a token spent at a time may be used again (reuseInterval).
  withinReuse(usedAt, time) {
    return this.reuseInterval > 0 && time - usedAt <= this.reuseInterval;
  }

  // A new token for a token that is spent: { token, record } (record of the new one, with the subject and data of the
  // old one, or `data` when given).
  async rotate(token, { data } = {}) {
    const record = await this.verify(token, { spend: true });
    // Spent atomically: of two rotations of a token at once, the second is a reuse (unless within reuseInterval).
    if (!record.usedAt && !(await this.store.spend(record.id, Date.now()))) {
      const spent = await this.store.get(record.id);
      if (!spent.usedAt || !this.withinReuse(spent.usedAt, Date.now())) {
        await this.store.updateMany({ family: record.family }, { revokedAt: Date.now() });
        throw invalid('The refresh token was used already: its family is revoked', 'reused');
      }
    }
    return this.issue(record.subject, data === undefined ? record.data : data, { family: record.family });
  }

  // Revokes a token and the rest of its family (logout of a device).
  async revoke(token) {
    let record;
    try {
      record = await this.verify(token);
    } catch (err) {
      if (err.reason === 'malformed' || err.reason === 'unknown') return false;
      return true;
    }
    await this.store.updateMany({ family: record.family }, { revokedAt: Date.now() });
    return true;
  }

  // Revokes every token of a subject (logout everywhere, a changed password).
  async revokeSubject(subject) {
    await this.store.updateMany({ subject: String(subject) }, { revokedAt: Date.now() });
  }

  // Deletes the tokens that expired (call it now and then).
  async prune() {
    await this.store.deleteExpired(Date.now());
  }
}

module.exports = { RefreshTokens, MemoryTokenStore, modelStore, refreshTokenFields };
