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
