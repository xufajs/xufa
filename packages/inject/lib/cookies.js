// Writing request cookies and reading the Set-Cookie headers of responses.

// RFC 6265 cookie-name: a token.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function serialize(name, value) {
  if (!COOKIE_NAME.test(name)) throw new TypeError(`argument name is invalid: ${name}`);
  return `${name}=${encodeURIComponent(value)}`;
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const ATTRIBUTE_NAMES = { 'max-age': 'maxAge', httponly: 'httpOnly', samesite: 'sameSite' };

// One Set-Cookie header: { name, value, path, domain, expires, maxAge, secure, httpOnly, sameSite, ... }.
function parseSetCookie(header) {
  const parts = header.split(';').filter((part) => part.trim() !== '');
  const first = parts.shift() || '';
  const eq = first.indexOf('=');
  const name = eq === -1 ? '' : first.slice(0, eq).trim();
  const rawValue = eq === -1 ? first.trim() : first.slice(eq + 1).trim();
  const cookie = { name, value: decode(rawValue) };
  for (const part of parts) {
    const index = part.indexOf('=');
    const key = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase();
    const value = index === -1 ? '' : part.slice(index + 1).trim();
    const attribute = ATTRIBUTE_NAMES[key] || key;
    if (key === 'expires') cookie.expires = new Date(value);
    else if (key === 'max-age') cookie.maxAge = Number.parseInt(value, 10);
    else if (key === 'secure' || key === 'httponly' || key === 'partitioned') cookie[attribute] = true;
    else cookie[attribute] = value;
  }
  return cookie;
}

// The cookies a response sets (what set-cookie-parser gives for it).
function parseResponseCookies(response) {
  const header = response.headers && response.headers['set-cookie'];
  if (!header) return [];
  return (Array.isArray(header) ? header : [header]).map(parseSetCookie);
}

module.exports = { serialize, parseSetCookie, parseResponseCookies };
