// The messages of @xufa/auth that users read (logins, passwords, authenticator apps, accounts and their emails), by
// key, in English; a translator (setTranslator(), as i18n.translateAuth(auth) of @xufa/i18n installs) gives them in
// the language of the request, as auth.<key>. The errors of a wrong setup (an option missing) stay in English: they
// are for the developer.
const MESSAGES = {
  // Logins (the reasons of a CredentialError).
  missing: 'Write your user and password',
  invalid: 'Wrong user or password',
  invalidEmail: 'Wrong email or password',
  code: 'The code of your authenticator app',
  wrongCode: 'Wrong code',
  locked: 'This account is locked',
  throttled: 'Too many failed attempts: try again later',
  // The account of a user.
  wrongPassword: 'Wrong password',
  notYours: 'Not your password',
  sameAsBefore: 'The same as before',
  passwordsDiffer: "The two password fields didn't match.",
  pending: 'Start again: scan a new code',
  noTotp: 'Set up an authenticator app first',
  noPasswords: 'Passwords are not changed here',
  noApps: 'Authenticator apps are not set up here',
  noRecovery: 'Recovery codes are not kept here',
  // The policy of passwords.
  tooShort: 'At least {min} characters',
  tooLong: 'At most {max} characters',
  emailInPassword: 'It cannot have your email in it',
  // The accounts plugin.
  notValid: 'The data is not valid',
  anEmail: 'An email',
  aPassword: 'A password',
  aUsername: 'A username',
  emailTaken: 'Email taken',
  emailTakenField: 'There is an account with this email already',
  logInFirst: 'Log in first',
  forbidden: 'You cannot do this ({permission})',
  verifyFirst: 'Verify your email first',
  linkExpired: 'This link is not valid any more: ask for another',
  expiredOrUsed: 'Expired or used',
  expired: 'Expired',
  sessionInUse: 'This is the session in use: log out to end it',
  noSession: 'No such session',
  resetSent: 'If there is an account with this email, a link to reset its password is on its way',
  // The emails of the links ({app}: the name of the app, with its words before it, or nothing).
  resetSubject: 'Reset your password{app}',
  resetBody: 'Someone (we hope you) asked to reset the password of this account.',
  resetButton: 'Reset the password',
  resetFoot: 'The link works once, for {minutes} minutes. If it was not you, nothing changes.',
  verifySubject: 'Verify your email{app}',
  verifyBody: 'Confirm that this address is yours.',
  verifyButton: 'Verify the email',
  ofApp: ' of {name}',
  forApp: ' for {name}',
  // The pages of auth.pages (their titles, texts, buttons and the labels of their fields).
  pageLogIn: 'Log in',
  pageLoggedOut: 'Logged out',
  pageLoggedOutText: 'Thanks for spending some quality time with the web site today.',
  pageLogInAgain: 'Log in again',
  pagePasswordChange: 'Password change',
  pageChangePassword: 'Change my password',
  pagePasswordChanged: 'Password change successful',
  pagePasswordChangedText: 'Your password was changed.',
  pagePasswordReset: 'Password reset',
  pagePasswordResetText:
    "Forgotten your password? Enter your email address below, and we'll email instructions for setting a new one.",
  pageResetPassword: 'Reset my password',
  pageResetSent: 'Password reset sent',
  pageResetSentText:
    "We've emailed you instructions for setting your password, if an account exists with the email you entered. You should receive them shortly.",
  pageResetSentHint:
    "If you don't receive an email, please make sure you've entered the address you registered with, and check your spam folder.",
  pageNewPassword: 'Enter new password',
  pageNewPasswordText: 'Please enter your new password twice so we can verify you typed it in correctly.',
  pageResetFailed: 'Password reset unsuccessful',
  pageResetFailedText:
    'The password reset link was invalid, possibly because it has already been used. Please request a new password reset.',
  pageResetComplete: 'Password reset complete',
  pageResetCompleteText: 'Your password has been set. You may go ahead and log in now.',
  labelUsername: 'Username',
  labelEmail: 'Email',
  labelPassword: 'Password',
  labelCode: 'Code',
  labelOldPassword: 'Old password',
  labelNewPassword: 'New password',
  labelNewPassword2: 'New password confirmation',
};

let translator = null;

const fill = (text, params) =>
  text.replace(/\{(\w+)\}/g, (whole, name) => (params && params[name] !== undefined ? String(params[name]) : whole));

// The message of a key (auth.<key> for the translator), with its parameters.
function message(key, params = {}) {
  if (!Object.hasOwn(MESSAGES, key)) throw new TypeError(`No message of @xufa/auth named ${key}`);
  const english = fill(MESSAGES[key], params);
  if (!translator) return english;
  const translated = translator(`auth.${key}`, params, english);
  return typeof translated === 'string' ? translated : english;
}

// A message given in options: auth.<key> is a message of these; a key of the app's catalogs is translated; any other
// text stays as it is.
function custom(text, params = {}) {
  if (typeof text !== 'string') return text;
  const own = /^auth\.(\w+)$/.exec(text);
  if (own && Object.hasOwn(MESSAGES, own[1])) return message(own[1], params);
  if (!translator) return text;
  const translated = translator(text, params, text);
  return typeof translated === 'string' ? translated : text;
}

// The translator of the messages: fn(key, params, english) giving the text, or null to stop translating.
function setTranslator(fn) {
  if (fn !== null && typeof fn !== 'function') throw new TypeError('setTranslator(fn): a function, or null');
  translator = fn;
}

export { MESSAGES, message, custom, setTranslator };
