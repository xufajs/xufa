// The plans of an app's routes: each route of its routers (and of the routers and apps mounted on them) whose path
// @xufa/router can match (static segments and :params) is a route of @xufa/router, with a plan made once: for each
// router on the way, the layers that may meet the route's urls, in their order. A router given a request's plan
// tries only those layers (a mounted router none of whose layers can is left out). A request no route matches gets
// the plan of a miss: the layers that may meet any url (middlewares, paths of RegExp and wildcards). Plans are made
// again after any router changes (version).
import { METHODS } from 'node:http';
import createRouter from '@xufa/router';

export const kPlan = Symbol('xufa.express.plan');
// The function an app is mounted with is marked with the app.
export const kMounted = Symbol.for('xufa.express.mountedApp');

let current = 0;

export function changed() {
  current += 1;
}

export const version = () => current;

// --- Paths: a path of Express as segments ({ text } or { param }), or null when it has more than @xufa/router matches.
const SIMPLE_SEGMENT = /^(?::[A-Za-z_$][A-Za-z0-9_$]*|[^:*?+(){}[\]\\!]*)$/;

function segmentsOf(pattern) {
  if (typeof pattern !== 'string') return null;
  const parts = pattern.replace(/\/+$/, '').split('/');
  if (parts[0] !== '') return null;
  const segments = [];
  for (const part of parts.slice(1)) {
    if (!SIMPLE_SEGMENT.test(part)) return null;
    segments.push(part.startsWith(':') ? { param: part.slice(1) } : { text: part });
  }
  return segments;
}

const join = (base, pattern) => (pattern === '/' ? base || '/' : `${base}${pattern}`);

function normalized(text) {
  try {
    return decodeURIComponent(text).toLowerCase();
  } catch {
    return text.toLowerCase();
  }
}

// Whether a layer at a base path may meet some url of a route's segments (false only when it cannot).
function mayMeet(layer, base, target) {
  const patterns = Array.isArray(layer.pattern) ? layer.pattern : [layer.pattern];
  return patterns.some((pattern) => {
    const own = segmentsOf(typeof pattern === 'string' ? join(base, pattern) : null);
    if (!own) return true;
    if (layer.end ? own.length !== target.length : own.length > target.length) return false;
    return own.every((segment, i) => {
      const other = target[i];
      if (segment.text === undefined || other.text === undefined) return true;
      return normalized(segment.text) === normalized(other.text);
    });
  });
}

// What a layer mounts: a router (its stack) or an app (its router).
function mountedRouterOf(layer) {
  if (layer.route) return null;
  const { handle } = layer;
  const app = handle[kMounted];
  if (app) return app.router;
  return Array.isArray(handle.stack) && typeof handle.handle === 'function' ? handle : null;
}

const mountBase = (base, layer) =>
  typeof layer.pattern === 'string' && segmentsOf(join(base, layer.pattern))
    ? join(base, layer.pattern).replace(/\/+$/, '')
    : null;

// The routes of the routers: [{ segments, methods, layer, whole }] for those @xufa/router can match (whole: every
// path of the layer is one it can match).
function routesOf(router, base, routes) {
  for (const layer of router.stack) {
    if (layer.route) {
      const patterns = Array.isArray(layer.pattern) ? layer.pattern : [layer.pattern];
      const found = patterns.map((pattern) => (typeof pattern === 'string' ? segmentsOf(join(base, pattern)) : null));
      const whole = found.every(Boolean);
      for (const segments of found) {
        if (segments) routes.push({ segments, methods: layer.route.methods, layer, whole });
      }
    } else {
      const inner = mountedRouterOf(layer);
      const innerBase = inner && mountBase(base, layer);
      if (inner && innerBase !== null) routesOf(inner, innerBase, routes);
    }
  }
  return routes;
}

// The layers of each router (on the way) that a filter keeps; a mounted router left with none is left out (apps are
// kept: they set headers of their own).
function layersOf(router, base, keep, descend, layers = new Map()) {
  const candidates = router.stack.filter((layer) => {
    if (!keep(layer, base)) return false;
    const inner = mountedRouterOf(layer);
    const innerBase = inner && mountBase(base, layer);
    if (!inner || innerBase === null) return true;
    layersOf(inner, innerBase, keep, descend, layers);
    return layer.handle[kMounted] !== undefined || layers.get(inner).length > 0;
  });
  const known = layers.get(router);
  // (A router mounted twice: the layers of both places.)
  layers.set(
    router,
    known ? router.stack.filter((layer) => known.includes(layer) || candidates.includes(layer)) : candidates
  );
  return layers;
}

const shapeOf = (segments) =>
  `/${segments.map((segment) => (segment.param ? ':' : normalized(segment.text))).join('/')}`;
const urlOf = (segments) =>
  `/${segments.map((segment, i) => (segment.param ? `:p${i}` : segment.text.replace(/:/g, '::'))).join('/')}`;

const planOf = (layers) => ({ layersOf: (router) => layers.get(router) || null });

// The routes of an app with their plans: [{ url, methods, plan, layers }], one for each shape of path (/a/:/b).
export function plannedRoutes(app) {
  const byShape = new Map();
  for (const { segments, methods, layer, whole } of routesOf(app.router, '', [])) {
    const shape = shapeOf(segments);
    let entry = byShape.get(shape);
    if (!entry) {
      entry = { segments, methods: new Set(), layers: [] };
      byShape.set(shape, entry);
    }
    entry.layers.push({ layer, whole });
    const names = methods._all ? METHODS : Object.keys(methods).map((name) => name.toUpperCase());
    for (const name of names) entry.methods.add(name);
    // (GET answers HEAD.)
    if (entry.methods.has('GET')) entry.methods.add('HEAD');
  }
  return [...byShape.values()].map(({ segments, methods, layers }) => ({
    url: urlOf(segments),
    methods,
    layers,
    plan: planOf(layersOf(app.router, '', (layer, base) => mayMeet(layer, base, segments))),
  }));
}

const ROUTER_OPTIONS = { caseSensitive: false, ignoreTrailingSlash: true, maxParamLength: 65535 };
const noop = () => {};

// The router of an app's plans: { router (of @xufa/router: its store a plan), missPlan }.
export function buildPlans(app) {
  const router = createRouter(ROUTER_OPTIONS);
  // The route layers the router has whole (each path, each method): those a request it finds nothing for cannot meet.
  const matched = new Set();
  const partial = new Set();
  for (const { url, methods, plan, layers } of plannedRoutes(app)) {
    let registered = true;
    for (const method of methods) {
      try {
        router.on(method, url, noop, plan);
      } catch {
        // (A method the router does not know: its requests go through every layer.)
        registered = false;
      }
    }
    for (const { layer, whole } of layers) {
      if (registered && whole) matched.add(layer);
      else partial.add(layer);
    }
  }
  for (const layer of partial) matched.delete(layer);
  const missPlan = planOf(layersOf(app.router, '', (layer) => !layer.route || !matched.has(layer)));
  return { router, missPlan };
}

export const { FOUND } = createRouter;
export { ROUTER_OPTIONS };
