// A client of an app for tests, as Django's test Client: a browser over inject() that keeps its cookies, posts forms
// (with the CSRF token of its session, as a browser's page would have it), logs in (login(credentials) with the
// accounts of @xufa/auth, forceLogin(user) without a password), follows redirects, and says which views of
// @xufa/template a response rendered, with their context (assertTemplateUsed, response.context).
//
//   const client = new TestClient(app);
//   await client.forceLogin(librarian);
//   const res = await client.get('/catalog/books/', { page: 2 });
//   res.templates;            // ['catalog/book_list']
//   res.context.bookList;     // the objects of the page
//   await client.post('/catalog/author/create/', { firstName: 'Ada', lastName: 'Lovelace' }, { follow: true });
import diagnostics from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';

const RENDERS = 'xufa:template:render';
const MARK = 'x-xufa-test-client';
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HTML = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

// The text a reader sees of a page: without tags, scripts and styles, entities read, in one line.
function textOf(html) {
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  return String(html)
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (whole, name) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();
}

// A form as application/x-www-form-urlencoded: lists as the same name again; null and undefined left out.
function encodeForm(data) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data || {})) {
    for (const item of [].concat(value)) {
      if (item === undefined || item === null) continue;
      body.append(key, item instanceof Date ? item.toISOString() : String(item));
    }
  }
  return body.toString();
}

class TestClient {
  // headers: sent with every request (Accept of a browser by default). enforceCsrfChecks: true sends no token (as
  // Django's Client(enforce_csrf_checks=True)).
  constructor(app, { headers = {}, enforceCsrfChecks = false } = {}) {
    if (!app || typeof app.inject !== 'function') throw new TypeError('TestClient(app): an app of @xufa/http');
    this.app = app;
    this.headers = { accept: HTML, ...headers };
    this.enforceCsrfChecks = enforceCsrfChecks;
    this.cookies = new Map();
  }

  // The Cookie header of the cookies kept.
  get cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  // Set-Cookie headers kept (a cookie that expires is taken out).
  keep(setCookie) {
    for (const line of [].concat(setCookie || [])) {
      const [pair, ...attributes] = String(line).split(';');
      const at = pair.indexOf('=');
      if (at < 1) continue;
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      const expired = attributes.some((attribute) => {
        const [key, given] = attribute.split('=').map((part) => part && part.trim());
        if (/^max-age$/i.test(key)) return Number(given) <= 0;
        if (/^expires$/i.test(key)) return Date.parse(given) <= Date.now();
        return false;
      });
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  // A request of inject() with the cookies (and the CSRF token of the session, for writes), and what it rendered:
  // res.templates (the names of the views), res.context (that of the last one), res.textContent.
  async request(options) {
    const method = (options.method || 'GET').toUpperCase();
    const mark = randomUUID();
    const headers = { ...this.headers, ...options.headers, [MARK]: mark };
    const cookie = this.cookieHeader;
    if (cookie) headers.cookie = cookie;
    if (UNSAFE.has(method) && !this.enforceCsrfChecks && cookie && !headers['x-csrf-token']) {
      const { sessions } = this.app;
      const token = sessions && typeof sessions.csrfTokenOf === 'function' ? await sessions.csrfTokenOf(cookie) : null;
      if (token) headers['x-csrf-token'] = token;
    }
    const rendered = [];
    const listen = (message) => {
      if (message.request && message.request.headers[MARK] === mark) rendered.push(message);
    };
    diagnostics.subscribe(RENDERS, listen);
    let res;
    try {
      res = await this.app.inject({ ...options, method, headers });
    } finally {
      diagnostics.unsubscribe(RENDERS, listen);
    }
    this.keep(res.headers['set-cookie']);
    res.templates = rendered.map((item) => item.name);
    res.context = rendered.length ? rendered[rendered.length - 1].context : null;
    res.contexts = rendered.map((item) => item.context);
    Object.defineProperty(res, 'textContent', { get: () => textOf(res.body), configurable: true });
    return res;
  }

  // Follows the redirects of a response (GET, as browsers do after a form), up to 20: res.redirectChain.
  async follow(res, chain = []) {
    let current = res;
    while (current.statusCode >= 300 && current.statusCode < 400 && current.headers.location) {
      if (chain.length >= 20) throw new Error('TestClient: more than 20 redirects');
      chain.push([current.headers.location, current.statusCode]);
      const next = new URL(current.headers.location, 'http://localhost');
      current = await this.request({ method: 'GET', url: `${next.pathname}${next.search}` });
    }
    current.redirectChain = chain;
    return current;
  }

  async send(method, url, data, { json = false, headers = {}, follow = false, query } = {}) {
    const options = { method, url: withQuery(url, query), headers };
    if (data !== undefined && data !== null) {
      if (json) {
        options.payload = JSON.stringify(data);
        options.headers = { 'content-type': 'application/json', accept: 'application/json', ...headers };
      } else if (typeof data === 'string' || Buffer.isBuffer(data)) {
        options.payload = data;
      } else {
        options.payload = encodeForm(data);
        options.headers = { 'content-type': 'application/x-www-form-urlencoded', ...headers };
      }
    } else if (json) {
      options.headers = { accept: 'application/json', ...headers };
    }
    const res = await this.request(options);
    return follow ? this.follow(res) : res;
  }

  // get(url, query, { follow, headers, json }): the query as an object (Django's client.get('/books/', { page: 2 })).
  get(url, query, options = {}) {
    return this.send('GET', url, null, { ...options, query });
  }

  head(url, query, options = {}) {
    return this.send('HEAD', url, null, { ...options, query });
  }

  // post(url, data, { json, follow, headers }): data as a form (or JSON with json: true, or a string as it is).
  post(url, data = {}, options = {}) {
    return this.send('POST', url, data, options);
  }

  put(url, data, options = {}) {
    return this.send('PUT', url, data, options);
  }

  patch(url, data, options = {}) {
    return this.send('PATCH', url, data, options);
  }

  delete(url, data, options = {}) {
    return this.send('DELETE', url, data, options);
  }

  // Django's force_login(): the user logged in, without a password, in a session of its own (that of @xufa/session,
  // through the accounts of @xufa/auth).
  async forceLogin(user) {
    const { accounts, sessions } = this.app;
    if (!accounts || !sessions || typeof sessions.open !== 'function') {
      throw new Error('forceLogin needs the accounts of @xufa/auth and the sessions of @xufa/session');
    }
    const { cookie } = await sessions.open((session) =>
      accounts.logIn({ session, headers: {}, ip: '127.0.0.1', log: this.app.log }, user)
    );
    this.keep(cookie);
  }

  // Django's login(**credentials): whether they log in (accounts.authenticate), then as forceLogin.
  async login(credentials) {
    const { accounts } = this.app;
    if (!accounts || typeof accounts.authenticate !== 'function') {
      throw new Error('login needs the accounts of @xufa/auth');
    }
    let user;
    try {
      user = await accounts.authenticate(credentials);
    } catch (err) {
      if (err.statusCode >= 400 && err.statusCode < 500) return false;
      throw err;
    }
    await this.forceLogin(user);
    return true;
  }

  // Out: its cookies forgotten (Django's logout()).
  logout() {
    this.cookies.clear();
  }
}

function withQuery(url, query) {
  if (!query || !Object.keys(query).length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${encodeForm(query)}`;
}

export { TestClient, textOf, encodeForm };
