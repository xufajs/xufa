// @xufa/auth: the authentication of xufa, with no dependencies: passwords (scrypt), JSON Web Tokens with keys that
// rotate, one-time codes of authenticator apps (TOTP), logins locked after failures, refresh tokens that rotate, and
// the plugin of @xufa/http that puts them together, with strategies (API keys, HTTP Basic, and those of Passport).
//
//   import * as auth from '@xufa/auth';
//   app.register(auth.plugin, {
//     keys: process.env.JWT_KEY,
//     login: { findUser: (username) => User.objects.filter({ email: username }).first() },
//   });
//   app.get('/me', { config: { auth: true } }, (request) => request.user);
import { hashPassword, verifyPassword, needsRehash, PASSWORD_DEFAULTS } from './lib/password.js';
import { KeySet } from './lib/keys.js';
import { signJwt, signJwtAsync, verifyJwt, verifyJwtAsync, decodeJwt } from './lib/jwt-keyset.js';
import { qrCode, qrSvg, QrError } from './lib/qr.js';
import { Credentials, CredentialError } from './lib/credentials.js';
import { AbstractUser, AbstractGroup, UNUSABLE_PASSWORD } from './lib/user.js';
import * as messages from './lib/messages.js';
import { Lockout, MemoryStore } from './lib/lockout.js';
import { normalizeIdentifier } from './lib/identifier.js';
import { skeleton } from './lib/confusables.js';
import { RefreshTokens, MemoryTokenStore, modelStore, refreshTokenFields } from './lib/refresh.js';
import { parseCookies, serializeCookie } from './lib/cookies.js';
import { KeyVault, MemoryKeyStore, vaultModelStore, vaultFields, VaultError } from './lib/vault.js';
import { authPlugin, rolesOf, tenantsOf, ALL_TENANTS } from './lib/plugin.js';
import { Rbac, RbacError } from './lib/rbac.js';
import { accountsPlugin, AccountError, emailOf } from './lib/accounts.js';
import { pagesPlugin } from './lib/pages.js';
import {
  apiKey,
  apiKeyFields,
  basic,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKey,
} from './lib/strategies.js';
import { passport, oauthState } from './lib/passport.js';

export * from './lib/totp.js';
export const AUTH_MESSAGES = messages.MESSAGES;
export const authMessage = messages.message;
export const setTranslator = messages.setTranslator;
export * from './lib/errors.js';

export {
  authPlugin as plugin,
  accountsPlugin as accounts,
  pagesPlugin as pages,
  AccountError,
  emailOf,
  normalizeIdentifier,
  skeleton,
  rolesOf,
  tenantsOf,
  ALL_TENANTS,
  Rbac,
  RbacError,
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
  qrCode,
  Credentials,
  AbstractUser,
  AbstractGroup,
  UNUSABLE_PASSWORD,
  CredentialError,
  qrSvg,
  QrError,
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
};
