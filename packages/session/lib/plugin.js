'use strict';

// The plugin of @xufa/http (and fastify): request.session in every request, loaded from its cookie (signed) and
// saved when the reply is sent; with csrf, writes of a session (POST, PUT, PATCH, DELETE) need its token.
//
//   app.register(sessionPlugin, { secret: process.env.SESSION_SECRET, store: ormStore(db), csrf: true });
//   app.post('/login', async (request) => { ...; request.session.regenerate().set('userId', user.pk); });
const { parseCookies, serializeCookie, sign, unsign, newId } = require('./cookie');
const { Session } = require('./session');
const { memoryStore } = require('./stores');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

function ms(value) {
  if (typeof value === 'number') return value;
  const match = /^(\d+)\s*(s|m|h|d|w)$/.exec(String(value).trim());
  if (!match) throw new TypeError(`Not a duration: ${value} (ms, or '30m', '14d')`);
  return Number(match[1]) * UNITS[match[2]];
}

class SessionError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'SessionError';
    this.code = statusCode === 403 ? 'XUFA_SESSION_CSRF' : 'XUFA_SESSION_ERR';
    this.statusCode = statusCode;
  }
}

function sessionPlugin(app, options, done) {
  const {
    secret,
    store = memoryStore(),
    cookieName = 'sid',
    maxAge = '14d',
    rolling = true,
    csrf = false,
    cookie = {},
  } = options || {};
  const secrets = [].concat(secret || []).filter(Boolean);
  if (secrets.length === 0 || secrets.some((item) => String(item).length < 32)) {
    done(
      new SessionError('The session needs a secret of 32 characters or more (secret, or [new, old] to rotate them)')
    );
    return;
  }
  const life = ms(maxAge);

  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request) => {
    const cookies = parseCookies(request.headers.cookie);
    const id = cookies[cookieName] ? unsign(cookies[cookieName], secrets) : null;
    const found = id ? await store.get(id) : null;
    request.session = found ? new Session(id, found.data, { fresh: false }) : new Session(newId(), {}, { fresh: true });
    request.session.expiresAt = found ? found.expiresAt : null;
  });

  if (csrf) {
    app.addHook('preHandler', async (request) => {
      if (SAFE.has(request.method)) return;
      if (request.routeOptions && request.routeOptions.config && request.routeOptions.config.csrf === false) return;
      const { session } = request;
      // Requests without a session act as nobody: there is nothing to forge.
      if (!session || session.fresh) return;
      const token =
        request.headers['x-csrf-token'] ||
        (request.body && typeof request.body === 'object' ? request.body._csrf : undefined);
      if (!session.checkCsrf(token)) {
        throw new SessionError(
          'The CSRF token of the session is missing or wrong (x-csrf-token, or _csrf in the form)',
          403
        );
      }
    });
  }

  app.addHook('onSend', async (request, reply, payload) => {
    const { session } = request;
    if (!session) return payload;
    const secure = cookie.secure === undefined ? request.protocol === 'https' : cookie.secure;
    const cookieOptions = { path: '/', httpOnly: true, sameSite: 'lax', ...cookie, secure };
    if (session.destroyed) {
      if (!session.fresh) await store.delete(session.previousId || session.id);
      if (!session.fresh || session.previousId) {
        reply.header(
          'set-cookie',
          serializeCookie(cookieName, '', { ...cookieOptions, maxAge: 0, expires: new Date(0) })
        );
      }
      return payload;
    }
    if (session.previousId) await store.delete(session.previousId);
    const save = session.changed || (rolling && !session.fresh && !session.empty);
    if (!save || (session.fresh && session.empty)) return payload;
    const expiresAt = new Date(Date.now() + life);
    await store.set(session.id, session.toStore(), expiresAt);
    reply.header(
      'set-cookie',
      serializeCookie(cookieName, sign(session.id, secrets[0]), { ...cookieOptions, maxAge: life })
    );
    return payload;
  });

  done();
}

sessionPlugin[Symbol.for('skip-override')] = true;
sessionPlugin[Symbol.for('fastify.display-name')] = '@xufa/session';
sessionPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/session' };

module.exports = { sessionPlugin, SessionError };
