// The names of properties that cannot be reached (by name, computed, destructured or copied): what leads to prototypes
// and constructors, and the old accessors of Object.prototype.
const FORBIDDEN = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'caller',
  'callee',
  'arguments',
]);

export { FORBIDDEN };
