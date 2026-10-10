// The errors of @xufa/auth: XufaErrors with a code and the status code of their answer.
import createError from '@xufa/errors';

const errors = {
  // A token (JWT) that cannot be used: malformed, signed by no known key, expired, not yet valid or with claims that
  // are not the expected ones. Its `reason` says which.
  TokenError: createError('XUFA_AUTH_INVALID_TOKEN', '%s', 401),
  // A request without credentials, or with credentials that are not valid.
  Unauthorized: createError('XUFA_AUTH_UNAUTHORIZED', '%s', 401),
  // A login with the right password of a user with an authenticator app (TOTP), without its code: the client asks
  // for the code and sends the login again with it.
  TotpRequired: createError('XUFA_AUTH_TOTP_REQUIRED', '%s', 401),
  // An authenticated user without the role or permission a route needs.
  Forbidden: createError('XUFA_AUTH_FORBIDDEN', '%s', 403),
  // Too many failed logins: the account is locked for a while (retryAfter, in seconds).
  Locked: createError('XUFA_AUTH_LOCKED', '%s', 429),
};

export default errors;
export const { TokenError, Unauthorized, TotpRequired, Forbidden, Locked } = errors;
