// Error handlers: the one of the route or the instance, its parents when it throws, and the fallback writing the
// error as JSON.
const { STATUS_CODES } = require('node:http');
const {
  kReplyHeaders,
  kReplyNextErrorHandler,
  kReplyIsRunningOnErrorHook,
  kRouteContext,
  kLogController,
  kDiagnosticsStore,
  kReplyHasStatusCode,
} = require('./symbols');
const { XUFA_ERR_REP_INVALID_PAYLOAD_TYPE, XUFA_ERR_FAILED_ERROR_SERIALIZATION } = require('./errors');
const { getSchemaSerializer } = require('./schemas');
const serializeError = require('./error-serializer');

// wrap-thenable.js requires reply.js, which requires this module: required when needed.
let wrapThenable = null;

function setErrorStatusCode(reply, err) {
  if (!reply[kReplyHasStatusCode] || reply.statusCode === 200) {
    const statusCode = err && (err.statusCode || err.status);
    reply.code(statusCode >= 400 ? statusCode : 500);
  }
}

function setErrorHeaders(error, reply) {
  const res = reply.raw;
  let statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  if (error != null) {
    if (error.headers !== undefined) reply.headers(error.headers);
    if (error.status >= 400) statusCode = error.status;
    else if (error.statusCode >= 400) statusCode = error.statusCode;
  }
  res.statusCode = statusCode;
}

function defaultErrorHandler(error, request, reply) {
  setErrorHeaders(error, reply);
  setErrorStatusCode(reply, error);
  request.server[kLogController].defaultErrorLog(error, request, reply);
  reply.send(error);
}

const rootErrorHandler = {
  func: defaultErrorHandler,
  toJSON() {
    return `${this.func.name.toString()}()`;
  },
};

// Error handlers are chained by prototype: when one throws, the error goes to the one of the parent instance.
function buildErrorHandler(parent = rootErrorHandler, func = undefined) {
  if (!func) return parent;
  const errorHandler = Object.create(parent);
  errorHandler.func = func;
  return errorHandler;
}

function handleError(reply, error, cb) {
  reply[kReplyIsRunningOnErrorHook] = false;
  const context = reply[kRouteContext];
  if (reply[kReplyNextErrorHandler] === false) {
    fallbackErrorHandler(error, reply, (r, payload) => {
      try {
        r.raw.writeHead(r.raw.statusCode, r[kReplyHeaders]);
      } catch (err) {
        r.server[kLogController].writeHeadError(err, r.request, r);
        r.raw.writeHead(r.raw.statusCode);
      }
      r.raw.end(payload);
    });
    return;
  }
  const errorHandler = reply[kReplyNextErrorHandler] || context.errorHandler;
  // When this handler throws, the next one is the parent's.
  reply[kReplyNextErrorHandler] = Object.getPrototypeOf(errorHandler);
  // The content type is guessed again for the payload of the error.
  delete reply[kReplyHeaders]['content-type'];
  delete reply[kReplyHeaders]['content-length'];
  const { func } = errorHandler;
  if (!func) {
    reply[kReplyNextErrorHandler] = false;
    fallbackErrorHandler(error, reply, cb);
    return;
  }
  try {
    const result = func(error, reply.request, reply);
    if (result !== undefined) {
      if (result !== null && typeof result.then === 'function') {
        if (wrapThenable === null) wrapThenable = require('./wrap-thenable'); // eslint-disable-line global-require
        wrapThenable(result, reply, reply[kDiagnosticsStore] || null);
      } else {
        reply.send(result);
      }
    }
  } catch (err) {
    reply.send(err);
  }
}

function fallbackErrorHandler(error, reply, cb) {
  const { statusCode } = reply;
  const headers = reply[kReplyHeaders];
  headers['content-type'] = headers['content-type'] ?? 'application/json; charset=utf-8';
  let payload;
  try {
    const serializer = getSchemaSerializer(reply[kRouteContext], statusCode, headers['content-type']);
    if (serializer === false) {
      payload = serializeError({
        error: STATUS_CODES[`${statusCode}`],
        code: error.code,
        message: error.message,
        statusCode,
      });
    } else {
      payload = serializer(
        Object.create(error, {
          error: { value: STATUS_CODES[`${statusCode}`] },
          message: { value: error.message },
          statusCode: { value: statusCode },
        })
      );
    }
  } catch (err) {
    reply.server[kLogController].serializerError(err, reply.request, reply, { statusCode: reply.raw.statusCode });
    reply.code(500);
    payload = serializeError(new XUFA_ERR_FAILED_ERROR_SERIALIZATION(err.message, error.message));
  }
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    payload = serializeError(new XUFA_ERR_REP_INVALID_PAYLOAD_TYPE(typeof payload));
  }
  headers['content-length'] = `${Buffer.byteLength(payload)}`;
  cb(reply, payload);
}

module.exports = { buildErrorHandler, handleError, setErrorStatusCode, rootErrorHandler };
