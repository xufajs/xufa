// The streams and signals of the adapters: AxiosTransformStream (progress events and maxRate), the reducer of
// progress events (rate, estimated time), the zlib header that deflate answers may lack, trackStream() (a web stream
// that counts what passes), and composeSignals() (signals and a timeout as one AbortSignal).
import { Transform } from 'node:stream';
import { AxiosError, CanceledError } from './errors.js';
import { asap, toFlatObject } from './util.js';

const kInternals = Symbol('internals');

/** A pass-through that emits 'progress' (bytes so far) and, with maxRate, holds the bytes to that rate a second. */
class AxiosTransformStream extends Transform {
  constructor(options) {
    options = toFlatObject(
      options,
      { maxRate: 0, chunkSize: 64 * 1024, minChunkSize: 100, timeWindow: 500, ticksRate: 2, samplesCount: 15 },
      null,
      (prop, source) => source[prop] !== undefined
    );
    super({ readableHighWaterMark: options.chunkSize });
    const internals = (this[kInternals] = {
      timeWindow: options.timeWindow,
      chunkSize: options.chunkSize,
      maxRate: options.maxRate,
      minChunkSize: options.minChunkSize,
      bytesSeen: 0,
      isCaptured: false,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null,
    });
    this.on('newListener', (event) => {
      if (event === 'progress') internals.isCaptured = true;
    });
  }

  _read(size) {
    const internals = this[kInternals];
    if (internals.onReadCallback) internals.onReadCallback();
    return super._read(size);
  }

  _transform(chunk, encoding, callback) {
    const internals = this[kInternals];
    const { maxRate, timeWindow } = internals;
    const readableHighWaterMark = this.readableHighWaterMark;
    const bytesThreshold = maxRate / (1000 / timeWindow);
    const minChunkSize = internals.minChunkSize !== false ? Math.max(internals.minChunkSize, bytesThreshold * 0.01) : 0;

    const pushChunk = (part, done) => {
      const bytes = Buffer.byteLength(part);
      internals.bytesSeen += bytes;
      internals.bytes += bytes;
      if (internals.isCaptured) this.emit('progress', internals.bytesSeen);
      if (this.push(part)) {
        process.nextTick(done);
      } else {
        internals.onReadCallback = () => {
          internals.onReadCallback = null;
          process.nextTick(done);
        };
      }
    };

    const transformChunk = (part, done) => {
      const size = Buffer.byteLength(part);
      let remainder = null;
      let maxChunkSize = readableHighWaterMark;
      let bytesLeft;
      let passed = 0;
      if (maxRate) {
        const now = Date.now();
        if (!internals.ts || (passed = now - internals.ts) >= timeWindow) {
          internals.ts = now;
          bytesLeft = bytesThreshold - internals.bytes;
          internals.bytes = bytesLeft < 0 ? -bytesLeft : 0;
          passed = 0;
        }
        bytesLeft = bytesThreshold - internals.bytes;
        // Nothing left in this window: the next one.
        if (bytesLeft <= 0) return setTimeout(() => done(null, part), timeWindow - passed);
        if (bytesLeft < maxChunkSize) maxChunkSize = bytesLeft;
      }
      if (maxChunkSize && size > maxChunkSize && size - maxChunkSize > minChunkSize) {
        remainder = part.subarray(maxChunkSize);
        part = part.subarray(0, maxChunkSize);
      }
      pushChunk(part, remainder ? () => process.nextTick(done, null, remainder) : done);
      return undefined;
    };

    transformChunk(chunk, function next(err, rest) {
      if (err) return callback(err);
      if (rest) transformChunk(rest, next);
      else callback(null);
      return undefined;
    });
  }
}

/** Removes the zlib header (0x78) a deflate answer should have and adds it when missing. */
class ZlibHeaderTransformStream extends Transform {
  __transform(chunk, encoding, callback) {
    this.push(chunk);
    callback();
  }

  _transform(chunk, encoding, callback) {
    if (chunk.length !== 0) {
      this._transform = this.__transform;
      if (chunk[0] !== 120) this.push(Buffer.from([120, 156]), encoding);
    }
    this.__transform(chunk, encoding, callback);
  }
}

/** Bytes a second over the last samples (undefined in the first `min` ms). */
function speedometer(samplesCount = 10, min = 1000) {
  const bytes = new Array(samplesCount);
  const timestamps = new Array(samplesCount);
  let head = 0;
  let tail = 0;
  let firstSampleTS;
  return (chunkLength) => {
    const now = Date.now();
    const startedAt = timestamps[tail];
    if (!firstSampleTS) firstSampleTS = now;
    bytes[head] = chunkLength;
    timestamps[head] = now;
    let i = tail;
    let bytesCount = 0;
    while (i !== head) {
      bytesCount += bytes[i++];
      i %= samplesCount;
    }
    head = (head + 1) % samplesCount;
    if (head === tail) tail = (tail + 1) % samplesCount;
    if (now - firstSampleTS < min) return undefined;
    const passed = startedAt && now - startedAt;
    return passed ? Math.round((bytesCount * 1000) / passed) : undefined;
  };
}

/** fn at most `freq` times a second (the last call kept for later); [throttled, flush]. */
function throttle(fn, freq) {
  let timestamp = 0;
  const threshold = 1000 / freq;
  let lastArgs;
  let timer;
  const invoke = (args, now = Date.now()) => {
    timestamp = now;
    lastArgs = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    fn(...args);
  };
  const throttled = (...args) => {
    const now = Date.now();
    const passed = now - timestamp;
    if (passed >= threshold) {
      invoke(args, now);
    } else {
      lastArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          invoke(lastArgs);
        }, threshold - passed);
      }
    }
  };
  const flush = () => lastArgs && invoke(lastArgs);
  return [throttled, flush];
}

/** Progress events of axios (loaded, total, progress, bytes, rate, estimated...) from { loaded, total }. */
function progressEventReducer(listener, isDownloadStream, freq = 3) {
  let bytesNotified = 0;
  const rateOf = speedometer(50, 250);
  return throttle((event) => {
    const { loaded } = event;
    const total = event.lengthComputable ? event.total : undefined;
    const progressBytes = loaded - bytesNotified;
    const rate = rateOf(progressBytes);
    const inRange = loaded <= total;
    bytesNotified = loaded;
    listener({
      loaded,
      total,
      progress: total ? loaded / total : undefined,
      bytes: progressBytes,
      rate: rate || undefined,
      estimated: rate && total && inRange ? (total - loaded) / rate : undefined,
      event,
      lengthComputable: total != null,
      [isDownloadStream ? 'download' : 'upload']: true,
    });
  }, freq);
}

const progressEventDecorator = (total, throttled) => {
  const lengthComputable = total != null;
  return [(loaded) => throttled[0]({ lengthComputable, total, loaded }), throttled[1]];
};

const asyncDecorator =
  (fn) =>
  (...args) =>
    asap(() => fn(...args));

function* streamChunk(chunk, chunkSize) {
  const length = chunk.byteLength;
  if (!chunkSize || length < chunkSize) {
    yield chunk;
    return;
  }
  for (let pos = 0; pos < length; pos += chunkSize) yield chunk.slice(pos, pos + chunkSize);
}

async function* readStream(stream) {
  if (stream[Symbol.asyncIterator]) {
    yield* stream;
    return;
  }
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    await reader.cancel();
  }
}

async function* readBytes(iterable, chunkSize) {
  for await (const chunk of readStream(iterable)) yield* streamChunk(chunk, chunkSize);
}

/** A ReadableStream of a stream's bytes in chunks, onProgress(bytes so far), onFinish(error?) once. */
function trackStream(stream, chunkSize, onProgress, onFinish) {
  const iterator = readBytes(stream, chunkSize);
  let bytes = 0;
  let done;
  const finish = (err) => {
    if (!done) {
      done = true;
      if (onFinish) onFinish(err);
    }
  };
  return new ReadableStream(
    {
      async pull(controller) {
        try {
          const { done: ended, value } = await iterator.next();
          if (ended) {
            finish();
            controller.close();
            return;
          }
          if (onProgress) onProgress((bytes += value.byteLength));
          controller.enqueue(new Uint8Array(value));
        } catch (err) {
          finish(err);
          throw err;
        }
      },
      cancel(reason) {
        finish(reason);
        return iterator.return();
      },
    },
    { highWaterMark: 2 }
  );
}

/** One AbortSignal for some signals and a timeout (an AxiosError ETIMEDOUT), or undefined for none. */
function composeSignals(signals, timeout) {
  signals = signals ? signals.filter(Boolean) : [];
  if (!timeout && !signals.length) return undefined;
  const controller = new AbortController();
  let aborted;
  let timer;
  const unsubscribe = () => {
    if (!signals) return;
    if (timer) clearTimeout(timer);
    timer = null;
    for (const signal of signals) {
      if (signal.unsubscribe) signal.unsubscribe(onabort);
      else signal.removeEventListener('abort', onabort);
    }
    signals = null;
  };
  function onabort(reason) {
    if (aborted) return;
    aborted = true;
    unsubscribe();
    const err = reason instanceof Error ? reason : this.reason;
    controller.abort(err instanceof AxiosError ? err : new CanceledError(err instanceof Error ? err.message : err));
  }
  if (timeout) {
    timer = setTimeout(() => {
      timer = null;
      onabort(new AxiosError(`timeout of ${timeout}ms exceeded`, AxiosError.ETIMEDOUT));
    }, timeout);
  }
  for (const signal of signals) signal.addEventListener('abort', onabort);
  const { signal } = controller;
  signal.unsubscribe = () => asap(unsubscribe);
  return signal;
}

export {
  AxiosTransformStream,
  ZlibHeaderTransformStream,
  speedometer,
  throttle,
  progressEventReducer,
  progressEventDecorator,
  asyncDecorator,
  trackStream,
  composeSignals,
};
