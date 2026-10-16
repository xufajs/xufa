'use strict';

// supertest 7 (on superagent 10), written anew for @xufa/test: HTTP assertions on an app of Express (or any request
// handler), a server of node:http or node:https, an instance of fastify or of @xufa/http, or a URL.
//
//   const request = require('@xufa/test/supertest');
//   await request(app).post('/users').send({ name: 'ada' }).expect(201).expect('Content-Type', /json/);
//
// - request(app)[method](path), every method of node:http and del(): an app (a function) gets a server of its own
//   for each request; a server not listening listens on a free port (test._server) and is closed when the request
//   ends; fastify and @xufa/http are made ready (app.ready()) and their app.server served so;
// - .set(field, value | object), .unset(), .type(json | form | urlencoded | html | text | ... | a type), .accept(),
//   .auth(user, password) (basic), .query(object | string), .send(data) (objects merged and sent as JSON, or as a form
//   when the type is one; strings appended, a form by default; Buffers as they are), .write(chunk) (the body
//   streamed), .field(name, value | object) and .attach(field, path | Buffer, filename | { filename, contentType })
//   (multipart/form-data), .agent(httpAgent) (connections of that agent: a new one for each request without it),
//   .redirects(n) (none followed by default), .timeout(ms), .responseType(type) (the body a Buffer), .parse(fn);
// - .expect(status[, body]), .expect([statuses]), .expect(field, value | RegExp), .expect(body | RegExp),
//   .expect(fn(res)), each with a callback last that ends the request; .end(fn(err, res)) and await (then, catch,
//   finally), with supertest's messages (expected 200 "OK", got 404 "Not Found"...);
// - the response read as superagent reads it: answers gzipped or deflated inflated; JSON (and +json) parsed, a form
//   parsed, binary types (audio, font, image, video, gzip, octet-stream, pdf) a Buffer without text, other bodies as
//   text (body {});
// - request.agent(app): its requests keep the cookies they are given, and the headers set on it;
// - request(app, { legacyPaths: true }): paths sent as supertest 6 sent them (dot segments kept: superagent 10
//   resolves them, as WHATWG's URL does).
const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const zlib = require('node:zlib');
const { inspect } = require('node:util');
const { deepStrictEqual } = require('node:assert');
const { stringify, parse, Multipart } = require('./form.js');
const { Response } = require('./response.js');

const FORM = 'application/x-www-form-urlencoded';
// superagent's .type() and .accept() shorthands, and those of mime a test gives.
const TYPES = {
  html: 'text/html',
  json: 'application/json',
  xml: 'text/xml',
  urlencoded: FORM,
  form: FORM,
  'form-data': FORM,
  text: 'text/plain',
  txt: 'text/plain',
  js: 'application/javascript',
  css: 'text/css',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  pdf: 'application/pdf',
  csv: 'text/csv',
  bin: 'application/octet-stream',
};
const SYSTEM_ERRORS = {
  ECONNREFUSED: 'Connection refused',
  ECONNRESET: 'Connection reset by peer',
  EPIPE: 'Broken pipe',
  ETIMEDOUT: 'Operation timed out',
};
const REDIRECTS = [301, 302, 303, 305, 307, 308];

const isObject = (value) => value !== null && typeof value === 'object';
const isJSON = (mime) => /[/+]json($|[^-\w])/i.test(mime);
const isBinary = (mime) => {
  const [registry = '', name = ''] = mime.split('/').map((part) => part.toLowerCase().trim());
  return ['audio', 'font', 'image', 'video'].includes(registry) || ['gz', 'gzip'].includes(name);
};
const typeOf = (type) => {
  if (type.includes('/')) return type;
  if (!TYPES[type]) throw new Error(`supertest: no type for "${type}"`);
  return TYPES[type];
};

// The path as superagent 10 sends it: that of WHATWG's URL (no fragment, dot segments resolved, backslashes made
// slashes, what URL escapes escaped).
function requestPath(path) {
  const url = new URL(`http://127.0.0.1${path.startsWith('/') ? '' : '/'}${path}`);
  return url.pathname + url.search;
}

// The path as supertest 6 (superagent 8, Node's legacy url.parse()) sends it, with request(app, { legacyPaths: true }):
// dot segments kept (tests of paths that climb past a root send them so), no fragment, backslashes before the query
// made slashes, and the characters url.parse() escapes escaped.
function legacyPath(path) {
  let text = path.split('#')[0];
  const query = text.indexOf('?');
  const pathname = query === -1 ? text : text.slice(0, query);
  text = pathname.replace(/\\/g, '/') + (query === -1 ? '' : text.slice(query));
  return text.replace(/['{}|\\^`<>" \r\n\t]/g, (c) => encodeURIComponent(c).replace("'", '%27'));
}

// Where the requests of a server go: listening on a free port when it is not (and closed after the request).
function serverTarget(server) {
  let started;
  if (!server.address()) {
    server.listen(0);
    started = server;
  }
  const { port } = server.address();
  return { protocol: server instanceof tls.Server ? 'https:' : 'http:', host: '127.0.0.1', port, base: '', started };
}

// The target of an app: a URL, a server, an instance of fastify or @xufa/http (ready, then its server; a promise),
// or a function (a server of its own).
function targetOf(app) {
  if (typeof app === 'string') {
    const url = new URL(app);
    const port = url.port || (url.protocol === 'https:' ? 443 : 80);
    return { protocol: url.protocol, host: url.hostname, port, base: url.pathname === '/' ? '' : url.pathname };
  }
  if (isObject(app) && app.server && typeof app.ready === 'function') {
    return Promise.resolve(app.ready()).then(() => serverTarget(app.server));
  }
  if (typeof app === 'function') return serverTarget(http.createServer(app));
  if (isObject(app) && typeof app.address === 'function' && typeof app.listen === 'function') return serverTarget(app);
  throw new TypeError('supertest: give an app (a function), a server, an instance of fastify or @xufa/http, or a URL');
}

function assertionError(message, expected, actual) {
  const error = new Error(message);
  error.expected = expected;
  error.actual = actual;
  error.showDiff = true;
  return error;
}

class Test {
  constructor(app, method, path, options = {}) {
    this.app = app;
    this.legacyPaths = Boolean(options.legacyPaths);
    this.method = method.toUpperCase();
    this.url = path;
    this.headers = {};
    this.lowerHeaders = {};
    this.asserts = [];
    this.queries = [];
    this.queryObject = {};
    this.pending = [];
    this.maxRedirects = 0;
    this.redirectList = [];
    this.data = undefined;
    this.target = targetOf(app);
    if (typeof this.target.then !== 'function') this._server = this.target.started;
  }

  set(field, value) {
    if (isObject(field)) {
      Object.keys(field).forEach((key) => this.set(key, field[key]));
      return this;
    }
    this.lowerHeaders[field.toLowerCase()] = value;
    this.headers[field] = value;
    return this;
  }

  unset(field) {
    delete this.lowerHeaders[field.toLowerCase()];
    delete this.headers[field];
    return this;
  }

  get(field) {
    return this.lowerHeaders[field.toLowerCase()];
  }

  type(type) {
    return this.set('Content-Type', typeOf(type));
  }

  accept(type) {
    return this.set('Accept', typeOf(type));
  }

  auth(user, password = '') {
    return this.set('Authorization', `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`);
  }

  query(value) {
    if (typeof value === 'string') this.queries.push(value);
    else Object.assign(this.queryObject, value);
    return this;
  }

  send(data) {
    if (this.form)
      throw new Error(
        ".send() can't be used if .attach() or .field() is used. Please use only .send() or only .field() & .attach()"
      );
    const object = isObject(data) && !Buffer.isBuffer(data);
    let type = this.lowerHeaders['content-type'];
    if (object && !this.data) this.data = Array.isArray(data) ? [] : {};
    if (object && isObject(this.data) && !Buffer.isBuffer(this.data)) Object.assign(this.data, data);
    else if (typeof data === 'string') {
      if (!type) this.type('form');
      type = this.lowerHeaders['content-type'].toLowerCase().trim();
      if (type === FORM) this.data = this.data ? `${this.data}&${data}` : data;
      else this.data = (this.data || '') + data;
    } else this.data = data;
    if (object && !type) this.type('json');
    return this;
  }

  field(name, value) {
    if (name === null || name === undefined) throw new Error('.field(name, val) name can not be empty');
    if (this.data)
      throw new Error(
        ".field() can't be used if .send() is used. Please use only .send() or only .field() & .attach()"
      );
    if (isObject(name)) {
      Object.keys(name).forEach((key) => this.field(key, name[key]));
      return this;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => this.field(name, item));
      return this;
    }
    if (value === null || value === undefined) throw new Error('.field(name, val) val can not be empty');
    this.form ??= new Multipart();
    this.form.field(name, typeof value === 'boolean' ? String(value) : value);
    return this;
  }

  attach(field, file, options) {
    if (!file) return this;
    if (this.data) throw new Error("superagent can't mix .send() and .attach()");
    const settings = typeof options === 'string' ? { filename: options } : { ...options };
    if (typeof file === 'string' && !settings.filename) settings.filename = file;
    this.form ??= new Multipart();
    this.form.file(field, file, settings);
    return this;
  }

  agent(agent) {
    this.httpAgent = agent;
    return this;
  }

  redirects(count) {
    this.maxRedirects = count;
    return this;
  }

  timeout(ms) {
    this.timeoutMs = typeof ms === 'object' ? ms.deadline || ms.response : ms;
    return this;
  }

  responseType(type) {
    this.binaryResponse = type;
    return this;
  }

  parse(fn) {
    this.parser = fn;
    return this;
  }

  buffer() {
    return this;
  }

  // The ClientRequest (made now; its target must be known: not an instance of fastify or @xufa/http still getting
  // ready).
  request() {
    if (this.req) return this.req;
    if (typeof this.target.then === 'function')
      throw new Error('supertest: the app is not ready yet: write after end()');
    const query = [...this.queries];
    const object = stringify(this.queryObject, { indices: false, strictNullHandling: true }).join('&');
    if (object) query.push(object);
    let url = this.url;
    if (query.length) url += (url.includes('?') ? '&' : '?') + query.join('&');
    const { protocol, host, port, base } = this.target;
    const transport = protocol === 'https:' ? https : http;
    const req = transport.request({
      protocol,
      host,
      port,
      method: this.method,
      path: (this.legacyPaths ? legacyPath : requestPath)(base + url),
      agent: this.httpAgent === undefined ? false : this.httpAgent,
      rejectUnauthorized: false,
    });
    this.req = req;
    req.setNoDelay(true);
    if (this.method !== 'HEAD') req.setHeader('Accept-Encoding', 'gzip, deflate');
    Object.keys(this.headers).forEach((name) => req.setHeader(name, this.headers[name]));
    if (this.jar && this.jar.size) {
      const sent = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
      const own = this.lowerHeaders.cookie;
      req.setHeader('Cookie', own ? `${own}; ${sent}` : sent);
    }
    req.on('error', (error) => {
      if (!this.response) this.callback(error);
    });
    if (this.timeoutMs) {
      this.timer = setTimeout(() => {
        const error = new Error(`Timeout of ${this.timeoutMs}ms exceeded`);
        error.code = 'ECONNABORTED';
        error.timeout = this.timeoutMs;
        this.callback(error);
        req.destroy();
      }, this.timeoutMs);
    }
    return req;
  }

  write(data, encoding) {
    if (typeof this.target.then === 'function') {
      this.pending.push([data, encoding]);
      return true;
    }
    return this.request().write(data, encoding);
  }

  // expect(status[, body][, fn]), expect([statuses]), expect(field, value[, fn]), expect(body[, fn]), expect(fn).
  expect(a, b, c) {
    if (typeof a === 'function') {
      this.asserts.push(a);
      return this;
    }
    if (typeof b === 'function') this.end(b);
    if (typeof c === 'function') this.end(c);
    if (typeof a === 'number') {
      this.asserts.push((res) => this.assertStatus(a, res));
      if (typeof b !== 'function' && arguments.length > 1) this.asserts.push((res) => this.assertBody(b, res));
      return this;
    }
    if (Array.isArray(a) && a.length > 0 && a.every((value) => typeof value === 'number')) {
      this.asserts.push((res) => this.assertStatuses(a, res));
      return this;
    }
    if (typeof b === 'string' || typeof b === 'number' || b instanceof RegExp) {
      this.asserts.push((res) => this.assertHeader(String(a), b, res));
      return this;
    }
    this.asserts.push((res) => this.assertBody(a, res));
    return this;
  }

  end(fn) {
    if (this.ended) throw new Error('.end() was called twice. This is not supported in superagent');
    this.ended = true;
    this.fn = fn;
    if (typeof this.target.then === 'function') {
      this.target.then(
        (target) => {
          this.target = target;
          this._server = target.started;
          this.pending.forEach(([data, encoding]) => this.request().write(data, encoding));
          this.sendRequest();
        },
        (error) => this.callback(error)
      );
    } else {
      this.sendRequest();
    }
    return this;
  }

  then(resolve, reject) {
    if (!this.promise) {
      this.promise = new Promise((done, fail) => {
        this.end((error, res) => (error ? fail(error) : done(res)));
      });
    }
    return this.promise.then(resolve, reject);
  }

  catch(reject) {
    return this.then(undefined, reject);
  }

  finally(fn) {
    return this.then().finally(fn);
  }

  sendRequest() {
    let req;
    try {
      req = this.request();
    } catch (error) {
      this.callback(error);
      return;
    }
    let { data } = this;
    if (this.form) {
      try {
        data = this.form.body();
      } catch (error) {
        this.callback(error);
        req.destroy();
        return;
      }
      req.setHeader('Content-Type', this.form.contentType());
      req.setHeader('Content-Length', data.length);
    } else if (this.method !== 'HEAD' && !req.headersSent) {
      if (data !== undefined && typeof data !== 'string' && !Buffer.isBuffer(data)) {
        const type = (req.getHeader('Content-Type') || '').split(';')[0];
        if (type === FORM) data = stringify(data, { indices: false, strictNullHandling: true }).join('&');
        else if (isJSON(type)) data = JSON.stringify(data);
      }
      if (data && !req.getHeader('Content-Length')) {
        req.setHeader('Content-Length', Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data));
      }
    }
    req.once('response', (res) => this.receive(res));
    if (Buffer.isBuffer(data)) {
      for (let at = 0; at < data.length; at += 16 * 1024) req.write(data.subarray(at, at + 16 * 1024));
      req.end();
    } else {
      req.end(data);
    }
  }

  keepCookies(res) {
    const cookies = res.headers['set-cookie'];
    if (!this.jar || !cookies) return;
    cookies.forEach((cookie) => {
      const [pair, ...attributes] = cookie.split(/ *; */);
      const equals = pair.indexOf('=');
      const name = pair.slice(0, equals);
      const removed = attributes.some((attribute) => {
        const [key, value = ''] = attribute.split('=');
        if (key.toLowerCase() === 'max-age') return Number(value) <= 0;
        if (key.toLowerCase() === 'expires') return Date.parse(value) <= Date.now();
        return false;
      });
      if (removed) this.jar.delete(name);
      else this.jar.set(name, pair.slice(equals + 1));
    });
  }

  // A redirect followed (.redirects(n)): GET for 303, and for 301 and 302 of methods other than GET and HEAD.
  follow(res) {
    const { protocol, host, port, base } = this.target;
    const from = new URL(`${protocol}//${host}:${port}${base}${this.url}`);
    const to = new URL(res.headers.location, from);
    this.redirectList.push(to.href);
    if (
      res.statusCode === 303 ||
      ((res.statusCode === 301 || res.statusCode === 302) && !['GET', 'HEAD'].includes(this.method))
    ) {
      this.method = this.method === 'HEAD' ? 'HEAD' : 'GET';
      this.data = undefined;
      this.form = undefined;
      ['Content-Type', 'Content-Length', 'Transfer-Encoding'].forEach((name) => {
        Object.keys(this.headers)
          .filter((key) => key.toLowerCase() === name.toLowerCase())
          .forEach((key) => this.unset(key));
      });
    }
    this.target = { ...this.target, protocol: to.protocol, host: to.hostname, port: to.port || port, base: '' };
    this.url = to.pathname + to.search;
    this.queries = [];
    this.queryObject = {};
    this.req = undefined;
    this.response = undefined;
    this.sendRequest();
  }

  // The response read as superagent reads it (supertest: buffered, no redirects followed unless asked).
  receive(res) {
    this.response = res;
    this.keepCookies(res);
    if (REDIRECTS.includes(res.statusCode) && res.headers.location && this.redirectList.length < this.maxRedirects) {
      res.resume();
      this.follow(res);
      return;
    }
    if (this.method === 'HEAD') {
      res.resume();
      this.callback(null, new Response(this.req, res, undefined, undefined, this.redirectList));
      return;
    }
    const mime = (res.headers['content-type'] || '').split(/ *; */).shift() || 'text/plain';
    const type = mime.split('/')[0].toLowerCase().trim();
    let stream = res;
    if (
      res.statusCode !== 204 &&
      res.statusCode !== 304 &&
      res.headers['content-length'] !== '0' &&
      /^\s*(?:deflate|gzip)\s*$/.test(res.headers['content-encoding'])
    ) {
      stream = res.pipe(zlib.createUnzip());
      res.on('error', (error) => stream.emit('error', error));
    }
    const respond = (text, body) => this.callback(null, new Response(this.req, res, text, body, this.redirectList));
    if (this.parser) {
      this.parser(stream, (error, body) => (error ? this.callback(error) : respond(stream.text, body)));
      return;
    }
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (error) => {
      // (superagent: an inflated body that ends early ends there.)
      if (error.code === 'Z_BUF_ERROR') stream.emit('end');
      else this.callback(error);
    });
    stream.once('end', () => {
      const bytes = Buffer.concat(chunks);
      if (this.binaryResponse || isBinary(mime) || mime === 'application/octet-stream' || mime === 'application/pdf') {
        respond(undefined, bytes);
      } else if (mime === FORM) {
        const text = bytes.toString('ascii');
        respond(text, parse(text));
      } else if (mime === 'application/json' || (type !== 'text' && isJSON(mime))) {
        const text = bytes.toString('utf8');
        let body;
        try {
          body = text && JSON.parse(text);
        } catch (error) {
          error.rawResponse = text || null;
          error.statusCode = res.statusCode;
          this.callback(error);
          return;
        }
        respond(text, body);
      } else {
        respond(bytes.toString('utf8'));
      }
    });
  }

  callback(error, response) {
    if (this.called) return;
    this.called = true;
    clearTimeout(this.timer);
    const finish = () => this.assert(error, response);
    if (this._server && this._server.listening) this._server.close(finish);
    else finish();
  }

  assert(resError, res) {
    let error = null;
    if (!res && resError) {
      error =
        resError.syscall === 'connect' && SYSTEM_ERRORS[resError.code]
          ? new Error(`${resError.code}: ${SYSTEM_ERRORS[resError.code]}`)
          : resError;
    }
    for (let i = 0; i < this.asserts.length && !error; i += 1) {
      try {
        const result = this.asserts[i](res);
        if (result instanceof Error) error = result;
      } catch (thrown) {
        error = thrown;
      }
    }
    if (this.fn) this.fn.call(this, error, res);
  }

  assertBody(body, res) {
    const isRegExp = body instanceof RegExp;
    if (typeof body === 'object' && !isRegExp) {
      try {
        deepStrictEqual(body, res.body);
      } catch {
        return assertionError(`expected ${inspect(body)} response body, got ${inspect(res.body)}`, body, res.body);
      }
    } else if (body !== res.text) {
      if (!isRegExp) {
        return assertionError(`expected ${inspect(body)} response body, got ${inspect(res.text)}`, body, res.body);
      }
      if (!body.test(res.text)) {
        return assertionError(`expected body ${inspect(res.text)} to match ${body}`, body, res.body);
      }
    }
    return undefined;
  }

  assertHeader(field, expected, res) {
    const actual = res.header[field.toLowerCase()];
    if (actual === undefined) return new Error(`expected "${field}" header field`);
    if ((Array.isArray(actual) && actual.toString() === expected) || expected === actual) return undefined;
    if (expected instanceof RegExp) {
      return expected.test(actual) ? undefined : new Error(`expected "${field}" matching ${expected}, got "${actual}"`);
    }
    return new Error(`expected "${field}" of "${expected}", got "${actual}"`);
  }

  assertStatus(status, res) {
    if (res.status === status) return undefined;
    const expected = http.STATUS_CODES[status];
    const actual = http.STATUS_CODES[res.status];
    return new Error(`expected ${status} "${expected}", got ${res.status} "${actual}"`);
  }

  assertStatuses(statuses, res) {
    if (statuses.includes(res.status)) return undefined;
    return new Error(`expected one of "${statuses.join(', ')}", got ${res.status} "${http.STATUS_CODES[res.status]}"`);
  }
}

const METHODS = http.METHODS.map((method) => method.toLowerCase());
// What an agent replays on each of its requests.
const DEFAULTS = ['set', 'unset', 'type', 'accept', 'auth', 'query', 'agent', 'redirects', 'timeout'];

// request.agent(app): requests that keep the cookies they are given, and what was set on the agent.
class TestAgent {
  constructor(app, options = {}) {
    this.app = typeof app === 'function' ? http.createServer(app) : app;
    this.options = options;
    this.jar = new Map();
    this.defaults = [];
  }
}
DEFAULTS.forEach((name) => {
  TestAgent.prototype[name] = function setDefault(...args) {
    this.defaults.push([name, args]);
    return this;
  };
});
METHODS.forEach((method) => {
  TestAgent.prototype[method] = function agentRequest(path) {
    const test = new Test(this.app, method, path, this.options);
    test.jar = this.jar;
    this.defaults.forEach(([name, args]) => test[name](...args));
    return test;
  };
});
TestAgent.prototype.del = TestAgent.prototype.delete;

function request(app, options = {}) {
  if (options.http2) throw new Error('supertest: http2 is not supported by @xufa/test/supertest');
  const methods = {};
  METHODS.forEach((method) => {
    methods[method] = (path) => new Test(app, method, path, options);
  });
  methods.del = methods.delete;
  return methods;
}

request.Test = Test;
request.agent = (app, options) => new TestAgent(app, options);
request.Response = Response;
module.exports = request;
