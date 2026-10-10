// Factories of objects for tests and seeds, as Laravel's model factories (and factory_bot): a model and the values of
// its fields, made again for every object.
//
//   const Users = factory(User, {
//     name: (n) => `User ${n}`,                        // n: the number of the object made by the factory (1, 2...)
//     email: (n, values) => `${values.name.toLowerCase().replace(' ', '.')}@example.com`, // values: those made before
//     role: 'member',
//     team: Teams,                                     // another factory: an object of it made (and saved) for each
//   }, { states: { admin: { role: 'admin' } } });
//
//   await Users.create();                              // one, saved
//   await Users.create({ role: 'guest' });             // with some values given
//   await Users.createMany(10, { team });              // several (bulkCreate when no value needs saving first)
//   await Users.state('admin').create();               // with the values of a state
//   Users.make();                                      // not saved
//   await Users.using(db).create();                    // in another database
//
// Values are constants, functions (n, values) (async too) or factories; the values given replace them, and a
// function given is called as those of the definition.
import { QueryError } from './errors.js';

class Factory {
  constructor(model, definition, options = {}, state = {}) {
    if (!model || !model.meta) throw new QueryError('factory() takes a model');
    if (!definition || typeof definition !== 'object') throw new QueryError('factory() takes the values of the fields');
    this.model = model;
    this.definition = definition;
    this.options = options;
    this.states = options.states || {};
    this.overrides = state.overrides || [];
    this.db = state.db || null;
    this.counter = state.counter || { n: 0 };
    for (const name of Object.keys(definition)) this.check(name);
  }

  check(name) {
    const { meta } = this.model;
    if (!meta.field(name)) {
      throw new QueryError(`factory(): ${this.model.name} has no field ${name}`);
    }
  }

  derive(changes) {
    return new Factory(this.model, this.definition, this.options, {
      overrides: this.overrides,
      db: this.db,
      counter: this.counter,
      ...changes,
    });
  }

  // The factory with the values of a state (or values given): Users.state('admin'), Users.state({ role: 'x' }).
  state(...states) {
    const overrides = states.map((item) => {
      if (typeof item !== 'string') return item;
      if (!Object.hasOwn(this.states, item)) throw new QueryError(`factory(): ${this.model.name} has no state ${item}`);
      return this.states[item];
    });
    return this.derive({ overrides: [...this.overrides, ...overrides] });
  }

  // The factory making its objects (and those of other factories) in a database.
  using(db) {
    return this.derive({ db });
  }

  // The values of an object: those of the definition, of the states, and those given; factories are made into
  // objects when save is true (otherwise left out, for make()).
  async values(given = {}, save = true) {
    this.counter.n += 1;
    const n = this.counter.n;
    const spec = Object.assign({}, this.definition, ...this.overrides, given);
    const values = {};
    for (const [name, item] of Object.entries(spec)) {
      this.check(name);
      let value = item;
      if (value instanceof Factory) {
        if (!save) continue;
        value = await (this.db ? value.using(this.db) : value).create();
      } else if (typeof value === 'function' && !(value.prototype && value.meta)) {
        value = await value(n, values);
        if (value instanceof Factory)
          value = save ? await (this.db ? value.using(this.db) : value).create() : undefined;
      }
      if (value !== undefined) values[name] = value;
    }
    return values;
  }

  // An object, not saved (its values that are factories left out).
  async make(given = {}) {
    return new this.model(await this.values(given, false)); // eslint-disable-line new-cap
  }

  async makeMany(count, given = {}) {
    const objects = [];
    for (let i = 0; i < count; i += 1) objects.push(await this.make(given));
    return objects;
  }

  objects() {
    return this.db ? this.model.objects.using(this.db) : this.model.objects;
  }

  // An object, saved (and the objects of the factories in its values).
  async create(given = {}) {
    return this.objects().create(await this.values(given, true));
  }

  // Objects, saved: their values are made in order (the objects of factories first), then saved with bulkCreate.
  async createMany(count, given = {}) {
    const rows = [];
    for (let i = 0; i < count; i += 1) rows.push(await this.values(given, true));
    return this.objects().bulkCreate(rows);
  }
}

function factory(model, definition, options) {
  return new Factory(model, definition, options);
}

// A value of a factory that goes through a list: sequence(['red', 'green']) gives red, green, red...
function sequence(items) {
  if (!Array.isArray(items) || items.length === 0) throw new QueryError('sequence() takes a list of values');
  return (n) => items[(n - 1) % items.length];
}

export { factory, sequence, Factory };
