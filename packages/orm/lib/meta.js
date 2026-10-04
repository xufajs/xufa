// What the ORM knows of a model, built once from its class: the fields (its own and those of its parents), the
// primary key, the table and the options. A model is a class extending Model with `static fields` and, optionally,
// `static options` ({ table, ordering, indexes, abstract }).
const { IdField, ForeignKey, ManyToManyField } = require('./fields');
const { ModelError } = require('./errors');

const STATE = Symbol('xufa.orm.state');

// The state of an object: whether it is to be added (not saved yet), its database, and the related objects loaded
// (a Map made the first time it is used: most objects never load any).
class State {
  constructor(adding, db) {
    this.adding = adding;
    this.db = db;
    this.loaded = null;
  }

  get related() {
    if (this.loaded === null) this.loaded = new Map();
    return this.loaded;
  }
}

const STATE_PROPERTY = { value: null, enumerable: false, writable: true };

function defineState(instance, state) {
  STATE_PROPERTY.value = state;
  Object.defineProperty(instance, STATE, STATE_PROPERTY);
  STATE_PROPERTY.value = null;
}

function snakeCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function lowerFirst(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// The classes from the base Model (excluded) down to the model.
function lineage(model, Base) {
  const chain = [];
  let current = model;
  while (current && current !== Base && current !== Function.prototype) {
    chain.unshift(current);
    current = Object.getPrototypeOf(current);
  }
  return chain;
}

// Defines `<name>` on the prototype of a model with a foreign key: it gives the related object once loaded (by
// selectRelated, prefetchRelated or load()) and sets the key when an object is assigned to it.
function defineForwardAccessor(model, field) {
  if (Object.hasOwn(model.prototype, field.name)) return;
  Object.defineProperty(model.prototype, field.name, {
    configurable: true,
    enumerable: false,
    get() {
      const key = this[field.attname];
      if (key === null || key === undefined) return null;
      const related = this[STATE].related.get(field.name);
      return related && related[field.targetField.attname] === key ? related : undefined;
    },
    set(value) {
      if (value === null || value === undefined) {
        this[field.attname] = null;
        this[STATE].related.delete(field.name);
        return;
      }
      if (!(value instanceof field.target)) {
        throw new TypeError(`${model.name}.${field.name} must be a ${field.target.name}`);
      }
      this[field.attname] = value[field.targetField.attname];
      this[STATE].related.set(field.name, value);
    },
  });
}

class Meta {
  constructor(model, Base) {
    this.model = model;
    this.name = model.name;
    const chain = lineage(model, Base);
    const options = {};
    for (let i = 0; i < chain.length; i += 1) {
      const own = Object.hasOwn(chain[i], 'options') ? chain[i].options : undefined;
      // Only the parents' ordering and indexes are inherited, as in Django.
      if (own && i < chain.length - 1) {
        if (own.ordering) options.ordering = own.ordering;
        if (own.indexes) options.indexes = own.indexes;
      } else if (own) Object.assign(options, own);
    }
    this.options = options;
    this.abstract = Boolean(options.abstract);
    this.table = options.table || snakeCase(model.name);
    // The schema of the table (PostgreSQL; SQLite names the table 'schema.table'), apart from its name.
    this.schema = options.schema || null;
    this.key = tableKey(this.table, this.schema);
    this.ordering = options.ordering ? [].concat(options.ordering) : [];
    this.indexes = (options.indexes || []).map((index) => (Array.isArray(index) ? { fields: index } : index));
    // The fillfactor of the table in PostgreSQL (10 to 100): room left in its pages for the new versions of updated
    // rows (HOT updates). The other backends ignore it.
    this.fillfactor = options.fillfactor;
    if (
      this.fillfactor !== undefined &&
      !(Number.isInteger(this.fillfactor) && this.fillfactor >= 10 && this.fillfactor <= 100)
    ) {
      throw new ModelError(model.name, 'fillfactor must be an integer from 10 to 100');
    }
    this.db = undefined;
    // The foreign keys of other models pointing to this one, filled when the models are registered in a database.
    this.reverse = [];

    const declared = new Map();
    for (let i = 0; i < chain.length; i += 1) {
      const own = Object.hasOwn(chain[i], 'fields') ? chain[i].fields : undefined;
      if (!own) continue;
      const names = Object.keys(own);
      for (let j = 0; j < names.length; j += 1) {
        const field = own[names[j]];
        if (field === null) declared.delete(names[j]);
        else if (!field || typeof field.bind !== 'function') {
          throw new ModelError(model.name, `the field ${names[j]} is not a field`);
        } else declared.set(names[j], field);
      }
    }

    this.fields = [];
    this.fieldMap = new Map();
    this.pk = undefined;
    // Many-to-many relations are no columns: they are kept apart (and their reverse ones, filled when registered).
    this.manyToMany = [];
    this.reverseManyToMany = [];
    const entries = [...declared].filter(([name, field]) => {
      if (!(field instanceof ManyToManyField)) return true;
      const relation = field.model ? field.clone() : field;
      relation.bind(model, name);
      this.manyToMany.push(relation);
      return false;
    });
    // options.primaryKey: the fields of a composite primary key (as several fields with primaryKey: true), or false
    // for a model without one (`keyless`: rows of tables that have no key, as logs, views and tables of others).
    this.keyless = options.primaryKey === false;
    const keyNames = options.primaryKey && !this.keyless ? [].concat(options.primaryKey) : null;
    if (this.keyless) {
      if (entries.some(([, field]) => field.primaryKey)) {
        throw new ModelError(model.name, 'it has primaryKey: false, but a field with primaryKey: true');
      }
      if (this.manyToMany.length) throw new ModelError(model.name, 'a model without a primary key has no many-to-many');
    } else if (!keyNames && !entries.some(([, field]) => field.primaryKey)) entries.unshift(['id', new IdField()]);
    for (let i = 0; i < entries.length; i += 1) {
      const [name, declaredField] = entries[i];
      const field = declaredField.model ? declaredField.clone() : declaredField;
      field.bind(model, name);
      if (keyNames && (keyNames.includes(name) || keyNames.includes(field.attname))) {
        field.primaryKey = true;
        field.null = false;
      }
      this.fields.push(field);
      this.fieldMap.set(name, field);
    }
    // The primary key: a field, or a composite key of several (its value is the array of theirs).
    this.pkFields = this.fields.filter((field) => field.primaryKey);
    if (keyNames && this.pkFields.length !== keyNames.length) {
      throw new ModelError(model.name, `the primary key ${keyNames.join(', ')} names fields it does not have`);
    }
    this.pk = this.keyless
      ? null
      : this.pkFields.length > 1
        ? new CompositeKey(model, this.pkFields)
        : this.pkFields[0];
    for (let i = 0; i < this.fields.length; i += 1) {
      const field = this.fields[i];
      if (field.attname !== field.name) {
        if (this.fieldMap.has(field.attname)) {
          throw new ModelError(model.name, `the field ${field.attname} clashes with the key of ${field.name}`);
        }
        this.fieldMap.set(field.attname, field);
      }
    }
    this.relations = this.fields.filter((field) => field instanceof ForeignKey);
    if (!this.abstract) {
      for (let i = 0; i < this.relations.length; i += 1) defineForwardAccessor(model, this.relations[i]);
    }
    this.hooks = new Map();
    // The function that makes objects from rows, compiled the first time (Model.fromRow).
    this.fromRow = null;
  }

  // The value of the primary key of a row (by attnames): a key for maps (the JSON of the values of a composite key).
  pkValue(row) {
    if (!this.pk) return undefined;
    if (!this.pk.composite) return row[this.pk.attname];
    return JSON.stringify(this.pkFields.map((field) => row[field.attname]));
  }

  // The field of a name or an attname ('author' or 'authorId'); 'pk' is the primary key.
  field(name) {
    if (name === 'pk') return this.pk;
    return this.fieldMap.get(name);
  }

  // The relation of another model to this one, by its related name.
  reverseRelation(name) {
    return this.reverse.find((field) => field.relatedName === name);
  }

  // A many-to-many relation of this model, or of another model to this one (by its related name).
  manyToManyRelation(name) {
    const own = this.manyToMany.find((field) => field.name === name);
    if (own) return { field: own, from: own.sourceKey, to: own.targetKey };
    const reverse = this.reverseManyToMany.find((field) => field.relatedName === name);
    if (reverse) return { field: reverse, from: reverse.targetKey, to: reverse.sourceKey };
    return null;
  }
}

// A primary key of several fields (as Django's CompositePrimaryKey): 'pk' in queries, its value is the array of the
// values of its fields (filter({ pk: [1, 2] }), pk__in: [[1, 2], [3, 4]]). No foreign key can point to its model.
class CompositeKey {
  constructor(model, fields) {
    this.model = model;
    this.fields = fields;
    this.name = 'pk';
    this.attname = 'pk';
    this.composite = true;
    this.primaryKey = true;
    this.dbType = 'composite';
  }

  // The values of the fields, from an array (in their order), an object of the model, or an object by names.
  valuesOf(value) {
    if (Array.isArray(value)) {
      if (value.length !== this.fields.length) {
        throw new TypeError(`the primary key of ${this.model.name} has ${this.fields.length} values`);
      }
      return value;
    }
    if (value && typeof value === 'object') {
      return this.fields.map((field) => (field.attname in value ? value[field.attname] : value[field.name]));
    }
    throw new TypeError(`the primary key of ${this.model.name} is an array of ${this.fields.length} values`);
  }
}

// The key of a table: its name, or 'schema.table' (to know tables apart, never to name them in SQL).
function tableKey(table, schema) {
  return schema ? `${schema}.${table}` : table;
}

module.exports = { CompositeKey, tableKey, Meta, STATE, State, defineState, snakeCase, lowerFirst };
