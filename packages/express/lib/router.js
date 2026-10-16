// Express's Router, Route and their layers: a router is a list of layers (middlewares of app.use, mounted routers
// and apps, routes) tried in order for a request; a route is a list of handlers by method. next() goes on to the next
// layer that matches (next('route') leaves a route, next('router') a router, next(error) goes to the error handlers:
// functions of four arguments). Mounted layers see the url without their path (req.baseUrl has it). A router knows
// the layers that may meet a request when the app found them first (./plan.js): it tries only those.
import { METHODS } from 'node:http';
import { compilePath } from './path.js';
import { changed, kPlan } from './plan.js';
import { pathnameOf } from './url.js';

export const methods = METHODS.map((method) => method.toLowerCase());

// --- Layer ----------------------------------------------------------------------------------------------------------

// A function at a path: match(pathname) is { path, params } (the part of the pathname it matched) or false.
export class Layer {
  constructor(path, options, fn) {
    this.handle = fn;
    this.name = fn.name || '<anonymous>';
    this.pattern = path;
    this.end = options.end;
    this.sensitive = options.sensitive;
    this.strict = options.strict;
    this.route = undefined;
    this.method = undefined;
    // (A middleware at '/' meets every path: nothing to match.)
    this.slash = path === '/' && options.end === false;
    // (The handlers of a route have no path of their own.)
    this.matcher = this.slash || path === undefined ? null : compilePath(path, options);
  }

  match(pathname) {
    if (this.slash) return { path: '', params: {} };
    return this.matcher(pathname);
  }

  // The layer's function for a request (functions of four arguments only see errors).
  handleRequest(req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) {
      next();
      return;
    }
    try {
      const result = fn(req, res, next);
      if (result !== undefined && result !== null && typeof result.then === 'function') {
        result.then(null, (error) => next(error || new Error('Rejected promise')));
      }
    } catch (error) {
      next(error);
    }
  }

  handleError(error, req, res, next) {
    const fn = this.handle;
    if (fn.length !== 4) {
      next(error);
      return;
    }
    try {
      const result = fn(error, req, res, next);
      if (result !== undefined && result !== null && typeof result.then === 'function') {
        result.then(null, (rejection) => next(rejection || new Error('Rejected promise')));
      }
    } catch (thrown) {
      next(thrown);
    }
  }
}

// The functions given to use(), route() and the methods: arrays flattened, each a function.
function callbacksOf(args, empty) {
  const callbacks = args.flat(Infinity);
  if (callbacks.length === 0) throw new TypeError(empty);
  callbacks.forEach((fn) => {
    if (typeof fn !== 'function') throw new TypeError('argument handler must be a function');
  });
  return callbacks;
}

// --- Route ----------------------------------------------------------------------------------------------------------

// A route: its path, its handlers (layers with a method, or none for all) and the methods it answers.
export function Route(path) {
  this.path = path;
  this.stack = [];
  this.methods = Object.create(null);
}

Route.prototype._handlesMethod = function _handlesMethod(method) {
  if (this.methods._all) return true;
  let name = typeof method === 'string' ? method.toLowerCase() : method;
  if (name === 'head' && !this.methods.head) name = 'get';
  return Boolean(this.methods[name]);
};

// Its methods, in capitals (HEAD with GET).
Route.prototype._methods = function _methods() {
  const names = Object.keys(this.methods);
  if (this.methods.get && !this.methods.head) names.push('head');
  return names.map((name) => name.toUpperCase());
};

Route.prototype.dispatch = function dispatch(req, res, done) {
  const { stack } = this;
  if (stack.length === 0) {
    done();
    return;
  }
  let method = typeof req.method === 'string' ? req.method.toLowerCase() : req.method;
  if (method === 'head' && !this.methods.head) method = 'get';
  req.route = this;
  let index = 0;
  let sync = 0;
  const next = (error) => {
    if (error && error === 'route') {
      done();
      return;
    }
    if (error && error === 'router') {
      done(error);
      return;
    }
    if (index >= stack.length) {
      done(error);
      return;
    }
    // (A long run of handlers that call next() at once goes on in a later turn: the stack would overflow.)
    sync += 1;
    if (sync > 100) {
      setImmediate(next, error);
      return;
    }
    let layer;
    let found = false;
    while (!found && index < stack.length) {
      layer = stack[index++];
      found = !layer.method || layer.method === method;
    }
    if (!found) {
      done(error);
      return;
    }
    if (error) layer.handleError(error, req, res, next);
    else layer.handleRequest(req, res, next);
    sync = 0;
  };
  next();
};

Route.prototype.all = function all(...args) {
  changed();
  callbacksOf(args, 'argument handler is required').forEach((fn) => {
    const layer = new Layer(undefined, {}, fn);
    this.methods._all = true;
    this.stack.push(layer);
  });
  return this;
};

methods.forEach((method) => {
  Route.prototype[method] = function addHandlers(...args) {
    changed();
    callbacksOf(args, 'argument handler is required').forEach((fn) => {
      const layer = new Layer(undefined, {}, fn);
      layer.method = method;
      this.methods[method] = true;
      this.stack.push(layer);
    });
    return this;
  };
});

// --- Router ---------------------------------------------------------------------------------------------------------

// A router: a function (req, res, next) with the router's methods (Router() and new Router() alike).
export function Router(options) {
  if (!new.target) return new Router(options);
  const opts = options || {};
  const router = function router(req, res, next) {
    router.handle(req, res, next);
  };
  Object.setPrototypeOf(router, Router.prototype);
  router.caseSensitive = opts.caseSensitive;
  router.mergeParams = opts.mergeParams;
  router.params = {};
  router.strict = opts.strict;
  router.stack = [];
  return router;
}

// (Routers are functions: their prototype is one, as Express's.)
Router.prototype = function routerPrototype() {};

Router.Route = Route;

Router.prototype.param = function param(name, fn) {
  if (!name) throw new TypeError('argument name is required');
  if (typeof name !== 'string') throw new TypeError('argument name must be a string');
  if (!fn) throw new TypeError('argument fn is required');
  if (typeof fn !== 'function') throw new TypeError('argument fn must be a function');
  (this.params[name] ||= []).push(fn);
  return this;
};

Router.prototype.use = function use(handler, ...rest) {
  changed();
  let path = '/';
  let args = [handler, ...rest];
  if (typeof handler !== 'function') {
    let arg = handler;
    while (Array.isArray(arg) && arg.length !== 0) [arg] = arg;
    if (typeof arg !== 'function') {
      path = handler;
      args = rest;
    }
  }
  callbacksOf(args, 'argument handler is required').forEach((fn) => {
    this.stack.push(new Layer(path, { sensitive: this.caseSensitive, strict: false, end: false }, fn));
  });
  return this;
};

Router.prototype.route = function route(path) {
  changed();
  const created = new Route(path);
  const handle = function handle(req, res, next) {
    created.dispatch(req, res, next);
  };
  const layer = new Layer(path, { sensitive: this.caseSensitive, strict: this.strict, end: true }, handle);
  layer.route = created;
  this.stack.push(layer);
  return created;
};

methods.concat('all').forEach((method) => {
  Router.prototype[method] = function addRoute(path, ...handlers) {
    const created = this.route(path);
    created[method](...handlers);
    return this;
  };
});

// The protocol and host of a url of a proxy's form (http://host/path), or ''.
function protohostOf(url) {
  if (typeof url !== 'string' || url.length === 0 || url[0] === '/') return '';
  const search = url.indexOf('?');
  const end = search !== -1 ? search : url.length;
  const fqdn = url.substring(0, end).indexOf('://');
  return fqdn !== -1 ? url.substring(0, url.indexOf('/', 3 + fqdn)) : '';
}

// The params of a mounted router with mergeParams: its parent's, and its own over them (numbered ones after).
function mergeParams(params, parent) {
  if (typeof parent !== 'object' || !parent) return params;
  const merged = {};
  for (const key in parent) merged[key] = parent[key];
  if (!(0 in params) || !(0 in parent)) {
    for (const key in params) merged[key] = params[key];
    return merged;
  }
  let i = 0;
  let o = 0;
  while (i in params) i += 1;
  while (o in parent) o += 1;
  for (i -= 1; i >= 0; i -= 1) {
    params[i + o] = params[i];
    if (i < o) delete params[i];
  }
  return Object.assign(merged, params);
}

// The answer of OPTIONS of a path no route answers: Allow, the methods of the routes that match it.
function sendOptions(res, allowed, next) {
  try {
    const allow = [...new Set(allowed)].sort().join(', ');
    res.setHeader('Allow', allow);
    res.setHeader('Content-Length', Buffer.byteLength(allow));
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(allow);
  } catch (error) {
    next(error);
  }
}

// The callbacks of router.param() for the params of a layer, each once for a value (called before: its result kept).
function processParams(callbacks, keys, called, req, res, done) {
  if (keys.length === 0) {
    done();
    return;
  }
  let i = 0;
  let fnIndex = 0;
  let key;
  let value;
  let fns;
  let calledForKey;
  const param = (error) => {
    if (error) {
      done(error);
      return;
    }
    if (i >= keys.length) {
      done();
      return;
    }
    fnIndex = 0;
    key = keys[i++];
    value = req.params[key];
    fns = callbacks[key];
    calledForKey = called[key];
    if (value === undefined || !fns) {
      param();
      return;
    }
    if (calledForKey && (calledForKey.match === value || (calledForKey.error && calledForKey.error !== 'route'))) {
      req.params[key] = calledForKey.value;
      param(calledForKey.error);
      return;
    }
    calledForKey = { error: null, match: value, value };
    called[key] = calledForKey;
    paramCallback();
  };
  const paramCallback = (error) => {
    const fn = fns[fnIndex++];
    calledForKey.value = req.params[key];
    if (error) {
      calledForKey.error = error;
      param(error);
      return;
    }
    if (!fn) {
      param();
      return;
    }
    try {
      const result = fn(req, res, paramCallback, value, key);
      if (result !== undefined && result !== null && typeof result.then === 'function') {
        result.then(null, (rejection) => paramCallback(rejection || new Error('Rejected promise')));
      }
    } catch (thrown) {
      paramCallback(thrown);
    }
  };
  param();
}

Router.prototype.handle = function handle(req, res, callback) {
  if (!callback) throw new TypeError('argument callback is required');
  const router = this;
  const protohost = protohostOf(req.url);
  const parentParams = req.params;
  const parentUrl = req.baseUrl || '';
  const savedBaseUrl = req.baseUrl;
  const savedNext = req.next;
  let index = 0;
  let removed = '';
  let slashAdded = false;
  let sync = 0;
  const paramCalled = {};
  let allowed = null;
  // (The pathname of the url last read: the same for every layer until a layer changes req.url.)
  let readUrl = null;
  let readPathname;
  // The layers to try: those of the plan of the request (the app found them), or all of them.
  const plan = req[kPlan];
  let stack = (plan && plan.layersOf(router)) || router.stack;
  const planUrl = req.url;
  const planMethod = req.method;

  // Leaving the router: req.baseUrl, req.next and req.params as they were (an OPTIONS answered if a route has it).
  const done = (error) => {
    req.baseUrl = savedBaseUrl;
    req.next = savedNext;
    req.params = parentParams;
    if (allowed !== null && !error && allowed.length !== 0) {
      sendOptions(res, allowed, callback);
      return;
    }
    callback(error);
  };

  const trimPrefix = (layer, layerError, layerPath, pathname) => {
    if (layerPath.length !== 0) {
      if (layerPath !== pathname.substring(0, layerPath.length)) {
        next(layerError);
        return;
      }
      const c = pathname[layerPath.length];
      if (c && c !== '/') {
        next(layerError);
        return;
      }
      removed = layerPath;
      req.url = protohost + req.url.slice(protohost.length + removed.length);
      if (!protohost && req.url[0] !== '/') {
        req.url = `/${req.url}`;
        slashAdded = true;
      }
      req.baseUrl =
        parentUrl + (removed[removed.length - 1] === '/' ? removed.substring(0, removed.length - 1) : removed);
    }
    if (layerError) layer.handleError(layerError, req, res, next);
    else layer.handleRequest(req, res, next);
  };

  function next(err) {
    let layerError = err === 'route' ? null : err;
    if (slashAdded) {
      req.url = req.url.slice(1);
      slashAdded = false;
    }
    if (removed.length !== 0) {
      req.baseUrl = parentUrl;
      req.url = protohost + removed + req.url.slice(protohost.length);
      removed = '';
    }
    // (A layer changed the url or the method: the plan is not the request's any more; every layer after it.)
    if (stack !== router.stack && (req.url !== planUrl || req.method !== planMethod)) {
      index = index === 0 ? 0 : router.stack.indexOf(stack[index - 1]) + 1;
      stack = router.stack;
      req[kPlan] = null;
    }
    if (layerError === 'router') {
      setImmediate(done, null);
      return;
    }
    if (index >= stack.length) {
      setImmediate(done, layerError);
      return;
    }
    sync += 1;
    if (sync > 100) {
      setImmediate(next, err);
      return;
    }
    if (req.url !== readUrl) {
      readUrl = req.url;
      readPathname = pathnameOf(req);
    }
    const pathname = readPathname;
    if (pathname == null) {
      done(layerError);
      return;
    }
    let layer;
    let match = false;
    let route;
    while (match === false && index < stack.length) {
      layer = stack[index++];
      try {
        match = layer.match(pathname);
      } catch (error) {
        layerError = layerError || error;
        match = false;
        continue;
      }
      if (match === false) continue;
      route = layer.route;
      if (!route) continue;
      if (layerError) {
        match = false;
        continue;
      }
      const method = req.method;
      const hasMethod = route._handlesMethod(method);
      if (!hasMethod && method === 'OPTIONS' && allowed !== null) allowed.push(...route._methods());
      if (!hasMethod && method !== 'HEAD') match = false;
    }
    if (match === false) {
      done(layerError);
      return;
    }
    if (route) req.route = route;
    req.params = router.mergeParams ? mergeParams(match.params, parentParams) : match.params;
    const layerPath = match.path;
    const keys = layer.slash ? [] : Object.keys(match.params);
    processParams(router.params, keys, paramCalled, req, res, (error) => {
      if (error) next(layerError || error);
      else if (route) layer.handleRequest(req, res, next);
      else trimPrefix(layer, layerError, layerPath, pathname);
      sync = 0;
    });
  }

  req.next = next;
  if (req.method === 'OPTIONS') allowed = [];
  req.baseUrl = parentUrl;
  req.originalUrl = req.originalUrl || req.url;
  next();
};
