// When a request has been read or a response sent (on-finished): finished(msg, listener) calls listener(error, msg)
// once, at the end of the message ('end', 'finish') or of its socket ('error': the error, 'close'); a message
// finished already calls it in the next turn. Listeners of a message share one set of listeners on it.
import { AsyncResource } from 'node:async_hooks';

const kListeners = Symbol('xufa.express.finished');

export function isFinished(msg) {
  const { socket } = msg;
  if (typeof msg.finished === 'boolean') return Boolean(msg.finished || (socket && !socket.writable));
  if (typeof msg.complete === 'boolean') {
    return Boolean(msg.upgrade || !socket || !socket.readable || (msg.complete && !msg.readable));
  }
  return undefined;
}

// Listeners on emitters for their events, the first of which calls done(error) and removes them all.
function first(pairs, done) {
  const attached = [];
  const cleanup = () => attached.forEach(({ emitter, event, fn }) => emitter.removeListener(event, fn));
  pairs.forEach(([emitter, ...events]) => {
    events.forEach((event) => {
      const fn = (arg) => {
        cleanup();
        done(event === 'error' ? arg : null);
      };
      emitter.on(event, fn);
      attached.push({ emitter, event, fn });
    });
  });
  return cleanup;
}

function attach(msg, callback) {
  let done = false;
  let cancelSocket = null;
  const onFinish = (error) => {
    cancelMessage();
    if (cancelSocket) cancelSocket();
    done = true;
    callback(error);
  };
  const cancelMessage = first([[msg, 'end', 'finish']], onFinish);
  const onSocket = (socket) => {
    msg.removeListener('socket', onSocket);
    if (done || cancelSocket) return;
    cancelSocket = first([[socket, 'error', 'close']], onFinish);
  };
  if (msg.socket) {
    onSocket(msg.socket);
    return;
  }
  msg.on('socket', onSocket);
  if (msg.socket === undefined && typeof msg.assignSocket === 'function') {
    const { assignSocket } = msg;
    msg.assignSocket = function assignSocketAndWatch(socket) {
      assignSocket.call(this, socket);
      onSocket(socket);
    };
  }
}

export function finished(msg, listener) {
  if (isFinished(msg) !== false) {
    setImmediate(listener, null, msg);
    return msg;
  }
  const resource = new AsyncResource(listener.name || 'bound-anonymous-fn');
  const bound = (error, message) => resource.runInAsyncScope(listener, null, error, message);
  let queue = msg[kListeners];
  if (!queue) {
    queue = [];
    msg[kListeners] = queue;
    attach(msg, (error) => {
      msg[kListeners] = null;
      queue.forEach((fn) => fn(error, msg));
    });
  }
  queue.push(bound);
  return msg;
}
