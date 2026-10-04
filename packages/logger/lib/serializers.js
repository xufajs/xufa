// Standard serializers of errors, requests and responses, as pino-std-serializers writes them.

const seen = Symbol('xufa.logger.seen');

function causeOf(err) {
  const { cause } = err;
  if (typeof cause === 'function') return causeOf({ cause: cause() });
  return cause instanceof Error ? cause : undefined;
}

function messageWithCauses(err) {
  let message = err.message === undefined ? '' : String(err.message);
  const visited = new Set([err]);
  let cause = causeOf(err);
  while (cause && !visited.has(cause)) {
    visited.add(cause);
    message += `: ${cause.message}`;
    cause = causeOf(cause);
  }
  return message;
}

function stackWithCauses(err) {
  let stack = err.stack || '';
  const visited = new Set([err]);
  let cause = causeOf(err);
  while (cause && !visited.has(cause)) {
    visited.add(cause);
    stack += `\ncaused by: ${cause.stack || ''}`;
    cause = causeOf(cause);
  }
  return stack;
}

function errorType(err) {
  const ctor = err.constructor;
  return (ctor && ctor.name) || err.name || 'Error';
}

function copyProps(err, out, serialize) {
  for (const key in err) {
    if (out[key] !== undefined || key === 'cause') continue;
    const value = err[key];
    if (value instanceof Error) {
      if (!value[seen]) out[key] = serialize(value);
    } else if (typeof value !== 'function') {
      out[key] = value;
    }
  }
}

function serializeError(err, withCause) {
  if (!(err instanceof Error) && !(err && typeof err === 'object' && 'message' in err && 'stack' in err)) return err;
  err[seen] = true;
  try {
    const out = {
      type: errorType(err),
      message: withCause ? String(err.message) : messageWithCauses(err),
      stack: withCause ? err.stack : stackWithCauses(err),
    };
    if (Array.isArray(err.errors)) {
      out.aggregateErrors = err.errors.map((e) => serializeError(e, withCause));
    }
    if (withCause) {
      const cause = causeOf(err);
      if (cause && !cause[seen]) out.cause = serializeError(cause, true);
    }
    copyProps(err, out, (e) => serializeError(e, withCause));
    return out;
  } finally {
    delete err[seen];
  }
}

const err = (e) => serializeError(e, false);
const errWithCause = (e) => serializeError(e, true);

function req(request) {
  const raw = request.raw || request;
  const socket = raw.socket || raw.connection;
  return {
    id: typeof request.id === 'function' ? request.id() : request.id,
    method: request.method,
    url: request.originalUrl || request.url,
    query: request.query,
    params: request.params,
    headers: request.headers,
    remoteAddress: socket && socket.remoteAddress,
    remotePort: socket && socket.remotePort,
  };
}

function res(response) {
  const raw = response.raw || response;
  return {
    statusCode: raw.headersSent ? raw.statusCode : null,
    headers: typeof raw.getHeaders === 'function' ? raw.getHeaders() : raw._headers,
  };
}

// A serializer of your own applied to what the standard one gives (unless it is the standard one).
const wrap = (standard) => (custom) => (custom === standard ? custom : (value) => custom(standard(value)));

module.exports = {
  err,
  errWithCause,
  req,
  res,
  messageWithCauses,
  stackWithCauses,
  mapHttpRequest: (request) => ({ req: req(request) }),
  mapHttpResponse: (response) => ({ res: res(response) }),
  wrapErrorSerializer: wrap(err),
  wrapRequestSerializer: wrap(req),
  wrapResponseSerializer: wrap(res),
};
