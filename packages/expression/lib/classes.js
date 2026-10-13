// The classes of programs, made the same by the closures and by the function of JavaScript: a constructor (called with
// new only), its prototype with its methods, getters and setters (not enumerable, as JavaScript makes them), its
// fields (defined on each instance before the body of its constructor runs, or after super() returns), its statics,
// and what it extends: a class of a program or a constructor of the engine that can be extended (Error, TypeError,
// RangeError, Map, Set, Date). The methods are functions of the compilers that take `this`; a constructor takes the
// record of its construction first (what super() fills).
//
// Instances of these classes (and the classes) can be changed by programs, as plain objects can: their prototypes are
// of programs, never of the process.
import { FORBIDDEN } from './forbidden.js';
import { SHORT } from './short.js';

const RUNTIME = 'XUFA_EXPR_ERR_RUNTIME';
const FORBIDDEN_CODE = 'XUFA_EXPR_ERR_FORBIDDEN';

const prototypes = new WeakSet();
const classes = new WeakSet();

const EXTENDABLE = new Set([Error, TypeError, RangeError, Map, Set, Date]);

// Whether a value is a class of a program.
const isProgramClass = (value) => typeof value === 'function' && classes.has(value);

// Whether an object is of a program: an instance of a class of a program (its prototypes, those of programs first), a
// class of a program, or one of their prototypes.
function isProgramObject(object) {
  if (classes.has(object) || prototypes.has(object)) return true;
  for (let proto = Object.getPrototypeOf(object); proto; proto = Object.getPrototypeOf(proto)) {
    if (prototypes.has(proto)) return true;
  }
  return false;
}

// What a class extends, checked: [the prototype of super.x in methods, the class of super.x in statics].
function heritageOf(compiler, parent, node, extended) {
  if (!extended) return [Object.prototype, Function.prototype];
  if (!(isProgramClass(parent) || EXTENDABLE.has(parent))) {
    throw compiler.error(
      `${compiler.text(node)} cannot be extended: a class of the program, or Error, TypeError, RangeError, Map, Set or Date`,
      node,
      FORBIDDEN_CODE
    );
  }
  return [parent.prototype, parent];
}

// A key of a member of a class, checked (what cannot be reached cannot be named either).
function memberKey(compiler, key, node) {
  const name = typeof key === 'symbol' ? key : String(key);
  if (typeof name === 'string' && FORBIDDEN.has(name)) {
    throw compiler.error(`${name} cannot be a member of a class`, node, FORBIDDEN_CODE);
  }
  return name;
}

const define = (target, key, value) =>
  Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true });

// The private names of a class (#x), made when the class is: each { kind ('field', 'method', 'accessor'), static,
// store (of a field: its value of each object, a WeakMap), fn (of a method), get, set } by its name; brand: the
// objects of the class (its instances, for its methods and accessors), and staticBrand (the class itself).
const makePrivates = () => ({ entries: new Map(), brand: new WeakSet(), staticBrand: new WeakSet() });

const isObject = (value) => value !== null && (typeof value === 'object' || typeof value === 'function');

// The entry of a private name of an object, which its class must have given it.
function privateEntry(compiler, privates, name, object, node, what) {
  const entry = privates.entries.get(name);
  const has =
    entry &&
    isObject(object) &&
    (entry.kind === 'field'
      ? entry.store.has(object)
      : (entry.static ? privates.staticBrand : privates.brand).has(object));
  if (!has) {
    throw compiler.error(`Cannot ${what} #${name} of an object whose class did not declare it`, node, RUNTIME);
  }
  return entry;
}

// object.#name: a field, a method, or what its getter gives (object?.#name of null and undefined: the end of its
// chain).
function privateGet(compiler, privates, name, object, node) {
  if (node.optional && (object === null || object === undefined)) return SHORT;
  const entry = privateEntry(compiler, privates, name, object, node, 'read');
  if (entry.kind === 'field') return entry.store.get(object);
  if (entry.kind === 'method') return entry.fn;
  if (!entry.get) throw compiler.error(`#${name} has no getter`, node, RUNTIME);
  return Reflect.apply(entry.get, object, []);
}

// object.#name = value: a field, or the setter (a method cannot be assigned).
function privateSet(compiler, privates, name, object, value, node) {
  const entry = privateEntry(compiler, privates, name, object, node, 'write');
  if (entry.kind === 'field') entry.store.set(object, value);
  else if (entry.kind === 'method') throw compiler.error(`#${name} is a method: it cannot be assigned`, node, RUNTIME);
  else if (!entry.set) throw compiler.error(`#${name} has no setter`, node, RUNTIME);
  else Reflect.apply(entry.set, object, [value]);
  return value;
}

/* eslint-disable no-bitwise */
const OPERATIONS = Object.assign(Object.create(null), {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
  '>>>': (a, b) => a >>> b,
  '&': (a, b) => a & b,
  '|': (a, b) => a | b,
  '^': (a, b) => a ^ b,
});
/* eslint-enable no-bitwise */

// object.#name = value, += value, ??= value...: right gives the value (read after the member, as JavaScript does).
function privateAssign(compiler, privates, name, object, operator, right, node) {
  if (operator === '=') return privateSet(compiler, privates, name, object, right(), node);
  const current = privateGet(compiler, privates, name, object, node);
  const logical = operator === '&&=' || operator === '||=' || operator === '??=' ? operator.slice(0, 2) : null;
  if (logical) {
    if (logical === '&&' ? !current : logical === '||' ? current : current !== null && current !== undefined) {
      return current;
    }
    return privateSet(compiler, privates, name, object, right(), node);
  }
  const operation = OPERATIONS[operator.slice(0, -1)];
  if (!operation) throw compiler.error(`Unsupported operator ${operator}`, node);
  return privateSet(compiler, privates, name, object, operation(current, right()), node);
}

// ++object.#name, object.#name--...
function privateUpdate(compiler, privates, name, object, step, prefix, node) {
  const old = privateGet(compiler, privates, name, object, node);
  const number = typeof old === 'bigint' ? old : +old;
  const value = typeof number === 'bigint' ? number + BigInt(step) : number + step;
  privateSet(compiler, privates, name, object, value, node);
  return prefix ? value : number;
}

// #name in object: whether the object has it.
function privateIn(compiler, privates, name, object, node) {
  if (!isObject(object)) throw compiler.error(`#${name} in a value that is no object`, node, RUNTIME);
  const entry = privates.entries.get(name);
  if (!entry) return false;
  return entry.kind === 'field'
    ? entry.store.has(object)
    : (entry.static ? privates.staticBrand : privates.brand).has(object);
}

// The class of a spec: { name, parent (null: none), derived, ctor (a function or null), privates (of makePrivates),
// elements: [{ kind ('method', 'get', 'set', 'field'), static, key, private, fn }] } (fn of a field: its value, or
// null; private: a #name, key without #).
function makeClass(compiler, spec, node) {
  const { name, parent, derived, ctor, elements } = spec;
  const privates = spec.privates ?? makePrivates();
  // (Private methods and accessors of the class: in its entries, its objects branded.)
  for (const element of elements) {
    if (!element.private) continue;
    if (element.kind === 'field') {
      privates.entries.set(element.key, { kind: 'field', static: element.static, store: new WeakMap() });
    } else if (element.kind === 'method') {
      privates.entries.set(element.key, { kind: 'method', static: element.static, fn: element.fn });
    } else {
      const entry = privates.entries.get(element.key) ?? { kind: 'accessor', static: element.static };
      entry[element.kind] = element.fn;
      privates.entries.set(element.key, entry);
    }
  }
  const branded = elements.some((element) => element.private && element.kind !== 'field' && !element.static);
  const staticBranded = elements.some((element) => element.private && element.kind !== 'field' && element.static);
  // (A field of an object: public, defined on it; private, kept in the store of its name.)
  const setField = (target, field) => {
    const value = field.fn ? field.fn.call(target) : undefined;
    if (!field.private) {
      define(target, memberKey(compiler, field.key, node), value);
      return;
    }
    const { store } = privates.entries.get(field.key);
    if (store.has(target)) throw compiler.error(`#${field.key} is given to an object once`, node, RUNTIME);
    store.set(target, value);
  };
  const fields = elements.filter((element) => element.kind === 'field' && !element.static);
  const initFields = (instance) => {
    if (branded) {
      if (privates.brand.has(instance)) throw compiler.error('A class makes an object once', node, RUNTIME);
      privates.brand.add(instance);
    }
    for (const field of fields) setField(instance, field);
  };
  // (super() of a constructor: the instance made by what the class extends, for the class made with new.)
  const superConstruct = (record, args) => {
    if (record.instance !== undefined) throw compiler.error('super() is called once', node, RUNTIME);
    record.instance = Reflect.construct(parent, args, record.newTarget);
    initFields(record.instance);
    return record.instance;
  };
  const Class = function (...args) {
    if (new.target === undefined) throw compiler.error(`The class ${name || ''} is called with new`, node, RUNTIME);
    const record = { newTarget: new.target, instance: undefined, superConstruct };
    if (!derived) {
      record.instance = Object.create(new.target.prototype);
      initFields(record.instance);
    }
    let result;
    if (ctor) result = Reflect.apply(ctor, record.instance, [record, ...args]);
    else if (derived) superConstruct(record, args);
    if (result !== null && (typeof result === 'object' || typeof result === 'function')) return result;
    if (record.instance === undefined) {
      throw compiler.error(`The constructor of ${name || 'a class'} calls super() first`, node, RUNTIME);
    }
    return record.instance;
  };
  const proto = Object.create(derived ? parent.prototype : Object.prototype);
  Object.defineProperty(proto, 'constructor', { value: Class, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(Class, 'prototype', { value: proto, writable: false, enumerable: false, configurable: false });
  Object.defineProperty(Class, 'name', { value: name || '', configurable: true });
  if (derived) Object.setPrototypeOf(Class, parent);
  prototypes.add(proto);
  classes.add(Class);
  // (Its name in its body: the class, before its statics run.)
  if (spec.bind) spec.bind(Class);
  for (const element of elements) {
    if (element.kind === 'field' || element.kind === 'block' || element.private) continue;
    const target = element.static ? Class : proto;
    const key = memberKey(compiler, element.key, node);
    if (element.kind === 'method') {
      Object.defineProperty(target, key, { value: element.fn, writable: true, enumerable: false, configurable: true });
    } else {
      const current = Object.getOwnPropertyDescriptor(target, key);
      const accessor = current && ('get' in current || 'set' in current) ? current : {};
      Object.defineProperty(target, key, {
        get: element.kind === 'get' ? element.fn : accessor.get,
        set: element.kind === 'set' ? element.fn : accessor.set,
        enumerable: false,
        configurable: true,
      });
    }
  }
  if (staticBranded) privates.staticBrand.add(Class);
  // (Static fields and static blocks, in their order.)
  for (const element of elements) {
    if (element.kind === 'field' && element.static) setField(Class, element);
    else if (element.kind === 'block') element.fn.call(Class);
  }
  return Class;
}

// super() in a constructor: the record of its construction fills its instance.
function superCall(compiler, record, args, node) {
  if (!record || typeof record.superConstruct !== 'function') {
    throw compiler.error('super() is called in the constructor of a class that extends another', node, RUNTIME);
  }
  return record.superConstruct(record, args);
}

// new of a class of a program (by a name of the program).
function constructOf(compiler, Class, args, node) {
  if (!isProgramClass(Class)) {
    const name = node.callee === '#this' ? 'this' : node.callee;
    throw compiler.error(`${name} is not a class of the program`, node, RUNTIME);
  }
  return Reflect.construct(Class, args);
}

export {
  makeClass,
  makePrivates,
  privateGet,
  privateSet,
  privateIn,
  privateAssign,
  privateUpdate,
  heritageOf,
  superCall,
  constructOf,
  isProgramClass,
  isProgramObject,
};
