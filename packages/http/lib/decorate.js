// Decorators of instances, requests and replies.
import { kReply, kRequest, kState, kHasBeenDecorated } from './symbols.js';
import {
  XUFA_ERR_DEC_ALREADY_PRESENT,
  XUFA_ERR_DEC_MISSING_DEPENDENCY,
  XUFA_ERR_DEC_AFTER_START,
  XUFA_ERR_DEC_REFERENCE_TYPE,
  XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE,
  XUFA_ERR_DEC_UNDECLARED,
} from './errors.js';

const isAccessor = (fn) => Boolean(fn) && (typeof fn.getter === 'function' || typeof fn.setter === 'function');

function decorate(instance, name, fn, dependencies) {
  if (Object.prototype.hasOwnProperty.call(instance, name)) throw new XUFA_ERR_DEC_ALREADY_PRESENT(name);
  checkDependencies(instance, name, dependencies);
  if (isAccessor(fn)) Object.defineProperty(instance, name, { get: fn.getter, set: fn.setter });
  else instance[name] = fn;
}

function hasKey(constructor, name) {
  return constructor.props ? constructor.props.some((prop) => prop.key === name) : false;
}

function hasInstanceProperty(constructor, name) {
  for (let k = constructor; k; k = k.parent) {
    if (k.instanceProperties && k.instanceProperties.has(name)) return true;
  }
  return false;
}

function checkExistence(instance, name) {
  if (name) return name in instance || (instance.prototype && name in instance.prototype) || hasKey(instance, name);
  return instance in this;
}

// Request and Reply decorators: functions and accessors on the prototype, values set by the constructor of each
// request (so that objects are not shared between requests).
function decorateConstructor(constructor, name, fn, dependencies) {
  const proto = constructor.prototype;
  if (
    Object.prototype.hasOwnProperty.call(proto, name) ||
    hasKey(constructor, name) ||
    hasInstanceProperty(constructor, name)
  ) {
    throw new XUFA_ERR_DEC_ALREADY_PRESENT(name);
  }
  constructor[kHasBeenDecorated] = true;
  checkDependencies(constructor, name, dependencies);
  if (isAccessor(fn)) {
    Object.defineProperty(proto, name, { get: fn.getter, set: fn.setter });
  } else if (typeof fn === 'function') {
    proto[name] = fn;
  } else {
    constructor.props.push({ key: name, value: fn });
    // The constructor sets the values of the decorators: it is rebuilt with the new property.
    if (typeof constructor.rebuild === 'function') constructor.rebuild();
  }
}

function checkReferenceType(name, fn) {
  if (typeof fn === 'object' && fn && !isAccessor(fn)) throw new XUFA_ERR_DEC_REFERENCE_TYPE(name, typeof fn);
}

function assertNotStarted(instance, name) {
  if (instance[kState].started) throw new XUFA_ERR_DEC_AFTER_START(name);
}

function checkDependencies(instance, name, deps) {
  if (deps === undefined || deps === null) return;
  if (!Array.isArray(deps)) throw new XUFA_ERR_DEC_DEPENDENCY_INVALID_TYPE(name);
  for (const dep of deps) {
    if (!checkExistence(instance, dep) && !hasInstanceProperty(instance, dep)) {
      throw new XUFA_ERR_DEC_MISSING_DEPENDENCY(dep);
    }
  }
}

function decorateInstance(name, fn, dependencies) {
  assertNotStarted(this, name);
  decorate(this, name, fn, dependencies);
  return this;
}

function decorateReply(name, fn, dependencies) {
  assertNotStarted(this, name);
  checkReferenceType(name, fn);
  decorateConstructor(this[kReply], name, fn, dependencies);
  return this;
}

function decorateRequest(name, fn, dependencies) {
  assertNotStarted(this, name);
  checkReferenceType(name, fn);
  decorateConstructor(this[kRequest], name, fn, dependencies);
  return this;
}

function checkRequestExistence(name) {
  if (name && hasKey(this[kRequest], name)) return true;
  if (name && hasInstanceProperty(this[kRequest], name)) return true;
  return checkExistence(this[kRequest].prototype, name);
}

function checkReplyExistence(name) {
  if (name && hasKey(this[kReply], name)) return true;
  if (name && hasInstanceProperty(this[kReply], name)) return true;
  return checkExistence(this[kReply].prototype, name);
}

function getInstanceDecorator(name) {
  if (!checkExistence(this, name)) throw new XUFA_ERR_DEC_UNDECLARED(name, 'instance');
  return typeof this[name] === 'function' ? this[name].bind(this) : this[name];
}

export {
  decorateInstance as add,
  checkExistence as exist,
  checkRequestExistence as existRequest,
  checkReplyExistence as existReply,
  checkDependencies as dependencies,
  decorateReply,
  decorateRequest,
  getInstanceDecorator,
  hasKey,
};
