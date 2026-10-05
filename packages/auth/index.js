// @xufa/auth: the authentication of xufa, with no dependencies: passwords (scrypt), JSON Web Tokens with keys that
// rotate, one-time codes of authenticator apps (TOTP), logins locked after failures, refresh tokens that rotate, and
// the plugin of @xufa/http that puts them together, with strategies (API keys, HTTP Basic, and those of Passport).
//
//   const auth = require('@xufa/auth');
//   app.register(auth.plugin, {
//     keys: process.env.JWT_KEY,
//     login: { findUser: (username) => User.objects.filter({ email: username }).first() },
//   });
//   app.get('/me', { config: { auth: true } }, (request) => request.user);
const { hashPassword, verifyPassword, needsRehash, PASSWORD_DEFAULTS } = require('./lib/password');
const { KeySet } = require('./lib/keys');
const { signJwt, signJwtAsync, verifyJwt, verifyJwtAsync, decodeJwt } = require('./lib/jwt-keyset');
const totp = require('./lib/totp');
const { Lockout, MemoryStore } = require('./lib/lockout');
const { RefreshTokens, MemoryTokenStore, modelStore, refreshTokenFields } = require('./lib/refresh');
const { parseCookies, serializeCookie } = require('./lib/cookies');
const { KeyVault, MemoryKeyStore, vaultModelStore, vaultFields, VaultError } = require('./lib/vault');
const { authPlugin } = require('./lib/plugin');
const {
  apiKey,
  apiKeyFields,
  basic,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
} = require('./lib/strategies');
const { passport, oauthState } = require('./lib/passport');
const errors = require('./lib/errors');

module.exports = {
  plugin: authPlugin,
  hashPassword,
  verifyPassword,
  needsRehash,
  PASSWORD_DEFAULTS,
  KeySet,
  KeyVault,
  MemoryKeyStore,
  vaultModelStore,
  vaultFields,
  VaultError,
  signJwt,
  signJwtAsync,
  verifyJwt,
  verifyJwtAsync,
  decodeJwt,
  ...totp,
  Lockout,
  MemoryStore,
  RefreshTokens,
  MemoryTokenStore,
  modelStore,
  refreshTokenFields,
  parseCookies,
  serializeCookie,
  apiKey,
  apiKeyFields,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
  basic,
  passport,
  oauthState,
  ...errors,
};
