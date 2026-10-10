// Models as data (an app's models.yaml, and the designer of the admin): modelsFromSpec() makes the classes of a spec,
// and specOf() gives the spec of any model (one of code too), so both are drawn and edited the same way.
//
//   Author:
//     display: '{lastName}, {firstName}'
//     ordering: [lastName, firstName]
//     fields:
//       firstName: { type: string, maxLength: 100 }
//       lastName: { type: string, maxLength: 100 }
//       dateOfBirth: { type: date, null: true }
//   Book:
//     fields:
//       title: { type: string, maxLength: 200 }
//       author: { type: foreignKey, to: Author, null: true, onDelete: setNull }
//       genre: { type: manyToMany, to: Genre, blank: true }
//       isbn: { type: string, maxLength: 13, unique: true, validate: ['value.length == 13'] }
//
// A model is its options (those of static options: table, ordering, display, label, permissions, indexes...) and its
// fields; a field is its type and the options of that type (a type alone is a text: `notes: text`). Relations name
// their model: one of the spec, 'self', or another the resolve option finds (accounts.User). array and encrypted take
// the field they hold as `of`. Rules (validate) and computed fields are expressions (@xufa/expression), so a spec is
// data throughout.
import fields from './fields.js';
import { Model as BaseModel } from './model.js';

// The types of a spec and how each is made.
const SIMPLE = [
  'id',
  'string',
  'text',
  'integer',
  'bigint',
  'float',
  'decimal',
  'date',
  'bytes',
  'boolean',
  'datetime',
  'json',
  'uuid',
  'geometry',
  'geography',
  'hstore',
];
const RELATIONS = ['foreignKey', 'manyToMany'];
const HOLDERS = ['array', 'encrypted'];
const TYPES = [...SIMPLE, ...RELATIONS, ...HOLDERS];

const MODEL_NAME = /^[A-Z][A-Za-z0-9_]*$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9_]*$/;

class SpecError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'SpecError';
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The field of a spec (where: its place, for the errors). relation(name) gives the model of a name, when it is used.
function fieldOf(spec, where, relation) {
  const given = typeof spec === 'string' ? { type: spec } : spec;
  if (!isObject(given)) throw new SpecError(`${where}: a field is a type, or { type, ...options }`);
  const { type, to, of, through, ...options } = given;
  if (!TYPES.includes(type)) {
    throw new SpecError(`${where}: type ${type === undefined ? '(none)' : type} is not one of ${TYPES.join(', ')}`);
  }
  if (RELATIONS.includes(type)) {
    if (typeof to !== 'string' || !to) throw new SpecError(`${where}: a ${type} names its model (to)`);
    const target = to === 'self' ? 'self' : () => relation(to, where);
    const extra = through === undefined ? {} : { through: () => relation(through, where) };
    return fields[type](target, { ...options, ...extra });
  }
  if (to !== undefined || through !== undefined) throw new SpecError(`${where}: to is an option of relations`);
  if (HOLDERS.includes(type)) {
    if (of === undefined) throw new SpecError(`${where}: ${type} takes the field it holds (of)`);
    return fields[type](fieldOf(of, `${where}.of`, relation), options);
  }
  if (of !== undefined) throw new SpecError(`${where}: of is an option of array and encrypted`);
  return fields[type](options);
}

// The classes of a spec ({ Name: { fields, ...options } }), in its order. Model: the class they extend (that of the
// copy of the ORM of the app); resolve(name): a model the spec does not have (another app's), or nothing; where: the
// name of the spec in errors (the file).
function modelsFromSpec(spec, { Model = BaseModel, resolve, where = 'models' } = {}) {
  if (!isObject(spec)) throw new SpecError(`${where}: models by name ({ Book: { fields } })`);
  const made = new Map();
  const relation = (name, at) => {
    const found = made.get(name) || (resolve ? resolve(name) : undefined);
    if (!found) throw new SpecError(`${at}: there is no model ${name}`);
    return found;
  };
  for (const [name, entry] of Object.entries(spec)) {
    const at = `${where}: ${name}`;
    if (!MODEL_NAME.test(name)) throw new SpecError(`${at}: a model's name starts with a capital (Book)`);
    if (!isObject(entry)) throw new SpecError(`${at}: a model is { fields, ...options }`);
    const { fields: given = {}, ...options } = entry;
    if (!isObject(given)) throw new SpecError(`${at}: fields by name`);
    const own = {};
    for (const [fieldName, field] of Object.entries(given)) {
      if (!FIELD_NAME.test(fieldName)) throw new SpecError(`${at}.${fieldName}: a field's name starts in lower case`);
      own[fieldName] = fieldOf(field, `${at}.${fieldName}`, relation);
    }
    // A class named as the model (its name is that of the model for the ORM).
    const Made = { [name]: class extends Model {} }[name];
    Made.fields = own;
    Made.options = options;
    made.set(name, Made);
  }
  return [...made.values()];
}

// Options and values that are data: functions (a default of code) are left out, as `code: [names]`.
function plain(options) {
  const data = {};
  const code = [];
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue;
    if (typeof value === 'function' || (Array.isArray(value) && value.some((item) => typeof item === 'function'))) {
      code.push(key);
    } else data[key] = value;
  }
  return { data, code };
}

// The spec of a field: its type, its model (relations), what it holds (array, encrypted) and its options.
function fieldSpec(field) {
  const { data, code } = plain(field.options || {});
  const spec = { type: field.type, ...data };
  if (field.type === 'foreignKey' || field.type === 'manyToMany') {
    spec.to = field.to === 'self' ? 'self' : field.target.name;
    if (field.type === 'manyToMany' && field.options.through) spec.through = field.through.name;
  }
  if (HOLDERS.includes(field.type) && field.base) spec.of = fieldSpec(field.base);
  if (code.length) spec.code = code;
  return spec;
}

// The spec of a model: { fields, ...options } as modelsFromSpec() takes it (with code: the options that are code).
// The fields are its own (those it declares and inherits; not the key the ORM adds, nor reverse relations).
function specOf(model) {
  const { meta } = model;
  const declared = meta.fields.filter((field) => !field.implicit);
  const own = {};
  for (const field of declared) own[field.name] = fieldSpec(field);
  for (const field of meta.manyToMany || []) own[field.name] = fieldSpec(field);
  const { data, code } = plain(meta.options || {});
  return { ...data, ...(code.length ? { code } : {}), fields: own };
}

export { modelsFromSpec, specOf, fieldOf, SpecError, TYPES };
