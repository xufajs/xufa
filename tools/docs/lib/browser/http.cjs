// node:http (and node:https) in the browser bundle of @xufa/http (docs/xufa-http.js): METHODS, STATUS_CODES, and the
// IncomingMessage and ServerResponse that @xufa/inject builds its requests and replies on (the response keeps its
// headers as Node does, and writes the head Node would write into _header). There is no server: createServer() gives
// one whose listen() throws, as app.inject() needs no socket.
'use strict';

var EventEmitter = require('node:events');
var stream = require('node:stream');
var util = require('node:util');

var METHODS = [
  'ACL',
  'BIND',
  'CHECKOUT',
  'CONNECT',
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'LINK',
  'LOCK',
  'M-SEARCH',
  'MERGE',
  'MKACTIVITY',
  'MKCALENDAR',
  'MKCOL',
  'MOVE',
  'NOTIFY',
  'OPTIONS',
  'PATCH',
  'POST',
  'PROPFIND',
  'PROPPATCH',
  'PURGE',
  'PUT',
  'QUERY',
  'REBIND',
  'REPORT',
  'SEARCH',
  'SOURCE',
  'SUBSCRIBE',
  'TRACE',
  'UNBIND',
  'UNLINK',
  'UNLOCK',
  'UNSUBSCRIBE',
];

var STATUS_CODES = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a Teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

// The headers set on a response, as Node keeps them: { lowercased: [name, value] }, null when there is none.
var kOutHeaders = Symbol('kOutHeaders');

function headersSentError(action) {
  var err = new Error('Cannot ' + action + ' headers after they are sent to the client');
  err.code = 'ERR_HTTP_HEADERS_SENT';
  return err;
}

function OutgoingMessage() {
  stream.Stream.call(this);
  this[kOutHeaders] = null;
  this._header = null;
  this._headerSent = false;
  this.finished = false;
  this.destroyed = false;
  this.sendDate = true;
  this.shouldKeepAlive = true;
  this.useChunkedEncodingByDefault = true;
  this.chunkedEncoding = false;
  this.socket = null;
  this.writable = true;
  this._writableEnded = false;
  this._finished = false;
}
util.inherits(OutgoingMessage, stream.Stream);

Object.defineProperty(OutgoingMessage.prototype, 'headersSent', {
  get: function () {
    return this._header !== null;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'writableEnded', {
  get: function () {
    return this._writableEnded;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'writableFinished', {
  get: function () {
    return this._finished;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'connection', {
  get: function () {
    return this.socket;
  },
  set: function (socket) {
    this.socket = socket;
  },
});
OutgoingMessage.prototype.writableLength = 0;
OutgoingMessage.prototype.writableHighWaterMark = 16384;
OutgoingMessage.prototype.writableCorked = 0;
OutgoingMessage.prototype.writableNeedDrain = false;

OutgoingMessage.prototype.setHeader = function setHeader(name, value) {
  if (this._header) throw headersSentError('set');
  if (value === undefined) {
    var err = new TypeError('Invalid value "undefined" for header "' + name + '"');
    err.code = 'ERR_HTTP_INVALID_HEADER_VALUE';
    throw err;
  }
  if (this[kOutHeaders] === null) this[kOutHeaders] = Object.create(null);
  this[kOutHeaders][String(name).toLowerCase()] = [name, value];
  return this;
};
OutgoingMessage.prototype.appendHeader = function appendHeader(name, value) {
  var current = this.getHeader(name);
  if (current === undefined) return this.setHeader(name, value);
  return this.setHeader(name, [].concat(current, value));
};
OutgoingMessage.prototype.getHeader = function getHeader(name) {
  var entry = this[kOutHeaders] && this[kOutHeaders][String(name).toLowerCase()];
  return entry ? entry[1] : undefined;
};
OutgoingMessage.prototype.getHeaders = function getHeaders() {
  var headers = Object.create(null);
  var out = this[kOutHeaders];
  if (out) for (var key in out) headers[key] = out[key][1];
  return headers;
};
OutgoingMessage.prototype.getHeaderNames = function getHeaderNames() {
  return this[kOutHeaders] ? Object.keys(this[kOutHeaders]) : [];
};
OutgoingMessage.prototype.getRawHeaderNames = function getRawHeaderNames() {
  var out = this[kOutHeaders];
  return out
    ? Object.keys(out).map(function (key) {
        return out[key][0];
      })
    : [];
};
OutgoingMessage.prototype.hasHeader = function hasHeader(name) {
  return Boolean(this[kOutHeaders] && this[kOutHeaders][String(name).toLowerCase()]);
};
OutgoingMessage.prototype.removeHeader = function removeHeader(name) {
  if (this._header) throw headersSentError('remove');
  if (this[kOutHeaders]) delete this[kOutHeaders][String(name).toLowerCase()];
};
OutgoingMessage.prototype.flushHeaders = function flushHeaders() {
  if (!this._header) this._implicitHeader();
};
OutgoingMessage.prototype.cork = function () {};
OutgoingMessage.prototype.uncork = function () {};
OutgoingMessage.prototype.setTimeout = function (msecs, callback) {
  if (callback) this.on('timeout', callback);
  return this;
};
OutgoingMessage.prototype.addTrailers = function () {};

OutgoingMessage.prototype.write = function write(chunk, encoding, callback) {
  if (typeof encoding === 'function') callback = encoding;
  if (this._writableEnded) {
    var err = new Error('write after end');
    err.code = 'ERR_STREAM_WRITE_AFTER_END';
    if (callback) queueMicrotask(callback.bind(null, err));
    return false;
  }
  if (!this._header) this._implicitHeader();
  this._headerSent = true;
  if (callback) queueMicrotask(callback);
  return true;
};
OutgoingMessage.prototype.end = function end(chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
  }
  if (this._writableEnded) {
    if (callback) queueMicrotask(callback);
    return this;
  }
  if (chunk) {
    if (!this._header && !this.hasHeader('content-length')) {
      this.setHeader('Content-Length', typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length);
    }
    this.write(chunk, encoding);
  }
  if (!this._header) {
    if (!this.hasHeader('content-length') && !this.hasHeader('transfer-encoding')) this.setHeader('Content-Length', 0);
    this._implicitHeader();
  }
  this._headerSent = true;
  this._writableEnded = true;
  this.finished = true;
  this.writable = false;
  var self = this;
  if (callback) this.once('finish', callback);
  queueMicrotask(function () {
    if (self._finished) return;
    self._finished = true;
    // @xufa/inject emits 'finish' itself, and destroys the response: once is enough.
    if (!self.destroyed) self.emit('finish');
  });
  return this;
};
OutgoingMessage.prototype.destroy = function destroy(err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  var self = this;
  queueMicrotask(function () {
    if (err) self.emit('error', err);
    self.emit('close');
  });
  return this;
};

function ServerResponse(req) {
  OutgoingMessage.call(this);
  this.req = req;
  this.statusCode = 200;
  this.statusMessage = undefined;
  if (req && req.method === 'HEAD') this._hasBody = false;
}
util.inherits(ServerResponse, OutgoingMessage);

ServerResponse.prototype._implicitHeader = function _implicitHeader() {
  this.writeHead(this.statusCode);
};
ServerResponse.prototype.assignSocket = function assignSocket(socket) {
  this.socket = socket;
  socket._httpMessage = this;
  this.emit('socket', socket);
};
ServerResponse.prototype.detachSocket = function detachSocket(socket) {
  socket._httpMessage = null;
  this.socket = null;
};
ServerResponse.prototype.writeContinue = function () {};
ServerResponse.prototype.writeProcessing = function () {};
ServerResponse.prototype.writeEarlyHints = function () {};
ServerResponse.prototype.writeHead = function writeHead(statusCode, reason, headers) {
  if (this._header) throw headersSentError('write');
  if (typeof reason !== 'string') {
    headers = reason;
    reason = undefined;
  }
  statusCode = Number(statusCode);
  if (!(statusCode >= 100 && statusCode <= 999)) {
    var err = new RangeError('Invalid status code: ' + statusCode);
    err.code = 'ERR_HTTP_INVALID_STATUS_CODE';
    throw err;
  }
  this.statusCode = statusCode;
  if (reason) this.statusMessage = reason;
  else if (!this.statusMessage) this.statusMessage = STATUS_CODES[statusCode] || 'unknown';
  if (Array.isArray(headers)) {
    for (var i = 0; i < headers.length; i += 2) this.appendHeader(headers[i], headers[i + 1]);
  } else if (headers) {
    for (var name in headers) if (headers[name] !== undefined) this.setHeader(name, headers[name]);
  }
  var head = 'HTTP/1.1 ' + statusCode + ' ' + this.statusMessage + '\r\n';
  var out = this[kOutHeaders] || {};
  for (var key in out) {
    [].concat(out[key][1]).forEach(function (value) {
      head += out[key][0] + ': ' + value + '\r\n';
    });
  }
  if (this.sendDate && !out.date) head += 'Date: ' + new Date().toUTCString() + '\r\n';
  if (!out.connection) head += 'Connection: ' + (this.shouldKeepAlive ? 'keep-alive' : 'close') + '\r\n';
  var bodyless =
    statusCode === 204 || statusCode === 304 || (statusCode >= 100 && statusCode < 200) || this._hasBody === false;
  if (!bodyless && !out['content-length'] && !out['transfer-encoding']) {
    this.chunkedEncoding = true;
    head += 'Transfer-Encoding: chunked\r\n';
  }
  this._header = head + '\r\n';
  return this;
};

function IncomingMessage(socket) {
  stream.Readable.call(this);
  this.socket = socket;
  this.httpVersionMajor = 1;
  this.httpVersionMinor = 1;
  this.httpVersion = '1.1';
  this.headers = {};
  this.rawHeaders = [];
  this.trailers = {};
  this.method = null;
  this.url = '';
  this.complete = false;
  this.aborted = false;
}
util.inherits(IncomingMessage, stream.Readable);
IncomingMessage.prototype.setTimeout = function () {
  return this;
};

function notInBrowser(what) {
  return function () {
    throw new Error(what + ' is not in the browser: app.inject() calls the routes without a server');
  };
}

function Server(options, handler) {
  EventEmitter.call(this);
  if (typeof options === 'function') handler = options;
  if (handler) this.on('request', handler);
  this.listening = false;
  this.keepAliveTimeout = 5000;
  this.requestTimeout = 300000;
  this.headersTimeout = 60000;
  this.timeout = 0;
  this.maxRequestsPerSocket = 0;
}
util.inherits(Server, EventEmitter);
Server.prototype.listen = notInBrowser('listen()');
Server.prototype.address = function () {
  return null;
};
Server.prototype.setTimeout = function (msecs) {
  this.timeout = msecs;
  return this;
};
Server.prototype.close = function (callback) {
  if (callback) queueMicrotask(callback);
  return this;
};
Server.prototype.closeAllConnections = function () {};
Server.prototype.closeIdleConnections = function () {};
Server.prototype.unref = function () {
  return this;
};
Server.prototype.ref = function () {
  return this;
};

module.exports = {
  METHODS: METHODS,
  STATUS_CODES: STATUS_CODES,
  OutgoingMessage: OutgoingMessage,
  ServerResponse: ServerResponse,
  IncomingMessage: IncomingMessage,
  Server: Server,
  createServer: function (options, handler) {
    return new Server(options, handler);
  },
  request: notInBrowser('http.request()'),
  get: notInBrowser('http.get()'),
  Agent: function Agent() {},
  globalAgent: {},
  validateHeaderName: function () {},
  validateHeaderValue: function () {},
};
