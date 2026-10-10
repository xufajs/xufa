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
