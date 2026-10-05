// The classes whose instances come back as themselves. A class is known by a name (its own, or one given) and can
// say how it is written: `encode(instance)` gives the data that is written (marshalled in turn) and
// `decode(data)` makes the instance again, as options of register() or as static methods of the class under the
// symbols ENCODE and DECODE. Without them, the own enumerable fields of the instance are written, and an instance is
// made again from the prototype of the class with those fields, without calling its constructor.
const { MarshalError } = require('./errors');

const ENCODE = Symbol.for('xufa.marshal.encode');
const DECODE = Symbol.for('xufa.marshal.decode');

class Registry {
  constructor() {
    this.byName = new Map();
    this.byClass = new Map();
  }

  // register(Class, { name, encode, decode }), or register(ClassA, ClassB, ...).
  register(Class, ...rest) {
    if (rest.length > 0 && typeof rest[0] === 'function') {
      [Class, ...rest].forEach((each) => this.register(each));
      return this;
    }
    const options = rest[0] || {};
    if (typeof Class !== 'function' || !Class.prototype) {
      throw new MarshalError('register() takes classes', 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const name = options.name === undefined ? Class.name : options.name;
    if (typeof name !== 'string' || name === '') {
      throw new MarshalError('A class needs a name to be registered', 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const taken = this.byName.get(name);
    if (taken && taken.Class !== Class) {
      throw new MarshalError(
        `Another class is registered as ${name}: give this one another name ({ name })`,
        'XUFA_MARSHAL_ERR_REGISTER'
      );
    }
    const encode = options.encode || (typeof Class[ENCODE] === 'function' ? (v) => Class[ENCODE](v) : null);
    const decode = options.decode || (typeof Class[DECODE] === 'function' ? (d) => Class[DECODE](d) : null);
    if (Boolean(encode) !== Boolean(decode)) {
      throw new MarshalError(`${name}: encode and decode go together`, 'XUFA_MARSHAL_ERR_REGISTER');
    }
    const entry = { Class, name, encode, decode };
    this.byName.set(name, entry);
    this.byClass.set(Class, entry);
    return this;
  }

  unregister(Class) {
    const entry = this.byClass.get(Class);
    if (entry) {
      this.byClass.delete(Class);
      this.byName.delete(entry.name);
    }
    return this;
  }

  has(Class) {
    return this.byClass.has(Class);
  }
}

// The registry used when none is given.
const registry = new Registry();

module.exports = { Registry, registry, ENCODE, DECODE };
