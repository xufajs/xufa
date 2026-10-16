// Express's request: Node's IncomingMessage with get(), accepts*(), is(), range(), and the getters query, protocol,
// secure, ip, ips, subdomains, path, host, hostname, fresh, stale and xhr. The app's settings ('trust proxy',
// 'query parser', 'subdomain offset') are read through req.app.
import http from 'node:http';
import { isIP } from 'node:net';
import { all as allAddresses } from '@xufa/http/lib/proxy-addr';
import { fresh, hasBody, parseRange, typeIs } from './headers.js';
import { acceptsCharsets, acceptsEncodings, acceptsLanguages, acceptsTypes } from './negotiate.js';
import { parsedUrl } from './url.js';

export const request = Object.create(http.IncomingMessage.prototype);

const kQuery = Symbol('xufa.express.query');

function header(name) {
  if (!name) throw new TypeError('name argument is required to req.get');
  if (typeof name !== 'string') throw new TypeError('name must be a string to req.get');
  const lower = name.toLowerCase();
  if (lower === 'referer' || lower === 'referrer') return this.headers.referrer || this.headers.referer;
  return this.headers[lower];
}

const getter = (name, get) => Object.defineProperty(request, name, { configurable: true, enumerable: true, get });

Object.assign(request, {
  get: header,
  header,

  accepts(...types) {
    return acceptsTypes(this.headers, types);
  },

  acceptsEncodings(...encodings) {
    return acceptsEncodings(this.headers, encodings);
  },

  acceptsCharsets(...charsets) {
    return acceptsCharsets(this.headers, charsets);
  },

  acceptsLanguages(...languages) {
    return acceptsLanguages(this.headers, languages);
  },

  range(size, options) {
    const range = this.get('Range');
    if (!range) return undefined;
    return parseRange(size, range, options);
  },

  // The type of the body among those given (type-is): null without a body.
  is(types, ...rest) {
    if (!hasBody(this)) return null;
    const list = Array.isArray(types) ? types : [types, ...rest].filter((type) => type !== undefined);
    return typeIs(this.headers['content-type'], list);
  },
});

// The query of the url, by the app's 'query parser fn' (an object without prototype when parsing is off). Read once
// for each url and parser: the same object until req.url changes.
getter('query', function query() {
  const parse = this.app.get('query parser fn');
  if (!parse) return Object.create(null);
  const url = parsedUrl(this);
  const cached = this[kQuery];
  if (cached !== undefined && cached.url === url && cached.parse === parse) return cached.value;
  const value = parse(url.query ?? '');
  this[kQuery] = { url, parse, value };
  return value;
});

// The protocol: https on an encrypted socket, or X-Forwarded-Proto's first when the socket's address is trusted.
getter('protocol', function protocol() {
  const proto = this.socket.encrypted ? 'https' : 'http';
  const trust = this.app.get('trust proxy fn');
  if (!trust(this.socket.remoteAddress, 0)) return proto;
  const forwarded = this.get('X-Forwarded-Proto') || proto;
  const comma = forwarded.indexOf(',');
  return comma !== -1 ? forwarded.substring(0, comma).trim() : forwarded.trim();
});

getter('secure', function secure() {
  return this.protocol === 'https';
});

// The client's address: the farthest one of X-Forwarded-For the proxies trusted give.
getter('ip', function ip() {
  const addresses = allAddresses(this, this.app.get('trust proxy fn'));
  return addresses[addresses.length - 1];
});

// The addresses of X-Forwarded-For the proxies trusted give, the farthest first (the socket's left out).
getter('ips', function ips() {
  const addresses = allAddresses(this, this.app.get('trust proxy fn'));
  addresses.reverse().pop();
  return addresses;
});

getter('subdomains', function subdomains() {
  const { hostname } = this;
  if (!hostname) return [];
  const offset = this.app.get('subdomain offset');
  const parts = !isIP(hostname) ? hostname.split('.').reverse() : [hostname];
  return parts.slice(offset);
});

getter('path', function path() {
  return parsedUrl(this).pathname;
});

// The host: X-Forwarded-Host's first when the socket's address is trusted, Host otherwise.
getter('host', function host() {
  const trust = this.app.get('trust proxy fn');
  let value = this.get('X-Forwarded-Host');
  if (!value || !trust(this.socket.remoteAddress, 0)) value = this.get('Host');
  else if (value.indexOf(',') !== -1) value = value.substring(0, value.indexOf(',')).trimEnd();
  return value || undefined;
});

getter('hostname', function hostname() {
  const { host } = this;
  if (!host) return undefined;
  const offset = host[0] === '[' ? host.indexOf(']') + 1 : 0;
  const index = host.indexOf(':', offset);
  return index !== -1 ? host.substring(0, index) : host;
});

// Whether the client's copy is the response's: GET and HEAD, of a response of 2xx or 304.
getter('fresh', function isFresh() {
  const { method, res, headers } = this;
  if (method !== 'GET' && method !== 'HEAD') return false;
  // (Without If-None-Match nor If-Modified-Since nothing is fresh: the response's headers need not be read.)
  if (!headers['if-none-match'] && !headers['if-modified-since']) return false;
  const status = res.statusCode;
  if ((status >= 200 && status < 300) || status === 304) {
    return fresh(this.headers, res.get('ETag'), res.get('Last-Modified'));
  }
  return false;
});

getter('stale', function stale() {
  return !this.fresh;
});

getter('xhr', function xhr() {
  return (this.get('X-Requested-With') || '').toLowerCase() === 'xmlhttprequest';
});
