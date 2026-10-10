// Shared schemas (addSchema), the normalization of route schemas, and the serializer of a response by status code.
import { kSchemaVisited, kSchemaResponse } from './symbols.js';
import {
  XUFA_ERR_SCH_MISSING_ID,
  XUFA_ERR_SCH_ALREADY_PRESENT,
  XUFA_ERR_SCH_DUPLICATE,
  XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA,
} from './errors.js';
import ContentType from './content-type.js';

const kFluentSchema = Symbol.for('fluent-schema-object');
const SCHEMAS_SOURCE = ['params', 'body', 'querystring', 'query', 'headers'];

// A deep copy of plain objects and arrays; other values (functions, class instances) are kept as they are.
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value === null || typeof value !== 'object') return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = proto === null ? Object.create(null) : {};
  for (const key of Object.keys(value)) out[key] = clone(value[key]);
  return out;
}

const isFluent = (schema) =>
  Boolean(schema && (schema.isFluentSchema || schema.isFluentJSONSchema || schema[kFluentSchema]));

function Schemas(initStore) {
  this.store = initStore || {};
}

Schemas.prototype.add = function add(inputSchema) {
  const schema = clone(isFluent(inputSchema) ? inputSchema.valueOf() : inputSchema);
  const id = schema.$id;
  if (!id) throw new XUFA_ERR_SCH_MISSING_ID();
  if (this.store[id]) throw new XUFA_ERR_SCH_ALREADY_PRESENT(id);
  this.store[id] = schema;
};

Schemas.prototype.getSchemas = function getSchemas() {
  return { ...this.store };
};

Schemas.prototype.getSchema = function getSchema(schemaId) {
  return this.store[schemaId];
};

function isCustomSchemaPrototype(schema) {
  return typeof schema === 'object' && Object.getPrototypeOf(schema) !== Object.prototype;
}

function normalizeSchema(routeSchemas) {
  if (routeSchemas[kSchemaVisited]) return routeSchemas;
  // query is an alias of querystring; booleans are schemas too, so presence is "not undefined".
  if (routeSchemas.query !== undefined) {
    if (routeSchemas.querystring !== undefined) throw new XUFA_ERR_SCH_DUPLICATE('querystring');
    routeSchemas.querystring = routeSchemas.query;
  }
  for (const key of SCHEMAS_SOURCE) {
    if (isFluent(routeSchemas[key])) routeSchemas[key] = routeSchemas[key].valueOf();
  }
  if (routeSchemas.response) {
    for (const code of Object.keys(routeSchemas.response)) {
      if (isFluent(routeSchemas.response[code])) routeSchemas.response[code] = routeSchemas.response[code].valueOf();
    }
  }
  const { body } = routeSchemas;
  if (body && !isCustomSchemaPrototype(body) && body.content) {
    for (const contentType of Object.keys(body.content)) {
      if (!body.content[contentType].schema) throw new XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA(contentType);
    }
  }
  if (routeSchemas.response) {
    for (const code of Object.keys(routeSchemas.response)) {
      const schema = routeSchemas.response[code];
      if (isCustomSchemaPrototype(schema) || !schema.content) continue;
      for (const mediaName of Object.keys(schema.content)) {
        if (!schema.content[mediaName].schema) throw new XUFA_ERR_SCH_CONTENT_MISSING_SCHEMA(mediaName);
      }
    }
  }
  routeSchemas[kSchemaVisited] = true;
  return routeSchemas;
}

function byContentType(serializers, contentType) {
  const ct = ContentType.from(contentType);
  if (!ct.isValid) return undefined;
  return serializers[ct.mediaType] || serializers['*/*'] || false;
}

// The serializer for a status code: the exact one (200), its class (2xx), or default; false when there is none.
function getSchemaSerializer(context, statusCode, contentType) {
  const responses = context[kSchemaResponse];
  if (!responses) return false;
  // Runs for every reply of a route with response schemas: the exact status code is looked up first, alone.
  let serializer = responses[statusCode];
  if (!serializer) serializer = responses[STATUS_CLASSES[Math.floor(statusCode / 100)]];
  if (!serializer) serializer = responses.default;
  if (!serializer) return false;
  if (serializer.constructor === Object) {
    const found = byContentType(serializer, contentType);
    if (found !== undefined) return found;
  }
  return serializer;
}

const STATUS_CLASSES = ['0xx', '1xx', '2xx', '3xx', '4xx', '5xx', '6xx', '7xx', '8xx', '9xx'];

export function buildSchemas(initStore) {
  return new Schemas(initStore);
}

export { getSchemaSerializer, normalizeSchema, clone };
