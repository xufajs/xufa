// The promise returned by a handler (or an error handler): its value is sent, its rejection is the error sent.
import diagnostics from 'node:diagnostics_channel';
import { kReplyIsError, kReplyHijacked } from './symbols.js';
import { setErrorStatusCode } from './error-handler.js';

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

export default wrapThenable;

// What require() gives (the tests of fastify are CommonJS).
export { wrapThenable as 'module.exports' };
