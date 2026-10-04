// xufa: creates an instance. The API of fastify, built on the packages of this repository.
const http = require('node:http');
const diagnostics = require('node:diagnostics_channel');
const Boot = require('@xufa/boot');
const { version: VERSION } = require('../package.json');
const symbols = require('./symbols');
const { createServer } = require('./server');
const Reply = require('./reply');
const Request = require('./request');
const Context = require('./context');
const decorator = require('./decorate');
const ContentTypeParser = require('./content-type-parser');
const SchemaController = require('./schema-controller');
const { Hooks, hookRunnerApplication, supportedHooks } = require('./hooks');
const {
  createInstanceLogger,
  createChildLogger,
  defaultChildLoggerFactory,
  createLogController,
  LogController,
} = require('./logger');
const pluginUtils = require('./plugin-utils');
const { getGenReqId, reqIdGenFactory } = require('./req-id');
const { buildRouting, validateBodyLimitOption, buildRouterOptions, checkAsyncHook } = require('./route');
const build404 = require('./four-oh-four');
const getSecuredInitialConfig = require('./config');
const override = require('./plugin-override');
const plugin = require('./plugin');
const { buildErrorHandler } = require('./error-handler');
const { appendStackTrace, BOOT_ERRORS_MAP, ...errorCodes } = require('./errors');

const {
  kBoot,
  kChildren,
  kServerBindings,
  kBodyLimit,
  kSupportedHTTPMethods,
  kRoutePrefix,
  kLogLevel,
  kLogSerializers,
  kHooks,
  kSchemaController,
  kRequestAcceptVersion,
  kReplySerializerDefault,
  kContentTypeParser,
  kReply,
  kRequest,
  kFourOhFour,
  kState,
  kOptions,
  kPluginNameChain,
  kSchemaErrorFormatter,
  kErrorHandler,
  kKeepAliveConnections,
  kChildLoggerFactory,
  kGenReqId,
  kErrorHandlerAlreadySet,
  kHandlerTimeout,
  kLogController,
} = symbols;

const { defaultInitOptions } = getSecuredInitialConfig;
const {
  XUFA_ERR_ASYNC_CONSTRAINT,
  XUFA_ERR_BAD_URL,
  XUFA_ERR_MAX_PARAM_LENGTH,
  XUFA_ERR_OPTIONS_NOT_OBJ,
  XUFA_ERR_QSP_NOT_FN,
  XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN,
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ,
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR,
  XUFA_ERR_INSTANCE_ALREADY_STARTED,
  XUFA_ERR_REOPENED_CLOSE_SERVER,
  XUFA_ERR_ROUTE_REWRITE_NOT_STR,
  XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN,
  XUFA_ERR_ERROR_HANDLER_NOT_FN,
  XUFA_ERR_ERROR_HANDLER_ALREADY_SET,
  XUFA_ERR_ROUTE_METHOD_INVALID,
  XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED,
  XUFA_ERR_HOOK_INVALID_HANDLER,
} = errorCodes;

const initChannel = diagnostics.channel('xufa.initialization');

let inject = null;

function xufa(serverOptions) {
  const { options, genReqId, logController, hasLogger, initialConfig } = processOptions(
    serverOptions,
    defaultRoute,
    onBadUrl,
    onMaxParamLength
  );

  const router = buildRouting(options.routerOptions);
  const fourOhFour = build404(options);
  const httpHandler = wrapRouting(router, options);
  const {
    server,
    listen,
    forceCloseConnections,
    serverHasCloseAllConnections,
    serverHasCloseHttp2Sessions,
    keepAliveConnections,
  } = createServer(options, httpHandler);
  const schemaController = SchemaController.buildSchemaController(null, options.schemaController);

  const instance = {
    [kState]: {
      listening: false,
      closing: false,
      started: false,
      ready: false,
      booting: false,
      aborted: false,
      readyResolver: null,
    },
    [kKeepAliveConnections]: keepAliveConnections,
    [kSupportedHTTPMethods]: {
      bodyless: new Set(['GET', 'HEAD', 'TRACE']),
      bodywith: new Set(['DELETE', 'OPTIONS', 'PATCH', 'PUT', 'POST', 'QUERY']),
    },
    [kOptions]: options,
    [kChildren]: [],
    [kServerBindings]: [],
    [kBodyLimit]: options.bodyLimit,
    [kHandlerTimeout]: options.handlerTimeout,
    [kRoutePrefix]: '',
    [kLogLevel]: '',
    [kLogSerializers]: null,
    [kHooks]: new Hooks(),
    [kSchemaController]: schemaController,
    [kSchemaErrorFormatter]: null,
    [kErrorHandler]: buildErrorHandler(),
    [kErrorHandlerAlreadySet]: false,
    [kChildLoggerFactory]: options.childLoggerFactory || defaultChildLoggerFactory,
    [kReplySerializerDefault]: null,
    [kContentTypeParser]: new ContentTypeParser(
      options.bodyLimit,
      options.onProtoPoisoning || defaultInitOptions.onProtoPoisoning,
      options.onConstructorPoisoning || defaultInitOptions.onConstructorPoisoning
    ),
    [kReply]: Reply.buildReply(Reply),
    [kRequest]: Request.buildRequest(Request, options.trustProxy),
    [kFourOhFour]: fourOhFour,
    [pluginUtils.kRegisteredPlugins]: [],
    [kPluginNameChain]: ['xufa'],
    [kBoot]: null,
    [kGenReqId]: genReqId,
    routing: httpHandler,
    delete(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'DELETE', url, options: opts, handler });
    },
    get(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'GET', url, options: opts, handler });
    },
    head(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'HEAD', url, options: opts, handler });
    },
    trace(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'TRACE', url, options: opts, handler });
    },
    patch(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'PATCH', url, options: opts, handler });
    },
    post(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'POST', url, options: opts, handler });
    },
    put(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'PUT', url, options: opts, handler });
    },
    options(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'OPTIONS', url, options: opts, handler });
    },
    query(url, opts, handler) {
      return router.prepareRoute.call(this, { method: 'QUERY', url, options: opts, handler });
    },
    all(url, opts, handler) {
      return router.prepareRoute.call(this, { method: this.supportedMethods, url, options: opts, handler });
    },
    route(opts) {
      return router.route.call(this, { options: opts });
    },
    hasRoute(opts) {
      return router.hasRoute.call(this, { options: opts });
    },
    findRoute(opts) {
      return router.findRoute(opts);
    },
    log: options.logger,
    [kLogController]: logController,
    withTypeProvider() {
      return this;
    },
    addHook,
    addSchema,
    getSchema: schemaController.getSchema.bind(schemaController),
    getSchemas: schemaController.getSchemas.bind(schemaController),
    setValidatorCompiler,
    setSerializerCompiler,
    setSchemaController,
    setReplySerializer,
    setSchemaErrorFormatter,
    setGenReqId,
    addContentTypeParser: ContentTypeParser.helpers.addContentTypeParser,
    hasContentTypeParser: ContentTypeParser.helpers.hasContentTypeParser,
    getDefaultJsonParser: ContentTypeParser.defaultParsers.getDefaultJsonParser,
    defaultTextParser: ContentTypeParser.defaultParsers.defaultTextParser,
    removeContentTypeParser: ContentTypeParser.helpers.removeContentTypeParser,
    removeAllContentTypeParsers: ContentTypeParser.helpers.removeAllContentTypeParsers,
    // Set by @xufa/boot
    register: null,
    after: null,
    ready: null,
    onClose: null,
    close: null,
    printPlugins: null,
    hasPlugin(name) {
      return this[pluginUtils.kRegisteredPlugins].includes(name) || this[kPluginNameChain].includes(name);
    },
    listen,
    server,
    addresses() {
      const bound = this[kServerBindings].map((binding) => binding.address());
      bound.push(this.server.address());
      return bound.filter((address) => address);
    },
    decorate: decorator.add,
    hasDecorator: decorator.exist,
    decorateReply: decorator.decorateReply,
    decorateRequest: decorator.decorateRequest,
    hasRequestDecorator: decorator.existRequest,
    hasReplyDecorator: decorator.existReply,
    getDecorator: decorator.getInstanceDecorator,
    addHttpMethod,
    inject: injectRequest,
    printRoutes,
    setNotFoundHandler,
    setErrorHandler,
    setChildLoggerFactory,
    initialConfig,
    addConstraintStrategy: router.addConstraintStrategy,
    hasConstraintStrategy: router.hasConstraintStrategy,
  };

  Object.defineProperties(instance, {
    listeningOrigin: {
      get() {
        const address = this.addresses().slice(-1).pop();
        if (typeof address === 'string') return address;
        const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
        return `${this[kOptions].https ? 'https' : 'http'}://${host}:${address.port}`;
      },
    },
    pluginName: {
      configurable: true,
      get() {
        const chain = this[kPluginNameChain];
        return chain.length > 1 ? chain.join(' -> ') : chain[0];
      },
    },
    prefix: {
      configurable: true,
      get() {
        return this[kRoutePrefix];
      },
    },
    validatorCompiler: {
      configurable: true,
      get() {
        return this[kSchemaController].getValidatorCompiler();
      },
    },
    serializerCompiler: {
      configurable: true,
      get() {
        return this[kSchemaController].getSerializerCompiler();
      },
    },
    childLoggerFactory: {
      configurable: true,
      get() {
        return this[kChildLoggerFactory];
      },
    },
    version: {
      configurable: true,
      get() {
        return VERSION;
      },
    },
    errorHandler: {
      configurable: true,
      get() {
        return this[kErrorHandler].func;
      },
    },
    genReqId: {
      configurable: true,
      get() {
        return this[kGenReqId];
      },
    },
    supportedMethods: {
      configurable: false,
      get() {
        const methods = this[kSupportedHTTPMethods];
        return [...methods.bodyless, ...methods.bodywith];
      },
    },
  });

  if (options.schemaErrorFormatter) {
    validateSchemaErrorFormatter(options.schemaErrorFormatter);
    instance[kSchemaErrorFormatter] = options.schemaErrorFormatter.bind(instance);
  }

  // @xufa/boot sets register, after, ready, onClose and close.
  const pluginTimeout = Number(options.pluginTimeout);
  const boot = Boot(instance, {
    autostart: false,
    timeout: Number.isNaN(pluginTimeout) ? defaultInitOptions.pluginTimeout : pluginTimeout,
    expose: { use: 'register' },
  });
  boot.override = override;
  boot.on('start', () => {
    instance[kState].started = true;
  });
  instance[kBoot] = instance.ready;
  instance.ready = ready;
  instance.printPlugins = boot.prettyPrint.bind(boot);

  boot.once('preReady', () => {
    instance.onClose((app, done) => {
      instance[kState].closing = true;
      router.closeRoutes();
      hookRunnerApplication('preClose', instance[kBoot], instance, () => {
        if (instance[kState].listening) {
          if (forceCloseConnections === 'idle' && options.serverFactory) {
            app.server.closeIdleConnections();
          } else if (serverHasCloseAllConnections && forceCloseConnections === true) {
            app.server.closeAllConnections();
          } else if (forceCloseConnections === true) {
            // Destroyed, not just unref'd: otherwise close() would never call back.
            for (const connection of instance[kKeepAliveConnections]) {
              connection.destroy();
              instance[kKeepAliveConnections].delete(connection);
            }
          }
        }
        if (serverHasCloseHttp2Sessions) app.server.closeHttp2Sessions();
        // No new connections; close() is needed even when not listening (nodejs/node#48604).
        if (!options.serverFactory || instance[kState].listening) {
          app.server.close((err) => {
            if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') done(null);
            else done();
          });
        } else {
          process.nextTick(done, null);
        }
      });
    });
  });

  // The context of the requests failing before a route is found (bad URL, too long parameter...).
  const routeEventContext = new Context({ server: instance, config: {} });

  instance.setNotFoundHandler();
  fourOhFour.arrange404(instance);

  router.setup(options, {
    avvio: boot,
    fourOhFour,
    hasLogger,
    logController,
    setupResponseListeners: Reply.setupResponseListeners,
    throwIfAlreadyStarted,
    keepAliveConnections,
  });

  server.on('clientError', options.clientErrorHandler.bind(instance));

  if (initChannel.hasSubscribers) initChannel.publish({ xufa: instance, fastify: instance });

  instance[Symbol.asyncDispose] = function dispose() {
    return instance.close();
  };

  return instance;

  function throwIfAlreadyStarted(msg) {
    if (instance[kState].started) throw new XUFA_ERR_INSTANCE_ALREADY_STARTED(msg);
  }

  // Fake requests (@xufa/inject); the instance gets ready first when it is not.
  function injectRequest(opts, cb) {
    if (inject === null) inject = require('@xufa/inject'); // eslint-disable-line global-require
    if (instance[kState].started) {
      if (instance[kState].closing) {
        const error = new XUFA_ERR_REOPENED_CLOSE_SERVER();
        if (cb) {
          cb(error);
          return undefined;
        }
        return Promise.reject(error);
      }
      return inject(httpHandler, opts, cb);
    }
    if (cb) {
      this.ready((err) => {
        if (err) cb(err, null);
        else inject(httpHandler, opts, cb);
      });
      return undefined;
    }
    return inject((req, res) => {
      this.ready((err) => {
        if (err) {
          res.emit('error', err);
          return;
        }
        httpHandler(req, res);
      });
    }, opts);
  }

  function ready(cb) {
    const state = this[kState];
    if (state.readyResolver !== null) {
      if (cb != null) {
        state.readyResolver.promise.then(() => cb(null, instance), cb);
        return undefined;
      }
      return state.readyResolver.promise;
    }
    // The hooks run after the promise is returned; every call to ready() waits for the same one.
    process.nextTick(runHooks);
    state.readyResolver = Promise.withResolvers();
    if (!cb) return state.readyResolver.promise;
    state.readyResolver.promise.then(() => cb(null, instance), cb);
    return undefined;

    function runHooks() {
      instance[kBoot]((err, done) => {
        if (err || state.started || state.ready || state.booting) {
          manageErr(err);
        } else {
          state.booting = true;
          hookRunnerApplication('onReady', instance[kBoot], instance, manageErr);
        }
        done();
      });
    }

    function manageErr(error) {
      // Errors of the boot get a code of xufa, with theirs as cause.
      const err =
        error != null && BOOT_ERRORS_MAP[error.code] != null
          ? appendStackTrace(error, new BOOT_ERRORS_MAP[error.code](error.message))
          : error;
      if (err) {
        state.readyResolver.reject(err);
        return;
      }
      state.readyResolver.resolve(instance);
      state.booting = false;
      state.ready = true;
      state.readyResolver = null;
    }
  }

  function addHook(name, fn) {
    throwIfAlreadyStarted('Cannot call "addHook"!');
    if (fn == null) throw new XUFA_ERR_HOOK_INVALID_HANDLER(name, fn);
    if (name === 'onReady' || name === 'onListen') {
      if (fn.constructor.name === 'AsyncFunction' && fn.length !== 0) {
        throw new errorCodes.XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER();
      }
    } else if (typeof fn === 'function') {
      checkAsyncHook(name, fn);
    }
    if (name === 'onClose') {
      this.onClose(fn.bind(this));
    } else if (name === 'onReady' || name === 'onListen' || name === 'onRoute' || name === 'preClose') {
      this[kHooks].add(name, fn);
    } else {
      this.after((err, done) => {
        try {
          addHookTo(this, name, fn);
          done(err);
        } catch (error) {
          done(error);
        }
      });
    }
    return this;
  }

  function addHookTo(target, name, fn) {
    target[kHooks].add(name, fn);
    for (const child of target[kChildren]) addHookTo(child, name, fn);
  }

  function addSchema(schema) {
    throwIfAlreadyStarted('Cannot call "addSchema"!');
    this[kSchemaController].add(schema);
    for (const child of this[kChildren]) child.addSchema(schema);
    return this;
  }

  // The requests no route matches.
  function defaultRoute(req, res) {
    if (req.headers['accept-version'] !== undefined) {
      // Hidden from the 404 router, which would check the version constraint; restored by routeHandler.
      req.headers[kRequestAcceptVersion] = req.headers['accept-version'];
      req.headers['accept-version'] = undefined;
    }
    fourOhFour.router.lookup(req, res);
  }

  function frameworkError(error, req, res) {
    const id = getGenReqId(routeEventContext.server, req);
    const childLogger = createChildLogger(routeEventContext, options.logger, req, id);
    const request = new Request(id, null, req, null, childLogger, routeEventContext);
    const reply = new Reply(res, request, childLogger);
    routeEventContext.server[kLogController].incomingRequest(request, reply);
    return options.frameworkErrors(error, request, reply);
  }

  function onBadUrl(path, req, res) {
    if (options.frameworkErrors) return frameworkError(new XUFA_ERR_BAD_URL(path), req, res);
    const body = JSON.stringify({
      error: 'Bad Request',
      code: 'XUFA_ERR_BAD_URL',
      message: `'${path}' is not a valid url component`,
      statusCode: 400,
    });
    res.writeHead(400, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
    return undefined;
  }

  function onMaxParamLength(path, req, res) {
    if (options.frameworkErrors) return frameworkError(new XUFA_ERR_MAX_PARAM_LENGTH(path), req, res);
    const body = JSON.stringify({
      error: 'Bad Request',
      code: 'XUFA_ERR_MAX_PARAM_LENGTH',
      message: `'${path}' is exceeding the max param length`,
      statusCode: 414,
    });
    res.writeHead(414, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
    return undefined;
  }

  function onAsyncConstraintError(req, res, err) {
    if (!err) return undefined;
    if (options.frameworkErrors) return frameworkError(new XUFA_ERR_ASYNC_CONSTRAINT(), req, res);
    const body =
      '{"error":"Internal Server Error","message":"Unexpected error from async constraint","statusCode":500}';
    res.writeHead(500, { 'Content-Type': 'application/json', 'Content-Length': body.length });
    res.end(body);
    return undefined;
  }

  function setNotFoundHandler(opts, handler) {
    throwIfAlreadyStarted('Cannot call "setNotFoundHandler"!');
    fourOhFour.setNotFoundHandler.call(this, opts, handler, boot, router.routeHandler);
    return this;
  }

  function setValidatorCompiler(validatorCompiler) {
    throwIfAlreadyStarted('Cannot call "setValidatorCompiler"!');
    this[kSchemaController].setValidatorCompiler(validatorCompiler);
    return this;
  }

  function setSchemaErrorFormatter(errorFormatter) {
    throwIfAlreadyStarted('Cannot call "setSchemaErrorFormatter"!');
    validateSchemaErrorFormatter(errorFormatter);
    this[kSchemaErrorFormatter] = errorFormatter.bind(this);
    return this;
  }

  function setSerializerCompiler(serializerCompiler) {
    throwIfAlreadyStarted('Cannot call "setSerializerCompiler"!');
    this[kSchemaController].setSerializerCompiler(serializerCompiler);
    return this;
  }

  function setSchemaController(schemaControllerOpts) {
    throwIfAlreadyStarted('Cannot call "setSchemaController"!');
    const old = this[kSchemaController];
    const controller = SchemaController.buildSchemaController(old, { ...old.opts, ...schemaControllerOpts });
    this[kSchemaController] = controller;
    this.getSchema = controller.getSchema.bind(controller);
    this.getSchemas = controller.getSchemas.bind(controller);
    return this;
  }

  function setReplySerializer(replySerializer) {
    throwIfAlreadyStarted('Cannot call "setReplySerializer"!');
    this[kReplySerializerDefault] = replySerializer;
    return this;
  }

  function setErrorHandler(func) {
    throwIfAlreadyStarted('Cannot call "setErrorHandler"!');
    if (typeof func !== 'function') throw new XUFA_ERR_ERROR_HANDLER_NOT_FN();
    if (this[kErrorHandlerAlreadySet] && !options.allowErrorHandlerOverride) {
      throw new XUFA_ERR_ERROR_HANDLER_ALREADY_SET();
    }
    this[kErrorHandlerAlreadySet] = true;
    this[kErrorHandler] = buildErrorHandler(this[kErrorHandler], func.bind(this));
    return this;
  }

  function setChildLoggerFactory(factory) {
    throwIfAlreadyStarted('Cannot call "setChildLoggerFactory"!');
    this[kChildLoggerFactory] = factory;
    return this;
  }

  function printRoutes(opts = {}) {
    // includeHooks: true is a shortcut for every hook.
    let includeMeta = opts.includeMeta;
    if (opts.includeHooks) includeMeta = includeMeta ? supportedHooks.concat(includeMeta) : supportedHooks;
    return router.printRoutes({ ...opts, includeMeta });
  }

  // The handler of the server: rewriteUrl, then routing.
  function wrapRouting(routing, { rewriteUrl }) {
    let isAsync;
    return function preRouting(req, res) {
      if (isAsync === undefined) isAsync = routing.isAsyncConstraint();
      if (rewriteUrl) {
        req.originalUrl = req.url;
        const url = rewriteUrl.call(instance, req);
        if (typeof url === 'string') {
          req.url = url;
        } else {
          req.destroy(new XUFA_ERR_ROUTE_REWRITE_NOT_STR(req.url, typeof url));
        }
      }
      routing.routing(req, res, isAsync ? (err) => onAsyncConstraintError(req, res, err) : undefined);
    };
  }

  function setGenReqId(func) {
    throwIfAlreadyStarted('Cannot call "setGenReqId"!');
    this[kGenReqId] = reqIdGenFactory(this[kOptions].requestIdHeader, func);
    return this;
  }

  function addHttpMethod(method, { hasBody = false, overrideExisting = false } = {}) {
    if (typeof method !== 'string' || !http.METHODS.includes(method)) throw new XUFA_ERR_ROUTE_METHOD_INVALID();
    const methods = this[kSupportedHTTPMethods];
    if ((methods.bodyless.has(method) || methods.bodywith.has(method)) && !overrideExisting) {
      throw new XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED(method);
    }
    if (hasBody === true) {
      methods.bodywith.add(method);
      methods.bodyless.delete(method);
    } else {
      methods.bodywith.delete(method);
      methods.bodyless.add(method);
    }
    const name = method.toLowerCase();
    if (!this.hasDecorator(name)) {
      this.decorate(name, function shorthand(url, opts, handler) {
        return router.prepareRoute.call(this, { method, url, options: opts, handler });
      });
    }
    return this;
  }
}

function processOptions(serverOptions, defaultRoute, onBadUrl, onMaxParamLength) {
  if (serverOptions && typeof serverOptions !== 'object') throw new XUFA_ERR_OPTIONS_NOT_OBJ();
  // A shallow copy: the options given are not changed.
  const options = { ...serverOptions };
  if (options.routerOptions && options.routerOptions.querystringParser) {
    if (typeof options.routerOptions.querystringParser !== 'function') {
      throw new XUFA_ERR_QSP_NOT_FN(typeof options.routerOptions.querystringParser);
    }
  }
  if (options.querystringParser !== undefined && typeof options.querystringParser !== 'function') {
    throw new XUFA_ERR_QSP_NOT_FN(typeof options.querystringParser);
  }
  if (
    options.schemaController &&
    options.schemaController.bucket &&
    typeof options.schemaController.bucket !== 'function'
  ) {
    throw new XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN(typeof options.schemaController.bucket);
  }
  validateBodyLimitOption(options.bodyLimit);
  const requestIdHeader =
    typeof options.requestIdHeader === 'string' && options.requestIdHeader.length !== 0
      ? options.requestIdHeader.toLowerCase()
      : options.requestIdHeader === true && 'request-id';
  const genReqId = reqIdGenFactory(requestIdHeader, options.genReqId);
  options.bodyLimit = options.bodyLimit || defaultInitOptions.bodyLimit;

  const ajvOptions = { customOptions: {}, plugins: [], ...options.ajv };
  if (!ajvOptions.customOptions || Object.prototype.toString.call(ajvOptions.customOptions) !== '[object Object]') {
    throw new XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ(typeof ajvOptions.customOptions);
  }
  if (!ajvOptions.plugins || !Array.isArray(ajvOptions.plugins)) {
    throw new XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR(typeof ajvOptions.plugins);
  }
  // Options of schiva itself, for the default validator compiler.
  if (options.validation) ajvOptions.schivaOptions = options.validation;

  const { logger, hasLogger } = createInstanceLogger(options);
  const logController = createLogController(options);

  options.connectionTimeout = options.connectionTimeout || defaultInitOptions.connectionTimeout;
  options.keepAliveTimeout = options.keepAliveTimeout || defaultInitOptions.keepAliveTimeout;
  options.maxRequestsPerSocket = options.maxRequestsPerSocket || defaultInitOptions.maxRequestsPerSocket;
  options.requestTimeout = options.requestTimeout || defaultInitOptions.requestTimeout;
  options.logger = logger;
  options.requestIdHeader = requestIdHeader;
  options.ajv = ajvOptions;
  options.clientErrorHandler = options.clientErrorHandler || defaultClientErrorHandler;
  options.allowErrorHandlerOverride = options.allowErrorHandlerOverride ?? defaultInitOptions.allowErrorHandlerOverride;
  options.routerOptions = buildRouterOptions(options, {
    buildPrettyMeta: defaultBuildPrettyMeta,
    defaultRoute,
    onBadUrl,
    onMaxParamLength,
  });

  const initialConfig = getSecuredInitialConfig(options);
  options.exposeHeadRoutes = initialConfig.exposeHeadRoutes;
  options.http2SessionTimeout = initialConfig.http2SessionTimeout;
  return { options, genReqId, logController, hasLogger, initialConfig };
}

// The metadata of routes printRoutes({ includeMeta }) shows.
function defaultBuildPrettyMeta(route) {
  const meta = {};
  for (const key of ['errorHandler', 'logLevel', 'logSerializers', ...supportedHooks]) meta[key] = route.store[key];
  return meta;
}

function defaultClientErrorHandler(err, socket) {
  // A reset connection has nothing to answer.
  if (err.code === 'ECONNRESET' || socket.destroyed) return;
  let code;
  let message;
  let label;
  if (err.code === 'ERR_HTTP_REQUEST_TIMEOUT') {
    code = '408';
    message = 'Client Timeout';
    label = 'timeout';
  } else if (err.code === 'HPE_HEADER_OVERFLOW') {
    code = '431';
    message = 'Exceeded maximum allowed HTTP header size';
    label = 'header_overflow';
  } else {
    code = '400';
    message = 'Client Error';
    label = 'error';
  }
  const status = http.STATUS_CODES[code];
  const body = `{"error":"${status}","message":"${message}","statusCode":${code}}`;
  this.log.trace({ err }, `client ${label}`);
  if (socket.writable) {
    socket.write(
      `HTTP/1.1 ${code} ${status}\r\nContent-Length: ${body.length}\r\nContent-Type: application/json\r\n\r\n${body}`
    );
  }
  socket.destroy(err);
}

function validateSchemaErrorFormatter(formatter) {
  if (typeof formatter !== 'function') throw new XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN(typeof formatter);
  if (formatter.constructor.name === 'AsyncFunction') throw new XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN('AsyncFunction');
}

module.exports = xufa;
module.exports.xufa = xufa;
module.exports.default = xufa;
module.exports.errorCodes = errorCodes;
module.exports.LogController = LogController;
module.exports.plugin = plugin;
