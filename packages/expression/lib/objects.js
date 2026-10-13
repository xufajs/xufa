// The properties of objects made by expressions and programs (by the closures and by the function of JavaScript).

// A key of an object made here: its own property (a key __proto__, which would set the prototype, is defined).
function define(object, key, value) {
  if (key === '__proto__') {
    Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
  } else object[key] = value;
}

// A getter or a setter of an object made here (with the other of its key, if it has one).
function defineAccessor(object, key, kind, fn) {
  const current = Object.getOwnPropertyDescriptor(object, key);
  const accessor = current && ('get' in current || 'set' in current) ? current : {};
  Object.defineProperty(object, key, {
    get: kind === 'get' ? fn : accessor.get,
    set: kind === 'set' ? fn : accessor.set,
    enumerable: true,
    configurable: true,
  });
}

export { define, defineAccessor };
