// The fake ServerResponse: a real http.ServerResponse on a socket that drops its bytes, whose writes are kept to
// build the result of the injection.
const http = require('node:http');
const { Writable, Readable, addAbortSignal } = require('node:stream');
const util = require('node:util');
const { parseResponseCookies } = require('./cookies');

function nullSocket() {
  return new Writable({
    write(chunk, encoding, callback) {
      setImmediate(callback);
    },
  });
}

function Response(req, onEnd, reject) {
  http.ServerResponse.call(this, req);
  if (req._lightMyRequest && req._lightMyRequest.payloadAsStream) {
    const read = this.emit.bind(this, 'drain');
    this._lightMyRequest = { headers: null, trailers: {}, stream: new Readable({ read }) };
    if (req._lightMyRequest.signal) addAbortSignal(req._lightMyRequest.signal, this._lightMyRequest.stream);
  } else {
    this._lightMyRequest = { headers: null, trailers: {}, payloadChunks: [] };
  }
  // Makes the response render its headers even when none is set.
  this.setHeader('foo', 'bar');
  this.removeHeader('foo');
  this.assignSocket(nullSocket());
  this._promiseCallback = typeof reject === 'function';

  let called = false;
  const onEndSuccess = (payload) => {
    if (called) return;
    called = true;
    if (this._promiseCallback) process.nextTick(() => onEnd(payload));
    else process.nextTick(() => onEnd(null, payload));
  };
  this._lightMyRequest.onEndSuccess = onEndSuccess;

  let finished = false;
  const onEndFailure = (error) => {
    let err = error;
    if (called) {
      if (this._lightMyRequest.stream && !finished) {
        if (!err) {
          err = new Error('response destroyed before completion');
          err.code = 'LIGHT_ECONNRESET';
        }
        this._lightMyRequest.stream.destroy(err);
        this._lightMyRequest.stream.on('error', () => {});
      }
      return;
    }
    called = true;
    if (!err) {
      err = new Error('response destroyed before completion');
      err.code = 'LIGHT_ECONNRESET';
    }
    if (this._promiseCallback) process.nextTick(() => reject(err));
    else process.nextTick(() => onEnd(err, null));
  };

  if (this._lightMyRequest.stream) {
    this.once('finish', () => {
      finished = true;
      this._lightMyRequest.stream.push(null);
    });
  } else {
    this.once('finish', () => {
      const res = generatePayload(this);
      res.raw.req = req;
      onEndSuccess(res);
    });
  }
  this.connection.once('error', onEndFailure);
  this.once('error', onEndFailure);
  this.once('close', onEndFailure);
}

util.inherits(Response, http.ServerResponse);

Response.prototype.setTimeout = function setTimeoutFn(msecs, callback) {
  this.timeoutHandle = setTimeout(() => this.emit('timeout'), msecs);
  this.on('timeout', callback);
  return this;
};

Response.prototype.writeHead = function writeHead(...args) {
  const result = http.ServerResponse.prototype.writeHead.apply(this, args);
  copyHeaders(this);
  if (this._lightMyRequest.stream) this._lightMyRequest.onEndSuccess(generatePayload(this));
  return result;
};

Response.prototype.write = function write(data, encoding, callback) {
  if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
  http.ServerResponse.prototype.write.call(this, data, encoding, callback);
  const chunk = Buffer.from(data, encoding);
  if (this._lightMyRequest.stream) return this._lightMyRequest.stream.push(chunk);
  this._lightMyRequest.payloadChunks.push(chunk);
  return true;
};

Response.prototype.end = function end(data, encoding, callback) {
  if (data) this.write(data, encoding);
  http.ServerResponse.prototype.end.call(this, callback);
  this.emit('finish');
  // 'close' too, for stream.finished()
  this.destroy();
};

Response.prototype.destroy = function destroy(error) {
  if (this.destroyed) return;
  this.destroyed = true;
  if (error) process.nextTick(() => this.emit('error', error));
  process.nextTick(() => this.emit('close'));
};

Response.prototype.addTrailers = function addTrailers(trailers) {
  for (const key of Object.keys(trailers)) {
    this._lightMyRequest.trailers[key.toLowerCase().trim()] = trailers[key].toString().trim();
  }
};

const RAW_HEADERS = ['Date', 'Connection', 'Transfer-Encoding'].map((name) => [
  name.toLowerCase(),
  new RegExp(`\\r\\n${name}: ([^\\r]*)\\r\\n`),
]);

function copyHeaders(response) {
  const headers = { ...response.getHeaders() };
  // Headers Node.js adds itself are only in the head it wrote.
  for (const [name, regex] of RAW_HEADERS) {
    const field = response._header && response._header.match(regex);
    if (field) headers[name] = field[1];
  }
  response._lightMyRequest.headers = headers;
}

function serializeHeaders(response) {
  const { headers } = response._lightMyRequest;
  for (const name of Object.keys(headers)) {
    const value = headers[name];
    headers[name] = Array.isArray(value) ? value.map((v) => `${v}`) : `${value}`;
  }
}

function generatePayload(response) {
  if (response._lightMyRequest.headers === null) copyHeaders(response);
  serializeHeaders(response);
  const res = {
    raw: { res: response },
    headers: response._lightMyRequest.headers,
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
    trailers: response._lightMyRequest.trailers,
    get cookies() {
      return parseResponseCookies(this);
    },
  };
  const chunks = response._lightMyRequest.payloadChunks;
  if (chunks) {
    const raw = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    res.rawPayload = raw;
    res.payload = raw.toString();
    res.body = res.payload;
    res.json = function parseJsonPayload() {
      return JSON.parse(res.payload);
    };
  } else {
    res.json = function noJson() {
      throw new Error('Response payload is not available with payloadAsStream: true');
    };
  }
  res.stream = function streamPayload() {
    return response._lightMyRequest.stream || Readable.from(response._lightMyRequest.payloadChunks);
  };
  return res;
}

module.exports = Response;
