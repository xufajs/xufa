// The logger of an instance (@xufa/logger, a logger instance given, or a logger that does nothing), the child
// logger of each request, and the LogController writing the lines of the framework itself.
import {
  XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED,
  XUFA_ERR_LOG_INVALID_LOGGER_CONFIG,
  XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE,
  XUFA_ERR_LOG_INVALID_LOGGER,
  XUFA_ERR_LOG_INVALID_LOG_CONTROLLER,
  XUFA_ERR_LOG_INVALID_DESTINATION,
} from './errors.js';
import { kLogController } from './symbols.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// @xufa/logger is loaded when a logger is configured: instances without logging do not load it (require() of an ES
// module, which an import could not leave for later).
let loggerModule = null;
function loadLogger() {
  if (loggerModule === null) loggerModule = require('@xufa/logger');
  return loggerModule;
}

const serializers = {
  req: function asReqValue(req) {
    return {
      method: req.method,
      url: req.url,
      version: req.headers && req.headers['accept-version'],
      host: req.host,
      remoteAddress: req.ip,
      remotePort: req.socket ? req.socket.remotePort : undefined,
    };
  },
  err: function asErrValue(err) {
    return loadLogger().stdSerializers.err(err);
  },
  res: function asResValue(reply) {
    return { statusCode: reply.statusCode };
  },
};

function noop() {}

// The logger used when logging is off: every method does nothing and children are itself.
function createNullLogger() {
  const logger = {
    level: 'silent',
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    silent: noop,
    child() {
      return logger;
    },
  };
  return logger;
}

const LOGGER_METHODS = ['info', 'error', 'debug', 'fatal', 'warn', 'trace', 'child'];

// Whether an object is a logger; throws when it has some of the methods of one, but not all.
function validateLogger(logger, strict) {
  const missing = logger ? LOGGER_METHODS.filter((method) => typeof logger[method] !== 'function') : LOGGER_METHODS;
  if (missing.length === 0) return true;
  if (missing.length === LOGGER_METHODS.length && !strict) return false;
  throw new XUFA_ERR_LOG_INVALID_LOGGER(missing.join(','));
}

function buildLogger(opts) {
  const options = opts;
  if (options.stream && options.file) throw new XUFA_ERR_LOG_INVALID_DESTINATION();
  if (options.file) {
    options.stream = loadLogger().destination({ dest: options.file, sync: true, mkdir: true });
    delete options.file;
  }
  const parent = options.logger;
  if (parent) {
    // A logger instance given: a child of it with the serializers of the framework added.
    const childOptions = { ...options };
    delete childOptions.logger;
    delete childOptions.genReqId;
    const parentSerializers = parent[loadLogger().symbols.serializersSym];
    if (parentSerializers) childOptions.serializers = { ...options.serializers, ...parentSerializers };
    return parent.child({}, childOptions);
  }
  return loadLogger()(options, options.stream);
}

function createInstanceLogger(options) {
  if (options.logger && options.loggerInstance) throw new XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED();
  if (!options.loggerInstance && !options.logger) return { logger: createNullLogger(), hasLogger: false };
  if (validateLogger(options.loggerInstance)) {
    const logger = buildLogger({
      logger: options.loggerInstance,
      serializers: { ...serializers, ...options.loggerInstance.serializers },
    });
    return { logger, hasLogger: true };
  }
  if (validateLogger(options.logger)) throw new XUFA_ERR_LOG_INVALID_LOGGER_CONFIG();
  if (options.loggerInstance) throw new XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE();
  const local = {};
  if (Object.prototype.toString.call(options.logger) === '[object Object]') {
    for (const key of Reflect.ownKeys(options.logger)) {
      Object.defineProperty(local, key, {
        value: options.logger[key],
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  local.level = local.level || 'info';
  local.serializers = { ...serializers, ...local.serializers };
  // eslint-disable-next-line no-param-reassign
  options.logger = local;
  return { logger: buildLogger(local), hasLogger: true };
}

function defaultChildLoggerFactory(logger, bindings, opts) {
  return logger.child(bindings, opts);
}

// The logger of a request: a child of the logger of its instance with the id of the request.
function createChildLogger(context, logger, req, reqId, loggerOpts) {
  const bindings = { [context.server[kLogController].requestIdLogLabel]: reqId };
  const child = context.childLoggerFactory.call(context.server, logger, bindings, loggerOpts || {}, req);
  if (context.childLoggerFactory !== defaultChildLoggerFactory) validateLogger(child, true);
  return child;
}

// The lines the framework logs about requests. Extend it to change them.
class LogController {
  constructor(options) {
    const opts = options || {};
    this.disableRequestLogging = opts.disableRequestLogging || false;
    this.isDisableRequestLoggingFunction = typeof this.disableRequestLogging === 'function';
    this.requestIdLogLabel = opts.requestIdLogLabel || 'reqId';
  }

  isLogDisabled(req) {
    return this.isDisableRequestLoggingFunction ? this.disableRequestLogging(req) : this.disableRequestLogging;
  }

  incomingRequest(request) {
    if (this.isLogDisabled(request)) return;
    request.log.info({ req: request }, 'incoming request');
  }

  requestCompleted(error, request, reply) {
    if (this.isLogDisabled(request)) return;
    if (error) reply.log.error({ res: reply, err: error, responseTime: reply.elapsedTime }, 'request errored');
    else reply.log.info({ res: reply, responseTime: reply.elapsedTime }, 'request completed');
  }

  defaultErrorLog(error, request, reply) {
    if (this.isLogDisabled(request)) return;
    if (reply.statusCode >= 500) reply.log.error({ req: request, res: reply, err: error }, error && error.message);
    else reply.log.info({ res: reply, err: error }, error && error.message);
  }

  streamError(error, request, reply) {
    if (this.isLogDisabled(request)) return;
    if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') reply.log.info({ res: reply }, 'stream closed prematurely');
    else reply.log.warn({ err: error }, 'response terminated with an error with headers already sent');
  }

  routeNotFound(request) {
    if (this.isLogDisabled(request)) return;
    const { url, method } = request.raw;
    request.log.info(`Route ${method}:${url} not found`);
  }

  writeHeadError(error, request, reply) {
    if (this.isLogDisabled(request)) return;
    reply.log.warn({ req: request, res: reply, err: error }, error && error.message);
  }

  serializerError(error, request, reply, metadata) {
    if (this.isLogDisabled(request)) return;
    reply.log.error({ err: error, statusCode: metadata.statusCode }, 'The serializer for the given status code failed');
  }

  // eslint-disable-next-line class-methods-use-this
  serviceUnavailable(logger) {
    logger.info({ res: { statusCode: 503 } }, 'request aborted - refusing to accept new requests as server is closing');
  }
}

function createLogController(options) {
  const controller = options.logController;
  if (!controller) {
    // The options of fastify v5 are taken too.
    return new LogController({
      disableRequestLogging: options.disableRequestLogging,
      requestIdLogLabel: options.requestIdLogLabel,
    });
  }
  if (controller instanceof LogController) return controller;
  throw new XUFA_ERR_LOG_INVALID_LOG_CONTROLLER(typeof controller);
}

function now() {
  return performance.now();
}

export {
  now,
  createInstanceLogger,
  createChildLogger,
  defaultChildLoggerFactory,
  createLogController,
  LogController,
  validateLogger,
  serializers,
};
