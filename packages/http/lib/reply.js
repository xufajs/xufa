// The reply of a request: status, headers, serialization of the payload, onSend hooks and writing the response.
const { finished } = require('node:stream');
const {
  kFourOhFourContext,
  kReplyErrorHandlerCalled,
  kReplyHijacked,
  kReplyStartTime,
  kReplyEndTime,
  kReplySerializer,
  kReplySerializerDefault,
  kReplyIsError,
  kReplyHeaders,
  kReplyTrailers,
  kReplyHasStatusCode,
  kReplyIsRunningOnErrorHook,
  kReplyNextErrorHandler,
  kSchemaResponse,
  kReplyCacheSerializeFns,
  kSchemaController,
  kOptions,
  kRouteContext,
  kTimeoutTimer,
  kOnAbort,
  kRequestSignal,
  kLogController,
} = require('./symbols');
const { onSendHookRunner, onResponseHookRunner, preHandlerHookRunner, preSerializationHookRunner } = require('./hooks');
const { handleError } = require('./error-handler');
const { getSchemaSerializer } = require('./schemas');
const {
  XUFA_ERR_REP_INVALID_PAYLOAD_TYPE,
  XUFA_ERR_REP_RESPONSE_BODY_CONSUMED,
  XUFA_ERR_REP_READABLE_STREAM_LOCKED,
  XUFA_ERR_REP_ALREADY_SENT,
  XUFA_ERR_SEND_INSIDE_ONERR,
  XUFA_ERR_BAD_STATUS_CODE,
  XUFA_ERR_BAD_TRAILER_NAME,
  XUFA_ERR_BAD_TRAILER_VALUE,
  XUFA_ERR_MISSING_SERIALIZATION_FN,
  XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN,
  XUFA_ERR_DEC_UNDECLARED,
} = require('./errors');
const decorators = require('./decorate');
const ContentType = require('./content-type');

const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const OCTET_TYPE = 'application/octet-stream';
const HTTP2_WRITE_CHUNK_SIZE = 64 * 1024;
const toString = Object.prototype.toString;

// handle-request.js requires this module: its functions are read when they are needed.
let handleRequestInternals = null;
function internals() {
  if (handleRequestInternals === null) handleRequestInternals = require('./handle-request').internals; // eslint-disable-line global-require
  return handleRequestInternals;
}

function now() {
  return performance.now();
}

function Reply(res, request, log) {
  this.raw = res;
  this[kReplySerializer] = null;
  this[kReplyErrorHandlerCalled] = false;
  this[kReplyIsError] = false;
  this[kReplyIsRunningOnErrorHook] = false;
  this.request = request;
  this[kReplyHeaders] = {};
  this[kReplyTrailers] = null;
  this[kReplyHasStatusCode] = false;
  this[kReplyStartTime] = undefined;
  this.log = log;
}
Reply.props = [];
Reply.instanceProperties = new Set(['raw', 'request', 'log']);

Object.defineProperties(Reply.prototype, {
  [kRouteContext]: {
    get() {
      return this.request[kRouteContext];
    },
  },
  elapsedTime: {
    get() {
      if (this[kReplyStartTime] === undefined) return 0;
      return (this[kReplyEndTime] || now()) - this[kReplyStartTime];
    },
  },
  mediaType: {
    get() {
      return ContentType.from(this.getHeader('content-type')).mediaType;
    },
  },
  server: {
    get() {
      return this.request[kRouteContext].server;
    },
  },
  sent: {
    enumerable: true,
    get() {
      return (this[kReplyHijacked] || this.raw.writableEnded) === true;
    },
  },
  statusCode: {
    get() {
      return this.raw.statusCode;
    },
    set(value) {
      this.code(value);
    },
  },
  routeOptions: {
    get() {
      return this.request.routeOptions;
    },
  },
});

Reply.prototype.writeEarlyHints = function writeEarlyHints(hints, callback) {
  this.raw.writeEarlyHints(hints, callback);
  return this;
};

Reply.prototype.hijack = function hijack() {
  this[kReplyHijacked] = true;
  // A hijacked reply manages its own lifecycle: no handler timeout, no abort signal, no socket metadata.
  const { request } = this;
  if (request[kRequestSignal]) {
    clearTimeout(request[kTimeoutTimer]);
    request[kTimeoutTimer] = null;
    if (request[kOnAbort]) {
      request.raw.removeListener('close', request[kOnAbort]);
      request[kOnAbort] = null;
    }
  }
  const socket = request.raw.socket;
  if (socket && socket._meta && socket._meta.request === request) {
    socket.removeListener('timeout', socket._meta.onTimeout);
    socket._meta = null;
  }
  return this;
};

Reply.prototype.send = function send(payload) {
  if (this[kReplyIsRunningOnErrorHook]) throw new XUFA_ERR_SEND_INSIDE_ONERR();
  if (this.sent === true) {
    this.log.warn({ err: new XUFA_ERR_REP_ALREADY_SENT(this.request.url, this.request.method) });
    return this;
  }
  if (this[kReplyIsError] || payload instanceof Error) {
    this[kReplyIsError] = false;
    onErrorHook(this, payload, onSendHook);
    return this;
  }
  if (payload === undefined) {
    onSendHook(this, payload);
    return this;
  }
  const headers = this[kReplyHeaders];
  // Most replies have no content type set: then there is nothing to parse. An invalid one counts as none.
  let contentType = null;
  let hasContentType = false;
  if (headers['content-type'] !== undefined || this.raw.hasHeader('content-type')) {
    contentType = ContentType.from(this.getHeader('content-type'));
    hasContentType = contentType.isEmpty === false;
  }

  if (payload !== null) {
    if (typeof payload === 'string') {
      if (!hasContentType) {
        headers['content-type'] = TEXT_TYPE;
        onSendHook(this, payload);
        return this;
      }
    } else if (
      typeof payload.pipe === 'function' ||
      typeof payload.getReader === 'function' ||
      (typeof payload === 'object' && toString.call(payload) === '[object Response]')
    ) {
      onSendHook(this, payload);
      return this;
    } else if (payload.buffer instanceof ArrayBuffer) {
      if (!hasContentType) headers['content-type'] = OCTET_TYPE;
      const buffer = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
      onSendHook(this, buffer);
      return this;
    }
  }

  if (this[kReplySerializer] !== null) {
    if (typeof payload !== 'string') {
      preSerializationHook(this, payload);
      return this;
    }
    onSendHook(this, this[kReplySerializer](payload));
    return this;
  }

  if (!hasContentType) {
    headers['content-type'] = JSON_TYPE;
  } else {
    // Any JSON media type (application/hal+json...): serialized, with a charset when it has none.
    if (contentType.mediaType.indexOf('json') === -1) {
      onSendHook(this, payload);
      return this;
    }
    if (!contentType.parameters.has('charset')) headers['content-type'] = `${contentType.toString()}; charset=utf-8`;
  }
  if (typeof payload !== 'string') {
    preSerializationHook(this, payload);
    return this;
  }
  onSendHook(this, payload);
  return this;
};

Reply.prototype.getHeader = function getHeader(key) {
  const name = key.toLowerCase();
  const value = this[kReplyHeaders][name];
  return value !== undefined ? value : this.raw.getHeader(name);
};

Reply.prototype.getHeaders = function getHeaders() {
  return { ...this.raw.getHeaders(), ...this[kReplyHeaders] };
};

Reply.prototype.hasHeader = function hasHeader(key) {
  const name = key.toLowerCase();
  return this[kReplyHeaders][name] !== undefined || this.raw.hasHeader(name);
};

Reply.prototype.removeHeader = function removeHeader(key) {
  const name = key.toLowerCase();
  delete this[kReplyHeaders][name];
  if (!this.raw.headersSent) this.raw.removeHeader(name);
  return this;
};

Reply.prototype.header = function header(key, value = '') {
  const name = key.toLowerCase();
  const headers = this[kReplyHeaders];
  if (name === 'set-cookie') {
    // Cookies add up (RFC 7230 §3.2.2), including the ones set on the raw response.
    let current = headers[name];
    if (current === undefined && this.raw.hasHeader(name)) current = this.raw.getHeader(name);
    if (current !== undefined) {
      const list = Array.isArray(current) ? current.slice() : [current];
      if (Array.isArray(value)) list.push(...value);
      else list.push(value);
      headers[name] = list;
    } else {
      headers[name] = Array.isArray(value) ? value.slice() : value;
    }
  } else {
    headers[name] = value;
  }
  return this;
};

Reply.prototype.headers = function setHeaders(headers) {
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i += 1) this.header(keys[i], headers[keys[i]]);
  return this;
};

// https://datatracker.ietf.org/doc/html/rfc7230#section-4.1.2
const INVALID_TRAILERS = new Set([
  'transfer-encoding',
  'content-length',
  'host',
  'cache-control',
  'max-forwards',
  'te',
  'authorization',
  'set-cookie',
  'content-encoding',
  'content-type',
  'content-range',
  'trailer',
]);

Reply.prototype.trailer = function trailer(key, fn) {
  const name = key.toLowerCase();
  if (INVALID_TRAILERS.has(name)) throw new XUFA_ERR_BAD_TRAILER_NAME(name);
  if (typeof fn !== 'function') throw new XUFA_ERR_BAD_TRAILER_VALUE(name, typeof fn);
  if (this[kReplyTrailers] === null) this[kReplyTrailers] = {};
  this[kReplyTrailers][name] = fn;
  return this;
};

Reply.prototype.hasTrailer = function hasTrailer(key) {
  return this[kReplyTrailers] !== null && this[kReplyTrailers][key.toLowerCase()] !== undefined;
};

Reply.prototype.removeTrailer = function removeTrailer(key) {
  if (this[kReplyTrailers] === null) return this;
  this[kReplyTrailers][key.toLowerCase()] = undefined;
  return this;
};

Reply.prototype.code = function code(value) {
  const statusCode = +value;
  if (!(statusCode >= 100 && statusCode <= 599)) throw new XUFA_ERR_BAD_STATUS_CODE(value || String(value));
  this.raw.statusCode = statusCode;
  this[kReplyHasStatusCode] = true;
  return this;
};

Reply.prototype.status = Reply.prototype.code;

Reply.prototype.getSerializationFunction = function getSerializationFunction(schemaOrStatus, contentType) {
  const context = this[kRouteContext];
  if (typeof schemaOrStatus === 'string' || typeof schemaOrStatus === 'number') {
    const byStatus = context[kSchemaResponse] && context[kSchemaResponse][schemaOrStatus];
    if (typeof contentType === 'string') return byStatus && byStatus[contentType];
    return byStatus;
  }
  if (typeof schemaOrStatus === 'object') {
    return context[kReplyCacheSerializeFns] ? context[kReplyCacheSerializeFns].get(schemaOrStatus) : undefined;
  }
  return undefined;
};

Reply.prototype.compileSerializationSchema = function compileSerializationSchema(schema, httpStatus, contentType) {
  const { request } = this;
  const context = this[kRouteContext];
  if (context[kReplyCacheSerializeFns] && context[kReplyCacheSerializeFns].has(schema)) {
    return context[kReplyCacheSerializeFns].get(schema);
  }
  const controller = this.server[kSchemaController];
  let compiler = context.serializerCompiler || controller.serializerCompiler;
  if (!compiler) {
    controller.setupSerializer(this.server[kOptions]);
    compiler = controller.serializerCompiler;
  }
  const input = { schema, method: request.method, url: request.url };
  if (httpStatus !== undefined) input.httpStatus = httpStatus;
  if (contentType !== undefined) input.contentType = contentType;
  const serializeFn = compiler(input);
  if (context[kReplyCacheSerializeFns] == null) context[kReplyCacheSerializeFns] = new WeakMap();
  context[kReplyCacheSerializeFns].set(schema, serializeFn);
  return serializeFn;
};

Reply.prototype.serializeInput = function serializeInput(input, schema, httpStatusArg, contentTypeArg) {
  const possibleContentType = httpStatusArg;
  const httpStatus = typeof schema === 'string' || typeof schema === 'number' ? schema : httpStatusArg;
  const contentType = httpStatus && possibleContentType !== httpStatus ? possibleContentType : contentTypeArg;
  const context = this[kRouteContext];
  let serialize;
  if (httpStatus != null) {
    const byStatus = context[kSchemaResponse] && context[kSchemaResponse][httpStatus];
    serialize = contentType != null ? byStatus && byStatus[contentType] : byStatus;
    if (serialize == null) {
      if (contentType) throw new XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN(httpStatus, contentType);
      throw new XUFA_ERR_MISSING_SERIALIZATION_FN(httpStatus);
    }
  } else if (context[kReplyCacheSerializeFns] && context[kReplyCacheSerializeFns].has(schema)) {
    serialize = context[kReplyCacheSerializeFns].get(schema);
  } else {
    serialize = this.compileSerializationSchema(schema, httpStatus, contentType);
  }
  return serialize(input);
};

Reply.prototype.serialize = function serializePayload(payload) {
  if (this[kReplySerializer] !== null) return this[kReplySerializer](payload);
  const context = this[kRouteContext];
  if (context && context[kReplySerializerDefault])
    return context[kReplySerializerDefault](payload, this.raw.statusCode);
  return serialize(context, payload, this.raw.statusCode);
};

Reply.prototype.serializer = function setSerializer(fn) {
  this[kReplySerializer] = fn;
  return this;
};

Reply.prototype.type = function type(value) {
  this[kReplyHeaders]['content-type'] = value;
  return this;
};

Reply.prototype.redirect = function redirect(url, statusCode) {
  let code = statusCode;
  if (!code) code = this[kReplyHasStatusCode] ? this.raw.statusCode : 302;
  return this.header('location', url).code(code).send();
};

Reply.prototype.callNotFound = function callNotFound() {
  notFound(this);
  return this;
};

// A reply is a thenable: `await reply` waits for the response to be written.
Reply.prototype.then = function then(fulfilled, rejected) {
  if (this.sent) {
    fulfilled();
    return;
  }
  finished(this.raw, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      if (rejected) rejected(err);
      else if (this.log) this.log.warn('unhandled rejection on reply.then');
    } else {
      fulfilled();
    }
  });
};

function assertReplyDecoration(reply, name) {
  if (!decorators.hasKey(reply, name) && !decorators.exist(reply, name))
    throw new XUFA_ERR_DEC_UNDECLARED(name, 'reply');
}

Reply.prototype.getDecorator = function getDecorator(name) {
  assertReplyDecoration(this, name);
  const decorator = this[name];
  return typeof decorator === 'function' ? decorator.bind(this) : decorator;
};

Reply.prototype.setDecorator = function setDecorator(name, value) {
  assertReplyDecoration(this, name);
  this[name] = value;
};

function preSerializationHook(reply, payload) {
  const hooks = reply[kRouteContext].preSerialization;
  if (hooks !== null) preSerializationHookRunner(hooks, reply.request, reply, payload, preSerializationHookEnd);
  else preSerializationHookEnd(null, undefined, reply, payload);
}

function preSerializationHookEnd(err, request, reply, payload) {
  if (err != null) {
    onErrorHook(reply, err);
    return;
  }
  let serialized;
  try {
    const context = reply[kRouteContext];
    if (reply[kReplySerializer] !== null) {
      serialized = reply[kReplySerializer](payload);
    } else if (context && context[kReplySerializerDefault]) {
      serialized = context[kReplySerializerDefault](payload, reply.raw.statusCode);
    } else {
      // Without onSend hooks (which are given a string) the JSON may be bytes, sent as they are.
      serialized = serialize(
        context,
        payload,
        reply.raw.statusCode,
        reply[kReplyHeaders]['content-type'],
        context.onSend === null
      );
    }
  } catch (e) {
    e.serialization = reply[kRouteContext].config;
    onErrorHook(reply, e);
    return;
  }
  onSendHook(reply, serialized);
}

function onSendHook(reply, payload) {
  const hooks = reply[kRouteContext].onSend;
  if (hooks !== null) onSendHookRunner(hooks, reply.request, reply, payload, wrapOnSendEnd);
  else onSendEnd(reply, payload);
}

function wrapOnSendEnd(err, request, reply, payload) {
  if (err != null) onErrorHook(reply, err);
  else onSendEnd(reply, payload);
}

function safeWriteHead(reply, statusCode) {
  try {
    reply.raw.writeHead(statusCode, reply[kReplyHeaders]);
  } catch (err) {
    if (err.code === 'ERR_HTTP_HEADERS_SENT') {
      reply.log.warn(
        `Reply was already sent, did you forget to "return reply" in the "${reply.request.raw.url}" (${reply.request.raw.method}) route?`
      );
    }
    throw err;
  }
}

function onSendEnd(reply, payloadArg) {
  let payload = payloadArg;
  const res = reply.raw;
  const req = reply.request;
  const headers = reply[kReplyHeaders];

  if (reply[kReplyTrailers] !== null) {
    let trailerNames = '';
    for (const name of Object.keys(reply[kReplyTrailers])) {
      if (typeof reply[kReplyTrailers][name] === 'function') trailerNames += ` ${name}`;
    }
    if (trailerNames !== '') {
      // HTTP/1 sends trailers with chunked encoding; HTTP/2 has them natively.
      if (!isHttp2Reply(reply)) headers['transfer-encoding'] = 'chunked';
      headers.trailer = trailerNames.trim();
    } else {
      reply[kReplyTrailers] = null;
    }
  }

  // A Response gives the status, the headers and a body (a ReadableStream or null).
  if (payload != null && typeof payload === 'object' && toString.call(payload) === '[object Response]') {
    if (typeof payload.status === 'number') reply.code(payload.status);
    if (typeof payload.headers === 'object' && typeof payload.headers.forEach === 'function') {
      for (const [name, value] of payload.headers) reply.header(name, value);
    }
    if (payload.body !== null && payload.bodyUsed) throw new XUFA_ERR_REP_RESPONSE_BODY_CONSUMED();
    payload = payload.body;
  }

  const { statusCode } = res;
  if (payload === undefined || payload === null) {
    // No Content-Length for 1xx, 204 and 304 responses, nor alongside Transfer-Encoding; HEAD keeps its own.
    if (
      statusCode >= 200 &&
      statusCode !== 204 &&
      statusCode !== 304 &&
      req.method !== 'HEAD' &&
      reply[kReplyTrailers] === null
    ) {
      headers['content-length'] = '0';
    }
    safeWriteHead(reply, statusCode);
    sendTrailer(payload, res, reply);
    return;
  }

  // Responses that have no content (RFC 9110 §6.4.1, §15.3.6, §15.4.5): no body, no Content-Type or Length.
  if ((statusCode >= 100 && statusCode < 200) || statusCode === 204 || statusCode === 205 || statusCode === 304) {
    if (statusCode !== 304) reply.removeHeader('content-type');
    reply.removeHeader('content-length');
    if (statusCode === 205) headers['content-length'] = '0';
    safeWriteHead(reply, statusCode);
    sendTrailer(undefined, res, reply);
    if (typeof payload.resume === 'function') {
      payload.on('error', noop);
      payload.resume();
    }
    return;
  }

  if (typeof payload.pipe === 'function') {
    sendStream(payload, res, reply);
    return;
  }
  if (typeof payload.getReader === 'function') {
    sendWebStream(payload, res, reply);
    return;
  }
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    throw new XUFA_ERR_REP_INVALID_PAYLOAD_TYPE(typeof payload);
  }

  if (reply[kReplyTrailers] === null) {
    const contentLength = headers['content-length'];
    if (contentLength === undefined) {
      headers['content-length'] = `${typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length}`;
    } else if (req.raw.method !== 'HEAD') {
      const length = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length;
      if (Number(contentLength) !== length) headers['content-length'] = `${length}`;
    }
  }
  safeWriteHead(reply, statusCode);
  writePayload(payload, res, reply);
}

function isHttp2Reply(reply) {
  return reply.request.raw && reply.request.raw.httpVersionMajor === 2;
}

function writePayload(payload, res, reply) {
  if (!isHttp2Reply(reply) || Buffer.byteLength(payload) <= HTTP2_WRITE_CHUNK_SIZE) {
    if (reply[kReplyTrailers] === null) {
      // end(payload) corks the socket: head, body and end go out in one write.
      res.end(payload, null, null);
      return;
    }
    res.write(payload);
    sendTrailer(payload, res, reply);
    return;
  }
  writeHttp2Payload(payload, res, () => sendTrailer(payload, res, reply));
}

function writeHttp2Payload(payload, res, done) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let offset = 0;
  function writeChunk() {
    while (offset < buffer.length) {
      if (res.destroyed || res.writableEnded) return;
      const end = Math.min(offset + HTTP2_WRITE_CHUNK_SIZE, buffer.length);
      const more = res.write(buffer.subarray(offset, end));
      offset = end;
      if (more === false) {
        res.once('drain', writeChunk);
        return;
      }
    }
    done();
  }
  writeChunk();
}

function logStreamError(err, reply) {
  reply.server[kLogController].streamError(err, reply.request, reply);
}

function copyHeadersForStream(reply, res) {
  if (!res.headersSent) {
    const headers = reply[kReplyHeaders];
    for (const key of Object.keys(headers)) res.setHeader(key, headers[key]);
  } else {
    reply.log.warn("response will send, but you shouldn't use res.writeHead in stream mode");
  }
}

function sendWebStream(payload, res, reply) {
  if (payload.locked) throw new XUFA_ERR_REP_READABLE_STREAM_LOCKED();
  let sourceOpen = true;
  let errorLogged = false;
  let waitingDrain = false;
  const reader = payload.getReader();

  finished(res, (err) => {
    if (sourceOpen) {
      if (err != null && res.headersSent && !errorLogged) {
        errorLogged = true;
        logStreamError(err, reply);
      }
      reader.cancel().catch(noop);
    }
  });
  copyHeadersForStream(reply, res);

  function onRead(result) {
    if (result.done) {
      sourceOpen = false;
      sendTrailer(null, res, reply);
      return;
    }
    if (res.destroyed) {
      sourceOpen = false;
      reader.cancel().catch(noop);
      return;
    }
    if (res.write(result.value) === false) {
      waitingDrain = true;
      res.once('drain', onDrain);
      return;
    }
    reader.read().then(onRead, onReadError);
  }

  function onDrain() {
    if (!waitingDrain || !sourceOpen || res.destroyed) return;
    waitingDrain = false;
    reader.read().then(onRead, onReadError);
  }

  function onReadError(err) {
    sourceOpen = false;
    if (res.headersSent || reply.request.raw.aborted === true) {
      if (!errorLogged) {
        errorLogged = true;
        logStreamError(err, reply);
      }
      res.destroy();
    } else {
      onErrorHook(reply, err);
    }
  }

  reader.read().then(onRead, onReadError);
}

function sendStream(payload, res, reply) {
  let sourceOpen = true;
  let errorLogged = false;
  // Trailers once the stream ended.
  if (reply[kReplyTrailers] !== null) payload.on('end', () => sendTrailer(null, res, reply));

  finished(payload, { readable: true, writable: false }, (err) => {
    sourceOpen = false;
    if (err != null) {
      if (res.headersSent || reply.request.raw.aborted === true) {
        if (!errorLogged) {
          errorLogged = true;
          logStreamError(err, reply);
        }
        res.destroy();
      } else {
        onErrorHook(reply, err);
      }
    }
  });

  finished(res, (err) => {
    if (!sourceOpen) return;
    if (err != null && res.headersSent && !errorLogged) {
      errorLogged = true;
      logStreamError(err, reply);
    }
    if (typeof payload.destroy === 'function') payload.destroy();
    else if (typeof payload.close === 'function') payload.close(noop);
    else if (typeof payload.abort === 'function') payload.abort();
    else reply.log.warn('stream payload does not end properly');
  });

  // Streams fail asynchronously (a missing file gives a 404): the head is written with the first data.
  copyHeadersForStream(reply, res);
  payload.pipe(res);
}

function sendTrailer(payload, res, reply) {
  const trailers = reply[kReplyTrailers];
  if (trailers === null) {
    res.end(null, null, null);
    return;
  }
  const values = {};
  let pending = 0;
  let skipped = true;
  let sent = false;
  function send() {
    if (pending === 0 && !sent) {
      sent = true;
      res.addTrailers(values);
      res.end(null, null, null);
    }
  }
  for (const name of Object.keys(trailers)) {
    if (typeof trailers[name] !== 'function') continue;
    skipped = false;
    pending += 1;
    let called = false;
    const cb = (err, value) => {
      if (called) return;
      called = true;
      pending -= 1;
      // Trailers that fail are dropped; they do not affect the client.
      if (err) reply.log.debug(err);
      else values[name] = value;
      process.nextTick(send);
    };
    const result = trailers[name](reply, payload, cb);
    if (result !== undefined && result !== null && typeof result.then === 'function') {
      result.then((value) => cb(null, value), cb);
    } else if (result !== undefined && trailers[name].length < 3) {
      // A handler returning its value without a callback.
      cb(null, result);
    }
  }
  if (skipped) res.end(null, null, null);
}

function onErrorHook(reply, error, cb) {
  const hooks = reply[kRouteContext].onError;
  if (hooks !== null && !reply[kReplyNextErrorHandler]) {
    reply[kReplyIsRunningOnErrorHook] = true;
    onSendHookRunner(hooks, reply.request, reply, error, () => handleError(reply, error, cb));
  } else {
    handleError(reply, error, cb);
  }
}

// Listeners of the end of the response: onResponse hooks and the log of completed requests.
function setupResponseListeners(reply) {
  reply[kReplyStartTime] = now();
  const onResFinished = (err) => {
    reply[kReplyEndTime] = now();
    reply.raw.removeListener('finish', onResFinished);
    reply.raw.removeListener('error', onResFinished);
    const { request } = reply;
    if (request[kRequestSignal]) {
      clearTimeout(request[kTimeoutTimer]);
      request[kTimeoutTimer] = null;
      if (request[kOnAbort]) {
        request.raw.removeListener('close', request[kOnAbort]);
        request[kOnAbort] = null;
      }
    }
    // Keep-alive sockets do not keep the request and reply once the response is written.
    const socket = request.raw.socket;
    if (socket && socket._meta && socket._meta.request === request) {
      socket.removeListener('timeout', socket._meta.onTimeout);
      socket._meta = null;
    }
    const context = reply[kRouteContext];
    if (context && context.onResponse !== null) {
      onResponseHookRunner(context.onResponse, request, reply, onResponseCallback);
    } else {
      onResponseCallback(err, request, reply);
    }
  };
  reply.raw.on('finish', onResFinished);
  reply.raw.on('error', onResFinished);
}

function onResponseCallback(err, request, reply) {
  reply.server[kLogController].requestCompleted(err, request, reply);
}

// The Reply class of an encapsulated instance: its decorators with values are set by its constructor.
function buildReply(R) {
  const props = R.props.slice();
  function XufaReply(res, request, log) {
    this.raw = res;
    this[kReplyIsError] = false;
    this[kReplyErrorHandlerCalled] = false;
    this[kReplyHijacked] = false;
    this[kReplySerializer] = null;
    this.request = request;
    this[kReplyHeaders] = {};
    this[kReplyTrailers] = null;
    this[kReplyStartTime] = undefined;
    this[kReplyEndTime] = undefined;
    this.log = log;
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      this[prop.key] = prop.value;
    }
  }
  Object.setPrototypeOf(XufaReply.prototype, R.prototype);
  Object.setPrototypeOf(XufaReply, R);
  XufaReply.parent = R;
  XufaReply.props = props;
  return XufaReply;
}

function notFound(reply) {
  if (reply[kRouteContext][kFourOhFourContext] === null) {
    reply.log.warn('Trying to send a NotFound error inside a 404 handler. Sending basic 404 response.');
    reply.code(404).send('404 Not Found');
    return;
  }
  reply.request[kRouteContext] = reply[kRouteContext][kFourOhFourContext];
  const hooks = reply[kRouteContext].preHandler;
  const { preHandlerCallback } = internals();
  if (hooks !== null) preHandlerHookRunner(hooks, reply.request, reply, preHandlerCallback);
  else preHandlerCallback(null, reply.request, reply);
}

// The default serialization: the response schema of the status code, or JSON.stringify. With `bytes`, a serializer of
// @xufa/serializer that writes bytes (for large values) gives them as a Buffer: no string to make, and none for the
// socket to encode again.
function serialize(context, data, statusCode, contentType, bytes = false) {
  const fn = getSchemaSerializer(context, statusCode, contentType);
  if (!fn) return JSON.stringify(data);
  return bytes && fn.toBuffer !== undefined ? fn.toBuffer(data) : fn(data);
}

function noop() {}

module.exports = Reply;
module.exports.buildReply = buildReply;
module.exports.setupResponseListeners = setupResponseListeners;
module.exports.onErrorHook = onErrorHook;
