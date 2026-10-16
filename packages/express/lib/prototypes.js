// The prototypes of req and res (app.request, app.response), as Express sets them, without its costs and its losses:
// - an object that has the prototype already is left alone (the requests of the app's server are of its classes);
// - Node's requests and responses (and those given another of the app's prototypes) get it, as in Express;
// - objects of other classes (@xufa/http's inject, other servers', even of subclasses of Node's) keep theirs, with
//   Express's members on a prototype between (replacing it, inject's response would lose its payload).
import http from 'node:http';

const kBase = Symbol('xufa.express.base');
const kExpress = Symbol('xufa.express.prototype');
const kClassOf = Symbol('xufa.express.classOf');
const mixedOf = new WeakMap();

function inherits(proto, base) {
  for (let at = proto; at; at = Object.getPrototypeOf(at)) if (at === base) return true;
  return false;
}

// The members of a prototype's chain down to Node's (the nearest ones win).
function descriptorsOf(target, base) {
  const chain = [];
  for (let at = target; at && at !== base; at = Object.getPrototypeOf(at)) chain.unshift(at);
  const descriptors = {};
  for (const proto of chain) Object.assign(descriptors, Object.getOwnPropertyDescriptors(proto));
  delete descriptors.constructor;
  return descriptors;
}

export function setPrototype(object, target) {
  const own = Object.getPrototypeOf(object);
  if (own === target || own[kClassOf] === target) return;
  if (!Object.hasOwn(target, kExpress)) Object.defineProperty(target, kExpress, { value: true });
  const base = inherits(target, http.IncomingMessage.prototype)
    ? http.IncomingMessage.prototype
    : http.ServerResponse.prototype;
  if (own === base || Object.hasOwn(own, kExpress) || Object.hasOwn(own, kClassOf)) {
    Object.setPrototypeOf(object, target);
    return;
  }
  const foreign = own[kBase] || own;
  let byTarget = mixedOf.get(foreign);
  if (!byTarget) {
    byTarget = new WeakMap();
    mixedOf.set(foreign, byTarget);
  }
  let mixed = byTarget.get(target);
  if (!mixed) {
    mixed = Object.create(foreign, descriptorsOf(target, base));
    Object.defineProperty(mixed, kBase, { value: foreign });
    byTarget.set(target, mixed);
  }
  Object.setPrototypeOf(object, mixed);
}

const classesOf = new WeakMap();

// The classes of the requests and responses of an app's server: Node's, whose prototypes lead to the app's, marked
// with them (a request of the server has its prototype already: no change of prototype per request).
export function serverClasses(app) {
  let classes = classesOf.get(app);
  if (!classes) {
    class AppRequest extends http.IncomingMessage {}
    Object.setPrototypeOf(AppRequest.prototype, app.request);
    Object.defineProperty(AppRequest.prototype, kClassOf, { value: app.request });
    class AppResponse extends http.ServerResponse {}
    Object.setPrototypeOf(AppResponse.prototype, app.response);
    Object.defineProperty(AppResponse.prototype, kClassOf, { value: app.response });
    classes = { IncomingMessage: AppRequest, ServerResponse: AppResponse };
    classesOf.set(app, classes);
  }
  return classes;
}
