// Hooks: the lists of an instance, and the runners calling them in order, each with a callback or a promise.
const {
  XUFA_ERR_HOOK_INVALID_TYPE,
  XUFA_ERR_HOOK_INVALID_HANDLER,
  XUFA_ERR_SEND_UNDEFINED_ERR,
  XUFA_ERR_HOOK_TIMEOUT,
  XUFA_ERR_HOOK_NOT_SUPPORTED,
  BOOT_ERRORS_MAP,
  appendStackTrace,
} = require('./errors');
const { kChildren, kHooks, kRequestPayloadStream } = require('./symbols');

const applicationHooks = ['onRoute', 'onRegister', 'onReady', 'onListen', 'preClose', 'onClose'];
const lifecycleHooks = [
  'onTimeout',
  'onRequest',
  'preParsing',
  'preValidation',
  'preSerialization',
  'preHandler',
  'onSend',
  'onResponse',
  'onError',
  'onRequestAbort',
];
const supportedHooks = lifecycleHooks.concat(applicationHooks);

function Hooks() {
  this.onRequest = [];
  this.preParsing = [];
  this.preValidation = [];
  this.preSerialization = [];
  this.preHandler = [];
  this.onResponse = [];
  this.onSend = [];
  this.onError = [];
  this.onRoute = [];
  this.onRegister = [];
  this.onReady = [];
  this.onListen = [];
  this.onTimeout = [];
  this.onRequestAbort = [];
  this.preClose = [];
}

Hooks.prototype = Object.create(null);

Hooks.prototype.validate = function validate(hook, fn) {
  if (typeof hook !== 'string') throw new XUFA_ERR_HOOK_INVALID_TYPE();
  if (!Array.isArray(this[hook])) throw new XUFA_ERR_HOOK_NOT_SUPPORTED(hook);
  if (typeof fn !== 'function') throw new XUFA_ERR_HOOK_INVALID_HANDLER(hook, Object.prototype.toString.call(fn));
};

Hooks.prototype.add = function add(hook, fn) {
  this.validate(hook, fn);
  this[hook].push(fn);
};

// The hooks of an encapsulated instance: a copy of the lifecycle ones of its parent; application ones are its own.
function buildHooks(parent) {
  const hooks = new Hooks();
  for (const name of lifecycleHooks) hooks[name] = parent[name].slice();
  hooks.onRoute = parent.onRoute.slice();
  hooks.onRegister = parent.onRegister.slice();
  return hooks;
}

// onReady and preClose: the hooks of the instance and of its children, each one through the boot queue.
function hookRunnerApplication(hookName, boot, server, cb) {
  const hooks = server[kHooks][hookName];
  let i = 0;
  let c = 0;

  function exit(error) {
    let err = error;
    const name = hooks[i - 1] && hooks[i - 1].name;
    const fragment = name ? ` "${name}"` : '';
    if (err) {
      if (err.code === 'BOOT_ERR_READY_TIMEOUT') {
        err = appendStackTrace(err, new XUFA_ERR_HOOK_TIMEOUT(hookName, fragment));
      } else if (BOOT_ERRORS_MAP[err.code] != null) {
        err = appendStackTrace(err, new BOOT_ERRORS_MAP[err.code](err.message));
      }
      cb(err);
      return;
    }
    cb();
  }

  function wrap(fn, instance) {
    return function hookWrapper(error, done) {
      let err = error;
      if (err) {
        done(err);
        return;
      }
      if (fn.length === 1) {
        try {
          fn.call(instance, done);
        } catch (e) {
          done(e);
        }
        return;
      }
      try {
        const ret = fn.call(instance);
        if (ret && typeof ret.then === 'function') {
          ret.then(done, done);
          return;
        }
      } catch (e) {
        err = e;
      }
      done(err);
    };
  }

  function next(err) {
    if (err) {
      exit(err);
      return;
    }
    const children = server[kChildren];
    if (i === hooks.length && c === children.length) {
      if (i === 0 && c === 0) {
        exit();
      } else {
        boot(function manageTimeout(error, done) {
          exit(error);
          done(error);
        });
      }
      return;
    }
    if (i === hooks.length && c < children.length) {
      const child = children[c];
      c += 1;
      hookRunnerApplication(hookName, boot, child, next);
      return;
    }
    boot(wrap(hooks[i], server));
    i += 1;
    next();
  }

  next();
}

function onListenHookRunner(server) {
  const hooks = server[kHooks].onListen;
  let i = 0;
  let c = 0;
  function next(err) {
    if (err) server.log.error(err);
    if (i === hooks.length) {
      const children = server[kChildren];
      while (c < children.length) {
        const child = children[c];
        c += 1;
        onListenHookRunner(child);
      }
      return;
    }
    const fn = hooks[i];
    i += 1;
    if (fn.length === 1) {
      try {
        fn.call(server, next);
      } catch (e) {
        next(e);
      }
      return;
    }
    try {
      const ret = fn.call(server);
      if (ret && typeof ret.then === 'function') {
        ret.then(() => next(), next);
        return;
      }
      next();
    } catch (e) {
      next(e);
    }
  }
  next();
}

// A runner of hooks (request, reply, done): stops at the first error; cb(err, request, reply) at the end.
function hookRunnerGenerator(iterator) {
  return function hookRunner(functions, request, reply, cb) {
    let i = 0;

    function handleReject(err) {
      cb(err || new XUFA_ERR_SEND_UNDEFINED_ERR(), request, reply);
    }

    function next(err) {
      if (err || i === functions.length) {
        cb(err, request, reply);
        return;
      }
      let result;
      try {
        const fn = functions[i];
        i += 1;
        result = iterator(fn, request, reply, next);
      } catch (error) {
        cb(error, request, reply);
        return;
      }
      if (result && typeof result.then === 'function') result.then(handleResolve, handleReject);
    }

    function handleResolve() {
      next();
    }

    next();
  };
}

function hookIterator(fn, request, reply, next) {
  if (reply.sent === true) return undefined;
  return fn(request, reply, next);
}

function onResponseHookIterator(fn, request, reply, next) {
  return fn(request, reply, next);
}

const onResponseHookRunner = hookRunnerGenerator(onResponseHookIterator);
const preValidationHookRunner = hookRunnerGenerator(hookIterator);
const preHandlerHookRunner = hookRunnerGenerator(hookIterator);
const onTimeoutHookRunner = hookRunnerGenerator(hookIterator);
const onRequestHookRunner = hookRunnerGenerator(hookIterator);

// onSend, preSerialization and onError: (request, reply, payload, done), where done(err, newPayload).
function onSendHookRunner(functions, request, reply, initialPayload, cb) {
  let i = 0;
  let payload = initialPayload;

  function next(err, newPayload) {
    if (err) {
      cb(err, request, reply, payload);
      return;
    }
    if (newPayload !== undefined) payload = newPayload;
    if (i === functions.length) {
      cb(null, request, reply, payload);
      return;
    }
    let result;
    try {
      const fn = functions[i];
      i += 1;
      result = fn(request, reply, payload, next);
    } catch (error) {
      cb(error, request, reply);
      return;
    }
    if (result && typeof result.then === 'function') result.then(handleResolve, handleReject);
  }

  function handleResolve(newPayload) {
    try {
      next(null, newPayload);
    } catch (err) {
      cb(err, request, reply, payload);
    }
  }

  function handleReject(err) {
    cb(err || new XUFA_ERR_SEND_UNDEFINED_ERR(), request, reply, payload);
  }

  next();
}

const preSerializationHookRunner = onSendHookRunner;

// preParsing: (request, reply, payload, done), where done(err, newPayloadStream).
function preParsingHookRunner(functions, request, reply, cb) {
  let i = 0;

  function next(err, newPayload) {
    if (reply.sent) return;
    if (newPayload !== undefined) request[kRequestPayloadStream] = newPayload;
    if (err || i === functions.length) {
      cb(err, request, reply);
      return;
    }
    let result;
    try {
      const fn = functions[i];
      i += 1;
      result = fn(request, reply, request[kRequestPayloadStream], next);
    } catch (error) {
      cb(error, request, reply);
      return;
    }
    if (result && typeof result.then === 'function') result.then(handleResolve, handleReject);
  }

  function handleResolve(newPayload) {
    next(null, newPayload);
  }

  function handleReject(err) {
    cb(err || new XUFA_ERR_SEND_UNDEFINED_ERR(), request, reply);
  }

  next();
}

function onRequestAbortHookRunner(functions, request, cb) {
  let i = 0;

  function next(err) {
    if (err || i === functions.length) {
      cb(err, request);
      return;
    }
    let result;
    try {
      const fn = functions[i];
      i += 1;
      result = fn(request, next);
    } catch (error) {
      cb(error, request);
      return;
    }
    if (result && typeof result.then === 'function') result.then(handleResolve, handleReject);
  }

  function handleResolve() {
    next();
  }

  function handleReject(err) {
    cb(err || new XUFA_ERR_SEND_UNDEFINED_ERR(), request);
  }

  next();
}

module.exports = {
  Hooks,
  buildHooks,
  hookRunnerGenerator,
  preParsingHookRunner,
  onResponseHookRunner,
  onSendHookRunner,
  preSerializationHookRunner,
  onRequestAbortHookRunner,
  hookIterator,
  hookRunnerApplication,
  onListenHookRunner,
  preHandlerHookRunner,
  preValidationHookRunner,
  onRequestHookRunner,
  onTimeoutHookRunner,
  lifecycleHooks,
  supportedHooks,
  applicationHooks,
};
