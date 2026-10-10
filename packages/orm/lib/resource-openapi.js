// The OpenAPI documentation of the routes of a resource, for @xufa/openapi (and @fastify/swagger through it): given
// as the route config `openapi`, a schema that only describes them. It is never used to validate or serialize, so
// documenting a resource does not change what it accepts or answers.
//
// The schemas are those of Model.schema() (null as a type): @xufa/openapi writes them as OpenAPI 3.0 (nullable: true)
// or 3.1 (type: ['integer', 'null']), as the document is.
//
// Each action gets its tags, summary and operationId, its parameters (the id; the filters, ordering, search and page
// of the list), its body (the writable fields, from Model.schema(), and the other fields of the object marked readOnly:
// ignored, or with strict refused unless an update gives the value the object has) and its responses (the object as it
// is answered, its read-only fields marked too; the page of a list, and the errors).

import { modelSchema } from './model-schema.js';

const ERROR = {
  type: 'object',
  properties: {
    statusCode: { type: 'integer' },
    code: { type: 'string' },
    error: { type: 'string' },
    message: { type: 'string' },
  },
};

const errors = (...codes) => {
  const descriptions = { 400: 'The values are not valid', 404: 'Not found', 409: 'A duplicate, or protected' };
  return Object.fromEntries(codes.map((code) => [code, { description: descriptions[code], ...ERROR }]));
};

// The JSON schema of the type of a field (string when it has none, as query parameters are).
function typeOf(field) {
  const schema = field ? field.jsonSchema() : {};
  return schema.type ? { type: Array.isArray(schema.type) ? schema.type[0] : schema.type } : { type: 'string' };
}

/**
 * The documentation of the actions of a resource: (action) => the `openapi` schema of its route.
 */
function resourceDocs(model, settings) {
  const { filterMap, orderings, search, pagination, pageSize, maxPageSize, lookupField, writableFields } = settings;
  const { shown, exclude, serialize, strict = false, tag = model.name, component = model.name } = settings;
  const { meta } = model;
  const writableNames = new Set(writableFields.map((field) => field.attname));

  // The fields of the object as it is answered (those of `fields`, or without `exclude`), those that are not
  // writable marked readOnly; any object with serialize.
  const full = modelSchema(model, {}, { blobs: true });
  let shownProperties;
  {
    const keep = (name) => {
      if (shown) {
        return shown.some((given) => {
          const field = meta.field(given);
          return given === name || (field && field.attname === name);
        });
      }
      return !exclude.some((given) => {
        const field = meta.field(given);
        return given === name || (field && field.attname === name);
      });
    };
    shownProperties = Object.fromEntries(
      Object.entries(full.properties)
        .filter(([name]) => keep(name))
        .map(([name, schema]) => [name, writableNames.has(name) ? schema : { ...schema, readOnly: true }])
    );
  }
  const object = serialize
    ? { type: 'object', description: `A ${model.name}`, additionalProperties: true }
    : { type: 'object', description: `A ${model.name}`, properties: shownProperties };

  // A body: the writable fields (required ones required, for a create and a PUT), and the other fields of the object,
  // read-only: what the resource does with them.
  const readOnlyNote = (update) => {
    if (!strict) return 'Read-only: ignored in a body.';
    return update ? 'Read-only: refused, unless it is the value the object has.' : 'Read-only: refused in a body.';
  };
  const body = (partial, update) => {
    const input = modelSchema(model, { input: true });
    const properties = {};
    for (const [name, schema] of Object.entries(shownProperties)) {
      if (writableNames.has(name)) properties[name] = input.properties[name] || schema;
      else properties[name] = { ...schema, readOnly: true, description: readOnlyNote(update) };
    }
    for (const [name, schema] of Object.entries(input.properties)) {
      if (writableNames.has(name) && !(name in properties)) properties[name] = schema;
    }
    const schema = { type: 'object', properties, additionalProperties: false };
    const required = partial ? [] : (input.required || []).filter((name) => writableNames.has(name));
    if (required.length) schema.required = required;
    return schema;
  };

  const params = {
    type: 'object',
    properties: { id: { ...typeOf(lookupField), description: `The ${lookupField.name} of the ${model.name}` } },
    required: ['id'],
  };

  // The object answered: inline, or the component of the document it is (`ref`: 'Book#', see resource.js).
  const answered = (ref) => (ref ? { $ref: ref } : object);

  const list = (ref) => {
    const properties = {};
    for (const key of filterMap.keys()) {
      const parts = key.split('__');
      const field = meta.field(parts[0]);
      const lookup = parts.length > 1 ? parts[parts.length - 1] : 'exact';
      const listed = ['in', 'range'].includes(lookup);
      properties[key] = {
        ...(lookup === 'isnull' ? { type: 'boolean' } : listed ? { type: 'string' } : typeOf(field)),
        description: listed ? `${key}: values separated by commas` : `${key}`,
      };
    }
    if (orderings.size) properties.ordering = { type: 'string', enum: [...orderings], description: 'The order' };
    if (search.length) properties.search = { type: 'string', description: `Text in ${search.join(', ')}` };
    if (pagination) {
      properties.limit = { type: 'integer', minimum: 0, maximum: maxPageSize, default: pageSize };
      properties.offset = { type: 'integer', minimum: 0, default: 0 };
    }
    const page = pagination
      ? {
          type: 'object',
          properties: {
            count: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            results: { type: 'array', items: answered(ref) },
          },
        }
      : { type: 'array', items: answered(ref) };
    return {
      summary: `List ${model.name} objects`,
      querystring: { type: 'object', properties },
      response: { 200: { description: `The ${model.name} objects`, ...page }, ...errors(400) },
    };
  };

  const actions = {
    list: (partial, ref) => list(ref),
    get: (partial, ref) => ({
      summary: `Get a ${model.name}`,
      params,
      response: { 200: { ...answered(ref), description: `The ${model.name}` }, ...errors(404) },
    }),
    create: (partial, ref) => ({
      summary: `Create a ${model.name}`,
      body: body(false, false),
      response: { 201: { ...answered(ref), description: `The ${model.name} created` }, ...errors(400, 409) },
    }),
    update: (partial, ref) => ({
      summary: partial ? `Update some fields of a ${model.name}` : `Update a ${model.name}`,
      params,
      body: body(partial, true),
      response: { 200: { ...answered(ref), description: `The ${model.name} updated` }, ...errors(400, 404, 409) },
    }),
    delete: () => ({
      summary: `Delete a ${model.name}`,
      params,
      response: { 204: { description: 'Deleted', type: 'null' }, ...errors(404, 409) },
    }),
  };

  const operationIds = {
    list: `list${model.name}`,
    get: `get${model.name}`,
    create: `create${model.name}`,
    update: `update${model.name}`,
    partialUpdate: `partialUpdate${model.name}`,
    delete: `delete${model.name}`,
  };

  // `partial`: the PATCH of update; `ref`: the component of the object, when the document has it.
  const docs = (action, partial = false, ref = null) => ({
    tags: [tag],
    operationId: operationIds[partial ? 'partialUpdate' : action],
    ...actions[action](partial, ref),
  });
  // The object as a component of the document (components/schemas/<name>), unless it is any object (serialize).
  docs.component = serialize ? null : { name: component, schema: object };
  return docs;
}

export { resourceDocs };
