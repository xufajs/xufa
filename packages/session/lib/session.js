// The session of a request (request.session): values kept between the requests of a browser, by a cookie with its
// id. Changes are saved when the reply is sent; regenerate() gives it a new id (after a login: an id known before it
// is worth nothing), destroy() ends it. flash() keeps a value for the next request only (as Rails and Laravel), and
// csrfToken() gives the token forms send back: kept in the session when it holds something, else in a signed cookie
// of its own (as Django's csrftoken), so that a visitor who only sees pages with forms makes no session in the store.
//
// The user of a session: await login(userId) ties it to a user (with a new id); await logoutEverywhere() ends every
// session of that user (in every browser, process and machine with the store), await logoutOthers() every one but this.
// The store keeps a generation per user (user:<id>), raised by those two: a session of an older generation is emptied
// at its next request.
import crypto from 'node:crypto';
import { newId } from './cookie.js';

class Session {
  constructor(id, data, { fresh, users = null, request = null }) {
    // The generations of the users (of the plugin): generation(id, request), raise(id).
    this.users = users;
    // The request of the session (where the generation of its user may be read: @xufa/auth's user).
    this.request = request;
    // null: made when it is first read (a session of a visitor without a cookie is only saved when it keeps
    // something, and most never do).
    this.sessionId = id;
    this.data = data || {};
    this.fresh = fresh;
    this.changed = false;
    this.destroyed = false;
    this.previousId = null;
    // The flash of the last request: read in this one, gone in the next.
    // The CSRF token of the cookie of the browser (verified by the plugin), while the session keeps none; made: one
    // made in this request, for the plugin to send in that cookie.
    this.cookieCsrf = null;
    this.cookieCsrfMade = false;
    const flash = this.data.__flash;
    this.flashed = flash || {};
    // (Read once: gone in the next request. Most sessions have none, and nothing to delete.)
    if (flash !== undefined) {
      delete this.data.__flash;
      for (const key in flash) {
        if (Object.hasOwn(flash, key)) {
          this.changed = true;
          break;
        }
      }
    }
    this.nextFlash = {};
  }

  get id() {
    if (this.sessionId === null) this.sessionId = newId();
    return this.sessionId;
  }

  set id(value) {
    this.sessionId = value;
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    if (key === '__flash' || key === '__csrf' || key === '__user' || key === '__device')
      throw new TypeError(`${key} is a key of the session itself`);
    this.data[key] = value;
    this.changed = true;
    return this;
  }

  has(key) {
    return Object.hasOwn(this.data, key);
  }

  delete(key) {
    if (this.has(key)) {
      delete this.data[key];
      this.changed = true;
    }
    return this;
  }

  // Every value (but those of the session itself).
  all() {
    const values = { ...this.data };
    delete values.__csrf;
    delete values.__user;
    delete values.__device;
    return values;
  }

  // The values go (the user and the CSRF token of the session stay).
  clear() {
    const kept = {};
    if (this.data.__csrf) kept.__csrf = this.data.__csrf;
    if (this.data.__user) kept.__user = this.data.__user;
    if (this.data.__device) kept.__device = this.data.__device;
    this.data = kept;
    this.changed = true;
    return this;
  }

  // A new id, the values kept (the old id is deleted from the store when the reply is sent).
  regenerate() {
    if (!this.fresh && this.previousId === null) this.previousId = this.id;
    this.id = newId();
    this.data.__csrf = crypto.randomBytes(24).toString('base64url');
    this.changed = true;
    return this;
  }

  // What names this session among those of its user (app.sessions.list(), end()): not its id, which is its key.
  get handle() {
    return handleOf(this.id);
  }

  // The id of the user of the session (login()), or null.
  get user() {
    return this.data.__user ? this.data.__user.id : null;
  }

  usersNeeded() {
    if (!this.users) throw new TypeError('The users of sessions need the session plugin (request.session)');
  }

  // Ties the session to a user, with a new id (an id known before the login is worth nothing).
  async login(userId) {
    this.usersNeeded();
    if (userId === undefined || userId === null || userId === '') throw new TypeError('login(userId) needs an id');
    const id = String(userId);
    const generation = await this.users.generation(id, this.request);
    this.regenerate();
    this.data.__user = { id, generation };
    return this;
  }

  // Unties the user, and ends the session.
  logout() {
    return this.destroy();
  }

  // Ends every session of the user of this one, this one too.
  async logoutEverywhere() {
    this.usersNeeded();
    if (this.user !== null) await this.users.raise(this.user);
    return this.destroy();
  }

  // Ends every other session of the user of this one: this one goes on (with a new id).
  async logoutOthers() {
    this.usersNeeded();
    if (this.user === null) return this;
    const generation = await this.users.raise(this.user);
    this.regenerate();
    this.data.__user = { id: this.user, generation };
    return this;
  }

  // Ends the session: its values go, and the cookie is cleared.
  destroy() {
    this.destroyed = true;
    this.data = {};
    this.changed = true;
    return this;
  }

  // flash(key, value): a value for the next request. flash(key): the value the last request left (once).
  flash(key, value) {
    if (arguments.length >= 2) {
      this.nextFlash[key] = value;
      this.changed = true;
      return this;
    }
    return this.flashed[key];
  }

  // Messages for the user (Django's messages): message(text, level) keeps one for the page shown next (this request's,
  // or the next one's after a redirect); messages() gives those waiting, as { text, level }, once.
  message(text, level = 'info') {
    const pending = this.nextFlash.__messages || [];
    this.nextFlash.__messages = [...pending, { text: String(text), level }];
    this.changed = true;
    return this;
  }

  messages() {
    const shown = [...(this.flashed.__messages || []), ...(this.nextFlash.__messages || [])];
    if (this.flashed.__messages) delete this.flashed.__messages;
    if (this.nextFlash.__messages) {
      delete this.nextFlash.__messages;
      this.changed = true;
    }
    return shown;
  }

  // The token of the forms of this session (made once): in the session when it keeps something (and then, that of the
  // cookie, if the browser had one), else in the cookie only.
  csrfToken() {
    if (this.data.__csrf) return this.data.__csrf;
    if (this.empty) {
      if (!this.cookieCsrf) {
        this.cookieCsrf = crypto.randomBytes(24).toString('base64url');
        this.cookieCsrfMade = true;
      }
      return this.cookieCsrf;
    }
    this.data.__csrf = this.cookieCsrf || crypto.randomBytes(24).toString('base64url');
    this.changed = true;
    return this.data.__csrf;
  }

  checkCsrf(token) {
    const expected = this.data.__csrf || this.cookieCsrf;
    if (!expected || typeof token !== 'string' || token.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  }

  // What is kept: the values, and the flash for the next request.
  toStore() {
    const data = { ...this.data };
    if (Object.keys(this.nextFlash).length) data.__flash = this.nextFlash;
    return data;
  }

  get empty() {
    return Object.keys(this.toStore()).length === 0;
  }
}

// The handle of a session id: a hash of it (the id opens the session; its handle only names it).
function handleOf(id) {
  return crypto.createHash('sha256').update(String(id)).digest('base64url').slice(0, 22);
}

export { Session, handleOf };
