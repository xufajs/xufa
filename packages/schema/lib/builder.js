// @xufa/schema: JSON Schemas written as code, with their types in TypeScript. What it makes are plain JSON Schemas
// (draft-07, the ones of fastify): routes of @xufa/http and fastify validate and serialize with them, @xufa/openapi
// documents them; in TypeScript, Infer<typeof schema> is the type of the values, and SchemaTypeProvider types the
// requests and replies of routes. No dependencies.
//
//   import { s } from '@xufa/schema';
//   const Book = s.object({
//     id: s.integer({ minimum: 1 }),
//     title: s.string({ minLength: 1 }),
//     pages: s.optional(s.integer()),
//     status: s.enum(['draft', 'published']),
//     tags: s.array(s.string(), { uniqueItems: true }),
//   });
//   const NewBook = s.omit(Book, ['id']);           // the body of a create
//   const BookPatch = s.partial(NewBook);           // the body of an update
//   app.post('/books', { schema: { body: NewBook, response: { 201: Book } } }, handler);

// The keys of an object that are not required: a mark on the schemas given to s.optional() (not enumerable, so it is
// not in their JSON).
const OPTIONAL = Symbol.for('xufa.schema.optional');

const isSchema = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function check(value, what) {
  if (!isSchema(value)) throw new TypeError(`${what} is a schema (an object)`);
  return value;
}

// A copy of a schema (its mark of optional kept, or given).
function copyOf(schema, optional = schema[OPTIONAL] === true) {
  const copy = { ...schema };
  if (optional) Object.defineProperty(copy, OPTIONAL, { value: true, enumerable: false });
  return copy;
}

const typeOfValue = (value) => {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  if (typeof value === 'string' || typeof value === 'boolean') return typeof value;
  return null;
};

function object(properties, options = {}) {
  check(properties, 's.object(properties)');
  const props = {};
  const required = [];
  for (const [name, schema] of Object.entries(properties)) {
    check(schema, `The property ${name}`);
    props[name] = copyOf(schema, false);
    if (schema[OPTIONAL] !== true) required.push(name);
  }
  const out = { type: 'object', properties: props, ...options };
  if (required.length) out.required = required;
  return out;
}

// The properties of an object schema, as given to s.object() (those not required marked optional).
function propertiesOf(schema, what) {
  check(schema, what);
  if (schema.type !== 'object' || !isSchema(schema.properties))
    throw new TypeError(`${what} is a schema of s.object()`);
  const required = new Set(schema.required || []);
  const out = {};
  for (const [name, property] of Object.entries(schema.properties)) out[name] = copyOf(property, !required.has(name));
  return out;
}

// The options of an object schema (all but its properties and required).
function optionsOf(schema) {
  const { type, properties, required, ...options } = schema; // eslint-disable-line no-unused-vars
  return options;
}

function nullable(schema) {
  check(schema, 's.nullable(schema)');
  const optional = schema[OPTIONAL] === true;
  let out;
  if (typeof schema.type === 'string')
    out = { ...schema, type: schema.type === 'null' ? 'null' : [schema.type, 'null'] };
  else if (Array.isArray(schema.type))
    out = { ...schema, type: schema.type.includes('null') ? schema.type : [...schema.type, 'null'] };
  else out = { anyOf: [copyOf(schema, false), { type: 'null' }] };
  if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
  return copyOf(out, optional);
}

const s = {
  string: (options = {}) => ({ type: 'string', ...options }),
  number: (options = {}) => ({ type: 'number', ...options }),
  integer: (options = {}) => ({ type: 'integer', ...options }),
  boolean: (options = {}) => ({ type: 'boolean', ...options }),
  null: (options = {}) => ({ type: 'null', ...options }),

  // Strings of formats (what JSON has: a date is its text).
  dateTime: (options = {}) => ({ type: 'string', format: 'date-time', ...options }),
  date: (options = {}) => ({ type: 'string', format: 'date', ...options }),
  email: (options = {}) => ({ type: 'string', format: 'email', ...options }),
  uuid: (options = {}) => ({ type: 'string', format: 'uuid', ...options }),
  uri: (options = {}) => ({ type: 'string', format: 'uri', ...options }),

  // One value; one of some values.
  literal(value, options = {}) {
    const type = typeOfValue(value);
    if (!type) throw new TypeError('s.literal(value): a string, a number, a boolean or null');
    return { type, const: value, ...options };
  },
  enum(values, options = {}) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError('s.enum(values): a list of values');
    const types = [...new Set(values.map(typeOfValue))];
    if (types.includes(null)) throw new TypeError('s.enum(values): strings, numbers, booleans or null');
    // integer is number when both are there; one type is the type, several a list.
    const merged = [...new Set(types.map((t) => (t === 'integer' && types.includes('number') ? 'number' : t)))];
    return { type: merged.length === 1 ? merged[0] : merged, enum: [...values], ...options };
  },

  array: (items, options = {}) => ({ type: 'array', items: copyOf(check(items, 's.array(items)'), false), ...options }),
  // An array of a length, of a schema for each item (draft-07: items as a list).
  tuple(items, options = {}) {
    if (!Array.isArray(items)) throw new TypeError('s.tuple(items): a list of schemas');
    return {
      type: 'array',
      items: items.map((item, i) => copyOf(check(item, `s.tuple item ${i}`), false)),
      minItems: items.length,
      maxItems: items.length,
      additionalItems: false,
      ...options,
    };
  },
  object,
  // An object of any keys, with values of a schema.
  record: (values, options = {}) => ({
    type: 'object',
    additionalProperties: copyOf(check(values, 's.record(values)'), false),
    ...options,
  }),

  // Any of some schemas (anyOf); all of them (allOf).
  union(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.union(schemas): a list of schemas');
    return { anyOf: schemas.map((schema, i) => copyOf(check(schema, `s.union schema ${i}`), false)), ...options };
  },
  intersect(schemas, options = {}) {
    if (!Array.isArray(schemas) || schemas.length === 0) throw new TypeError('s.intersect(schemas): a list of schemas');
    return { allOf: schemas.map((schema, i) => copyOf(check(schema, `s.intersect schema ${i}`), false)), ...options };
  },

  // A property that is not required (in s.object()); a value that can be null too.
  optional: (schema) => copyOf(check(schema, 's.optional(schema)'), true),
  nullable,

  // Objects from objects: some of their properties, all of them not required (or required), more of them.
  pick(schema, keys) {
    const properties = propertiesOf(schema, 's.pick(schema)');
    const out = {};
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.pick(): the schema has no property ${key}`);
      out[key] = properties[key];
    }
    return object(out, optionsOf(schema));
  },
  omit(schema, keys) {
    const properties = propertiesOf(schema, 's.omit(schema)');
    for (const key of keys) {
      if (!Object.hasOwn(properties, key)) throw new TypeError(`s.omit(): the schema has no property ${key}`);
      delete properties[key];
    }
    return object(properties, optionsOf(schema));
  },
  partial(schema) {
    const properties = propertiesOf(schema, 's.partial(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], true);
    return object(properties, optionsOf(schema));
  },
  required(schema) {
    const properties = propertiesOf(schema, 's.required(schema)');
    for (const key of Object.keys(properties)) properties[key] = copyOf(properties[key], false);
    return object(properties, optionsOf(schema));
  },
  extend(schema, more, options = {}) {
    const properties = propertiesOf(schema, 's.extend(schema)');
    check(more, 's.extend(schema, properties)');
    return object({ ...properties, ...more }, { ...optionsOf(schema), ...options });
  },

  // A shared schema (app.addSchema(schema) with its $id): { $ref: 'Book#' }.
  ref: (id, options = {}) => ({ $ref: id, ...options }),
  // Anything; nothing.
  any: (options = {}) => ({ ...options }),
  unknown: (options = {}) => ({ ...options }),
  never: (options = {}) => ({ not: {}, ...options }),
};

const isOptional = (schema) => isSchema(schema) && schema[OPTIONAL] === true;

export { s, isOptional, OPTIONAL };
