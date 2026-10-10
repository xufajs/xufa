// Cookies of requests (the Cookie header) and of replies (Set-Cookie), for the tokens kept in cookies.

// The cookies of a Cookie header, by name (the first of a name wins, as browsers send the most specific first).
function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    if (!name || Object.hasOwn(cookies, name)) continue;
    let value = part.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}

// A Set-Cookie value: HttpOnly, Secure and SameSite=Strict unless said otherwise; maxAge in seconds (0 deletes it).
function serializeCookie(name, value, options = {}) {
  const { path = '/', domain, maxAge, httpOnly = true, secure = true, sameSite = 'Strict' } = options;
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}`;
  if (domain) cookie += `; Domain=${domain}`;
  if (maxAge !== undefined) {
    cookie += `; Max-Age=${Math.floor(maxAge)}`;
    if (maxAge <= 0) cookie += '; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  }
  if (httpOnly) cookie += '; HttpOnly';
  if (secure) cookie += '; Secure';
  if (sameSite) cookie += `; SameSite=${sameSite}`;
  return cookie;
}

export { parseCookies, serializeCookie };
