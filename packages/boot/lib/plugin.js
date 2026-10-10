// A plugin being loaded: its function runs with the server (or its encapsulated copy), and the plugins it registers
// are queued in its own queue, loaded once it is done.
import { EventEmitter } from 'node:events';
import { BOOT_ERR_PLUGIN_EXEC_TIMEOUT } from './errors.js';

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

export { Plugin, kPluginMeta, isPromiseLike };
