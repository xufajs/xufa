// Express's application: settings (set, get, enable, disable), its router (use, route, the methods, all, param),
// mounted apps (inheriting their parent's settings, engines and prototypes), views (engine, render), handle() and
// listen(). A request no layer answers ends in the final handler: 404 Cannot GET /path, or the error's status and its
// stack (its message in production) as a small HTML page.
import http, { STATUS_CODES } from 'node:http';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Router, methods } from './router.js';
import { View } from './view.js';
import { compileETag, compileQueryParser, compileTrust } from './utils.js';
import { encodeUrl, escapeHtml } from './headers.js';
import { finished, isFinished } from './finished.js';
import { originalOf } from './url.js';
import { kMounted } from './plan.js';
import { serverClasses, setPrototype } from './prototypes.js';

export const application = {};

const kTrustProxyDefault = '@@symbol:trust_proxy_default';

// --- The final handler (finalhandler) -------------------------------------------------------------------------------

function errorPage(message) {
  const body = escapeHtml(message).replaceAll('\n', '<br>').replaceAll('  ', ' &nbsp;');
  return `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>${body}</pre>\n</body>\n</html>\n`;
}

function errorStatus(error) {
  if (typeof error.status === 'number' && error.status >= 400 && error.status < 600) return error.status;
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 600) {
    return error.statusCode;
  }
  return undefined;
}

function resourceName(req) {
  try {
    return originalOf(req).pathname;
  } catch {
    return 'resource';
  }
}

function writeError(req, res, status, headers, message) {
  const write = () => {
    const body = errorPage(message);
    res.statusCode = status;
    if (req.httpVersionMajor < 2) res.statusMessage = STATUS_CODES[status];
    res.removeHeader('Content-Encoding');
    res.removeHeader('Content-Language');
    res.removeHeader('Content-Range');
    for (const [key, value] of Object.entries(headers ?? {})) res.setHeader(key, value);
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Length', Buffer.byteLength(body, 'utf8'));
    if (req.method === 'HEAD') res.end();
    else res.end(body, 'utf8');
  };
  if (isFinished(req)) {
    write();
    return;
  }
  // (The rest of the request's body read off first.)
  req.unpipe();
  finished(req, write);
  req.resume();
}

function finalHandler(req, res, env, onerror) {
  return (error) => {
    if (!error && res.headersSent) return;
    let status;
    let headers;
    let message;
    if (error) {
      status = errorStatus(error);
      if (status === undefined) {
        status = res.statusCode;
        if (typeof status !== 'number' || status < 400 || status > 599) status = 500;
      } else if (error.headers && typeof error.headers === 'object') headers = { ...error.headers };
      if (env !== 'production') message = error.stack || (typeof error.toString === 'function' ? error.toString() : '');
      message = message || STATUS_CODES[status];
    } else {
      status = 404;
      message = `Cannot ${req.method} ${encodeUrl(resourceName(req))}`;
    }
    if (error && onerror) setImmediate(onerror, error, req, res);
    if (res.headersSent) {
      if (req.socket) req.socket.destroy();
      return;
    }
    writeError(req, res, status, headers, message);
  };
}

function logError(error) {
  if (this.get('env') !== 'test') console.error(error.stack || error.toString());
}

// --- The application ------------------------------------------------------------------------------------------------

application.init = function init() {
  let router = null;
  this.cache = Object.create(null);
  this.engines = Object.create(null);
  this.settings = Object.create(null);
  this.defaultConfiguration();
  Object.defineProperty(this, 'router', {
    configurable: true,
    enumerable: true,
    get() {
      if (router === null) {
        router = new Router({
          caseSensitive: this.enabled('case sensitive routing'),
          strict: this.enabled('strict routing'),
        });
      }
      return router;
    },
  });
};

application.defaultConfiguration = function defaultConfiguration() {
  const env = process.env.NODE_ENV || 'development';
  this.enable('x-powered-by');
  this.set('etag', 'weak');
  this.set('env', env);
  this.set('query parser', 'simple');
  this.set('subdomain offset', 2);
  this.set('trust proxy', false);
  // ('trust proxy' not set: a mounted app takes its parent's.)
  Object.defineProperty(this.settings, kTrustProxyDefault, { configurable: true, value: true });
  this.on('mount', function onMount(parent) {
    if (this.settings[kTrustProxyDefault] === true && typeof parent.settings['trust proxy fn'] === 'function') {
      delete this.settings['trust proxy'];
      delete this.settings['trust proxy fn'];
    }
    Object.setPrototypeOf(this.request, parent.request);
    Object.setPrototypeOf(this.response, parent.response);
    Object.setPrototypeOf(this.engines, parent.engines);
    Object.setPrototypeOf(this.settings, parent.settings);
  });
  this.locals = Object.create(null);
  this.mountpath = '/';
  this.locals.settings = this.settings;
  this.set('view', View);
  this.set('views', path.resolve('views'));
  this.set('jsonp callback name', 'callback');
  if (env === 'production') this.enable('view cache');
};

application.handle = function handle(req, res, callback) {
  // (The final handler made when a request reaches it.)
  const done = callback || ((error) => finalHandler(req, res, this.get('env'), logError.bind(this))(error));
  if (this.enabled('x-powered-by')) res.setHeader('X-Powered-By', 'Express');
  req.res = res;
  res.req = req;
  setPrototype(req, this.request);
  setPrototype(res, this.response);
  if (!res.locals) res.locals = Object.create(null);
  this.router.handle(req, res, done);
};

application.use = function use(fn, ...rest) {
  let callbacks = [fn, ...rest];
  let mountPath = '/';
  if (typeof fn !== 'function') {
    let arg = fn;
    while (Array.isArray(arg) && arg.length !== 0) [arg] = arg;
    if (typeof arg !== 'function') {
      mountPath = fn;
      callbacks = rest;
    }
  }
  callbacks = callbacks.flat(Infinity);
  if (callbacks.length === 0) throw new TypeError('app.use() requires a middleware function');
  const { router } = this;
  callbacks.forEach((callback) => {
    if (!callback || !callback.handle || !callback.set) {
      router.use(mountPath, callback);
      return;
    }
    // An app mounted: its own prototypes while it handles the request, its parent's again after.
    callback.mountpath = mountPath;
    callback.parent = this;
    const mounted = function mounted_app(req, res, next) {
      const original = req.app;
      callback.handle(req, res, (error) => {
        setPrototype(req, original.request);
        setPrototype(res, original.response);
        next(error);
      });
    };
    mounted[kMounted] = callback;
    router.use(mountPath, mounted);
    callback.emit('mount', this);
  });
  return this;
};

application.route = function route(routePath) {
  return this.router.route(routePath);
};

application.engine = function engine(ext, fn) {
  if (typeof fn !== 'function') throw new Error('callback function required');
  this.engines[ext[0] !== '.' ? `.${ext}` : ext] = fn;
  return this;
};

application.param = function param(name, fn) {
  if (Array.isArray(name)) {
    name.forEach((one) => this.param(one, fn));
    return this;
  }
  this.router.param(name, fn);
  return this;
};

application.set = function set(setting, value) {
  if (arguments.length === 1) return this.settings[setting];
  this.settings[setting] = value;
  if (setting === 'etag') this.set('etag fn', compileETag(value));
  else if (setting === 'query parser') this.set('query parser fn', compileQueryParser(value));
  else if (setting === 'trust proxy') {
    this.set('trust proxy fn', compileTrust(value));
    Object.defineProperty(this.settings, kTrustProxyDefault, { configurable: true, value: false });
  }
  return this;
};

application.path = function appPath() {
  return this.parent ? this.parent.path() + this.mountpath : '';
};

application.enabled = function enabled(setting) {
  return Boolean(this.set(setting));
};

application.disabled = function disabled(setting) {
  return !this.set(setting);
};

application.enable = function enable(setting) {
  return this.set(setting, true);
};

application.disable = function disable(setting) {
  return this.set(setting, false);
};

methods.forEach((method) => {
  application[method] = function addRoute(routePath, ...handlers) {
    if (method === 'get' && arguments.length === 1) return this.set(routePath);
    const created = this.route(routePath);
    created[method](...handlers);
    return this;
  };
});

application.all = function all(routePath, ...handlers) {
  const created = this.route(routePath);
  methods.forEach((method) => created[method](...handlers));
  return this;
};

application.render = function render(name, options, callback) {
  const { cache, engines } = this;
  let done = callback;
  let opts = options;
  if (typeof options === 'function') {
    done = options;
    opts = {};
  }
  const renderOptions = { ...this.locals, ...opts._locals, ...opts };
  if (renderOptions.cache == null) renderOptions.cache = this.enabled('view cache');
  let view = renderOptions.cache ? cache[name] : undefined;
  if (!view) {
    const ViewClass = this.get('view');
    view = new ViewClass(name, { defaultEngine: this.get('view engine'), root: this.get('views'), engines });
    if (!view.path) {
      const dirs =
        Array.isArray(view.root) && view.root.length > 1
          ? `directories "${view.root.slice(0, -1).join('", "')}" or "${view.root[view.root.length - 1]}"`
          : `directory "${view.root}"`;
      const error = new Error(`Failed to lookup view "${name}" in views ${dirs}`);
      error.view = view;
      done(error);
      return;
    }
    if (renderOptions.cache) cache[name] = view;
  }
  try {
    view.render(renderOptions, done);
  } catch (error) {
    done(error);
  }
};

// A server of Node's for the app (its requests and responses of the app's classes), listening.
application.listen = function listen(...args) {
  const server = http.createServer(serverClasses(this), this);
  const last = args[args.length - 1];
  if (typeof last === 'function') {
    let called = false;
    const once = (...callbackArgs) => {
      if (called) return;
      called = true;
      last.apply(server, callbackArgs);
    };
    args[args.length - 1] = once;
    server.once('error', once);
  }
  return server.listen(...args);
};

export { EventEmitter };
