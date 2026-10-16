// One-time passwords of authenticator apps: TOTP (RFC 6238) over HOTP (RFC 4226), with secrets in base32 (RFC 4648)
// as the apps take them, in otpauth:// URIs (the QR codes they scan).
//
//   const secret = generateSecret();                        // kept with the user (encrypted, ideally)
//   const uri = totpUri({ secret, issuer: 'App', label: 'ada@example.com' });
//   const step = verifyTotp(code, secret, { after: user.lastTotpStep });  // null, or the step to keep
//
// verifyTotp() returns the time step of the code, so that a code is used once: keep it and give it as `after` next
// time (a code of that step or before is refused).
import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const ALGORITHMS = { SHA1: 'sha1', SHA256: 'sha256', SHA512: 'sha512' };

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// Base32 text to bytes: spaces, dashes, padding and the case are ignored (as people type them).
function base32Decode(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new TypeError(`Not a base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// A random secret in base32: 20 bytes (160 bits, as RFC 4226 recommends) by default.
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function settingsOf(options = {}) {
  const { digits = 6, period = 30, algorithm = 'SHA1' } = options;
  if (!ALGORITHMS[algorithm]) throw new TypeError(`The algorithm of TOTP is SHA1, SHA256 or SHA512, not ${algorithm}`);
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) throw new RangeError('digits must be from 6 to 10');
  if (!Number.isInteger(period) || period < 1) throw new RangeError('period must be a positive number of seconds');
  return { digits, period, algorithm };
}

// The code of a counter (HOTP), as text of `digits` digits.
function hotp(secret, counter, options = {}) {
  const { digits, algorithm } = settingsOf(options);
  const key = Buffer.isBuffer(secret) ? secret : base32Decode(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac(ALGORITHMS[algorithm], key).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// The step of a time (seconds since the epoch by default: now).
const stepOf = (time, period) => Math.floor((time === undefined ? Date.now() / 1000 : time) / period);

// The code of now (or of options.time, in seconds).
function totp(secret, options = {}) {
  const settings = settingsOf(options);
  return hotp(secret, stepOf(options.time, settings.period), settings);
}

// The step of a code that is valid now (within `window` steps before and after, 1 by default: 30 seconds of clock
// difference), or null. A code of the step `after` or before is refused (it was used already).
function verifyTotp(code, secret, options = {}) {
  const settings = settingsOf(options);
  const { window = 1, after } = options;
  const text = String(code === undefined || code === null ? '' : code).replace(/\s/g, '');
  if (!new RegExp(`^\\d{${settings.digits}}$`).test(text)) return null;
  const current = stepOf(options.time, settings.period);
  let found = null;
  // Every step of the window is computed (not stopping at the first match), so the time does not tell which one.
  for (let delta = -window; delta <= window; delta += 1) {
    const step = current + delta;
    if (step < 0 || (after !== undefined && after !== null && step <= after)) continue;
    const expected = Buffer.from(hotp(secret, step, settings));
    if (crypto.timingSafeEqual(expected, Buffer.from(text)) && found === null) found = step;
  }
  return found;
}

// The otpauth:// URI of a secret, for the QR code an authenticator app scans.
function totpUri({ secret, label, issuer, ...options }) {
  if (!label) throw new TypeError('totpUri needs a label (the account: an email, a user name)');
  const { digits, period, algorithm } = settingsOf(options);
  // Percent-encoded (a space is %20, as the apps read it), the issuer and the account each on its own, so that a ':'
  // of either is not the one between them.
  const e = encodeURIComponent;
  const name = issuer ? `${e(issuer)}:${e(label)}` : e(label);
  const params = [`secret=${e(String(secret).replace(/[\s=]/g, '').toUpperCase())}`];
  if (issuer) params.push(`issuer=${e(issuer)}`);
  if (algorithm !== 'SHA1') params.push(`algorithm=${algorithm}`);
  if (digits !== 6) params.push(`digits=${digits}`);
  if (period !== 30) params.push(`period=${period}`);
  return `otpauth://totp/${name}?${params.join('&')}`;
}

const URI = /^otpauth:\/\/([ht]otp)\/(.+)\?([A-Z0-9.~_-]+=[^?&]*(?:&[A-Z0-9.~_-]+=[^?&]*)*)$/i;
const SECRET = /^[2-7A-Z]+=*$/i;
const ALGORITHM = /^SHA(?:1|224|256|384|512|3-224|3-256|3-384|3-512)$/i;
const INTEGER = /^[+-]?\d+$/;
const POSITIVE_INTEGER = /^\+?[1-9]\d*$/;

/**
 * An otpauth:// URI read back (the Key Uri Format, as authenticator apps and the otpauth package read it):
 * { type: 'totp' | 'hotp', secret (base32), label, issuer, algorithm, digits, period (totp), counter (hotp) }, the
 * settings it does not give at their defaults (SHA1, 6, 30). The issuer is the parameter, or the label's part before
 * ':'. A URIError or TypeError when it is not one.
 */
function parseTotpUri(uri) {
  const match = typeof uri === 'string' ? URI.exec(uri) : null;
  if (!match) throw new URIError('Invalid URI format');
  const type = match[1].toLowerCase();
  const [first, account] = match[2].split(/(?::|%3A) *(.+)/i, 2).map(decodeURIComponent);
  const params = {};
  for (const pair of match[3].split('&')) {
    const [key, value] = pair.split(/=(.*)/, 2).map(decodeURIComponent);
    params[key.toLowerCase()] = value;
  }
  const result = { type, secret: '', label: '', issuer: '', algorithm: 'SHA1', digits: 6 };
  if (type === 'hotp') {
    if (params.counter === undefined || !INTEGER.test(params.counter)) {
      throw new TypeError("Missing or invalid 'counter' parameter");
    }
    result.counter = parseInt(params.counter, 10);
  } else {
    result.period = 30;
    if (params.period !== undefined) {
      if (!POSITIVE_INTEGER.test(params.period)) throw new TypeError("Invalid 'period' parameter");
      result.period = parseInt(params.period, 10);
    }
  }
  if (params.issuer !== undefined) result.issuer = params.issuer;
  if (account !== undefined) {
    result.label = account;
    if (result.issuer === '') result.issuer = first;
  } else {
    result.label = first;
  }
  if (params.secret === undefined || !SECRET.test(params.secret)) {
    throw new TypeError("Missing or invalid 'secret' parameter");
  }
  result.secret = params.secret.toUpperCase();
  if (params.algorithm !== undefined) {
    if (!ALGORITHM.test(params.algorithm)) throw new TypeError("Invalid 'algorithm' parameter");
    result.algorithm = params.algorithm.toUpperCase();
  }
  if (params.digits !== undefined) {
    if (!POSITIVE_INTEGER.test(params.digits)) throw new TypeError("Invalid 'digits' parameter");
    result.digits = parseInt(params.digits, 10);
  }
  return result;
}

// Codes to log in once without the app (when it is lost): `count` random codes as 'xxxx-xxxx' (base32 lower case).
// Keep them hashed (hashRecoveryCode) and compare the hash of the one given.
function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const code = base32Encode(crypto.randomBytes(5)).toLowerCase();
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  });
}

// The hash of a recovery code (SHA-256 of its characters, without dashes or case), to keep it and look it up.
function hashRecoveryCode(code) {
  const clean = String(code).toLowerCase().replace(/[\s-]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

export {
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  totp,
  verifyTotp,
  totpUri,
  parseTotpUri,
  generateRecoveryCodes,
  hashRecoveryCode,
};
