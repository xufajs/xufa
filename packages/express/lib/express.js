// express(): an app, a function (req, res, next) with the application's methods and an EventEmitter's. As the
// handler of a server (no next) it is served through @xufa/router or @xufa/http (./server.js); as a middleware, its
// router handles the request.
import { EventEmitter } from 'node:events';
import { application } from './application.js';
import { request } from './request.js';
import { response } from './response.js';
import { Route, Router } from './router.js';
import { json, raw, text, urlencoded } from './body.js';
import { serveStatic } from './static.js';
import { extend, serve } from './server.js';

// The members of a source an app does not have yet (merge-descriptors, not redefining).
function mixin(target, source) {
  Object.getOwnPropertyNames(source).forEach((name) => {
    if (Object.hasOwn(target, name)) return;
    Object.defineProperty(target, name, Object.getOwnPropertyDescriptor(source, name));
  });
}

export function createApplication(options) {
  const app = function app(req, res, next) {
    if (next === undefined) serve(app, req, res);
    else app.handle(req, res, next);
  };
  mixin(app, EventEmitter.prototype);
  mixin(app, application);
  app.request = Object.create(request, { app: { configurable: true, enumerable: true, writable: true, value: app } });
  app.response = Object.create(response, { app: { configurable: true, enumerable: true, writable: true, value: app } });
  app.init();
  extend(app, options);
  return app;
}

Object.assign(createApplication, {
  application,
  request,
  response,
  Route,
  Router,
  json,
  raw,
  text,
  urlencoded,
  static: serveStatic,
});

export { application, request, response, Route, Router, json, raw, text, urlencoded, serveStatic };
