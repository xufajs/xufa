// A client of HTTP APIs on the fetch of Node.js: a base URL, headers, query strings and JSON bodies, answers parsed,
// timeouts, retries with backoff (that wait what Retry-After says), errors by status, hooks and logs. Bound to a
// request of @xufa/http (client.for(request)), it is cancelled when the client of that request goes away
// (request.signal), logs with request.log and sends on its id (x-request-id).
//
//   const books = createClient({ baseUrl: 'https://api.example.com/v1', headers: { authorization: `Bearer ${token}` } });
//   const list = await books.get('/books', { query: { author: 'ada', page: 2 } });
//   const created = await books.post('/books', { json: { title: 'Dune' } });
//   app.get('/mine', async (request) => books.for(request).get('/books'));
const { retry, backoff } = require('./retry');
const { HTTPError, TimeoutError, RequestError } = require('./errors');

// Methods retried by default: those whose repetition does not change more than once.
const IDEMPOTENT = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE'];
// Statuses that may pass when tried again (as got retries them).
const RETRY_STATUSES = [408, 413, 429, 500, 502, 503, 504, 521, 522, 524];

const DEFAULTS = {
  baseUrl: undefined,
  headers: {},
  query: undefined,
  timeout: 30000,
  retry: {
    attempts: 3,
    methods: IDEMPOTENT,
    statuses: RETRY_STATUSES,
    delay: 100,
    factor: 2,
    maxDelay: 10000,
    maxRetryAfter: 60000,
  },
  responseType: 'auto',
  resolveBodyOnly: true,
  throwHttpErrors: true,
  requestIdHeader: 'x-request-id',
  hooks: { beforeRequest: [], afterResponse: [] },
  log: null,
  request: null,
  signal: null,
  dispatcher: undefined,
  redirect: 'follow',
};

const lowerKeys = (headers) =>
  Object.fromEntries(
    Object.entries(headers || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([name, value]) => [name.toLowerCase(), String(value)])
  );

// Options of a client and of a call, together: headers, retry and hooks are merged, the rest replaced.
function merge(base, given = {}) {
  const out = { ...base, ...given };
  out.headers = { ...lowerKeys(base.headers), ...lowerKeys(given.headers) };
  if (given.retry === false || given.retry === 0) out.retry = { ...base.retry, attempts: 1 };
  else if (typeof given.retry === 'number') out.retry = { ...base.retry, attempts: given.retry };
  else out.retry = { ...base.retry, ...(given.retry || {}) };
  const hooks = given.hooks || {};
  out.hooks = {
    beforeRequest: [...base.hooks.beforeRequest, ...[].concat(hooks.beforeRequest || [])],
    afterResponse: [...base.hooks.afterResponse, ...[].concat(hooks.afterResponse || [])],
  };
  return out;
}

// The URL of a path: absolute, or after the base URL (its path kept: '/v1' + '/books' is '/v1/books').
function urlOf(baseUrl, path, query) {
  let url;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) url = new URL(path);
  else if (baseUrl) {
    const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    url = new URL(String(path).replace(/^\//, ''), base);
  } else throw new TypeError(`${path} is not an absolute URL, and the client has no baseUrl`);
  if (query) {
    const params = query instanceof URLSearchParams ? query : null;
    if (params) params.forEach((value, key) => url.searchParams.append(key, value));
    else {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) {
          url.searchParams.append(key, item instanceof Date ? item.toISOString() : String(item));
        }
      }
    }
  }
  return url.toString();
}

// The ms Retry-After asks for (seconds or a date), or null.
function retryAfter(headers) {
  const value = headers && headers['retry-after'];
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function parse(response, type) {
  if (type === 'stream') return response.body;
  if (type === 'buffer') return Buffer.from(await response.arrayBuffer());
  const text = await response.text();
  if (type === 'text') return text;
  if (type === 'json') return text === '' ? undefined : JSON.parse(text);
  // auto: JSON when it says so, text otherwise; nothing when there is no body.
  if (text === '') return undefined;
  const contentType = response.headers.get('content-type') || '';
  if (/[/+]json\b/i.test(contentType)) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

const isStream = (body) =>
  body && typeof body === 'object' && (typeof body.pipe === 'function' || typeof body.getReader === 'function');

function createClient(defaults = {}) {
  const base = merge(DEFAULTS, defaults);

  async function send(method, path, given) {
    const o = merge(base, given);
    const verb = String(method).toUpperCase();
    const url = urlOf(o.baseUrl, path, o.query);
    const headers = { ...o.headers };
    let body = o.body;
    if (o.json !== undefined) {
      body = JSON.stringify(o.json);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }
    if (!headers.accept && (o.responseType === 'auto' || o.responseType === 'json')) {
      headers.accept = 'application/json, text/plain, */*';
    }
    // Bound to a request: its signal, its log and its id.
    const { request } = o;
    const log = o.log || (request && request.log) || null;
    if (request && o.requestIdHeader && request.id !== undefined && !headers[o.requestIdHeader]) {
      headers[o.requestIdHeader] = String(request.id);
    }
    const signals = [o.signal, request && request.signal].filter(Boolean);
    const outer = signals.length > 1 ? AbortSignal.any(signals) : signals[0] || null;

    // Retried: idempotent methods (by default), and bodies that can be sent again.
    const retryable = o.retry.methods.includes(verb) && !isStream(body);
    const attempts = retryable ? o.retry.attempts : 1;

    async function attempt(number) {
      const timeout = o.timeout ? AbortSignal.timeout(o.timeout) : null;
      const signal = outer && timeout ? AbortSignal.any([outer, timeout]) : outer || timeout || undefined;
      const call = { method: verb, url, headers, body, attempt: number };
      for (const hook of o.hooks.beforeRequest) await hook(call);
      const started = performance.now();
      if (log) log.debug({ client: { method: verb, url, attempt: number } }, 'outgoing request');
      let response;
      try {
        response = await fetch(call.url, {
          method: verb,
          headers: call.headers,
          body: call.body,
          signal,
          redirect: o.redirect,
          ...(o.dispatcher ? { dispatcher: o.dispatcher } : {}),
          ...(isStream(call.body) ? { duplex: 'half' } : {}),
        });
      } catch (err) {
        // The caller (or the client of the request) went away: its reason, as it is.
        if (outer && outer.aborted) throw outer.reason;
        if (timeout && timeout.aborted) throw new TimeoutError({ method: verb, url, timeout: o.timeout });
        throw new RequestError({ method: verb, url, cause: err });
      }
      const ms = Math.round(performance.now() - started);
      if (log) log.debug({ client: { method: verb, url, status: response.status, ms } }, 'incoming response');
      for (const hook of o.hooks.afterResponse) await hook(response, call);
      const responseHeaders = Object.fromEntries(response.headers);
      if (!response.ok && o.throwHttpErrors) {
        const errorBody = await parse(response, 'auto').catch(() => undefined);
        throw new HTTPError({
          method: verb,
          url,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          body: errorBody,
        });
      }
      if (o.responseType === 'response') return response;
      const parsed =
        verb === 'HEAD' || response.status === 204 || response.status === 304
          ? undefined
          : await parse(response, o.responseType);
      return o.resolveBodyOnly
        ? parsed
        : { status: response.status, headers: responseHeaders, body: parsed, url: response.url };
    }

    return retry(attempt, {
      attempts,
      signal: outer || undefined,
      retryOn: (err) => {
        if (outer && outer.aborted) return false;
        if (err instanceof HTTPError) return o.retry.statuses.includes(err.status);
        return err instanceof TimeoutError || err instanceof RequestError;
      },
      wait: (number, err) => {
        const asked = err instanceof HTTPError ? retryAfter(err.headers) : null;
        if (asked !== null) return Math.min(asked, o.retry.maxRetryAfter);
        return backoff(number, o.retry);
      },
      onRetry: ({ attempt: number, error }) => {
        if (log)
          log.debug({ client: { method: verb, url, attempt: number, error: error && error.message } }, 'retrying');
      },
    });
  }

  const client = {
    /** A call of any method: the body of the answer (or { status, headers, body, url } with resolveBodyOnly: false). */
    request: (method, path, options) => send(method, path, options),
    get: (path, options) => send('GET', path, options),
    head: (path, options) => send('HEAD', path, options),
    options: (path, options) => send('OPTIONS', path, options),
    post: (path, options) => send('POST', path, options),
    put: (path, options) => send('PUT', path, options),
    patch: (path, options) => send('PATCH', path, options),
    delete: (path, options) => send('DELETE', path, options),
    /** A client with more options (its headers, retry and hooks merged), as got.extend(). */
    extend: (more) => createClient(merge(base, more)),
    /** The client of a request of @xufa/http: cancelled with it, logging with request.log, sending its id. */
    for: (request) => createClient(merge(base, { request })),
    /** The options of the client. */
    defaults: base,
  };
  return client;
}

module.exports = { createClient, IDEMPOTENT, RETRY_STATUSES, urlOf };
