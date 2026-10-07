'use strict';

// The session of a request (request.session): values kept between the requests of a browser, by a cookie with its
// id. Changes are saved when the reply is sent; regenerate() gives it a new id (after a login: an id known before it
// is worth nothing), destroy() ends it. flash() keeps a value for the next request only (as Rails and Laravel), and
// csrfToken() gives the token forms send back.
const crypto = require('node:crypto');
const { newId } = require('./cookie');

class Session {
  constructor(id, data, { fresh }) {
    this.id = id;
    this.data = data || {};
    this.fresh = fresh;
    this.changed = false;
    this.destroyed = false;
    this.previousId = null;
    // The flash of the last request: read in this one, gone in the next.
    this.flashed = this.data.__flash || {};
    delete this.data.__flash;
    if (Object.keys(this.flashed).length) this.changed = true;
    this.nextFlash = {};
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    if (key === '__flash' || key === '__csrf') throw new TypeError(`${key} is a key of the session itself`);
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
    return values;
  }

  clear() {
    const csrf = this.data.__csrf;
    this.data = csrf ? { __csrf: csrf } : {};
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

  // The token of the forms of this session (made once).
  csrfToken() {
    if (!this.data.__csrf) {
      this.data.__csrf = crypto.randomBytes(24).toString('base64url');
      this.changed = true;
    }
    return this.data.__csrf;
  }

  checkCsrf(token) {
    const expected = this.data.__csrf;
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

module.exports = { Session };
