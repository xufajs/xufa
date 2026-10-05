// The strategies of the plugin: ways a request says who it is. The plugin tries those of its option `strategies` on
// every request, in order, until one identifies the user (the bearer JWT, 'jwt', when only `keys` are given).
//
//   app.register(auth.plugin, {
//     keys: process.env.JWT_KEY,
//     strategies: ['jwt', auth.apiKey({ find: (id) => ApiKey.objects.filter({ id }).first() })],
//   });
//   app.get('/reports', { config: { auth: { strategy: 'apiKey' } } }, handler);
//
// A strategy is { name, authenticate(request, reply) }, whose promise is:
//   { user, info }            the request is of `user` (info: request.auth, as the claims of a JWT are)
//   { fail: { challenge } }   credentials that are not valid (challenge: for the WWW-Authenticate header)
//   null                      no credentials of this kind: the next strategy is tried
// A strategy of Passport is one with passport(strategy) (lib/passport.js).
const crypto = require('node:crypto');
const { hashPassword, verifyPassword } = require('./password');
const { Lockout } = require('./lockout');
const { seconds } = require('./duration');
const { Unauthorized, Locked } = require('./errors');

// --- API keys: '<id>.<secret>', of which only a hash of the secret is kept (with the id, to find it). The secret is
// 32 random bytes: a hash (SHA-256) is enough to keep it, and fast enough to check on every request (a password needs
// scrypt because people choose them).

const hashApiKey = (secret) => crypto.createHash('sha256').update(secret).digest('base64url');

/**
 * A new API key: give `key` to its owner once, keep `id` and `hash` (the key cannot be made again from them).
 * `prefix` starts the ids (and so the keys): scanners of secrets in code find keys of a known prefix.
 */
function generateApiKey({ prefix = 'xk_' } = {}) {
  if (typeof prefix !== 'string' || prefix.includes('.')) throw new TypeError('The prefix of API keys has no dots');
  const id = prefix + crypto.randomBytes(9).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  return { key: `${id}.${secret}`, id, hash: hashApiKey(secret) };
}

/** The id and secret of a key, or null when it is not one. */
function parseApiKey(key) {
  if (typeof key !== 'string') return null;
  const dot = key.lastIndexOf('.');
  if (dot <= 0 || dot === key.length - 1 || key.length > 512) return null;
  return { id: key.slice(0, dot), secret: key.slice(dot + 1) };
}

/** Whether the secret of a key is the one of a hash (of hashApiKey), in constant time. */
function verifyApiKey(secret, hash) {
  if (typeof secret !== 'string' || typeof hash !== 'string') return false;
  const given = Buffer.from(hashApiKey(secret));
  const kept = Buffer.from(hash);
  return given.length === kept.length && crypto.timingSafeEqual(given, kept);
}

/**
 * The strategy of API keys, read from a header (x-api-key), the Authorization header (`scheme`: 'ApiKey <key>') or a
 * query parameter (`query`, off by default: URLs end in logs). `find(id, request)` gives the record of an id ({ hash
 * } and what else you keep) or null; `user(record, request)` the user of a record (record.user, or the record).
 * Records with an expiresAt in the past or a revokedAt are refused.
 */
function apiKey(options = {}) {
  const { name = 'apiKey', header = 'x-api-key', scheme = null, query = null, find } = options;
  if (typeof find !== 'function') throw new TypeError('apiKey needs find(id, request)');
  const userOf = options.user || ((record) => (record.user === undefined ? record : record.user));
  const headerName = header ? header.toLowerCase() : null;
  const schemePattern = scheme ? new RegExp(`^${scheme}\\s+(\\S+)\\s*$`, 'i') : null;
  const fail = (message) => ({ fail: { message } });

  function keyOf(request) {
    if (headerName && typeof request.headers[headerName] === 'string') return request.headers[headerName];
    if (schemePattern && request.headers.authorization) {
      const match = schemePattern.exec(request.headers.authorization);
      if (match) return match[1];
    }
    if (query && request.query && typeof request.query[query] === 'string') return request.query[query];
    return null;
  }

  // As OpenAPI describes it (for @xufa/openapi): where the key is read first.
  let openapi;
  if (headerName) openapi = { type: 'apiKey', in: 'header', name: header };
  else if (scheme) openapi = { type: 'http', scheme };
  else if (query) openapi = { type: 'apiKey', in: 'query', name: query };

  return {
    name,
    openapi: options.openapi || openapi,
    async authenticate(request) {
      const given = keyOf(request);
      if (given === null) return null;
      const parsed = parseApiKey(given);
      if (!parsed) return fail('The API key is not valid');
      const record = await find(parsed.id, request);
      if (!record || !verifyApiKey(parsed.secret, record.hash)) return fail('The API key is not valid');
      const now = Date.now();
      if (record.revokedAt) return fail('The API key was revoked');
      if (record.expiresAt && Number(new Date(record.expiresAt)) <= now) return fail('The API key expired');
      const user = await userOf(record, request);
      if (!user) return fail('The user of the API key is not valid');
      return { user, info: { apiKey: parsed.id } };
    },
  };
}

/**
 * The fields of a model of API keys (made with the fields of @xufa/orm), for find:
 *
 *   class ApiKey extends Model { static fields = apiKeyFields(fields); }
 *   const { key, id, hash } = generateApiKey();
 *   await ApiKey.objects.create({ id, hash, subject: String(user.id), name: 'CI' });
 *   auth.apiKey({ find: (id) => ApiKey.objects.filter({ id }).first(), user: (key) => User.objects.get({ id: key.subject }) })
 */
function apiKeyFields(fields) {
  return {
    id: fields.string({ primaryKey: true, maxLength: 64 }),
    hash: fields.string({ maxLength: 64 }),
    subject: fields.string({ maxLength: 255, index: true }),
    name: fields.string({ maxLength: 255, null: true }),
    scopes: fields.json({ null: true }),
    createdAt: fields.datetime({ autoNowAdd: true }),
    expiresAt: fields.datetime({ null: true }),
    revokedAt: fields.datetime({ null: true }),
  };
}

// --- HTTP Basic: a username and password in every request, checked against the scrypt hash of the user. A password
// checked is remembered for a while (`cache`, 5 minutes; 0: never), so that requests do not pay scrypt each time: by
// a keyed hash of the username, the password and the hash of the user (another password, or a changed one, is
// checked again).

/**
 * The strategy of HTTP Basic: `findUser(username, request)` gives the user (or null), `password(user)` its hash
 * (user.password). `lockout`: a Lockout or its options (5 failures by default; false: none).
 */
function basic(options = {}) {
  const { name = 'basic', realm = 'api', findUser, passwordOptions, cache = '5m', maxCached = 10000 } = options;
  if (typeof findUser !== 'function') throw new TypeError('basic needs findUser(username, request)');
  const passwordOf = options.password || ((user) => user.password);
  const lockout =
    options.lockout === false
      ? null
      : options.lockout instanceof Lockout
        ? options.lockout
        : new Lockout(options.lockout);
  const challenge = `Basic realm="${realm}", charset="UTF-8"`;
  const ttl = seconds(cache, 'cache') * 1000;
  const cacheKey = crypto.randomBytes(32);
  const checked = new Map();
  let dummy = null;
  const fail = (message) => ({ fail: { challenge, message } });

  function wasChecked(key) {
    const expires = checked.get(key);
    if (expires === undefined) return false;
    if (expires > Date.now()) return true;
    checked.delete(key);
    return false;
  }

  function remember(key) {
    if (!ttl) return;
    checked.delete(key);
    checked.set(key, Date.now() + ttl);
    if (checked.size > maxCached) checked.delete(checked.keys().next().value);
  }

  return {
    name,
    challenge,
    openapi: options.openapi || { type: 'http', scheme: 'basic' },
    async authenticate(request, reply) {
      const authorization = request.headers.authorization;
      const match = authorization && /^Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authorization);
      if (!match) return null;
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon <= 0) return fail('The credentials are not valid');
      const username = decoded.slice(0, colon);
      const password = decoded.slice(colon + 1);
      const user = await findUser(username, request);
      const hash = user ? passwordOf(user) : null;
      const key =
        ttl && hash
          ? crypto.createHmac('sha256', cacheKey).update(`${username}\0${password}\0${hash}`).digest('base64url')
          : null;
      if (key && wasChecked(key)) return { user, info: { username } };
      if (lockout) {
        try {
          await lockout.check(username);
        } catch (err) {
          if (err instanceof Locked && reply) reply.header('retry-after', String(err.retryAfter));
          throw err;
        }
      }
      // An answer that takes as long without a user (a hash is verified anyway).
      if (!dummy) dummy = hashPassword('xufa-no-user', passwordOptions);
      const valid = await verifyPassword(password, hash || (await dummy));
      if (!user || !hash || !valid) {
        if (lockout) await lockout.fail(username);
        return fail('The credentials are not valid');
      }
      if (lockout) await lockout.succeed(username);
      if (key) remember(key);
      return { user, info: { username } };
    },
  };
}

// The error of a request whose strategies failed: Unauthorized with their message (the first).
function failureError(failures) {
  const first = failures.find((failure) => failure.message);
  return new Unauthorized(first ? first.message : 'Authentication is required');
}

module.exports = {
  apiKey,
  apiKeyFields,
  basic,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
  failureError,
};
