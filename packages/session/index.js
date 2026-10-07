'use strict';

// @xufa/session: sessions of browsers for @xufa/http: signed cookies, stores in memory or in a database of
// @xufa/orm, flash messages and CSRF tokens.
const { sessionPlugin, SessionError } = require('./lib/plugin');
const { Session } = require('./lib/session');
const { memoryStore, ormStore } = require('./lib/stores');
const { parseCookies, serializeCookie, sign, unsign } = require('./lib/cookie');

module.exports = {
  sessionPlugin,
  plugin: sessionPlugin,
  Session,
  SessionError,
  memoryStore,
  ormStore,
  parseCookies,
  serializeCookie,
  sign,
  unsign,
};
