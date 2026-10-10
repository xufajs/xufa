// Cookies of the session: the header Cookie read, a Set-Cookie written (RFC 6265), and the id of a session signed with
// HMAC-SHA256 (id.signature, base64url), checked with every secret given (the first signs: secrets can be rotated).
import crypto from 'node:crypto';

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const name = part.slice(0, at).trim();
    let value = part.slice(at + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (name && !(name in cookies)) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }
  return cookies;
}

function serializeCookie(name, value, options = {}) {
  let text = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) text += `; Max-Age=${Math.floor(options.maxAge / 1000)}`;
  if (options.expires) text += `; Expires=${options.expires.toUTCString()}`;
  if (options.domain) text += `; Domain=${options.domain}`;
  text += `; Path=${options.path || '/'}`;
  if (options.httpOnly !== false) text += '; HttpOnly';
  if (options.secure) text += '; Secure';
  if (options.sameSite)
    text += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1).toLowerCase()}`;
  if (options.partitioned) text += '; Partitioned';
  return text;
}

const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(value).digest('base64url');

function sign(value, secret) {
  return `${value}.${hmac(secret, value)}`;
}

// The value of a signed text, or null when no secret signed it.
function unsign(signed, secrets) {
  const at = String(signed).lastIndexOf('.');
  if (at <= 0) return null;
  const value = signed.slice(0, at);
  const given = Buffer.from(signed.slice(at + 1));
  for (const secret of secrets) {
    const expected = Buffer.from(hmac(secret, value));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return value;
  }
  return null;
}

const newId = () => crypto.randomBytes(24).toString('base64url');

export { parseCookies, serializeCookie, sign, unsign, newId };
