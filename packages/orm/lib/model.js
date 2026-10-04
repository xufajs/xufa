// Model: the base class of the models. A model declares its fields as `static fields`; its objects have a property
// for every field (for a foreign key `author`, the key in `authorId` and the object in `author`), and its QuerySet is
// Model.objects.
//
//   class Book extends Model {
//     static fields = { title: fields.string({ maxLength: 200 }), author: fields.foreignKey(() => Author) };
//   }
const { Meta, STATE, State, defineState } = require('./meta');
const modelCache = require('./model-cache');
const { currentDatabase } = require('./context');
const { ForeignKey } = require('./fields');
const { ValidationError, NotRegisteredError, ModelError, FieldError, QueryError } = require('./errors');

const META = Symbol('xufa.orm.meta');

// queryset.js, required the first time it is used (it requires this module), and kept: require() looks for the file
// every time it is called.
let querysetModule = null;
function querysets() {
  if (querysetModule === null) querysetModule = require('./queryset');
  return querysetModule;
}
const HOOKS = ['beforeSave', 'afterSave', 'beforeDelete', 'afterDelete'];

// Compiles the function that makes the objects of a model from rows (fromRow): a constructor with the prototype of
// the model that sets the fields in the rows (all, but for only()) and the relations loaded.
function compileFromRow(model) {
  const { fields, relations } = model.meta;
  const key = (name) => JSON.stringify(name);
  const lines = fields.map(
    (field) => `v = row[${key(field.attname)}]; if (v !== undefined) this[${key(field.attname)}] = v;`
  );
  relations.forEach((field, i) => {
    lines.push(
      `v = row[${key(`$${field.name}`)}];`,
      `if (v) state.related.set(${key(field.name)}, targets[${i}].fromRow(v, db));`
    );
  });
  const body =
    'function Instance(row, db) { const state = new State(false, db); defineState(this, state); let v; ' +
    `${lines.join(' ')} } Instance.prototype = model.prototype; ` +
    'return function fromRow(row, db) { return new Instance(row, db); };';
  // eslint-disable-next-line no-new-func
  const make = new Function('model', 'State', 'defineState', 'targets', body);
  return make(
    model,
    State,
    defineState,
    relations.map((field) => field.target)
  );
}

// An object of a model without a primary key is only inserted: it cannot be found again by itself.
function keyed(model, action) {
  if (model.meta.pk) return;
  throw new QueryError(
    `A ${model.name} cannot be ${action}: ${model.name} has no primary key (update and delete its rows with querysets)`
  );
}

class Model {
  constructor(data = {}) {
    const { meta } = this.constructor;
    if (meta.abstract) throw new ModelError(meta.name, 'it is abstract');
    defineState(this, new State(true, null));
    const keys = Object.keys(data);
    for (let i = 0; i < keys.length; i += 1) {
      if (meta.manyToManyRelation(keys[i])) {
        throw new QueryError(`${keys[i]} is a many-to-many relation: set it after saving (with ${keys[i]}.set())`);
      }
      if (!meta.field(keys[i]) || keys[i] === 'pk') throw new FieldError(keys[i], meta.name);
    }
    for (let i = 0; i < meta.fields.length; i += 1) {
      const field = meta.fields[i];
      let value = data[field.name];
      if (value === undefined && field.attname !== field.name) value = data[field.attname];
      if (value === undefined) value = field.hasDefault() ? field.getDefault() : null;
      if (field instanceof ForeignKey && value instanceof Model) this[field.name] = value;
      else this[field.attname] = value;
    }
  }

  // What the ORM knows of the model (fields, table, options), built the first time it is asked.
  static get meta() {
    if (!Object.hasOwn(this, META)) {
      if (this === Model) throw new ModelError('Model', 'the base class is not a model');
      Object.defineProperty(this, META, { value: new Meta(this, Model), enumerable: false });
    }
    return this[META];
  }

  // The database of the model: that of the tenant of the code running when the model is in it, or the one it was
  // registered in first.
  static get db() {
    const tenant = currentDatabase();
    if (tenant && tenant.models.get(this.name) === this) return tenant;
    const { db } = this.meta;
    if (!db) throw new NotRegisteredError(this.name);
    return db;
  }

  // The QuerySet of every object of the model.
  static get objects() {
    return new (querysets().QuerySet)(this);
  }

  // The same as objects, for TypeScript (a static getter cannot be typed by the class it is called on).
  static query() {
    return this.objects;
  }

  static create(data) {
    return this.objects.create(data);
  }

  // Adds a function called with every object of the model: beforeSave(object, { created }), afterSave, beforeDelete,
  // afterDelete. Hooks of the parent models are called first. The changes of bulkCreate, update and delete on
  // QuerySets do not call them, as in Django.
  static on(event, hook) {
    if (!HOOKS.includes(event)) throw new ModelError(this.name, `${event} is not a hook (${HOOKS.join(', ')})`);
    const { hooks } = this.meta;
    if (!hooks.has(event)) hooks.set(event, []);
    hooks.get(event).push(hook);
    return this;
  }

  static async callHooks(event, instance, info) {
    const chain = [];
    for (let current = this; current !== Model; current = Object.getPrototypeOf(current)) chain.unshift(current);
    for (let i = 0; i < chain.length; i += 1) {
      const hooks = chain[i].meta.hooks.get(event);
      if (hooks) for (let j = 0; j < hooks.length; j += 1) await hooks[j](instance, info);
    }
  }

  // The JSON Schema of the objects of the model, to validate or document routes with it. `exclude` leaves fields
  // out, and `partial` makes no field required (for updates).
  static jsonSchema({ exclude = [], partial = false } = {}) {
    const properties = {};
    const required = [];
    this.meta.fields.forEach((field) => {
      if (exclude.includes(field.name) || exclude.includes(field.attname)) return;
      const schema = field.jsonSchema();
      if (field.choices) schema.enum = field.choices;
      properties[field.attname] = field.null ? { ...schema, nullable: true } : schema;
      if (!partial && !field.null && !field.auto && !field.hasDefault()) required.push(field.attname);
    });
    const schema = { type: 'object', properties };
    if (required.length) schema.required = required;
    return schema;
  }

  // An object of a row given by a backend: values by attname and, under `$<name>`, the rows of the relations loaded.
  static fromRow(row, db = null) {
    const { meta } = this;
    if (meta.fromRow === null) meta.fromRow = compileFromRow(this);
    return meta.fromRow(row, db);
  }

  // The primary key: its value, or the array of those of the fields of a composite one.
  get pk() {
    const { pk } = this.constructor.meta;
    if (!pk) return undefined;
    if (pk.composite) return pk.fields.map((field) => this[field.attname]);
    return this[pk.attname];
  }

  set pk(value) {
    const { pk } = this.constructor.meta;
    if (!pk) return;
    if (!pk.composite) {
      this[pk.attname] = value;
      return;
    }
    const values = value === null || value === undefined ? pk.fields.map(() => null) : pk.valuesOf(value);
    pk.fields.forEach((field, i) => {
      this[field.attname] = values[i];
    });
  }

  // Coerces the values of the fields and throws a ValidationError with the messages of those not valid.
  validate() {
    const { meta } = this.constructor;
    const errors = {};
    for (let i = 0; i < meta.fields.length; i += 1) {
      const field = meta.fields[i];
      let value;
      try {
        value = field.clean(this[field.attname]);
      } catch (err) {
        errors[field.name] = [err.message];
        continue;
      }
      this[field.attname] = value;
      const messages = field.check(value);
      if (messages.length) errors[field.name] = messages;
    }
    if (Object.keys(errors).length) throw ValidationError(meta.name, errors);
  }

  // Sets the dates of autoNow and autoNowAdd fields before a save.
  prepareSave(adding) {
    const { fields } = this.constructor.meta;
    const now = new Date();
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (field.autoNow || (adding && field.autoNowAdd && this[field.attname] === null)) this[field.attname] = now;
    }
  }

  // The values of the fields by attname, without the primary key when the database gives it.
  toRow(fields = this.constructor.meta.fields) {
    const row = {};
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      const value = this[field.attname];
      if (field.primaryKey && (value === null || value === undefined)) continue;
      row[field.attname] = value;
    }
    return row;
  }

  // Inserts the object when it is new and updates it otherwise (only the fields named in `fields`, when given).
  async save({ fields, validate = true, db } = {}) {
    const model = this.constructor;
    const { meta } = model;
    const state = this[STATE];
    const database = db || state.db || model.db;
    const created = state.adding;
    if (!created) keyed(model, 'saved again');
    await model.callHooks('beforeSave', this, { created });
    this.prepareSave(created);
    if (validate) this.validate();
    if (created) {
      const [pk] = await database.backend.insert(meta, [this.toRow()]);
      // A composite key is given (the database makes none); a model without a key has none.
      if (meta.pk && !meta.pk.composite) this[meta.pk.attname] = pk;
      state.adding = false;
    } else {
      let saved = meta.fields.filter((field) => !field.primaryKey);
      if (fields) {
        const names = new Set(fields);
        saved = saved.filter((field) => names.has(field.name) || names.has(field.attname) || field.autoNow);
      }
      const assignments = saved.map((field) => ({ field, value: this[field.attname] }));
      if (assignments.length) {
        await database.backend.update(model.objects.using(db).filter({ pk: this.pk }).orderBy().toQuery(), assignments);
      }
    }
    state.db = db || state.db;
    // A saved object is not taken from the cache any more (the next get() reads it).
    if (!created) await modelCache.forget(database, model, this.pk);
    await model.callHooks('afterSave', this, { created });
    return this;
  }

  // Deletes the object (and, as their foreign keys say, the objects related to it).
  async delete() {
    const model = this.constructor;
    const state = this[STATE];
    if (state.adding) throw new QueryError(`The ${model.name} cannot be deleted: it is not saved`);
    keyed(model, 'deleted');
    await model.callHooks('beforeDelete', this, {});
    const count = await model.objects.using(state.db).filter({ pk: this.pk }).delete();
    state.adding = true;
    this.pk = null;
    await model.callHooks('afterDelete', this, {});
    return count;
  }

  // Loads again the values of the fields from the database.
  async refresh() {
    const model = this.constructor;
    keyed(model, 'refreshed');
    const fresh = await model.objects.using(this[STATE].db).get({ pk: this.pk });
    model.meta.fields.forEach((field) => {
      this[field.attname] = fresh[field.attname];
    });
    this[STATE].related.clear();
    return this;
  }

  // Loads a relation (a foreign key or a reverse relation) and gives it: await book.load('author').
  async load(name) {
    const model = this.constructor;
    const { meta } = model;
    const db = this[STATE].db;
    const field = meta.field(name);
    let related;
    if (field instanceof ForeignKey && field.name === name) {
      const key = this[field.attname];
      related = key === null ? null : await field.target.objects.using(db).get({ [field.targetField.attname]: key });
    } else if (meta.reverseRelation(name)) {
      related = await this[name].using(db).fetch();
    } else throw new FieldError(name, meta.name);
    if (related === null) this[STATE].related.delete(name);
    else this[STATE].related.set(name, related);
    return related;
  }

  // The values of the fields by attname, with the relations loaded.
  toJSON() {
    const { meta } = this.constructor;
    const json = {};
    meta.fields.forEach((field) => {
      json[field.attname] = this[field.attname];
    });
    this[STATE].related.forEach((value, name) => {
      json[name] = Array.isArray(value) ? value.map((item) => item.toJSON()) : value.toJSON();
    });
    return json;
  }
}

// Defines `<relatedName>` on the prototype of the model a foreign key points to: the QuerySet of the objects pointing
// to an object (author.books), whose create() sets the foreign key. Called when the models are registered.
function defineReverseAccessor(field) {
  const { target } = field;
  if (Object.hasOwn(target.prototype, field.relatedName)) return;
  Object.defineProperty(target.prototype, field.relatedName, {
    configurable: true,
    enumerable: false,
    get() {
      if (this.pk === null || this.pk === undefined) {
        throw new QueryError(`${target.name}.${field.relatedName} needs a saved object`);
      }
      const qs = field.model.objects.using(this[STATE].db).filter({ [field.attname]: this.pk });
      qs.state = { ...qs.state, defaults: { [field.attname]: this.pk } };
      const cached = this[STATE].related.get(field.relatedName);
      if (cached) qs.cache = cached;
      return qs;
    },
  });
}

// Defines a many-to-many accessor on `owner`: the QuerySet of the objects of the other side linked to an object (through
// the keys `from`, to the owner, and `to`, to the other model), with add, remove, set and clear. `otherName` is the
// name of the relation on the other model (what its objects are filtered by).
function defineManyToManyAccessor(owner, name, field, from, to, otherName) {
  if (Object.hasOwn(owner.prototype, name)) return;
  Object.defineProperty(owner.prototype, name, {
    configurable: true,
    enumerable: false,
    get() {
      if (this.pk === null || this.pk === undefined) {
        throw new QueryError(`${owner.name}.${name} needs a saved object`);
      }
      const { RelatedSet } = querysets();
      const other = to.target;
      const base = other.objects.using(this[STATE].db).filter({ [otherName]: this.pk });
      const set = new RelatedSet(other, base.state, { owner: this, through: field.through, from, to });
      const cached = this[STATE].related.get(name);
      if (cached) set.cache = cached;
      return set;
    },
  });
}

module.exports = { Model, defineReverseAccessor, defineManyToManyAccessor, STATE };
