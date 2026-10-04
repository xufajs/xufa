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
