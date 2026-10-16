// Redirects for the http adapter, as axios follows them on Node (with follow-redirects): a Writable request that
// keeps the body it was given, and on a 3xx with Location makes the next request (the body again; GET without it
// after 301/302 of a POST and 303 of anything but GET/HEAD), at most maxRedirects times. Authorization, Cookie and
// Proxy-Authorization are dropped when the host changes (subdomains keep them) or https goes to http. The response
// has responseUrl and redirects (with trackRedirects).
//
// And getProxyForUrl(): the proxy of the environment for a URL (http_proxy / https_proxy / all_proxy, small letters
// first, and no_proxy), as axios reads it (proxy-from-env 2).
import http from 'node:http';
import https from 'node:https';
import { Writable } from 'node:stream';

const SENSITIVE_HEADERS = ['Authorization', 'Proxy-Authorization', 'Cookie'];
const URL_FIELDS = [
  'auth',
  'host',
  'hostname',
  'href',
  'path',
  'pathname',
  'port',
  'protocol',
  'query',
  'search',
  'hash',
];
const EVENTS = ['abort', 'aborted', 'connect', 'error', 'socket', 'timeout'];

// The events of the request of the moment, emitted by the redirectable one.
const eventHandlers = Object.create(null);
for (const event of EVENTS) {
  eventHandlers[event] = function (arg1, arg2, arg3) {
    this._redirectable.emit(event, arg1, arg2, arg3);
  };
}

// Errors of follow-redirects' kinds: their codes and messages ('Error [CODE]' names).
function errorType(code, message, Base = Error) {
  class RedirectError extends Base {
    constructor(properties) {
      super();
      Object.assign(this, properties || {});
      this.code = code;
      this.message = this.cause ? `${message}: ${this.cause.message}` : message;
    }
  }
  Object.defineProperty(RedirectError.prototype, 'name', { value: `Error [${code}]`, enumerable: false });
  return RedirectError;
}

const InvalidUrlError = errorType('ERR_INVALID_URL', 'Invalid URL', TypeError);
const RedirectionError = errorType('ERR_FR_REDIRECTION_FAILURE', 'Redirected request failed');
const TooManyRedirectsError = errorType(
  'ERR_FR_TOO_MANY_REDIRECTS',
  'Maximum number of redirects exceeded',
  RedirectionError
);
const MaxBodyLengthExceededError = errorType(
  'ERR_FR_MAX_BODY_LENGTH_EXCEEDED',
  'Request body larger than maxBodyLength limit'
);
const WriteAfterEndError = errorType('ERR_STREAM_WRITE_AFTER_END', 'write after end');

const isString = (value) => typeof value === 'string' || value instanceof String;
const isFunction = (value) => typeof value === 'function';
const noop = () => {};
const escapeRegex = (text) => text.replace(/[[\]\\/()*+?.^$|]/g, '\\$&');

function destroyRequest(request, error) {
  for (const event of EVENTS) request.removeListener(event, eventHandlers[event]);
  request.on('error', noop);
  request.destroy(error);
}

function validateUrl(input) {
  if (/^\[/.test(input.hostname) && !/^\[[:0-9a-f]+\]$/i.test(input.hostname)) {
    throw new InvalidUrlError({ input: input.href || input });
  }
  if (/^\[/.test(input.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(input.host)) {
    throw new InvalidUrlError({ input: input.href || input });
  }
  return input;
}

// The fields of a URL on options of http.request() (hostname without brackets, port a number, path with the query).
function spreadUrlObject(url, target = {}) {
  for (const key of URL_FIELDS) target[key] = url[key];
  if (target.hostname.startsWith('[')) target.hostname = target.hostname.slice(1, -1);
  if (target.port !== '') target.port = Number(target.port);
  target.path = target.search ? target.pathname + target.search : target.pathname;
  return target;
}

// Deletes the headers whose names match; the last value deleted (trimmed), if any.
function removeMatchingHeaders(regex, headers) {
  let lastValue;
  for (const header in headers) {
    if (regex.test(header)) {
      lastValue = headers[header];
      delete headers[header];
    }
  }
  return lastValue === null || lastValue === undefined ? undefined : String(lastValue).trim();
}

function isSubdomain(subdomain, domain) {
  const dot = subdomain.length - domain.length - 1;
  return dot > 0 && subdomain[dot] === '.' && subdomain.endsWith(domain);
}

// The URL of options of http.request(), as url.format() writes it.
function formatUrl(options) {
  const auth = options.auth ? `${encodeURIComponent(options.auth).replace(/%3A/i, ':')}@` : '';
  let host = options.host;
  if (!host) {
    const hostname = options.hostname || '';
    host =
      (hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname) +
      (options.port ? `:${options.port}` : '');
  }
  const protocol = options.protocol || '';
  const pathname = options.pathname || '';
  const search = options.search || '';
  return `${protocol}${protocol || host ? '//' : ''}${auth}${host}${pathname}${search}${options.hash || ''}`;
}

class RedirectableRequest extends Writable {
  constructor(options, responseCallback) {
    super();
    this._sanitizeOptions(options);
    this._options = options;
    this._ended = false;
    this._ending = false;
    this._redirectCount = 0;
    this._redirects = [];
    this._requestBodyLength = 0;
    this._requestBodyBuffers = [];
    if (responseCallback) this.on('response', responseCallback);
    this._onNativeResponse = (response) => {
      try {
        this._processResponse(response);
      } catch (cause) {
        this.emit('error', cause instanceof RedirectionError ? cause : new RedirectionError({ cause }));
      }
    };
    this._headerFilter = new RegExp(
      `^(?:${SENSITIVE_HEADERS.concat(options.sensitiveHeaders).map(escapeRegex).join('|')})$`,
      'i'
    );
    this._performRequest();
  }

  abort() {
    destroyRequest(this._currentRequest);
    this._currentRequest.abort();
    this.emit('abort');
  }

  destroy(error) {
    destroyRequest(this._currentRequest, error);
    super.destroy(error);
    return this;
  }

  // The body is kept (to send again after a redirect), up to maxBodyLength.
  write(data, encoding, callback) {
    if (this._ending) throw new WriteAfterEndError();
    if (!isString(data) && !(typeof data === 'object' && 'length' in data)) {
      throw new TypeError('data should be a string, Buffer or Uint8Array');
    }
    if (isFunction(encoding)) {
      callback = encoding;
      encoding = null;
    }
    if (data.length === 0) {
      if (callback) callback();
      return;
    }
    if (this._requestBodyLength + data.length <= this._options.maxBodyLength) {
      this._requestBodyLength += data.length;
      this._requestBodyBuffers.push({ data, encoding });
      this._currentRequest.write(data, encoding, callback);
    } else {
      this.emit('error', new MaxBodyLengthExceededError());
      this.abort();
    }
  }

  end(data, encoding, callback) {
    if (isFunction(data)) {
      callback = data;
      data = encoding = null;
    } else if (isFunction(encoding)) {
      callback = encoding;
      encoding = null;
    }
    if (!data) {
      this._ended = this._ending = true;
      this._currentRequest.end(null, null, callback);
    } else {
      const currentRequest = this._currentRequest;
      this.write(data, encoding, () => {
        this._ended = true;
        currentRequest.end(null, null, callback);
      });
      this._ending = true;
    }
    return this;
  }

  setHeader(name, value) {
    this._options.headers[name] = value;
    this._currentRequest.setHeader(name, value);
  }

  removeHeader(name) {
    delete this._options.headers[name];
    this._currentRequest.removeHeader(name);
  }

  // A timeout over every request of the chain: 'timeout' when it passes, the socket destroyed when idle that long.
  setTimeout(msecs, callback) {
    const destroyOnTimeout = (socket) => {
      socket.setTimeout(msecs);
      socket.removeListener('timeout', socket.destroy);
      socket.addListener('timeout', socket.destroy);
    };
    const clearTimer = () => {
      if (this._timeout) {
        clearTimeout(this._timeout);
        this._timeout = null;
      }
      this.removeListener('abort', clearTimer);
      this.removeListener('error', clearTimer);
      this.removeListener('response', clearTimer);
      this.removeListener('close', clearTimer);
      if (callback) this.removeListener('timeout', callback);
      if (!this.socket) this._currentRequest.removeListener('socket', startTimer);
    };
    const startTimer = (socket) => {
      if (this._timeout) clearTimeout(this._timeout);
      this._timeout = setTimeout(() => {
        this.emit('timeout');
        clearTimer();
      }, msecs);
      destroyOnTimeout(socket);
    };
    if (callback) this.on('timeout', callback);
    if (this.socket) startTimer(this.socket);
    else this._currentRequest.once('socket', startTimer);
    this.on('socket', destroyOnTimeout);
    this.on('abort', clearTimer);
    this.on('error', clearTimer);
    this.on('response', clearTimer);
    this.on('close', clearTimer);
    return this;
  }

  flushHeaders() {
    return this._currentRequest.flushHeaders();
  }

  getHeader(name) {
    return this._currentRequest.getHeader(name);
  }

  setNoDelay(noDelay) {
    return this._currentRequest.setNoDelay(noDelay);
  }

  setSocketKeepAlive(enable, initialDelay) {
    return this._currentRequest.setSocketKeepAlive(enable, initialDelay);
  }

  get aborted() {
    return this._currentRequest.aborted;
  }

  get connection() {
    return this._currentRequest.connection;
  }

  get socket() {
    return this._currentRequest.socket;
  }

  _sanitizeOptions(options) {
    if (!options.headers) {
      options.headers = {};
    } else if (Array.isArray(options.headers)) {
      const list = options.headers;
      options.headers = {};
      for (let i = 0; i < list.length; i += 2) options.headers[list[i]] = list[i + 1];
    }
    if (!Array.isArray(options.sensitiveHeaders)) options.sensitiveHeaders = [];
    if (options.host) {
      if (!options.hostname) options.hostname = options.host;
      delete options.host;
    }
    if (!options.pathname && options.path) {
      const query = options.path.indexOf('?');
      if (query < 0) {
        options.pathname = options.path;
      } else {
        options.pathname = options.path.substring(0, query);
        options.search = options.path.substring(query);
      }
    }
  }

  _performRequest() {
    const { protocol } = this._options;
    const nativeProtocol = this._options.nativeProtocols[protocol];
    if (!nativeProtocol) throw new TypeError(`Unsupported protocol ${protocol}`);
    if (this._options.agents) this._options.agent = this._options.agents[protocol.slice(0, -1)];
    const request = (this._currentRequest = nativeProtocol.request(this._options, this._onNativeResponse));
    request._redirectable = this;
    for (const event of EVENTS) request.on(event, eventHandlers[event]);
    this._currentUrl = /^\//.test(this._options.path) ? formatUrl(this._options) : this._options.path;

    // After a redirect, the body again.
    if (this._isRedirect) {
      let i = 0;
      const buffers = this._requestBodyBuffers;
      const writeNext = (error) => {
        if (request !== this._currentRequest) return;
        if (error) {
          this.emit('error', error);
        } else if (i < buffers.length) {
          const buffer = buffers[i++];
          if (!request.finished) request.write(buffer.data, buffer.encoding, writeNext);
        } else if (this._ended) {
          request.end();
        }
      };
      writeNext();
    }
  }

  _processResponse(response) {
    const { statusCode } = response;
    if (this._options.trackRedirects) {
      this._redirects.push({ url: this._currentUrl, headers: response.headers, statusCode });
    }
    const { location } = response.headers;
    if (!location || this._options.followRedirects === false || statusCode < 300 || statusCode >= 400) {
      response.responseUrl = this._currentUrl;
      response.redirects = this._redirects;
      this.emit('response', response);
      this._requestBodyBuffers = [];
      return;
    }

    destroyRequest(this._currentRequest);
    response.destroy();
    if (++this._redirectCount > this._options.maxRedirects) throw new TooManyRedirectsError();

    let requestHeaders;
    const { beforeRedirect } = this._options;
    if (beforeRedirect) requestHeaders = { Host: response.req.getHeader('host'), ...this._options.headers };

    const { method } = this._options;
    if (
      ((statusCode === 301 || statusCode === 302) && this._options.method === 'POST') ||
      (statusCode === 303 && !/^(?:GET|HEAD)$/.test(this._options.method))
    ) {
      this._options.method = 'GET';
      this._requestBodyBuffers = [];
      removeMatchingHeaders(/^content-/i, this._options.headers);
    }

    const currentHostHeader = removeMatchingHeaders(/^host$/i, this._options.headers);
    const currentUrlParts = new URL(this._currentUrl);
    const currentHost = currentHostHeader || currentUrlParts.host;
    // A relative Location is of the host the request was sent to (its Host header, which may not be the URL's).
    let currentUrl = this._currentUrl;
    if (!/^\w+:/.test(location)) {
      const base = new URL(this._currentUrl);
      base.host = currentHost;
      currentUrl = base.href;
    }
    const redirectUrl = new URL(location, currentUrl);
    this._isRedirect = true;
    spreadUrlObject(redirectUrl, this._options);

    if (
      (redirectUrl.protocol !== currentUrlParts.protocol && redirectUrl.protocol !== 'https:') ||
      (redirectUrl.host !== currentHost && !isSubdomain(redirectUrl.host, currentHost))
    ) {
      removeMatchingHeaders(this._headerFilter, this._options.headers);
    }

    if (isFunction(beforeRedirect)) {
      beforeRedirect(
        this._options,
        { headers: response.headers, statusCode },
        { url: currentUrl, method, headers: requestHeaders }
      );
      this._sanitizeOptions(this._options);
    }
    this._performRequest();
  }
}

const nativeProtocols = { 'http:': http, 'https:': https };

// request(options, callback) of a protocol, as follow-redirects' http and https have it.
function wrap(protocol) {
  return {
    request(input, options, callback) {
      if (input instanceof URL) {
        input = spreadUrlObject(input);
      } else if (isString(input)) {
        input = spreadUrlObject(new URL(input));
      } else {
        callback = options;
        options = validateUrl(input);
        input = { protocol };
      }
      if (isFunction(options)) {
        callback = options;
        options = null;
      }
      options = { maxRedirects: 21, maxBodyLength: 10 * 1024 * 1024, ...input, ...options };
      options.nativeProtocols = nativeProtocols;
      if (!isString(options.host) && !isString(options.hostname)) options.hostname = '::1';
      if (options.protocol !== protocol) throw new Error('protocol mismatch');
      return new RedirectableRequest(options, callback);
    },
  };
}

const httpFollow = wrap('http:');
const httpsFollow = wrap('https:');

const DEFAULT_PORTS = { ftp: 21, gopher: 70, http: 80, https: 443, ws: 80, wss: 443 };

const getEnv = (key) => process.env[key.toLowerCase()] || process.env[key.toUpperCase()] || '';

// no_proxy: '*' none; host, host:port, .domain or *.domain (and subdomains: suffixes), split by commas or spaces.
function shouldProxy(hostname, port) {
  const noProxy = getEnv('no_proxy').toLowerCase();
  if (!noProxy) return true;
  if (noProxy === '*') return false;
  return noProxy.split(/[,\s]/).every((entry) => {
    if (!entry) return true;
    const parsed = entry.match(/^(.+):(\d+)$/);
    let host = parsed ? parsed[1] : entry;
    const entryPort = parsed ? parseInt(parsed[2], 10) : 0;
    if (entryPort && entryPort !== port) return true;
    if (!/^[.*]/.test(host)) return hostname !== host;
    if (host.charAt(0) === '*') host = host.slice(1);
    return !hostname.endsWith(host);
  });
}

/** The proxy of the environment for a URL ('' for none). */
function getProxyForUrl(url) {
  let parsed = url;
  if (typeof url === 'string') {
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
  }
  parsed = parsed || {};
  let { protocol, host: hostname, port } = parsed;
  if (typeof hostname !== 'string' || !hostname || typeof protocol !== 'string') return '';
  protocol = protocol.split(':', 1)[0];
  hostname = hostname.replace(/:\d*$/, '');
  port = parseInt(port, 10) || DEFAULT_PORTS[protocol] || 0;
  if (!shouldProxy(hostname, port)) return '';
  let proxy = getEnv(`${protocol}_proxy`) || getEnv('all_proxy');
  if (proxy && !proxy.includes('://')) proxy = `${protocol}://${proxy}`;
  return proxy;
}

export { httpFollow, httpsFollow, getProxyForUrl, RedirectableRequest };
