// The context of a route: its handler, options, compiled hooks and schemas, and the instance it belongs to.
const {
  kFourOhFourContext,
  kReplySerializerDefault,
  kSchemaErrorFormatter,
  kErrorHandler,
  kChildLoggerFactory,
  kReply,
  kRequest,
  kBodyLimit,
  kLogLevel,
  kContentTypeParser,
  kRouteByXufa,
  kRequestCacheValidateFns,
  kReplyCacheSerializeFns,
  kHandlerTimeout,
  kSchemaHeaders,
  kSchemaParams,
  kSchemaQuerystring,
  kSchemaBody,
  kSchemaResponse,
  kOptions,
} = require('./symbols');
const { fastHeadWorks } = require('./fast-head');

function Context({
  schema,
  handler,
  config,
  childLoggerFactory,
  errorHandler,
  bodyLimit,
  logLevel,
  logSerializers,
  attachValidation,
  validatorCompiler,
  serializerCompiler,
  replySerializer,
  schemaErrorFormatter,
  exposeHeadRoute,
  prefixTrailingSlash,
  server,
  isXufa,
  handlerTimeout,
}) {
  this.schema = schema;
  this.handler = handler;
  this.Reply = server[kReply];
  this.Request = server[kRequest];
  this.contentTypeParser = server[kContentTypeParser];
  this.onRequest = null;
  this.preParsing = null;
  this.preValidation = null;
  this.preHandler = null;
  this.preSerialization = null;
  this.onSend = null;
  this.onError = null;
  this.onResponse = null;
  this.onTimeout = null;
  this.onRequestAbort = null;
  this.config = config;
  this.errorHandler = errorHandler || server[kErrorHandler];
  this.childLoggerFactory = childLoggerFactory || server[kChildLoggerFactory];
  this._middie = null;
  this._parserOptions = { limit: bodyLimit || server[kBodyLimit] };
  this.exposeHeadRoute = exposeHeadRoute;
  this.prefixTrailingSlash = prefixTrailingSlash;
  this.logLevel = logLevel || server[kLogLevel];
  this.logSerializers = logSerializers;
  this[kFourOhFourContext] = null;
  this.attachValidation = attachValidation;
  this[kReplySerializerDefault] = replySerializer;
  this.schemaErrorFormatter = schemaErrorFormatter || server[kSchemaErrorFormatter] || defaultSchemaErrorFormatter;
  this[kRouteByXufa] = isXufa;
  this[kRequestCacheValidateFns] = null;
  this[kReplyCacheSerializeFns] = null;
  this.validatorCompiler = validatorCompiler || null;
  this.serializerCompiler = serializerCompiler || null;
  this.handlerTimeout = handlerTimeout || server[kHandlerTimeout] || 0;
  this.server = server;
  // Heads of responses written by xufa (lib/fast-head.js), unless the option fastHead is false or Node changed.
  this.fastHead = Boolean(server[kOptions]) && server[kOptions].fastHead !== false && fastHeadWorks();
  // Compiled validators and serializers, set when the instance is ready.
  this[kSchemaHeaders] = undefined;
  this[kSchemaParams] = undefined;
  this[kSchemaQuerystring] = undefined;
  this[kSchemaBody] = undefined;
  this[kSchemaResponse] = undefined;
  // Whether a request goes through validation at all (set with the schemas).
  this.hasValidation = false;
}

// "body/name must be string, body must have required property 'id'": the error of a failed validation.
function defaultSchemaErrorFormatter(errors, dataVar) {
  let text = '';
  for (let i = 0; i < errors.length; i += 1) {
    const e = errors[i];
    if (i > 0) text += ', ';
    text += `${dataVar}${e.instancePath || ''} ${e.message}`;
  }
  // Validation errors are expected, frequent and caused by clients: no stack trace is captured for them.
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 0;
  const error = new Error(text);
  Error.stackTraceLimit = limit;
  return error;
}

module.exports = Context;
module.exports.defaultSchemaErrorFormatter = defaultSchemaErrorFormatter;
