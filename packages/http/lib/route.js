// Routes: registration (shorthands, prefixes, HEAD routes, hooks and schemas of each route) and the entry of every
// request once routed.
const createRouter = require('@xufa/router');
const Context = require('./context');
const handleRequest = require('./handle-request');
const {
  onRequestAbortHookRunner,
  lifecycleHooks,
  preParsingHookRunner,
  onTimeoutHookRunner,
  onRequestHookRunner,
} = require('./hooks');
const { normalizeSchema } = require('./schemas');
const { parseHeadOnSendHandlers } = require('./head-route');
const { defaultInitOptions } = require('./config');
const { onClientGone } = require('./request');
const { compileSchemasForValidation, compileSchemasForSerialization } = require('./validation');
const {
  XUFA_ERR_SCH_VALIDATION_BUILD,
  XUFA_ERR_SCH_SERIALIZATION_BUILD,
  XUFA_ERR_DUPLICATED_ROUTE,
  XUFA_ERR_INVALID_URL,
  XUFA_ERR_HOOK_INVALID_HANDLER,
  XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ,
  XUFA_ERR_ROUTE_DUPLICATED_HANDLER,
  XUFA_ERR_ROUTE_HANDLER_NOT_FN,
  XUFA_ERR_ROUTE_MISSING_HANDLER,
  XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED,
  XUFA_ERR_ROUTE_METHOD_INVALID,
  XUFA_ERR_ROUTE_LOG_LEVEL_INVALID,
  XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED,
  XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT,
  XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT,
  XUFA_ERR_HANDLER_TIMEOUT,
  XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER,
} = require('./errors');
const {
  kRoutePrefix,
  kSupportedHTTPMethods,
  kLogLevel,
  kLogSerializers,
  kHooks,
  kSchemaController,
  kOptions,
  kReplySerializerDefault,
  kReplyIsError,
  kRequestPayloadStream,
  kSchemaErrorFormatter,
  kErrorHandler,
  kHasBeenDecorated,
  kRequestAcceptVersion,
  kRouteByXufa,
  kRouteContext,
  kRequestSignal,
  kTimeoutTimer,
  kOnAbort,
  kLogController,
  kGenReqId,
  kRequestQuerystring,
} = require('./symbols');
const { buildErrorHandler } = require('./error-handler');
const { createChildLogger, defaultChildLoggerFactory, LogController } = require('./logger');

const ROUTER_KEYS = [
  'allowUnsafeRegex',
  'buildPrettyMeta',
  'caseSensitive',
  'constraints',
  'defaultRoute',
  'ignoreDuplicateSlashes',
  'ignoreTrailingSlash',
  'maxParamLength',
  'onBadUrl',
  'onMaxParamLength',
  'querystringParser',
  'useSemicolonDelimiter',
];

const ASYNC_PAYLOAD_HOOKS = new Set(['onSend', 'preSerialization', 'onError', 'preParsing']);

// async functions with a `done` parameter mix the two styles: the promise or the callback could be ignored.
function checkAsyncHook(hook, fn) {
  if (fn.constructor.name !== 'AsyncFunction') return;
  if (ASYNC_PAYLOAD_HOOKS.has(hook) ? fn.length === 4 : hook === 'onRequestAbort' ? fn.length !== 1 : fn.length === 3) {
    throw new XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER();
  }
}

function buildRouting(options) {
  const router = createRouter(options);
  let avvio;
  let fourOhFour;
  let logger;
  let hasLogger;
  let setupResponseListeners;
  let throwIfAlreadyStarted;
  let ignoreTrailingSlash;
  let ignoreDuplicateSlashes;
  let return503OnClosing;
  let globalExposeHeadRoutes;
  let keepAliveConnections;
  let trackKeepAlive = false;
  let closing = false;
  // The request logging can be skipped when nothing would be logged (no logger and the default controller).
  let logRequests = true;

  const { FOUND, BAD_URL } = createRouter;

  // The handler of the server: finds the route and runs it.
  function routing(req, res, asyncConstraintCallback) {
    const { constrainer } = router;
    if (constrainer.asyncStrategiesInUse.size > 0) {
      constrainer.deriveConstraints(req, undefined, (err, constraints) => {
        if (err !== null) {
          asyncConstraintCallback(err);
          return;
        }
        try {
          dispatch(req, res, constraints);
        } catch (error) {
          asyncConstraintCallback(error);
        }
      });
      return;
    }
    dispatch(req, res, constrainer.deriveSync === null ? undefined : constrainer.deriveSync(req, undefined));
  }

  function dispatch(req, res, constraints) {
    const result = router.match(req.method, req.url, constraints);
    if (result === null) {
      options.defaultRoute(req, res);
      return;
    }
    if (result.status === FOUND) {
      routeHandler(req, res, result.params, result.store, result.querystring);
    } else if (result.status === BAD_URL) {
      options.onBadUrl(result.path, req, res);
    } else {
      options.onMaxParamLength(result.path, req, res);
    }
  }

  return {
    setup(serverOptions, args) {
      avvio = args.avvio;
      fourOhFour = args.fourOhFour;
      logger = serverOptions.logger;
      hasLogger = args.hasLogger;
      setupResponseListeners = args.setupResponseListeners;
      throwIfAlreadyStarted = args.throwIfAlreadyStarted;
      globalExposeHeadRoutes = serverOptions.exposeHeadRoutes;
      ignoreTrailingSlash = serverOptions.routerOptions.ignoreTrailingSlash;
      ignoreDuplicateSlashes = serverOptions.routerOptions.ignoreDuplicateSlashes;
      return503OnClosing = Object.prototype.hasOwnProperty.call(serverOptions, 'return503OnClosing')
        ? serverOptions.return503OnClosing
        : true;
      keepAliveConnections = args.keepAliveConnections;
      trackKeepAlive = keepAliveConnections instanceof Set;
      logRequests = hasLogger || args.logController.constructor !== LogController;
    },
    routing,
    route,
    hasRoute,
    prepareRoute,
    routeHandler,
    closeRoutes() {
      closing = true;
    },
    printRoutes: router.prettyPrint.bind(router),
    addConstraintStrategy(strategy) {
      throwIfAlreadyStarted('Cannot add constraint strategy!');
      return router.addConstraintStrategy(strategy);
    },
    hasConstraintStrategy(name) {
      return router.hasConstraintStrategy(name);
    },
    isAsyncConstraint() {
      return router.constrainer.asyncStrategiesInUse.size > 0;
    },
    findRoute,
    router,
  };

  // The shorthands: get(url, [options], handler).
  function prepareRoute({ method, url, options: routeOptions, handler, isXufa }) {
    if (typeof url !== 'string') throw new XUFA_ERR_INVALID_URL(typeof url);
    let opts = routeOptions;
    let fn = handler;
    if (!fn && typeof opts === 'function') {
      fn = opts;
      opts = {};
    } else if (fn && typeof fn === 'function') {
      if (Object.prototype.toString.call(opts) !== '[object Object]') {
        throw new XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ(method, url);
      } else if (opts.handler) {
        if (typeof opts.handler === 'function') throw new XUFA_ERR_ROUTE_DUPLICATED_HANDLER(method, url);
        throw new XUFA_ERR_ROUTE_HANDLER_NOT_FN(method, url);
      }
    }
    const full = { ...opts, method, url, path: url, handler: fn || (opts && opts.handler) };
    return route.call(this, { options: full, isXufa });
  }

  function hasRoute({ options: opts }) {
    const method = opts.method ? opts.method.toUpperCase() : '';
    return router.hasRoute(method, opts.url || '', opts.constraints);
  }

  function findRoute(opts) {
    const found = router.find(opts.method ? opts.method.toUpperCase() : '', opts.url || '', opts.constraints);
    if (!found) return null;
    // Only these: the route and the instance can not be changed through it.
    return { handler: found.handler, params: found.params, searchParams: found.searchParams };
  }

  function route({ options: routeOptions, isXufa }) {
    throwIfAlreadyStarted('Cannot add route!');
    const opts = { ...routeOptions };
    const path = opts.url || opts.path || '';
    if (!opts.handler) throw new XUFA_ERR_ROUTE_MISSING_HANDLER(opts.method, path);
    if (opts.errorHandler !== undefined && typeof opts.errorHandler !== 'function') {
      throw new XUFA_ERR_ROUTE_HANDLER_NOT_FN(opts.method, path);
    }
    validateBodyLimitOption(opts.bodyLimit);
    validateHandlerTimeoutOption(opts.handlerTimeout);
    const shouldExposeHead = opts.exposeHeadRoute ?? globalExposeHeadRoutes;
    let isGetRoute = false;
    let isHeadRoute = false;
    if (Array.isArray(opts.method)) {
      for (let i = 0; i < opts.method.length; i += 1) {
        opts.method[i] = normalizeAndValidateMethod.call(this, opts.method[i]);
        validateSchemaBodyOption.call(this, opts.method[i], path, opts.schema);
      }
      isGetRoute = opts.method.includes('GET');
      isHeadRoute = opts.method.includes('HEAD');
    } else {
      opts.method = normalizeAndValidateMethod.call(this, opts.method);
      validateSchemaBodyOption.call(this, opts.method, path, opts.schema);
      isGetRoute = opts.method === 'GET';
      isHeadRoute = opts.method === 'HEAD';
    }
    const headOpts = shouldExposeHead && isGetRoute ? { ...routeOptions } : null;
    const prefix = this[kRoutePrefix];

    const addNewRoute = ({ path: routePath, prefixing = false }) => {
      const url = prefix + routePath;
      opts.url = url;
      opts.path = url;
      opts.routePath = routePath;
      opts.prefix = prefix;
      opts.logLevel = opts.logLevel || this[kLogLevel];
      validateLogLevelOption(opts.logLevel, opts.method, opts.url, logger);
      if (this[kLogSerializers] || opts.logSerializers) {
        opts.logSerializers = Object.assign(Object.create(this[kLogSerializers]), opts.logSerializers);
      }
      if (opts.attachValidation == null) opts.attachValidation = false;
      if (prefixing === false) {
        for (const hook of this[kHooks].onRoute) hook.call(this, opts);
      }
      for (const hook of lifecycleHooks) {
        if (!(hook in opts)) continue;
        if (Array.isArray(opts[hook])) {
          for (const fn of opts[hook]) {
            if (typeof fn !== 'function') {
              throw new XUFA_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(fn));
            }
            checkAsyncHook(hook, fn);
          }
        } else if (opts[hook] !== undefined && typeof opts[hook] !== 'function') {
          throw new XUFA_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(opts[hook]));
        }
      }
      const constraints = opts.constraints || {};
      const config = { ...opts.config, url: prefixing ? prefix : url, method: opts.method };
      const context = new Context({
        schema: opts.schema,
        handler: opts.handler.bind(this),
        config,
        errorHandler: opts.errorHandler,
        childLoggerFactory: opts.childLoggerFactory,
        bodyLimit: opts.bodyLimit,
        logLevel: opts.logLevel,
        logSerializers: opts.logSerializers,
        attachValidation: opts.attachValidation,
        schemaErrorFormatter: opts.schemaErrorFormatter,
        replySerializer: this[kReplySerializerDefault],
        validatorCompiler: opts.validatorCompiler,
        serializerCompiler: opts.serializerCompiler,
        exposeHeadRoute: shouldExposeHead,
        prefixTrailingSlash: opts.prefixTrailingSlash || 'both',
        server: this,
        isXufa,
        handlerTimeout: opts.handlerTimeout,
      });
      context.querystringParser = options.querystringParser || null;

      const hasHeadHandler = router.findRoute('HEAD', opts.url, constraints) !== null;
      try {
        router.on(opts.method, opts.url, { constraints }, routeHandler, context);
      } catch (error) {
        // The HEAD routes added for GET routes may be duplicated: that is not an error.
        if (!context[kRouteByXufa]) {
          const methods = Array.isArray(opts.method) ? opts.method : [opts.method];
          if (methods.some((m) => error.message.includes(`Method '${m}' already declared for route`))) {
            throw new XUFA_ERR_DUPLICATED_ROUTE(opts.method, opts.url);
          }
          throw error;
        }
      }

      this.after((notHandledErr, done) => {
        context.errorHandler = opts.errorHandler
          ? buildErrorHandler(this[kErrorHandler], opts.errorHandler)
          : this[kErrorHandler];
        context._parserOptions.limit = opts.bodyLimit || null;
        context.logLevel = opts.logLevel;
        context.logSerializers = opts.logSerializers;
        context.attachValidation = opts.attachValidation;
        context[kReplySerializerDefault] = this[kReplySerializerDefault];
        context.schemaErrorFormatter =
          opts.schemaErrorFormatter || this[kSchemaErrorFormatter] || context.schemaErrorFormatter;

        avvio.once('preReady', () => {
          for (const hook of lifecycleHooks) {
            const hooks = this[kHooks][hook].concat(opts[hook] || []).map((h) => h.bind(this));
            context[hook] = hooks.length ? hooks : null;
          }
          // Request and Reply classes without decorators of their own are replaced by their parents'.
          while (!context.Request[kHasBeenDecorated] && context.Request.parent)
            context.Request = context.Request.parent;
          while (!context.Reply[kHasBeenDecorated] && context.Reply.parent) context.Reply = context.Reply.parent;
          context.genReqId = this[kGenReqId];
          fourOhFour.setContext(this, context);
          if (opts.schema) {
            context.schema = normalizeSchema(context.schema, this.initialConfig);
            const controller = this[kSchemaController];
            const hasValidationSchema =
              opts.schema.body !== undefined ||
              opts.schema.headers !== undefined ||
              opts.schema.querystring !== undefined ||
              opts.schema.params !== undefined;
            if (!opts.validatorCompiler && hasValidationSchema) controller.setupValidator(this[kOptions]);
            try {
              const isCustom = typeof opts.validatorCompiler === 'function' || controller.isCustomValidatorCompiler;
              compileSchemasForValidation(context, opts.validatorCompiler || controller.validatorCompiler, isCustom);
            } catch (error) {
              throw new XUFA_ERR_SCH_VALIDATION_BUILD(opts.method, url, error.message);
            }
            if (opts.schema.response && !opts.serializerCompiler) controller.setupSerializer(this[kOptions]);
            try {
              compileSchemasForSerialization(context, opts.serializerCompiler || controller.serializerCompiler);
            } catch (error) {
              throw new XUFA_ERR_SCH_SERIALIZATION_BUILD(opts.method, url, error.message);
            }
          }
        });
        done(notHandledErr);
      });

      // The HEAD route of a GET route, registered after the after() of the GET route.
      if (shouldExposeHead && isGetRoute && !isHeadRoute && !hasHeadHandler) {
        const onSend = parseHeadOnSendHandlers(headOpts.onSend);
        prepareRoute.call(this, { method: 'HEAD', url: routePath, options: { ...headOpts, onSend }, isXufa: true });
      }
    };

    if (path === '/' && prefix.length > 0 && opts.method !== 'HEAD') {
      switch (opts.prefixTrailingSlash) {
        case 'slash':
          addNewRoute({ path });
          break;
        case 'no-slash':
          addNewRoute({ path: '' });
          break;
        case 'both':
        default:
          addNewRoute({ path: '' });
          // With ignoreTrailingSlash, the '' route matches '/' too.
          if (ignoreTrailingSlash !== true && (ignoreDuplicateSlashes !== true || !prefix.endsWith('/'))) {
            addNewRoute({ path, prefixing: true });
          }
      }
    } else if (path[0] === '/' && prefix.endsWith('/')) {
      // '/prefix/' + '/route' is '/prefix/route'
      addNewRoute({ path: path.slice(1) });
    } else {
      addNewRoute({ path });
    }
    return this;
  }

  // Every request of a route starts here.
  function routeHandler(req, res, params, context, querystring) {
    const genReqId = context.genReqId || context.server[kGenReqId];
    const id = genReqId(req);
    let childLogger;
    if (hasLogger === false && context.childLoggerFactory === defaultChildLoggerFactory) {
      // Children of the null logger are the logger itself.
      childLogger = logger;
    } else {
      const loggerOpts = {};
      // An empty level inherits: setting it would rebuild every method of the child.
      if (context.logLevel) loggerOpts.level = context.logLevel;
      if (context.logSerializers) loggerOpts.serializers = context.logSerializers;
      childLogger = createChildLogger(context, logger, req, id, loggerOpts);
    }

    if (closing === true) {
      if (req.httpVersionMajor !== 2) res.setHeader('Connection', 'close');
      // Requests still arriving while the server drains get a 503, so that load balancers send them elsewhere.
      if (return503OnClosing) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Content-Length': '80' });
        res.end('{"error":"Service Unavailable","message":"Service Unavailable","statusCode":503}');
        context.server[kLogController].serviceUnavailable(childLogger, context.server);
        return;
      }
    }

    // Keep-alive sockets are tracked only when they have to be closed by hand (forceCloseConnections).
    if (trackKeepAlive) {
      const connection = req.headers.connection;
      if (
        connection !== undefined &&
        connection.toLowerCase() === 'keep-alive' &&
        !keepAliveConnections.has(req.socket)
      ) {
        keepAliveConnections.add(req.socket);
        const { socket } = req;
        socket.on('close', () => keepAliveConnections.delete(socket));
      }
    }

    // The Accept-Version header hidden by the default route is restored.
    if (req.headers[kRequestAcceptVersion] !== undefined) {
      req.headers['accept-version'] = req.headers[kRequestAcceptVersion];
      req.headers[kRequestAcceptVersion] = undefined;
    }

    const request = new context.Request(id, params, req, undefined, childLogger, context);
    request[kRequestQuerystring] = querystring;
    const reply = new context.Reply(res, request, childLogger);
    if (logRequests) context.server[kLogController].incomingRequest(request, reply);

    const { handlerTimeout } = context;
    if (handlerTimeout > 0) {
      const controller = new AbortController();
      request[kRequestSignal] = controller;
      request[kTimeoutTimer] = setTimeout(() => {
        if (!reply.sent) {
          const err = new XUFA_ERR_HANDLER_TIMEOUT(handlerTimeout, context.config && context.config.url);
          controller.abort(err);
          reply[kReplyIsError] = true;
          reply.send(err);
        }
      }, handlerTimeout);
      const onAbort = () => {
        if (!controller.signal.aborted) controller.abort();
        clearTimeout(request[kTimeoutTimer]);
      };
      request[kOnAbort] = onClientGone(request, onAbort);
    }

    if (hasLogger === true || context.onResponse !== null || handlerTimeout > 0) setupResponseListeners(reply);

    if (context.onTimeout !== null) {
      if (!request.raw.socket._meta) request.raw.socket.on('timeout', handleTimeout);
      request.raw.socket._meta = { context, request, reply, onTimeout: handleTimeout };
    }

    if (context.onRequest !== null) onRequestHookRunner(context.onRequest, request, reply, runPreParsing);
    else runPreParsing(null, request, reply);

    if (context.onRequestAbort !== null) {
      req.on('close', () => {
        if (req.aborted) {
          onRequestAbortHookRunner(context.onRequestAbort, request, (err) => {
            if (err) reply.log.error({ err }, 'onRequestAborted hook failed');
          });
        }
      });
    }
  }
}

function handleTimeout() {
  const { context, request, reply } = this._meta;
  onTimeoutHookRunner(context.onTimeout, request, reply, noop);
}

function normalizeAndValidateMethod(method) {
  if (typeof method !== 'string') throw new XUFA_ERR_ROUTE_METHOD_INVALID();
  const upper = method.toUpperCase();
  const methods = this[kSupportedHTTPMethods];
  if (!methods.bodyless.has(upper) && !methods.bodywith.has(upper))
    throw new XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED(upper);
  return upper;
}

function validateSchemaBodyOption(method, path, schema) {
  if (this[kSupportedHTTPMethods].bodyless.has(method) && schema && schema.body) {
    throw new XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED(method, path);
  }
}

function validateBodyLimitOption(bodyLimit) {
  if (bodyLimit === undefined) return;
  if (!Number.isInteger(bodyLimit) || bodyLimit <= 0) throw new XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT(bodyLimit);
}

function validateHandlerTimeoutOption(handlerTimeout) {
  if (handlerTimeout === undefined) return;
  if (!Number.isInteger(handlerTimeout) || handlerTimeout <= 0) {
    throw new XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT(handlerTimeout);
  }
}

function validateLogLevelOption(logLevel, method, path, logger) {
  if (logLevel == null || logLevel === '') return;
  if (!logger || !logger.levels || logger.levels.values == null) return;
  if (typeof logLevel !== 'string' || logger.levels.values[logLevel] === undefined) {
    throw new XUFA_ERR_ROUTE_LOG_LEVEL_INVALID(method, path, logLevel);
  }
}

function runPreParsing(err, request, reply) {
  if (reply.sent === true) return;
  if (err != null) {
    reply[kReplyIsError] = true;
    reply.send(err);
    return;
  }
  request[kRequestPayloadStream] = request.raw;
  const context = request[kRouteContext];
  if (context.preParsing !== null) {
    preParsingHookRunner(context.preParsing, request, reply, handleRequest.bind(request.server));
  } else {
    handleRequest.call(request.server, null, request, reply);
  }
}

function buildRouterOptions(options, defaults) {
  const routerOptions =
    options.routerOptions == null ? Object.create(null) : Object.assign(Object.create(null), options.routerOptions);
  for (const key of ROUTER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(routerOptions, key)) {
      routerOptions[key] = options[key] ?? defaultInitOptions.routerOptions[key] ?? defaults[key];
    }
  }
  return routerOptions;
}

function noop() {}

module.exports = { buildRouting, validateBodyLimitOption, buildRouterOptions, checkAsyncHook };
