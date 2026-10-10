// @xufa/boot: loads plugins asynchronously and in order, with the API of avvio.
//
//   const boot = Boot(server, { expose: { use: 'register' } });
//   server.register(async (instance, opts) => { ... });
//   server.after(() => { ... });  // after the plugins registered before it
//   await server.ready();         // after every plugin
//   await server.close();         // onClose handlers, last registered first
//
// A plugin runs after the one registering it finished its own code, and before the plugins registered after it.
// override(server, plugin, opts) gives the instance a plugin runs with (an encapsulated copy, for xufa).
import { EventEmitter } from 'node:events';
import { createQueue } from './lib/queue.js';
import { Plugin, kPluginMeta, isPromiseLike } from './lib/plugin.js';
import { TimeTree } from './lib/time-tree.js';
import * as errors from './lib/errors.js';

const {
  BOOT_ERR_EXPOSE_ALREADY_DEFINED,
  BOOT_ERR_CALLBACK_NOT_FN,
  BOOT_ERR_ROOT_PLG_BOOTED,
  BOOT_ERR_READY_TIMEOUT,
  BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED,
  BOOT_ERR_PLUGIN_NOT_VALID,
} = errors;

const kBoot = Symbol('xufa.boot');
const kIsOnCloseHandler = Symbol('xufa.boot.isOnCloseHandler');
const kThenifyDoNotWrap = Symbol('xufa.boot.thenifyDoNotWrap');

function noop() {}

function validatePlugin(plugin) {
  if (plugin && (typeof plugin === 'function' || typeof plugin.then === 'function')) return;
  if (Array.isArray(plugin)) throw new BOOT_ERR_PLUGIN_NOT_VALID('array');
  if (plugin === null) throw new BOOT_ERR_PLUGIN_NOT_VALID('null');
  throw new BOOT_ERR_PLUGIN_NOT_VALID(typeof plugin);
}

// Modules compiled from ES modules or TypeScript give the plugin as their default export.
function isBundled(plugin) {
  return plugin !== null && typeof plugin === 'object' && typeof plugin.default === 'function';
}

// Calls func with args; the callback runs on the next tick, after the promise it returned when it returned one.
function executeWithThenable(func, args, callback) {
  let result;
  try {
    result = func.apply(func, args);
  } catch (err) {
    if (callback) process.nextTick(callback, err);
    return;
  }
  if (isPromiseLike(result) && !result[kBoot]) {
    result.then(
      () => process.nextTick(callback),
      (err) => process.nextTick(callback, err)
    );
  } else if (callback) {
    process.nextTick(callback);
  }
}

// What awaiting the server (or the boot) does: wait for the plugins registered so far.
function thenify() {
  if (this.booted) return undefined;
  // Resolving with the server reads its `then` again: the second read must not wrap.
  if (this[kThenifyDoNotWrap]) {
    this[kThenifyDoNotWrap] = false;
    return undefined;
  }
  return (resolve, reject) =>
    this._loadRegistered().then(() => {
      this[kThenifyDoNotWrap] = true;
      return resolve(this._server);
    }, reject);
}

function Boot(server, opts, done) {
  let app = server;
  let options = opts;
  let callback = done;
  if (typeof app === 'function' && arguments.length === 1) {
    callback = app;
    options = {};
    app = null;
  }
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options = options || {};
  options.autostart = options.autostart !== false;
  options.timeout = Number(options.timeout) || 0;
  options.expose = options.expose || {};

  if (!new.target) return new Boot(app, options, callback);
  EventEmitter.call(this);

  this._server = app || this;
  this._opts = options;
  if (app) this._expose();
  this._current = [];
  this._error = null;
  this._lastUsed = null;
  this.setMaxListeners(0);
  if (callback) this.once('start', callback);
  this.started = false;
  this.booted = false;
  this.pluginTree = new TimeTree();

  this._readyQ = createQueue(this, callWithCbOrNextTick, 1);
  this._readyQ.pause();
  this._readyQ.drain = () => {
    this.emit('start');
    this._readyQ.drain = noop;
  };
  this._closeQ = createQueue(this, closeWithCbOrNextTick, 1);
  this._closeQ.pause();
  this._closeQ.drain = () => {
    this.emit('close');
    this._closeQ.drain = noop;
  };
  this._doStart = null;

  const instance = this;
  this._root = new Plugin(
    createQueue(this, this._loadPluginNextTick, 1),
    function root(s, o, rootDone) {
      instance._doStart = rootDone;
      if (o.autostart) instance.start();
    },
    options,
    false,
    0
  );
  this._trackPluginLoading(this._root);
  this._loadPlugin(this._root, (error) => {
    let err = error;
    try {
      this.emit('preReady');
      this._root = null;
    } catch (preReadyError) {
      err = err || this._error || preReadyError;
    }
    if (err) {
      this._error = err;
      if (this._readyQ.length() === 0) throw err;
    } else {
      this.booted = true;
    }
    this._readyQ.resume();
  });
  return undefined;
}

Object.setPrototypeOf(Boot.prototype, EventEmitter.prototype);
Object.setPrototypeOf(Boot, EventEmitter);

Boot.prototype[Symbol.asyncDispose] = function asyncDispose() {
  return new Promise((resolve, reject) => {
    this.close((err) => (err ? reject(err) : resolve()));
  });
};

Boot.prototype.start = function start() {
  this.started = true;
  // Waits for the calls to use() of this tick.
  process.nextTick(this._doStart);
  return this;
};

// The server a plugin runs with: the same one, unless overridden (xufa gives each plugin an encapsulated copy).
Boot.prototype.override = function override(server) {
  return server;
};

Boot.prototype[kBoot] = true;

Boot.prototype.use = function use(plugin, opts) {
  this._lastUsed = this._addPlugin(plugin, opts, false);
  return this;
};

Boot.prototype._loadRegistered = function loadRegistered() {
  const plugin = this._current[0];
  // The root plugin may not have started: after() can be used before ready().
  if (!this.started && !this.booted) process.nextTick(() => this._root.queue.resume());
  if (!plugin) return Promise.resolve();
  return plugin.loadedSoFar();
};

Object.defineProperty(Boot.prototype, 'then', { get: thenify });

Boot.prototype._addPlugin = function addPlugin(pluginFn, opts, isAfter) {
  const fn = isBundled(pluginFn) ? pluginFn.default : pluginFn;
  validatePlugin(fn);
  if (this.booted) throw new BOOT_ERR_ROOT_PLG_BOOTED();
  // Plugins are added to the plugin being loaded.
  const current = this._current[0];
  let { timeout } = this._opts;
  if (!current.loaded && current.timeout > 0) {
    // A little earlier than the parent, so that the child times out first.
    timeout = current.timeout - (Date.now() - current.startTime + 3);
  }
  const plugin = new Plugin(createQueue(this, this._loadPluginNextTick, 1), fn, opts || {}, isAfter, timeout);
  this._trackPluginLoading(plugin);
  if (current.loaded) throw new Error(plugin.name, current.name);
  current.enqueue(plugin, (err) => {
    if (err) this._error = err;
  });
  return plugin;
};

Boot.prototype._expose = function expose() {
  const instance = this;
  const server = instance._server;
  const {
    use: useKey = 'use',
    after: afterKey = 'after',
    ready: readyKey = 'ready',
    onClose: onCloseKey = 'onClose',
    close: closeKey = 'close',
  } = this._opts.expose;

  if (server[useKey]) throw new BOOT_ERR_EXPOSE_ALREADY_DEFINED(useKey, 'use');
  server[useKey] = function exposedUse(fn, opts) {
    instance.use(fn, opts);
    return this;
  };
  if (server[afterKey]) throw new BOOT_ERR_EXPOSE_ALREADY_DEFINED(afterKey, 'after');
  server[afterKey] = function exposedAfter(func) {
    if (typeof func !== 'function') return instance._loadRegistered();
    instance.after(encapsulateThreeParam(func, this));
    return this;
  };
  if (server[readyKey]) throw new BOOT_ERR_EXPOSE_ALREADY_DEFINED(readyKey, 'ready');
  server[readyKey] = function exposedReady(func) {
    if (func && typeof func !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN(readyKey, typeof func);
    return instance.ready(func ? encapsulateThreeParam(func, this) : undefined);
  };
  if (server[onCloseKey]) throw new BOOT_ERR_EXPOSE_ALREADY_DEFINED(onCloseKey, 'onClose');
  server[onCloseKey] = function exposedOnClose(func) {
    if (typeof func !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN(onCloseKey, typeof func);
    instance.onClose(encapsulateTwoParam(func, this));
    return this;
  };
  if (server[closeKey]) throw new BOOT_ERR_EXPOSE_ALREADY_DEFINED(closeKey, 'close');
  server[closeKey] = function exposedClose(func) {
    if (func && typeof func !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN(closeKey, typeof func);
    if (func) {
      instance.close(encapsulateThreeParam(func, this));
      return this;
    }
    return instance.close();
  };
  if (server.then) throw new BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED('then');
  Object.defineProperty(server, 'then', { get: thenify.bind(instance) });
  server[kBoot] = true;
};

Boot.prototype.after = function after(func) {
  if (!func) return this._loadRegistered();
  // eslint-disable-next-line no-underscore-dangle
  function _after(s, opts, done) {
    callWithCbOrNextTick.call(this, func, done);
  }
  this._addPlugin(_after.bind(this), {}, true);
  return this;
};

Boot.prototype.onClose = function onClose(func) {
  if (typeof func !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN('onClose', typeof func);
  // onClose and close handlers share the queue, but are called with other arguments.
  func[kIsOnCloseHandler] = true;
  this._closeQ.unshift(func, (err) => {
    if (err) this._error = err;
  });
  return this;
};

Boot.prototype.close = function close(func) {
  let callback = func;
  let promise;
  if (callback) {
    if (typeof callback !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN('close', typeof callback);
  } else {
    promise = new Promise((resolve, reject) => {
      callback = (err) => (err ? reject(err) : resolve());
    });
  }
  this.ready(() => {
    this._error = null;
    this._closeQ.push(callback);
    process.nextTick(this._closeQ.resume.bind(this._closeQ));
  });
  return promise;
};

Boot.prototype.ready = function ready(func) {
  if (func) {
    if (typeof func !== 'function') throw new BOOT_ERR_CALLBACK_NOT_FN('ready', typeof func);
    this._readyQ.push(func);
    queueMicrotask(this.start.bind(this));
    return undefined;
  }
  return new Promise((resolve, reject) => {
    // The order matters: when the boot is done, push() calls readyPromiseCB at once, and an error rejects the
    // promise before relativeContext is read (there is no plugin being loaded any longer).
    this._readyQ.push(readyPromiseCB);
    this.start();
    // Promises resolve with the server of the plugin being loaded.
    const relativeContext = this._current[0].server;
    function readyPromiseCB(err, context, done) {
      if (err) reject(err);
      else resolve(relativeContext);
      process.nextTick(done);
    }
  });
};

Boot.prototype._trackPluginLoading = function trackPluginLoading(plugin) {
  const parentName = (this._current[0] && this._current[0].name) || null;
  plugin.once('start', (serverName, funcName, time) => {
    const nodeId = this.pluginTree.start(parentName, funcName, time);
    plugin.once('loaded', (s, f, stopTime) => this.pluginTree.stop(nodeId, stopTime));
  });
};

Boot.prototype.prettyPrint = function prettyPrint() {
  return this.pluginTree.prettyPrint();
};

Boot.prototype.toJSON = function toJSON() {
  return this.pluginTree.toJSON();
};

Boot.prototype._loadPlugin = function loadPlugin(plugin, callback) {
  const instance = this;
  if (isPromiseLike(plugin.func)) {
    plugin.func.then((loaded) => {
      // eslint-disable-next-line no-param-reassign
      plugin.func = typeof loaded.default === 'function' ? loaded.default : loaded;
      this._loadPlugin(plugin, callback);
    }, callback);
    return;
  }
  const last = instance._current[0];
  instance._current.unshift(plugin);

  function execCallback(err) {
    plugin.finish(err, (error) => {
      instance._current.shift();
      callback(error);
    });
  }

  if (instance._error && !plugin.isAfter) {
    process.nextTick(execCallback);
    return;
  }
  let server = (last && last.server) || instance._server;
  if (!plugin.isAfter) {
    try {
      server = instance.override(server, plugin.func, plugin.options);
    } catch (overrideErr) {
      execCallback(overrideErr);
      return;
    }
  }
  plugin.exec(server, execCallback);
};

// Loads on the next tick, so that the after() callbacks bound before run first.
Boot.prototype._loadPluginNextTick = function loadPluginNextTick(plugin, callback) {
  process.nextTick(this._loadPlugin.bind(this), plugin, callback);
};

function callWithCbOrNextTick(func, cb) {
  const context = this._server;
  const err = this._error;
  // The error goes to the next after() or ready() callback.
  this._error = null;
  if (func.length === 0) {
    this._error = err;
    executeWithThenable(func, [], cb);
  } else if (func.length === 1) {
    executeWithThenable(func, [err], cb);
  } else if (this._opts.timeout === 0) {
    let completed = false;
    const wrapCb = (error) => {
      if (completed) return;
      completed = true;
      this._error = error;
      process.nextTick(cb, this._error);
    };
    if (func.length === 2) func(err, wrapCb);
    else func(err, context, wrapCb);
  } else {
    timeoutCall.call(this, func, err, context, cb);
  }
}

function timeoutCall(func, rootErr, context, cb) {
  const name = func.unwrappedName !== undefined ? func.unwrappedName : func.name;
  let timer = setTimeout(() => {
    timer = null;
    const err = new BOOT_ERR_READY_TIMEOUT(name);
    err.fn = func;
    this._error = err;
    cb(err);
  }, this._opts.timeout);
  const timeoutCb = (err) => {
    if (!timer) return; // timed out already
    clearTimeout(timer);
    timer = null;
    this._error = err;
    process.nextTick(cb, this._error);
  };
  if (func.length === 2) func(rootErr, timeoutCb);
  else func(rootErr, context, timeoutCb);
}

function closeWithCbOrNextTick(func, cb) {
  const context = this._server;
  const isOnClose = func[kIsOnCloseHandler];
  if (func.length === 0 || func.length === 1) {
    const promise = isOnClose ? func(context) : func(this._error);
    if (promise && typeof promise.then === 'function') {
      promise.then(
        () => process.nextTick(cb),
        (e) => process.nextTick(cb, e)
      );
    } else {
      process.nextTick(cb);
    }
  } else if (func.length === 2) {
    if (isOnClose) func(context, cb);
    else func(this._error, cb);
  } else if (isOnClose) {
    func(context, cb);
  } else {
    func(this._error, context, cb);
  }
}

function settle(result, cb, err) {
  if (result && result.then) {
    result.then(() => process.nextTick(cb, err), cb);
  } else {
    process.nextTick(cb, err);
  }
}

function encapsulateTwoParam(func, that) {
  function encapsulated(context, cb) {
    if (func.length === 0) settle(func(), cb);
    else if (func.length === 1) settle(func(this), cb);
    else func(this, cb);
  }
  return encapsulated.bind(that);
}

function encapsulateThreeParam(func, that) {
  function encapsulated(err, cb) {
    if (!func) {
      process.nextTick(cb);
    } else if (func.length === 0) {
      settle(func(), cb, err);
    } else if (func.length === 1) {
      settle(func(err), cb);
    } else if (func.length === 2) {
      func(err, cb);
    } else {
      func(err, this, cb);
    }
  }
  const wrapped = encapsulated.bind(that);
  wrapped.unwrappedName = func.name;
  return wrapped;
}

export default Boot;
Boot.Boot = Boot;
Boot.errors = errors;
Boot.kBoot = kBoot;
Boot.kPluginMeta = kPluginMeta;

export { Boot as 'module.exports' };

export { Boot, errors, kBoot, kPluginMeta };
