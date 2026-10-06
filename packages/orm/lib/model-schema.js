'use strict';

// Model.schema(): the JSON Schema of the objects of a model as @xufa/schema makes them (draft-07: null as a type of
// its own, not `nullable`), so s.omit(), s.pick(), s.partial() and s.extend() take it, routes validate and serialize
// with it, and in TypeScript it carries the type of the objects (as their JSON: dates and bytes are strings).
//
//   const BookOut = Book.schema();                     // the objects (responses)
//   const NewBook = Book.schema({ input: true });      // what is given: no computed fields, nor what the backend gives
//   const BookPatch = s.partial(NewBook);              // the body of an update
//
// A foreign key is its key (`authorId`); many-to-many relations and the bodies of blobs are not in JSON.
//
// It is the one source of the schemas of models: Model.jsonSchema() is this one in the form of OpenAPI 3.0
// (`nullable: true`), and the resources document their routes with it.
const { s } = require('@xufa/schema');

function propertyOf(field) {
  let schema = { ...field.jsonSchema() };
  if (field.choices) schema.enum = [...field.choices];
  // Computed fields, and what a blob backend gives, are in the objects, never in what is given.
  if (field.computed !== null || field.readOnly === true) schema.readOnly = true;
  if (field.null) schema = s.nullable(schema);
  return schema;
}

// `blobs` (of the answers of resources): the blob fields as what toJSON() gives of them ({ size, contentType }).
function modelSchema(model, options = {}, { blobs = false } = {}) {
  const { input = false, ...objectOptions } = options;
  const { meta } = model;
  const properties = {};
  for (const field of [...meta.fields, ...meta.computedMap.values()]) {
    if (field.type === 'blob' && !blobs) continue;
    const readOnly = field.computed !== null || field.readOnly === true;
    if (input && readOnly) continue;
    const schema = propertyOf(field);
    const required = !field.null && !field.auto && !field.hasDefault() && field.computed === null;
    properties[field.attname] = required ? schema : s.optional(schema);
  }
  return s.object(properties, objectOptions);
}

// A property in the form of OpenAPI 3.0: null as `nullable: true` (type: ['integer', 'null'] is type: 'integer';
// anyOf: [schema, { type: 'null' }] is the schema), and no null in its enum.
function nullableOf(schema) {
  let out = schema;
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    const types = schema.type.filter((type) => type !== 'null');
    out = { ...schema, type: types.length === 1 ? types[0] : types, nullable: true };
  } else if (Array.isArray(schema.anyOf) && schema.anyOf.length === 2 && schema.anyOf[1].type === 'null') {
    const { anyOf, ...rest } = schema;
    out = { ...anyOf[0], ...rest, nullable: true };
  } else return schema;
  if (Array.isArray(out.enum)) out.enum = out.enum.filter((value) => value !== null);
  return out;
}

// Model.jsonSchema(): the schema of the objects (blobs too) in the form of OpenAPI 3.0; `exclude` leaves fields out,
// and `partial` makes no field required (for updates).
function openapiSchema(model, { exclude = [], partial = false } = {}) {
  const full = modelSchema(model, {}, { blobs: true });
  const { meta } = model;
  const excluded = new Set();
  for (const name of exclude) {
    excluded.add(name);
    const field = meta.field(name) || meta.computedField(name);
    if (field) excluded.add(field.attname);
  }
  const properties = {};
  for (const [name, property] of Object.entries(full.properties)) {
    if (!excluded.has(name)) properties[name] = nullableOf(property);
  }
  const schema = { type: 'object', properties };
  const required = partial ? [] : (full.required || []).filter((name) => !excluded.has(name));
  if (required.length) schema.required = required;
  return schema;
}

module.exports = { modelSchema, openapiSchema, nullableOf };
