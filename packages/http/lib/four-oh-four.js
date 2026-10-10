// Not found handlers: a router of their own, with a handler for each prefix that set one.
import createRouter from '@xufa/router';
import Reply from './reply.js';
import Request from './request.js';
import Context from './context.js';
import {
  kRoutePrefix,
  kCanSetNotFoundHandler,
  kFourOhFourLevelInstance,
  kFourOhFourContext,
  kHooks,
  kErrorHandler,
  kLogController,
} from './symbols.js';
import { lifecycleHooks } from './hooks.js';
import { buildErrorHandler } from './error-handler.js';
import { XUFA_ERR_NOT_FOUND } from './errors.js';
import { createChildLogger } from './logger.js';
import { getGenReqId } from './req-id.js';

function fourOhFour(options) {
  const { logger } = options;
  const router = createRouter({
    onBadUrl: options.routerOptions.onBadUrl,
    onMaxParamLength: options.routerOptions.onMaxParamLength,
    defaultRoute: fourOhFourFallBack,
  });

  function arrange404(instance) {
    // The instance becomes the level whose 404 handler can be set (register with a prefix).
    instance[kFourOhFourLevelInstance] = instance;
    instance[kCanSetNotFoundHandler] = true;
    router.defaultRoute = router.defaultRoute.bind(instance);
  }

  function basic404(request, reply) {
    request.server[kLogController].routeNotFound(request, reply);
    const { url, method } = request.raw;
    reply.code(404).send({ message: `Route ${method}:${url} not found`, error: 'Not Found', statusCode: 404 });
  }

  // The not found context of a route (for reply.callNotFound()): the live one of its instance, with its own onSend.
  function setContext(instance, context) {
    const notFoundContext = Object.create(instance[kFourOhFourContext]);
    notFoundContext.onSend = context.onSend;
    context[kFourOhFourContext] = notFoundContext;
  }

  function setNotFoundHandler(optsArg, handlerArg, avvio, routeHandler) {
    if (this[kCanSetNotFoundHandler] === undefined) this[kCanSetNotFoundHandler] = true;
    if (this[kFourOhFourContext] === undefined) this[kFourOhFourContext] = null;
    const instance = this;
    const prefix = this[kRoutePrefix] || '/';
    if (this[kCanSetNotFoundHandler] === false) {
      throw new Error(`Not found handler already set for Xufa instance with prefix: '${prefix}'`);
    }
    let opts = optsArg;
    let handler = handlerArg;
    if (typeof opts === 'object' && opts !== null) {
      for (const hook of ['preHandler', 'preValidation']) {
        if (opts[hook]) {
          opts[hook] = Array.isArray(opts[hook])
            ? opts[hook].map((fn) => fn.bind(instance))
            : opts[hook].bind(instance);
        }
      }
    }
    if (typeof opts === 'function') {
      handler = opts;
      opts = undefined;
    }
    opts = opts || {};
    if (handler) {
      this[kFourOhFourLevelInstance][kCanSetNotFoundHandler] = false;
      handler = handler.bind(this);
    } else {
      handler = basic404;
    }
    this.after((notHandledErr, done) => {
      applyNotFoundHandler.call(this, prefix, opts, handler, avvio, routeHandler);
      done(notHandledErr);
    });
  }

  function applyNotFoundHandler(prefix, opts, handler, avvio, routeHandler) {
    const context = new Context({ schema: opts.schema, handler, config: opts.config || {}, server: this });
    context.querystringParser = options.routerOptions.querystringParser || null;
    avvio.once('preReady', () => {
      const notFoundContext = this[kFourOhFourContext];
      for (const hook of lifecycleHooks) {
        const hooks = this[kHooks][hook].concat(opts[hook] || []).map((h) => h.bind(this));
        notFoundContext[hook] = hooks.length ? hooks : null;
      }
      notFoundContext.errorHandler = opts.errorHandler
        ? buildErrorHandler(this[kErrorHandler], opts.errorHandler)
        : this[kErrorHandler];
    });
    if (this[kFourOhFourContext] !== null && prefix === '/') {
      // The default 404 handler is replaced.
      Object.assign(this[kFourOhFourContext], context);
      return;
    }
    this[kFourOhFourLevelInstance][kFourOhFourContext] = context;
    router.all(prefix + (prefix.endsWith('/') ? '*' : '/*'), routeHandler, context);
    router.all(prefix, routeHandler, context);
  }

  // Requests no 404 route caught: should never happen.
  function fourOhFourFallBack(req, res) {
    const context = this[kFourOhFourLevelInstance][kFourOhFourContext];
    const id = getGenReqId(context.server, req);
    const childLogger = createChildLogger(context, logger, req, id);
    const request = new Request(id, null, req, null, childLogger, context);
    const reply = new Reply(res, request, childLogger);
    context.server[kLogController].incomingRequest(request, reply);
    request.log.warn('the default handler for 404 did not catch this, this is likely a xufa bug, please report it');
    request.log.warn(router.prettyPrint());
    reply.code(404).send(new XUFA_ERR_NOT_FOUND());
  }

  return { router, setNotFoundHandler, setContext, arrange404 };
}

export default fourOhFour;

// What require() gives (the tests of fastify are CommonJS).
export { fourOhFour as 'module.exports' };
