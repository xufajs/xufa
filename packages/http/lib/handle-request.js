// The lifecycle of a request after onRequest and preParsing: body parsing, preValidation, validation, preHandler and
// the handler.
const diagnostics = require('node:diagnostics_channel');
const wrapThenable = require('./wrap-thenable');
const { validate: validateSchema } = require('./validation');
const { preValidationHookRunner, preHandlerHookRunner } = require('./hooks');
const { XUFA_ERR_CTP_INVALID_MEDIA_TYPE, XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE } = require('./errors');
const { setErrorStatusCode } = require('./error-handler');
const {
  kReplyIsError,
  kRouteContext,
  kFourOhFourContext,
  kSupportedHTTPMethods,
  kRequestContentType,
  kDiagnosticsStore,
} = require('./symbols');
const ContentType = require('./content-type');

const channels = diagnostics.tracingChannel('xufa.request.handler');

// `this` is the instance of the route.
function handleRequest(err, request, reply) {
  if (reply.sent === true) return;
  if (err != null) {
    reply[kReplyIsError] = true;
    reply.send(err);
    return;
  }
  const { method } = request.raw;
  const methods = this[kSupportedHTTPMethods];
  if (methods.bodyless.has(method)) {
    handler(request, reply);
    return;
  }
  if (methods.bodywith.has(method)) {
    const { headers } = request;
    const contentTypeHeader = headers['content-type'];
    if (contentTypeHeader === undefined) {
      // RFC 10008 §2: a QUERY request must have a Content-Type, when it has a body.
      const contentLength = headers['content-length'];
      const isEmptyBody =
        headers['transfer-encoding'] === undefined && (contentLength === undefined || contentLength === '0');
      if (isEmptyBody) {
        handler(request, reply);
        return;
      }
      if (method === 'QUERY') {
        reply[kReplyIsError] = true;
        reply.status(400).send(new XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE(method));
        return;
      }
      request[kRouteContext].contentTypeParser.run('', handler, request, reply);
      return;
    }
    // The most frequent header goes straight to its parser.
    if (contentTypeHeader === 'application/json') {
      request[kRouteContext].contentTypeParser.run('application/json', handler, request, reply);
      return;
    }
    if (!request[kRequestContentType]) request[kRequestContentType] = ContentType.from(contentTypeHeader);
    if (request[kRequestContentType].isValid === false) {
      reply[kReplyIsError] = true;
      reply.status(415).send(new XUFA_ERR_CTP_INVALID_MEDIA_TYPE());
      return;
    }
    request[kRouteContext].contentTypeParser.run(request[kRequestContentType].toString(), handler, request, reply);
    return;
  }
  // Other methods get a 404, not a 405 (see fastify#862).
  handler(request, reply);
}

function handler(request, reply) {
  try {
    const context = request[kRouteContext];
    // Routes without hooks, validation nor tracing go straight to their handler: fewer calls, and a shorter stack
    // for the errors the handler creates (capturing frames that V8 inlined is costly).
    if (
      context.preValidation === null &&
      context.hasValidation === false &&
      context.preHandler === null &&
      (!channels.hasSubscribers || context[kFourOhFourContext] === null)
    ) {
      if (reply.sent !== true) runHandler(context, request, reply);
      return;
    }
    const hooks = context.preValidation;
    if (hooks !== null) preValidationHookRunner(hooks, request, reply, preValidationCallback);
    else preValidationCallback(null, request, reply);
  } catch (err) {
    preValidationCallback(err, request, reply);
  }
}

// The handler of a route without tracing: what preHandlerCallbackInner does without a store.
function runHandler(context, request, reply) {
  let result;
  try {
    result = context.handler(request, reply);
  } catch (error) {
    reply[kReplyIsError] = true;
    reply.send(error);
    return;
  }
  if (result !== undefined) {
    if (result !== null && typeof result.then === 'function') wrapThenable(result, reply, undefined);
    else reply.send(result);
  }
}

function preValidationCallback(err, request, reply) {
  if (reply.sent === true) return;
  if (err != null) {
    reply[kReplyIsError] = true;
    reply.send(err);
    return;
  }
  const context = request[kRouteContext];
  if (context.hasValidation === false) {
    validationCompleted(request, reply, false);
    return;
  }
  const validationErr = validateSchema(context, request);
  if (validationErr && typeof validationErr.then === 'function') {
    const done = (result) => validationCompleted(request, reply, result);
    validationErr.then(done, done);
  } else {
    validationCompleted(request, reply, validationErr);
  }
}

function validationCompleted(request, reply, validationErr) {
  const context = request[kRouteContext];
  if (validationErr) {
    if (context.attachValidation === false) {
      reply.send(validationErr);
      return;
    }
    reply.request.validationError = validationErr;
  }
  if (context.preHandler !== null) preHandlerHookRunner(context.preHandler, request, reply, preHandlerCallback);
  else preHandlerCallback(null, request, reply);
}

function preHandlerCallback(err, request, reply) {
  if (reply.sent) return;
  const context = request[kRouteContext];
  if (!channels.hasSubscribers || context[kFourOhFourContext] === null) {
    preHandlerCallbackInner(err, request, reply, undefined);
    return;
  }
  const store = {
    request,
    reply,
    async: false,
    route: { url: context.config.url, method: context.config.method },
  };
  reply[kDiagnosticsStore] = store;
  channels.start.runStores(store, preHandlerCallbackInner, undefined, err, request, reply, store);
}

function preHandlerCallbackInner(err, request, reply, store) {
  const context = request[kRouteContext];
  try {
    if (err != null) {
      reply[kReplyIsError] = true;
      if (store) {
        store.error = err;
        setErrorStatusCode(reply, err);
        channels.error.publish(store);
      }
      reply.send(err);
      return;
    }
    let result;
    try {
      result = context.handler(request, reply);
    } catch (error) {
      if (store) {
        store.error = error;
        setErrorStatusCode(reply, error);
        channels.error.publish(store);
      }
      reply[kReplyIsError] = true;
      reply.send(error);
      return;
    }
    if (result !== undefined) {
      if (result !== null && typeof result.then === 'function') wrapThenable(result, reply, store);
      else reply.send(result);
    }
  } finally {
    if (store) channels.end.publish(store);
  }
}

module.exports = handleRequest;
module.exports.internals = { handler, preHandlerCallback };
module.exports[Symbol.for('internals')] = module.exports.internals;
