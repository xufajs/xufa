// The plugin of @xufa/http (and fastify): request.session in every request, loaded from its cookie (signed) and
// saved when the reply is sent; with csrf, writes of a session (POST, PUT, PATCH, DELETE) need its token.
//
// What is written: a session when it changed, and (rolling) its expiry pushed back when touchAfter has passed since it
// was last written (1 hour, or half of maxAge when that is shorter; 0: at every request), not at every request. The
// CSRF token of a visitor whose session keeps nothing goes in a signed cookie (<cookieName>_csrf), not in the store.
//
//   app.register(sessionPlugin, { secret: process.env.SESSION_SECRET, store: ormStore(db), csrf: true });
//   app.post('/login', async (request) => { ...; await request.session.login(user.pk); });
//   app.post('/logout-everywhere', async (request) => { await request.session.logoutEverywhere(); });
//
// The users of sessions: the store keeps a generation of each user (user:<id>, which no cookie can name: its ids are
// signed), raised when the user logs out everywhere (request.session.logoutEverywhere(), or app.sessions.logoutUser(id)
// for an admin who ends the sessions of another). A session of an older generation is emptied at its next request.
// It keeps the ids of the sessions of the user too, and each session its device (user agent, address, since, last
// seen): app.sessions.list(userId) gives them (by handles, never ids), and app.sessions.end(userId, handle) ends one.
import crypto from 'node:crypto';
import { parseCookies, serializeCookie, sign, unsign, newId } from './cookie.js';
import { Session, handleOf } from './session.js';
import { memoryStore } from './stores.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const UNITS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
// The most sessions kept for a user (the oldest are forgotten, not ended).
const MAX_SESSIONS = 100;

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
    touchAfter,
    csrf = false,
    csrfCookieName = `${cookieName}_csrf`,
    cookie = {},
  } = options || {};
  const secrets = [].concat(secret || []).filter(Boolean);
  if (secrets.length === 0 || secrets.some((item) => String(item).length < 32)) {
    done(
      new SessionError('The session needs a secret of 32 characters or more (secret, or [new, old] to rotate them)')
    );
    return;
  }
  let life;
  let touchEvery;
  try {
    life = ms(maxAge);
    touchEvery = touchAfter === undefined ? Math.min(3600000, life / 2) : ms(touchAfter);
  } catch (err) {
    done(err);
    return;
  }
  const userKey = (id) => `user:${id}`;
  // The generations of the users: 0 until one logs out everywhere. Each raise lasts as long as a session can (a session
  // older than it has expired, or was emptied at its last request).
  // The record of a user: its generation, and the ids of its sessions (written at logins and new ids, not at every
  // request; two logins at once may lose one of them from the list, never the session).
  const recordOf = async (id) => {
    const found = await store.get(userKey(id));
    const data = (found && found.data) || {};
    return {
      generation: Number.isInteger(data.generation) ? data.generation : 0,
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
  };
  const saveRecord = (id, record) => store.set(userKey(id), record, new Date(Date.now() + life));
  // Where the generations are, when not (only) in the store: app.sessions.useGenerations({ read(id, request), write(id,
  // generation) }), as @xufa/auth keeps them in the row of the user, read with it (no query of the store at each
  // request). read() gives undefined when it does not know: the store's is used.
  let source = null;
  const users = {
    async generation(id, request) {
      if (source) {
        const known = await source.read(id, request);
        if (known !== undefined && known !== null) return known;
      }
      return (await recordOf(id)).generation;
    },
    // Every session of the user ends: none is left in its list.
    async raise(id) {
      const generation = (await users.generation(id)) + 1;
      await saveRecord(id, { generation, sessions: [] });
      if (source) await source.write(id, generation);
      return generation;
    },
    // A session of the user (by its new id: one it had before goes).
    async track(id, sessionId, previousId) {
      const record = await recordOf(id);
      const sessions = record.sessions.filter((item) => item !== sessionId && item !== previousId);
      sessions.push(sessionId);
      await saveRecord(id, { generation: record.generation, sessions: sessions.slice(-MAX_SESSIONS) });
    },
    // The sessions of the user still there (of its generation), and the list without the others.
    async live(id) {
      const record = await recordOf(id);
      const live = [];
      for (const sessionId of record.sessions) {
        const found = await store.get(sessionId);
        const tied = found && found.data && found.data.__user;
        if (tied && tied.id === id && tied.generation >= record.generation) live.push({ id: sessionId, found });
      }
      if (live.length !== record.sessions.length) {
        await saveRecord(id, { generation: record.generation, sessions: live.map((item) => item.id) });
      }
      return { record, live };
    },
  };

  app.decorate('sessions', {
    store,
    // A session made out of a request (as Django's SessionStore in tests): fn(session) fills it (session.login(id),
    // set()), then it is kept; its Cookie (name=value) and id. A test client logs a user in with it (forceLogin).
    open: async (fn) => {
      const session = new Session(newId(), {}, { fresh: true, users });
      if (fn) await fn(session);
      const tied = session.data.__user;
      if (tied) await users.track(tied.id, session.id, null);
      await store.set(session.id, session.toStore(), new Date(Date.now() + life));
      return { id: session.id, cookie: `${cookieName}=${sign(session.id, secrets[0])}` };
    },
    // The CSRF token of the session of a Cookie header (made and kept when it has none), for code of the server, as a
    // test client: null without a session (requests without one are not checked).
    csrfTokenOf: async (cookieHeader) => {
      const cookies = parseCookies(cookieHeader);
      const id = cookies[cookieName] ? unsign(cookies[cookieName], secrets) : null;
      const found = id ? await store.get(id) : null;
      // A visitor with no session yet: the token of its cookie, if a page gave it one.
      const ofCookie = cookies[csrfCookieName] ? unsign(cookies[csrfCookieName], secrets) : null;
      if (!found) return ofCookie;
      if (!found.data.__csrf) {
        found.data.__csrf = ofCookie || crypto.randomBytes(24).toString('base64url');
        await store.set(id, found.data, found.expiresAt || new Date(Date.now() + life));
      }
      return found.data.__csrf;
    },
    // Ends every session of a user (in every browser, process and machine with the store).
    logoutUser: async (userId) => {
      await users.raise(String(userId));
    },
    // The generation of a user (raised by each logout everywhere).
    generationOf: (userId) => users.generation(String(userId)),
    // Where the generations are read and written besides the store (see `source`): { read(id, request), write(id,
    // generation) }.
    useGenerations: (given) => {
      if (!given || typeof given.read !== 'function' || typeof given.write !== 'function') {
        throw new TypeError('useGenerations({ read(id, request), write(id, generation) })');
      }
      source = given;
    },
    // The sessions of a user, last seen first: { handle, agent, ip, since, seen, expiresAt } (request.session.handle
    // is that of the session of a request).
    list: async (userId) => {
      const { live } = await users.live(String(userId));
      return live
        .map(({ id, found }) => {
          const device = found.data.__device || {};
          return {
            handle: handleOf(id),
            agent: device.agent || null,
            ip: device.ip || null,
            since: device.since ? new Date(device.since) : null,
            seen: device.seen ? new Date(device.seen) : null,
            expiresAt: found.expiresAt,
          };
        })
        .sort((a, b) => (b.seen ? b.seen.getTime() : 0) - (a.seen ? a.seen.getTime() : 0));
    },
    // Ends a session of a user, by its handle: whether it was there.
    end: async (userId, handle) => {
      const id = String(userId);
      const { record, live } = await users.live(id);
      const found = live.find((item) => handleOf(item.id) === handle);
      if (!found) return false;
      await store.delete(found.id);
      await saveRecord(id, {
        generation: record.generation,
        sessions: live.filter((item) => item !== found).map((item) => item.id),
      });
      return true;
    },
  });
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request) => {
    const cookies = parseCookies(request.headers.cookie);
    const id = cookies[cookieName] ? unsign(cookies[cookieName], secrets) : null;
    const found = id ? await store.get(id) : null;
    request.session = found
      ? new Session(id, found.data, { fresh: false, users, request })
      : new Session(null, {}, { fresh: true, users, request });
    request.session.expiresAt = found ? found.expiresAt : null;
    if (csrf && cookies[csrfCookieName]) request.session.cookieCsrf = unsign(cookies[csrfCookieName], secrets);
    // A session of a user who logged out everywhere since: emptied, with a new id.
    const tied = request.session.data.__user;
    if (tied && tied.generation < (await users.generation(tied.id, request))) {
      request.session.regenerate();
      request.session.data = {};
      request.session.endedEverywhere = true;
    }
  });

  if (csrf) {
    app.addHook('preHandler', async (request) => {
      if (SAFE.has(request.method)) return;
      if (request.routeOptions && request.routeOptions.config && request.routeOptions.config.csrf === false) return;
      const { session } = request;
      // Requests without a session act as nobody: there is nothing to forge. A browser that got a token for its forms
      // (its cookie) without a session yet is checked all the same (a login form).
      if (!session || (session.fresh && !session.cookieCsrf)) return;
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
    // (Made when a cookie is written: most responses write none.)
    const optionsOf = () => {
      const secure = cookie.secure === undefined ? request.protocol === 'https' : cookie.secure;
      return { path: '/', httpOnly: true, sameSite: 'lax', ...cookie, secure };
    };
    if (session.destroyed) {
      const cookieOptions = optionsOf();
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
    // Rolling: the expiry pushed back when touchEvery has passed since the session was written (its expiry tells when).
    const touch =
      rolling &&
      !session.fresh &&
      !session.empty &&
      (!session.expiresAt || Date.now() + life - new Date(session.expiresAt).getTime() >= touchEvery);
    // The device of a session of a user: new with each id (a login, a new id), its last seen time when the session is
    // written anyway, or touchEvery after it was last seen (not a write a minute).
    const tied = session.data.__user;
    let seen = false;
    if (tied && !session.destroyed) {
      const now = Date.now();
      const handle = handleOf(session.id);
      const device = session.data.__device;
      if (!device || device.key !== handle) {
        const agent = request.headers['user-agent'];
        session.data.__device = {
          key: handle,
          agent: typeof agent === 'string' ? agent.slice(0, 300) : null,
          ip: request.ip || null,
          since: device && device.since ? device.since : now,
          seen: now,
        };
        await users.track(tied.id, session.id, session.previousId);
        seen = true;
      } else if (touch || session.changed || !device.seen || now - device.seen >= touchEvery) {
        device.seen = now;
        device.ip = request.ip || device.ip;
        seen = true;
      }
    }
    // The token of the forms of a visitor without a session, in its cookie (for as long as a session lasts).
    if (session.cookieCsrfMade) {
      reply.header(
        'set-cookie',
        serializeCookie(csrfCookieName, sign(session.cookieCsrf, secrets[0]), { ...optionsOf(), maxAge: life })
      );
    }
    const save = session.changed || seen || touch;
    if (!save || (session.fresh && session.empty)) return payload;
    // A session that starts keeping something keeps the token its forms already have (that of the cookie).
    if (!session.data.__csrf && session.cookieCsrf) session.data.__csrf = session.cookieCsrf;
    const expiresAt = new Date(Date.now() + life);
    await store.set(session.id, session.toStore(), expiresAt);
    reply.header(
      'set-cookie',
      serializeCookie(cookieName, sign(session.id, secrets[0]), { ...optionsOf(), maxAge: life })
    );
    return payload;
  });

  done();
}

sessionPlugin[Symbol.for('skip-override')] = true;
sessionPlugin[Symbol.for('fastify.display-name')] = '@xufa/session';
sessionPlugin[Symbol.for('plugin-meta')] = { name: '@xufa/session' };

export { sessionPlugin, SessionError };
