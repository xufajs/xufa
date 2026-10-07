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
