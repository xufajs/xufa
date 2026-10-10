// WebSocket routes for @xufa/http (and fastify): a route with `{ websocket: true }` answers the upgrade of its
// requests with a WebSocket, after the hooks of the route (authentication, rate limits...) have run, as any request.
//
//   app.register(websocketPlugin); // import websocketPlugin from '@xufa/websocket/plugin'
//   app.get('/chat', { websocket: true }, (socket, request) => {
//     socket.on('message', (message) => socket.send(`echo: ${message}`));
//   });
//
// The code is the one of @fastify/websocket 11.3.3 (MIT, Matteo Collina and the fastify contributors), with ws as
// @xufa/websocket and duplexify as a small Duplex (duplexOf): no dependencies. Its tests are ported too (test/fastify).

import { ServerResponse } from 'node:http';
import { Duplex, PassThrough } from 'node:stream';
import { randomBytes } from 'node:crypto';
import WebSocket from '../index.js';

const kWs = Symbol('ws-socket');
const kWsHead = Symbol('ws-head');
const statusCodeReg = /HTTP\/1.1 (\d+)/u;

// One end of an in-memory connection (what duplexify made): it reads `readable` and writes to `writable`, and
// destroying it ends both quietly (Duplex.from would emit an AbortError).
function duplexOf(readable, writable) {
  const duplex = new Duplex({
    read() {
      readable.resume();
    },
    write(chunk, encoding, callback) {
      writable.write(chunk, encoding, callback);
    },
    final(callback) {
      writable.end();
      callback();
    },
    destroy(err, callback) {
      readable.destroy();
      writable.destroy();
      callback(err);
    },
  });
  readable.on('data', (chunk) => {
    if (!duplex.push(chunk)) readable.pause();
  });
  readable.on('end', () => duplex.push(null));
  return duplex;
}

function xufaWebsocket(fastify, opts, next) {
  fastify.decorateRequest('ws', null);

  let errorHandler = defaultErrorHandler;
  if (opts.errorHandler) {
    if (typeof opts.errorHandler !== 'function') {
      return next(new Error('invalid errorHandler function'));
    }

    errorHandler = opts.errorHandler;
  }

  let preClose = defaultPreClose;
  if (opts?.preClose) {
    if (typeof opts.preClose !== 'function') {
      return next(new Error('invalid preClose function'));
    }

    preClose = opts.preClose;
  }

  if (opts.options?.noServer) {
    return next(
      new Error(
        "fastify-websocket doesn't support the ws noServer option. If you want to create a websocket server detatched from fastify, use the ws library directly."
      )
    );
  }

  const wssOptions = Object.assign({ noServer: true }, opts.options);

  if (wssOptions.path) {
    fastify.log.warn("ws server path option shouldn't be provided, use a route instead");
  }

  // The upgrades are handled here, so that they go through the routing (and its hooks) before upgrading: the
  // WebSocket.Server runs in noServer mode. The `server` option, when given, is listened to instead of fastify.server.
  const websocketListenServer = wssOptions.server || fastify.server;
  delete wssOptions.server;

  const wss = new WebSocket.Server(wssOptions);
  fastify.decorate('websocketServer', wss);

  async function injectWS(path = '/', upgradeContext = {}, options = {}) {
    const server2Client = new PassThrough();
    const client2Server = new PassThrough();

    const serverStream = duplexOf(server2Client, client2Server);
    const clientStream = duplexOf(client2Server, server2Client);

    const ws = new WebSocket(null, undefined, { isServer: false });
    const head = Buffer.from([]);

    let resolve, reject;
    const promise = new Promise((_resolve, _reject) => {
      resolve = _resolve;
      reject = _reject;
    });

    typeof options.onInit === 'function' && options.onInit(ws);

    ws.on('open', () => {
      typeof options.onOpen === 'function' && options.onOpen(ws);
      clientStream.removeListener('data', onData);
      resolve(ws);
    });

    const onData = (chunk) => {
      if (chunk.toString().includes('HTTP/1.1 101 Switching Protocols')) {
        ws._isServer = false;
        ws.setSocket(clientStream, head, { maxPayload: 0 });
      } else {
        clientStream.removeListener('data', onData);
        const statusCode = Number(statusCodeReg.exec(chunk.toString())[1]);
        reject(new Error('Unexpected server response: ' + statusCode));
      }
    };

    clientStream.on('data', onData);

    const req = {
      ...upgradeContext,
      method: 'GET',
      headers: {
        ...upgradeContext.headers,
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-version': 13,
        'sec-websocket-key': randomBytes(16).toString('base64'),
      },
      httpVersion: '1.1',
      url: path,
      [kWs]: serverStream,
      [kWsHead]: head,
    };

    websocketListenServer.emit('upgrade', req, req[kWs], req[kWsHead]);

    return promise;
  }

  fastify.decorate('injectWS', injectWS);

  function onUpgrade(rawRequest, socket, head) {
    // Node removes its socket error listener before emitting 'upgrade': the socket is guarded while the hooks run
    // and the request is routed.
    socket.on('error', onUpgradeSocketError);

    // The socket is kept with the request, which goes through the routing: its hooks, then a handler that may
    // upgrade it.
    rawRequest[kWs] = socket;
    rawRequest[kWsHead] = head;
    const rawResponse = new ServerResponse(rawRequest);
    try {
      rawResponse.assignSocket(socket);
      fastify.routing(rawRequest, rawResponse);
    } catch (err) {
      fastify.log.warn({ err }, 'websocket upgrade failed');
    }
  }
  websocketListenServer.on('upgrade', onUpgrade);

  const handleUpgrade = (rawRequest, callback) => {
    // ws installs its own socket error listener synchronously in handleUpgrade.
    rawRequest[kWs].removeListener('error', onUpgradeSocketError);
    wss.handleUpgrade(rawRequest, rawRequest[kWs], rawRequest[kWsHead], (socket) => {
      wss.emit('connection', socket, rawRequest);

      callback(socket);
    });
  };

  function onUpgradeSocketError() {
    this.destroy();
  }

  fastify.addHook('onRequest', (request, _reply, done) => {
    // request.ws: whether the request is an upgrade.
    if (request.raw[kWs]) {
      request.ws = true;
    } else {
      request.ws = false;
    }
    done();
  });

  fastify.addHook('onResponse', (request, _reply, done) => {
    if (request.ws) {
      request.raw[kWs].destroy();
    }
    done();
  });

  fastify.addHook('onRoute', (routeOptions) => {
    let isWebsocketRoute = false;
    let wsHandler = routeOptions.wsHandler;
    let handler = routeOptions.handler;

    if (routeOptions.websocket || routeOptions.wsHandler) {
      if (routeOptions.method === 'HEAD') {
        return;
      } else if (routeOptions.method !== 'GET') {
        throw new Error('websocket handler can only be declared in GET method');
      }

      isWebsocketRoute = true;

      if (routeOptions.websocket) {
        if (!routeOptions.schema) {
          routeOptions.schema = {};
        }
        routeOptions.schema.hide = true;

        wsHandler = routeOptions.handler;
        handler = function (_, reply) {
          reply.code(404).send();
        };
      }

      if (typeof wsHandler !== 'function') {
        throw new TypeError('invalid wsHandler function');
      }
    }

    // Every route handler is wrapped, so that upgrades to routes without a WebSocket handler are closed. Not an
    // arrow function: `this` is the instance of the route.
    routeOptions.handler = function (request, reply) {
      // An upgrade: hijack the reply and give the socket to the WebSocket handler; otherwise the HTTP handler.
      if (request.raw[kWs]) {
        reply.hijack();
        handleUpgrade(request.raw, (socket) => {
          // Errors of the socket once open (a client that goes away) go to the errorHandler, so that the socket
          // always has an 'error' listener.
          socket.on('error', (error) => {
            errorHandler.call(this, error, socket, request, reply);
          });

          let result;
          try {
            if (isWebsocketRoute) {
              result = wsHandler.call(this, socket, request);
            } else {
              result = noHandle.call(this, socket, request);
            }
          } catch (err) {
            return errorHandler.call(this, err, socket, request, reply);
          }

          if (result && typeof result.catch === 'function') {
            result.catch((err) => errorHandler.call(this, err, socket, request, reply));
          }
        });
      } else {
        return handler.call(this, request, reply);
      }
    };
  });

  fastify.addHook('preClose', preClose);

  function defaultPreClose(done) {
    const server = this.websocketServer;
    if (server.clients) {
      for (const client of server.clients) {
        client.close();
      }
    }

    websocketListenServer.removeListener('upgrade', onUpgrade);

    server.close(done);

    done();
  }

  function noHandle(socket, rawRequest) {
    this.log.info({ path: rawRequest.url }, 'closed incoming websocket connection for path with no websocket handler');
    socket.close();
  }

  function defaultErrorHandler(error, socket, request) {
    request.log.error(error);
    socket.terminate();
  }

  next();
}

// As fastify-plugin marks a plugin (what @xufa/http's plugin() does): it runs in the instance that registers it.
xufaWebsocket[Symbol.for('skip-override')] = true;
xufaWebsocket[Symbol.for('xufa.display-name')] = '@xufa/websocket';
xufaWebsocket[Symbol.for('fastify.display-name')] = '@xufa/websocket';
xufaWebsocket[Symbol.for('plugin-meta')] = { name: '@xufa/websocket', fastify: '5.x' };

export default xufaWebsocket;
xufaWebsocket.default = xufaWebsocket;
xufaWebsocket.xufaWebsocket = xufaWebsocket;
xufaWebsocket.fastifyWebsocket = xufaWebsocket;

export { xufaWebsocket as 'module.exports' };

export { xufaWebsocket, xufaWebsocket as fastifyWebsocket };
