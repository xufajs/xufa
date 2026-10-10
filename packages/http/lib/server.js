// The HTTP server (http, https, http2, or one of the user) and listen(), which on 'localhost' listens on every
// address it resolves to (127.0.0.1 and ::1).
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import dns from 'node:dns';
import os from 'node:os';
import { kState, kOptions, kServerBindings, kHttp2ServerSessions } from './symbols.js';
import { XUFAWRN003 } from './warnings.js';
import { onListenHookRunner } from './hooks.js';
import {
  XUFA_ERR_REOPENED_CLOSE_SERVER,
  XUFA_ERR_REOPENED_SERVER,
  XUFA_ERR_LISTEN_OPTIONS_INVALID,
  XUFA_ERR_FORCE_CLOSE_CONNECTIONS_IDLE_NOT_AVAILABLE,
} from './errors.js';

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

export { createServer, noopSet };
