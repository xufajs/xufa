/*! xufa: @xufa/http 0.1.0 in the browser | MIT license */
// Made by tools/docs/lib/browser-bundle.js (pnpm docs): do not edit.
(function (root) {
  'use strict';
  // Buffer, for the modules that write bytes (the writer of @xufa/serializer): what they use of it, over Uint8Array
  // and TextEncoder, when the browser has none. In this scope only: nothing is added to the page.
  var Buffer = root.Buffer || (function () {
    var encoder = new TextEncoder();
    var decoder = new TextDecoder();
    class BrowserBuffer extends Uint8Array {
      static allocUnsafe(size) { return new BrowserBuffer(size); }
      static allocUnsafeSlow(size) { return new BrowserBuffer(size); }
      static alloc(size) { return new BrowserBuffer(size); }
      static isBuffer(value) { return value instanceof BrowserBuffer; }
      static byteLength(text) { return typeof text === 'string' ? encoder.encode(text).length : text.byteLength; }
      static concat(list) {
        var out = new BrowserBuffer(list.reduce(function (sum, part) { return sum + part.length; }, 0));
        list.reduce(function (offset, part) { out.set(part, offset); return offset + part.length; }, 0);
        return out;
      }
      static from(value) {
        var bytes = typeof value === 'string' ? encoder.encode(value) : new Uint8Array(value);
        var out = new BrowserBuffer(bytes.length);
        out.set(bytes);
        return out;
      }
      utf8Write(text, offset, length) {
        return encoder.encodeInto(text, this.subarray(offset, offset + length)).written;
      }
      utf8Slice(start, end) {
        return decoder.decode(this.subarray(start, end));
      }
      copy(target, targetStart, sourceStart, sourceEnd) {
        var part = this.subarray(sourceStart || 0, sourceEnd === undefined ? this.length : sourceEnd);
        target.set(part, targetStart || 0);
        return part.length;
      }
      toString(encoding, start, end) {
        return decoder.decode(this.subarray(start || 0, end === undefined ? this.length : end));
      }
    }
    return BrowserBuffer;
  })();
  var process = root.process || {
    nextTick: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      queueMicrotask(function () { fn.apply(null, args); });
    },
    env: {}, argv: [], platform: 'browser', pid: 1, version: '', versions: {},
    hrtime: Object.assign(function (previous) {
      var now = performance.now();
      var time = [Math.floor(now / 1000), Math.round((now % 1000) * 1e6)];
      return previous ? [time[0] - previous[0], time[1] - previous[1]] : time;
    }, { bigint: function () { return BigInt(Math.round(performance.now() * 1e6)); } }),
    emitWarning: function (warning) { console.warn(String(warning && warning.message || warning)); },
    on: function () { return process; }, once: function () { return process; },
    off: function () { return process; }, removeListener: function () { return process; },
    emit: function () { return false; }, listenerCount: function () { return 0; },
    cwd: function () { return '/'; },
    uptime: function () { return performance.now() / 1000; },
    memoryUsage: function () { return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 }; },
    stdout: { write: function (text) { console.log(String(text).replace(/\n$/, '')); return true; } },
    stderr: { write: function (text) { console.error(String(text).replace(/\n$/, '')); return true; } },
  };
  function timer(id) {
    return { id: id, unref: function () { return this; }, ref: function () { return this; },
      hasRef: function () { return true; }, refresh: function () { return this; },
      [Symbol.toPrimitive]: function () { return id; } };
  }
  function clear(id) { return id && typeof id === 'object' ? id.id : id; }
  var setTimeout = function () { return timer(root.setTimeout.apply(root, arguments)); };
  var clearTimeout = function (id) { root.clearTimeout(clear(id)); };
  var setInterval = function () { return timer(root.setInterval.apply(root, arguments)); };
  var clearInterval = function (id) { root.clearInterval(clear(id)); };
  var setImmediate = function (fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    return setTimeout(function () { fn.apply(null, args); }, 0);
  };
  var clearImmediate = clearTimeout;
  var modules = {
"@xufa/boot/index.js": function (module, exports, require) {
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
const { EventEmitter } = require('node:events');
const { createQueue } = require('./lib/queue');
const { Plugin, kPluginMeta, isPromiseLike } = require('./lib/plugin');
const { TimeTree } = require('./lib/time-tree');
const errors = require('./lib/errors');

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

module.exports = Boot;
module.exports.Boot = Boot;
module.exports.errors = errors;
module.exports.kBoot = kBoot;
module.exports.kPluginMeta = kPluginMeta;

},
"@xufa/boot/lib/errors.js": function (module, exports, require) {
const { createError } = require('@xufa/errors');

module.exports = {
  BOOT_ERR_EXPOSE_ALREADY_DEFINED: createError(
    'BOOT_ERR_EXPOSE_ALREADY_DEFINED',
    "'%s' is already defined, specify an expose option for '%s'"
  ),
  BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED: createError('BOOT_ERR_ATTRIBUTE_ALREADY_DEFINED', "'%s' is already defined"),
  BOOT_ERR_CALLBACK_NOT_FN: createError(
    'BOOT_ERR_CALLBACK_NOT_FN',
    "Callback for '%s' hook is not a function. Received: '%s'"
  ),
  BOOT_ERR_PLUGIN_NOT_VALID: createError(
    'BOOT_ERR_PLUGIN_NOT_VALID',
    "Plugin must be a function or a promise. Received: '%s'"
  ),
  BOOT_ERR_ROOT_PLG_BOOTED: createError('BOOT_ERR_ROOT_PLG_BOOTED', 'Root plugin has already booted'),
  BOOT_ERR_PARENT_PLG_LOADED: createError(
    'BOOT_ERR_PARENT_PLG_LOADED',
    "Impossible to load '%s' plugin because the parent '%s' was already loaded"
  ),
  BOOT_ERR_READY_TIMEOUT: createError(
    'BOOT_ERR_READY_TIMEOUT',
    "Plugin did not start in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise"
  ),
  BOOT_ERR_PLUGIN_EXEC_TIMEOUT: createError(
    'BOOT_ERR_PLUGIN_EXEC_TIMEOUT',
    "Plugin did not start in time: '%s'. You may have forgotten to call 'done' function or to resolve a Promise"
  ),
};

},
"@xufa/boot/lib/plugin.js": function (module, exports, require) {
// A plugin being loaded: its function runs with the server (or its encapsulated copy), and the plugins it registers
// are queued in its own queue, loaded once it is done.
const { EventEmitter } = require('node:events');
const { BOOT_ERR_PLUGIN_EXEC_TIMEOUT } = require('./errors');

// Set by fastify-plugin (and xufa's own plugin helper) on the functions it wraps.
const kPluginMeta = Symbol.for('plugin-meta');

const isPromiseLike = (value) => value !== null && value !== undefined && typeof value.then === 'function';

function pluginName(func, options) {
  if (func[kPluginMeta] && func[kPluginMeta].name) return func[kPluginMeta].name;
  if (options && options.name) return options.name;
  if (func.name) return func.name;
  return func
    .toString()
    .split('\n')
    .slice(0, 2)
    .map((line) => line.trim())
    .join(' -- ');
}

function deferred() {
  const result = { promise: null, resolve: null, reject: null };
  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
}

function noop() {}

class Plugin extends EventEmitter {
  constructor(queue, func, options, isAfter, timeout) {
    super();
    this.queue = queue;
    this.func = func;
    this.options = options;
    this.isAfter = isAfter;
    this.timeout = timeout;
    this.started = false;
    this.name = pluginName(func, options);
    this.queue.pause();
    this._error = null;
    this.loaded = false;
    this._promise = null;
    this.startTime = null;
    this.server = undefined;
  }

  exec(server, callback) {
    this.server = server;
    const { func, name } = this;
    let completed = false;
    this.options = typeof this.options === 'function' ? this.options(this.server) : this.options;
    let timer = null;
    const done = (execErr) => {
      if (completed) return;
      this._error = execErr;
      completed = true;
      if (timer) clearTimeout(timer);
      callback(execErr);
    };
    if (this.timeout > 0) {
      timer = setTimeout(() => {
        timer = null;
        const err = new BOOT_ERR_PLUGIN_EXEC_TIMEOUT(name);
        err.fn = func;
        done(err);
      }, this.timeout);
    }
    this.started = true;
    this.startTime = Date.now();
    this.emit('start', this.server ? this.server.name : null, this.name, Date.now());
    const result = func(this.server, this.options, done);
    if (isPromiseLike(result)) {
      result.then(
        () => process.nextTick(done),
        (err) => process.nextTick(done, err)
      );
    } else if (func.length < 3) {
      done();
    }
  }

  // A promise resolved when the plugins registered so far in this plugin are loaded.
  loadedSoFar() {
    if (this.loaded) return Promise.resolve();
    const setup = () => {
      this.server.after((afterErr, callback) => {
        this._error = afterErr;
        this.queue.pause();
        if (this._promise) {
          if (afterErr) this._promise.reject(afterErr);
          else this._promise.resolve();
          this._promise = null;
        }
        process.nextTick(callback, afterErr);
      });
      this.queue.resume();
    };
    if (this._promise) return Promise.resolve();
    this._promise = deferred();
    const { promise } = this._promise;
    if (!this.server) this.on('start', setup);
    else setup();
    return promise;
  }

  enqueue(plugin, callback) {
    this.emit('enqueue', this.server ? this.server.name : null, this.name, Date.now());
    this.queue.push(plugin, callback);
  }

  finish(err, callback) {
    const done = () => {
      if (this.loaded) return;
      this.emit('loaded', this.server ? this.server.name : null, this.name, Date.now());
      this.loaded = true;
      callback(err);
    };
    if (err) {
      if (this._promise) {
        this._promise.reject(err);
        this._promise = null;
      }
      done();
      return;
    }
    const check = () => {
      if (this.queue.length() === 0 && this.queue.running() === 0) {
        if (this._promise) {
          const wrap = () => queueMicrotask(check);
          this._promise.resolve();
          this._promise.promise.then(wrap, wrap);
          this._promise = null;
        } else {
          done();
        }
      } else {
        // Done when the queue of the plugins registered inside is empty.
        this.queue.drain = () => {
          this.queue.drain = noop;
          queueMicrotask(check);
        };
      }
    };
    queueMicrotask(check);
    // The plugins registered inside start loading once this one is done.
    this.queue.resume();
  }
}

module.exports = { Plugin, kPluginMeta, isPromiseLike };

},
"@xufa/boot/lib/queue.js": function (module, exports, require) {
// A queue of tasks run by a worker with a limit of concurrency, that can be paused (the semantics of fastq that the
// loading order of plugins depends on). A task is handed to the worker synchronously when the queue is free; when the
// worker calls back, the callback of the task runs and then the next task starts, still synchronously.

function noop() {}

function createQueue(context, worker, concurrency = 1) {
  let head = null;
  let tail = null;
  let running = 0;

  const queue = {
    paused: false,
    drain: noop,
    empty: noop,
    saturated: noop,
    push,
    unshift,
    pause,
    resume,
    length,
    running: () => running,
    idle: () => running === 0 && head === null,
    getQueue,
  };

  function createTask(value, done) {
    const task = { value, callback: done || noop, next: null };
    task.worked = function worked(err, result) {
      const { callback } = task;
      task.callback = noop;
      callback.call(context, err, result);
      release();
    };
    return task;
  }

  function enqueue(task, atHead) {
    if (running >= concurrency || queue.paused) {
      if (head === null) {
        head = task;
        tail = task;
        queue.saturated();
      } else if (atHead) {
        task.next = head;
        head = task;
      } else {
        tail.next = task;
        tail = task;
      }
      return;
    }
    running += 1;
    worker.call(context, task.value, task.worked);
  }

  function push(value, done) {
    enqueue(createTask(value, done), false);
  }

  function unshift(value, done) {
    enqueue(createTask(value, done), true);
  }

  function pause() {
    queue.paused = true;
  }

  function resume() {
    if (!queue.paused) return;
    queue.paused = false;
    if (head === null) {
      running += 1;
      release();
      return;
    }
    while (head !== null && running < concurrency) {
      running += 1;
      release();
    }
  }

  function release() {
    const next = head;
    if (next !== null && running <= concurrency) {
      if (queue.paused) {
        running -= 1;
        return;
      }
      if (tail === head) tail = null;
      head = next.next;
      next.next = null;
      worker.call(context, next.value, next.worked);
      if (tail === null) queue.empty();
      return;
    }
    running -= 1;
    if (running === 0) queue.drain();
  }

  function length() {
    let count = 0;
    for (let task = head; task !== null; task = task.next) count += 1;
    return count;
  }

  function getQueue() {
    const tasks = [];
    for (let task = head; task !== null; task = task.next) tasks.push(task.value);
    return tasks;
  }

  return queue;
}

module.exports = { createQueue };

},
"@xufa/boot/lib/time-tree.js": function (module, exports, require) {
// The tree of loaded plugins with the time each one took, for prettyPrint() and toJSON().

class TimeTree {
  constructor() {
    this.root = null;
    this.tableId = new Map();
    this.tableLabel = new Map();
  }

  track(node) {
    this.tableId.set(node.id, node);
    if (this.tableLabel.has(node.label)) this.tableLabel.get(node.label).push(node);
    else this.tableLabel.set(node.label, [node]);
  }

  untrack(node) {
    this.tableId.delete(node.id);
    const nodes = this.tableLabel.get(node.label);
    nodes.pop();
    if (nodes.length === 0) this.tableLabel.delete(node.label);
  }

  parentOf(label) {
    if (label === null || !this.tableLabel.has(label)) return null;
    const nodes = this.tableLabel.get(label);
    return nodes[nodes.length - 1];
  }

  start(parent, label, start = Date.now()) {
    const parentNode = this.parentOf(parent);
    if (parentNode === null) {
      this.root = { parent: null, id: 'root', label, nodes: [], start, stop: null, diff: -1 };
      this.track(this.root);
      return this.root.id;
    }
    const node = { parent, id: `${label}-${Math.random()}`, label, nodes: [], start, stop: null, diff: -1 };
    parentNode.nodes.push(node);
    this.track(node);
    return node.id;
  }

  stop(nodeId, stop = Date.now()) {
    const node = this.tableId.get(nodeId);
    if (!node) return;
    node.stop = stop;
    node.diff = node.stop - node.start || 0;
    this.untrack(node);
  }

  toJSON() {
    return { ...this.root };
  }

  prettyPrint() {
    return prettyPrintTimeTree(this.toJSON());
  }
}

function prettyPrintTimeTree(node, prefix = '') {
  let result = `${prefix}${node.label} ${node.diff} ms\n`;
  const last = node.nodes.length - 1;
  node.nodes.forEach((child, i) => {
    const childPrefix = prefix + (i === last ? '  ' : '│ ');
    result += prefix + (i === last ? '└─' : '├─') + (child.nodes.length === 0 ? '─ ' : '┬ ');
    result += prettyPrintTimeTree(child, childPrefix).slice(prefix.length + 2);
  });
  return result;
}

module.exports = { TimeTree };

},
"@xufa/boot/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/boot","version":"0.1.0"};
},
"@xufa/errors/index.js": function (module, exports, require) {
// @xufa/errors: classes of errors with a code, a status code and a message formatted with the arguments given.
//
//   const NotFound = createError('APP_NOT_FOUND', 'User %s not found', 404);
//   throw new NotFound('ada'); // or NotFound('ada'); err.code, err.statusCode, err.message
const { format } = require('node:util');

const genericSym = Symbol.for('xufa-error-generic');
const GENERIC_CODE = 'XUFA_ERR';

function toString() {
  return `${this.name} [${this.code}]: ${this.message}`;
}

function defineHidden(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: false, writable: false, configurable: false });
}

function createError(code, message, statusCode = 500, Base = Error, captureStackTrace = createError.captureStackTrace) {
  const generic = code === genericSym;
  const errorCode = generic ? GENERIC_CODE : code;
  if (!errorCode) throw new Error('Error code must not be empty');
  if (!message) throw new Error('Error message must not be empty');
  const upperCode = errorCode.toUpperCase();
  const status = statusCode || undefined;
  const specificSym = Symbol.for(`xufa-error ${upperCode}`);
  // Messages without placeholders do not go through util.format, unless arguments have to be appended.
  const plain = message.indexOf('%') === -1;

  function XufaError(...args) {
    if (!new.target) return new XufaError(...args);
    this.code = upperCode;
    this.name = 'XufaError';
    this.statusCode = status;
    const last = args.length - 1;
    if (last !== -1 && args[last] && typeof args[last] === 'object' && 'cause' in args[last]) {
      this.cause = args.pop().cause;
    }
    this.message = plain && args.length === 0 ? message : format(message, ...args);
    if (Error.stackTraceLimit && captureStackTrace) Error.captureStackTrace(this, XufaError);
  }

  XufaError.prototype = Object.create(Base.prototype, {
    constructor: { value: XufaError, enumerable: false, writable: true, configurable: true },
  });
  defineHidden(XufaError.prototype, genericSym, true);
  defineHidden(XufaError.prototype, specificSym, true);
  const instanceSym = generic ? genericSym : specificSym;
  defineHidden(XufaError, Symbol.hasInstance, (instance) => Boolean(instance && instance[instanceSym]));
  XufaError.prototype[Symbol.toStringTag] = 'Error';
  XufaError.prototype.toString = toString;
  return XufaError;
}

createError.captureStackTrace = true;

const XufaError = createError(genericSym, 'Xufa Error', 500, Error);

module.exports = createError;
module.exports.createError = createError;
module.exports.XufaError = XufaError;
module.exports.default = createError;

},
"@xufa/errors/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/errors","version":"0.1.0"};
},
"@xufa/http/index.js": function (module, exports, require) {
module.exports = require('./lib/xufa');

},
"@xufa/http/lib/config.js": function (module, exports, require) {
// The options of an instance: defaults, and initialConfig, the frozen copy of the options that can be read back
// (only the known ones, coerced to their types, secrets like the https certificates hidden).
const { XUFA_ERR_INIT_OPTS_INVALID } = require('./errors');

const defaultInitOptions = {
  connectionTimeout: 0,
  keepAliveTimeout: 72000,
  maxRequestsPerSocket: 0,
  requestTimeout: 0,
  handlerTimeout: 0,
  bodyLimit: 1048576,
  onProtoPoisoning: 'error',
  onConstructorPoisoning: 'error',
  pluginTimeout: 10000,
  requestIdHeader: false,
  http2SessionTimeout: 72000,
  exposeHeadRoutes: true,
  allowErrorHandlerOverride: false,
  routerOptions: {
    allowUnsafeRegex: false,
    caseSensitive: true,
    ignoreTrailingSlash: false,
    ignoreDuplicateSlashes: false,
    maxParamLength: 100,
    useSemicolonDelimiter: false,
  },
};

class InvalidOption extends Error {}

// Coercions of ajv's coerceTypes, as the validation of fastify's options does them.
function toInteger(value, nullable) {
  if (value === null) {
    if (nullable) return null;
    return 0;
  }
  let number = value;
  if (typeof value === 'boolean') number = value ? 1 : 0;
  else if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) number = Number(value);
  if (typeof number !== 'number' || !Number.isInteger(number)) throw new InvalidOption('must be integer');
  return number;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0 || value === null) return false;
  throw new InvalidOption('must be boolean');
}

function toString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return '';
  throw new InvalidOption('must be string');
}

const INTEGERS = [
  'connectionTimeout',
  'keepAliveTimeout',
  'maxRequestsPerSocket',
  'requestTimeout',
  'handlerTimeout',
  'bodyLimit',
  'pluginTimeout',
  'http2SessionTimeout',
];
const BOOLEANS = ['http2', 'ignoreTrailingSlash', 'ignoreDuplicateSlashes', 'exposeHeadRoutes'];
const STRINGS = ['onProtoPoisoning', 'onConstructorPoisoning'];
const ROUTER_BOOLEANS = [
  'allowUnsafeRegex',
  'caseSensitive',
  'ignoreTrailingSlash',
  'ignoreDuplicateSlashes',
  'useSemicolonDelimiter',
];

function buildConfig(options) {
  const config = {};
  const has = (key) => Object.prototype.hasOwnProperty.call(options, key) && options[key] !== undefined;
  for (const key of INTEGERS) {
    config[key] = has(key) ? toInteger(options[key], key === 'maxRequestsPerSocket') : defaultInitOptions[key];
  }
  for (const key of BOOLEANS) {
    if (has(key)) config[key] = toBoolean(options[key]);
    else if (key === 'exposeHeadRoutes') config[key] = defaultInitOptions[key];
  }
  for (const key of STRINGS) config[key] = has(key) ? toString(options[key]) : defaultInitOptions[key];
  if (has('forceCloseConnections')) {
    const value = options.forceCloseConnections;
    if (!(typeof value === 'boolean' || (typeof value === 'string' && /idle/u.test(value)))) {
      throw new InvalidOption('must match exactly one schema in oneOf');
    }
    config.forceCloseConnections = value;
  }
  if (has('https')) {
    const { https } = options;
    // Certificates and keys are not exposed: only that https is on, and allowHTTP1.
    if (typeof https === 'boolean' || https === null) config.https = https;
    else if (typeof https === 'object' && typeof https.allowHTTP1 === 'boolean')
      config.https = { allowHTTP1: https.allowHTTP1 };
    else config.https = true;
  }
  if (has('requestIdHeader')) {
    const value = options.requestIdHeader;
    if (typeof value !== 'boolean' && typeof value !== 'string') throw new InvalidOption('must be boolean');
    config.requestIdHeader = value;
  } else {
    config.requestIdHeader = defaultInitOptions.requestIdHeader;
  }
  config.http2SessionTimeout = has('http2SessionTimeout')
    ? toInteger(options.http2SessionTimeout)
    : defaultInitOptions.http2SessionTimeout;

  const router = options.routerOptions || {};
  if (typeof router !== 'object') throw new InvalidOption('must be object');
  const routerConfig = {};
  for (const key of ROUTER_BOOLEANS) {
    routerConfig[key] = router[key] === undefined ? defaultInitOptions.routerOptions[key] : toBoolean(router[key]);
  }
  routerConfig.maxParamLength =
    router.maxParamLength === undefined
      ? defaultInitOptions.routerOptions.maxParamLength
      : toInteger(router.maxParamLength);
  if (router.constraints !== undefined && (router.constraints === null || typeof router.constraints !== 'object')) {
    throw new InvalidOption('must be object');
  }
  routerConfig.constraints = router.constraints;
  config.routerOptions = {
    allowUnsafeRegex: routerConfig.allowUnsafeRegex,
    caseSensitive: routerConfig.caseSensitive,
    constraints: routerConfig.constraints,
    ignoreTrailingSlash: routerConfig.ignoreTrailingSlash,
    ignoreDuplicateSlashes: routerConfig.ignoreDuplicateSlashes,
    maxParamLength: routerConfig.maxParamLength,
    useSemicolonDelimiter: routerConfig.useSemicolonDelimiter,
  };
  return config;
}

function deepFreeze(object) {
  for (const name of Object.getOwnPropertyNames(object)) {
    const value = object[name];
    if (value && typeof value === 'object' && !(ArrayBuffer.isView(value) && !(value instanceof DataView))) {
      deepFreeze(value);
    }
  }
  return Object.freeze(object);
}

// The read-only initialConfig of the options; throws XUFA_ERR_INIT_OPTS_INVALID for values of a wrong type.
function getSecuredInitialConfig(options) {
  let config;
  try {
    config = buildConfig(options);
  } catch (err) {
    if (!(err instanceof InvalidOption)) throw err;
    const error = new XUFA_ERR_INIT_OPTS_INVALID(JSON.stringify([err.message]));
    error.errors = [{ message: err.message }];
    throw error;
  }
  // Everything is frozen but the constraint strategies, which are objects of the user.
  for (const key of Object.keys(config)) {
    const value = config[key];
    if (key !== 'routerOptions' && value && typeof value === 'object') deepFreeze(value);
  }
  Object.freeze(config.routerOptions);
  return Object.freeze(config);
}

module.exports = getSecuredInitialConfig;
module.exports.getSecuredInitialConfig = getSecuredInitialConfig;
module.exports.defaultInitOptions = defaultInitOptions;
module.exports.deepFreeze = deepFreeze;
module.exports.utils = { deepFreezeObject: deepFreeze };

},
"@xufa/http/lib/content-type-parser.js": function (module, exports, require) {
// Parsers of request bodies by content type: JSON and plain text by default, others added with
// addContentTypeParser (strings, regular expressions, or '*' for any).
const { AsyncResource } = require('node:async_hooks');
const secureJson = require('./secure-json');
const ContentType = require('./content-type');
const {
  kDefaultJsonParse,
  kContentTypeParser,
  kBodyLimit,
  kRequestPayloadStream,
  kState,
  kTestInternals,
  kReplyIsError,
  kRouteContext,
} = require('./symbols');
const {
  XUFA_ERR_CTP_INVALID_TYPE,
  XUFA_ERR_CTP_EMPTY_TYPE,
  XUFA_ERR_CTP_ALREADY_PRESENT,
  XUFA_ERR_CTP_INVALID_HANDLER,
  XUFA_ERR_CTP_INVALID_PARSE_TYPE,
  XUFA_ERR_CTP_BODY_TOO_LARGE,
  XUFA_ERR_CTP_INVALID_MEDIA_TYPE,
  XUFA_ERR_CTP_INVALID_CONTENT_LENGTH,
  XUFA_ERR_CTP_EMPTY_JSON_BODY,
  XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED,
  XUFA_ERR_CTP_INVALID_JSON_BODY,
} = require('./errors');
const { XUFASEC001 } = require('./warnings');

const { LruMap } = ContentType;

function Parser(asString, asBuffer, bodyLimit, fn) {
  this.asString = asString;
  this.asBuffer = asBuffer;
  this.bodyLimit = bodyLimit;
  this.fn = fn;
}

function ContentTypeParser(bodyLimit, onProtoPoisoning, onConstructorPoisoning) {
  this[kDefaultJsonParse] = getDefaultJsonParser(onProtoPoisoning, onConstructorPoisoning);
  // A Map, so that keys can not reach the prototype of an object.
  this.customParsers = new Map();
  this.customParsers.set('application/json', new Parser(true, false, bodyLimit, this[kDefaultJsonParse]));
  this.customParsers.set('text/plain', new Parser(true, false, bodyLimit, defaultPlainTextParser));
  this.parserList = ['application/json', 'text/plain'];
  this.parserRegExpList = [];
  this.cache = new LruMap(100);
  // Header values as they come (not normalized) -> parser: headers seen before are not parsed again.
  this.rawCache = new LruMap(100);
}

ContentTypeParser.prototype.add = function add(contentTypeArg, opts, parserFn) {
  let contentType = contentTypeArg;
  const isString = typeof contentType === 'string';
  if (isString) {
    contentType = contentType.trim().toLowerCase();
    if (contentType.length === 0) throw new XUFA_ERR_CTP_EMPTY_TYPE();
  } else if (!(contentType instanceof RegExp)) {
    throw new XUFA_ERR_CTP_INVALID_TYPE();
  }
  if (typeof parserFn !== 'function') throw new XUFA_ERR_CTP_INVALID_HANDLER();
  if (this.existingParser(contentType)) throw new XUFA_ERR_CTP_ALREADY_PRESENT(contentType);
  if (opts.parseAs !== undefined && opts.parseAs !== 'string' && opts.parseAs !== 'buffer') {
    throw new XUFA_ERR_CTP_INVALID_PARSE_TYPE(opts.parseAs);
  }
  const parser = new Parser(opts.parseAs === 'string', opts.parseAs === 'buffer', opts.bodyLimit, parserFn);
  this.cache.clear();
  this.rawCache.clear();
  if (contentType === '*') {
    this.customParsers.set('', parser);
  } else if (isString) {
    const ct = new ContentType(contentType);
    if (ct.isValid === false) throw new XUFA_ERR_CTP_INVALID_TYPE();
    const normalized = ct.toString();
    this.parserList.unshift(normalized);
    this.customParsers.set(normalized, parser);
  } else {
    validateRegExp(contentType);
    this.parserRegExpList.unshift(contentType);
    this.customParsers.set(contentType.toString(), parser);
  }
};

function keyOf(contentType) {
  if (typeof contentType === 'string') return contentType === '*' ? '' : new ContentType(contentType).toString();
  if (!(contentType instanceof RegExp)) throw new XUFA_ERR_CTP_INVALID_TYPE();
  return contentType.toString();
}

ContentTypeParser.prototype.hasParser = function hasParser(contentType) {
  return this.customParsers.has(keyOf(contentType));
};

// Whether a parser of the user is set for the type (the default ones can be replaced).
ContentTypeParser.prototype.existingParser = function existingParser(contentType) {
  if (contentType === '*') return false;
  if (typeof contentType === 'string') {
    const ct = keyOf(contentType);
    if (contentType === 'application/json' && this.customParsers.has(contentType)) {
      return this.customParsers.get(ct).fn !== this[kDefaultJsonParse];
    }
    if (contentType === 'text/plain' && this.customParsers.has(contentType)) {
      return this.customParsers.get(ct).fn !== defaultPlainTextParser;
    }
  }
  return this.hasParser(contentType);
};

ContentTypeParser.prototype.getParser = function getParser(contentTypeArg) {
  let contentType = contentTypeArg;
  if (typeof contentType === 'string') {
    const cached = this.rawCache.get(contentType);
    if (cached !== undefined) return cached;
    contentType = new ContentType(contentType);
  }
  const ct = contentType.toString();
  let parser = this.cache.get(ct);
  if (parser !== undefined) return parser;
  // The exact type with its parameters, then its media type, then the regular expressions.
  parser = this.customParsers.get(ct);
  if (parser === undefined) parser = this.customParsers.get(contentType.mediaType);
  if (parser === undefined) {
    for (const regex of this.parserRegExpList) {
      // A g or y flag keeps a lastIndex between calls.
      regex.lastIndex = 0;
      if (regex.test(ct)) {
        parser = this.customParsers.get(regex.toString());
        break;
      }
    }
  }
  if (parser !== undefined) {
    this.cache.set(ct, parser);
    if (typeof contentTypeArg === 'string') this.rawCache.set(contentTypeArg, parser);
    return parser;
  }
  return this.customParsers.get('');
};

ContentTypeParser.prototype.removeAll = function removeAll() {
  this.customParsers = new Map();
  this.parserRegExpList = [];
  this.parserList = [];
  this.cache = new LruMap(100);
  this.rawCache = new LruMap(100);
};

ContentTypeParser.prototype.remove = function remove(contentType) {
  let key;
  let parsers;
  if (typeof contentType === 'string') {
    key = keyOf(contentType);
    parsers = this.parserList;
  } else {
    if (!(contentType instanceof RegExp)) throw new XUFA_ERR_CTP_INVALID_TYPE();
    key = contentType.toString();
    parsers = this.parserRegExpList;
  }
  this.cache.clear();
  this.rawCache.clear();
  const removed = this.customParsers.delete(key);
  const index = parsers.findIndex((ct) => ct.toString() === key);
  if (index > -1) parsers.splice(index, 1);
  return removed || index > -1;
};

ContentTypeParser.prototype.run = function run(contentType, handler, request, reply) {
  const parser = this.getParser(contentType);
  if (parser === undefined) {
    if (request.is404 === true) {
      handler(request, reply);
      return;
    }
    reply[kReplyIsError] = true;
    reply.send(new XUFA_ERR_CTP_INVALID_MEDIA_TYPE());
    return;
  }

  // The body arrives in the context of the socket: the rest of the request goes on in its own.
  const resource = new AsyncResource('content-type-parser:run', request);
  function onDone(error, body) {
    resource.emitDestroy();
    if (error != null) {
      // The client may send more data: the connection is closed.
      reply.header('connection', 'close');
      reply[kReplyIsError] = true;
      reply.send(error);
      return;
    }
    request.body = body;
    handler(request, reply);
  }
  function done(error, body) {
    resource.runInAsyncScope(onDone, undefined, error, body);
  }

  if (parser.asString === true || parser.asBuffer === true) {
    rawBody(request, reply, reply[kRouteContext]._parserOptions, parser, done);
    return;
  }
  const result = parser.fn(request, request[kRequestPayloadStream], done);
  if (result && typeof result.then === 'function') result.then((body) => done(null, body), done);
};

function rawBody(request, reply, options, parser, done) {
  const asString = parser.asString === true;
  const limit = options.limit === null ? parser.bodyLimit : options.limit;
  const contentLength = Number(request.headers['content-length']);
  if (contentLength > limit) {
    done(new XUFA_ERR_CTP_BODY_TOO_LARGE(), undefined);
    return;
  }
  let received = 0;
  let first = null;
  let chunks = null;
  const payload = request[kRequestPayloadStream] || request.raw;

  function cleanup() {
    payload.removeListener('data', onData);
    payload.removeListener('end', onEnd);
    payload.removeListener('error', onEnd);
  }

  function onData(data) {
    // A stream of a preParsing hook may give strings.
    const chunk = typeof data === 'string' ? Buffer.from(data) : data;
    received += chunk.length;
    const encodedLength = payload.receivedEncodedLength || 0;
    // The decoded body must not exceed the limit either ("zip bombs").
    if (received > limit || encodedLength > limit) {
      cleanup();
      done(new XUFA_ERR_CTP_BODY_TOO_LARGE(), undefined);
      return;
    }
    if (first === null) first = chunk;
    else if (chunks === null) chunks = [first, chunk];
    else chunks.push(chunk);
  }

  function onEnd(err) {
    cleanup();
    if (err != null) {
      if (!(typeof err.statusCode === 'number' && err.statusCode >= 400)) err.statusCode = 400; // eslint-disable-line no-param-reassign
      done(err, undefined);
      return;
    }
    if (!Number.isNaN(contentLength) && (payload.receivedEncodedLength || received) !== contentLength) {
      done(new XUFA_ERR_CTP_INVALID_CONTENT_LENGTH(), undefined);
      return;
    }
    let body;
    if (first === null) {
      body = asString ? '' : Buffer.alloc(0);
    } else if (asString) {
      // Decoded at once, so that characters split between chunks are kept whole.
      body = chunks === null ? first.toString('utf8') : Buffer.concat(chunks, received).toString('utf8');
    } else {
      // A copy: the parser never gets a view of the buffer of the socket.
      body = chunks === null ? Buffer.from(first) : Buffer.concat(chunks, received);
    }
    const result = parser.fn(request, body, done);
    if (result && typeof result.then === 'function') result.then((value) => done(null, value), done);
  }

  payload.on('data', onData);
  payload.on('end', onEnd);
  payload.on('error', onEnd);
  payload.resume();
}

function getDefaultJsonParser(onProtoPoisoning, onConstructorPoisoning) {
  const options = { protoAction: onProtoPoisoning, constructorAction: onConstructorPoisoning };
  return function defaultJsonParser(req, body, done) {
    if (body.length === 0) {
      done(new XUFA_ERR_CTP_EMPTY_JSON_BODY(), undefined);
      return;
    }
    let value;
    try {
      value = secureJson.parse(body, options);
    } catch {
      done(new XUFA_ERR_CTP_INVALID_JSON_BODY(), undefined);
      return;
    }
    done(null, value);
  };
}

function defaultPlainTextParser(req, body, done) {
  done(null, body);
}

function buildContentTypeParser(parent) {
  const parser = new ContentTypeParser();
  parser[kDefaultJsonParse] = parent[kDefaultJsonParse];
  parser.customParsers = new Map(parent.customParsers.entries());
  parser.parserList = parent.parserList.slice();
  parser.parserRegExpList = parent.parserRegExpList.slice();
  return parser;
}

function addContentTypeParser(contentType, optsArg, parserArg) {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('addContentTypeParser');
  let opts = optsArg;
  let parser = parserArg;
  if (typeof opts === 'function') {
    parser = opts;
    opts = {};
  }
  opts = { ...opts };
  if (!opts.bodyLimit) opts.bodyLimit = this[kBodyLimit];
  if (Array.isArray(contentType)) {
    for (const type of contentType) this[kContentTypeParser].add(type, opts, parser);
  } else {
    this[kContentTypeParser].add(contentType, opts, parser);
  }
  return this;
}

function hasContentTypeParser(contentType) {
  return this[kContentTypeParser].hasParser(contentType);
}

function removeContentTypeParser(contentType) {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('removeContentTypeParser');
  if (Array.isArray(contentType)) {
    for (const type of contentType) this[kContentTypeParser].remove(type);
  } else {
    this[kContentTypeParser].remove(contentType);
  }
}

function removeAllContentTypeParsers() {
  if (this[kState].started) throw new XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED('removeAllContentTypeParsers');
  this[kContentTypeParser].removeAll();
}

// A regular expression should start with ^ or allow parameters (;?), not to match a type inside another one.
function validateRegExp(regex) {
  if (regex.source[0] !== '^' && !regex.source.includes(';?')) XUFASEC001(regex.source);
}

module.exports = ContentTypeParser;
module.exports.helpers = {
  buildContentTypeParser,
  addContentTypeParser,
  hasContentTypeParser,
  removeContentTypeParser,
  removeAllContentTypeParsers,
};
module.exports.defaultParsers = { getDefaultJsonParser, defaultTextParser: defaultPlainTextParser };
module.exports[kTestInternals] = { rawBody };

},
"@xufa/http/lib/content-type.js": function (module, exports, require) {
// The value of a Content-Type header: type/subtype and parameters (RFC 9110 §8.3, §5.6.6), parsed once per distinct
// header value thanks to a small LRU cache.

// One `name=value` parameter at a parameter boundary; the value is a token or a quoted-string with quoted-pairs.
const PARAMETER =
  /(?:^|;)\s*([\w!#$%&'*+.^`|~-]+)=("(?:[\t\x20\x21\x23-\x5b\x5d-\x7e\x80-\xff]|\\[\t\x20-\xff])*"|[\w!#$%&'*+.^`|~-]+)/gu;
const QUOTED_PAIR = /\\([\t\x20-\xff])/gu;
const TYPE_NAME = /^[\w!#$%&'*+.^`|~-]+$/;
const SUBTYPE_NAME = /^[\w!#$%&'*+.^`|~-]+\s*$/;

class LruMap {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }

  get(key) {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value);
    this.map.set(key, value);
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}

const cache = new LruMap(100);

class ContentType {
  #valid = false;

  #empty = true;

  #type = '';

  #subtype = '';

  #parameters = new Map();

  #string = undefined;

  static get cache() {
    return cache;
  }

  // A parsed header value, cached by value.
  static from(headerValue) {
    let contentType = cache.get(headerValue);
    if (contentType !== undefined) return contentType;
    contentType = new ContentType(headerValue);
    cache.set(headerValue, contentType);
    return contentType;
  }

  constructor(headerValue) {
    if (headerValue == null || headerValue === '' || headerValue === 'undefined') return;
    let separator = headerValue.indexOf(';');
    if (separator === -1) {
      separator = headerValue.indexOf('/');
      if (separator === -1) return;
      const type = headerValue.slice(0, separator).trimStart().toLowerCase();
      const subtype = headerValue
        .slice(separator + 1)
        .trimEnd()
        .toLowerCase();
      if (TYPE_NAME.test(type) && SUBTYPE_NAME.test(subtype)) {
        this.#valid = true;
        this.#empty = false;
        this.#type = type;
        this.#subtype = subtype;
      }
      return;
    }
    const mediaType = headerValue.slice(0, separator).toLowerCase();
    const parameters = headerValue.slice(separator + 1).trim();
    separator = mediaType.indexOf('/');
    if (separator === -1) return;
    const type = mediaType.slice(0, separator).trimStart();
    const subtype = mediaType.slice(separator + 1).trimEnd();
    if (!TYPE_NAME.test(type) || !SUBTYPE_NAME.test(subtype)) return;
    this.#type = type;
    this.#subtype = subtype;
    this.#valid = true;
    this.#empty = false;
    PARAMETER.lastIndex = 0;
    let match = PARAMETER.exec(parameters);
    while (match) {
      // Parameter names are case-insensitive, values may not be.
      const key = match[1].toLowerCase();
      let value = match[2];
      if (value.charCodeAt(0) === 0x22) {
        value = value.slice(1, -1);
        if (value.indexOf('\\') !== -1) value = value.replace(QUOTED_PAIR, '$1');
      }
      this.#parameters.set(key, value);
      match = PARAMETER.exec(parameters);
    }
  }

  get [Symbol.toStringTag]() {
    return 'ContentType';
  }

  get isEmpty() {
    return this.#empty;
  }

  get isValid() {
    return this.#valid;
  }

  get mediaType() {
    return this.#valid ? `${this.#type}/${this.#subtype}` : undefined;
  }

  get type() {
    return this.#type;
  }

  get subtype() {
    return this.#subtype;
  }

  get parameters() {
    return this.#parameters;
  }

  toString() {
    if (this.#string !== undefined) return this.#string;
    let out = `${this.#type}/${this.#subtype}`;
    const parameters = [];
    for (const [key, value] of this.#parameters) {
      // Inside a quoted-string, backslashes and quotes are written as quoted-pairs.
      parameters.push(`${key}="${value.replace(/[\\"]/g, '\\$&')}"`);
    }
    if (parameters.length > 0) out += `; ${parameters.join('; ')}`;
    this.#string = out;
    return out;
  }
}

module.exports = ContentType;
module.exports.LruMap = LruMap;

},
"@xufa/http/lib/context.js": function (module, exports, require) {
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

},
"@xufa/http/lib/decorate.js": function (module, exports, require) {
// Decorators of instances, requests and replies.
const { kReply, kRequest, kState, kHasBeenDecorated } = require('./symbols');
const {
  XUFA_ERR_DEC_ALREADY_PRESENT,
  XUFA_ERR_DEC_MISSING_DEPENDENCY,
  XUFA_ERR_DEC_AFTER_START,
  XUFA_ERR_DEC_REFERENCE_TYPE,
  XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE,
  XUFA_ERR_DEC_UNDECLARED,
} = require('./errors');

const isAccessor = (fn) => Boolean(fn) && (typeof fn.getter === 'function' || typeof fn.setter === 'function');

function decorate(instance, name, fn, dependencies) {
  if (Object.prototype.hasOwnProperty.call(instance, name)) throw new XUFA_ERR_DEC_ALREADY_PRESENT(name);
  checkDependencies(instance, name, dependencies);
  if (isAccessor(fn)) Object.defineProperty(instance, name, { get: fn.getter, set: fn.setter });
  else instance[name] = fn;
}

function hasKey(constructor, name) {
  return constructor.props ? constructor.props.some((prop) => prop.key === name) : false;
}

function hasInstanceProperty(constructor, name) {
  for (let k = constructor; k; k = k.parent) {
    if (k.instanceProperties && k.instanceProperties.has(name)) return true;
  }
  return false;
}

function checkExistence(instance, name) {
  if (name) return name in instance || (instance.prototype && name in instance.prototype) || hasKey(instance, name);
  return instance in this;
}

// Request and Reply decorators: functions and accessors on the prototype, values set by the constructor of each
// request (so that objects are not shared between requests).
function decorateConstructor(constructor, name, fn, dependencies) {
  const proto = constructor.prototype;
  if (
    Object.prototype.hasOwnProperty.call(proto, name) ||
    hasKey(constructor, name) ||
    hasInstanceProperty(constructor, name)
  ) {
    throw new XUFA_ERR_DEC_ALREADY_PRESENT(name);
  }
  constructor[kHasBeenDecorated] = true;
  checkDependencies(constructor, name, dependencies);
  if (isAccessor(fn)) {
    Object.defineProperty(proto, name, { get: fn.getter, set: fn.setter });
  } else if (typeof fn === 'function') {
    proto[name] = fn;
  } else {
    constructor.props.push({ key: name, value: fn });
    // The constructor sets the values of the decorators: it is rebuilt with the new property.
    if (typeof constructor.rebuild === 'function') constructor.rebuild();
  }
}

function checkReferenceType(name, fn) {
  if (typeof fn === 'object' && fn && !isAccessor(fn)) throw new XUFA_ERR_DEC_REFERENCE_TYPE(name, typeof fn);
}

function assertNotStarted(instance, name) {
  if (instance[kState].started) throw new XUFA_ERR_DEC_AFTER_START(name);
}

function checkDependencies(instance, name, deps) {
  if (deps === undefined || deps === null) return;
  if (!Array.isArray(deps)) throw new XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE(name);
  for (const dep of deps) {
    if (!checkExistence(instance, dep) && !hasInstanceProperty(instance, dep)) {
      throw new XUFA_ERR_DEC_MISSING_DEPENDENCY(dep);
    }
  }
}

function decorateInstance(name, fn, dependencies) {
  assertNotStarted(this, name);
  decorate(this, name, fn, dependencies);
  return this;
}

function decorateReply(name, fn, dependencies) {
  assertNotStarted(this, name);
  checkReferenceType(name, fn);
  decorateConstructor(this[kReply], name, fn, dependencies);
  return this;
}

function decorateRequest(name, fn, dependencies) {
  assertNotStarted(this, name);
  checkReferenceType(name, fn);
  decorateConstructor(this[kRequest], name, fn, dependencies);
  return this;
}

function checkRequestExistence(name) {
  if (name && hasKey(this[kRequest], name)) return true;
  if (name && hasInstanceProperty(this[kRequest], name)) return true;
  return checkExistence(this[kRequest].prototype, name);
}

function checkReplyExistence(name) {
  if (name && hasKey(this[kReply], name)) return true;
  if (name && hasInstanceProperty(this[kReply], name)) return true;
  return checkExistence(this[kReply].prototype, name);
}

function getInstanceDecorator(name) {
  if (!checkExistence(this, name)) throw new XUFA_ERR_DEC_UNDECLARED(name, 'instance');
  return typeof this[name] === 'function' ? this[name].bind(this) : this[name];
}

module.exports = {
  add: decorateInstance,
  exist: checkExistence,
  existRequest: checkRequestExistence,
  existReply: checkReplyExistence,
  dependencies: checkDependencies,
  decorateReply,
  decorateRequest,
  getInstanceDecorator,
  hasKey,
};

},
"@xufa/http/lib/dev-errors.js": function (module, exports, require) {
// The page of the errors for development (as Laravel's Ignition and Django's debug page): a request of a browser
// (Accept: text/html) that fails gets a page with the error, its causes, its stack with the lines of the source around
// each call of the app, the request (headers of credentials hidden) and the routes; a route that is not there, the
// list of the routes. Other requests get the answers they get without it (JSON). Off when NODE_ENV is production,
// unless enabled: true; never turn it on where others can reach the app: it shows the code and the request.
//
//   app.register(devErrors);                          // or app.register(devErrors, { enabled: true, context: 7 })
const fs = require('node:fs');
const path = require('node:path');
const { STATUS_CODES } = require('node:http');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
// The error of a request (from onError), for the page.
const ERROR = Symbol('xufa.devErrors.error');
const HIDDEN = /^(authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-auth-token)$/i;

// The folder of @xufa/http itself: its calls are not of the app. Asked when a page is made (not when the module
// loads: the playground of the docs runs this package in a browser, without folders).
let own = null;
function ownFolder() {
  if (own === null) own = typeof __dirname === 'string' ? path.join(__dirname, path.sep) : '\0';
  return own;
}

const wantsHtml = (request) => /text\/html/.test(request.headers.accept || '');

// The calls of a stack: { fn, file, line, column, app } (app: a file of the app, not of node_modules nor of Node).
function framesOf(stack) {
  const frames = [];
  for (const line of String(stack || '')
    .split('\n')
    .slice(1)) {
    const match = /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    let file = match[2];
    if (file.startsWith('file://')) {
      try {
        file = decodeURIComponent(new URL(file).pathname).replace(/^\/([A-Za-z]:)/, '$1');
      } catch {
        // as it is
      }
    }
    const internal = file.startsWith('node:') || !path.isAbsolute(file);
    frames.push({
      fn: match[1] || '(anonymous)',
      file,
      line: Number(match[3]),
      column: Number(match[4]),
      app: !internal && !/[\\/]node_modules[\\/]/.test(file) && !file.startsWith(ownFolder()),
      internal,
    });
  }
  return frames;
}

// The lines of a file around one (cached for the page).
function sourceAround(file, line, context, cache) {
  if (!cache.has(file)) {
    let lines = null;
    try {
      const stat = fs.statSync(file);
      if (stat.size < 2 * 1024 * 1024) lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    } catch {
      lines = null;
    }
    cache.set(file, lines);
  }
  const lines = cache.get(file);
  if (!lines) return null;
  const from = Math.max(1, line - context);
  const to = Math.min(lines.length, line + context);
  const out = [];
  for (let n = from; n <= to; n += 1) out.push({ n, text: lines[n - 1], here: n === line });
  return out;
}

function table(rows) {
  if (rows.length === 0) return '<p class="empty">None</p>';
  return `<table>${rows
    .map(([name, value]) => `<tr><th>${escape(name)}</th><td><code>${escape(value)}</code></td></tr>`)
    .join('')}</table>`;
}

function json(value) {
  if (value === undefined || value === null || value === '') return '<p class="empty">None</p>';
  let text;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text.length > 20000) text = `${text.slice(0, 20000)}\n... (${text.length - 20000} characters more)`;
  return `<pre class="block">${escape(text)}</pre>`;
}

function errorSection(err, context, cache, depth) {
  const name = (err && err.name) || 'Error';
  const message = err && err.message !== undefined ? err.message : String(err);
  const frames = framesOf(err && err.stack);
  const shown = frames
    .map((frame, i) => {
      const where = `${escape(frame.fn)} <span class="file">${escape(frame.file)}:${frame.line}:${frame.column}</span>`;
      if (!frame.app) return `<li class="frame other">${where}</li>`;
      const lines = sourceAround(frame.file, frame.line, context, cache);
      const code = lines
        ? `<pre class="source">${lines
            .map(({ n, text, here }) => `<span class="${here ? 'here' : ''}"><b>${n}</b>${escape(text)}</span>`)
            .join('')}</pre>`
        : '';
      return `<li class="frame app"><details${i === frames.findIndex((f) => f.app) ? ' open' : ''}><summary>${where}</summary>${code}</details></li>`;
    })
    .join('');
  const extra = [];
  if (err && err.code) extra.push(['code', err.code]);
  if (err && Array.isArray(err.validation)) {
    err.validation.forEach((item, i) =>
      extra.push([`validation ${i + 1}`, `${item.instancePath || ''} ${item.message}`])
    );
  }
  if (err && err.errors && typeof err.errors === 'object' && !Array.isArray(err.errors)) {
    for (const [field, messages] of Object.entries(err.errors)) extra.push([field, [].concat(messages).join(' ')]);
  }
  let html = `<section class="error${depth ? ' cause' : ''}">
  <h2>${depth ? 'Caused by ' : ''}<span class="name">${escape(name)}</span></h2>
  <p class="message">${escape(message)}</p>
  ${extra.length ? table(extra) : ''}
  <ol class="frames">${shown || '<li class="frame other">No stack</li>'}</ol>
</section>`;
  if (err && err.cause && depth < 5) html += errorSection(err.cause, context, cache, depth + 1);
  return html;
}

const STYLE = `
:root { color-scheme: light dark; --bg: #f7f7f8; --fg: #1d1d1f; --muted: #6b6b76; --card: #fff; --line: #e3e3e8;
  --accent: #c42b1c; --here: #fde8e6; --code: #f2f2f5; }
@media (prefers-color-scheme: dark) { :root { --bg: #151518; --fg: #ececf1; --muted: #9a9aa6; --card: #1e1e23;
  --line: #2e2e36; --accent: #ff6b5e; --here: #4a1f1c; --code: #26262c; } }
* { box-sizing: border-box; } body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
header { border-left: 4px solid var(--accent); padding: 4px 0 4px 16px; margin-bottom: 24px; }
header .status { color: var(--accent); font-weight: 600; letter-spacing: .02em; }
header h1 { margin: 4px 0; font-size: 26px; word-break: break-word; }
header .where { color: var(--muted); font-family: ui-monospace, monospace; font-size: 13px; }
.warning { color: var(--muted); font-size: 13px; }
section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; margin: 16px 0; }
section h2 { margin: 0 0 8px; font-size: 17px; } .name { color: var(--accent); }
.message { font-size: 17px; margin: 0 0 12px; white-space: pre-wrap; word-break: break-word; }
.frames { list-style: none; padding: 0; margin: 0; font-family: ui-monospace, monospace; font-size: 13px; }
.frame { padding: 4px 0; border-top: 1px solid var(--line); } .frame.other { color: var(--muted); }
.file { color: var(--muted); } summary { cursor: pointer; }
pre { margin: 8px 0 0; overflow-x: auto; background: var(--code); border-radius: 6px; padding: 8px 0; font-size: 13px; }
pre.block { padding: 8px 12px; }
.source span { display: block; padding: 0 12px; white-space: pre; } .source span.here { background: var(--here); }
.source b { display: inline-block; width: 4em; color: var(--muted); font-weight: normal; user-select: none; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { text-align: left; vertical-align: top; padding: 4px 8px; border-top: 1px solid var(--line); }
th { width: 200px; color: var(--muted); font-weight: normal; } td code { word-break: break-all; }
.empty { color: var(--muted); margin: 0; }
`;

function page({ status, title, where, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(`${status} ${title}`)}</title><style>${STYLE}</style></head>
<body><main>
<header><div class="status">${status} ${escape(STATUS_CODES[status] || '')}</div><h1>${escape(title)}</h1>
<div class="where">${escape(where)}</div></header>
${body}
<p class="warning">This page is of @xufa/http's devErrors, for development: it shows the code and the request. It is off when NODE_ENV is production.</p>
</main></body></html>`;
}

function requestSection(request) {
  const headers = Object.entries(request.headers).map(([name, value]) => [
    name,
    HIDDEN.test(name) ? '(hidden)' : Array.isArray(value) ? value.join(', ') : value,
  ]);
  const route = request.routeOptions && request.routeOptions.url;
  return `<section><h2>Request</h2>${table([
    ['method', request.method],
    ['url', request.url],
    ...(route ? [['route', route]] : []),
    ['ip', request.ip],
    ['id', request.id],
  ])}
<h3>Params</h3>${json(request.params && Object.keys(request.params).length ? request.params : null)}
<h3>Query</h3>${json(request.query && Object.keys(request.query).length ? request.query : null)}
<h3>Body</h3>${json(request.body)}
<h3>Headers</h3>${table(headers)}</section>`;
}

function routesSection(app) {
  let routes = '';
  try {
    routes = app.printRoutes({ commonPrefix: false });
  } catch {
    routes = '';
  }
  return `<section><details><summary><b>Routes</b></summary><pre class="block">${escape(routes || '(none)')}</pre></details>
${table([
  ['node', process.version],
  ['NODE_ENV', process.env.NODE_ENV || '(not set)'],
])}</section>`;
}

function errorPage(err, request, { context = 5, app, status: sent }) {
  const status =
    sent || (err && (err.statusCode >= 400 ? err.statusCode : err.status >= 400 ? err.status : 500)) || 500;
  const cache = new Map();
  return {
    status,
    html: page({
      status,
      title: (err && err.message) || 'Error',
      where: `${request.method} ${request.url}`,
      body: errorSection(err, context, cache, 0) + requestSection(request) + routesSection(app),
    }),
  };
}

function notFoundPage(request, app) {
  return page({
    status: 404,
    title: `No route for ${request.method} ${request.url.split('?')[0]}`,
    where: `${request.method} ${request.url}`,
    body: `<section><h2>The routes of the app</h2><pre class="block">${escape(
      app.printRoutes({ commonPrefix: false }) || '(none)'
    )}</pre></section>${requestSection(request)}`,
  });
}

function devErrors(app, options, done) {
  const { enabled = process.env.NODE_ENV !== 'production', context = 5, notFound = true } = options || {};
  if (!enabled) {
    done();
    return;
  }
  // Hooks, not handlers: the error handlers and the not-found handler of the app (and of plugins, as the ORM's) answer
  // as they do; for a browser, what they send is replaced by the page. onError keeps the error of the request.
  app.addHook('onError', async (request, reply, err) => {
    request[ERROR] = err;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 400 || !wantsHtml(request)) return payload;
    const err = request[ERROR];
    let html;
    if (err) html = errorPage(err, request, { context, app, status: reply.statusCode }).html;
    else if (notFound && reply.statusCode === 404 && request.is404) html = notFoundPage(request, app);
    else return payload;
    reply.header('content-type', 'text/html; charset=utf-8');
    reply.removeHeader('content-length');
    return html;
  });
  done();
}

devErrors[Symbol.for('skip-override')] = true;
devErrors[Symbol.for('fastify.display-name')] = 'devErrors';
devErrors[Symbol.for('plugin-meta')] = { name: 'devErrors' };

module.exports = { devErrors, framesOf, errorPage };

},
"@xufa/http/lib/error-handler.js": function (module, exports, require) {
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

},
"@xufa/http/lib/error-serializer.js": function (module, exports, require) {
// The serializer of errors written by the fallback error handler: { statusCode, code, error, message }.
const build = require('@xufa/serializer');

module.exports = build({
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
});

},
"@xufa/http/lib/errors.js": function (module, exports, require) {
const { createError } = require('@xufa/errors');

const codes = {
  /**
   * Basic
   */
  XUFA_ERR_NOT_FOUND: createError('XUFA_ERR_NOT_FOUND', 'Not Found', 404),
  XUFA_ERR_OPTIONS_NOT_OBJ: createError('XUFA_ERR_OPTIONS_NOT_OBJ', 'Options must be an object', 500, TypeError),
  XUFA_ERR_QSP_NOT_FN: createError(
    'XUFA_ERR_QSP_NOT_FN',
    "querystringParser option should be a function, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN: createError(
    'XUFA_ERR_SCHEMA_CONTROLLER_BUCKET_OPT_NOT_FN',
    "schemaController.bucket option should be a function, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN: createError(
    'XUFA_ERR_SCHEMA_ERROR_FORMATTER_NOT_FN',
    "schemaErrorFormatter option should be a non async function. Instead got '%s'.",
    500,
    TypeError
  ),
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ: createError(
    'XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_OBJ',
    "ajv.customOptions option should be an object, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR: createError(
    'XUFA_ERR_AJV_CUSTOM_OPTIONS_OPT_NOT_ARR',
    "ajv.plugins option should be an array, instead got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_VALIDATION: createError('XUFA_ERR_VALIDATION', '%s', 400),
  XUFA_ERR_LISTEN_OPTIONS_INVALID: createError(
    'XUFA_ERR_LISTEN_OPTIONS_INVALID',
    "Invalid listen options: '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ERROR_HANDLER_NOT_FN: createError(
    'XUFA_ERR_ERROR_HANDLER_NOT_FN',
    'Error Handler must be a function',
    500,
    TypeError
  ),
  XUFA_ERR_ERROR_HANDLER_ALREADY_SET: createError(
    'XUFA_ERR_ERROR_HANDLER_ALREADY_SET',
    "Error Handler already set in this scope. Set 'allowErrorHandlerOverride: true' to allow overriding.",
    500,
    TypeError
  ),

  /**
   * ContentTypeParser
   */
  XUFA_ERR_CTP_ALREADY_PRESENT: createError(
    'XUFA_ERR_CTP_ALREADY_PRESENT',
    "Content type parser '%s' already present."
  ),
  XUFA_ERR_CTP_INVALID_TYPE: createError(
    'XUFA_ERR_CTP_INVALID_TYPE',
    'The content type should be a string or a RegExp',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_EMPTY_TYPE: createError(
    'XUFA_ERR_CTP_EMPTY_TYPE',
    'The content type cannot be an empty string',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_INVALID_HANDLER: createError(
    'XUFA_ERR_CTP_INVALID_HANDLER',
    'The content type handler should be a function',
    500,
    TypeError
  ),
  XUFA_ERR_CTP_INVALID_PARSE_TYPE: createError(
    'XUFA_ERR_CTP_INVALID_PARSE_TYPE',
    "The body parser can only parse your data as 'string' or 'buffer', you asked '%s' which is not supported.",
    500,
    TypeError
  ),
  XUFA_ERR_CTP_BODY_TOO_LARGE: createError('XUFA_ERR_CTP_BODY_TOO_LARGE', 'Request body is too large', 413, RangeError),
  XUFA_ERR_CTP_INVALID_MEDIA_TYPE: createError('XUFA_ERR_CTP_INVALID_MEDIA_TYPE', 'Unsupported Media Type', 415),
  XUFA_ERR_CTP_INVALID_CONTENT_LENGTH: createError(
    'XUFA_ERR_CTP_INVALID_CONTENT_LENGTH',
    'Request body size did not match Content-Length',
    400,
    RangeError
  ),
  XUFA_ERR_CTP_EMPTY_JSON_BODY: createError(
    'XUFA_ERR_CTP_EMPTY_JSON_BODY',
    "Body cannot be empty when content-type is set to 'application/json'",
    400
  ),
  XUFA_ERR_CTP_INVALID_JSON_BODY: createError(
    'XUFA_ERR_CTP_INVALID_JSON_BODY',
    "Body is not valid JSON but content-type is set to 'application/json'",
    400
  ),
  XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED: createError(
    'XUFA_ERR_CTP_INSTANCE_ALREADY_STARTED',
    'Cannot call "%s" when xufa instance is already started!',
    400
  ),

  /**
   * decorate
   */
  XUFA_ERR_DEC_ALREADY_PRESENT: createError(
    'XUFA_ERR_DEC_ALREADY_PRESENT',
    "The decorator '%s' has already been added!"
  ),
  XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE: createError(
    'XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE',
    "The dependencies of decorator '%s' must be of type Array.",
    500,
    TypeError
  ),
  XUFA_ERR_DEC_MISSING_DEPENDENCY: createError(
    'XUFA_ERR_DEC_MISSING_DEPENDENCY',
    "The decorator is missing dependency '%s'."
  ),
  XUFA_ERR_DEC_AFTER_START: createError('XUFA_ERR_DEC_AFTER_START', "The decorator '%s' has been added after start!"),
  XUFA_ERR_DEC_REFERENCE_TYPE: createError(
    'XUFA_ERR_DEC_REFERENCE_TYPE',
    "The decorator '%s' of type '%s' is a reference type. Use the { getter, setter } interface instead."
  ),
  XUFA_ERR_DEC_UNDECLARED: createError('XUFA_ERR_DEC_UNDECLARED', "No decorator '%s' has been declared on %s."),

  /**
   * hooks
   */
  XUFA_ERR_HOOK_INVALID_TYPE: createError(
    'XUFA_ERR_HOOK_INVALID_TYPE',
    'The hook name must be a string',
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_INVALID_HANDLER: createError(
    'XUFA_ERR_HOOK_INVALID_HANDLER',
    '%s hook should be a function, instead got %s',
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER: createError(
    'XUFA_ERR_HOOK_INVALID_ASYNC_HANDLER',
    "Async function has too many arguments. Async hooks should not use the 'done' argument.",
    500,
    TypeError
  ),
  XUFA_ERR_HOOK_NOT_SUPPORTED: createError('XUFA_ERR_HOOK_NOT_SUPPORTED', '%s hook not supported!', 500, TypeError),

  /**
   * Middlewares
   */
  XUFA_ERR_MISSING_MIDDLEWARE: createError(
    'XUFA_ERR_MISSING_MIDDLEWARE',
    'You must register a plugin for handling middlewares, see the documentation of xufa for more info.',
    500
  ),

  XUFA_ERR_HOOK_TIMEOUT: createError(
    'XUFA_ERR_HOOK_TIMEOUT',
    "A callback for '%s' hook%s timed out. You may have forgotten to call 'done' function or to resolve a Promise"
  ),

  /**
   * logger
   */
  XUFA_ERR_LOG_INVALID_DESTINATION: createError(
    'XUFA_ERR_LOG_INVALID_DESTINATION',
    'Cannot specify both logger.stream and logger.file options'
  ),

  XUFA_ERR_LOG_INVALID_LOGGER: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER',
    "Invalid logger object provided. The logger instance should have these functions(s): '%s'.",
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE',
    'loggerInstance only accepts a logger instance.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOGGER_CONFIG: createError(
    'XUFA_ERR_LOG_INVALID_LOGGER_CONFIG',
    'logger options only accepts a configuration object.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED: createError(
    'XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED',
    'You cannot provide both logger and loggerInstance. Please provide only one.',
    500,
    TypeError
  ),

  XUFA_ERR_LOG_INVALID_LOG_CONTROLLER: createError(
    'XUFA_ERR_LOG_INVALID_LOG_CONTROLLER',
    "logController option must be an instance of LogController, got '%s'.",
    500,
    TypeError
  ),

  /**
   * reply
   */
  XUFA_ERR_REP_INVALID_PAYLOAD_TYPE: createError(
    'XUFA_ERR_REP_INVALID_PAYLOAD_TYPE',
    "Attempted to send payload of invalid type '%s'. Expected a string or Buffer.",
    500,
    TypeError
  ),
  XUFA_ERR_REP_RESPONSE_BODY_CONSUMED: createError(
    'XUFA_ERR_REP_RESPONSE_BODY_CONSUMED',
    'Response.body is already consumed.'
  ),
  XUFA_ERR_REP_READABLE_STREAM_LOCKED: createError(
    'XUFA_ERR_REP_READABLE_STREAM_LOCKED',
    'ReadableStream was locked. You should call releaseLock() method on reader before sending.'
  ),
  XUFA_ERR_REP_ALREADY_SENT: createError(
    'XUFA_ERR_REP_ALREADY_SENT',
    'Reply was already sent, did you forget to "return reply" in "%s" (%s)?'
  ),
  XUFA_ERR_REP_SENT_VALUE: createError(
    'XUFA_ERR_REP_SENT_VALUE',
    'The only possible value for reply.sent is true.',
    500,
    TypeError
  ),
  XUFA_ERR_SEND_INSIDE_ONERR: createError(
    'XUFA_ERR_SEND_INSIDE_ONERR',
    'You cannot use `send` inside the `onError` hook'
  ),
  XUFA_ERR_SEND_UNDEFINED_ERR: createError('XUFA_ERR_SEND_UNDEFINED_ERR', 'Undefined error has occurred'),
  XUFA_ERR_BAD_STATUS_CODE: createError('XUFA_ERR_BAD_STATUS_CODE', 'Called reply with an invalid status code: %s'),
  XUFA_ERR_BAD_TRAILER_NAME: createError(
    'XUFA_ERR_BAD_TRAILER_NAME',
    'Called reply.trailer with an invalid header name: %s'
  ),
  XUFA_ERR_BAD_TRAILER_VALUE: createError(
    'XUFA_ERR_BAD_TRAILER_VALUE',
    "Called reply.trailer('%s', fn) with an invalid type: %s. Expected a function."
  ),
  XUFA_ERR_FAILED_ERROR_SERIALIZATION: createError(
    'XUFA_ERR_FAILED_ERROR_SERIALIZATION',
    'Failed to serialize an error. Error: %s. Original error: %s'
  ),
  XUFA_ERR_MISSING_SERIALIZATION_FN: createError(
    'XUFA_ERR_MISSING_SERIALIZATION_FN',
    'Missing serialization function. Key "%s"'
  ),
  XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN: createError(
    'XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN',
    'Missing serialization function. Key "%s:%s"'
  ),
  XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION: createError(
    'XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION',
    'Invalid validation invocation. Missing validation function for HTTP part "%s" nor schema provided.'
  ),

  /**
   * schemas
   */
  XUFA_ERR_SCH_MISSING_ID: createError('XUFA_ERR_SCH_MISSING_ID', 'Missing schema $id property'),
  XUFA_ERR_SCH_ALREADY_PRESENT: createError('XUFA_ERR_SCH_ALREADY_PRESENT', "Schema with id '%s' already declared!"),
  XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA: createError(
    'XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA',
    "Schema is missing for the content type '%s'"
  ),
  XUFA_ERR_SCH_DUPLICATE: createError('XUFA_ERR_SCH_DUPLICATE', "Schema with '%s' already present!"),
  XUFA_ERR_SCH_VALIDATION_BUILD: createError(
    'XUFA_ERR_SCH_VALIDATION_BUILD',
    'Failed building the validation schema for %s: %s, due to error %s'
  ),
  XUFA_ERR_SCH_SERIALIZATION_BUILD: createError(
    'XUFA_ERR_SCH_SERIALIZATION_BUILD',
    'Failed building the serialization schema for %s: %s, due to error %s'
  ),
  XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX: createError(
    'XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX',
    'response schemas should be nested under a valid status code, e.g { 2xx: { type: "object" } }'
  ),

  /**
   * initialConfig
   */
  XUFA_ERR_INIT_OPTS_INVALID: createError('XUFA_ERR_INIT_OPTS_INVALID', "Invalid initialization options: '%s'"),
  XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE: createError(
    'XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE',
    "Cannot set forceCloseConnections to 'idle' as your HTTP server does not support closeIdleConnections method"
  ),

  /**
   * router
   */
  XUFA_ERR_DUPLICATED_ROUTE: createError('XUFA_ERR_DUPLICATED_ROUTE', "Method '%s' already declared for route '%s'"),
  XUFA_ERR_BAD_URL: createError('XUFA_ERR_BAD_URL', "'%s' is not a valid url component", 400, URIError),
  XUFA_ERR_MAX_PARAM_LENGTH: createError(
    'XUFA_ERR_MAX_PARAM_LENGTH',
    "'%s' is exceeding the max param length",
    414,
    URIError
  ),
  XUFA_ERR_ASYNC_CONSTRAINT: createError('XUFA_ERR_ASYNC_CONSTRAINT', 'Unexpected error from async constraint', 500),
  XUFA_ERR_INVALID_URL: createError('XUFA_ERR_INVALID_URL', "URL must be a string. Received '%s'", 400, TypeError),
  XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ: createError(
    'XUFA_ERR_ROUTE_OPTIONS_NOT_OBJ',
    'Options for "%s:%s" route must be an object',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_DUPLICATED_HANDLER: createError(
    'XUFA_ERR_ROUTE_DUPLICATED_HANDLER',
    'Duplicate handler for "%s:%s" route is not allowed!',
    500
  ),
  XUFA_ERR_ROUTE_HANDLER_NOT_FN: createError(
    'XUFA_ERR_ROUTE_HANDLER_NOT_FN',
    'Error Handler for %s:%s route, if defined, must be a function',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_MISSING_HANDLER: createError(
    'XUFA_ERR_ROUTE_MISSING_HANDLER',
    'Missing handler function for "%s:%s" route.',
    500
  ),
  XUFA_ERR_ROUTE_METHOD_INVALID: createError(
    'XUFA_ERR_ROUTE_METHOD_INVALID',
    'Provided method is invalid!',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_METHOD_ALREADY_SUPPORTED',
    'Method "%s" is already supported. Use `overrideExisting: true` to override it.',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_METHOD_NOT_SUPPORTED',
    '%s method is not supported.',
    500
  ),
  XUFA_ERR_ROUTE_LOG_LEVEL_INVALID: createError(
    'XUFA_ERR_ROUTE_LOG_LEVEL_INVALID',
    "Log level for '%s:%s' route must be a valid logger level. Received: '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED: createError(
    'XUFA_ERR_ROUTE_BODY_VALIDATION_SCHEMA_NOT_SUPPORTED',
    'Body validation schema for %s:%s route is not supported!',
    500
  ),
  XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT: createError(
    'XUFA_ERR_ROUTE_BODY_LIMIT_OPTION_NOT_INT',
    "'bodyLimit' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_HANDLER_TIMEOUT: createError('XUFA_ERR_HANDLER_TIMEOUT', "Request timed out after %s ms on route '%s'", 503),
  XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT: createError(
    'XUFA_ERR_ROUTE_HANDLER_TIMEOUT_OPTION_NOT_INT',
    "'handlerTimeout' option must be an integer > 0. Got '%s'",
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_REWRITE_NOT_STR: createError(
    'XUFA_ERR_ROUTE_REWRITE_NOT_STR',
    'Rewrite url for "%s" needs to be of type "string" but received "%s"',
    500,
    TypeError
  ),
  XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE: createError(
    'XUFA_ERR_ROUTE_MISSING_CONTENT_TYPE',
    "Method '%s' must provide a 'Content-Type' header.",
    400
  ),

  /**
   *  again listen when close server
   */
  XUFA_ERR_REOPENED_CLOSE_SERVER: createError(
    'XUFA_ERR_REOPENED_CLOSE_SERVER',
    'Xufa has already been closed and cannot be reopened'
  ),
  XUFA_ERR_REOPENED_SERVER: createError('XUFA_ERR_REOPENED_SERVER', 'Xufa is already started'),
  XUFA_ERR_INSTANCE_ALREADY_STARTED: createError(
    'XUFA_ERR_INSTANCE_ALREADY_STARTED',
    'Xufa instance is already listening. %s'
  ),

  /**
   * plugin
   */
  XUFA_ERR_PLUGIN_VERSION_MISMATCH: createError(
    'XUFA_ERR_PLUGIN_VERSION_MISMATCH',
    "xufa-plugin: %s - expected '%s' xufa version, '%s' is installed"
  ),
  XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE: createError(
    'XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE',
    "The decorator '%s'%s is not present in %s"
  ),
  XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER: createError(
    'XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER',
    'The %s plugin being registered mixes async and callback styles. Async plugin should not mix async and callback style.',
    500,
    TypeError
  ),
  XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED: createError(
    'XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED',
    "The dependency '%s' of plugin '%s' is not registered"
  ),
  /**
   *  Errors of @xufa/boot
   */
  XUFA_ERR_PLUGIN_CALLBACK_NOT_FN: createError('XUFA_ERR_PLUGIN_CALLBACK_NOT_FN', 'xufa-plugin: %s', 500, TypeError),
  XUFA_ERR_PLUGIN_NOT_VALID: createError('XUFA_ERR_PLUGIN_NOT_VALID', 'xufa-plugin: %s'),
  XUFA_ERR_ROOT_PLG_BOOTED: createError('XUFA_ERR_ROOT_PLG_BOOTED', 'xufa-plugin: %s'),
  XUFA_ERR_PARENT_PLUGIN_BOOTED: createError('XUFA_ERR_PARENT_PLUGIN_BOOTED', 'xufa-plugin: %s'),
  XUFA_ERR_PLUGIN_TIMEOUT: createError('XUFA_ERR_PLUGIN_TIMEOUT', 'xufa-plugin: %s'),
};

function appendStackTrace(oldErr, newErr) {
  newErr.cause = oldErr;

  return newErr;
}

module.exports = codes;
module.exports.appendStackTrace = appendStackTrace;
module.exports.BOOT_ERRORS_MAP = {
  BOOT_ERR_CALLBACK_NOT_FN: codes.XUFA_ERR_PLUGIN_CALLBACK_NOT_FN,
  BOOT_ERR_PLUGIN_NOT_VALID: codes.XUFA_ERR_PLUGIN_NOT_VALID,
  BOOT_ERR_ROOT_PLG_BOOTED: codes.XUFA_ERR_ROOT_PLG_BOOTED,
  BOOT_ERR_PARENT_PLG_LOADED: codes.XUFA_ERR_PARENT_PLUGIN_BOOTED,
  BOOT_ERR_READY_TIMEOUT: codes.XUFA_ERR_PLUGIN_TIMEOUT,
  BOOT_ERR_PLUGIN_EXEC_TIMEOUT: codes.XUFA_ERR_PLUGIN_TIMEOUT,
};

},
"@xufa/http/lib/fast-head.js": function (module, exports, require) {
// The head of common responses written by xufa as one string, given to Node as the header it would have made
// (res._header), instead of res.writeHead(): Node checks and assembles every header of every response, which is most
// of what a small response costs. On by default (the option fastHead: false turns it off), for HTTP/1.1 responses
// kept alive, with a body, without trailers nor headers set on the response of Node itself (reply.raw.setHeader);
// anything else goes through res.writeHead(). Header names and values are checked as Node checks them.
//
// It sets the fields of Node's ServerResponse that writeHead() sets (_header, _headerSent) and reads those that decide
// keep-alive: the first time it is used, a self-test compares its head with the one of Node, and turns it off for good
// when they differ (a version of Node that changed them).
const http = require('node:http');
const { Duplex } = require('node:stream');

// The symbol of the headers set on Node's response (setHeader), found once.
const kOutHeaders = Object.getOwnPropertySymbols(new http.OutgoingMessage()).find(
  (symbol) => symbol.description === 'kOutHeaders'
);

// What Node accepts in names (tokens) and values (no control characters but tab).
const TOKEN = /^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/;
const INVALID_VALUE = /[^\t\x20-\x7e\x80-\xff]/;

// Names and values already checked; values that change on every request (ids, lengths) are checked every time.
const goodNames = new Set();
const goodValues = new Set();
const MAX_CACHED = 1000;

function checkName(name) {
  if (goodNames.has(name)) return true;
  if (!TOKEN.test(name)) return false;
  if (goodNames.size < MAX_CACHED) goodNames.add(name);
  return true;
}

function checkValue(value) {
  if (goodValues.has(value)) return true;
  if (INVALID_VALUE.test(value)) return false;
  if (goodValues.size < MAX_CACHED) goodValues.add(value);
  return true;
}

// The Date header, made once a second, as Node makes it.
let date = null;
function dateLine() {
  if (date === null) {
    date = `Date: ${new Date().toUTCString()}\r\n`;
    setTimeout(() => {
      date = null;
    }, 1000 - new Date().getMilliseconds()).unref();
  }
  return date;
}

const statusLines = new Map();
function statusLine(code) {
  let line = statusLines.get(code);
  if (line === undefined) {
    line = `HTTP/1.1 ${code} ${http.STATUS_CODES[code] || 'unknown'}\r\n`;
    statusLines.set(code, line);
  }
  return line;
}

// The lines of a header, or null when it is not one this path writes.
function headerLines(name, value) {
  if (typeof value === 'string') return checkValue(value) ? `${name}: ${value}\r\n` : null;
  if (typeof value === 'number') return `${name}: ${value}\r\n`;
  if (Array.isArray(value)) {
    let lines = '';
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      if (typeof item === 'string') {
        if (!checkValue(item)) return null;
      } else if (typeof item !== 'number') return null;
      lines += `${name}: ${item}\r\n`;
    }
    return lines;
  }
  return null;
}

// The head of a response, or null when this path does not write it. `length` is the byte length of the body.
// Headers that decide how the connection is kept: with one of them, Node writes the head.
const CONNECTION = new Set(['connection', 'transfer-encoding', 'date', 'keep-alive']);

// The head of a response, or null when this path does not write it. `length` is the byte length of the body, null
// when it has none (204, 304 and HEAD: Node frames a body without a length as chunks, and that is left to it).
function writeFastHead(res, req, statusCode, headers, length) {
  if (
    res._header !== null ||
    req.httpVersionMajor !== 1 ||
    req.httpVersionMinor !== 1 ||
    !Number.isInteger(statusCode) ||
    statusCode < 200 ||
    statusCode > 599 ||
    res.shouldKeepAlive !== true ||
    res.maxRequestsOnConnectionReached ||
    res.statusMessage !== undefined ||
    res.sendDate !== true
  ) {
    return null;
  }
  if (length === null || length === undefined) {
    const bodyless = statusCode === 204 || statusCode === 304 || req.method === 'HEAD';
    // Without a length, Node keeps the connection only when it could frame a body as chunks (or has an agent).
    if (!bodyless || (!res.useChunkedEncodingByDefault && !res.agent)) return null;
  }
  let head = statusLine(statusCode);
  // Headers set on Node's response (reply.raw.setHeader) come first, as writeHead() gives them: one of the reply with
  // the same name takes its place.
  const raw = res[kOutHeaders];
  let replaced = null;
  if (raw !== null) {
    replaced = new Set();
    for (const key in raw) {
      if (key === 'content-length' || CONNECTION.has(key)) return null;
      let name = raw[key][0];
      let value = raw[key][1];
      if (headers[key] !== undefined) {
        name = key;
        value = headers[key];
        replaced.add(key);
      }
      if (!checkName(name)) return null;
      const lines = headerLines(name, value);
      if (lines === null) return null;
      head += lines;
    }
  }
  for (const name in headers) {
    const value = headers[name];
    if (value === undefined || name === 'content-length') continue; // the length is written below
    if (replaced !== null && replaced.has(name)) continue;
    if (CONNECTION.has(name)) return null;
    if (!checkName(name)) return null;
    const lines = headerLines(name, value);
    if (lines === null) return null;
    head += lines;
  }
  if (length !== null && length !== undefined) head += `content-length: ${length}\r\n`;
  head += `${dateLine()}Connection: keep-alive\r\n`;
  if (res._keepAliveTimeout && res._defaultKeepAlive) {
    const max = ~~res._maxRequestsPerSocket > 0 ? `, max=${res._maxRequestsPerSocket}` : ''; // eslint-disable-line no-bitwise
    head += `Keep-Alive: timeout=${Math.floor(res._keepAliveTimeout / 1000)}${max}\r\n`;
  }
  return `${head}\r\n`;
}

class NullSocket extends Duplex {
  _read() {}

  _write(chunk, encoding, callback) {
    callback();
  }
}

// A response of Node for the self-test, as the server makes them.
function sampleResponse(method = 'GET') {
  const socket = new NullSocket();
  const req = new http.IncomingMessage(socket);
  req.method = method;
  req.httpVersionMajor = 1;
  req.httpVersionMinor = 1;
  req.headers = {};
  const res = new http.ServerResponse(req);
  res._keepAliveTimeout = 72000;
  res._defaultKeepAlive = true;
  res._maxRequestsPerSocket = 7;
  return { req, res };
}

let works = null;

// Whether this path writes the head Node writes (the same lines, Date apart): checked once.
function fastHeadWorks() {
  if (works !== null) return works;
  try {
    const withoutDate = (text) => text.replace(/\r\nDate: [^\r]*/i, '');
    // The same head as Node's writeHead() for these headers (after those set on the response, rawHeaders).
    const same = (method, statusCode, headers, rawHeaders, length) => {
      const node = sampleResponse(method);
      const ours = sampleResponse(method);
      for (const [name, value] of rawHeaders) {
        node.res.setHeader(name, value);
        ours.res.setHeader(name, value);
      }
      node.res.writeHead(statusCode, length === null ? headers : { ...headers, 'content-length': String(length) });
      const head = writeFastHead(ours.res, ours.req, statusCode, headers, length);
      return (
        head !== null &&
        typeof node.res._header === 'string' &&
        /\r\nDate: /.test(node.res._header) &&
        withoutDate(head) === withoutDate(node.res._header) &&
        node.res._headerSent === false
      );
    };
    const json = { 'content-type': 'application/json; charset=utf-8', 'x-many': ['a', 'b'], 'x-count': 3 };
    works =
      same('GET', 201, json, [], 2) &&
      same(
        'HEAD',
        200,
        { 'content-type': 'text/plain', 'x-raw': 'reply' },
        [
          ['X-Raw', 'raw'],
          ['x-first', '1'],
        ],
        5
      );
  } catch {
    works = false;
  }
  return works;
}

// Gives the head to the response, as writeHead() would: true when this path wrote it.
function fastHead(res, req, statusCode, headers, length) {
  const head = writeFastHead(res, req, statusCode, headers, length);
  if (head === null) return false;
  res._header = head;
  res._headerSent = false;
  // When headers were set on the response, writeHead() sets those of the reply there too (getHeaders() gives them).
  const raw = res[kOutHeaders];
  if (raw !== null) {
    for (const name in headers) {
      if (headers[name] !== undefined) raw[name] = [name, headers[name]];
    }
  }
  // As writeHead(): 204 and 304 have no body (a HEAD response has none from the start).
  if (statusCode === 204 || statusCode === 304) res._hasBody = false;
  return true;
}

module.exports = { fastHead, fastHeadWorks, writeFastHead };

},
"@xufa/http/lib/four-oh-four.js": function (module, exports, require) {
// Not found handlers: a router of their own, with a handler for each prefix that set one.
const createRouter = require('@xufa/router');
const Reply = require('./reply');
const Request = require('./request');
const Context = require('./context');
const {
  kRoutePrefix,
  kCanSetNotFoundHandler,
  kFourOhFourLevelInstance,
  kFourOhFourContext,
  kHooks,
  kErrorHandler,
  kLogController,
} = require('./symbols');
const { lifecycleHooks } = require('./hooks');
const { buildErrorHandler } = require('./error-handler');
const { XUFA_ERR_NOT_FOUND } = require('./errors');
const { createChildLogger } = require('./logger');
const { getGenReqId } = require('./req-id');

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

module.exports = fourOhFour;

},
"@xufa/http/lib/handle-request.js": function (module, exports, require) {
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

},
"@xufa/http/lib/head-route.js": function (module, exports, require) {
// The onSend hook of the HEAD routes made for GET routes: the payload of the GET handler gives the Content-Length,
// and no body is sent.

function headRouteOnSendHandler(request, reply, payload, done) {
  if (payload === undefined || payload === null) {
    reply.header('content-length', '0');
    done(null, null);
    return;
  }
  if (typeof payload.resume === 'function') {
    payload.on('error', (err) => reply.log.error({ err }, 'Error on Stream found for HEAD route'));
    payload.resume();
    done(null, null);
    return;
  }
  if (typeof payload.getReader === 'function') {
    payload.cancel('Stream cancelled by HEAD route').catch((err) => {
      reply.log.error({ err }, 'Error on Stream found for HEAD route');
    });
    done(null, null);
    return;
  }
  reply.header('content-length', `${Buffer.byteLength(payload)}`);
  done(null, null);
}

function parseHeadOnSendHandlers(onSend) {
  if (onSend == null) return headRouteOnSendHandler;
  return Array.isArray(onSend) ? [...onSend, headRouteOnSendHandler] : [onSend, headRouteOnSendHandler];
}

module.exports = { parseHeadOnSendHandlers };

},
"@xufa/http/lib/health.js": function (module, exports, require) {
'use strict';

// The health of an app, for load balancers, Kubernetes and people: GET /health/live (the process answers: liveness),
// GET /health/ready (the app can serve: its critical checks pass, and it is not closing: readiness) and GET /health
// (every check, with its status, time, error and details). Checks are functions: a database (db.ping()), a queue, a
// pool of nodes, anything. They can run in the background (interval), as a status checker, telling when the status
// changes (onChange) and running a cure for a check down too long (heal).
//
//   app.register(xufa.health, {
//     checks: {
//       database: () => db.ping(),                                   // ms of a round trip; throws when it is down
//       queue: { check: async () => queue.counts(), critical: false }, // degraded, not down, when it fails
//     },
//     interval: '10s',
//     onChange: (status, previous, report) => alert(`The app is ${status}`),
//   });
const UNITS = { ms: 1, s: 1000, m: 60000, h: 3600000 };
function ms(value, what) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h)$/.exec(String(value).trim());
  if (!match) throw new TypeError(`health: ${what} '${value}' is not a duration (as '10s')`);
  return Number(match[1]) * UNITS[match[2]];
}

const STATUSES = new Set(['up', 'degraded', 'down']);

// The result of a check: what it gave (or threw) as { status, error?, details? }.
function resultOf(value) {
  if (value === undefined || value === true || value === null) return { status: 'up' };
  if (value === false) return { status: 'down' };
  if (typeof value === 'string') return { status: 'down', error: value };
  if (typeof value === 'object' && !Array.isArray(value) && STATUSES.has(value.status)) {
    const { status, error, ...details } = value;
    const result = { status };
    if (error !== undefined) result.error = String(error);
    if (Object.keys(details).length) result.details = details;
    return result;
  }
  return { status: 'up', details: value };
}

function withTimeout(promise, timeout, name) {
  if (!timeout) return promise;
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`The check ${name} took more than ${timeout} ms`)), timeout);
      if (typeof timer.unref === 'function') timer.unref();
    }),
  ]).finally(() => clearTimeout(timer));
}

class Health {
  constructor(options, log) {
    this.log = log;
    this.timeout = ms(options.timeout === undefined ? '2s' : options.timeout, 'timeout');
    this.cache = ms(options.cache === undefined ? '1s' : options.cache, 'cache');
    this.onChange = options.onChange || null;
    this.checks = new Map();
    for (const [name, given] of Object.entries(options.checks || {})) {
      const spec = typeof given === 'function' ? { check: given } : { ...given };
      if (typeof spec.check !== 'function') throw new TypeError(`health: the check ${name} is a function`);
      this.checks.set(name, {
        name,
        check: spec.check,
        critical: spec.critical !== false,
        timeout: spec.timeout === undefined ? this.timeout : ms(spec.timeout, `checks.${name}.timeout`),
        heal: spec.heal ? { after: ms(spec.heal.after, `checks.${name}.heal.after`), run: spec.heal.run } : null,
      });
    }
    this.results = {};
    this.status = this.checks.size ? null : 'up';
    this.checkedAt = 0;
    this.running = null;
    this.closing = false;
  }

  // Runs every check (one run at a time: those who ask meanwhile get its report).
  run() {
    if (!this.running) {
      this.running = this.runChecks().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  // The report, from the last run when it is newer than cache (or the checks run in the background).
  async current() {
    if (!this.checkedAt || Date.now() - this.checkedAt >= this.cache) await this.run();
    return this.report();
  }

  async runChecks() {
    const now = Date.now();
    await Promise.all(
      [...this.checks.values()].map(async (spec) => {
        const started = process.hrtime.bigint();
        let result;
        try {
          result = resultOf(await withTimeout(Promise.resolve().then(spec.check), spec.timeout, spec.name));
        } catch (err) {
          result = { status: 'down', error: err && err.message ? err.message : String(err) };
        }
        result.duration = Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100;
        const previous = this.results[spec.name];
        result.since = previous && previous.status === result.status ? previous.since : new Date(now).toISOString();
        result.critical = spec.critical;
        this.results[spec.name] = result;
        await this.heal(spec, result, previous, now);
      })
    );
    this.checkedAt = Date.now();
    const status = this.overall();
    if (status !== this.status) {
      const previous = this.status;
      this.status = status;
      if (previous !== null || status !== 'up') {
        const level = status === 'up' ? 'info' : 'warn';
        if (this.log && this.log[level]) this.log[level]({ health: status, previous }, `the app is ${status}`);
      }
      if (this.onChange) {
        try {
          await this.onChange(status, previous, this.report());
        } catch (err) {
          if (this.log && this.log.error) this.log.error({ err }, 'onChange of health failed');
        }
      }
    }
    return this.report();
  }

  // A cure for a check down longer than heal.after (as restarting what it checks): run once, and again after another
  // heal.after if it is still down.
  async heal(spec, result, previous, now) {
    if (!spec.heal) return;
    if (result.status !== 'down') {
      spec.downSince = null;
      return;
    }
    if (!spec.downSince) spec.downSince = previous && previous.status === 'down' ? Date.parse(previous.since) : now;
    if (now - spec.downSince < spec.heal.after) return;
    spec.downSince = now;
    try {
      await spec.heal.run(result);
      if (this.log && this.log.warn) this.log.warn({ check: spec.name }, `healing ${spec.name}`);
    } catch (err) {
      if (this.log && this.log.error) this.log.error({ err, check: spec.name }, `healing ${spec.name} failed`);
    }
  }

  // down when a critical check is down; degraded when another is, or one is degraded; up otherwise.
  overall() {
    let status = 'up';
    for (const result of Object.values(this.results)) {
      if (result.status === 'down' && result.critical) return 'down';
      if (result.status !== 'up') status = 'degraded';
    }
    return status;
  }

  report() {
    return {
      status: this.closing ? 'down' : this.status || 'up',
      ...(this.closing ? { closing: true } : {}),
      checks: { ...this.results },
      uptime: Math.round(process.uptime()),
      checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
    };
  }
}

function health(app, options, done) {
  const { prefix = '/health', interval = 0, details = true, logLevel = 'warn' } = options || {};
  let state;
  let every;
  try {
    state = new Health(options || {}, app.log);
    every = ms(interval, 'interval');
  } catch (err) {
    done(err);
    return;
  }
  const base = prefix.replace(/\/$/, '');
  const config = { maintenance: false };
  const statusCode = (report) => (report.status === 'down' ? 503 : 200);
  const shown = (report) => (details ? report : { status: report.status });

  app.decorate('health', {
    // Runs the checks now: the report.
    check: () => state.run(),
    // The report of the last run (null before the first).
    get report() {
      return state.checkedAt ? state.report() : null;
    },
    get status() {
      return state.closing ? 'down' : state.status;
    },
  });

  app.get(`${base}/live`, { logLevel, config }, async () => ({ status: 'up', uptime: Math.round(process.uptime()) }));
  app.get(`${base}/ready`, { logLevel, config }, async (request, reply) => {
    if (state.closing) return reply.code(503).send({ status: 'down', closing: true });
    const report = await state.current();
    return reply.code(statusCode(report)).send({ status: report.status });
  });
  app.get(base || '/', { logLevel, config }, async (request, reply) => {
    const report = state.closing ? state.report() : await state.current();
    return reply.code(statusCode(report)).send(shown(report));
  });

  let timer = null;
  if (every > 0) {
    app.addHook('onReady', async () => {
      await state.run();
      timer = setInterval(() => state.run().catch(() => {}), every);
      if (typeof timer.unref === 'function') timer.unref();
    });
  }
  // Closing: not ready any more (load balancers stop sending), while the requests in flight end.
  app.addHook('preClose', (closeDone) => {
    state.closing = true;
    clearInterval(timer);
    closeDone();
  });
  done();
}

health[Symbol.for('skip-override')] = true;
health[Symbol.for('fastify.display-name')] = 'xufa.health';

module.exports = { health, Health };

},
"@xufa/http/lib/hooks.js": function (module, exports, require) {
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

},
"@xufa/http/lib/logger.js": function (module, exports, require) {
// The logger of an instance (@xufa/logger, a logger instance given, or a logger that does nothing), the child
// logger of each request, and the LogController writing the lines of the framework itself.
const {
  XUFA_ERR_LOG_LOGGER_AND_LOGGER_INSTANCE_PROVIDED,
  XUFA_ERR_LOG_INVALID_LOGGER_CONFIG,
  XUFA_ERR_LOG_INVALID_LOGGER_INSTANCE,
  XUFA_ERR_LOG_INVALID_LOGGER,
  XUFA_ERR_LOG_INVALID_LOG_CONTROLLER,
  XUFA_ERR_LOG_INVALID_DESTINATION,
} = require('./errors');
const { kLogController } = require('./symbols');

// @xufa/logger is loaded when a logger is configured: instances without logging do not load it.
let loggerModule = null;
function loadLogger() {
  if (loggerModule === null) loggerModule = require('@xufa/logger'); // eslint-disable-line global-require
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

module.exports = {
  now,
  createInstanceLogger,
  createChildLogger,
  defaultChildLoggerFactory,
  createLogController,
  LogController,
  validateLogger,
  serializers,
};

},
"@xufa/http/lib/maintenance.js": function (module, exports, require) {
'use strict';

// The maintenance mode (as Laravel's php artisan down): while it is on, requests get a 503 (with Retry-After, a page
// for browsers and JSON for the rest), but the health routes, routes with config.maintenance: false, the addresses
// allowed, and the browsers that opened the secret path (a cookie) go through. xufa down turns it on: a file of this
// machine (.xufa/down.json), or with --everywhere a store every machine reads (maintenance(db) of @xufa/orm); xufa up
// turns it off.
//
//   app.register(xufa.maintenance, { store: maintenance(db) }); // the file, and the database
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
const COOKIE = 'xufa_maintenance';

// The state written in a file (xufa down): the file there is the mode on (an empty or broken one too).
function fileStore(file) {
  return {
    file,
    async get() {
      let text;
      try {
        text = await fs.promises.readFile(file, 'utf8');
      } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
      }
      try {
        const state = JSON.parse(text);
        return state && typeof state === 'object' ? state : {};
      } catch {
        return {};
      }
    },
  };
}

const bypassOf = (secret) => crypto.createHash('sha256').update(`xufa-maintenance:${secret}`).digest('hex');

function cookieOf(header, name) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

function page(state) {
  const message = state.message || 'We are making some changes. We will be back soon.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Down for maintenance</title><style>body{font:16px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f6f7f9;color:#222}main{max-width:32rem;padding:2rem;text-align:center}h1{font-size:1.5rem;margin:0 0 .5rem}@media (prefers-color-scheme:dark){body{background:#16181d;color:#e6e6e6}}</style></head><body><main><h1>Down for maintenance</h1><p>${escape(message)}</p></main></body></html>`;
}

function matches(url, patterns) {
  const pathname = url.split('?')[0];
  return patterns.some((pattern) =>
    pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern
  );
}

function maintenance(app, options, done) {
  const {
    file = path.join(process.cwd(), '.xufa', 'down.json'),
    store,
    refresh = 1000,
    except = ['/health', '/health/*'],
    render = null,
  } = options || {};
  const stores = [];
  if (file) stores.push(fileStore(file));
  for (const item of [].concat(store || [])) {
    if (!item || typeof item.get !== 'function') {
      done(new TypeError('maintenance: store is an object with get() (as maintenance(db) of @xufa/orm)'));
      return;
    }
    stores.push(item);
  }

  let cached = null;
  let readAt = 0;
  let reading = null;
  // The state (null: up), read at most every `refresh` ms. A store that fails counts as up: a broken store does not
  // take the app down.
  async function read() {
    for (const item of stores) {
      try {
        const state = await item.get();
        if (state) return state;
      } catch (err) {
        app.log.warn({ err }, 'the maintenance mode could not be read');
      }
    }
    return null;
  }
  function current() {
    if (Date.now() - readAt < refresh) return cached;
    if (!reading) {
      reading = read()
        .then((state) => {
          cached = state;
          readAt = Date.now();
          return state;
        })
        .finally(() => {
          reading = null;
        });
    }
    return reading;
  }

  app.decorate('maintenance', {
    // The state now (null when the app is up), read again.
    async state() {
      readAt = 0;
      return current();
    },
  });

  app.addHook('onRequest', async (request, reply) => {
    const state = await current();
    if (!state) return undefined;
    const config = request.routeOptions && request.routeOptions.config;
    if (config && config.maintenance === false) return undefined;
    if (matches(request.url, except)) return undefined;
    if (Array.isArray(state.allow) && state.allow.includes(request.ip)) return undefined;
    if (state.secret) {
      const bypass = bypassOf(state.secret);
      if (request.url.split('?')[0] === `/${state.secret}`) {
        const secure = request.protocol === 'https' ? '; Secure' : '';
        reply.header('set-cookie', `${COOKIE}=${bypass}; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200${secure}`);
        return reply.redirect(state.redirect || '/');
      }
      if (cookieOf(request.headers.cookie, COOKIE) === bypass) return undefined;
    }
    if (state.retryAfter) reply.header('retry-after', String(state.retryAfter));
    reply.code(503);
    if (/text\/html/.test(request.headers.accept || '')) {
      return reply.type('text/html; charset=utf-8').send(render ? render(state, request) : page(state));
    }
    return reply.send({
      statusCode: 503,
      error: 'Service Unavailable',
      message: state.message || 'The app is down for maintenance',
      ...(state.retryAfter ? { retryAfter: state.retryAfter } : {}),
    });
  });
  done();
}

maintenance[Symbol.for('skip-override')] = true;
maintenance[Symbol.for('fastify.display-name')] = 'xufa.maintenance';

module.exports = { maintenance, fileStore, bypassOf };

},
"@xufa/http/lib/noop-set.js": function (module, exports, require) {
// A Set-like object that keeps nothing, for when sockets do not have to be tracked.
module.exports = require('./server').noopSet;

},
"@xufa/http/lib/plugin-override.js": function (module, exports, require) {
// Encapsulation: each plugin runs with an instance of its own, made from the one registering it, unless it is
// marked to skip it (plugin() / fastify-plugin). Everything encapsulated is copied here.
const {
  kBoot,
  kChildren,
  kRoutePrefix,
  kLogLevel,
  kLogSerializers,
  kHooks,
  kSchemaController,
  kContentTypeParser,
  kReply,
  kRequest,
  kFourOhFour,
  kPluginNameChain,
  kErrorHandlerAlreadySet,
} = require('./symbols');
const Reply = require('./reply');
const Request = require('./request');
const SchemaController = require('./schema-controller');
const ContentTypeParser = require('./content-type-parser');
const { buildHooks } = require('./hooks');
const pluginUtils = require('./plugin-utils');

function buildRoutePrefix(instancePrefix, pluginPrefix) {
  if (!pluginPrefix) return instancePrefix;
  let prefix = pluginPrefix;
  // Exactly one '/' between the prefixes.
  if (instancePrefix.endsWith('/') && prefix[0] === '/') prefix = prefix.slice(1);
  else if (prefix[0] !== '/' && !instancePrefix.endsWith('/')) prefix = `/${prefix}`;
  return instancePrefix + prefix;
}

module.exports = function override(old, fn, opts) {
  const skip = pluginUtils.registerPlugin.call(old, fn);
  const fnName = pluginUtils.getPluginName(fn) || pluginUtils.getFuncPreview(fn);
  if (skip) {
    old[kPluginNameChain].push(fnName);
    return old;
  }
  const instance = Object.create(old);
  old[kChildren].push(instance);
  instance.ready = old[kBoot].bind(instance);
  instance[kChildren] = [];
  instance[kReply] = Reply.buildReply(instance[kReply]);
  instance[kRequest] = Request.buildRequest(instance[kRequest]);
  instance[kContentTypeParser] = ContentTypeParser.helpers.buildContentTypeParser(instance[kContentTypeParser]);
  instance[kHooks] = buildHooks(instance[kHooks]);
  instance[kRoutePrefix] = buildRoutePrefix(instance[kRoutePrefix], opts.prefix);
  instance[kLogLevel] = opts.logLevel || instance[kLogLevel];
  instance[kSchemaController] = SchemaController.buildSchemaController(old[kSchemaController]);
  instance.getSchema = instance[kSchemaController].getSchema.bind(instance[kSchemaController]);
  instance.getSchemas = instance[kSchemaController].getSchemas.bind(instance[kSchemaController]);
  // The plugins registered since the root (not the one being registered).
  instance[pluginUtils.kRegisteredPlugins] = Object.create(instance[pluginUtils.kRegisteredPlugins]);
  // The chain of plugin names since the root, extended by the plugins that skip encapsulation.
  instance[kPluginNameChain] = [fnName];
  instance[kErrorHandlerAlreadySet] = false;
  if (instance[kLogSerializers] || opts.logSerializers) {
    instance[kLogSerializers] = Object.assign(Object.create(instance[kLogSerializers]), opts.logSerializers);
  }
  if (opts.prefix) instance[kFourOhFour].arrange404(instance);
  for (const hook of instance[kHooks].onRegister) hook.call(old, instance, opts);
  return instance;
};

module.exports.buildRoutePrefix = buildRoutePrefix;

},
"@xufa/http/lib/plugin-utils.js": function (module, exports, require) {
// Checks of a plugin being registered: its metadata (name, version range, decorators and plugins it needs).
const semver = require('./semver');
const { kTestInternals } = require('./symbols');
const { exist, existReply, existRequest } = require('./decorate');
const {
  XUFA_ERR_PLUGIN_VERSION_MISMATCH,
  XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE,
  XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER,
  XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED,
} = require('./errors');

const kRegisteredPlugins = Symbol.for('registered-plugin');
const PRERELEASE = /-(?:rc|pre|alpha).+$/u;

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'ERR_ASSERTION';
    throw err;
  }
}

function getMeta(fn) {
  return fn[Symbol.for('plugin-meta')];
}

function getDisplayName(fn) {
  return fn[Symbol.for('fastify.display-name')] || fn[Symbol.for('xufa.display-name')];
}

// A name for a plugin: the one displayed, the file exporting it, or the name of the function.
function getPluginName(func) {
  const display = getDisplayName(func);
  if (display) return display;
  const cache = require.cache; // eslint-disable-line prefer-destructuring
  if (cache) {
    for (const key of Object.keys(cache)) {
      if (cache[key].exports === func) return key;
    }
  }
  return func.name || null;
}

function getFuncPreview(func) {
  return func
    .toString()
    .split('\n', 2)
    .map((line) => line.trim())
    .join(' -- ');
}

function shouldSkipOverride(fn) {
  return Boolean(fn[Symbol.for('skip-override')]);
}

function checkDependencies(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.dependencies) return;
  assert(Array.isArray(meta.dependencies), 'The dependencies should be an array of strings');
  for (const dependency of meta.dependencies) {
    if (!this[kRegisteredPlugins].includes(dependency)) {
      throw new XUFA_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED(dependency, meta.name);
    }
  }
}

const checks = { Xufa: exist, Request: existRequest, Reply: existReply };

function checkDecoratorList(that, kind, decorators, name) {
  assert(Array.isArray(decorators), 'The decorators should be an array of strings');
  const withName = typeof name === 'string' ? ` required by '${name}'` : '';
  for (const decorator of decorators) {
    if (!checks[kind].call(that, decorator)) {
      throw new XUFA_ERR_PLUGIN_NOT_PRESENT_IN_INSTANCE(decorator, withName, kind);
    }
  }
}

function checkDecorators(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.decorators) return;
  const { decorators, name } = meta;
  // Plugins written for fastify name the instance decorators "fastify".
  const instance = decorators.xufa || decorators.fastify;
  if (instance) checkDecoratorList(this, 'Xufa', instance, name);
  if (decorators.reply) checkDecoratorList(this, 'Reply', decorators.reply, name);
  if (decorators.request) checkDecoratorList(this, 'Request', decorators.request, name);
}

// The range of xufa versions a plugin declares (meta.xufa). Ranges of fastify versions are not checked.
function checkVersion(fn) {
  const meta = getMeta(fn);
  if (!meta || meta.xufa == null) return;
  const required = meta.xufa;
  const isPrerelease = PRERELEASE.test(this.version);
  // While a release candidate is tested, plugins of the previous versions load.
  if (isPrerelease && semver.gt(this.version, semver.coerce(required))) return;
  if (!semver.satisfies(this.version, required, { includePrerelease: isPrerelease })) {
    throw new XUFA_ERR_PLUGIN_VERSION_MISMATCH(meta.name, required, this.version);
  }
}

function registerPluginName(fn) {
  const meta = getMeta(fn);
  if (!meta || !meta.name) return undefined;
  this[kRegisteredPlugins].push(meta.name);
  return meta.name;
}

function checkPluginHealthiness(fn, name) {
  if (fn.constructor.name === 'AsyncFunction' && fn.length === 3) throw new XUFA_ERR_PLUGIN_INVALID_ASYNC_HANDLER(name);
}

// Returns whether the plugin runs in the instance registering it (not encapsulated).
function registerPlugin(fn) {
  const name = registerPluginName.call(this, fn) || getPluginName(fn);
  checkPluginHealthiness.call(this, fn, name);
  checkVersion.call(this, fn);
  checkDecorators.call(this, fn);
  checkDependencies.call(this, fn);
  return shouldSkipOverride(fn);
}

module.exports = { getPluginName, getFuncPreview, kRegisteredPlugins, getDisplayName, registerPlugin };
module.exports[kTestInternals] = { shouldSkipOverride, getMeta, checkDecorators, checkDependencies };

},
"@xufa/http/lib/plugin.js": function (module, exports, require) {
// plugin(fn, options): marks a plugin to run in the instance registering it (no encapsulation), with its metadata
// (name, the xufa versions it needs, decorators and plugins it depends on). What fastify-plugin does.
const { XUFA_ERR_PLUGIN_NOT_VALID } = require('./errors');

let count = 0;

// The name of the file calling plugin() ("plugin.2.test" for plugin.2.test.js), for plugins without a name.
function callerFileName() {
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 10;
  const { stack } = new Error();
  Error.stackTraceLimit = limit;
  // 0: Error, 1: callerFileName, 2: plugin, 3: its caller
  const frame = (stack || '').split('\n')[3] || '';
  const location = /\(([^()]+)\)\s*$/.exec(frame) || /at\s+(\S+)\s*$/.exec(frame);
  if (!location) return 'anonymous';
  const file = location[1].split(/[/\\]/).pop();
  const match = /(\w*(?:\.\w*)*)\..*/.exec(file);
  return match ? match[1] : 'anonymous';
}

function plugin(fn, options = {}) {
  let func = fn;
  if (func && typeof func.default === 'function' && typeof func !== 'function') func = func.default;
  if (typeof func !== 'function') {
    throw new XUFA_ERR_PLUGIN_NOT_VALID(`plugin expects a function, instead got a '${typeof func}'`);
  }
  const opts = typeof options === 'string' ? { xufa: options } : { ...options };
  if (opts.encapsulate !== true) func[Symbol.for('skip-override')] = true;
  const name = opts.name || func.name || `${callerFileName()}-auto-${count++}`;
  func[Symbol.for('xufa.display-name')] = name;
  func[Symbol.for('fastify.display-name')] = name;
  func[Symbol.for('plugin-meta')] = { ...opts, name };
  // Bundlers and TypeScript may give the module object: the plugin is its default export too.
  if (!func.default) func.default = func;
  return func;
}

module.exports = plugin;

},
"@xufa/http/lib/proxy-addr.js": function (module, exports, require) {
// The addresses a request went through (its socket and X-Forwarded-For), and which of them are trusted proxies:
// what proxy-addr does for the trustProxy option.

const NAMES = {
  linklocal: ['169.254.0.0/16', 'fe80::/10'],
  loopback: ['127.0.0.1/8', '::1/128'],
  uniquelocal: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', 'fc00::/7'],
};

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

// [kind, bytes] of an address, or null: 4 bytes for IPv4, 16 for IPv6.
function parseIp(address) {
  if (typeof address !== 'string') return null;
  let text = address.trim();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const v4 = IPV4.exec(text);
  if (v4) {
    const bytes = v4.slice(1).map(Number);
    return bytes.every((b) => b <= 255) ? { kind: 'ipv4', bytes } : null;
  }
  return parseIpv6(text);
}

function parseIpv6(text) {
  if (text.indexOf(':') === -1) return null;
  let head = text;
  let tailV4 = null;
  const lastColon = head.lastIndexOf(':');
  if (head.indexOf('.', lastColon) !== -1) {
    tailV4 = parseIp(head.slice(lastColon + 1));
    if (tailV4 === null || tailV4.kind !== 'ipv4') return null;
    head = `${head.slice(0, lastColon + 1)}0:0`;
  }
  const double = head.indexOf('::');
  if (double !== head.lastIndexOf('::')) return null;
  let groups;
  if (double !== -1) {
    const left = head.slice(0, double) ? head.slice(0, double).split(':') : [];
    const right = head.slice(double + 2) ? head.slice(double + 2).split(':') : [];
    const missing = 8 - left.length - right.length;
    if (missing < 1) return null;
    groups = [...left, ...new Array(missing).fill('0'), ...right];
  } else {
    groups = head.split(':');
  }
  if (groups.length !== 8) return null;
  const bytes = [];
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push(value >> 8, value & 0xff);
  }
  if (tailV4) bytes.splice(12, 4, ...tailV4.bytes);
  return { kind: 'ipv6', bytes };
}

function isIpv4Mapped(ip) {
  if (ip.kind !== 'ipv6') return false;
  for (let i = 0; i < 10; i += 1) if (ip.bytes[i] !== 0) return false;
  return ip.bytes[10] === 0xff && ip.bytes[11] === 0xff;
}

function toIpv4(ip) {
  return { kind: 'ipv4', bytes: ip.bytes.slice(12) };
}

function prefixLengthOfMask(mask) {
  let bits = 0;
  let ended = false;
  for (const byte of mask.bytes) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      if (byte & (1 << bit)) {
        if (ended) return null;
        bits += 1;
      } else {
        ended = true;
      }
    }
  }
  return bits;
}

// A trusted range: [ip, prefix length].
function parseRange(note) {
  const slash = note.lastIndexOf('/');
  const text = slash === -1 ? note : note.slice(0, slash);
  let ip = parseIp(text);
  if (ip === null) throw new TypeError(`invalid IP address: ${text}`);
  const max = ip.kind === 'ipv4' ? 32 : 128;
  let bits = max;
  if (slash !== -1) {
    const rangeText = note.slice(slash + 1);
    if (/^\d+$/.test(rangeText)) {
      bits = Number(rangeText);
    } else {
      const mask = parseIp(rangeText);
      bits = mask !== null && mask.kind === 'ipv4' && ip.kind === 'ipv4' ? prefixLengthOfMask(mask) : null;
    }
    if (bits === null || bits <= 0 || bits > max) throw new TypeError(`invalid range on address: ${note}`);
  }
  if (isIpv4Mapped(ip) && bits >= 96) {
    ip = toIpv4(ip);
    bits -= 96;
  }
  return [ip, bits];
}

function matchesPrefix(ip, range, bits) {
  const full = bits >> 3;
  for (let i = 0; i < full; i += 1) if (ip.bytes[i] !== range.bytes[i]) return false;
  const rest = bits & 7;
  if (rest === 0) return true;
  const mask = (0xff << (8 - rest)) & 0xff;
  return (ip.bytes[full] & mask) === (range.bytes[full] & mask);
}

function matches(address, ranges) {
  const ip = parseIp(address);
  if (ip === null) return false;
  for (const [range, bits] of ranges) {
    let candidate = ip;
    if (ip.kind !== range.kind) {
      if (range.kind === 'ipv4' && isIpv4Mapped(ip)) candidate = toIpv4(ip);
      else if (range.kind === 'ipv6' && ip.kind === 'ipv4') {
        candidate = { kind: 'ipv6', bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff, ...ip.bytes] };
      } else continue;
    }
    if (matchesPrefix(candidate, range, bits)) return true;
  }
  return false;
}

// A function (address, index) => boolean telling whether a hop is trusted.
function compile(value) {
  if (!value) throw new TypeError('argument is required');
  const notes = typeof value === 'string' ? [value] : [...value];
  const expanded = [];
  for (const note of notes) {
    if (Object.prototype.hasOwnProperty.call(NAMES, note)) expanded.push(...NAMES[note]);
    else expanded.push(note);
  }
  const ranges = expanded.map(parseRange);
  if (ranges.length === 0) return () => false;
  return (address) => matches(address, ranges);
}

// The addresses of a request: its socket first, then X-Forwarded-For from the closest proxy.
function forwarded(req) {
  const socketAddress = req.socket ? req.socket.remoteAddress : undefined;
  const addresses = [socketAddress];
  const header = req.headers['x-forwarded-for'];
  if (header) {
    const list = String(header).split(',');
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const entry = list[i].trim();
      if (entry !== '') addresses.push(entry);
    }
  }
  return addresses;
}

// The addresses up to the first untrusted one.
function all(req, trust) {
  const addresses = forwarded(req);
  if (!trust) return addresses;
  const fn = typeof trust === 'function' ? trust : compile(trust);
  for (let i = 0; i < addresses.length - 1; i += 1) {
    if (!fn(addresses[i], i)) {
      addresses.length = i + 1;
      break;
    }
  }
  return addresses;
}

module.exports = { compile, all, forwarded, parseIp };

},
"@xufa/http/lib/querystring.js": function (module, exports, require) {
// Parsing of query strings: a=1&b=2&a=3 -> { a: ['1', '3'], b: '2' }. '+' is a space, %XX sequences are decoded
// (and kept as written when malformed). Keys and values are only decoded when they have a '%' or a '+'.

function NullObject() {}
NullObject.prototype = Object.create(null);

// The value of the hexadecimal digits by character code, -1 for other characters.
const HEX = new Int8Array(128).fill(-1);
for (let i = 0; i < 10; i += 1) HEX[48 + i] = i;
for (let i = 0; i < 6; i += 1) {
  HEX[65 + i] = 10 + i;
  HEX[97 + i] = 10 + i;
}

// The byte written as %XX at index i (of the '%'), or -1.
function byteAt(text, i) {
  const high = text.charCodeAt(i + 1);
  const low = text.charCodeAt(i + 2);
  if (high > 127 || low > 127) return -1;
  const h = HEX[high];
  const l = HEX[low];
  return h === -1 || l === -1 ? -1 : (h << 4) | l;
}

// What decodeURIComponent gives, or null where it throws (malformed sequences, invalid UTF-8): faster for the short
// strings of query strings, and without the cost of an exception for malformed ones.
function decodeComponent(text) {
  let i = text.indexOf('%');
  if (i === -1) return text;
  const length = text.length;
  let out = '';
  let last = 0;
  while (i !== -1) {
    if (i + 2 >= length) return null;
    const first = byteAt(text, i);
    let codePoint;
    let continuation;
    if (first < 0) return null;
    if (first < 0x80) {
      codePoint = first;
      continuation = 0;
    } else if (first >= 0xc2 && first <= 0xdf) {
      codePoint = first & 0x1f;
      continuation = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      codePoint = first & 0x0f;
      continuation = 2;
    } else if (first >= 0xf0 && first <= 0xf4) {
      codePoint = first & 0x07;
      continuation = 3;
    } else {
      return null;
    }
    out += text.slice(last, i);
    i += 3;
    for (let k = 0; k < continuation; k += 1) {
      if (i + 2 >= length || text.charCodeAt(i) !== 37) return null;
      const byte = byteAt(text, i);
      if (byte < 0 || (byte & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (byte & 0x3f);
      i += 3;
    }
    // Overlong forms, surrogates and code points beyond Unicode are invalid UTF-8.
    if (continuation === 2 && (codePoint < 0x800 || (codePoint >= 0xd800 && codePoint <= 0xdfff))) return null;
    if (continuation === 3 && (codePoint < 0x10000 || codePoint > 0x10ffff)) return null;
    out += codePoint < 0x10000 ? String.fromCharCode(codePoint) : String.fromCodePoint(codePoint);
    last = i;
    i = text.indexOf('%', i);
  }
  return last === length ? out : out + text.slice(last);
}

function decode(value, hasPlus, hasPercent) {
  const out = hasPlus ? value.replace(/\+/g, ' ') : value;
  if (!hasPercent) return out;
  // Kept as written when malformed.
  const decoded = decodeComponent(out);
  return decoded === null ? out : decoded;
}

function parse(input) {
  const result = new NullObject();
  const length = input.length;
  if (length === 0) return result;
  let start = 0;
  let equal = -1;
  let keyPlus = false;
  let keyPercent = false;
  let valuePlus = false;
  let valuePercent = false;
  for (let i = 0; i <= length; i += 1) {
    const code = i === length ? 38 : input.charCodeAt(i);
    if (code === 38) {
      // &
      if (i > start) {
        let key;
        let value;
        if (equal === -1) {
          key = input.slice(start, i);
          value = '';
        } else {
          key = input.slice(start, equal);
          value = input.slice(equal + 1, i);
        }
        if (keyPlus || keyPercent) key = decode(key, keyPlus, keyPercent);
        if (valuePlus || valuePercent) value = decode(value, valuePlus, valuePercent);
        if (key.length > 0 || equal !== -1) {
          const existing = result[key];
          if (existing === undefined) result[key] = value;
          else if (typeof existing === 'string') result[key] = [existing, value];
          else existing.push(value);
        }
      }
      start = i + 1;
      equal = -1;
      keyPlus = false;
      keyPercent = false;
      valuePlus = false;
      valuePercent = false;
    } else if (code === 61) {
      // =
      if (equal === -1) equal = i;
    } else if (code === 43) {
      // +
      if (equal === -1) keyPlus = true;
      else valuePlus = true;
    } else if (code === 37) {
      // %
      if (equal === -1) keyPercent = true;
      else valuePercent = true;
    }
  }
  return result;
}

function encodeValue(value) {
  if (typeof value === 'string') return encodeURIComponent(value);
  if (typeof value === 'number' || typeof value === 'bigint') return Number.isFinite(Number(value)) ? `${value}` : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function stringify(object) {
  const parts = [];
  for (const key of Object.keys(object)) {
    const value = object[key];
    const name = encodeURIComponent(key);
    if (Array.isArray(value)) for (const item of value) parts.push(`${name}=${encodeValue(item)}`);
    else parts.push(`${name}=${encodeValue(value)}`);
  }
  return parts.join('&');
}

module.exports = { parse, stringify, decodeComponent, NullObject };

},
"@xufa/http/lib/reply.js": function (module, exports, require) {
// The reply of a request: status, headers, serialization of the payload, onSend hooks and writing the response.
const { finished } = require('node:stream');
const {
  kFourOhFourContext,
  kReplyErrorHandlerCalled,
  kReplyHijacked,
  kReplyStartTime,
  kReplyEndTime,
  kReplySerializer,
  kReplySerializerDefault,
  kReplyIsError,
  kReplyHeaders,
  kReplyTrailers,
  kReplyHasStatusCode,
  kReplyIsRunningOnErrorHook,
  kReplyNextErrorHandler,
  kSchemaResponse,
  kReplyCacheSerializeFns,
  kSchemaController,
  kOptions,
  kRouteContext,
  kTimeoutTimer,
  kOnAbort,
  kRequestResponse,
  kRequestSignal,
  kLogController,
} = require('./symbols');
const { onSendHookRunner, onResponseHookRunner, preHandlerHookRunner, preSerializationHookRunner } = require('./hooks');
const { handleError } = require('./error-handler');
const { getSchemaSerializer } = require('./schemas');
const { fastHead } = require('./fast-head');
const {
  XUFA_ERR_REP_INVALID_PAYLOAD_TYPE,
  XUFA_ERR_REP_RESPONSE_BODY_CONSUMED,
  XUFA_ERR_REP_READABLE_STREAM_LOCKED,
  XUFA_ERR_REP_ALREADY_SENT,
  XUFA_ERR_SEND_INSIDE_ONERR,
  XUFA_ERR_BAD_STATUS_CODE,
  XUFA_ERR_BAD_TRAILER_NAME,
  XUFA_ERR_BAD_TRAILER_VALUE,
  XUFA_ERR_MISSING_SERIALIZATION_FN,
  XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN,
  XUFA_ERR_DEC_UNDECLARED,
} = require('./errors');
const decorators = require('./decorate');
const ContentType = require('./content-type');

const JSON_TYPE = 'application/json; charset=utf-8';
const TEXT_TYPE = 'text/plain; charset=utf-8';
const OCTET_TYPE = 'application/octet-stream';
const HTTP2_WRITE_CHUNK_SIZE = 64 * 1024;
const toString = Object.prototype.toString;

// handle-request.js requires this module: its functions are read when they are needed.
let handleRequestInternals = null;
function internals() {
  if (handleRequestInternals === null) handleRequestInternals = require('./handle-request').internals; // eslint-disable-line global-require
  return handleRequestInternals;
}

function now() {
  return performance.now();
}

// The listener of the abort signal of a request (lib/request.js onClientGone): on its response, or on itself.
function removeAbortListener(request) {
  const listener = request[kOnAbort];
  if (request[kRequestResponse]) request[kRequestResponse].removeListener('close', listener);
  request.raw.removeListener('close', listener);
  request[kOnAbort] = null;
}

function Reply(res, request, log) {
  this.raw = res;
  this[kReplySerializer] = null;
  this[kReplyErrorHandlerCalled] = false;
  this[kReplyIsError] = false;
  this[kReplyIsRunningOnErrorHook] = false;
  this.request = request;
  if (request) request[kRequestResponse] = res;
  this[kReplyHeaders] = {};
  this[kReplyTrailers] = null;
  this[kReplyHasStatusCode] = false;
  this[kReplyStartTime] = undefined;
  this.log = log;
}
Reply.props = [];
Reply.instanceProperties = new Set(['raw', 'request', 'log']);

Object.defineProperties(Reply.prototype, {
  [kRouteContext]: {
    get() {
      return this.request[kRouteContext];
    },
  },
  elapsedTime: {
    get() {
      if (this[kReplyStartTime] === undefined) return 0;
      return (this[kReplyEndTime] || now()) - this[kReplyStartTime];
    },
  },
  mediaType: {
    get() {
      return ContentType.from(this.getHeader('content-type')).mediaType;
    },
  },
  server: {
    get() {
      return this.request[kRouteContext].server;
    },
  },
  sent: {
    enumerable: true,
    get() {
      return (this[kReplyHijacked] || this.raw.writableEnded) === true;
    },
  },
  statusCode: {
    get() {
      return this.raw.statusCode;
    },
    set(value) {
      this.code(value);
    },
  },
  routeOptions: {
    get() {
      return this.request.routeOptions;
    },
  },
});

Reply.prototype.writeEarlyHints = function writeEarlyHints(hints, callback) {
  this.raw.writeEarlyHints(hints, callback);
  return this;
};

Reply.prototype.hijack = function hijack() {
  this[kReplyHijacked] = true;
  // A hijacked reply manages its own lifecycle: no handler timeout, no abort signal, no socket metadata.
  const { request } = this;
  if (request[kRequestSignal]) {
    clearTimeout(request[kTimeoutTimer]);
    request[kTimeoutTimer] = null;
    if (request[kOnAbort]) {
      removeAbortListener(request);
    }
  }
  const socket = request.raw.socket;
  if (socket && socket._meta && socket._meta.request === request) {
    socket.removeListener('timeout', socket._meta.onTimeout);
    socket._meta = null;
  }
  return this;
};

Reply.prototype.send = function send(payload) {
  if (this[kReplyIsRunningOnErrorHook]) throw new XUFA_ERR_SEND_INSIDE_ONERR();
  if (this.sent === true) {
    this.log.warn({ err: new XUFA_ERR_REP_ALREADY_SENT(this.request.url, this.request.method) });
    return this;
  }
  if (this[kReplyIsError] || payload instanceof Error) {
    this[kReplyIsError] = false;
    onErrorHook(this, payload, onSendHook);
    return this;
  }
  if (payload === undefined) {
    onSendHook(this, payload);
    return this;
  }
  const headers = this[kReplyHeaders];
  // Most replies have no content type set: then there is nothing to parse. An invalid one counts as none.
  let contentType = null;
  let hasContentType = false;
  if (headers['content-type'] !== undefined || this.raw.hasHeader('content-type')) {
    contentType = ContentType.from(this.getHeader('content-type'));
    hasContentType = contentType.isEmpty === false;
  }

  if (payload !== null) {
    if (typeof payload === 'string') {
      if (!hasContentType) {
        headers['content-type'] = TEXT_TYPE;
        onSendHook(this, payload);
        return this;
      }
    } else if (
      typeof payload.pipe === 'function' ||
      typeof payload.getReader === 'function' ||
      (typeof payload === 'object' && toString.call(payload) === '[object Response]')
    ) {
      onSendHook(this, payload);
      return this;
    } else if (payload.buffer instanceof ArrayBuffer) {
      if (!hasContentType) headers['content-type'] = OCTET_TYPE;
      const buffer = Buffer.isBuffer(payload)
        ? payload
        : Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
      onSendHook(this, buffer);
      return this;
    }
  }

  if (this[kReplySerializer] !== null) {
    if (typeof payload !== 'string') {
      preSerializationHook(this, payload);
      return this;
    }
    onSendHook(this, this[kReplySerializer](payload));
    return this;
  }

  if (!hasContentType) {
    headers['content-type'] = JSON_TYPE;
  } else {
    // Any JSON media type (application/hal+json...): serialized, with a charset when it has none.
    if (contentType.mediaType.indexOf('json') === -1) {
      onSendHook(this, payload);
      return this;
    }
    if (!contentType.parameters.has('charset')) headers['content-type'] = `${contentType.toString()}; charset=utf-8`;
  }
  if (typeof payload !== 'string') {
    preSerializationHook(this, payload);
    return this;
  }
  onSendHook(this, payload);
  return this;
};

Reply.prototype.getHeader = function getHeader(key) {
  const name = key.toLowerCase();
  const value = this[kReplyHeaders][name];
  return value !== undefined ? value : this.raw.getHeader(name);
};

Reply.prototype.getHeaders = function getHeaders() {
  return { ...this.raw.getHeaders(), ...this[kReplyHeaders] };
};

Reply.prototype.hasHeader = function hasHeader(key) {
  const name = key.toLowerCase();
  return this[kReplyHeaders][name] !== undefined || this.raw.hasHeader(name);
};

Reply.prototype.removeHeader = function removeHeader(key) {
  const name = key.toLowerCase();
  delete this[kReplyHeaders][name];
  if (!this.raw.headersSent) this.raw.removeHeader(name);
  return this;
};

Reply.prototype.header = function header(key, value = '') {
  const name = key.toLowerCase();
  const headers = this[kReplyHeaders];
  if (name === 'set-cookie') {
    // Cookies add up (RFC 7230 §3.2.2), including the ones set on the raw response.
    let current = headers[name];
    if (current === undefined && this.raw.hasHeader(name)) current = this.raw.getHeader(name);
    if (current !== undefined) {
      const list = Array.isArray(current) ? current.slice() : [current];
      if (Array.isArray(value)) list.push(...value);
      else list.push(value);
      headers[name] = list;
    } else {
      headers[name] = Array.isArray(value) ? value.slice() : value;
    }
  } else {
    headers[name] = value;
  }
  return this;
};

Reply.prototype.headers = function setHeaders(headers) {
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i += 1) this.header(keys[i], headers[keys[i]]);
  return this;
};

// https://datatracker.ietf.org/doc/html/rfc7230#section-4.1.2
const INVALID_TRAILERS = new Set([
  'transfer-encoding',
  'content-length',
  'host',
  'cache-control',
  'max-forwards',
  'te',
  'authorization',
  'set-cookie',
  'content-encoding',
  'content-type',
  'content-range',
  'trailer',
]);

Reply.prototype.trailer = function trailer(key, fn) {
  const name = key.toLowerCase();
  if (INVALID_TRAILERS.has(name)) throw new XUFA_ERR_BAD_TRAILER_NAME(name);
  if (typeof fn !== 'function') throw new XUFA_ERR_BAD_TRAILER_VALUE(name, typeof fn);
  if (this[kReplyTrailers] === null) this[kReplyTrailers] = {};
  this[kReplyTrailers][name] = fn;
  return this;
};

Reply.prototype.hasTrailer = function hasTrailer(key) {
  return this[kReplyTrailers] !== null && this[kReplyTrailers][key.toLowerCase()] !== undefined;
};

Reply.prototype.removeTrailer = function removeTrailer(key) {
  if (this[kReplyTrailers] === null) return this;
  this[kReplyTrailers][key.toLowerCase()] = undefined;
  return this;
};

Reply.prototype.code = function code(value) {
  const statusCode = +value;
  if (!(statusCode >= 100 && statusCode <= 599)) throw new XUFA_ERR_BAD_STATUS_CODE(value || String(value));
  this.raw.statusCode = statusCode;
  this[kReplyHasStatusCode] = true;
  return this;
};

Reply.prototype.status = Reply.prototype.code;

Reply.prototype.getSerializationFunction = function getSerializationFunction(schemaOrStatus, contentType) {
  const context = this[kRouteContext];
  if (typeof schemaOrStatus === 'string' || typeof schemaOrStatus === 'number') {
    const byStatus = context[kSchemaResponse] && context[kSchemaResponse][schemaOrStatus];
    if (typeof contentType === 'string') return byStatus && byStatus[contentType];
    return byStatus;
  }
  if (typeof schemaOrStatus === 'object') {
    return context[kReplyCacheSerializeFns] ? context[kReplyCacheSerializeFns].get(schemaOrStatus) : undefined;
  }
  return undefined;
};

Reply.prototype.compileSerializationSchema = function compileSerializationSchema(schema, httpStatus, contentType) {
  const { request } = this;
  const context = this[kRouteContext];
  if (context[kReplyCacheSerializeFns] && context[kReplyCacheSerializeFns].has(schema)) {
    return context[kReplyCacheSerializeFns].get(schema);
  }
  const controller = this.server[kSchemaController];
  let compiler = context.serializerCompiler || controller.serializerCompiler;
  if (!compiler) {
    controller.setupSerializer(this.server[kOptions]);
    compiler = controller.serializerCompiler;
  }
  const input = { schema, method: request.method, url: request.url };
  if (httpStatus !== undefined) input.httpStatus = httpStatus;
  if (contentType !== undefined) input.contentType = contentType;
  const serializeFn = compiler(input);
  if (context[kReplyCacheSerializeFns] == null) context[kReplyCacheSerializeFns] = new WeakMap();
  context[kReplyCacheSerializeFns].set(schema, serializeFn);
  return serializeFn;
};

Reply.prototype.serializeInput = function serializeInput(input, schema, httpStatusArg, contentTypeArg) {
  const possibleContentType = httpStatusArg;
  const httpStatus = typeof schema === 'string' || typeof schema === 'number' ? schema : httpStatusArg;
  const contentType = httpStatus && possibleContentType !== httpStatus ? possibleContentType : contentTypeArg;
  const context = this[kRouteContext];
  let serialize;
  if (httpStatus != null) {
    const byStatus = context[kSchemaResponse] && context[kSchemaResponse][httpStatus];
    serialize = contentType != null ? byStatus && byStatus[contentType] : byStatus;
    if (serialize == null) {
      if (contentType) throw new XUFA_ERR_MISSING_CONTENTTYPE_SERIALIZATION_FN(httpStatus, contentType);
      throw new XUFA_ERR_MISSING_SERIALIZATION_FN(httpStatus);
    }
  } else if (context[kReplyCacheSerializeFns] && context[kReplyCacheSerializeFns].has(schema)) {
    serialize = context[kReplyCacheSerializeFns].get(schema);
  } else {
    serialize = this.compileSerializationSchema(schema, httpStatus, contentType);
  }
  return serialize(input);
};

Reply.prototype.serialize = function serializePayload(payload) {
  if (this[kReplySerializer] !== null) return this[kReplySerializer](payload);
  const context = this[kRouteContext];
  if (context && context[kReplySerializerDefault])
    return context[kReplySerializerDefault](payload, this.raw.statusCode);
  return serialize(context, payload, this.raw.statusCode);
};

Reply.prototype.serializer = function setSerializer(fn) {
  this[kReplySerializer] = fn;
  return this;
};

Reply.prototype.type = function type(value) {
  this[kReplyHeaders]['content-type'] = value;
  return this;
};

Reply.prototype.redirect = function redirect(url, statusCode) {
  let code = statusCode;
  if (!code) code = this[kReplyHasStatusCode] ? this.raw.statusCode : 302;
  return this.header('location', url).code(code).send();
};

Reply.prototype.callNotFound = function callNotFound() {
  notFound(this);
  return this;
};

// A reply is a thenable: `await reply` waits for the response to be written.
Reply.prototype.then = function then(fulfilled, rejected) {
  if (this.sent) {
    fulfilled();
    return;
  }
  finished(this.raw, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      if (rejected) rejected(err);
      else if (this.log) this.log.warn('unhandled rejection on reply.then');
    } else {
      fulfilled();
    }
  });
};

function assertReplyDecoration(reply, name) {
  if (!decorators.hasKey(reply, name) && !decorators.exist(reply, name))
    throw new XUFA_ERR_DEC_UNDECLARED(name, 'reply');
}

Reply.prototype.getDecorator = function getDecorator(name) {
  assertReplyDecoration(this, name);
  const decorator = this[name];
  return typeof decorator === 'function' ? decorator.bind(this) : decorator;
};

Reply.prototype.setDecorator = function setDecorator(name, value) {
  assertReplyDecoration(this, name);
  this[name] = value;
};

function preSerializationHook(reply, payload) {
  const hooks = reply[kRouteContext].preSerialization;
  if (hooks !== null) preSerializationHookRunner(hooks, reply.request, reply, payload, preSerializationHookEnd);
  else preSerializationHookEnd(null, undefined, reply, payload);
}

function preSerializationHookEnd(err, request, reply, payload) {
  if (err != null) {
    onErrorHook(reply, err);
    return;
  }
  let serialized;
  try {
    const context = reply[kRouteContext];
    if (reply[kReplySerializer] !== null) {
      serialized = reply[kReplySerializer](payload);
    } else if (context && context[kReplySerializerDefault]) {
      serialized = context[kReplySerializerDefault](payload, reply.raw.statusCode);
    } else {
      // Without onSend hooks (which are given a string) the JSON may be bytes, sent as they are.
      serialized = serialize(
        context,
        payload,
        reply.raw.statusCode,
        reply[kReplyHeaders]['content-type'],
        context.onSend === null
      );
    }
  } catch (e) {
    e.serialization = reply[kRouteContext].config;
    onErrorHook(reply, e);
    return;
  }
  onSendHook(reply, serialized);
}

function onSendHook(reply, payload) {
  const hooks = reply[kRouteContext].onSend;
  if (hooks !== null) onSendHookRunner(hooks, reply.request, reply, payload, wrapOnSendEnd);
  else onSendEnd(reply, payload);
}

function wrapOnSendEnd(err, request, reply, payload) {
  if (err != null) onErrorHook(reply, err);
  else onSendEnd(reply, payload);
}

function safeWriteHead(reply, statusCode) {
  try {
    reply.raw.writeHead(statusCode, reply[kReplyHeaders]);
  } catch (err) {
    if (err.code === 'ERR_HTTP_HEADERS_SENT') {
      reply.log.warn(
        `Reply was already sent, did you forget to "return reply" in the "${reply.request.raw.url}" (${reply.request.raw.method}) route?`
      );
    }
    throw err;
  }
}

function onSendEnd(reply, payloadArg) {
  let payload = payloadArg;
  const res = reply.raw;
  const req = reply.request;
  const headers = reply[kReplyHeaders];

  if (reply[kReplyTrailers] !== null) {
    let trailerNames = '';
    for (const name of Object.keys(reply[kReplyTrailers])) {
      if (typeof reply[kReplyTrailers][name] === 'function') trailerNames += ` ${name}`;
    }
    if (trailerNames !== '') {
      // HTTP/1 sends trailers with chunked encoding; HTTP/2 has them natively.
      if (!isHttp2Reply(reply)) headers['transfer-encoding'] = 'chunked';
      headers.trailer = trailerNames.trim();
    } else {
      reply[kReplyTrailers] = null;
    }
  }

  // A Response gives the status, the headers and a body (a ReadableStream or null).
  if (payload != null && typeof payload === 'object' && toString.call(payload) === '[object Response]') {
    if (typeof payload.status === 'number') reply.code(payload.status);
    if (typeof payload.headers === 'object' && typeof payload.headers.forEach === 'function') {
      for (const [name, value] of payload.headers) reply.header(name, value);
    }
    if (payload.body !== null && payload.bodyUsed) throw new XUFA_ERR_REP_RESPONSE_BODY_CONSUMED();
    payload = payload.body;
  }

  const { statusCode } = res;
  if (payload === undefined || payload === null) {
    // No Content-Length for 1xx, 204 and 304 responses, nor alongside Transfer-Encoding; HEAD keeps its own.
    if (
      statusCode >= 200 &&
      statusCode !== 204 &&
      statusCode !== 304 &&
      req.method !== 'HEAD' &&
      reply[kReplyTrailers] === null
    ) {
      headers['content-length'] = '0';
    }
    writeHead(reply, statusCode);
    sendTrailer(payload, res, reply);
    return;
  }

  // Responses that have no content (RFC 9110 §6.4.1, §15.3.6, §15.4.5): no body, no Content-Type or Length.
  if ((statusCode >= 100 && statusCode < 200) || statusCode === 204 || statusCode === 205 || statusCode === 304) {
    if (statusCode !== 304) reply.removeHeader('content-type');
    reply.removeHeader('content-length');
    if (statusCode === 205) headers['content-length'] = '0';
    writeHead(reply, statusCode);
    sendTrailer(undefined, res, reply);
    if (typeof payload.resume === 'function') {
      payload.on('error', noop);
      payload.resume();
    }
    return;
  }

  if (typeof payload.pipe === 'function') {
    sendStream(payload, res, reply);
    return;
  }
  if (typeof payload.getReader === 'function') {
    sendWebStream(payload, res, reply);
    return;
  }
  if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) {
    throw new XUFA_ERR_REP_INVALID_PAYLOAD_TYPE(typeof payload);
  }

  if (reply[kReplyTrailers] === null) {
    const contentLength = headers['content-length'];
    if (contentLength === undefined) {
      headers['content-length'] = `${typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length}`;
    } else if (req.raw.method !== 'HEAD') {
      const length = typeof payload === 'string' ? Buffer.byteLength(payload) : payload.length;
      if (Number(contentLength) !== length) headers['content-length'] = `${length}`;
    }
  }
  writeHead(reply, statusCode);
  writePayload(payload, res, reply);
}

// The head of a response: written by xufa when it can (lib/fast-head.js), by Node's writeHead() otherwise. Either way
// it is sent with the first write of the body, or by end().
function writeHead(reply, statusCode) {
  const context = reply[kRouteContext];
  if (context && context.fastHead === true && reply[kReplyTrailers] === null) {
    const headers = reply[kReplyHeaders];
    const length = headers['content-length'];
    if (fastHead(reply.raw, reply.request.raw, statusCode, headers, length === undefined ? null : length)) return;
  }
  safeWriteHead(reply, statusCode);
}

function isHttp2Reply(reply) {
  return reply.request.raw && reply.request.raw.httpVersionMajor === 2;
}

function writePayload(payload, res, reply) {
  if (!isHttp2Reply(reply) || Buffer.byteLength(payload) <= HTTP2_WRITE_CHUNK_SIZE) {
    if (reply[kReplyTrailers] === null) {
      // end(payload) corks the socket: head, body and end go out in one write.
      res.end(payload, null, null);
      return;
    }
    res.write(payload);
    sendTrailer(payload, res, reply);
    return;
  }
  writeHttp2Payload(payload, res, () => sendTrailer(payload, res, reply));
}

function writeHttp2Payload(payload, res, done) {
  const buffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let offset = 0;
  function writeChunk() {
    while (offset < buffer.length) {
      if (res.destroyed || res.writableEnded) return;
      const end = Math.min(offset + HTTP2_WRITE_CHUNK_SIZE, buffer.length);
      const more = res.write(buffer.subarray(offset, end));
      offset = end;
      if (more === false) {
        res.once('drain', writeChunk);
        return;
      }
    }
    done();
  }
  writeChunk();
}

function logStreamError(err, reply) {
  reply.server[kLogController].streamError(err, reply.request, reply);
}

function copyHeadersForStream(reply, res) {
  if (!res.headersSent) {
    const headers = reply[kReplyHeaders];
    for (const key of Object.keys(headers)) res.setHeader(key, headers[key]);
  } else {
    reply.log.warn("response will send, but you shouldn't use res.writeHead in stream mode");
  }
}

function sendWebStream(payload, res, reply) {
  if (payload.locked) throw new XUFA_ERR_REP_READABLE_STREAM_LOCKED();
  let sourceOpen = true;
  let errorLogged = false;
  let waitingDrain = false;
  const reader = payload.getReader();

  finished(res, (err) => {
    if (sourceOpen) {
      if (err != null && res.headersSent && !errorLogged) {
        errorLogged = true;
        logStreamError(err, reply);
      }
      reader.cancel().catch(noop);
    }
  });
  copyHeadersForStream(reply, res);

  function onRead(result) {
    if (result.done) {
      sourceOpen = false;
      sendTrailer(null, res, reply);
      return;
    }
    if (res.destroyed) {
      sourceOpen = false;
      reader.cancel().catch(noop);
      return;
    }
    if (res.write(result.value) === false) {
      waitingDrain = true;
      res.once('drain', onDrain);
      return;
    }
    reader.read().then(onRead, onReadError);
  }

  function onDrain() {
    if (!waitingDrain || !sourceOpen || res.destroyed) return;
    waitingDrain = false;
    reader.read().then(onRead, onReadError);
  }

  function onReadError(err) {
    sourceOpen = false;
    if (res.headersSent || reply.request.raw.aborted === true) {
      if (!errorLogged) {
        errorLogged = true;
        logStreamError(err, reply);
      }
      res.destroy();
    } else {
      onErrorHook(reply, err);
    }
  }

  reader.read().then(onRead, onReadError);
}

function sendStream(payload, res, reply) {
  let sourceOpen = true;
  let errorLogged = false;
  // Trailers once the stream ended.
  if (reply[kReplyTrailers] !== null) payload.on('end', () => sendTrailer(null, res, reply));

  finished(payload, { readable: true, writable: false }, (err) => {
    sourceOpen = false;
    if (err != null) {
      if (res.headersSent || reply.request.raw.aborted === true) {
        if (!errorLogged) {
          errorLogged = true;
          logStreamError(err, reply);
        }
        res.destroy();
      } else {
        onErrorHook(reply, err);
      }
    }
  });

  finished(res, (err) => {
    if (!sourceOpen) return;
    if (err != null && res.headersSent && !errorLogged) {
      errorLogged = true;
      logStreamError(err, reply);
    }
    if (typeof payload.destroy === 'function') payload.destroy();
    else if (typeof payload.close === 'function') payload.close(noop);
    else if (typeof payload.abort === 'function') payload.abort();
    else reply.log.warn('stream payload does not end properly');
  });

  // Streams fail asynchronously (a missing file gives a 404): the head is written with the first data.
  copyHeadersForStream(reply, res);
  payload.pipe(res);
}

function sendTrailer(payload, res, reply) {
  const trailers = reply[kReplyTrailers];
  if (trailers === null) {
    res.end(null, null, null);
    return;
  }
  const values = {};
  let pending = 0;
  let skipped = true;
  let sent = false;
  function send() {
    if (pending === 0 && !sent) {
      sent = true;
      res.addTrailers(values);
      res.end(null, null, null);
    }
  }
  for (const name of Object.keys(trailers)) {
    if (typeof trailers[name] !== 'function') continue;
    skipped = false;
    pending += 1;
    let called = false;
    const cb = (err, value) => {
      if (called) return;
      called = true;
      pending -= 1;
      // Trailers that fail are dropped; they do not affect the client.
      if (err) reply.log.debug(err);
      else values[name] = value;
      process.nextTick(send);
    };
    const result = trailers[name](reply, payload, cb);
    if (result !== undefined && result !== null && typeof result.then === 'function') {
      result.then((value) => cb(null, value), cb);
    } else if (result !== undefined && trailers[name].length < 3) {
      // A handler returning its value without a callback.
      cb(null, result);
    }
  }
  if (skipped) res.end(null, null, null);
}

function onErrorHook(reply, error, cb) {
  const hooks = reply[kRouteContext].onError;
  if (hooks !== null && !reply[kReplyNextErrorHandler]) {
    reply[kReplyIsRunningOnErrorHook] = true;
    onSendHookRunner(hooks, reply.request, reply, error, () => handleError(reply, error, cb));
  } else {
    handleError(reply, error, cb);
  }
}

// Listeners of the end of the response: onResponse hooks and the log of completed requests.
function setupResponseListeners(reply) {
  reply[kReplyStartTime] = now();
  const onResFinished = (err) => {
    reply[kReplyEndTime] = now();
    reply.raw.removeListener('finish', onResFinished);
    reply.raw.removeListener('error', onResFinished);
    const { request } = reply;
    if (request[kRequestSignal]) {
      clearTimeout(request[kTimeoutTimer]);
      request[kTimeoutTimer] = null;
      if (request[kOnAbort]) {
        removeAbortListener(request);
      }
    }
    // Keep-alive sockets do not keep the request and reply once the response is written.
    const socket = request.raw.socket;
    if (socket && socket._meta && socket._meta.request === request) {
      socket.removeListener('timeout', socket._meta.onTimeout);
      socket._meta = null;
    }
    const context = reply[kRouteContext];
    if (context && context.onResponse !== null) {
      onResponseHookRunner(context.onResponse, request, reply, onResponseCallback);
    } else {
      onResponseCallback(err, request, reply);
    }
  };
  reply.raw.on('finish', onResFinished);
  reply.raw.on('error', onResFinished);
}

function onResponseCallback(err, request, reply) {
  reply.server[kLogController].requestCompleted(err, request, reply);
}

// The Reply class of an encapsulated instance: its decorators with values are set by its constructor.
function buildReply(R) {
  const props = R.props.slice();
  function XufaReply(res, request, log) {
    this.raw = res;
    this[kReplyIsError] = false;
    this[kReplyErrorHandlerCalled] = false;
    this[kReplyHijacked] = false;
    this[kReplySerializer] = null;
    this.request = request;
    this[kReplyHeaders] = {};
    this[kReplyTrailers] = null;
    this[kReplyStartTime] = undefined;
    this[kReplyEndTime] = undefined;
    this.log = log;
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      this[prop.key] = prop.value;
    }
  }
  Object.setPrototypeOf(XufaReply.prototype, R.prototype);
  Object.setPrototypeOf(XufaReply, R);
  XufaReply.parent = R;
  XufaReply.props = props;
  return XufaReply;
}

function notFound(reply) {
  if (reply[kRouteContext][kFourOhFourContext] === null) {
    reply.log.warn('Trying to send a NotFound error inside a 404 handler. Sending basic 404 response.');
    reply.code(404).send('404 Not Found');
    return;
  }
  reply.request[kRouteContext] = reply[kRouteContext][kFourOhFourContext];
  const hooks = reply[kRouteContext].preHandler;
  const { preHandlerCallback } = internals();
  if (hooks !== null) preHandlerHookRunner(hooks, reply.request, reply, preHandlerCallback);
  else preHandlerCallback(null, reply.request, reply);
}

// The default serialization: the response schema of the status code, or JSON.stringify. With `bytes`, a serializer of
// @xufa/serializer that writes bytes (for large values) gives them as a Buffer: no string to make, and none for the
// socket to encode again.
function serialize(context, data, statusCode, contentType, bytes = false) {
  const fn = getSchemaSerializer(context, statusCode, contentType);
  if (!fn) return JSON.stringify(data);
  return bytes && fn.toBuffer !== undefined ? fn.toBuffer(data) : fn(data);
}

function noop() {}

module.exports = Reply;
module.exports.buildReply = buildReply;
module.exports.setupResponseListeners = setupResponseListeners;
module.exports.onErrorHook = onErrorHook;

},
"@xufa/http/lib/req-id.js": function (module, exports, require) {
// Ids of requests: req-1, req-2... (in base 36), or the value of a header when requestIdHeader is set.
const { kGenReqId } = require('./symbols');

// The largest SMI: ids stay small integers for V8 (and wrap around after 2^31 requests).
const MAX_INT = 2147483647;

function buildDefaultGenReqId() {
  let next = 0;
  return function genReqId() {
    next = (next + 1) & MAX_INT; // eslint-disable-line no-bitwise
    return `req-${next.toString(36)}`;
  };
}

function reqIdGenFactory(requestIdHeader, optGenReqId) {
  const genReqId = optGenReqId || buildDefaultGenReqId();
  if (!requestIdHeader) return genReqId;
  return function genReqIdFromHeader(req) {
    return req.headers[requestIdHeader] || genReqId(req);
  };
}

function getGenReqId(server, req) {
  return server[kGenReqId](req);
}

module.exports = { reqIdGenFactory, getGenReqId };

},
"@xufa/http/lib/request.js": function (module, exports, require) {
// The request: the raw IncomingMessage with its route context, parameters, query and body.
const proxyAddr = require('./proxy-addr');
const {
  kHasBeenDecorated,
  kSchemaBody,
  kSchemaHeaders,
  kSchemaParams,
  kSchemaQuerystring,
  kSchemaController,
  kOptions,
  kRequestCacheValidateFns,
  kRequestContentType,
  kRouteContext,
  kRequestOriginalUrl,
  kRequestSignal,
  kOnAbort,
  kRequestResponse,
  kRequestQuery,
  kRequestQuerystring,
} = require('./symbols');
const { XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION, XUFA_ERR_DEC_UNDECLARED } = require('./errors');
const decorators = require('./decorate');
const ContentType = require('./content-type');
const querystring = require('./querystring');

const HTTP_PART_SYMBOL_MAP = {
  body: kSchemaBody,
  headers: kSchemaHeaders,
  params: kSchemaParams,
  querystring: kSchemaQuerystring,
  query: kSchemaQuerystring,
};

// The query: parsed when it is read, from the query string the route sets, unless it is given.
function Request(id, params, req, query, log, context) {
  this.id = id;
  this[kRouteContext] = context;
  this.params = params;
  this.raw = req;
  this[kRequestQuerystring] = '';
  this[kRequestQuery] = query;
  this.log = log;
  this.body = undefined;
}
Request.props = [];
Request.instanceProperties = new Set(['id', 'params', 'raw', 'query', 'log', 'body']);

// Calls onAbort when the client goes away before the response is written: the response closes before it finishes.
// (The request itself is not watched: its 'close' comes once its body is read, while the handler still runs, and
// never again if the client leaves after.) Without a response (or after it), the request's own 'close'.
// The listener, for the reply to remove when the response is written.
function onClientGone(request, onAbort) {
  const res = request[kRequestResponse];
  if (!res || typeof res.on !== 'function') {
    request.raw.on('close', onAbort);
    return onAbort;
  }
  const finished = () => (res.writableFinished !== undefined ? res.writableFinished : res.finished === true);
  const onClose = () => {
    if (!finished()) onAbort();
  };
  if (res.destroyed && !finished()) onAbort();
  else res.on('close', onClose);
  return onClose;
}

function getTrustProxyFn(trustProxy) {
  if (typeof trustProxy === 'function') return trustProxy;
  if (trustProxy === true) return () => true;
  // A count of hops can not validate the closest peer: nothing is trusted, so clients can not spoof the headers.
  if (typeof trustProxy === 'number') return () => false;
  if (typeof trustProxy === 'string') return proxyAddr.compile(trustProxy.split(',').map((value) => value.trim()));
  return proxyAddr.compile(trustProxy);
}

function buildRequest(R, trustProxy) {
  return trustProxy ? buildRequestWithTrustProxy(R, trustProxy) : buildRegularRequest(R);
}

function buildRegularRequest(R) {
  const props = R.props.slice();
  function XufaRequest(id, params, req, query, log, context) {
    this.id = id;
    this[kRouteContext] = context;
    this.params = params;
    this.raw = req;
    this[kRequestQuerystring] = '';
    this[kRequestQuery] = query;
    this.log = log;
    this.body = undefined;
    this[kRequestResponse] = null;
    for (let i = 0; i < props.length; i += 1) {
      const prop = props[i];
      this[prop.key] = prop.value;
    }
  }
  Object.setPrototypeOf(XufaRequest.prototype, R.prototype);
  Object.setPrototypeOf(XufaRequest, R);
  XufaRequest.props = props;
  XufaRequest.parent = R;
  return XufaRequest;
}

// The last value of a header that may have been set several times ("a, b" -> "b").
function lastEntry(value) {
  const index = value.lastIndexOf(',');
  return index === -1 ? value.trim() : value.slice(index + 1).trim();
}

function buildRequestWithTrustProxy(R, trustProxy) {
  const XufaRequest = buildRegularRequest(R);
  const proxyFn = getTrustProxyFn(trustProxy);
  XufaRequest[kHasBeenDecorated] = true;
  Object.defineProperties(XufaRequest.prototype, {
    ip: {
      get() {
        const addresses = proxyAddr.all(this.raw, proxyFn);
        return addresses[addresses.length - 1];
      },
    },
    ips: {
      get() {
        return proxyAddr.all(this.raw, proxyFn);
      },
    },
    host: {
      get() {
        const socket = this.raw.socket;
        const { headers } = this;
        if (headers['x-forwarded-host'] && socket != null && proxyFn(socket.remoteAddress, 0)) {
          return lastEntry(headers['x-forwarded-host']);
        }
        return headers.host ?? headers[':authority'] ?? '';
      },
    },
    protocol: {
      get() {
        const socket = this.raw.socket;
        const { headers } = this;
        if (headers['x-forwarded-proto'] && socket != null && proxyFn(socket.remoteAddress, 0)) {
          return lastEntry(headers['x-forwarded-proto']);
        }
        if (this.socket) return this.socket.encrypted ? 'https' : 'http';
        return undefined;
      },
    },
  });
  return XufaRequest;
}

function assertRequestDecoration(request, name) {
  if (!decorators.hasKey(request, name) && !decorators.exist(request, name)) {
    throw new XUFA_ERR_DEC_UNDECLARED(name, 'request');
  }
}

const PORT = /:(\d+)$/;

Object.defineProperties(Request.prototype, {
  query: {
    get() {
      let query = this[kRequestQuery];
      if (query === undefined) {
        const context = this[kRouteContext];
        const parser = context && context.querystringParser;
        query = parser ? parser(this[kRequestQuerystring]) : querystring.parse(this[kRequestQuerystring]);
        this[kRequestQuery] = query;
      }
      return query;
    },
    set(value) {
      this[kRequestQuery] = value;
    },
    enumerable: true,
  },
  server: {
    get() {
      return this[kRouteContext].server;
    },
  },
  url: {
    get() {
      return this.raw.url;
    },
  },
  originalUrl: {
    get() {
      if (!this[kRequestOriginalUrl]) this[kRequestOriginalUrl] = this.raw.originalUrl || this.raw.url;
      return this[kRequestOriginalUrl];
    },
  },
  method: {
    get() {
      return this.raw.method;
    },
  },
  routeOptions: {
    get() {
      const context = this[kRouteContext];
      const routeLimit = context._parserOptions.limit;
      const serverLimit = context.server.initialConfig.bodyLimit;
      const version = context.server.hasConstraintStrategy('version') ? this.raw.headers['accept-version'] : undefined;
      return {
        method: context.config && context.config.method,
        url: context.config && context.config.url,
        bodyLimit: routeLimit || serverLimit,
        handlerTimeout: context.handlerTimeout,
        attachValidation: context.attachValidation,
        logLevel: context.logLevel,
        exposeHeadRoute: context.exposeHeadRoute,
        prefixTrailingSlash: context.prefixTrailingSlash,
        handler: context.handler,
        config: context.config,
        schema: context.schema,
        version,
      };
    },
  },
  is404: {
    get() {
      const { config } = this[kRouteContext];
      return !config || config.url === undefined;
    },
  },
  socket: {
    get() {
      return this.raw.socket;
    },
  },
  signal: {
    get() {
      let controller = this[kRequestSignal];
      if (controller) return controller.signal;
      controller = new AbortController();
      this[kRequestSignal] = controller;
      const onAbort = () => {
        if (!controller.signal.aborted) controller.abort();
      };
      this[kOnAbort] = onClientGone(this, onAbort);
      return controller.signal;
    },
  },
  ip: {
    get() {
      return this.socket ? this.socket.remoteAddress : undefined;
    },
  },
  host: {
    get() {
      return this.raw.headers.host ?? this.raw.headers[':authority'] ?? '';
    },
  },
  hostname: {
    get() {
      const { host } = this;
      if (host[0] === '[') {
        // An IPv6 host: [::1]:3000
        const end = host.indexOf(']');
        return end === -1 ? host : host.slice(0, end + 1);
      }
      return host.split(':', 1)[0];
    },
  },
  port: {
    get() {
      const match = PORT.exec(this.host);
      return match === null ? null : Number.parseInt(match[1], 10);
    },
  },
  protocol: {
    get() {
      if (this.socket) return this.socket.encrypted ? 'https' : 'http';
      return undefined;
    },
  },
  headers: {
    get() {
      if (this.additionalHeaders) return { ...this.raw.headers, ...this.additionalHeaders };
      return this.raw.headers;
    },
    set(headers) {
      this.additionalHeaders = headers;
    },
  },
  mediaType: {
    get() {
      if (!this[kRequestContentType] && this.headers['content-type'] !== undefined) {
        this[kRequestContentType] = ContentType.from(this.headers['content-type']);
      }
      return this[kRequestContentType] ? this[kRequestContentType].mediaType : undefined;
    },
  },
  getValidationFunction: {
    value: function getValidationFunction(httpPartOrSchema) {
      const context = this[kRouteContext];
      if (typeof httpPartOrSchema === 'string') return context[HTTP_PART_SYMBOL_MAP[httpPartOrSchema]];
      if (typeof httpPartOrSchema === 'object') {
        return context[kRequestCacheValidateFns] ? context[kRequestCacheValidateFns].get(httpPartOrSchema) : undefined;
      }
      return undefined;
    },
  },
  compileValidationSchema: {
    value: function compileValidationSchema(schema, httpPart = null) {
      const context = this[kRouteContext];
      if (context[kRequestCacheValidateFns] && context[kRequestCacheValidateFns].has(schema)) {
        return context[kRequestCacheValidateFns].get(schema);
      }
      const controller = this.server[kSchemaController];
      let compiler = context.validatorCompiler || controller.validatorCompiler;
      if (!compiler) {
        controller.setupValidator(this.server[kOptions]);
        compiler = controller.validatorCompiler;
      }
      const validateFn = compiler({ schema, method: this.method, url: this.url, httpPart });
      if (context[kRequestCacheValidateFns] == null) context[kRequestCacheValidateFns] = new WeakMap();
      context[kRequestCacheValidateFns].set(schema, validateFn);
      return validateFn;
    },
  },
  validateInput: {
    value: function validateInput(input, schema, httpPartArg) {
      const httpPart = typeof schema === 'string' ? schema : httpPartArg;
      const symbol = httpPart != null && typeof httpPart === 'string' && HTTP_PART_SYMBOL_MAP[httpPart];
      const context = this[kRouteContext];
      let validate;
      if (symbol) validate = context[symbol];
      if (validate == null && (schema == null || typeof schema !== 'object' || Array.isArray(schema))) {
        throw new XUFA_ERR_REQ_INVALID_VALIDATION_INVOCATION(httpPart);
      }
      if (validate == null) {
        validate =
          context[kRequestCacheValidateFns] && context[kRequestCacheValidateFns].has(schema)
            ? context[kRequestCacheValidateFns].get(schema)
            : this.compileValidationSchema(schema, httpPart);
      }
      return validate(input);
    },
  },
  getDecorator: {
    value: function getDecorator(name) {
      assertRequestDecoration(this, name);
      const decorator = this[name];
      return typeof decorator === 'function' ? decorator.bind(this) : decorator;
    },
  },
  setDecorator: {
    value: function setDecorator(name, value) {
      assertRequestDecoration(this, name);
      this[name] = value;
    },
  },
});

module.exports = Request;
module.exports.buildRequest = buildRequest;
module.exports.onClientGone = onClientGone;

},
"@xufa/http/lib/route.js": function (module, exports, require) {
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

},
"@xufa/http/lib/schema-controller.js": function (module, exports, require) {
// The schemas of an instance (addSchema) and the compilers of validators and serializers, inherited by the
// encapsulated instances.
const { buildSchemas } = require('./schemas');

function buildSchemaController(parent, opts) {
  if (parent) return new SchemaController(parent, opts);
  const compilersFactory = { buildValidator: null, buildSerializer: null, ...(opts && opts.compilersFactory) };
  if (!compilersFactory.buildValidator) {
    const { ValidatorSelector } = require('./validator-compiler'); // eslint-disable-line global-require
    compilersFactory.buildValidator = ValidatorSelector();
  }
  if (!compilersFactory.buildSerializer) {
    const { SerializerSelector } = require('./serializer-compiler'); // eslint-disable-line global-require
    compilersFactory.buildSerializer = SerializerSelector();
  }
  const isCustom = (name) =>
    Boolean(opts && opts.compilersFactory && typeof opts.compilersFactory[name] === 'function');
  return new SchemaController(undefined, {
    bucket: (opts && opts.bucket) || buildSchemas,
    compilersFactory,
    isCustomValidatorCompiler: isCustom('buildValidator'),
    isCustomSerializerCompiler: isCustom('buildSerializer'),
  });
}

class SchemaController {
  constructor(parent, options) {
    this.opts = options || (parent && parent.opts);
    this.addedSchemas = false;
    this.compilersFactory = this.opts.compilersFactory;
    if (parent) {
      this.schemaBucket = this.opts.bucket(parent.getSchemas());
      this.validatorCompiler = parent.getValidatorCompiler();
      this.serializerCompiler = parent.getSerializerCompiler();
      this.isCustomValidatorCompiler = parent.isCustomValidatorCompiler;
      this.isCustomSerializerCompiler = parent.isCustomSerializerCompiler;
      this.parent = parent;
    } else {
      this.schemaBucket = this.opts.bucket();
      this.isCustomValidatorCompiler = this.opts.isCustomValidatorCompiler || false;
      this.isCustomSerializerCompiler = this.opts.isCustomSerializerCompiler || false;
    }
  }

  add(schema) {
    this.addedSchemas = true;
    return this.schemaBucket.add(schema);
  }

  getSchema(schemaId) {
    return this.schemaBucket.getSchema(schemaId);
  }

  getSchemas() {
    return this.schemaBucket.getSchemas();
  }

  // A compiler set this way is used as if a factory always gave it.
  setValidatorCompiler(validatorCompiler) {
    this.compilersFactory = { ...this.compilersFactory, buildValidator: () => validatorCompiler };
    this.validatorCompiler = validatorCompiler;
    this.isCustomValidatorCompiler = true;
  }

  setSerializerCompiler(serializerCompiler) {
    this.compilersFactory = { ...this.compilersFactory, buildSerializer: () => serializerCompiler };
    this.serializerCompiler = serializerCompiler;
    this.isCustomSerializerCompiler = true;
  }

  getValidatorCompiler() {
    return this.validatorCompiler || (this.parent && this.parent.getValidatorCompiler());
  }

  getSerializerCompiler() {
    return this.serializerCompiler || (this.parent && this.parent.getSerializerCompiler());
  }

  getSerializerBuilder() {
    return this.compilersFactory.buildSerializer || (this.parent && this.parent.getSerializerBuilder());
  }

  getValidatorBuilder() {
    return this.compilersFactory.buildValidator || (this.parent && this.parent.getValidatorBuilder());
  }

  // Builds the compiler once, again when schemas were added since.
  setupValidator(serverOptions) {
    if (this.validatorCompiler !== undefined && !this.addedSchemas) return;
    this.validatorCompiler = this.getValidatorBuilder()(this.schemaBucket.getSchemas(), serverOptions.ajv);
  }

  setupSerializer(serverOptions) {
    if (this.serializerCompiler !== undefined && !this.addedSchemas) return;
    this.serializerCompiler = this.getSerializerBuilder()(this.schemaBucket.getSchemas(), serverOptions.serializerOpts);
  }
}

SchemaController.buildSchemaController = buildSchemaController;

module.exports = SchemaController;

},
"@xufa/http/lib/schemas.js": function (module, exports, require) {
// Shared schemas (addSchema), the normalization of route schemas, and the serializer of a response by status code.
const { kSchemaVisited, kSchemaResponse } = require('./symbols');
const {
  XUFA_ERR_SCH_MISSING_ID,
  XUFA_ERR_SCH_ALREADY_PRESENT,
  XUFA_ERR_SCH_DUPLICATE,
  XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA,
} = require('./errors');
const ContentType = require('./content-type');

const kFluentSchema = Symbol.for('fluent-schema-object');
const SCHEMAS_SOURCE = ['params', 'body', 'querystring', 'query', 'headers'];

// A deep copy of plain objects and arrays; other values (functions, class instances) are kept as they are.
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = proto === null ? Object.create(null) : {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

const isFluent = (schema) =>
  Boolean(schema && (schema.isFluentSchema || schema.isFluentJSONSchema || schema[kFluentSchema]));

function Schemas(initStore) {
  this.store = initStore || {};
}

Schemas.prototype.add = function add(inputSchema) {
  const schema = clone(isFluent(inputSchema) ? inputSchema.valueOf() : inputSchema);
  const id = schema.$id;
  if (!id) throw new XUFA_ERR_SCH_MISSING_ID();
  if (this.store[id]) throw new XUFA_ERR_SCH_ALREADY_PRESENT(id);
  this.store[id] = schema;
};

Schemas.prototype.getSchemas = function getSchemas() {
  return { ...this.store };
};

Schemas.prototype.getSchema = function getSchema(schemaId) {
  return this.store[schemaId];
};

function isCustomSchemaPrototype(schema) {
  return typeof schema === 'object' && Object.getPrototypeOf(schema) !== Object.prototype;
}

function normalizeSchema(routeSchemas) {
  if (routeSchemas[kSchemaVisited]) return routeSchemas;
  // query is an alias of querystring; booleans are schemas too, so presence is "not undefined".
  if (routeSchemas.query !== undefined) {
    if (routeSchemas.querystring !== undefined) throw new XUFA_ERR_SCH_DUPLICATE('querystring');
    routeSchemas.querystring = routeSchemas.query;
  }
  for (const key of SCHEMAS_SOURCE) {
    if (isFluent(routeSchemas[key])) routeSchemas[key] = routeSchemas[key].valueOf();
  }
  if (routeSchemas.response) {
    for (const code of Object.keys(routeSchemas.response)) {
      if (isFluent(routeSchemas.response[code])) routeSchemas.response[code] = routeSchemas.response[code].valueOf();
    }
  }
  const { body } = routeSchemas;
  if (body && !isCustomSchemaPrototype(body) && body.content) {
    for (const contentType of Object.keys(body.content)) {
      if (!body.content[contentType].schema) throw new XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA(contentType);
    }
  }
  if (routeSchemas.response) {
    for (const code of Object.keys(routeSchemas.response)) {
      const schema = routeSchemas.response[code];
      if (isCustomSchemaPrototype(schema) || !schema.content) continue;
      for (const mediaName of Object.keys(schema.content)) {
        if (!schema.content[mediaName].schema) throw new XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA(mediaName);
      }
    }
  }
  routeSchemas[kSchemaVisited] = true;
  return routeSchemas;
}

function byContentType(serializers, contentType) {
  const ct = ContentType.from(contentType);
  if (!ct.isValid) return undefined;
  return serializers[ct.mediaType] || serializers['*/*'] || false;
}

// The serializer for a status code: the exact one (200), its class (2xx), or default; false when there is none.
function getSchemaSerializer(context, statusCode, contentType) {
  const responses = context[kSchemaResponse];
  if (!responses) return false;
  // Runs for every reply of a route with response schemas: the exact status code is looked up first, alone.
  let serializer = responses[statusCode];
  if (!serializer) serializer = responses[STATUS_CLASSES[Math.floor(statusCode / 100)]];
  if (!serializer) serializer = responses.default;
  if (!serializer) return false;
  if (serializer.constructor === Object) {
    const found = byContentType(serializer, contentType);
    if (found !== undefined) return found;
  }
  return serializer;
}

const STATUS_CLASSES = ['0xx', '1xx', '2xx', '3xx', '4xx', '5xx', '6xx', '7xx', '8xx', '9xx'];

module.exports = {
  buildSchemas(initStore) {
    return new Schemas(initStore);
  },
  getSchemaSerializer,
  normalizeSchema,
  clone,
};

},
"@xufa/http/lib/secure-json.js": function (module, exports, require) {
// JSON.parse that refuses (or removes) __proto__ and constructor.prototype keys, which could pollute prototypes when
// the parsed object is merged into another. The text is scanned only when it holds one of those words.

const PROTO =
  /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
const CONSTRUCTOR =
  /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;

function parse(text, options = {}) {
  const source = typeof text === 'string' ? text : text.toString();
  // A byte order mark is removed, as JSON.parse does not accept it.
  const json = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const value = JSON.parse(json, options.reviver);
  const protoAction = options.protoAction || 'error';
  const constructorAction = options.constructorAction || 'error';
  if (value === null || typeof value !== 'object') return value;
  if (protoAction === 'ignore' && constructorAction === 'ignore') return value;
  // Escaped keys ("__proto__") are only possible when the text has a backslash-u.
  const escaped = json.indexOf('\\u') !== -1;
  const checkProto = protoAction !== 'ignore' && (json.indexOf('__proto__') !== -1 || (escaped && PROTO.test(json)));
  const checkConstructor =
    constructorAction !== 'ignore' && (json.indexOf('constructor') !== -1 || (escaped && CONSTRUCTOR.test(json)));
  if (!checkProto && !checkConstructor) return value;
  return filter(value, {
    protoAction: checkProto ? protoAction : 'ignore',
    constructorAction: checkConstructor ? constructorAction : 'ignore',
  });
}

function filter(root, { protoAction, constructorAction }) {
  let next = [root];
  while (next.length) {
    const nodes = next;
    next = [];
    for (const node of nodes) {
      if (protoAction !== 'ignore' && Object.prototype.hasOwnProperty.call(node, '__proto__')) {
        if (protoAction === 'error') throw new SyntaxError('Object contains forbidden prototype property');
        delete node.__proto__; // eslint-disable-line no-proto
      }
      if (
        constructorAction !== 'ignore' &&
        Object.prototype.hasOwnProperty.call(node, 'constructor') &&
        node.constructor !== null &&
        typeof node.constructor === 'object' &&
        Object.prototype.hasOwnProperty.call(node.constructor, 'prototype')
      ) {
        if (constructorAction === 'error') throw new SyntaxError('Object contains forbidden prototype property');
        delete node.constructor;
      }
      for (const key of Object.keys(node)) {
        const value = node[key];
        if (value !== null && typeof value === 'object') next.push(value);
      }
    }
  }
  return root;
}

// Like parse(), but null instead of throwing.
function safeParse(text, reviver) {
  try {
    return parse(text, { reviver, protoAction: 'error', constructorAction: 'error' });
  } catch {
    return null;
  }
}

// Callable, as secure-json-parse is.
module.exports = parse;
module.exports.parse = parse;
module.exports.safeParse = safeParse;
module.exports.filter = filter;

},
"@xufa/http/lib/semver.js": function (module, exports, require) {
// Enough of semver to check the version ranges plugins declare: 1.2.3, >=1.2, <2, ^1.2.3, ~1.2, 1.x, *, a - b, ||.

const VERSION = /^v?(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(text) {
  const match = VERSION.exec(String(text).trim());
  if (!match) return null;
  const part = (value) =>
    value === undefined || value === 'x' || value === 'X' || value === '*' ? null : Number(value);
  return {
    major: Number(match[1]),
    minor: part(match[2]),
    patch: part(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareIdentifiers(a, b) {
  const numA = /^\d+$/.test(a);
  const numB = /^\d+$/.test(b);
  if (numA && numB) return Number(a) - Number(b);
  if (numA) return -1;
  if (numB) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compare(a, b) {
  for (const key of ['major', 'minor', 'patch']) {
    const diff = (a[key] || 0) - (b[key] || 0);
    if (diff !== 0) return diff;
  }
  // A version with a prerelease is lower than the same version without one.
  if (a.prerelease.length === 0 || b.prerelease.length === 0) return b.prerelease.length - a.prerelease.length;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    if (a.prerelease[i] === undefined) return -1;
    if (b.prerelease[i] === undefined) return 1;
    const diff = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

const version = (major, minor, patch, prerelease = []) => ({ major, minor, patch, prerelease });

// The comparators of one range of a "||" list: [operator, version] pairs that must all hold.
function comparators(range) {
  const text = range.trim();
  if (text === '' || text === '*' || text === 'x' || text === 'X') return [['>=', version(0, 0, 0)]];
  const hyphen = text.split(/\s+-\s+/);
  if (hyphen.length === 2) {
    const low = parse(hyphen[0]);
    const high = parse(hyphen[1]);
    return [...expand('>=', low), ...expand('<=', high)];
  }
  const out = [];
  for (const token of text.split(/\s+/)) {
    const match = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(token);
    const op = match[1] || '';
    const parsed = parse(match[2]);
    if (parsed === null) throw new TypeError(`Invalid version range: ${range}`);
    out.push(...expand(op, parsed));
  }
  return out;
}

function expand(op, v) {
  const { major, minor, patch, prerelease } = v;
  const full = version(major, minor || 0, patch || 0, prerelease);
  switch (op) {
    case '^':
      if (major > 0 || minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      if (minor > 0 || patch === null)
        return [
          ['>=', full],
          ['<', version(0, minor + 1, 0)],
        ];
      return [
        ['>=', full],
        ['<', version(0, 0, patch + 1)],
      ];
    case '~':
      if (minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      return [
        ['>=', full],
        ['<', version(major, minor + 1, 0)],
      ];
    case '>':
      if (minor === null) return [['>=', version(major + 1, 0, 0)]];
      if (patch === null) return [['>=', version(major, minor + 1, 0)]];
      return [['>', full]];
    case '<=':
      if (minor === null) return [['<', version(major + 1, 0, 0)]];
      if (patch === null) return [['<', version(major, minor + 1, 0)]];
      return [['<=', full]];
    case '>=':
    case '<':
      return [[op, full]];
    default:
      // 1.2.3 is exact; 1 and 1.2 (or 1.x) stand for every version they start.
      if (minor === null)
        return [
          ['>=', full],
          ['<', version(major + 1, 0, 0)],
        ];
      if (patch === null)
        return [
          ['>=', full],
          ['<', version(major, minor + 1, 0)],
        ];
      return [['=', full]];
  }
}

function test(v, [op, bound]) {
  const diff = compare(v, bound);
  switch (op) {
    case '>':
      return diff > 0;
    case '>=':
      return diff >= 0;
    case '<':
      return diff < 0;
    case '<=':
      return diff <= 0;
    default:
      return diff === 0;
  }
}

function satisfies(versionText, range, options = {}) {
  const v = parse(versionText);
  if (v === null) return false;
  return range.split('||').some((part) => {
    let list = comparators(part);
    // With prereleases, the bounds include them: >=99.0.0 is >=99.0.0-0, <100.0.0 is <100.0.0-0.
    if (options.includePrerelease) {
      list = list.map(([op, bound]) =>
        bound.prerelease.length === 0 && op !== '=' && op !== '<=' ? [op, { ...bound, prerelease: ['0'] }] : [op, bound]
      );
    }
    if (!list.every((comparator) => test(v, comparator))) return false;
    // Prereleases only match ranges naming a prerelease of the same version, unless asked.
    if (v.prerelease.length === 0 || options.includePrerelease) return true;
    return list.some(
      ([, bound]) =>
        bound.prerelease.length > 0 && bound.major === v.major && bound.minor === v.minor && bound.patch === v.patch
    );
  });
}

// The first version in a text ("^98.1" -> 98.1.0), or null.
function coerce(text) {
  const match = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(String(text));
  if (!match) return null;
  return version(Number(match[1]), Number(match[2] || 0), Number(match[3] || 0));
}

function gt(a, b) {
  const va = typeof a === 'string' ? parse(a) : a;
  const vb = typeof b === 'string' ? parse(b) : b;
  return va !== null && vb !== null && compare(va, vb) > 0;
}

module.exports = { satisfies, parse, compare, coerce, gt };

},
"@xufa/http/lib/serializer-compiler.js": function (module, exports, require) {
// The default serializer compiler: @xufa/serializer with the shared schemas, one compiler per set of schemas and
// options (what @fastify/fast-json-stringify-compiler gives fastify).
const build = require('@xufa/serializer');

function SerializerSelector() {
  return function buildSerializerFactory(externalSchemas, serializerOpts) {
    const options = { ...serializerOpts, schema: externalSchemas };
    return function responseSchemaCompiler({ schema }) {
      return build(schema, options);
    };
  };
}

module.exports = { SerializerSelector };

},
"@xufa/http/lib/server.js": function (module, exports, require) {
// The HTTP server (http, https, http2, or one of the user) and listen(), which on 'localhost' listens on every
// address it resolves to (127.0.0.1 and ::1).
const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');
const dns = require('node:dns');
const os = require('node:os');
const { kState, kOptions, kServerBindings, kHttp2ServerSessions } = require('./symbols');
const { XUFAWRN003 } = require('./warnings');
const { onListenHookRunner } = require('./hooks');
const {
  XUFA_ERR_REOPENED_CLOSE_SERVER,
  XUFA_ERR_REOPENED_SERVER,
  XUFA_ERR_LISTEN_OPTIONS_INVALID,
  XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE,
} = require('./errors');

function defaultListeningText(address) {
  return `Server listening at ${address}`;
}

// A Set-like object that keeps nothing, for when sockets do not have to be tracked.
function noopSet() {
  return {
    [Symbol.iterator]: function* iterator() {}, // eslint-disable-line no-empty-function
    add() {},
    delete() {},
    has() {
      return true;
    },
  };
}

function createServer(options, httpHandler) {
  const server = getServerInstance(options, httpHandler);

  // `this` is the instance.
  function listen(listenOptions = { port: 0, host: 'localhost' }, cb = undefined) {
    if (typeof cb === 'function') {
      if (cb.constructor.name === 'AsyncFunction') XUFAWRN003('listen method');
      listenOptions.cb = cb;
    }
    if (listenOptions.signal) {
      const { signal } = listenOptions;
      if (typeof signal.on !== 'function' && typeof signal.addEventListener !== 'function') {
        throw new XUFA_ERR_LISTEN_OPTIONS_INVALID('Invalid options.signal');
      }
      this[kState].aborted = signal.aborted;
      if (this[kState].aborted) return this.close();
      signal.addEventListener(
        'abort',
        () => {
          this[kState].aborted = true;
          this.close();
        },
        { once: true }
      );
    }
    // With a path, the host does not default to 'localhost': it would listen on both.
    const host = listenOptions.path == null ? (listenOptions.host ?? 'localhost') : listenOptions.host;
    if (!Object.prototype.hasOwnProperty.call(listenOptions, 'host') || listenOptions.host == null) {
      listenOptions.host = host;
    }
    if (host === 'localhost') {
      listenOptions.cb = (err, address) => {
        if (err) {
          cb(err, address);
          return;
        }
        multipleBindings.call(this, server, httpHandler, options, listenOptions, () => {
          this[kState].listening = true;
          cb(null, address);
          onListenHookRunner(this);
        });
      };
    } else {
      listenOptions.cb = (err, address) => {
        if (err) {
          cb(err, address);
          return;
        }
        this[kState].listening = true;
        cb(null, address);
        onListenHookRunner(this);
      };
    }

    if (cb === undefined) {
      return listenPromise.call(this, server, listenOptions).then((address) => {
        const { promise, resolve } = Promise.withResolvers();
        if (host === 'localhost') {
          multipleBindings.call(this, server, httpHandler, options, listenOptions, () => {
            this[kState].listening = true;
            resolve(address);
            onListenHookRunner(this);
          });
        } else {
          resolve(address);
          onListenHookRunner(this);
        }
        return promise;
      });
    }
    this.ready(listenCallback.call(this, server, listenOptions));
    return undefined;
  }

  const hasCloseAllConnections = typeof server.closeAllConnections === 'function';
  const hasCloseIdleConnections = typeof server.closeIdleConnections === 'function';
  const hasCloseHttp2Sessions = typeof server.closeHttp2Sessions === 'function';
  let { forceCloseConnections } = options;
  if (forceCloseConnections === 'idle' && !hasCloseIdleConnections) {
    throw new XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE();
  } else if (typeof forceCloseConnections !== 'boolean') {
    forceCloseConnections = hasCloseIdleConnections ? 'idle' : false;
  }
  const keepAliveConnections = !hasCloseAllConnections && forceCloseConnections === true ? new Set() : noopSet();

  return {
    server,
    listen,
    forceCloseConnections,
    serverHasCloseAllConnections: hasCloseAllConnections,
    serverHasCloseHttp2Sessions: hasCloseHttp2Sessions,
    keepAliveConnections,
  };
}

// The main server listens on the first address of the host; the other addresses get servers of their own.
function multipleBindings(mainServer, httpHandler, serverOpts, listenOptions, onListen) {
  this[kState].listening = false;
  dns.lookup(listenOptions.host, { all: true }, (dnsErr, addresses) => {
    if (dnsErr || this[kState].aborted) {
      onListen();
      return;
    }
    let binding = 0;
    let bound = 0;
    if (!(mainServer.listening && serverOpts.serverFactory)) {
      const primary = mainServer.address();
      for (const address of addresses) {
        if (address.address === primary.address) continue;
        binding += 1;
        const secondary = getServerInstance(serverOpts, httpHandler);
        const secondaryOpts = {
          ...listenOptions,
          host: address.address,
          port: primary.port,
          cb: (ignoredErr) => {
            bound += 1;
            if (!ignoredErr) this[kServerBindings].push(secondary);
            if (bound === binding) onListen();
          },
        };
        // Closed after the main server, so that preClose hooks run before (errors of it are ignored).
        const closeSecondary = () => {
          secondary.close(() => {});
          if (typeof secondary.closeAllConnections === 'function' && serverOpts.forceCloseConnections === true) {
            secondary.closeAllConnections();
          }
          if (typeof secondary.closeHttp2Sessions === 'function') secondary.closeHttp2Sessions();
        };
        secondary.on('upgrade', mainServer.emit.bind(mainServer, 'upgrade'));
        mainServer.on('unref', closeSecondary);
        mainServer.on('close', closeSecondary);
        mainServer.on('error', closeSecondary);
        this[kState].listening = false;
        listenCallback.call(this, secondary, secondaryOpts)();
      }
    }
    if (binding === 0) {
      onListen();
      return;
    }
    // unref() of the main server (tests use it) reaches the secondary ones.
    const originalUnref = mainServer.unref;
    mainServer.unref = function unref() {
      originalUnref.call(mainServer);
      mainServer.emit('unref');
    };
  });
}

function listenCallback(server, listenOptions) {
  const wrap = (err) => {
    server.removeListener('error', wrap);
    server.removeListener('listening', wrap);
    if (!err) {
      const address = logServerAddress.call(this, server, listenOptions.listenTextResolver || defaultListeningText);
      listenOptions.cb(null, address);
    } else {
      this[kState].listening = false;
      listenOptions.cb(err, null);
    }
  };
  return (err) => {
    if (err != null) return listenOptions.cb(err);
    if (this[kState].listening && this[kState].closing)
      return listenOptions.cb(new XUFA_ERR_REOPENED_CLOSE_SERVER(), null);
    if (this[kState].listening) return listenOptions.cb(new XUFA_ERR_REOPENED_SERVER(), null);
    server.once('error', wrap);
    if (!this[kState].closing) {
      server.once('listening', wrap);
      server.listen(listenOptions);
      this[kState].listening = true;
    }
    return undefined;
  };
}

function listenPromise(server, listenOptions) {
  if (this[kState].listening && this[kState].closing) return Promise.reject(new XUFA_ERR_REOPENED_CLOSE_SERVER());
  if (this[kState].listening) return Promise.reject(new XUFA_ERR_REOPENED_SERVER());
  return this.ready().then(() => {
    if (this[kState].aborted) return undefined;
    const { promise, resolve, reject } = Promise.withResolvers();
    let onListening = null;
    const onError = (err) => {
      server.removeListener('listening', onListening);
      this[kState].listening = false;
      reject(err);
    };
    onListening = () => {
      server.removeListener('error', onError);
      this[kState].listening = true;
      resolve(logServerAddress.call(this, server, listenOptions.listenTextResolver || defaultListeningText));
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(listenOptions);
    return promise;
  });
}

function getServerInstance(options, httpHandler) {
  if (options.serverFactory) return options.serverFactory(httpHandler, options);
  // https: true is a valid way to turn https on, Node.js wants an object.
  const httpsOptions = options.https === true ? {} : options.https;
  if (options.http2) {
    const server =
      typeof httpsOptions === 'object' && httpsOptions !== null
        ? http2.createSecureServer(httpsOptions, httpHandler)
        : http2.createServer(options.http, httpHandler);
    server.on('session', (session) => session.setTimeout(options.http2SessionTimeout, () => session.close()));
    // Node.js 24 closes the sessions itself on server.close().
    if (options.forceCloseConnections === true) server.closeHttp2Sessions = createCloseHttp2Sessions(server);
    server.setTimeout(options.connectionTimeout);
    return server;
  }
  const server = httpsOptions
    ? https.createServer(httpsOptions, httpHandler)
    : http.createServer(options.http || {}, httpHandler);
  server.keepAliveTimeout = options.keepAliveTimeout;
  server.requestTimeout = options.requestTimeout;
  server.setTimeout(options.connectionTimeout);
  // Zero means the default of Node.js.
  if (options.maxRequestsPerSocket > 0) server.maxRequestsPerSocket = options.maxRequestsPerSocket;
  return server;
}

// The addresses 0.0.0.0 stands for: the IPv4 addresses of the interfaces, internal ones first.
function getAddresses(address) {
  if (address.address === '0.0.0.0') {
    return Object.values(os.networkInterfaces())
      .flatMap((iface) => iface.filter((entry) => entry.family === 'IPv4'))
      .sort((iface) => (iface.internal ? -1 : 1))
      .map((iface) => iface.address);
  }
  return [address.address];
}

function logServerAddress(server, listenTextResolver) {
  const address = server.address();
  let addresses;
  if (typeof address === 'string') {
    addresses = [address];
  } else {
    const protocol = `http${this[kOptions].https ? 's' : ''}://`;
    addresses =
      address.address.indexOf(':') === -1
        ? getAddresses(address).map((ip) => `${ip}:${address.port}`)
        : [`[${address.address}]:${address.port}`];
    addresses = addresses.map((item) => protocol + item);
  }
  for (const item of addresses) this.log.info(listenTextResolver(item));
  return addresses[0];
}

function createCloseHttp2Sessions(server) {
  const sessions = new Set();
  server[kHttp2ServerSessions] = sessions;
  server.on('session', (session) => {
    session.once('connect', () => sessions.add(session));
    session.once('close', () => sessions.delete(session));
    // An error of the session itself (stream 0) shuts it down.
    session.once('frameError', (type, code, streamId) => {
      if (streamId === 0) sessions.delete(session);
    });
    session.once('goaway', () => sessions.delete(session));
  });
  return function closeHttp2Sessions() {
    for (const session of sessions) session.close();
  };
}

module.exports = { createServer, noopSet };

},
"@xufa/http/lib/symbols.js": function (module, exports, require) {
// Symbols of the internal state of instances, requests, replies and route contexts.
const names = [
  'kBoot',
  'kChildren',
  'kServerBindings',
  'kBodyLimit',
  'kSupportedHTTPMethods',
  'kRoutePrefix',
  'kLogLevel',
  'kLogSerializers',
  'kHooks',
  'kContentTypeParser',
  'kState',
  'kOptions',
  'kPluginNameChain',
  'kRouteContext',
  'kGenReqId',
  'kHttp2ServerSessions',
  'kSchemaController',
  'kSchemaHeaders',
  'kSchemaParams',
  'kSchemaQuerystring',
  'kSchemaBody',
  'kSchemaResponse',
  'kSchemaErrorFormatter',
  'kSchemaVisited',
  'kRequest',
  'kRequestPayloadStream',
  'kRequestAcceptVersion',
  'kRequestCacheValidateFns',
  'kRequestContentType',
  'kRequestOriginalUrl',
  'kRequestSignal',
  'kRequestQuery',
  'kRequestQuerystring',
  'kHandlerTimeout',
  'kTimeoutTimer',
  'kOnAbort',
  'kRequestResponse',
  'kFourOhFour',
  'kCanSetNotFoundHandler',
  'kFourOhFourLevelInstance',
  'kFourOhFourContext',
  'kDefaultJsonParse',
  'kReply',
  'kReplySerializer',
  'kReplyIsError',
  'kReplyHeaders',
  'kReplyTrailers',
  'kReplyHasStatusCode',
  'kReplyHijacked',
  'kReplyStartTime',
  'kReplyNextErrorHandler',
  'kReplyEndTime',
  'kReplyErrorHandlerCalled',
  'kReplyIsRunningOnErrorHook',
  'kReplySerializerDefault',
  'kReplyCacheSerializeFns',
  'kTestInternals',
  'kErrorHandler',
  'kErrorHandlerAlreadySet',
  'kChildLoggerFactory',
  'kHasBeenDecorated',
  'kKeepAliveConnections',
  'kRouteByXufa',
  'kLogController',
  'kDiagnosticsStore',
];

const symbols = {};
for (const name of names) symbols[name] = Symbol(`xufa.${name.slice(1, 2).toLowerCase()}${name.slice(2)}`);

module.exports = symbols;

},
"@xufa/http/lib/validation.js": function (module, exports, require) {
// Compiling the schemas of a route (validation of params, body, querystring and headers, serialization of
// responses), and validating a request.
const {
  kSchemaHeaders: headersSchema,
  kSchemaParams: paramsSchema,
  kSchemaQuerystring: querystringSchema,
  kSchemaBody: bodySchema,
  kSchemaResponse: responseSchema,
} = require('./symbols');
const { XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX } = require('./errors');
const { XUFAWRN001, XUFASEC002 } = require('./warnings');

const STATUS_CODE = /^[1-5](?:\d{2}|xx)$|^default$/;

function compileSchemasForSerialization(context, compile) {
  if (!context.schema || !context.schema.response) return;
  const { method, url } = context.config || {};
  const compiled = {};
  for (const code of Object.keys(context.schema.response)) {
    const schema = context.schema.response[code];
    const statusCode = code.toLowerCase();
    if (!STATUS_CODE.test(statusCode)) throw new XUFA_ERR_SCH_RESPONSE_SCHEMA_NOT_NESTED_2XX();
    if (schema.content) {
      const byContentType = {};
      for (const mediaName of Object.keys(schema.content)) {
        byContentType[mediaName] = compile({
          schema: schema.content[mediaName].schema,
          url,
          method,
          httpStatus: statusCode,
          contentType: mediaName,
        });
      }
      compiled[statusCode] = byContentType;
    } else {
      compiled[statusCode] = compile({ schema, url, method, httpStatus: statusCode });
    }
  }
  context[responseSchema] = compiled;
}

// Header names are case-insensitive and Node.js gives them in lower case: the names in the schema are lowered too,
// wherever a property name appears (properties, required, dependencies), in every subschema.
function lowerCaseHeadersSchema(schema) {
  if (Array.isArray(schema)) return schema.map(lowerCaseHeadersSchema);
  if (schema === null || typeof schema !== 'object') return schema;
  const result = {};
  for (const key of Object.keys(schema)) {
    const value = schema[key];
    switch (key) {
      case 'properties':
      case 'dependentSchemas':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) result[key][name.toLowerCase()] = lowerCaseHeadersSchema(value[name]);
        break;
      case 'required':
        result.required = Array.isArray(value) ? value.map((name) => name.toLowerCase()) : value;
        break;
      case 'dependencies':
      case 'dependentRequired':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) {
          const dep = value[name];
          result[key][name.toLowerCase()] = Array.isArray(dep)
            ? dep.map((item) => item.toLowerCase())
            : lowerCaseHeadersSchema(dep);
        }
        break;
      case 'allOf':
      case 'anyOf':
      case 'oneOf':
      case 'not':
      case 'if':
      case 'then':
      case 'else':
      case 'items':
      case 'additionalItems':
      case 'additionalProperties':
      case 'unevaluatedItems':
      case 'unevaluatedProperties':
      case 'contains':
      case 'propertyNames':
      case 'contentSchema':
        result[key] = lowerCaseHeadersSchema(value);
        break;
      case 'definitions':
      case '$defs':
      case 'patternProperties':
        if (value === null || typeof value !== 'object') {
          result[key] = value;
          break;
        }
        result[key] = {};
        for (const name of Object.keys(value)) result[key][name] = lowerCaseHeadersSchema(value[name]);
        break;
      default:
        result[key] = value;
    }
  }
  return result;
}

// The first $ref to another document in a schema (whose header names can not be lowered), or undefined.
function findExternalRef(schema) {
  if (Array.isArray(schema)) {
    for (const item of schema) {
      const ref = findExternalRef(item);
      if (ref !== undefined) return ref;
    }
    return undefined;
  }
  if (schema === null || typeof schema !== 'object') return undefined;
  if (typeof schema.$ref === 'string' && schema.$ref[0] !== '#') return schema.$ref;
  for (const key of Object.keys(schema)) {
    const ref = findExternalRef(schema[key]);
    if (ref !== undefined) return ref;
  }
  return undefined;
}

function compileSchemasForValidation(context, compile, isCustom) {
  const { schema } = context;
  if (!schema) return;
  const { method, url } = context.config || {};
  const missing = (part) => Object.prototype.hasOwnProperty.call(schema, part) && XUFAWRN001(part, method, url);

  const { headers } = schema;
  if (headers !== undefined) {
    if (
      isCustom ||
      typeof headers !== 'object' ||
      headers === null ||
      Object.getPrototypeOf(headers) !== Object.prototype
    ) {
      // Schemas of custom validators (and booleans) are compiled as they are.
      context[headersSchema] = compile({ schema: headers, method, url, httpPart: 'headers' });
    } else {
      const externalRef = findExternalRef(headers);
      if (externalRef !== undefined) XUFASEC002(method, url, externalRef);
      context[headersSchema] = compile({ schema: lowerCaseHeadersSchema(headers), method, url, httpPart: 'headers' });
    }
  } else {
    missing('headers');
  }

  if (schema.body !== undefined) {
    const content = schema.body !== null && typeof schema.body === 'object' ? schema.body.content : undefined;
    if (content) {
      const byContentType = {};
      for (const contentType of Object.keys(content)) {
        byContentType[contentType] = compile({
          schema: content[contentType].schema,
          method,
          url,
          httpPart: 'body',
          contentType,
        });
      }
      context[bodySchema] = byContentType;
    } else {
      context[bodySchema] = compile({ schema: schema.body, method, url, httpPart: 'body' });
    }
  } else {
    missing('body');
  }

  if (schema.querystring !== undefined) {
    context[querystringSchema] = compile({ schema: schema.querystring, method, url, httpPart: 'querystring' });
  } else {
    missing('querystring');
  }

  if (schema.params !== undefined) {
    context[paramsSchema] = compile({ schema: schema.params, method, url, httpPart: 'params' });
  } else {
    missing('params');
  }

  context.hasValidation =
    context[paramsSchema] !== undefined ||
    context[bodySchema] !== undefined ||
    context[querystringSchema] !== undefined ||
    context[headersSchema] !== undefined;
}

function validateParam(validatorFunction, request, paramName) {
  if (validatorFunction == null) return false;
  const value = request[paramName];
  let ret;
  try {
    const data = value === undefined ? null : value;
    ret = validatorFunction.schemaEnv
      ? validatorFunction(data, { parentData: request, parentDataProperty: paramName })
      : validatorFunction(data);
  } catch (err) {
    // A validator throwing is an internal error.
    err.statusCode = 500; // eslint-disable-line no-param-reassign
    return err;
  }
  if (ret && typeof ret.then === 'function') {
    // An async validator resolves with the data validated: only pass or fail is read from it.
    return ret.then((res) => (res === false ? validatorFunction.errors : false)).catch((err) => err);
  }
  if (ret === false) return validatorFunction.errors;
  if (ret && ret.error) return ret.error;
  if (ret && typeof ret === 'object' && 'value' in ret) request[paramName] = ret.value; // eslint-disable-line no-param-reassign
  return false;
}

function wrapValidationError(result, dataVar, schemaErrorFormatter) {
  if (result instanceof Error) {
    result.statusCode = result.statusCode || 400; // eslint-disable-line no-param-reassign
    result.code = result.code || 'XUFA_ERR_VALIDATION'; // eslint-disable-line no-param-reassign
    result.validationContext = result.validationContext || dataVar; // eslint-disable-line no-param-reassign
    return result;
  }
  const error = schemaErrorFormatter(result, dataVar);
  error.statusCode = error.statusCode || 400;
  error.code = error.code || 'XUFA_ERR_VALIDATION';
  error.validation = result;
  error.validationContext = dataVar;
  return error;
}

function bodyValidator(context, request) {
  const schema = context[bodySchema];
  if (typeof schema === 'function') return schema;
  if (schema) return schema[request.mediaType] || null;
  return null;
}

// false when the request is valid, the error otherwise (or a promise of either, with async validators).
function validate(context, request, execution) {
  const run = execution === undefined;
  if (
    run &&
    context[paramsSchema] === undefined &&
    context[bodySchema] === undefined &&
    context[querystringSchema] === undefined &&
    context[headersSchema] === undefined
  ) {
    return false;
  }
  // Runs for every request of a route with schemas: no allocation unless something fails or is asynchronous.
  if (run || !execution.skipParams) {
    const result = validateParam(context[paramsSchema], request, 'params');
    if (result) return settle(result, context, request, 'params', SKIP_PARAMS);
  }
  if (run || !execution.skipBody) {
    const result = validateParam(bodyValidator(context, request), request, 'body');
    if (result) return settle(result, context, request, 'body', SKIP_BODY);
  }
  if (run || !execution.skipQuery) {
    const result = validateParam(context[querystringSchema], request, 'query');
    if (result) return settle(result, context, request, 'querystring', SKIP_QUERY);
  }
  const result = validateParam(context[headersSchema], request, 'headers');
  if (result) return settle(result, context, request, 'headers', null);
  return false;
}

const SKIP_PARAMS = { skipParams: true, skipBody: false, skipQuery: false };
const SKIP_BODY = { skipParams: true, skipBody: true, skipQuery: false };
const SKIP_QUERY = { skipParams: true, skipBody: true, skipQuery: true };

// The error of a failed validation, or for an asynchronous one, a promise of it (or of the validation of the rest).
function settle(result, context, request, dataVar, next) {
  if (typeof result.then !== 'function') return wrapValidationError(result, dataVar, context.schemaErrorFormatter);
  return result.then((asyncResult) => {
    if (asyncResult) return wrapValidationError(asyncResult, dataVar, context.schemaErrorFormatter);
    return next === null ? false : validate(context, request, next);
  });
}

module.exports = {
  symbols: { bodySchema, querystringSchema, responseSchema, paramsSchema, headersSchema },
  compileSchemasForValidation,
  compileSchemasForSerialization,
  validate,
  lowerCaseHeadersSchema,
};

},
"@xufa/http/lib/validator-compiler.js": function (module, exports, require) {
// The default validator compiler, built on @xufa/schema (loaded when a route has a schema to validate). Validation
// functions have the interface of ajv's, which the rest of the framework and custom error formatters rely on:
// fn(data) returns a boolean and sets fn.errors to ajv-like error objects ({ instancePath, schemaPath, keyword,
// params, message }) when it fails.
//
// The data is changed as fastify's ajv configuration does: coerceTypes 'array', useDefaults, removeAdditional.

const DEFAULT_OPTIONS = Object.freeze({
  coerceTypes: 'array',
  useDefaults: true,
  removeAdditional: true,
  allErrors: false,
  formats: true,
});

// Options of ajv that @xufa/schema has too.
const OPTION_NAMES = ['coerceTypes', 'useDefaults', 'removeAdditional', 'allErrors', 'strict', 'formats', 'keywords'];

let validator = null;

// Loaded when a route first has a schema to validate (apps without schemas never load it).
function loadValidator() {
  if (validator === null) validator = require('@xufa/schema'); // eslint-disable-line global-require
  return validator;
}

const decodePointer = (segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~');

// The schema of the value at a path (to name the expected type in messages), or undefined.
function schemaAt(root, path, resolveRef) {
  let schema = resolve(root, resolveRef);
  for (const key of path) {
    if (!schema || typeof schema !== 'object') return undefined;
    let next;
    if (typeof key === 'number') {
      if (Array.isArray(schema.prefixItems) && key < schema.prefixItems.length) next = schema.prefixItems[key];
      else if (Array.isArray(schema.items)) next = schema.items[key];
      else next = schema.items;
    } else if (schema.properties && schema.properties[key] !== undefined) {
      next = schema.properties[key];
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      next = schema.additionalProperties;
    }
    schema = resolve(next, resolveRef);
  }
  return schema;
}

function resolve(schema, resolveRef) {
  let current = schema;
  for (let i = 0; i < 10 && current && typeof current === 'object' && typeof current.$ref === 'string'; i += 1) {
    current = resolveRef(current.$ref);
  }
  return current;
}

function typeName(schema, fallback) {
  if (schema && typeof schema === 'object' && schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (schema.nullable === true && !types.includes('null')) types.push('null');
    return types.join(',');
  }
  return fallback;
}

function parentPointer(error) {
  const index = error.pointer.lastIndexOf('/');
  return index === -1 ? '' : error.pointer.slice(0, index);
}

// An error of the validator as ajv reports it.
function toAjvError(error, rootSchema, resolveRef) {
  const { keyword, params } = error;
  const instancePath = error.pointer;
  const lastKey = error.path.length > 0 ? error.path[error.path.length - 1] : undefined;
  switch (keyword) {
    case 'type':
    case 'nullable': {
      const schema = schemaAt(rootSchema, error.path, resolveRef);
      const type = typeName(schema, params.type || 'object');
      return { instancePath, schemaPath: '#/type', keyword: 'type', params: { type }, message: `must be ${type}` };
    }
    case 'required':
      return {
        instancePath: parentPointer(error),
        schemaPath: '#/required',
        keyword,
        params: { missingProperty: String(lastKey) },
        message: `must have required property '${lastKey}'`,
      };
    case 'additionalProperties':
    case 'unevaluatedProperties':
      return {
        instancePath: parentPointer(error),
        schemaPath: `#/${keyword}`,
        keyword,
        params: { additionalProperty: params.property !== undefined ? params.property : String(lastKey) },
        message: `must NOT have ${keyword === 'additionalProperties' ? 'additional' : 'unevaluated'} properties`,
      };
    case 'dependentRequired':
    case 'dependencies':
      return {
        instancePath: parentPointer(error),
        schemaPath: `#/${keyword}`,
        keyword: 'dependencies',
        params: { property: params.property, missingProperty: String(lastKey) },
        message: `must have property ${lastKey} when property ${params.property} is present`,
      };
    default:
      break;
  }
  const limit = params.limit;
  let message;
  let ajvParams = params;
  switch (keyword) {
    case 'minLength':
      message = `must NOT have fewer than ${limit} characters`;
      break;
    case 'maxLength':
      message = `must NOT have more than ${limit} characters`;
      break;
    case 'pattern':
      message = `must match pattern "${params.pattern}"`;
      break;
    case 'format':
      message = `must match format "${params.format}"`;
      break;
    case 'minimum':
      message = `must be >= ${limit}`;
      ajvParams = { comparison: '>=', limit };
      break;
    case 'maximum':
      message = `must be <= ${limit}`;
      ajvParams = { comparison: '<=', limit };
      break;
    case 'exclusiveMinimum':
      message = `must be > ${limit}`;
      ajvParams = { comparison: '>', limit };
      break;
    case 'exclusiveMaximum':
      message = `must be < ${limit}`;
      ajvParams = { comparison: '<', limit };
      break;
    case 'multipleOf':
      message = `must be multiple of ${params.multipleOf}`;
      break;
    case 'enum':
      message = 'must be equal to one of the allowed values';
      break;
    case 'const':
      message = 'must be equal to constant';
      break;
    case 'minItems':
      message = `must NOT have fewer than ${limit} items`;
      break;
    case 'maxItems':
      message = `must NOT have more than ${limit} items`;
      break;
    case 'uniqueItems':
      message = `must NOT have duplicate items (items ## ${params.j} and ${params.i} are identical)`;
      break;
    case 'minProperties':
      message = `must NOT have fewer than ${limit} properties`;
      break;
    case 'maxProperties':
      message = `must NOT have more than ${limit} properties`;
      break;
    case 'contains':
    case 'minContains':
      message = `must contain at least ${params.limit || 1} valid item(s)`;
      break;
    case 'maxContains':
      message = `must contain at most ${limit} valid item(s)`;
      break;
    case 'not':
      message = 'must NOT be valid';
      break;
    case 'oneOf':
      message = 'must match exactly one schema in oneOf';
      ajvParams = { passingSchemas: params.passing === undefined ? null : params.passing };
      break;
    case 'anyOf':
      message = 'must match a schema in anyOf';
      break;
    case 'false':
      message = 'boolean schema is false';
      break;
    default:
      message = error.message;
  }
  return { instancePath, schemaPath: `#/${keyword}`, keyword, params: ajvParams, message };
}

function buildResolver(rootSchema, externalSchemas) {
  return function resolveRef(ref) {
    const hash = ref.indexOf('#');
    const id = hash === -1 ? ref : ref.slice(0, hash);
    const pointer = hash === -1 ? '' : ref.slice(hash + 1);
    let doc = rootSchema;
    if (id !== '') {
      doc = externalSchemas.find((schema) => schema.$id === id || schema.$id === `${id}#`);
      if (doc === undefined) return undefined;
    }
    let schema = doc;
    if (pointer.startsWith('/')) {
      for (const segment of pointer.slice(1).split('/').map(decodePointer)) {
        if (!schema || typeof schema !== 'object') return undefined;
        schema = schema[segment];
      }
    }
    return schema;
  };
}

function toAjvErrors(errors, schema, resolveRef) {
  if (errors.length === 0) {
    return [{ instancePath: '', schemaPath: '#', keyword: 'false', params: {}, message: 'must be valid' }];
  }
  return errors.map((error) => toAjvError(error, schema, resolveRef));
}

// Whether the value validated by a schema may be converted itself: schemas of other types than objects.
// The keywords of OpenAPI that describe a schema without checking anything: fastify's ajv ignores unknown keywords,
// and route schemas written for @fastify/swagger (@xufa/openapi) have them. They are declared to the validator as annotations
// (its option `keywords`), with every `x-` extension the schemas have, so other unknown keywords still throw (typos).
const OPENAPI_ANNOTATIONS = ['style', 'explode', 'allowReserved', 'example', 'externalDocs', 'xml'];

// The formats checked with formats: true: the built-in ones of the validator, and those of OpenAPI that fastify knows from
// ajv-formats. byte is base64 (as ajv-formats checks it); binary and password are any string; int32, int64, float
// and double are known but not checked (the validator checks formats of strings only, where ajv-formats checks the range of
// numbers).
let defaultFormats = null;

function formatsOf(given) {
  if (given !== true) return given;
  if (defaultFormats === null) {
    defaultFormats = {
      ...loadValidator().builtInFormats(),
      byte: /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      binary: false,
      password: false,
      int32: false,
      int64: false,
      float: false,
      double: false,
    };
  }
  return defaultFormats;
}

function withAnnotations(keywords, schemas) {
  const found = new Set(OPENAPI_ANNOTATIONS);
  const seen = new Set();
  const walk = (node) => {
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key.startsWith('x-')) found.add(key);
      walk(node[key]);
    }
  };
  schemas.forEach(walk);
  const given = Array.isArray(keywords) ? keywords : [];
  for (const item of given) if (typeof item === 'string') found.delete(item);
  return given.concat([...found]);
}

function coercesRoot(schema) {
  if (schema === null || typeof schema !== 'object' || schema.type === undefined) return false;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  return !types.includes('object');
}

class ValidatorCompiler {
  constructor(externalSchemas, options = {}) {
    const custom = { ...options.customOptions };
    this.options = { ...DEFAULT_OPTIONS };
    for (const name of OPTION_NAMES) if (custom[name] !== undefined) this.options[name] = custom[name];
    // ajv's strict mode for schemas: unknown keywords throw, unless it is off.
    if (custom.strictSchema === false || custom.strict === false) this.options.strict = false;
    if (options.validatorOptions) Object.assign(this.options, options.validatorOptions);
    this.externalSchemas = Object.values(externalSchemas || {});
    this.cache = new Map();
    this.constructorArgs = [externalSchemas, options];
    this.forResponses = null;
  }

  // The compiler of the validators of responses: the same schemas and options, without changing the data.
  responseCompiler() {
    if (this.forResponses === null) {
      const [externalSchemas, options] = this.constructorArgs;
      const customOptions = {
        ...options.customOptions,
        coerceTypes: false,
        useDefaults: false,
        removeAdditional: false,
      };
      this.forResponses = new ValidatorCompiler(externalSchemas, { ...options, customOptions });
    }
    return this.forResponses;
  }

  buildValidatorFunction({ schema, httpPart }) {
    // A response (validated by @xufa/openapi) is checked as it is: nothing converted, filled nor removed.
    if (httpPart === 'response') return this.responseCompiler().buildValidatorFunction({ schema });
    // Schemas with an $id are compiled once.
    if (schema && typeof schema === 'object' && schema.$id && this.cache.has(schema.$id)) {
      return this.cache.get(schema.$id);
    }
    const { compileJsonSchema } = loadValidator();
    const externals = this.externalSchemas.filter((external) => !(schema && external.$id === schema.$id));
    const resolveRef = buildResolver(schema, externals);
    const formats = formatsOf(this.options.formats);
    const keywords =
      this.options.strict === false
        ? this.options.keywords
        : withAnnotations(this.options.keywords, [schema, ...externals]);
    // The validator converts a value it is given only for the validation, where ajv (given the request as parent) converts
    // the request part itself. A schema of something else than an object (a body of "10" for a number) is checked
    // inside a holder object, so that the converted value can be given back.
    if (this.options.coerceTypes && coercesRoot(schema)) {
      const id = typeof schema.$id === 'string' && schema.$id[0] !== '#' ? schema.$id : 'xufa:validated-value';
      const documents = id === schema.$id ? externals.concat([schema]) : externals.concat([{ ...schema, $id: id }]);
      const holderSchema = { type: 'object', properties: { value: { $ref: id } } };
      const options = { ...this.options, formats, keywords, schemas: documents };
      const isValid = compileJsonSchema(holderSchema, { ...options, errors: false });
      let withErrors = null;
      const validateHeld = function validate(data) {
        const holder = { value: data };
        if (isValid(holder)) {
          validateHeld.errors = null;
          return holder.value === data ? true : { value: holder.value };
        }
        if (withErrors === null) withErrors = compileJsonSchema(holderSchema, { ...options, errors: 'objects' });
        validateHeld.errors = toAjvErrors(
          withErrors({ value: data }).map((error) => ({
            ...error,
            path: error.path.slice(1),
            pointer: error.pointer.slice('/value'.length),
          })),
          schema,
          resolveRef
        );
        return false;
      };
      validateHeld.errors = null;
      validateHeld.schema = schema;
      return validateHeld;
    }
    const options = { ...this.options, formats, keywords, schemas: externals };
    const isValid = compileJsonSchema(schema, { ...options, errors: false });
    let withErrors = null;
    function validate(data) {
      if (isValid(data)) {
        validate.errors = null;
        return true;
      }
      // The errors are only built for invalid data, with a second validator compiled the first time.
      if (withErrors === null) withErrors = compileJsonSchema(schema, { ...options, errors: 'objects' });
      validate.errors = toAjvErrors(withErrors(data), schema, resolveRef);
      return false;
    }
    validate.errors = null;
    validate.schema = schema;
    if (schema && typeof schema === 'object' && schema.$id) this.cache.set(schema.$id, validate);
    return validate;
  }
}

// What @fastify/ajv-compiler gives fastify: a builder of compilers, sharing them for equal schemas and options.
function ValidatorSelector() {
  const pool = new Map();
  return function buildCompilerFromPool(externalSchemas, options = {}) {
    const key = `${JSON.stringify(externalSchemas)}${JSON.stringify(options.customOptions)}${JSON.stringify(options.validatorOptions)}`;
    if (pool.has(key)) return pool.get(key);
    const compiler = new ValidatorCompiler(externalSchemas, options);
    const build = compiler.buildValidatorFunction.bind(compiler);
    pool.set(key, build);
    return build;
  };
}

module.exports = { ValidatorSelector, ValidatorCompiler, toAjvError, DEFAULT_OPTIONS };

},
"@xufa/http/lib/warnings.js": function (module, exports, require) {
// Process warnings, each emitted once unless unlimited (what process-warning does for fastify), and spyWarning()
// to watch them in tests.
const { format } = require('node:util');

const kWarningFn = Symbol('xufa.warning.fn');
const kWarningSpyData = Symbol('xufa.warning.spyData');

function createWarning({ name, code, message, unlimited = false } = {}) {
  if (!name) throw new Error('Warning name must not be empty');
  if (!code) throw new Error('Warning code must not be empty');
  if (!message) throw new Error('Warning message must not be empty');
  if (typeof unlimited !== 'boolean') throw new Error('Warning opts.unlimited must be a boolean');
  const upperCode = code.toUpperCase();

  // Returns whether the warning was emitted.
  function emit(a, b, c) {
    if (warning.emitted === true && warning.unlimited !== true) return false;
    warning.emitted = true;
    process.emitWarning(warning.format(a, b, c), warning.name, warning.code);
    return true;
  }

  // A function named as the warning (its name is the type of the warning emitted).
  const container = {
    [name](a, b, c) {
      return warning[kWarningFn](a, b, c);
    },
  };
  const warning = container[name];
  warning.emitted = false;
  warning.message = message;
  warning.unlimited = unlimited;
  warning.code = upperCode;
  warning[kWarningFn] = emit;
  warning[kWarningSpyData] = null;
  warning.format = function formatWarning(a, b, c) {
    if (a && b && c) return format(message, a, b, c);
    if (a && b) return format(message, a, b);
    if (a) return format(message, a);
    return message;
  };
  return warning;
}

function createDeprecation(params) {
  return createWarning({ ...params, name: 'DeprecationWarning' });
}

// Records the calls of a warning: { calls: [{ arguments, result }], callCount(), reset(), restore() }.
function spyWarning(warning) {
  if (warning[kWarningSpyData] === null) {
    const original = warning[kWarningFn];
    const spyData = {
      calls: [],
      callCount() {
        return spyData.calls.length;
      },
      reset() {
        warning.emitted = false;
        spyData.calls.length = 0;
      },
      restore() {
        spyData.reset();
        warning[kWarningFn] = original;
        warning[kWarningSpyData] = null;
      },
    };
    warning[kWarningFn] = function spied(a, b, c) {
      // Warnings are called as fn(a, b, c): trailing undefined arguments are not recorded.
      const args = c ? [a, b, c] : b ? [a, b] : a ? [a] : [];
      spyData.calls.push({ arguments: args, result: original(a, b, c) });
    };
    warning[kWarningSpyData] = spyData;
  }
  return warning[kWarningSpyData];
}

const XUFAWRN001 = createWarning({
  name: 'XufaWarning',
  code: 'XUFAWRN001',
  message: 'The %s schema for %s: %s is missing. This may indicate the schema is not well specified.',
  unlimited: true,
});

const XUFAWRN003 = createWarning({
  name: 'XufaWarning',
  code: 'XUFAWRN003',
  message: 'The %s mixes async and callback styles that may lead to unhandled rejections. Please use only one of them.',
  unlimited: true,
});

const XUFASEC001 = createWarning({
  name: 'XufaSecurity',
  code: 'XUFASEC001',
  message:
    'You are using /%s/ Content-Type which may be vulnerable to CORS attack. Please make sure your RegExp start with "^" or include ";?" to proper detection of the essence MIME type.',
  unlimited: true,
});

const XUFASEC002 = createWarning({
  name: 'XufaSecurity',
  code: 'XUFASEC002',
  message:
    'The headers schema for %s: %s references an external $ref (%s) that is not case-normalized. Header names in the referenced schema keep their original case and will not match the lowercased request headers, so case-insensitive assertions such as required and dependencies may not apply. Inline the header schema instead of referencing it with an external $ref.',
  unlimited: true,
});

module.exports = {
  createWarning,
  createDeprecation,
  spyWarning,
  XUFAWRN001,
  XUFAWRN003,
  XUFASEC001,
  XUFASEC002,
};

},
"@xufa/http/lib/wrap-thenable.js": function (module, exports, require) {
// The promise returned by a handler (or an error handler): its value is sent, its rejection is the error sent.
const diagnostics = require('node:diagnostics_channel');
const { kReplyIsError, kReplyHijacked } = require('./symbols');
const { setErrorStatusCode } = require('./error-handler');

const channels = diagnostics.tracingChannel('xufa.request.handler');

function wrapThenable(thenable, reply, store) {
  if (store) store.async = true;
  thenable.then(
    (payload) => {
      if (reply[kReplyHijacked] === true) return;
      if (store) channels.asyncStart.publish(store);
      try {
        // An async handler that called reply.send() itself returns undefined: nothing is sent then, unless the
        // response is still open (and the client still there).
        if (
          payload !== undefined ||
          (reply.sent === false &&
            reply.raw.headersSent === false &&
            reply.request.raw.aborted === false &&
            reply.request.socket &&
            !reply.request.socket.destroyed)
        ) {
          try {
            reply.send(payload);
          } catch (err) {
            reply[kReplyIsError] = true;
            reply.send(err);
          }
        }
      } finally {
        if (store) channels.asyncEnd.publish(store);
      }
    },
    (err) => {
      if (store) {
        store.error = err;
        setErrorStatusCode(reply, err);
        channels.error.publish(store);
        channels.asyncStart.publish(store);
      }
      try {
        if (reply.sent === true) {
          reply.log.error({ err }, 'Promise errored, but reply.sent = true was set');
          return;
        }
        reply[kReplyIsError] = true;
        reply.send(err);
      } catch (error) {
        // An error handler throwing again for an async handler.
        reply.send(error);
      } finally {
        if (store) channels.asyncEnd.publish(store);
      }
    }
  );
}

module.exports = wrapThenable;

},
"@xufa/http/lib/xufa.js": function (module, exports, require) {
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
  // Options of @xufa/schema itself, for the default validator compiler.
  if (options.validation) ajvOptions.validatorOptions = options.validation;

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
module.exports.devErrors = require('./dev-errors').devErrors;
module.exports.health = require('./health').health;
module.exports.maintenance = require('./maintenance').maintenance;

},
"@xufa/http/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/http","version":"0.1.0"};
},
"@xufa/inject/index.js": function (module, exports, require) {
// @xufa/inject: calls a request handler with a fake request and response, without a socket, and gives the response.
//
//   const res = await inject(handler, { method: 'POST', url: '/users', payload: { name: 'ada' } });
//   res.statusCode, res.headers, res.payload, res.json(), res.cookies
//
// The API of light-my-request: options or a chain (inject(handler).post('/users').payload(...).end()), a callback
// or a promise.
const Request = require('./lib/request');
const Response = require('./lib/response');
const { validateOptions } = require('./lib/options');

const ALREADY_INVOKED = 'The dispatch function has already been invoked';

// Streams of the old API (data events without _readableState) are read whole before dispatching.
function readOldStream(req, next) {
  const { payload } = req._lightMyRequest;
  if (!payload || payload._readableState || typeof payload.resume !== 'function') {
    next();
    return;
  }
  const chunks = [];
  payload.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  payload.on('end', () => {
    const body = Buffer.concat(chunks);
    req.headers['content-length'] = req.headers['content-length'] || String(body.length);
    delete req.headers['transfer-encoding'];
    req._lightMyRequest.payload = body;
    next();
  });
  payload.resume();
}

function makeRequest(dispatch, server, req, res) {
  req.once('error', function onError(err) {
    if (this.destroyed) res.destroy(err);
  });
  req.once('close', function onClose() {
    if (this.destroyed && !this._error) res.destroy();
  });
  readOldStream(req, () => dispatch.call(server, req, res));
}

function doInject(dispatch, opts, callback) {
  const options = typeof opts === 'string' ? { url: opts } : opts;
  if (options.validate !== false) {
    if (typeof dispatch !== 'function') {
      const err = new Error('dispatchFunc should be a function');
      err.name = 'AssertionError';
      err.code = 'ERR_ASSERTION';
      throw err;
    }
    const errors = validateOptions(options);
    if (errors.length > 0) throw new Error(errors.join(','));
  }
  const server = options.server || {};
  const RequestClass = options.Request ? Request.CustomRequest : Request;

  // Express apps: their requests and responses get the fake ones as prototypes.
  if (dispatch.request && dispatch.request.app === dispatch) {
    Object.setPrototypeOf(Object.getPrototypeOf(dispatch.request), RequestClass.prototype);
    Object.setPrototypeOf(Object.getPrototypeOf(dispatch.response), Response.prototype);
  }

  if (typeof callback === 'function') {
    const req = new RequestClass(options);
    const res = new Response(req, callback);
    makeRequest(dispatch, server, req, res);
    return undefined;
  }
  return new Promise((resolve, reject) => {
    const req = new RequestClass(options);
    const res = new Response(req, resolve, reject);
    makeRequest(dispatch, server, req, res);
  });
}

function Chain(dispatch, option) {
  this.option = typeof option === 'string' ? { url: option } : { ...option };
  this.dispatch = dispatch;
  this._hasInvoked = false;
  this._promise = null;
  if (this.option.autoStart !== false) {
    process.nextTick(() => {
      if (!this._hasInvoked) this.end();
    });
  }
}

for (const method of ['delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace']) {
  Chain.prototype[method] = function setMethod(url) {
    if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
    this.option.url = url;
    this.option.method = method.toUpperCase();
    return this;
  };
}

for (const key of ['body', 'cookies', 'headers', 'payload', 'query']) {
  Chain.prototype[key] = function setOption(value) {
    if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
    this.option[key] = value;
    return this;
  };
}

Chain.prototype.end = function end(callback) {
  if (this._hasInvoked === true || this._promise) throw new Error(ALREADY_INVOKED);
  this._hasInvoked = true;
  if (typeof callback === 'function') {
    doInject(this.dispatch, this.option, callback);
    return undefined;
  }
  this._promise = doInject(this.dispatch, this.option);
  return this._promise;
};

for (const method of Object.getOwnPropertyNames(Promise.prototype)) {
  if (method === 'constructor') continue;
  Chain.prototype[method] = function promiseMethod(...args) {
    if (!this._promise) {
      if (this._hasInvoked === true) throw new Error(ALREADY_INVOKED);
      this._hasInvoked = true;
      this._promise = doInject(this.dispatch, this.option);
    }
    return this._promise[method](...args);
  };
}

function inject(dispatch, options, callback) {
  if (callback === undefined) return new Chain(dispatch, options);
  return doInject(dispatch, options, callback);
}

function isInjection(obj) {
  return (
    obj instanceof Request ||
    obj instanceof Response ||
    (obj != null && obj.constructor != null && obj.constructor.name === '_CustomLMRRequest')
  );
}

module.exports = inject;
module.exports.default = inject;
module.exports.inject = inject;
module.exports.isInjection = isInjection;
module.exports.Request = Request;
module.exports.Response = Response;

},
"@xufa/inject/lib/cookies.js": function (module, exports, require) {
// Writing request cookies and reading the Set-Cookie headers of responses.

// RFC 6265 cookie-name: a token.
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

function serialize(name, value) {
  if (!COOKIE_NAME.test(name)) throw new TypeError(`argument name is invalid: ${name}`);
  return `${name}=${encodeURIComponent(value)}`;
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const ATTRIBUTE_NAMES = { 'max-age': 'maxAge', httponly: 'httpOnly', samesite: 'sameSite' };

// One Set-Cookie header: { name, value, path, domain, expires, maxAge, secure, httpOnly, sameSite, ... }.
function parseSetCookie(header) {
  const parts = header.split(';').filter((part) => part.trim() !== '');
  const first = parts.shift() || '';
  const eq = first.indexOf('=');
  const name = eq === -1 ? '' : first.slice(0, eq).trim();
  const rawValue = eq === -1 ? first.trim() : first.slice(eq + 1).trim();
  const cookie = { name, value: decode(rawValue) };
  for (const part of parts) {
    const index = part.indexOf('=');
    const key = (index === -1 ? part : part.slice(0, index)).trim().toLowerCase();
    const value = index === -1 ? '' : part.slice(index + 1).trim();
    const attribute = ATTRIBUTE_NAMES[key] || key;
    if (key === 'expires') cookie.expires = new Date(value);
    else if (key === 'max-age') cookie.maxAge = Number.parseInt(value, 10);
    else if (key === 'secure' || key === 'httponly' || key === 'partitioned') cookie[attribute] = true;
    else cookie[attribute] = value;
  }
  return cookie;
}

// The cookies a response sets (what set-cookie-parser gives for it).
function parseResponseCookies(response) {
  const header = response.headers && response.headers['set-cookie'];
  if (!header) return [];
  return (Array.isArray(header) ? header : [header]).map(parseSetCookie);
}

module.exports = { serialize, parseSetCookie, parseResponseCookies };

},
"@xufa/inject/lib/form-data.js": function (module, exports, require) {
// A FormData payload as a multipart/form-data stream (the encoding of undici's fetch).
const { randomUUID } = require('node:crypto');
const { Readable } = require('node:stream');

function isFormDataLike(payload) {
  return (
    Boolean(payload) &&
    typeof payload === 'object' &&
    typeof payload.append === 'function' &&
    typeof payload.delete === 'function' &&
    typeof payload.get === 'function' &&
    typeof payload.getAll === 'function' &&
    typeof payload.has === 'function' &&
    typeof payload.set === 'function' &&
    payload[Symbol.toStringTag] === 'FormData'
  );
}

function formDataToStream(formData) {
  const encoder = new TextEncoder();
  const boundary = `----formdata-${randomUUID()}`;
  const prefix = `--${boundary}\r\nContent-Disposition: form-data`;
  const escape = (str) => str.replace(/\n/g, '%0A').replace(/\r/g, '%0D').replace(/"/g, '%22');
  const normalizeLinefeeds = (value) => value.replace(/\r?\n|\r/g, '\r\n');
  const linebreak = new Uint8Array([13, 10]);

  async function* parts() {
    for (const [name, value] of formData) {
      if (typeof value === 'string') {
        yield encoder.encode(`${prefix}; name="${escape(normalizeLinefeeds(name))}"\r\n\r\n`);
        yield encoder.encode(`${normalizeLinefeeds(value)}\r\n`);
      } else {
        let header = `${prefix}; name="${escape(normalizeLinefeeds(name))}"`;
        if (value.name) header += `; filename="${escape(value.name)}"`;
        header += `\r\nContent-Type: ${value.type || 'application/octet-stream'}\r\n\r\n`;
        yield encoder.encode(header);
        if (value.stream) yield* value.stream();
        else yield value;
        yield linebreak;
      }
    }
    yield encoder.encode(`--${boundary}--`);
  }

  return { stream: Readable.from(parts()), contentType: `multipart/form-data; boundary=${boundary}` };
}

module.exports = { isFormDataLike, formDataToStream };

},
"@xufa/inject/lib/options.js": function (module, exports, require) {
// Checks of the options of inject(), with the messages of light-my-request (which come from ajv).
const { METHODS } = require('node:http');

const methods = new Set([...METHODS, 'QUERY'].flatMap((m) => [m, m.toLowerCase()]));

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function urlErrors(value) {
  if (typeof value === 'string') return [];
  if (isObject(value) && typeof value.pathname === 'string') return [];
  return ['must be string', 'must be object', 'must match exactly one schema in oneOf'];
}

// The messages of the first problems found, or an empty array when the options are valid.
function validateOptions(options) {
  if (!isObject(options)) return ['must be object'];
  const hasUrl = options.url !== undefined;
  const hasPath = options.path !== undefined;
  if (!hasUrl && !hasPath) {
    return [
      "must have required property 'url'",
      "must have required property 'path'",
      'must match exactly one schema in oneOf',
    ];
  }
  if (hasUrl && urlErrors(options.url).length) return urlErrors(options.url);
  if (hasPath && urlErrors(options.path).length) return urlErrors(options.path);
  for (const key of ['cookies', 'headers']) {
    if (options[key] !== undefined && !isObject(options[key])) return ['must be object'];
  }
  if (options.query !== undefined && !isObject(options.query) && typeof options.query !== 'string') {
    return ['must be object', 'must be string', 'must match a schema in anyOf'];
  }
  if (options.simulate !== undefined) {
    if (!isObject(options.simulate)) return ['must be object'];
    for (const key of ['end', 'split', 'error', 'close']) {
      if (options.simulate[key] !== undefined && typeof options.simulate[key] !== 'boolean') return ['must be boolean'];
    }
  }
  for (const key of ['authority', 'remoteAddress']) {
    if (options[key] !== undefined && typeof options[key] !== 'string') return ['must be string'];
  }
  if (options.method !== undefined) {
    if (typeof options.method !== 'string') return ['must be string'];
    if (!methods.has(options.method)) return ['must be equal to one of the allowed values'];
  }
  if (options.validate !== undefined && typeof options.validate !== 'boolean') return ['must be boolean'];
  return [];
}

module.exports = { validateOptions };

},
"@xufa/inject/lib/request.js": function (module, exports, require) {
// The fake IncomingMessage: a Readable stream of the payload with the url, method and headers of a request.
const { Readable, addAbortSignal } = require('node:stream');
const util = require('node:util');
const { EventEmitter } = require('node:events');
const { parseURL } = require('./url');
const { serialize } = require('./cookies');
const { isFormDataLike, formDataToStream } = require('./form-data');

let connectionWarned = false;

function hostHeader(url) {
  return url.port ? url.host : url.hostname + (url.protocol === 'https:' ? ':443' : ':80');
}

class MockSocket extends EventEmitter {
  constructor(remoteAddress) {
    super();
    this.remoteAddress = remoteAddress;
  }
}

function Request(options) {
  Readable.call(this, { autoDestroy: false });
  const url = parseURL(options.url || options.path, options.query);
  this.url = url.pathname + url.search;
  this.aborted = false;
  this.httpVersionMajor = 1;
  this.httpVersionMinor = 1;
  this.httpVersion = '1.1';
  this.method = options.method ? options.method.toUpperCase() : 'GET';
  this.headers = {};
  this.rawHeaders = [];

  const headers = options.headers || {};
  for (const field of Object.keys(headers)) {
    const name = field.toLowerCase();
    const value = headers[field];
    if ((name === 'user-agent' || name === 'content-type') && value === undefined) {
      this.headers[name] = undefined;
      continue;
    }
    if (value === undefined) {
      const err = new Error(`invalid value "undefined" for header ${field}`);
      err.code = 'ERR_ASSERTION';
      throw err;
    }
    this.headers[name] = `${value}`;
  }
  if (!('user-agent' in this.headers)) this.headers['user-agent'] = 'lightMyRequest';
  this.headers.host = this.headers.host || options.authority || hostHeader(url);

  if (options.cookies) {
    const values = Object.keys(options.cookies).map((key) => serialize(key, options.cookies[key]));
    if (this.headers.cookie) values.unshift(this.headers.cookie);
    this.headers.cookie = values.join('; ');
  }

  this.socket = new MockSocket(options.remoteAddress || '127.0.0.1');
  Object.defineProperty(this, 'connection', {
    get() {
      if (!connectionWarned) {
        connectionWarned = true;
        process.emitWarning('You are accessing "request.connection", use "request.socket" instead.', {
          type: 'DeprecationWarning',
          code: 'XUFA_INJECT_DEP01',
        });
      }
      return this.socket;
    },
    configurable: true,
  });

  let payload = options.payload || options.body || null;
  let isStream = Boolean(payload) && typeof payload.resume === 'function';
  if (isFormDataLike(payload)) {
    const form = formDataToStream(payload);
    payload = form.stream;
    isStream = true;
    this.headers['content-type'] = form.contentType;
    this.headers['transfer-encoding'] = 'chunked';
  }
  if (payload && typeof payload !== 'string' && !isStream && !Buffer.isBuffer(payload)) {
    payload = JSON.stringify(payload);
    if (!('content-type' in this.headers)) this.headers['content-type'] = 'application/json';
  }
  if (payload && !isStream && !Object.hasOwn(this.headers, 'content-length')) {
    this.headers['content-length'] = String(Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload));
  }
  for (const header of Object.keys(this.headers)) this.rawHeaders.push(header, this.headers[header]);

  this._lightMyRequest = {
    payload,
    isDone: false,
    simulate: options.simulate || {},
    payloadAsStream: options.payloadAsStream,
    signal: options.signal,
  };
  if (options.signal) addAbortSignal(options.signal, this);

  if (payload && payload._readableState) {
    this._read = readStream;
    payload.on('error', (err) => this.destroy(err));
    payload.on('end', () => this.push(null));
  } else {
    this._read = readEverythingElse;
  }
  return this;
}

function readStream() {
  const { payload } = this._lightMyRequest;
  let more = true;
  let pushed = false;
  let chunk;
  // eslint-disable-next-line no-cond-assign
  while (more && (chunk = payload.read())) {
    pushed = true;
    more = this.push(chunk);
  }
  // Waits for data only when there was none: otherwise the stream calls _read() again.
  if (more && !pushed) payload.once('readable', this._read.bind(this));
}

function readEverythingElse() {
  setImmediate(() => {
    const state = this._lightMyRequest;
    if (state.isDone) {
      if (state.simulate.end !== false) this.push(null);
      return;
    }
    state.isDone = true;
    if (state.payload) {
      if (state.simulate.split) {
        this.push(state.payload.slice(0, 1));
        this.push(state.payload.slice(1));
      } else {
        this.push(state.payload);
      }
    }
    if (state.simulate.error) this.emit('error', new Error('Simulated'));
    if (state.simulate.close) this.emit('close');
    if (state.simulate.end !== false) this.push(null);
  });
}

util.inherits(Request, Readable);

Request.prototype.destroy = function destroy(error) {
  if (this.destroyed || this._lightMyRequest.isDone) return;
  this.destroyed = true;
  if (error) {
    this._error = true;
    process.nextTick(() => this.emit('error', error));
  }
  process.nextTick(() => this.emit('close'));
};

// A request whose prototype chain also has options.Request (a class of the framework's own requests).
function CustomRequest(options) {
  function _CustomLMRRequest(obj) {
    Request.call(obj, { ...options, Request: undefined });
    Object.assign(this, obj);
    for (const fn of Object.keys(Request.prototype)) this.constructor.prototype[fn] = Request.prototype[fn];
    util.inherits(this.constructor, options.Request);
    return this;
  }
  return new _CustomLMRRequest(this);
}

util.inherits(CustomRequest, Request);

module.exports = Request;
module.exports.Request = Request;
module.exports.CustomRequest = CustomRequest;

},
"@xufa/inject/lib/response.js": function (module, exports, require) {
// The fake ServerResponse: a real http.ServerResponse on a socket that drops its bytes, whose writes are kept to
// build the result of the injection.
const http = require('node:http');
const { Writable, Readable, addAbortSignal } = require('node:stream');
const util = require('node:util');
const { parseResponseCookies } = require('./cookies');

function nullSocket() {
  return new Writable({
    write(chunk, encoding, callback) {
      setImmediate(callback);
    },
  });
}

function Response(req, onEnd, reject) {
  http.ServerResponse.call(this, req);
  if (req._lightMyRequest && req._lightMyRequest.payloadAsStream) {
    const read = this.emit.bind(this, 'drain');
    this._lightMyRequest = { headers: null, trailers: {}, stream: new Readable({ read }) };
    if (req._lightMyRequest.signal) addAbortSignal(req._lightMyRequest.signal, this._lightMyRequest.stream);
  } else {
    this._lightMyRequest = { headers: null, trailers: {}, payloadChunks: [] };
  }
  // Makes the response render its headers even when none is set.
  this.setHeader('foo', 'bar');
  this.removeHeader('foo');
  this.assignSocket(nullSocket());
  this._promiseCallback = typeof reject === 'function';

  let called = false;
  const onEndSuccess = (payload) => {
    if (called) return;
    called = true;
    if (this._promiseCallback) process.nextTick(() => onEnd(payload));
    else process.nextTick(() => onEnd(null, payload));
  };
  this._lightMyRequest.onEndSuccess = onEndSuccess;

  let finished = false;
  const onEndFailure = (error) => {
    let err = error;
    if (called) {
      if (this._lightMyRequest.stream && !finished) {
        if (!err) {
          err = new Error('response destroyed before completion');
          err.code = 'LIGHT_ECONNRESET';
        }
        this._lightMyRequest.stream.destroy(err);
        this._lightMyRequest.stream.on('error', () => {});
      }
      return;
    }
    called = true;
    if (!err) {
      err = new Error('response destroyed before completion');
      err.code = 'LIGHT_ECONNRESET';
    }
    if (this._promiseCallback) process.nextTick(() => reject(err));
    else process.nextTick(() => onEnd(err, null));
  };

  if (this._lightMyRequest.stream) {
    this.once('finish', () => {
      finished = true;
      this._lightMyRequest.stream.push(null);
    });
  } else {
    this.once('finish', () => {
      const res = generatePayload(this);
      res.raw.req = req;
      onEndSuccess(res);
    });
  }
  this.connection.once('error', onEndFailure);
  this.once('error', onEndFailure);
  this.once('close', onEndFailure);
}

util.inherits(Response, http.ServerResponse);

Response.prototype.setTimeout = function setTimeoutFn(msecs, callback) {
  this.timeoutHandle = setTimeout(() => this.emit('timeout'), msecs);
  this.on('timeout', callback);
  return this;
};

Response.prototype.writeHead = function writeHead(...args) {
  const result = http.ServerResponse.prototype.writeHead.apply(this, args);
  copyHeaders(this);
  if (this._lightMyRequest.stream) this._lightMyRequest.onEndSuccess(generatePayload(this));
  return result;
};

Response.prototype.write = function write(data, encoding, callback) {
  if (this.timeoutHandle) clearTimeout(this.timeoutHandle);
  http.ServerResponse.prototype.write.call(this, data, encoding, callback);
  const chunk = Buffer.from(data, encoding);
  if (this._lightMyRequest.stream) return this._lightMyRequest.stream.push(chunk);
  this._lightMyRequest.payloadChunks.push(chunk);
  return true;
};

Response.prototype.end = function end(data, encoding, callback) {
  if (data) this.write(data, encoding);
  http.ServerResponse.prototype.end.call(this, callback);
  this.emit('finish');
  // 'close' too, for stream.finished()
  this.destroy();
};

Response.prototype.destroy = function destroy(error) {
  if (this.destroyed) return;
  this.destroyed = true;
  if (error) process.nextTick(() => this.emit('error', error));
  process.nextTick(() => this.emit('close'));
};

Response.prototype.addTrailers = function addTrailers(trailers) {
  for (const key of Object.keys(trailers)) {
    this._lightMyRequest.trailers[key.toLowerCase().trim()] = trailers[key].toString().trim();
  }
};

const RAW_HEADERS = ['Date', 'Connection', 'Transfer-Encoding'].map((name) => [
  name.toLowerCase(),
  new RegExp(`\\r\\n${name}: ([^\\r]*)\\r\\n`),
]);

function copyHeaders(response) {
  const headers = { ...response.getHeaders() };
  // Headers Node.js adds itself are only in the head it wrote.
  for (const [name, regex] of RAW_HEADERS) {
    const field = response._header && response._header.match(regex);
    if (field) headers[name] = field[1];
  }
  response._lightMyRequest.headers = headers;
}

function serializeHeaders(response) {
  const { headers } = response._lightMyRequest;
  for (const name of Object.keys(headers)) {
    const value = headers[name];
    headers[name] = Array.isArray(value) ? value.map((v) => `${v}`) : `${value}`;
  }
}

function generatePayload(response) {
  if (response._lightMyRequest.headers === null) copyHeaders(response);
  serializeHeaders(response);
  const res = {
    raw: { res: response },
    headers: response._lightMyRequest.headers,
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
    trailers: response._lightMyRequest.trailers,
    get cookies() {
      return parseResponseCookies(this);
    },
  };
  const chunks = response._lightMyRequest.payloadChunks;
  if (chunks) {
    const raw = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    res.rawPayload = raw;
    res.payload = raw.toString();
    res.body = res.payload;
    res.json = function parseJsonPayload() {
      return JSON.parse(res.payload);
    };
  } else {
    res.json = function noJson() {
      throw new Error('Response payload is not available with payloadAsStream: true');
    };
  }
  res.stream = function streamPayload() {
    return response._lightMyRequest.stream || Readable.from(response._lightMyRequest.payloadChunks);
  };
  return res;
}

module.exports = Response;

},
"@xufa/inject/lib/url.js": function (module, exports, require) {
// The URL of an injected request, with the query given in the options merged in.
const BASE_URL = 'http://localhost';

function parseURL(url, query) {
  let target = url;
  if ((typeof target === 'string' || target instanceof String) && String(target).startsWith('//')) {
    target = BASE_URL + target;
  }
  const result =
    typeof target === 'object' && !(target instanceof String)
      ? Object.assign(new URL(BASE_URL), target)
      : new URL(String(target), BASE_URL);

  if (typeof query === 'string') {
    const params = new URLSearchParams(query);
    for (const key of params.keys()) {
      result.searchParams.delete(key);
      for (const value of params.getAll(key)) result.searchParams.append(key, value);
    }
  } else {
    const merged = { ...(typeof target === 'object' ? target.query : undefined), ...query };
    for (const key of Object.keys(merged)) {
      const value = merged[key];
      if (Array.isArray(value)) {
        result.searchParams.delete(key);
        for (const item of value) result.searchParams.append(key, item);
      } else {
        result.searchParams.set(key, value);
      }
    }
  }
  return result;
}

module.exports = { parseURL };

},
"@xufa/inject/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/inject","version":"0.1.0"};
},
"@xufa/logger/index.js": function (module, exports, require) {
// @xufa/logger: a JSON logger with the API of pino. Lines are built as strings: the bindings of a logger are
// serialized once, when it is created, and each line adds its level, time, the properties logged and the message.
const os = require('node:os');
const { asString, asKey, stringify } = require('./lib/stringify');
const { format } = require('./lib/format');
const { createRedactor } = require('./lib/redact');
const stdSerializers = require('./lib/serializers');
const { Destination } = require('./lib/destination');
const { version } = require('./package.json');

const DEFAULT_LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

const configSym = Symbol('xufa.logger.config');
const chindingsSym = Symbol('xufa.logger.chindings');
const serializersSym = Symbol('xufa.logger.serializers');
const redactSym = Symbol('xufa.logger.redact');
const levelValSym = Symbol('xufa.logger.levelVal');
const levelSym = Symbol('xufa.logger.level');
const msgPrefixSym = Symbol('xufa.logger.msgPrefix');
const streamSym = Symbol('xufa.logger.stream');
const writeSym = Symbol('xufa.logger.write');
const needsMetadataGsym = Symbol.for('pino.metadata');

const symbols = {
  configSym,
  chindingsSym,
  serializersSym,
  redactSym,
  levelValSym,
  msgPrefixSym,
  streamSym,
  writeSym,
  needsMetadataGsym,
};

// The ISO time with nanoseconds: the wall clock when the module was loaded, advanced by the monotonic clock.
const NS_PER_MS = 1000000n;
const startNs = BigInt(Date.now()) * NS_PER_MS;
const startHr = process.hrtime.bigint();
function isoTimeNano() {
  const now = startNs + (process.hrtime.bigint() - startHr);
  const iso = new Date(Number(now / NS_PER_MS)).toISOString(); // 2026-10-02T12:34:56.789Z
  const nanos = (now % 1000000000n).toString().padStart(9, '0');
  return `,"time":"${iso.slice(0, 19)}.${nanos}Z"`;
}

// The time of a line changes once a millisecond: its text is made once a millisecond. Made from two numbers small
// enough to be integers for V8 (a count of milliseconds since 1970 is not), so written without the conversion of a
// double.
let epochMs = -1;
let epochPart = '';
function epochTime() {
  const now = Date.now();
  if (now !== epochMs) {
    epochMs = now;
    const low = now % 1000000;
    epochPart = `,"time":${(now - low) / 1000000}${low < 100000 ? `${low}`.padStart(6, '0') : low}`;
  }
  return epochPart;
}

let isoMs = -1;
let isoPart = '';
function isoTime() {
  const now = Date.now();
  if (now !== isoMs) {
    isoMs = now;
    isoPart = `,"time":"${new Date(now).toISOString()}"`;
  }
  return isoPart;
}

const stdTimeFunctions = {
  epochTime,
  unixTime: () => `,"time":${Math.round(Date.now() / 1000)}`,
  isoTime,
  isoTimeNano,
  nullTime: () => '',
};

function noop() {}

// The properties of an object as JSON members, each one preceded by a comma.
function members(obj) {
  let out = '';
  for (const key in obj) {
    const value = obj[key];
    if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const json = stringify(value, obj);
    if (json !== undefined) out += `,${asKey(key)}:${json}`;
  }
  return out;
}

// The logging function of one level, shared by every logger: logger.info(obj?, msg?, ...args).
// `levelPart` is the start of its lines, made once: {"level":30 (or what formatters.level makes of it).
function createLogFunction(levelVal, levelPart) {
  return function LOG(a, b) {
    const config = this[configSym];
    if (config.logMethod !== null) {
      config.logMethod.call(
        this,
        Array.prototype.slice.call(arguments),
        (...args) => write(this, levelVal, args),
        levelVal
      );
      return;
    }
    const argc = arguments.length;
    let obj;
    let msg;
    if (typeof a === 'object' && a !== null) {
      if (argc > 1) msg = typeof b === 'string' && argc > 2 ? format(b, arguments, 2) : b;
      if (a instanceof Error) {
        obj = { [config.errorKey]: a };
        if (msg === undefined) msg = a.message;
      } else {
        obj = a;
        // An error logged in an object gives the message, when there is none.
        if (msg === undefined && a[config.messageKey] === undefined && a[config.errorKey]) {
          msg = a[config.errorKey].message;
        }
      }
    } else {
      msg = typeof a === 'string' && argc > 1 ? format(a, arguments, 1) : a;
    }
    this[writeSym](obj, msg, levelVal, levelPart);
  };
}

function write(logger, levelVal, args) {
  const config = logger[configSym];
  const saved = config.logMethod;
  config.logMethod = null;
  try {
    config.logFunctions[levelVal].apply(logger, args);
  } finally {
    config.logMethod = saved;
  }
}

function Logger() {
  this[configSym] = null;
  this[chindingsSym] = '';
  this[serializersSym] = null;
  this[redactSym] = null;
  this[msgPrefixSym] = '';
}

// The level of a logger is in its prototype: one object per level of a configuration, with the level and the function
// of every level name (noop below the level), shared by every logger set at that level; a change of level is a change
// of prototype. A child without a level of its own has its parent as prototype, as in pino: it follows the level of
// its parent, changes included, until a level is set on it.
function levelPrototype(config, value, label) {
  let proto = config.levelPrototypes.get(value);
  if (proto === undefined) {
    proto = Object.create(Logger.prototype);
    proto[levelSym] = label;
    proto[levelValSym] = value;
    const { values } = config.levels;
    for (const name of config.levelNames) {
      proto[name] = config.enabled && values[name] >= value ? config.logFunctions[values[name]] : noop;
    }
    config.levelPrototypes.set(value, proto);
  }
  return proto;
}

// A logger of a configuration at a level, with its own members to be set.
function newLogger(config, proto) {
  const logger = Object.create(proto);
  logger[configSym] = config;
  logger[chindingsSym] = '';
  logger[serializersSym] = null;
  logger[redactSym] = null;
  logger[msgPrefixSym] = '';
  return logger;
}

Logger.prototype[writeSym] = function writeLine(obj, msg, levelVal, levelPart) {
  const config = this[configSym];
  let line = (levelPart === undefined ? config.levelPart(levelVal) : levelPart) + config.time() + this[chindingsSym];
  if (config.slow || this[redactSym] !== null) {
    line += members(transform(this, config, obj, levelVal));
  } else if (obj !== undefined) {
    const serializers = this[serializersSym];
    for (const key in obj) {
      let value = obj[key];
      if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const serializer = serializers[key];
      if (serializer !== undefined) value = serializer(value);
      const json = stringify(value, obj);
      if (json !== undefined) line += `,${asKey(key)}:${json}`;
    }
  }
  if (msg !== undefined) {
    const prefix = this[msgPrefixSym];
    if (typeof msg === 'string') line += `,${config.messageKeyJson}:${asString(prefix + msg)}`;
    else if (prefix !== '') line += `,${config.messageKeyJson}:${asString(prefix + String(msg))}`;
    else {
      const json = stringify(msg);
      if (json !== undefined) line += `,${config.messageKeyJson}:${json}`;
    }
  }
  line += config.end;
  if (config.streamWrite !== null) line = config.streamWrite(line);
  const { stream } = config;
  if (config.metadata) {
    stream.lastLevel = levelVal;
    stream.lastMsg = msg;
    stream.lastObj = obj;
    stream.lastLogger = this;
  }
  stream.write(line);
};

// The object logged after serializers, mixin, formatters.log, redaction and nestedKey.
function transform(logger, config, obj, levelVal) {
  const serializers = logger[serializersSym];
  let out = {};
  if (obj !== undefined) {
    for (const key in obj) {
      let value = obj[key];
      if (value === undefined || !Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const serializer = serializers[key];
      if (serializer !== undefined) value = serializer(value);
      out[key] = value;
    }
  }
  if (config.mixin !== null) {
    const mixed = config.mixin(obj === undefined ? {} : obj, levelVal, logger);
    if (mixed && typeof mixed === 'object') {
      out = config.mixinMergeStrategy ? config.mixinMergeStrategy(out, mixed) : Object.assign(mixed, out);
    }
  }
  if (config.formatLog !== null) out = config.formatLog(out);
  if (logger[redactSym] !== null) out = logger[redactSym](out);
  if (config.nestedKey !== null && Object.keys(out).length > 0) out = { [config.nestedKey]: out };
  return out;
}

Object.defineProperties(Logger.prototype, {
  level: {
    get() {
      return this[levelSym];
    },
    set(label) {
      const config = this[configSym];
      const { values } = config.levels;
      let value;
      if (label === 'silent') value = Infinity;
      else if (typeof label === 'number' && config.levels.labels[label] !== undefined) {
        value = label;
        // eslint-disable-next-line no-param-reassign
        label = config.levels.labels[label];
      } else {
        value = values[label];
      }
      if (value === undefined) throw new Error(`unknown level ${label}`);
      const proto = levelPrototype(config, value, label);
      if (Object.getPrototypeOf(this) !== proto) Object.setPrototypeOf(this, proto);
      // Functions of level names set on the logger itself give way to the ones of the level, as they did in pino.
      for (const name of config.levelNames) {
        if (Object.prototype.hasOwnProperty.call(this, name)) this[name] = proto[name];
      }
    },
  },
  levelVal: {
    get() {
      return this[levelValSym];
    },
  },
  levels: {
    get() {
      return this[configSym].levels;
    },
  },
  [streamSym]: {
    get() {
      return this[configSym].stream;
    },
  },
});

Logger.prototype.version = version;
Logger.prototype.silent = noop;

Logger.prototype.isLevelEnabled = function isLevelEnabled(label) {
  const value = this[configSym].levels.values[label];
  return value !== undefined && value >= this[levelValSym];
};

// The configuration of a child, as pino: a formatters.bindings applies to the bindings of the logger it is given to
// only (its own, and those of setBindings()), so a child has none but its own; a formatters.log of a child replaces
// the one of its parent. formatters.level is the parent's (pino ignores it in a child too). A derived configuration
// shares the level functions and prototypes of the one it comes from.
function childConfig(config, formatters) {
  if (formatters == null) {
    if (config.formatBindings === null) return config;
    if (config.unboundConfig === null) config.unboundConfig = deriveConfig(config, null, config.formatLog);
    return config.unboundConfig;
  }
  const formatBindings = typeof formatters.bindings === 'function' ? formatters.bindings : null;
  const formatLog = typeof formatters.log === 'function' ? formatters.log : config.formatLog;
  if (formatBindings === config.formatBindings && formatLog === config.formatLog) return config;
  return deriveConfig(config, formatBindings, formatLog);
}

function deriveConfig(config, formatBindings, formatLog) {
  const derived = { ...config, formatBindings, formatLog, unboundConfig: null };
  derived.slow = derived.mixin !== null || formatLog !== null || derived.nestedKey !== null;
  return derived;
}

Logger.prototype.child = function child(bindings, options) {
  if (!bindings || typeof bindings !== 'object') throw new Error('missing bindings for child Pino');
  const config = childConfig(this[configSym], options == null ? undefined : options.formatters);
  // The parent as prototype: the child follows its level (a level set on the child gives it a prototype of its own).
  const proto = this;
  if (options == null) {
    const instance = Object.create(proto);
    instance[configSym] = config;
    instance[chindingsSym] = this[chindingsSym] + serializeBindings(this, config, bindings);
    instance[serializersSym] = this[serializersSym];
    instance[redactSym] = this[redactSym];
    instance[msgPrefixSym] = this[msgPrefixSym];
    if (config.onChild !== null) config.onChild(instance);
    return instance;
  }
  const instance = newLogger(config, proto);
  let serializers = this[serializersSym];
  if (options && options.serializers) {
    serializers = Object.assign(Object.create(null), serializers);
    // Inherited serializers too: fastify chains the ones of plugins and routes with prototypes.
    // eslint-disable-next-line guard-for-in
    for (const key in options.serializers) serializers[key] = options.serializers[key];
  }
  instance[serializersSym] = serializers;
  instance[redactSym] = options && options.redact ? createRedactor(options.redact) : this[redactSym];
  instance[chindingsSym] = this[chindingsSym] + serializeBindings(instance, config, bindings);
  instance[msgPrefixSym] = options && options.msgPrefix ? this[msgPrefixSym] + options.msgPrefix : this[msgPrefixSym];
  if (options.level) instance.level = options.level;
  if (config.onChild !== null) config.onChild(instance);
  return instance;
};

function serializeBindings(logger, config, bindings) {
  const serializers = logger[serializersSym];
  // Most bindings: one pass, each value serialized and written.
  if (config.formatBindings === null && logger[redactSym] === null) {
    let out = '';
    for (const key in bindings) {
      let value = bindings[key];
      if (value === undefined || !Object.prototype.hasOwnProperty.call(bindings, key)) continue;
      if (serializers[key] !== undefined) value = serializers[key](value);
      const json = stringify(value, bindings);
      if (json !== undefined) out += `,${asKey(key)}:${json}`;
    }
    return out;
  }
  let values = config.formatBindings !== null ? config.formatBindings(bindings) : bindings;
  let copied = false;
  for (const key in values) {
    if (serializers[key] !== undefined && Object.prototype.hasOwnProperty.call(values, key)) {
      if (!copied) {
        values = { ...values };
        copied = true;
      }
      values[key] = serializers[key](values[key]);
    }
  }
  if (logger[redactSym] !== null) values = logger[redactSym](values);
  return members(values);
}

Logger.prototype.bindings = function bindings() {
  const result = JSON.parse(`{${this[chindingsSym].slice(1)}}`);
  delete result.pid;
  delete result.hostname;
  return result;
};

Logger.prototype.setBindings = function setBindings(newBindings) {
  this[chindingsSym] += serializeBindings(this, this[configSym], newBindings);
};

Logger.prototype.flush = function flush(cb) {
  const { stream } = this[configSym];
  if (typeof stream.flush === 'function') stream.flush(cb || noop);
  else if (cb) process.nextTick(cb);
};

function buildLevels(opts) {
  const custom = opts.customLevels || {};
  for (const name of Object.keys(custom)) {
    if (typeof custom[name] !== 'number') throw new Error(`level ${name} must be a number`);
    if (!opts.useOnlyCustomLevels && DEFAULT_LEVELS[name] !== undefined) {
      throw new Error(`levels cannot be overridden: ${name}`);
    }
  }
  const values = opts.useOnlyCustomLevels ? { ...custom } : { ...DEFAULT_LEVELS, ...custom };
  const labels = {};
  for (const name of Object.keys(values)) labels[values[name]] = name;
  return { values, labels };
}

function isStream(value) {
  return value !== null && typeof value === 'object' && typeof value.write === 'function';
}

function createLogger(options, destination) {
  let opts = options;
  let stream = destination;
  if (isStream(opts)) {
    stream = opts;
    opts = {};
  }
  opts = opts || {};
  if (stream === undefined) {
    if (opts.stream && opts.file) throw new Error('Cannot specify both stream and file');
    if (isStream(opts.stream)) stream = opts.stream;
    else if (opts.file) stream = new Destination({ dest: opts.file, sync: true, mkdir: true });
    else stream = new Destination({ dest: 1, sync: true });
  } else if (typeof stream === 'string' || typeof stream === 'number') {
    stream = new Destination({ dest: stream, sync: true });
  }
  if (opts.transport) throw new Error('@xufa/logger does not support transports; pass a stream instead');

  const levels = buildLevels(opts);
  const formatters = opts.formatters || {};
  const levelCache = new Map();
  const formatLevel = typeof formatters.level === 'function' ? formatters.level : null;
  let time = stdTimeFunctions.epochTime;
  if (opts.timestamp === false) time = stdTimeFunctions.nullTime;
  else if (typeof opts.timestamp === 'function') time = opts.timestamp;

  const config = {
    stream,
    levels,
    levelNames: Object.keys(levels.values),
    logFunctions: {},
    enabled: opts.enabled !== false,
    messageKey: opts.messageKey || 'msg',
    messageKeyJson: asKey(opts.messageKey || 'msg'),
    errorKey: opts.errorKey || 'err',
    nestedKey: opts.nestedKey || null,
    time,
    end: opts.crlf ? '}\r\n' : '}\n',
    formatBindings: typeof formatters.bindings === 'function' ? formatters.bindings : null,
    formatLog: typeof formatters.log === 'function' ? formatters.log : null,
    unboundConfig: null,
    mixin: typeof opts.mixin === 'function' ? opts.mixin : null,
    mixinMergeStrategy: typeof opts.mixinMergeStrategy === 'function' ? opts.mixinMergeStrategy : null,
    logMethod: opts.hooks && typeof opts.hooks.logMethod === 'function' ? opts.hooks.logMethod : null,
    streamWrite: opts.hooks && typeof opts.hooks.streamWrite === 'function' ? opts.hooks.streamWrite : null,
    onChild: typeof opts.onChild === 'function' ? opts.onChild : null,
    levelPrototypes: new Map(),
    metadata: stream[needsMetadataGsym] === true,
    slow: false,
    levelPart(levelVal) {
      let part = levelCache.get(levelVal);
      if (part === undefined) {
        part = formatLevel
          ? `{${members(formatLevel(levels.labels[levelVal], levelVal)).slice(1)}`
          : `{"level":${levelVal}`;
        levelCache.set(levelVal, part);
      }
      return part;
    },
  };
  config.slow = config.mixin !== null || config.formatLog !== null || config.nestedKey !== null;
  for (const name of config.levelNames) {
    const value = levels.values[name];
    config.logFunctions[value] = createLogFunction(value, config.levelPart(value));
  }

  const logger = newLogger(config, Logger.prototype);
  logger[serializersSym] = Object.assign(
    Object.create(null),
    { err: stdSerializers.err, [config.errorKey]: stdSerializers.err },
    opts.serializers
  );
  logger[redactSym] = createRedactor(opts.redact);
  logger[msgPrefixSym] = opts.msgPrefix || '';
  let base;
  if (opts.base === null) base = {};
  else if (opts.base) base = { ...opts.base };
  else base = { pid: process.pid, hostname: os.hostname() };
  if (opts.name !== undefined) base.name = opts.name;
  logger[chindingsSym] = serializeBindings(logger, config, base);
  const level = opts.level === undefined ? (opts.useOnlyCustomLevels ? config.levelNames[0] : 'info') : opts.level;
  logger.level = config.enabled ? level : 'silent';
  return logger;
}

// Writes each line to the streams whose level is at most the level of the line.
function multistream(streamsArray, options = {}) {
  const levels = { ...DEFAULT_LEVELS, ...(options.levels || {}) };
  const streams = (Array.isArray(streamsArray) ? streamsArray : [streamsArray]).map((entry) => {
    const item = isStream(entry) ? { stream: entry } : entry;
    const level = typeof item.level === 'number' ? item.level : levels[item.level || 'info'];
    return { stream: item.stream, level };
  });
  const result = {
    [needsMetadataGsym]: true,
    lastLevel: 0,
    streams,
    write(line) {
      for (const { stream, level } of streams) {
        if (this.lastLevel >= level) {
          stream.write(line);
          if (options.dedupe) break;
        }
      }
    },
    add(entry) {
      const item = isStream(entry) ? { stream: entry } : entry;
      streams.push({ stream: item.stream, level: levels[item.level || 'info'] });
      return result;
    },
    flushSync() {
      for (const { stream } of streams) if (typeof stream.flushSync === 'function') stream.flushSync();
    },
  };
  if (options.dedupe) streams.sort((a, b) => b.level - a.level);
  return result;
}

createLogger.destination = (dest) => new Destination(typeof dest === 'object' && dest !== null ? dest : { dest });
createLogger.multistream = multistream;
createLogger.stdSerializers = stdSerializers;
createLogger.stdTimeFunctions = stdTimeFunctions;
createLogger.symbols = symbols;
createLogger.levels = buildLevels({});
createLogger.version = version;
createLogger.Destination = Destination;
createLogger.Logger = Logger;
createLogger.createLogger = createLogger;
createLogger.pino = createLogger;
createLogger.default = createLogger;

module.exports = createLogger;

},
"@xufa/logger/lib/destination.js": function (module, exports, require) {
// A destination writing to a file descriptor or a file, synchronously or buffered (what sonic-boom does for pino).
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const MAX_WRITE = 16 * 1024;
const RETRY_CODES = new Set(['EAGAIN', 'EBUSY']);

class Destination extends EventEmitter {
  constructor(options = {}) {
    super();
    const opts = typeof options === 'object' && options !== null ? options : { dest: options };
    const dest = opts.dest !== undefined ? opts.dest : opts.fd !== undefined ? opts.fd : 1;
    this.sync = opts.sync !== false;
    this.minLength = opts.minLength || 0;
    this.maxLength = opts.maxLength || 0;
    this.append = opts.append !== false;
    this.mkdir = opts.mkdir === true;
    this.fsync = opts.fsync === true;
    this.buf = '';
    this.writing = false;
    this.ending = false;
    this.destroyed = false;
    this.flushCallbacks = [];
    this.fd = -1;
    this.file = null;
    if (typeof dest === 'number') {
      this.fd = dest;
      process.nextTick(() => this.emit('ready'));
    } else {
      this.file = String(dest);
      this.open();
    }
    if (!this.sync) {
      this.onExit = () => this.flushSync();
      process.once('exit', this.onExit);
    }
  }

  open() {
    if (this.mkdir) fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.fd = fs.openSync(this.file, this.append ? 'a' : 'w');
    process.nextTick(() => this.emit('ready'));
  }

  write(data) {
    if (this.destroyed) throw new Error('Destination destroyed');
    if (this.sync) {
      this.writeAllSync(data);
      return true;
    }
    if (this.maxLength && this.buf.length + data.length > this.maxLength) {
      this.emit('drop', data);
      return this.buf.length < MAX_WRITE;
    }
    this.buf += data;
    if (!this.writing && this.buf.length >= this.minLength) this.actualWrite();
    return this.buf.length < MAX_WRITE;
  }

  writeAllSync(data) {
    let buffer = Buffer.from(data);
    while (buffer.length > 0) {
      try {
        const written = fs.writeSync(this.fd, buffer);
        buffer = buffer.subarray(written);
      } catch (err) {
        if (!RETRY_CODES.has(err.code)) throw err;
      }
    }
    if (this.fsync) fs.fsyncSync(this.fd);
  }

  actualWrite() {
    this.writing = true;
    const chunk = Buffer.from(this.buf);
    this.buf = '';
    const done = (err, written) => {
      if (err) {
        if (RETRY_CODES.has(err.code)) {
          setTimeout(() => fs.write(this.fd, chunk, done), 10);
          return;
        }
        this.writing = false;
        this.emit('error', err);
        return;
      }
      if (written < chunk.length) {
        this.buf = chunk.subarray(written).toString() + this.buf;
      }
      this.writing = false;
      if (this.buf.length > 0 && (this.buf.length >= this.minLength || this.flushCallbacks.length || this.ending)) {
        this.actualWrite();
        return;
      }
      this.emit('drain');
      this.afterFlush();
    };
    fs.write(this.fd, chunk, 0, chunk.length, null, done);
  }

  afterFlush() {
    if (this.writing || this.buf.length > 0) return;
    const callbacks = this.flushCallbacks;
    this.flushCallbacks = [];
    for (const cb of callbacks) cb();
    if (this.ending) this.close();
  }

  flush(cb) {
    if (this.sync || (!this.writing && this.buf.length === 0)) {
      if (cb) process.nextTick(cb);
      return;
    }
    if (cb) this.flushCallbacks.push(cb);
    if (!this.writing) this.actualWrite();
  }

  flushSync() {
    if (this.destroyed || this.buf.length === 0) return;
    if (this.writing) {
      // The pending asynchronous write finishes on its own; write what came after it.
      const rest = this.buf;
      this.buf = '';
      this.writeAllSync(rest);
      return;
    }
    const data = this.buf;
    this.buf = '';
    this.writeAllSync(data);
  }

  reopen(file) {
    if (this.file === null) return;
    this.flushSync();
    if (file) this.file = file;
    const old = this.fd;
    this.open();
    if (old > 2) fs.closeSync(old);
  }

  end() {
    if (this.destroyed || this.ending) return;
    this.ending = true;
    if (this.sync || (!this.writing && this.buf.length === 0)) {
      this.close();
      return;
    }
    if (!this.writing) this.actualWrite();
  }

  close() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.onExit) process.removeListener('exit', this.onExit);
    const finish = () => {
      this.emit('finish');
      this.emit('close');
    };
    if (this.fd > 2) {
      fs.close(this.fd, finish);
    } else {
      process.nextTick(finish);
    }
  }

  destroy() {
    this.buf = '';
    this.close();
  }
}

module.exports = { Destination };

},
"@xufa/logger/lib/format.js": function (module, exports, require) {
// printf-like messages: %s %d %i %f %j %o %O %%, as pino formats them.
const { safeStringify } = require('./stringify');

function asJson(value) {
  if (typeof value === 'string') return `'${value}'`;
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return safeStringify(value);
  }
}

// Formats `message` with the arguments of `args` from index `start`. Arguments without a placeholder are ignored.
function format(message, args, start) {
  if (start >= args.length || message.indexOf('%') === -1) return message;
  let out = '';
  let last = 0;
  let argIndex = start;
  const len = message.length;
  for (let i = 0; i < len - 1; i += 1) {
    if (message.charCodeAt(i) !== 37) continue; // %
    const type = message[i + 1];
    if (type === '%') {
      out += message.slice(last, i + 1);
      last = i + 2;
      i += 1;
      continue;
    }
    if (argIndex >= args.length) break;
    let replacement;
    const arg = args[argIndex];
    switch (type) {
      case 's':
        replacement = typeof arg === 'object' && arg !== null ? asJson(arg) : String(arg);
        break;
      case 'd':
      case 'f':
        if (arg == null) replacement = String(arg);
        else replacement = String(Number(arg));
        break;
      case 'i':
        if (arg == null) replacement = String(arg);
        else replacement = String(Math.floor(Number(arg)));
        break;
      case 'j':
      case 'o':
      case 'O':
        replacement = asJson(arg);
        break;
      default:
        continue;
    }
    argIndex += 1;
    out += message.slice(last, i) + replacement;
    last = i + 2;
    i += 1;
  }
  return last === 0 ? message : out + message.slice(last);
}

module.exports = { format };

},
"@xufa/logger/lib/redact.js": function (module, exports, require) {
// Redaction of paths (`req.headers.authorization`, `users[*].password`, `a["b-c"]`) without changing the objects
// logged: the containers on the way to a redacted value are copied.

function parsePath(path) {
  const segments = [];
  let i = 0;
  let current = '';
  const flush = () => {
    if (current !== '') segments.push(current);
    current = '';
  };
  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      flush();
      i += 1;
    } else if (ch === '[') {
      flush();
      const end = path.indexOf(']', i);
      if (end === -1) throw new Error(`Invalid redaction path: ${path}`);
      let inner = path.slice(i + 1, end).trim();
      if ((inner[0] === '"' || inner[0] === "'") && inner[inner.length - 1] === inner[0]) inner = inner.slice(1, -1);
      segments.push(inner);
      i = end + 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  flush();
  if (segments.length === 0) throw new Error(`Invalid redaction path: ${path}`);
  return segments;
}

const clone = (value) => (Array.isArray(value) ? value.slice() : { ...value });
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function applyPath(value, segments, index, rule, trail) {
  if (value === null || typeof value !== 'object') return value;
  const segment = segments[index];
  const last = index === segments.length - 1;
  const keys = segment === '*' ? Object.keys(value) : hasOwn(value, segment) ? [segment] : null;
  if (keys === null) return value;
  let copy = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const child = value[key];
    trail.push(key);
    if (last) {
      copy = copy || clone(value);
      if (rule.remove) delete copy[key];
      else copy[key] = rule.censorFn ? rule.censor(child, trail.slice()) : rule.censor;
    } else {
      const replaced = applyPath(child, segments, index + 1, rule, trail);
      if (replaced !== child) {
        copy = copy || clone(value);
        copy[key] = replaced;
      }
    }
    trail.pop();
  }
  return copy || value;
}

// Returns a function giving the object with the paths redacted, or null when there is nothing to redact.
function createRedactor(options) {
  if (!options) return null;
  const opts = Array.isArray(options) ? { paths: options } : options;
  if (!Array.isArray(opts.paths)) throw new Error('pino – redact must contain an array of strings');
  if (opts.paths.length === 0) return null;
  const censor = opts.censor === undefined ? '[Redacted]' : opts.censor;
  const rule = { censor, censorFn: typeof censor === 'function', remove: opts.remove === true };
  const paths = opts.paths.map(parsePath);
  return function redact(obj) {
    let result = obj;
    for (let i = 0; i < paths.length; i += 1) result = applyPath(result, paths[i], 0, rule, []);
    return result;
  };
}

module.exports = { createRedactor, parsePath };

},
"@xufa/logger/lib/serializers.js": function (module, exports, require) {
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

},
"@xufa/logger/lib/stringify.js": function (module, exports, require) {
// JSON text of the values of a log line.

// Characters that need escaping in a JSON string, and lone surrogates (JSON.stringify writes them as \u escapes).
// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\u0000-\u001f"\\\ud800-\udfff]/;

// Short strings are checked a character at a time, cheaper than the regular expression; longer ones by it.
function asString(str) {
  const length = str.length;
  if (length < 64) {
    for (let i = 0; i < length; i += 1) {
      const code = str.charCodeAt(i);
      if (code < 32 || code === 34 || code === 92 || (code >= 0xd800 && code <= 0xdfff)) return JSON.stringify(str);
    }
    return `"${str}"`;
  }
  if (length < 2048 && !NEEDS_ESCAPE.test(str)) return `"${str}"`;
  return JSON.stringify(str);
}

// JSON.stringify that writes "[Circular]" for references to an ancestor and BigInt as numbers in strings.
// `parent` is the object holding the value, a reference to it is circular too.
function safeStringify(value, parent) {
  if (parent !== undefined && value === parent) return '"[Circular]"';
  const ancestors = [];
  return JSON.stringify(value, function replacer(key, val) {
    if (typeof val === 'bigint') return val.toString();
    if (typeof val !== 'object' || val === null) return val;
    if (val === parent) return '[Circular]';
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
    if (ancestors.includes(val)) return '[Circular]';
    ancestors.push(val);
    return val;
  });
}

// JSON of any value, undefined when it has none (functions, symbols, undefined).
function stringify(value, parent) {
  switch (typeof value) {
    case 'string':
      return asString(value);
    case 'number':
      return Number.isFinite(value) ? `${value}` : 'null';
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      return `${value}`;
    case 'object':
      if (value === null) return 'null';
      try {
        return JSON.stringify(value);
      } catch {
        return safeStringify(value, parent);
      }
    default:
      return undefined;
  }
}

// A key is quoted as any string.
const asKey = asString;

module.exports = { asString, asKey, stringify, safeStringify };

},
"@xufa/logger/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/logger","version":"0.1.0"};
},
"@xufa/router/index.js": function (module, exports, require) {
// @xufa/router: an HTTP router with the API of find-my-way.
//
// Routes live in a radix tree per method (static parts, parameters, regular expressions, wildcards, with
// backtracking), and the routes without parameters are also kept in a Map per method: most requests are found with a
// single lookup by path.
const { METHODS } = require('node:http');
const { StaticNode, NODE_TYPES } = require('./lib/node');
const { compileTree } = require('./lib/compile');
const { Constrainer, NullObject } = require('./lib/constraints');
const { prettyPrintTree } = require('./lib/pretty-print');
const { isSafeRegex } = require('./lib/safe-regex');
const strategies = require('./lib/strategies');
const url = require('./lib/url');

const { splitEncoded, decodeParam, pathFromAbsoluteURL, removeDuplicateSlashes, trimLastSlash } = url;
const { deepEqualConstraints } = strategies;

const httpMethods = [...new Set([...METHODS, 'QUERY'])].sort();
const OPTIONAL_PARAM = /(\/:[^/()]*?)\?(\/?)/;
const ESCAPE_REGEXP = /[.*+?^${}()|[\]\\]/g;

const escapeRegExp = (string) => string.replace(ESCAPE_REGEXP, '\\$&');

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.code = 'ERR_ASSERTION';
    throw err;
  }
}

function closingParenthesis(path, index) {
  let depth = 1;
  let i = index;
  while (i < path.length) {
    i += 1;
    if (path.charCodeAt(i) === 92) {
      i += 1; // escaped character
    } else if (path.charCodeAt(i) === 41) {
      depth -= 1;
    } else if (path.charCodeAt(i) === 40) {
      depth += 1;
    }
    if (depth === 0) return i;
  }
  throw new TypeError(`Invalid regexp expression in "${path}"`);
}

// Drops the ^ and $ of a regular expression of a parameter: it is a part of the expression of its node.
function trimRegExp(source) {
  let out = source;
  if (out.charCodeAt(1) === 94) out = out.slice(0, 1) + out.slice(2);
  if (out.charCodeAt(out.length - 2) === 36) out = out.slice(0, out.length - 2) + out.slice(out.length - 1);
  return out;
}

function defaultBuildPrettyMeta(route) {
  if (!route || !route.store) return {};
  return { ...route.store };
}

// Routes whose walk in the tree costs less than this many steps are not put in the map of static routes.
const STATIC_INDEX_MIN_COST = 4;

const FOUND = 0;
const BAD_URL = 1;
const MAX_PARAM_LENGTH = 2;

class Router {
  constructor(opts = {}) {
    this._opts = opts;
    if (opts.defaultRoute) assert(typeof opts.defaultRoute === 'function', 'The default route must be a function');
    if (opts.onBadUrl) assert(typeof opts.onBadUrl === 'function', 'The bad url handler must be a function');
    if (opts.buildPrettyMeta) assert(typeof opts.buildPrettyMeta === 'function', 'buildPrettyMeta must be a function');
    if (opts.querystringParser) {
      assert(typeof opts.querystringParser === 'function', 'querystringParser must be a function');
    }
    this.defaultRoute = opts.defaultRoute || null;
    this.onBadUrl = opts.onBadUrl || null;
    this.buildPrettyMeta = opts.buildPrettyMeta || defaultBuildPrettyMeta;
    this.querystringParser = opts.querystringParser || defaultQuerystringParser;
    this.caseSensitive = opts.caseSensitive === undefined ? true : opts.caseSensitive;
    this.ignoreTrailingSlash = opts.ignoreTrailingSlash || false;
    this.ignoreDuplicateSlashes = opts.ignoreDuplicateSlashes || false;
    this.maxParamLength = opts.maxParamLength || 100;
    this.onMaxParamLength = opts.onMaxParamLength || null;
    this.allowUnsafeRegex = opts.allowUnsafeRegex || false;
    this.useSemicolonDelimiter = opts.useSemicolonDelimiter || false;
    this.constrainer = new Constrainer(opts.constraints);
    this.routes = [];
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    // The compiled walks of the trees (lib/compile.js), by method: compiled once a tree is walked COMPILE_AFTER times.
    this.tiers = Object.create(null);
    this.tierGET = null;
    // What match() returns, reused for every request.
    this.result = { status: FOUND, handler: null, store: null, params: null, querystring: '', path: '' };
  }

  on(method, path, opts, handler, store) {
    let options = opts;
    let fn = handler;
    let data = store;
    if (typeof opts === 'function') {
      if (handler !== undefined) data = handler;
      fn = opts;
      options = {};
    }
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(typeof fn === 'function', 'Handler should be a function');

    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.on(method, path.replace(OPTIONAL_PARAM, '$1$2'), options, fn, data);
      this.on(method, path.replace(OPTIONAL_PARAM, '$2') || '/', options, fn, data);
      return;
    }

    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);

    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      this.insert(m, normalized, options || {}, fn, data);
    }
  }

  insert(method, path, opts, handler, store) {
    let constraints = {};
    if (opts.constraints !== undefined) {
      assert(typeof opts.constraints === 'object' && opts.constraints !== null, 'Constraints should be an object');
      if (Object.keys(opts.constraints).length !== 0) constraints = opts.constraints;
    }
    this.constrainer.validateConstraints(constraints);
    this.constrainer.noteUsage(constraints);

    if (this.trees[method] === undefined) {
      this.trees[method] = new StaticNode('/');
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (path === '*' && this.trees[method].prefix.length !== 0) {
      const root = this.trees[method];
      this.trees[method] = new StaticNode('');
      this.trees[method].setStaticChild('/', root);
    }
    if (method === 'GET') {
      this.treeGET = this.trees.GET;
      this.staticGET = this.staticRoutes.GET;
    }

    const walk = this.walkPattern(path, this.trees[method], true);
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    if (pattern === '*') pattern = '/*';

    for (const existing of this.routes) {
      if (
        existing.method === method &&
        existing.pattern === pattern &&
        deepEqualConstraints(existing.opts.constraints || {}, constraints)
      ) {
        throw new Error(
          `Method '${method}' already declared for route '${pattern}' with constraints '${JSON.stringify(constraints)}'`
        );
      }
    }

    const route = { method, path, pattern, params: walk.params, opts, handler, store };
    this.routes.push(route);
    walk.node.addRoute(route, this.constrainer);
    if (walk.params.length === 0 && walk.node.kind === NODE_TYPES.STATIC && path !== '*') {
      route.staticKey = walk.staticKey;
    }
    this.staticIndexDirty = true;
    this.tiers = Object.create(null);
    this.tierGET = null;
  }

  // Walks the pattern of a route through the tree, creating its nodes when `create`. Gives the last node, the names
  // of the parameters and the canonical pattern (parameters without names) used to find duplicated routes.
  walkPattern(path, root, create) {
    let pattern = path;
    let node = root;
    let parentIndex = node.prefix.length;
    const params = [];
    let staticKey = root.prefix;
    for (let i = 0; i <= pattern.length; i += 1) {
      if (pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) === 58) {
        i += 1; // :: is a literal colon
        continue;
      }
      const isParam = pattern.charCodeAt(i) === 58 && pattern.charCodeAt(i + 1) !== 58;
      const isWildcard = pattern.charCodeAt(i) === 42;
      if (isParam || isWildcard || (i === pattern.length && i !== parentIndex)) {
        let staticPath = pattern.slice(parentIndex, i);
        if (!this.caseSensitive) staticPath = staticPath.toLowerCase();
        staticPath = staticPath.replaceAll('::', ':').replaceAll('%', '%25');
        node = create ? node.createStaticChild(staticPath) : node.getStaticChild(staticPath);
        if (node === null) return null;
        staticKey += staticPath;
      }
      if (isParam) {
        let isRegexNode = false;
        let paramSafe = true;
        let backtrack = '';
        const regexps = [];
        let nodePatternParts = '';
        let lastParamStart = i + 1;
        for (let j = lastParamStart; ; j += 1) {
          const code = pattern.charCodeAt(j);
          const isRegexParam = code === 40;
          const isStaticPart = code === 45 || code === 46;
          const isEndOfNode = code === 47 || j === pattern.length;
          if (isRegexParam || isStaticPart || isEndOfNode) {
            params.push(pattern.slice(lastParamStart, j));
            isRegexNode = isRegexNode || isRegexParam || isStaticPart;
            if (isRegexParam) {
              const end = closingParenthesis(pattern, j);
              const source = pattern.slice(j, end + 1);
              if (!this.allowUnsafeRegex) assert(isSafeRegex(new RegExp(source)), `The regex '${source}' is not safe!`);
              regexps.push(trimRegExp(source));
              j = end + 1;
              paramSafe = true;
            } else {
              regexps.push(paramSafe ? '(.*?)' : `(${backtrack}|(?:(?!${backtrack}).)*)`);
              paramSafe = false;
            }
            const staticStart = j;
            for (; j < pattern.length; j += 1) {
              const c = pattern.charCodeAt(j);
              if (c === 47) break;
              if (c === 58) {
                if (pattern.charCodeAt(j + 1) === 58) j += 1;
                else break;
              }
            }
            let staticPart = pattern.slice(staticStart, j);
            if (staticPart) {
              staticPart = staticPart.replaceAll('::', ':').replaceAll('%', '%25');
              backtrack = escapeRegExp(staticPart);
              regexps.push(backtrack);
            }
            lastParamStart = j + 1;
            nodePatternParts += `()${staticPart}`;
            if (isEndOfNode || pattern.charCodeAt(j) === 47 || j === pattern.length) {
              const nodePattern = isRegexNode ? nodePatternParts : staticPart;
              const nodePath = pattern.slice(i, j);
              pattern = pattern.slice(0, i + 1) + nodePattern + pattern.slice(j);
              i += nodePattern.length;
              const regex = isRegexNode ? new RegExp(`^${regexps.join('')}$`) : null;
              node = create
                ? node.createParametricChild(regex, staticPart || null, nodePath)
                : node.getParametricChild(regex, staticPart || null, nodePath);
              if (node === null) return null;
              parentIndex = i + 1;
              break;
            }
          }
        }
      } else if (isWildcard) {
        params.push('*');
        node = create ? node.createWildcardChild() : node.getWildcardChild();
        if (node === null) return null;
        parentIndex = i + 1;
        if (i !== pattern.length - 1) throw new Error('Wildcard must be the last character in the route');
      }
    }
    return { node, params, pattern, staticKey };
  }

  hasRoute(method, path, constraints) {
    return this.findRoute(method, path, constraints) !== null;
  }

  findRoute(method, path, constraints = {}) {
    if (this.trees[method] === undefined) return null;
    const walk = this.walkPattern(path, this.trees[method], false);
    if (walk === null) return null;
    let { pattern } = walk;
    if (!this.caseSensitive) pattern = pattern.toLowerCase();
    for (const route of this.routes) {
      if (
        route.method === method &&
        route.pattern === pattern &&
        deepEqualConstraints(route.opts.constraints || {}, constraints)
      ) {
        return { handler: route.handler, store: route.store, params: route.params };
      }
    }
    return null;
  }

  hasConstraintStrategy(name) {
    return this.constrainer.hasConstraintStrategy(name);
  }

  addConstraintStrategy(strategy) {
    this.constrainer.addConstraintStrategy(strategy);
    this.rebuild(this.routes);
  }

  reset() {
    this.trees = Object.create(null);
    this.staticRoutes = Object.create(null);
    this.treeGET = null;
    this.staticGET = null;
    this.staticIndexDirty = false;
    this.tiers = Object.create(null);
    this.tierGET = null;
    this.routes = [];
  }

  off(method, path, constraints) {
    assert(typeof path === 'string', 'Path should be a string');
    assert(path.length > 0, 'The path could not be empty');
    assert(path[0] === '/' || path[0] === '*', 'The first character of a path should be `/` or `*`');
    assert(
      constraints === undefined ||
        (typeof constraints === 'object' && !Array.isArray(constraints) && constraints !== null),
      'Constraints should be an object or undefined.'
    );
    const optional = path.match(OPTIONAL_PARAM);
    if (optional) {
      assert(
        path.length === optional.index + optional[0].length,
        'Optional Parameter needs to be the last parameter of the path'
      );
      this.off(method, path.replace(OPTIONAL_PARAM, '$1$2'), constraints);
      this.off(method, path.replace(OPTIONAL_PARAM, '$2') || '/', constraints);
      return;
    }
    let normalized = path;
    if (this.ignoreDuplicateSlashes) normalized = removeDuplicateSlashes(normalized);
    if (this.ignoreTrailingSlash) normalized = trimLastSlash(normalized);
    const methods = Array.isArray(method) ? method : [method];
    for (const m of methods) {
      assert(typeof m === 'string', 'Method should be a string');
      assert(httpMethods.includes(m), `Method '${m}' is not an http method.`);
      const keep = (route) =>
        m !== route.method ||
        normalized !== route.path ||
        (constraints !== undefined && !deepEqualConstraints(constraints, route.opts.constraints || {}));
      this.rebuild(this.routes.filter(keep));
    }
  }

  rebuild(routes) {
    this.reset();
    for (const route of routes) this.insert(route.method, route.path, route.opts, route.handler, route.store);
  }

  // Finds the route of a request. Returns null when there is none, or this.result (reused: read it before the next
  // call) with `status` FOUND, BAD_URL (a malformed path) or MAX_PARAM_LENGTH, and the unparsed `querystring`.
  match(method, rawUrl, derivedConstraints) {
    let root;
    let statics;
    if (method === 'GET') {
      root = this.treeGET;
      statics = this.staticGET;
    } else {
      root = this.trees[method];
      statics = this.staticRoutes[method];
    }
    if (root == null) return null;
    // The root (/), the most common route: found before any work on the URL.
    if (rawUrl === '/' && root.prefixLength === 1 && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, '');
    }
    if (this.staticIndexDirty) {
      this.buildStaticIndex();
      statics = this.staticRoutes[method];
    }

    let path = rawUrl;
    if (path.charCodeAt(0) !== 47) {
      path = pathFromAbsoluteURL(path);
      if (path === null) return this.badUrl(rawUrl);
    }
    if (this.ignoreDuplicateSlashes) path = removeDuplicateSlashes(path);

    // The query string starts at the first ?, # (or ; when asked); a % before it means the path has to be decoded.
    let querystring = '';
    let decodeParams = false;
    const urlLength = path.length;
    let i = 1;
    if (urlLength < NATIVE_SCAN_LENGTH) {
      for (; i < urlLength; i += 1) {
        const code = path.charCodeAt(i);
        if (code === 63 || code === 35 || code === 37 || (code === 59 && this.useSemicolonDelimiter)) break;
      }
    } else {
      // indexOf is faster on long paths, and its cost of a call is lost on short ones.
      i = firstDelimiter(path, this.useSemicolonDelimiter);
    }
    if (i < urlLength) {
      if (path.charCodeAt(i) === 37) {
        const split = splitEncoded(path, this.useSemicolonDelimiter, i);
        if (split === null) return this.badUrl(path);
        path = split.path;
        querystring = split.querystring;
        decodeParams = split.decodeParams;
      } else {
        querystring = path.slice(i + 1);
        path = path.slice(0, i);
      }
    }
    if (this.ignoreTrailingSlash) path = trimLastSlash(path);
    const originPath = path;
    if (!this.caseSensitive) path = path.toLowerCase();

    const result = this.result;
    const pathLength = path.length;
    // The root (/): found here, without the call of the compiled walk, which is too large to be inlined.
    if (pathLength === root.prefixLength && root.isLeafNode) {
      const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }
    const staticNode = pathLength > 255 || statics.lengths[pathLength] === 1 ? statics.map.get(path) : undefined;
    if (staticNode !== undefined) {
      const handle = staticNode.handlerStorage.getMatchingHandler(derivedConstraints);
      if (handle !== null) return this.found(handle, querystring);
    }

    let tier = method === 'GET' ? this.tierGET : this.tiers[method];
    if (tier == null) tier = this.newTier(method);
    const status =
      tier.walk !== null || ((tier.walks += 1) > Router.COMPILE_AFTER && this.compileTier(tier, root))
        ? tier.walk(path, originPath, pathLength, derivedConstraints, decodeParams, result)
        : this.walkTree(root, path, originPath, derivedConstraints, decodeParams, result);
    if (status === 0) {
      result.status = FOUND;
      result.querystring = querystring;
      return result;
    }
    return this.notFound(status === 2, originPath);
  }

  // The walk of a tree before it is compiled: the same as the compiled one (lib/compile.js), and the same results.
  walkTree(root, path, originPath, derivedConstraints, decodeParams, result) {
    const maxParamLength = this.maxParamLength;
    let currentNode = root;
    let pathIndex = currentNode.prefix.length;
    const params = [];
    const pathLen = path.length;
    const stack = [];
    let maxParamLengthExceeded = false;

    for (;;) {
      if (pathIndex === pathLen && currentNode.isLeafNode) {
        const handle = currentNode.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          result.handler = handle.handler;
          result.store = handle.store;
          result.params = handle.createParams(params);
          return 0;
        }
      }

      let node = currentNode.getNextNode(path, pathIndex, stack, params.length);
      if (node === null) {
        if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
        params.length = stack.pop();
        pathIndex = stack.pop();
        node = stack.pop();
      }
      currentNode = node;

      for (;;) {
        if (currentNode.kind === NODE_TYPES.STATIC) {
          pathIndex += currentNode.prefixLength;
          break;
        }
        if (currentNode.kind === NODE_TYPES.WILDCARD) {
          const param = originPath.slice(pathIndex);
          params.push(decodeParams ? decodeParam(param) : param);
          pathIndex = pathLen;
          break;
        }
        let paramEnd = originPath.indexOf('/', pathIndex);
        if (paramEnd === -1) paramEnd = pathLen;
        let param = originPath.slice(pathIndex, paramEnd);
        if (decodeParams) param = decodeParam(param);

        let failed = false;
        if (currentNode.isRegex) {
          const matched = currentNode.regex.exec(param);
          if (matched === null) {
            failed = true;
          } else {
            for (let i = 1; i < matched.length; i += 1) {
              if ((matched[i] ?? '').length > maxParamLength) {
                maxParamLengthExceeded = true;
                failed = true;
                break;
              }
            }
            if (!failed) for (let i = 1; i < matched.length; i += 1) params.push(matched[i] ?? '');
          }
        } else if (param.length > maxParamLength) {
          maxParamLengthExceeded = true;
          failed = true;
        } else {
          params.push(param);
        }

        if (failed) {
          if (stack.length === 0) return maxParamLengthExceeded ? 2 : 1;
          params.length = stack.pop();
          pathIndex = stack.pop();
          currentNode = stack.pop();
          continue;
        }
        pathIndex = paramEnd;
        break;
      }
    }
  }

  newTier(method) {
    const tier = { walks: 0, walk: null };
    this.tiers[method] = tier;
    if (method === 'GET') this.tierGET = tier;
    return tier;
  }

  // Compiles the walk of a tree; false (and not tried again) when the tree is too large for it.
  compileTier(tier, root) {
    tier.walk = compileTree(root, this.maxParamLength);
    if (tier.walk !== null) return true;
    tier.walks = -Infinity;
    return false;
  }

  // The static routes reached faster by their path than by the tree: the ones whose walk goes through several nodes
  // or by nodes with parameters, which the walk would push to try later.
  buildStaticIndex() {
    this.staticIndexDirty = false;
    for (const method of Object.keys(this.staticRoutes)) {
      this.staticRoutes[method] = { map: new Map(), lengths: new Uint8Array(256) };
    }
    for (const route of this.routes) {
      if (route.staticKey === undefined || this.trees[route.method] === undefined) continue;
      const key = route.staticKey;
      let node = this.trees[route.method];
      let index = node.prefixLength;
      let cost = 0;
      while (node !== null && index < key.length) {
        if (node.parametricChildren && (node.parametricChildren.length > 0 || node.wildcardChild !== null)) cost += 2;
        node = node.findStaticMatchingChild(key, index);
        if (node !== null) index += node.prefixLength;
        cost += 1;
      }
      if (node === null || cost < STATIC_INDEX_MIN_COST) continue;
      const statics = this.staticRoutes[route.method];
      statics.map.set(key, node);
      if (key.length < 256) statics.lengths[key.length] = 1;
    }
    this.staticGET = this.staticRoutes.GET || null;
  }

  // The result of a static route: no parameters.
  found(handle, querystring) {
    const result = this.result;
    result.status = FOUND;
    result.handler = handle.handler;
    result.store = handle.store;
    result.params = handle.createParams(EMPTY);
    result.querystring = querystring;
    return result;
  }

  badUrl(path) {
    const result = this.result;
    result.status = BAD_URL;
    result.handler = null;
    result.store = null;
    result.params = null;
    result.querystring = '';
    result.path = path;
    return result;
  }

  notFound(maxParamLengthExceeded, path) {
    if (!maxParamLengthExceeded || this.onMaxParamLength === null) return null;
    const result = this.badUrl(path);
    result.status = MAX_PARAM_LENGTH;
    return result;
  }

  // find-my-way's find(): a new object, with the query string parsed.
  find(method, path, derivedConstraints) {
    // The root, the most common route, found here: match() is too large to be inlined, and its call costs as much.
    if (path === '/' && this.querystringParser === defaultQuerystringParser) {
      const root = method === 'GET' ? this.treeGET : this.trees[method];
      if (root != null && root.prefixLength === 1 && root.isLeafNode) {
        const handle = root.handlerStorage.getMatchingHandler(derivedConstraints);
        if (handle !== null) {
          return {
            handler: handle.handler,
            store: handle.store,
            params: handle.createParams(EMPTY),
            searchParams: new NullObject(),
          };
        }
      }
    }
    const result = this.match(method, path, derivedConstraints);
    if (result === null) return null;
    if (result.status === BAD_URL) {
      if (this.onBadUrl === null) return null;
      const { onBadUrl } = this;
      const badPath = result.path;
      return { handler: (req, res) => onBadUrl(badPath, req, res), params: {}, store: null };
    }
    if (result.status === MAX_PARAM_LENGTH) {
      const { onMaxParamLength } = this;
      const longPath = result.path;
      return { handler: (req, res) => onMaxParamLength(longPath, req, res), params: {}, store: null };
    }
    return {
      handler: result.handler,
      store: result.store,
      params: result.params,
      searchParams:
        result.querystring.length === 0 && this.querystringParser === defaultQuerystringParser
          ? new NullObject()
          : this.querystringParser(result.querystring),
    };
  }

  lookup(req, res, ctx, done) {
    let context = ctx;
    let callback = done;
    if (typeof ctx === 'function') {
      callback = ctx;
      context = undefined;
    }
    if (callback === undefined) {
      const constraints = this.constrainer.deriveConstraints(req, context);
      return this.callHandler(this.find(req.method, req.url, constraints), req, res, context);
    }
    this.constrainer.deriveConstraints(req, context, (err, constraints) => {
      if (err !== null) {
        callback(err);
        return;
      }
      try {
        const handle = this.find(req.method, req.url, constraints);
        callback(null, this.callHandler(handle, req, res, context));
      } catch (error) {
        callback(error);
      }
    });
    return undefined;
  }

  callHandler(handle, req, res, ctx) {
    if (handle === null) {
      if (this.defaultRoute !== null) {
        return ctx === undefined ? this.defaultRoute(req, res) : this.defaultRoute.call(ctx, req, res);
      }
      res.statusCode = 404;
      res.end();
      return undefined;
    }
    return ctx === undefined
      ? handle.handler(req, res, handle.params, handle.store, handle.searchParams)
      : handle.handler.call(ctx, req, res, handle.params, handle.store, handle.searchParams);
  }

  prettyPrint(options = {}) {
    const opts = { ...options, buildPrettyMeta: this.buildPrettyMeta.bind(this) };
    let tree = null;
    if (opts.method === undefined) {
      const { version, host, ...custom } = this.constrainer.strategies;
      custom[strategies.httpMethod.name] = strategies.httpMethod;
      const merged = new Router({ ...this._opts, constraints: custom });
      const routes = this.routes.map((route) => ({
        ...route,
        method: 'MERGED',
        opts: { constraints: { ...route.opts.constraints, [strategies.httpMethod.name]: route.method } },
      }));
      // The merged tree is built without the checks of the methods.
      for (const route of routes) merged.insertMerged(route);
      tree = merged.trees.MERGED;
    } else {
      tree = this.trees[opts.method];
    }
    if (tree == null) return '(empty tree)';
    return prettyPrintTree(tree, opts);
  }

  insertMerged(route) {
    if (this.trees.MERGED === undefined) {
      this.trees.MERGED = new StaticNode('/');
      this.staticRoutes.MERGED = { map: new Map(), lengths: new Uint8Array(256) };
    }
    if (route.path === '*' && this.trees.MERGED.prefix.length !== 0) {
      const root = this.trees.MERGED;
      this.trees.MERGED = new StaticNode('');
      this.trees.MERGED.setStaticChild('/', root);
    }
    this.constrainer.noteUsage(route.opts.constraints);
    const walk = this.walkPattern(route.path, this.trees.MERGED, true);
    const merged = { ...route, pattern: walk.pattern, params: walk.params };
    this.routes.push(merged);
    walk.node.addRoute(merged, this.constrainer);
  }

  all(path, handler, store) {
    this.on(httpMethods, path, handler, store);
  }
}

const EMPTY = [];

const NATIVE_SCAN_LENGTH = 12;

// The index of the first ?, #, % (or ; when asked) of a path, or its length.
function firstDelimiter(path, semicolon) {
  let end = path.length;
  let index = path.indexOf('?', 1);
  if (index !== -1) end = index;
  index = path.indexOf('%', 1);
  if (index !== -1 && index < end) end = index;
  index = path.indexOf('#', 1);
  if (index !== -1 && index < end) end = index;
  if (semicolon) {
    index = path.indexOf(';', 1);
    if (index !== -1 && index < end) end = index;
  }
  return end;
}

function addQueryValue(out, key, value) {
  const existing = out[key];
  if (existing === undefined) out[key] = value;
  else if (Array.isArray(existing)) existing.push(value);
  else out[key] = [existing, value];
}

// The query string as an object, as URLSearchParams reads it. Most query strings have nothing to decode: they are
// split here, much faster; the others (%, +, a leading ?, text that is not well formed) go to URLSearchParams.
function defaultQuerystringParser(query) {
  const out = new NullObject();
  const length = query.length;
  if (length === 0) return out;
  if (query.charCodeAt(0) === 63 || query.indexOf('%') !== -1 || query.indexOf('+') !== -1 || !query.isWellFormed()) {
    for (const [key, value] of new URLSearchParams(query)) addQueryValue(out, key, value);
    return out;
  }
  let start = 0;
  while (start <= length) {
    let end = query.indexOf('&', start);
    if (end === -1) end = length;
    if (end > start) {
      const equals = query.indexOf('=', start);
      if (equals === -1 || equals > end) addQueryValue(out, query.slice(start, end), '');
      else addQueryValue(out, query.slice(start, equals), query.slice(equals + 1, end));
    }
    start = end + 1;
  }
  return out;
}

for (const method of httpMethods) {
  Router.prototype[method.toLowerCase()] = function shorthand(path, handler, store) {
    return this.on(method, path, handler, store);
  };
}

function createRouter(opts) {
  return new Router(opts);
}

Router.sanitizeUrlPath = function sanitizeUrlPath(rawUrl, useSemicolonDelimiter) {
  const decoded = url.safeDecodeURI(rawUrl, useSemicolonDelimiter);
  return decoded.shouldDecodeParam ? decodeParam(decoded.path) : decoded.path;
};

// Walks of a tree by match() before it is compiled: compiling costs more than a few walks.
Router.COMPILE_AFTER = 16;

module.exports = createRouter;
module.exports.Router = Router;
module.exports.httpMethods = httpMethods;
module.exports.FOUND = FOUND;
module.exports.BAD_URL = BAD_URL;
module.exports.MAX_PARAM_LENGTH = MAX_PARAM_LENGTH;
module.exports.sanitizeUrlPath = Router.sanitizeUrlPath;
module.exports.removeDuplicateSlashes = removeDuplicateSlashes;
module.exports.trimLastSlash = trimLastSlash;
module.exports.safeDecodeURI = url.safeDecodeURI;
module.exports.safeDecodeURIComponent = url.safeDecodeURIComponent;
module.exports.isSafeRegex = isSafeRegex;
module.exports.NullObject = NullObject;

},
"@xufa/router/lib/compile.js": function (module, exports, require) {
// Compiles the tree of a method into code that finds a route: the walk of index.js (match), with the nodes written
// as code. A static child is a case of a switch on the next character and comparisons of character codes, a
// parameter a slice up to the next slash, and backtracking is falling out of a block to the next child to try, in
// the order of the walk: the static child, the parametric children, then the wildcard. No calls per node, no stack of
// nodes to try, and the parameters are locals. The code of a large tree is split into functions of a few kilobytes,
// each one a subtree: V8 optimizes functions of that size well, and one of a hundred kilobytes badly.
//
// The function is walk(path, originPath, len, derivedConstraints, decode, result): it gives 0 when it found the
// route (its handler, store and params written to result), 1 when there is none, 2 when there is none and a
// parameter was longer than maxParamLength.
const { decodeParam } = require('./url');

// Trees with more nodes are walked by match(): the time to compile them would be too long.
const MAX_NODES = 20000;
// The code of a node larger than this has its largest subtrees moved to functions of their own.
const MAX_CHUNK = 24000;
// Prefixes longer than this are compared with startsWith() rather than one comparison per character.
const MAX_INLINE_PREFIX = 12;

function compileTree(root, maxParamLength) {
  const refs = [];
  const functions = [];
  let names = 0;
  let nodes = 0;
  const ref = (value) => {
    refs.push(value);
    return `R${refs.length - 1}`;
  };
  const name = (prefix) => `${prefix}${(names += 1)}`;

  // The code of a subtree moved to a function: it gets the index in the path (when a variable) and the parameters
  // found so far, under the names its code uses, and gives 0, 1 or 2 as walk() does.
  function extract(piece, at, params) {
    const fn = name('f');
    const args = (/^[a-z]+\d+$/.test(at) ? [at] : []).concat(params);
    const signature = ['path', 'originPath', 'len', 'dc', 'decode', 'r'].concat(args).join(', ');
    functions.push(`function ${fn}(${signature}) {\nlet exceeded = false;\n${piece}return exceeded ? 2 : 1;\n}\n`);
    const status = name('s');
    return (
      `{\nconst ${status} = ${fn}(${signature});\n` +
      `if (${status} === 0) return 0;\nif (${status} === 2) exceeded = true;\n}\n`
    );
  }

  // The code of a node whose part of the path ends at index `at` (an expression), with the parameters found so far.
  function body(node, at, params) {
    nodes += 1;
    let leaf = '';
    if (node.isLeafNode) {
      const h = name('h');
      leaf =
        `if (${at} === len) {\nconst ${h} = ${ref(node.handlerStorage)}.getMatchingHandler(dc);\n` +
        `if (${h} !== null) {\nr.handler = ${h}.handler;\nr.store = ${h}.store;\n` +
        `r.params = ${h}.createParamsArgs(${params.join(', ')});\nreturn 0;\n}\n}\n`;
    }
    // The code of each child, in the order they are tried.
    const cases = [];
    const others = [];
    const codes = node.staticChildrenCharCodes;
    if (codes !== undefined) {
      for (let i = 0; i < codes.length; i += 1) {
        cases.push({ code: codes[i], text: staticChild(node.staticChildrenNodes[i], at, params) });
      }
    }
    if (node.parametricChildren !== undefined) {
      for (const child of node.parametricChildren) others.push({ text: parametricChild(child, at, params) });
    }
    if (node.wildcardChild != null) others.push({ text: wildcardChild(node.wildcardChild, at, params) });
    // The largest ones to functions of their own, until the code of the node is small enough.
    const pieces = cases.concat(others);
    let size = pieces.reduce((sum, piece) => sum + piece.text.length, 0);
    for (const piece of [...pieces].sort((a, b) => b.text.length - a.text.length)) {
      if (size <= MAX_CHUNK) break;
      const before = piece.text.length;
      piece.text = extract(piece.text, at, params);
      size -= before - piece.text.length;
    }
    let out = leaf;
    if (cases.length !== 0) {
      out += `switch (path.charCodeAt(${at})) {\n`;
      for (const piece of cases) out += `case ${piece.code}: {\n${piece.text}break;\n}\n`;
      out += '}\n';
    }
    for (const piece of others) out += piece.text;
    return out;
  }

  // Its first character is the case of the switch: the others are compared here.
  function staticChild(node, at, params) {
    const { prefix } = node;
    const end = name('i');
    let test = '';
    if (prefix.length > MAX_INLINE_PREFIX) {
      test = `path.startsWith(${JSON.stringify(prefix)}, ${at})`;
    } else if (prefix.length > 1) {
      const checks = [];
      for (let i = 1; i < prefix.length; i += 1)
        checks.push(`path.charCodeAt(${at} + ${i}) === ${prefix.charCodeAt(i)}`);
      test = checks.join(' && ');
    }
    const code = `{\nconst ${end} = ${at} + ${prefix.length};\n${body(node, end, params)}}\n`;
    return test === '' ? code : `if (${test}) ${code}`;
  }

  function parametricChild(node, at, params) {
    const end = name('e');
    const value = name('v');
    let out =
      `{\nlet ${end} = originPath.indexOf('/', ${at});\nif (${end} === -1) ${end} = len;\n` +
      `let ${value} = originPath.slice(${at}, ${end});\nif (decode) ${value} = decodeParam(${value});\n`;
    if (node.isRegex) {
      const groups = new RegExp(`${node.regex.source}|`).exec('').length - 1;
      const match = name('m');
      const found = [];
      for (let i = 1; i <= groups; i += 1) found.push(name('p'));
      out +=
        `const ${match} = ${ref(node.regex)}.exec(${value});\nif (${match} !== null) {\n` +
        found.map((p, i) => `const ${p} = ${match}[${i + 1}] ?? '';\n`).join('') +
        `if (${found.map((p) => `${p}.length > max`).join(' || ') || 'false'}) exceeded = true;\n` +
        `else {\n${body(node, end, params.concat(found))}}\n}\n`;
    } else {
      out += `if (${value}.length > max) exceeded = true;\nelse {\n${body(node, end, params.concat(value))}}\n`;
    }
    return `${out}}\n`;
  }

  function wildcardChild(node, at, params) {
    const value = name('v');
    return (
      `{\nlet ${value} = originPath.slice(${at});\nif (decode) ${value} = decodeParam(${value});\n` +
      `${body(node, 'len', params.concat(value))}}\n`
    );
  }

  const code = body(root, String(root.prefix.length), []);
  if (nodes > MAX_NODES) return null;
  const source =
    `${refs.map((_, i) => `const R${i} = refs[${i}];`).join('\n')}\n${functions.join('')}` +
    `return function walk(path, originPath, len, dc, decode, r) {\nlet exceeded = false;\n${code}` +
    'return exceeded ? 2 : 1;\n};';
  // eslint-disable-next-line no-new-func
  return new Function('refs', 'max', 'decodeParam', source)(refs, maxParamLength, decodeParam);
}

module.exports = { compileTree };

},
"@xufa/router/lib/constraints.js": function (module, exports, require) {
// Route constraints (version, host and custom strategies), and the handlers stored on a node of the tree.
const strategies = require('./strategies');

class Constrainer {
  constructor(customStrategies) {
    this.strategies = { version: strategies.version, host: strategies.host };
    this.strategiesInUse = new Set();
    this.asyncStrategiesInUse = new Set();
    this.deriveSync = null;
    if (customStrategies) {
      for (const strategy of Object.values(customStrategies)) this.addConstraintStrategy(strategy);
    }
  }

  isStrategyUsed(name) {
    return this.strategiesInUse.has(name) || this.asyncStrategiesInUse.has(name);
  }

  hasConstraintStrategy(name) {
    const strategy = this.strategies[name];
    if (strategy === undefined) return false;
    return Boolean(strategy.isCustom) || this.isStrategyUsed(name);
  }

  addConstraintStrategy(strategy) {
    if (typeof strategy.name !== 'string' || strategy.name === '') throw new Error('strategy.name is required.');
    if (typeof strategy.storage !== 'function') throw new Error('strategy.storage function is required.');
    if (typeof strategy.deriveConstraint !== 'function') {
      throw new Error('strategy.deriveConstraint function is required.');
    }
    if (this.strategies[strategy.name] && this.strategies[strategy.name].isCustom) {
      throw new Error(`There already exists a custom constraint with the name ${strategy.name}.`);
    }
    if (this.isStrategyUsed(strategy.name)) {
      throw new Error(`There already exists a route with ${strategy.name} constraint.`);
    }
    strategy.isCustom = true;
    strategy.isAsync = strategy.deriveConstraint.length === 3;
    this.strategies[strategy.name] = strategy;
    if (strategy.mustMatchWhenDerived) this.noteUsage({ [strategy.name]: strategy });
  }

  // The constraints of a request: undefined when no route has any, so that the unconstrained handlers match.
  deriveConstraints(req, ctx, done) {
    const constraints = this.deriveSync === null ? undefined : this.deriveSync(req, ctx);
    if (done === undefined) return constraints;
    this.deriveAsyncConstraints(constraints, req, ctx, done);
    return undefined;
  }

  noteUsage(constraints) {
    if (!constraints) return;
    const before = this.strategiesInUse.size;
    for (const key of Object.keys(constraints)) {
      const strategy = this.strategies[key];
      if (strategy.isAsync) this.asyncStrategiesInUse.add(key);
      else this.strategiesInUse.add(key);
    }
    if (before !== this.strategiesInUse.size) this.buildDeriveSync();
  }

  newStoreForConstraint(name) {
    if (!this.strategies[name]) throw new Error(`No strategy registered for constraint key ${name}`);
    return this.strategies[name].storage();
  }

  validateConstraints(constraints) {
    for (const key of Object.keys(constraints)) {
      const value = constraints[key];
      if (value === undefined)
        throw new Error("Can't pass an undefined constraint value, must pass null or no key at all");
      const strategy = this.strategies[key];
      if (!strategy) throw new Error(`No strategy registered for constraint key ${key}`);
      if (strategy.validate) strategy.validate(value);
    }
  }

  deriveAsyncConstraints(constraints, req, ctx, done) {
    let pending = this.asyncStrategiesInUse.size;
    if (pending === 0) {
      done(null, constraints);
      return;
    }
    let errored = false;
    const values = constraints || {};
    for (const key of this.asyncStrategiesInUse) {
      this.strategies[key].deriveConstraint(req, ctx, (err, value) => {
        if (errored) return;
        if (err !== null) {
          errored = true;
          done(err);
          return;
        }
        values[key] = value;
        pending -= 1;
        if (pending === 0) done(null, values);
      });
    }
  }

  buildDeriveSync() {
    const used = [...this.strategiesInUse].map((key) => [key, this.strategies[key]]);
    if (used.length === 0) {
      this.deriveSync = null;
      return;
    }
    this.deriveSync = (req, ctx) => {
      const values = {};
      for (let i = 0; i < used.length; i += 1) {
        const [key, strategy] = used[i];
        if (key === 'version' && !strategy.isCustom) values.version = req.headers['accept-version'];
        else if (key === 'host' && !strategy.isCustom) values.host = req.headers.host || req.headers[':authority'];
        else values[key] = strategy.deriveConstraint(req, ctx);
      }
      return values;
    };
  }
}

const NullObject = function NullObject() {};
NullObject.prototype = Object.create(null);

// Builds the object of parameters from their values; compiled so that each one is a plain store of a property.
function compileParamsFactory(names) {
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = values[${i}];`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParams(values) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

// The same, with the values as arguments: what the compiled walk calls, with its parameters in locals.
function compileParamsArgsFactory(names) {
  const args = names.map((_, i) => `v${i}`);
  const lines = names.map((name, i) => `params[${JSON.stringify(name)}] = v${i};`);
  // eslint-disable-next-line no-new-func
  return new Function(
    'NullObject',
    `return function createParamsArgs(${args.join(', ')}) {\n  const params = new NullObject();\n  ${lines.join('\n  ')}\n  return params;\n}`
  )(NullObject);
}

const MAX_HANDLERS = 31;

class HandlerStorage {
  constructor() {
    this.unconstrainedHandler = null;
    this.constraints = [];
    this.handlers = [];
    this.stores = null;
    this.matchConstrained = () => null;
  }

  getMatchingHandler(derivedConstraints) {
    if (derivedConstraints === undefined) return this.unconstrainedHandler;
    return this.matchConstrained(derivedConstraints);
  }

  addHandler(constrainer, route) {
    const constraints = route.opts.constraints || {};
    const handler = {
      params: route.params,
      constraints,
      handler: route.handler,
      store: route.store || null,
      createParams: compileParamsFactory(route.params),
      createParamsArgs: compileParamsArgsFactory(route.params),
    };
    // find-my-way's name of createParams, kept for code reading it
    handler._createParamsObject = handler.createParams;
    const names = Object.keys(constraints);
    if (names.length === 0) this.unconstrainedHandler = handler;
    for (const name of names) {
      if (!this.constraints.includes(name)) {
        if (name === 'version') this.constraints.unshift(name);
        else this.constraints.push(name);
      }
    }
    const merged = names.includes(strategies.httpMethod.name);
    if (!merged && this.handlers.length >= MAX_HANDLERS) {
      throw new Error(
        'find-my-way supports a maximum of 31 route handlers per node when there are constraints, limit reached'
      );
    }
    this.handlers.push(handler);
    this.handlers.sort((a, b) => Object.keys(a.constraints).length - Object.keys(b.constraints).length);
    if (!merged) this.compileMatcher(constrainer);
  }

  // Matches with bitmaps: a bit for each handler, cleared when a constraint of the request rules the handler out.
  compileMatcher(constrainer) {
    const { handlers } = this;
    this.stores = {};
    const checks = this.constraints.map((name) => {
      const store = constrainer.newStoreForConstraint(name);
      this.stores[name] = store;
      let unconstrained = 0;
      for (let i = 0; i < handlers.length; i += 1) {
        const value = handlers[i].constraints[name];
        if (value !== undefined) {
          store.set(value, (store.get(value) || 0) | (1 << i));
        } else {
          unconstrained |= 1 << i;
        }
      }
      return { name, store, unconstrained, mustMatch: Boolean(constrainer.strategies[name].mustMatchWhenDerived) };
    });
    const mustNotBeDerived = Object.keys(constrainer.strategies).filter(
      (name) => constrainer.strategies[name].mustMatchWhenDerived && !this.constraints.includes(name)
    );
    const all = 2 ** handlers.length - 1;
    this.matchConstrained = (derived) => {
      let candidates = all;
      for (let i = 0; i < checks.length; i += 1) {
        const check = checks[i];
        const value = derived[check.name];
        if (value === undefined) {
          candidates &= check.unconstrained;
        } else {
          const matches = check.store.get(value) || 0;
          candidates &= check.mustMatch ? matches : matches | check.unconstrained;
        }
        if (candidates === 0) return null;
      }
      for (let i = 0; i < mustNotBeDerived.length; i += 1) {
        if (derived[mustNotBeDerived[i]] !== undefined) return null;
      }
      return handlers[31 - Math.clz32(candidates)];
    };
  }
}

module.exports = { Constrainer, HandlerStorage, NullObject, compileParamsFactory };

},
"@xufa/router/lib/node.js": function (module, exports, require) {
// Nodes of the radix tree: static prefixes, parameters (plain or with a regular expression) and wildcards.
const { HandlerStorage } = require('./constraints');

const matchFirst = () => true;

// A function telling whether the path has the prefix at an index, its first character being already checked:
// comparisons of character codes the compiler inlines, faster than startsWith() on short prefixes.
function compilePrefixMatch(prefix) {
  if (prefix.length <= 1) return matchFirst;
  const checks = [];
  for (let i = 1; i < prefix.length; i += 1) checks.push(`path.charCodeAt(i + ${i}) === ${prefix.charCodeAt(i)}`);
  // eslint-disable-next-line no-new-func
  return new Function('path', 'i', `return ${checks.join(' && ')}`);
}

const NODE_TYPES = { STATIC: 0, PARAMETRIC: 1, WILDCARD: 2 };

class Node {
  constructor() {
    this.isLeafNode = false;
    this.routes = null;
    this.handlerStorage = null;
  }

  addRoute(route, constrainer) {
    if (this.routes === null) this.routes = [];
    if (this.handlerStorage === null) this.handlerStorage = new HandlerStorage();
    this.isLeafNode = true;
    this.routes.push(route);
    this.handlerStorage.addHandler(constrainer, route);
  }
}

class ParentNode extends Node {
  constructor() {
    super();
    // Static children by the code of their first character: a scan of a few integers beats a lookup by string.
    this.staticChildrenCharCodes = [];
    this.staticChildrenNodes = [];
  }

  setStaticChild(label, node) {
    const code = label.charCodeAt(0);
    const index = this.staticChildrenCharCodes.indexOf(code);
    if (index === -1) {
      this.staticChildrenCharCodes.push(code);
      this.staticChildrenNodes.push(node);
    } else {
      this.staticChildrenNodes[index] = node;
    }
  }

  findStaticMatchingChild(path, pathIndex) {
    const code = path.charCodeAt(pathIndex);
    const codes = this.staticChildrenCharCodes;
    for (let i = 0; i < codes.length; i += 1) {
      if (codes[i] === code) {
        const child = this.staticChildrenNodes[i];
        return child.matchPrefix(path, pathIndex) ? child : null;
      }
    }
    return null;
  }

  getStaticChild(path, pathIndex = 0) {
    if (path.length === pathIndex) return this;
    const child = this.findStaticMatchingChild(path, pathIndex);
    return child ? child.getStaticChild(path, pathIndex + child.prefixLength) : null;
  }

  createStaticChild(path) {
    if (path.length === 0) return this;
    const index = this.staticChildrenCharCodes.indexOf(path.charCodeAt(0));
    let child = index === -1 ? undefined : this.staticChildrenNodes[index];
    if (child) {
      let i = 1;
      for (; i < child.prefixLength; i += 1) {
        if (path.charCodeAt(i) !== child.prefix.charCodeAt(i)) {
          child = child.split(this, i);
          break;
        }
      }
      return child.createStaticChild(path.slice(i));
    }
    const node = new StaticNode(path);
    this.setStaticChild(path, node);
    return node;
  }
}

class StaticNode extends ParentNode {
  constructor(prefix) {
    super();
    this.prefix = prefix;
    this.prefixLength = prefix.length;
    this.matchPrefix = compilePrefixMatch(prefix);
    this.wildcardChild = null;
    this.parametricChildren = [];
    this.kind = NODE_TYPES.STATIC;
  }

  getParametricChild(regex) {
    const source = regex && regex.source;
    return this.parametricChildren.find((child) => (child.regex && child.regex.source) === source) || null;
  }

  createParametricChild(regex, staticSuffix, nodePath) {
    let child = this.getParametricChild(regex);
    if (child) {
      child.nodePaths.add(nodePath);
      return child;
    }
    child = new ParametricNode(regex, staticSuffix, nodePath);
    this.parametricChildren.push(child);
    // Regular expressions first, the ones with the longest static suffix before the ones it ends.
    this.parametricChildren.sort((a, b) => {
      if (!a.isRegex) return 1;
      if (!b.isRegex) return -1;
      if (a.staticSuffix === null) return 1;
      if (b.staticSuffix === null) return -1;
      if (b.staticSuffix.endsWith(a.staticSuffix)) return 1;
      if (a.staticSuffix.endsWith(b.staticSuffix)) return -1;
      return 0;
    });
    return child;
  }

  getWildcardChild() {
    return this.wildcardChild;
  }

  createWildcardChild() {
    this.wildcardChild = this.wildcardChild || new WildcardNode();
    return this.wildcardChild;
  }

  split(parent, length) {
    const parentPrefix = this.prefix.slice(0, length);
    const childPrefix = this.prefix.slice(length);
    this.prefix = childPrefix;
    this.prefixLength = childPrefix.length;
    this.matchPrefix = compilePrefixMatch(childPrefix);
    const node = new StaticNode(parentPrefix);
    node.setStaticChild(childPrefix, this);
    parent.setStaticChild(parentPrefix, node);
    return node;
  }

  // The next node to try; the others that could match are pushed to be tried when it fails.
  getNextNode(path, pathIndex, stack, paramsCount) {
    let node = this.findStaticMatchingChild(path, pathIndex);
    let firstParametric = 0;
    if (node === null) {
      if (this.parametricChildren.length === 0) return this.wildcardChild;
      node = this.parametricChildren[0];
      firstParametric = 1;
    }
    // Three entries per node to try later: the node, the index in the path and the number of parameters.
    if (this.wildcardChild !== null) stack.push(this.wildcardChild, pathIndex, paramsCount);
    for (let i = this.parametricChildren.length - 1; i >= firstParametric; i -= 1) {
      stack.push(this.parametricChildren[i], pathIndex, paramsCount);
    }
    return node;
  }
}

class ParametricNode extends ParentNode {
  constructor(regex, staticSuffix, nodePath) {
    super();
    this.isRegex = Boolean(regex);
    this.regex = regex || null;
    this.staticSuffix = staticSuffix || null;
    this.kind = NODE_TYPES.PARAMETRIC;
    this.nodePaths = new Set([nodePath]);
  }

  getNextNode(path, pathIndex) {
    return this.findStaticMatchingChild(path, pathIndex);
  }
}

class WildcardNode extends Node {
  constructor() {
    super();
    this.kind = NODE_TYPES.WILDCARD;
  }

  // eslint-disable-next-line class-methods-use-this
  getNextNode() {
    return null;
  }
}

module.exports = { StaticNode, ParametricNode, WildcardNode, NODE_TYPES };

},
"@xufa/router/lib/pretty-print.js": function (module, exports, require) {
// The tree of routes as text, in the format of find-my-way.
const { httpMethod, deepEqualConstraints } = require('./strategies');

const treeData = Symbol('treeData');

function printObjectTree(obj, parentPrefix = '') {
  let tree = '';
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const value = obj[key];
    const isLast = i === keys.length - 1;
    const nodePrefix = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const nodeData = value[treeData] || '';
    tree += `${parentPrefix}${nodePrefix}${key}${nodeData.replaceAll('\n', `\n${parentPrefix}${childPrefix}`)}\n`;
    tree += printObjectTree(value, parentPrefix + childPrefix);
  }
  return tree;
}

function functionName(fn) {
  const name = (fn.name || '').replace('bound', '').trim();
  return `${name || 'anonymous'}()`;
}

function parseMeta(meta) {
  if (Array.isArray(meta)) return meta.map(parseMeta);
  if (typeof meta === 'symbol') return meta.toString();
  if (typeof meta === 'function') return functionName(meta);
  if (meta instanceof RegExp) return meta.toString();
  return meta;
}

function routeMetaData(route, options) {
  if (!options.includeMeta) return {};
  const meta = options.buildPrettyMeta(route);
  const out = {};
  const keys = Array.isArray(options.includeMeta) ? options.includeMeta : Reflect.ownKeys(meta);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
    const value = meta[key];
    if (value !== undefined && value !== null) out[key.toString()] = JSON.stringify(parseMeta(value));
  }
  return out;
}

function serializeMetaData(meta) {
  let out = '';
  for (const [key, value] of Object.entries(meta)) out += `\n• (${key}) ${value}`;
  return out;
}

function normalizeRoute(route) {
  const constraints = { ...route.opts.constraints };
  const method = constraints[httpMethod.name];
  delete constraints[httpMethod.name];
  return { ...route, method, opts: { constraints } };
}

function serializeConstraints(constraints) {
  return JSON.stringify(constraints, (key, value) => (value instanceof RegExp ? value.toString() : value));
}

function serializeRoute(route) {
  let out = ` (${route.method})`;
  const constraints = route.opts.constraints || {};
  if (Object.keys(constraints).length !== 0) out += ` ${serializeConstraints(constraints)}`;
  return out + serializeMetaData(route.metaData);
}

function sameMeta(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

function mergeSimilarRoutes(routes) {
  const merged = [];
  for (const route of routes) {
    const same = merged.find(
      (other) =>
        deepEqualConstraints(route.opts.constraints || {}, other.opts.constraints || {}) &&
        sameMeta(route.metaData, other.metaData)
    );
    if (same) same.method += `, ${route.method}`;
    else merged.push(route);
  }
  return merged;
}

function serializeNode(node, prefix, options) {
  let routes = node.routes;
  if (options.method === undefined) routes = routes.map(normalizeRoute);
  routes = routes.map((route) => ({ ...route, metaData: routeMetaData(route, options) }));
  if (options.method === undefined) routes = mergeSimilarRoutes(routes);
  return routes.map(serializeRoute).join(`\n${prefix}`);
}

function buildObjectTree(node, tree, prefix, options) {
  let subtree = tree;
  let childPrefixBase = prefix;
  if (node.isLeafNode || options.commonPrefix !== false) {
    const key = prefix || '(empty root node)';
    subtree = {};
    tree[key] = subtree;
    if (node.isLeafNode) subtree[treeData] = serializeNode(node, key, options);
    childPrefixBase = '';
  }
  if (node.staticChildrenNodes) {
    for (const child of node.staticChildrenNodes)
      buildObjectTree(child, subtree, childPrefixBase + child.prefix, options);
  }
  if (node.parametricChildren) {
    for (const child of node.parametricChildren) {
      buildObjectTree(child, subtree, childPrefixBase + Array.from(child.nodePaths).join('|'), options);
    }
  }
  if (node.wildcardChild) buildObjectTree(node.wildcardChild, subtree, '*', options);
}

function prettyPrintTree(root, options) {
  const tree = {};
  buildObjectTree(root, tree, root.prefix, options);
  return printObjectTree(tree);
}

module.exports = { prettyPrintTree };

},
"@xufa/router/lib/safe-regex.js": function (module, exports, require) {
// Whether a regular expression can backtrack catastrophically: a quantified group holding another quantifier, like
// (a+)+ or (x*)*, has a star height above one. What safe-regex checks, without its limit on repetitions.

const RANGE = /^\{(?:\d+,\d*|\d*[2-9]\d*)\}/;

const isQuantifier = (source, i) => {
  const ch = source[i];
  if (ch === '*' || ch === '+') return true;
  if (ch === '?') return false;
  // {n,}, {n,m} and {n} with n > 1 repeat
  if (ch === '{') return RANGE.test(source.slice(i, i + 24));
  return false;
};

function isSafeRegex(regex) {
  const source = regex instanceof RegExp ? regex.source : String(regex);
  // Each open group remembers whether a quantifier was seen inside it.
  const stack = [{ quantified: false }];
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\\') {
      i += 1;
      if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      continue;
    }
    if (inClass) {
      if (ch === ']') {
        inClass = false;
        if (isQuantifier(source, i + 1)) stack[stack.length - 1].quantified = true;
      }
      continue;
    }
    if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      stack.push({ quantified: false });
    } else if (ch === ')') {
      const group = stack.length > 1 ? stack.pop() : { quantified: false };
      if (isQuantifier(source, i + 1)) {
        if (group.quantified) return false;
        stack[stack.length - 1].quantified = true;
      } else if (group.quantified) {
        stack[stack.length - 1].quantified = true;
      }
    } else if (isQuantifier(source, i)) {
      stack[stack.length - 1].quantified = true;
    }
  }
  return true;
}

module.exports = { isSafeRegex };

},
"@xufa/router/lib/strategies.js": function (module, exports, require) {
// Built-in constraint strategies: version (semver, from the Accept-Version header) and host.

function equalValue(a, b) {
  if (a instanceof RegExp && b instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  return a === b;
}

function SemVerStore() {
  if (!(this instanceof SemVerStore)) return new SemVerStore();
  this.store = new Map();
  this.maxMajor = 0;
  this.maxMinors = {};
  this.maxPatches = {};
}

SemVerStore.prototype.set = function set(version, value) {
  if (typeof version !== 'string') throw new TypeError('Version should be a string');
  const parts = version.split('.', 3);
  if (Number.isNaN(Number(parts[0]))) throw new TypeError('Major version must be a numeric value');
  const major = Number(parts[0]);
  const minor = Number(parts[1]) || 0;
  const patch = Number(parts[2]) || 0;
  if (major >= this.maxMajor) {
    this.maxMajor = major;
    this.store.set('x', value);
    this.store.set('*', value);
    this.store.set('x.x', value);
    this.store.set('x.x.x', value);
  }
  if (minor >= (this.maxMinors[major] || 0)) {
    this.maxMinors[major] = minor;
    this.store.set(`${major}.x`, value);
    this.store.set(`${major}.x.x`, value);
  }
  if (patch >= (this.maxPatches[`${major}.${minor}`] || 0)) {
    this.maxPatches[`${major}.${minor}`] = patch;
    this.store.set(`${major}.${minor}.x`, value);
  }
  this.store.set(`${major}.${minor}.${patch}`, value);
  return this;
};

SemVerStore.prototype.get = function get(version) {
  return this.store.get(version);
};

const version = {
  name: 'version',
  mustMatchWhenDerived: true,
  storage: SemVerStore,
  deriveConstraint: (req) => req.headers['accept-version'],
  validate(value) {
    if (typeof value !== 'string') throw new TypeError('Version should be a string');
  },
};

function HostStorage() {
  const hosts = new Map();
  const regexHosts = [];
  const regexCache = new Map();
  return {
    get(host) {
      const exact = hosts.get(host);
      if (exact) return exact;
      if (regexHosts.length === 0) return undefined;
      if (regexCache.has(host)) return regexCache.get(host);
      for (const entry of regexHosts) {
        if (entry.host.test(host)) {
          regexCache.set(host, entry.value);
          return entry.value;
        }
      }
      regexCache.set(host, undefined);
      return undefined;
    },
    set(host, value) {
      if (host instanceof RegExp) {
        regexHosts.push({ host: new RegExp(host.source, host.flags.replace(/[gy]/g, '')), value });
        regexCache.clear();
      } else {
        hosts.set(host, value);
      }
    },
  };
}

const host = {
  name: 'host',
  mustMatchWhenDerived: false,
  storage: HostStorage,
  deriveConstraint: (req) => req.headers.host || req.headers[':authority'],
  validate(value) {
    if (typeof value !== 'string' && Object.prototype.toString.call(value) !== '[object RegExp]') {
      throw new TypeError('Host should be a string or a RegExp');
    }
  },
};

// Used to print every method of a route in one tree.
const httpMethod = {
  name: '__xufa_router_http_method__',
  storage() {
    const handlers = new Map();
    return {
      get: (type) => handlers.get(type) || null,
      set: (type, value) => handlers.set(type, value),
    };
  },
  deriveConstraint: (req) => req.method,
  mustMatchWhenDerived: true,
};

function deepEqualConstraints(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !equalValue(a[key], b[key])) return false;
  }
  return true;
}

module.exports = { version, host, httpMethod, SemVerStore, HostStorage, deepEqualConstraints };

},
"@xufa/router/lib/url.js": function (module, exports, require) {
// Splitting the path from the query string, and decoding the path.
//
// The path is decoded with decodeURI, which keeps the reserved characters (# $ & + , / : ; = ? @) encoded, so that an
// encoded slash never splits a parameter. Parameters holding one of them are decoded afterwards on their own. An
// encoded % (%25) is encoded once more before decodeURI, so that it is never decoded twice.

// For the two hex digits after a %, the reserved character they decode to, or 0.
const RESERVED = new Uint8Array(768);
for (const [hex, char] of [
  ['23', '#'],
  ['24', '$'],
  ['25', '%'],
  ['26', '&'],
  ['2B', '+'],
  ['2b', '+'],
  ['2C', ','],
  ['2c', ','],
  ['2F', '/'],
  ['2f', '/'],
  ['3A', ':'],
  ['3a', ':'],
  ['3B', ';'],
  ['3b', ';'],
  ['3D', '='],
  ['3d', '='],
  ['3F', '?'],
  ['3f', '?'],
  ['40', '@'],
]) {
  RESERVED[((hex.charCodeAt(0) - 50) << 8) | hex.charCodeAt(1)] = char.charCodeAt(0);
}

function reservedCharCode(high, low) {
  if (high < 50 || high > 52 || low > 255) return 0;
  return RESERVED[((high - 50) << 8) | low];
}

// Result of splitURL(), reused: read its fields before calling it again.
const split = { path: '', querystring: '', decodeParams: false };

// Splits the request target at ?, # (and ; when asked) and decodes the path. Null when the path is malformed.
function splitURL(url, semicolon) {
  const len = url.length;
  let i = 1;
  for (; i < len; i += 1) {
    const code = url.charCodeAt(i);
    if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      split.path = url.slice(0, i);
      split.querystring = url.slice(i + 1);
      split.decodeParams = false;
      return split;
    }
    if (code === 37) return splitEncoded(url, semicolon, i);
  }
  split.path = url;
  split.querystring = '';
  split.decodeParams = false;
  return split;
}

function splitEncoded(url, semicolon, start) {
  let path = url;
  let querystring = '';
  let decode = false;
  let decodeParams = false;
  for (let i = start; i < path.length; i += 1) {
    const code = path.charCodeAt(i);
    if (code === 37) {
      const reserved = reservedCharCode(path.charCodeAt(i + 1), path.charCodeAt(i + 2));
      if (reserved === 0) {
        decode = true;
      } else {
        decodeParams = true;
        if (reserved === 37) {
          decode = true;
          path = `${path.slice(0, i + 1)}25${path.slice(i + 1)}`;
          i += 2;
        }
        i += 2;
      }
    } else if (code === 63 || code === 35 || (code === 59 && semicolon)) {
      querystring = path.slice(i + 1);
      path = path.slice(0, i);
      break;
    }
  }
  if (decode) {
    try {
      split.path = decodeURI(path);
    } catch {
      return null;
    }
  } else {
    split.path = path;
  }
  split.querystring = querystring;
  split.decodeParams = decodeParams;
  return split;
}

// Decodes the reserved characters left encoded in a parameter.
function decodeParam(param) {
  const first = param.indexOf('%');
  if (first === -1) return param;
  let out = param.slice(0, first);
  let last = first;
  for (let i = first; i < param.length; i += 1) {
    if (param.charCodeAt(i) === 37) {
      const code = reservedCharCode(param.charCodeAt(i + 1), param.charCodeAt(i + 2));
      if (code !== 0) {
        out += param.slice(last, i) + String.fromCharCode(code);
        last = i + 3;
        i += 2;
      }
    }
  }
  return out + param.slice(last);
}

function safeDecodeURI(url, semicolon) {
  const result = splitURL(url, semicolon);
  if (result === null) throw new URIError('URI malformed');
  return { path: result.path, querystring: result.querystring, shouldDecodeParam: result.decodeParams };
}

// The path of an absolute-form request target (http://host/path?q), or null when it is not a valid one.
function pathFromAbsoluteURL(url) {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) return url;
  const scheme = url.slice(0, schemeEnd).toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return url;
  const authorityStart = schemeEnd + 3;
  let authorityEnd = url.length;
  const pathStart = url.indexOf('/', authorityStart);
  if (pathStart !== -1) authorityEnd = pathStart;
  const queryStart = url.indexOf('?', authorityStart);
  if (queryStart !== -1 && queryStart < authorityEnd) authorityEnd = queryStart;
  if (url.indexOf('#', authorityStart) !== -1 || authorityEnd === authorityStart) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${scheme}:` || parsed.host.length === 0) return null;
  } catch {
    return null;
  }
  if (authorityEnd === url.length) return '/';
  if (authorityEnd === queryStart) return `/${url.slice(queryStart)}`;
  return url.slice(pathStart);
}

const DUPLICATE_SLASHES = /\/\/+/g;

function removeDuplicateSlashes(path) {
  return path.indexOf('//') !== -1 ? path.replace(DUPLICATE_SLASHES, '/') : path;
}

function trimLastSlash(path) {
  return path.length > 1 && path.charCodeAt(path.length - 1) === 47 ? path.slice(0, -1) : path;
}

module.exports = {
  splitURL,
  splitEncoded,
  decodeParam,
  safeDecodeURI,
  safeDecodeURIComponent: decodeParam,
  pathFromAbsoluteURL,
  removeDuplicateSlashes,
  trimLastSlash,
};

},
"@xufa/router/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/router","version":"0.1.0"};
},
"@xufa/schema/index.js": function (module, exports, require) {
'use strict';

// @xufa/schema: schemas of data. Written as code with s (plain JSON Schemas, with their TypeScript types), as JSON
// Schema (draft-04 to 2020-12), or with the builder of types (new Schema({ name: String() })); compiled into
// functions that check values (the validator of the routes of @xufa/http), written as standalone code, or inferred
// from samples. No dependencies.
//
//   const { s, compileJsonSchema } = require('@xufa/schema');
//   const Book = s.object({ title: s.string({ minLength: 1 }), pages: s.optional(s.integer({ minimum: 1 })) });
//   const validate = compileJsonSchema(Book);
//   validate({ pages: 0 }); // ['title is mandatory', 'pages must be at least 1']
const { ClosedSchema } = require('./lib/closed-schema');
const { compileErrors, compileFirstError, compileIsValid, compileType } = require('./lib/compile');
const {
  fromJsonSchema,
  compileJsonSchema,
  compileJsonSchemaAsync,
  loadJsonSchemas,
  builtInFormats,
} = require('./lib/json-schema');
const { Schema } = require('./lib/schema');
const { standaloneCode, standaloneModule, standaloneJsonSchema } = require('./lib/standalone');
const { ajvKeywords } = require('./lib/ajv-keywords');
const { inferJsonSchema, inferSchemaCode } = require('./lib/infer');
// The builder: JSON Schemas written as code (s.object(), s.string()...), with their types.
const { s, isOptional, OPTIONAL } = require('./lib/builder');
const {
  AllOfType,
  AllOf,
  allOf,
  oallOf,
  AnyType,
  Any,
  any,
  oany,
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
  BooleanType,
  Boolean,
  bool,
  obool,
  ConditionalType,
  Conditional,
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum,
  FloatType,
  Float,
  float,
  ofloat,
  num,
  onum,
  IntegerType,
  Integer,
  int,
  oint,
  NeverType,
  Never,
  never,
  NotType,
  Not,
  not,
  onot,
  ObjType,
  Obj,
  obj,
  oobj,
  OneOfType,
  OneOf,
  oneOf,
  ooneOf,
  RefType,
  Ref,
  StringType,
  String,
  str,
  ostr,
  ValidateType,
  hasErrors,
  toErrors,
  ValuesType,
  Values,
  Const,
  WhenType,
  When,
  isJsonType,
  KeywordType,
} = require('./lib/types');

module.exports = {
  s,
  isOptional,
  OPTIONAL,
  ClosedSchema,
  compileErrors,
  compileFirstError,
  compileIsValid,
  compileType,
  fromJsonSchema,
  compileJsonSchema,
  compileJsonSchemaAsync,
  loadJsonSchemas,
  Schema,
  AllOfType,
  AllOf,
  allOf,
  oallOf,
  AnyType,
  Any,
  any,
  oany,
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
  BooleanType,
  Boolean,
  bool,
  obool,
  ConditionalType,
  Conditional,
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum,
  FloatType,
  Float,
  float,
  ofloat,
  num,
  onum,
  IntegerType,
  Integer,
  int,
  oint,
  NeverType,
  Never,
  never,
  NotType,
  Not,
  not,
  onot,
  ObjType,
  Obj,
  obj,
  oobj,
  OneOfType,
  OneOf,
  oneOf,
  ooneOf,
  RefType,
  Ref,
  StringType,
  String,
  str,
  ostr,
  ValidateType,
  hasErrors,
  toErrors,
  ValuesType,
  Values,
  Const,
  WhenType,
  When,
  isJsonType,
  standaloneCode,
  standaloneModule,
  standaloneJsonSchema,
  KeywordType,
  ajvKeywords,
  builtInFormats,
  inferJsonSchema,
  inferSchemaCode,
};

},
"@xufa/schema/lib/ajv-keywords.js": function (module, exports, require) {
// The keywords of ajv-keywords (https://github.com/ajv-validator/ajv-keywords), as definitions for the option "keywords"
// of compileJsonSchema(): ajvKeywords() gives all of them, ajvKeywords(['range', 'typeof']) the ones named. The ones
// that are other keywords written shorter are macros, and compile to the same code as those keywords.
const { deepEqual } = require('./deep-equal');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const list = (value) => (Array.isArray(value) ? value : [value]);

// Throws when the value of `keyword` in a schema is not what it takes.
function expect(isValid, keyword, what) {
  if (!isValid) {
    throw new Error(`Unsupported JSON Schema: "${keyword}" must be ${what}`);
  }
}

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

const TYPEOF_NAMES = ['undefined', 'string', 'number', 'object', 'function', 'boolean', 'symbol', 'bigint'];

// Constructors "instanceof" can name, as in ajv-keywords.
// Read from globalThis, so a script that declares a global named like one of them (const { String } = ...) does not
// shadow it here.
const CONSTRUCTORS = Object.fromEntries(
  ['Object', 'Array', 'Function', 'Number', 'String', 'Boolean', 'Date', 'RegExp', 'Map', 'Set', 'Promise', 'Buffer']
    .filter((name) => typeof globalThis[name] === 'function')
    .map((name) => [name, globalThis[name]])
);

// The regular expression of "regexp": "/source/flags" or { pattern, flags }, as ajv-keywords reads it.
function regExpOf(value) {
  const what = 'a string "/pattern/flags" or { pattern, flags }';
  if (typeof value === 'string') {
    const match = /^\/(.*)\/([a-z]*)$/s.exec(value);
    expect(match !== null, 'regexp', what);
    return new RegExp(match[1], match[2]);
  }
  expect(isObject(value) && typeof value.pattern === 'string', 'regexp', what);
  return new RegExp(value.pattern, value.flags);
}

const unescapeToken = (token) => token.replace(/~1/g, '/').replace(/~0/g, '~');

// The schema "deepProperties" gives for one JSON pointer: nested "properties" down to `schema`, with the tuple of an
// array for a numeric token, as in ajv-keywords.
function deepPropertySchema(pointer, schema, draft) {
  const tokens = pointer.split('/').slice(1).map(unescapeToken);
  const root = {};
  let current = root;
  tokens.forEach((token, i) => {
    const next = i === tokens.length - 1 ? schema : {};
    current.properties = { [token]: next };
    if (/^[0-9]+$/.test(token)) {
      current.type = ['object', 'array'];
      current[draft === '2020-12' ? 'prefixItems' : 'items'] = [
        ...Array.from({ length: Number(token) }, () => ({})),
        next,
      ];
    } else {
      current.type = 'object';
    }
    current = next;
  });
  return root;
}

// Whether the value at a JSON pointer of `data` is defined, as ajv-keywords reads it for "deepRequired": the path is
// followed while the values on it are truthy (like data.a && data.a.b).
function isDefinedAt(data, tokens) {
  let current = data;
  for (let i = 0; i < tokens.length && current; i += 1) {
    current = current[tokens[i]];
  }
  return current !== undefined;
}

// Whether no two elements of `data` that are objects have equal values of `key` (deeply, NaN equal to NaN). Short
// arrays are compared pair by pair, which allocates nothing; long ones keep the values seen.
function hasUniqueProperty(data, key) {
  const isItem = (item) => item !== null && typeof item === 'object';
  const same = (a, b) =>
    a === b ||
    (Number.isNaN(a) && Number.isNaN(b)) ||
    (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && deepEqual(a, b));
  if (data.length <= 16) {
    for (let i = 1; i < data.length; i += 1) {
      if (isItem(data[i])) {
        const a = data[i][key];
        for (let j = 0; j < i; j += 1) {
          if (isItem(data[j]) && same(a, data[j][key])) {
            return false;
          }
        }
      }
    }
    return true;
  }
  const primitives = new Set();
  const objects = [];
  return data.every((item) => {
    if (!isItem(item)) {
      return true;
    }
    const property = item[key];
    if (property !== null && typeof property === 'object') {
      if (objects.some((other) => deepEqual(other, property))) {
        return false;
      }
      objects.push(property);
      return true;
    }
    if (primitives.has(property)) {
      return false;
    }
    primitives.add(property);
    return true;
  });
}

const DEFINITIONS = {
  typeof: {
    compile(value) {
      const names = list(value);
      expect(
        names.every((name) => TYPEOF_NAMES.includes(name)),
        'typeof',
        `one of ${TYPEOF_NAMES.join(', ')}`
      );
      return (data) => names.includes(typeof data);
    },
    message: (value) => `must be of typeof ${list(value).join(' or ')}`,
  },
  instanceof: {
    compile(value) {
      const names = list(value);
      const known = Object.keys(CONSTRUCTORS);
      expect(
        names.every((name) => known.includes(name)),
        'instanceof',
        `one of ${known.join(', ')}`
      );
      const constructors = names.map((name) => CONSTRUCTORS[name]);
      return (data) => constructors.some((constructor) => data instanceof constructor);
    },
    message: (value) => `must be an instance of ${list(value).join(' or ')}`,
  },
  range: {
    type: 'number',
    macro(value) {
      expect(Array.isArray(value) && value.length === 2 && value[0] <= value[1], 'range', '[minimum, maximum]');
      return { minimum: value[0], maximum: value[1] };
    },
  },
  exclusiveRange: {
    type: 'number',
    macro(value, parentSchema, { draft }) {
      expect(Array.isArray(value) && value.length === 2 && value[0] < value[1], 'exclusiveRange', '[minimum, maximum]');
      return draft === 'draft-04'
        ? { minimum: value[0], exclusiveMinimum: true, maximum: value[1], exclusiveMaximum: true }
        : { exclusiveMinimum: value[0], exclusiveMaximum: value[1] };
    },
  },
  regexp: {
    type: 'string',
    compile(value) {
      const regExp = regExpOf(value);
      // A regular expression is tested as it is, unless its flags make test() depend on the previous call.
      if (!regExp.global && !regExp.sticky) {
        return regExp;
      }
      return (data) => {
        regExp.lastIndex = 0;
        return regExp.test(data);
      };
    },
    message: (value) => `must match ${regExpOf(value)}`,
  },
  uniqueItemProperties: {
    type: 'array',
    compile(value) {
      expect(isStringList(value), 'uniqueItemProperties', 'a list of property names');
      // As in ajv-keywords, the elements that are objects (or arrays) count, and a missing property is a value too.
      return (data) => {
        if (data.length <= 1) {
          return true;
        }
        for (let k = 0; k < value.length; k += 1) {
          if (!hasUniqueProperty(data, value[k])) {
            return false;
          }
        }
        return true;
      };
    },
    message: (value) => `must have elements with unique ${value.join(', ')}`,
  },
  allRequired: {
    type: 'object',
    macro(value, parentSchema) {
      expect(typeof value === 'boolean', 'allRequired', 'true or false');
      if (!value) {
        return true;
      }
      expect(isObject(parentSchema.properties), 'allRequired', 'next to "properties"');
      return { required: Object.keys(parentSchema.properties) };
    },
  },
  anyRequired: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'anyRequired', 'a list of property names');
      return { anyOf: value.map((key) => ({ required: [key] })) };
    },
  },
  oneRequired: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'oneRequired', 'a list of property names');
      return { oneOf: value.map((key) => ({ required: [key] })) };
    },
  },
  patternRequired: {
    type: 'object',
    compile(value) {
      expect(isStringList(value), 'patternRequired', 'a list of patterns');
      const regExps = value.map((source) => new RegExp(source, 'u'));
      return (data) => {
        const keys = Object.keys(data);
        return regExps.every((regExp) => keys.some((key) => regExp.test(key)));
      };
    },
    message: (value) => `must have keys matching ${value.join(', ')}`,
  },
  prohibited: {
    type: 'object',
    macro(value) {
      expect(isStringList(value), 'prohibited', 'a list of property names');
      return { properties: Object.fromEntries(value.map((key) => [key, false])) };
    },
  },
  deepProperties: {
    type: 'object',
    macro(value, parentSchema, { draft }) {
      expect(isObject(value), 'deepProperties', 'an object of schemas by JSON pointer');
      return { allOf: Object.entries(value).map(([pointer, schema]) => deepPropertySchema(pointer, schema, draft)) };
    },
  },
  deepRequired: {
    type: 'object',
    compile(value) {
      expect(
        isStringList(value) && value.every((pointer) => pointer.startsWith('/')),
        'deepRequired',
        'a list of JSON pointers'
      );
      const paths = value.map((pointer) => pointer.split('/').slice(1).map(unescapeToken));
      return (data) => paths.every((tokens) => isDefinedAt(data, tokens));
    },
    message: (value, data) => {
      const missing = value.filter((pointer) => !isDefinedAt(data, pointer.split('/').slice(1).map(unescapeToken)));
      return `must have ${missing.join(', ')}`;
    },
  },
};

// Keywords of ajv-keywords that the validator leaves out, with the reason.
const LEFT_OUT = {
  transform:
    'it changes the data (the validator only assigns defaults and removes properties, see useDefaults and removeAdditional)',
  dynamicDefaults: 'it computes defaults when validating; use useDefaults with fixed defaults',
  select: 'it needs $data references',
  selectCases: 'it needs $data references',
  selectDefault: 'it needs $data references',
};

// Definitions of the keywords of ajv-keywords named in `names` (all of them by default).
function ajvKeywords(names = Object.keys(DEFINITIONS)) {
  return list(names).map((name) => {
    if (hasOwn(LEFT_OUT, name)) {
      throw new Error(`ajvKeywords: "${name}" is not supported: ${LEFT_OUT[name]}`);
    }
    if (!hasOwn(DEFINITIONS, name)) {
      throw new Error(
        `ajvKeywords: unknown keyword "${name}"; the keywords are ${Object.keys(DEFINITIONS).join(', ')}`
      );
    }
    return { keyword: name, ...DEFINITIONS[name] };
  });
}

module.exports = {
  ajvKeywords,
};

},
"@xufa/schema/lib/builder.js": function (module, exports, require) {
'use strict';

// @xufa/schema: JSON Schemas written as code, with their types in TypeScript. What it makes are plain JSON Schemas
// (draft-07, the ones of fastify): routes of @xufa/http and fastify validate and serialize with them, @xufa/openapi
// documents them; in TypeScript, Infer<typeof schema> is the type of the values, and SchemaTypeProvider types the
// requests and replies of routes. No dependencies.
//
//   const { s } = require('@xufa/schema');
//   const Book = s.object({
//     id: s.integer({ minimum: 1 }),
//     title: s.string({ minLength: 1 }),
//     pages: s.optional(s.integer()),
//     status: s.enum(['draft', 'published']),
//     tags: s.array(s.string(), { uniqueItems: true }),
//   });
//   const NewBook = s.omit(Book, ['id']);           // the body of a create
//   const BookPatch = s.partial(NewBook);           // the body of an update
//   app.post('/books', { schema: { body: NewBook, response: { 201: Book } } }, handler);

// The keys of an object that are not required: a mark on the schemas given to s.optional() (not enumerable, so it is
// not in their JSON).
const OPTIONAL = Symbol.for('xufa.schema.optional');

const isSchema = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function check(value, what) {
  if (!isSchema(value)) throw new TypeError(`${what} is a schema (an object)`);
  return value;
}

// A copy of a schema (its mark of optional kept, or given).
function copyOf(schema, optional = schema[OPTIONAL] === true) {
  const copy = { ...schema };
  if (optional) Object.defineProperty(copy, OPTIONAL, { value: true, enumerable: false });
  return copy;
}

const typeOfValue = (value) => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  return null;
};

function object(properties, options = {}) {
  check(properties, 's.object(properties)');
  const props = {};
  const required = [];
  for (const [name, schema] of Object.entries(properties)) {
    check(schema, `The property ${name}`);
    props[name] = copyOf(schema, false);
    if (schema[OPTIONAL] !== true) required.push(name);
  }
  const out = { type: 'object', properties: props, ...options };
  if (required.length) out.required = required;
  return out;
}

// The properties of an object schema, as given to s.object() (those not required marked optional).
function propertiesOf(schema, what) {
  check(schema, what);
  if (schema.type !== 'object' || !isSchema(schema.properties))
    throw new TypeError(`${what} is a schema of s.object()`);
  const required = new Set(schema.required || []);
  const out = {};
  for (const [name, property] of Object.entries(schema.properties)) out[name] = copyOf(property, !required.has(name));
  return out;
}

// The options of an object schema (all but its properties and required).
function optionsOf(schema) {
  const { type, properties, required, ...options } = schema; // eslint-disable-line no-unused-vars
  return options;
}

function nullable(schema) {
  check(schema, 's.nullable(schema)');
  const optional = schema[OPTIONAL] === true;
  let out;
  if (typeof schema.type === 'string')
    out = { ...schema, type: schema.type === 'null' ? 'null' : [schema.type, 'null'] };
  else if (Array.isArray(schema.type))
    out = { ...schema, type: schema.type.includes('null') ? schema.type : [...schema.type, 'null'] };
  else out = { anyOf: [copyOf(schema, false), { type: 'null' }] };
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return copyOf(out, optional);
}

const s = {
  string: (options = {}) => ({ type: 'string', ...options }),
  number: (options = {}) => ({ type: 'number', ...options }),
  integer: (options = {}) => ({ type: 'integer', ...options }),
  boolean: (options = {}) => ({ type: 'boolean', ...options }),
  null: (options = {}) => ({ type: 'null', ...options }),

  // Strings of formats (what JSON has: a date is its text).
  dateTime: (options = {}) => ({ type: 'string', format: 'date-time', ...options }),
  date: (options = {}) => ({ type: 'string', format: 'date', ...options }),
  email: (options = {}) => ({ type: 'string', format: 'email', ...options }),
  uuid: (options = {}) => ({ type: 'string', format: 'uuid', ...options }),
  uri: (options = {}) => ({ type: 'string', format: 'uri', ...options }),

  // One value; one of some values.
  literal(value, options = {}) {
    const type = typeOfValue(value);
    if (!type) throw new TypeError('s.literal(value): a string, a number, a boolean or null');
    return { type, const: value, ...options };
  },
  enum(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError('s.enum(values): a list of values');
    const types = [...new Set(values.map(typeOfValue))];
    if (types.includes(null)) throw new TypeError('s.enum(values): strings, numbers, booleans or null');
    // integer is number when both are there; one type is the type, several a list.
    const merged = [...new Set(types.map((t) => (t === 'integer' && types.includes('number') ? 'number' : t)))];
    return { type: merged.length === 1 ? merged[0] : merged, enum: [...values], ...options };
  },

  array: (items, options = {}) => ({ type: 'array', items: copyOf(check(items, 's.array(items)'), false), ...options }),
  // An array of a length, of a schema for each item (draft-07: items as a list).
  tuple(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError('s.tuple(items): a list of schemas');
    return {
      type: 'array',
      items: items.map((item, i) => copyOf(check(item, `s.tuple item ${i}`), false)),
      minItems: items.length,
      maxItems: items.length,
      additionalItems: false,
      ...options,
    };
  },
  object,
  // An object of any keys, with values of a schema.
  record: (values, options = {}) => ({
    type: 'object',
    additionalProperties: copyOf(check(values, 's.record(values)'), false),
    ...options,
  }),

  // Any of some schemas (anyOf); all of them (allOf).
  union(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.union(schemas): a list of schemas');
    return { anyOf: schemas.map((schema, i) => copyOf(check(schema, `s.union schema ${i}`), false)), ...options };
  },
  intersect(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.intersect(schemas): a list of schemas');
    return { allOf: schemas.map((schema, i) => copyOf(check(schema, `s.intersect schema ${i}`), false)), ...options };
  },

  // A property that is not required (in s.object()); a value that can be null too.
  optional: (schema) => copyOf(check(schema, 's.optional(schema)'), true),
  nullable,

  // Objects from objects: some of their properties, all of them not required (or required), more of them.
  pick(schema, keys) {
    const properties = propertiesOf(schema, 's.pick(schema)');
    const out = {};
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.pick(): the schema has no property ${key}`);
      out[key] = properties[key];
    }
    return object(out, optionsOf(schema));
  },
  omit(schema, keys) {
    const properties = propertiesOf(schema, 's.omit(schema)');
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.omit(): the schema has no property ${key}`);
      delete properties[key];
    }
    return object(properties, optionsOf(schema));
  },
  partial(schema) {
    const properties = propertiesOf(schema, 's.partial(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], true);
    return object(properties, optionsOf(schema));
  },
  required(schema) {
    const properties = propertiesOf(schema, 's.required(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], false);
    return object(properties, optionsOf(schema));
  },
  extend(schema, more, options = {}) {
    const properties = propertiesOf(schema, 's.extend(schema)');
    check(more, 's.extend(schema, properties)');
    return object({ ...properties, ...more }, { ...optionsOf(schema), ...options });
  },

  // A shared schema (app.addSchema(schema) with its $id): { $ref: 'Book#' }.
  ref: (id, options = {}) => ({ $ref: id, ...options }),
  // Anything; nothing.
  any: (options = {}) => ({ ...options }),
  unknown: (options = {}) => ({ ...options }),
  never: (options = {}) => ({ not: {}, ...options }),
};

const isOptional = (schema) => isSchema(schema) && schema[OPTIONAL] === true;

module.exports = { s, isOptional, OPTIONAL };

},
"@xufa/schema/lib/closed-schema.js": function (module, exports, require) {
const { Schema } = require('./schema');

class ClosedSchema extends Schema {
  constructor(schema = {}, options = {}) {
    super(schema, { ...options, isOpen: false });
  }
}

module.exports = {
  ClosedSchema,
};

},
"@xufa/schema/lib/coerce.js": function (module, exports, require) {
// The option coerceTypes: a value that is not of the JSON type its schema's "type" asks for is converted to one of those
// types when it can be, with ajv's rules, before it is checked. The converted value replaces the original one in the
// object or array it is in; a value that is in neither (the value validated) is converted for the validation only.
const { ValidateType } = require('./types/validate-type');

// The types a value can be converted to, in the order "type" lists them; "array" too with coerceTypes: 'array'.
const COERCIBLE = ['string', 'number', 'integer', 'boolean', 'null'];

// Whether a value is of a JSON type, as the type checks see it (numbers are finite).
const TYPE_TESTS = {
  string: (x) => typeof x === 'string',
  number: (x) => typeof x === 'number' && Number.isFinite(x),
  integer: (x) => Number.isInteger(x),
  boolean: (x) => typeof x === 'boolean',
  null: (x) => x === null,
  object: (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
  array: (x) => Array.isArray(x),
};

const isNumeric = (x) => typeof x === 'string' && x !== '' && !Number.isNaN(Number(x));

// The value converted to a type, or undefined when it cannot be (as in ajv: numbers and booleans to strings, numeric
// strings, booleans and null to numbers, 'true', 'false', 1, 0 and null to booleans, '', 0 and false to null, and any
// primitive to an array of it).
const COERCIONS = {
  string: (x) => {
    if (typeof x === 'number' || typeof x === 'boolean') {
      return String(x);
    }
    return x === null ? '' : undefined;
  },
  number: (x) => (typeof x === 'boolean' || x === null || isNumeric(x) ? Number(x) : undefined),
  integer: (x) =>
    typeof x === 'boolean' || x === null || (isNumeric(x) && Number(x) % 1 === 0) ? Number(x) : undefined,
  boolean: (x) => {
    if (x === 'false' || x === 0 || x === null) {
      return false;
    }
    return x === 'true' || x === 1 ? true : undefined;
  },
  null: (x) => (x === '' || x === 0 || x === false ? null : undefined),
  array: (x) => (x === null || ['string', 'number', 'boolean'].includes(typeof x) ? [x] : undefined),
};

// A value converted for a schema with `spec` ({ types, to, array }, see coerceSpecOf()): { value, assign }, where
// `assign` tells whether the converted value replaces the original one. With coerceTypes: 'array', an array of one
// element is first taken as that element, which is checked even when it is not converted, as in ajv.
function coerce(value, spec) {
  const matches = (x) => spec.types.some((type) => TYPE_TESTS[type](x));
  if (matches(value)) {
    return { value, assign: false };
  }
  let current = value;
  let converted;
  if (spec.array && Array.isArray(current) && current.length === 1) {
    [current] = current;
    if (matches(current)) {
      converted = current;
    }
  }
  for (let i = 0; i < spec.to.length && converted === undefined; i += 1) {
    converted = COERCIONS[spec.to[i]](current);
  }
  return converted === undefined ? { value: current, assign: false } : { value: converted, assign: true };
}

// The conversion a type asks for: its own (coerceSpec, set when converting a schema with "type"), or the one of the
// target of a reference, or of the first part of an allOf that has one.
let TYPES;

function coerceSpecOf(type, seen = []) {
  if (!type) {
    return undefined;
  }
  if (type.coerceSpec) {
    return type.coerceSpec;
  }
  // Required when first used (the types require this module), then kept: this runs for every key of every object.
  // eslint-disable-next-line global-require
  if (TYPES === undefined) TYPES = require('./types');
  const { RefType, AllOfType } = TYPES;
  if (type.constructor === RefType && !seen.includes(type)) {
    return coerceSpecOf(type.getTarget(), [...seen, type]);
  }
  if (type.constructor === AllOfType) {
    for (let i = 0; i < type.types.length; i += 1) {
      const spec = coerceSpecOf(type.types[i], seen);
      if (spec) {
        return spec;
      }
    }
  }
  return undefined;
}

// The value of container[key] for the type that checks it, converted (and written back) when its schema asks.
function readCoerced(container, key, type, value) {
  const spec = value === undefined ? undefined : coerceSpecOf(type);
  if (!spec) {
    return value;
  }
  const result = coerce(value, spec);
  if (result.assign) {
    container[key] = result.value;
  }
  return result.value;
}

// The value validated, converted for the validation only: the schema of the whole value, with coerceTypes (see
// fromJsonSchema() in json-schema.js). Its type checks the converted value, presence included.
class CoerceType extends ValidateType {
  constructor(options = {}) {
    super({ ...options, isMandatory: false, isNullable: true });
    this.type = options.type;
    this.spec = options.spec;
  }

  converted(value) {
    return value === undefined ? value : coerce(value, this.spec).value;
  }

  validate(value, fieldName = undefined) {
    return this.type.validate(this.converted(value), fieldName);
  }

  errors(value, fieldName = undefined) {
    return this.type.errors(this.converted(value), fieldName);
  }

  isValid(value) {
    return this.type.isValid(this.converted(value));
  }
}

module.exports = {
  CoerceType,
  COERCIBLE,
  TYPE_TESTS,
  coerce,
  coerceSpecOf,
  readCoerced,
};

},
"@xufa/schema/lib/compile.js": function (module, exports, require) {
const { deepEqual } = require('./deep-equal');
const { Schema } = require('./schema');
const { ClosedSchema } = require('./closed-schema');
const {
  AllOfType,
  AnyOfType,
  AnyType,
  ArrayOfType,
  BooleanType,
  ConditionalType,
  EnumType,
  FloatType,
  IntegerType,
  NeverType,
  NotType,
  ObjType,
  OneOfType,
  RefType,
  StringType,
  ValuesType,
  WhenType,
  hasErrors,
  toErrors,
} = require('./types');
const { NO_TYPE, EVERY_TYPE } = require('./types/one-of');
const { KeywordType } = require('./types/keyword');
const { FORMAT_LIMITS } = require('./types/string');
const { FORMAT_COMPARES } = require('./formats');

// What the built-in comparisons of times put before a value to read its time (see compareTime() in formats.js).
const TIME_PREFIXES = new Map([
  [FORMAT_COMPARES.time, '2020-01-01T'],
  [FORMAT_COMPARES['date-time'], ''],
]);

// How the comparison of a limit of a format fails, as code (see FORMAT_LIMITS in types/string.js).
const FORMAT_LIMIT_FAILS = {
  formatMinimum: '< 0',
  formatMaximum: '> 0',
  formatExclusiveMinimum: '<= 0',
  formatExclusiveMaximum: '>= 0',
};
const { copyDefault } = require('./defaults');
const { CoerceType, coerceSpecOf } = require('./coerce');
const { codePointLength } = require('./types/code-point-length');
const { hasDuplicates } = require('./types/has-duplicates');
const { JSON_TYPES, UnevaluatedType, staticEvaluatedBy, staticEvaluatedByAll } = require('./unevaluated');
const { errorObject, pathName } = require('./error-objects');

// The path of error objects that the code `path` gives when it is the same for every value (keys and positions
// written in the schema, out of loops): an array of keys and indexes, else undefined.
function staticPath(path) {
  if (!path.startsWith('[') || !path.endsWith(']')) {
    return undefined;
  }
  try {
    const value = JSON.parse(path);
    return Array.isArray(value) && value.every((item) => typeof item === 'string' || Number.isInteger(item))
      ? value
      : undefined;
  } catch (e) {
    return undefined;
  }
}

// A literal (key or index) of the code `code`, or undefined when it is worked out when validating.
function literalOf(code) {
  try {
    const value = JSON.parse(code);
    return typeof value === 'string' || Number.isInteger(value) ? value : undefined;
  } catch (e) {
    return undefined;
  }
}

// Compiles a type tree into a single generated function, like ajv does, so validating a value runs inline code
// instead of one isValid()/errors() call per node. There are three modes:
// - check: returns true or false, like isValid().
// - first: returns the first error message or undefined, which is toErrors(type.errors(value))[0].
// - all: returns every error message, which is toErrors(type.errors(value)).
// Messages are built from the same text, in the same order, as the interpreted validate() of each type.
//
// The generated code snapshots the tree: changes made to the types after compiling are not seen.
// Schema keys and message texts are embedded with JSON.stringify, finite numbers as literals; any other value is
// passed in through the `c` array. Types that are not built-in (custom classes and subclasses) run their own
// isValid()/errors().

const MAX_INLINE_KEYS = 8;

// A check this long (in characters of generated code) goes into its own function instead of being inlined.
const MAX_INLINE_CODE = 4000;

// Checks for a value that is neither undefined nor null, like isJsonType().
const JSON_TYPE_CHECKS = {
  object: (v) => `typeof ${v} === 'object' && !Array.isArray(${v})`,
  array: (v) => `Array.isArray(${v})`,
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
};

// Code testing the JSON types a keyword of your own can be limited to, for a value neither undefined nor null.
const KEYWORD_TYPE_CHECKS = {
  string: (v) => `typeof ${v} === 'string'`,
  number: (v) => `typeof ${v} === 'number'`,
  integer: (v) => `Number.isInteger(${v})`,
  boolean: (v) => `typeof ${v} === 'boolean'`,
  object: (v) => `(typeof ${v} === 'object' && !Array.isArray(${v}))`,
  array: (v) => `Array.isArray(${v})`,
  null: () => 'false',
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

// Code of the tests of coerce.js TYPE_TESTS, for the value in `x`.
const COERCE_TYPE_TESTS = {
  string: (x) => `typeof ${x} === 'string'`,
  number: (x) => `(typeof ${x} === 'number' && Number.isFinite(${x}))`,
  integer: (x) => `Number.isInteger(${x})`,
  boolean: (x) => `typeof ${x} === 'boolean'`,
  null: (x) => `${x} === null`,
  object: (x) => `(${x} !== null && typeof ${x} === 'object' && !Array.isArray(${x}))`,
  array: (x) => `Array.isArray(${x})`,
};

// Code of the conversions of coerce.js COERCIONS: [condition, value] pairs, for the value in `x` whose typeof is in `t`.
const COERCE_CODE = {
  string: (x, t) => [
    [`${t} === 'number' || ${t} === 'boolean'`, `"" + ${x}`],
    [`${x} === null`, '""'],
  ],
  number: (x, t) => [
    [`${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}))`, `+${x}`],
  ],
  integer: (x, t) => [
    [
      `${t} === 'boolean' || ${x} === null || (${t} === 'string' && ${x} !== "" && !Number.isNaN(+${x}) && +${x} % 1 === 0)`,
      `+${x}`,
    ],
  ],
  boolean: (x) => [
    [`${x} === "false" || ${x} === 0 || ${x} === null`, 'false'],
    [`${x} === "true" || ${x} === 1`, 'true'],
  ],
  null: (x) => [[`${x} === "" || ${x} === 0 || ${x} === false`, 'null']],
  array: (x, t) => [[`${t} === 'string' || ${t} === 'number' || ${t} === 'boolean' || ${x} === null`, `[${x}]`]],
};

// Condition on the value in `x` (code) that its default ({ empty }, see assignDefaults()) replaces.
const missingCode = (x, { empty }) =>
  empty ? `${x} === undefined || ${x} === null || ${x} === ""` : `${x} === undefined`;

// Code creating a new copy of a JSON value (arrays, plain objects and primitives), as a default is assigned; undefined
// for other values. Keys are computed, so a "__proto__" key is a plain entry.
function literalCode(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `(${JSON.stringify(value)})` : undefined;
  }
  if (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype) {
    const items = value.map(literalCode);
    return items.every((item) => item !== undefined) ? `[${items.join(', ')}]` : undefined;
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.keys(value).map((key) => [key, literalCode(value[key])]);
    return entries.every(([, item]) => item !== undefined)
      ? `{ ${entries.map(([key, item]) => `[${JSON.stringify(key)}]: ${item}`).join(', ')} }`
      : undefined;
  }
  return undefined;
}

function ownerOf(obj, name) {
  let proto = obj;
  while (proto && !hasOwn(proto, name)) {
    proto = Object.getPrototypeOf(proto);
  }
  return proto;
}

// A subclass that overrides validate() but inherits isValid() must be checked through validate().
function checksThroughValidate(type) {
  const validateOwner = ownerOf(type, 'validate');
  const isValidOwner = ownerOf(type, 'isValid');
  return validateOwner !== isValidOwner && Object.prototype.isPrototypeOf.call(isValidOwner, validateOwner);
}

// A `path` is a JS expression giving the fieldName passed to validate(): 'undefined' at the root, 'p' in the function
// of a reference target (where it can be undefined), and otherwise an expression that gives a string. Paths are only
// evaluated to build messages.

// Name of a node in its messages, as validate() defaults fieldName to 'Value'.
function valuePath(path) {
  if (path === 'undefined') {
    return '"Value"';
  }
  return path === 'p' ? '(p === undefined ? "Value" : p)' : path;
}

// The option foldMessages: the parts of messages known when compiling written as one literal ("lines[0].sku must be
// a string"), instead of joined when the message is made (J("lines[0]", "sku") + " must be a string"). Faster to
// build errors, a little slower to compile: off by default.
//
// A simple string literal of code (no escapes, no quotes inside): its text; undefined for any other code. It reads
// characters (this runs for every key and message when folding).
function literalValue(code) {
  const last = code.length - 1;
  if (last < 1 || code.charCodeAt(0) !== 34 || code.charCodeAt(last) !== 34) {
    return undefined;
  }
  const inner = code.slice(1, last);
  return inner.indexOf('"') === -1 && inner.indexOf('\\') === -1 ? inner : undefined;
}

// Code of a message: the name (code) followed by a text; with `fold`, one literal when the name is known. The code of
// each text is kept (the same few texts end most messages).
const TEXT_CODES = new Map();
function messageCode(name, suffix, fold) {
  let text = TEXT_CODES.get(suffix);
  if (text === undefined) {
    text = JSON.stringify(suffix);
    if (TEXT_CODES.size < 10000) TEXT_CODES.set(suffix, text);
  }
  if (fold) {
    const known = literalValue(name);
    if (known !== undefined) {
      return `"${known}${text.slice(1)}`;
    }
  }
  return `${name} + ${text}`;
}

// Name of a Schema in its messages, as Schema uses fieldName || 'Value'.
function schemaName(path, fold) {
  if (fold) {
    const known = literalValue(path);
    if (known !== undefined) {
      return known ? path : '"Value"';
    }
  }
  return path === 'undefined' ? '"Value"' : `(${path} || "Value")`;
}

// Name of a Schema key, as Schema uses fieldName ? `${fieldName}.${key}` : key. `key` is a JS expression.
function keyPath(path, key, fold) {
  if (path === 'undefined') {
    return key;
  }
  if (fold) {
    const field = literalValue(path);
    const name = literalValue(key);
    if (field !== undefined && name !== undefined) {
      return field ? `"${field}.${name}"` : key;
    }
  }
  return `J(${path}, ${key})`;
}

// Same text as ValuesType.validate().
function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function valuesMessage(values) {
  if (values.length === 1) {
    return ` must be equal to ${formatValue(values[0])}`;
  }
  return ` must be one of: ${values.map(formatValue).join(', ')}`;
}

const OBJECT_METHODS = ['constructor', 'valueOf', 'toString'];

// Values made of plain objects, arrays and primitives, for which deepEqual() can be written out as code.
function isPlainValue(value) {
  if (value === null || typeof value !== 'object') {
    return typeof value !== 'bigint' && typeof value !== 'symbol' && typeof value !== 'function';
  }
  if (Array.isArray(value)) {
    return (
      Object.getPrototypeOf(value) === Array.prototype &&
      Object.keys(value).length === value.length &&
      value.every(isPlainValue)
    );
  }
  return (
    Object.getPrototypeOf(value) === Object.prototype &&
    !OBJECT_METHODS.some((key) => hasOwn(value, key)) &&
    Object.values(value).every(isPlainValue)
  );
}

// Expression for deepEqual(value, x), where `value` is a plain value, following the same steps: identity or NaN for
// primitives; for objects the same constructor, then the same length and elements (arrays) or the same key count
// and own keys (objects).
function equalsCode(value, x) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && Number.isNaN(value)) {
      return `(typeof ${x} === 'number' && ${x} !== ${x})`;
    }
    if (typeof value === 'number') {
      return `${x} === ${Number.isFinite(value) ? `(${value})` : `${value > 0 ? '' : '-'}Infinity`}`;
    }
    return `${x} === ${value === undefined ? 'undefined' : JSON.stringify(value)}`;
  }
  const isObject = `typeof ${x} === 'object' && ${x} !== null`;
  if (Array.isArray(value)) {
    const items = value.map((item, i) => equalsCode(item, `${x}[${i}]`));
    return `(${[isObject, `${x}.constructor === Array`, `${x}.length === ${value.length}`, ...items].join(' && ')})`;
  }
  const keys = Object.keys(value);
  const entries = keys.map((key) => {
    const literal = JSON.stringify(key);
    return `H.call(${x}, ${literal}) && ${equalsCode(value[key], `${x}[${literal}]`)}`;
  });
  return `(${[isObject, `${x}.constructor === Object`, `Object.keys(${x}).length === ${keys.length}`, ...entries].join(
    ' && '
  )})`;
}

// Helpers for types that are not built-in, which run their own errors().
function firstError(type, value, fieldName) {
  return toErrors(type.errors(value, fieldName))[0];
}

// The list of errors of generated code, undefined until the first error, with the errors of a type added.
function pushErrors(out, type, value, fieldName) {
  const errors = toErrors(type.errors(value, fieldName));
  if (errors.length === 0) {
    return out;
  }
  return out === undefined ? errors : out.concat(errors);
}

// The same for errors as objects: a type of your own gives messages, which become errors with the keyword "custom"
// at the path of its value (named as fieldName, undefined for the value itself).
function customErrors(type, value, path) {
  const params = { type: type.constructor.name };
  return toErrors(type.errors(value, path.length > 0 ? pathName(path) : undefined)).map((message) =>
    errorObject(path, 'custom', params, message)
  );
}

function firstErrorObject(type, value, path) {
  return customErrors(type, value, path)[0];
}

function pushErrorObjects(out, type, value, path) {
  const errors = customErrors(type, value, path);
  if (errors.length === 0) {
    return out;
  }
  return out === undefined ? errors : out.concat(errors);
}

// A message for Generator.emit(): `text` gives the code of its text; `path` is the code of the path of the value it is
// about, `keyword` the name of the check and `params` the code of an object with its details.
// The message of every check when only checking: emit() gives the failure without reading it.
const NO_MESSAGE = Object.freeze({ text: () => '', path: 'undefined', keyword: '', params: '{}' });

function messageAt(path, text, keyword, params = '{}') {
  // A plain object of one shape (a function given properties would be slow to make and to read).
  return { text, path, keyword, params };
}

// The helpers of the generated code (see Generator.source()), made once for the functions compiled in this process:
// H and OP read own properties, J joins a field name and a key, P adds an error to the list (made with the first one),
// and U gives the list without repeated errors (the list itself when none repeats, the usual case).
/* eslint-disable no-new-func -- the same code as the prologue of standalone code, so both behave alike */
const HELPER_SOURCE = (structured) => `"use strict";
return [
  Object.prototype.hasOwnProperty,
  Object.prototype,
  function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; },
  function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; },
  ${
    structured
      ? 'function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }'
      : 'function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }'
  },
];`;
const HELPERS = new Function(HELPER_SOURCE(false))();
const STRUCTURED_HELPERS = new Function(HELPER_SOURCE(true))();
/* eslint-enable no-new-func */

class Generator {
  // `structured`: errors as objects (see error-objects.js), with the paths of the values as arrays of keys and
  // indexes instead of their names.
  // `fold`: the option foldMessages (see messageCode()).
  constructor(mode, structured = false, fold = false) {
    this.mode = mode;
    this.structured = structured;
    this.fold = fold;
    this.constants = [];
    this.nodes = [];
    this.functions = [];
    this.checkFunctions = new Map();
    // Functions adding what a type evaluates to a Set, by kind ('properties' or 'items'): see evaluatedFunction().
    this.evaluatedFunctions = { properties: new Map(), items: new Map() };
    // Per mode, the function validating each reference target.
    this.refFunctions = { check: new Map(), first: new Map(), all: new Map() };
    this.count = 0;
    // Nodes being generated, to fall back to their own isValid()/errors() if a tree refers to itself.
    this.visiting = new Set();
    // Statement for a failed check in 'check' mode: a return, or a break out of an inlined check.
    this.fail = 'return false;';
    // Generated function being written: code shares variables only within one (see sharedMatches).
    this.scope = 0;
    this.scopes = 0;
    // OneOf nodes of an allOf whose matching alternatives a later "unevaluated*" of the same allOf reuses: the
    // variables they are recorded in, the value and function they belong to, and whether the oneOf wrote them.
    this.sharedMatches = new Map();
    // Each oneOf with a discriminator to the same alternatives without it, which other values are checked against.
    this.plainOneOfs = new Map();
    // Values ("scope:variable") whose `plain` flag an enclosing allOf declares (see allOf()).
    this.plainDeclared = new Set();
    // Those of them read by the code written (an allOf declares the flag only then).
    this.plainUsed = new Set();
    // In 'all' mode, whether the same error can be reported twice (several parts of an allOf, alternatives, or
    // patterns checking a key): the result then keeps each error once.
    this.mayRepeat = false;
  }

  // Runs `generate` as the body of another generated function.
  inScope(generate) {
    const { scope } = this;
    this.scopes += 1;
    this.scope = this.scopes;
    const result = generate();
    this.scope = scope;
    return result;
  }

  name(prefix) {
    this.count += 1;
    return `${prefix}${this.count}`;
  }

  constant(value) {
    this.constants.push(value);
    return `c[${this.constants.length - 1}]`;
  }

  number(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `(${value})` : this.constant(value);
  }

  node(type) {
    let index = this.nodes.indexOf(type);
    if (index === -1) {
      this.nodes.push(type);
      index = this.nodes.length - 1;
    }
    return `n[${index}]`;
  }

  // Statement for a failed check; `message` gives the message expression and is only called when needed.
  // The error of a failed check: `message` gives the code of its text, and says the path of the value, the keyword
  // and the code of its params (see messageAt()). Errors are texts, or objects when structured.
  emit(message) {
    if (this.mode === 'check') {
      return this.fail;
    }
    let text = message.text();
    let { path } = message;
    // A path known when compiling: the error object is written out, pointer included, like errorObject() builds it.
    const known = this.structured ? staticPath(path) : undefined;
    if (known) {
      const pointer = known.map((key) => `/${`${key}`.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
      const object = `{ path: ${path}, pointer: ${JSON.stringify(pointer)}, keyword: ${JSON.stringify(message.keyword)}, params: ${message.params}, message: ${text} }`;
      return this.mode === 'first' ? `return ${object};` : `out = P(out, ${object});`;
    }
    let assign = '';
    // A path that is built (not the variable of a function, or []) is built once, in variable q, for the object and
    // its message.
    if (this.structured && path.length > 3) {
      text = text.split(path).join('q');
      assign = `q = ${path}, `;
      path = 'q';
    }
    const error = this.structured
      ? `(${assign}${this.constant(errorObject)}(${path}, ${JSON.stringify(message.keyword)}, ${message.params}, ${text}))`
      : text;
    // The list of errors is only made with the first one: valid values build none.
    return this.mode === 'first' ? `return ${error};` : `out = P(out, ${error});`;
  }

  // Code of the path of the value itself: undefined (no name), or an empty array when structured.
  rootPath() {
    return this.structured ? '[]' : 'undefined';
  }

  // Code of the name of the value at `path`, as messages start with it; a Schema is "Value" at the root.
  nameOf(path, isSchema) {
    if (!this.structured) {
      return isSchema ? schemaName(path, this.fold) : valuePath(path);
    }
    // A path known when compiling has its name written out.
    const known = staticPath(path);
    if (known) {
      return JSON.stringify(pathName(known));
    }
    const name = `${this.constant(pathName)}(${path})`;
    return isSchema ? `(${name} || "Value")` : name;
  }

  // Code of the path of the key `key` (code) of the object at `path`.
  keyOf(path, key) {
    if (!this.structured) {
      return keyPath(path, key, this.fold);
    }
    const known = staticPath(path);
    if (known && literalOf(key) !== undefined) {
      return JSON.stringify([...known, literalOf(key)]);
    }
    return path === '[]' ? `[${key}]` : `${path}.concat([${key}])`;
  }

  // Code of the path of the element `index` (code) of the array at `path`, whose name is `name`.
  indexOf(path, name, index) {
    if (!this.structured) {
      return `(${name} + "[" + ${index} + "]")`;
    }
    const known = staticPath(path);
    if (known && literalOf(String(index)) !== undefined) {
      return JSON.stringify([...known, literalOf(String(index))]);
    }
    return path === '[]' ? `[${index}]` : `${path}.concat([${index}])`;
  }

  // Code of the path of a key checked by propertyNames, as a value: its name is "Key <name>".
  propertyNameOf(path, key) {
    if (!this.structured) {
      return `("Key " + ${keyPath(path, key, this.fold)})`;
    }
    return path === '[]' ? `[{ key: ${key} }]` : `${path}.concat([{ key: ${key} }])`;
  }

  // Checks [condition, message, pre] run in order until one fails; `rest` runs when none fails. The optional `pre`
  // statements run just before their condition, only when the previous checks passed.
  chain(checks, rest = '') {
    let code = '';
    for (let i = 0; i < checks.length; i += 1) {
      const [condition, message, pre] = checks[i];
      if (pre) {
        const remaining = this.chain([[condition, message], ...checks.slice(i + 1)], rest);
        return `${code}${i ? 'else ' : ''}{\n${pre}${remaining}}\n`;
      }
      code += `${i ? 'else ' : ''}if (${condition}) { ${this.emit(message)} }\n`;
    }
    if (!rest) {
      return code;
    }
    return checks.length ? `${code}else {\n${rest}}\n` : rest;
  }

  // Generates a separate function in 'check' mode, where a failure returns false.
  inFunction(generate) {
    const { mode, fail, visiting } = this;
    this.mode = 'check';
    this.fail = 'return false;';
    this.visiting = new Set();
    const body = this.inScope(generate);
    this.mode = mode;
    this.fail = fail;
    this.visiting = visiting;
    return body;
  }

  // Name of a boolean function checking `type`, shared by every use of the same node.
  checkFunction(type) {
    if (!this.checkFunctions.has(type)) {
      const name = this.name('check');
      this.checkFunctions.set(type, name);
      const body = this.inFunction(() => this.generate(type, 'x', 'undefined'));
      this.functions.push(`function ${name}(x) {\n${body}return true;\n}\n`);
    }
    return this.checkFunctions.get(type);
  }

  // Code that runs `onPass` when the value in `v` satisfies `type`. The check is inlined in a labelled block that a
  // failure breaks out of, which avoids a function call; a long one goes into a function instead.
  inlineCheck(type, v, onPass) {
    const { mode, fail } = this;
    const label = this.name('L');
    this.mode = 'check';
    this.fail = `break ${label};`;
    const written = [...this.sharedMatches.values()].map((shared) => [shared, shared.written]);
    const body = this.generate(type, v, 'undefined');
    this.mode = mode;
    this.fail = fail;
    if (body.length > MAX_INLINE_CODE) {
      // The inlined code is dropped, with the variables it would have written.
      written.forEach(([shared, wasWritten]) => {
        shared.written = wasWritten;
      });
      return `if (${this.checkFunction(type)}(${v})) { ${onPass} }\n`;
    }
    return `${label}: {\n${body}${onPass}\n}\n`;
  }

  // Name of the function validating a reference target in the current mode. It takes the value and, to build
  // messages, the field name (and the error list in 'all' mode), so recursive schemas call it again.
  refFunction(target) {
    const functions = this.refFunctions[this.mode];
    if (!functions.has(target)) {
      const name = this.name(`ref_${this.mode}`);
      functions.set(target, name);
      const params = { check: 'x', first: 'x, p', all: 'x, p, out' }[this.mode];
      const end = {
        check: 'return true;',
        first: 'return undefined;',
        all: 'return out;',
      }[this.mode];
      // The target may be an outer node being generated: its function is generated on its own.
      const { visiting, fail } = this;
      this.visiting = new Set();
      this.fail = 'return false;';
      let body = this.inScope(() => this.generate(target, 'x', this.mode === 'check' ? 'undefined' : 'p'));
      // The variable of the paths of error objects (see emit()).
      if (this.structured && this.mode !== 'check') {
        body = `let q;\n${body}`;
      }
      this.visiting = visiting;
      this.fail = fail;
      this.functions.push(`function ${name}(${params}) {\n${body}${end}\n}\n`);
    }
    return functions.get(target);
  }

  // Like RefType: undefined is checked here, any other value by the target.
  ref(type, v, path) {
    const onUndefined = type.isMandatory
      ? this.emit(messageAt(path, () => messageCode(this.nameOf(path, false), ' is mandatory', this.fold), 'required'))
      : '';
    const target = type.getTarget();
    const fn = this.refFunction(target);
    let call = `if (!${fn}(${v})) { ${this.fail} }\n`;
    if (this.mode === 'first') {
      const e = this.name('e');
      call = `const ${e} = ${fn}(${v}, ${path});\nif (${e} !== undefined) { return ${e}; }\n`;
    } else if (this.mode === 'all') {
      call = `out = ${fn}(${v}, ${path}, out);\n`;
    }
    // Building messages, a field name that has to be built (a key or an index) is built only for an invalid value,
    // which the boolean function of the target finds first. Valid elements of an array then build no strings.
    if (this.mode !== 'check' && !/^(undefined|p|\[\]|"[^"\\]*")$/.test(path)) {
      const { mode } = this;
      this.mode = 'check';
      const check = this.refFunction(target);
      this.mode = mode;
      call = `if (!${check}(${v})) {\n${call}}\n`;
    }
    return `if (${v} === undefined) { ${onUndefined} } else {\n${call}}\n`;
  }

  // Code validating the value held in variable `v` against `type`, with `path` giving its field name. When `known`
  // names a JSON type, the value is known to be of that type (so neither undefined nor null): presence and that type
  // are not checked again. Types that accept every value give no code.
  generate(type, v, path, known = undefined) {
    if (type.constructor === RefType) {
      return this.ref(type, v, path);
    }
    if (type.constructor === CoerceType) {
      // The value validated, converted for the validation only (it is in no object or array).
      return this.coerceCode(type.spec, v) + this.generate(type.type, v, path, known);
    }
    if (this.visiting.has(type)) {
      return this.custom(type, v, path);
    }
    this.visiting.add(type);
    const isSchema = type.constructor === Schema || type.constructor === ClosedSchema;
    const name = this.nameOf(path, isSchema);
    const body = this.body(type, v, path, name, known);
    this.visiting.delete(type);
    if (body === undefined) {
      return this.custom(type, v, path);
    }
    const checks = this.chain(body.checks, body.rest);
    if (known) {
      return checks;
    }
    // Only checking (true or false), no message is made.
    const text = (suffix, keyword) =>
      this.mode === 'check' ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword);
    const onUndefined = type.isMandatory ? this.emit(text(' is mandatory', 'required')) : '';
    const onNull = type.isNullable ? '' : this.emit(text(' cannot be null', 'nullable'));
    if (!onUndefined && !onNull) {
      return checks ? `if (${v} !== undefined && ${v} !== null) {\n${checks}}\n` : '';
    }
    return `if (${v} === undefined) { ${onUndefined} } else if (${v} === null) { ${onNull} } else {\n${checks}}\n`;
  }

  custom(type, v, path) {
    const node = this.node(type);
    const invalid = checksThroughValidate(type)
      ? `${this.constant(hasErrors)}(${node}.validate(${v}))`
      : `!${node}.isValid(${v})`;
    let onInvalid = this.fail;
    if (this.mode === 'first') {
      onInvalid = `return r(${node}, ${v}, ${path});`;
    } else if (this.mode === 'all') {
      onInvalid = `out = a(out, ${node}, ${v}, ${path});`;
    }
    return `if (${invalid}) { ${onInvalid} }\n`;
  }

  // Checks for a value that is neither undefined nor null, as { checks, rest }; undefined when the type is not a
  // built-in one.
  body(type, v, path, name, known) {
    // A message about this value: its text is its name and `suffix`; `keyword` names the check and `params` is the code
    // of an object with its details (see messageAt()).
    const text = (suffix, keyword, params) =>
      this.mode === 'check' ? NO_MESSAGE : messageAt(path, () => messageCode(name, suffix, this.fold), keyword, params);
    switch (type.constructor) {
      case Schema:
      case ClosedSchema:
        return this.schema(type, v, path, name, text, known);
      case ObjType:
        return {
          checks: [
            [
              `typeof ${v} !== 'object' || Array.isArray(${v})`,
              text(' must be an object', 'type', "{ type: 'object' }"),
            ],
          ],
          rest: type.schema ? this.generate(type.schema, v, path) : '',
        };
      case ArrayOfType:
        return this.arrayOf(type, v, path, name, text, known);
      case UnevaluatedType:
        return this.unevaluated(type, v, path, name);
      case AllOfType:
        return { checks: [], rest: this.allOf(type, v, path, known) };
      case ConditionalType: {
        // Without branches it accepts every value (it is kept for what "if" evaluates, see unevaluated.js).
        if (!type.thenType && !type.elseType) {
          return { checks: [], rest: '' };
        }
        // Only the chosen branch is checked and reported, like ConditionalType.validate().
        const branch = (branchType) => (branchType ? this.generate(branchType, v, path) : '');
        const ok = this.name('ok');
        const rest = `let ${ok} = false;\n${this.inlineCheck(type.ifType, v, `${ok} = true;`)}if (${ok}) {\n${branch(
          type.thenType
        )}} else {\n${branch(type.elseType)}}\n`;
        return { checks: [], rest };
      }
      case AnyOfType:
        return { checks: [], rest: this.anyOf(type, v, path) };
      case OneOfType:
        return this.oneOf(type, v, path, text);
      case KeywordType:
        return { checks: [this.keyword(type, v, path, name)] };
      case NotType: {
        const ok = this.name('ok');
        const pre = `let ${ok} = false;\n${this.inlineCheck(type.type, v, `${ok} = true;`)}`;
        return {
          checks: [[ok, text(' must not match the excluded schema', 'not'), pre]],
        };
      }
      case StringType:
        return { checks: this.string(type, v, text, known) };
      case EnumType:
        return {
          checks: [
            ...this.string(type, v, text, known),
            [
              `!${this.constant(new Set(type.options))}.has(${v})`,
              text(
                ` must be one of: ${type.options.join(', ')}`,
                'enum',
                `{ allowedValues: ${JSON.stringify(type.options)} }`
              ),
            ],
          ],
        };
      case FloatType:
        return { checks: this.float(type, v, text) };
      case IntegerType:
        return {
          checks: [
            ...this.float(type, v, text),
            [`!Number.isInteger(${v})`, text(' must be an integer', 'type', "{ type: 'integer' }")],
          ],
        };
      case BooleanType:
        return {
          checks: [[`typeof ${v} !== 'boolean'`, text(' must be a boolean', 'type', "{ type: 'boolean' }")]],
        };
      case AnyType:
        return { checks: [] };
      case NeverType:
        return { checks: [['true', text(' is not allowed', 'false')]] };
      case ValuesType:
        return {
          checks: [
            [this.notOneOf(type.values, v), text(valuesMessage(type.values), ...this.valuesKeyword(type.values))],
          ],
        };
      case WhenType:
        // The field name goes through unchanged, like WhenType.validate(). A value known to be of its JSON type
        // needs no check.
        if (known === type.jsonType) {
          return { checks: [], rest: this.generate(type.type, v, path, known) };
        }
        return {
          checks: [],
          rest: `if (${JSON_TYPE_CHECKS[type.jsonType](v)}) {\n${this.generate(type.type, v, path, type.jsonType)}}\n`,
        };
      default:
        return undefined;
    }
  }

  string(type, v, text, known) {
    const checks =
      known === 'string' ? [] : [[`typeof ${v} !== 'string'`, text(' must be a string', 'type', "{ type: 'string' }")]];
    // Code points are only counted near the limit, like hasFewerCodePoints() and hasMoreCodePoints().
    const count = () => `${this.constant(codePointLength)}(${v})`;
    if (type.min !== undefined) {
      const allowEmpty = type.allowEmpty ?? !type.isMandatory;
      const min = this.number(type.min);
      const tooShort = type.countCodePoints
        ? `(${v}.length < ${min} || (${v}.length < 2 * ${min} && ${count()} < ${min}))`
        : `${v}.length < ${min}`;
      checks.push([
        allowEmpty ? `${tooShort} && ${v}.length !== 0` : tooShort,
        text(` must be at least ${type.min} characters long`, 'minLength', `{ limit: ${this.number(type.min)} }`),
      ]);
    }
    if (type.max !== undefined) {
      const max = this.number(type.max);
      const tooLong = type.countCodePoints
        ? `(${v}.length > 2 * ${max} || (${v}.length > ${max} && ${count()} > ${max}))`
        : `${v}.length > ${max}`;
      checks.push([
        tooLong,
        text(` must be at most ${type.max} characters long`, 'maxLength', `{ limit: ${this.number(type.max)} }`),
      ]);
    }
    if (type.pattern) {
      checks.push([
        `!${this.constant(type.pattern)}.test(${v})`,
        text(' does not match the required pattern', 'pattern', `{ pattern: ${JSON.stringify(type.pattern.source)} }`),
      ]);
    }
    if (type.formatCheck !== undefined) {
      const check = this.constant(type.formatCheck);
      const matches = type.formatCheck instanceof RegExp ? `${check}.test(${v})` : `${check}(${v})`;
      checks.push([
        `!${matches}`,
        text(` must be a valid ${type.format}`, 'format', `{ format: ${JSON.stringify(type.format)} }`),
      ]);
    }
    // Limits of the format, like StringType.failedLimit(): compare() gives a number, or undefined, which passes. The
    // built-in comparisons are written out, with the limit worked out once (see compareDate() and the others in
    // formats.js): dates compare as strings (the value has the format, so it is not empty), times and date-times by
    // their time in ms, read once for every limit; a time of 0 or NaN compares as undefined.
    let ms;
    type.formatLimits.forEach(({ keyword, limit, compare }) => {
      const { text: words, comparison } = FORMAT_LIMITS[keyword];
      const literal = JSON.stringify(limit);
      const message = text(` must be ${words} ${limit}`, keyword, `{ comparison: "${comparison}", limit: ${literal} }`);
      const operator = FORMAT_LIMIT_FAILS[keyword].slice(0, -2);
      if (compare === FORMAT_COMPARES.date) {
        checks.push([`${v} ${operator} ${literal}`, message]);
      } else if (TIME_PREFIXES.has(compare)) {
        const prefix = TIME_PREFIXES.get(compare);
        const limitMs = new Date(`${prefix}${limit}`).valueOf();
        // A limit whose time is 0 compares as undefined: it never fails.
        if (limitMs) {
          let pre;
          if (!ms) {
            ms = this.name('ms');
            pre = `const ${ms} = new Date(${prefix ? `"${prefix}" + ` : ''}${v}).valueOf();\n`;
          }
          checks.push([`${ms} && ${ms} ${operator} ${limitMs}`, message, pre]);
        }
      } else {
        checks.push([`${this.constant(compare)}(${v}, ${literal}) ${FORMAT_LIMIT_FAILS[keyword]}`, message]);
      }
    });
    return checks;
  }

  float(type, v, text) {
    const limits = [
      [type.min, '<', 'must be at least', 'minimum'],
      [type.max, '>', 'must be at most', 'maximum'],
      [type.exclusiveMin, '<=', 'must be greater than', 'exclusiveMinimum'],
      [type.exclusiveMax, '>=', 'must be less than', 'exclusiveMaximum'],
    ];
    const checks = [
      [`!Number.isFinite(${v})`, text(' must be a number', 'type', "{ type: 'number' }")],
      ...limits
        .filter(([limit]) => limit !== undefined)
        .map(([limit, operator, message, keyword]) => [
          `${v} ${operator} ${this.number(limit)}`,
          text(` ${message} ${limit}`, keyword, `{ limit: ${this.number(limit)} }`),
        ]),
    ];
    if (type.multipleOf !== undefined) {
      const division = `${v} / ${this.number(type.multipleOf)}`;
      // Like FloatType.isMultiple().
      const notMultiple =
        type.multipleOfPrecision === undefined
          ? `!Number.isInteger(${division})`
          : `Math.abs(Math.round(${division}) - ${division}) > 1e-${type.multipleOfPrecision}`;
      checks.push([
        notMultiple,
        text(
          ` must be a multiple of ${type.multipleOf}`,
          'multipleOf',
          `{ multipleOf: ${this.number(type.multipleOf)} }`
        ),
      ]);
    }
    return checks;
  }

  // Like ValuesType: `v` (neither undefined nor null) is deep-equal to none of the values. Plain values are compared
  // with code written for them; others with deepEqual(), only for objects as it is false for anything else.
  // Keyword and params of the message of a ValuesType: const for one value, enum for several.
  valuesKeyword(values) {
    if (values.length === 1) {
      return ['const', this.structured ? `{ allowedValue: ${this.constant(values[0])} }` : '{}'];
    }
    return ['enum', this.structured ? `{ allowedValues: ${this.constant(values)} }` : '{}'];
  }

  notOneOf(values, v) {
    const matches = [];
    values.forEach((value) => {
      if (value === undefined || value === null) {
        // Never equal to a value that is neither undefined nor null.
      } else if (isPlainValue(value)) {
        matches.push(equalsCode(value, v));
      } else if (typeof value === 'object') {
        matches.push(`(typeof ${v} === 'object' && ${this.constant(deepEqual)}(${this.constant(value)}, ${v}))`);
      } else {
        matches.push(`${v} === ${this.constant(value)}`);
      }
    });
    return matches.length ? `!(${matches.join(' || ')})` : 'true';
  }

  // The parts run in order; in 'all' mode each one adds its errors, like AllOfType.validate(). They get the field
  // name of the allOf as it is (`path`), so a Schema part names its keys as it does on its own.
  allOf(type, v, path, known = undefined) {
    this.mayRepeat = this.mayRepeat || type.types.length > 1;
    const shared = this.shareMatches(type, v);
    let code = shared.map(({ vars }) => `let ${vars.join(' = false, ')} = false;\n`).join('');
    // Whether the value is a plain object is worked out once for all the parts (see schema()): reading __proto__ is
    // slow on objects of many shapes. The value is neither undefined nor null here.
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    if (declares) this.plainUsed.delete(plain);
    const parts = type.types.map((item) => this.generate(item, v, path, known)).join('');
    if (declares) {
      this.plainDeclared.delete(plain);
      // Declared when a part reads it (recorded where it is written: see schema() and discriminated()).
      if (this.plainUsed.has(plain)) {
        this.plainUsed.delete(plain);
        code += `const ${v}plain = ${v}.__proto__ === OP;\n`;
      }
    }
    code += parts;
    shared.forEach(({ oneOf, previous }) => {
      if (previous === undefined) {
        this.sharedMatches.delete(oneOf);
      } else {
        this.sharedMatches.set(oneOf, previous);
      }
    });
    return code;
  }

  // The oneOf parts of an allOf whose matching alternatives an "unevaluated*" part of the same allOf needs: oneOf()
  // records them in variables that the allOf declares, and evaluatedCondition() reads them instead of checking the
  // alternatives again. They belong to the value in `v` and to the function being written.
  shareMatches(type, v) {
    const oneOfs = new Set();
    type.types
      .filter((item) => item.constructor === UnevaluatedType)
      .forEach((unevaluated) =>
        unevaluated.siblings
          .filter((sibling) => sibling.constructor === OneOfType && type.types.includes(sibling))
          .filter((sibling) => staticEvaluatedBy(unevaluated.kind, sibling) === undefined)
          .forEach((sibling) => oneOfs.add(sibling))
      );
    return [...oneOfs].map((oneOf) => {
      const previous = this.sharedMatches.get(oneOf);
      const vars = oneOf.types.map(() => this.name('matched'));
      this.sharedMatches.set(oneOf, {
        vars,
        v,
        scope: this.scope,
        written: false,
      });
      return { oneOf, previous, vars };
    });
  }

  // The variables holding which alternatives of `oneOf` match the value in `v`, when oneOf() wrote them in the
  // function being written; undefined otherwise.
  matchesOf(oneOf, v) {
    const shared = this.sharedMatches.get(oneOf);
    return shared && shared.written && shared.v === v && shared.scope === this.scope ? shared.vars : undefined;
  }

  // Code for a value that no alternative accepts: the errors of every alternative, like AnyOfType.validate().
  noneMatches(types, v, path) {
    if (this.mode === 'check') {
      return this.fail;
    }
    if (this.mode === 'first') {
      return this.generate(types[0], v, path);
    }
    this.mayRepeat = this.mayRepeat || types.length > 1;
    return types.map((item) => this.generate(item, v, path)).join('');
  }

  // The alternatives get the field name as it is, like the parts of an allOf.
  anyOf(type, v, path) {
    if (!type.types || type.types.length === 0) {
      return '';
    }
    const ok = this.name('ok');
    let code = `let ${ok} = false;\n`;
    type.types.forEach((item, i) => {
      const check = this.inlineCheck(item, v, `${ok} = true;`);
      code += i ? `if (!${ok}) {\n${check}}\n` : check;
    });
    return `${code}if (!${ok}) {\n${this.noneMatches(type.types, v, path)}}\n`;
  }

  // Counts up to two matching alternatives, like OneOfType.countMatches().
  oneOf(type, v, path, text) {
    if (type.types.length === 0) {
      return {
        checks: [['true', text(' must match exactly one schema, but matches none', 'oneOf', '{ passing: 0 }')]],
      };
    }
    // An "unevaluated*" of the same allOf may reuse which alternatives match (see shareMatches()). When the oneOf
    // passes, every alternative has been checked.
    const shared = this.sharedMatches.get(type);
    const record = shared && shared.v === v && shared.scope === this.scope ? shared : undefined;
    // With a discriminator, objects are only checked against the alternative their tag picks. Other values are
    // checked here when the matches are recorded, else in a function of their own.
    if (type.discriminator) {
      const others = record ? this.countedOneOf(type, v, path, text, record) : undefined;
      return { checks: [], rest: this.discriminated(type, v, path, record, others) };
    }
    return { checks: [], rest: this.countedOneOf(type, v, path, text, record) };
  }

  // Code counting the alternatives the value matches, up to two, recording them in `record` when given.
  countedOneOf(type, v, path, text, record) {
    const m = this.name('m');
    let rest = `let ${m} = 0;\n`;
    type.types.forEach((item, i) => {
      const onPass = record ? `${m} += 1; ${record.vars[i]} = true;` : `${m} += 1;`;
      const check = this.inlineCheck(item, v, onPass);
      rest += i > 1 ? `if (${m} < 2) {\n${check}}\n` : check;
    });
    if (record) {
      record.written = true;
    }
    const more = this.emit(
      text(' must match exactly one schema, but matches more than one', 'oneOf', '{ passing: 2 }')
    );
    if (this.mode === 'check') {
      rest += `if (${m} !== 1) { ${this.fail} }\n`;
    } else {
      rest += `if (${m} === 0) {\n${this.noneMatches(type.types, v, path)}} else if (${m} > 1) { ${more} }\n`;
    }
    return rest;
  }

  // Code calling the function that validates `type` in the current mode (see refFunction()), for the value in `v`.
  callFunction(type, v, path) {
    const fn = this.refFunction(type);
    if (this.mode === 'first') {
      const e = this.name('e');
      return `const ${e} = ${fn}(${v}, ${path});\nif (${e} !== undefined) { return ${e}; }\n`;
    }
    return this.mode === 'all' ? `out = ${fn}(${v}, ${path}, out);\n` : `if (!${fn}(${v})) { ${this.fail} }\n`;
  }

  // Code setting variable `d` to what the discriminator of `type` picks for the value in `x`, like OneOfType.pick().
  pickCode(type, x, d) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name('t');
    const literal = JSON.stringify(tag);
    const values = [...mapping.keys()];
    const chain = values.map((value) => `${t} === ${JSON.stringify(value)} ? ${mapping.get(value)} : `).join('');
    return (
      `let ${d} = ${EVERY_TYPE};\n` +
      `if (typeof ${x} === 'object' && ${x} !== null && !Array.isArray(${x})) {\n` +
      `const ${t} = H.call(${x}, ${literal}) ? ${x}[${literal}] : undefined;\n` +
      `${d} = ${chain}${auto ? EVERY_TYPE : NO_TYPE};\n}\n`
    );
  }

  // Like OneOfType.validate() with a discriminator: an object is checked against the alternative the value of its tag
  // (an own property) picks. An object whose tag picks none gets an error about the tag at its path, or with a
  // discriminator found in a plain oneOf (`auto`) is checked as by oneOf, like other values. Those go to a function
  // of their own (they are rare, and the validator stays small).
  // With `record`, the alternative that matches is recorded there, and `others` checks the other values.
  discriminated(type, v, path, record = undefined, others = undefined) {
    const { tag, mapping, auto } = type.discriminator;
    const t = this.name('t');
    const tagPath = this.keyOf(path, JSON.stringify(tag));
    const error = (suffix, kind) =>
      this.emit(
        messageAt(
          tagPath,
          () => messageCode(this.nameOf(tagPath, false), suffix, this.fold),
          'discriminator',
          `{ error: "${kind}", tag: ${JSON.stringify(tag)}, tagValue: ${t} }`
        )
      );
    const values = [...mapping.keys()];
    const literal = JSON.stringify(tag);
    // The tag is an own property, read like the keys of a Schema (see schema()): a value read from a plain object is
    // its own unless Object.prototype has the key. Whether the object is plain is worked out here, once for the
    // alternatives too, unless an enclosing allOf did.
    const plain = `${this.scope}:${v}`;
    const declares = !this.plainDeclared.has(plain);
    this.plainDeclared.add(plain);
    const isPlainOwn = tag in Object.prototype ? '' : `${v}plain || `;
    if (isPlainOwn) this.plainUsed.add(plain);
    let code = declares ? `const ${v}plain = ${v}.__proto__ === OP;\n` : '';
    code += `let ${t} = ${v}[${literal}];\n`;
    code += `if (${t} !== undefined && !(${isPlainOwn}H.call(${v}, ${literal}))) { ${t} = undefined; }\n`;
    type.types.forEach((item, i) => {
      const picks = values
        .filter((value) => mapping.get(value) === i)
        .map((value) => `${t} === ${JSON.stringify(value)}`);
      // The value is known to be an object, which the alternative does not check again.
      let branch = this.generate(item, v, path, 'object');
      if (record) {
        const matched = record.vars[i];
        const onFail = this.mode === 'check' ? this.fail : this.generate(item, v, path, 'object');
        branch = `${this.inlineCheck(item, v, `${matched} = true;`)}if (!${matched}) {\n${onFail}}\n`;
      }
      code += `${i ? 'else ' : ''}if (${picks.join(' || ')}) {\n${branch}}\n`;
    });
    if (declares) {
      this.plainDeclared.delete(plain);
    }
    // The same alternatives without the discriminator, one node for each oneOf, so they share one function.
    if (!this.plainOneOfs.has(type)) {
      this.plainOneOfs.set(type, new OneOfType({ types: type.types, isMandatory: false, isNullable: true }));
    }
    const rest = others || this.callFunction(this.plainOneOfs.get(type), v, path);
    if (auto) {
      // No alternative accepts a tag that picks none (it gives each a "const" or an "enum"), unless it is missing.
      const unknown = this.mode === 'check' ? this.fail : rest;
      code += `else if (${t} === undefined) {\n${rest}} else {\n${unknown}}\n`;
    } else {
      code += `else if (${t} === undefined) { ${error(' is mandatory', 'tag')} }\n`;
      code += `else if (typeof ${t} !== 'string') { ${error(' must be a string', 'tag')} }\n`;
      code += `else { ${error(valuesMessage(values), 'mapping')} }\n`;
    }
    return `if (typeof ${v} === 'object' && !Array.isArray(${v})) {\n${code}} else {\n${rest}}\n`;
  }

  // Code assigning the defaults ([{ key, value, empty }], see assignDefaults()) missing in the object or array in `v`:
  // each validation assigns a new copy.
  defaultsCode(v, defaults = []) {
    return defaults
      .map((entry) => {
        const property = `${v}[${JSON.stringify(entry.key)}]`;
        return `if (${missingCode(property, entry)}) { ${property} = ${this.copyCode(entry.value)}; }\n`;
      })
      .join('');
  }

  // Code converting the value in variable `x` for a schema with `spec` (see coerce() in coerce.js) and, with `place`,
  // writing the converted value there (the property or element it was read from).
  coerceCode(spec, x, place = undefined) {
    if (!spec) {
      return '';
    }
    const matches = (value) => spec.types.map((type) => COERCE_TYPE_TESTS[type](value)).join(' || ');
    const c = this.name('c');
    const t = this.name('t');
    let code = `if (${x} !== undefined && !(${matches(x)})) {\nlet ${c};\n`;
    if (spec.array) {
      code += `if (Array.isArray(${x}) && ${x}.length === 1) {\n${x} = ${x}[0];\nif (${matches(x)}) { ${c} = ${x}; }\n}\n`;
    }
    const conversions = spec.to.flatMap((type) => COERCE_CODE[type](x, t));
    code += `const ${t} = typeof ${x};\nif (${c} === undefined) {\n`;
    code += conversions
      .map(([condition, value], i) => `${i ? 'else ' : ''}if (${condition}) { ${c} = ${value}; }\n`)
      .join('');
    code += `}\nif (${c} !== undefined) { ${x} = ${c};${place ? ` ${place} = ${c};` : ''} }\n}\n`;
    return code;
  }

  // Code of a new copy of a default value.
  copyCode(value) {
    const copy = literalCode(value);
    return copy === undefined ? `${this.constant(copyDefault)}(${this.constant(value)})` : copy;
  }

  // A keyword of your own, like KeywordType.validate(): its function is called with the value, when the value is of
  // one of its JSON types.
  keyword(type, v, path, name) {
    const applies = type.jsonTypes
      ? `(${type.jsonTypes.map((jsonType) => KEYWORD_TYPE_CHECKS[jsonType](v)).join(' || ')}) && `
      : '';
    const text =
      typeof type.message === 'function'
        ? () => `${name} + " " + ${this.constant(type.message)}(${v})`
        : () => `${name} + ${JSON.stringify(` ${type.message}`)}`;
    const passes =
      type.check instanceof RegExp ? `${this.constant(type.check)}.test(${v})` : `${this.constant(type.check)}(${v})`;
    return [`${applies}!${passes}`, messageAt(path, text, type.keyword)];
  }

  arrayOf(type, v, path, name, text, known) {
    const checks =
      known === 'array' ? [] : [[`!Array.isArray(${v})`, text(' must be an array', 'type', "{ type: 'array' }")]];
    if (type.min !== undefined) {
      checks.push([
        `${v}.length < ${this.number(type.min)}`,
        text(` must have at least ${type.min} elements`, 'minItems', `{ limit: ${this.number(type.min)} }`),
      ]);
    }
    if (type.max !== undefined) {
      checks.push([
        `${v}.length > ${this.number(type.max)}`,
        text(` must have at most ${type.max} elements`, 'maxItems', `{ limit: ${this.number(type.max)} }`),
      ]);
    }
    if (type.unique) {
      checks.push([`${this.constant(hasDuplicates)}(${v})`, text(' must not have duplicate elements', 'uniqueItems')]);
    }
    const min = type.minContains === undefined ? 1 : type.minContains;
    if (type.contains && (min !== 1 || type.maxContains !== undefined)) {
      // Counts only as far as the limits need, like ArrayOfType.countMatches().
      const count = this.name('count');
      const i = this.name('i');
      const x = this.name('v');
      const stop = type.maxContains === undefined ? min : type.maxContains + 1;
      const pre = `let ${count} = 0;\nfor (let ${i} = 0; ${i} < ${v}.length && ${count} < ${this.number(
        stop
      )}; ${i} += 1) {\nconst ${x} = ${v}[${i}];\n${this.inlineCheck(type.contains, x, `${count} += 1;`)}}\n`;
      const containsChecks = [];
      if (min > 0) {
        const atLeast = min === 1 ? 'one matching element' : `${min} matching elements`;
        containsChecks.push([
          `${count} < ${this.number(min)}`,
          text(` must contain at least ${atLeast}`, 'minContains', `{ limit: ${this.number(min)} }`),
        ]);
      }
      if (type.maxContains !== undefined) {
        const atMost = type.maxContains === 1 ? 'one matching element' : `${type.maxContains} matching elements`;
        containsChecks.push([
          `${count} > ${this.number(type.maxContains)}`,
          text(` must contain at most ${atMost}`, 'maxContains', `{ limit: ${this.number(type.maxContains)} }`),
        ]);
      }
      if (containsChecks.length > 0) {
        containsChecks[0].push(pre);
        checks.push(...containsChecks);
      }
    } else if (type.contains) {
      // Runs only when the checks before it pass, like ArrayOfType.countMatches().
      const found = this.name('found');
      const i = this.name('i');
      const x = this.name('v');
      const pre = `let ${found} = false;\nfor (let ${i} = 0; ${i} < ${v}.length && !${found}; ${i} += 1) {\nconst ${x} = ${v}[${i}];\n${this.inlineCheck(
        type.contains,
        x,
        `${found} = true;`
      )}}\n`;
      checks.push([`!${found}`, text(' must contain at least one matching element', 'contains'), pre]);
    }
    let rest = '';
    const defaults = this.defaultsCode(v, type.defaults);
    if (defaults) {
      const first = known === 'array' ? 0 : 1;
      if (checks.length > first) {
        const [condition, message, pre = ''] = checks[first];
        checks[first] = [condition, message, defaults + pre];
      } else {
        rest += defaults;
      }
    }
    if (Array.isArray(type.type)) {
      type.type.forEach((item, i) => {
        const x = this.name('v');
        rest += `let ${x} = ${v}[${i}];\n${this.coerceCode(coerceSpecOf(item), x, `${v}[${i}]`)}`;
        rest += this.generate(item, x, this.indexOf(path, name, i));
      });
      if (type.additionalType) {
        const i = this.name('i');
        const x = this.name('v');
        rest += `for (let ${i} = ${type.type.length}; ${i} < ${v}.length; ${i} += 1) {\nlet ${x} = ${v}[${i}];\n`;
        rest += this.coerceCode(coerceSpecOf(type.additionalType), x, `${v}[${i}]`);
        rest += `${this.generate(type.additionalType, x, this.indexOf(path, name, i))}}\n`;
      }
    } else if (type.type) {
      const i = this.name('i');
      const x = this.name('v');
      rest += `for (let ${i} = 0; ${i} < ${v}.length; ${i} += 1) {\nlet ${x} = ${v}[${i}];\n`;
      rest += this.coerceCode(coerceSpecOf(type.type), x, `${v}[${i}]`);
      rest += `${this.generate(type.type, x, this.indexOf(path, name, i))}}\n`;
    }
    return { checks, rest };
  }

  // Name of a function (x, s) that adds to the Set s the keys (kind 'properties') or the indexes ('items') of the
  // value x that `types` evaluate, and returns true when they evaluate all of them, like evaluated() in
  // unevaluated.js. `key` names the function: a type, or an UnevaluatedType for the group of its siblings.
  evaluatedFunction(kind, key, types) {
    const functions = this.evaluatedFunctions[kind];
    if (!functions.has(key)) {
      const name = this.name('evaluated');
      functions.set(key, name);
      const body = this.inScope(() => types.map((item) => this.evaluatedCode(kind, item)).join(''));
      this.functions.push(`function ${name}(x, s) {\n${body}return false;\n}\n`);
    }
    return functions.get(key);
  }

  // Condition on the key in variable `k`: one of the keys or patterns in `known`. Empty when there are none.
  acceptedKey(known, k) {
    const keys = [...known.keys];
    const declared =
      keys.length <= MAX_INLINE_KEYS
        ? keys.map((key) => `${k} === ${JSON.stringify(key)}`)
        : [`${this.constant(known.keys)}.has(${k})`];
    const terms = [...declared, ...known.patterns.map((pattern) => `${this.constant(pattern)}.test(${k})`)];
    // In parentheses, so it can be combined with && in a larger condition.
    return terms.length > 1 ? `(${terms.join(' || ')})` : terms.join('');
  }

  // Statements of an evaluated function (value in x, Set in s) for a part that evaluates the same for every value.
  staticEvaluatedCode(kind, known) {
    if (known.all) {
      return 'return true;\n';
    }
    if (kind === 'items') {
      const i = this.name('i');
      return known.prefix > 0
        ? `for (let ${i} = 0; ${i} < ${known.prefix} && ${i} < x.length; ${i} += 1) { s.add(${i}); }\n`
        : '';
    }
    const k = this.name('k');
    const accepted = this.acceptedKey(known, k);
    return accepted ? `for (const ${k} in x) {\nif (H.call(x, ${k}) && (${accepted})) { s.add(${k}); }\n}\n` : '';
  }

  // Statements of an evaluated function (value in x, Set in s) for what `type` evaluates.
  evaluatedCode(kind, type) {
    const known = staticEvaluatedBy(kind, type);
    if (known !== undefined) {
      return this.staticEvaluatedCode(kind, known);
    }
    const check = (item) => this.checkFunction(item);
    const code = (item) => this.evaluatedCode(kind, item);
    const onMatch = (item) => `if (${check(item)}(x)) {\n${code(item)}}\n`;
    switch (type.constructor) {
      case Schema:
      case ClosedSchema: {
        // Only its "dependentSchemas" depend on the value.
        const declared = {
          all: false,
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
          prefix: 0,
        };
        let result = this.staticEvaluatedCode(kind, declared);
        type.dependencies
          .filter((dependency) => dependency.type)
          .forEach((dependency) => {
            result += `if (H.call(x, ${JSON.stringify(dependency.key)})) {\n${onMatch(dependency.type)}}\n`;
          });
        return result;
      }
      case ArrayOfType: {
        // Only its "contains" depends on the value.
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const i = this.name('i');
        const tuple = this.staticEvaluatedCode(kind, {
          all: false,
          keys: new Set(),
          patterns: [],
          prefix,
        });
        const contains = `if (${check(type.contains)}(x[${i}])) { s.add(${i}); }\n`;
        return `${tuple}for (let ${i} = 0; ${i} < x.length; ${i} += 1) {\n${contains}}\n`;
      }
      case AllOfType:
        return type.types.map(code).join('');
      case AnyOfType:
        return type.types.map(onMatch).join('');
      case OneOfType: {
        // What the one alternative that matches evaluates, when exactly one does. With a discriminator, only the one
        // it picks can match.
        const oks = type.types.map(() => this.name('ok'));
        const d = this.name('d');
        const pick = type.discriminator ? this.pickCode(type, 'x', d) : '';
        const picks = (i) => (type.discriminator ? `(${d} === ${EVERY_TYPE} || ${d} === ${i}) && ` : '');
        const matches =
          pick + type.types.map((item, i) => `const ${oks[i]} = ${picks(i)}${check(item)}(x);\n`).join('');
        const chosen = type.types.map((item, i) => `if (${oks[i]}) {\n${code(item)}}\n`).join('');
        return `${matches}if (${oks.join(' + ')} === 1) {\n${chosen}}\n`;
      }
      case ConditionalType: {
        // What "if" evaluates counts when the value satisfies it, with the branch taken.
        const branch = (item) => (item ? onMatch(item) : '');
        const ifTrue = `${code(type.ifType)}${branch(type.thenType)}`;
        return `if (${check(type.ifType)}(x)) {\n${ifTrue}} else {\n${branch(type.elseType)}}\n`;
      }
      case RefType: {
        const target = type.getTarget();
        return `if (${this.evaluatedFunction(kind, target, [target])}(x, s)) { return true; }\n`;
      }
      case WhenType:
        return type.jsonType === JSON_TYPES[kind] ? code(type.type) : '';
      case UnevaluatedType: {
        // Evaluates everything the other keywords leave, when those elements satisfy it.
        const siblings = type.siblings.map(code).join('');
        return type.kind === kind ? `if (${check(type)}(x)) { return true; }\n${siblings}` : siblings;
      }
      default:
        return '';
    }
  }

  // Condition that is true when `type` evaluates the key (kind 'properties') or index ('items') in variable `k` of the
  // value in `v`, like evaluated() in unevaluated.js. It adds to `prelude` the statements that compute, once, which
  // subschemas the value satisfies. Undefined when a reference leads to a part that depends on the value, which may
  // be recursive: an evaluated function handles that case.
  evaluatedCondition(kind, type, v, k, prelude) {
    const known = staticEvaluatedBy(kind, type);
    if (known !== undefined) {
      if (known.all) {
        return 'true';
      }
      if (kind === 'items') {
        return known.prefix > 0 ? `${k} < ${known.prefix}` : 'false';
      }
      return this.acceptedKey(known, k) || 'false';
    }
    const matches = (item) => {
      const ok = this.name('ok');
      prelude.push(`const ${ok} = ${this.checkFunction(item)}(${v});\n`);
      return ok;
    };
    const condition = (item) => this.evaluatedCondition(kind, item, v, k, prelude);
    const any = (parts) => (parts.some((part) => part === undefined) ? undefined : `(${parts.join(' || ')})`);
    switch (type.constructor) {
      case Schema:
      case ClosedSchema: {
        // Only its "dependentSchemas" depend on the value.
        const declared = {
          keys: new Set(type.propertyKeys || type.keys),
          patterns: type.patternTypes.map(({ pattern }) => pattern),
        };
        const parts = [this.acceptedKey(declared, k) || 'false'];
        type.dependencies
          .filter((dependency) => dependency.type)
          .forEach((dependency) => {
            const ok = this.name('ok');
            const literal = JSON.stringify(dependency.key);
            prelude.push(`const ${ok} = H.call(${v}, ${literal}) && ${this.checkFunction(dependency.type)}(${v});\n`);
            const inner = condition(dependency.type);
            parts.push(inner === undefined ? undefined : `(${ok} && ${inner})`);
          });
        return any(parts);
      }
      case ArrayOfType: {
        // Only its "contains" depends on the value.
        const prefix = Array.isArray(type.type) ? type.type.length : 0;
        const contains = `${this.checkFunction(type.contains)}(${v}[${k}])`;
        return prefix > 0 ? `(${k} < ${prefix} || ${contains})` : contains;
      }
      case AllOfType:
        return any(type.types.map(condition));
      case AnyOfType:
        return any(
          type.types.map((item) => {
            const inner = condition(item);
            return inner === undefined ? undefined : `(${matches(item)} && ${inner})`;
          })
        );
      case OneOfType: {
        // What the one alternative that matches evaluates, when exactly one does. The oneOf may have recorded which
        // match already.
        let oks = this.matchesOf(type, v);
        if (!oks && type.discriminator) {
          // Only the alternative the discriminator picks can match.
          const d = this.name('d');
          prelude.push(this.pickCode(type, v, d));
          oks = type.types.map((item, i) => {
            const ok = this.name('ok');
            prelude.push(
              `const ${ok} = (${d} === ${EVERY_TYPE} || ${d} === ${i}) && ${this.checkFunction(item)}(${v});\n`
            );
            return ok;
          });
        }
        oks = oks || type.types.map(matches);
        const one = this.name('one');
        prelude.push(`const ${one} = ${oks.join(' + ')} === 1;\n`);
        const chosen = any(
          type.types.map((item, i) => {
            const inner = condition(item);
            return inner === undefined ? undefined : `(${oks[i]} && ${inner})`;
          })
        );
        return chosen === undefined ? undefined : `(${one} && ${chosen})`;
      }
      case ConditionalType: {
        // What "if" evaluates counts when the value satisfies it, with the branch taken.
        const okIf = matches(type.ifType);
        const parts = [];
        const ifPart = condition(type.ifType);
        parts.push(ifPart === undefined ? undefined : `(${okIf} && ${ifPart})`);
        [
          [type.thenType, okIf],
          [type.elseType, `!${okIf}`],
        ].forEach(([branch, taken]) => {
          if (branch) {
            const ok = this.name('ok');
            prelude.push(`const ${ok} = ${taken} && ${this.checkFunction(branch)}(${v});\n`);
            const inner = condition(branch);
            parts.push(inner === undefined ? undefined : `(${ok} && ${inner})`);
          }
        });
        return any(parts);
      }
      case WhenType:
        return type.jsonType === JSON_TYPES[kind] ? condition(type.type) : 'false';
      case UnevaluatedType: {
        // Evaluates everything the other keywords leave, when those elements satisfy it.
        const siblings = any(type.siblings.map(condition));
        if (type.kind !== kind || siblings === undefined) {
          return siblings;
        }
        return `(${matches(type)} || ${siblings})`;
      }
      case RefType:
        // Its target depends on the value (a fixed one is handled above), and may lead back here.
        return undefined;
      default:
        return 'false';
    }
  }

  // "unevaluatedProperties"/"unevaluatedItems": a loop over the keys or elements the other keywords leave. The loop
  // skips directly what the keywords that evaluate the same for every value evaluate, like "additionalProperties",
  // and what the others evaluate for the value through a condition on the subschemas it satisfies (or, when a
  // reference makes that impossible, through a Set that a generated function fills first).
  unevaluated(type, v, path, name) {
    const isFixed = (item) => staticEvaluatedBy(type.kind, item) !== undefined;
    const known = staticEvaluatedByAll(type.kind, type.siblings.filter(isFixed));
    const varying = type.siblings.filter((item) => !isFixed(item));
    if (known.all) {
      return { checks: [], rest: '' };
    }
    // Key (or index) variable of the loop, and the condition for what the varying siblings evaluate.
    const k = this.name(type.kind === 'items' ? 'i' : 'k');
    const prelude = [];
    const conditions = varying.map((item) => this.evaluatedCondition(type.kind, item, v, k, prelude));
    let evaluated = conditions.includes(undefined) ? undefined : conditions.join(' || ');
    let collect = prelude.join('');
    let close = '';
    if (evaluated === undefined) {
      const done = this.name('done');
      collect = `const ${done} = new Set();\nif (!${this.evaluatedFunction(type.kind, type, varying)}(${v}, ${done})) {\n`;
      close = '}\n';
      evaluated = `${done}.has(${k})`;
    }
    const x = this.name('v');
    if (type.kind === 'items') {
      const code = this.generate(type.type, x, this.indexOf(path, name, k));
      if (!code) {
        return { checks: [], rest: '' };
      }
      const skip = evaluated ? `if (${evaluated}) { continue; }\n` : '';
      let rest = `if (Array.isArray(${v})) {\n${collect}for (let ${k} = ${known.prefix}; ${k} < ${v}.length; ${k} += 1) {\n`;
      rest += `${skip}const ${x} = ${v}[${k}];\n${code}}\n${close}}\n`;
      return { checks: [], rest };
    }
    const keyName = this.keyOf(path, k);
    let code;
    if (type.type.constructor === NeverType) {
      const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
      code = this.emit(messageAt(keyName, unexpected, 'unevaluatedProperties', `{ property: ${k} }`));
    } else {
      const inner = this.generate(type.type, x, keyName);
      // A schema that accepts every value gives no code.
      if (!inner) {
        return { checks: [], rest: '' };
      }
      code = `const ${x} = ${v}[${k}];\n${inner}`;
    }
    const accepted = [this.acceptedKey(known, k), evaluated].filter(Boolean).join(' || ');
    const skip = accepted ? ` || ${accepted}` : '';
    let rest = `if (typeof ${v} === 'object' && !Array.isArray(${v})) {\n${collect}for (const ${k} in ${v}) {\n`;
    rest += `if (!H.call(${v}, ${k})${skip}) { continue; }\n${code}}\n${close}}\n`;
    return { checks: [], rest };
  }

  // Same order as Schema.errors(): declared keys, then extra keys, then property counts.
  schema(type, v, path, name, text, known) {
    let keysCode = '';
    // A key read to check it gets its default as it is read; the others get it first (see defaultsCode()). Most objects
    // have no defaults (only with the option useDefaults), and then none of this is made.
    const hasDefaults = type.defaults !== undefined && type.defaults.length > 0;
    const defaultOf = hasDefaults ? new Map(type.defaults.map((entry) => [entry.key, entry])) : undefined;
    type.keys.forEach((key) => {
      const x = this.name('v');
      const literal = JSON.stringify(key);
      const code = this.generate(type.schema[key], x, this.keyOf(path, literal));
      // A key whose type accepts anything is not read.
      if (code) {
        // Own properties only, like Schema's ownValue(). A value read from a plain object is its own unless
        // Object.prototype has the key, so the slower own-property check only runs in that case or for other
        // prototypes. The prototype is read with __proto__, as there: Object.getPrototypeOf() halves the speed.
        keysCode += `let ${x} = ${v}[${literal}];\n`;
        const isOwn = `(!${v}plain || ${literal} in OP) && !H.call(${v}, ${literal})`;
        this.plainUsed.add(`${this.scope}:${v}`);
        const entry = hasDefaults ? defaultOf.get(key) : undefined;
        if (entry) {
          defaultOf.delete(key);
          const copy = `${x} = ${v}[${literal}] = ${this.copyCode(entry.value)};`;
          keysCode += `if (${missingCode(x, entry)}) { ${copy} } else if (${isOwn}) { ${x} = undefined; }\n`;
        } else {
          keysCode += `if (${x} !== undefined && ${isOwn}) { ${x} = undefined; }\n`;
        }
        // With coerceTypes, the value is converted to the types of its schema and written back.
        keysCode += this.coerceCode(coerceSpecOf(type.schema[key]), x, `${v}[${literal}]`);
        keysCode += code;
      } else if (hasDefaults && defaultOf.has(key)) {
        // Not read, but its default is assigned in the order of the keys, as ajv does.
        keysCode += this.defaultsCode(v, [defaultOf.get(key)]);
        defaultOf.delete(key);
      }
    });
    // An enclosing allOf of the same function may have worked it out already.
    const isDeclared = this.plainDeclared.has(`${this.scope}:${v}`);
    let rest = keysCode && !isDeclared ? `const ${v}plain = ${v}.__proto__ === OP;\n${keysCode}` : keysCode;
    // The defaults of the keys not read are assigned first, like Schema.isValid() does with all of them.
    if (hasDefaults) {
      rest = this.defaultsCode(v, [...defaultOf.values()]) + rest;
    }
    const checkExtra = !type.isOpen || type.additionalType || type.removeAdditional;
    const countKeys = type.minProperties !== undefined || type.maxProperties !== undefined;
    const { patternTypes } = type;
    if (checkExtra || countKeys || patternTypes.length > 0 || type.propertyNameType) {
      const count = this.name('count');
      const k = this.name('k');
      const keyName = this.keyOf(path, k);
      rest += `let ${count} = 0;\nfor (const ${k} in ${v}) {\n`;
      rest += `if (!H.call(${v}, ${k})) { continue; }\n${count} += 1;\n`;
      if (type.propertyNameType) {
        rest += this.generate(type.propertyNameType, k, this.propertyNameOf(path, k));
      }
      // Keys matching a pattern satisfy its type and are not extra keys, like Schema.errors().
      const matched = this.name('matched');
      this.mayRepeat = this.mayRepeat || patternTypes.length > 1;
      if (patternTypes.length > 0) {
        rest += `let ${matched} = false;\n`;
        patternTypes.forEach(({ pattern, type: patternType }) => {
          const x = this.name('v');
          rest += `if (${this.constant(pattern)}.test(${k})) {\n${matched} = true;\nlet ${x} = ${v}[${k}];\n`;
          rest += this.coerceCode(coerceSpecOf(patternType), x, `${v}[${k}]`);
          rest += `${this.generate(patternType, x, keyName)}}\n`;
        });
      }
      if (checkExtra) {
        // With removeAdditional, a key only "required" names is additional (see Schema.isDeclared()).
        const keys = type.removeAdditional && type.propertyKeys ? type.propertyKeys : type.keys;
        const declared =
          keys.length <= MAX_INLINE_KEYS
            ? keys.map((key) => `${k} === ${JSON.stringify(key)}`).join(' || ') || 'false'
            : `${this.constant(new Set(keys))}.has(${k})`;
        const accepted = patternTypes.length > 0 ? `${declared} || ${matched}` : declared;
        rest += `if (!(${accepted})) {\n`;
        // removeAdditional: the key is deleted (see Schema.removes()). It still counts for minProperties and
        // maxProperties, as in ajv.
        const remove = `delete ${v}[${k}];\n`;
        if (type.removeAdditional === 'delete') {
          rest += remove;
        } else if (type.removeAdditional === 'failing') {
          rest += `if (!${this.checkFunction(type.additionalType)}(${v}[${k}])) {\n${remove}}\n`;
        } else if (!type.isOpen) {
          const unexpected = () => `"Unexpected key: " + ${this.nameOf(keyName, false)}`;
          rest += this.emit(messageAt(keyName, unexpected, 'additionalProperties', `{ property: ${k} }`));
        } else {
          const x = this.name('v');
          rest += `let ${x} = ${v}[${k}];\n${this.coerceCode(coerceSpecOf(type.additionalType), x, `${v}[${k}]`)}`;
          rest += this.generate(type.additionalType, x, keyName);
        }
        rest += '}\n';
      }
      rest += '}\n';
      if (type.minProperties !== undefined) {
        const message = text(
          ` must have at least ${type.minProperties} properties`,
          'minProperties',
          `{ limit: ${this.number(type.minProperties)} }`
        );
        rest += `if (${count} < ${this.number(type.minProperties)}) { ${this.emit(message)} }\n`;
      }
      if (type.maxProperties !== undefined) {
        const message = text(
          ` must have at most ${type.maxProperties} properties`,
          'maxProperties',
          `{ limit: ${this.number(type.maxProperties)} }`
        );
        rest += `if (${count} > ${this.number(type.maxProperties)}) { ${this.emit(message)} }\n`;
      }
    }
    rest += this.dependencies(type, v, path);
    return {
      checks:
        known === 'object'
          ? []
          : [
              [
                `typeof ${v} !== 'object' || Array.isArray(${v})`,
                text(' must be an object', 'type', "{ type: 'object' }"),
              ],
            ],
      rest,
    };
  }

  // Like Schema.errors(): a key is present when it is an own property that is not undefined.
  dependencies(type, v, path) {
    const isPresent = (literal) => `(H.call(${v}, ${literal}) && ${v}[${literal}] !== undefined)`;
    return type.dependencies
      .map(({ key, required, type: dependentType }) => {
        const literal = JSON.stringify(key);
        let code;
        if (required) {
          code = required
            .map((property) => {
              const propertyLiteral = JSON.stringify(property);
              // About the property that is missing.
              const missing = this.keyOf(path, propertyLiteral);
              const present = this.nameOf(this.keyOf(path, literal), false);
              const text = () => `${this.nameOf(missing, false)} + " is mandatory when " + ${present} + " is present"`;
              const params = `{ property: ${literal}, missingProperty: ${propertyLiteral} }`;
              const message = messageAt(missing, text, 'dependentRequired', params);
              return `if (!${isPresent(propertyLiteral)}) { ${this.emit(message)} }\n`;
            })
            .join('');
        } else {
          code = this.generate(dependentType, v, path);
        }
        return `if (${isPresent(literal)}) {\n${code}}\n`;
      })
      .join('');
  }

  // Source of the body of a function that takes the constants (c), the nodes (n) and the helpers r and a, and returns
  // the validation function. standalone.js writes it out with the constants as code. With `shared`, the helpers of
  // the prologue (H, OP, J, P, U) are not written: build() gives them as parameters, made once (V8 then has less code
  // to parse for every schema compiled).
  source(type, shared = false) {
    const main = this.generate(type, 'v0', this.rootPath());
    // Every error once, like toErrors(): parts of an allOf, or alternatives, can report the same one.
    const results = {
      check: ['', 'true'],
      first: ['', 'undefined'],
      all: [
        'let out;\n',
        this.mayRepeat ? '(out === undefined ? [] : out.length > 1 ? U(out) : out)' : '(out === undefined ? [] : out)',
      ],
    };
    const [declared, end] = results[this.mode];
    // The variable of the paths of error objects (see emit()).
    const start = this.structured && this.mode !== 'check' ? `${declared}let q;\n` : declared;
    if (shared) {
      return `"use strict";\n${this.functions.join('')}return function validate(v0) {\n${start}${main}return ${end};\n};`;
    }
    const prologue = [
      '"use strict";',
      'const H = Object.prototype.hasOwnProperty;',
      'const OP = Object.prototype;',
      'function J(fieldName, key) { return fieldName ? fieldName + "." + key : key; }',
      // Adds an error to the list, which is made with the first one.
      'function P(out, e) { if (out === undefined) { return [e]; } out.push(e); return out; }',
      // The list itself when no error repeats, which is the usual case: a new list is only built when one does. Error
      // objects repeat when their messages do.
      this.structured
        ? 'function U(e) { const m = e.map((x) => x.message); for (let i = 1; i < m.length; i += 1) { if (m.indexOf(m[i]) < i) { return e.filter((x, j) => m.indexOf(m[j]) === j); } } return e; }'
        : 'function U(e) { for (let i = 1; i < e.length; i += 1) { if (e.indexOf(e[i]) < i) { return Array.from(new Set(e)); } } return e; }',
      '',
    ].join('\n');
    return `${prologue}${this.functions.join('')}return function validate(v0) {\n${start}${main}return ${end};\n};`;
  }

  build(type) {
    const source = this.source(type, true);
    const [first, push] = this.structured ? [firstErrorObject, pushErrorObjects] : [firstError, pushErrors];
    const helpers = this.structured ? STRUCTURED_HELPERS : HELPERS;
    // eslint-disable-next-line no-new-func -- code generation is the point: only keys, texts (JSON.stringify) and finite numbers are embedded
    return new Function('c', 'n', 'r', 'a', 'H', 'OP', 'J', 'P', 'U', source)(
      this.constants,
      this.nodes,
      first,
      push,
      ...helpers
    );
  }
}

// Returns a (value) => boolean function equivalent to type.isValid(value).
function compileIsValid(type) {
  return new Generator('check').build(type);
}

// Returns a (value) => message | undefined function giving the first error of type.validate(value).
function compileFirstError(type) {
  return new Generator('first').build(type);
}

// Returns a (value) => messages function equivalent to toErrors(type.errors(value)) for invalid values, and giving
// an empty array for valid ones.
function compileErrors(type) {
  return new Generator('all').build(type);
}

// Returns a (value) => errors function: every error message by default (empty when valid), or with
// allErrors: false only the first one, which stops at the first failing check.
// With errors: false it returns a (value) => boolean function instead, which builds no messages at all.
// The mode of the generated code for the options of compileType(): 'check', 'first' or 'all'.
// The mode of the generated code for the options of compileType() ('check', 'first' or 'all'), and whether errors are
// objects. errors: true (default) gives messages, 'objects' error objects (see error-objects.js), false true or false.
// foldMessages: messages known when compiling written as one literal (see messageCode()).
function modeOf(options = {}) {
  const { allErrors = true, errors = true, foldMessages = false } = options;
  if (foldMessages !== true && foldMessages !== false) {
    throw new Error(`Unsupported option "foldMessages": ${JSON.stringify(foldMessages)} is not true or false`);
  }
  if (errors !== true && errors !== false && errors !== 'objects') {
    throw new Error(`Unsupported option "errors": ${JSON.stringify(errors)} is not true, false or 'objects'`);
  }
  if (errors === false) {
    return { mode: 'check', structured: false, fold: false };
  }
  return {
    mode: allErrors ? 'all' : 'first',
    structured: errors === 'objects',
    fold: foldMessages,
  };
}

// The generated code of compileType(type, options), for standalone.js: the source (see Generator.source()), with
// the constants and the nodes it uses, and its mode.
function generateSource(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  const generator = new Generator(mode, structured, fold);
  const source = generator.source(type);
  return {
    mode,
    source,
    constants: generator.constants,
    nodes: generator.nodes,
  };
}

function compileType(type, options = {}) {
  const { mode, structured, fold } = modeOf(options);
  // In 'all' mode one pass: checking validity first would walk invalid values twice.
  const validate = new Generator(mode, structured, fold).build(type);
  if (mode !== 'first') {
    return validate;
  }
  // The first error in a list.
  return (value) => {
    const error = validate(value);
    return error === undefined ? [] : [error];
  };
}

module.exports = {
  generateSource,
  compileErrors,
  compileFirstError,
  compileIsValid,
  compileType,
};

},
"@xufa/schema/lib/deep-equal.js": function (module, exports, require) {
function deepEqual(a, b) {
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false;
    if (Array.isArray(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (a instanceof Map && b instanceof Map) {
      if (a.size !== b.size) return false;
      const keys = [...a.keys()];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!b.has(key)) return false;
      }
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!deepEqual(a.get(key), b.get(key))) return false;
      }
      return true;
    }
    if (a instanceof Set && b instanceof Set) {
      if (a.size !== b.size) return false;
      const keys = [...a.keys()];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (!b.has(key)) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(a)) {
      const l = a.length;
      if (l !== b.length) return false;
      for (let i = 0; i < l; i += 1) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;
    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();
    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

module.exports = { deepEqual };

},
"@xufa/schema/lib/defaults.js": function (module, exports, require) {
// The option useDefaults: values of "default" assigned to missing properties and tuple elements before they are
// checked, as ajv does. Each validation assigns a new copy, so the data never shares objects with the schema.

// A copy of a default value: arrays and plain objects are copied deeply; other values are used as they are.
function copyDefault(value) {
  if (Array.isArray(value)) {
    return value.map(copyDefault);
  }
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const copy = {};
    Object.keys(value).forEach((key) => {
      // An own "__proto__" key, as JSON.parse() makes it, stays a plain entry.
      Object.defineProperty(copy, key, {
        value: copyDefault(value[key]),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    });
    return copy;
  }
  return value;
}

// Assigns the defaults ([{ key, value, empty }]) whose value is missing in `target`: undefined, or with `empty` also
// null or ''.
function assignDefaults(target, defaults) {
  for (let i = 0; i < defaults.length; i += 1) {
    const { key, value, empty } = defaults[i];
    const current = target[key];
    if (current === undefined || (empty && (current === null || current === ''))) {
      target[key] = copyDefault(value);
    }
  }
}

module.exports = {
  copyDefault,
  assignDefaults,
};

},
"@xufa/schema/lib/error-objects.js": function (module, exports, require) {
// Error objects of compile({ errors: 'objects' }). The generated code keeps the path of each value as an array of keys
// and indexes; these functions name it as the messages do and build the objects. Standalone code writes them out by
// their source (see standalone-helpers.js), so they call no other function.

// The name the messages give to the value at `path`: keys joined with dots, indexes in brackets, "Value" for the
// value itself (and before an index at the root). A last segment { key } is a key checked by propertyNames, named
// "Key <name>". Same names as the string paths of compile.js.
function pathName(path) {
  let name;
  for (let i = 0; i < path.length; i += 1) {
    const segment = path[i];
    if (typeof segment === 'number') {
      name = `${name === undefined ? 'Value' : name}[${segment}]`;
    } else if (segment !== null && typeof segment === 'object') {
      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;
    } else {
      name = name ? `${name}.${segment}` : segment;
    }
  }
  return name === undefined ? 'Value' : name;
}

// An error: the path of the value (keys and indexes) and its JSON Pointer, the keyword that failed with its params,
// and the message. For a key checked by propertyNames, the path is the one of its property, with propertyName: true.
function errorObject(path, keyword, params, message) {
  const last = path[path.length - 1];
  const isPropertyName = last !== null && typeof last === 'object';
  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();
  let pointer = '';
  for (let i = 0; i < keys.length; i += 1) {
    const key = `${keys[i]}`;
    // Escaped only when it has one of the two characters to escape.
    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}` : `/${key}`;
  }
  const error = { path: keys, pointer, keyword, params, message };
  if (isPropertyName) {
    error.propertyName = true;
  }
  return error;
}

module.exports = {
  pathName,
  errorObject,
};

},
"@xufa/schema/lib/formats.js": function (module, exports, require) {
// Checks of the "format" keyword (JSON Schema) and of the `format` option of String, all of them for strings. Each
// check is a self-contained function, or one calling others of this file by name, as standalone code writes them
// out by their source (see standalone-helpers.js).

// RFC 3339 full-date, with the days of each month and leap years.
function isDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

// RFC 3339 full-time: a time with an offset. A leap second (60) is valid only at 23:59 UTC.
function isTime(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:([zZ])|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    return false;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);
  if (hour > 23 || minute > 59 || second > 60) {
    return false;
  }
  let offset = 0;
  if (!match[4]) {
    const offsetHour = Number(match[6]);
    const offsetMinute = Number(match[7]);
    if (offsetHour > 23 || offsetMinute > 59) {
      return false;
    }
    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;
}

// RFC 3339 date-time.
function isDateTime(value) {
  const match = /^(.{10})[tT](.+)$/.exec(value);
  return match !== null && isDate(match[1]) && isTime(match[2]);
}

// ISO 8601 duration, as RFC 3339 appendix A defines it.
function isDuration(value) {
  return /^P(?:(?:\d+Y(?:\d+M(?:\d+D)?)?|\d+M(?:\d+D)?|\d+D)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/.test(
    value
  );
}

function isIpv4(value) {
  return /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(value);
}

// RFC 4291 text form: eight groups, "::" for one or more groups of zeros, and an IPv4 address as the last two.
function isIpv6(value) {
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {
    return false;
  }
  const halves = value.split('::');
  if (halves.length > 2) {
    return false;
  }
  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));
  const all = groups[groups.length - 1];
  let count = 0;
  if (all.length > 0 && all[all.length - 1].includes('.')) {
    if (!isIpv4(all.pop())) {
      return false;
    }
    count = 2;
  }
  const hextets = [].concat(...groups);
  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {
    return false;
  }
  count += hextets.length;
  return halves.length === 2 ? count < 8 : count === 8;
}

// Punycode (RFC 3492): the bias adaptation, decoding (undefined when invalid) and encoding.
function punycodeAdapt(delta, points, isFirst) {
  let result = Math.floor(delta / (isFirst ? 700 : 2));
  result += Math.floor(result / points);
  let k = 0;
  while (result > 455) {
    result = Math.floor(result / 35);
    k += 36;
  }
  return k + Math.floor((36 * result) / (result + 38));
}

function punycodeDecode(input) {
  const output = [];
  const delimiter = input.lastIndexOf('-');
  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {
    if (input.charCodeAt(j) >= 0x80) {
      return undefined;
    }
    output.push(input.charCodeAt(j));
  }
  let n = 128;
  let bias = 72;
  let i = 0;
  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {
    const old = i;
    let weight = 1;
    for (let k = 36; ; k += 36) {
      if (index >= input.length) {
        return undefined;
      }
      const code = input.charCodeAt(index);
      index += 1;
      let digit = 36;
      if (code >= 48 && code <= 57) {
        digit = code - 22;
      } else if (code >= 65 && code <= 90) {
        digit = code - 65;
      } else if (code >= 97 && code <= 122) {
        digit = code - 97;
      }
      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {
        return undefined;
      }
      i += digit * weight;
      let t = k - bias;
      if (k <= bias) {
        t = 1;
      } else if (k >= bias + 26) {
        t = 26;
      }
      if (digit < t) {
        break;
      }
      weight *= 36 - t;
    }
    bias = punycodeAdapt(i - old, output.length + 1, old === 0);
    n += Math.floor(i / (output.length + 1));
    i %= output.length + 1;
    if (n > 0x10ffff) {
      return undefined;
    }
    output.splice(i, 0, n);
    i += 1;
  }
  return String.fromCodePoint(...output);
}

function punycodeEncode(input) {
  const points = Array.from(input, (char) => char.codePointAt(0));
  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
  let output = points
    .filter((point) => point < 128)
    .map((point) => String.fromCharCode(point))
    .join('');
  const basic = output.length;
  let handled = basic;
  if (basic > 0) {
    output += '-';
  }
  let n = 128;
  let delta = 0;
  let bias = 72;
  while (handled < points.length) {
    // The smallest code point not handled yet.
    let m = 0x10ffff;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] >= n && points[i] < m) {
        m = points[i];
      }
    }
    delta += (m - n) * (handled + 1);
    n = m;
    for (let i = 0; i < points.length; i += 1) {
      if (points[i] < n) {
        delta += 1;
      }
      if (points[i] === n) {
        let q = delta;
        for (let k = 36; ; k += 36) {
          let t = k - bias;
          if (k <= bias) {
            t = 1;
          } else if (k >= bias + 26) {
            t = 26;
          }
          if (q < t) {
            break;
          }
          output += digit(t + ((q - t) % (36 - t)));
          q = Math.floor((q - t) / (36 - t));
        }
        output += digit(q);
        bias = punycodeAdapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

// Bidi class of a character, approximated from its script and category: L, R, AL, AN, EN, ES, CS, ET, NSM or ON.
function bidiClass(char) {
  if (/[\u0600-\u0605\u0660-\u0669\u066B\u066C\u06DD\u0890\u0891\u08E2]/u.test(char)) {
    return 'AN';
  }
  if (/[0-9\u06F0-\u06F9\u00B2\u00B3\u00B9\u2070-\u2079\u2080-\u2089\uFF10-\uFF19]/u.test(char)) {
    return 'EN';
  }
  if (/[\p{Mn}\p{Me}]/u.test(char)) {
    return 'NSM';
  }
  if (/[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}]/u.test(char)) {
    return 'AL';
  }
  if (/[\p{Script=Hebrew}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\u200F]/u.test(char)) {
    return 'R';
  }
  if (/[+-]/.test(char)) {
    return 'ES';
  }
  if (/[,./:\u00A0]/.test(char)) {
    return 'CS';
  }
  if (/[#$%\u00A2-\u00A5\u00B0\u00B1]/u.test(char)) {
    return 'ET';
  }
  return /[\p{L}\p{Mc}]/u.test(char) ? 'L' : 'ON';
}

// The Bidi rule of RFC 5893 for a label, in a name with right-to-left labels.
function hasValidBidi(label) {
  const classes = Array.from(label, bidiClass);
  const first = classes[0];
  const last = classes.filter((type) => type !== 'NSM').pop();
  if (first === 'R' || first === 'AL') {
    return (
      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&
      ['R', 'AL', 'EN', 'AN'].includes(last) &&
      !(classes.includes('EN') && classes.includes('AN'))
    );
  }
  if (first === 'L') {
    return (
      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)
    );
  }
  return false;
}

// Whether a label (without "xn--" and already mapped) is a valid U-label: IDNA2008 (RFC 5891, 5892) code points,
// hyphens and contextual rules.
function isULabel(label) {
  const chars = Array.from(label);
  if (label.length === 0 || label.normalize('NFC') !== label || /^\p{M}/u.test(label)) {
    return false;
  }
  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {
    return false;
  }
  const virama =
    /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D3B\u0D3C\u0D4D\u0DCA\u0E3A\u0F84\u1039\u103A\u1714\u1734\u17D2\u1A60\u1B44\u1BAA\u1BAB\u1BF2\u1BF3\u2D7F\uA806\uA8C4\uA953\uA9C0\uAAF6\uABED]/u;
  const joining = /[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mongolian}]/u;
  return chars.every((char, i) => {
    const before = chars[i - 1];
    const after = chars[i + 1];
    switch (char) {
      case '\u00DF':
      case '\u03C2':
      case '\u06FD':
      case '\u06FE':
      case '\u0F0B':
      case '\u3007':
        return true;
      case '\u00B7':
        return before === 'l' && after === 'l';
      case '\u0375':
        return after !== undefined && /\p{Script=Greek}/u.test(after);
      case '\u05F3':
      case '\u05F4':
        return before !== undefined && /\p{Script=Hebrew}/u.test(before);
      case '\u30FB':
        return chars.some(
          (other) => /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(other) && other !== '\u30FB'
        );
      case '\u200D':
        return before !== undefined && virama.test(before);
      case '\u200C': {
        if (before !== undefined && virama.test(before)) {
          return true;
        }
        // Joining letters on both sides, marks between them skipped.
        const left = chars
          .slice(0, i)
          .reverse()
          .find((other) => !/\p{Mn}/u.test(other));
        const right = chars.slice(i + 1).find((other) => !/\p{Mn}/u.test(other));
        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);
      }
      default:
        break;
    }
    if (/[\u0660-\u0669]/u.test(char)) {
      return !chars.some((other) => /[\u06F0-\u06F9]/u.test(other));
    }
    if (/[\u06F0-\u06F9]/u.test(char)) {
      return !chars.some((other) => /[\u0660-\u0669]/u.test(other));
    }
    // The code points RFC 5892 lists as DISALLOWED, marks among them.
    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own
    if (/[\u0640\u07FA\u302E\u302F\u3031-\u3035\u303B]/u.test(char)) {
      return false;
    }
    return /[\p{Ll}\p{Lo}\p{Lm}\p{Mn}\p{Mc}\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;
  });
}

// Whether a host name, after UTS 46 mapping when `isIdn`, is valid: labels of at most 63 octets (as A-labels), at most
// 253 octets in all, ASCII letters, digits and hyphens, and A-labels ("xn--") and U-labels that are valid.
function hasValidLabels(value, isIdn) {
  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and
  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it
  // only has to be at most 253 characters long.
  if (
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) &&
    !/(?:^|\.)[A-Za-z0-9-]{2}--/.test(value)
  ) {
    return value.length <= 253;
  }
  const mapped = isIdn
    ? value
        .normalize('NFKC')
        .replace(/[\u3002\uFF0E\uFF61]/gu, '.')
        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).
        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own
        .replace(/[\u00AD\u200B\u2060\uFEFF\u180B-\u180D\uFE00-\uFE0F]/gu, '')
        .toLowerCase()
    : value;
  if (!isIdn && !/^[\x21-\x7E]*$/.test(mapped)) {
    return false;
  }
  const labels = mapped.split('.');
  const unicode = [];
  const ascii = [];
  const valid = labels.every((label) => {
    if (/^xn--/i.test(label)) {
      const decoded = punycodeDecode(label.slice(4).toLowerCase());
      if (
        decoded === undefined ||
        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||
        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||
        !isULabel(decoded)
      ) {
        return false;
      }
      unicode.push(decoded);
      ascii.push(label);
      return label.length <= 63;
    }
    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {
      unicode.push(label);
      ascii.push(label);
      return (
        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&
        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))
      );
    }
    if (!isIdn || !isULabel(label)) {
      return false;
    }
    unicode.push(label);
    ascii.push(`xn--${punycodeEncode(label)}`);
    return ascii[ascii.length - 1].length <= 63;
  });
  if (!valid || ascii.join('.').length > 253) {
    return false;
  }
  // With a right-to-left label, every label follows the Bidi rule.
  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));
  return !isRtl || unicode.every(hasValidBidi);
}

function isHostname(value) {
  return hasValidLabels(value, false);
}

// A host name up to draft-06: RFC 1123 labels, without the rules of IDNA that later drafts add.
function isRfc1123Hostname(value) {
  return (
    value.length <= 253 &&
    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
  );
}

function isIdnHostname(value) {
  return hasValidLabels(value, true);
}

// RFC 5321 address: a dot-atom or quoted local part, and a host name (that isHost checks) or an IP address literal.
function isEmailWith(value, isIdn, isHost) {
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  // Literals, which are compiled once (a RegExp made here would be compiled on every call).
  const dotAtom = isIdn
    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\u0080-\u{10FFFF}-]+)*$/u
    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
  // A quoted local part: printable ASCII but '"' and '\', which are escaped, and in idn-email other characters too.
  const quoted = isIdn
    ? /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E\u0080-\u{10FFFF}]|\\[\x20-\x7E])*"$/u
    : /^"(?:[\x20\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;
  if (!dotAtom.test(local) && !quoted.test(local)) {
    return false;
  }
  const literal = domain.charCodeAt(0) === 0x5b ? /^\[(?:IPv6:(.+)|(.+))\]$/i.exec(domain) : null;
  if (literal) {
    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);
  }
  return isHost(domain);
}

function isEmail(value) {
  return isEmailWith(value, false, isHostname);
}

function isIdnEmail(value) {
  return isEmailWith(value, true, isIdnHostname);
}

// ECMA-262 regular expression, as the u flag reads it.
function isRegex(value) {
  try {
    RegExp(value, 'u');
    return true;
  } catch (e) {
    return false;
  }
}

// URIs and IRIs (RFC 3986, 3987), built from the grammar of RFC 3986.
const PCT = '%[0-9A-Fa-f]{2}';
const SUB_DELIMS = "!$&'()*+,;=";
const UCSCHAR =
  '\\u00A0-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFEF\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}' +
  '\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}' +
  '\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}';
const IPRIVATE = '\\uE000-\\uF8FF\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}';
const H16 = '[0-9A-Fa-f]{1,4}';
const DEC_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = `(?:${DEC_OCTET}\\.){3}${DEC_OCTET}`;
const LS32 = `(?:${H16}:${H16}|${IPV4})`;
const IPV6 = [
  `(?:${H16}:){6}${LS32}`,
  `::(?:${H16}:){5}${LS32}`,
  `(?:${H16})?::(?:${H16}:){4}${LS32}`,
  `(?:(?:${H16}:){0,1}${H16})?::(?:${H16}:){3}${LS32}`,
  `(?:(?:${H16}:){0,2}${H16})?::(?:${H16}:){2}${LS32}`,
  `(?:(?:${H16}:){0,3}${H16})?::${H16}:${LS32}`,
  `(?:(?:${H16}:){0,4}${H16})?::${LS32}`,
  `(?:(?:${H16}:){0,5}${H16})?::${H16}`,
  `(?:(?:${H16}:){0,6}${H16})?::`,
].join('|');

// The regular expression of a URI (or IRI) or of a reference to one.
function uriPattern(isIri, isReference) {
  const unreserved = `A-Za-z0-9\\-._~${isIri ? UCSCHAR : ''}`;
  const pchar = `(?:[${unreserved}${SUB_DELIMS}:@]|${PCT})`;
  const segmentNzNc = `(?:[${unreserved}${SUB_DELIMS}@]|${PCT})+`;
  const userinfo = `(?:[${unreserved}${SUB_DELIMS}:]|${PCT})*`;
  const ipLiteral = `\\[(?:${IPV6}|[vV][0-9A-Fa-f]+\\.[A-Za-z0-9\\-._~${SUB_DELIMS}:]+)\\]`;
  const regName = `(?:[${unreserved}${SUB_DELIMS}]|${PCT})*`;
  const authority = `(?:${userinfo}@)?(?:${ipLiteral}|${IPV4}|${regName})(?::\\d*)?`;
  const pathAbempty = `(?:/${pchar}*)*`;
  const pathAbsolute = `/(?:${pchar}+(?:/${pchar}*)*)?`;
  const pathRootless = `${pchar}+(?:/${pchar}*)*`;
  const pathNoscheme = `${segmentNzNc}(?:/${pchar}*)*`;
  const query = `(?:${pchar}|[/?${isIri ? IPRIVATE : ''}])*`;
  const fragment = `(?:${pchar}|[/?])*`;
  const tail = `(?:\\?${query})?(?:#${fragment})?`;
  const uri = `[A-Za-z][A-Za-z0-9+\\-.]*:(?://${authority}${pathAbempty}|${pathAbsolute}|${pathRootless}|)${tail}`;
  const relative = `(?://${authority}${pathAbempty}|${pathAbsolute}|${pathNoscheme}|)${tail}`;
  return new RegExp(isReference ? `^(?:${uri}|${relative})$` : `^${uri}$`, 'u');
}

// Built-in formats: a function, or a regular expression the string must match.
// Comparisons of two values of a format for formatMinimum, formatMaximum, formatExclusiveMinimum and
// formatExclusiveMaximum, as ajv-formats compares them: a negative number, 0 or a positive number, or undefined when
// either value cannot be compared (which passes the limit).
function compareDate(d1, d2) {
  if (!(d1 && d2)) {
    return undefined;
  }
  if (d1 > d2) {
    return 1;
  }
  return d1 < d2 ? -1 : 0;
}

function compareTime(t1, t2) {
  if (!(t1 && t2)) {
    return undefined;
  }
  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();
  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : undefined;
}

function compareDateTime(dt1, dt2) {
  if (!(dt1 && dt2)) {
    return undefined;
  }
  const ms1 = new Date(dt1).valueOf();
  const ms2 = new Date(dt2).valueOf();
  return ms1 && ms2 ? ms1 - ms2 : undefined;
}

// The built-in formats whose values can be compared, with their comparison.
const FORMAT_COMPARES = {
  date: compareDate,
  time: compareTime,
  'date-time': compareDateTime,
};

const FORMATS = {
  date: isDate,
  time: isTime,
  'date-time': isDateTime,
  duration: isDuration,
  email: isEmail,
  'idn-email': isIdnEmail,
  hostname: isHostname,
  'idn-hostname': isIdnHostname,
  ipv4: isIpv4,
  ipv6: isIpv6,
  uri: uriPattern(false, false),
  'uri-reference': uriPattern(false, true),
  iri: uriPattern(true, false),
  'iri-reference': uriPattern(true, true),
  uuid: /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/,
  // RFC 6570: literals are any character but controls, space and '"%<>\^`{|}'; variable names may have dots.
  /* eslint-disable no-control-regex -- the literals exclude the control characters */
  'uri-template':
    /^(?:[^\x00-\x20\x7F"%<>\\^`{|}]|%[0-9A-Fa-f]{2}|\{[+#./;?&=,!@|]?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?(?:,(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+(?:\.(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})+)*(?::[1-9][0-9]{0,3}|\*)?)*\})*$/,
  /* eslint-enable no-control-regex */
  'json-pointer': /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  'relative-json-pointer': /^(?:0|[1-9][0-9]*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/,
  regex: isRegex,
};

// The functions of the formats, and the ones they call, by name, for standalone code.
const FORMAT_FUNCTIONS = {
  isRfc1123Hostname,
  compareDate,
  compareTime,
  compareDateTime,
  isDate,
  isTime,
  isDateTime,
  isDuration,
  isIpv4,
  isIpv6,
  punycodeAdapt,
  punycodeDecode,
  punycodeEncode,
  bidiClass,
  hasValidBidi,
  isULabel,
  hasValidLabels,
  isHostname,
  isIdnHostname,
  isEmailWith,
  isEmail,
  isIdnEmail,
  isRegex,
};

// Whether `value` has the format `check` (a function or a regular expression).
function matchesFormat(check, value) {
  return typeof check === 'function' ? check(value) : check.test(value);
}

module.exports = {
  FORMATS,
  FORMAT_COMPARES,
  FORMAT_FUNCTIONS,
  isRfc1123Hostname,
  matchesFormat,
};

},
"@xufa/schema/lib/infer.js": function (module, exports, require) {
// Schemas inferred from sample values: inferJsonSchema() gives a JSON Schema and inferSchemaCode() the source of the
// same schema in the DSL. The samples are merged position by position: the types seen at each one (an integer and a
// number give "number", null makes it nullable), the keys of objects (required when every object at that position has
// them), and the elements of arrays, all merged into one schema. Strings get a format when every one matches it.
const { FORMATS, matchesFormat } = require('./formats');

// The formats detected, in order of preference: the first one every string matches is chosen. Host names, URI
// references and the like match plain words, so they are left out; a URI needs "scheme://".
const FORMAT_CANDIDATES = ['date-time', 'date', 'time', 'email', 'uuid', 'ipv4', 'ipv6', 'uri'];
const matchesCandidate = (name, text) =>
  name === 'uri'
    ? /^[a-z][a-z0-9+.-]*:\/\//i.test(text) && matchesFormat(FORMATS.uri, text)
    : matchesFormat(FORMATS[name], text);

const DRAFT_URIS = {
  'draft-04': 'http://json-schema.org/draft-04/schema#',
  'draft-06': 'http://json-schema.org/draft-06/schema#',
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
};

const isIdentifier = (key) => /^[A-Za-z_$][\w$]*$/.test(key);
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

// What the samples show at one position.
const newNode = () => ({
  null: false,
  boolean: false,
  integer: false,
  number: false,
  string: null,
  array: null,
  object: null,
});

function add(node, value, path) {
  if (value === null) {
    node.null = true;
  } else if (typeof value === 'boolean') {
    node.boolean = true;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot infer a schema: ${value} at ${path || 'the value'} is not a JSON value`);
    }
    node[Number.isInteger(value) ? 'integer' : 'number'] = true;
  } else if (typeof value === 'string') {
    node.string = node.string || { formats: FORMAT_CANDIDATES };
    node.string.formats = node.string.formats.filter((name) => matchesCandidate(name, value));
  } else if (Array.isArray(value)) {
    node.array = node.array || { items: null };
    value.forEach((item, index) => {
      node.array.items = node.array.items || newNode();
      add(node.array.items, item, `${path}[${index}]`);
    });
  } else if (isPlainObject(value)) {
    node.object = node.object || { count: 0, keys: new Map() };
    node.object.count += 1;
    Object.keys(value).forEach((key) => {
      // A key whose value is undefined (in JavaScript samples) is taken as absent, as JSON leaves it out.
      if (value[key] === undefined) {
        return;
      }
      if (!node.object.keys.has(key)) {
        node.object.keys.set(key, { node: newNode(), count: 0 });
      }
      const entry = node.object.keys.get(key);
      entry.count += 1;
      add(entry.node, value[key], path ? `${path}.${key}` : key);
    });
  } else {
    const what = value instanceof Date ? 'a Date (use its ISO string)' : `a ${typeof value}`;
    throw new Error(`Cannot infer a schema: ${path || 'the value'} is ${what}, not a JSON value`);
  }
}

function optionsOf(options) {
  const { closed = false, formats = true, draft = '2020-12' } = options;
  if (!Object.prototype.hasOwnProperty.call(DRAFT_URIS, draft)) {
    throw new Error(`Unsupported option "draft": "${draft}" is not one of ${Object.keys(DRAFT_URIS).join(', ')}`);
  }
  return { closed: closed === true, formats: formats !== false, draft };
}

function modelOf(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('Cannot infer a schema: expected a non-empty array of sample values');
  }
  const root = newNode();
  samples.forEach((sample) => add(root, sample, ''));
  return root;
}

// The JSON types a node holds, without null, in the order they are written.
function typesOf(node) {
  const types = [];
  if (node.object) types.push('object');
  if (node.array) types.push('array');
  if (node.string) types.push('string');
  if (node.number) types.push('number');
  else if (node.integer) types.push('integer');
  if (node.boolean) types.push('boolean');
  return types;
}

const formatOf = (node, options) => (options.formats && node.string.formats[0]) || undefined;

function toJsonSchema(node, options) {
  const types = typesOf(node);
  // Only null (or nothing, for the elements of empty arrays): the type is unknown, so anything is accepted.
  if (types.length === 0) {
    return {};
  }
  const allTypes = node.null ? [...types, 'null'] : types;
  const schema = { type: allTypes.length === 1 ? allTypes[0] : allTypes };
  if (node.string && formatOf(node, options)) {
    schema.format = formatOf(node, options);
  }
  if (node.array && node.array.items) {
    schema.items = toJsonSchema(node.array.items, options);
  }
  if (node.object) {
    const keys = [...node.object.keys];
    schema.properties = Object.fromEntries(keys.map(([key, entry]) => [key, toJsonSchema(entry.node, options)]));
    const required = keys.filter(([, entry]) => entry.count === node.object.count).map(([key]) => key);
    if (required.length > 0) {
      schema.required = required;
    }
    if (options.closed) {
      schema.additionalProperties = false;
    }
  }
  return schema;
}

// A JSON Schema that accepts every sample. Options: closed (additionalProperties: false on objects), formats (detect
// formats, default true) and draft (the "$schema" written, default '2020-12').
function inferJsonSchema(samples, options = {}) {
  const settings = optionsOf(options);
  return { $schema: DRAFT_URIS[settings.draft], ...toJsonSchema(modelOf(samples), settings) };
}

const quote = (text) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

// The DSL source of a node, with its options (isMandatory, isNullable), noting the names it uses.
function toCode(node, options, extra, indent, used) {
  const pad = ' '.repeat(indent);
  const types = typesOf(node);
  const settings = [...extra];
  const use = (name) => {
    used.add(name);
    return name;
  };
  const call = (name, own = []) => {
    const all = [...own, ...settings];
    return `${use(name)}(${all.length ? `{ ${all.join(', ')} }` : ''})`;
  };
  if (types.length === 0) {
    return call('Any', ['isNullable: true']);
  }
  if (node.null) {
    settings.push('isNullable: true');
  }
  const codeOf = (type, own) => {
    switch (type) {
      case 'string': {
        const format = formatOf(node, options);
        return call('String', [...own, ...(format ? [`format: ${quote(format)}`] : [])]);
      }
      case 'integer':
        return call('Integer', own);
      case 'number':
        return call('Float', own);
      case 'boolean':
        return call('Boolean', own);
      case 'array': {
        const { items } = node.array;
        const typeOption = items ? [`type: ${toCode(items, options, [], indent, used)}`] : [];
        return call('ArrayOf', [...typeOption, ...own]);
      }
      default: {
        const name = use(options.closed ? 'ClosedSchema' : 'Schema');
        const entries = [...node.object.keys].map(([key, entry]) => {
          const optional = entry.count === node.object.count ? [] : ['isMandatory: false'];
          const value = toCode(entry.node, options, optional, indent + 2, used);
          return `${pad}  ${isIdentifier(key) ? key : quote(key)}: ${value},`;
        });
        const body = entries.length ? `{\n${entries.join('\n')}\n${pad}}` : '{}';
        const all = [...own, ...settings];
        return `new ${name}(${body}${all.length ? `, { ${all.join(', ')} }` : ''})`;
      }
    }
  };
  if (types.length === 1) {
    return codeOf(types[0], []);
  }
  // Several types: each one mandatory and not null, the combination takes the options.
  const inner = types.map((type) => toCode({ ...newNode(), [type]: node[type] }, options, [], indent + 2, used));
  return call('AnyOf', [`types: [${inner.join(', ')}]`]);
}

// The same schema as inferJsonSchema(), as the source of a JavaScript module using the DSL. Options: closed and
// formats, as there; name (of the variable, default 'schema'); module: 'commonjs' (default), 'esm' or 'none' (the
// import line).
function inferSchemaCode(samples, options = {}) {
  const settings = optionsOf(options);
  const { name = 'schema', module = 'commonjs' } = options;
  if (!isIdentifier(name)) {
    throw new Error(`Unsupported option "name": "${name}" is not a JavaScript identifier`);
  }
  if (!['commonjs', 'esm', 'none'].includes(module)) {
    throw new Error(`Unsupported option "module": "${module}" is not one of commonjs, esm, none`);
  }
  const used = new Set();
  const code = toCode(modelOf(samples), settings, [], 0, used);
  const names = [...used].sort().join(', ');
  const header = {
    commonjs: `const { ${names} } = require('@xufa/schema');\n\n`,
    esm: `import { ${names} } from '@xufa/schema';\n\n`,
    none: '',
  }[module];
  return `${header}const ${name} = ${code};\n`;
}

module.exports = { inferJsonSchema, inferSchemaCode };

},
"@xufa/schema/lib/json-schema-refs.js": function (module, exports, require) {
// Resolution of JSON Schema references: JSON pointers ("#/definitions/a"), "$id" base URI changes, and anchors ("#foo":
// "$id" fragments, and from draft 2019-09 on "$anchor" and "$dynamicAnchor"), within the schema and within other
// documents registered by URI. Nothing is loaded from the network: a reference to a document that is not registered
// does not resolve. It also records the dynamic anchors of each resource ("$dynamicAnchor", and "$recursiveAnchor": true
// on a resource root as an anchor without name), which dynamic references look up in the resources being evaluated.

// Base URI of a document without "$id".
const DEFAULT_BASE = 'xufa-schema://schema/root.json';

// Keywords whose value is a subschema, a map of subschemas or a list of subschemas, where "$id" can appear.
const SCHEMA_KEYWORDS = [
  'additionalItems',
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'contentSchema',
  'unevaluatedItems',
  'unevaluatedProperties',
];
const SCHEMA_MAP_KEYWORDS = [
  'definitions',
  '$defs',
  'dependencies',
  'dependentSchemas',
  'patternProperties',
  'properties',
];
const SCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'items', 'oneOf', 'prefixItems'];
// For each keyword with schemas inside, its place in the order visit() goes through them (the keywords of one schema,
// then those of maps of schemas, then those of lists), so a node is visited by reading its own keys once.
const CHILD_ORDER = Object.create(null);
SCHEMA_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = i;
});
SCHEMA_MAP_KEYWORDS.forEach((keyword, i) => {
  CHILD_ORDER[keyword] = SCHEMA_KEYWORDS.length + i;
});
const LIST_ORDER = Object.create(null);
SCHEMA_LIST_KEYWORDS.forEach((keyword, i) => {
  LIST_ORDER[keyword] = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length + i;
});
const MAP_START = SCHEMA_KEYWORDS.length;
const LIST_START = SCHEMA_KEYWORDS.length + SCHEMA_MAP_KEYWORDS.length;

// Drafts where every keyword next to "$ref" is ignored, "$id" included.
const LEGACY_DRAFTS = ['draft-04', 'draft-06', 'draft-07'];
const isLegacy = (draft) => LEGACY_DRAFTS.includes(draft);

// The keyword that changes the base URI: "id" in draft-04, "$id" later.
const idKeyword = (draft) => (draft === 'draft-04' ? 'id' : '$id');

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function resolveUri(ref, base) {
  try {
    return new URL(ref, base).href;
  } catch (e) {
    return undefined;
  }
}

function splitFragment(uri) {
  const index = uri.indexOf('#');
  return index === -1 ? [uri, ''] : [uri.slice(0, index), uri.slice(index + 1)];
}

function decode(text) {
  try {
    return decodeURIComponent(text);
  } catch (e) {
    return undefined;
  }
}

// Follows a JSON pointer ("/a/b~1c/0") from a node; undefined when a token is missing.
function followPointer(node, pointer) {
  const tokens = pointer
    .split('/')
    .slice(1)
    .map((token) => token.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = node;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (Array.isArray(current) && /^(0|[1-9][0-9]*)$/.test(token)) {
      current = current[Number(token)];
    } else if (current !== null && typeof current === 'object' && !Array.isArray(current) && hasOwn(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

// Documents to register, from { uri: schema } or [schema with "$id"], without a fragment other than an empty one
// ("http://json-schema.org/draft-07/schema#"). A relative URI ("address", as Fastify and ajv allow) is resolved against
// the base URI of a schema without "$id", so "$ref": "address#" in such a schema reaches it.
function documentsOf(schemas) {
  if (schemas === undefined) {
    return [];
  }
  let entries;
  if (Array.isArray(schemas)) {
    entries = schemas.map((schema) => [schema && (typeof schema.$id === 'string' ? schema.$id : schema.id), schema]);
  } else if (isObject(schemas)) {
    entries = Object.entries(schemas);
  } else {
    throw new Error('Unsupported JSON Schema option "schemas": expected an object of schemas by URI or an array');
  }
  return entries.map(([uri, schema]) => {
    const absolute = typeof uri === 'string' && uri !== '' ? resolveUri(uri, DEFAULT_BASE) : undefined;
    const [document, fragment] = absolute === undefined ? [] : splitFragment(absolute);
    if (absolute === undefined || fragment !== '') {
      throw new Error(`Unsupported JSON Schema option "schemas": "${uri}" is not a URI without fragment`);
    }
    return { uri: document, schema };
  });
}

// Drafts by the "$schema" URI (without its empty fragment) that selects them.
const DRAFT_URIS = {
  'http://json-schema.org/draft-04/schema': 'draft-04',
  'https://json-schema.org/draft-04/schema': 'draft-04',
  'http://json-schema.org/draft-06/schema': 'draft-06',
  'https://json-schema.org/draft-06/schema': 'draft-06',
  'http://json-schema.org/draft-07/schema': 'draft-07',
  'https://json-schema.org/draft-07/schema': 'draft-07',
  'https://json-schema.org/draft/2019-09/schema': '2019-09',
  'http://json-schema.org/draft/2019-09/schema': '2019-09',
  'https://json-schema.org/draft/2020-12/schema': '2020-12',
  'http://json-schema.org/draft/2020-12/schema': '2020-12',
};

// The draft a "$schema" names, or undefined.
function draftOfUri(uri) {
  return typeof uri === 'string' ? DRAFT_URIS[uri.replace(/#$/, '')] : undefined;
}

// Keywords of the vocabularies of drafts 2019-09 and 2020-12 that a meta-schema can leave out with "$vocabulary".
// The others (core, meta-data, format, content) always apply or are annotations.
const VOCABULARY_KEYWORDS = {
  validation: [
    'type',
    'enum',
    'const',
    'multipleOf',
    'maximum',
    'exclusiveMaximum',
    'minimum',
    'exclusiveMinimum',
    'maxLength',
    'minLength',
    'pattern',
    'maxItems',
    'minItems',
    'uniqueItems',
    'maxContains',
    'minContains',
    'maxProperties',
    'minProperties',
    'required',
    'dependentRequired',
  ],
  applicator: [
    'prefixItems',
    'items',
    'additionalItems',
    'contains',
    'additionalProperties',
    'properties',
    'patternProperties',
    'dependentSchemas',
    'propertyNames',
    'if',
    'then',
    'else',
    'allOf',
    'anyOf',
    'oneOf',
    'not',
  ],
  unevaluated: ['unevaluatedItems', 'unevaluatedProperties'],
};
const KNOWN_VOCABULARIES = [
  'core',
  'applicator',
  'unevaluated',
  'validation',
  'meta-data',
  'format',
  'format-annotation',
  'format-assertion',
  'content',
];

// The keywords a "$vocabulary" of `draft` leaves out: the ones of the vocabularies it does not list. In 2019-09 the
// unevaluated keywords belong to the applicator vocabulary. An unknown vocabulary is ignored when it is optional
// (false), and throws when it is required.
function ignoredKeywords(vocabulary, draft) {
  const prefix = `https://json-schema.org/draft/${draft}/vocab/`;
  const listed = new Set();
  Object.entries(vocabulary).forEach(([uri, isRequired]) => {
    const name = uri.startsWith(prefix) ? uri.slice(prefix.length) : undefined;
    if (name !== undefined && KNOWN_VOCABULARIES.includes(name)) {
      listed.add(name);
    } else if (isRequired === true) {
      throw new Error(`Unsupported JSON Schema: the meta-schema requires the vocabulary "${uri}"`);
    }
  });
  const ignored = new Set();
  Object.entries(VOCABULARY_KEYWORDS).forEach(([name, keywords]) => {
    const owner = draft === '2019-09' && name === 'unevaluated' ? 'applicator' : name;
    if (!listed.has(owner)) {
      keywords.forEach((keyword) => ignored.add(keyword));
    }
  });
  return ignored;
}

class RefIndex {
  // `draft` is the one of the root (by default the one its "$schema" names), and of the resources that name none and
  // are not inside one that does.
  constructor(root, schemas = undefined, draft = undefined) {
    this.root = root;
    // Other documents, by URI: resolved against the URI they are registered with, unless they change it with "$id".
    const documents = documentsOf(schemas);
    // Meta-schemas that "$schema" can name, which give a draft and vocabularies.
    this.documents = new Map(documents.map(({ uri, schema }) => [uri, schema]));
    this.rootDialect = draft === undefined ? this.dialectOf(root.$schema) || { draft: 'draft-07' } : { draft };
    this.draft = this.rootDialect.draft;
    // Resource URI to its dialect: { draft, ignored } with the keywords its vocabularies leave out.
    this.dialects = new Map();
    // Documents (URIs without fragment) and anchors ("uri#name") to their schema node.
    this.resources = new Map([[DEFAULT_BASE, root]]);
    this.anchors = new Map();
    // Resource URI to its dynamic anchors: name ('' for "$recursiveAnchor") to schema node.
    this.dynamicAnchors = new Map();
    // Schema node to the base URI its references are resolved against.
    this.bases = new Map();
    // Schema node to the dialect of its resource, which the conversion asks for every node.
    this.nodeDialects = new Map();
    // Schema node to the copy of it without the keywords its vocabularies leave out.
    this.views = new Map();
    this.visit(root, DEFAULT_BASE);
    documents.forEach(({ uri, schema }) => {
      this.addResource(uri, schema);
      this.visit(schema, uri);
    });
  }

  // The dialect "$schema" names: a draft, or a meta-schema of the "schemas" option with the draft its own "$schema"
  // names and the keywords its "$vocabulary" leaves out. Undefined when it names neither.
  dialectOf(schemaUri) {
    const draft = draftOfUri(schemaUri);
    if (draft !== undefined) {
      return { draft };
    }
    const meta = typeof schemaUri === 'string' ? this.documents.get(schemaUri.replace(/#$/, '')) : undefined;
    const metaDraft = isObject(meta) ? draftOfUri(meta.$schema) : undefined;
    if (metaDraft === undefined) {
      return undefined;
    }
    const hasVocabulary = !isLegacy(metaDraft) && isObject(meta.$vocabulary);
    return {
      draft: metaDraft,
      ignored: hasVocabulary ? ignoredKeywords(meta.$vocabulary, metaDraft) : undefined,
    };
  }

  // The node as its vocabularies see it: a copy without the keywords they leave out, or the node itself.
  viewOf(node) {
    const dialect = this.nodeDialects.get(node);
    const ignored = dialect && dialect.ignored;
    if (!ignored || !Object.keys(node).some((keyword) => ignored.has(keyword))) {
      return node;
    }
    if (!this.views.has(node)) {
      this.views.set(node, Object.fromEntries(Object.entries(node).filter(([keyword]) => !ignored.has(keyword))));
    }
    return this.views.get(node);
  }

  // Whether the vocabularies of the resource of a node leave out keywords (then viewOf() gives a copy without them).
  ignoresKeywords(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect !== undefined && dialect.ignored !== undefined;
  }

  // The first document registered for a URI keeps it.
  addResource(uri, node) {
    if (!this.resources.has(uri)) {
      this.resources.set(uri, node);
    }
  }

  addDynamicAnchor(uri, name, node) {
    if (!this.dynamicAnchors.has(uri)) {
      this.dynamicAnchors.set(uri, new Map());
    }
    const anchors = this.dynamicAnchors.get(uri);
    if (!anchors.has(name)) {
      anchors.set(name, node);
    }
  }

  // Dynamic anchors of a resource, by name.
  dynamicAnchorsOf(uri) {
    return this.dynamicAnchors.get(uri) || new Map();
  }

  // URI of the resource a node belongs to, or undefined for a node that is not indexed.
  resourceOf(node) {
    return this.bases.get(node);
  }

  // Draft of the resource a node belongs to, or undefined for a node that is not indexed.
  draftOf(node) {
    const dialect = this.nodeDialects.get(node);
    return dialect && dialect.draft;
  }

  addAnchor(anchor, node) {
    if (!this.anchors.has(anchor)) {
      this.anchors.set(anchor, node);
    }
  }

  // Indexes a node and the schemas inside it. `parentDialect` is the dialect of the resource around it; a resource
  // that names another with "$schema" uses it (the root uses the one it was given).
  visit(node, parentBase, parentDialect = this.dialects.get(parentBase) || this.rootDialect) {
    if (!isObject(node) || this.bases.has(node)) {
      return;
    }
    // A node may name a dialect with "$schema" (rarely: most take the one around them).
    let dialect = parentDialect;
    if (node === this.root) dialect = this.rootDialect;
    else if (node.$schema !== undefined) dialect = this.dialectOf(node.$schema) || parentDialect;
    const { draft } = dialect;
    let base = parentBase;
    // Up to draft-07 every keyword next to "$ref" is ignored, "$id" included.
    const id = node[idKeyword(draft)];
    if (typeof id === 'string' && (node.$ref === undefined || !isLegacy(draft))) {
      const uri = resolveUri(id, parentBase);
      if (uri !== undefined) {
        const [document, fragment] = splitFragment(uri);
        const anchor = `${document}#${decode(fragment)}`;
        if (fragment === '') {
          base = document;
          this.addResource(document, node);
        } else {
          this.addAnchor(anchor, node);
        }
      }
    }
    if (!this.dialects.has(base)) {
      this.dialects.set(base, dialect);
    }
    // Anchors of the later drafts name the node within the resource of its base URI.
    if (!isLegacy(draft) && typeof node.$anchor === 'string') {
      this.addAnchor(`${base}#${node.$anchor}`, node);
    }
    if (draft === '2020-12' && typeof node.$dynamicAnchor === 'string') {
      this.addAnchor(`${base}#${node.$dynamicAnchor}`, node);
      this.addDynamicAnchor(base, node.$dynamicAnchor, node);
    }
    if (draft === '2019-09' && node.$recursiveAnchor === true && this.resources.get(base) === node) {
      this.addDynamicAnchor(base, '', node);
    }
    this.bases.set(node, base);
    this.nodeDialects.set(node, this.dialects.get(base));
    // Every node of every schema goes through here when compiling: its own keys are read once, and those with schemas
    // inside are visited in the order of CHILD_ORDER (schemas, maps of them, lists of them).
    const keys = Object.keys(node);
    let children;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = node[key];
      // "items" is a schema, or a list of them (draft-07 tuples).
      const order = Array.isArray(value) ? LIST_ORDER[key] : CHILD_ORDER[key];
      if (order !== undefined) {
        if (children === undefined) children = [];
        children.push(order, key);
      }
    }
    if (children === undefined) {
      return;
    }
    if (children.length > 2) {
      const pairs = [];
      for (let i = 0; i < children.length; i += 2) pairs.push([children[i], children[i + 1]]);
      pairs.sort((a, b) => a[0] - b[0]);
      children = pairs.flat();
    }
    for (let i = 0; i < children.length; i += 2) {
      const order = children[i];
      const value = node[children[i + 1]];
      if (order < MAP_START) {
        this.visit(value, base, dialect);
      } else if (order < LIST_START) {
        if (isObject(value)) {
          const mapKeys = Object.keys(value);
          for (let j = 0; j < mapKeys.length; j += 1) {
            this.visit(value[mapKeys[j]], base, dialect);
          }
        }
      } else {
        for (let j = 0; j < value.length; j += 1) {
          this.visit(value[j], base, dialect);
        }
      }
    }
  }

  // The document `ref`, resolved against the base URI of `node`, points to when it is not registered: the one to load
  // for it to resolve. Undefined when it is registered, or relative to a document without "$id".
  missingDocument(node, ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === undefined) {
      return undefined;
    }
    const [document] = splitFragment(uri);
    const isKnown = this.resources.has(document) || new URL(document).protocol === new URL(DEFAULT_BASE).protocol;
    return isKnown ? undefined : document;
  }

  // Schema node that `ref` (by default the "$ref" of `node`), resolved against the base URI of `node`, points to, or
  // undefined when it is not in this document.
  resolve(node, ref = node.$ref) {
    const uri = resolveUri(ref, this.bases.get(node) ?? DEFAULT_BASE);
    if (uri === undefined) {
      return undefined;
    }
    const [document, rawFragment] = splitFragment(uri);
    const fragment = decode(rawFragment);
    if (fragment === undefined) {
      return undefined;
    }
    let target;
    if (fragment === '' || fragment.startsWith('/')) {
      const resource = this.resources.get(document);
      target = resource === undefined ? undefined : followPointer(resource, fragment);
      if (target !== undefined) {
        // A pointer can reach a node that was not indexed as a schema; its references resolve against the document.
        this.visit(target, document);
      }
    } else {
      target = this.anchors.get(`${document}#${fragment}`);
    }
    return target;
  }
}

module.exports = {
  RefIndex,
  draftOfUri,
  isLegacy,
  documentsOf,
};

},
"@xufa/schema/lib/json-schema.js": function (module, exports, require) {
const { Schema } = require('./schema');
const { compileType } = require('./compile');
const { RefIndex, isLegacy, documentsOf } = require('./json-schema-refs');
const { mergePatch, applyPatch } = require('./merge-patch');
const { UnevaluatedType } = require('./unevaluated');
const { KeywordType, KEYWORD_TYPE_TESTS } = require('./types/keyword');
const { CoerceType, COERCIBLE, coerceSpecOf } = require('./coerce');
const { FORMATS, FORMAT_COMPARES, isRfc1123Hostname } = require('./formats');

const {
  AllOfType,
  AnyOfType,
  AnyType,
  ArrayOfType,
  BooleanType,
  ConditionalType,
  FloatType,
  IntegerType,
  NeverType,
  NotType,
  OneOfType,
  RefType,
  StringType,
  ValuesType,
  WhenType,
} = require('./types');

const DRAFTS = ['draft-04', 'draft-06', 'draft-07', '2019-09', '2020-12'];

const ANNOTATIONS = [
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'format',
  'readOnly',
  'writeOnly',
  'deprecated',
  'nullable',
  'contentMediaType',
  'contentEncoding',
  'contentSchema',
  // Only used through "$ref"; "$defs" is also accepted in draft-07.
  'definitions',
  '$defs',
];

// Keywords that only exist in some drafts, as annotations or checked by the code below: "id" changes the base URI in
// draft-04, as "$id" does later.
const ANNOTATIONS_04 = ['id'];
const ANNOTATIONS_2019 = ['$anchor', '$vocabulary', '$recursiveAnchor'];
const ANNOTATIONS_2020 = ['$dynamicAnchor'];

// Keywords of the later drafts that are not supported yet: they throw rather than being ignored.
const NOT_SUPPORTED_YET = [];

// Keywords that reference another schema, in each draft: "$recursiveRef" (2019-09) and "$dynamicRef" (2020-12) pick
// their target among the schema resources being evaluated (see resolveTarget()).
const REF_KEYWORDS = {
  'draft-04': ['$ref'],
  'draft-06': ['$ref'],
  'draft-07': ['$ref'],
  '2019-09': ['$ref', '$recursiveRef'],
  '2020-12': ['$ref', '$dynamicRef'],
};

// Keywords that exist only in some drafts, with the drafts that have them.
const DRAFT_KEYWORDS = {
  const: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  contains: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  propertyNames: ['draft-06', 'draft-07', '2019-09', '2020-12'],
  if: ['draft-07', '2019-09', '2020-12'],
  then: ['draft-07', '2019-09', '2020-12'],
  else: ['draft-07', '2019-09', '2020-12'],
  additionalItems: ['draft-04', 'draft-06', 'draft-07', '2019-09'],
  dependentRequired: ['2019-09', '2020-12'],
  dependentSchemas: ['2019-09', '2020-12'],
  minContains: ['2019-09', '2020-12'],
  maxContains: ['2019-09', '2020-12'],
  prefixItems: ['2020-12'],
  unevaluatedProperties: ['2019-09', '2020-12'],
  unevaluatedItems: ['2019-09', '2020-12'],
};

const TYPED_KEYWORDS = {
  properties: 'object',
  patternProperties: 'object',
  dependencies: 'object',
  propertyNames: 'object',
  dependentRequired: 'object',
  dependentSchemas: 'object',
  contains: 'array',
  minContains: 'array',
  maxContains: 'array',
  prefixItems: 'array',
  additionalItems: 'array',
  unevaluatedItems: 'array',
  required: 'object',
  additionalProperties: 'object',
  unevaluatedProperties: 'object',
  minProperties: 'object',
  maxProperties: 'object',
  items: 'array',
  minItems: 'array',
  maxItems: 'array',
  uniqueItems: 'array',
  minLength: 'string',
  maxLength: 'string',
  pattern: 'string',
  minimum: 'number',
  maximum: 'number',
  exclusiveMinimum: 'number',
  exclusiveMaximum: 'number',
  multipleOf: 'number',
  // Of ajv-formats: limits of the values of a format that can be compared (see formatLimitsOf()).
  formatMinimum: 'string',
  formatMaximum: 'string',
  formatExclusiveMinimum: 'string',
  formatExclusiveMaximum: 'string',
};

const FORMAT_LIMIT_KEYWORDS = ['formatMinimum', 'formatMaximum', 'formatExclusiveMinimum', 'formatExclusiveMaximum'];

const UNTYPED_KEYWORDS = [
  'type',
  'enum',
  'const',
  'anyOf',
  'oneOf',
  'not',
  'allOf',
  'if',
  'then',
  'else',
  // OpenAPI: which "oneOf" schema applies, by the value of a property (see discriminatorOf()).
  'discriminator',
];

const TYPE_NAMES = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];

// State of the conversion in progress: the draft, the reference index of the document, the types converted for
// reference targets, and the references still to resolve.
let context;

function getTypeNames(json) {
  if (json.type === undefined) {
    return [];
  }
  return Array.isArray(json.type) ? json.type : [json.type];
}

// For each draft, its standard annotations and the keywords that check something (reference keywords are handled
// apart), as sets: every keyword of every node is looked up in them.
const ANNOTATIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set([
      ...ANNOTATIONS,
      ...(draft === 'draft-04' ? ANNOTATIONS_04 : []),
      ...(isLegacy(draft) ? [] : ANNOTATIONS_2019),
      ...(draft === '2020-12' ? ANNOTATIONS_2020 : []),
    ]),
  ])
);
const ASSERTIONS_OF = Object.fromEntries(
  DRAFTS.map((draft) => [
    draft,
    new Set(
      [...Object.keys(TYPED_KEYWORDS), ...UNTYPED_KEYWORDS].filter(
        (keyword) => !DRAFT_KEYWORDS[keyword] || DRAFT_KEYWORDS[keyword].includes(draft)
      )
    ),
  ])
);

// Whether a keyword is an annotation in `draft`: one of the standard ones, or one the option "keywords" declares.
function isAnnotation(keyword, draft) {
  return ANNOTATIONS_OF[draft].has(keyword) || context.annotations.has(keyword);
}

// Whether a keyword checks something in `draft`: a standard one, or one of your own (the option "keywords").
function isAssertion(keyword, draft) {
  return ASSERTIONS_OF[draft].has(keyword) || context.custom.has(keyword);
}

// Whether a keyword is ignored in `draft`: an annotation, or with strict: false one that checks nothing in it (an
// unknown keyword, or one of another draft), as the JSON Schema standard reads it.
function isIgnored(keyword, draft) {
  return isAnnotation(keyword, draft) || (!context.strict && !isAssertion(keyword, draft));
}

function checkKeywords(json, path) {
  const typeNames = getTypeNames(json);
  typeNames.forEach((typeName) => {
    if (!TYPE_NAMES.includes(typeName)) {
      throw new Error(`Unsupported JSON Schema type "${typeName}" at ${path}`);
    }
  });
  // With the option "formats", a format it does not name is most likely a mistake, as in ajv's strict mode.
  if (
    context.strict &&
    context.knownFormats &&
    typeof json.format === 'string' &&
    !context.knownFormats.has(json.format)
  ) {
    throw new Error(
      `Unknown JSON Schema format "${json.format}" at ${path}: name it in the option "formats" ({ "${json.format}": false } leaves it unchecked), or use strict: false`
    );
  }
  const { draft } = context;
  Object.keys(json).forEach((keyword) => {
    if (isIgnored(keyword, draft)) {
      return;
    }
    if (NOT_SUPPORTED_YET.includes(keyword)) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} is not supported yet`);
    }
    if (!isAssertion(keyword, draft)) {
      throw new Error(`Unsupported JSON Schema keyword "${keyword}" at ${path}`);
    }
    // Without "type" a keyword only applies to values of its type. With a "type" that excludes it, the keyword could
    // never apply, which is most likely a mistake (with strict: false it is ignored, as the standard says).
    const requiredType = TYPED_KEYWORDS[keyword];
    const isDeclared = typeNames.includes(requiredType) || (requiredType === 'number' && typeNames.includes('integer'));
    if (requiredType && context.strict && typeNames.length > 0 && !isDeclared) {
      throw new Error(`JSON Schema keyword "${keyword}" at ${path} requires "type": "${requiredType}"`);
    }
  });
}

// The draft of a schema: options.draft, or the one its "$schema" names. Without either, or with another "$schema",
// the schema is read as draft-07, as before later drafts were supported.
// The formats to check, from the option "formats": true for every built-in one, a list of built-in names, or an object
// with, for each name, true (the built-in one), a regular expression, a function, or false (a format that is known but
// not checked, as ajv's addFormat(name, true)). By name, the check: a function or a regular expression. Without the
// option, "format" is an annotation and nothing is checked.
// Also { checks, compares, known }: the comparisons of the formats whose values can be compared (the built-in date,
// time and date-time, and formats of your own given as { validate, compare }), for formatMinimum and the like; and
// with the option, the names it gives, checked or not (with strict: true another format throws).
function formatsOf(option) {
  const checks = new Map();
  const compares = new Map();
  if (option === undefined || option === false) {
    return { checks, compares, known: undefined };
  }
  const known = new Set();
  const isCheck = (check) => check instanceof RegExp || typeof check === 'function';
  const addBuiltIn = (name) => {
    if (!Object.prototype.hasOwnProperty.call(FORMATS, name)) {
      throw new Error(
        `Unsupported JSON Schema option "formats": "${name}" is not one of ${Object.keys(FORMATS).join(', ')}`
      );
    }
    checks.set(name, FORMATS[name]);
    if (FORMAT_COMPARES[name]) {
      compares.set(name, FORMAT_COMPARES[name]);
    }
  };
  if (option === true) {
    Object.keys(FORMATS).forEach(addBuiltIn);
  } else if (Array.isArray(option)) {
    option.forEach(addBuiltIn);
  } else if (option !== null && typeof option === 'object') {
    Object.entries(option).forEach(([name, check]) => {
      if (check === true) {
        addBuiltIn(name);
      } else if (isCheck(check)) {
        checks.set(name, check);
      } else if (check !== null && typeof check === 'object' && isCheck(check.validate)) {
        if (check.compare !== undefined && typeof check.compare !== 'function') {
          throw new Error(`Unsupported JSON Schema option "formats": the "compare" of "${name}" must be a function`);
        }
        checks.set(name, check.validate);
        if (check.compare) {
          compares.set(name, check.compare);
        }
      } else if (check !== false) {
        throw new Error(
          `Unsupported JSON Schema option "formats": "${name}" must be true, false, a regular expression, a function or { validate, compare }`
        );
      }
      known.add(name);
    });
  } else {
    throw new Error('Unsupported JSON Schema option "formats": expected true, a list of names or an object');
  }
  checks.forEach((check, name) => known.add(name));
  return { checks, compares, known };
}

// Every built-in format, as the option "formats" takes them ({ date: true, ... }), to add formats of your own or known
// ones left unchecked: formats: { ...builtInFormats(), int32: false }.
function builtInFormats() {
  return Object.fromEntries(Object.keys(FORMATS).map((name) => [name, true]));
}

// The limits of the value of the format of a node (formatMinimum, formatMaximum, formatExclusiveMinimum and
// formatExclusiveMaximum, of ajv-formats) as [{ keyword, limit, compare }]. As in ajv they need "format", and are
// checked only when the format is (else they are ignored, like it), which must then be one whose values can be
// compared. A limit must be a valid value of the format.
function formatLimitsOf(json, check, path) {
  return FORMAT_LIMIT_KEYWORDS.filter((keyword) => json[keyword] !== undefined).flatMap((keyword) => {
    const at = `Unsupported JSON Schema at ${path}: "${keyword}"`;
    if (json.format === undefined) {
      throw new Error(`${at} requires "format"`);
    }
    if (check === undefined) {
      return [];
    }
    const compare = context.formatCompares.get(json.format);
    if (compare === undefined) {
      throw new Error(`${at}: the values of the format "${json.format}" cannot be compared`);
    }
    const limit = json[keyword];
    const isValue = typeof limit === 'string' && (check instanceof RegExp ? check.test(limit) : check(limit));
    if (!isValue) {
      throw new Error(`${at} must be a valid ${json.format}`);
    }
    return [{ keyword, limit, compare }];
  });
}

// The format a node asks the strings to have, as options of StringType: none when "format" is not checked (the option
// "formats" does not name it, as with an unknown format, which is an annotation).
function formatOf(json, path) {
  let check = typeof json.format === 'string' ? context.formats.get(json.format) : undefined;
  // Up to draft-06 a host name follows RFC 1123 alone.
  if (check === FORMATS.hostname && (context.draft === 'draft-04' || context.draft === 'draft-06')) {
    check = isRfc1123Hostname;
  }
  const formatLimits = formatLimitsOf(json, check, path);
  return check === undefined ? {} : { format: json.format, formatCheck: check, formatLimits };
}

function draftOf(options) {
  if (options.draft !== undefined && !DRAFTS.includes(options.draft)) {
    throw new Error(`Unsupported JSON Schema option "draft": "${options.draft}" is not one of ${DRAFTS.join(', ')}`);
  }
  return options.draft;
}

// The option "useDefaults": true assigns the "default" of missing properties and tuple elements, 'empty' also the one
// of null and '' (see collectDefaults()).
function useDefaultsOf(options) {
  const { useDefaults = false } = options;
  if (useDefaults !== true && useDefaults !== false && useDefaults !== 'empty') {
    throw new Error('Unsupported JSON Schema option "useDefaults": expected true, false or \'empty\'');
  }
  return useDefaults;
}

// The option "multipleOfPrecision": a number of decimal digits; "multipleOf" then accepts a value whose division is
// within 1e-multipleOfPrecision of an integer, so 0.3 is a multiple of 0.1 (see FloatType.isMultiple()).
function multipleOfPrecisionOf(options) {
  const { multipleOfPrecision } = options;
  if (multipleOfPrecision !== undefined && !(Number.isInteger(multipleOfPrecision) && multipleOfPrecision > 0)) {
    throw new Error('Unsupported JSON Schema option "multipleOfPrecision": expected a positive integer');
  }
  return multipleOfPrecision;
}

// The option "coerceTypes": true converts values to the types "type" asks for (see coerce.js), 'array' also to and from
// arrays.
function coerceTypesOf(options) {
  const { coerceTypes = false } = options;
  if (coerceTypes !== true && coerceTypes !== false && coerceTypes !== 'array') {
    throw new Error('Unsupported JSON Schema option "coerceTypes": expected true, false or \'array\'');
  }
  return coerceTypes;
}

// The option "removeAdditional": true removes the additional properties where "additionalProperties" is false, 'all'
// every additional property of a schema with "properties" or "additionalProperties", and 'failing' also the ones that
// fail "additionalProperties" (see removalOf()).
function removeAdditionalOf(options) {
  const { removeAdditional = false } = options;
  if (![true, false, 'all', 'failing'].includes(removeAdditional)) {
    throw new Error("Unsupported JSON Schema option \"removeAdditional\": expected true, false, 'all' or 'failing'");
  }
  return removeAdditional;
}

// The option "strict": true (default) throws on unknown keywords, false ignores them.
function strictOf(options) {
  if (options.strict !== undefined && typeof options.strict !== 'boolean') {
    throw new Error('Unsupported JSON Schema option "strict": expected true or false');
  }
  return options.strict !== false;
}

// Every keyword of JSON Schema, which a keyword of your own cannot redefine.
const STANDARD_KEYWORDS = new Set([
  ...DRAFTS.flatMap((draft) => [...ANNOTATIONS_OF[draft], ...ASSERTIONS_OF[draft], ...REF_KEYWORDS[draft]]),
]);
// JSON types the definitions of macro keywords can take: the ones a WhenType tells apart.
const MACRO_TYPES = ['object', 'array', 'string', 'number'];

// A definition of a keyword of your own, checked, with its JSON types as a list (`types`, or undefined for all).
function keywordDefinitionOf(definition) {
  const at = 'Unsupported JSON Schema option "keywords":';
  if (definition === null || typeof definition !== 'object' || typeof definition.keyword !== 'string') {
    throw new Error(`${at} expected keyword names, or definitions with "keyword"`);
  }
  const { keyword, type, message } = definition;
  if (STANDARD_KEYWORDS.has(keyword)) {
    throw new Error(`${at} "${keyword}" is a keyword of JSON Schema`);
  }
  const ways = ['validate', 'compile', 'macro'].filter((way) => definition[way] !== undefined);
  if (ways.length !== 1 || typeof definition[ways[0]] !== 'function') {
    throw new Error(`${at} "${keyword}" needs one function: "validate", "compile" or "macro"`);
  }
  const types = type === undefined ? undefined : [].concat(type);
  const allowed = definition.macro ? MACRO_TYPES : Object.keys(KEYWORD_TYPE_TESTS);
  if (types !== undefined && (types.length === 0 || !types.every((name) => allowed.includes(name)))) {
    throw new Error(`${at} the "type" of "${keyword}" must be one or more of ${allowed.join(', ')}`);
  }
  if (message !== undefined && typeof message !== 'string' && typeof message !== 'function') {
    throw new Error(`${at} the "message" of "${keyword}" must be a string or a function`);
  }
  return { ...definition, types };
}

// The option "keywords": names of keywords of your own that are annotations, such as "x-internal" or "example", and
// definitions of keywords of your own that check values (see keywordDefinitionOf()).
function keywordsOf(options) {
  const { keywords = [] } = options;
  if (!Array.isArray(keywords)) {
    throw new Error('Unsupported JSON Schema option "keywords": expected a list of keyword names or definitions');
  }
  const annotations = new Set();
  const custom = new Map();
  keywords.forEach((item) => {
    if (typeof item === 'string') {
      annotations.add(item);
    } else {
      const definition = keywordDefinitionOf(item);
      custom.set(definition.keyword, definition);
    }
  });
  return { annotations, custom };
}

// The draft of a node: the one of its resource, or the one being converted for a node that is not indexed.
const draftOfNode = (json) => context.index.draftOf(json) || context.draft;

// The reference keywords of a node, in its draft.
const NO_KEYWORDS = [];
const refKeywordsOf = (json) =>
  json.$ref === undefined && json.$dynamicRef === undefined && json.$recursiveRef === undefined
    ? NO_KEYWORDS
    : REF_KEYWORDS[draftOfNode(json)].filter((keyword) => json[keyword] !== undefined);

// The keywords of a node other than its references, which later drafts apply next to them; undefined when there are
// none but ignored ones.
function besideRef(json) {
  const draft = draftOfNode(json);
  const rest = { ...json };
  REF_KEYWORDS[draft].forEach((keyword) => delete rest[keyword]);
  return Object.keys(rest).every((keyword) => isIgnored(keyword, draft)) ? undefined : rest;
}

// The node as the conversion reads it: without the keywords its vocabularies leave out and, with strict: false,
// without the keywords of other drafts, which would otherwise be read (with strict: true they throw).
function viewOf(node) {
  const view = context.index.viewOf(node);
  if (context.strict) {
    return view;
  }
  const draft = draftOfNode(node);
  const isOther = (keyword) => DRAFT_KEYWORDS[keyword] !== undefined && !DRAFT_KEYWORDS[keyword].includes(draft);
  if (!Object.keys(view).some(isOther)) {
    return view;
  }
  if (!context.views.has(node)) {
    context.views.set(node, Object.fromEntries(Object.entries(view).filter(([keyword]) => !isOther(keyword))));
  }
  return context.views.get(node);
}

// Dynamic scope: the schema resources being evaluated, from the outermost. What dynamic references need of it is,
// for each dynamic anchor name, the outermost resource that declares it; a scope holds that, with a key naming it.
// Scopes only grow, and there are few of them, so each schema is converted once for each scope it is reached in.
// A scope also remembers the scope entering each resource gives (`next`), so that is worked out once.
const newScope = (key, anchors) => ({ key, anchors, next: new Map() });

// The scope after entering the resource `uri` (undefined for a node that is not indexed, which changes nothing).
// Without dynamic anchors in the schema, the scope never changes.
function enter(scope, uri) {
  if (uri === undefined) {
    return scope;
  }
  if (!scope.next.has(uri)) {
    const added = [...context.index.dynamicAnchorsOf(uri).keys()].filter((name) => !scope.anchors.has(name));
    if (added.length === 0) {
      scope.next.set(uri, scope);
    } else {
      const anchors = new Map(scope.anchors);
      added.forEach((name) => anchors.set(name, uri));
      const key = [...anchors].map(([name, resource]) => `${name}=${resource}`).join('\n');
      // Scopes with the same anchors are the same scope, whichever way they were reached.
      if (!context.scopes.has(key)) {
        context.scopes.set(key, newScope(key, anchors));
      }
      scope.next.set(uri, context.scopes.get(key));
    }
  }
  return scope.next.get(uri);
}

// The scope after entering the resource of `node`. Without dynamic anchors in the schema, the scope never changes, and
// the resource is not looked up.
const enterNode = (scope, node) =>
  context.index.dynamicAnchors.size === 0 ? scope : enter(scope, context.index.resourceOf(node));

// The name of the anchor a reference points to ("#name" or "uri#name"), or undefined for a JSON pointer or none.
function anchorName(ref) {
  const index = ref.indexOf('#');
  if (index === -1) {
    return undefined;
  }
  const name = ref.slice(index + 1);
  if (name === '' || name.startsWith('/')) {
    return undefined;
  }
  try {
    return decodeURIComponent(name);
  } catch (e) {
    return undefined;
  }
}

// The schema node a reference keyword of `json` points to in `scope`, or undefined when it does not resolve. A
// "$dynamicRef" that first resolves to a "$dynamicAnchor" of the same name, or a "$recursiveRef" that first resolves
// to a resource with "$recursiveAnchor": true, points to the outermost resource of the scope with that anchor.
function resolveTarget(json, keyword, scope) {
  const { index } = context;
  if (keyword === '$ref') {
    return index.resolve(json);
  }
  const initial = index.resolve(json, keyword === '$recursiveRef' ? '#' : json[keyword]);
  const isObject = initial !== null && typeof initial === 'object';
  let name;
  if (keyword === '$dynamicRef') {
    name = anchorName(json.$dynamicRef);
    if (name === undefined || !isObject || initial.$dynamicAnchor !== name) {
      return initial;
    }
  } else {
    name = '';
    if (!isObject || initial.$recursiveAnchor !== true) {
      return initial;
    }
  }
  const resource = scope.anchors.get(name);
  return resource === undefined ? initial : index.dynamicAnchorsOf(resource).get(name);
}

// The keywords of your own a node has.
const customKeywordsOf = (json) =>
  context.custom.size === 0 ? NO_KEYWORDS : Object.keys(json).filter((keyword) => context.custom.has(keyword));

// What a keyword of your own gives for a node (`json` is its view), worked out once: the schema its macro returns, or
// the function checking a value, from "compile" or "validate".
function customPartOf(node, json, keyword) {
  if (!context.customParts.has(node)) {
    context.customParts.set(node, new Map());
  }
  const parts = context.customParts.get(node);
  if (!parts.has(keyword)) {
    const definition = context.custom.get(keyword);
    const value = json[keyword];
    const it = { draft: context.draft };
    let part;
    if (definition.macro) {
      part = definition.macro(value, json, it);
    } else if (definition.compile) {
      part = definition.compile(value, json, it);
      if (typeof part !== 'function' && !(part instanceof RegExp)) {
        throw new Error(
          `Unsupported JSON Schema: the "compile" of keyword "${keyword}" must return a function or a regular expression`
        );
      }
    } else {
      part = (data) => definition.validate(value, data, json);
    }
    parts.set(keyword, part);
  }
  return parts.get(keyword);
}

// null is valid only if every constraint of the node accepts it. `seen` stops at reference cycles, which give no
// value that accepts null.
function acceptsNull(json, seen = undefined, outerScope = context.scope) {
  if (json === true) {
    return true;
  }
  if (json === false || json === null || typeof json !== 'object') {
    return false;
  }
  // The usual node: one type other than null, without "nullable" or a reference, read as it is (its vocabularies
  // leave out no keyword). Its type does not accept null, so neither does the node.
  if (
    typeof json.type === 'string' &&
    json.type !== 'null' &&
    json.nullable !== true &&
    json.$ref === undefined &&
    json.$dynamicRef === undefined &&
    json.$recursiveRef === undefined &&
    !context.index.ignoresKeywords(json)
  ) {
    return false;
  }
  // The node is checked in the scope of its resource, like convert() converts it, and as its vocabularies see it.
  const scope = enterNode(outerScope, json);
  const view = viewOf(json);
  const refKeywords = refKeywordsOf(json);
  if (refKeywords.length > 0) {
    // `seen` is made when the first reference is followed.
    if (seen === undefined) {
      // eslint-disable-next-line no-param-reassign
      seen = new Set();
    } else if (seen.has(json)) {
      return false;
    }
    // `seen` holds the references being followed, so a target reached again through another path is not a cycle.
    seen.add(json);
    // Up to draft-07 only "$ref" counts, and the keywords next to it are ignored.
    const followed = isLegacy(draftOfNode(json)) ? ['$ref'] : refKeywords;
    const result = followed.every((keyword) => {
      const target = resolveTarget(json, keyword, scope);
      return target !== undefined && acceptsNull(target, seen, scope);
    });
    seen.delete(json);
    const rest = isLegacy(draftOfNode(json)) ? undefined : besideRef(view);
    return result && (rest === undefined || acceptsNull(rest, seen, scope));
  }
  if (view.nullable === true) {
    return true;
  }
  const checks = [];
  if (view.type !== undefined) {
    checks.push(getTypeNames(view).includes('null'));
  }
  if (view.enum) {
    checks.push(view.enum.includes(null));
  }
  if ('const' in view) {
    checks.push(view.const === null);
  }
  if (view.anyOf) {
    checks.push(view.anyOf.some((item) => acceptsNull(item, seen, scope)));
  }
  if (view.oneOf) {
    checks.push(view.oneOf.filter((item) => acceptsNull(item, seen, scope)).length === 1);
  }
  if (view.not !== undefined) {
    checks.push(!acceptsNull(view.not, seen, scope));
  }
  if (view.allOf) {
    checks.push(view.allOf.every((item) => acceptsNull(item, seen, scope)));
  }
  if (view.if !== undefined) {
    const branch = acceptsNull(view.if, seen, scope) ? view.then : view.else;
    checks.push(branch === undefined || acceptsNull(branch, seen, scope));
  }
  // Keywords of your own that check null: the schema of a macro, or the check itself.
  customKeywordsOf(view).forEach((keyword) => {
    const definition = context.custom.get(keyword);
    if (definition.types === undefined || definition.types.includes('null')) {
      const part = customPartOf(json, view, keyword);
      checks.push(definition.macro ? acceptsNull(part, seen, scope) : Boolean(part(null)));
    }
  });
  return checks.every(Boolean);
}

// Inner types of a combination only check non-null values: the outer type owns mandatory/nullable.
function asInner(type) {
  type.isMandatory = false;
  type.isNullable = true;

  return type;
}

function combine(types, Type) {
  if (types.length === 0) {
    return new AnyType();
  }
  if (types.length === 1) {
    return types[0];
  }
  return new Type({ types: types.map(asInner) });
}

let convert;

function requiredDependency(key, dependency, path) {
  if (!Array.isArray(dependency) || !dependency.every((property) => typeof property === 'string')) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected property names`);
  }
  return { key, required: dependency };
}

// A list of required properties, or a schema the whole object must satisfy, for each key: from "dependencies", and
// from "dependentRequired" and "dependentSchemas", which split it in two from draft 2019-09 on.
function convertDependencies(json, path) {
  const dependencies = json.dependencies || {};
  const dependentRequired = json.dependentRequired || {};
  const dependentSchemas = json.dependentSchemas || {};
  return [
    ...Object.keys(dependencies).map((key) => {
      const dependency = dependencies[key];
      const at = `${path}.dependencies.${key}`;
      return Array.isArray(dependency)
        ? requiredDependency(key, dependency, at)
        : { key, type: asInner(convert(dependency, at)) };
    }),
    ...Object.keys(dependentRequired).map((key) =>
      requiredDependency(key, dependentRequired[key], `${path}.dependentRequired.${key}`)
    ),
    ...Object.keys(dependentSchemas).map((key) => ({
      key,
      type: asInner(convert(dependentSchemas[key], `${path}.dependentSchemas.${key}`)),
    })),
  ];
}

// With useDefaults, the defaults of the schemas `items` (the "properties" of an object, by key, or the positions of a
// tuple) as [{ key, value, empty }]. As in ajv, defaults inside "anyOf", "oneOf", "not" and "if" (directly or through
// "$ref") are not assigned, as those schemas may not apply: with strict: true they throw.
function collectDefaults(items, keys, path) {
  if (!context.useDefaults) {
    return [];
  }
  const empty = context.useDefaults === 'empty';
  return keys
    .filter((key) => {
      const item = items[key];
      return item !== null && typeof item === 'object' && !Array.isArray(item) && item.default !== undefined;
    })
    .filter((key) => {
      if (context.composite === 0) {
        return true;
      }
      if (context.strict) {
        throw new Error(
          `Unsupported JSON Schema at ${path}: "default" of "${key}" is ignored inside "anyOf", "oneOf", "not" and "if" (useDefaults); use strict: false to ignore it`
        );
      }
      return false;
    })
    .map((key) => {
      if (key === '__proto__') {
        throw new Error(`Unsupported JSON Schema at ${path}: "default" of "__proto__" (useDefaults)`);
      }
      return { key, value: items[key].default, empty };
    });
}

// What removeAdditional does with the additional properties of an object schema: 'delete' them all, delete the
// 'failing' ones, or nothing (undefined), as in ajv.
function removalOf(json) {
  const mode = context.removeAdditional;
  const { additionalProperties } = json;
  if (mode === 'all' && (json.properties !== undefined || additionalProperties !== undefined)) {
    return 'delete';
  }
  if (mode && additionalProperties === false) {
    return 'delete';
  }
  const isSchema = additionalProperties !== null && typeof additionalProperties === 'object';
  return mode === 'failing' && isSchema ? 'failing' : undefined;
}

// Converts the schemas of a keyword that may not apply ("anyOf", "oneOf", "not" and "if"), where defaults are not
// assigned.
function inComposite(convertIt) {
  context.composite += 1;
  try {
    return convertIt();
  } finally {
    context.composite -= 1;
  }
}

function convertObject(json, path) {
  const properties = json.properties || {};
  const required = json.required || [];
  const { additionalProperties } = json;
  const additionalType =
    additionalProperties !== undefined && typeof additionalProperties === 'object'
      ? convert(additionalProperties, `${path}.additionalProperties`)
      : undefined;
  // No prototype: keys such as __proto__ or toString must be plain entries.
  const definition = Object.create(null);
  Object.keys(properties).forEach((key) => {
    definition[key] = convert(properties[key], `${path}.properties.${key}`, required.includes(key));
  });
  const patternProperties = json.patternProperties || {};
  const patternTypes = Object.keys(patternProperties).map((source) => ({
    pattern: new RegExp(source, 'u'),
    type: convert(patternProperties[source], `${path}.patternProperties.${source}`),
  }));
  // A key only "required" names must be present; its value is an additional property unless a pattern matches it, so
  // it satisfies "additionalProperties" (with false, the object is never valid).
  // With removeAdditional, it only has to be present, as in ajv, which checks "required" before removing the
  // additional properties: the key is then checked, and maybe removed, as one of them.
  const removal = removalOf(json);
  required
    .filter((key) => !Object.prototype.hasOwnProperty.call(definition, key))
    .forEach((key) => {
      const isAdditional =
        !removal && additionalProperties !== undefined && !patternTypes.some(({ pattern }) => pattern.test(key));
      definition[key] = isAdditional
        ? convert(additionalProperties, `${path}.additionalProperties`)
        : new AnyType({ isNullable: true });
    });
  const schema = new Schema(definition, {
    isOpen: additionalProperties !== false,
    additionalType,
    patternTypes,
    dependencies: convertDependencies(json, path),
    propertyNameType:
      json.propertyNames === undefined ? undefined : convert(json.propertyNames, `${path}.propertyNames`),
    minProperties: json.minProperties,
    maxProperties: json.maxProperties,
    defaults: collectDefaults(properties, Object.keys(properties), `${path}.properties`),
    removeAdditional: removal,
  });
  // For "unevaluatedProperties": the keys "properties" names (the schema also declares the ones only "required"
  // names), and whether "additionalProperties" evaluates every other key, as it does even when it is true.
  schema.propertyKeys = Object.keys(properties);
  schema.evaluatesAllKeys = additionalProperties !== undefined;
  return schema;
}

const tuple = (items, keyword, path) => items.map((item, i) => convert(item, `${path}.${keyword}[${i}]`, false));

function convertArray(json, path) {
  const { items } = json;
  let type;
  let additionalType;
  if (context.draft === '2020-12') {
    // "prefixItems" is the tuple, and "items" the type of the elements after it (or of all of them).
    if (Array.isArray(items)) {
      throw new Error(`Unsupported JSON Schema at ${path}: in draft 2020-12 "items" is a schema; use "prefixItems"`);
    }
    const rest = items === undefined ? undefined : convert(items, `${path}.items`);
    if (json.prefixItems !== undefined) {
      if (!Array.isArray(json.prefixItems)) {
        throw new Error(`Unsupported JSON Schema at ${path}: "prefixItems" must be an array`);
      }
      type = tuple(json.prefixItems, 'prefixItems', path);
      additionalType = rest;
    } else {
      type = rest;
    }
  } else {
    if (Array.isArray(items)) {
      type = tuple(items, 'items', path);
    } else if (items !== undefined) {
      type = convert(items, `${path}.items`);
    }
    // Only used after the positions of an items array.
    additionalType =
      Array.isArray(items) && json.additionalItems !== undefined
        ? convert(json.additionalItems, `${path}.additionalItems`)
        : undefined;
  }
  // Elements are values of their own: null is checked, not skipped.
  const contains = json.contains === undefined ? undefined : convert(json.contains, `${path}.contains`);
  // The positions of the tuple, whose defaults useDefaults assigns.
  let tupleItems = Array.isArray(items) && context.draft !== '2020-12' ? items : undefined;
  if (context.draft === '2020-12' && Array.isArray(json.prefixItems)) {
    tupleItems = json.prefixItems;
  }
  const array = new ArrayOfType({
    defaults: tupleItems
      ? collectDefaults(
          tupleItems,
          tupleItems.map((item, i) => i),
          path
        )
      : [],
    type,
    min: json.minItems,
    max: json.maxItems,
    unique: json.uniqueItems,
    contains,
    minContains: json.minContains,
    maxContains: json.maxContains,
    additionalType,
  });
  // For "unevaluatedItems": in draft 2020-12 "contains" evaluates the elements it matches.
  array.containsEvaluates = context.draft === '2020-12';
  return array;
}

function convertNumber(json, Type, path) {
  if (json.multipleOf !== undefined && !(typeof json.multipleOf === 'number' && json.multipleOf > 0)) {
    throw new Error(`Unsupported JSON Schema at ${path}: "multipleOf" must be a number greater than 0`);
  }
  // In draft-04 "exclusiveMinimum" and "exclusiveMaximum" are booleans that make "minimum" and "maximum" exclusive.
  const isDraft04 = context.draft === 'draft-04';
  ['exclusiveMinimum', 'exclusiveMaximum'].forEach((keyword) => {
    const expected = isDraft04 ? 'boolean' : 'number';
    const actual = typeof json[keyword];
    if (json[keyword] !== undefined && actual !== expected) {
      throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a ${expected} in ${context.draft}`);
    }
  });
  if (isDraft04) {
    return new Type({
      min: json.exclusiveMinimum === true ? undefined : json.minimum,
      max: json.exclusiveMaximum === true ? undefined : json.maximum,
      exclusiveMin: json.exclusiveMinimum === true ? json.minimum : undefined,
      exclusiveMax: json.exclusiveMaximum === true ? json.maximum : undefined,
      multipleOf: json.multipleOf,
      multipleOfPrecision: context.multipleOfPrecision,
    });
  }
  return new Type({
    min: json.minimum,
    max: json.maximum,
    exclusiveMin: json.exclusiveMinimum,
    exclusiveMax: json.exclusiveMaximum,
    multipleOf: json.multipleOf,
    multipleOfPrecision: context.multipleOfPrecision,
  });
}

function convertTypeName(typeName, json, path) {
  switch (typeName) {
    case 'object':
      return convertObject(json, path);
    case 'array':
      return convertArray(json, path);
    case 'string':
      return new StringType({
        min: json.minLength,
        max: json.maxLength,
        pattern: json.pattern === undefined ? undefined : new RegExp(json.pattern, 'u'),
        allowEmpty: false,
        countCodePoints: true,
        ...formatOf(json, path),
      });
    case 'number':
      return convertNumber(json, FloatType, path);
    case 'integer':
      return convertNumber(json, IntegerType, path);
    case 'boolean':
      return new BooleanType();
    default:
      return new ValuesType({ values: [null], isNullable: true });
  }
}

// Keywords of a schema without "type": each group of them checks only the values of its JSON type.
function convertUntyped(json, path) {
  const jsonTypes = [...new Set(Object.keys(json).map((keyword) => TYPED_KEYWORDS[keyword]))].filter(Boolean);
  return jsonTypes.map(
    (jsonType) =>
      new WhenType({
        jsonType,
        type: asInner(convertTypeName(jsonType, json, path)),
      })
  );
}

// Adds "unevaluatedProperties" and "unevaluatedItems" to the types of the other keywords of a node, which decide
// what they leave to check.
function addUnevaluated(parts, json, path) {
  if (json.unevaluatedProperties === undefined && json.unevaluatedItems === undefined) {
    return;
  }
  const siblings = [...parts];
  if (json.unevaluatedProperties !== undefined) {
    const type = convert(json.unevaluatedProperties, `${path}.unevaluatedProperties`);
    parts.push(new UnevaluatedType({ kind: 'properties', siblings, type }));
  }
  if (json.unevaluatedItems !== undefined) {
    const type = convert(json.unevaluatedItems, `${path}.unevaluatedItems`);
    parts.push(new UnevaluatedType({ kind: 'items', siblings, type }));
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The schemas a "oneOf" schema stands for: itself and, while it only references another one, the schemas its "$ref"
// leads to. The last one has the properties.
function referencedSchemas(item) {
  const schemas = [];
  let schema = item;
  while (isObject(schema) && !schemas.includes(schema)) {
    schemas.push(schema);
    if (typeof schema.$ref !== 'string' || schema.properties !== undefined) {
      break;
    }
    schema = context.index.resolve(schema);
  }
  return schemas;
}

// The values a schema gives the property `tag` with "const" or "enum", or undefined when it gives none.
function tagValuesOf(schema, tag) {
  const property = isObject(schema) && isObject(schema.properties) ? schema.properties[tag] : undefined;
  if (!isObject(property)) {
    return undefined;
  }
  if ('const' in property) {
    return [property.const];
  }
  return Array.isArray(property.enum) ? property.enum : undefined;
}

// The name of a "oneOf" schema that is a reference, for the implicit mapping of OpenAPI: the last token of the JSON
// pointer of its "$ref" ("Dog" for "#/components/schemas/Dog"). Undefined for other schemas.
function schemaNameOf(item) {
  if (!isObject(item) || typeof item.$ref !== 'string') {
    return undefined;
  }
  const hash = item.$ref.indexOf('#');
  const pointer = hash === -1 ? '' : item.$ref.slice(hash + 1);
  if (!pointer.startsWith('/')) {
    return undefined;
  }
  try {
    const token = decodeURIComponent(pointer.slice(pointer.lastIndexOf('/') + 1));
    return token.replace(/~1/g, '/').replace(/~0/g, '~') || undefined;
  } catch (e) {
    return undefined;
  }
}

// The "discriminator" of a node (OpenAPI): the property ("propertyName") whose value picks the "oneOf" schema that
// applies. The value of each schema comes from, in this order:
// - "mapping": values to references (resolved against the node) or to schema names, as in OpenAPI;
// - a "const" or "enum" that the schema (or the schema it references) gives the property, as ajv reads it;
// - else the implicit mapping of OpenAPI: the name of the schema it references ("Dog" for "#/components/schemas/Dog").
// The values must be unique strings, and the property required by the node or by every schema. Objects are then
// checked only against the schema their value picks. With values from "const" and "enum" alone, no other schema
// accepts that value, so the result is the one of "oneOf" (`exact`); a "mapping" or a name picks the schema as OpenAPI
// does, whatever the other schemas accept. Returns { tag, mapping, exact }, with the index of the schema for each
// value.
function discriminatorOf(json, path) {
  const { discriminator } = json;
  const at = `Unsupported JSON Schema at ${path}: "discriminator"`;
  if (!isObject(discriminator) || typeof discriminator.propertyName !== 'string') {
    throw new Error(`${at} requires "propertyName"`);
  }
  const tag = discriminator.propertyName;
  if (discriminator.mapping !== undefined && !isObject(discriminator.mapping)) {
    throw new Error(`${at}: "mapping" must be an object of references or schema names by value`);
  }
  const branches = json.oneOf.map((item) => ({ schemas: referencedSchemas(item), name: schemaNameOf(item) }));
  const mapping = new Map();
  let exact = true;
  const add = (value, i) => {
    if (typeof value !== 'string' || mapping.has(value)) {
      throw new Error(`${at}: the values of "${tag}" must be unique strings`);
    }
    mapping.set(value, i);
  };
  // Values of "mapping", by the schema their reference leads to, or by schema name.
  Object.entries(discriminator.mapping || {}).forEach(([value, target]) => {
    if (typeof target !== 'string') {
      throw new Error(`${at}: "mapping"."${value}" must be a reference or a schema name`);
    }
    const isName = !target.includes('#') && !target.includes('/');
    const node = isName ? undefined : context.index.resolve(json, target);
    const i = branches.findIndex(({ schemas, name }) => (isName ? name === target : schemas.includes(node)));
    if (i === -1) {
      throw new Error(`${at}: "mapping"."${value}" ("${target}") is not one of the "oneOf" schemas`);
    }
    add(value, i);
    exact = false;
  });
  let requiredByAll = true;
  branches.forEach(({ schemas, name }, i) => {
    const schema = schemas[schemas.length - 1];
    const values = tagValuesOf(schema, tag);
    if (values !== undefined) {
      values.forEach((value) => add(value, i));
    } else if (![...mapping.values()].includes(i)) {
      if (name === undefined) {
        throw new Error(
          `${at}: every "oneOf" schema needs a value of "${tag}": a "const" or "enum" in "properties"."${tag}", an entry of "mapping", or a "$ref" to a schema named as the value`
        );
      }
      add(name, i);
      exact = false;
    }
    requiredByAll = requiredByAll && Array.isArray(schema.required) && schema.required.includes(tag);
  });
  if (!requiredByAll && !(Array.isArray(json.required) && json.required.includes(tag))) {
    throw new Error(`${at}: "${tag}" must be required`);
  }
  return { tag, mapping, exact };
}

// A "oneOf" without "discriminator" whose schemas give one property distinct string values with "const" or "enum":
// objects are checked against the schema their value picks, as with a discriminator, since no other schema accepts
// that value. A value that picks none is checked as by "oneOf", with the same errors, so the result and the errors are
// the ones of "oneOf" but for the errors of an object whose value picks a schema, which are the ones of that schema.
// Returns { tag, mapping, exact: true, auto: true }, or undefined when no property does it.
function implicitDiscriminatorOf(json) {
  if (json.oneOf.length < 2) {
    return undefined;
  }
  const schemas = json.oneOf.map((item) => {
    const chain = referencedSchemas(item);
    return chain[chain.length - 1];
  });
  const first = schemas[0];
  const candidates = isObject(first) && isObject(first.properties) ? Object.keys(first.properties) : [];
  for (let c = 0; c < candidates.length; c += 1) {
    const tag = candidates[c];
    const mapping = new Map();
    const isTag = schemas.every((schema, i) => {
      const values = tagValuesOf(schema, tag);
      return (
        values !== undefined &&
        values.length > 0 &&
        values.every((value) => typeof value === 'string' && !mapping.has(value) && mapping.set(value, i))
      );
    });
    if (isTag) {
      return { tag, mapping, exact: true, auto: true };
    }
  }
  return undefined;
}

// The types checking the keywords of your own of a node. A macro is replaced by the schema it returns, which only
// applies to the values of its JSON types when it has them.
function convertCustom(node, json, path) {
  return customKeywordsOf(json).flatMap((keyword) => {
    const definition = context.custom.get(keyword);
    const part = customPartOf(node, json, keyword);
    if (definition.macro) {
      const type = convert(part, `${path}.${keyword}`);
      if (definition.types === undefined) {
        return [type];
      }
      return definition.types.map((jsonType) => new WhenType({ jsonType, type: asInner(type) }));
    }
    const value = json[keyword];
    let { message } = definition;
    if (typeof message === 'function' && message.length < 2) {
      // It does not take the data: its text is the same for every value.
      message = message(value);
    } else if (typeof message === 'function') {
      const text = message;
      message = (data) => text(value, data);
    } else if (message === undefined) {
      message = `must pass the "${keyword}" keyword`;
    }
    // Named for the error of standalone code, which cannot contain them.
    [part, message]
      .filter((fn) => typeof fn === 'function')
      .forEach((fn) => {
        fn.validatorKeyword = keyword;
      });
    return [
      new KeywordType({
        keyword,
        check: part,
        message,
        jsonTypes: definition.types,
        isMandatory: false,
        isNullable: true,
      }),
    ];
  });
}

let convertNode;

// Converts a node within the scope of the resource it belongs to, which the nodes below it are converted in too.
convert = (json, path, isMandatory = true) => {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    return convertNode(json, path, isMandatory);
  }
  const { scope, draft } = context;
  context.scope = enterNode(scope, json);
  // A resource that names another draft with "$schema" is converted in it.
  context.draft = context.index.draftOf(json) || draft;
  try {
    return convertNode(json, path, isMandatory);
  } finally {
    context.scope = scope;
    context.draft = draft;
  }
};

// The schema of a node with $merge or $patch: its source (a schema, or a $ref resolved from the node, as every $ref)
// with the merge patch or the JSON patch applied; made once for a node, without the $id of its source (it is another
// schema), and indexed where the node is, so the references in it resolve as in the source.
const merged = new WeakMap();
function mergedNode(node, path) {
  if (merged.has(node)) return merged.get(node);
  const keyword = node.$merge !== undefined ? '$merge' : '$patch';
  const spec = node[keyword];
  if (!spec || typeof spec !== 'object' || spec.source === undefined || spec.with === undefined) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${keyword} is { source, with }`);
  }
  const { index } = context;
  let source = spec.source;
  if (source && typeof source === 'object' && typeof source.$ref === 'string') {
    source = index.resolve(node, source.$ref);
    if (source === undefined) {
      throw new Error(
        `Unsupported JSON Schema at ${path}: the source of ${keyword} (${spec.source.$ref}) is not there`
      );
    }
  }
  // A source made by $merge or $patch itself.
  if (source && typeof source === 'object' && (source.$merge !== undefined || source.$patch !== undefined)) {
    source = mergedNode(source, path);
  }
  const what = `${keyword} at ${path}`;
  let made;
  try {
    made = keyword === '$merge' ? mergePatch(source, spec.with) : applyPatch(source, spec.with, what);
  } catch (err) {
    throw new Error(`Unsupported JSON Schema at ${path}: ${err.message}`);
  }
  if (made && typeof made === 'object' && !Array.isArray(made)) {
    delete made.$id;
    delete made.id;
    index.visit(made, index.bases.get(node) ?? index.bases.get(index.root));
  }
  merged.set(node, made);
  return made;
}

convertNode = (node, path, isMandatory) => {
  if (node === true) {
    return new AnyType({ isMandatory, isNullable: true });
  }
  if (node === false) {
    return new NeverType({ isMandatory, isNullable: false });
  }
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new Error(`Unsupported JSON Schema at ${path}: expected an object or a boolean`);
  }
  // $merge and $patch (as ajv-merge-patch): the schema they make, in their place (see merge-patch.js).
  if (node.$merge !== undefined || node.$patch !== undefined) {
    return convertNode(mergedNode(node, path), path, isMandatory);
  }
  // The keywords its vocabularies leave out are ignored; references resolve from the node itself.
  const json = viewOf(node);
  // Up to draft-07 every keyword next to "$ref" is ignored; later drafts apply them too.
  let refKeywords = NO_KEYWORDS;
  if (!isLegacy(context.draft)) {
    refKeywords = refKeywordsOf(json);
  } else if (json.$ref !== undefined) {
    refKeywords = ['$ref'];
  }
  if (refKeywords.length > 0) {
    const refs = refKeywords.map((keyword) => {
      if (typeof json[keyword] !== 'string') {
        throw new Error(`Unsupported JSON Schema at ${path}: "${keyword}" must be a string`);
      }
      if (keyword === '$recursiveRef' && json.$recursiveRef !== '#') {
        throw new Error(`Unsupported JSON Schema at ${path}: "$recursiveRef" must be "#"`);
      }
      const ref = new RefType({
        ref: json[keyword],
        isMandatory,
        isNullable: true,
      });
      // Resolved later, in the scope of this node.
      context.pending.push({
        ref,
        json: node,
        keyword,
        path,
        scope: context.scope,
        composite: context.composite,
      });
      return ref;
    });
    const rest = isLegacy(context.draft) ? undefined : besideRef(json);
    if (rest === undefined && refs.length === 1) {
      return refs[0];
    }
    // The references count as keywords that evaluate properties and elements for "unevaluated*".
    const { unevaluatedProperties, unevaluatedItems, ...others } = rest || {};
    const parts = [...refs];
    if (rest !== undefined && besideRef(others) !== undefined) {
      parts.push(convertNode(others, path, true));
    }
    addUnevaluated(parts, json, path);
    const type = new AllOfType({ types: parts.map(asInner) });
    type.isMandatory = isMandatory;
    type.isNullable = acceptsNull(node);
    return type;
  }
  checkKeywords(json, path);
  const typeNames = getTypeNames(json);
  const nonNullNames = typeNames.filter((typeName) => typeName !== 'null');
  const namesToConvert = nonNullNames.length > 0 ? nonNullNames : typeNames;
  const constraints = [];
  if (namesToConvert.length === 0) {
    constraints.push(...convertUntyped(json, path));
  } else {
    constraints.push(
      combine(
        namesToConvert.map((typeName) => convertTypeName(typeName, json, path)),
        AnyOfType
      )
    );
  }
  // A checked "format" of a schema without "type" applies to strings, like the keywords of each type (unless one of
  // them gave a string type, which has it).
  const hasStringKeyword = () => Object.keys(json).some((keyword) => TYPED_KEYWORDS[keyword] === 'string');
  if (namesToConvert.length === 0 && !hasStringKeyword() && formatOf(json, path).format !== undefined) {
    constraints.push(
      new WhenType({
        jsonType: 'string',
        type: asInner(new StringType(formatOf(json, path))),
      })
    );
  }
  if (json.enum) {
    constraints.push(new ValuesType({ values: json.enum }));
  }
  if ('const' in json) {
    constraints.push(new ValuesType({ values: [json.const] }));
  }
  if (json.anyOf) {
    constraints.push(
      combine(
        inComposite(() => json.anyOf.map((item, i) => convert(item, `${path}.anyOf[${i}]`))),
        AnyOfType
      )
    );
  }
  if (json.oneOf) {
    if (!Array.isArray(json.oneOf) || json.oneOf.length === 0) {
      throw new Error(`Unsupported JSON Schema at ${path}: "oneOf" must be a non-empty array`);
    }
    const types = inComposite(() => json.oneOf.map((item, i) => asInner(convert(item, `${path}.oneOf[${i}]`))));
    const discriminator =
      json.discriminator === undefined ? implicitDiscriminatorOf(json) : discriminatorOf(json, path);
    constraints.push(new OneOfType({ types, discriminator }));
  } else if (json.discriminator !== undefined) {
    throw new Error(`Unsupported JSON Schema at ${path}: "discriminator" requires "oneOf"`);
  }
  if (json.not !== undefined) {
    constraints.push(new NotType({ type: asInner(inComposite(() => convert(json.not, `${path}.not`))) }));
  }
  if (json.allOf) {
    json.allOf.forEach((item, i) => constraints.push(convert(item, `${path}.allOf[${i}]`)));
  }
  // "then" and "else" are ignored without "if", and "if" alone checks nothing. From draft 2019-09 on it is kept even
  // alone, as what it evaluates counts for an "unevaluated*" of this node or of one that refers to it.
  const keepsIf = json.then !== undefined || json.else !== undefined || !isLegacy(context.draft);
  if (json.if !== undefined && keepsIf) {
    const branch = (keyword) =>
      json[keyword] === undefined ? undefined : asInner(convert(json[keyword], `${path}.${keyword}`));
    constraints.push(
      new ConditionalType({
        ifType: asInner(inComposite(() => convert(json.if, `${path}.if`))),
        thenType: branch('then'),
        elseType: branch('else'),
      })
    );
  }
  constraints.push(...convertCustom(node, json, path));
  addUnevaluated(constraints, json, path);
  const type = combine(constraints, AllOfType);
  type.isMandatory = isMandatory;
  type.isNullable = acceptsNull(node);
  // With coerceTypes, the value is converted to its types where it is read (see coerce.js). "nullable": true adds
  // null to them, as in ajv: null is kept (not converted to '' or 0), and '', 0 and false may become null.
  if (context.coerceTypes) {
    const coerceTypes =
      json.nullable === true && typeNames.length > 0 && !typeNames.includes('null')
        ? [...typeNames, 'null']
        : typeNames;
    const coerceTo = coerceTypes.filter(
      (typeName) => COERCIBLE.includes(typeName) || (typeName === 'array' && context.coerceTypes === 'array')
    );
    if (coerceTo.length > 0) {
      type.coerceSpec = { types: coerceTypes, to: coerceTo, array: context.coerceTypes === 'array' };
    }
  }
  return type;
};

// Points every reference to the type of its target, converting each target once. Converting a target can add
// references, which the loop resolves too.
function resolveReferences() {
  while (context.pending.length > 0) {
    const { ref, json, keyword, path, scope, composite } = context.pending.shift();
    const target = resolveTarget(json, keyword, scope);
    if (target === undefined) {
      const error = new Error(
        `Unsupported JSON Schema "${keyword}": "${json[keyword]}" at ${path}: only references within the schema or to documents in the "schemas" option are supported`
      );
      // The document to load for the reference to resolve, which loadJsonSchemas() asks loadSchema for.
      error.missingSchema = context.index.missingDocument(json, keyword === '$recursiveRef' ? '#' : json[keyword]);
      throw error;
    }
    // A target is converted once for each scope it is reached in, as dynamic references in it may resolve
    // differently.
    const targetScope = enterNode(scope, target);
    if (!context.targets.has(target)) {
      context.targets.set(target, new Map());
    }
    const byScope = context.targets.get(target);
    // With useDefaults, a target reached inside "anyOf", "oneOf", "not" or "if" is converted apart, without defaults.
    const key = context.useDefaults && composite > 0 ? `${targetScope.key}\n(composite)` : targetScope.key;
    if (!byScope.has(key)) {
      context.scope = targetScope;
      context.composite = composite;
      byScope.set(key, convert(target, json[keyword]));
      context.composite = 0;
    }
    ref.target = byScope.get(key);
  }
}

// Builds a validation type from a JSON Schema (draft-07, 2019-09 or 2020-12: see draftOf()). Throws on unsupported
// keywords instead of silently ignoring them. "$ref" can point within the schema or to the documents in
// options.schemas, given as { uri: schema } or as an array of schemas with "$id"; they are only converted where
// referenced.
function fromJsonSchema(json, options = {}) {
  const strict = strictOf(options);
  const { annotations, custom } = keywordsOf(options);
  const useDefaults = useDefaultsOf(options);
  const coerceTypes = coerceTypesOf(options);
  const multipleOfPrecision = multipleOfPrecisionOf(options);
  const formats = formatsOf(options.formats);
  const removeAdditional = removeAdditionalOf(options);
  const index = new RefIndex(json, options.schemas, draftOf(options));
  // The scope before entering any resource. Scopes belong to one conversion, as they remember what follows them.
  const emptyScope = newScope('', new Map());
  context = {
    draft: index.draft,
    index,
    // Target node to the type converted for it, by the key of the scope it was converted in.
    targets: new Map(),
    pending: [],
    // Scopes by key, so the same anchors give the same scope.
    scopes: new Map([['', emptyScope]]),
    // The formats checked, by name (see formatsOf()).
    formats: formats.checks,
    // The comparisons of the formats whose values can be compared (see formatLimitsOf()).
    formatCompares: formats.compares,
    // With the option "formats", the names it gives (see checkKeywords()).
    knownFormats: formats.known,
    scope: emptyScope,
    // Options "strict" and "keywords" (see isIgnored()), and the nodes without the keywords of other drafts (viewOf()).
    strict,
    annotations,
    custom,
    views: new Map(),
    // What the keywords of your own give for each node, by keyword: the schema of a macro, or the check.
    customParts: new Map(),
    // Options "useDefaults" and "removeAdditional", and how many "anyOf", "oneOf", "not" or "if" the node being
    // converted is inside (see collectDefaults()).
    useDefaults,
    removeAdditional,
    composite: 0,
    // Option "coerceTypes" (see coerce.js).
    coerceTypes,
    // Option "multipleOfPrecision" (see FloatType.isMultiple()).
    multipleOfPrecision,
  };
  try {
    const type = convert(json, '#');
    const rootScope = enterNode(emptyScope, json);
    context.targets.set(json, new Map([[rootScope.key, type]]));
    resolveReferences();
    // The value validated is in no object or array: with coerceTypes, it is converted for the validation only.
    const spec = coerceTypes ? coerceSpecOf(type) : undefined;
    return spec ? new CoerceType({ type, spec }) : type;
  } finally {
    context = undefined;
  }
}

// Compatibility with ajv compile: returns a function that gives the list of errors for a value (empty when valid).
// With allErrors: false it stops at the first failing check and gives only that error. With errors: false it gives
// true or false instead, for when only validity matters. options.schemas registers other documents for "$ref", and
// options.draft chooses the draft, as in fromJsonSchema().
function compileJsonSchema(json, options = {}) {
  return compileType(fromJsonSchema(json, options), options);
}

// The documents a schema references that options.schemas does not have, loaded with options.loadSchema(uri), an
// async function giving the schema at an absolute URI (without fragment). Only the documents the conversion reaches
// are loaded, one at a time, including the ones they reference in turn. Resolves to options.schemas with them added,
// as an object of schemas by URI, for compileJsonSchema() or standaloneJsonSchema().
async function loadJsonSchemas(json, options = {}) {
  if (typeof options.loadSchema !== 'function') {
    throw new Error('Unsupported JSON Schema option "loadSchema": expected an async function (uri) => schema');
  }
  const schemas = Object.fromEntries(documentsOf(options.schemas).map(({ uri, schema }) => [uri, schema]));
  const loaded = new Set();
  for (;;) {
    try {
      fromJsonSchema(json, { ...options, schemas });
      return schemas;
    } catch (e) {
      const uri = e.missingSchema;
      if (uri === undefined || loaded.has(uri)) {
        throw e;
      }
      loaded.add(uri);
      // One document at a time: the next conversion tells which one is missing next.
      // eslint-disable-next-line no-await-in-loop
      schemas[uri] = await options.loadSchema(uri);
    }
  }
}

// compileJsonSchema() for a schema referencing documents to load first with options.loadSchema (see loadJsonSchemas()),
// like ajv's compileAsync().
async function compileJsonSchemaAsync(json, options = {}) {
  const schemas = await loadJsonSchemas(json, options);
  return compileJsonSchema(json, { ...options, schemas });
}

module.exports = {
  fromJsonSchema,
  compileJsonSchema,
  loadJsonSchemas,
  compileJsonSchemaAsync,
  builtInFormats,
};

},
"@xufa/schema/lib/merge-patch.js": function (module, exports, require) {
'use strict';

// The keywords $merge and $patch of ajv-merge-patch: a schema made from another one (source) and a JSON Merge Patch
// (RFC 7386, $merge) or a JSON Patch (RFC 6902, $patch), made before the schema is compiled.
//
//   { $merge: { source: { $ref: 'book.json#' }, with: { required: ['isbn'] } } }
//   { $patch: { source: { $ref: '#/definitions/book' }, with: [{ op: 'add', path: '/properties/isbn', value: { type: 'string' } }] } }
//
// The source is a schema, or a $ref to one, resolved from the node as every $ref (a schema of the option `schemas`,
// the document, a JSON Pointer in one of them): see mergedNode() in json-schema.js, which applies them.
const isPlain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function mergePatch(target, patch) {
  if (!isPlain(patch)) return clone(patch);
  const out = isPlain(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}

// The parent and the key of a JSON Pointer in a document.
function locate(document, pointer, what) {
  if (pointer === '') return { parent: null, key: null };
  if (!pointer.startsWith('/')) throw new Error(`${what}: ${pointer} is not a JSON Pointer`);
  const keys = pointer
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent = document;
  for (const key of keys.slice(0, -1)) {
    parent = parent === null || typeof parent !== 'object' ? undefined : parent[key];
    if (parent === undefined) throw new Error(`${what}: no ${pointer}`);
  }
  return { parent, key: keys[keys.length - 1] };
}

function getAt(document, pointer, what) {
  if (pointer === '') return document;
  const { parent, key } = locate(document, pointer, what);
  if (parent === null || typeof parent !== 'object' || !(key in parent)) throw new Error(`${what}: no ${pointer}`);
  return parent[key];
}

// JSON Patch: add, remove, replace, move, copy and test, on a copy of the document.
function applyPatch(document, operations, what) {
  if (!Array.isArray(operations)) throw new Error(`${what}: "with" is a list of operations (JSON Patch)`);
  let doc = clone(document);
  const put = (pointer, value, replace) => {
    if (pointer === '') {
      doc = value;
      return;
    }
    const { parent, key } = locate(doc, pointer, what);
    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`${what}: no ${pointer}`);
      if (replace) parent[index] = value;
      else parent.splice(index, 0, value);
    } else if (parent !== null && typeof parent === 'object') {
      if (replace && !(key in parent)) throw new Error(`${what}: no ${pointer} to replace`);
      parent[key] = value;
    } else throw new Error(`${what}: no ${pointer}`);
  };
  const take = (pointer) => {
    const { parent, key } = locate(doc, pointer, what);
    const value = getAt(doc, pointer, what);
    if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
    return value;
  };
  for (const operation of operations) {
    const { op, path, from, value } = operation || {};
    if (typeof path !== 'string') throw new Error(`${what}: an operation without a path`);
    if (op === 'add') put(path, clone(value), false);
    else if (op === 'remove') take(path);
    else if (op === 'replace') put(path, clone(value), true);
    else if (op === 'move') put(path, take(from), false);
    else if (op === 'copy') put(path, clone(getAt(doc, from, what)), false);
    else if (op === 'test') {
      if (JSON.stringify(getAt(doc, path, what)) !== JSON.stringify(value)) {
        throw new Error(`${what}: the test of ${path} failed`);
      }
    } else throw new Error(`${what}: ${op} is not an operation of JSON Patch`);
  }
  return doc;
}

module.exports = { mergePatch, applyPatch };

},
"@xufa/schema/lib/schema.js": function (module, exports, require) {
const { ObjType, ValidateType, toType } = require('./types');
const { assignDefaults } = require('./defaults');
const { readCoerced } = require('./coerce');

// Declared keys are read as own properties only: {}.toString or {}.constructor must not count as present.
// A value read from a plain object is its own unless Object.prototype has the key, which avoids the slower
// own-property check in the common case. The prototype is read with __proto__ rather than Object.getPrototypeOf(),
// which makes V8 deoptimize the code around it (twice slower). Objects without that accessor (no prototype, or an
// own "__proto__" key from JSON.parse) are not taken as plain and get the own-property check.
function ownValue(obj, key) {
  const value = obj[key];
  // eslint-disable-next-line no-proto -- see above
  if (value === undefined || (obj.__proto__ === Object.prototype && !(key in Object.prototype))) {
    return value;
  }
  return Object.prototype.hasOwnProperty.call(obj, key) ? value : undefined;
}

class Schema {
  constructor(schema = {}, options = {}) {
    this.schema = schema;
    this.options = options;
    this.isOpen = options.isOpen === undefined ? true : options.isOpen;
    this.isMandatory = options.isMandatory === undefined ? true : options.isMandatory;
    this.isNullable = options.isNullable === undefined ? false : options.isNullable;
    // Type that keys not declared in the schema must satisfy (only used when the schema is open).
    this.additionalType = toType(options.additionalType, 'Schema additionalType');
    // [{ pattern, type }]: keys matching a pattern must satisfy its type, and are not checked by additionalType.
    this.patternTypes = (options.patternTypes || []).map((item, i) => ({
      ...item,
      type: toType(item.type, `Schema patternTypes[${i}].type`),
    }));
    this.minProperties = options.minProperties;
    this.maxProperties = options.maxProperties;
    // [{ key, value, empty }]: defaults assigned to missing properties before checking them (option useDefaults).
    this.defaults = options.defaults || [];
    // What to do with additional properties (option removeAdditional): 'delete' them, delete the 'failing' ones, or
    // nothing. They are deleted where they are checked, in the same order as the compiled code.
    this.removeAdditional = options.removeAdditional;
    // [{ key, required: [properties] } or { key, type }]: when key is present, the properties must be present too,
    // or the whole object must satisfy type.
    this.dependencies = (options.dependencies || []).map((item, i) =>
      item.type === undefined ? item : { ...item, type: toType(item.type, `Schema dependencies[${i}].type`) }
    );
    // Type every key must satisfy, reported as "Key <name>".
    this.propertyNameType = toType(options.propertyNameType, 'Schema propertyNameType');
    this.visitObjs();
    this.keys = Object.keys(this.schema);
    this.keySet = new Set(this.keys);
  }

  visitObjs() {
    // Nested schemas share the options, except the ones about the keys of this object. Made only for a key that needs
    // them (a plain object, from the DSL): keys of types, as JSON Schema gives, need none.
    let options;
    const nestedOptions = () => {
      if (options === undefined) {
        options = {
          ...this.options,
          patternTypes: undefined,
          dependencies: undefined,
          propertyNameType: undefined,
          defaults: undefined,
          removeAdditional: undefined,
        };
      }
      return options;
    };
    const keys = Object.keys(this.schema);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = this.schema[key];
      if (!(value instanceof Schema)) {
        if (!(value instanceof ValidateType)) {
          this.schema[key] = new Schema(value, nestedOptions());
        } else if (
          value instanceof ObjType &&
          !(value.schema instanceof ValidateType && !(value.schema instanceof Schema))
        ) {
          this.schema[key] = new Schema(
            value.shape instanceof Schema ? value.shape.schema : value.shape,
            nestedOptions()
          );
        }
      }
    }
  }

  // Fast boolean check equivalent to validate(obj).length === 0 that builds no messages.
  isValid(obj) {
    if (obj === undefined) {
      return !this.isMandatory;
    }
    if (obj === null) {
      return this.isNullable;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }
    if (this.defaults.length > 0) {
      assignDefaults(obj, this.defaults);
    }
    const { keys } = this;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      // With coerceTypes, a value is converted to the types of its schema as it is read (see coerce.js).
      if (!this.schema[key].isValid(readCoerced(obj, key, this.schema[key], ownValue(obj, key)))) {
        return false;
      }
    }
    const objKeys = Object.keys(obj);
    const { patternTypes, propertyNameType, removeAdditional } = this;
    // The keys removeAdditional deletes still count, as in ajv.
    if (!this.hasPropertyCount(objKeys.length)) {
      return false;
    }
    if (!this.isOpen || this.additionalType || patternTypes.length > 0 || propertyNameType || removeAdditional) {
      for (let i = 0; i < objKeys.length; i += 1) {
        const key = objKeys[i];
        if (propertyNameType && !propertyNameType.isValid(key)) {
          return false;
        }
        let matched = false;
        for (let j = 0; j < patternTypes.length; j += 1) {
          if (patternTypes[j].pattern.test(key)) {
            matched = true;
            if (!patternTypes[j].type.isValid(readCoerced(obj, key, patternTypes[j].type, obj[key]))) {
              return false;
            }
          }
        }
        if (!this.isDeclared(key) && !matched) {
          if (this.removes(obj, key)) {
            delete obj[key];
          } else if (
            !this.isOpen ||
            (this.additionalType && !this.additionalType.isValid(readCoerced(obj, key, this.additionalType, obj[key])))
          ) {
            return false;
          }
        }
      }
    }
    return this.dependencies.every(
      ({ key, required, type }) =>
        ownValue(obj, key) === undefined ||
        (required ? required.every((property) => ownValue(obj, property) !== undefined) : type.isValid(obj))
    );
  }

  validate(obj, fieldName = undefined) {
    return this.isValid(obj) ? [] : this.errors(obj, fieldName);
  }

  // Whether a number of keys satisfies minProperties and maxProperties.
  hasPropertyCount(count) {
    return !(
      (this.minProperties !== undefined && count < this.minProperties) ||
      (this.maxProperties !== undefined && count > this.maxProperties)
    );
  }

  // Whether a key is declared rather than additional. With removeAdditional, a key only "required" names is additional,
  // as in ajv (`propertyKeys` are the keys "properties" names, see convertObject() in json-schema.js).
  isDeclared(key) {
    if (this.removeAdditional && this.propertyKeys) {
      return this.propertyKeys.includes(key);
    }
    return this.keySet.has(key);
  }

  // Whether removeAdditional deletes the additional property `key` of `obj`.
  removes(obj, key) {
    return (
      this.removeAdditional === 'delete' ||
      (this.removeAdditional === 'failing' && !this.additionalType.isValid(obj[key]))
    );
  }

  // Compiles the schema into generated code, several times faster than validate(): see compileType() in compile.js
  // for the options. The compiled function does not see changes made to the schema afterwards.
  compile(options = {}) {
    // eslint-disable-next-line global-require -- compile.js requires this module
    return require('./compile').compileType(this, options);
  }

  // Error messages of a value already known to be invalid.
  errors(obj, fieldName = undefined) {
    const name = fieldName || 'Value';
    const { keys: schemaKeys } = this;
    const errors = [];
    if (obj === undefined) {
      if (this.isMandatory) {
        errors.push(`${name} is mandatory`);
      }
      return errors;
    }
    if (obj === null) {
      if (!this.isNullable) {
        errors.push(`${name} cannot be null`);
      }
      return errors;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      errors.push(`${name} must be an object`);
      return errors;
    }
    if (this.defaults.length > 0) {
      assignDefaults(obj, this.defaults);
    }
    for (let i = 0; i < schemaKeys.length; i += 1) {
      const key = schemaKeys[i];
      const type = this.schema[key];
      const value = readCoerced(obj, key, type, ownValue(obj, key));
      if (!type.isValid(value)) {
        errors.push(type.errors(value, fieldName ? `${fieldName}.${key}` : key));
      }
    }
    const objKeys = Object.keys(obj);
    for (let i = 0; i < objKeys.length; i += 1) {
      const key = objKeys[i];
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (this.propertyNameType && !this.propertyNameType.isValid(key)) {
        errors.push(this.propertyNameType.errors(key, `Key ${keyName}`));
      }
      let matched = false;
      this.patternTypes.forEach(({ pattern, type }) => {
        if (pattern.test(key)) {
          matched = true;
          const value = readCoerced(obj, key, type, obj[key]);
          if (!type.isValid(value)) {
            errors.push(type.errors(value, keyName));
          }
        }
      });
      if (!this.isDeclared(key) && !matched) {
        if (this.removes(obj, key)) {
          delete obj[key];
        } else if (!this.isOpen) {
          errors.push(`Unexpected key: ${keyName}`);
        } else if (this.additionalType) {
          const value = readCoerced(obj, key, this.additionalType, obj[key]);
          if (!this.additionalType.isValid(value)) {
            errors.push(this.additionalType.errors(value, keyName));
          }
        }
      }
    }
    const count = objKeys.length;
    if (this.minProperties !== undefined && count < this.minProperties) {
      errors.push(`${name} must have at least ${this.minProperties} properties`);
    }
    if (this.maxProperties !== undefined && count > this.maxProperties) {
      errors.push(`${name} must have at most ${this.maxProperties} properties`);
    }
    this.dependencies.forEach(({ key, required, type }) => {
      if (ownValue(obj, key) === undefined) {
        return;
      }
      const keyName = fieldName ? `${fieldName}.${key}` : key;
      if (required) {
        required
          .filter((property) => ownValue(obj, property) === undefined)
          .forEach((property) => {
            const propertyName = fieldName ? `${fieldName}.${property}` : property;
            errors.push(`${propertyName} is mandatory when ${keyName} is present`);
          });
      } else if (!type.isValid(obj)) {
        errors.push(type.errors(obj, fieldName));
      }
    });
    return errors.flat(Infinity);
  }

  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }

  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }

  optional() {
    this.isMandatory = false;
    return this;
  }

  required() {
    this.isMandatory = true;
    return this;
  }

  notNull() {
    this.isNullable = false;
    return this;
  }
}

module.exports = {
  Schema,
};

},
"@xufa/schema/lib/standalone-helpers.js": function (module, exports, require) {
// Generated by scripts/generate-standalone-helpers.js (npm run build:helpers): do not edit.
// Source of the library functions that standalone code calls, written into it (see standalone.js). They are kept as
// text rather than read with toString(), which tools that rewrite code (coverage, minifiers) change.
// test/standalone.test.js checks that each one behaves as the library function it copies.
/* eslint-disable no-template-curly-in-string -- the sources are code, with template literals */
const HELPER_SOURCES = {
  codePointLength: {
    calls: [],
    source: [
      'function codePointLength(value) {',
      '  let count = 0;',
      '  for (let i = 0; i < value.length; i += 1) {',
      '    const code = value.charCodeAt(i);',
      '    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {',
      '      const next = value.charCodeAt(i + 1);',
      '      if (next >= 0xdc00 && next <= 0xdfff) {',
      '        i += 1;',
      '      }',
      '    }',
      '    count += 1;',
      '  }',
      '  return count;',
      '}',
    ].join('\n'),
  },
  deepEqual: {
    calls: [],
    source: [
      'function deepEqual(a, b) {',
      '  if (a === b) return true;',
      '  if (Number.isNaN(a) && Number.isNaN(b)) return true;',
      "  if (a && b && typeof a === 'object' && typeof b === 'object') {",
      '    if (a.constructor !== b.constructor) return false;',
      '    if (Array.isArray(a)) {',
      '      const l = a.length;',
      '      if (l !== b.length) return false;',
      '      for (let i = 0; i < l; i += 1) {',
      '        if (!deepEqual(a[i], b[i])) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a instanceof Map && b instanceof Map) {',
      '      if (a.size !== b.size) return false;',
      '      const keys = [...a.keys()];',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!b.has(key)) return false;',
      '      }',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!deepEqual(a.get(key), b.get(key))) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a instanceof Set && b instanceof Set) {',
      '      if (a.size !== b.size) return false;',
      '      const keys = [...a.keys()];',
      '      for (let i = 0; i < keys.length; i += 1) {',
      '        const key = keys[i];',
      '        if (!b.has(key)) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (ArrayBuffer.isView(a)) {',
      '      const l = a.length;',
      '      if (l !== b.length) return false;',
      '      for (let i = 0; i < l; i += 1) {',
      '        if (a[i] !== b[i]) return false;',
      '      }',
      '      return true;',
      '    }',
      '    if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags;',
      '    if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf();',
      '    if (a.toString !== Object.prototype.toString) return a.toString() === b.toString();',
      '    const keys = Object.keys(a);',
      '    if (keys.length !== Object.keys(b).length) return false;',
      '    for (let i = 0; i < keys.length; i += 1) {',
      '      const key = keys[i];',
      '      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;',
      '      if (!deepEqual(a[key], b[key])) return false;',
      '    }',
      '    return true;',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  hasDuplicates: {
    calls: ['deepEqual'],
    source: [
      'function hasDuplicates(value) {',
      "  if (value.some((item) => item !== null && typeof item === 'object')) {",
      '    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);',
      '  }',
      '  const seen = new Set();',
      '  for (let i = 0; i < value.length; i += 1) {',
      '    if (i in value && seen.has(value[i])) {',
      '      return true;',
      '    }',
      '    seen.add(value[i]);',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  pathName: {
    calls: [],
    source: [
      'function pathName(path) {',
      '  let name;',
      '  for (let i = 0; i < path.length; i += 1) {',
      '    const segment = path[i];',
      "    if (typeof segment === 'number') {",
      "      name = `${name === undefined ? 'Value' : name}[${segment}]`;",
      "    } else if (segment !== null && typeof segment === 'object') {",
      '      return `Key ${name ? `${name}.${segment.key}` : segment.key}`;',
      '    } else {',
      '      name = name ? `${name}.${segment}` : segment;',
      '    }',
      '  }',
      "  return name === undefined ? 'Value' : name;",
      '}',
    ].join('\n'),
  },
  errorObject: {
    calls: [],
    source: [
      'function errorObject(path, keyword, params, message) {',
      '  const last = path[path.length - 1];',
      "  const isPropertyName = last !== null && typeof last === 'object';",
      '  const keys = isPropertyName ? path.slice(0, -1).concat(last.key) : path.slice();',
      "  let pointer = '';",
      '  for (let i = 0; i < keys.length; i += 1) {',
      '    const key = `${keys[i]}`;',
      '    // Escaped only when it has one of the two characters to escape.',
      "    pointer += key.includes('~') || key.includes('/') ? `/${key.replace(/~/g, '~0').replace(/\\//g, '~1')}` : `/${key}`;",
      '  }',
      '  const error = { path: keys, pointer, keyword, params, message };',
      '  if (isPropertyName) {',
      '    error.propertyName = true;',
      '  }',
      '  return error;',
      '}',
    ].join('\n'),
  },
  isRfc1123Hostname: {
    calls: [],
    source: [
      'function isRfc1123Hostname(value) {',
      '  return (',
      '    value.length <= 253 &&',
      "    value.split('.').every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))",
      '  );',
      '}',
    ].join('\n'),
  },
  compareDate: {
    calls: [],
    source: [
      'function compareDate(d1, d2) {',
      '  if (!(d1 && d2)) {',
      '    return undefined;',
      '  }',
      '  if (d1 > d2) {',
      '    return 1;',
      '  }',
      '  return d1 < d2 ? -1 : 0;',
      '}',
    ].join('\n'),
  },
  compareTime: {
    calls: [],
    source: [
      'function compareTime(t1, t2) {',
      '  if (!(t1 && t2)) {',
      '    return undefined;',
      '  }',
      '  const ms1 = new Date(`2020-01-01T${t1}`).valueOf();',
      '  const ms2 = new Date(`2020-01-01T${t2}`).valueOf();',
      '  return ms1 && ms2 ? ms1 - ms2 : undefined;',
      '}',
    ].join('\n'),
  },
  compareDateTime: {
    calls: [],
    source: [
      'function compareDateTime(dt1, dt2) {',
      '  if (!(dt1 && dt2)) {',
      '    return undefined;',
      '  }',
      '  const ms1 = new Date(dt1).valueOf();',
      '  const ms2 = new Date(dt2).valueOf();',
      '  return ms1 && ms2 ? ms1 - ms2 : undefined;',
      '}',
    ].join('\n'),
  },
  isDate: {
    calls: [],
    source: [
      'function isDate(value) {',
      '  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);',
      '  if (!match) {',
      '    return false;',
      '  }',
      '  const year = Number(match[1]);',
      '  const month = Number(match[2]);',
      '  const day = Number(match[3]);',
      '  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);',
      '  const days = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];',
      '  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];',
      '}',
    ].join('\n'),
  },
  isTime: {
    calls: [],
    source: [
      'function isTime(value) {',
      '  const match = /^(\\d{2}):(\\d{2}):(\\d{2})(?:\\.\\d+)?(?:([zZ])|([+-])(\\d{2}):(\\d{2}))$/.exec(value);',
      '  if (!match) {',
      '    return false;',
      '  }',
      '  const hour = Number(match[1]);',
      '  const minute = Number(match[2]);',
      '  const second = Number(match[3]);',
      '  if (hour > 23 || minute > 59 || second > 60) {',
      '    return false;',
      '  }',
      '  let offset = 0;',
      '  if (!match[4]) {',
      '    const offsetHour = Number(match[6]);',
      '    const offsetMinute = Number(match[7]);',
      '    if (offsetHour > 23 || offsetMinute > 59) {',
      '      return false;',
      '    }',
      "    offset = (match[5] === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);",
      '  }',
      '  return second < 60 || (hour * 60 + minute - offset + 1440) % 1440 === 23 * 60 + 59;',
      '}',
    ].join('\n'),
  },
  isDateTime: {
    calls: ['isDate', 'isTime'],
    source: [
      'function isDateTime(value) {',
      '  const match = /^(.{10})[tT](.+)$/.exec(value);',
      '  return match !== null && isDate(match[1]) && isTime(match[2]);',
      '}',
    ].join('\n'),
  },
  isDuration: {
    calls: [],
    source: [
      'function isDuration(value) {',
      '  return /^P(?:(?:\\d+Y(?:\\d+M(?:\\d+D)?)?|\\d+M(?:\\d+D)?|\\d+D)(?:T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S))?|T(?:\\d+H(?:\\d+M(?:\\d+S)?)?|\\d+M(?:\\d+S)?|\\d+S)|\\d+W)$/.test(',
      '    value',
      '  );',
      '}',
    ].join('\n'),
  },
  isIpv4: {
    calls: [],
    source: [
      'function isIpv4(value) {',
      '  return /^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$/.test(value);',
      '}',
    ].join('\n'),
  },
  isIpv6: {
    calls: ['isIpv4'],
    source: [
      'function isIpv6(value) {',
      '  if (!/^[0-9A-Fa-f:.]+$/.test(value)) {',
      '    return false;',
      '  }',
      "  const halves = value.split('::');",
      '  if (halves.length > 2) {',
      '    return false;',
      '  }',
      "  const groups = halves.map((half) => (half === '' ? [] : half.split(':')));",
      '  const all = groups[groups.length - 1];',
      '  let count = 0;',
      "  if (all.length > 0 && all[all.length - 1].includes('.')) {",
      '    if (!isIpv4(all.pop())) {',
      '      return false;',
      '    }',
      '    count = 2;',
      '  }',
      '  const hextets = [].concat(...groups);',
      '  if (!hextets.every((group) => /^[0-9A-Fa-f]{1,4}$/.test(group))) {',
      '    return false;',
      '  }',
      '  count += hextets.length;',
      '  return halves.length === 2 ? count < 8 : count === 8;',
      '}',
    ].join('\n'),
  },
  punycodeAdapt: {
    calls: [],
    source: [
      'function punycodeAdapt(delta, points, isFirst) {',
      '  let result = Math.floor(delta / (isFirst ? 700 : 2));',
      '  result += Math.floor(result / points);',
      '  let k = 0;',
      '  while (result > 455) {',
      '    result = Math.floor(result / 35);',
      '    k += 36;',
      '  }',
      '  return k + Math.floor((36 * result) / (result + 38));',
      '}',
    ].join('\n'),
  },
  punycodeDecode: {
    calls: ['punycodeAdapt'],
    source: [
      'function punycodeDecode(input) {',
      '  const output = [];',
      "  const delimiter = input.lastIndexOf('-');",
      '  for (let j = 0; j < Math.max(delimiter, 0); j += 1) {',
      '    if (input.charCodeAt(j) >= 0x80) {',
      '      return undefined;',
      '    }',
      '    output.push(input.charCodeAt(j));',
      '  }',
      '  let n = 128;',
      '  let bias = 72;',
      '  let i = 0;',
      '  for (let index = delimiter < 0 ? 0 : delimiter + 1; index < input.length;) {',
      '    const old = i;',
      '    let weight = 1;',
      '    for (let k = 36; ; k += 36) {',
      '      if (index >= input.length) {',
      '        return undefined;',
      '      }',
      '      const code = input.charCodeAt(index);',
      '      index += 1;',
      '      let digit = 36;',
      '      if (code >= 48 && code <= 57) {',
      '        digit = code - 22;',
      '      } else if (code >= 65 && code <= 90) {',
      '        digit = code - 65;',
      '      } else if (code >= 97 && code <= 122) {',
      '        digit = code - 97;',
      '      }',
      '      if (digit >= 36 || digit > Math.floor((0x7fffffff - i) / weight)) {',
      '        return undefined;',
      '      }',
      '      i += digit * weight;',
      '      let t = k - bias;',
      '      if (k <= bias) {',
      '        t = 1;',
      '      } else if (k >= bias + 26) {',
      '        t = 26;',
      '      }',
      '      if (digit < t) {',
      '        break;',
      '      }',
      '      weight *= 36 - t;',
      '    }',
      '    bias = punycodeAdapt(i - old, output.length + 1, old === 0);',
      '    n += Math.floor(i / (output.length + 1));',
      '    i %= output.length + 1;',
      '    if (n > 0x10ffff) {',
      '      return undefined;',
      '    }',
      '    output.splice(i, 0, n);',
      '    i += 1;',
      '  }',
      '  return String.fromCodePoint(...output);',
      '}',
    ].join('\n'),
  },
  punycodeEncode: {
    calls: ['punycodeAdapt'],
    source: [
      'function punycodeEncode(input) {',
      '  const points = Array.from(input, (char) => char.codePointAt(0));',
      '  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);',
      '  let output = points',
      '    .filter((point) => point < 128)',
      '    .map((point) => String.fromCharCode(point))',
      "    .join('');",
      '  const basic = output.length;',
      '  let handled = basic;',
      '  if (basic > 0) {',
      "    output += '-';",
      '  }',
      '  let n = 128;',
      '  let delta = 0;',
      '  let bias = 72;',
      '  while (handled < points.length) {',
      '    // The smallest code point not handled yet.',
      '    let m = 0x10ffff;',
      '    for (let i = 0; i < points.length; i += 1) {',
      '      if (points[i] >= n && points[i] < m) {',
      '        m = points[i];',
      '      }',
      '    }',
      '    delta += (m - n) * (handled + 1);',
      '    n = m;',
      '    for (let i = 0; i < points.length; i += 1) {',
      '      if (points[i] < n) {',
      '        delta += 1;',
      '      }',
      '      if (points[i] === n) {',
      '        let q = delta;',
      '        for (let k = 36; ; k += 36) {',
      '          let t = k - bias;',
      '          if (k <= bias) {',
      '            t = 1;',
      '          } else if (k >= bias + 26) {',
      '            t = 26;',
      '          }',
      '          if (q < t) {',
      '            break;',
      '          }',
      '          output += digit(t + ((q - t) % (36 - t)));',
      '          q = Math.floor((q - t) / (36 - t));',
      '        }',
      '        output += digit(q);',
      '        bias = punycodeAdapt(delta, handled + 1, handled === basic);',
      '        delta = 0;',
      '        handled += 1;',
      '      }',
      '    }',
      '    delta += 1;',
      '    n += 1;',
      '  }',
      '  return output;',
      '}',
    ].join('\n'),
  },
  bidiClass: {
    calls: [],
    source: [
      'function bidiClass(char) {',
      '  if (/[\\u0600-\\u0605\\u0660-\\u0669\\u066B\\u066C\\u06DD\\u0890\\u0891\\u08E2]/u.test(char)) {',
      "    return 'AN';",
      '  }',
      '  if (/[0-9\\u06F0-\\u06F9\\u00B2\\u00B3\\u00B9\\u2070-\\u2079\\u2080-\\u2089\\uFF10-\\uFF19]/u.test(char)) {',
      "    return 'EN';",
      '  }',
      '  if (/[\\p{Mn}\\p{Me}]/u.test(char)) {',
      "    return 'NSM';",
      '  }',
      '  if (/[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Thaana}]/u.test(char)) {',
      "    return 'AL';",
      '  }',
      '  if (/[\\p{Script=Hebrew}\\p{Script=Nko}\\p{Script=Samaritan}\\p{Script=Mandaic}\\u200F]/u.test(char)) {',
      "    return 'R';",
      '  }',
      '  if (/[+-]/.test(char)) {',
      "    return 'ES';",
      '  }',
      '  if (/[,./:\\u00A0]/.test(char)) {',
      "    return 'CS';",
      '  }',
      '  if (/[#$%\\u00A2-\\u00A5\\u00B0\\u00B1]/u.test(char)) {',
      "    return 'ET';",
      '  }',
      "  return /[\\p{L}\\p{Mc}]/u.test(char) ? 'L' : 'ON';",
      '}',
    ].join('\n'),
  },
  hasValidBidi: {
    calls: ['bidiClass'],
    source: [
      'function hasValidBidi(label) {',
      '  const classes = Array.from(label, bidiClass);',
      '  const first = classes[0];',
      "  const last = classes.filter((type) => type !== 'NSM').pop();",
      "  if (first === 'R' || first === 'AL') {",
      '    return (',
      "      classes.every((type) => ['R', 'AL', 'AN', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) &&",
      "      ['R', 'AL', 'EN', 'AN'].includes(last) &&",
      "      !(classes.includes('EN') && classes.includes('AN'))",
      '    );',
      '  }',
      "  if (first === 'L') {",
      '    return (',
      "      classes.every((type) => ['L', 'EN', 'ES', 'CS', 'ET', 'ON', 'NSM'].includes(type)) && ['L', 'EN'].includes(last)",
      '    );',
      '  }',
      '  return false;',
      '}',
    ].join('\n'),
  },
  isULabel: {
    calls: [],
    source: [
      'function isULabel(label) {',
      '  const chars = Array.from(label);',
      "  if (label.length === 0 || label.normalize('NFC') !== label || /^\\p{M}/u.test(label)) {",
      '    return false;',
      '  }',
      "  if (label.startsWith('-') || label.endsWith('-') || label.slice(2, 4) === '--') {",
      '    return false;',
      '  }',
      '  const virama =',
      '    /[\\u094D\\u09CD\\u0A4D\\u0ACD\\u0B4D\\u0BCD\\u0C4D\\u0CCD\\u0D3B\\u0D3C\\u0D4D\\u0DCA\\u0E3A\\u0F84\\u1039\\u103A\\u1714\\u1734\\u17D2\\u1A60\\u1B44\\u1BAA\\u1BAB\\u1BF2\\u1BF3\\u2D7F\\uA806\\uA8C4\\uA953\\uA9C0\\uAAF6\\uABED]/u;',
      '  const joining = /[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Nko}\\p{Script=Mongolian}]/u;',
      '  return chars.every((char, i) => {',
      '    const before = chars[i - 1];',
      '    const after = chars[i + 1];',
      '    switch (char) {',
      "      case '\\u00DF':",
      "      case '\\u03C2':",
      "      case '\\u06FD':",
      "      case '\\u06FE':",
      "      case '\\u0F0B':",
      "      case '\\u3007':",
      '        return true;',
      "      case '\\u00B7':",
      "        return before === 'l' && after === 'l';",
      "      case '\\u0375':",
      '        return after !== undefined && /\\p{Script=Greek}/u.test(after);',
      "      case '\\u05F3':",
      "      case '\\u05F4':",
      '        return before !== undefined && /\\p{Script=Hebrew}/u.test(before);',
      "      case '\\u30FB':",
      '        return chars.some(',
      "          (other) => /[\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Han}]/u.test(other) && other !== '\\u30FB'",
      '        );',
      "      case '\\u200D':",
      '        return before !== undefined && virama.test(before);',
      "      case '\\u200C': {",
      '        if (before !== undefined && virama.test(before)) {',
      '          return true;',
      '        }',
      '        // Joining letters on both sides, marks between them skipped.',
      '        const left = chars',
      '          .slice(0, i)',
      '          .reverse()',
      '          .find((other) => !/\\p{Mn}/u.test(other));',
      '        const right = chars.slice(i + 1).find((other) => !/\\p{Mn}/u.test(other));',
      '        return left !== undefined && right !== undefined && joining.test(left) && joining.test(right);',
      '      }',
      '      default:',
      '        break;',
      '    }',
      '    if (/[\\u0660-\\u0669]/u.test(char)) {',
      '      return !chars.some((other) => /[\\u06F0-\\u06F9]/u.test(other));',
      '    }',
      '    if (/[\\u06F0-\\u06F9]/u.test(char)) {',
      '      return !chars.some((other) => /[\\u0660-\\u0669]/u.test(other));',
      '    }',
      '    // The code points RFC 5892 lists as DISALLOWED, marks among them.',
      '    // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own',
      '    if (/[\\u0640\\u07FA\\u302E\\u302F\\u3031-\\u3035\\u303B]/u.test(char)) {',
      '      return false;',
      '    }',
      "    return /[\\p{Ll}\\p{Lo}\\p{Lm}\\p{Mn}\\p{Mc}\\p{Nd}-]/u.test(char) && char.normalize('NFKC').toLowerCase() === char;",
      '  });',
      '}',
    ].join('\n'),
  },
  hasValidLabels: {
    calls: ['punycodeDecode', 'punycodeEncode', 'bidiClass', 'hasValidBidi', 'isULabel'],
    source: [
      'function hasValidLabels(value, isIdn) {',
      '  // A name of letter-digit-hyphen labels needs no mapping and has no right-to-left label: without "--" in the third and',
      '  // fourth positions of a label (RFC 5891), which only a punycode label ("xn--") may have and the full check reads, it',
      '  // only has to be at most 253 characters long.',
      '  if (',
      '    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(value) &&',
      '    !/(?:^|\\.)[A-Za-z0-9-]{2}--/.test(value)',
      '  ) {',
      '    return value.length <= 253;',
      '  }',
      '  const mapped = isIdn',
      '    ? value',
      "        .normalize('NFKC')",
      "        .replace(/[\\u3002\\uFF0E\\uFF61]/gu, '.')",
      '        // Code points the mapping removes (soft hyphen, zero width space, variation selectors...).',
      '        // eslint-disable-next-line no-misleading-character-class -- each one is a code point on its own',
      "        .replace(/[\\u00AD\\u200B\\u2060\\uFEFF\\u180B-\\u180D\\uFE00-\\uFE0F]/gu, '')",
      '        .toLowerCase()',
      '    : value;',
      '  if (!isIdn && !/^[\\x21-\\x7E]*$/.test(mapped)) {',
      '    return false;',
      '  }',
      "  const labels = mapped.split('.');",
      '  const unicode = [];',
      '  const ascii = [];',
      '  const valid = labels.every((label) => {',
      '    if (/^xn--/i.test(label)) {',
      '      const decoded = punycodeDecode(label.slice(4).toLowerCase());',
      '      if (',
      '        decoded === undefined ||',
      '        Array.from(decoded).every((char) => char.charCodeAt(0) < 0x80) ||',
      '        punycodeEncode(decoded) !== label.slice(4).toLowerCase() ||',
      '        !isULabel(decoded)',
      '      ) {',
      '        return false;',
      '      }',
      '      unicode.push(decoded);',
      '      ascii.push(label);',
      '      return label.length <= 63;',
      '    }',
      '    if (Array.from(label).every((char) => char.charCodeAt(0) < 0x80)) {',
      '      unicode.push(label);',
      '      ascii.push(label);',
      '      return (',
      '        /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label) &&',
      "        !(label.slice(2, 4) === '--' && !/^xn--/i.test(label))",
      '      );',
      '    }',
      '    if (!isIdn || !isULabel(label)) {',
      '      return false;',
      '    }',
      '    unicode.push(label);',
      '    ascii.push(`xn--${punycodeEncode(label)}`);',
      '    return ascii[ascii.length - 1].length <= 63;',
      '  });',
      "  if (!valid || ascii.join('.').length > 253) {",
      '    return false;',
      '  }',
      '  // With a right-to-left label, every label follows the Bidi rule.',
      "  const isRtl = unicode.some((label) => Array.from(label).some((char) => ['R', 'AL', 'AN'].includes(bidiClass(char))));",
      '  return !isRtl || unicode.every(hasValidBidi);',
      '}',
    ].join('\n'),
  },
  isHostname: {
    calls: ['hasValidLabels'],
    source: ['function isHostname(value) {', '  return hasValidLabels(value, false);', '}'].join('\n'),
  },
  isIdnHostname: {
    calls: ['hasValidLabels'],
    source: ['function isIdnHostname(value) {', '  return hasValidLabels(value, true);', '}'].join('\n'),
  },
  isEmailWith: {
    calls: ['isIpv4', 'isIpv6'],
    source: [
      'function isEmailWith(value, isIdn, isHost) {',
      "  const at = value.lastIndexOf('@');",
      '  if (at <= 0 || at === value.length - 1) {',
      '    return false;',
      '  }',
      '  const local = value.slice(0, at);',
      '  const domain = value.slice(at + 1);',
      '  // Literals, which are compiled once (a RegExp made here would be compiled on every call).',
      '  const dotAtom = isIdn',
      "    ? /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~\\u0080-\\u{10FFFF}-]+)*$/u",
      "    : /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;",
      "  // A quoted local part: printable ASCII but '\"' and '\\', which are escaped, and in idn-email other characters too.",
      '  const quoted = isIdn',
      '    ? /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E\\u0080-\\u{10FFFF}]|\\\\[\\x20-\\x7E])*"$/u',
      '    : /^"(?:[\\x20\\x21\\x23-\\x5B\\x5D-\\x7E]|\\\\[\\x20-\\x7E])*"$/;',
      '  if (!dotAtom.test(local) && !quoted.test(local)) {',
      '    return false;',
      '  }',
      '  const literal = domain.charCodeAt(0) === 0x5b ? /^\\[(?:IPv6:(.+)|(.+))\\]$/i.exec(domain) : null;',
      '  if (literal) {',
      '    return literal[1] !== undefined ? isIpv6(literal[1]) : isIpv4(literal[2]);',
      '  }',
      '  return isHost(domain);',
      '}',
    ].join('\n'),
  },
  isEmail: {
    calls: ['isHostname', 'isEmailWith'],
    source: ['function isEmail(value) {', '  return isEmailWith(value, false, isHostname);', '}'].join('\n'),
  },
  isIdnEmail: {
    calls: ['isIdnHostname', 'isEmailWith'],
    source: ['function isIdnEmail(value) {', '  return isEmailWith(value, true, isIdnHostname);', '}'].join('\n'),
  },
  isRegex: {
    calls: [],
    source: [
      'function isRegex(value) {',
      '  try {',
      "    RegExp(value, 'u');",
      '    return true;',
      '  } catch (e) {',
      '    return false;',
      '  }',
      '}',
    ].join('\n'),
  },
};

module.exports = { HELPER_SOURCES };

},
"@xufa/schema/lib/standalone.js": function (module, exports, require) {
// Standalone code: compiled validators written out as JavaScript source, to save to a file when building and load like
// any module. Loading it generates no code (no new Function), so it runs under a strict Content Security Policy and
// where code generation is disabled, and it needs nothing else: the helpers it calls are written into it.
const { generateSource } = require('./compile');
const { fromJsonSchema } = require('./json-schema');
const { deepEqual } = require('./deep-equal');
const { codePointLength } = require('./types/code-point-length');
const { hasDuplicates } = require('./types/has-duplicates');
const { isPlainObject, toType } = require('./types/validate-type');
const { HELPER_SOURCES } = require('./standalone-helpers');
const { FORMAT_FUNCTIONS } = require('./formats');
const { errorObject, pathName } = require('./error-objects');
const { version } = require('../package.json');

// Library functions the generated code calls, by the name their source (standalone-helpers.js) defines: the helpers
// of the checks, and the functions of the formats.
const HELPERS = new Map([
  [codePointLength, 'codePointLength'],
  [deepEqual, 'deepEqual'],
  [hasDuplicates, 'hasDuplicates'],
  [pathName, 'pathName'],
  [errorObject, 'errorObject'],
  ...Object.entries(FORMAT_FUNCTIONS).map(([name, fn]) => [fn, name]),
]);

const RESERVED = new Set(
  (
    'break case catch class const continue debugger default delete do else enum export extends false finally for ' +
    'function if import in instanceof new null return super switch this throw true try typeof var void while with ' +
    'yield let static implements interface package private protected public await arguments eval undefined NaN ' +
    'Infinity module exports require'
  ).split(' ')
);

// Code for a value the generated code compares with: primitives, and arrays and plain objects of them.
function valueSource(value) {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return 'NaN';
    }
    if (!Number.isFinite(value)) {
      return value > 0 ? 'Infinity' : '-Infinity';
    }
    return Object.is(value, -0) ? '-0' : String(value);
  }
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${Array.from(value, (item, i) => (i in value ? valueSource(item) : '')).join(', ')}]`;
  }
  if (isPlainObject(value)) {
    // Computed keys, so a "__proto__" key is an own property, as JSON.parse() makes it.
    const entries = Object.entries(value).map(([key, item]) => `[${JSON.stringify(key)}]: ${valueSource(item)}`);
    return `{ ${entries.join(', ')} }`;
  }
  throw new Error(
    `Standalone code cannot contain the value ${String(value)}: only primitives, arrays and plain objects`
  );
}

// Code for a constant of the generated code, adding the names of the helpers it needs to `helpers`.
function constantSource(value, helpers) {
  if (typeof value === 'function') {
    const name = HELPERS.get(value);
    if (name === undefined && value.validatorKeyword !== undefined) {
      throw new Error(
        `Standalone code cannot contain the functions of the keyword "${value.validatorKeyword}": define it as a macro, or compile the schema with compileJsonSchema() instead`
      );
    }
    if (name === undefined) {
      throw new Error(`Standalone code cannot contain the function ${value.name || '(anonymous)'}`);
    }
    const add = (helper) => {
      helpers.add(helper);
      HELPER_SOURCES[helper].calls.forEach(add);
    };
    add(name);
    return name;
  }
  if (value instanceof RegExp) {
    return `new RegExp(${JSON.stringify(value.source)}, ${JSON.stringify(value.flags)})`;
  }
  if (value instanceof Set) {
    return `new Set([${Array.from(value, valueSource).join(', ')}])`;
  }
  return valueSource(value);
}

// An expression giving the validation function of `type`, as compileType(type, options) returns it.
function validatorSource(type, options, helpers) {
  const { mode, source, constants, nodes } = generateSource(toType(type, 'Standalone type'), options);
  if (nodes.length > 0) {
    const names = [...new Set(nodes.map((node) => node.constructor.name))].join(', ');
    throw new Error(
      `Standalone code cannot contain types of your own (${names}): their validate() runs when validating; compile them with compile() instead`
    );
  }
  const code = `const c = [${constants.map((value) => constantSource(value, helpers)).join(', ')}];\n`;
  const factory = `(function () {\n${code}${source}\n})()`;
  if (mode !== 'first') {
    return factory;
  }
  // The first error in a list, as compileType() gives it with allErrors: false.
  return `(function () {
const first = ${factory};
return function validate(value) {
const error = first(value);
return error === undefined ? [] : [error];
};
})()`;
}

// A module with the validators of `entries` ([name, type]): the one without name is the default export.
function moduleSource(entries, options) {
  const format = options.format === undefined ? 'commonjs' : options.format;
  if (format !== 'commonjs' && format !== 'esm') {
    throw new Error(`Unsupported standalone option "format": "${format}" is not "commonjs" or "esm"`);
  }
  const helpers = new Set();
  const validators = entries.map(([name, type]) => {
    if (name !== undefined && (!/^[A-Za-z_$][\w$]*$/.test(name) || RESERVED.has(name) || name === 'c')) {
      throw new Error(`Standalone validator name "${name}" is not a valid JavaScript name`);
    }
    return [name, validatorSource(type, options, helpers)];
  });
  const clash = validators.find(([name]) => helpers.has(name));
  if (clash) {
    throw new Error(`Standalone validator name "${clash[0]}" is the name of a helper of the generated code`);
  }
  let code = `// Generated by @xufa/schema ${version}: do not edit, generate it again instead.\n`;
  if (format === 'commonjs') {
    code += "'use strict';\n";
  }
  code += [...helpers].map((helper) => `${HELPER_SOURCES[helper].source}\n`).join('');
  validators.forEach(([name, source]) => {
    code += `const ${name === undefined ? 'validate' : name} = ${source};\n`;
  });
  const names = validators.map(([name]) => name).filter((name) => name !== undefined);
  if (names.length === 0) {
    code +=
      format === 'commonjs'
        ? 'module.exports = validate;\nmodule.exports.default = validate;\n'
        : 'export default validate;\n';
  } else {
    code += format === 'commonjs' ? `module.exports = { ${names.join(', ')} };\n` : `export { ${names.join(', ')} };\n`;
  }
  return code;
}

// Source of a module whose default export (module.exports in CommonJS) is the function compileType(type, options)
// returns. options: those of compile() (allErrors, errors), and format: 'commonjs' (default) or 'esm'.
function standaloneCode(type, options = {}) {
  return moduleSource([[undefined, type]], options);
}

// Source of a module exporting a validation function for each entry of `validators` ({ name: type }), with the
// options of standaloneCode().
function standaloneModule(validators, options = {}) {
  if (!isPlainObject(validators) || Object.keys(validators).length === 0) {
    throw new Error('standaloneModule() expects an object of types by the names to export them with');
  }
  return moduleSource(Object.entries(validators), options);
}

// standaloneCode() for a JSON Schema, with the options of compileJsonSchema() (schemas, draft) too.
function standaloneJsonSchema(json, options = {}) {
  return standaloneCode(fromJsonSchema(json, options), options);
}

module.exports = {
  standaloneCode,
  standaloneModule,
  standaloneJsonSchema,
};

},
"@xufa/schema/lib/types/all-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

// Value must satisfy every type; reports the errors of the first type that fails.
class AllOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'AllOf types') || [];
  }

  // The errors of every type the value fails. The field name goes to them as received: undefined for the value
  // itself, so a Schema names its keys as it does on its own.
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      const errors = this.types.filter((type) => !type.isValid(value)).map((type) => type.errors(value, fieldName));
      if (errors.length <= 1) {
        return errors[0];
      }
      return errors.flat(Infinity);
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (!this.types[i].isValid(value)) {
        return false;
      }
    }
    return true;
  }
}

function AllOf(options) {
  return new AllOfType(options);
}

function allOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AllOfType(types);
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

function oallOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AllOfType({ isMandatory: false, ...types });
  }
  return new AllOfType({ types, isMandatory, isNullable });
}

module.exports = {
  AllOfType,
  AllOf,
  allOf,
  oallOf,
};

},
"@xufa/schema/lib/types/any-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

class AnyOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'AnyOf types');
  }

  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (this.isValid(value)) {
        return undefined;
      }
      return this.types.map((type) => type.errors(value, fieldName));
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (!this.types || this.types.length === 0) {
      return true;
    }
    for (let i = 0; i < this.types.length; i += 1) {
      if (this.types[i].isValid(value)) {
        return true;
      }
    }
    return false;
  }
}

function AnyOf(options) {
  return new AnyOfType(options);
}

function anyOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AnyOfType(types);
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

function oanyOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new AnyOfType({ isMandatory: false, ...types });
  }
  return new AnyOfType({ types, isMandatory, isNullable });
}

module.exports = {
  AnyOfType,
  AnyOf,
  anyOf,
  oanyOf,
};

},
"@xufa/schema/lib/types/any.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class AnyType extends ValidateType {
  isValid(value) {
    return this.checkPresence(value) ?? true;
  }
}

function Any(options) {
  return new AnyType(options);
}

function any(isMandatory = true, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new AnyType(isMandatory);
  }
  return new AnyType({ isMandatory, isNullable });
}

function oany(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new AnyType({ isMandatory: false, ...isMandatory });
  }
  return new AnyType({ isMandatory, isNullable });
}

module.exports = {
  AnyType,
  Any,
  any,
  oany,
};

},
"@xufa/schema/lib/types/array-of.js": function (module, exports, require) {
const { hasDuplicates } = require('./has-duplicates');
const { assignDefaults } = require('../defaults');
const { readCoerced } = require('../coerce');
const { ValidateType, isPlainObject, toType, toTypes } = require('./validate-type');

class ArrayOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    // A type for every element, or an array of types for the elements at each position (a tuple).
    this.type = Array.isArray(options.type)
      ? toTypes(options.type, 'ArrayOf type')
      : toType(options.type, 'ArrayOf type');
    this.min = options.min;
    this.max = options.max;
    // [{ key, value, empty }]: defaults assigned to missing positions of a tuple before checking it (useDefaults).
    this.defaults = options.defaults || [];
    this.unique = options.unique;
    // At least one element must satisfy it, or between minContains (default 1) and maxContains elements.
    this.contains = toType(options.contains, 'ArrayOf contains');
    this.minContains = options.minContains;
    this.maxContains = options.maxContains;
    // With a tuple, the elements after its last position must satisfy it.
    this.additionalType = toType(options.additionalType, 'ArrayOf additionalType');
  }

  // Number of elements matching contains, counted only as far as the limits need.
  countMatches(value) {
    const min = this.minContains === undefined ? 1 : this.minContains;
    const stop = this.maxContains === undefined ? min : this.maxContains + 1;
    let count = 0;
    for (let i = 0; i < value.length && count < stop; i += 1) {
      if (this.contains.isValid(value[i])) {
        count += 1;
      }
    }
    return count;
  }

  hasMatches(value) {
    const count = this.countMatches(value);
    const min = this.minContains === undefined ? 1 : this.minContains;
    return count >= min && (this.maxContains === undefined || count <= this.maxContains);
  }

  // Error of the elements matching contains, or undefined.
  containsError(value, fieldName) {
    const min = this.minContains === undefined ? 1 : this.minContains;
    const max = this.maxContains;
    const count = this.countMatches(value);
    if (count < min) {
      return min === 1
        ? `${fieldName} must contain at least one matching element`
        : `${fieldName} must contain at least ${min} matching elements`;
    }
    if (max !== undefined && count > max) {
      return max === 1
        ? `${fieldName} must contain at most one matching element`
        : `${fieldName} must contain at most ${max} matching elements`;
    }
    return undefined;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!Array.isArray(value)) {
        return `${fieldName} must be an array`;
      }
      if (this.defaults.length > 0) {
        assignDefaults(value, this.defaults);
      }
      if (this.min !== undefined && value.length < this.min) {
        return `${fieldName} must have at least ${this.min} elements`;
      }
      if (this.max !== undefined && value.length > this.max) {
        return `${fieldName} must have at most ${this.max} elements`;
      }
      if (this.unique && hasDuplicates(value)) {
        return `${fieldName} must not have duplicate elements`;
      }
      const containsError = this.contains && this.containsError(value, fieldName);
      if (containsError) {
        return containsError;
      }
      if (this.type) {
        const errors = [];
        const check = (type, i) => {
          // With coerceTypes, an element is converted to the types of its schema as it is read (see coerce.js).
          const item = readCoerced(value, i, type, value[i]);
          if (!type.isValid(item)) {
            errors.push(type.errors(item, `${fieldName}[${i}]`));
          }
        };
        if (Array.isArray(this.type)) {
          for (let i = 0; i < this.type.length; i += 1) {
            check(this.type[i], i);
          }
          if (this.additionalType) {
            for (let i = this.type.length; i < value.length; i += 1) {
              check(this.additionalType, i);
            }
          }
        } else {
          for (let i = 0; i < value.length; i += 1) {
            check(this.type, i);
          }
        }
        return errors.flat();
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (Array.isArray(value) && this.defaults.length > 0) {
      assignDefaults(value, this.defaults);
    }
    if (
      !Array.isArray(value) ||
      (this.min !== undefined && value.length < this.min) ||
      (this.max !== undefined && value.length > this.max) ||
      (this.unique && hasDuplicates(value)) ||
      (this.contains && !this.hasMatches(value))
    ) {
      return false;
    }
    if (Array.isArray(this.type)) {
      for (let i = 0; i < this.type.length; i += 1) {
        if (!this.type[i].isValid(readCoerced(value, i, this.type[i], value[i]))) {
          return false;
        }
      }
      if (this.additionalType) {
        for (let i = this.type.length; i < value.length; i += 1) {
          if (!this.additionalType.isValid(readCoerced(value, i, this.additionalType, value[i]))) {
            return false;
          }
        }
      }
    } else if (this.type) {
      for (let i = 0; i < value.length; i += 1) {
        if (!this.type.isValid(readCoerced(value, i, this.type, value[i]))) {
          return false;
        }
      }
    }
    return true;
  }
}

function ArrayOf(options) {
  return new ArrayOfType(options);
}

const OPTION_KEYS = [
  'type',
  'min',
  'max',
  'unique',
  'contains',
  'minContains',
  'maxContains',
  'additionalType',
  'isMandatory',
  'isNullable',
];

// The first argument of arrOf() is the options when it is a plain object that is empty or has an option key;
// otherwise it is the type of the elements (a type, a schema, or a plain object of types).
function isOptions(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length === 0 || keys.some((key) => OPTION_KEYS.includes(key));
}

function arrOf(type, min, max, isMandatory = true, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType(type);
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}

function oarrOf(type, min, max, isMandatory = false, isNullable = false) {
  if (isOptions(type)) {
    return new ArrayOfType({ isMandatory: false, ...type });
  }
  return new ArrayOfType({ type, min, max, isMandatory, isNullable });
}

module.exports = {
  ArrayOfType,
  ArrayOf,
  arrOf,
  oarrOf,
};

},
"@xufa/schema/lib/types/boolean.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class BooleanType extends ValidateType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && typeof value !== 'boolean') {
      return `${fieldName} must be a boolean`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? typeof value === 'boolean';
  }
}

function Boolean(options) {
  return new BooleanType(options);
}

function bool(isMandatory = true, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new BooleanType(isMandatory);
  }
  return new BooleanType({ isMandatory, isNullable });
}

function obool(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new BooleanType({ isMandatory: false, ...isMandatory });
  }
  return new BooleanType({ isMandatory, isNullable });
}

module.exports = {
  BooleanType,
  Boolean,
  bool,
  obool,
};

},
"@xufa/schema/lib/types/code-point-length.js": function (module, exports, require) {
// Length in Unicode code points, as JSON Schema counts it: a surrogate pair is one character. Same as [...value].length
// without building an array.
function codePointLength(value) {
  let count = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i += 1;
      }
    }
    count += 1;
  }
  return count;
}

// A string has between length / 2 and length code points, so the UTF-16 length decides the comparison unless it is
// close to the limit; only then are code points counted.
function hasFewerCodePoints(value, min) {
  return value.length < min || (value.length < 2 * min && codePointLength(value) < min);
}

function hasMoreCodePoints(value, max) {
  return value.length > 2 * max || (value.length > max && codePointLength(value) > max);
}

module.exports = {
  codePointLength,
  hasFewerCodePoints,
  hasMoreCodePoints,
};

},
"@xufa/schema/lib/types/conditional.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// When the value satisfies `ifType` it must satisfy `thenType`, otherwise `elseType`; a missing branch accepts
// anything. Only the errors of the branch are reported, like JSON Schema if/then/else.
class ConditionalType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.ifType = toType(options.ifType, 'Conditional ifType');
    this.thenType = toType(options.thenType, 'Conditional thenType');
    this.elseType = toType(options.elseType, 'Conditional elseType');
  }

  branch(value) {
    return this.ifType.isValid(value) ? this.thenType : this.elseType;
  }

  // The field name goes to the branch as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const result = super.validate(value, fieldName || 'Value');
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      const branch = this.branch(value);
      if (branch && !branch.isValid(value)) {
        return branch.errors(value, fieldName);
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    const branch = this.branch(value);
    return !branch || branch.isValid(value);
  }
}

function Conditional(options) {
  return new ConditionalType(options);
}

module.exports = {
  ConditionalType,
  Conditional,
};

},
"@xufa/schema/lib/types/enum.js": function (module, exports, require) {
const { StringType } = require('./string');

class EnumType extends StringType {
  constructor(options = {}) {
    super(options);
    this.options = options.options;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!this.options.includes(value)) {
        return `${fieldName} must be one of: ${this.options.join(', ')}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    return super.isValid(value) && (value === undefined || value === null || this.options.includes(value));
  }
}

function Enum(options) {
  return new EnumType(options);
}

function enumt(options, isMandatory = true, isNullable = false) {
  if (options !== undefined && options !== null && !Array.isArray(options) && typeof options === 'object') {
    return new EnumType(options);
  }
  return new EnumType({ options, isMandatory, isNullable });
}

function oenumt(options, isMandatory = false, isNullable = false) {
  if (options !== undefined && options !== null && !Array.isArray(options) && typeof options === 'object') {
    return new EnumType({ isMandatory: false, ...options });
  }
  return new EnumType({ options, isMandatory, isNullable });
}

module.exports = {
  EnumType,
  Enum,
  enumt,
  oenumt,
  oenum: oenumt,
};

},
"@xufa/schema/lib/types/float.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

class FloatType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.exclusiveMin = options.exclusiveMin;
    this.exclusiveMax = options.exclusiveMax;
    // Value divided by it must be an integer (floating point division, so 0.3 is not a multiple of 0.1), or with
    // multipleOfPrecision (a number of decimal digits) within 1e-multipleOfPrecision of one, as ajv's option.
    this.multipleOf = options.multipleOf;
    this.multipleOfPrecision = options.multipleOfPrecision;
  }

  isMultiple(value) {
    const division = value / this.multipleOf;
    if (this.multipleOfPrecision === undefined) {
      return Number.isInteger(division);
    }
    // As ajv writes it: a division that is not finite is not "too far" from an integer.
    return !(Math.abs(Math.round(division) - division) > Number(`1e-${this.multipleOfPrecision}`));
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return `${fieldName} must be a number`;
      }
      if (this.min !== undefined && value < this.min) {
        return `${fieldName} must be at least ${this.min}`;
      }
      if (this.max !== undefined && value > this.max) {
        return `${fieldName} must be at most ${this.max}`;
      }
      if (this.exclusiveMin !== undefined && value <= this.exclusiveMin) {
        return `${fieldName} must be greater than ${this.exclusiveMin}`;
      }
      if (this.exclusiveMax !== undefined && value >= this.exclusiveMax) {
        return `${fieldName} must be less than ${this.exclusiveMax}`;
      }
      if (this.multipleOf !== undefined && !this.isMultiple(value)) {
        return `${fieldName} must be a multiple of ${this.multipleOf}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (this.min === undefined || value >= this.min) &&
      (this.max === undefined || value <= this.max) &&
      (this.exclusiveMin === undefined || value > this.exclusiveMin) &&
      (this.exclusiveMax === undefined || value < this.exclusiveMax) &&
      (this.multipleOf === undefined || this.isMultiple(value))
    );
  }
}

function Float(options) {
  return new FloatType(options);
}

function float(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new FloatType(min);
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

function ofloat(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new FloatType({ isMandatory: false, ...min });
  }
  return new FloatType({ min, max, isMandatory, isNullable });
}

module.exports = {
  FloatType,
  Float,
  float,
  ofloat,
  num: float,
  onum: ofloat,
};

},
"@xufa/schema/lib/types/has-duplicates.js": function (module, exports, require) {
const { deepEqual } = require('../deep-equal');

// An element is a duplicate when an earlier index (holes read as undefined) is deep-equal to it.
// Primitive arrays use a Set, which has the same equality as deepEqual for primitives (NaN included).
function hasDuplicates(value) {
  if (value.some((item) => item !== null && typeof item === 'object')) {
    return value.some((item, i) => value.findIndex((other) => deepEqual(item, other)) !== i);
  }
  const seen = new Set();
  for (let i = 0; i < value.length; i += 1) {
    if (i in value && seen.has(value[i])) {
      return true;
    }
    seen.add(value[i]);
  }
  return false;
}

module.exports = {
  hasDuplicates,
};

},
"@xufa/schema/lib/types/index.js": function (module, exports, require) {
const allOf = require('./all-of');
const any = require('./any');
const anyOf = require('./any-of');
const arrayOf = require('./array-of');
const boolean = require('./boolean');
const conditional = require('./conditional');
const enums = require('./enum');
const float = require('./float');
const integer = require('./integer');
const keyword = require('./keyword');
const never = require('./never');
const not = require('./not');
const obj = require('./obj');
const oneOf = require('./one-of');
const ref = require('./ref');
const string = require('./string');
const validateType = require('./validate-type');
const values = require('./values');
const when = require('./when');

module.exports = {
  ...allOf,
  ...any,
  ...anyOf,
  ...arrayOf,
  ...boolean,
  ...conditional,
  ...enums,
  ...float,
  ...integer,
  ...keyword,
  ...never,
  ...not,
  ...obj,
  ...oneOf,
  ...ref,
  ...string,
  ...validateType,
  ...values,
  ...when,
};

},
"@xufa/schema/lib/types/integer.js": function (module, exports, require) {
const { FloatType } = require('./float');

class IntegerType extends FloatType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (!Number.isInteger(value)) {
        return `${fieldName} must be an integer`;
      }
    }
    return undefined;
  }

  isValid(value) {
    return super.isValid(value) && (value === undefined || value === null || Number.isInteger(value));
  }
}

function Integer(options) {
  return new IntegerType(options);
}

function int(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new IntegerType(min);
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

function oint(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new IntegerType({ isMandatory: false, ...min });
  }
  return new IntegerType({ min, max, isMandatory, isNullable });
}

module.exports = {
  IntegerType,
  Integer,
  int,
  oint,
};

},
"@xufa/schema/lib/types/keyword.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

// Tests of the JSON types a keyword of your own can be limited to. null never reaches them: whether a node accepts null
// is worked out when converting (see acceptsNull() in json-schema.js).
const KEYWORD_TYPE_TESTS = {
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
  object: (value) => typeof value === 'object' && !Array.isArray(value),
  array: (value) => Array.isArray(value),
  null: (value) => value === null,
};

// A keyword of your own (the option "keywords" of compileJsonSchema()): `check`, a function or a regular expression,
// tells whether the value passes it, and `message` gives the text after the name of the value, or `message(value)`
// does. With `jsonTypes`, it only checks values of those JSON types, as the keywords of JSON Schema do.
class KeywordType extends ValidateType {
  constructor(options = {}) {
    super(options);
    if (typeof options.check !== 'function' && !(options.check instanceof RegExp)) {
      throw new Error('KeywordType check must be a function or a regular expression');
    }
    this.keyword = options.keyword;
    this.check = options.check;
    this.message = options.message;
    this.jsonTypes = options.jsonTypes;
  }

  // Whether the keyword checks the value (neither undefined nor null).
  applies(value) {
    return !this.jsonTypes || this.jsonTypes.some((jsonType) => KEYWORD_TYPE_TESTS[jsonType](value));
  }

  passes(value) {
    return this.check instanceof RegExp ? this.check.test(value) : Boolean(this.check(value));
  }

  messageOf(value) {
    return typeof this.message === 'function' ? this.message(value) : this.message;
  }

  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && this.applies(value) && !this.passes(value)) {
      return `${name} ${this.messageOf(value)}`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? (!this.applies(value) || this.passes(value));
  }
}

module.exports = {
  KeywordType,
  KEYWORD_TYPE_TESTS,
};

},
"@xufa/schema/lib/types/never.js": function (module, exports, require) {
const { ValidateType } = require('./validate-type');

// No value is valid, like the JSON Schema false: only undefined (when not mandatory) and null (when nullable) pass.
class NeverType extends ValidateType {
  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      return `${fieldName} is not allowed`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? false;
  }
}

function Never(options) {
  return new NeverType(options);
}

function never(isMandatory = false, isNullable = false) {
  if (isMandatory !== undefined && isMandatory !== null && typeof isMandatory === 'object') {
    return new NeverType({ isMandatory: false, ...isMandatory });
  }
  return new NeverType({ isMandatory, isNullable });
}

module.exports = {
  NeverType,
  Never,
  never,
};

},
"@xufa/schema/lib/types/not.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// Value must not satisfy `type`.
class NotType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.type = toType(options.type, 'Not type');
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && this.type.isValid(value)) {
      return `${fieldName} must not match the excluded schema`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? !this.type.isValid(value);
  }
}

function Not(options) {
  return new NotType(options);
}

function not(type, isMandatory = true, isNullable = false) {
  if (type !== undefined && type !== null && !(type instanceof ValidateType) && typeof type === 'object') {
    return new NotType(type);
  }
  return new NotType({ type, isMandatory, isNullable });
}

function onot(type, isMandatory = false, isNullable = false) {
  if (type !== undefined && type !== null && !(type instanceof ValidateType) && typeof type === 'object') {
    return new NotType({ isMandatory: false, ...type });
  }
  return new NotType({ type, isMandatory, isNullable });
}

module.exports = {
  NotType,
  Not,
  not,
  onot,
};

},
"@xufa/schema/lib/types/obj.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

class ObjType extends ValidateType {
  constructor(options = {}) {
    super(options);
    // The shape as given, which a Schema around it turns into a nested schema with its options (see visitObjs()), and
    // the type it stands for: a plain object of types is a Schema.
    this.shape = options.schema;
    this.schema = toType(options.schema, 'Obj schema');
  }

  // The field name goes to the schema as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return `${name} must be an object`;
      }
      if (this.schema) return this.schema.validate(value, fieldName);
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return !this.schema || this.schema.isValid(value);
  }
}

function Obj(options) {
  return new ObjType(options);
}

const OPTION_KEYS = ['schema', 'isMandatory', 'isNullable'];

// The first argument of obj() is the options when it is a plain object that is empty or has an option key; otherwise
// it is the shape of the object (a plain object of types), like arrOf().
const isOptions = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof ValidateType) &&
  (Object.keys(value).length === 0 || Object.keys(value).some((key) => OPTION_KEYS.includes(key)));

function obj(schema, isMandatory = true, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType(schema);
  }
  return new ObjType({ schema, isMandatory, isNullable });
}

function oobj(schema, isMandatory = false, isNullable = false) {
  if (isOptions(schema)) {
    return new ObjType({ isMandatory: false, ...schema });
  }
  return new ObjType({ schema, isMandatory, isNullable });
}

module.exports = {
  ObjType,
  Obj,
  obj,
  oobj,
};

},
"@xufa/schema/lib/types/one-of.js": function (module, exports, require) {
const { ValidateType, toTypes } = require('./validate-type');

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// What a discriminator picks for a value (see OneOfType.pick()): no type (the value is invalid), or every type as
// oneOf checks them.
const NO_TYPE = -1;
const EVERY_TYPE = -2;

// Value must satisfy exactly one of the types. When none does, reports the errors of every type, like AnyOfType.
// With `discriminator` ({ tag, mapping, exact, auto }: the index of the type for each value of the property `tag`), an
// object is checked only against the type its value of `tag` picks (see discriminatorOf() in json-schema.js).
class OneOfType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.types = toTypes(options.types, 'OneOf types') || [];
    this.discriminator = options.discriminator;
  }

  // The index of the type a discriminator picks for the value: the one the value of its tag (an own property) names;
  // NO_TYPE for an object whose tag names none; EVERY_TYPE without a discriminator, for other values, and for an
  // object whose tag names none when the discriminator was found in a plain oneOf (`auto`), which checks it as oneOf.
  pick(value) {
    if (!this.discriminator || !isObject(value)) {
      return EVERY_TYPE;
    }
    const { tag, mapping, auto } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : undefined;
    if (typeof tagValue === 'string' && mapping.has(tagValue)) {
      return mapping.get(tagValue);
    }
    return auto ? EVERY_TYPE : NO_TYPE;
  }

  // The error about the tag of an object whose tag names no type, after the name of the tag.
  tagError(value) {
    const { tag, mapping } = this.discriminator;
    const tagValue = Object.prototype.hasOwnProperty.call(value, tag) ? value[tag] : undefined;
    if (tagValue === undefined) {
      return ' is mandatory';
    }
    if (typeof tagValue !== 'string') {
      return ' must be a string';
    }
    const values = [...mapping.keys()];
    return values.length === 1 ? ` must be equal to ${values[0]}` : ` must be one of: ${values.join(', ')}`;
  }

  // Number of types the value satisfies, counting up to 2.
  countMatches(value) {
    let matches = 0;
    for (let i = 0; i < this.types.length && matches < 2; i += 1) {
      if (this.types[i].isValid(value)) {
        matches += 1;
      }
    }
    return matches;
  }

  // The field name goes to the alternatives as received (see AllOfType.validate()).
  validate(value, fieldName = undefined) {
    const name = fieldName || 'Value';
    const result = super.validate(value, name);
    if (result) {
      return result;
    }
    const picked = this.pick(value);
    if (picked === NO_TYPE) {
      const { tag } = this.discriminator;
      return `${fieldName ? `${fieldName}.${tag}` : tag}${this.tagError(value)}`;
    }
    if (picked !== EVERY_TYPE) {
      return this.types[picked].validate(value, fieldName);
    }
    if (value !== undefined && value !== null) {
      const matches = this.countMatches(value);
      if (this.types.length === 0) {
        return `${name} must match exactly one schema, but matches none`;
      }
      if (matches === 0) {
        return this.types.map((type) => type.errors(value, fieldName));
      }
      if (matches > 1) {
        return `${name} must match exactly one schema, but matches more than one`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    const picked = this.pick(value);
    if (picked === EVERY_TYPE) {
      return this.countMatches(value) === 1;
    }
    return picked !== NO_TYPE && this.types[picked].isValid(value);
  }
}

function OneOf(options) {
  return new OneOfType(options);
}

function oneOf(types, isMandatory = true, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new OneOfType(types);
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

function ooneOf(types, isMandatory = false, isNullable = false) {
  if (types !== undefined && types !== null && !Array.isArray(types) && typeof types === 'object') {
    return new OneOfType({ isMandatory: false, ...types });
  }
  return new OneOfType({ types, isMandatory, isNullable });
}

module.exports = {
  OneOfType,
  NO_TYPE,
  EVERY_TYPE,
  OneOf,
  oneOf,
  ooneOf,
};

},
"@xufa/schema/lib/types/ref.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

// Validates with the type it refers to, which is set once references are resolved; recursive schemas refer back to a
// type that contains the reference. Only undefined is handled here (isMandatory); null and other values go to the
// target. The field name is passed through unchanged, so the reference does not show in messages.
class RefType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.ref = options.ref;
    this.target = toType(options.target, 'Ref target');
  }

  getTarget() {
    if (!this.target) {
      throw new Error(`Reference "${this.ref}" is not resolved`);
    }
    return this.target;
  }

  validate(value, fieldName) {
    if (value === undefined) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().validate(value, fieldName);
  }

  errors(value, fieldName) {
    if (value === undefined) {
      return super.validate(value, fieldName);
    }
    return this.getTarget().errors(value, fieldName);
  }

  isValid(value) {
    if (value === undefined) {
      return !this.isMandatory;
    }
    return this.getTarget().isValid(value);
  }
}

function Ref(options) {
  return new RefType(options);
}

module.exports = {
  RefType,
  Ref,
};

},
"@xufa/schema/lib/types/string.js": function (module, exports, require) {
const { hasFewerCodePoints, hasMoreCodePoints } = require('./code-point-length');
const { ValidateType } = require('./validate-type');
const { FORMATS, matchesFormat } = require('../formats');

// The limits of a format: how a comparison fails them (a comparison that is undefined never does), the text of their
// error, and their comparison in ajv's params.
const FORMAT_LIMITS = {
  formatMinimum: { fails: (result) => result < 0, text: 'at least', comparison: '>=' },
  formatMaximum: { fails: (result) => result > 0, text: 'at most', comparison: '<=' },
  formatExclusiveMinimum: { fails: (result) => result <= 0, text: 'greater than', comparison: '>' },
  formatExclusiveMaximum: { fails: (result) => result >= 0, text: 'less than', comparison: '<' },
};

class StringType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.min = options.min;
    this.max = options.max;
    this.pattern = options.pattern;
    this.allowEmpty = options.allowEmpty;
    // Count min/max in Unicode code points (as JSON Schema does) instead of UTF-16 units.
    this.countCodePoints = options.countCodePoints;
    // A format the string must have: the name of a built-in one (formats.js), or with `formatCheck` (a function or a
    // regular expression) one of the JSON Schema option "formats".
    this.format = options.format;
    this.formatCheck = options.formatCheck;
    if (this.format !== undefined && this.formatCheck === undefined) {
      if (!Object.prototype.hasOwnProperty.call(FORMATS, this.format)) {
        throw new Error(`Unknown String format "${this.format}": use one of ${Object.keys(FORMATS).join(', ')}`);
      }
      this.formatCheck = FORMATS[this.format];
    }
    // [{ keyword, limit, compare }]: limits of the value of the format (formatMinimum, formatMaximum,
    // formatExclusiveMinimum and formatExclusiveMaximum), checked with compare(value, limit) after the format.
    this.formatLimits = options.formatLimits || [];
  }

  // The first limit of the format the value does not satisfy, or undefined.
  failedLimit(value) {
    return this.formatLimits.find(({ keyword, limit, compare }) => FORMAT_LIMITS[keyword].fails(compare(value, limit)));
  }

  hasFormat(value) {
    return this.formatCheck === undefined || matchesFormat(this.formatCheck, value);
  }

  isTooShort(value) {
    return this.countCodePoints ? hasFewerCodePoints(value, this.min) : value.length < this.min;
  }

  isTooLong(value) {
    return this.countCodePoints ? hasMoreCodePoints(value, this.max) : value.length > this.max;
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        return `${fieldName} must be a string`;
      }
      const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
      if (this.min !== undefined && !skipMin && this.isTooShort(value)) {
        return `${fieldName} must be at least ${this.min} characters long`;
      }
      if (this.max !== undefined && this.isTooLong(value)) {
        return `${fieldName} must be at most ${this.max} characters long`;
      }
      if (this.pattern && !this.pattern.test(value)) {
        return `${fieldName} does not match the required pattern`;
      }
      if (!this.hasFormat(value)) {
        return `${fieldName} must be a valid ${this.format}`;
      }
      const failed = this.failedLimit(value);
      if (failed) {
        return `${fieldName} must be ${FORMAT_LIMITS[failed.keyword].text} ${failed.limit}`;
      }
    }
    return undefined;
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (typeof value !== 'string') {
      return false;
    }
    const skipMin = value.length === 0 && (this.allowEmpty ?? !this.isMandatory);
    return (
      (this.min === undefined || skipMin || !this.isTooShort(value)) &&
      (this.max === undefined || !this.isTooLong(value)) &&
      (!this.pattern || this.pattern.test(value)) &&
      this.hasFormat(value) &&
      this.failedLimit(value) === undefined
    );
  }
}

function String(options) {
  return new StringType(options);
}

function str(min, max, isMandatory = true, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new StringType(min);
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

function ostr(min, max, isMandatory = false, isNullable = false) {
  if (min !== undefined && min !== null && typeof min === 'object') {
    return new StringType({ isMandatory: false, ...min });
  }
  return new StringType({ min, max, isMandatory, isNullable });
}

module.exports = {
  FORMAT_LIMITS,
  StringType,
  String,
  str,
  ostr,
};

},
"@xufa/schema/lib/types/validate-type.js": function (module, exports, require) {
// A validate() result is undefined (valid), a string (one error) or a possibly empty array of errors.
function hasErrors(result) {
  if (!Array.isArray(result)) {
    return Boolean(result);
  }
  for (let i = 0; i < result.length; i += 1) {
    const item = result[i];
    if (!Array.isArray(item) || hasErrors(item)) {
      return true;
    }
  }
  return false;
}

class ValidateType {
  constructor(options = {}) {
    this.isMandatory = options.isMandatory !== undefined ? options.isMandatory : true;
    this.isNullable = options.isNullable !== undefined ? options.isNullable : false;
  }

  validate(value, fieldName = 'Value') {
    if (this.isMandatory && value === undefined) {
      return `${fieldName} is mandatory`;
    }
    if (!this.isNullable && value === null) {
      return `${fieldName} cannot be null`;
    }
    return undefined;
  }

  // Fast boolean check equivalent to !hasErrors(this.validate(value)) that builds no messages.
  // Built-in types override it; custom subclasses that only override validate() fall back to it.
  isValid(value) {
    return !hasErrors(this.validate(value));
  }

  // Error messages of a value already known to be invalid; containers call it on their failing children
  // so types whose validate() starts with an isValid() fast path can skip it. The field name goes to validate() as
  // received, which names the value "Value" when there is none.
  errors(value, fieldName = undefined) {
    return this.validate(value, fieldName);
  }

  // Compiles the type into generated code, several times faster than validate(): see compileType() in compile.js for
  // the options. The compiled function does not see changes made to the type afterwards.
  compile(options = {}) {
    // eslint-disable-next-line global-require -- compile.js requires this module
    return require('../compile').compileType(this, options);
  }

  // Presence part of isValid: a boolean when undefined/null decide the result, undefined otherwise.
  checkPresence(value) {
    if (value === undefined) {
      return !this.isMandatory;
    }
    if (value === null) {
      return this.isNullable;
    }
    return undefined;
  }

  mandatory(isMandatory = true) {
    this.isMandatory = isMandatory;
    return this;
  }

  nullable(isNullable = true) {
    this.isNullable = isNullable;
    return this;
  }

  optional() {
    this.isMandatory = false;
    return this;
  }

  required() {
    this.isMandatory = true;
    return this;
  }

  notNull() {
    this.isNullable = false;
    return this;
  }
}

// The messages of a validate() result as a flat list, each one once: parts of an allOf, or alternatives, can report
// the same error.
function toErrors(result) {
  if (Array.isArray(result)) {
    return Array.from(new Set(result.flat(Infinity)));
  }
  return result ? [result] : [];
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Normalizes an option that holds a type. A plain object stands for new Schema(object), as it does for a key of a
// Schema; other objects (types, schemas) are kept; anything else throws now instead of failing when validating.
function toType(value, name) {
  if (value === undefined || value instanceof ValidateType) {
    return value;
  }
  if (isPlainObject(value)) {
    // eslint-disable-next-line global-require -- schema.js requires this module
    const { Schema } = require('../schema');
    return new Schema(value);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be a type or an object of types`);
  }
  return value;
}

function toTypes(values, name) {
  if (values === undefined) {
    return values;
  }
  if (!Array.isArray(values)) {
    throw new TypeError(`${name} must be an array of types`);
  }
  return values.map((value, i) => toType(value, `${name}[${i}]`));
}

module.exports = {
  ValidateType,
  hasErrors,
  toErrors,
  isPlainObject,
  toType,
  toTypes,
};

},
"@xufa/schema/lib/types/values.js": function (module, exports, require) {
const { deepEqual } = require('../deep-equal');
const { ValidateType } = require('./validate-type');

function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// Value must be deep-equal to one of the given values, whatever their type.
class ValuesType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.values = options.values || [];
  }

  validate(value, fieldName = 'Value') {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && !this.values.some((item) => deepEqual(item, value))) {
      if (this.values.length === 1) {
        return `${fieldName} must be equal to ${formatValue(this.values[0])}`;
      }
      return `${fieldName} must be one of: ${this.values.map(formatValue).join(', ')}`;
    }
    return undefined;
  }

  isValid(value) {
    return this.checkPresence(value) ?? this.values.some((item) => deepEqual(item, value));
  }
}

function Values(options) {
  return new ValuesType(options);
}

function Const(value, options = {}) {
  return new ValuesType({ ...options, values: [value] });
}

module.exports = {
  ValuesType,
  Values,
  Const,
};

},
"@xufa/schema/lib/types/when.js": function (module, exports, require) {
const { ValidateType, toType } = require('./validate-type');

const JSON_TYPES = ['object', 'array', 'string', 'number'];

function isJsonType(value, jsonType) {
  switch (jsonType) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    default:
      return typeof value === 'number';
  }
}

// Checks the value with `type` only when it has the given JSON type (object, array, string or number); values of
// other types are valid. This is how JSON Schema applies keywords such as minimum or properties when no "type" is
// declared. The field name is passed through unchanged, so the wrapper does not show in messages.
class WhenType extends ValidateType {
  constructor(options = {}) {
    super(options);
    if (!JSON_TYPES.includes(options.jsonType)) {
      throw new Error(`WhenType jsonType must be one of: ${JSON_TYPES.join(', ')}`);
    }
    this.jsonType = options.jsonType;
    this.type = toType(options.type, 'When type');
  }

  validate(value, fieldName) {
    const result = super.validate(value, fieldName);
    if (result) {
      return result;
    }
    if (value !== undefined && value !== null && isJsonType(value, this.jsonType)) {
      return this.type.validate(value, fieldName);
    }
    return undefined;
  }

  errors(value, fieldName) {
    return this.validate(value, fieldName);
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    return !isJsonType(value, this.jsonType) || this.type.isValid(value);
  }
}

function When(options) {
  return new WhenType(options);
}

module.exports = {
  WhenType,
  When,
  isJsonType,
};

},
"@xufa/schema/lib/unevaluated.js": function (module, exports, require) {
// "unevaluatedProperties" and "unevaluatedItems" (JSON Schema 2019-09 and 2020-12): the keys or elements of a value
// that no other keyword of the schema evaluated must satisfy a schema. Which ones were evaluated depends on the value:
// a keyword such as "properties" evaluates the keys it names, and an applicator ("anyOf", "oneOf", "if", "$ref",
// "dependentSchemas") passes on what its subschemas evaluated, but only from the ones the value satisfies. "allOf"
// passes on what all of them evaluate: when one fails, the allOf fails, so what it evaluated never counts.
// When what the other keywords evaluate does not depend on the value, staticEvaluated() gives it to the compiler.
const { Schema } = require('./schema');
const { ClosedSchema } = require('./closed-schema');
const {
  AllOfType,
  AnyOfType,
  ArrayOfType,
  ConditionalType,
  NeverType,
  OneOfType,
  RefType,
  ValidateType,
  WhenType,
  isJsonType,
} = require('./types');
const { NO_TYPE, EVERY_TYPE } = require('./types/one-of');

// What a type evaluated: true for everything, or a Set of keys (or of element indexes).
const ALL = true;

// Kinds of element: keys of objects or indexes of arrays.
const JSON_TYPES = { properties: 'object', items: 'array' };

function merge(target, result) {
  if (result === ALL || target === ALL) {
    return ALL;
  }
  result.forEach((item) => target.add(item));
  return target;
}

// What `type` evaluates of `value`, for kind 'properties' or 'items'. `seen` holds the references being followed with
// their values, to stop at cycles.
let evaluated;

const evaluatedByAll = (kind, types, value, seen) =>
  types.reduce((result, item) => merge(result, evaluated(kind, item, value, seen)), new Set());

// Keys of the object `value` that a Schema evaluates: the ones "properties" names or a pattern matches, all of them
// with "additionalProperties", and what the "dependentSchemas" of its present keys evaluate.
function schemaKeys(type, value, seen) {
  if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
    return ALL;
  }
  const declared = type.propertyKeys ? new Set(type.propertyKeys) : type.keySet;
  let keys = new Set();
  Object.keys(value).forEach((key) => {
    if (declared.has(key) || type.patternTypes.some(({ pattern }) => pattern.test(key))) {
      keys.add(key);
    }
  });
  type.dependencies.forEach((dependency) => {
    const isPresent = Object.prototype.hasOwnProperty.call(value, dependency.key);
    if (dependency.type && isPresent && dependency.type.isValid(value)) {
      keys = merge(keys, evaluated('properties', dependency.type, value, seen));
    }
  });
  return keys;
}

// Indexes of the array `value` that an ArrayOf evaluates: the positions of a tuple, all of them with a type for every
// element or after the tuple, and in draft 2020-12 the ones that match "contains".
function arrayItems(type, value) {
  if ((type.type && !Array.isArray(type.type)) || type.additionalType) {
    return ALL;
  }
  const items = new Set();
  if (Array.isArray(type.type)) {
    for (let i = 0; i < Math.min(type.type.length, value.length); i += 1) {
      items.add(i);
    }
  }
  if (type.contains && type.containsEvaluates) {
    value.forEach((item, i) => {
      if (type.contains.isValid(item)) {
        items.add(i);
      }
    });
  }
  return items;
}

// Checks the keys or elements of a value that the other keywords of its schema, `siblings`, leave: they must satisfy
// `type`. `kind` is 'properties' or 'items'. It checks only values of the JSON type of its kind.
class UnevaluatedType extends ValidateType {
  constructor(options = {}) {
    super(options);
    this.kind = options.kind;
    this.jsonType = JSON_TYPES[options.kind];
    this.siblings = options.siblings || [];
    this.type = options.type;
  }

  // Keys or indexes that the siblings do not evaluate. What the siblings evaluate counts even from the ones that fail,
  // so an invalid property is reported once, by the keyword that checks it.
  unevaluated(value) {
    const done = evaluatedByAll(this.kind, this.siblings, value, []);
    if (done === ALL) {
      return [];
    }
    const elements = this.kind === 'properties' ? Object.keys(value) : value.map((item, i) => i);
    return elements.filter((element) => !done.has(element));
  }

  isValid(value) {
    const presence = this.checkPresence(value);
    if (presence !== undefined) {
      return presence;
    }
    if (!isJsonType(value, this.jsonType)) {
      return true;
    }
    return this.unevaluated(value).every((element) => this.type.isValid(value[element]));
  }

  // Keys are named like the keys of a Schema, and a key no schema allows like its "additionalProperties": false.
  errors(value, fieldName) {
    const presence = super.validate(value, fieldName || 'Value');
    if (presence !== undefined) {
      return presence;
    }
    if (!isJsonType(value, this.jsonType)) {
      return [];
    }
    return this.unevaluated(value)
      .filter((element) => !this.type.isValid(value[element]))
      .map((element) => {
        if (this.kind === 'items') {
          return this.type.errors(value[element], `${fieldName || 'Value'}[${element}]`);
        }
        const keyName = fieldName ? `${fieldName}.${element}` : element;
        return this.type instanceof NeverType
          ? `Unexpected key: ${keyName}`
          : this.type.errors(value[element], keyName);
      });
  }

  validate(value, fieldName) {
    return this.isValid(value) ? undefined : this.errors(value, fieldName);
  }
}

evaluated = (kind, type, value, seen = []) => {
  switch (type.constructor) {
    case Schema:
    case ClosedSchema:
      return kind === 'properties' ? schemaKeys(type, value, seen) : new Set();
    case ArrayOfType:
      return kind === 'items' ? arrayItems(type, value) : new Set();
    case AllOfType:
      return evaluatedByAll(kind, type.types, value, seen);
    case AnyOfType:
      return evaluatedByAll(
        kind,
        type.types.filter((item) => item.isValid(value)),
        value,
        seen
      );
    case OneOfType: {
      // With a discriminator, the type it picks, when the value satisfies it.
      const picked = type.pick(value);
      if (picked !== EVERY_TYPE) {
        const isPicked = picked !== NO_TYPE && type.types[picked].isValid(value);
        return isPicked ? evaluated(kind, type.types[picked], value, seen) : new Set();
      }
      const valid = type.types.filter((item) => item.isValid(value));
      return valid.length === 1 ? evaluated(kind, valid[0], value, seen) : new Set();
    }
    case ConditionalType: {
      // The annotations of "if" count when the value satisfies it.
      if (type.ifType.isValid(value)) {
        const result = evaluated(kind, type.ifType, value, seen);
        return type.thenType && type.thenType.isValid(value)
          ? merge(result, evaluated(kind, type.thenType, value, seen))
          : result;
      }
      return type.elseType && type.elseType.isValid(value) ? evaluated(kind, type.elseType, value, seen) : new Set();
    }
    case RefType:
      if (seen.some(([ref, seenValue]) => ref === type && seenValue === value)) {
        return new Set();
      }
      return evaluated(kind, type.getTarget(), value, [...seen, [type, value]]);
    case WhenType:
      return isJsonType(value, type.jsonType) ? evaluated(kind, type.type, value, seen) : new Set();
    case UnevaluatedType:
      // Evaluates everything the other keywords leave, when those elements satisfy it.
      if (type.kind === kind && type.isValid(value)) {
        return ALL;
      }
      return evaluatedByAll(kind, type.siblings, value, seen);
    default:
      return new Set();
  }
};

// What `type` evaluates for any value, when it does not depend on the value: { all } for everything, else the
// declared keys, the patterns of keys and the length of a tuple (the evaluated indexes are the ones below it).
// Undefined when it depends on the value.
const NONE = { all: false, keys: [], patterns: [], prefix: 0 };
const EVERYTHING = { ...NONE, all: true };

function union(a, b) {
  if (a === undefined || b === undefined) {
    return undefined;
  }
  return {
    all: a.all || b.all,
    keys: [...a.keys, ...b.keys],
    patterns: [...a.patterns, ...b.patterns],
    prefix: Math.max(a.prefix, b.prefix),
  };
}

const isNone = (result) =>
  result !== undefined &&
  !result.all &&
  result.keys.length === 0 &&
  result.patterns.length === 0 &&
  result.prefix === 0;

let staticOf;

const staticOfAll = (kind, types, seen) =>
  types.reduce((result, item) => union(result, staticOf(kind, item, seen)), NONE);

// Alternatives pass on what the ones that match evaluate, which depends on the value, unless none evaluates anything.
const staticOfAlternatives = (kind, types, seen) =>
  types.every((item) => item === undefined || isNone(staticOf(kind, item, seen))) ? NONE : undefined;

staticOf = (kind, type, seen = []) => {
  switch (type.constructor) {
    case Schema:
    case ClosedSchema:
      if (kind !== 'properties') {
        return NONE;
      }
      if (type.evaluatesAllKeys || !type.isOpen || type.additionalType) {
        return EVERYTHING;
      }
      if (type.dependencies.some((dependency) => dependency.type && !isNone(staticOf(kind, dependency.type, seen)))) {
        return undefined;
      }
      return {
        ...NONE,
        keys: type.propertyKeys || type.keys,
        patterns: type.patternTypes.map(({ pattern }) => pattern),
      };
    case ArrayOfType:
      if (kind !== 'items') {
        return NONE;
      }
      if ((type.type && !Array.isArray(type.type)) || type.additionalType) {
        return EVERYTHING;
      }
      if (type.contains && type.containsEvaluates) {
        return undefined;
      }
      return { ...NONE, prefix: Array.isArray(type.type) ? type.type.length : 0 };
    case AllOfType:
      return staticOfAll(kind, type.types, seen);
    case AnyOfType:
    case OneOfType:
      return staticOfAlternatives(kind, type.types, seen);
    case ConditionalType:
      return staticOfAlternatives(kind, [type.ifType, type.thenType, type.elseType], seen);
    case RefType:
      return seen.includes(type) ? undefined : staticOf(kind, type.getTarget(), [...seen, type]);
    case WhenType:
      return type.jsonType === JSON_TYPES[kind] ? staticOf(kind, type.type, seen) : NONE;
    case UnevaluatedType:
      return type.kind === kind ? EVERYTHING : staticOfAll(kind, type.siblings, seen);
    default:
      return NONE;
  }
};

const withKeySet = (result) => result && { ...result, keys: new Set(result.keys) };

// What `types` evaluate together for any value, of kind 'properties' or 'items', or undefined when it depends on the
// value.
function staticEvaluatedByAll(kind, types) {
  return withKeySet(staticOfAll(kind, types, []));
}

// What `type` evaluates for any value, of kind 'properties' or 'items', or undefined when it depends on the value.
function staticEvaluatedBy(kind, type) {
  return withKeySet(staticOf(kind, type, []));
}

module.exports = {
  JSON_TYPES,
  UnevaluatedType,
  staticEvaluatedBy,
  staticEvaluatedByAll,
};

},
"@xufa/schema/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/schema","version":"0.1.0"};
},
"@xufa/serializer/index.js": function (module, exports, require) {
// @xufa/serializer: compiles a JSON schema into a function writing JSON for it, as fast-json-stringify does.
//
//   const serialize = build({ type: 'object', properties: { id: { type: 'integer' } } });
//   serialize({ id: 1, secret: 'x' }); // '{"id":1}'
//
// Only the properties of the schema are written, each with the writer of its type. Objects and arrays are written
// inline in the generated function; schemas reached by $ref get functions of their own (which is how recursive
// schemas are written). The branch of anyOf, oneOf and if/then/else is chosen by predicates compiled from the schemas.
const { RefResolver, resolveURI } = require('./lib/resolver');
const { mergeSchemas } = require('./lib/merge');
const { createMatcher } = require('./lib/match');
const { createRuntime } = require('./lib/runtime');
const { validateSchema } = require('./lib/meta');
const writer = require('./lib/writer');

const { bytesOf } = writer;
const ROUNDING = new Set(['floor', 'ceil', 'round', 'trunc']);
const LARGE_ARRAY_MECHANISMS = new Set(['default', 'json-stringify']);
// How the generated code makes the JSON (see Builder#lit()); 'auto' picks by the schema.
const OUTPUTS = new Set(['auto', 'string', 'bytes']);

const OBJECT_KEYWORDS = [
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'maxProperties',
  'minProperties',
  'dependencies',
];
const ARRAY_KEYWORDS = ['items', 'additionalItems', 'maxItems', 'minItems', 'uniqueItems', 'contains', 'prefixItems'];
const STRING_KEYWORDS = ['maxLength', 'minLength', 'pattern'];
const NUMBER_KEYWORDS = ['multipleOf', 'maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum'];

let rootCounter = 0;

// The type a schema without "type" is written as, from its keywords.
function inferType(schema) {
  for (const keyword of OBJECT_KEYWORDS) if (keyword in schema) return 'object';
  for (const keyword of ARRAY_KEYWORDS) if (keyword in schema) return 'array';
  for (const keyword of STRING_KEYWORDS) if (keyword in schema) return 'string';
  for (const keyword of NUMBER_KEYWORDS) if (keyword in schema) return 'number';
  return schema.type;
}

const quote = (value) => JSON.stringify(value);
// A string literal of JavaScript code holding the given text.
const literal = (text) => JSON.stringify(text);

function parseLargeArraySize(value) {
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  } else if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  } else if (typeof value === 'bigint') {
    return Number(value);
  }
  throw new Error(`Unsupported large array size. Expected integer-like, got ${typeof value} with value ${value}`);
}

class Builder {
  constructor(schema, options) {
    this.options = options;
    this.resolver = new RefResolver();
    this.matcher = createMatcher(this.resolver, { coerceTypes: Boolean(options.ajv && options.ajv.coerceTypes) });
    this.rootId =
      schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#'
        ? schema.$id
        : `__xufa_root_${rootCounter++}`;
    this.uid = 0;
    this.functions = [];
    this.functionNames = new Map();
    this.validators = [];
    this.patterns = [];
    this.mergedCache = new Map();
    // Copies made by absolute() -> the schema they copy, so that a copy is built (and merged) as its original.
    this.origins = new WeakMap();
    // Schemas being written inline: met again inside themselves, they get a function.
    this.stack = new Set();
    this.largeArrayMechanism = options.largeArrayMechanism || 'default';
    this.largeArraySize = options.largeArraySize === undefined ? 2e4 : parseLargeArraySize(options.largeArraySize);
    // The output of the generated code (see lit()), and the literals it writes as bytes.
    this.bytes = options.output === 'bytes';
    this.literals = [];
  }

  name(prefix) {
    const id = this.uid;
    this.uid += 1;
    return `${prefix}${id}`;
  }

  // The code is written for one of two outputs. 'string': the JSON is joined with + in a variable `json` (fastest for
  // small values). 'bytes': it is written as UTF-8 to the buffer of lib/writer.js and read once at the end (fastest
  // for large ones: no tree of strings for V8 to flatten). The helpers below write a statement for either.

  // The name of the constant holding the bytes of a literal, for the 'bytes' output.
  bytesOf(text) {
    let index = this.literals.indexOf(text);
    if (index === -1) {
      index = this.literals.length;
      this.literals.push(text);
    }
    return `B${index}`;
  }

  // Writes text known when compiling.
  lit(text) {
    if (!this.bytes) return `json += ${literal(text)};\n`;
    if (text.length === 1 && text.charCodeAt(0) < 128) return `wc(${text.charCodeAt(0)});\n`;
    return `wb(${this.bytesOf(text)});\n`;
  }

  // Writes one of two texts known when compiling; `whenFalse` may hold code run when the condition is false.
  litChoice(condition, whenTrue, whenFalse, sideEffect = '') {
    const pick = (text) => (this.bytes ? this.bytesOf(text) : literal(text));
    const falseValue = sideEffect ? `(${sideEffect}, ${pick(whenFalse)})` : pick(whenFalse);
    const value = `${condition} ? ${pick(whenTrue)} : ${falseValue}`;
    return this.bytes ? `wb(${value});\n` : `json += ${value};\n`;
  }

  // Writes the JSON text an expression gives (a string, or undefined written as "undefined").
  raw(expression) {
    return this.bytes ? `wr('' + ${expression});\n` : `json += ${expression};\n`;
  }

  // Writes a value with a function of the generated code (for references): it returns its JSON or writes it.
  callFunction(name, input) {
    return this.bytes ? `${name}(${input});\n` : `json += ${name}(${input});\n`;
  }

  // How a location is named in error messages: its JSON pointer, after the id of its schema when not the root one.
  refOf(loc) {
    return loc.base === this.rootId ? loc.pointer : `${loc.base}${loc.pointer}`;
  }

  child(loc, key) {
    const schema = loc.schema[key];
    let { base } = loc;
    if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
      base = resolveURI(base, schema.$id);
    }
    return { schema, base, pointer: `${loc.pointer}/${key}` };
  }

  resolve(loc) {
    let current = loc;
    const seen = new Set();
    while (current.schema && typeof current.schema === 'object' && current.schema.$ref !== undefined) {
      const { $ref } = current.schema;
      const target = this.resolver.resolve($ref, current.base);
      if (target === null) {
        const missing = this.resolver.missingDocument($ref, current.base);
        if (missing !== null) {
          throw new Error(`Cannot resolve ref "${$ref}". Schema with id "${missing}" is not found.`);
        }
        throw new Error(`Cannot find reference "${$ref}"`);
      }
      if (seen.has(target.schema)) throw new Error(`Circular reference "${$ref}"`);
      seen.add(target.schema);
      current = target;
    }
    return current;
  }

  // A copy of a schema whose references are absolute, so that it can be merged with schemas of other documents.
  origin(schema) {
    return this.origins.get(schema) || schema;
  }

  absolute(schema, base) {
    if (schema === null || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map((item) => this.absolute(item, base));
    let current = base;
    if (typeof schema.$id === 'string' && schema.$id[0] !== '#') current = resolveURI(base, schema.$id);
    const out = {};
    for (const key of Object.keys(schema)) {
      const value = schema[key];
      if (key === '$ref' && typeof value === 'string') {
        const hash = value.indexOf('#');
        const uri = hash === -1 ? value : value.slice(0, hash);
        out.$ref = (uri === '' ? current : resolveURI(current, uri)) + (hash === -1 ? '' : value.slice(hash));
      } else if (key === 'enum' || key === 'const' || key === 'default' || key === 'examples') {
        out[key] = value;
      } else {
        out[key] = this.absolute(value, current);
      }
    }
    this.origins.set(out, this.origin(schema));
    return out;
  }

  // The merge of schemas (resolved and made absolute), cached by the schema objects merged.
  merge(locs) {
    let cache = this.mergedCache;
    for (const loc of locs) {
      const key = loc.key || this.origin(loc.schema);
      if (!cache.has(key)) cache.set(key, new Map());
      cache = cache.get(key);
    }
    if (cache.has('merged')) return cache.get('merged');
    const parts = locs.map((loc) => {
      const resolved = this.resolve(loc);
      const copy = this.absolute(resolved.schema, resolved.base);
      if (copy && typeof copy === 'object') delete copy.$id;
      return copy;
    });
    const merged = mergeSchemas(parts);
    if (merged && typeof merged === 'object') this.origins.set(merged, merged);
    cache.set('merged', merged);
    return merged;
  }

  validator(loc) {
    this.validators.push(this.matcher(loc.schema, loc.base));
    return `v[${this.validators.length - 1}]`;
  }

  // Whether the value of a schema can be written inline: no references, combinations, objects or arrays inside.
  isSimple(schema) {
    if (schema === null || typeof schema !== 'object') return true;
    if (schema.$ref || schema.allOf || schema.anyOf || schema.oneOf || schema.if) return false;
    const type = schema.type === undefined ? inferType(schema) : schema.type;
    const types = Array.isArray(type) ? type : [type];
    return !types.includes('object') && !types.includes('array');
  }

  buildValue(loc, input) {
    const { schema } = loc;
    if (schema === undefined || typeof schema === 'boolean') return this.raw(`JSON.stringify(${input})`);
    if (schema.$ref !== undefined) return this.buildRef(loc, input);
    const origin = this.origin(schema);
    if (this.stack.has(origin)) return this.callFunction(this.functionFor(loc), input);
    this.stack.add(origin);
    try {
      return this.buildBody(loc, input);
    } finally {
      this.stack.delete(origin);
    }
  }

  buildBody(loc, input) {
    const { schema } = loc;
    if (schema.allOf) return this.buildAllOf(loc, input);
    if (schema.anyOf || schema.oneOf) return this.buildOneOf(loc, input);
    if (schema.if !== undefined && schema.then !== undefined) return this.buildIfThenElse(loc, input);
    const type = schema.type === undefined ? inferType(schema) : schema.type;
    const nullable = schema.nullable === true;
    let code = nullable ? `if (${input} === null) ${this.lit('null')}else {\n` : '';
    if (schema.const !== undefined) code += this.buildConst(schema, type, input);
    else if (Array.isArray(type)) code += this.buildMultiType(loc, type, input);
    else code += this.buildSingleType(loc, type, input);
    if (nullable) code += '}\n';
    return code;
  }

  buildRef(loc, input) {
    const target = this.resolve(loc);
    if (this.isSimple(target.schema)) return this.buildValue(target, input);
    return this.callFunction(this.functionFor(target), input);
  }

  functionFor(loc) {
    const origin = this.origin(loc.schema);
    const existing = this.functionNames.get(origin);
    if (existing) return existing;
    const name = this.name('f');
    this.functionNames.set(origin, name);
    const wasBuilding = this.stack.has(origin);
    this.stack.add(origin);
    let body;
    try {
      body = this.buildBody(loc, 'input');
    } finally {
      if (!wasBuilding) this.stack.delete(origin);
    }
    this.functions.push(
      this.bytes
        ? `// ${this.refOf(loc)}\nfunction ${name}(input) {\n${body}}\n`
        : `// ${this.refOf(loc)}\nfunction ${name}(input) {\nlet json = '';\n${body}return json;\n}\n`
    );
    return name;
  }

  buildAllOf(loc, input) {
    const { allOf, ...rest } = loc.schema;
    const locs = [{ schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) }];
    allOf.forEach((schema, i) => locs.push(this.child(this.child(loc, 'allOf'), i)));
    const merged = this.merge(locs);
    return this.buildValue({ schema: merged, base: loc.base, pointer: loc.pointer }, input);
  }

  buildOneOf(loc, input) {
    const keyword = loc.schema.anyOf ? 'anyOf' : 'oneOf';
    const { [keyword]: branches, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const branchesLoc = this.child(loc, keyword);
    let code = '';
    branches.forEach((branch, i) => {
      const branchLoc = this.child(branchesLoc, i);
      const check = this.validator(this.resolve(branchLoc));
      const merged = this.merge([restLoc, branchLoc]);
      const body = this.buildValue({ schema: merged, base: loc.base, pointer: branchLoc.pointer }, input);
      code += `${i === 0 ? 'if' : 'else if'} (${check}(${input})) {\n${body}}\n`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});\n`;
    return code;
  }

  buildIfThenElse(loc, input) {
    const { if: ifSchema, then: thenSchema, else: elseSchema, ...rest } = loc.schema;
    const restLoc = { schema: rest, base: loc.base, pointer: loc.pointer, key: this.origin(loc.schema) };
    const check = this.validator(this.resolve(this.child(loc, 'if')));
    const thenMerged = this.merge([restLoc, this.child(loc, 'then')]);
    const thenCode = this.buildValue({ schema: thenMerged, base: loc.base, pointer: loc.pointer }, input);
    let elseCode;
    if (elseSchema === undefined) {
      elseCode = this.buildValue(restLoc, input);
    } else {
      const elseMerged = this.merge([restLoc, this.child(loc, 'else')]);
      elseCode = this.buildValue({ schema: elseMerged, base: loc.base, pointer: loc.pointer }, input);
    }
    return `if (${check}(${input})) {\n${thenCode}} else {\n${elseCode}}\n`;
  }

  buildConst(schema, type, input) {
    const value = this.lit(JSON.stringify(schema.const));
    if (Array.isArray(type) && type.includes('null')) return `if (${input} === null) ${this.lit('null')}else ${value}`;
    return value;
  }

  buildMultiType(loc, types, input) {
    // fast-json-stringify's order of the types, null first
    const sorted = [...types].sort((type) => (type === 'null' ? -1 : 1));
    let code = '';
    sorted.forEach((type, i) => {
      const keyword = i === 0 ? 'if' : 'else if';
      const body = this.buildSingleType({ ...loc, schema: { ...loc.schema, type } }, type, input);
      let condition;
      switch (type) {
        case 'null':
          condition = `${input} === null`;
          break;
        case 'string':
          condition =
            `typeof ${input} === 'string' || ${input} === null || ${input} instanceof Date || ` +
            `${input} instanceof RegExp || (typeof ${input} === 'object' && ` +
            `typeof ${input}.toString === 'function' && ${input}.toString !== Object.prototype.toString)`;
          break;
        case 'array':
          condition = `Array.isArray(${input})`;
          break;
        case 'integer':
          condition = `Number.isInteger(${input}) || ${input} === null`;
          break;
        default:
          condition = `typeof ${input} === ${quote(type)} || ${input} === null`;
      }
      code += `${keyword} (${condition}) {\n${body}}\n`;
    });
    code += `else throw new TypeError(${literal(`The value of '${this.refOf(loc)}' does not match schema definition.`)});\n`;
    return code;
  }

  buildSingleType(loc, type, input) {
    const { schema } = loc;
    switch (type) {
      case 'null':
        return this.lit('null');
      case 'string':
        switch (schema.format) {
          case 'date-time':
            return this.raw(`asDateTime(${input})`);
          case 'date':
            return this.raw(`asDate(${input})`);
          case 'time':
            return this.raw(`asTime(${input})`);
          case 'unsafe':
            return this.raw(`asUnsafeString(${input})`);
          default:
            return this.bytes
              ? `if (typeof ${input} === 'string') ws(${input});\nelse wr(asStringValue(${input}));\n`
              : `json += typeof ${input} === 'string' ? asString(${input}) : asStringValue(${input});\n`;
        }
      case 'integer':
        return this.bytes ? `wi(${input});\n` : `json += asInteger(${input});\n`;
      case 'number':
        return this.bytes ? `wn(${input});\n` : `json += asNumber(${input});\n`;
      case 'boolean':
        return this.litChoice(input, 'true', 'false');
      case 'object':
        return this.buildObject(loc, input);
      case 'array':
        return this.buildArray(loc, input);
      case undefined:
        return this.raw(`JSON.stringify(${input})`);
      default:
        throw new Error(`${type} unsupported`);
    }
  }

  buildObject(loc, input) {
    const obj = this.name('o');
    const empty = loc.schema.nullable === true ? 'null' : '{}';
    return (
      `const ${obj} = ${input} && typeof ${input}.toJSON === 'function' ? ${input}.toJSON() : ${input};\n` +
      `if (${obj} === null) ${this.lit(empty)}else {\n${this.buildInnerObject(loc, obj)}}\n`
    );
  }

  buildInnerObject(loc, obj) {
    const { schema } = loc;
    const properties = schema.properties || {};
    const required = Array.isArray(schema.required) ? schema.required : [];
    // Required properties first, as fast-json-stringify writes them.
    const keys = Object.keys(properties).sort((a, b) => {
      const ra = required.includes(a);
      const rb = required.includes(b);
      return ra === rb ? 0 : ra ? -1 : 1;
    });
    let code = '';
    for (const key of required) {
      if (!keys.includes(key)) {
        code += `if (${obj}[${quote(key)}] === undefined) throw new Error(${literal(`"${key}" is required!`)});\n`;
      }
    }
    const hasExtra = Boolean(schema.patternProperties || schema.additionalProperties);
    const propertiesLoc = keys.length > 0 ? this.child(loc, 'properties') : null;

    // When the first property is required it is always written (or the serializer throws): the commas after it are
    // known. Otherwise a flag tells whether something was written, and picks the whole literal written before a key:
    // ',"key":' or '{"key":' (one string, not a comma added to the key: each concatenation costs a string).
    const firstRequired = keys.length > 0 && required.includes(keys[0]);
    // One property and nothing else: the object is written whole, '{"key":' + value + '}', or '{}'.
    if (keys.length === 1 && !hasExtra && !firstRequired) {
      const [key] = keys;
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === 'object' ? resolved.schema.default : undefined;
      const value = this.name('v');
      const open = `{${quote(key)}:`;
      const valueCode = this.buildValue(propertyLoc, value);
      const single = this.bytes ? null : /^json \+= ([^\n]+);\n$/.exec(valueCode);
      const written = single
        ? `json += ${literal(open)} + (${single[1]}) + '}';\n`
        : `${this.lit(open)}${valueCode}${this.lit('}')}`;
      const missing = this.lit(defaultValue === undefined ? '{}' : `{${quote(key)}:${JSON.stringify(defaultValue)}}`);
      return `${code}const ${value} = ${obj}[${quote(key)}];\nif (${value} !== undefined) {\n${written}}\nelse ${missing}`;
    }
    const flag = this.name('c');
    if (!firstRequired) code += `let ${flag} = false;\n`;

    keys.forEach((key, i) => {
      const propertyLoc = this.child(propertiesLoc, key);
      const resolved = propertyLoc.schema && propertyLoc.schema.$ref ? this.resolve(propertyLoc) : propertyLoc;
      const defaultValue = resolved.schema && typeof resolved.schema === 'object' ? resolved.schema.default : undefined;
      const value = this.name('v');
      const keyJson = `${quote(key)}:`;
      // The literal before the value: its key, after a comma or the brace that opens the object.
      const before = (suffix = '') =>
        firstRequired
          ? this.lit((i === 0 ? '{' : ',') + keyJson + suffix)
          : this.litChoice(flag, `,${keyJson}${suffix}`, `{${keyJson}${suffix}`, `${flag} = true`);
      const valueCode = this.buildValue(propertyLoc, value);
      const written = this.bytes ? before() + valueCode : appendAfter(before(), valueCode);
      code += `const ${value} = ${obj}[${quote(key)}];\nif (${value} !== undefined) {\n${written}}\n`;
      if (defaultValue !== undefined) {
        code += `else {\n${before(JSON.stringify(defaultValue))}}\n`;
      } else if (required.includes(key)) {
        code += `else throw new Error(${literal(`"${key}" is required!`)});\n`;
      }
    });

    if (hasExtra) {
      const comma = firstRequired ? this.lit(',') : this.litChoice(flag, ',', '{', `${flag} = true`);
      code += this.buildExtraProperties(loc, obj, keys, comma);
    }
    code += firstRequired ? this.lit('}') : this.litChoice(flag, '}', '{}');
    return code;
  }

  buildExtraProperties(loc, obj, keys, comma) {
    const { schema } = loc;
    let known = 'false';
    if (keys.length > 0 && keys.length <= 8) {
      known = keys.map((key) => `key === ${quote(key)}`).join(' || ');
    } else if (keys.length > 8) {
      this.patterns.push(new Set(keys));
      known = `p[${this.patterns.length - 1}].has(key)`;
    }
    // The key of a property that is not in "properties", and its colon.
    const writeKey = this.bytes ? 'ws(key);\nwc(58);\n' : "json += asString(key) + ':';\n";
    let code =
      `for (const key of Object.keys(${obj})) {\nif (${known}) continue;\nconst value = ${obj}[key];\n` +
      "if (value === undefined || typeof value === 'function' || typeof value === 'symbol') continue;\n";
    if (schema.patternProperties) {
      const patternsLoc = this.child(loc, 'patternProperties');
      for (const pattern of Object.keys(schema.patternProperties)) {
        this.patterns.push(new RegExp(pattern));
        const regex = `p[${this.patterns.length - 1}]`;
        code +=
          `if (${regex}.test(key)) {\n${comma}${writeKey}` +
          `${this.buildValue(this.child(patternsLoc, pattern), 'value')}continue;\n}\n`;
      }
    }
    const additional = schema.additionalProperties;
    if (additional === true) {
      code += `${comma}${writeKey}${this.raw('JSON.stringify(value)')}`;
    } else if (additional !== undefined && additional !== false) {
      code += `${comma}${writeKey}${this.buildValue(this.child(loc, 'additionalProperties'), 'value')}`;
    }
    return `${code}}\n`;
  }

  buildArray(loc, input) {
    const { schema } = loc;
    const arr = this.name('a');
    const length = this.name('n');
    const empty = schema.nullable === true ? 'null' : '[]';
    const tuple = Array.isArray(schema.prefixItems)
      ? schema.prefixItems
      : Array.isArray(schema.items)
        ? schema.items
        : null;
    const additional = Array.isArray(schema.prefixItems) ? schema.items : schema.additionalItems;
    const mismatch = literal(`The value of '${this.refOf(loc)}' does not match schema definition.`);
    let code =
      `const ${arr} = ${input};\nif (${arr} === null) ${this.lit(empty)}` +
      `else if (!Array.isArray(${arr})) throw new TypeError(${mismatch});\nelse {\nconst ${length} = ${arr}.length;\n`;
    let close = '}\n';
    if (tuple && !additional) {
      code += `if (${length} > ${tuple.length}) throw new Error(${literal(`Item at ${tuple.length} does not match schema definition.`)});\n`;
    }
    if (this.largeArrayMechanism === 'json-stringify') {
      code += `if (${length} >= ${this.largeArraySize}) ${this.raw(`JSON.stringify(${arr})`)}else {\n`;
      close += '}\n';
    }
    code += this.lit('[');
    if (tuple) {
      const tupleLoc = this.child(loc, Array.isArray(schema.prefixItems) ? 'prefixItems' : 'items');
      const flag = this.name('c');
      code += `let ${flag} = false;\n`;
      tuple.forEach((item, i) => {
        let itemLoc = this.child(tupleLoc, i);
        if (itemLoc.schema && itemLoc.schema.$ref) itemLoc = this.resolve(itemLoc);
        const value = this.name('v');
        const condition = typeCondition(itemLoc.schema && itemLoc.schema.type, value);
        code +=
          `if (${i} < ${length}) {\nconst ${value} = ${arr}[${i}];\nif (${condition}) {\n` +
          `if (${flag}) ${this.lit(',')}else ${flag} = true;\n${this.buildValue(itemLoc, value)}}\n` +
          `else throw new Error(${literal(`Item at ${i} does not match schema definition.`)});\n}\n`;
      });
      if (additional) {
        const index = this.name('i');
        code +=
          `for (let ${index} = ${tuple.length}; ${index} < ${length}; ${index} += 1) {\n` +
          `if (${flag}) ${this.lit(',')}else ${flag} = true;\n${this.raw(`JSON.stringify(${arr}[${index}])`)}}\n`;
      }
    } else {
      const itemsLoc = this.child(loc, 'items');
      if (itemsLoc.schema === undefined) itemsLoc.schema = {};
      const index = this.name('i');
      const value = this.name('v');
      code +=
        `for (let ${index} = 0; ${index} < ${length}; ${index} += 1) {\nif (${index} !== 0) ${this.lit(',')}` +
        `const ${value} = ${arr}[${index}];\n${this.buildValue(itemsLoc, value)}}\n`;
    }
    code += this.lit(']');
    return code + close;
  }

  compile(schema) {
    const rootLoc = { schema, base: this.rootId, pointer: '#' };
    const body = this.buildValue(rootLoc, 'input');
    let source =
      "'use strict';\n" +
      'const { asString, asStringValue, asUnsafeString, asInteger, asNumber, asDateTime, asDate, asTime } = rt;\n';
    if (this.bytes) {
      source +=
        'const { begin, end, endBuffer, abort, writeBytes: wb, writeByte: wc, writeRaw: wr, writeString: ws } = w;\n' +
        'const { writeInteger: wi, writeNumber: wn } = rt;\n' +
        this.literals.map((text, i) => `const B${i} = lits[${i}]; // ${JSON.stringify(text)}\n`).join('') +
        `${this.functions.join('\n')}\n` +
        `function write(input) {\n${body}}\n` +
        // A serialization that throws gives the buffer back as it was.
        'function serialize(input) {\nconst start = begin();\ntry {\nwrite(input);\n} catch (error) {\n' +
        'abort(start);\nthrow error;\n}\nreturn end(start);\n}\n' +
        // The same JSON as UTF-8 bytes, for a response to send as they are.
        'serialize.toBuffer = function toBuffer(input) {\nconst start = begin();\ntry {\nwrite(input);\n' +
        '} catch (error) {\nabort(start);\nthrow error;\n}\nreturn endBuffer(start);\n};\n' +
        'return serialize;\n';
      return source;
    }
    const direct = body.match(/^json \+= (f\d+)\(input\);\n$/);
    source += `${this.functions.join('\n')}\n`;
    source += direct
      ? `return ${direct[1]};\n`
      : `return function serialize(input) {\nlet json = '';\n${body}return json;\n};\n`;
    return source;
  }
}

function build(schema, options = {}) {
  if (options.rounding !== undefined && !ROUNDING.has(options.rounding)) {
    throw new Error(`Unsupported integer rounding method ${options.rounding}`);
  }
  if (options.largeArrayMechanism !== undefined && !LARGE_ARRAY_MECHANISMS.has(options.largeArrayMechanism)) {
    throw new Error(`Unsupported large array mechanism ${options.largeArrayMechanism}`);
  }
  if (options.output !== undefined && !OUTPUTS.has(options.output)) {
    throw new Error(`Unsupported output ${options.output}`);
  }
  validateSchema(schema);
  const compileFor = (output) => {
    const builder = new Builder(schema, { ...options, output });
    builder.resolver.addSchema(schema, builder.rootId);
    if (options.schema) {
      for (const key of Object.keys(options.schema)) {
        const external = options.schema[key];
        const id = typeof external.$id === 'string' && external.$id[0] !== '#' ? external.$id : key;
        if (!builder.resolver.hasSchema(id)) {
          validateSchema(external, key);
          builder.resolver.addSchema(external, key);
        }
      }
    }
    return { builder, source: builder.compile(schema) };
  };
  // 'auto': values of a size known by the schema (no arrays, maps or recursion: no loop and no function in the code)
  // are joined as strings; the others are written as bytes.
  const output = options.output || 'auto';
  let compiled = compileFor(output === 'bytes' ? 'bytes' : 'string');
  if (output === 'auto' && (compiled.builder.functions.length > 0 || compiled.source.includes('for ('))) {
    compiled = compileFor('bytes');
  }
  const { builder, source } = compiled;
  if (options.mode === 'debug') return { code: source };
  const literals = builder.literals.map(bytesOf);
  // eslint-disable-next-line no-new-func
  const factory = new Function('rt', 'v', 'p', 'w', 'lits', source);
  return factory(createRuntime(options), builder.validators, builder.patterns, writer, literals);
}

// Two pieces of code of the 'string' output, one after the other: one statement when each is one (one + less).
function appendAfter(first, code) {
  const a = /^json \+= ([^\n]+);\n$/.exec(first);
  const b = /^json \+= ([^\n]+);\n$/.exec(code);
  if (a !== null && b !== null) return `json += (${a[1]}) + (${b[1]});\n`;
  return first + code;
}

function typeCondition(type, value) {
  switch (type) {
    case 'null':
      return `${value} === null`;
    case 'string':
      return (
        `typeof ${value} === 'string' || ${value} === null || ${value} instanceof Date || ${value} instanceof RegExp || ` +
        `(typeof ${value} === 'object' && typeof ${value}.toString === 'function' && ` +
        `${value}.toString !== Object.prototype.toString)`
      );
    case 'integer':
      return `Number.isInteger(${value})`;
    case 'number':
      return `Number.isFinite(${value})`;
    case 'boolean':
      return `typeof ${value} === 'boolean'`;
    case 'object':
      return `${value} && typeof ${value} === 'object' && ${value}.constructor === Object`;
    case 'array':
      return `Array.isArray(${value})`;
    default:
      if (Array.isArray(type)) return `(${type.map((t) => typeCondition(t, value)).join(' || ')})`;
      return 'true';
  }
}

module.exports = build;
module.exports.build = build;
module.exports.default = build;
module.exports.validLargeArrayMechanisms = LARGE_ARRAY_MECHANISMS;

},
"@xufa/serializer/lib/deep-equal.js": function (module, exports, require) {
// Structural equality of JSON values (and of Dates and RegExps).
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a !== a && b !== b; // NaN
  }
  if (a.constructor !== b.constructor) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof RegExp) return a.source === b.source && a.flags === b.flags;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

module.exports = { deepEqual };

},
"@xufa/serializer/lib/match.js": function (module, exports, require) {
// Predicates compiled from JSON schemas: whether a value matches a schema. Used to choose the branch of anyOf, oneOf
// and if/then/else to serialize a value with. Strings also match values with a toJSON() method (Dates), as they are
// written as strings.
const { deepEqual } = require('./deep-equal');

const FORMATS = {
  'date-time': /^\d{4}-\d\d-\d\d[tT ]\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)$/,
  date: /^\d{4}-\d\d-\d\d$/,
  time: /^\d\d:\d\d:\d\d(?:\.\d+)?(?:[zZ]|[+-]\d\d(?::?\d\d)?)?$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  uuid: /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/,
  uri: /^[a-z][a-z0-9+.-]*:[^\s]*$/i,
};

const ALWAYS = () => true;
const NEVER = () => false;

const NUMERIC = /^\s*-?\d+(\.\d+)?([eE][+-]?\d+)?\s*$/;
const isTyped = (v, types) => types.includes(typeof v);

// With coercion (ajv's coerceTypes), the values ajv would convert to the type match it too.
function coercedTypeCheck(type) {
  switch (type) {
    case 'string':
      return (v) =>
        isTyped(v, ['string', 'number', 'boolean']) ||
        (v !== null && typeof v === 'object' && typeof v.toJSON === 'function');
    case 'number':
      return (v) =>
        (typeof v === 'number' && Number.isFinite(v)) ||
        typeof v === 'boolean' ||
        v === null ||
        (typeof v === 'string' && NUMERIC.test(v));
    case 'integer':
      return (v) =>
        Number.isInteger(v) ||
        typeof v === 'boolean' ||
        v === null ||
        (typeof v === 'string' && NUMERIC.test(v) && Number.isInteger(Number(v)));
    case 'boolean':
      return (v) => typeof v === 'boolean' || v === 'true' || v === 'false' || v === 1 || v === 0 || v === null;
    case 'null':
      return (v) => v === null || v === '' || v === 0 || v === false;
    default:
      return typeCheck(type);
  }
}

function typeCheck(type) {
  switch (type) {
    case 'null':
      return (v) => v === null;
    case 'boolean':
      return (v) => typeof v === 'boolean';
    case 'integer':
      return (v) => Number.isInteger(v);
    case 'number':
      return (v) => typeof v === 'number' && Number.isFinite(v);
    case 'string':
      return (v) => typeof v === 'string' || (v !== null && typeof v === 'object' && typeof v.toJSON === 'function');
    case 'array':
      return (v) => Array.isArray(v);
    case 'object':
      return (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    default:
      return NEVER;
  }
}

const length = (str) => [...str].length;

// compile(schema, base) -> (value) => boolean; refs are resolved by `resolver` against the base URI.
function createMatcher(resolver, options = {}) {
  const cache = new Map();
  const checkType = options.coerceTypes ? coercedTypeCheck : typeCheck;

  function compile(schema, base) {
    if (schema === true || schema === undefined) return ALWAYS;
    if (schema === false) return NEVER;
    if (cache.has(schema)) return cache.get(schema);
    // Placeholder for recursive schemas, replaced below.
    let compiled = null;
    const lazy = (value) => compiled(value);
    cache.set(schema, lazy);
    const checks = [];
    const schemaBase = resolver.baseOf(schema, base);

    if (schema.$ref !== undefined) {
      const target = resolver.resolve(schema.$ref, schemaBase);
      if (target === null) throw new Error(`Cannot find reference "${schema.$ref}"`);
      checks.push(compile(target.schema, target.base));
    }
    if (schema.type !== undefined) {
      const types = (Array.isArray(schema.type) ? schema.type : [schema.type]).map(checkType);
      if (schema.nullable === true) types.push(typeCheck('null'));
      checks.push(types.length === 1 ? types[0] : (v) => types.some((check) => check(v)));
    }
    if (schema.const !== undefined) {
      const expected = schema.const;
      checks.push((v) => deepEqual(v, expected) || (schema.nullable === true && v === null));
    }
    if (Array.isArray(schema.enum)) {
      const values = schema.enum;
      checks.push((v) => values.some((e) => deepEqual(v, e)) || (schema.nullable === true && v === null));
    }
    addStringChecks(schema, checks);
    addNumberChecks(schema, checks);
    addObjectChecks(schema, checks, schemaBase);
    addArrayChecks(schema, checks, schemaBase);
    for (const keyword of ['allOf', 'anyOf', 'oneOf']) {
      if (!Array.isArray(schema[keyword])) continue;
      const subs = schema[keyword].map((sub) => compile(sub, schemaBase));
      if (keyword === 'allOf') checks.push((v) => subs.every((check) => check(v)));
      else if (keyword === 'anyOf') checks.push((v) => subs.some((check) => check(v)));
      else checks.push((v) => subs.filter((check) => check(v)).length === 1);
    }
    if (schema.not !== undefined) {
      const not = compile(schema.not, schemaBase);
      checks.push((v) => !not(v));
    }
    if (schema.if !== undefined) {
      const test = compile(schema.if, schemaBase);
      const then = compile(schema.then, schemaBase);
      const otherwise = compile(schema.else, schemaBase);
      checks.push((v) => (test(v) ? then(v) : otherwise(v)));
    }
    compiled = checks.length === 0 ? ALWAYS : checks.length === 1 ? checks[0] : (v) => checks.every((c) => c(v));
    cache.set(schema, compiled);
    return compiled;
  }

  function addStringChecks(schema, checks) {
    const isString = (v) => typeof v === 'string';
    if (schema.minLength !== undefined) checks.push((v) => !isString(v) || length(v) >= schema.minLength);
    if (schema.maxLength !== undefined) checks.push((v) => !isString(v) || length(v) <= schema.maxLength);
    if (schema.pattern !== undefined) {
      const regex = new RegExp(schema.pattern, 'u');
      checks.push((v) => !isString(v) || regex.test(v));
    }
    if (schema.format !== undefined && FORMATS[schema.format]) {
      const regex = FORMATS[schema.format];
      checks.push((v) => !isString(v) || regex.test(v));
    }
  }

  function addNumberChecks(schema, checks) {
    const isNumber = (v) => typeof v === 'number';
    const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf } = schema;
    if (minimum !== undefined) checks.push((v) => !isNumber(v) || v >= minimum);
    if (maximum !== undefined) checks.push((v) => !isNumber(v) || v <= maximum);
    if (typeof exclusiveMinimum === 'number') checks.push((v) => !isNumber(v) || v > exclusiveMinimum);
    if (typeof exclusiveMaximum === 'number') checks.push((v) => !isNumber(v) || v < exclusiveMaximum);
    if (multipleOf !== undefined) {
      checks.push((v) => !isNumber(v) || Math.abs(v / multipleOf - Math.round(v / multipleOf)) < 1e-9);
    }
  }

  function addObjectChecks(schema, checks, base) {
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    if (Array.isArray(schema.required) && schema.required.length > 0) {
      const required = schema.required;
      checks.push((v) => !isObject(v) || required.every((key) => v[key] !== undefined));
    }
    const properties = schema.properties ? Object.keys(schema.properties) : [];
    const propertyChecks = properties.map((key) => [key, compile(schema.properties[key], base)]);
    const patterns = schema.patternProperties
      ? Object.keys(schema.patternProperties).map((p) => [
          new RegExp(p, 'u'),
          compile(schema.patternProperties[p], base),
        ])
      : [];
    const additional = schema.additionalProperties;
    if (propertyChecks.length > 0) {
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, check] of propertyChecks) if (v[key] !== undefined && !check(v[key])) return false;
        return true;
      });
    }
    if (patterns.length > 0 || (additional !== undefined && additional !== true)) {
      const additionalCheck = compile(additional, base);
      const known = new Set(properties);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const key of Object.keys(v)) {
          if (v[key] === undefined) continue;
          let matched = known.has(key);
          for (const [regex, check] of patterns) {
            if (regex.test(key)) {
              matched = true;
              if (!check(v[key])) return false;
            }
          }
          if (!matched && additional !== undefined && !additionalCheck(v[key])) return false;
        }
        return true;
      });
    }
    if (schema.minProperties !== undefined) {
      checks.push((v) => !isObject(v) || Object.keys(v).length >= schema.minProperties);
    }
    if (schema.maxProperties !== undefined) {
      checks.push((v) => !isObject(v) || Object.keys(v).length <= schema.maxProperties);
    }
    if (schema.dependentRequired || schema.dependencies) {
      const deps = { ...schema.dependencies, ...schema.dependentRequired };
      const entries = Object.keys(deps).map((key) => [key, deps[key]]);
      const schemaDeps = entries
        .filter(([, value]) => !Array.isArray(value))
        .map(([key, value]) => [key, compile(value, base)]);
      checks.push((v) => {
        if (!isObject(v)) return true;
        for (const [key, value] of entries) {
          if (v[key] === undefined) continue;
          if (Array.isArray(value) && !value.every((k) => v[k] !== undefined)) return false;
        }
        for (const [key, check] of schemaDeps) if (v[key] !== undefined && !check(v)) return false;
        return true;
      });
    }
  }

  function addArrayChecks(schema, checks, base) {
    const { items, prefixItems, additionalItems, minItems, maxItems, uniqueItems, contains } = schema;
    if (minItems !== undefined) checks.push((v) => !Array.isArray(v) || v.length >= minItems);
    if (maxItems !== undefined) checks.push((v) => !Array.isArray(v) || v.length <= maxItems);
    const tuple = Array.isArray(prefixItems) ? prefixItems : Array.isArray(items) ? items : null;
    if (tuple) {
      const tupleChecks = tuple.map((s) => compile(s, base));
      const rest = Array.isArray(prefixItems) ? items : additionalItems;
      const restCheck = compile(rest, base);
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1) {
          if (i < tupleChecks.length ? !tupleChecks[i](v[i]) : !restCheck(v[i])) return false;
        }
        return true;
      });
    } else if (items !== undefined) {
      const itemCheck = compile(items, base);
      checks.push((v) => !Array.isArray(v) || v.every((item) => itemCheck(item)));
    }
    if (contains !== undefined) {
      const containsCheck = compile(contains, base);
      checks.push((v) => !Array.isArray(v) || v.some((item) => containsCheck(item)));
    }
    if (uniqueItems === true) {
      checks.push((v) => {
        if (!Array.isArray(v)) return true;
        for (let i = 0; i < v.length; i += 1)
          for (let j = i + 1; j < v.length; j += 1) if (deepEqual(v[i], v[j])) return false;
        return true;
      });
    }
  }

  return compile;
}

module.exports = { createMatcher };

},
"@xufa/serializer/lib/merge.js": function (module, exports, require) {
// Merging of JSON schemas (for allOf, and the branches of anyOf / oneOf with the keywords around them): each keyword
// is combined by its meaning (types intersected, required united, bounds narrowed...). A keyword with values that can
// not be combined is dropped.
const { deepEqual } = require('./deep-equal');

class MergeError extends Error {
  constructor(keyword, values) {
    super(`Failed to merge "${keyword}" keyword schemas.`);
    this.keyword = keyword;
    this.values = values;
    this.schemas = values;
  }
}

function intersection(arrays) {
  let out = arrays[0];
  for (let i = 1; i < arrays.length; i += 1) out = out.filter((value) => arrays[i].some((v) => deepEqual(v, value)));
  return out;
}

function union(arrays) {
  const out = [];
  for (const array of arrays) for (const value of array) if (!out.some((v) => deepEqual(v, value))) out.push(value);
  return out;
}

function allEqual(keyword, values, merged) {
  for (let i = 1; i < values.length; i += 1) {
    if (!deepEqual(values[i], values[0])) throw new MergeError(keyword, values);
  }
  merged[keyword] = values[0];
}

const resolvers = {
  $id: () => {},
  type(keyword, values, merged) {
    const arrays = values.map((value) => (Array.isArray(value) ? value : [value]));
    const types = intersection(arrays);
    if (types.length === 0) throw new MergeError(keyword, arrays);
    merged[keyword] = types.length === 1 ? types[0] : types;
  },
  enum(keyword, values, merged) {
    const common = intersection(values);
    if (common.length === 0) throw new MergeError(keyword, values);
    merged[keyword] = common;
  },
  minLength: maxNumber,
  maxLength: minNumber,
  minimum: maxNumber,
  maximum: minNumber,
  exclusiveMinimum: maxNumber,
  exclusiveMaximum: minNumber,
  minItems: maxNumber,
  maxItems: minNumber,
  minProperties: maxNumber,
  maxProperties: minNumber,
  multipleOf(keyword, values, merged) {
    const gcd = (a, b) => (!b ? a : gcd(b, a % b));
    let scale = 1;
    for (const value of values) while ((value * scale) % 1 !== 0) scale *= 10;
    let multiple = values[0] * scale;
    for (const value of values) multiple = (multiple * value * scale) / gcd(multiple, value * scale);
    merged[keyword] = multiple / scale;
  },
  const: allEqual,
  default: allEqual,
  format: allEqual,
  required(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  allOf(keyword, values, merged) {
    merged[keyword] = union(values);
  },
  properties(keyword, values, merged, schemas, options) {
    const found = {};
    for (const schema of schemas) {
      for (const name of Object.keys(schema.properties || {})) {
        if (found[name] !== undefined) continue;
        found[name] = [schema.properties[name]];
        for (const other of schemas) {
          if (other === schema) continue;
          const propertySchema = schemaForProperty(other, name);
          if (propertySchema !== undefined) found[name].push(propertySchema);
        }
      }
    }
    const out = {};
    for (const name of Object.keys(found)) out[name] = mergeAll(found[name], options);
    merged[keyword] = out;
  },
  patternProperties: mergeObjects,
  definitions: mergeObjects,
  $defs: mergeObjects,
  dependentSchemas: mergeObjects,
  additionalProperties: mergeSubschemas,
  not: mergeSubschemas,
  propertyNames: mergeSubschemas,
  contains: mergeSubschemas,
  items(keyword, values, merged, schemas, options) {
    const tupleLength = Math.max(0, ...values.map((v) => (Array.isArray(v) ? v.length : 0)));
    if (tupleLength === 0) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const items = [];
    for (let i = 0; i < tupleLength; i += 1) {
      const atIndex = [];
      for (const schema of schemas) {
        const itemSchema = schemaForItem(schema, i);
        if (itemSchema !== undefined) atIndex.push(itemSchema);
      }
      items[i] = mergeAll(atIndex, options);
    }
    merged[keyword] = items;
  },
  additionalItems(keyword, values, merged, schemas, options) {
    if (!schemas.some((schema) => Array.isArray(schema.items))) {
      merged[keyword] = mergeAll(values, options);
      return;
    }
    const additional = [];
    for (const schema of schemas) {
      let value = schema.additionalItems;
      if (value === undefined && !Array.isArray(schema.items)) value = schema.items;
      if (value !== undefined) additional.push(value);
    }
    merged[keyword] = mergeAll(additional, options);
  },
  nullable(keyword, values, merged) {
    merged[keyword] = values.every((value) => value !== false);
  },
  uniqueItems(keyword, values, merged) {
    merged[keyword] = values.some((value) => value === true);
  },
  oneOf: mergeOneOf,
  anyOf: mergeOneOf,
  if(keyword, values, merged, schemas, options) {
    for (const schema of schemas) {
      if (schema.if === undefined) continue;
      const sub = { if: schema.if, then: schema.then, else: schema.else };
      if (merged.if === undefined) {
        merged.if = sub.if;
        if (sub.then !== undefined) merged.then = sub.then;
        if (sub.else !== undefined) merged.else = sub.else;
        continue;
      }
      if (merged.then !== undefined) merged.then = mergeAll([merged.then, sub], options);
      if (merged.else !== undefined) merged.else = mergeAll([merged.else, sub], options);
    }
  },
  then: () => {},
  else: () => {},
  dependencies: mergeDependencies,
  dependentRequired: mergeDependencies,
};

function minNumber(keyword, values, merged) {
  merged[keyword] = Math.min(...values);
}

function maxNumber(keyword, values, merged) {
  merged[keyword] = Math.max(...values);
}

function mergeSubschemas(keyword, values, merged, schemas, options) {
  merged[keyword] = mergeAll(values, options);
}

function mergeObjects(keyword, values, merged, schemas, options) {
  const grouped = {};
  for (const value of values) {
    for (const name of Object.keys(value)) (grouped[name] = grouped[name] || []).push(value[name]);
  }
  const out = {};
  for (const name of Object.keys(grouped)) out[name] = mergeAll(grouped[name], options);
  merged[keyword] = out;
}

function mergeDependencies(keyword, values, merged) {
  const out = {};
  for (const dependencies of values) {
    for (const name of Object.keys(dependencies)) {
      out[name] = out[name] || [];
      for (const dependency of dependencies[name]) if (!out[name].includes(dependency)) out[name].push(dependency);
    }
  }
  merged[keyword] = out;
}

function mergeOneOf(keyword, values, merged, schemas, options) {
  if (values.length === 1) {
    merged[keyword] = values[0];
    return;
  }
  let product = [[]];
  for (const array of values) product = product.flatMap((combination) => array.map((item) => [...combination, item]));
  const out = [];
  for (const combination of product) {
    try {
      const schema = mergeAll(combination, options);
      if (schema !== undefined) out.push(schema);
    } catch (err) {
      if (!(err instanceof MergeError)) throw err;
    }
  }
  merged[keyword] = out;
}

function schemaForItem(schema, index) {
  const { items, additionalItems } = schema;
  if (Array.isArray(items)) return index < items.length ? items[index] : additionalItems;
  return items !== undefined ? items : additionalItems;
}

function schemaForProperty(schema, name) {
  if (schema.properties && schema.properties[name] !== undefined) return schema.properties[name];
  for (const pattern of Object.keys(schema.patternProperties || {})) {
    if (new RegExp(pattern).test(name)) return schema.patternProperties[pattern];
  }
  return schema.additionalProperties;
}

// Conflicting values of other keywords: equal ones are kept, different ones dropped.
function defaultResolver(keyword, values, merged) {
  if (values.length === 1 || values.every((value) => deepEqual(value, values[0]))) merged[keyword] = values[0];
}

function mergeAll(schemas, options = {}) {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];
  const keywords = {};
  let allTrue = true;
  for (const schema of schemas) {
    if (schema === false) return false;
    if (schema === true) continue;
    allTrue = false;
    for (const keyword of Object.keys(schema)) (keywords[keyword] = keywords[keyword] || []).push(schema[keyword]);
  }
  if (allTrue) return true;
  const merged = {};
  const relevant = schemas.filter((schema) => schema !== true);
  for (const keyword of Object.keys(keywords)) {
    const resolver = resolvers[keyword] || defaultResolver;
    resolver(keyword, keywords[keyword], merged, relevant, options);
  }
  return merged;
}

module.exports = { mergeSchemas: mergeAll, MergeError };

},
"@xufa/serializer/lib/meta.js": function (module, exports, require) {
// Validation of schemas against the meta-schema of draft-07, reporting the first error the way ajv does
// ("data/properties/claws/type must be equal to one of the allowed values"). Keywords are checked in the order of the
// meta-schema, as ajv checks them.

const SIMPLE_TYPES = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

class SchemaError extends Error {}

function fail(path, message) {
  throw new SchemaError(`data${path} ${message}`);
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isSchema = (value) => typeof value === 'boolean' || isObject(value);

function isRegex(source) {
  try {
    // eslint-disable-next-line no-new
    new RegExp(source, 'u');
    return true;
  } catch {
    return false;
  }
}

function nonNegativeInteger(value, path) {
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(path, 'must be integer');
  if (value < 0) fail(path, 'must be >= 0');
}

function number(value, path) {
  if (typeof value !== 'number') fail(path, 'must be number');
}

function schema(value, path) {
  if (!isSchema(value)) fail(path, 'must be object,boolean');
  if (typeof value === 'boolean') return;
  const s = value;
  if (s.$id !== undefined && typeof s.$id !== 'string') fail(`${path}/$id`, 'must be string');
  if (s.$schema !== undefined && typeof s.$schema !== 'string') fail(`${path}/$schema`, 'must be string');
  if (s.$ref !== undefined && typeof s.$ref !== 'string') fail(`${path}/$ref`, 'must be string');
  if (s.$comment !== undefined && typeof s.$comment !== 'string') fail(`${path}/$comment`, 'must be string');
  if (s.title !== undefined && typeof s.title !== 'string') fail(`${path}/title`, 'must be string');
  if (s.description !== undefined && typeof s.description !== 'string') fail(`${path}/description`, 'must be string');
  if (s.readOnly !== undefined && typeof s.readOnly !== 'boolean') fail(`${path}/readOnly`, 'must be boolean');
  if (s.examples !== undefined && !Array.isArray(s.examples)) fail(`${path}/examples`, 'must be array');
  if (s.multipleOf !== undefined) {
    number(s.multipleOf, `${path}/multipleOf`);
    if (s.multipleOf <= 0) fail(`${path}/multipleOf`, 'must be > 0');
  }
  for (const key of ['maximum', 'exclusiveMaximum', 'minimum', 'exclusiveMinimum']) {
    // draft-04 schemas have booleans for the exclusive ones
    if (s[key] !== undefined && typeof s[key] !== 'boolean') number(s[key], `${path}/${key}`);
  }
  if (s.maxLength !== undefined) nonNegativeInteger(s.maxLength, `${path}/maxLength`);
  if (s.minLength !== undefined) nonNegativeInteger(s.minLength, `${path}/minLength`);
  if (s.pattern !== undefined) {
    if (typeof s.pattern !== 'string') fail(`${path}/pattern`, 'must be string');
    if (!isRegex(s.pattern)) fail(`${path}/pattern`, 'must match format "regex"');
  }
  if (s.additionalItems !== undefined) schema(s.additionalItems, `${path}/additionalItems`);
  if (s.items !== undefined) {
    if (Array.isArray(s.items)) {
      if (s.items.length === 0) fail(`${path}/items`, 'must NOT have fewer than 1 items');
      s.items.forEach((item, i) => schema(item, `${path}/items/${i}`));
    } else {
      schema(s.items, `${path}/items`);
    }
  }
  if (s.maxItems !== undefined) nonNegativeInteger(s.maxItems, `${path}/maxItems`);
  if (s.minItems !== undefined) nonNegativeInteger(s.minItems, `${path}/minItems`);
  if (s.uniqueItems !== undefined && typeof s.uniqueItems !== 'boolean') fail(`${path}/uniqueItems`, 'must be boolean');
  if (s.contains !== undefined) schema(s.contains, `${path}/contains`);
  if (s.maxProperties !== undefined) nonNegativeInteger(s.maxProperties, `${path}/maxProperties`);
  if (s.minProperties !== undefined) nonNegativeInteger(s.minProperties, `${path}/minProperties`);
  if (s.required !== undefined) {
    if (!Array.isArray(s.required)) fail(`${path}/required`, 'must be array');
    s.required.forEach((item, i) => {
      if (typeof item !== 'string') fail(`${path}/required/${i}`, 'must be string');
    });
  }
  if (s.additionalProperties !== undefined) schema(s.additionalProperties, `${path}/additionalProperties`);
  schemaMap(s.definitions, `${path}/definitions`);
  schemaMap(s.properties, `${path}/properties`);
  if (s.patternProperties !== undefined) {
    if (!isObject(s.patternProperties)) fail(`${path}/patternProperties`, 'must be object');
    for (const key of Object.keys(s.patternProperties)) {
      if (!isRegex(key)) fail(`${path}/patternProperties`, 'must match format "regex"');
    }
    schemaMap(s.patternProperties, `${path}/patternProperties`);
  }
  if (s.dependencies !== undefined) {
    if (!isObject(s.dependencies)) fail(`${path}/dependencies`, 'must be object');
    for (const key of Object.keys(s.dependencies)) {
      const dep = s.dependencies[key];
      if (!Array.isArray(dep)) schema(dep, `${path}/dependencies/${key}`);
    }
  }
  if (s.propertyNames !== undefined) schema(s.propertyNames, `${path}/propertyNames`);
  if (s.enum !== undefined && !Array.isArray(s.enum)) fail(`${path}/enum`, 'must be array');
  if (s.type !== undefined) {
    if (Array.isArray(s.type)) {
      s.type.forEach((type, i) => {
        if (!SIMPLE_TYPES.has(type)) fail(`${path}/type/${i}`, 'must be equal to one of the allowed values');
      });
    } else if (!SIMPLE_TYPES.has(s.type)) {
      fail(`${path}/type`, 'must be equal to one of the allowed values');
    }
  }
  if (s.format !== undefined && typeof s.format !== 'string') fail(`${path}/format`, 'must be string');
  if (s.if !== undefined) schema(s.if, `${path}/if`);
  if (s.then !== undefined) schema(s.then, `${path}/then`);
  if (s.else !== undefined) schema(s.else, `${path}/else`);
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (s[key] === undefined) continue;
    if (!Array.isArray(s[key])) fail(`${path}/${key}`, 'must be array');
    if (s[key].length === 0) fail(`${path}/${key}`, 'must NOT have fewer than 1 items');
    s[key].forEach((item, i) => schema(item, `${path}/${key}/${i}`));
  }
  if (s.not !== undefined) schema(s.not, `${path}/not`);
}

function schemaMap(map, path) {
  if (map === undefined) return;
  if (!isObject(map)) fail(path, 'must be object');
  for (const key of Object.keys(map)) schema(map[key], `${path}/${key}`);
}

// Throws "<name> schema is invalid: data... <message>" for the first error found.
function validateSchema(value, name) {
  try {
    schema(value, '');
  } catch (err) {
    if (!(err instanceof SchemaError)) throw err;
    throw new Error(`${name ? `"${name}" ` : ''}schema is invalid: ${err.message}`);
  }
}

module.exports = { validateSchema };

},
"@xufa/serializer/lib/resolver.js": function (module, exports, require) {
// Resolution of $ref: schemas are registered by their $id (or a key), with the $id and anchors they hold inside.
// A reference is resolved against the base URI of the schema holding it.

const { deepEqual } = require('./deep-equal');

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function stripHash(uri) {
  return uri.endsWith('#') ? uri.slice(0, -1) : uri;
}

// The URI of a reference relative to a base. Plain names ('user') are kept as they are.
function resolveURI(base, ref) {
  if (ref === '') return base;
  if (SCHEME.test(ref)) return stripHash(ref);
  if (base && SCHEME.test(base)) {
    try {
      return stripHash(new URL(ref, base).href);
    } catch {
      return ref;
    }
  }
  return ref;
}

function unescapePointerSegment(segment) {
  let out = segment.replace(/~1/g, '/').replace(/~0/g, '~');
  if (out.includes('%')) {
    try {
      out = decodeURIComponent(out);
    } catch {
      // kept as written
    }
  }
  return out;
}

class RefResolver {
  constructor() {
    this.docs = new Map(); // URI -> schema
    this.anchors = new Map(); // URI#name -> { schema, base }
    this.bases = new Map(); // schema object -> base URI
  }

  hasSchema(uri) {
    return this.docs.has(stripHash(uri));
  }

  getSchema(uri) {
    return this.docs.get(stripHash(uri));
  }

  addSchema(schema, key) {
    let id = key;
    if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
      id = resolveURI(key && SCHEME.test(key) ? key : '', schema.$id);
    }
    id = stripHash(id);
    if (!this.docs.has(id)) this.docs.set(id, schema);
    if (key !== undefined && stripHash(key) !== id && !this.docs.has(stripHash(key)))
      this.docs.set(stripHash(key), schema);
    this.walk(schema, id, true);
    return id;
  }

  walk(schema, base, isRoot) {
    if (schema === null || typeof schema !== 'object') return;
    if (Array.isArray(schema)) {
      for (const item of schema) this.walk(item, base, false);
      return;
    }
    let current = base;
    if (typeof schema.$id === 'string') {
      if (schema.$id[0] === '#') {
        const key = `${base}${schema.$id}`;
        const existing = this.anchors.get(key);
        if (existing && existing.schema !== schema && !deepEqual(existing.schema, schema)) {
          throw new Error(`There is already another anchor "${schema.$id}" in schema "${base}".`);
        }
        this.anchors.set(key, { schema, base });
      } else if (!isRoot) {
        current = resolveURI(base, schema.$id);
        const existing = this.docs.get(current);
        if (existing !== undefined && existing !== schema && !deepEqual(existing, schema)) {
          throw new Error(`There is already another schema with id "${current}".`);
        }
        if (existing === undefined) this.docs.set(current, schema);
      }
    }
    if (typeof schema.$anchor === 'string') this.anchors.set(`${current}#${schema.$anchor}`, { schema, base: current });
    if (!this.bases.has(schema)) this.bases.set(schema, current);
    for (const key of Object.keys(schema)) {
      // enum and const hold values, not schemas
      if (key === 'enum' || key === 'const' || key === 'default' || key === 'examples') continue;
      const value = schema[key];
      if (value !== null && typeof value === 'object') this.walk(value, current, false);
    }
  }

  baseOf(schema, fallback) {
    return this.bases.get(schema) || fallback;
  }

  // The id of the document a reference points to when no such document is known, else null.
  missingDocument(ref, base) {
    const hash = ref.indexOf('#');
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const uri = uriPart === '' ? base : resolveURI(base, uriPart);
    return this.docs.has(uri) ? null : uri;
  }

  // { schema, base, pointer } of a reference, or null.
  resolve(ref, base) {
    const hash = ref.indexOf('#');
    const uriPart = hash === -1 ? ref : ref.slice(0, hash);
    const fragment = hash === -1 ? '' : ref.slice(hash + 1);
    const uri = uriPart === '' ? base : resolveURI(base, uriPart);
    if (fragment !== '' && fragment[0] !== '/') {
      const anchor = this.anchors.get(`${uri}#${fragment}`);
      return anchor ? { schema: anchor.schema, base: anchor.base, pointer: `#${fragment}` } : null;
    }
    const doc = this.docs.get(uri);
    if (doc === undefined) return null;
    if (fragment === '') return { schema: doc, base: uri, pointer: '#' };
    let schema = doc;
    let current = uri;
    const segments = fragment.slice(1).split('/').map(unescapePointerSegment);
    for (const segment of segments) {
      if (schema === null || typeof schema !== 'object' || !(segment in schema)) return null;
      schema = schema[segment];
      if (schema && typeof schema === 'object' && typeof schema.$id === 'string' && schema.$id[0] !== '#') {
        current = resolveURI(current, schema.$id);
      }
    }
    return { schema, base: current, pointer: `#${fragment}` };
  }
}

module.exports = { RefResolver, resolveURI };

},
"@xufa/serializer/lib/runtime.js": function (module, exports, require) {
// Functions the generated serializers call to write values: the same results as fast-json-stringify.
const { writeNumberText } = require('./writer');

// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;

// The strings are joined with +, not template literals: V8 makes fewer strings of them (measured: 2-3 ns a call).
/* eslint-disable prefer-template */
function asString(str) {
  const len = str.length;
  if (len === 0) return '""';
  if (len < 42) {
    // Short strings: quotes and backslashes are escaped here, anything else to escape goes to JSON.stringify.
    let result = '';
    let last = -1;
    for (let i = 0; i < len; i += 1) {
      const point = str.charCodeAt(i);
      if (point === 34 || point === 92) {
        if (last === -1) last = 0;
        result += str.slice(last, i) + '\\';
        last = i;
      } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
        return JSON.stringify(str);
      }
    }
    return last === -1 ? '"' + str + '"' : '"' + result + str.slice(last) + '"';
  }
  if (len < 5000 && !NEEDS_ESCAPE.test(str)) return '"' + str + '"';
  return JSON.stringify(str);
}
/* eslint-enable prefer-template */

// A value of a property of type string that is not a string.
function asStringValue(value) {
  if (typeof value === 'string') return asString(value);
  if (value === null) return '""';
  if (value instanceof Date) return `"${value.toISOString()}"`;
  if (value instanceof RegExp) return asString(value.source);
  return asString(value.toString());
}

function asUnsafeString(str) {
  return `"${str}"`;
}

function createAsInteger(rounding) {
  let round = Math.trunc;
  if (rounding === 'floor') round = Math.floor;
  else if (rounding === 'ceil') round = Math.ceil;
  else if (rounding === 'round') round = Math.round;
  return function asInteger(value) {
    if (Number.isInteger(value)) return `${value}`;
    if (typeof value === 'bigint') return value.toString();
    const integer = round(value);
    if (integer === Infinity || integer === -Infinity || Number.isNaN(integer)) {
      throw new Error(`The value "${value}" cannot be converted to an integer.`);
    }
    return `${integer}`;
  };
}

function asNumber(value) {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return `${value}`;
    if (Number.isNaN(value)) throw new Error(`The value "${value}" cannot be converted to a number.`);
    return 'null';
  }
  const num = Number(value);
  if (Number.isNaN(num)) throw new Error(`The value "${value}" cannot be converted to a number.`);
  if (num === Infinity || num === -Infinity) return 'null';
  return `${num}`;
}

function asBoolean(value) {
  return value ? 'true' : 'false';
}

function localDate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
}

function asDateTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${date.toISOString()}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date-time.`);
}

function asDate(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(0, 10)}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a date.`);
}

function asTime(date) {
  if (date === null) return '""';
  if (date instanceof Date) return `"${localDate(date).slice(11, 19)}"`;
  if (typeof date === 'string') return `"${date}"`;
  throw new Error(`The value "${date}" cannot be converted to a time.`);
}

// What JSON.stringify writes for a value, or "undefined" as fast-json-stringify does.
function asAny(value) {
  return `${JSON.stringify(value)}`;
}

function createRuntime(options = {}) {
  const asInteger = createAsInteger(options.rounding);
  return {
    asString,
    asStringValue,
    asUnsafeString,
    asInteger,
    // The writers of numbers of the 'bytes' output: the text of asInteger and asNumber, without making it for the
    // numbers that are written as they are.
    writeInteger(value) {
      writeNumberText(Number.isInteger(value) ? '' + value : asInteger(value)); // eslint-disable-line prefer-template
    },
    writeNumber(value) {
      writeNumberText(typeof value === 'number' && Number.isFinite(value) ? '' + value : asNumber(value)); // eslint-disable-line prefer-template
    },
    asNumber,
    asBoolean,
    asDateTime,
    asDate,
    asTime,
    asAny,
  };
}

module.exports = { createRuntime, asString, asNumber, asBoolean, asDateTime, asDate, asTime };

},
"@xufa/serializer/lib/writer.js": function (module, exports, require) {
// The output of the generated serializers: UTF-8 bytes written to one buffer, read back as a string at the end.
//
// Joining strings with + makes a tree of them that V8 copies into a flat string when the result is used (written to a
// socket, measured): for a response of a few KB that copy costs as much as building it. Bytes in a buffer need one
// read at the end, which is a copy at memory speed.
//
// The buffer is shared by every serializer. A serialization starts where the buffer is filled up to (begin()) and
// gives that place back when it ends (end() or abort()), so that a serializer called while another one writes (by a
// toJSON() method) writes after it and leaves it as it was.

const INITIAL_SIZE = 64 * 1024;
// A buffer grown beyond this for a large response is replaced by a small one when nothing is being written.
const KEEP_SIZE = 1024 * 1024;
// Strings longer than this are checked by a regular expression and encoded by Buffer#utf8Write (native code), which
// is faster for long strings and slower for short ones than the loop of writeString.
const LONG_STRING = 64;

// eslint-disable-next-line no-control-regex
const NEEDS_ESCAPE = /[\x00-\x1f"\\\ud800-\udfff]/;
const HEX = '0123456789abcdef';

let buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
let pos = 0;

function grow(needed) {
  const next = Buffer.allocUnsafeSlow(Math.max(buf.length * 2, pos + needed));
  buf.copy(next, 0, 0, pos);
  buf = next;
}

function begin() {
  return pos;
}

// The string written since `start`; the buffer is given back.
function end(start) {
  const text = buf.utf8Slice(start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return text;
}

// The bytes written since `start`, in a buffer of their own (the shared one is written again by the next
// serialization, before a socket may have sent them); the buffer is given back.
function endBuffer(start) {
  const out = Buffer.allocUnsafe(pos - start);
  buf.copy(out, 0, start, pos);
  pos = start;
  if (start === 0 && buf.length > KEEP_SIZE) buf = Buffer.allocUnsafeSlow(INITIAL_SIZE);
  return out;
}

function abort(start) {
  pos = start;
}

// Bytes known when the serializer was compiled (keys, punctuation), as a Uint8Array.
function writeBytes(bytes) {
  const n = bytes.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = bytes[i];
  pos += n;
}

function writeByte(byte) {
  if (pos === buf.length) grow(1);
  buf[pos] = byte;
  pos += 1;
}

// Text that is JSON already (from JSON.stringify, a date formatter, a number): written as UTF-8.
function writeRaw(text) {
  const n = text.length;
  if (n < LONG_STRING) {
    if (pos + n * 3 > buf.length) grow(n * 3);
    let p = pos;
    for (let i = 0; i < n; i += 1) {
      const c = text.charCodeAt(i);
      if (c >= 128) {
        pos += buf.utf8Write(text, pos, buf.length - pos);
        return;
      }
      buf[p] = c;
      p += 1;
    }
    pos = p;
    return;
  }
  if (pos + n * 3 > buf.length) grow(n * 3);
  pos += buf.utf8Write(text, pos, buf.length - pos);
}

// A number written as JSON writes it (finite ones only: the callers check).
function writeNumberText(text) {
  const n = text.length;
  if (pos + n > buf.length) grow(n);
  for (let i = 0; i < n; i += 1) buf[pos + i] = text.charCodeAt(i);
  pos += n;
}

function writeEscapedUnit(p, c) {
  buf[p] = 92;
  switch (c) {
    case 34:
      buf[p + 1] = 34;
      return p + 2;
    case 92:
      buf[p + 1] = 92;
      return p + 2;
    case 8:
      buf[p + 1] = 98;
      return p + 2;
    case 12:
      buf[p + 1] = 102;
      return p + 2;
    case 10:
      buf[p + 1] = 110;
      return p + 2;
    case 13:
      buf[p + 1] = 114;
      return p + 2;
    case 9:
      buf[p + 1] = 116;
      return p + 2;
    default:
      // \u00XX for the other control characters, \udXXX for lone surrogates: what JSON.stringify writes.
      buf[p + 1] = 117;
      buf[p + 2] = HEX.charCodeAt(c >> 12);
      buf[p + 3] = HEX.charCodeAt((c >> 8) & 15);
      buf[p + 4] = HEX.charCodeAt((c >> 4) & 15);
      buf[p + 5] = HEX.charCodeAt(c & 15);
      return p + 6;
  }
}

// A string, quoted and escaped as JSON.stringify does it, as UTF-8.
function writeString(text) {
  const n = text.length;
  if (n > LONG_STRING) {
    writeLongString(text);
    return;
  }
  // At most 6 bytes a UTF-16 unit (an escape), and the quotes.
  if (pos + n * 6 + 2 > buf.length) grow(n * 6 + 2);
  let p = pos;
  buf[p] = 34;
  p += 1;
  for (let i = 0; i < n; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 128) {
      if (c >= 32 && c !== 34 && c !== 92) {
        buf[p] = c;
        p += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    } else if (c < 0x800) {
      buf[p] = 0xc0 | (c >> 6);
      buf[p + 1] = 0x80 | (c & 63);
      p += 2;
    } else if (c < 0xd800 || c > 0xdfff) {
      buf[p] = 0xe0 | (c >> 12);
      buf[p + 1] = 0x80 | ((c >> 6) & 63);
      buf[p + 2] = 0x80 | (c & 63);
      p += 3;
    } else {
      const next = i + 1 < n ? text.charCodeAt(i + 1) : 0;
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        // A surrogate pair: one code point of 4 bytes.
        const point = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        buf[p] = 0xf0 | (point >> 18);
        buf[p + 1] = 0x80 | ((point >> 12) & 63);
        buf[p + 2] = 0x80 | ((point >> 6) & 63);
        buf[p + 3] = 0x80 | (point & 63);
        p += 4;
        i += 1;
      } else {
        p = writeEscapedUnit(p, c);
      }
    }
  }
  buf[p] = 34;
  pos = p + 1;
}

function writeLongString(text) {
  if (NEEDS_ESCAPE.test(text)) {
    writeRaw(JSON.stringify(text));
    return;
  }
  const n = text.length;
  if (pos + n * 3 + 2 > buf.length) grow(n * 3 + 2);
  buf[pos] = 34;
  pos += 1;
  pos += buf.utf8Write(text, pos, buf.length - pos);
  buf[pos] = 34;
  pos += 1;
}

// The bytes of a literal of the generated code.
function bytesOf(text) {
  return new Uint8Array(Buffer.from(text, 'utf8'));
}

module.exports = {
  begin,
  end,
  endBuffer,
  abort,
  writeBytes,
  writeByte,
  writeRaw,
  writeNumberText,
  writeString,
  bytesOf,
};

},
"@xufa/serializer/package.json": function (module, exports, require) {
module.exports = {"name":"@xufa/serializer","version":"0.1.0"};
},
"node:async_hooks": function (module, exports, require) {
// node:async_hooks and node:diagnostics_channel in the browser bundle of @xufa/http (docs/xufa-http.js): what the
// modules use of them, without the tracking of Node. AsyncLocalStorage keeps its store for the code run() calls
// synchronously, and the channels have no subscribers.
'use strict';

function AsyncResource() {}
AsyncResource.prototype.runInAsyncScope = function (fn, thisArg) {
  return fn.apply(thisArg, Array.prototype.slice.call(arguments, 2));
};
AsyncResource.prototype.bind = function (fn) {
  return fn;
};
AsyncResource.prototype.emitDestroy = function () {
  return this;
};
AsyncResource.bind = function (fn) {
  return fn;
};

function AsyncLocalStorage() {
  this.store = undefined;
}
AsyncLocalStorage.prototype.getStore = function () {
  return this.store;
};
AsyncLocalStorage.prototype.enterWith = function (store) {
  this.store = store;
};
AsyncLocalStorage.prototype.run = function (store, fn) {
  var previous = this.store;
  this.store = store;
  try {
    return fn.apply(null, Array.prototype.slice.call(arguments, 2));
  } finally {
    this.store = previous;
  }
};
AsyncLocalStorage.prototype.exit = function (fn) {
  return this.run(undefined, fn);
};
AsyncLocalStorage.prototype.disable = function () {
  this.store = undefined;
};

function Channel(name) {
  this.name = name;
  this.hasSubscribers = false;
}
Channel.prototype.publish = function () {};
Channel.prototype.subscribe = function () {};
Channel.prototype.unsubscribe = function () {
  return false;
};
Channel.prototype.bindStore = function () {};
Channel.prototype.unbindStore = function () {};
Channel.prototype.runStores = function (context, fn, thisArg) {
  return fn.apply(thisArg, Array.prototype.slice.call(arguments, 3));
};

function TracingChannel(name) {
  var self = this;
  ['start', 'end', 'asyncStart', 'asyncEnd', 'error'].forEach(function (event) {
    self[event] = new Channel('tracing:' + name + ':' + event);
  });
  this.hasSubscribers = false;
}
TracingChannel.prototype.subscribe = function () {};
TracingChannel.prototype.unsubscribe = function () {
  return false;
};
TracingChannel.prototype.traceSync = function (fn, context, thisArg) {
  return fn.apply(thisArg, Array.prototype.slice.call(arguments, 3));
};
TracingChannel.prototype.tracePromise = TracingChannel.prototype.traceSync;
TracingChannel.prototype.traceCallback = function (fn, position, context, thisArg) {
  return fn.apply(thisArg, Array.prototype.slice.call(arguments, 4));
};

module.exports = {
  AsyncResource: AsyncResource,
  AsyncLocalStorage: AsyncLocalStorage,
  executionAsyncId: function () {
    return 1;
  },
  triggerAsyncId: function () {
    return 0;
  },
  createHook: function () {
    return { enable: function () {}, disable: function () {} };
  },
  // node:diagnostics_channel
  channel: function (name) {
    return new Channel(name);
  },
  tracingChannel: function (name) {
    return new TracingChannel(name);
  },
  hasSubscribers: function () {
    return false;
  },
  subscribe: function () {},
  unsubscribe: function () {
    return false;
  },
  Channel: Channel,
};

},
"node:crypto": function (module, exports, require) {

var refuse = function () { throw new Error('node:crypto is not in the browser'); };
module.exports = {
  randomUUID: function () { return root.crypto.randomUUID(); },
  randomBytes: function (size) { return Buffer.from(root.crypto.getRandomValues(new Uint8Array(size))); },
  createHash: refuse, createHmac: refuse, timingSafeEqual: refuse,
};
},
"node:diagnostics_channel": function (module, exports, require) {
module.exports = require('node:async_hooks');
},
"node:dns": function (module, exports, require) {

var refuse = function () { throw new Error('node:dns is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:events": function (module, exports, require) {
// node:events in the browser bundle of @xufa/http (docs/xufa-http.js): EventEmitter, as a function (the modules call it
// on objects of their own: EventEmitter.call(this)).
'use strict';

function EventEmitter() {
  this._events = Object.create(null);
}

function listeners(emitter, name) {
  if (!emitter._events) emitter._events = Object.create(null);
  return emitter._events[name] || (emitter._events[name] = []);
}

EventEmitter.prototype.on = function on(name, fn) {
  listeners(this, name).push({ fn: fn, once: false });
  return this;
};
EventEmitter.prototype.addListener = EventEmitter.prototype.on;
EventEmitter.prototype.prependListener = function prependListener(name, fn) {
  listeners(this, name).unshift({ fn: fn, once: false });
  return this;
};
EventEmitter.prototype.once = function once(name, fn) {
  listeners(this, name).push({ fn: fn, once: true });
  return this;
};
EventEmitter.prototype.prependOnceListener = function prependOnceListener(name, fn) {
  listeners(this, name).unshift({ fn: fn, once: true });
  return this;
};
EventEmitter.prototype.removeListener = function removeListener(name, fn) {
  var list = listeners(this, name);
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].fn === fn) {
      list.splice(i, 1);
      break;
    }
  }
  return this;
};
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.removeAllListeners = function removeAllListeners(name) {
  if (name === undefined) this._events = Object.create(null);
  else if (this._events) delete this._events[name];
  return this;
};
EventEmitter.prototype.emit = function emit(name) {
  var list = this._events && this._events[name];
  var args = Array.prototype.slice.call(arguments, 1);
  if (!list || list.length === 0) {
    if (name === 'error') throw args[0] instanceof Error ? args[0] : new Error('Unhandled error: ' + args[0]);
    return false;
  }
  list.slice().forEach(function (listener) {
    if (listener.once) this.removeListener(name, listener.fn);
    listener.fn.apply(this, args);
  }, this);
  return true;
};
EventEmitter.prototype.listeners = function (name) {
  return listeners(this, name).map(function (listener) {
    return listener.fn;
  });
};
EventEmitter.prototype.rawListeners = EventEmitter.prototype.listeners;
EventEmitter.prototype.listenerCount = function (name) {
  return listeners(this, name).length;
};
EventEmitter.prototype.eventNames = function () {
  var events = this._events || {};
  return Object.keys(events).filter(function (name) {
    return events[name].length > 0;
  });
};
EventEmitter.prototype.setMaxListeners = function () {
  return this;
};
EventEmitter.prototype.getMaxListeners = function () {
  return EventEmitter.defaultMaxListeners;
};

EventEmitter.defaultMaxListeners = 10;
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.once = function (emitter, name) {
  return new Promise(function (resolve, reject) {
    emitter.once(name, function () {
      resolve(Array.prototype.slice.call(arguments));
    });
    if (name !== 'error') emitter.once('error', reject);
  });
};

module.exports = EventEmitter;

},
"node:fs": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs is not in the browser'); };
function write(fd, data) {
  var text = typeof data === 'string' ? data : Buffer.from(data).toString();
  (fd === 2 ? console.error : console.log)(text.replace(/\n$/, ''));
  return typeof data === 'string' ? Buffer.byteLength(data) : data.length;
}
module.exports = new Proxy({
  writeSync: write,
  write: function (fd, data, callback) { var written = write(fd, data); if (typeof callback === 'function') queueMicrotask(function () { callback(null, written); }); },
  fsyncSync: function () {},
}, { get: function (target, key) { return key in target ? target[key] : key === '__esModule' ? false : refuse; } });
},
"node:fs/promises": function (module, exports, require) {

var refuse = function () { throw new Error('node:fs/promises is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:http": function (module, exports, require) {
// node:http (and node:https) in the browser bundle of @xufa/http (docs/xufa-http.js): METHODS, STATUS_CODES, and the
// IncomingMessage and ServerResponse that @xufa/inject builds its requests and replies on (the response keeps its
// headers as Node does, and writes the head Node would write into _header). There is no server: createServer() gives
// one whose listen() throws, as app.inject() needs no socket.
'use strict';

var EventEmitter = require('node:events');
var stream = require('node:stream');
var util = require('node:util');

var METHODS = [
  'ACL',
  'BIND',
  'CHECKOUT',
  'CONNECT',
  'COPY',
  'DELETE',
  'GET',
  'HEAD',
  'LINK',
  'LOCK',
  'M-SEARCH',
  'MERGE',
  'MKACTIVITY',
  'MKCALENDAR',
  'MKCOL',
  'MOVE',
  'NOTIFY',
  'OPTIONS',
  'PATCH',
  'POST',
  'PROPFIND',
  'PROPPATCH',
  'PURGE',
  'PUT',
  'QUERY',
  'REBIND',
  'REPORT',
  'SEARCH',
  'SOURCE',
  'SUBSCRIBE',
  'TRACE',
  'UNBIND',
  'UNLINK',
  'UNLOCK',
  'UNSUBSCRIBE',
];

var STATUS_CODES = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  103: 'Early Hints',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  205: 'Reset Content',
  206: 'Partial Content',
  207: 'Multi-Status',
  208: 'Already Reported',
  226: 'IM Used',
  300: 'Multiple Choices',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  305: 'Use Proxy',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  406: 'Not Acceptable',
  407: 'Proxy Authentication Required',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  411: 'Length Required',
  412: 'Precondition Failed',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  416: 'Range Not Satisfiable',
  417: 'Expectation Failed',
  418: "I'm a Teapot",
  421: 'Misdirected Request',
  422: 'Unprocessable Entity',
  423: 'Locked',
  424: 'Failed Dependency',
  425: 'Too Early',
  426: 'Upgrade Required',
  428: 'Precondition Required',
  429: 'Too Many Requests',
  431: 'Request Header Fields Too Large',
  451: 'Unavailable For Legal Reasons',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  505: 'HTTP Version Not Supported',
  506: 'Variant Also Negotiates',
  507: 'Insufficient Storage',
  508: 'Loop Detected',
  509: 'Bandwidth Limit Exceeded',
  510: 'Not Extended',
  511: 'Network Authentication Required',
};

// The headers set on a response, as Node keeps them: { lowercased: [name, value] }, null when there is none.
var kOutHeaders = Symbol('kOutHeaders');

function headersSentError(action) {
  var err = new Error('Cannot ' + action + ' headers after they are sent to the client');
  err.code = 'ERR_HTTP_HEADERS_SENT';
  return err;
}

function OutgoingMessage() {
  stream.Stream.call(this);
  this[kOutHeaders] = null;
  this._header = null;
  this._headerSent = false;
  this.finished = false;
  this.destroyed = false;
  this.sendDate = true;
  this.shouldKeepAlive = true;
  this.useChunkedEncodingByDefault = true;
  this.chunkedEncoding = false;
  this.socket = null;
  this.writable = true;
  this._writableEnded = false;
  this._finished = false;
}
util.inherits(OutgoingMessage, stream.Stream);

Object.defineProperty(OutgoingMessage.prototype, 'headersSent', {
  get: function () {
    return this._header !== null;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'writableEnded', {
  get: function () {
    return this._writableEnded;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'writableFinished', {
  get: function () {
    return this._finished;
  },
});
Object.defineProperty(OutgoingMessage.prototype, 'connection', {
  get: function () {
    return this.socket;
  },
  set: function (socket) {
    this.socket = socket;
  },
});
OutgoingMessage.prototype.writableLength = 0;
OutgoingMessage.prototype.writableHighWaterMark = 16384;
OutgoingMessage.prototype.writableCorked = 0;
OutgoingMessage.prototype.writableNeedDrain = false;

OutgoingMessage.prototype.setHeader = function setHeader(name, value) {
  if (this._header) throw headersSentError('set');
  if (value === undefined) {
    var err = new TypeError('Invalid value "undefined" for header "' + name + '"');
    err.code = 'ERR_HTTP_INVALID_HEADER_VALUE';
    throw err;
  }
  if (this[kOutHeaders] === null) this[kOutHeaders] = Object.create(null);
  this[kOutHeaders][String(name).toLowerCase()] = [name, value];
  return this;
};
OutgoingMessage.prototype.appendHeader = function appendHeader(name, value) {
  var current = this.getHeader(name);
  if (current === undefined) return this.setHeader(name, value);
  return this.setHeader(name, [].concat(current, value));
};
OutgoingMessage.prototype.getHeader = function getHeader(name) {
  var entry = this[kOutHeaders] && this[kOutHeaders][String(name).toLowerCase()];
  return entry ? entry[1] : undefined;
};
OutgoingMessage.prototype.getHeaders = function getHeaders() {
  var headers = Object.create(null);
  var out = this[kOutHeaders];
  if (out) for (var key in out) headers[key] = out[key][1];
  return headers;
};
OutgoingMessage.prototype.getHeaderNames = function getHeaderNames() {
  return this[kOutHeaders] ? Object.keys(this[kOutHeaders]) : [];
};
OutgoingMessage.prototype.getRawHeaderNames = function getRawHeaderNames() {
  var out = this[kOutHeaders];
  return out
    ? Object.keys(out).map(function (key) {
        return out[key][0];
      })
    : [];
};
OutgoingMessage.prototype.hasHeader = function hasHeader(name) {
  return Boolean(this[kOutHeaders] && this[kOutHeaders][String(name).toLowerCase()]);
};
OutgoingMessage.prototype.removeHeader = function removeHeader(name) {
  if (this._header) throw headersSentError('remove');
  if (this[kOutHeaders]) delete this[kOutHeaders][String(name).toLowerCase()];
};
OutgoingMessage.prototype.flushHeaders = function flushHeaders() {
  if (!this._header) this._implicitHeader();
};
OutgoingMessage.prototype.cork = function () {};
OutgoingMessage.prototype.uncork = function () {};
OutgoingMessage.prototype.setTimeout = function (msecs, callback) {
  if (callback) this.on('timeout', callback);
  return this;
};
OutgoingMessage.prototype.addTrailers = function () {};

OutgoingMessage.prototype.write = function write(chunk, encoding, callback) {
  if (typeof encoding === 'function') callback = encoding;
  if (this._writableEnded) {
    var err = new Error('write after end');
    err.code = 'ERR_STREAM_WRITE_AFTER_END';
    if (callback) queueMicrotask(callback.bind(null, err));
    return false;
  }
  if (!this._header) this._implicitHeader();
  this._headerSent = true;
  if (callback) queueMicrotask(callback);
  return true;
};
OutgoingMessage.prototype.end = function end(chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
  }
  if (this._writableEnded) {
    if (callback) queueMicrotask(callback);
    return this;
  }
  if (chunk) {
    if (!this._header && !this.hasHeader('content-length')) {
      this.setHeader('Content-Length', typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length);
    }
    this.write(chunk, encoding);
  }
  if (!this._header) {
    if (!this.hasHeader('content-length') && !this.hasHeader('transfer-encoding')) this.setHeader('Content-Length', 0);
    this._implicitHeader();
  }
  this._headerSent = true;
  this._writableEnded = true;
  this.finished = true;
  this.writable = false;
  var self = this;
  if (callback) this.once('finish', callback);
  queueMicrotask(function () {
    if (self._finished) return;
    self._finished = true;
    // @xufa/inject emits 'finish' itself, and destroys the response: once is enough.
    if (!self.destroyed) self.emit('finish');
  });
  return this;
};
OutgoingMessage.prototype.destroy = function destroy(err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  var self = this;
  queueMicrotask(function () {
    if (err) self.emit('error', err);
    self.emit('close');
  });
  return this;
};

function ServerResponse(req) {
  OutgoingMessage.call(this);
  this.req = req;
  this.statusCode = 200;
  this.statusMessage = undefined;
  if (req && req.method === 'HEAD') this._hasBody = false;
}
util.inherits(ServerResponse, OutgoingMessage);

ServerResponse.prototype._implicitHeader = function _implicitHeader() {
  this.writeHead(this.statusCode);
};
ServerResponse.prototype.assignSocket = function assignSocket(socket) {
  this.socket = socket;
  socket._httpMessage = this;
  this.emit('socket', socket);
};
ServerResponse.prototype.detachSocket = function detachSocket(socket) {
  socket._httpMessage = null;
  this.socket = null;
};
ServerResponse.prototype.writeContinue = function () {};
ServerResponse.prototype.writeProcessing = function () {};
ServerResponse.prototype.writeEarlyHints = function () {};
ServerResponse.prototype.writeHead = function writeHead(statusCode, reason, headers) {
  if (this._header) throw headersSentError('write');
  if (typeof reason !== 'string') {
    headers = reason;
    reason = undefined;
  }
  statusCode = Number(statusCode);
  if (!(statusCode >= 100 && statusCode <= 999)) {
    var err = new RangeError('Invalid status code: ' + statusCode);
    err.code = 'ERR_HTTP_INVALID_STATUS_CODE';
    throw err;
  }
  this.statusCode = statusCode;
  if (reason) this.statusMessage = reason;
  else if (!this.statusMessage) this.statusMessage = STATUS_CODES[statusCode] || 'unknown';
  if (Array.isArray(headers)) {
    for (var i = 0; i < headers.length; i += 2) this.appendHeader(headers[i], headers[i + 1]);
  } else if (headers) {
    for (var name in headers) if (headers[name] !== undefined) this.setHeader(name, headers[name]);
  }
  var head = 'HTTP/1.1 ' + statusCode + ' ' + this.statusMessage + '\r\n';
  var out = this[kOutHeaders] || {};
  for (var key in out) {
    [].concat(out[key][1]).forEach(function (value) {
      head += out[key][0] + ': ' + value + '\r\n';
    });
  }
  if (this.sendDate && !out.date) head += 'Date: ' + new Date().toUTCString() + '\r\n';
  if (!out.connection) head += 'Connection: ' + (this.shouldKeepAlive ? 'keep-alive' : 'close') + '\r\n';
  var bodyless =
    statusCode === 204 || statusCode === 304 || (statusCode >= 100 && statusCode < 200) || this._hasBody === false;
  if (!bodyless && !out['content-length'] && !out['transfer-encoding']) {
    this.chunkedEncoding = true;
    head += 'Transfer-Encoding: chunked\r\n';
  }
  this._header = head + '\r\n';
  return this;
};

function IncomingMessage(socket) {
  stream.Readable.call(this);
  this.socket = socket;
  this.httpVersionMajor = 1;
  this.httpVersionMinor = 1;
  this.httpVersion = '1.1';
  this.headers = {};
  this.rawHeaders = [];
  this.trailers = {};
  this.method = null;
  this.url = '';
  this.complete = false;
  this.aborted = false;
}
util.inherits(IncomingMessage, stream.Readable);
IncomingMessage.prototype.setTimeout = function () {
  return this;
};

function notInBrowser(what) {
  return function () {
    throw new Error(what + ' is not in the browser: app.inject() calls the routes without a server');
  };
}

function Server(options, handler) {
  EventEmitter.call(this);
  if (typeof options === 'function') handler = options;
  if (handler) this.on('request', handler);
  this.listening = false;
  this.keepAliveTimeout = 5000;
  this.requestTimeout = 300000;
  this.headersTimeout = 60000;
  this.timeout = 0;
  this.maxRequestsPerSocket = 0;
}
util.inherits(Server, EventEmitter);
Server.prototype.listen = notInBrowser('listen()');
Server.prototype.address = function () {
  return null;
};
Server.prototype.setTimeout = function (msecs) {
  this.timeout = msecs;
  return this;
};
Server.prototype.close = function (callback) {
  if (callback) queueMicrotask(callback);
  return this;
};
Server.prototype.closeAllConnections = function () {};
Server.prototype.closeIdleConnections = function () {};
Server.prototype.unref = function () {
  return this;
};
Server.prototype.ref = function () {
  return this;
};

module.exports = {
  METHODS: METHODS,
  STATUS_CODES: STATUS_CODES,
  OutgoingMessage: OutgoingMessage,
  ServerResponse: ServerResponse,
  IncomingMessage: IncomingMessage,
  Server: Server,
  createServer: function (options, handler) {
    return new Server(options, handler);
  },
  request: notInBrowser('http.request()'),
  get: notInBrowser('http.get()'),
  Agent: function Agent() {},
  globalAgent: {},
  validateHeaderName: function () {},
  validateHeaderValue: function () {},
};

},
"node:http2": function (module, exports, require) {

var refuse = function () { throw new Error('node:http2 is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:https": function (module, exports, require) {
module.exports = require('node:http');
},
"node:net": function (module, exports, require) {

var refuse = function () { throw new Error('node:net is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:os": function (module, exports, require) {
module.exports = { EOL: '\n', hostname: function () { return 'localhost'; }, networkInterfaces: function () { return {}; }, platform: function () { return 'browser'; } };
},
"node:path": function (module, exports, require) {

var refuse = function () { throw new Error('node:path is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:stream": function (module, exports, require) {
// node:stream in the browser bundle of @xufa/http (docs/xufa-http.js): what the modules of a request and its reply use
// of it, Readable (flowing with 'data', or read() with 'readable'), Writable, Duplex, PassThrough, Transform,
// finished(), pipeline() and addAbortSignal(). Functions, not classes: the modules call them on objects of their own
// (Readable.call(this)). No backpressure: everything pushed is kept until it is read.
'use strict';

var EventEmitter = require('node:events');
var util = require('node:util');

function later(fn) {
  queueMicrotask(fn);
}

function Stream() {
  EventEmitter.call(this);
}
util.inherits(Stream, EventEmitter);

function Readable(options) {
  Stream.call(this);
  options = options || {};
  this._readableState = {
    buffer: [],
    ended: false,
    endEmitted: false,
    flowing: null,
    reading: false,
    scheduled: false,
    objectMode: Boolean(options.objectMode || options.readableObjectMode),
    autoDestroy: options.autoDestroy !== false,
    encoding: null,
  };
  this.destroyed = false;
  this.readable = true;
  if (options.read) this._read = options.read;
  if (options.destroy) this._destroy = options.destroy;
}
util.inherits(Readable, Stream);

Readable.prototype._read = function () {};

function schedule(stream) {
  var state = stream._readableState;
  if (state.scheduled) return;
  state.scheduled = true;
  later(function () {
    state.scheduled = false;
    flow(stream);
  });
}

function decode(state, chunk) {
  return state.encoding && typeof chunk !== 'string' ? Buffer.from(chunk).toString(state.encoding) : chunk;
}

function emitEnd(stream) {
  var state = stream._readableState;
  if (state.endEmitted || !state.ended || state.buffer.length > 0) return;
  state.endEmitted = true;
  stream.readable = false;
  stream.emit('end');
  if (state.autoDestroy && (!stream._writableState || stream._writableState.finished)) stream.destroy();
}

function flow(stream) {
  var state = stream._readableState;
  if (stream.destroyed) return;
  if (state.flowing) {
    while (state.buffer.length > 0 && state.flowing) stream.emit('data', decode(state, state.buffer.shift()));
  } else if (state.flowing === false && state.buffer.length > 0) {
    stream.emit('readable');
  }
  if (state.ended) {
    if (state.flowing || state.buffer.length === 0) emitEnd(stream);
    if (state.flowing === false && state.buffer.length === 0 && !state.endEmitted) stream.emit('readable');
    return;
  }
  if (state.flowing !== null && state.buffer.length === 0 && !state.reading) {
    state.reading = true;
    stream._read();
  }
}

Readable.prototype.push = function push(chunk) {
  var state = this._readableState;
  state.reading = false;
  if (chunk === null) state.ended = true;
  else if (state.objectMode || chunk.length > 0) state.buffer.push(chunk);
  schedule(this);
  return !state.ended;
};
Readable.prototype.unshift = function unshift(chunk) {
  this._readableState.buffer.unshift(chunk);
  schedule(this);
};
Readable.prototype.read = function read() {
  var state = this._readableState;
  if (state.buffer.length === 0) {
    if (state.ended) later(emitEnd.bind(null, this));
    else if (!state.reading) {
      state.reading = true;
      this._read();
    }
    return null;
  }
  var chunks = state.buffer.splice(0);
  if (state.ended) later(emitEnd.bind(null, this));
  if (state.objectMode) return chunks[0];
  var all = chunks.every(function (chunk) {
    return typeof chunk === 'string';
  })
    ? chunks.join('')
    : Buffer.concat(
        chunks.map(function (chunk) {
          return typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        })
      );
  return decode(state, all);
};
Readable.prototype.on = function on(name, fn) {
  Stream.prototype.on.call(this, name, fn);
  var state = this._readableState;
  if (name === 'data' && state.flowing !== false) this.resume();
  if (name === 'readable') {
    state.flowing = false;
    schedule(this);
  }
  return this;
};
Readable.prototype.addListener = Readable.prototype.on;
Readable.prototype.once = function once(name, fn) {
  var self = this;
  function wrapper() {
    self.removeListener(name, wrapper);
    return fn.apply(this, arguments);
  }
  wrapper.listener = fn;
  return this.on(name, wrapper);
};
Readable.prototype.removeListener = function removeListener(name, fn) {
  var list = (this._events && this._events[name]) || [];
  for (var i = list.length - 1; i >= 0; i--) {
    if (list[i].fn === fn || list[i].fn.listener === fn) {
      list.splice(i, 1);
      break;
    }
  }
  return this;
};
Readable.prototype.off = Readable.prototype.removeListener;
Readable.prototype.resume = function resume() {
  this._readableState.flowing = true;
  schedule(this);
  return this;
};
Readable.prototype.pause = function pause() {
  this._readableState.flowing = false;
  return this;
};
Readable.prototype.isPaused = function isPaused() {
  return this._readableState.flowing === false;
};
Readable.prototype.setEncoding = function setEncoding(encoding) {
  this._readableState.encoding = encoding;
  return this;
};
Readable.prototype.pipe = function pipe(destination) {
  this.on('data', function (chunk) {
    destination.write(chunk);
  });
  this.on('end', function () {
    destination.end();
  });
  return destination;
};
Readable.prototype.unpipe = function unpipe() {
  this.removeAllListeners('data');
  return this;
};
Readable.prototype.destroy = function destroy(err) {
  if (this.destroyed) return this;
  this.destroyed = true;
  this.readable = false;
  var self = this;
  function done(error) {
    later(function () {
      if (error) self.emit('error', error);
      self.emit('close');
    });
  }
  if (this._destroy) this._destroy(err || null, done);
  else done(err);
  return this;
};
Object.defineProperty(Readable.prototype, 'readableEnded', {
  get: function () {
    return this._readableState.endEmitted;
  },
});
Object.defineProperty(Readable.prototype, 'readableFlowing', {
  get: function () {
    return this._readableState.flowing;
  },
});
Object.defineProperty(Readable.prototype, 'readableObjectMode', {
  get: function () {
    return this._readableState.objectMode;
  },
});
Readable.prototype[Symbol.asyncIterator] = function () {
  var stream = this;
  var queue = [];
  var waiting = null;
  var done = false;
  var failure = null;
  stream.on('data', function (chunk) {
    if (waiting) {
      var next = waiting;
      waiting = null;
      next.resolve({ value: chunk, done: false });
    } else queue.push(chunk);
  });
  stream.on('end', function () {
    done = true;
    if (waiting) waiting.resolve({ value: undefined, done: true });
  });
  stream.on('error', function (err) {
    failure = err;
    if (waiting) waiting.reject(err);
  });
  return {
    next: function () {
      if (queue.length > 0) return Promise.resolve({ value: queue.shift(), done: false });
      if (failure) return Promise.reject(failure);
      if (done) return Promise.resolve({ value: undefined, done: true });
      return new Promise(function (resolve, reject) {
        waiting = { resolve: resolve, reject: reject };
      });
    },
    return: function () {
      stream.destroy();
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]: function () {
      return this;
    },
  };
};

Readable.from = function from(iterable, options) {
  if (typeof iterable === 'string' || iterable instanceof Uint8Array) iterable = [iterable];
  var iterator = iterable[Symbol.asyncIterator] ? iterable[Symbol.asyncIterator]() : iterable[Symbol.iterator]();
  return new Readable(
    Object.assign({ objectMode: true }, options, {
      read: function () {
        var self = this;
        Promise.resolve(iterator.next()).then(
          function (step) {
            self.push(step.done ? null : step.value);
          },
          function (err) {
            self.destroy(err);
          }
        );
      },
    })
  );
};

function Writable(options) {
  Stream.call(this);
  initWritable(this, options || {});
}
util.inherits(Writable, Stream);

function initWritable(stream, options) {
  stream._writableState = { ended: false, finished: false, pending: 0, finishing: false };
  stream.writable = true;
  stream.destroyed = stream.destroyed || false;
  if (options.write) stream._write = options.write;
  if (options.final) stream._final = options.final;
  if (options.destroy) stream._destroy = options.destroy;
  stream._autoDestroyWritable = options.autoDestroy !== false;
}

Writable.prototype._write = function (chunk, encoding, callback) {
  callback();
};
Writable.prototype.write = function write(chunk, encoding, callback) {
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = 'utf8';
  }
  var state = this._writableState;
  if (state.ended) {
    var err = new Error('write after end');
    err.code = 'ERR_STREAM_WRITE_AFTER_END';
    later(this.emit.bind(this, 'error', err));
    return false;
  }
  var self = this;
  state.pending++;
  this._write(chunk, encoding || 'utf8', function (error) {
    state.pending--;
    if (callback) callback(error);
    if (error) self.destroy(error);
    else maybeFinish(self);
  });
  return true;
};
Writable.prototype.end = function end(chunk, encoding, callback) {
  if (typeof chunk === 'function') {
    callback = chunk;
    chunk = null;
  } else if (typeof encoding === 'function') {
    callback = encoding;
    encoding = 'utf8';
  }
  if (chunk !== null && chunk !== undefined) this.write(chunk, encoding);
  this._writableState.ended = true;
  this.writable = false;
  if (callback) this.once('finish', callback);
  maybeFinish(this);
  return this;
};
Writable.prototype.cork = function () {};
Writable.prototype.uncork = function () {};
Writable.prototype.setDefaultEncoding = function () {
  return this;
};
Writable.prototype.destroy = Readable.prototype.destroy;

function maybeFinish(stream) {
  var state = stream._writableState;
  if (!state.ended || state.pending > 0 || state.finishing) return;
  state.finishing = true;
  function finish(err) {
    if (err) return stream.destroy(err);
    later(function () {
      state.finished = true;
      stream.emit('finish');
      var readable = stream._readableState;
      if (stream._autoDestroyWritable && (!readable || readable.endEmitted)) stream.destroy();
    });
  }
  if (stream._final) stream._final(finish);
  else finish();
}

Object.defineProperty(Writable.prototype, 'writableEnded', {
  get: function () {
    return this._writableState.ended;
  },
});
Object.defineProperty(Writable.prototype, 'writableFinished', {
  get: function () {
    return this._writableState.finished;
  },
});

function Duplex(options) {
  Readable.call(this, options);
  initWritable(this, options || {});
}
util.inherits(Duplex, Readable);
['write', 'end', 'cork', 'uncork', 'setDefaultEncoding', '_write'].forEach(function (name) {
  Duplex.prototype[name] = Writable.prototype[name];
});
['writableEnded', 'writableFinished'].forEach(function (name) {
  Object.defineProperty(Duplex.prototype, name, Object.getOwnPropertyDescriptor(Writable.prototype, name));
});

function Transform(options) {
  Duplex.call(this, options);
  options = options || {};
  if (options.transform) this._transform = options.transform;
  if (options.flush) this._flush = options.flush;
}
util.inherits(Transform, Duplex);
Transform.prototype._transform = function (chunk, encoding, callback) {
  callback(null, chunk);
};
Transform.prototype._write = function (chunk, encoding, callback) {
  var self = this;
  this._transform(chunk, encoding, function (err, data) {
    if (data !== undefined && data !== null) self.push(data);
    callback(err);
  });
};
Transform.prototype._final = function (callback) {
  var self = this;
  function end(err, data) {
    if (data !== undefined && data !== null) self.push(data);
    self.push(null);
    callback(err);
  }
  if (this._flush) this._flush(end);
  else end();
};

function PassThrough(options) {
  Transform.call(this, options);
}
util.inherits(PassThrough, Transform);

function prematureClose() {
  var err = new Error('Premature close');
  err.code = 'ERR_STREAM_PREMATURE_CLOSE';
  return err;
}

function isDone(stream) {
  var readable = stream._readableState;
  var writable = stream._writableState;
  return (
    Boolean(stream.writableFinished) ||
    Boolean(writable && writable.finished) ||
    Boolean(readable && readable.endEmitted && !writable)
  );
}

function finished(stream, options, callback) {
  if (typeof options === 'function') callback = options;
  var called = false;
  function done(err) {
    if (called) return;
    called = true;
    cleanup();
    callback(err);
  }
  function onEnd() {
    done();
  }
  function onError(err) {
    done(err);
  }
  function onClose() {
    done(isDone(stream) ? undefined : prematureClose());
  }
  function cleanup() {
    stream.removeListener('finish', onEnd);
    stream.removeListener('end', onEnd);
    stream.removeListener('error', onError);
    stream.removeListener('close', onClose);
  }
  if (isDone(stream) || stream.destroyed) {
    later(function () {
      done(isDone(stream) ? undefined : prematureClose());
    });
    return cleanup;
  }
  stream.on('finish', onEnd);
  if (!stream._writableState) stream.on('end', onEnd);
  stream.on('error', onError);
  stream.on('close', onClose);
  return cleanup;
}

function pipeline() {
  var streams = Array.prototype.slice.call(arguments);
  var callback = typeof streams[streams.length - 1] === 'function' ? streams.pop() : function () {};
  if (Array.isArray(streams[0])) streams = streams[0];
  var called = false;
  function done(err) {
    if (called) return;
    called = true;
    if (err) {
      streams.forEach(function (stream) {
        if (!stream.destroyed) stream.destroy();
      });
    }
    callback(err);
  }
  for (var i = 0; i < streams.length - 1; i++) {
    streams[i].pipe(streams[i + 1]);
    streams[i].on('error', done);
  }
  var last = streams[streams.length - 1];
  finished(last, done);
  return last;
}

function addAbortSignal(signal, stream) {
  function abort() {
    var err = new Error('The operation was aborted');
    err.name = 'AbortError';
    err.code = 'ABORT_ERR';
    stream.destroy(err);
  }
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  return stream;
}

module.exports = Stream;
Object.assign(Stream, {
  Stream: Stream,
  Readable: Readable,
  Writable: Writable,
  Duplex: Duplex,
  Transform: Transform,
  PassThrough: PassThrough,
  finished: finished,
  pipeline: pipeline,
  addAbortSignal: addAbortSignal,
});

},
"node:string_decoder": function (module, exports, require) {

var refuse = function () { throw new Error('node:string_decoder is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:tls": function (module, exports, require) {

var refuse = function () { throw new Error('node:tls is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
},
"node:util": function (module, exports, require) {
// node:util in the browser bundle of @xufa/http (docs/xufa-http.js): inherits, promisify, deprecate, format, inspect
// and the checks of types the modules use.
'use strict';

function tag(value) {
  return Object.prototype.toString.call(value).slice(8, -1);
}
function is(name) {
  return function (value) {
    return tag(value) === name;
  };
}

function inspect(value) {
  if (typeof value === 'string') return "'" + value + "'";
  if (value instanceof Error) return value.stack || String(value);
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}
inspect.custom = Symbol.for('nodejs.util.inspect.custom');

function format(text) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof text !== 'string') return [text].concat(args).map(inspect).join(' ');
  var out = text.replace(/%[sdifjoO%]/g, function (spec) {
    if (spec === '%%') return '%';
    if (args.length === 0) return spec;
    var value = args.shift();
    if (spec === '%s') return String(value);
    if (spec === '%d' || spec === '%i') return String(spec === '%i' ? parseInt(value, 10) : Number(value));
    if (spec === '%f') return String(parseFloat(value));
    return inspect(value);
  });
  return args.length > 0 ? out + ' ' + args.map(inspect).join(' ') : out;
}

module.exports = {
  inherits: function (constructor, parent) {
    Object.setPrototypeOf(constructor.prototype, parent.prototype);
    Object.setPrototypeOf(constructor, parent);
  },
  promisify: function (fn) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      var self = this;
      return new Promise(function (resolve, reject) {
        fn.apply(
          self,
          args.concat(function (err, value) {
            if (err) reject(err);
            else resolve(value);
          })
        );
      });
    };
  },
  deprecate: function (fn) {
    return fn;
  },
  inspect: inspect,
  format: format,
  isDeepStrictEqual: function (a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  },
  types: {
    isDate: is('Date'),
    isRegExp: is('RegExp'),
    isMap: is('Map'),
    isSet: is('Set'),
    isWeakMap: is('WeakMap'),
    isWeakSet: is('WeakSet'),
    isPromise: is('Promise'),
    isDataView: is('DataView'),
    isArrayBuffer: is('ArrayBuffer'),
    isAsyncFunction: is('AsyncFunction'),
    isNativeError: function (value) {
      return value instanceof Error;
    },
    isBoxedPrimitive: function (value) {
      return (
        value !== null &&
        typeof value === 'object' &&
        ['Number', 'String', 'Boolean', 'BigInt', 'Symbol'].indexOf(tag(value)) >= 0
      );
    },
  },
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
};

},
"node:zlib": function (module, exports, require) {

var refuse = function () { throw new Error('node:zlib is not in the browser'); };
module.exports = new Proxy({}, { get: function (target, key) { return key === '__esModule' ? false : refuse; } });
}
  };
  var mains = {"@xufa/http":"@xufa/http/index.js","@xufa/boot":"@xufa/boot/index.js","@xufa/errors":"@xufa/errors/index.js","@xufa/inject":"@xufa/inject/index.js","@xufa/logger":"@xufa/logger/index.js","@xufa/router":"@xufa/router/index.js","@xufa/schema":"@xufa/schema/index.js","@xufa/serializer":"@xufa/serializer/index.js"};
  var cache = {};
  function resolve(from, request) {
    if (modules[request] && request.indexOf('node:') === 0) return request;
    if (mains[request]) return mains[request];
    if (request.charAt(0) !== '.') throw new Error('Not in the browser bundle: ' + request + ' (from ' + from + ')');
    var parts = from.split('/').slice(0, -1).concat(request.split('/'));
    var stack = [];
    parts.forEach(function (part) {
      if (part === '..') stack.pop();
      else if (part !== '.' && part !== '') stack.push(part);
    });
    var id = stack.join('/');
    var found = [id, id + '.js', id + '.json', id + '/index.js'].filter(function (c) { return modules[c]; })[0];
    if (!found) throw new Error('Cannot find module ' + request + ' from ' + from);
    return found;
  }
  function load(id) {
    if (!cache[id]) {
      var module = { exports: {} };
      cache[id] = module;
      modules[id].call(module.exports, module, module.exports, function (request) {
        return load(resolve(id, request));
      });
    }
    return cache[id].exports;
  }
  function main(name) {
    return load(mains[name]);
  }
  root.xufaHttp = { http: main('@xufa/http'), schema: main('@xufa/schema') };
})(typeof globalThis !== 'undefined' ? globalThis : this);
