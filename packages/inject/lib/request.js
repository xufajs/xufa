// The fake IncomingMessage: a Readable stream of the payload with the url, method and headers of a request.
const { Readable, addAbortSignal } = require('node:stream');
const util = require('node:util');
const { EventEmitter } = require('node:events');
const { parseURL } = require('./url');
const { serialize } = require('./cookies');
const { isFormDataLike, formDataToStream } = require('./form-data');

let connectionWarned = false;

function hostHeader(url) {
  return url.port ? url.host : url.hostname + (url.protocol === 'https:' ? ':443' : ':80');
}

class MockSocket extends EventEmitter {
  constructor(remoteAddress) {
    super();
    this.remoteAddress = remoteAddress;
  }
}

function Request(options) {
  Readable.call(this, { autoDestroy: false });
  const url = parseURL(options.url || options.path, options.query);
  this.url = url.pathname + url.search;
  this.aborted = false;
  this.httpVersionMajor = 1;
  this.httpVersionMinor = 1;
  this.httpVersion = '1.1';
  this.method = options.method ? options.method.toUpperCase() : 'GET';
  this.headers = {};
  this.rawHeaders = [];

  const headers = options.headers || {};
  for (const field of Object.keys(headers)) {
    const name = field.toLowerCase();
    const value = headers[field];
    if ((name === 'user-agent' || name === 'content-type') && value === undefined) {
      this.headers[name] = undefined;
      continue;
    }
    if (value === undefined) {
      const err = new Error(`invalid value "undefined" for header ${field}`);
      err.code = 'ERR_ASSERTION';
      throw err;
    }
    this.headers[name] = `${value}`;
  }
  if (!('user-agent' in this.headers)) this.headers['user-agent'] = 'lightMyRequest';
  this.headers.host = this.headers.host || options.authority || hostHeader(url);

  if (options.cookies) {
    const values = Object.keys(options.cookies).map((key) => serialize(key, options.cookies[key]));
    if (this.headers.cookie) values.unshift(this.headers.cookie);
    this.headers.cookie = values.join('; ');
  }

  this.socket = new MockSocket(options.remoteAddress || '127.0.0.1');
  Object.defineProperty(this, 'connection', {
    get() {
      if (!connectionWarned) {
        connectionWarned = true;
        process.emitWarning('You are accessing "request.connection", use "request.socket" instead.', {
          type: 'DeprecationWarning',
          code: 'XUFA_INJECT_DEP01',
        });
      }
      return this.socket;
    },
    configurable: true,
  });

  let payload = options.payload || options.body || null;
  let isStream = Boolean(payload) && typeof payload.resume === 'function';
  if (isFormDataLike(payload)) {
    const form = formDataToStream(payload);
    payload = form.stream;
    isStream = true;
    this.headers['content-type'] = form.contentType;
    this.headers['transfer-encoding'] = 'chunked';
  }
  if (payload && typeof payload !== 'string' && !isStream && !Buffer.isBuffer(payload)) {
    payload = JSON.stringify(payload);
    if (!('content-type' in this.headers)) this.headers['content-type'] = 'application/json';
  }
  if (payload && !isStream && !Object.hasOwn(this.headers, 'content-length')) {
    this.headers['content-length'] = String(Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload));
  }
  for (const header of Object.keys(this.headers)) this.rawHeaders.push(header, this.headers[header]);

  this._lightMyRequest = {
    payload,
    isDone: false,
    simulate: options.simulate || {},
    payloadAsStream: options.payloadAsStream,
    signal: options.signal,
  };
  if (options.signal) addAbortSignal(options.signal, this);

  if (payload && payload._readableState) {
    this._read = readStream;
    payload.on('error', (err) => this.destroy(err));
    payload.on('end', () => this.push(null));
  } else {
    this._read = readEverythingElse;
  }
  return this;
}

function readStream() {
  const { payload } = this._lightMyRequest;
  let more = true;
  let pushed = false;
  let chunk;
  // eslint-disable-next-line no-cond-assign
  while (more && (chunk = payload.read())) {
    pushed = true;
    more = this.push(chunk);
  }
  // Waits for data only when there was none: otherwise the stream calls _read() again.
  if (more && !pushed) payload.once('readable', this._read.bind(this));
}

function readEverythingElse() {
  setImmediate(() => {
    const state = this._lightMyRequest;
    if (state.isDone) {
      if (state.simulate.end !== false) this.push(null);
      return;
    }
    state.isDone = true;
    if (state.payload) {
      if (state.simulate.split) {
        this.push(state.payload.slice(0, 1));
        this.push(state.payload.slice(1));
      } else {
        this.push(state.payload);
      }
    }
    if (state.simulate.error) this.emit('error', new Error('Simulated'));
    if (state.simulate.close) this.emit('close');
    if (state.simulate.end !== false) this.push(null);
  });
}

util.inherits(Request, Readable);

Request.prototype.destroy = function destroy(error) {
  if (this.destroyed || this._lightMyRequest.isDone) return;
  this.destroyed = true;
  if (error) {
    this._error = true;
    process.nextTick(() => this.emit('error', error));
  }
  process.nextTick(() => this.emit('close'));
};

// A request whose prototype chain also has options.Request (a class of the framework's own requests).
function CustomRequest(options) {
  function _CustomLMRRequest(obj) {
    Request.call(obj, { ...options, Request: undefined });
    Object.assign(this, obj);
    for (const fn of Object.keys(Request.prototype)) this.constructor.prototype[fn] = Request.prototype[fn];
    util.inherits(this.constructor, options.Request);
    return this;
  }
  return new _CustomLMRRequest(this);
}

util.inherits(CustomRequest, Request);

module.exports = Request;
module.exports.Request = Request;
module.exports.CustomRequest = CustomRequest;
