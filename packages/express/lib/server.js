// An app on @xufa/http. As the handler of a server (app(req, res): app.listen, http.createServer(app), supertest), the
// app routes the request with @xufa/router first: the plan of the route it finds (./plan.js) tells each router which
// layers to try. With plugins of @xufa/http (app.register), an instance of @xufa/http routes the requests: the
// plugins' routes are its own, the app's routes and what it does not find go to the app. The plans and the instance
// are made at the first request, and again at the first one after a router changed.
import { METHODS } from 'node:http';
import xufaHttp from '@xufa/http';
import { FOUND, ROUTER_OPTIONS, buildPlans, kPlan, plannedRoutes, version } from './plan.js';

const states = new WeakMap();

const SERVER_OPTIONS = { exposeHeadRoutes: false };

// The instance of @xufa/http of an app: its plugins, then the app's routes (a method and url a plugin has is the
// plugin's), and the app for what is left (not found, errors of @xufa/http's own: the app answers them).
function build(app, state, options = {}) {
  const run = (request, reply, plan) => {
    reply.hijack();
    const req = request.raw;
    if (plan) req[kPlan] = plan;
    app.handle(req, reply.raw);
  };
  const instance = xufaHttp({
    logger: false,
    ...state.options,
    ...options,
    ...SERVER_OPTIONS,
    routerOptions: { ...state.options.routerOptions, ...options.routerOptions, ...ROUTER_OPTIONS },
    frameworkErrors: (error, request, reply) => run(request, reply, null),
  });
  instance.removeAllContentTypeParsers();
  // (Bodies stay in the requests: the app's parsers read them.)
  instance.addContentTypeParser('*', (request, payload, done) => done(null));
  for (const [plugin, pluginOptions] of state.plugins) instance.register(plugin, pluginOptions);
  const supported = new Set(instance.supportedMethods);
  const routes = plannedRoutes(app);
  instance.register(async (scope) => {
    for (const { url, methods, plan } of routes) {
      const handler = (request, reply) => run(request, reply, plan);
      for (const method of methods) {
        if (supported.has(method) && !scope.hasRoute({ method, url })) scope.route({ method, url, handler });
      }
    }
  });
  instance.setNotFoundHandler((request, reply) => run(request, reply, null));
  instance.setErrorHandler((error, request, reply) => run(request, reply, null));
  return instance;
}

// An instance that could not be made is said (the app answers every request then, without plans).
function warnUnrouted(error) {
  process.emitWarning(
    `The routes of an app could not be made into @xufa/http's (Express answers them, slower): ${error.message}`,
    { code: 'XUFA_EXPRESS_UNROUTED' }
  );
}

// A request to the app as the handler of a server.
export function serve(app, req, res) {
  const state = states.get(app);
  if (state.plugins.length === 0) {
    if (state.plans === null || state.plansVersion !== version()) {
      state.plansVersion = version();
      state.plans = buildPlans(app);
    }
    const found = state.plans.router.match(req.method, req.url);
    if (found !== null) {
      if (found.status === FOUND) req[kPlan] = found.store;
    } else if (req.method !== 'OPTIONS' && req.url.charCodeAt(0) === 47) {
      // (No route: the plan of a miss. OPTIONS needs every route, for its Allow; urls of a proxy's form,
      // http://host/path, the router does not read.)
      req[kPlan] = state.plans.missPlan;
    }
    app.handle(req, res);
    return;
  }
  if (state.instance !== null && state.version === version()) {
    state.instance.routing(req, res);
    return;
  }
  if (state.failedVersion === version()) {
    app.handle(req, res);
    return;
  }
  if (state.pending === null || state.pendingVersion !== version()) {
    const current = version();
    let instance;
    try {
      instance = build(app, state);
    } catch (error) {
      state.error = error;
      state.failedVersion = current;
      warnUnrouted(error);
      app.handle(req, res);
      return;
    }
    state.pendingVersion = current;
    state.pending = instance.ready().then(() => {
      if (state.pendingVersion !== current) return;
      state.instance = instance;
      state.version = current;
      state.pending = null;
    });
  }
  state.pending.then(
    () => serve(app, req, res),
    (error) => {
      state.error = error;
      state.failedVersion = state.pendingVersion;
      warnUnrouted(error);
      state.pending = null;
      app.handle(req, res);
    }
  );
}

// What xufa adds to an app: server(options), its instance of @xufa/http (for inject, ready...); register(plugin),
// a plugin of @xufa/http with routes of its own, before the app's.
export function extend(app, options = {}) {
  const state = {
    options: options.server || {},
    plugins: [],
    instance: null,
    version: -1,
    plans: null,
    plansVersion: -1,
    pending: null,
    pendingVersion: -1,
    failedVersion: -1,
    error: null,
  };
  states.set(app, state);
  Object.defineProperty(app, 'register', {
    configurable: true,
    writable: true,
    value(plugin, pluginOptions) {
      state.plugins.push([plugin, pluginOptions]);
      state.instance = null;
      state.pending = null;
      state.pendingVersion = -1;
      state.failedVersion = -1;
      return app;
    },
  });
  Object.defineProperty(app, 'server', {
    configurable: true,
    writable: true,
    value: (serverOptions) => build(app, state, serverOptions),
  });
}

export { METHODS };
